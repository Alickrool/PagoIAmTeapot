# API contract

Base URL: `http://<laptop-ip>:8000/api`. JSON everywhere, no auth (single demo user).
Source of truth for shapes: `backend/bills/serializers.py` ↔ `mobile/src/api/types.ts`.
Real example responses: `shared/fixtures/*.json` (regenerate with `python manage.py export_fixtures`).

**Rule:** whoever changes a response shape updates this file, `types.ts`, and re-exports fixtures in the same commit.

## Bills

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/bills/` | – | `BillSummary[]`, latest bill per provider (`?all=1` for every bill) |
| GET | `/bills/{id}/` | – | `BillDetail` (line items + audit + 12-month history) |
| POST | `/bills/scan/` | multipart `file` (jpeg/png/webp/pdf) | `BillDetail` (201) – AI extraction, then audit |
| POST | `/bills/{id}/ask/` | `{question?, line_item_id?}` (at least one) | `{question, line_item, answer}` |
| POST | `/bills/{id}/dispute/` | `{anomaly_id?}` | `{to, subject, body}` – complaint letter in Romanian |
| GET | `/bills/{id}/offers/` | – | `{current_all_in_price, unit, offers[], disclaimer}` |
| POST | `/bills/{id}/pay/` | `{mode: "manual" \| "auto"}` | `{status: "paid" \| "blocked", reasons[]}` |

`mode=auto` simulates Smart Auto-Pay: checks the provider's active rule (limit, estimated index, critical anomaly).

## Auto-pay rules

| Method | Path | Body |
|---|---|---|
| GET/POST | `/autopay-rules/` | `{provider, max_amount, block_if_estimated, block_if_anomaly}` |
| GET/PUT/PATCH/DELETE | `/autopay-rules/{id}/` | |

## Audit object (inside `BillDetail.audit`)

```json
{
  "status": "ok | warning | critical",
  "anomalies": [{
    "id": "estimated_index | price_spike | extra_service:<code> | above_market | penalty | above_county_average",
    "severity": "info | warning | critical",
    "title": "Estimated index",
    "message": "You were billed on an estimated index (350 kWh vs your usual 177.2 kWh). Don't pay yet...",
    "line_item_codes": ["energy"],
    "evidence": {"...": "numbers behind the message"},
    "actions": [{"type": "submit_reading | dispute | switch_supplier | cancel_service | autopay_rule | ask", "label": "..."}]
  }]
}
```

Badges: `ok` → 🟢 Normal, `warning` → 🟡 Attention, `critical` → 🔴 Anomaly. `info` never changes the badge.

## Notes

- Money fields from Django `DecimalField` arrive as **strings** (`"297.50"`). Use `Number()`.
- `line_items[].bbox` is `null` for now (stretch goal: highlight boxes on the original document, normalized 0..1).
- With no `ANTHROPIC_API_KEY` (or `AI_MOCK=1`) `scan/ask/dispute` return canned answers prefixed with `[mock]`;
  the audit is always real (it is rule-based, no AI).
