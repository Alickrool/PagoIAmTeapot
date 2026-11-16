import io
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from bills.models import Bill


TEST_MEDIA = tempfile.mkdtemp(prefix="pago-test-media-")  # never write test uploads into the real media/ folder


@override_settings(MEDIA_ROOT=TEST_MEDIA)
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

    # ---- dashboard (docs/API_V2.md §2) ----

    def test_dashboard_latest_month(self):
        d = self.c.get("/api/dashboard/").json()
        self.assertEqual((d["month"], d["previous_month"], d["bills_count"], d["audit_status"]),
                         ("2026-10", "2026-09", 4, "critical"))
        self.assertEqual((d["total"], d["unpaid_total"], d["paid_total"], d["previous_total"]),
                         ("1001.83", "1001.83", "0.00", "642.81"))
        self.assertEqual(d["delta_pct"], 55.9)
        totals = [float(s["total"]) for s in d["slices"]]
        self.assertEqual(totals, sorted(totals, reverse=True))  # donut order
        self.assertEqual(d["slices"][0]["provider"], "PPC")
        self.assertAlmostEqual(sum(s["share_pct"] for s in d["slices"]), 100, delta=0.2)
        self.assertEqual([m["month"] for m in d["months"]][-1], "2026-10")
        self.assertEqual(len(d["months"]), 12)
        others = [float(m["total"]) for m in d["months"][:-1]]
        self.assertAlmostEqual(float(d["average_total"]), sum(others) / len(others), places=2)

    def test_dashboard_selected_month_and_errors(self):
        d = self.c.get("/api/dashboard/?month=2026-09").json()
        self.assertEqual((d["month"], d["previous_month"], d["months"][-1]["month"]), ("2026-09", "2026-08", "2026-09"))
        self.assertEqual(d["paid_total"], d["total"])  # older months are paid in the seed
        first = self.c.get("/api/dashboard/?month=2025-11").json()
        self.assertEqual((first["previous_month"], first["delta_pct"], first["average_total"]), (None, None, None))
        self.assertEqual(self.c.get("/api/dashboard/?month=2026-9").json()["code"], "bad_month")
        Bill.objects.all().delete()
        r = self.c.get("/api/dashboard/")
        self.assertEqual((r.status_code, r.json()["code"]), (404, "no_bills"))

    def test_dashboard_rescanned_bill_not_counted_twice(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        f = SimpleUploadedFile("ppc.pdf", self._demo_pdf(), content_type="application/pdf")
        new_id = self.c.post("/api/bills/scan/", {"file": f}, format="multipart").json()["id"]  # mock = PPC Oct
        d = self.c.get("/api/dashboard/").json()
        self.assertEqual((d["bills_count"], d["total"]), (4, "1001.83"))
        self.assertEqual(next(s for s in d["slices"] if s["slug"] == "ppc")["bill_id"], new_id)

    # ---- test sessions (manage.py dev) ----

    def test_reset_month_keeps_older_months(self):
        from bills.management.commands.dev import reset_month

        before = Bill.objects.exclude(period_end__year=2026, period_end__month=10).count()
        self.assertEqual(reset_month("2026-10"), 4)
        self.assertFalse(Bill.objects.filter(period_end__year=2026, period_end__month=10).exists())
        self.assertEqual(Bill.objects.count(), before)  # nothing else touched
        d = self.c.get("/api/dashboard/").json()
        self.assertEqual(d["month"], "2026-09")  # overview falls back to the latest month that has bills

    # ---- providers (docs/API_V2.md §3-4) ----

    def _discrepancies(self, slug):
        return self.c.get(f"/api/providers/{slug}/").json()["discrepancies"]

    def test_providers_list(self):
        rows = self.c.get("/api/providers/").json()
        self.assertEqual([r["slug"] for r in rows], ["apa-brasov", "digi", "engie", "ppc"])  # same date -> by name
        ppc = next(r for r in rows if r["slug"] == "ppc")
        self.assertEqual((ppc["bills_count"], ppc["last_total"], ppc["audit_status"]), (12, "517.06", "critical"))
        self.assertEqual(ppc["anomalies_count"], 2)  # info (county average) not counted
        self.assertEqual((len(ppc["totals"]), ppc["totals"][-1]), (12, "517.06"))  # oldest first

    def test_provider_checklist_from_api_v2(self):
        ppc = {(d["type"], d["severity"]) for d in self._discrepancies("ppc") if d["period_end"] == "2026-10-31"}
        self.assertTrue({("consumption_jump", "critical"), ("estimated_index", "critical")} <= ppc)
        digi = self._discrepancies("digi")
        self.assertIn("new_line_item", [d["type"] for d in digi])
        self.assertIn("15.00 RON with VAT", next(d for d in digi if d["type"] == "new_line_item")["message"])
        self.assertIn("total_jump", [d["type"] for d in self._discrepancies("engie")])
        self.assertEqual(self._discrepancies("apa-brasov"), [])

    def test_provider_history_shape_and_order(self):
        d = self.c.get("/api/providers/ppc/").json()
        self.assertEqual(d["bills"][0]["period_end"], "2026-10-31")  # newest first
        self.assertEqual(d["bills"][0]["index_type"], "estimated")
        self.assertEqual(d["bills"][0]["anomalies"][0], {"id": "estimated_index", "severity": "critical",
                                                         "title": "Estimated index"})
        self.assertIsNone(d["bills"][-1]["delta_total_pct"])
        sev = {"critical": 0, "warning": 1, "info": 2}
        keys = [(d_["period_end"], -sev[d_["severity"]]) for d_ in d["discrepancies"]]
        self.assertEqual(keys, sorted(keys, reverse=True))
        self.assertEqual(len({x["id"] for x in d["discrepancies"]}), len(d["discrepancies"]))
        r = self.c.get("/api/providers/nope/")
        self.assertEqual((r.status_code, r.json()["code"]), (404, "unknown_provider"))

    def test_index_gap(self):
        bill = Bill.objects.filter(provider="Engie").order_by("-period_end")[3]
        bill.index_old += 40  # 40 kWh skipped between two bills
        bill.save()
        gaps = [d for d in self._discrepancies("engie") if d["type"] == "index_gap"]
        self.assertEqual(len(gaps), 1)
        self.assertEqual((gaps[0]["bill_id"], gaps[0]["severity"]), (bill.id, "critical"))
        self.assertIn("skipped", gaps[0]["message"])

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

    def test_scan_saves_null_text_fields_from_model(self):
        """Gemini returns null for text it can't read (e.g. VAT line without unit); text columns are NOT NULL."""
        from unittest import mock as um

        from django.test import override_settings

        from bills.services.mock import extraction

        e = extraction()
        e = e.model_copy(update={"customer_code": None, "meter_series": None, "line_items": [
            li.model_copy(update={"unit": None}) for li in e.line_items]})
        with override_settings(AI_MOCK=False), um.patch("bills.services.ai.extract_bill_files", return_value=e):
            r = self._post_files(("vat.jpg", b"\xff\xd8 vat", "image/jpeg"))
        self.assertEqual(r.status_code, 201)
        self.assertEqual({li["unit"] for li in r.json()["line_items"]}, {""})
        self.assertEqual(r.json()["customer_code"], "")

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
