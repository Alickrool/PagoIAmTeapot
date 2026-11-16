"""Several uploaded pages of ONE bill (photos and/or PDFs, in order) -> a single PDF for the scan pipeline.

docs/API_V2.md §1. One file is passed through unchanged, so single-file scans and their cache keep working.
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter

PDF = "application/pdf"
MAX_FILES = 10
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 25 * 1024 * 1024


class PagesError(ValueError):
    def __init__(self, code: str, detail: str, status: int = 400):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def _image_to_pdf(data: bytes) -> bytes:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    out = io.BytesIO()
    img.save(out, format="PDF", resolution=200)
    return out.getvalue()


def combine(files: list[tuple[bytes, str, str]]) -> tuple[bytes, str, str]:
    """files = [(data, content_type, name)] in page order -> (data, content_type, name)."""
    if not files:
        raise PagesError("no_files", "Trimite factura ca fișier (câmpul «files» sau «file»).")
    if len(files) > MAX_FILES:
        raise PagesError("too_many_files", f"O factură poate avea cel mult {MAX_FILES} pagini.")
    for data, _, name in files:
        if len(data) > MAX_FILE_BYTES:
            raise PagesError("file_too_large", f"{name} are peste 10 MB.", 413)
    if sum(len(d) for d, _, _ in files) > MAX_TOTAL_BYTES:
        raise PagesError("file_too_large", "Paginile au împreună peste 25 MB.", 413)

    if len(files) == 1:
        return files[0]

    writer = PdfWriter()
    for data, content_type, name in files:
        try:
            pdf = data if content_type == PDF else _image_to_pdf(data)
            for page in PdfReader(io.BytesIO(pdf)).pages:
                writer.add_page(page)
        except Exception as e:  # unreadable image/PDF (or HEIC without a decoder)
            raise PagesError("unsupported_type", f"Nu pot deschide {name}: {e}") from e
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue(), PDF, f"{files[0][2].rsplit('.', 1)[0]}-{len(files)}pagini.pdf"
