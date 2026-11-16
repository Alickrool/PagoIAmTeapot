"""Dump real API responses into shared/fixtures/ so the mobile app can run in mock mode.

Run after seed_demo (and again whenever the API shape changes):
    python manage.py seed_demo && python manage.py export_fixtures
"""

import json

from django.conf import settings
from django.core.management.base import BaseCommand
from rest_framework.test import APIClient

from bills.models import Bill
from bills.services.ai import ExtractedBill
from bills.serializers import LineItemSerializer


class Command(BaseCommand):
    help = "Export API responses to shared/fixtures/*.json"

    def handle(self, *args, **opts):
        out = settings.FIXTURES_DIR
        out.mkdir(parents=True, exist_ok=True)

        def dump(name, data):
            (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
            self.stdout.write(f"  {name}")

        c = APIClient()
        bills = c.get("/api/bills/").json()
        dump("bills.json", bills)
        details = {str(b["id"]): c.get(f"/api/bills/{b['id']}/").json() for b in bills}
        dump("bill_details.json", details)

        ppc = Bill.objects.filter(provider="PPC").order_by("-period_end").first()
        # Shape of ai.ExtractedBill, used by the mock /scan endpoint.
        sample = ExtractedBill.model_validate({
            **{f: getattr(ppc, f) for f in ["provider", "category", "customer_code", "meter_series",
                                             "place_of_consumption", "period_start", "period_end", "issue_date",
                                             "due_date", "consumption", "consumption_unit", "index_old",
                                             "index_new", "index_type"]},
            "total": float(ppc.total), "vat_rate": float(ppc.vat_rate),
            "line_items": [{k: v for k, v in LineItemSerializer(li).data.items() if k not in ("id", "bbox")}
                           for li in ppc.line_items.all()],
        })
        dump("extraction_sample.json", sample.model_dump(mode="json"))
        self.stdout.write(self.style.SUCCESS(f"Fixtures written to {out}"))
