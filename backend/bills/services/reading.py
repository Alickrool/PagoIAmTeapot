"""Submit a real meter reading (autocitire) and recalculate an estimated bill.

Demo simplification: we recompute the consumption-based lines with the same unit prices and re-apply VAT,
which is what the supplier's corrected bill would roughly look like.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from bills.models import Bill, IndexType, LineItem
from bills.services.ro import num

# Gas meters count m3, gas is billed in kWh. Real factor varies by month/region (PCS); ~10.5 is typical.
GAS_KWH_PER_M3 = 10.5
MAX_RATIO = 5  # reject readings implying > 5x the billed consumption (typo guard)


class ReadingError(ValueError):
    pass


def _money(x: float | Decimal) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@transaction.atomic
def submit_reading(bill: Bill, index_new: float) -> dict:
    if bill.index_old is None or not bill.consumption:
        raise ReadingError("Această factură nu are index de contor.")
    if index_new <= bill.index_old:
        raise ReadingError(f"Indexul nou trebuie să fie mai mare decât cel vechi ({num(bill.index_old)}).")

    delta = index_new - bill.index_old
    new_consumption = round(delta * GAS_KWH_PER_M3, 1) if bill.category == "gas" else round(delta, 2)
    if new_consumption > bill.consumption * MAX_RATIO:
        raise ReadingError("Indexul pare prea mare. Verifică din nou contorul.")

    old = {"total": float(bill.total), "consumption": bill.consumption, "index_type": bill.index_type}
    items = list(bill.line_items.all())

    # 1. Consumption-based lines: same unit price, new quantity.
    for li in items:
        if li.unit_price is not None and li.quantity is not None and abs(li.quantity - bill.consumption) < 0.01:
            li.quantity = new_consumption
            li.amount = _money(Decimal(str(new_consumption)) * li.unit_price)
            li.save(update_fields=["quantity", "amount"])

    # 2. VAT on the new net amount.
    net = sum((li.amount for li in items if li.kind != LineItem.Kind.TAX), Decimal("0"))
    for li in items:
        if li.kind == LineItem.Kind.TAX and bill.vat_rate:
            li.amount = _money(net * bill.vat_rate / 100)
            li.save(update_fields=["amount"])

    bill.total = sum((li.amount for li in items), Decimal("0"))
    bill.consumption = new_consumption
    bill.index_new = index_new
    bill.index_type = IndexType.SELF_READING
    if bill.status == Bill.Status.BLOCKED:
        bill.status = Bill.Status.UNPAID
    bill.save(update_fields=["total", "consumption", "index_new", "index_type", "status"])

    return {
        "previous_total": old["total"],
        "new_total": float(bill.total),
        "difference": round(float(bill.total) - old["total"], 2),
        "previous_consumption": old["consumption"],
        "new_consumption": new_consumption,
        "unit": bill.consumption_unit,
    }
