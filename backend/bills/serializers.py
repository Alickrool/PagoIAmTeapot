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
                  "status", "audit_status"]

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

    class Meta:
        model = Bill
        fields = ["id", "provider", "category", "customer_code", "meter_series", "place_of_consumption", "county",
                  "period_start", "period_end", "issue_date", "due_date", "total", "currency", "vat_rate",
                  "consumption", "consumption_unit", "index_old", "index_new", "index_type", "all_in_unit_price",
                  "county_average", "status", "source", "file_url", "line_items", "audit", "history"]

    def get_audit(self, bill):
        return audit_bill(bill)

    def get_history(self, bill):
        return HistoryPointSerializer(reversed(history_for(bill)), many=True).data  # oldest first, for charts

    def get_county_average(self, bill):
        ref = market.COUNTY_AVERAGES.get(bill.category)
        return (ref.get(bill.county) or ref["Romania"]) if ref else None

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
            raise serializers.ValidationError("Send a question, a line_item_id, or both.")
        return data


class DisputeSerializer(serializers.Serializer):
    anomaly_id = serializers.CharField(required=False)


class ReadingSerializer(serializers.Serializer):
    index_new = serializers.FloatField(min_value=0)


class PaySerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["manual", "auto"], default="manual")
