"""Scan pipeline: file -> (cached) extraction -> Bill + LineItems."""

from __future__ import annotations

import hashlib

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from bills.models import Bill, ExtractionCache, LineItem
from bills.services import ai, mock, providers


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def extract_cached(data: bytes, media_type: str, filename: str = "") -> tuple[ai.ExtractedBill, bool]:
    """Returns (extraction, cache_hit). Real extractions are cached by file hash; mock ones never are."""
    h = file_hash(data)
    cached = ExtractionCache.objects.filter(file_hash=h).first()
    if cached:
        return ai.ExtractedBill.model_validate(cached.data), True
    if settings.AI_MOCK:
        return mock.extraction(), False
    extracted = ai.extract_bill(data, media_type)
    ExtractionCache.objects.create(file_hash=h, filename=filename, data=extracted.model_dump(mode="json"))
    return extracted, False


def scan(data: bytes, media_type: str, filename: str) -> tuple[Bill, bool]:
    """Returns (bill, created). Re-uploading the same file returns the bill created the first time."""
    h = file_hash(data)
    existing = Bill.objects.filter(file_hash=h).first()
    if existing:
        return existing, False
    extracted, _ = extract_cached(data, media_type, filename)
    with transaction.atomic():
        fields = extracted.model_dump(exclude={"line_items"})
        fields["provider"] = providers.normalize(fields["provider"])
        bill = Bill(**fields, source=Bill.Source.UPLOAD, file_hash=h, raw_extraction=extracted.model_dump(mode="json"))
        bill.file.save(filename or "bill", ContentFile(data), save=False)
        bill.save()
        for i, li in enumerate(extracted.line_items):
            LineItem.objects.create(bill=bill, order=i, **li.model_dump())
    return bill, True
