"""Run Gemini extraction on sample bills ahead of the demo so the live scan is instant.

Usage: python manage.py prewarm_cache ../samples/*                       (each file = one bill)
       python manage.py prewarm_cache --one-bill p1.jpg p2.jpg annex.pdf (all files = pages of ONE bill, in order)
The cache key must match what the app sends: same files, same order.
"""

import glob
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from bills.services.scan import EXT_TYPES, Upload, extract_cached


class Command(BaseCommand):
    help = "Extract bills with Gemini and store the result in ExtractionCache."

    def add_arguments(self, parser):
        parser.add_argument("files", nargs="+")
        parser.add_argument("--one-bill", action="store_true", help="treat all files as the pages of one bill")

    def handle(self, *args, files, one_bill, **opts):
        # Windows shells don't expand wildcards, so do it here.
        paths = [Path(p) for f in files for p in (sorted(glob.glob(f)) or [f])]
        uploads = []
        for path in paths:
            if not path.is_file():
                raise CommandError(f"Not a file: {path}")
            mime = EXT_TYPES.get(path.suffix.lower())
            if not mime:
                self.stdout.write(f"skip    {path.name} (not a pdf/jpg/png/webp/heic)")
                continue
            uploads.append(Upload(path.read_bytes(), mime, path.name))

        groups = [uploads] if one_bill else [[u] for u in uploads]
        for group in groups:
            extracted, method = extract_cached(group)
            names = " + ".join(u.name for u in group)
            self.stdout.write(f"{method:<16} {names}: {extracted.provider} "
                              f"{extracted.total} RON, {len(extracted.line_items)} lines")
