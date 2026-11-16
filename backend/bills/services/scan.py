"""Scan pipeline: file -> (cached) extraction -> Bill + LineItems (+ highlight boxes for PDFs)."""

from __future__ import annotations

import hashlib
import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from bills.models import Bill, ExtractionCache, LineItem
from bills.services import ai, mock, pdf_text, providers

log = logging.getLogger(__name__)
PDF = "application/pdf"


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _extract(data: bytes, media_type: str) -> tuple[ai.ExtractedBill, str]:
    """Text-first for PDFs with a text layer; vision for photos, scans, and when the text result doesn't add up."""
    if media_type == PDF:
        text = pdf_text.extract_text(data)
        if text:
            extracted = ai.extract_bill_from_text(text)
            if ai.is_consistent(extracted):
                return extracted, ExtractionCache.Method.TEXT
            log.warning("Text extraction does not add up (%s lines vs total %s), retrying with vision",
                        sum(li.amount for li in extracted.line_items), extracted.total)
            vision = ai.extract_bill(data, media_type)
            return vision, ExtractionCache.Method.VISION_FALLBACK
    return ai.extract_bill(data, media_type), ExtractionCache.Method.VISION


def extract_cached(data: bytes, media_type: str, filename: str = "") -> tuple[ai.ExtractedBill, str]:
    """Returns (extraction, method). Real extractions are cached by file hash; mock ones never are."""
    h = file_hash(data)
    cached = ExtractionCache.objects.filter(file_hash=h).first()
    if cached:
        return ai.ExtractedBill.model_validate(cached.data), "cache"
    if settings.AI_MOCK:
        return mock.extraction(), "mock"
    extracted, method = _extract(data, media_type)
    ExtractionCache.objects.create(file_hash=h, filename=filename, method=method,
                                   data=extracted.model_dump(mode="json"))
    return extracted, method


def scan(data: bytes, media_type: str, filename: str) -> tuple[Bill, bool]:
    """Returns (bill, created). Re-uploading the same file returns the bill created the first time."""
    h = file_hash(data)
    existing = Bill.objects.filter(file_hash=h).first()
    if existing:
        return existing, False
    extracted, method = extract_cached(data, media_type, filename)
    log.info("Extracted %s via %s", filename, method)

    boxes = {}
    if media_type == PDF:
        boxes = pdf_text.find_line_bboxes(
            data, [{"index": i, "label": li.label, "amount": li.amount} for i, li in enumerate(extracted.line_items)]
        )

    with transaction.atomic():
        fields = extracted.model_dump(exclude={"line_items"})
        fields["provider"] = providers.normalize(fields["provider"])
        bill = Bill(**fields, source=Bill.Source.UPLOAD, file_hash=h, raw_extraction=extracted.model_dump(mode="json"))
        bill.file.save(filename or "bill", ContentFile(data), save=False)
        bill.save()
        for i, li in enumerate(extracted.line_items):
            LineItem.objects.create(bill=bill, order=i, bbox=boxes.get(i), **li.model_dump())
    return bill, True
