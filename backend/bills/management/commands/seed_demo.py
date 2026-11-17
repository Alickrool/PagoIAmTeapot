"""Seed a demo user's last 12 months of bills (people, codes and supplier prices are fictional;
regulated tariffs follow the public 2026 values in bills/knowledge/romania_utilities.md).

Scenarios on the current month (October 2026):
- Engie (electricity, parents' flat): fixed-price offer expired, energy 0.55 -> 0.88 lei/kWh: +42% bill while
  consumption is only +8% -> price change decomposition. (Not gas: household gas is capped at 0.31 lei/kWh until
  March 2027, so a gas price jump would be unrealistic.)
- PPC (electricity): estimated index 350 kWh vs ~180 usual, price above market -> "don't pay yet".
- Digi (telecom):   paid add-on silently added 6 months ago -> "phantom service".
- Apa Brasov (water): normal bill -> green badge, for contrast.

Usage: python manage.py seed_demo
"""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from bills.models import ArchivedProvider, AutoPayRule, Bill, LineItem

VAT = Decimal("21")
MONTHS = [(2025, m) for m in range(11, 13)] + [(2026, m) for m in range(1, 11)]  # Nov 2025 .. Oct 2026


def D(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def month_bounds(y: int, m: int) -> tuple[date, date]:
    start = date(y, m, 1)
    end = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
    return start, end


def make_bill(provider, category, y, m, items, *, vat=VAT, consumption=None, unit="", index_type="none",
              index_old=None, customer_code="", meter_series="", place="Str. Lungă 10, Brașov"):
    """items: list of (code, label_ro, label_en, kind, qty, unit, unit_price | None, amount | None)."""
    start, end = month_bounds(y, m)
    lines, net = [], Decimal("0")
    for code, label, label_en, kind, qty, u, price, amount in items:
        amt = D(amount if amount is not None else Decimal(str(qty)) * Decimal(str(price)))
        net += amt
        lines.append(dict(code=code, label=label, label_en=label_en, kind=kind, quantity=qty, unit=u,
                          unit_price=price, amount=amt))
    vat_amount = D(net * vat / 100)
    lines.append(dict(code="vat", label=f"TVA {vat:g}%", label_en=f"VAT {vat:g}%", kind="tax", quantity=None,
                      unit="", unit_price=None, amount=vat_amount))
    bill = Bill.objects.create(
        provider=provider, category=category, customer_code=customer_code, meter_series=meter_series,
        place_of_consumption=place, period_start=start, period_end=end, issue_date=end + timedelta(days=5),
        due_date=end + timedelta(days=20), total=D(net + vat_amount), vat_rate=vat, consumption=consumption,
        consumption_unit=unit, index_old=index_old,
        index_new=(index_old + consumption) if index_old is not None and consumption else None,
        index_type=index_type, status="paid", paid_at=end + timedelta(days=16), source="seed",
    )
    for i, li in enumerate(lines):
        LineItem.objects.create(bill=bill, order=i, **li)
    return bill


def electricity_items(c: float, energy_price: float) -> list[tuple]:
    """Household low-voltage bill lines. Regulated values per kWh (no VAT), Brașov / DEER, autumn 2026."""
    return [
        ("energy", "Energie electrică activă", "Active energy (supply)", "energy", c, "kWh", energy_price, None),
        ("distribution", "Tarif distribuție JT", "Low-voltage distribution tariff", "distribution", c, "kWh", 0.3553, None),
        ("transport", "Tarif transport (TL)", "Transmission tariff", "transport", c, "kWh", 0.0365, None),
        ("system_services", "Servicii de sistem", "System services", "regulated_fee", c, "kWh", 0.0127, None),
        ("green_certificates", "Certificate verzi", "Green certificates", "regulated_fee", c, "kWh", 0.0740, None),
        ("cogeneration", "Contribuție cogenerare de înaltă eficiență", "High-efficiency cogeneration contribution",
         "regulated_fee", c, "kWh", 0.0145, None),
        ("cfd", "Contribuție CfD", "Contracts-for-Difference contribution", "regulated_fee", c, "kWh", 0.000144, None),
        ("excise", "Acciză", "Excise duty", "regulated_fee", c, "kWh", 0.0077, None),
    ]


def seed_engie():
    # Parents' flat. Fixed-price offer (0.55) expired in October -> standard price 0.88.
    kwh = [205, 228, 236, 219, 204, 190, 181, 176, 188, 199, 195, 211]
    index = 23105.0
    for i, ((y, m), c) in enumerate(zip(MONTHS, kwh)):
        current = i == len(kwh) - 1
        make_bill("Engie", "electricity", y, m, electricity_items(c, 0.88 if current else 0.55),
                  consumption=c, unit="kWh", index_type="real" if i % 2 else "self", index_old=index,
                  customer_code="EN-4410023981", meter_series="EM-55012874", place="Str. Republicii 5, Brașov")
        index += c


def seed_ppc():
    kwh = [172, 195, 201, 188, 176, 168, 160, 158, 171, 183, 177, 350]
    index = 40211.0
    for i, ((y, m), c) in enumerate(zip(MONTHS, kwh)):
        current = i == len(kwh) - 1
        make_bill("PPC", "electricity", y, m, electricity_items(c, 0.72),
                  consumption=c, unit="kWh", index_type="estimated" if current else ("self" if i % 3 else "real"),
                  index_old=index, customer_code="PPC-1002338471", meter_series="EM-20391877")
        index += c


def seed_digi():
    for i, (y, m) in enumerate(MONTHS):
        items = [("subscription", "Abonament Internet + TV", "Internet + TV subscription", "subscription",
                  1, "month", None, 37.19)]
        if i >= 6:  # added 6 months ago, still there
            items.append(("tv_extra_option", "Opțiune Extra TV + Antivirus", "Extra TV + Antivirus option",
                          "extra_service", 1, "month", None, 12.40))
        make_bill("Digi", "telecom", y, m, items, customer_code="DG-88213409")


def seed_water():
    m3 = [6.1, 6.4, 6.0, 5.8, 6.2, 6.3, 6.5, 6.9, 7.2, 6.8, 6.4, 6.3]
    index = 812.0
    for (y, m), c in zip(MONTHS, m3):
        make_bill("Apa Brasov", "water", y, m, [
            ("water", "Apă potabilă", "Drinking water", "energy", c, "m3", 5.71, None),
            ("sewage", "Canalizare - epurare", "Sewage", "distribution", c, "m3", 4.62, None),
        ], vat=Decimal("11"), consumption=c, unit="m3", index_type="real", index_old=index,
            customer_code="CAB-551203")
        index += c


class Command(BaseCommand):
    help = "Reset the database and seed fictional demo bills."

    @transaction.atomic
    def handle(self, *args, **opts):
        Bill.objects.all().delete()
        AutoPayRule.objects.all().delete()
        ArchivedProvider.objects.all().delete()
        seed_engie()
        seed_ppc()
        seed_digi()
        seed_water()
        # Current-month bills are the unpaid ones on the home screen.
        last = Bill.objects.order_by("-period_end").first().period_end
        Bill.objects.filter(period_end=last).update(status="unpaid", paid_at=None)
        self.stdout.write(self.style.SUCCESS(f"Seeded {Bill.objects.count()} bills."))
