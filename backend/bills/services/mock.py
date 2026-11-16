"""Canned AI responses used when AI_MOCK is on (or no GEMINI_API_KEY is set).

Lets the frontend build every screen before the real AI pipeline works, and gives
us an offline fallback during the demo.
"""

import json

from django.conf import settings

from bills.services.ai import AskAnswer, DisputeLetter, ExtractedBill
from bills.services.ro import lei


def extraction() -> ExtractedBill:
    data = json.loads((settings.FIXTURES_DIR / "extraction_sample.json").read_text(encoding="utf-8"))
    return ExtractedBill.model_validate(data)


def answer(bill: dict, question: str, line_item: dict | None) -> AskAnswer:
    q = (question or "").lower()
    if line_item:
        text = (f"[mock] „{line_item['label']}” este {lei(line_item['amount'])} pe această factură. "
                f"Răspunsul real va explica ce este și de ce s-a schimbat.")
        return AskAnswer(answer=text, sources=["Factura ta"], suggested_actions=[])
    if "vat" in q or "tva" in q:
        return AskAnswer(
            answer="[mock] TVA-ul e 21% din tot restul facturii, așa că dacă prețul energiei crește, crește și TVA-ul.",
            sources=["Factura ta", "Legea 141/2025 (TVA 21%)"],
            suggested_actions=[{"type": "switch_supplier", "label": "Compară ofertele"}],
        )
    return AskAnswer(answer=f"[mock] Factura {bill['provider']} este de {lei(bill['total'])}. Aici va fi răspunsul AI.",
                     sources=["Factura ta"], suggested_actions=[{"type": "dispute", "label": "Contestă factura"}])


def dispute(bill: dict, anomaly: dict | None) -> DisputeLetter:
    reason = anomaly["message"] if anomaly else "Solicit clarificări privind factura."
    return DisputeLetter(
        to=f"{bill['provider']} - Relații Clienți",
        subject=f"Contestație factură {bill['period_end']} - cod client {bill.get('customer_code') or '-'}",
        body=(f"Bună ziua,\n\nSubsemnatul [Nume Prenume], cod client {bill.get('customer_code') or '-'}, "
              f"serie contor {bill.get('meter_series') or '-'}, contest factura pentru perioada "
              f"{bill['period_start']} - {bill['period_end']}, în valoare de {lei(bill['total'])}.\n\n"
              f"Motiv: {reason}\n\nVă rog să recalculați factura.\n\nCu stimă,\n[Nume Prenume]\n[Telefon]"),
    )
