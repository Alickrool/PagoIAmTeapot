# API contract

Base URL: `http://<laptop-ip>:8000/api`. JSON everywhere, no auth (single demo user).
Source of truth for shapes: `backend/bills/serializers.py` ↔ `mobile/src/api/types.ts`.
Real example responses: `shared/fixtures/*.json` (regenerate with `python manage.py export_fixtures`).
New endpoints for the Scan / Overview / Providers screens: [API_V2.md](API_V2.md).

**Rule:** whoever changes a response shape updates this file, `types.ts`, and re-exports fixtures in the same commit.

## Bills

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/bills/` | – | `BillSummary[]`, latest bill per provider (`?all=1` for every bill) |
| GET | `/bills/{id}/` | – | `BillDetail` (line items + audit + 12-month history) |
| POST | `/bills/scan/` | multipart `files` (repeated, 1–10 pages of one bill) or `file` (jpeg/png/webp/heic/pdf) | `BillDetail` – 201 new bill; 200 if the same files were already scanned (returns that bill). Details and errors: [API_V2.md §1](API_V2.md) |
| POST | `/bills/{id}/ask/` | `{question?, line_item_id?}` (at least one) | `{question, line_item, answer, sources[], suggested_actions[]}` |
| POST | `/bills/{id}/dispute/` | `{anomaly_id?}` | `{to, subject, body}` – complaint letter in Romanian |
| POST | `/bills/{id}/reading/` | `{index_new}` (meter index, must be > `index_old`) | `BillDetail` + `recalculation` – see below; 400 `{detail}` on a bad index |
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

## Ask response

```json
{
  "question": "Why is VAT so high?",
  "line_item": null,
  "answer": "VAT is 21% of everything else on the bill...",
  "sources": ["Your bill", "Law 141/2025 (VAT 21%)"],
  "suggested_actions": [{"type": "switch_supplier", "label": "Compare offers"}]
}
```

`sources` → chips under the answer. `suggested_actions` use the same `type` values as anomaly actions (never `ask`).

## Submit reading response

The full recalculated `BillDetail` (index_type becomes `"self"`, audit re-run) plus:

```json
"recalculation": {
  "previous_total": 517.06, "new_total": 268.84, "difference": -248.22,
  "previous_consumption": 350, "new_consumption": 182, "unit": "kWh"
}
```

For gas the meter counts m³ and the bill kWh: consumption = (index_new − index_old) × 10.5.
Demo tip: PPC `index_old` + 182 → the 🔴 estimated-index anomaly disappears (PPC stays 🟡 for the above-market price).

## Notes

- **Highlight boxes:** for PDFs with a text layer, `line_items[].bbox = {page, x, y, w, h}` (page 1-based,
  coordinates 0..1 of the page, origin top-left). `null` for photos and scanned PDFs.
- **Extraction method** (visible in Django admin → Extraction caches): `text` (PDF text layer sent as text, cheapest),
  `vision` (photo / scanned PDF), `vision_fallback` (text result didn't add up to the total, retried as an image).

- **Scan cache:** extractions are cached by `sha256(file)` in `ExtractionCache`, which `seed_demo` does not wipe.
  Pre-warm demo bills with `python manage.py prewarm_cache ../samples/*` → the live scan is instant and identical
  every time.

- Money fields from Django `DecimalField` arrive as **strings** (`"297.50"`). Use `Number()`.
- With no `GEMINI_API_KEY` (or `AI_MOCK=1`) `scan/ask/dispute` return canned answers prefixed with `[mock]`;
  the audit is always real (it is rule-based, no AI).
