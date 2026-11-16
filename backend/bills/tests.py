import io

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from bills.models import Bill


class DemoScenarioTests(TestCase):
    """The demo depends on these exact anomalies firing. Keep these green."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=io.StringIO())

    def setUp(self):
        self.c = APIClient()

    def _current(self, provider):
        bill = Bill.objects.filter(provider=provider).order_by("-period_end").first()
        return self.c.get(f"/api/bills/{bill.id}/").json()

    def _ids(self, data):
        return [a["id"] for a in data["audit"]["anomalies"]]

    def test_engie_price_spike(self):
        data = self._current("Engie")
        self.assertIn("price_spike", self._ids(data))
        spike = next(a for a in data["audit"]["anomalies"] if a["id"] == "price_spike")
        self.assertAlmostEqual(spike["evidence"]["total_change_pct"], 41.8, delta=1)

    def test_ppc_estimated_is_critical(self):
        data = self._current("PPC")
        self.assertEqual(data["audit"]["status"], "critical")
        self.assertIn("estimated_index", self._ids(data))
        self.assertIn("above_market", self._ids(data))

    def test_digi_extra_service(self):
        self.assertIn("extra_service:tv_extra_option", self._ids(self._current("Digi")))

    def test_water_is_ok(self):
        self.assertEqual(self._current("Apa Brasov")["audit"]["status"], "ok")

    def test_home_lists_one_bill_per_provider(self):
        self.assertEqual(len(self.c.get("/api/bills/").json()), 4)

    def test_scan_uses_cache_and_dedupes(self):
        import json

        from django.conf import settings
        from django.core.files.uploadedfile import SimpleUploadedFile

        from bills.models import ExtractionCache
        from bills.services.scan import file_hash

        content = b"%PDF-1.4 fake engie bill"
        sample = json.loads((settings.FIXTURES_DIR / "extraction_sample.json").read_text(encoding="utf-8"))
        sample["provider"] = "ENGIE Romania S.A."
        ExtractionCache.objects.create(file_hash=file_hash(content), data=sample)

        def upload():
            f = SimpleUploadedFile("bill.pdf", content, content_type="application/pdf")
            return self.c.post("/api/bills/scan/", {"file": f}, format="multipart")

        first, second = upload(), upload()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()["provider"], "Engie")  # from cache, normalized
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["id"], first.json()["id"])

    def test_ask_shape(self):
        bill = self._current("Engie")
        r = self.c.post(f"/api/bills/{bill['id']}/ask/", {"question": "Why is VAT so high?"}, format="json").json()
        self.assertTrue(r["answer"])
        self.assertIsInstance(r["sources"], list)
        self.assertIsInstance(r["suggested_actions"], list)

    def test_submit_reading_clears_estimated(self):
        bill = self._current("PPC")
        index_new = bill["index_old"] + 182
        r = self.c.post(f"/api/bills/{bill['id']}/reading/", {"index_new": index_new}, format="json")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["index_type"], "self")
        self.assertNotIn("estimated_index", self._ids(data))
        self.assertNotEqual(data["audit"]["status"], "critical")
        rec = data["recalculation"]
        self.assertEqual(rec["new_consumption"], 182)
        self.assertLess(rec["difference"], -200)  # 350 -> 182 kWh at ~1.43 RON/kWh
        # Lines + VAT still add up to the total.
        self.assertAlmostEqual(sum(float(li["amount"]) for li in data["line_items"]), float(data["total"]), places=2)

    def test_submit_reading_rejects_lower_index(self):
        bill = self._current("PPC")
        r = self.c.post(f"/api/bills/{bill['id']}/reading/", {"index_new": bill["index_old"] - 1}, format="json")
        self.assertEqual(r.status_code, 400)

    def _demo_pdf(self, provider="PPC") -> bytes:
        import tempfile
        from pathlib import Path

        from bills.management.commands.make_sample_pdfs import register_font, render

        bill = Bill.objects.filter(provider=provider).order_by("-period_end").first()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "bill.pdf"
            render(bill, path, *register_font())
            return path.read_bytes()

    def test_pdf_text_extraction(self):
        from bills.services import pdf_text

        text = pdf_text.extract_text(self._demo_pdf())
        self.assertIn("ESTIMAT", text)
        self.assertIn("Certificate verzi", text)
        self.assertIsNone(pdf_text.extract_text(b"not a pdf"))

    def test_text_first_and_vision_fallback(self):
        from unittest import mock as um

        from django.test import override_settings

        from bills.services import scan
        from bills.services.mock import extraction

        good = extraction()
        bad = good.model_copy(update={"total": good.total + 100})
        pdf = scan.Upload(self._demo_pdf(), "application/pdf", "p.pdf")
        jpg = scan.Upload(b"jpeg bytes", "image/jpeg", "p.jpg")
        with override_settings(AI_MOCK=False), \
                um.patch("bills.services.ai.extract_bill_from_text", return_value=good) as text_call, \
                um.patch("bills.services.ai.extract_bill_files", return_value=good) as vision_call:
            _, method = scan._extract([pdf])
            self.assertEqual((method, text_call.call_count, vision_call.call_count), ("text", 1, 0))
            # two text PDFs -> still ONE text request, with both files' text
            _, method = scan._extract([pdf, pdf])
            self.assertEqual((method, text_call.call_count), ("text", 2))
            self.assertIn("=== file 2 of 2 ===", text_call.call_args[0][0])
            text_call.return_value = bad
            _, method = scan._extract([pdf])
            self.assertEqual((method, vision_call.call_count), ("vision_fallback", 1))
            # a photo among the pages -> everything goes to vision in ONE request, in order
            _, method = scan._extract([pdf, jpg])
            self.assertEqual(method, "vision")
            self.assertEqual([m for _, m in vision_call.call_args[0][0]], ["application/pdf", "image/jpeg"])

    def test_pdf_scan_fills_bboxes(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        f = SimpleUploadedFile("ppc.pdf", self._demo_pdf(), content_type="application/pdf")
        data = self.c.post("/api/bills/scan/", {"file": f}, format="multipart").json()  # mock extraction = PPC
        boxes = [li["bbox"] for li in data["line_items"]]
        self.assertGreaterEqual(sum(b is not None for b in boxes), len(boxes) - 1)
        b = next(b for b in boxes if b)
        self.assertTrue(0 <= b["x"] < 1 and 0 <= b["y"] < 1 and 0 < b["w"] <= 1 and b["page"] == 1)

    # ---- scan v2 (docs/API_V2.md §1) ----

    def _post_files(self, *files, field="files"):
        from django.core.files.uploadedfile import SimpleUploadedFile

        payload = {field: [SimpleUploadedFile(n, d, content_type=t) for n, d, t in files]}
        return self.c.post("/api/bills/scan/", payload, format="multipart")

    def test_scan_multi_file_one_bill_with_page_offsets(self):
        # photo first, then the PDF: the PDF's lines are on page 2 of the bill
        r = self._post_files(("p1.jpg", b"\xff\xd8 photo", "image/jpeg"),
                             ("p2.pdf", self._demo_pdf(), "application/pdf"))
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertTrue(data["file_url"].endswith(".jpg"))  # first file
        pages = {li["bbox"]["page"] for li in data["line_items"] if li["bbox"]}
        self.assertEqual(pages, {2})
        # same files, same order -> same bill; other order -> a different scan
        again = self._post_files(("p1.jpg", b"\xff\xd8 photo", "image/jpeg"),
                                 ("p2.pdf", self._demo_pdf(), "application/pdf"))
        self.assertEqual((again.status_code, again.json()["id"]), (200, data["id"]))
        swapped = self._post_files(("p2.pdf", self._demo_pdf(), "application/pdf"),
                                   ("p1.jpg", b"\xff\xd8 photo", "image/jpeg"))
        self.assertEqual(swapped.status_code, 201)

    def test_scan_errors(self):
        from django.test import override_settings

        r = self.c.post("/api/bills/scan/", {}, format="multipart")
        self.assertEqual((r.status_code, r.json()["code"]), (400, "no_files"))
        r = self._post_files(*[(f"p{i}.jpg", bytes([i]), "image/jpeg") for i in range(11)])
        self.assertEqual((r.status_code, r.json()["code"]), (400, "too_many_files"))
        r = self._post_files(("notes.txt", b"hello", "text/plain"))
        self.assertEqual((r.status_code, r.json()["code"]), (400, "unsupported_type"))
        self.assertIn("notes.txt", r.json()["detail"])
        with override_settings(SCAN_MAX_FILE_BYTES=10, SCAN_MAX_TOTAL_BYTES=15):
            r = self._post_files(("big.jpg", b"x" * 11, "image/jpeg"))
            self.assertEqual((r.status_code, r.json()["code"]), (413, "file_too_large"))
            r = self._post_files(("a.jpg", b"x" * 8, "image/jpeg"), ("b.jpg", b"y" * 8, "image/jpeg"))
            self.assertEqual((r.status_code, r.json()["code"]), (413, "file_too_large"))

    def test_scan_type_from_extension_and_legacy_field(self):
        # phones sometimes send application/octet-stream: the extension decides
        r = self._post_files(("bill.heic", b"heic bytes", "application/octet-stream"), field="file")
        self.assertEqual(r.status_code, 201)

    def test_scan_unreadable_is_422(self):
        from unittest import mock as um

        from django.test import override_settings

        with override_settings(AI_MOCK=False), \
                um.patch("bills.services.ai.extract_bill_files", side_effect=ValueError("Could not read this bill")):
            r = self._post_files(("blurry.jpg", b"\xff\xd8 blurry", "image/jpeg"))
        self.assertEqual((r.status_code, r.json()["code"]), (422, "unreadable"))

    def test_gemini_provider_path(self):
        import json
        from types import SimpleNamespace
        from unittest import mock as um

        from django.test import override_settings

        from bills.services import ai
        from bills.services.mock import extraction

        sample = extraction()
        calls = []

        def fake_generate(model, contents, config):
            calls.append((model, contents, config))
            return SimpleNamespace(text=sample.model_dump_json())

        fake = SimpleNamespace(models=SimpleNamespace(generate_content=fake_generate))
        with override_settings(GEMINI_MODEL="gemini-test"), \
                um.patch.object(ai, "gemini_client", return_value=fake):
            bill = ai.extract_bill(b"%PDF fake", "application/pdf")
        self.assertEqual(bill.total, sample.total)
        model, contents, config = calls[0]
        self.assertEqual(model, "gemini-test")
        self.assertEqual(contents[0].inline_data.mime_type, "application/pdf")
        self.assertNotIn("$ref", json.dumps(config.response_json_schema))  # nested models inlined

        # Text path, unmocked down to the client: the prompt goes in as plain text.
        with override_settings(GEMINI_MODEL="gemini-test"), um.patch.object(ai, "gemini_client", return_value=fake):
            ai.extract_bill_from_text("FACTURĂ ... TOTAL 517,06")
        self.assertIsInstance(calls[-1][1][0], str)
        self.assertIn("<bill_text>", calls[-1][1][0])

    def test_gemini_blocked_answer(self):
        from types import SimpleNamespace
        from unittest import mock as um

        from django.test import override_settings

        from bills.services import ai

        fake = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: SimpleNamespace(text=None)))
        with override_settings(), um.patch.object(ai, "gemini_client", return_value=fake):
            self.assertIn("can't answer", ai.answer_question({}, "q", None).answer)

    def test_autopay_blocks_estimated(self):
        bill = self._current("PPC")
        self.c.post("/api/autopay-rules/", {"provider": "PPC", "max_amount": "600"}, format="json")
        r = self.c.post(f"/api/bills/{bill['id']}/pay/", {"mode": "auto"}, format="json").json()
        self.assertEqual(r["status"], "blocked")
