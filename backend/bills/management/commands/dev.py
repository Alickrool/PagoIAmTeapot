"""Start a TEST session: empty the current billing month, then run the dev server.

Usage: python manage.py dev               (resets settings.CURRENT_MONTH, serves on 0.0.0.0:8000)
       python manage.py dev --keep        (no reset)
       python manage.py dev 0.0.0.0:9000  (other address/port)

The reset runs once per start. The autoreloader restarts the server in a child process after code edits; that child
has RUN_MAIN=true and skips the reset, so saving a file never wipes your test scans. Older months are untouched, and
the extraction cache is kept, so re-scanning the same file doesn't call Gemini again.
"""

import os

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from bills.models import Bill


def reset_month(month: str) -> int:
    """Delete every bill (seeded or scanned) whose period ends in `month` ("YYYY-MM"). Returns how many bills."""
    year, mon = map(int, month.split("-"))
    bills = Bill.objects.filter(period_end__year=year, period_end__month=mon)
    n = bills.count()
    bills.delete()  # line items cascade
    return n


class Command(BaseCommand):
    help = "Reset the current billing month and start the dev server (test sessions)."

    def add_arguments(self, parser):
        parser.add_argument("addrport", nargs="?", default="0.0.0.0:8000")
        parser.add_argument("--keep", action="store_true", help="don't reset the current month")

    def handle(self, *args, addrport, keep, **opts):
        if os.environ.get("RUN_MAIN") != "true" and not keep:
            n = reset_month(settings.CURRENT_MONTH)
            self.stdout.write(self.style.WARNING(
                f"Test session: removed {n} bill(s) of {settings.CURRENT_MONTH}; older months kept."))
        call_command("runserver", addrport)
