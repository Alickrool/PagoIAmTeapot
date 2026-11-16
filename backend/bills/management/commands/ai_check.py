"""Live check of the configured LLM provider: one extraction + one question, with timings.

Usage:  python manage.py ai_check                       (uses samples/demo_ppc_2026_10.pdf)
        python manage.py ai_check ../samples/my_bill.jpg
Bypasses the extraction cache and writes nothing to the database.
"""

import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from bills.models import Bill
from bills.serializers import BillDetailSerializer
from bills.services import ai, scan

TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         ".webp": "image/webp", ".heic": "image/heic"}


class Command(BaseCommand):
    help = "Call the real LLM once for extraction and once for Q&A, print results and timings."

    def add_arguments(self, parser):
        parser.add_argument("file", nargs="?", default=str(settings.SAMPLES_DIR / "demo_ppc_2026_10.pdf"))

    def handle(self, *args, file, **opts):
        model = settings.GEMINI_MODEL if settings.AI_PROVIDER == "gemini" else settings.ANTHROPIC_MODEL
        self.stdout.write(f"Provider: {settings.AI_PROVIDER}  model: {model}")
        if settings.AI_MOCK:
            raise CommandError("AI_MOCK is on (AI_MOCK=1 or no key for this provider in backend/.env).")
        path = Path(file)
        if not path.is_file():
            raise CommandError(f"No such file: {path}  (run `python manage.py make_sample_pdfs` first)")

        t = time.monotonic()
        try:
            bill, method = scan._extract(path.read_bytes(), TYPES.get(path.suffix.lower(), "application/pdf"))
        except Exception as e:  # show provider errors (bad key, unknown model, quota) plainly
            raise CommandError(f"Extraction failed: {type(e).__name__}: {e}")
        self.stdout.write(self.style.SUCCESS(f"\nExtraction via {method} in {time.monotonic() - t:.1f}s"))
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
