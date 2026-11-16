"""All Claude calls live here: bill extraction, contextual Q&A, dispute letters."""

from __future__ import annotations

import base64
import json
from datetime import date
from functools import lru_cache
from typing import Literal

import anthropic
from django.conf import settings
from pydantic import BaseModel, Field

# ---------- shared ----------


@lru_cache
def client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


@lru_cache
def knowledge_base() -> str:
    return "\n\n".join(p.read_text(encoding="utf-8") for p in sorted(settings.KNOWLEDGE_DIR.glob("*.md")))


def _file_block(data: bytes, media_type: str) -> dict:
    b64 = base64.standard_b64encode(data).decode("utf-8")
    kind = "document" if media_type == "application/pdf" else "image"
    return {"type": kind, "source": {"type": "base64", "media_type": media_type, "data": b64}}


# ---------- 1. extraction ----------


class ExtractedLineItem(BaseModel):
    code: str = Field(description="snake_case key. Use: energy, distribution, transport, system_services, "
                                  "green_certificates, cogeneration, cfd, excise, subscription, vat, penalty, "
                                  "discount, or a short slug for extra services (e.g. antivirus_option)")
    label: str = Field(description="Exact label as printed on the bill (keep Romanian)")
    label_en: str = Field(description="Short English translation of the label")
    kind: Literal["energy", "distribution", "transport", "regulated_fee", "subscription",
                  "extra_service", "penalty", "tax", "discount", "other"]
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    amount: float = Field(description="Line amount in RON as printed")


class ExtractedBill(BaseModel):
    provider: str = Field(description="Supplier brand, e.g. Engie, PPC, Hidroelectrica, E.ON, Digi, Orange")
    category: Literal["electricity", "gas", "telecom", "water", "other"]
    customer_code: str | None = None
    meter_series: str | None = None
    place_of_consumption: str | None = None
    period_start: date
    period_end: date
    issue_date: date | None = None
    due_date: date | None = None
    total: float = Field(description="Total to pay for this bill, RON")
    vat_rate: float | None = Field(default=None, description="VAT percent, e.g. 21")
    consumption: float | None = None
    consumption_unit: str | None = Field(default=None, description="kWh or m3")
    index_old: float | None = None
    index_new: float | None = None
    index_type: Literal["real", "self", "estimated", "none"] = Field(
        description="real = read by distributor, self = autocitire, estimated = estimat/convenție, none = not metered")
    line_items: list[ExtractedLineItem]


EXTRACTION_PROMPT = """You are reading a Romanian utility or telecom bill (factură).
Extract every billed line item exactly as printed, with amounts in RON.
Rules:
- Do not invent values. Use null when a field is not printed.
- index_type: look for words like "estimat", "convenție", "autocitire", "citit de distribuitor".
- VAT (TVA) is its own line item with kind "tax" and code "vat".
- Optional add-ons (antivirus, TV packages, insurance, extra options) are kind "extra_service".
- Regulated components (certificate verzi, contribuție cogenerare, CfD, acciză) are kind "regulated_fee".
"""


