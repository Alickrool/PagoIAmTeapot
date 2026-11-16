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


# ---------- providers (docs/API_V2.md §3-4) ----------


class UnknownProvider(Exception):
    pass


def _by_provider(pts: list[Point]) -> dict[str, list[Point]]:
    groups: dict[str, list[Point]] = {}
    for p in pts:  # pts are oldest first, so each group is too
        groups.setdefault(p.slug, []).append(p)
    return groups


def _short_anomalies(p: Point) -> list[dict]:
    return [{"id": a["id"], "severity": a["severity"], "title": a["title"]} for a in p.audit["anomalies"]]


def providers() -> list[dict]:
    result = []
    for slug, ps in _by_provider(points()).items():
        last = ps[-1]
        previous = [p.total for p in ps[:-1]]
        average = mean(previous) if previous else None
        result.append({
            "provider": last.bill.provider,
            "slug": slug,
            "category": last.bill.category,
            "bills_count": len(ps),
            "last_bill_id": last.bill.id,
            "last_period_end": last.bill.period_end.isoformat(),
            "last_total": money(last.total),
            "average_total": money(average) if average is not None else None,
            "trend_pct": pct(last.total, average),
            "audit_status": last.audit_status,
            "anomalies_count": sum(1 for a in last.audit["anomalies"] if a["severity"] != "info"),
            "totals": [money(p.total) for p in ps[-12:]],
        })
    # last_period_end desc, then provider name
    result.sort(key=lambda r: r["provider"])
    result.sort(key=lambda r: r["last_period_end"], reverse=True)
    return result


def _months_between(a: str, b: str) -> int:
    (ya, ma), (yb, mb) = (map(int, a.split("-")), map(int, b.split("-")))
    return (yb - ya) * 12 + (mb - ma)


def _unit_price(p: Point) -> float | None:
    return float(p.total) / p.bill.consumption if p.bill.consumption else None


def _fmt(x) -> str:
    return f"{float(x):g}"


