import re
from datetime import date

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from google.genai import errors as genai_errors
from rest_framework.views import APIView

from bills.models import ArchivedProvider, AutoPayRule, Bill, BillFile, ValidationStatus
from bills.throttles import AskThrottle, ScanThrottle
from bills.serializers import (AskSerializer, AutoPayRuleSerializer, BillDetailSerializer, BillListSerializer,
                               DisputeSerializer, LineItemSerializer, PaySerializer, ReadingSerializer)
from bills.services import ai, billpdf, market, mock, overview, search
from bills.services.validation import files as file_checks
from bills.services.reading import ReadingError, submit_reading
from bills.services.ro import lei
from bills.services import scan as scan_service
from bills.services.audit import audit_bill


def _ai_error_response(e: Exception) -> Response:
    """Gemini overloaded -> 503 ai_busy; any other Gemini error -> 502 ai_error. Never a 500 debug page."""
    if isinstance(e, ai.AIUnavailable):
        return Response({"code": "ai_busy", "detail": "Serviciul AI e foarte aglomerat acum. Încearcă din nou peste un minut."}, status=503)
    return Response({"code": "ai_error", "detail": "Serviciul AI a răspuns cu o eroare. Încearcă din nou."}, status=502)

def _bill_context(bill: Bill, request, personal: bool = True) -> dict:
    """Compact bill JSON handed to the LLM. Q&A gets no personal data (personal=False): no customer code, meter,
    address or bill number; the dispute letter needs them to identify the customer."""
    data = BillDetailSerializer(bill, context={"request": request}).data
    for key in ("file_url", "files", "pdf_url", "validation"):
        data.pop(key, None)
    if not personal:
        for key in ("customer_code", "meter_series", "place_of_consumption", "bill_number"):
            data.pop(key, None)
    return data


class BillViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Bill.objects.prefetch_related("line_items", "files")
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = super().get_queryset()
        source = self.request.query_params.get("source")
        if self.action == "list" and source in ("upload", "seed"):
            # Every bill of that source, newest scan first (?source=upload = "my scanned bills").
            return qs.filter(source=source).order_by("-created_at", "-id")
        if self.action == "list" and self.request.query_params.get("all") != "1":
            # One (latest) bill per provider: what the home screen shows.
            latest_ids = {}
            for b in qs.order_by("-period_end", "-id"):
                latest_ids.setdefault(b.provider, b.id)
            qs = qs.filter(id__in=latest_ids.values())
        return qs

    def get_serializer_class(self):
        return BillListSerializer if self.action == "list" else BillDetailSerializer

    @action(detail=False, methods=["post"], throttle_classes=[ScanThrottle])
    def scan(self, request):
        """1-10 photos/PDFs = the pages of ONE bill (field `files`, repeated; legacy `file`) -> audited bill.
        Errors: {code, detail} (docs/API_V2.md §1)."""
        uploads = request.FILES.getlist("files") or request.FILES.getlist("file")
        files = [scan_service.Upload(u.read(), scan_service.media_type(u.content_type, u.name), u.name) for u in uploads]
        try:
            bill, created = scan_service.scan(files)
        except scan_service.ScanError as e:
            return Response({"code": e.code, "detail": e.detail, **e.extra}, status=e.status)
        return Response(BillDetailSerializer(bill, context={"request": request}).data, status=201 if created else 200)

    @action(detail=True, methods=["post"], throttle_classes=[AskThrottle])
    def ask(self, request, pk=None):
        """Tap-to-ask / free-text question about this bill."""
        bill = self.get_object()
        s = AskSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        line_item = None
        if s.validated_data.get("line_item_id"):
            li = bill.line_items.filter(id=s.validated_data["line_item_id"]).first()
            if not li:
                return Response({"detail": "Rândul nu există pe această factură."}, status=404)
            line_item = LineItemSerializer(li).data
        question = s.validated_data.get("question") or "Ce reprezintă această sumă și de ce are valoarea asta?"
        ctx = _bill_context(bill, request, personal=False)
        try:
            result = mock.answer(ctx, question, line_item) if settings.AI_MOCK else ai.answer_question(ctx, question, line_item)
        except (ai.AIUnavailable, genai_errors.APIError) as e:
            return _ai_error_response(e)
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
        try:
            letter = mock.dispute(ctx, anomaly) if settings.AI_MOCK else ai.write_dispute(ctx, anomaly)
        except (ai.AIUnavailable, genai_errors.APIError) as e:
            return _ai_error_response(e)
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
            "disclaimer": "Prețuri demo, doar cu titlu ilustrativ.",
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
                return Response({"detail": "Nu există o regulă de plată automată activă pentru acest furnizor."}, status=400)
            audit = audit_bill(bill)
            if bill.total > rule.max_amount:
                reasons.append(f"Totalul de {lei(bill.total)} depășește limita ta de {lei(rule.max_amount)}.")
            if rule.block_if_estimated and bill.index_type == "estimated":
                reasons.append("Factura folosește un index estimat.")
            if rule.block_if_anomaly and audit["status"] == "critical":
                reasons.append("Auditul a găsit o anomalie gravă.")
        bill.status = Bill.Status.BLOCKED if reasons else Bill.Status.PAID
        bill.paid_at = date.today() if bill.status == Bill.Status.PAID else None
        bill.save(update_fields=["status", "paid_at"])
        return Response({"status": bill.status, "reasons": reasons}, status=status.HTTP_200_OK)


    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """The user checked the validation warnings and says the bill is right (docs/API_V2.md §6)."""
        bill = self.get_object()
        bill.validation_status = ValidationStatus.ACCEPTED
        bill.confirmed_by_user = True
        bill.save(update_fields=["validation_status", "confirmed_by_user"])
        return Response(BillDetailSerializer(bill, context={"request": request}).data)


