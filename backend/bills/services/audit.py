"""Deterministic bill audit.

The audit is rule-based on purpose: numbers shown to the user must be exact
and reproducible. The LLM is used for extraction and for explaining, never for
deciding whether a number is wrong.
"""

from __future__ import annotations

from statistics import mean

from bills.models import Bill, IndexType, LineItem
from bills.services import market

SEVERITY_ORDER = {"ok": 0, "info": 1, "warning": 2, "critical": 3}


def _pct(new: float, old: float) -> float:
    return round((new - old) / old * 100, 1) if old else 0.0


def _item(bill: Bill, code: str) -> LineItem | None:
    return next((li for li in bill.line_items.all() if li.code == code), None)


def _sum_kind(bill: Bill, kind: str) -> float:
    return sum(float(li.amount) for li in bill.line_items.all() if li.kind == kind)


def history_for(bill: Bill, limit: int = 12) -> list[Bill]:
    """Previous bills from the same provider, newest first."""
    return list(
        Bill.objects.filter(provider=bill.provider, category=bill.category, period_end__lt=bill.period_end)
        .prefetch_related("line_items")
        .order_by("-period_end")[:limit]
    )


def check_estimated_index(bill: Bill, history: list[Bill]) -> dict | None:
    if bill.index_type != IndexType.ESTIMATED or not bill.consumption:
        return None
    real = [b.consumption for b in history if b.consumption and b.index_type in (IndexType.REAL, IndexType.SELF_READING)]
    avg = round(mean(real), 1) if real else None
    critical = avg is not None and bill.consumption > avg * 1.3
    unit = bill.consumption_unit
    msg = f"You were billed on an estimated index ({bill.consumption:g} {unit}"
    msg += f" vs your usual {avg:g} {unit})." if avg else ")."
    msg += " Don't pay yet: submit your real meter reading and the bill will be recalculated." if critical else \
        " Submit a real reading to avoid a regularization later."
    return {
        "id": "estimated_index",
        "severity": "critical" if critical else "warning",
        "title": "Estimated index",
        "message": msg,
        "line_item_codes": ["energy"],
        "evidence": {"billed_consumption": bill.consumption, "average_real_consumption": avg, "unit": unit},
        "actions": [
            {"type": "submit_reading", "label": "Submit real reading"},
            {"type": "dispute", "label": "Contest this bill"},
        ],
    }


def check_price_spike(bill: Bill, history: list[Bill]) -> dict | None:
    if not history:
        return None
    prev = history[0]
    total_pct = _pct(float(bill.total), float(prev.total))
    if total_pct < 20:
        return None
    delta_total = round(float(bill.total) - float(prev.total), 2)
    evidence = {
        "previous_total": float(prev.total),
        "current_total": float(bill.total),
        "total_change_pct": total_pct,
        "delta_total": delta_total,
    }
    parts = []
    vat_delta = round(_sum_kind(bill, "tax") - _sum_kind(prev, "tax"), 2)
    if bill.consumption and prev.consumption:
        # Split the increase into: consumption effect + price effect (both before VAT) + VAT effect.
        cons_pct = _pct(bill.consumption, prev.consumption)
        prev_net_unit = (float(prev.total) - _sum_kind(prev, "tax")) / prev.consumption
        consumption_effect = round((bill.consumption - prev.consumption) * prev_net_unit, 2)
        price_effect = round(delta_total - vat_delta - consumption_effect, 2)
        evidence.update(consumption_change_pct=cons_pct, consumption_effect=consumption_effect, price_effect=price_effect)
        if cons_pct * 2 > total_pct:
            return None  # the increase is mostly explained by consumption: not an anomaly
        parts.append(f"consumption rose only {cons_pct:g}% (+{consumption_effect:g} RON)")
        cur_e, prev_e = _item(bill, "energy"), _item(prev, "energy")
        if cur_e and prev_e and cur_e.unit_price and prev_e.unit_price and cur_e.unit_price != prev_e.unit_price:
            evidence.update(previous_energy_price=float(prev_e.unit_price), current_energy_price=float(cur_e.unit_price))
            parts.append(
                f"the supply price changed from {float(prev_e.unit_price):g} to {float(cur_e.unit_price):g} "
                f"RON/{bill.consumption_unit} (+{price_effect:g} RON)"
            )
        else:
            parts.append(f"higher prices/tariffs (+{price_effect:g} RON)")
    if vat_delta > 0:
        evidence["vat_delta"] = vat_delta
        parts.append(f"VAT on top of the increase adds +{vat_delta:g} RON")
    return {
        "id": "price_spike",
        "severity": "warning",
        "title": f"Bill up {total_pct:g}%",
        "message": f"Your {bill.provider} bill went from {float(prev.total):g} to {float(bill.total):g} RON "
                   f"(+{total_pct:g}%), but " + "; ".join(parts) + ".",
        "line_item_codes": ["energy", "vat"],
        "evidence": evidence,
        "actions": [
            {"type": "ask", "label": "Why did it go up?"},
            {"type": "autopay_rule", "label": "Set a safety limit"},
        ],
    }


