from django.urls import path
from rest_framework.routers import DefaultRouter

from bills.views import AutoPayRuleViewSet, BillViewSet, DashboardView

router = DefaultRouter()
router.register("bills", BillViewSet, basename="bill")
router.register("autopay-rules", AutoPayRuleViewSet, basename="autopay-rule")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    *router.urls,
]
