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
        data = self._demo_pdf()
        with override_settings(AI_MOCK=False), \
                um.patch("bills.services.ai.extract_bill_from_text", return_value=good) as text_call, \
                um.patch("bills.services.ai.extract_bill", return_value=good) as vision_call:
            _, method = scan._extract(data, "application/pdf")
            self.assertEqual((method, text_call.call_count, vision_call.call_count), ("text", 1, 0))
            text_call.return_value = bad
            _, method = scan._extract(data, "application/pdf")
            self.assertEqual((method, vision_call.call_count), ("vision_fallback", 1))
            _, method = scan._extract(b"jpeg bytes", "image/jpeg")
            self.assertEqual(method, "vision")

    def test_pdf_scan_fills_bboxes(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        f = SimpleUploadedFile("ppc.pdf", self._demo_pdf(), content_type="application/pdf")
        data = self.c.post("/api/bills/scan/", {"file": f}, format="multipart").json()  # mock extraction = PPC
        boxes = [li["bbox"] for li in data["line_items"]]
        self.assertGreaterEqual(sum(b is not None for b in boxes), len(boxes) - 1)
        b = next(b for b in boxes if b)
        self.assertTrue(0 <= b["x"] < 1 and 0 <= b["y"] < 1 and 0 < b["w"] <= 1 and b["page"] == 1)

    def test_autopay_blocks_estimated(self):
        bill = self._current("PPC")
        self.c.post("/api/autopay-rules/", {"provider": "PPC", "max_amount": "600"}, format="json")
        r = self.c.post(f"/api/bills/{bill['id']}/pay/", {"mode": "auto"}, format="json").json()
        self.assertEqual(r["status"], "blocked")
