"""File safety before any AI call (docs/SCAN_VALIDATION_PLAN.md §4, F1–F9).

- the real type comes from the first bytes, never from the name or the declared content type
- photos: pixel limit, EXIF rotation applied, re-saved without metadata (no GPS, no author)
- PDFs: no password, no JavaScript / launch actions / embedded files / XFA, parsed with a time limit
- at most 10 pages in all
"""

from __future__ import annotations

import io
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf.generic import DictionaryObject

from bills.services.ro import plural
from bills.services.validation import Rejected

log = logging.getLogger(__name__)
PDF = "application/pdf"
MAX_PIXELS = 50_000_000
MAX_SIDE = 8000
MAX_PAGES = 10
PDF_PARSE_SECONDS = 5
HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}
EXT = {"image/jpeg": ".jpg", "image/png": ".png", PDF: ".pdf"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # Pillow refuses bigger images (decompression bombs)
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    pass

# Active PDF content, as raw names in uncompressed objects (stream bodies are skipped: random compressed bytes
# would match "/JS" now and then); objects inside compressed object streams are found through pypdf below.
_ACTIVE_RAW = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA)(?![A-Za-z])")
_STREAM_BODY = re.compile(rb"stream\r?\n.*?endstream", re.S)
_ACTIVE_ACTIONS = {"/JavaScript", "/Launch", "/ImportData", "/RichMediaExecute"}


def sniff(data: bytes) -> str | None:
    """Real type from the magic bytes, or None when it is not an accepted type."""
    if data.startswith(b"%PDF-"):
        return PDF
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in HEIF_BRANDS:
        return "image/heic"
    return None


MAX_AUDIO_BYTES = 1024 * 1024  # about 30 s of phone m4a


def sniff_audio(data: bytes) -> str | None:
    """Voice search (docs/API_V2.md §7): the audio type from the magic bytes, as Gemini names it."""
    if data[4:8] == b"ftyp" and data[8:12] not in HEIF_BRANDS:
        return "audio/mp4"  # m4a from expo-audio on iOS and Android
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data.startswith(b"\x1aE\xdf\xa3"):
        return "audio/webm"
    if data.startswith(b"ID3") or (len(data) > 1 and data[0] == 0xFF and data[1] in (0xFB, 0xF3, 0xF2)):
        return "audio/mp3"
    if len(data) > 1 and data[0] == 0xFF and data[1] & 0xF6 == 0xF0:
        return "audio/aac"  # raw ADTS
    return None


def _label(name: str) -> str:
    return name or "Un fișier"


def clean_image(data: bytes, name: str) -> tuple[bytes, str]:
    """-> (clean bytes, mime). PNG stays PNG; everything else becomes JPEG. Metadata is dropped."""
    try:
        img = Image.open(io.BytesIO(data))
        width, height = img.size
    except Image.DecompressionBombError:
        raise Rejected("image_too_large", f"{_label(name)} are prea mulți pixeli. Trimite o poză normală de telefon.")
    except Exception:
        raise Rejected("unreadable_file", f"{_label(name)} e deteriorat și nu se poate deschide.")
    if width * height > MAX_PIXELS or max(width, height) > MAX_SIDE:
        raise Rejected("image_too_large", f"{_label(name)} e prea mare ({width}×{height} px). "
                                          f"Trimite o poză normală de telefon.")
    try:
        is_png = img.format == "PNG"
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P", "PA"):  # flatten transparency on white, like paper
            rgba = img.convert("RGBA")
            img = Image.new("RGB", rgba.size, "white")
            img.paste(rgba, mask=rgba.getchannel("A"))
        elif img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out = io.BytesIO()
        if is_png:
            img.save(out, "PNG")
            return out.getvalue(), "image/png"
        img.save(out, "JPEG", quality=92)
        return out.getvalue(), "image/jpeg"
    except Image.DecompressionBombError:
        raise Rejected("image_too_large", f"{_label(name)} are prea mulți pixeli. Trimite o poză normală de telefon.")
    except Exception:
        raise Rejected("unreadable_file", f"{_label(name)} e deteriorat și nu se poate deschide.")


def _action_is_active(action) -> bool:
    try:
        action = action.get_object()
        return isinstance(action, DictionaryObject) and action.get("/S") in _ACTIVE_ACTIONS
    except Exception:
        return False


def _has_active_content(reader: PdfReader) -> bool:
    root = reader.trailer["/Root"].get_object()
    names = root.get("/Names")
    if names is not None:
        names = names.get_object()
        if "/JavaScript" in names or "/EmbeddedFiles" in names:
            return True
    form = root.get("/AcroForm")
    if form is not None and "/XFA" in form.get_object():
        return True
    if "/AA" in root or ("/OpenAction" in root and _action_is_active(root["/OpenAction"])):
        return True
    for page in reader.pages:
        if "/AA" in page:
            return True
        for annot in page.get("/Annots") or []:
            annot = annot.get_object()
            if annot.get("/Subtype") in ("/FileAttachment", "/RichMedia", "/Movie", "/Sound"):
                return True
            if "/A" in annot and _action_is_active(annot["/A"]):
                return True
    return False


def _parse_pdf(data: bytes) -> tuple[int, bool, bool]:
    """-> (pages, encrypted without an empty password, active content)."""
    reader = PdfReader(io.BytesIO(data), strict=False)
    if reader.is_encrypted:
        # Many provider PDFs are "encrypted" only to forbid editing, with an empty open password: those are fine.
        if not reader.decrypt(""):
            return 0, True, False
    return len(reader.pages), False, _has_active_content(reader)


def check_pdf(data: bytes, name: str) -> int:
    """-> number of pages. Rejects password-protected, active or broken PDFs."""
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        pages, locked, active = pool.submit(_parse_pdf, data).result(timeout=PDF_PARSE_SECONDS)
    except FutureTimeout:
        log.warning("PDF parsing timed out")
        raise Rejected("unreadable_file", f"{_label(name)} nu se poate deschide (durează prea mult).")
    except Exception:
        raise Rejected("unreadable_file", f"{_label(name)} e deteriorat și nu se poate deschide.")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    if locked:
        raise Rejected("encrypted_pdf", f"{_label(name)} are parolă. Trimite factura fără parolă "
                                        f"(sau o poză a ei).")
    if active or _ACTIVE_RAW.search(_STREAM_BODY.sub(b"", data)):
        raise Rejected("suspicious_file", f"{_label(name)} conține cod sau fișiere atașate, așa că nu îl deschidem. "
                                          f"Trimite o poză a facturii.")
    if pages < 1:
        raise Rejected("unreadable_file", f"{_label(name)} nu are nicio pagină.")
    return pages


def inspect(data: bytes, name: str) -> tuple[bytes, str, int]:
    """One uploaded file -> (bytes to use from now on, real mime, pages). Raises Rejected."""
    mime = sniff(data)
    if mime is None:
        raise Rejected("unsupported_type", f"{_label(name)} nu e o poză (JPG/PNG/WEBP/HEIC) sau un PDF.")
    if mime == PDF:
        return data, PDF, check_pdf(data, name)
    clean, clean_mime = clean_image(data, name)
    return clean, clean_mime, 1


def check_pages(total_pages: int) -> None:
    if total_pages > MAX_PAGES:
        raise Rejected("too_many_pages", f"Factura are {plural(total_pages, 'pagină', 'pagini')}; "
                                         f"trimite cel mult {MAX_PAGES}.")
