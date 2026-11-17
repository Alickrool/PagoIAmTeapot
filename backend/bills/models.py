from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Category(models.TextChoices):
    ELECTRICITY = "electricity"
    GAS = "gas"
    TELECOM = "telecom"
    WATER = "water"
    OTHER = "other"


class IndexType(models.TextChoices):
    REAL = "real"            # read by the distributor
    SELF_READING = "self"    # submitted by the customer ("autocitire")
    ESTIMATED = "estimated"  # estimated by the supplier
    NONE = "none"            # not metered (telecom, subscriptions)


class ValidationStatus(models.TextChoices):
    ACCEPTED = "accepted"          # no warnings, or confirmed by the user
    NEEDS_REVIEW = "needs_review"  # saved, but the user should confirm the warnings


class Bill(models.Model):
    class Status(models.TextChoices):
        UNPAID = "unpaid"
        PAID = "paid"
        BLOCKED = "blocked"  # stopped by a Smart Auto-Pay rule

    class Source(models.TextChoices):
        UPLOAD = "upload"
        SEED = "seed"

    provider = models.CharField(max_length=64)  # "Engie", "PPC", "Hidroelectrica", "Digi"
    category = models.CharField(max_length=16, choices=Category.choices)
    customer_code = models.CharField(max_length=64, blank=True)
    meter_series = models.CharField(max_length=64, blank=True)
    place_of_consumption = models.CharField(max_length=255, blank=True)
    county = models.CharField(max_length=32, default="Brasov")

    period_start = models.DateField()
    period_end = models.DateField()
    issue_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    total = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="RON")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)  # 21.00

    consumption = models.FloatField(null=True, blank=True)
    consumption_unit = models.CharField(max_length=8, blank=True)  # kWh, m3
    index_old = models.FloatField(null=True, blank=True)
    index_new = models.FloatField(null=True, blank=True)
    index_type = models.CharField(max_length=16, choices=IndexType.choices, default=IndexType.NONE)

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UNPAID)
    paid_at = models.DateField(null=True, blank=True)  # set by POST /pay/; the receipt the search shows
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.SEED)
    file = models.FileField(upload_to="bills/", null=True, blank=True)  # first uploaded page (see BillFile)
    pdf_cache = models.FileField(upload_to="bills/pdf/", null=True, blank=True)  # combined pages, built on demand
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)
    raw_extraction = models.JSONField(null=True, blank=True)
    bill_number = models.CharField(max_length=64, blank=True)  # series + number as printed, for duplicate checks

    # Scan validation (docs/API_V2.md §6). Seeded bills are accepted with no checks.
    validation_status = models.CharField(max_length=16, choices=ValidationStatus.choices,
                                         default=ValidationStatus.ACCEPTED, db_index=True)
    validation = models.JSONField(default=dict, blank=True)  # {"checks": [{id, severity, field, message}]}
    confirmed_by_user = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end", "-id"]

    def __str__(self):
        return f"{self.provider} {self.period_end:%Y-%m} {self.total} {self.currency}"

    @property
    def all_in_unit_price(self):
        """Total paid per kWh/m3, VAT included. None for non-metered bills."""
        if self.consumption:
            return round(float(self.total) / self.consumption, 3)
        return None


class LineItem(models.Model):
    class Kind(models.TextChoices):
        ENERGY = "energy"              # supply / active energy
        DISTRIBUTION = "distribution"  # regulated network tariffs
        TRANSPORT = "transport"
        REGULATED_FEE = "regulated_fee"  # green certificates, cogeneration, CfD, excise
        SUBSCRIPTION = "subscription"
        EXTRA_SERVICE = "extra_service"  # add-ons: antivirus, TV options, insurance
        PENALTY = "penalty"
        TAX = "tax"                    # VAT
        DISCOUNT = "discount"
        OTHER = "other"

    bill = models.ForeignKey(Bill, related_name="line_items", on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)
    code = models.SlugField(max_length=64)       # stable machine key, e.g. "vat", "distribution"
    label = models.CharField(max_length=255)      # as printed on the bill (Romanian)
    label_en = models.CharField(max_length=255, blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.OTHER)
    quantity = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=16, blank=True)
    unit_price = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)  # CfD is 0.000144 lei/kWh
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Optional highlight box on the original document, normalized 0..1: {page, x, y, w, h}
    bbox = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.label}: {self.amount}"


class BillFile(models.Model):
    """One uploaded page of a bill (photo or PDF), in upload order. Bill.file points at the first one."""

    bill = models.ForeignKey(Bill, related_name="files", on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)
    file = models.FileField(upload_to="bills/")
    name = models.CharField(max_length=255, blank=True)
    mime = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.bill_id}#{self.order} {self.name}"


@receiver(post_delete, sender=BillFile)
@receiver(post_delete, sender=Bill)
def _delete_stored_files(sender, instance, **kwargs):
    """Deleting a bill (also the `dev` test reset) removes its uploads and cached PDF from disk."""
    for field in ("file", "pdf_cache"):
        f = getattr(instance, field, None)
        if f and f.name:
            f.storage.delete(f.name)  # FileSystemStorage ignores files that are already gone


class ExtractionCache(models.Model):
    """sha256(file) -> Gemini extraction. Survives seed_demo, so pre-warmed demo bills scan instantly."""

    class Method(models.TextChoices):
        TEXT = "text"                        # PDF text layer -> Gemini as text (cheapest)
        VISION = "vision"                    # photo / scanned PDF -> Gemini vision
        VISION_FALLBACK = "vision_fallback"  # text result didn't add up -> retried with vision

    file_hash = models.CharField(max_length=64, unique=True)
    filename = models.CharField(max_length=255, blank=True)
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.VISION)
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.filename or self.file_hash[:12]}"


class ArchivedProvider(models.Model):
    """A provider the user no longer uses (docs/API_V2.md §8): still listed with all its bills, but greyed out at the
    bottom of the list. Keyed by slug, because providers come from the bills and are not stored on their own."""

    slug = models.SlugField(max_length=64, unique=True)
    archived_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.slug


class AutoPayRule(models.Model):
    provider = models.CharField(max_length=64)
    max_amount = models.DecimalField(max_digits=10, decimal_places=2)
    block_if_estimated = models.BooleanField(default=True)
    block_if_anomaly = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"AutoPay {self.provider} <= {self.max_amount}"
