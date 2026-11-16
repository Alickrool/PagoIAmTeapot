from rest_framework.routers import DefaultRouter

from bills.views import AutoPayRuleViewSet, BillViewSet

router = DefaultRouter()
router.register("bills", BillViewSet, basename="bill")
router.register("autopay-rules", AutoPayRuleViewSet, basename="autopay-rule")

urlpatterns = router.urls
