"""Amounts and VAT (docs/SCAN_VALIDATION_PLAN.md §6.4)."""

from __future__ import annotations

from bills.services.ro import lei, num
from bills.services.validation import Check, info, warning

VAT_RATES = {0, 5, 9, 11, 19, 21}  # Romanian rates in force since 2015 (21/11 since Aug 2025)
MAX_TOTAL = 20_000  # lei; above this a household bill is suspicious


def _is_vat(li) -> bool:
    return li.code == "vat" or (li.kind == "tax" and "tva" in li.label.lower())


def check(e) -> list[Check]:
    checks: list[Check] = []
    total = e.total

    if total <= 0:
        checks.append(info("total_positive", "total",
                           f"Totalul e {lei(total)}: pare o factură de regularizare sau de credit."))
    elif total > MAX_TOTAL:
        checks.append(warning("total_range", "total",
                              f"Totalul de {lei(total)} e foarte mare pentru o factură de casă. Verifică suma."))

    if (e.currency or "RON") != "RON":
        checks.append(warning("currency_ron", "currency",
                              f"Factura e în {e.currency}, nu în lei. Nu convertim automat: verifică sumele."))

    lines = e.line_items
    lines_sum = sum(li.amount for li in lines)
    if lines and abs(lines_sum - total) > max(1.0, abs(total) * 0.01):
        checks.append(warning("lines_sum", "total",
                              f"Rândurile facturii adună {lei(lines_sum)}, dar totalul citit e {lei(total)}. "
                              f"Verifică poza."))

    rate = e.vat_rate
    if rate is not None and round(rate, 2) not in VAT_RATES:
        checks.append(warning("vat_rate_allowed", "vat_rate",
                              f"Cota de TVA citită ({num(rate)}%) nu e o cotă din România. Verifică poza."))
    else:
        vat_lines = [li for li in lines if _is_vat(li)]
        if rate and len(vat_lines) == 1:
            # VAT applies to every other line except taxes and penalties (penalties carry no VAT).
            base = sum(li.amount for li in lines if li.kind not in ("tax", "penalty"))
            expected = base * rate / 100
            vat = vat_lines[0].amount
            if abs(vat - expected) > max(1.0, abs(expected) * 0.02):
                checks.append(warning("vat_amount", "line_items.vat",
                                      f"TVA-ul citit ({lei(vat)}) nu se potrivește cu {num(rate)}% din restul "
                                      f"facturii ({lei(expected)}). Verifică poza."))
    return checks
