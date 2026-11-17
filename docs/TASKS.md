# Task split (2 people, parallel)

Deadline: **Tuesday 17 Nov, 13:00** (project hand-in), then demos 13:00–16:00.

Ownership: **Frontend = `mobile/`**, **Backend = `backend/` + `shared/fixtures/`**. Contracts are shared:
[API.md](API.md) (bills, ask, actions) and [API_V2.md](API_V2.md) (scan v2, dashboard, providers).

## Status (Mon 16 Nov ~13:45, after merging `feature/generations-ui` into `main`)

**Works end to end now:** seeded 12-month demo data, rule-based audit, all screens, mock AI, scan cache,
submit reading, line highlight boxes for text PDFs, fact-checked knowledge base, real-bill scanning with Gemini
(1–10 pages), 3 generation modes in the app, all frontend P0 tasks.
**Checked after the merge:** 27 backend tests, migrations, TypeScript, lint and the Android bundle all pass; the app's
submit-reading call and types match the backend.
**Test mode (Mon 14:05):** start the backend with `python manage.py dev`: every start deletes all bills of the
current month (`CURRENT_MONTH`, default 2026-10; seeded and scanned), older months stay, extraction cache stays.
**For the demo** the October scenarios are needed again: `python manage.py seed_demo` then `python manage.py dev --keep`.
**Backend texts are Romanian now** (B14), and Gemini overloads fall back to other models (B16).
**All API v2 endpoints are live** (scan v2, `/dashboard/`, `/providers/`, `/providers/{slug}/`). The app switches
from its on-phone fallback (`mobile/src/api/derive.ts`) automatically; `derive.ts` stays as the offline fallback.

## Frontend (React Native / Expo) – Person A

| # | P | Task | Status |
|---|---|---|---|
| A1 | P0 | Run in Expo Go (mock + real backend on LAN) | ✅ |
| A5 | P1 | History charts | ✅ Overview (donut, month compare, 12-month bars) + provider chart |
| A7 | P0 | Scan screen: camera/gallery/PDF, up to 10 pages, staged loader | ✅ |
| – | – | Overview + Providers tabs, provider history with discrepancies | ✅ on the real endpoints |
| A6 | **P0** | **Submit-reading modal** on the "Submit real reading" action → `POST /bills/{id}/reading/ {index_new}` (backend ready, see API.md), then show the returned bill and `recalculation.difference` ("−248.22 RON"). This is demo step 2. Also polish Dispute/Offers/AutoPay result | ✅ modal + recalculated bill (517,06 → 268,84 lei, 🔴 → 🟡); AutoPay result on screen |
| A3 | P0 | Pay button asks for confirmation when the audit is 🔴 ("This bill has an anomaly. Pay anyway?") | ✅ (works on web too) |
| A4 | P0 | Ask UX: suggested-question chips ("Why is VAT so high?", "What is Contribuție CfD?", "Why did it go up?"), answer card scrolls into view; style `sources` chips + `suggested_actions` | ✅ (Gemini still answers in English) |
| A2 | P1 | Pago look & feel pass over all screens | ✅ 3 generation modes (Gen Z / Millennials / Senior), Romanian UI |
| A8 | P2 | Original PDF page with highlight boxes from `line_items[].bbox` (backend ready; test with `samples/demo_ppc_2026_10.pdf`) | open |
| A9 | P2 | Small "scan → audit" badge animation | ✅ badge pops when the audit status changes |
| A11 | P1 | Generation modes from the "Pago pe generații" mockup: picker on first launch (saved), Gen Z dark + slang, Millennials budget ring, Senior large text + family share; interface switcher pill in every header | ✅ `src/mode.tsx`, `ModeSwitcher.tsx` |
| A10 | P1 | After B10/B11 are live: check Overview/Providers against the real endpoints, then delete nothing – keep `derive.ts` as offline fallback | ✅ real /dashboard/ and /providers/ match the app types; `derive.ts` stays as fallback |

## Backend (Django + Gemini) – Person B

