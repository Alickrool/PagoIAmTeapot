# Pago Bill Audit

Pago AI Hackathon, Brașov, 16–17 Nov 2026 – *"Make it different"*.

Before you press **Pay**, an AI auditor reads the bill, explains it, and catches what's wrong:

1. **Zero-input scan** – photo/PDF of any utility or telecom bill → structured data (Gemini).
2. **Automatic audit** – 🟢 Normal / 🟡 Attention / 🔴 Anomaly badges: estimated index, price-driven increases,
   paid add-ons you forgot about, above-market price, penalties. Rule-based, so every number is exact.
3. **Tap-to-ask** – tap any line ("Contribuție cogenerare", "TVA") or ask a question; the answer uses your numbers
   and a curated knowledge base of Romanian regulations (ANRE tariffs, VAT changes, price caps).
4. **One-tap actions** – contest the bill (ready-to-send letter), cancel an add-on, compare cheaper suppliers,
   Smart Auto-Pay with safety limits.

Task split and demo script: [docs/TASKS.md](docs/TASKS.md). API: [docs/API.md](docs/API.md), new screens: [docs/API_V2.md](docs/API_V2.md).

## Structure

```
backend/   Django + DRF + Gemini (google-genai)  (bills app: models, audit rules, AI services, seed data)
mobile/    Expo (React Native, TypeScript), React Navigation, runs in Expo Go
shared/    fixtures exported from the real API, used by the app's mock mode and by the mock /scan
docs/      API contract, task split
```

## Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # put GEMINI_API_KEY in it (never in .env.example!); empty = mock AI
python manage.py ai_check         # live test of the key: one extraction + one question
python manage.py migrate
python manage.py seed_demo        # resets the DB with the demo scenarios
python manage.py make_sample_pdfs # fictional PDF invoices of the demo bills -> samples/
python manage.py prewarm_cache ../samples/*   # optional: cache Gemini extraction of demo bills
python manage.py dev              # TEST session: empties the current month (CURRENT_MONTH, default 2026-10), then serves on 0.0.0.0:8000
python manage.py dev --keep       # same server, no reset (use for the demo, after seed_demo)
python manage.py revalidate       # re-run the scan validation rules on already scanned bills (no Gemini)
python manage.py test bills       # demo scenarios + scan validation must stay green (always mock AI)
```

Every scan is validated before it is saved (docs/API_V2.md §6): file safety, period/month, amounts and VAT,
duplicates, prompt-injection checks. Scans and questions are rate-limited per device (`SCAN_RATE`, `ASK_RATE`).

## Run the app

```bash
cd mobile
npm install
copy .env.example .env            # set EXPO_PUBLIC_API_URL to your laptop's LAN IP, or EXPO_PUBLIC_MOCK=1
npx expo start                    # scan the QR code with Expo Go
```

## Notes

- All seeded bills, offers, and county averages are **fictional demo data**.
- `backend/bills/knowledge/romania_utilities.md` was fact-checked on 16 Nov 2026; every fact carries its source.
- LLM: Gemini, model `GEMINI_MODEL` (default `gemini-3.5-flash-lite`: fast, exact on the demo bills). When it is overloaded (503)
  or rate-limited (429) the backend retries `GEMINI_FALLBACK_MODELS` in order; if all fail the API answers 503 `ai_busy`.
  All calls are in `backend/bills/services/ai.py`.
- User-facing texts produced by the backend (audit, discrepancies, AI answers, errors) are Romanian, like the app.
  Code, comments and docs stay English.
- Gemini free tier: Google's terms forbid sending sensitive personal data to unpaid services, so test with the demo PDFs and redact your own bills.
