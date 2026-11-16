"""The same bill scanned again from other photos (docs/SCAN_VALIDATION_PLAN.md §6.6).

Identical files are caught earlier by the file hash (200 + the old bill). Here: same provider + same period
(± 2 days) + same customer code or same total, or the same bill number. Only scanned bills are compared:
seeded demo bills never count, so the demo scan of a bill that is also seeded still works.
"""

from __future__ import annotations

import re
from datetime import timedelta

from bills.models import Bill
from bills.services import providers

SLACK = timedelta(days=2)


def _number(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def find(e) -> Bill | None:
    """The already scanned bill this extraction duplicates, or None."""
    scanned = Bill.objects.filter(source=Bill.Source.UPLOAD, provider__iexact=providers.normalize(e.provider))
    number = _number(e.bill_number)
    if number:
        for b in scanned.exclude(bill_number=""):
            if _number(b.bill_number) == number:
                return b
    same_period = scanned.filter(period_start__range=(e.period_start - SLACK, e.period_start + SLACK),
                                 period_end__range=(e.period_end - SLACK, e.period_end + SLACK))
    for b in same_period.order_by("-created_at"):
        if e.customer_code and b.customer_code and e.customer_code.strip() != b.customer_code.strip():
            continue  # another place of consumption (second flat) with the same provider
        same_code = bool(e.customer_code and b.customer_code)
        if same_code or abs(float(b.total) - e.total) < 0.01:
            return b
    return None
