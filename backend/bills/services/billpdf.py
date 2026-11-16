"""The bill as one PDF (docs/API_V2.md §5).

- one uploaded PDF          -> the original file, unchanged
- photos and/or several PDFs -> one PDF, pages in upload order (photos EXIF-rotated, fitted on A4)
- seeded / demo bill        -> rendered like `make_sample_pdfs`, so every demo bill has a PDF
"""

from __future__ import annotations

import io
import logging

from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter

from bills.models import Bill
from bills.services.overview import slugify

log = logging.getLogger(__name__)
PDF = "application/pdf"
A4_PX = (1240, 1754)  # A4 at 150 dpi

try:  # iPhone photos
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    log.warning("pillow-heif not installed: HEIC photos can't be put into PDFs")


class NoPdf(Exception):
    pass


def filename(bill: Bill) -> str:
    return f"{slugify(bill.provider) or 'factura'}-{bill.period_end:%Y-%m}.pdf"


def _image_page(data: bytes) -> bytes:
    """One photo -> one A4 PDF page (rotation fixed, scaled to fit, white margins)."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((A4_PX[0] - 80, A4_PX[1] - 80))
    page = Image.new("RGB", A4_PX, "white")
    page.paste(img, ((A4_PX[0] - img.width) // 2, (A4_PX[1] - img.height) // 2))
    out = io.BytesIO()
    page.save(out, "PDF", resolution=150)
    return out.getvalue()


def _read(f) -> bytes | None:
    try:
        with f.open("rb") as fh:
            return fh.read()
    except (FileNotFoundError, ValueError, OSError):
        return None


def _combine(pages: list[tuple[bytes, str]]) -> bytes:
    writer = PdfWriter()
    for data, mime in pages:
        try:
            pdf = data if mime == PDF else _image_page(data)
            for page in PdfReader(io.BytesIO(pdf)).pages:
                writer.add_page(page)
        except Exception:  # an unreadable page shouldn't hide the others
            log.warning("Skipping a page that can't be put into the PDF (%s)", mime, exc_info=True)
    if not writer.pages:
        raise NoPdf()
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _render_demo(bill: Bill) -> bytes:
    from bills.management.commands.make_sample_pdfs import register_font, render

    out = io.BytesIO()
    render(bill, out, *register_font())
    return out.getvalue()


def bill_pdf(bill: Bill) -> bytes:
    pages = [(data, f.mime) for f in bill.files.all() if (data := _read(f.file)) is not None]
    if not pages and bill.file:  # very old upload without BillFile rows
        data = _read(bill.file)
        if data is not None:
            pages = [(data, PDF if bill.file.name.lower().endswith(".pdf") else "image/jpeg")]

    if len(pages) == 1 and pages[0][1] == PDF:
        return pages[0][0]  # the original, unchanged
    if pages:
        if bill.pdf_cache and (cached := _read(bill.pdf_cache)) is not None:
            return cached
        pdf = _combine(pages)
        bill.pdf_cache.save(f"{bill.id}-{filename(bill)}", ContentFile(pdf), save=True)  # uploads never change
        return pdf
    if bill.source == Bill.Source.SEED:
        return _render_demo(bill)  # not cached: submitting a reading changes the lines
    raise NoPdf()
