"""Live check of the Gemini key/model: one extraction + one question, with timings.

Usage:  python manage.py ai_check                       (uses samples/demo_ppc_2026_10.pdf)
        python manage.py ai_check ../samples/my_bill.jpg
        python manage.py ai_check page1.jpg page2.jpg      (several files = pages of ONE bill)
Bypasses the extraction cache and writes nothing to the database.
"""

import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from bills.models import Bill
from bills.serializers import BillDetailSerializer
from bills.services import ai, scan
from bills.services.scan import EXT_TYPES, Upload



class Command(BaseCommand):
    help = "Call the real LLM once for extraction and once for Q&A, print results and timings."

    def add_arguments(self, parser):
        parser.add_argument("files", nargs="*")

    def handle(self, *args, files, **opts):
        self.stdout.write(f"Model: {settings.GEMINI_MODEL}")
        if settings.AI_MOCK:
            raise CommandError("AI_MOCK is on (AI_MOCK=1 or no GEMINI_API_KEY in backend/.env).")
        paths = [Path(f) for f in files] or [settings.SAMPLES_DIR / "demo_ppc_2026_10.pdf"]
        for path in paths:
            if not path.is_file():
                raise CommandError(f"No such file: {path}  (run `python manage.py make_sample_pdfs` first)")
        uploads = [Upload(p.read_bytes(), EXT_TYPES.get(p.suffix.lower(), "application/pdf"), p.name) for p in paths]

        t = time.monotonic()
        try:
            bill, method = scan._extract(uploads)
        except Exception as e:  # show provider errors (bad key, unknown model, quota) plainly
            raise CommandError(f"Extraction failed: {type(e).__name__}: {e}")
        self.stdout.write(self.style.SUCCESS(f"\nExtraction of {len(uploads)} file(s) via {method} in {time.monotonic() - t:.1f}s"))
        self.stdout.write(f"  {bill.provider} / {bill.category} / {bill.period_start}..{bill.period_end} / "
                          f"total {bill.total} / {bill.consumption} {bill.consumption_unit} / index {bill.index_type}")
        for li in bill.line_items:
            self.stdout.write(f"  - {li.label:<45} {li.kind:<14} {li.amount:>9.2f}")
        lines_sum = sum(li.amount for li in bill.line_items)
        ok = ai.is_consistent(bill)
        self.stdout.write((self.style.SUCCESS if ok else self.style.WARNING)(
            f"  lines sum {lines_sum:.2f} vs total {bill.total:.2f}: {'OK' if ok else 'MISMATCH'}"))

        demo = Bill.objects.filter(provider="Engie").order_by("-period_end").first()
        if not demo:
            return self.stdout.write("No seeded Engie bill, skipping Q&A (run seed_demo).")
        t = time.monotonic()
        ctx = BillDetailSerializer(demo).data
        answer = ai.answer_question(ctx, "Why is VAT so high this month?", None)
        self.stdout.write(self.style.SUCCESS(f"\nQ&A in {time.monotonic() - t:.1f}s"))
        self.stdout.write(f"  {answer.answer}\n  sources: {answer.sources}\n  actions: {answer.suggested_actions}")
