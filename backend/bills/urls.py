from django.urls import path
from rest_framework.routers import DefaultRouter

from bills.views import (AutoPayRuleViewSet, BillViewSet, DashboardView, ProviderDetailView, ProvidersView,
                         bill_file_view, bill_pdf_view)

router = DefaultRouter()
router.register("bills", BillViewSet, basename="bill")
router.register("autopay-rules", AutoPayRuleViewSet, basename="autopay-rule")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("bills/<int:pk>/pdf/", bill_pdf_view, name="bill-pdf"),
    path("bills/<int:pk>/files/<int:index>/", bill_file_view, name="bill-file"),
    path("providers/", ProvidersView.as_view(), name="providers"),
    path("providers/<slug:slug>/", ProviderDetailView.as_view(), name="provider-detail"),
    *router.urls,
]
