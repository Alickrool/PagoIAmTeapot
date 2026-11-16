# API v2 – Scan, Monthly overview, Provider history

Contract for the three new app sections. Everything in [API.md](API.md) still applies (base URL, no auth,
money as **strings**, dates `YYYY-MM-DD`). Types on the app side: `mobile/src/api/types.ts`.

| # | Endpoint | Screen | Status |
|---|---|---|---|
| 1 | `POST /api/bills/scan/` (multi-file) | Scan tab | ✅ **live** |
| 2 | `GET /api/dashboard/?month=YYYY-MM` | Overview tab (donut + month compare + history) | ✅ **live** |
| 3 | `GET /api/providers/` | Providers tab | ✅ **live** |
| 4 | `GET /api/providers/{slug}/` | Provider history screen | ✅ **live** |
| 5 | `GET /api/bills/{id}/pdf/` | Bill screen: "Vezi factura (PDF)" | ✅ **live** |
| 6 | Scan validation: `validation` in `BillDetail`, `POST /api/bills/{id}/confirm/` | Scan result + bill screen | ✅ **live** (app side: AV-tasks in [TASKS.md](TASKS.md)) |

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

- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `application/pdf`.
  If the phone sends `application/octet-stream`, the file extension decides.
- Max **10 files**, **10 MB per file**, **25 MB total**.
- Keep accepting the old single field **`file`** (backward compatible, same behaviour as 1 file).
- Suggested implementation: send all pages in **one** Gemini request (images and PDFs as inline parts,
  in order) with the existing `EXTRACTION_PROMPT`.
