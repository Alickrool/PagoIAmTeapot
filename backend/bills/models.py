from django.db import models


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
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.SEED)
    file = models.FileField(upload_to="bills/", null=True, blank=True)
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)
    raw_extraction = models.JSONField(null=True, blank=True)
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
    unit_price = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Optional highlight box on the original document, normalized 0..1: {page, x, y, w, h}
    bbox = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.label}: {self.amount}"


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


class AutoPayRule(models.Model):
    provider = models.CharField(max_length=64)
    max_amount = models.DecimalField(max_digits=10, decimal_places=2)
    block_if_estimated = models.BooleanField(default=True)
    block_if_anomaly = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"AutoPay {self.provider} <= {self.max_amount}"
