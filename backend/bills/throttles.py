"""Rate limits per device (docs/API_V2.md §6): protect the Gemini quota and the server.

Rates come from settings at request time (`SCAN_RATE`, `ASK_RATE`, e.g. "30/hour"); an empty rate turns the limit off.
"""

import math

from django.conf import settings
from rest_framework.exceptions import Throttled
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import exception_handler as drf_exception_handler

from bills.services.ro import minutes


class _SettingsRateThrottle(AnonRateThrottle):
    setting = ""

    def get_rate(self):
        return getattr(settings, self.setting, None) or None


class ScanThrottle(_SettingsRateThrottle):
    scope = "scan"
    setting = "SCAN_RATE"


class AskThrottle(_SettingsRateThrottle):
    scope = "ask"
    setting = "ASK_RATE"


def exception_handler(exc, context):
    """DRF's handler, with 429 in our {code, detail} shape and in Romanian."""
    response = drf_exception_handler(exc, context)
    if isinstance(exc, Throttled) and response is not None:
        wait = max(1, math.ceil((exc.wait or 60) / 60))
        response.data = {"code": "too_many_requests",
                         "detail": f"Prea multe cereri de pe acest telefon. Încearcă din nou peste {minutes(wait)}."}
    return response