def _parse_bill(content: list[dict]) -> ExtractedBill:
    response = client().messages.parse(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=16000,
        output_config={"effort": "medium"},
        messages=[{"role": "user", "content": content}],
        output_format=ExtractedBill,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise ValueError("Could not read this bill")
    return response.parsed_output


def extract_bill(data: bytes, media_type: str) -> ExtractedBill:
    """Vision path: photo or PDF sent as an image/document block."""
    return _parse_bill([_file_block(data, media_type), {"type": "text", "text": EXTRACTION_PROMPT}])


def extract_bill_from_text(text: str) -> ExtractedBill:
    """Text path: PDF text extracted locally (2-3x fewer tokens, exact numbers)."""
    note = ("The bill below is the text layer of a PDF, extracted with layout preserved. "
            "Table columns may be slightly misaligned: use the column headers to map quantity, unit price and amount.")
    return _parse_bill([{"type": "text", "text": f"{EXTRACTION_PROMPT}\n{note}\n\n<bill_text>\n{text}\n</bill_text>"}])


def is_consistent(bill: ExtractedBill, tolerance: float = 0.01) -> bool:
    """Do the extracted lines add up to the total? A mismatch usually means columns got mixed up."""
    lines_sum = sum(li.amount for li in bill.line_items)
    return abs(lines_sum - bill.total) <= max(1.0, abs(bill.total) * tolerance)


# ---------- 2. contextual Q&A ----------

ASK_SYSTEM = """You are the bill assistant inside Pago, a Romanian bill-payment app.
The user is looking at one bill and asks about it, sometimes after tapping a specific line.

How to answer:
- answer: English, 2-4 short sentences, plain language, no markdown.
- Always tie the answer to the user's actual numbers (amounts, % changes, prices per kWh).
- Explain real-world causes (law changes, ANRE tariffs, price caps ending) ONLY using the knowledge base below.
  If the knowledge base does not cover it, say what the bill shows and that you are not sure about the cause.
- Never invent legislation, dates, or tariffs. Don't show the bracketed source tags in the answer text.
- sources: short labels for what the answer relies on, e.g. "Your bill", "Your last 12 bills",
  "Law 141/2025 (VAT 21%)", "ANRE order 69/2025". Use the law/order numbers from the knowledge base, never site
  names. Only items you actually used. 1-3 items.
- suggested_actions: 0-2 actions the user can take right now, only if they really help with this question.

<knowledge_base>
{kb}
</knowledge_base>"""


class SuggestedAction(BaseModel):
    type: Literal["submit_reading", "dispute", "switch_supplier", "cancel_service", "autopay_rule"]
    label: str = Field(description="Button text, max 4 words")


class AskAnswer(BaseModel):
    answer: str
    sources: list[str]
    suggested_actions: list[SuggestedAction]


def answer_question(bill_context: dict, question: str, line_item: dict | None) -> AskAnswer:
    focus = f"\nThe user tapped this line: {json.dumps(line_item, ensure_ascii=False)}" if line_item else ""
    user = (
        f"<bill>\n{json.dumps(bill_context, ensure_ascii=False, default=str)}\n</bill>{focus}\n\nQuestion: {question}"
    )
    response = client().beta.messages.parse(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "low"},
        cache_control={"type": "ephemeral"},
        system=ASK_SYSTEM.format(kb=knowledge_base()),
        messages=[{"role": "user", "content": user}],
        output_format=AskAnswer,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        return AskAnswer(answer="Sorry, I can't answer that one.", sources=[], suggested_actions=[])
    return response.parsed_output


# ---------- 3. dispute letter ----------


class DisputeLetter(BaseModel):
    to: str = Field(description="Recipient, e.g. 'Engie Romania - Customer Service' or 'ANPC'")
    subject: str
    body: str


DISPUTE_PROMPT = """Write a short, polite, formal complaint (sesizare/contestație) in Romanian from a household customer
to their supplier about the bill below. Include customer code, meter series, bill period and total, the specific
problem from the anomaly, and a clear request (recalculate on real index / remove the option / explain the increase).
Leave [Nume Prenume] and [Telefon] as placeholders. Do not invent legal articles.

<bill>{bill}</bill>
<anomaly>{anomaly}</anomaly>"""


def write_dispute(bill_context: dict, anomaly: dict | None) -> DisputeLetter:
    response = client().messages.parse(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4000,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": DISPUTE_PROMPT.format(
            bill=json.dumps(bill_context, ensure_ascii=False, default=str),
            anomaly=json.dumps(anomaly, ensure_ascii=False) if anomaly else "general clarification request",
        )}],
        output_format=DisputeLetter,
    )
    if response.parsed_output is None:
        raise ValueError("Could not draft the letter")
    return response.parsed_output