class AutoPayRuleViewSet(viewsets.ModelViewSet):
    queryset = AutoPayRule.objects.order_by("-id")
    serializer_class = AutoPayRuleSerializer


class DashboardView(APIView):
    """GET /api/dashboard/?month=YYYY-MM - monthly overview (docs/API_V2.md §2)."""

    def get(self, request):
        month = request.query_params.get("month")
        if month and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            return Response({"code": "bad_month", "detail": "Luna trebuie să arate ca 2026-10."}, status=400)
        try:
            return Response(overview.dashboard(month))
        except overview.NoBills:
            return Response({"code": "no_bills", "detail": "Nu ai încă facturi. Scanează prima factură."}, status=404)


class SearchView(APIView):
    """GET /api/search/?q=ppc octombrie (+ provider/category/month/status params) - docs/API_V2.md §7."""

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()[:200]
        params = {k: request.query_params.get(k) for k in ("provider", "category", "month", "status")}
        if not q and not any(params.values()):
            return Response({"code": "empty_query", "detail": "Scrie ce cauți, de exemplu „PPC octombrie”."}, status=400)
        try:
            return Response(search.search(q, params))
        except search.BadMonth:
            return Response({"code": "bad_month", "detail": "Luna trebuie să arate ca 2026-10."}, status=400)


class VoiceSearchView(APIView):
    """POST /api/search/voice/ (multipart `audio`): Gemini writes down what was said, the search rules do the rest."""

    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [AskThrottle]

    def post(self, request):
        f = request.FILES.get("audio")
        if not f:
            return Response({"code": "no_audio", "detail": "Nu am primit nicio înregistrare."}, status=400)
        if f.size > file_checks.MAX_AUDIO_BYTES:
            return Response({"code": "audio_too_large",
                             "detail": "Înregistrarea e prea lungă. Spune pe scurt ce cauți (cel mult 30 de secunde)."},
                            status=400)
        data = f.read()
        mime = file_checks.sniff_audio(data)
        if not mime:
            return Response({"code": "unsupported_audio", "detail": "Nu pot citi înregistrarea asta. Încearcă din nou."},
                            status=400)
        names = sorted({p.bill.provider for p in overview.points()})
        try:
            heard = mock.voice_query() if settings.AI_MOCK else ai.transcribe_query(data, mime, names)
        except (ai.AIUnavailable, genai_errors.APIError) as e:
            return _ai_error_response(e)
        query = heard.query.strip()[:200]
        if not query:
            return Response({"code": "not_understood", "transcript": heard.transcript,
                             "detail": "N-am înțeles ce cauți. Încearcă: „factura PPC din octombrie”."}, status=422)
        result = search.search(query, transcript=heard.transcript.strip()[:300])
        if not result["filters"] or not any(result["filters"].values()):
            return Response({"code": "not_understood", "transcript": heard.transcript,
                             "detail": f"Am auzit „{heard.transcript}”, dar n-am înțeles ce factură cauți."}, status=422)
        return Response(result)


