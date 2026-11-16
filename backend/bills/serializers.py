from django.urls import reverse
from rest_framework import serializers

from bills.models import AutoPayRule, Bill, LineItem
from bills.services import market
from bills.services.audit import audit_bill, history_for


class LineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LineItem
        fields = ["id", "code", "label", "label_en", "kind", "quantity", "unit", "unit_price", "amount", "bbox"]


class BillListSerializer(serializers.ModelSerializer):
    audit_status = serializers.SerializerMethodField()

    class Meta:
        model = Bill
        fields = ["id", "provider", "category", "period_start", "period_end", "due_date", "total", "currency",
                  "status", "audit_status", "source", "created_at"]

    def get_audit_status(self, bill):
        return audit_bill(bill)["status"]


class HistoryPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bill
        fields = ["id", "period_end", "total", "consumption", "index_type"]


class BillDetailSerializer(serializers.ModelSerializer):
    line_items = LineItemSerializer(many=True, read_only=True)
    audit = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    all_in_unit_price = serializers.FloatField(read_only=True)
    county_average = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = Bill
        fields = ["id", "provider", "category", "customer_code", "meter_series", "place_of_consumption", "county",
                  "period_start", "period_end", "issue_date", "due_date", "total", "currency", "vat_rate",
                  "consumption", "consumption_unit", "index_old", "index_new", "index_type", "all_in_unit_price",
                  "county_average", "status", "source", "file_url", "files", "pdf_url", "line_items", "audit", "history"]

    def get_audit(self, bill):
        return audit_bill(bill)

    def get_history(self, bill):
        return HistoryPointSerializer(reversed(history_for(bill)), many=True).data  # oldest first, for charts

    def get_county_average(self, bill):
        ref = market.COUNTY_AVERAGES.get(bill.category)
        return (ref.get(bill.county) or ref["Romania"]) if ref else None

    def _abs(self, path: str) -> str:
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path

    def get_files(self, bill):
        """Original uploaded pages, in order. Open them with GET .../files/{index}/ (inline)."""
        return [{"index": f.order, "name": f.name, "mime": f.mime,
                 "url": self._abs(reverse("bill-file", args=[bill.id, f.order]))} for f in bill.files.all()]

    def get_pdf_url(self, bill):
        """The whole bill as one PDF (docs/API_V2.md §5)."""
        return self._abs(reverse("bill-pdf", args=[bill.id]))

    def get_file_url(self, bill):
        if not bill.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(bill.file.url) if request else bill.file.url


class AutoPayRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoPayRule
        fields = ["id", "provider", "max_amount", "block_if_estimated", "block_if_anomaly", "active", "created_at"]


class AskSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=500, required=False, allow_blank=True)
    line_item_id = serializers.IntegerField(required=False)

    def validate(self, data):
        if not data.get("question") and not data.get("line_item_id"):
            raise serializers.ValidationError("Trimite o întrebare, un line_item_id sau ambele.")
        return data


class DisputeSerializer(serializers.Serializer):
    anomaly_id = serializers.CharField(required=False)


class ReadingSerializer(serializers.Serializer):
    index_new = serializers.FloatField(min_value=0)


class PaySerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["manual", "auto"], default="manual")
