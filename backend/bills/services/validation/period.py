"""Period, month, year (docs/SCAN_VALIDATION_PLAN.md §6.1). A bill belongs to the month of period_end."""

from __future__ import annotations

from datetime import timedelta

from bills.services.ro import date_ro, month_label, plural
from bills.services.validation import Check, Rejected, current_month, info, today, warning


def assigned_month(period_end) -> str:
    return period_end.strftime("%Y-%m")


def not_current_month(period_end) -> Check | None:
    month = assigned_month(period_end)
    if month == current_month():
        return None
    return info("not_current_month", "period_end", f"Factura e pentru {month_label(month)}, am pus-o în luna ei.")


def _years_before(d, years: int):
    try:
        return d.replace(year=d.year - years)
    except ValueError:  # 29 February
        return d.replace(year=d.year - years, day=28)


def check(e) -> list[Check]:
    start, end = e.period_start, e.period_end
    if start > end:
        raise Rejected("invalid_period", f"Perioada citită nu are sens: începe pe {date_ro(start)} și se termină pe "
                                         f"{date_ro(end)}. Încearcă o poză mai clară.", 422)
    checks: list[Check] = []
    now = today()

    if not 2015 <= end.year <= now.year + 1:
        checks.append(warning("year_plausible", "period_end",
                              f"Anul facturii pare citit greșit ({end.year}). Verifică perioada pe factură."))
    elif end > now + timedelta(days=5):
        checks.append(warning("future_period", "period_end",
                              f"Perioada facturii se termină în viitor ({date_ro(end)}). Verifică data pe factură."))
    elif end < _years_before(now, 2):
        checks.append(warning("old_bill", "period_end",
                              f"Factura e veche: perioada s-a încheiat pe {date_ro(end)}, acum mai bine de 2 ani."))

    days = (end - start).days + 1
    if days < 7 or days > 366:
        checks.append(warning("period_length", "period_start",
                              f"Perioada facturii are {plural(days, 'zi', 'zile')}, neobișnuit pentru "
                              f"o factură. Verifică datele pe factură."))
    elif 41 <= days:
        checks.append(info("period_length", "period_start",
                           f"Factura acoperă {plural(days, 'zi', 'zile')} (mai multe luni); am pus-o întreagă în "
                           f"{month_label(assigned_month(end))}."))

    # Telecom bills are issued at the start of the month they cover, so this note would be noise there.
    if e.issue_date and e.category != "telecom" and e.issue_date < end - timedelta(days=3):
        checks.append(info("issue_after_period", "issue_date",
                           f"Factura a fost emisă pe {date_ro(e.issue_date)}, înainte să se termine perioada "
                           f"({date_ro(end)})."))
    if e.issue_date and e.due_date:
        if e.due_date < e.issue_date:
            checks.append(info("due_after_issue", "due_date",
                               f"Scadența ({date_ro(e.due_date)}) e înainte de data emiterii "
                               f"({date_ro(e.issue_date)}). Verifică datele."))
        elif (e.due_date - e.issue_date).days > 60:
            checks.append(info("due_after_issue", "due_date",
                               f"Scadența ({date_ro(e.due_date)}) e la peste 60 de zile de la emitere."))

    if c := not_current_month(end):
        checks.append(c)
    return checks