class ProvidersView(APIView):
    """GET /api/providers/ - one card per provider (docs/API_V2.md §3)."""

    def get(self, request):
        return Response(overview.providers())


class ProviderDetailView(APIView):
    """GET /api/providers/{slug}/ - history + discrepancies (docs/API_V2.md §4)."""

    def get(self, request, slug):
        try:
            return Response(overview.provider_history(slug))
        except overview.UnknownProvider:
            return Response({"code": "unknown_provider", "detail": f"Nu există furnizorul „{slug}”."}, status=404)


class ProviderArchiveView(APIView):
    """POST /api/providers/{slug}/archive/ puts a provider in the archive, DELETE takes it out (docs/API_V2.md §8).
    Only how the list looks: the bills, totals and history stay as they are. Answers the provider's card."""

    def _card(self, slug):
        return next((p for p in overview.providers() if p["slug"] == slug), None)

    def _unknown(self, slug):
        return Response({"code": "unknown_provider", "detail": f"Nu există furnizorul „{slug}”."}, status=404)

    def post(self, request, slug):
        if not self._card(slug):
            return self._unknown(slug)
        ArchivedProvider.objects.get_or_create(slug=slug)
        return Response(self._card(slug))

    def delete(self, request, slug):
        if not self._card(slug):
            return self._unknown(slug)
        ArchivedProvider.objects.filter(slug=slug).delete()
        return Response(self._card(slug))


# ---- original uploads and the bill as PDF (docs/API_V2.md §5) ----
# Plain Django views, not DRF: DRF content negotiation would answer 406 to a viewer that asks for application/pdf.


def _not_found(code: str, detail: str) -> JsonResponse:
    return JsonResponse({"code": code, "detail": detail}, status=404)


def _inline(resp: HttpResponse, name: str) -> HttpResponse:
    safe = re.sub(r'[^\w .()-]+', "_", name).strip() or "factura"
    resp["Content-Disposition"] = f'inline; filename="{safe}"'
    resp["Cache-Control"] = "private, max-age=300"
    resp["X-Content-Type-Options"] = "nosniff"
    return resp


@require_http_methods(["GET", "HEAD"])
def bill_pdf_view(request, pk: int):
    """GET/HEAD /api/bills/{id}/pdf/: original PDF, uploaded pages combined, or the rendered demo bill."""
    bill = Bill.objects.filter(pk=pk).first()
    if not bill:
        return _not_found("no_pdf", "Factura nu există.")
    try:
        data = billpdf.bill_pdf(bill)
    except billpdf.NoPdf:
        return _not_found("no_pdf", "PDF-ul acestei facturi nu e încă disponibil.")
    return _inline(HttpResponse(data, content_type="application/pdf"), billpdf.filename(bill))


@require_http_methods(["GET", "HEAD"])
def bill_file_view(request, pk: int, index: int):
    """GET/HEAD /api/bills/{id}/files/{index}/: one original uploaded page (photo or PDF), unchanged."""
    page = BillFile.objects.filter(bill_id=pk, order=index).first()
    if not page or not page.file or not page.file.storage.exists(page.file.name):
        return _not_found("no_file", "Fișierul nu există.")
    return _inline(FileResponse(page.file.open("rb"), content_type=page.mime), page.name or f"pagina-{index + 1}")
