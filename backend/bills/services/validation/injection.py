"""The bill is data, never instructions (docs/SCAN_VALIDATION_PLAN.md §5).

`sanitize` cleans and bounds every field the model returned; `check` flags documents that try to talk to the AI.
"""

from __future__ import annotations

import re

from bills.services.ro import plural
from bills.services.validation import Check, Rejected, warning

MAX_LINES = 60
MAX_AMOUNT = 100_000  # lei, per line and for the total
LIMITS = {"provider": 64, "customer_code": 40, "meter_series": 40, "place_of_consumption": 200,
          "consumption_unit": 8, "bill_number": 40}
LINE_LIMITS = {"label": 120, "label_en": 120, "unit": 16}

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩﻿]")
_URL = re.compile(r"(https?://|www\.)\S+", re.I)
_INJECTION = re.compile(
    r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts?)"
    r"|disregard\s+(all\s+|the\s+|any\s+)?(previous|prior|above)"
    r"|ignor[aă]\s+(toate\s+)?(instruc[tțţ]iunile|regulile)"
    r"|system\s+prompt|prompt(ul)?\s+de\s+sistem|you\s+are\s+now\b|new\s+instructions\s*:"
    r"|</?\s*bill_text\s*>",
    re.I,
)


def clean_text(value: str | None, max_len: int) -> str | None:
    """No control/bidi characters, no URLs, no angle brackets, single spaces, bounded length."""
    if value is None:
        return None
    value = _CONTROL.sub(" ", value)
    value = _URL.sub(" ", value).replace("<", " ").replace(">", " ")
    return " ".join(value.split())[:max_len]


def _code(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", value.lower()).strip("_")[:40] or "other"


def _currency(value: str | None) -> str:
    c = re.sub(r"[^A-Za-z]", "", value or "").upper()
    return "RON" if c in ("", "RON", "LEI", "LEU") else c[:3]


def sanitize(e):
    """Returns a cleaned copy of the extraction; Rejected(invalid_extraction) when it can't be a real bill."""
    if len(e.line_items) > MAX_LINES:
        raise Rejected("invalid_extraction", f"Am citit {plural(len(e.line_items), 'rând', 'rânduri')}, prea multe "
                                             f"pentru o factură. "
                                             f"Încearcă din nou cu pozele facturii.", 422)
    if abs(e.total) > MAX_AMOUNT or any(abs(li.amount) > MAX_AMOUNT for li in e.line_items):
        raise Rejected("invalid_extraction", "Sumele citite nu au sens pentru o factură. Încearcă o poză mai clară.", 422)
    lines = [li.model_copy(update={"code": _code(li.code),
                                   **{k: clean_text(getattr(li, k), n) for k, n in LINE_LIMITS.items()}})
             for li in e.line_items]
    fields = {k: clean_text(getattr(e, k), n) for k, n in LIMITS.items()}
    fields["provider"] = fields["provider"] or "Furnizor necunoscut"
    return e.model_copy(update={**fields, "currency": _currency(e.currency), "line_items": lines})


def suspicious(text: str) -> bool:
    return bool(text and _INJECTION.search(text))


def check(e, document_text: str = "") -> list[Check]:
    labels = " ".join(f"{li.label} {li.label_en}" for li in e.line_items)
    if e.suspicious_text or suspicious(document_text) or suspicious(labels):
        return [warning("prompt_injection_suspected", "document",
                        "Factura conține un text care încearcă să dea instrucțiuni aplicației. Am citit doar "
                        "cifrele tipărite; verifică totalul cu factura.")]
    return []
