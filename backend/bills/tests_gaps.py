"""Endpoints and commands that had no test yet: offers, dispute, manual pay, Auto-Pay rules (pass + limit),
confirm on an already-accepted bill, 404s, the bill list `?all=1`, and `manage.py revalidate`.
Gemini is never called (AI_MOCK=True)."""

import io

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from bills.models import Bill
from bills.tests import TEST_MEDIA, jpeg


@override_settings(MEDIA_ROOT=TEST_MEDIA, AI_MOCK=True, SCAN_RATE=None, ASK_RATE=None)
class ApiGapTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=io.StringIO())

    def setUp(self):
        self.c = APIClient()

    def _latest(self, provider):
        return Bill.objects.filter(provider=provider).order_by("-period_end").first()

    def test_bill_list_latest_per_provider_and_all(self):
        latest = self.c.get("/api/bills/").json()
        everything = self.c.get("/api/bills/?all=1").json()
        self.assertEqual(len({b["provider"] for b in latest}), len(latest))  # one per provider
        self.assertGreater(len(everything), len(latest))
        self.assertTrue(all("validation_status" in b for b in everything))

    def test_unknown_bill_is_404(self):
        self.assertEqual(self.c.get("/api/bills/999999/").status_code, 404)
        self.assertEqual(self.c.post("/api/bills/999999/confirm/").status_code, 404)

    def test_offers_shape_and_savings(self):
        ppc = self._latest("PPC")
        r = self.c.get(f"/api/bills/{ppc.id}/offers/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(set(data), {"current_all_in_price", "unit", "offers", "disclaimer"})
        self.assertTrue(data["offers"], "PPC above market should have cheaper offers")
        for o in data["offers"]:
            self.assertEqual(set(o), {"supplier", "offer", "all_in_price", "estimated_total", "savings"})
            self.assertGreater(o["savings"], 0)
            self.assertLess(o["all_in_price"], data["current_all_in_price"])

    def test_dispute_letter_with_and_without_anomaly(self):
        ppc = self._latest("PPC")
        for body in ({}, {"anomaly_id": "estimated_index"}):
            r = self.c.post(f"/api/bills/{ppc.id}/dispute/", body, format="json")
            self.assertEqual(r.status_code, 200)
            letter = r.json()
            self.assertEqual(set(letter), {"to", "subject", "body"})
            self.assertTrue(all(letter[k].strip() for k in letter))

    def test_manual_pay_marks_the_bill_paid(self):
        water = self._latest("Apa Brasov")
        r = self.c.post(f"/api/bills/{water.id}/pay/", {"mode": "manual"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "paid")
        water.refresh_from_db()
        self.assertEqual(water.status, "paid")

    def test_pay_rejects_an_unknown_mode(self):
        water = self._latest("Apa Brasov")
        self.assertEqual(self.c.post(f"/api/bills/{water.id}/pay/", {"mode": "later"}, format="json").status_code, 400)

    def test_autopay_without_rule_is_400(self):
        water = self._latest("Apa Brasov")
        r = self.c.post(f"/api/bills/{water.id}/pay/", {"mode": "auto"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("detail", r.json())

    def test_autopay_rule_create_and_a_clean_bill_passes(self):
        r = self.c.post("/api/autopay-rules/", {"provider": "Apa Brasov", "max_amount": "100"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json()["active"])
        water = self._latest("Apa Brasov")
        pay = self.c.post(f"/api/bills/{water.id}/pay/", {"mode": "auto"}, format="json").json()
        self.assertEqual((pay["status"], pay["reasons"]), ("paid", []))

    def test_autopay_over_the_limit_is_blocked_with_a_reason(self):
        self.c.post("/api/autopay-rules/", {"provider": "Apa Brasov", "max_amount": "10"}, format="json")
        water = self._latest("Apa Brasov")
        pay = self.c.post(f"/api/bills/{water.id}/pay/", {"mode": "auto"}, format="json").json()
        self.assertEqual(pay["status"], "blocked")
        self.assertEqual(len(pay["reasons"]), 1)

    def test_confirm_on_an_accepted_bill_is_harmless(self):
        water = self._latest("Apa Brasov")
        r = self.c.post(f"/api/bills/{water.id}/confirm/")
        self.assertEqual(r.status_code, 200)
        v = r.json()["validation"]
        self.assertEqual((v["status"], v["confirmed_by_user"]), ("accepted", True))


@override_settings(MEDIA_ROOT=TEST_MEDIA, AI_MOCK=True, SCAN_RATE=None, ASK_RATE=None, CURRENT_MONTH="2026-10")
class RevalidateCommandTests(TestCase):
    def _scan(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        r = APIClient().post("/api/bills/scan/", {"files": [SimpleUploadedFile("b.jpg", jpeg("revalidate"), content_type="image/jpeg")]}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        return Bill.objects.get(id=r.json()["id"])

    def _break_total(self, bill):
        raw = dict(bill.raw_extraction)
        raw["total"] = float(raw["total"]) + 50  # lines no longer add up
        bill.raw_extraction = raw
        bill.validation_status, bill.validation = "accepted", {"checks": []}
        bill.save()

    def test_dry_run_changes_nothing(self):
        bill = self._scan()
        self._break_total(bill)
        out = io.StringIO()
        call_command("revalidate", "--dry-run", stdout=out)
        bill.refresh_from_db()
        self.assertEqual(bill.validation_status, "accepted")
        self.assertIn("lines_sum", out.getvalue())

    def test_revalidate_flags_a_bill_whose_lines_do_not_add_up(self):
        bill = self._scan()
        self._break_total(bill)
        call_command("revalidate", stdout=io.StringIO())
        bill.refresh_from_db()
        self.assertEqual(bill.validation_status, "needs_review")
        self.assertIn("lines_sum", [c["id"] for c in bill.validation["checks"]])

    def test_a_confirmed_bill_stays_accepted(self):
        bill = self._scan()
        self._break_total(bill)
        bill.confirmed_by_user = True
        bill.save()
        call_command("revalidate", stdout=io.StringIO())
        bill.refresh_from_db()
        self.assertEqual(bill.validation_status, "accepted")

    def test_seeded_bills_are_never_touched(self):
        call_command("seed_demo", stdout=io.StringIO())
        before = list(Bill.objects.filter(source=Bill.Source.SEED).values_list("id", "validation_status"))
        call_command("revalidate", stdout=io.StringIO())
        after = list(Bill.objects.filter(source=Bill.Source.SEED).values_list("id", "validation_status"))
        self.assertEqual(before, after)
