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

    def test_autopay_blocks_estimated(self):
        bill = self._current("PPC")
        self.c.post("/api/autopay-rules/", {"provider": "PPC", "max_amount": "600"}, format="json")
        r = self.c.post(f"/api/bills/{bill['id']}/pay/", {"mode": "auto"}, format="json").json()
        self.assertEqual(r["status"], "blocked")