def discrepancies(ps: list[Point]) -> list[dict]:
    """Compare every bill with the previous bill of the same provider (rules in docs/API_V2.md §4)."""
    out = []
    unit = ps[-1].bill.consumption_unit
    consumptions = [p.bill.consumption for p in ps if p.bill.consumption is not None]
    avg_cons = mean(consumptions) if consumptions else None

    for i, cur in enumerate(ps):
        prev = ps[i - 1] if i > 0 else None
        b = cur.bill

        def add(type_, severity, title, message, previous_value=None, current_value=None, unit_=""):
            out.append({"id": f"{type_}:{b.id}", "bill_id": b.id, "period_end": b.period_end.isoformat(),
                        "type": type_, "severity": severity, "title": title, "message": message,
                        "previous_value": previous_value, "current_value": current_value, "unit": unit_})

        if b.index_type == "estimated":
            high = avg_cons is not None and b.consumption is not None and b.consumption >= avg_cons * 1.3
            add("estimated_index", "critical" if high else "warning", "Estimated index",
                f"Billed on an estimated index: {_fmt(b.consumption)} {unit} vs your average "
                f"{round(avg_cons, 1):g} {unit}." if high else "Billed on an estimated index, not a real meter reading.",
                round(avg_cons, 1) if avg_cons is not None else None, b.consumption, unit)
        if not prev:
            continue
        pb = prev.bill

        gap = _months_between(prev.month, cur.month)
        if gap > 1:
            add("missing_month", "info", "Missing bill",
                f"No bill between {prev.month} and {cur.month} ({gap - 1} month{'s' if gap > 2 else ''}).")

        if b.index_old is not None and pb.index_new is not None and abs(b.index_old - pb.index_new) > 0.5:
            diff = b.index_old - pb.index_new
            add("index_gap", "critical", "Meter index doesn't continue",
                f"This bill starts at index {_fmt(b.index_old)}, the previous one ended at {_fmt(pb.index_new)} "
                f"({'+' if diff > 0 else ''}{_fmt(round(diff, 2))}): consumption was "
                f"{'skipped' if diff > 0 else 'billed twice'}.", pb.index_new, b.index_old, "index")

        dc = pct(b.consumption, pb.consumption)
        if dc is not None and abs(dc) >= 30:
            up = dc > 0
            add("consumption_jump",
                "critical" if up and (dc >= 60 or b.index_type == "estimated") else "warning" if up else "info",
                ("Consumption doubled" if dc >= 90 else "Consumption jumped") if up else "Consumption dropped",
                f"{_fmt(b.consumption)} {unit} this month vs {_fmt(pb.consumption)} {unit} last bill "
                f"({'+' if up else ''}{dc:g}%)." + (" The index was estimated." if b.index_type == "estimated" else ""),
                pb.consumption, b.consumption, unit)

        dt = pct(b.total, pb.total)
        if dt is not None and abs(dt) >= 25:
            up = dt > 0
            price_driven = f" Consumption only {'+' if dc >= 0 else ''}{dc:g}%." if up and dc is not None and dc < dt / 2 else ""
            add("total_jump", "info" if not up else "critical" if dt >= 50 else "warning",
                "Bill went up" if up else "Bill went down",
                f"{money(b.total)} RON vs {money(pb.total)} RON last bill ({'+' if up else ''}{dt:g}%).{price_driven}",
                float(pb.total), float(b.total), "RON")

        dp = pct(_unit_price(cur), _unit_price(prev))
        if dp is not None and abs(dp) >= 10:
            add("price_change", "warning", "Price per unit went up" if dp > 0 else "Price per unit went down",
                f"{_unit_price(cur):.3f} RON/{unit} vs {_unit_price(prev):.3f} RON/{unit} ({'+' if dp > 0 else ''}{dp:g}%).",
                round(_unit_price(prev), 3), round(_unit_price(cur), 3), f"RON/{unit}")

        seen = {li.code for p in ps[max(0, i - 3):i] for li in p.bill.line_items.all()}
        vat_factor = 1 + float(b.vat_rate or 0) / 100
        for li in b.line_items.all():
            if li.code not in seen:
                # what the user really pays for it, VAT included (same as the audit card)
                gross = float(li.amount) * (1 if li.kind == "tax" else vat_factor)
                add("new_line_item", "warning", "New charge on the bill",
                    f"\"{li.label_en or li.label}\" ({money(gross)} RON with VAT) was not on your previous "
                    f"{min(i, 3)} bill{'s' if min(i, 3) > 1 else ''}.", None, round(gross, 2), "RON")
                out[-1]["id"] = f"new_line_item:{b.id}:{li.code}"  # several new lines on one bill stay unique

    sev = {"critical": 0, "warning": 1, "info": 2}
    out.sort(key=lambda d: sev[d["severity"]])
    out.sort(key=lambda d: d["period_end"], reverse=True)  # newest first, then by severity (stable sort)
    return out


def provider_history(slug: str) -> dict:
    ps = _by_provider(points()).get(slug)
    if not ps:
        raise UnknownProvider(slug)
    last = ps[-1]
    totals = [p.total for p in ps]
    cons = [p.bill.consumption for p in ps if p.bill.consumption is not None]
    previous = totals[:-1]

    bills = []
    for i, p in enumerate(ps):
        prev = ps[i - 1] if i > 0 else None
        price = _unit_price(p)
        bills.append({
            "id": p.bill.id,
            "period_start": p.bill.period_start.isoformat(),
            "period_end": p.bill.period_end.isoformat(),
            "total": money(p.total),
            "consumption": p.bill.consumption,
            "index_old": p.bill.index_old,
            "index_new": p.bill.index_new,
            "index_type": p.bill.index_type,
            "unit_price": round(price, 3) if price is not None else None,
            "status": p.bill.status,
            "audit_status": p.audit_status,
            "delta_total_pct": pct(p.total, prev.total if prev else None),
            "delta_consumption_pct": pct(p.bill.consumption, prev.bill.consumption if prev else None),
            "anomalies": _short_anomalies(p),
        })

    return {
        "provider": last.bill.provider,
        "slug": slug,
        "category": last.bill.category,
        "currency": "RON",
        "consumption_unit": last.bill.consumption_unit,
        "stats": {
            "average_total": money(mean(previous)) if previous else None,
            "min_total": money(min(totals)),
            "max_total": money(max(totals)),
            "sum_12m": money(sum(totals[-12:], Decimal("0"))),
            "average_consumption": round(mean(cons), 1) if cons else None,
        },
        "bills": list(reversed(bills))[:24],
        "discrepancies": discrepancies(ps),
    }
