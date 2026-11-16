"""Bills scanned before BillFile existed kept only Bill.file: register it as their first page."""

import mimetypes
import os

from django.db import migrations

EXT = {".pdf": "application/pdf", ".heic": "image/heic", ".heif": "image/heif", ".webp": "image/webp"}


def backfill(apps, schema_editor):
    Bill = apps.get_model("bills", "Bill")
    BillFile = apps.get_model("bills", "BillFile")
    for bill in Bill.objects.exclude(file="").exclude(file__isnull=True):
        if BillFile.objects.filter(bill=bill).exists():
            continue
        name = os.path.basename(bill.file.name)
        ext = os.path.splitext(name)[1].lower()
        mime = EXT.get(ext) or mimetypes.guess_type(name)[0] or "application/octet-stream"
        BillFile.objects.create(bill=bill, order=0, file=bill.file.name, name=name, mime=mime)


class Migration(migrations.Migration):
    dependencies = [("bills", "0005_bill_files")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
