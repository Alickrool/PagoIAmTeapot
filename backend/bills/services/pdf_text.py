"""Local PDF text extraction (no AI): cheaper/faster extraction input, and highlight boxes for line items."""

from __future__ import annotations

import io
import re
import unicodedata

import pdfplumber

MIN_TEXT_CHARS = 200  # less than this -> scanned PDF without a text layer, use vision


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip()


def extract_text(data: bytes) -> str | None:
    """Layout-preserving text of every page, or None when the PDF has no usable text layer."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [p.extract_text(layout=True) or "" for p in pdf.pages]
    except Exception:  # corrupt/encrypted PDF -> let vision try
        return None
    text = "\n".join(f"--- page {i + 1} ---\n{t}" for i, t in enumerate(pages))
    return text if len(re.sub(r"\s", "", text)) >= MIN_TEXT_CHARS else None


def _amount_variants(amount) -> set[str]:
    a = f"{float(amount):,.2f}"  # 1,234.56
    return {a.replace(",", ""), a.replace(",", "X").replace(".", ",").replace("X", "."), a.replace(",", "X").replace(".", ",").replace("X", "")}


def find_line_bboxes(data: bytes, items: list[dict]) -> dict[int, dict]:
    """items: [{"index", "label", "amount"}] -> {index: {page, x, y, w, h}} (page 1-based, coords 0..1).

    Matches each extracted line item to the printed text line containing its label (and ideally its amount).
    """
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            lines = [
                (page_no, page.width, page.height, ln)
                for page_no, page in enumerate(pdf.pages, start=1)
                for ln in page.extract_text_lines()
            ]
    except Exception:
        return {}

    normed = [_norm(ln["text"]) for *_, ln in lines]
    result, used = {}, set()
    for it in items:
        label = _norm(it["label"])
        if not label:
            continue
        key = label[:30]
        amounts = _amount_variants(it["amount"])
        candidates = [i for i, t in enumerate(normed) if key in t and i not in used]
        if not candidates:
            continue
        best = next((i for i in candidates if any(a in normed[i] for a in amounts)), candidates[0])
        used.add(best)
        page_no, w, h, ln = lines[best]
        pad = 2
        result[it["index"]] = {
            "page": page_no,
            "x": round(max(ln["x0"] - pad, 0) / w, 4),
            "y": round(max(ln["top"] - pad, 0) / h, 4),
            "w": round((ln["x1"] - ln["x0"] + 2 * pad) / w, 4),
            "h": round((ln["bottom"] - ln["top"] + 2 * pad) / h, 4),
        }
    return result
