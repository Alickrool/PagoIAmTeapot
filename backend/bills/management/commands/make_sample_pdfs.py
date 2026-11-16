"""Render the seeded current-month bills as Romanian-style PDF invoices (fictional, marked as demo).

Gives us realistic "bad" bills to scan live in the demo, and text PDFs to test extraction/bbox on.
Usage: python manage.py seed_demo && python manage.py make_sample_pdfs   (writes to ../samples/)
"""

import zlib
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

from bills.models import Bill

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
]
INDEX_LABEL = {"real": "citit distribuitor", "self": "autocitire", "estimated": "ESTIMAT", "none": "-"}


def register_font() -> tuple[str, str]:
    """Romanian diacritics (ă ș ț) need a TTF font; the built-in Helvetica can't render them."""
    for regular, bold in FONT_CANDIDATES:
        if Path(regular).exists():
            pdfmetrics.registerFont(TTFont("BillFont", regular))
            pdfmetrics.registerFont(TTFont("BillFont-Bold", bold if Path(bold).exists() else regular))
            return "BillFont", "BillFont-Bold"
    return "Helvetica", "Helvetica-Bold"


def ro(n, decimals=2) -> str:
    """Romanian number format: 1.234,56"""
    s = f"{float(n):,.{decimals}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def render(bill: Bill, path: Path, font: str, bold: str):
    rl_config.invariant = 1  # no timestamps/random ids -> same bytes -> same cache hash on every run
    p = lambda text, size=9, b=False: Paragraph(text, ParagraphStyle("p", fontName=bold if b else font, fontSize=size, leading=size + 3))
    period = f"{bill.period_start:%d.%m.%Y} - {bill.period_end:%d.%m.%Y}"
    story = [
        p(f"{bill.provider.upper()} (DEMO)", 16, True),
        p("FACTURĂ FISCALĂ - document demonstrativ, date fictive / demo document, fictional data", 8),
        Spacer(1, 6 * mm),
    ]
    info = [
        ["Cod client", bill.customer_code or "-", "Nr. factură",
         f"DEMO-{zlib.crc32(f'{bill.provider}{bill.period_end}'.encode()) % 1000000:06d}"],
        ["Loc de consum", bill.place_of_consumption or "-", "Data emiterii", f"{bill.issue_date:%d.%m.%Y}" if bill.issue_date else "-"],
        ["Perioada de facturare", period, "Data scadentă", f"{bill.due_date:%d.%m.%Y}" if bill.due_date else "-"],
    ]
    if bill.meter_series:
        info.append(["Serie contor", bill.meter_series, "Județ", bill.county])
    story += [Table(info, colWidths=[38 * mm, 62 * mm, 30 * mm, 50 * mm],
                    style=[("FONT", (0, 0), (-1, -1), font, 8), ("FONT", (0, 0), (0, -1), bold, 8),
                           ("FONT", (2, 0), (2, -1), bold, 8)]), Spacer(1, 5 * mm)]

    if bill.index_old is not None:
        unit_meter = "m3" if bill.category == "gas" else bill.consumption_unit
        idx = [["Index vechi", "Index nou", "Tip citire", "Cantitate facturată"],
               [ro(bill.index_old, 0), ro(bill.index_new, 0) if bill.index_new else "-", INDEX_LABEL[bill.index_type],
                f"{ro(bill.consumption, 0)} {bill.consumption_unit}"]]
        story += [p(f"Citiri contor ({unit_meter})", 9, True),
                  Table(idx, colWidths=[40 * mm] * 4, style=[
                      ("FONT", (0, 0), (-1, -1), font, 8), ("FONT", (0, 0), (-1, 0), bold, 8),
                      ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                      *([("TEXTCOLOR", (2, 1), (2, 1), colors.red)] if bill.index_type == "estimated" else []),
                  ]), Spacer(1, 5 * mm)]

    rows = [["Denumire", "Cantitate", "U.M.", "Preț unitar (lei)", "Valoare (lei)"]]
    for li in bill.line_items.all():
        rows.append([li.label,
                     ro(li.quantity, 0) if li.quantity is not None and li.unit_price is not None else "",
                     li.unit if li.unit_price is not None else "",
                     ro(li.unit_price, 4) if li.unit_price is not None else "",
                     ro(li.amount)])
    rows.append(["TOTAL DE PLATĂ", "", "", "", ro(bill.total)])
    story += [p("Detalii factură", 9, True),
              Table(rows, colWidths=[78 * mm, 22 * mm, 14 * mm, 32 * mm, 30 * mm], style=[
                  ("FONT", (0, 0), (-1, -1), font, 8), ("FONT", (0, 0), (-1, 0), bold, 8),
                  ("FONT", (0, -1), (-1, -1), bold, 9), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                  ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black), ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
                  ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F3F4F6")]),
              ]),
              Spacer(1, 8 * mm),
              p(f"Total de plată: <b>{ro(bill.total)} lei</b> până la data de "
                f"{bill.due_date:%d.%m.%Y}." if bill.due_date else "", 10)]
    target = path if hasattr(path, "write") else str(path)  # a file path or an in-memory buffer
    SimpleDocTemplate(target, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm,
                      title=f"{bill.provider} demo bill").build(story)


class Command(BaseCommand):
    help = "Write demo PDF invoices for the current seeded bills into samples/."

    def handle(self, *args, **opts):
        out = settings.SAMPLES_DIR
        out.mkdir(exist_ok=True)
        font, bold = register_font()
        latest = Bill.objects.filter(source="seed").order_by("-period_end").first().period_end
        for bill in Bill.objects.filter(source="seed", period_end=latest).prefetch_related("line_items"):
            path = out / f"demo_{bill.provider.lower().replace(' ', '_')}_{bill.period_end:%Y_%m}.pdf"
            try:
                render(bill, path, font, bold)
                self.stdout.write(f"  {path.name}")
            except PermissionError:
                self.stdout.write(self.style.WARNING(f"  {path.name}: file is open in another program, close it and rerun"))
        self.stdout.write(self.style.SUCCESS(f"Written to {out}"))
