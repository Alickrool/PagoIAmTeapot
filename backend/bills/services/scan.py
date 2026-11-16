"""Scan pipeline: 1-10 files (pages of ONE bill) -> (cached) extraction -> Bill + LineItems (+ highlight boxes)."""

from __future__ import annotations

import hashlib
import logging
import mimetypes
from dataclasses import dataclass

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from bills.models import Bill, ExtractionCache, LineItem
from bills.services import ai, mock, pdf_text, providers

log = logging.getLogger(__name__)
PDF = "application/pdf"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", PDF}
EXT_TYPES = {".pdf": PDF, ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
             ".heic": "image/heic", ".heif": "image/heif"}


@dataclass
class Upload:
    data: bytes
    mime: str
    name: str = ""


class ScanError(Exception):
    """Rejected upload. Rendered by the view as {code, detail} with this HTTP status (docs/API_V2.md §1)."""

    def __init__(self, code: str, detail: str, status: int = 400):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def media_type(content_type: str | None, name: str) -> str:
    """Trust the declared type when allowed; phones often send octet-stream, so fall back to the extension."""
    if content_type in ALLOWED_TYPES:
        return content_type
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return EXT_TYPES.get(ext) or mimetypes.guess_type(name)[0] or content_type or ""


def validate(files: list[Upload]) -> None:
    if not files:
        raise ScanError("no_files", "Send the bill as multipart field 'files' (repeated) or 'file'.")
    if len(files) > settings.SCAN_MAX_FILES:
        raise ScanError("too_many_files", f"A bill can have at most {settings.SCAN_MAX_FILES} files, got {len(files)}.")
    for f in files:
        if f.mime not in ALLOWED_TYPES:
            raise ScanError("unsupported_type", f"{f.name or 'A file'} is not a photo (JPG/PNG/WEBP/HEIC) or a PDF.")
        if len(f.data) > settings.SCAN_MAX_FILE_BYTES:
            raise ScanError("file_too_large", f"{f.name or 'A file'} is larger than "
                                              f"{settings.SCAN_MAX_FILE_BYTES // 2**20} MB.", 413)
    if sum(len(f.data) for f in files) > settings.SCAN_MAX_TOTAL_BYTES:
        raise ScanError("file_too_large", f"All files together are larger than "
                                          f"{settings.SCAN_MAX_TOTAL_BYTES // 2**20} MB.", 413)


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def bill_hash(files: list[Upload]) -> str:
    """One file: sha256 of the file (so caches pre-warmed per file keep working).
    Several: sha256 of the concatenated file hashes, in order."""
    if len(files) == 1:
        return file_hash(files[0].data)
    return hashlib.sha256("".join(file_hash(f.data) for f in files).encode()).hexdigest()


def _extract(files: list[Upload]) -> tuple[ai.ExtractedBill, str]:
    """Text-first when every file is a PDF with a text layer; vision for photos/scans, and when the text
    result doesn't add up. All pages always go in ONE model request."""
    pairs = [(f.data, f.mime) for f in files]
    if all(f.mime == PDF for f in files):
        texts = [pdf_text.extract_text(f.data) for f in files]
        if all(texts):
            joined = texts[0] if len(texts) == 1 else "\n".join(
                f"=== file {i + 1} of {len(texts)} ===\n{t}" for i, t in enumerate(texts))
            extracted = ai.extract_bill_from_text(joined)
            if ai.is_consistent(extracted):
                return extracted, ExtractionCache.Method.TEXT
            log.warning("Text extraction does not add up (%s lines vs total %s), retrying with vision",
                        sum(li.amount for li in extracted.line_items), extracted.total)
            return ai.extract_bill_files(pairs), ExtractionCache.Method.VISION_FALLBACK
    return ai.extract_bill_files(pairs), ExtractionCache.Method.VISION


def extract_cached(files: list[Upload]) -> tuple[ai.ExtractedBill, str]:
    """Returns (extraction, method). Real extractions are cached by bill_hash; mock ones never are."""
    h = bill_hash(files)
    cached = ExtractionCache.objects.filter(file_hash=h).first()
    if cached:
        return ai.ExtractedBill.model_validate(cached.data), "cache"
    if settings.AI_MOCK:
        return mock.extraction(), "mock"
    extracted, method = _extract(files)
    ExtractionCache.objects.create(file_hash=h, filename=" + ".join(f.name for f in files)[:255], method=method,
                                   data=extracted.model_dump(mode="json"))
    return extracted, method


def _blank_nulls(model, values: dict) -> dict:
    """The model may return null for text it can't read (e.g. a VAT line has no unit); text columns are NOT NULL."""
    text_fields = {f.name for f in model._meta.get_fields() if getattr(f, "get_internal_type", None)
                   and f.get_internal_type() in ("CharField", "TextField", "SlugField")}
    return {k: ("" if v is None and k in text_fields else v) for k, v in values.items()}


def scan(files: list[Upload]) -> tuple[Bill, bool]:
    """Returns (bill, created). Re-sending the same files in the same order returns the bill created the first time."""
    validate(files)
    h = bill_hash(files)
    existing = Bill.objects.filter(file_hash=h).first()
    if existing:
        return existing, False
    try:
        extracted, method = extract_cached(files)
    except ValueError as e:  # model gave up / returned nothing usable
        raise ScanError("unreadable", f"Could not read this bill ({e}). Try a sharper, well-lit photo.", 422)
    log.info("Extracted %s via %s", [f.name for f in files], method)

    boxes = pdf_text.find_line_bboxes(
        [(f.data, f.mime) for f in files],
        [{"index": i, "label": li.label, "amount": li.amount} for i, li in enumerate(extracted.line_items)],
    )

    with transaction.atomic():
        fields = _blank_nulls(Bill, extracted.model_dump(exclude={"line_items"}))
        fields["provider"] = providers.normalize(fields["provider"])
        bill = Bill(**fields, source=Bill.Source.UPLOAD, file_hash=h, raw_extraction=extracted.model_dump(mode="json"))
        first = files[0]
        bill.file.save(first.name or "bill", ContentFile(first.data), save=False)  # file_url = first file
        bill.save()
        for i, li in enumerate(extracted.line_items):
            LineItem.objects.create(bill=bill, order=i, bbox=boxes.get(i), **_blank_nulls(LineItem, li.model_dump()))
    return bill, True
