from django.conf import settings
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from bills.models import AutoPayRule, Bill
from bills.serializers import (AskSerializer, AutoPayRuleSerializer, BillDetailSerializer, BillListSerializer,
                               DisputeSerializer, LineItemSerializer, PaySerializer, ReadingSerializer)
from bills.services import ai, market, mock
from bills.services.reading import ReadingError, submit_reading
from bills.services import scan as scan_service
from bills.services.audit import audit_bill

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


def _bill_context(bill: Bill, request) -> dict:
    """Compact bill JSON handed to the LLM."""
    data = BillDetailSerializer(bill, context={"request": request}).data
    data.pop("file_url", None)
    return data


class BillViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Bill.objects.prefetch_related("line_items")
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list" and self.request.query_params.get("all") != "1":
            # One (latest) bill per provider: what the home screen shows.
            latest_ids = {}
            for b in qs.order_by("-period_end", "-id"):
                latest_ids.setdefault(b.provider, b.id)
            qs = qs.filter(id__in=latest_ids.values())
        return qs

    def get_serializer_class(self):
        return BillListSerializer if self.action == "list" else BillDetailSerializer

    @action(detail=False, methods=["post"])
    def scan(self, request):
        """Upload a photo/PDF of a bill -> extracted, audited bill."""
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Send the bill as multipart field 'file'."}, status=400)
        if upload.content_type not in ALLOWED_TYPES:
            return Response({"detail": f"Unsupported type {upload.content_type}."}, status=400)
        try:
            bill, created = scan_service.scan(upload.read(), upload.content_type, upload.name)
        except ValueError as e:
            return Response({"detail": str(e)}, status=422)
        return Response(BillDetailSerializer(bill, context={"request": request}).data, status=201 if created else 200)

    @action(detail=True, methods=["post"])
    def ask(self, request, pk=None):
        """Tap-to-ask / free-text question about this bill."""
        bill = self.get_object()
        s = AskSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        line_item = None
        if s.validated_data.get("line_item_id"):
            li = bill.line_items.filter(id=s.validated_data["line_item_id"]).first()
            if not li:
                return Response({"detail": "Unknown line item."}, status=404)
            line_item = LineItemSerializer(li).data
        question = s.validated_data.get("question") or "What is this charge and why is it this amount?"
        ctx = _bill_context(bill, request)
        result = mock.answer(ctx, question, line_item) if settings.AI_MOCK else ai.answer_question(ctx, question, line_item)
        return Response({"question": question, "line_item": line_item, **result.model_dump()})

    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        """Draft a complaint e-mail for an anomaly."""
        bill = self.get_object()
        s = DisputeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        anomaly = None
        if s.validated_data.get("anomaly_id"):
            anomaly = next((a for a in audit_bill(bill)["anomalies"] if a["id"] == s.validated_data["anomaly_id"]), None)
        ctx = _bill_context(bill, request)
        letter = mock.dispute(ctx, anomaly) if settings.AI_MOCK else ai.write_dispute(ctx, anomaly)
        return Response(letter.model_dump())

    @action(detail=True, methods=["post"])
    def reading(self, request, pk=None):
        """Submit the real meter index -> recalculated bill (estimated -> self reading)."""
        bill = self.get_object()
        s = ReadingSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            recalculation = submit_reading(bill, s.validated_data["index_new"])
        except ReadingError as e:
            return Response({"detail": str(e)}, status=400)
        bill = self.get_queryset().get(pk=bill.pk)  # fresh line items
        data = BillDetailSerializer(bill, context={"request": request}).data
        return Response({**data, "recalculation": recalculation})

    @action(detail=True, methods=["get"])
    def offers(self, request, pk=None):
        bill = self.get_object()
        return Response({
            "current_all_in_price": bill.all_in_unit_price,
            "unit": bill.consumption_unit,
            "offers": market.offers_for(bill.category, bill.consumption, float(bill.total), bill.provider),
            "disclaimer": "Demo prices, illustrative only.",
        })

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """mode=manual pays now; mode=auto simulates Smart Auto-Pay against the provider's rule."""
        bill = self.get_object()
        s = PaySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        reasons = []
        if s.validated_data["mode"] == "auto":
            rule = AutoPayRule.objects.filter(provider__iexact=bill.provider, active=True).order_by("-id").first()
            if not rule:
                return Response({"detail": "No active auto-pay rule for this provider."}, status=400)
            audit = audit_bill(bill)
            if bill.total > rule.max_amount:
                reasons.append(f"Total {bill.total} RON is above your limit of {rule.max_amount} RON.")
            if rule.block_if_estimated and bill.index_type == "estimated":
                reasons.append("The bill uses an estimated index.")
            if rule.block_if_anomaly and audit["status"] == "critical":
                reasons.append("The audit found a critical anomaly.")
        bill.status = Bill.Status.BLOCKED if reasons else Bill.Status.PAID
        bill.save(update_fields=["status"])
        return Response({"status": bill.status, "reasons": reasons}, status=status.HTTP_200_OK)


class AutoPayRuleViewSet(viewsets.ModelViewSet):
    queryset = AutoPayRule.objects.order_by("-id")
    serializer_class = AutoPayRuleSerializer
