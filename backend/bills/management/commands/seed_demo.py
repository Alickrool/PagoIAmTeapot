"""Seed a demo user's last 12 months of bills (all data is fictional).

Scenarios on the current month (October 2026):
- Engie (gas):      +42% bill vs last month, consumption only +8% -> price change decomposition.
- PPC (electricity): estimated index 350 kWh vs ~180 usual, price above market -> "don't pay yet".
- Digi (telecom):   paid add-on silently added 6 months ago -> "phantom service".
- Apa Brasov (water): normal bill -> green badge, for contrast.

Usage: python manage.py seed_demo
"""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from bills.models import AutoPayRule, Bill, LineItem

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
        index_type=index_type, status="paid", source="seed",
    )
    for i, li in enumerate(lines):
        LineItem.objects.create(bill=bill, order=i, **li)
    return bill


def seed_engie():
    # Monthly gas consumption in kWh (heating season shape). Last value = current month.
    kwh = [980, 1350, 1520, 1310, 1040, 720, 420, 260, 210, 230, 470, 508]
    index = 18240.0
    for i, ((y, m), c) in enumerate(zip(MONTHS, kwh)):
        current = i == len(kwh) - 1
        supply, dist = (0.40, 0.084) if current else (0.29, 0.079)
        make_bill("Engie", "gas", y, m, [
            ("energy", "Gaze naturale - furnizare", "Gas supply", "energy", c, "kWh", supply, None),
            ("distribution", "Tarif distribuție gaze", "Gas distribution tariff", "distribution", c, "kWh", dist, None),
        ], consumption=c, unit="kWh", index_type="real", index_old=index,
            customer_code="EN-4410023981", meter_series="G4-77812331")
        index += c / 10.5  # m3 on the meter


def seed_ppc():
    kwh = [172, 195, 201, 188, 176, 168, 160, 158, 171, 183, 177, 350]
    index = 40211.0
    for i, ((y, m), c) in enumerate(zip(MONTHS, kwh)):
        current = i == len(kwh) - 1
        make_bill("PPC", "electricity", y, m, [
            ("energy", "Energie electrică activă", "Active energy (supply)", "energy", c, "kWh", 0.89, None),
            ("distribution", "Tarif distribuție JT", "Low-voltage distribution tariff", "distribution", c, "kWh", 0.21, None),
            ("transport", "Tarif transport (TG+TL)", "Transmission tariff", "transport", c, "kWh", 0.04, None),
            ("system_services", "Servicii de sistem", "System services", "regulated_fee", c, "kWh", 0.008, None),
            ("green_certificates", "Certificate verzi", "Green certificates", "regulated_fee", c, "kWh", 0.025, None),
            ("cogeneration", "Contribuție cogenerare de înaltă eficiență", "High-efficiency cogeneration contribution",
             "regulated_fee", c, "kWh", 0.006, None),
            ("excise", "Acciză", "Excise duty", "regulated_fee", c, "kWh", 0.006, None),
        ], consumption=c, unit="kWh", index_type="estimated" if current else ("self" if i % 3 else "real"),
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
        seed_engie()
        seed_ppc()
        seed_digi()
        seed_water()
        # Current-month bills are the unpaid ones on the home screen.
        last = Bill.objects.order_by("-period_end").first().period_end
        Bill.objects.filter(period_end=last).update(status="unpaid")
        self.stdout.write(self.style.SUCCESS(f"Seeded {Bill.objects.count()} bills."))