def check_new_extras(bill: Bill, history: list[Bill]) -> list[dict]:
    found = []
    for li in bill.line_items.all():
        if li.kind != LineItem.Kind.EXTRA_SERVICE:
            continue
        months_with = 1 + sum(1 for b in history if _item(b, li.code))
        # Only flag add-ons that were introduced (absent from the oldest bills we know).
        if months_with > len(history):
            continue
        vat_factor = 1 + float(bill.vat_rate or 0) / 100
        monthly = round(float(li.amount) * vat_factor, 2)  # what the user really pays, VAT included
        paid = round(monthly * months_with, 2)
        found.append({
            "id": f"extra_service:{li.code}",
            "severity": "warning",
            "title": "Paid add-on",
            "message": f"You pay {monthly:g} RON/month (VAT incl.) for \"{li.label_en or li.label}\", added "
                       f"{months_with} months ago ({paid:g} RON so far). Do you still use it?",
            "line_item_codes": [li.code],
            "evidence": {"monthly_amount": monthly, "months_active": months_with, "total_paid": paid},
            "actions": [{"type": "cancel_service", "label": "Cancel this option"}],
        })
    return found


def check_above_market(bill: Bill, history: list[Bill]) -> dict | None:
    ref = market.MARKET_REFERENCE_PRICE.get(bill.category)
    price = bill.all_in_unit_price
    if not ref or not price or price <= ref * 1.1:
        return None
    offers = market.offers_for(bill.category, bill.consumption, float(bill.total), bill.provider)
    msg = f"You pay {price:g} RON/{bill.consumption_unit} all-in, the market reference is ~{ref:g}."
    if offers:
        n = len(offers)
        msg += (f" {n} supplier{'s' if n > 1 else ''} in Pago would have charged up to "
                f"{offers[0]['savings']:g} RON less for this bill.")
    return {
        "id": "above_market",
        "severity": "warning",
        "title": "Price above market",
        "message": msg,
        "line_item_codes": ["energy"],
        "evidence": {"all_in_price": price, "market_reference": ref, "offers": offers},
        "actions": [{"type": "switch_supplier", "label": "Compare offers"}],
    }


def check_penalties(bill: Bill, history: list[Bill]) -> dict | None:
    items = [li for li in bill.line_items.all() if li.kind == LineItem.Kind.PENALTY]
    if not items:
        return None
    amount = round(sum(float(li.amount) for li in items), 2)
    return {
        "id": "penalty",
        "severity": "warning",
        "title": "Late payment penalty",
        "message": f"This bill includes {amount:g} RON in penalties. Auto-pay can prevent this next time.",
        "line_item_codes": [li.code for li in items],
        "evidence": {"amount": amount},
        "actions": [{"type": "autopay_rule", "label": "Turn on Smart Auto-Pay"}],
    }


def check_county(bill: Bill, history: list[Bill]) -> dict | None:
    ref = market.COUNTY_AVERAGES.get(bill.category)
    if not ref or not bill.consumption:
        return None
    avg = ref.get(bill.county) or ref["Romania"]
    if bill.consumption <= avg * 1.3:
        return None
    return {
        "id": "above_county_average",
        "severity": "info",
        "title": "Above local average",
        "message": f"Your consumption ({bill.consumption:g} {bill.consumption_unit}) is "
                   f"{_pct(bill.consumption, avg):g}% above the {bill.county} average ({avg:g}).",
        "line_item_codes": [],
        "evidence": {"consumption": bill.consumption, "county_average": avg},
        "actions": [],
    }


def audit_bill(bill: Bill) -> dict:
    history = history_for(bill)
    anomalies = [
        a for a in [
            check_estimated_index(bill, history),
            check_price_spike(bill, history),
            *check_new_extras(bill, history),
            check_above_market(bill, history),
            check_penalties(bill, history),
            check_county(bill, history),
        ] if a
    ]
    anomalies.sort(key=lambda a: -SEVERITY_ORDER[a["severity"]])
    status = anomalies[0]["severity"] if anomalies else "ok"
    if status == "info":
        status = "ok"
    return {"status": status, "anomalies": anomalies}
