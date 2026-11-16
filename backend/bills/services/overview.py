"""Monthly overview and provider history (docs/API_V2.md §2-4).

Reference implementation on the app side: mobile/src/api/derive.ts. Keep the rules identical.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from statistics import mean

from bills.models import Bill
from bills.services.audit import audit_bill

RANK = {"ok": 0, "warning": 1, "critical": 2}
CENT = Decimal("0.01")


def slugify(provider: str) -> str:
    """Same as derive.ts: "Apa Brasov" -> "apa-brasov", "E.ON" -> "e-on"."""
    s = unicodedata.normalize("NFD", provider.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def money(x: Decimal | float) -> str:
    return str(Decimal(str(x)).quantize(CENT, rounding=ROUND_HALF_UP))


def pct(cur: float | Decimal | None, prev: float | Decimal | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return round((float(cur) - float(prev)) / float(prev) * 100, 1)


def worst(statuses) -> str:
    return max(statuses, key=RANK.__getitem__, default="ok")


@dataclass
class Point:
    bill: Bill
    slug: str
    month: str
    audit: dict = field(repr=False)

    @property
    def total(self) -> Decimal:
        return self.bill.total

    @property
    def audit_status(self) -> str:
        return self.audit["status"]


def points() -> list[Point]:
    """All bills, oldest first, ONE per provider per month: if a bill was scanned again for a month that already
    has one (e.g. re-scanning a seeded bill in the demo), the newest wins, so totals are never counted twice."""
    latest: dict[tuple[str, str], Bill] = {}
    for b in Bill.objects.prefetch_related("line_items").order_by("period_end", "id"):
        latest[(slugify(b.provider), b.period_end.strftime("%Y-%m"))] = b
    pts = [Point(b, slug, month, audit_bill(b)) for (slug, month), b in latest.items()]
    return sorted(pts, key=lambda p: (p.bill.period_end, p.bill.id))


class NoBills(Exception):
    pass


def dashboard(month: str | None = None) -> dict:
    pts = points()
    if not pts:
        raise NoBills()
    months = sorted({p.month for p in pts})
    selected = month if month in months else months[-1]
    idx = months.index(selected)
    prev_month = months[idx - 1] if idx > 0 else None

    def in_month(m):
        return [p for p in pts if p.month == m]

    def total_of(ps):
        return sum((p.total for p in ps), Decimal("0"))

    bills, prev_bills = in_month(selected), (in_month(prev_month) if prev_month else [])
    total = total_of(bills)
    prev_total = total_of(prev_bills) if prev_month else None
    window = months[max(0, idx - 11): idx + 1]
    others = [total_of(in_month(m)) for m in window if m != selected]

    slices = []
    for p in bills:
        prev = next((q for q in prev_bills if q.slug == p.slug), None)
        slices.append({
            "provider": p.bill.provider,
            "slug": p.slug,
            "category": p.bill.category,
            "bill_id": p.bill.id,
            "total": money(p.total),
            "share_pct": round(float(p.total / total * 100), 1) if total else 0,
            "previous_total": money(prev.total) if prev else None,
            "delta_pct": pct(p.total, prev.total if prev else None),
            "status": p.bill.status,
            "audit_status": p.audit_status,
        })
    slices.sort(key=lambda s: -Decimal(s["total"]))

    return {
        "month": selected,
        "currency": "RON",
        "total": money(total),
        "paid_total": money(total_of([p for p in bills if p.bill.status == Bill.Status.PAID])),
        "unpaid_total": money(total_of([p for p in bills if p.bill.status != Bill.Status.PAID])),
        "bills_count": len(bills),
        "audit_status": worst(p.audit_status for p in bills),
        "previous_month": prev_month,
        "previous_total": money(prev_total) if prev_total is not None else None,
        "delta_pct": pct(total, prev_total),
        "average_total": money(mean(others)) if others else None,
        "slices": slices,
        "months": [
            {
                "month": m,
                "total": money(total_of(in_month(m))),
                "bills_count": len(in_month(m)),
                "audit_status": worst(p.audit_status for p in in_month(m)),
            }
            for m in window
        ],
    }
