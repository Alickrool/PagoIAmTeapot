# Task split (2 people, parallel)

Deadline: **Tuesday 17 Nov, 13:00** (project hand-in), then demos 13:00–16:00.
Working skeleton already runs end to end: seeded demo data, rule-based audit, mock AI, all 5 screens.
Your job is to make it real, accurate, and good-looking.

Ownership: **Frontend = `mobile/`**, **Backend = `backend/` + `shared/fixtures/`**. Do not edit the other person's folder
without telling them; `docs/API.md` is shared (see the rule at its top).

## Frontend (React Native / Expo) – Person A

Priority order. P0 = needed for the demo, P1 = makes it win, P2 = only if time is left.

| # | P | Task | Done when |
|---|---|---|---|
| A1 | P0 | Run the app in Expo Go with `EXPO_PUBLIC_MOCK=1`, then against the backend on the LAN | Home shows 4 bills with 🟢🟡🔴 from the real API |
| A2 | P0 | Pago look & feel: brand colours in `src/theme.ts`, provider logos/initials, home like Pago's bill list | Looks like a Pago screen, not a template |
| A3 | P0 | Bill screen: clear hierarchy (total → badges → anomaly cards → lines), highlighted lines visibly tappable. **Pay button asks for confirmation when the audit is 🔴** ("This bill has an anomaly. Pay anyway?") | A stranger understands it in 5 s |
| A4 | P0 | Ask UX: suggested-question chips ("Why is VAT so high?", "What is cogeneration?", "Why did it go up?"), loading state, answer card that scrolls into view. Answer already shows `sources` chips and `suggested_actions` buttons (basic) – make them look good | Tap a chip → answer visible without scrolling |
| A5 | P1 | 12-month history bar chart from `bill.history` (`react-native-svg`, works in Expo Go); estimated months in red | Chart on the PPC bill shows the spike |
| A6 | P1 | Action screens polish: Dispute (edit + mailto/share), Offers, AutoPay result screen (not just an Alert), **submit-reading modal → `POST /bills/{id}/reading/` (backend ready)**, show `recalculation.difference` ("−240.88 RON") | Every anomaly button leads somewhere sensible |
| A7 | P0 | Scan flow as its own screen: camera/gallery/PDF, then a **staged loader** that cycles "Reading your bill… → Comparing with your history… → Checking for anomalies…" (~10–20 s uncached, instant when cached), error state, then land on the bill | Scanning a real bill photo works on the phone |
| A8 | P2 | Interactive document: show the original PDF page (`file_url`) with highlight boxes from `line_items[].bbox` (backend ready for PDFs with a text layer; test with `samples/demo_ppc_2026_10.pdf`) | Tapping a box asks about that line |
| A9 | P2 | Small "scan → audit" animation on the badges (the demo wow moment) | |

## Backend (Django + Claude) – Person B

| # | P | Task | Done when |
|---|---|---|---|
| B1 | P0 | Collect 3–4 **real** bills (your own Engie/PPC/Hidroelectrica/Digi PDFs/photos) in `samples/`; `python manage.py make_sample_pdfs` adds fictional demo PDFs of the seeded "bad" bills. Once the API key arrives (`backend/.env`): `prewarm_cache ../samples/*`, check totals/lines, tune `EXTRACTION_PROMPT` in `services/ai.py`. Delete the bill's row in `ExtractionCache` (Django admin) to re-run after a prompt change | Totals and line items match the paper bill on every test bill |
| B2 | ✅ | Knowledge base checked 16 Nov against ANAF/ANRE/press, every fact tagged with its source; demo tariffs set to 2026 values; Engie scenario moved from gas to electricity (gas is capped at 0.31 lei/kWh until March 2027) | Done. If a Pago mentor corrects a fact, fix it in `romania_utilities.md` |
| B3 | P0 | Ask quality: run ~10 demo questions (tap each PPC/Engie line + free text), tune `ASK_SYSTEM`; keep answers short and tied to the numbers | Answers are correct and < 5 s |
| B4 | P0 | Make the demo bills realistic: compare `seed_demo.py` amounts with a real bill of the same supplier; adjust if a juror from Pago would spot nonsense | |
| B5 | ✅ | `POST /bills/{id}/reading/ {index_new}` → recalculated bill + `recalculation` | Done, tested |
| B6 | ✅ | `line_items[].bbox` for PDFs with a text layer (pdfplumber), plus text-first extraction for those PDFs with vision fallback | Done, tested (Claude calls mocked) |
| B7 | P0 | Demo hosting: run `runserver 0.0.0.0:8000` on the laptop, test from both phones; **pre-warm every demo file** with `python manage.py prewarm_cache ../samples/*`; plan B = `AI_MOCK=1` + fixtures | Works on the Pago office Wi-Fi; demo scans are instant |
| B8 | P2 | Streaming answers for `/ask` (SSE) | |
| B9 | P2 | More rules: penalty detection on real bills, "regularization" detection, gas m³→kWh sanity check | |

## Timeline

| When | Frontend | Backend |
|---|---|---|
| Mon until 18:00 | A1, A2, A3 | B2, B4 (no API key needed) |
| Mon 18:00–20:00 | A7, A4 | B7 (LAN hosting), help the frontend integrate |
| **Mon 20:00** | **Integration checkpoint:** scan a demo PDF from the phone against the real API (mock AI is fine), end to end | |
| Mon evening | A5, A6 | API key → B1, B3 |
| Tue 08:00–10:00 | Polish (+ A8) | Pre-warm cache with every demo file |
| **Tue 10:00** | **Feature freeze.** Only bug fixes from here | |
| Tue 11:00–12:30 | Rehearse the 3-minute demo together twice, the second run fully from cache | |
| Tue 12:30 | Final commit, push, hand in | |

## Demo script (3 min)

1. **Home** – "Today Pago shows 4 bills and a Pay button. We added an auditor." Three badges: 🔴 PPC, 🟡 Engie, 🟡 Digi, 🟢 water.
2. **PPC 🔴** – "Billed 350 kWh on an *estimated* index vs your usual 177. Don't pay yet." → *Submit real reading* (index + 182) → 🔴 disappears, total drops by ~240 RON; what's left is 🟡 "price above market" → *Compare offers*.
3. **Engie 🟡** (electricity, parents' flat) – "+42% but consumption only +8%: the fixed-price offer expired, 0.55 → 0.88 lei/kWh." Tap the VAT line → AI explains with the real numbers and the 21% VAT; tap "Contribuție CfD" → "what is this?".
4. **Digi 🟡** – "15 RON/month for an add-on added 6 months ago, 90 RON so far." → *Cancel this option* → ready-to-send letter.
5. **Smart Auto-Pay** – "Pay automatically only under 250 RON and never on estimated index." → simulate → blocked, with reasons.
6. **Live scan** – photo of a real paper bill → extracted and audited in ~15 s.
7. **Business slide/sentence** – retention (users open Pago for advice, not only to pay) + lead generation (switch-supplier commissions).

## Git

- Small commits, only inside your folder. `git pull --rebase` before every push.
- Contract change = `docs/API.md` + `mobile/src/api/types.ts` + `backend/bills/serializers.py` + `export_fixtures`, one commit.