- Cache key: `sha256` of the concatenated file hashes in order, so re-sending the same pages is instant
  (one file: the file's own `sha256`, so caches pre-warmed per file still match). Other order = new scan.
- Backend: if every file is a PDF with a text layer, their text goes to Gemini as text in one request;
  otherwise all pages go as images/PDFs in one request. `line_items[].bbox.page` counts pages across files
  (a photo = 1 page; photos never get boxes).

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
| 503 | `ai_busy` | every Gemini model is overloaded or rate-limited – try again in a minute |
| 502 | `ai_error` | any other Gemini error |
| 400 | `image_too_large` | a photo over 50 megapixels or 8000 px on a side (§6) |
| 400 | `encrypted_pdf` | a PDF that needs a password to open (§6) |
| 400 | `suspicious_file` | a PDF with JavaScript, launch actions, embedded files or XFA forms (§6) |
| 400 | `too_many_pages` | more than 10 pages across all files (§6) |
| 400 | `unreadable_file` | a corrupt file that can't be opened (§6) |
| 422 | `invalid_extraction` | the model returned something impossible (over 60 lines, total out of range) (§6) |
| 422 | `invalid_period` | period start after period end (§6) |
| 409 | `duplicate_bill` | the same bill was already scanned from other photos; body also has `existing_bill_id` (§6) |
| 429 | `too_many_requests` | too many scans / questions from this device; `detail` says when to retry |

`/bills/{id}/ask/` and `/bills/{id}/dispute/` return the same `ai_busy` / `ai_error` bodies. All `detail` texts are Romanian.
Every scanned bill now carries a `validation` block (§6).

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

`404` with `{ "code": "no_bills" }` if the user has no bills at all. `400 { "code": "bad_month" }` if `month`
is not `YYYY-MM`; a well-formed month without bills falls back to the latest month (same as `derive.ts`).

**One bill per provider per month (backend):** if a month has two bills of the same provider (e.g. a seeded bill
scanned again in the demo), only the newest counts, so totals are never doubled. Same rule for `/providers/`.

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

Backend details (same as `derive.ts` where both compute a rule):
- `consumption_jump` downwards (≤ −30%) is `info`; `estimated_index` compares with the average of all the
  provider's bills.
- `index_gap`: `previous_value` = previous `index_new`, `current_value` = this `index_old`, `unit` = `"index"`.
- `new_line_item`: one entry per new line, `id` = `"new_line_item:{bill_id}:{line_code}"` (still unique);
  `current_value` = the line amount **with VAT** (matches the audit card), `unit` = `"RON"`.
- `bills[].anomalies` is filled for every bill (not only the latest).

`title`/`message` are short, plain English with the real numbers (the app shows them as-is).
`previous_value` / `current_value` / `unit` are the numbers behind the message (`null` when not numeric, e.g.
`new_line_item` puts the line label in `message`).

---

## 5. `GET /api/bills/{id}/pdf/` – the bill as a PDF ✅ live

The bill screen has a "Vezi factura (PDF)" button. The app first sends `HEAD /api/bills/{id}/pdf/`; on 200 it opens
the same URL (`GET`) in the phone's browser / PDF viewer, otherwise it shows "PDF-ul acestei facturi nu e încă
disponibil." If `file_url` already ends in `.pdf`, the app opens that directly.

- **Response:** `200`, `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<provider>-<YYYY-MM>.pdf"`.
- **Uploaded PDF** (one file) → the original file, unchanged.
- **Uploaded photos / several files** → the pages combined into one PDF, in upload order (images scaled to A4, EXIF
  rotation applied).
- **Seeded / demo bills** → render it with the same code as `make_sample_pdfs` (so every bill has a PDF in the demo).
- **HEAD** must answer like GET without the body (Django does this for GET views automatically).
- **404** `{ "code": "no_pdf", "detail": "..." }` when there is nothing to show.
- Optional: cache the generated PDF next to the upload so a second tap is instant. ✅ (combined uploads are cached;
  rendered demo bills are not, because submitting a reading changes their lines)

### Original uploads (backend addition)

- `BillDetail.files`: `[{index, name, mime, url}]`, every uploaded page in upload order; `url` =
  `GET /api/bills/{id}/files/{index}/` → the original photo/PDF, unchanged, `Content-Disposition: inline`
  (`HEAD` works; `404 {code: "no_file"}`).
- `BillDetail.pdf_url`: absolute URL of `/api/bills/{id}/pdf/` (the app can use it instead of building the URL).
- `GET /api/bills/?source=upload`: every scanned bill, newest scan first (`BillSummary` now also has `source` and
  `created_at`). `?source=seed` = only demo bills.
- Deleting a bill (also the `manage.py dev` test reset) deletes its files from disk.

## 6. Scan validation ✅ live

Hackathon scope of [SCAN_VALIDATION_PLAN.md](SCAN_VALIDATION_PLAN.md) (see the V-tasks in [TASKS.md](TASKS.md)).
What the model extracts is a proposal: deterministic rules in the backend check it before the bill is saved.

Three outcomes:

- **rejected**: nothing is saved, the scan answers with an error from the §1 table (dangerous or broken file,
  impossible period, duplicate bill).
- **needs_review**: the bill is saved and audited as usual, but at least one check is a `warning`. The app shows the
  warnings with "E corect" (→ `POST /confirm/`); correcting fields comes later.
- **accepted**: no warnings (there may be `info` checks, e.g. the bill is for another month).

**`BillDetail.validation`** (every bill; seeded demo bills are `accepted` with no checks):

```json
"validation": {
  "status": "needs_review",
  "assigned_month": "2026-09",
  "is_current_month": false,
  "confirmed_by_user": false,
  "checks": [
    { "id": "not_current_month", "severity": "info", "field": "period_end",
      "message": "Factura e pentru septembrie 2026, am pus-o în luna ei." },
    { "id": "vat_amount", "severity": "warning", "field": "line_items.vat",
      "message": "TVA-ul citit (61,18 lei) nu se potrivește cu 21% din restul facturii (58,02 lei). Verifică poza." }
  ]
}
```

- `status`: `accepted | needs_review` (a rejected scan is never saved). After `confirm` it is `accepted` and
  `confirmed_by_user` is `true`; the checks stay so the screen can still show them.
- `assigned_month` = `period_end[:7]`, the same month rule as everywhere else. `is_current_month` compares it with the
  backend's current month (`CURRENT_MONTH` in the demo, 2026-10).
- `severity`: `info` (show as a note), `warning` (= needs_review: the user confirms). `message` is Romanian, with the
  real numbers; show it as-is.
- `BillSummary` (`GET /bills/`) gets `validation_status` so lists can mark bills that need a look.

**Check ids** (stable, the app may key icons on them):

| id | severity | when |
|---|---|---|
| `not_current_month` | info | the bill is for another month; it is saved in its own month |
| `future_period` | warning | period ends more than 5 days after today |
| `old_bill` | warning | period ended more than 24 months ago |
| `year_plausible` | warning | year before 2015 or after next year (a misread year) |
| `period_length` | info / warning | 41–366 days = multi-month bill, saved whole in the month of `period_end` (info); under 7 or over 366 days (warning) |
| `issue_after_period` | info | issued more than 3 days before the period ends |
| `due_after_issue` | info | due before it was issued, or more than 60 days after |
| `lines_sum` | warning | the lines don't add up to the total (± max(1 leu, 1%)) |
| `vat_rate_allowed` | warning | VAT rate not a Romanian rate (0, 5, 9, 11, 19, 21) |
| `vat_amount` | warning | the VAT line is not the VAT rate of the other lines (± max(1 leu, 2%)) |
| `total_range` | warning | total over 20 000 lei |
| `total_positive` | info | total zero or negative: credit note / regularization |
| `currency_ron` | warning | currency is not RON |
| `prompt_injection_suspected` | warning | the document contains text that tries to give the AI instructions |

**`POST /api/bills/{id}/confirm/`** (no body) → `200` + `BillDetail` with `validation.status = "accepted"`,
`confirmed_by_user = true`.

**`409 duplicate_bill`**: `{ "code": "duplicate_bill", "detail": "Ai scanat deja factura asta.", "existing_bill_id": 581 }`.
Same provider + same period (± 2 days) + same customer code or same total, or the same bill number, among scanned
bills (seeded demo bills are not compared, so the demo scan still works). The app opens `existing_bill_id`.
Re-sending the very same files still answers `200` with the old bill, as before.

**File safety** (before any AI call): the real type comes from the file's first bytes (a JPEG named `.pdf` is read as
a JPEG; an `.exe` named `.jpg` is `unsupported_type`); photos are re-saved without EXIF/GPS metadata; stored files get
random names. **Prompt injection**: the document is data, never instructions (fixed system rule, cleaned text,
limits on every field); suspicious text gives the `prompt_injection_suspected` warning, the numbers are still read
from the document.

**Rate limits**: `POST /scan/` and `POST /ask/` are limited per device (defaults 30 and 120 per hour, `.env`
`SCAN_RATE` / `ASK_RATE`) → `429 too_many_requests`.

**Bills scanned before validation existed**: `python manage.py revalidate` runs the rules again on their stored
extraction (no Gemini). An impossible period on an old scan becomes a warning there, never a deletion.

## Checklist for the backend

- [x] `GET /bills/{id}/pdf/` (§5): original PDF, combined photos, or rendered demo bill; 404 `no_pdf`

- [x] `scan`: accept `files` (repeated) + keep `file`; error body `{code, detail}`
      (`not_a_bill` / `unreadable` come from the model's `is_bill` / `readable` flags; nothing is saved)
- [x] `GET /dashboard/`
- [x] `GET /providers/`, `GET /providers/{slug}/` with the discrepancy rules
- [x] tests: PPC October → `consumption_jump` + `estimated_index` critical; Digi → `new_line_item`;
      Engie → `total_jump`; Apa Brasov → no discrepancies
- [ ] tell the frontend when each endpoint is live (the app switches from its local fallback on its own)
