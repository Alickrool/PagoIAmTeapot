"""Scan validation (docs/API_V2.md §6, docs/SCAN_VALIDATION_PLAN.md).

What the model extracts is a proposal. Deterministic rules here decide whether it is saved (`accepted` /
`needs_review`) or rejected (`Rejected`, rendered as {code, detail} by the scan view). Validation runs before the audit.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date

from django.conf import settings


@dataclass
class Check:
    id: str
    severity: str  # "info" | "warning"
    field: str
    message: str  # Romanian, with the real numbers

    def as_dict(self) -> dict:
        return asdict(self)


def info(id: str, field: str, message: str) -> Check:
    return Check(id, "info", field, message)


def warning(id: str, field: str, message: str) -> Check:
    return Check(id, "warning", field, message)


class Rejected(Exception):
    """The scan is refused and nothing is saved. `extra` goes into the error body (e.g. existing_bill_id)."""

    def __init__(self, code: str, detail: str, status: int = 400, extra: dict | None = None):
        super().__init__(detail)
        self.code, self.detail, self.status, self.extra = code, detail, status, extra or {}


@dataclass
class ValidationResult:
    checks: list[Check] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "needs_review" if any(c.severity == "warning" for c in self.checks) else "accepted"

    def as_json(self) -> dict:
        """What Bill.validation stores. `not_current_month` is not stored: it depends on the day it is read."""
        return {"checks": [c.as_dict() for c in self.checks if c.id != "not_current_month"]}


def today() -> date:
    return date.today()


def current_month() -> str:
    """The app's "this month": settings.CURRENT_MONTH in the demo (2026-10), else the real month."""
    return getattr(settings, "CURRENT_MONTH", "") or today().strftime("%Y-%m")


def validate_bill(extracted, document_text: str = "") -> ValidationResult:
    """All business rules for an extracted bill. Raises Rejected for impossible data (invalid_period)."""
    from bills.services.validation import amounts, injection, period

    result = ValidationResult()
    result.checks += period.check(extracted)
    result.checks += amounts.check(extracted)
    result.checks += injection.check(extracted, document_text)
    return result
