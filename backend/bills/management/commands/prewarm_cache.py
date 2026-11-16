"""Run Gemini extraction on sample bills ahead of the demo so the live scan is instant.

Usage: python manage.py prewarm_cache ../samples/engie.pdf ../samples/ppc.jpg
"""

import glob
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from bills.services.scan import extract_cached

TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic"}


class Command(BaseCommand):
    help = "Extract bills with Gemini and store the result in ExtractionCache."

    def add_arguments(self, parser):
        parser.add_argument("files", nargs="+")

    def handle(self, *args, files, **opts):
        # Windows shells don't expand wildcards, so do it here.
        paths = [p for f in files for p in (sorted(glob.glob(f)) or [f])]
        for f in paths:
            path = Path(f)
            if not path.is_file():
                raise CommandError(f"Not a file: {f}")
            media_type = TYPES.get(path.suffix.lower())
            if not media_type:
                self.stdout.write(f"skip    {path.name} (not a pdf/jpg/png/webp)")
                continue
            extracted, method = extract_cached(path.read_bytes(), media_type, path.name)
            self.stdout.write(f"{method:<16} {path.name}: {extracted.provider} "
                              f"{extracted.total} RON, {len(extracted.line_items)} lines")
