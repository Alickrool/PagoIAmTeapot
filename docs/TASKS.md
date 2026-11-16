# Task split (2 people, parallel)

Deadline: **Tuesday 17 Nov, 13:00** (project hand-in), then demos 13:00–16:00.

Ownership: **Frontend = `mobile/`**, **Backend = `backend/` + `shared/fixtures/`**. Contracts are shared:
[API.md](API.md) (bills, ask, actions) and [API_V2.md](API_V2.md) (scan v2, dashboard, providers).

## Status (Mon 16 Nov, after merging `frontend` into `main`)

**Works end to end now:** seeded 12-month demo data, rule-based audit, all screens, mock AI, scan cache,
submit reading, line highlight boxes for text PDFs, fact-checked knowledge base.
**The app's v2 screens (Overview, Providers) currently compute their data on the phone** (`mobile/src/api/derive.ts`)
because the backend returns 404 for `/dashboard/` and `/providers/`. As soon as the backend endpoints exist the app
switches to them automatically. No app change needed.

## Frontend (React Native / Expo) – Person A

| # | P | Task | Status |
|---|---|---|---|
| A1 | P0 | Run in Expo Go (mock + real backend on LAN) | ✅ |
| A5 | P1 | History charts | ✅ Overview (donut, month compare, 12-month bars) + provider chart |
| A7 | P0 | Scan screen: camera/gallery/PDF, up to 10 pages, staged loader | ✅ |
| – | – | Overview + Providers tabs, provider history with discrepancies | ✅ (on local fallback until B10/B11) |
| A6 | **P0** | **Submit-reading modal** on the "Submit real reading" action → `POST /bills/{id}/reading/ {index_new}` (backend ready, see API.md), then show the returned bill and `recalculation.difference` ("−248.22 RON"). This is demo step 2. Also polish Dispute/Offers/AutoPay result | open |
| A3 | P0 | Pay button asks for confirmation when the audit is 🔴 ("This bill has an anomaly. Pay anyway?") | open |
| A4 | P0 | Ask UX: suggested-question chips ("Why is VAT so high?", "What is Contribuție CfD?", "Why did it go up?"), answer card scrolls into view; style `sources` chips + `suggested_actions` | open |
| A2 | P1 | Pago look & feel pass over all screens | partly (theme, categories, avatars) |
| A8 | P2 | Original PDF page with highlight boxes from `line_items[].bbox` (backend ready; test with `samples/demo_ppc_2026_10.pdf`) | open |
| A9 | P2 | Small "scan → audit" badge animation | open |
| A10 | P1 | After B10/B11 are live: check Overview/Providers against the real endpoints, then delete nothing – keep `derive.ts` as offline fallback | waiting for backend |

## Backend (Django + Gemini) – Person B

| # | P | Task | Status |
|---|---|---|---|
| B2 | – | Knowledge base fact-check, 2026 tariffs, Engie scenario → electricity | ✅ |
| B5 | – | `POST /bills/{id}/reading/` | ✅ |
| B6 | – | bbox for text PDFs + text-first PDF extraction with vision fallback | ✅ |
| B10 | ✅ | `GET /dashboard/` live, same rules as `derive.ts`; newest bill per provider per month (re-scans don't double totals); `bad_month` / `no_bills` errors | Done |
| B11 | **P0** | `GET /providers/` and `GET /providers/{slug}/` with the discrepancy rules (API_V2 §3–4), including `index_gap` and `new_line_item` that the app can't compute + the tests from the API_V2 checklist | open |
| B12 | ✅ | Scan v2 live: `files` (1–10) + legacy `file`, limits, `{code, detail}` errors, multi-page in one Gemini request (text if all PDFs have text), bbox pages across files, cache by file order. Verified live with a bill split into 2 photos | Done |
| B13 | P1 | `not_a_bill` / `unreadable` (422): add `is_bill` + `readable` to the extraction schema. (HEIC needs no conversion: Gemini accepts it, the backend already allows it) | open |
| B7 | P0 | LAN hosting from both phones (`runserver 0.0.0.0:8000`, firewall), plan B `AI_MOCK=1` | open |
| B1 | P0 | `ai_check` passes on the demo PDF (text path) and a PNG photo (vision): all lines and totals exact, gemini-4-hydrogen ~10-14 s. Left: run on your real bills (redact name/address), then `prewarm_cache ../samples/*` | demo bills ✅, real bills open |
| B3 | P0 | ~10 demo questions, tune `ASK_SYSTEM`. First answer (Engie VAT) is correct and well-sourced but takes ~7 s: try a faster model for Q&A only (`gemini-3.5-flash-lite` answered a ping in 0.8 s) | started |
| B4 | P1 | Compare demo amounts with one of your real bills | open |
| B8 | P2 | Streaming `/ask` | open |

## Timeline

| When | Frontend | Backend |
|---|---|---|
| Mon until 18:00 | A6, A3, A4 | B12, B10, B11 |
| Mon 18:00–20:00 | A2 polish, A10 as endpoints land | B13, B7 |
| **Mon 20:00** | **Integration checkpoint:** from the phone on the real backend: Overview + Providers from real endpoints, scan a 2-page bill, submit reading on PPC | |
| Mon evening | A8 | B1, B3 with the Gemini key |
| Tue 08:00–10:00 | Polish | Pre-warm cache with every demo file, B4 |
| **Tue 10:00** | **Feature freeze.** Only bug fixes from here | |
| Tue 11:00–12:30 | Rehearse the 3-minute demo together twice, the second run fully from cache | |
| Tue 12:30 | Final commit, push, hand in | |

## Demo script (3 min)

1. **Overview tab** – "Today Pago shows a list and a Pay button. We added an auditor." Donut for October,
   +56% vs September, 🔴 overall. Badges: 🔴 PPC, 🟡 Engie, 🟡 Digi, 🟢 water.
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
7. **Business** – retention (users open Pago for advice, not only to pay) + lead generation (switch-supplier
   commissions).

## Git

- Work on `main`, or on a short branch that is merged the same day. `git pull --rebase` before every push.
- Contract change = the contract doc (`API.md` / `API_V2.md`) + `mobile/src/api/types.ts` +
  `backend/bills/serializers.py` + `export_fixtures`, in one commit.
- Never commit real bills, `.env` files, or Expo QR codes.
