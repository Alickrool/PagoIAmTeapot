"""Run the scan validation rules (docs/API_V2.md §6) again on bills that were scanned before they existed,
or after the rules changed. Uses the stored extraction; never calls Gemini, never rejects or deletes a bill.

    python manage.py revalidate            # every scanned bill
    python manage.py revalidate --dry-run  # only print what would change
"""

from django.core.management.base import BaseCommand

from bills.models import Bill
from bills.services import ai, validation
from bills.services.validation import Rejected, injection


class Command(BaseCommand):
    help = "Re-run the scan validation rules on scanned bills (from their stored extraction)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **opts):
        for bill in Bill.objects.filter(source=Bill.Source.UPLOAD).order_by("id"):
            if not bill.raw_extraction:
                continue
            try:
                extracted = injection.sanitize(ai.ExtractedBill.model_validate(bill.raw_extraction))
                result = validation.validate_bill(extracted)
                status, checks = result.status, result.as_json()
            except Rejected as e:  # e.g. an impossible period: keep the bill, but it needs a look
                status = "needs_review"
                checks = {"checks": [{"id": e.code, "severity": "warning", "field": "period_end", "message": e.detail}]}
            if bill.confirmed_by_user:
                status = "accepted"
            ids = [c["id"] for c in checks["checks"]]
            self.stdout.write(f"#{bill.id} {bill.provider} {bill.period_end:%Y-%m}: {status} {ids}")
            if not dry_run:
                bill.validation_status, bill.validation = status, checks
                bill.save(update_fields=["validation_status", "validation"])
