"""Canned AI responses used when AI_MOCK is on (or no ANTHROPIC_API_KEY is set).

Lets the frontend build every screen before the real AI pipeline works, and gives
us an offline fallback during the demo.
"""

import json

from django.conf import settings

from bills.services.ai import DisputeLetter, ExtractedBill


def extraction() -> ExtractedBill:
    data = json.loads((settings.FIXTURES_DIR / "extraction_sample.json").read_text(encoding="utf-8"))
    return ExtractedBill.model_validate(data)


def answer(bill: dict, question: str, line_item: dict | None) -> str:
    q = (question or "").lower()
    if line_item:
        return (f"[mock] \"{line_item['label']}\" is {line_item['amount']} RON on this bill. "
                f"The real answer will explain what it is and why it changed.")
    if "vat" in q or "tva" in q:
        return "[mock] VAT is 21% of everything else on the bill, so when the energy price goes up, VAT goes up too."
    return f"[mock] Your {bill['provider']} bill is {bill['total']} RON. Real AI answer goes here."


def dispute(bill: dict, anomaly: dict | None) -> DisputeLetter:
    reason = anomaly["message"] if anomaly else "Solicit clarificări privind factura."
    return DisputeLetter(
        to=f"{bill['provider']} - Relații Clienți",
        subject=f"Contestație factură {bill['period_end']} - cod client {bill.get('customer_code') or '-'}",
        body=(f"Bună ziua,\n\nSubsemnatul [Nume Prenume], cod client {bill.get('customer_code') or '-'}, "
              f"serie contor {bill.get('meter_series') or '-'}, contest factura pentru perioada "
              f"{bill['period_start']} - {bill['period_end']}, în valoare de {bill['total']} RON.\n\n"
              f"Motiv: {reason}\n\nVă rog să recalculați factura.\n\nCu stimă,\n[Nume Prenume]\n[Telefon]"),
    )
