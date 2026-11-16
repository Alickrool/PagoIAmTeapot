# API v2 – Scan, Monthly overview, Provider history

Contract for the three new app sections. Everything in [API.md](API.md) still applies (base URL, no auth,
money as **strings**, dates `YYYY-MM-DD`). Types on the app side: `mobile/src/api/types.ts`.

| # | Endpoint | Screen | Status |
|---|---|---|---|
| 1 | `POST /api/bills/scan/` (multi-file) | Scan tab | **change** to existing endpoint |
| 2 | `GET /api/dashboard/?month=YYYY-MM` | Overview tab (donut + month compare + history) | **new** |
| 3 | `GET /api/providers/` | Providers tab | **new** |
| 4 | `GET /api/providers/{slug}/` | Provider history screen | **new** |

The app already works without 2–4: until they exist (404) it computes the same JSON on the phone from
`GET /bills/` + `GET /bills/{id}/` (`mobile/src/api/derive.ts`). That file is a **reference implementation** of the
rules below (except `index_gap` and `new_line_item`, which need `index_old` / line items of older bills that the app
does not have); once the backend endpoints exist the app uses them automatically.

Example values below are illustrative.

Conventions used below:

- **month** = `period_end[:7]` of the bill (`"2026-10"`). A bill belongs to the month its period ends in.
- **slug** = lowercase provider name, non-alphanumerics → `-` (`"Apa Brasov"` → `"apa-brasov"`, `"PPC"` → `"ppc"`).
- **audit_status** is the same value as in `BillSummary` (`ok | warning | critical`). "Worst" means
  `critical > warning > ok`.
- Percentages are numbers rounded to 1 decimal (`45.3`), `null` when there is nothing to compare with
  (no previous value, or previous value is 0).

---

## 1. `POST /api/bills/scan/` – one bill from several files

One scan = **one bill**. The user can mix camera photos, gallery images and PDFs; the files are the pages of the
same bill, **in the order sent**.

**Request** – `multipart/form-data`, field **`files`** repeated (1–10 files):

```
files: page1.jpg  (image/jpeg)
files: page2.jpg  (image/jpeg)
files: annex.pdf  (application/pdf)
```

- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`.
- Max **10 files**, **10 MB per file**, **25 MB total**.
- Keep accepting the old single field **`file`** (backward compatible, same behaviour as 1 file).
- Suggested implementation: send all pages in **one** Claude message (images as `image` blocks, PDFs as `document`
  blocks, in order) with the existing `EXTRACTION_PROMPT`.
- Cache key: `sha256` of the concatenated file hashes in order, so re-sending the same pages is instant.

**Response** – unchanged: `BillDetail`. `201` = new bill created, `200` = same files already scanned (that bill).
`file_url` points to the first file (or a merged PDF if you build one).

**Errors** – always `{ "code": "...", "detail": "human readable message" }`; the app shows `detail`.

| HTTP | `code` | When |
|---|---|---|
| 400 | `no_files` | no `files` / `file` field |
| 400 | `too_many_files` | more than 10 |
| 400 | `unsupported_type` | type not in the list above (`detail` names the file) |
| 413 | `file_too_large` | a file > 10 MB or total > 25 MB |
| 422 | `not_a_bill` | model could not find a utility/telecom bill in the pages |
| 422 | `unreadable` | blurry / cut / too dark – ask for a better photo |

---

## 2. `GET /api/dashboard/?month=YYYY-MM` – monthly overview

`month` is optional; default = the **latest month that has bills**.

```json
{
  "month": "2026-10",
  "currency": "RON",
  "total": "931.59",
  "paid_total": "0.00",
  "unpaid_total": "931.59",
  "bills_count": 4,
  "audit_status": "critical",
  "previous_month": "2026-09",
  "previous_total": "597.03",
  "delta_pct": 56.0,
  "average_total": "703.12",
  "slices": [
    {
      "provider": "PPC",
      "slug": "ppc",
      "category": "electricity",
      "bill_id": 24,
      "total": "501.85",
      "share_pct": 53.9,
      "previous_total": "253.80",
      "delta_pct": 97.7,
      "status": "unpaid",
      "audit_status": "critical"
    }
  ],
  "months": [
    { "month": "2025-11", "total": "799.12", "bills_count": 4, "audit_status": "ok" },
    { "month": "2026-10", "total": "931.59", "bills_count": 4, "audit_status": "critical" }
  ]
}
```

| Field | Rule |
|---|---|
| `total` / `paid_total` / `unpaid_total` | sum of `total` of the month's bills (all / `status=paid` / everything else) |
| `audit_status` | worst `audit_status` among the month's bills |
| `previous_month`, `previous_total` | the closest earlier month that has bills; both `null` if none |
| `delta_pct` | `(total − previous_total) / previous_total × 100` |
| `average_total` | average of `months[].total` **excluding** the selected month |
| `slices` | one per bill of the month, **sorted by `total` desc** – the donut segments |
| `slices[].share_pct` | `slice.total / total × 100` |
| `slices[].previous_total`, `delta_pct` | same provider's bill in `previous_month` (`null` if it had none) |
| `months` | the last **12 months that have bills, up to and including the selected month**, **oldest first** – the history bar chart. Tapping a bar calls this endpoint with that `month`. |

`404` with `{ "code": "no_bills" }` if the user has no bills at all.

---

## 3. `GET /api/providers/` – provider list

One entry per provider, **sorted by `last_period_end` desc, then provider name**.

```json
[
  {
    "provider": "PPC",
    "slug": "ppc",
    "category": "electricity",
    "bills_count": 12,
    "last_bill_id": 24,
    "last_period_end": "2026-10-31",
    "last_total": "501.85",
    "average_total": "268.40",
    "trend_pct": 87.0,
    "audit_status": "critical",
    "anomalies_count": 3,
    "totals": ["246.62", "279.61", "...", "501.85"]
  }
]
```

| Field | Rule |
|---|---|
| `average_total` | average of the provider's bill totals **excluding the latest** |
| `trend_pct` | `(last_total − average_total) / average_total × 100` |
| `audit_status`, `anomalies_count` | from the **latest** bill's audit (`anomalies_count` counts `warning` + `critical`, not `info`) |
| `totals` | last 12 bill totals, **oldest first** – the sparkline on the card |

---

## 4. `GET /api/providers/{slug}/` – provider history + discrepancies

```json
{
  "provider": "PPC",
  "slug": "ppc",
  "category": "electricity",
  "currency": "RON",
  "consumption_unit": "kWh",
  "stats": {
    "average_total": "268.40",
    "min_total": "238.10",
    "max_total": "501.85",
    "sum_12m": "3454.27",
    "average_consumption": 181.5
  },
  "bills": [
    {
      "id": 24,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "total": "501.85",
      "consumption": 350.0,
      "index_old": 18250.0,
      "index_new": 18600.0,
      "index_type": "estimated",
      "unit_price": 1.434,
      "status": "unpaid",
      "audit_status": "critical",
      "delta_total_pct": 97.7,
      "delta_consumption_pct": 97.7,
      "anomalies": [
        { "id": "estimated_index", "severity": "critical", "title": "Estimated index" }
      ]
    }
  ],
  "discrepancies": [
    {
      "id": "consumption_jump:24",
      "bill_id": 24,
      "period_end": "2026-10-31",
      "type": "consumption_jump",
      "severity": "critical",
      "title": "Consumption doubled",
      "message": "350 kWh this month vs 177 kWh last month (+98%). The index was estimated.",
      "previous_value": 177.0,
      "current_value": 350.0,
      "unit": "kWh"
    }
  ]
}
```

- `bills`: the provider's bills, **newest first**, max 24.
- `bills[].unit_price` = `all_in_unit_price` (total ÷ consumption), `null` without consumption.
- `bills[].delta_*_pct`: vs the **previous bill of the same provider** (`null` for the oldest).
- `bills[].anomalies`: that bill's audit anomalies, short form (no message/actions – the app opens
  `GET /bills/{id}/` for details).
- `404 { "code": "unknown_provider" }` for an unknown slug.

### Discrepancy rules

Compare every bill with the **previous bill of the same provider**. `discrepancies` is sorted **newest first**,
then `critical` before `warning` before `info`. `id` = `"{type}:{bill_id}"` (stable, used as React key).

| `type` | Fires when | Severity |
|---|---|---|
| `total_jump` | total changed by **≥ 25%** | `warning` (≥ 50% → `critical`); a drop of ≥ 25% is `info` |
| `consumption_jump` | consumption changed by **≥ 30%** | `warning` (≥ 60% or index estimated → `critical`) |
| `price_change` | `unit_price` changed by **≥ 10%** | `warning` |
| `estimated_index` | `index_type == "estimated"` | `warning` (`critical` if consumption is also ≥ 30% above the provider average) |
| `index_gap` | `index_old` ≠ previous bill's `index_new` (both present, tolerance 0.5) | `critical` – billed twice or skipped consumption |
| `new_line_item` | a line `code` that none of the previous 3 bills had (e.g. a paid add-on) | `warning` |
| `missing_month` | gap of more than 1 month between two consecutive bills | `info` |

`title`/`message` are short, plain English with the real numbers (the app shows them as-is).
`previous_value` / `current_value` / `unit` are the numbers behind the message (`null` when not numeric, e.g.
`new_line_item` puts the line label in `message`).

---

## Checklist for the backend

- [ ] `scan`: accept `files` (repeated) + keep `file`; error body `{code, detail}`
- [ ] `GET /dashboard/`
- [ ] `GET /providers/`, `GET /providers/{slug}/` with the discrepancy rules
- [ ] tests: PPC October → `consumption_jump` + `estimated_index` critical; Digi → `new_line_item`;
      Engie → `total_jump`; Apa Brasov → no discrepancies
- [ ] tell the frontend when each endpoint is live (the app switches from its local fallback on its own)