| # | P | Task | Status |
|---|---|---|---|
| B2 | – | Knowledge base fact-check, 2026 tariffs, Engie scenario → electricity | ✅ |
| B5 | – | `POST /bills/{id}/reading/` | ✅ |
| B6 | – | bbox for text PDFs + text-first PDF extraction with vision fallback | ✅ |
| B10 | ✅ | `GET /dashboard/` live, same rules as `derive.ts`; newest bill per provider per month (re-scans don't double totals); `bad_month` / `no_bills` errors | Done |
| B11 | ✅ | `GET /providers/` and `/providers/{slug}/` live with all 7 discrepancy rules (incl. `index_gap`, `new_line_item`) and the API_V2 checklist tests | Done |
| B12 | ✅ | Scan v2 live: `files` (1–10) + legacy `file`, limits, `{code, detail}` errors, multi-page in one Gemini request (text if all PDFs have text), bbox pages across files, cache by file order. Verified live with a bill split into 2 photos | Done |
| B13 | ✅ | Extraction schema has `is_bill` + `readable`: a non-bill photo → 422 `not_a_bill`, a blurry bill → 422 `unreadable`, nothing saved. Verified live (shopping list, blurred bill, normal bill) | Done |
| B7 | P0 | Demo network: the phone could not reach the laptop on Wi-Fi (client isolation), a phone hotspot works. Before the demo: test on the Pago office Wi-Fi; if it fails, hotspot + `runserver 0.0.0.0:8000`; plan B `AI_MOCK=1` / app mock mode | hotspot ✅, office Wi-Fi open |
| B1 | P0 | `ai_check` passes on the demo PDF (text path) and a PNG photo (vision): all lines and totals exact, gemini-4-hydrogen ~10-14 s. Left: run on your real bills (redact name/address), then `prewarm_cache ../samples/*` | demo bills ✅; the real Digi scan read as June 2020 is now flagged `old_bill` (`revalidate`); check it against the paper bill |
| B3 | ✅ | 10 demo questions run live and reviewed: VAT now explained on the right base (bill math passed to the model), clean source labels (law/order or topic, never websites), Romanian number format, advice never contradicts the audit card; `unit_price` stores 6 decimals (CfD 0,000144). Answers 1–6 s | Done |
| B4 | P1 | Compare demo amounts with one of your real bills | open |
| B14 | ✅ | Romanian backend texts: audit cards + action labels, discrepancies, Gemini answers/sources/buttons, AutoPay reasons, all error `detail`s, offers disclaimer; amounts as "352,53 lei"; fixtures re-exported | Done |
| B16 | ✅ | Model `gemini-3.5-flash-lite` (extraction 4–10 s, Q&A 1–6 s, exact on the demo bills) with automatic fallback to `gemini-3.6-flash`, `gemini-4-hydrogen` on 503/429; clean 503 `ai_busy` / 502 `ai_error` instead of a 500 page | Done |
| B15 | – | Null text fields from Gemini stored as "" (fix from the frontend side during the merge) + regression test | ✅ |
| B17 | ✅ | Uploaded bills can be fetched and opened again: every page stored (`BillFile`, old scans migrated), `GET /bills/{id}/pdf/` per API_V2 §5 (original PDF / photos combined on A4 incl. HEIC / rendered demo bill, HEAD, 404 `no_pdf`), originals at `/bills/{id}/files/{n}/`, `files[]` + `pdf_url` in the bill, `?source=upload` list; files deleted with the bill | Done |
| B8 | P2 | Streaming `/ask` | open |

## Scan validation (Mon evening, hackathon scope)

Full plan: [SCAN_VALIDATION_PLAN.md](SCAN_VALIDATION_PLAN.md). For the hackathon we build only what shows in the demo
or is cheap; the contract is in [API_V2.md §6](API_V2.md). Idea for the pitch: **what the AI reads is a proposal,
rules in code decide**, and the bill is data, never instructions.

Decisions (the plan's §11 proposals, taken as-is for now):

- Reject only dangerous or broken files, impossible periods and duplicates; everything else is `needs_review`
  (saved, the user confirms).
- A bill belongs to the month of `period_end`; multi-month / regularization bills go whole into that month.
- Duplicates are searched only among scanned bills, never the seeded demo ones (else the demo scan would get 409).
- Hashes and the extraction cache use the original bytes, so pre-warmed caches keep working after photos are cleaned.
- Questions 4–10 of the plan's §11 (places of consumption, other people's bills, provider registry, ANAF, retention,
  auth): after the hackathon.

### Backend – Person B

| # | Task | Status |
|---|---|---|
| V1 | `services/validation/` + `Bill.validation_status` / `validation` / `confirmed_by_user` / `bill_number` (migration); `validation` in `BillDetail`, `validation_status` in `BillSummary` | ✅ fixtures re-exported |
| V2 | Period + month (§6.1): `assigned_month`, `is_current_month`, `future_period`, `old_bill`, `year_plausible`, `period_length`, `issue_after_period`, `due_after_issue`, reject `invalid_period` | ✅ |
| V3 | Amounts (§6.4): `lines_sum`, `vat_rate_allowed`, `vat_amount`, `total_range`, `total_positive`, `currency_ron` | ✅ |
| V4 | Duplicates (§6.6): `409 duplicate_bill` + `existing_bill_id` (provider + period + customer code / total, or bill number) | ✅ seeded bills never count |
| V5 | File safety (§4 F1–F9): type from magic bytes, pixel limit, photos re-saved without EXIF, password PDFs, PDFs with JavaScript/launch/embedded files, max 10 pages, parse timeout, random file names, `nosniff` | ✅ real provider PDFs and phone photos pass; PDFs locked only against editing are accepted |
| V6 | Prompt injection (§5 P1–P5, P8): fixed system rule, `<bill_text>` cleaned, field limits and cleaning, `suspicious_text` + regex → `prompt_injection_suspected`; no customer code / address in Q&A | ✅ |
| V7 | `POST /bills/{id}/confirm/`; DRF rate limits on scan/ask (`429 too_many_requests`) | ✅ `.env` `SCAN_RATE` / `ASK_RATE` |
| V8 | Tests for the §9 cases (mocked extraction, no Gemini), live e2e check, docs | ✅ 52 tests (tests now always use mock AI); `manage.py revalidate` for older scans |

### Frontend – Person A (after the contract above; backend fields arrive with V1)

| # | Task | Status |
|---|---|---|
| AV1 | `types.ts`: `BillDetail.validation`, `BillSummary.validation_status`, new error codes, `existing_bill_id` | ✅ `types.ts` + `parseApiError` (code, existing_bill_id) |
| AV2 | Scan result: toast "Am pus factura în septembrie 2026" when `is_current_month` is false (use the `not_current_month` message) | ✅ toast on the bill screen after the scan |
| AV3 | Bill screen: `warning` checks in one card with "E corect" → `POST /bills/{id}/confirm/`; `info` checks as small notes | ✅ `ValidationCard` |
| AV4 | `409 duplicate_bill` → "Ai scanat deja factura asta" + open `existing_bill_id`; `429` → show `detail` | ✅ opens the existing bill + toast; 429 shows `detail` |
| AV5 | Lists (home, provider history): a small mark on bills with `validation_status = needs_review` | ✅ "De verificat" on Acasă and provider history (statuses from `/bills/?all=1`) |

Out of scope for the hackathon (pitch it as the next step): provider registry with verified CUIs, customer name
check, login and per-user bills, ANAF online check, `PATCH` to correct fields, file retention, scan log.
**Before the demo:** rotate the Gemini key (it was pasted in a chat) and put the new one in `backend/.env`.

## Search + voice search (Tue morning, ~4 h)

A search bar above the tabs and a mic: "PPC octombrie", "factura de lumină de luna trecută", "ce n-am plătit".
Contract: [API_V2.md §7](API_V2.md). The backend understands the query (rules; Gemini only turns speech into text),
the app shows results and jumps to the screens we already have. Stays in Expo Go: `expo-audio`, no speech module.
If Gemini cannot read the phone's audio, the keyboard's own dictation mic types into the same field (demo still works).

**Demo line:** Senior mode → mic → "Arată-mi factura PPC din octombrie" → the PPC October bill opens (🔴 estimated index).
("lumină" alone finds Engie + PPC, both electricity, so it shows a list instead of jumping.)

### Backend – Person B

| # | Task | Status |
|---|---|---|
| S0 | Merge `frontend-final` into `main` | ✅ 66 backend tests green |
| S1 | Contract (API_V2 §7) + `shared/fixtures/search.json` for the app's mock mode | ✅ fixtures keyed by query (8 cases) |
| S2 | `services/search.py`: months, providers (aliases + misspellings), categories, status words → filters, chips, target, message | ✅ "mai"/"noi" count as months only after "din/în/luna…" or before a year |
| S3 | `GET /api/search/` | ✅ |
| S4 | `Bill.paid_at` (migration), set by `pay`, dates for paid demo bills, in serializers | ✅ run `migrate`; demo dates need `seed_demo` |
| S5 | `POST /api/search/voice/`: audio checks, Gemini speech → query, mock, rate limit (spike a real phone m4a first) | ✅ mock + tests; live check below |
| S6 | Tests + live e2e with a real voice clip | ✅ 10 tests (`tests_search.py`), 76 total; live Gemini on a WAV clip: "Arată-mi factura PPC din octombrie" → `PPC octombrie` in 2.2 s. Left: one m4a recorded by the phone (with F4) |

### Frontend – Person A

| # | Task | Status |
|---|---|---|
| F1 | Nav params: `Overview: {month?}`, `Provider: {slug, provider, month?}` (pre-select the month), new stack screen `Search: {q?, voice?}` | ✅ month jumps use `popTo` (back to the existing home, no second copy of the tabs) |
| F2 | `SearchBar` strip above the tabs (all 3 tabs): pill "Caută o factură…" + mic; per-mode `COPY` (Senior: bigger, mic first); search + mic icons | ✅ |
| F3 | `SearchScreen`: autofocus, 300 ms debounce → `api.search(q)`; chips (× drops a filter, call again with params); top action from `target`; rows grouped by month ("Plătită pe …" / "De plată", PDF button); empty state with example chips | ✅ rows are coloured whole (red anomaly / yellow warning) |
| F4 | Voice: `npx expo install expo-audio`, mic permission in `app.json`; tap to start/stop (auto-stop 15 s), listening animation, "Mă gândesc…"; `api.searchVoice(uri)` (multipart like `scanBill`); transcript into the field; jump to `target` with a toast of what was heard; errors show `detail` | ✅ iPhone records **16 kHz mono WAV**: live, Gemini understood WAV in seconds but gave an empty transcript for the same words as m4a / AAC (1–2 min). Android still m4a, see SEARCH_SYNC_REPORT.md |
| F5 | Mock mode: `api.search` filters `derive.toPoints` with `searchProviders()` + month names; mic hidden | ✅ `mobile/src/search.ts` ports `services/search.py` (also the 404 fallback); same filters/chips as all 8 cases in `search.json` |
| F6 | `paid_at` on the bill screen and provider rows; jest tests for search client, mock filter, SearchScreen | ✅ 71 new Jest tests (182 total) |

Cut order if late: F5 → demo `paid_at` dates → voice auto-jump (keep the list) → voice entirely (keyboard dictation).

## Provider archive (API_V2 §8)

| # | Task | Status |
|---|---|---|
| R1 (backend) | `POST` / `DELETE /api/providers/{slug}/archive/`, `archived` / `archived_at` on cards and history, archived last | ✅ `b65308d` |
| R2 (app) | Providers tab: closed "Arhivă · N" section at the bottom, grey cards "Arhivat pe …", tap opens the full history | ✅ |
| R3 (app) | History screen: "Mută în arhivă" with a question (per mode), banner "Arhivat pe … · facturile rămân aici", toast, "Scoate din arhivă" | ✅ |
| R4 (app) | `api.setProviderArchived`; mock mode / backend without §8 keep the archive on the phone (`src/archive.ts`); 17 Jest tests | ✅ see `docs/ARCHIVE_SYNC_REPORT.md` |

## Timeline

| When | Frontend | Backend |
|---|---|---|
| ~~Mon until 14:00~~ | ✅ A1–A7, A9–A11 | ✅ B2, B5, B6, B10–B12 |
| Mon 14:00–18:00 | A8 (original PDF with highlight boxes); scan 2–3 real bills from the phone and report what breaks | B14 (if agreed), B3 (Q&A quality/speed), B13 |
| **Mon 20:00** | **Integration checkpoint:** from the phone on the real backend: Overview + Providers, scan a 2-page real bill, submit reading on PPC, ask a question in each generation mode | |
| Mon evening | Polish what the checkpoint found | B1 on real bills, B4 |
| Tue 08:00–10:00 | Test on the Pago office Wi-Fi (B7) together; polish | `seed_demo` + `dev --keep` (October demo data back), pre-warm cache with every demo file |
| **Tue 10:00** | **Feature freeze.** Only bug fixes from here | |
| Tue 11:00–12:30 | Rehearse the 3-minute demo together twice, the second run fully from cache | |
| Tue 12:30 | Final commit, push, hand in | |

## Demo script (3 min)

1. **Overview tab** – "Today Pago shows a list and a Pay button. We added an auditor." Donut for October,
   +56% vs September, 🔴 overall. Badges: 🔴 PPC, 🟡 Engie, 🟡 Digi, 🟢 water.
   Tap the mode pill: same data as Gen Z / Millennials / Senior ("it speaks every customer's language").
2. **PPC 🔴** – "Billed 350 kWh on an *estimated* index vs your usual 177. Don't pay yet." → *Submit real reading*
   (index + 182) → 🔴 disappears, total drops by ~248 RON; what's left is 🟡 "price above market" → *Compare offers*.
3. **Engie 🟡** (electricity, parents' flat) – "+42% but consumption only +8%: the fixed-price offer expired,
   0.55 → 0.88 lei/kWh." Tap the VAT line → AI explains with the real numbers and the 21% VAT; tap
   "Contribuție CfD" → "what is this?".
4. **Providers tab → Digi** – history shows the new paid line 6 months ago: "15 RON/month, 90 RON so far."
   → *Cancel this option* → ready-to-send letter.
5. **Smart Auto-Pay** – "Pay automatically only under 250 RON and never on estimated index." → simulate → blocked,
   with reasons.
6. **Scan tab, live** – 2 photos of a real paper bill (or `demo_ppc_2026_10.pdf`) → extracted and audited
   (instant from cache).
6b. **Anomalies caught on a scan** (files from `make_sample_pdfs`, already cached):
   - `demo_apa_brasov_2026_10_scumpa.pdf` – water was 🟢 a second ago. Same consumption, water price
     5,71 → 14,90 lei/m3 → 🟡 "a crescut cu 86%, dar consumul chiar a scăzut; prețul apei s-a schimbat de la 5,71 la
     14,9 lei/m3"; Furnizori → Apa Brasov: 🔴 "Factura a crescut" (+86%) and "Prețul pe unitate a crescut" (+89%).
   - `demo_apa_brasov_2026_09_modificata.pdf` – the September bill with only the total raised by hand
     (+100 lei) → "De verificat": "Rândurile facturii adună 73,38 lei, dar totalul citit e 173,38 lei." The line for
     the pitch: **the AI reads, the rules check the bill's own math.** Then "E corect" is the user's call.
   - Rehearsing again: `seed_demo` first (a second scan of a *different* edit of the same bill gets 409 duplicate;
     the same file again just reopens the bill). Do not scan the original `demo_apa_brasov_2026_10.pdf` before the
     expensive one: same bill number → 409.
7. **Business** – retention (users open Pago for advice, not only to pay) + lead generation (switch-supplier
   commissions).

## Git

- Work on `main`, or on a short branch that is merged the same day. `git pull --rebase` before every push.
- Contract change = the contract doc (`API.md` / `API_V2.md`) + `mobile/src/api/types.ts` +
  `backend/bills/serializers.py` + `export_fixtures`, in one commit.
- Never commit real bills, `.env` files, or Expo QR codes.
