"""Search bar + voice search (docs/API_V2.md §7). Demo data: Engie and PPC (both electricity), Digi (telecom),
Apa Brasov (water); one bill a month each, Nov 2025 - Oct 2026; October is unpaid."""

import io
from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from bills.models import Bill
from bills.services import ai
from bills.services.validation import files as file_checks

M4A = b"\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00M4A mp42isom" + b"\x00" * 200


@override_settings(AI_MOCK=True, SCAN_RATE=None, ASK_RATE=None, CURRENT_MONTH="2026-10")
class SearchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=io.StringIO())

    def setUp(self):
        self.client = APIClient()

    def search(self, q="", **params):
        r = self.client.get("/api/search/", {"q": q, **params} if q else params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_queries(self):
        cases = [
            # query, slug, category, month, status, number of results (None = don't check)
            ("ppc octombrie", "ppc", None, "2026-10", None, 1),
            ("PPC", "ppc", None, None, None, 12),
            ("factura de lumină din septembrie", None, "electricity", "2026-09", None, 2),  # Engie + PPC
            ("factura de lumina din septembrie", None, "electricity", "2026-09", None, 2),
            ("luna trecută", None, None, "2026-09", None, 4),
            ("luna asta", None, None, "2026-10", None, 4),
            ("neplătite", None, None, None, "unpaid", 4),
            ("ce n-am plătit", None, None, None, "unpaid", 4),
            ("ce mai am de plată", None, None, None, "unpaid", 4),
            ("facturi plătite în august", None, None, "2026-08", "paid", 4),
            ("curent 2026-03", None, "electricity", "2026-03", None, 2),
            ("gaz", None, "gas", None, None, 0),
            ("enji", "engie", None, None, None, 12),
            ("Apa Brașov aprilie", "apa-brasov", None, "2026-04", None, 1),
            ("apă", None, "water", None, None, 12),
            ("digi 10/2026", "digi", None, "2026-10", None, 1),
            ("factura din mai", None, None, "2026-05", None, 4),
            ("energie electrică noiembrie 2025", None, "electricity", "2025-11", None, 2),
            ("apă ianuarie", None, "water", "2026-01", None, 1),
            ("internet", None, "telecom", None, None, 12),
            ("enel decembrie", "ppc", None, "2025-12", None, 1),
            ("orange", "orange", None, None, None, 0),
            ("ppc martie 2020", "ppc", None, "2020-03", None, 0),
        ]
        for q, slug, category, month, status, n in cases:
            with self.subTest(q=q):
                body = self.search(q)
                f = body["filters"]
                self.assertEqual((f["slug"], f["category"], f["month"], f["status"]), (slug, category, month, status))
                if n is not None:
                    self.assertEqual(len(body["results"]), n)

    def test_targets_and_rows(self):
        body = self.search("ppc octombrie")
        ppc_oct = Bill.objects.get(provider="PPC", period_end__month=10, period_end__year=2026)
        self.assertEqual(body["target"], {"screen": "Bill", "id": ppc_oct.id})
        row = body["results"][0]
        self.assertEqual((row["month"], row["month_label"], row["status"], row["paid_at"], row["has_pdf"]),
                         ("2026-10", "octombrie 2026", "unpaid", None, True))
        self.assertEqual(body["message"], "Am găsit o factură: PPC · octombrie 2026.")
        self.assertEqual([c["kind"] for c in body["chips"]], ["provider", "month"])

        body = self.search("PPC")
        self.assertEqual(body["target"], {"screen": "Provider", "slug": "ppc", "provider": "PPC", "month": None})
        self.assertEqual(body["results"][0]["month"], "2026-10")  # newest first
        self.assertEqual(body["results"][1]["paid_at"], "2026-10-16")  # paid demo bills have a date

        self.assertEqual(self.search("luna trecută")["target"], {"screen": "Overview", "month": "2026-09"})
        self.assertIsNone(self.search("neplătite")["target"])

    def test_nothing_understood_or_found(self):
        body = self.search("bla bla")
        self.assertEqual((body["results"], body["target"], body["chips"]), ([], None, []))
        self.assertIn("N-am înțeles", body["message"])
        body = self.search("orange")
        self.assertIn("N-am găsit facturi pentru: Orange", body["message"])

    def test_params_drop_chips(self):
        body = self.search(provider="ppc", month="2026-10")
        self.assertEqual(len(body["results"]), 1)
        body = self.search("ppc octombrie", month="2026-09")  # params win
        self.assertEqual(body["filters"]["month"], "2026-09")
        self.assertEqual(self.client.get("/api/search/", {"month": "10-2026"}).json()["code"], "bad_month")
        self.assertEqual(self.client.get("/api/search/").json()["code"], "empty_query")

    def test_review_status(self):
        body = self.search("de verificat")
        self.assertEqual(body["filters"]["status"], "review")
        self.assertTrue(body["results"])
        self.assertTrue(all(r["audit_status"] != "ok" or r["validation_status"] == "needs_review"
                            for r in body["results"]))

    def test_pay_sets_paid_at(self):
        bill = Bill.objects.get(provider="Engie", period_end__month=10, period_end__year=2026)
        r = self.client.post(f"/api/bills/{bill.id}/pay/", {"mode": "manual"}, format="json")
        self.assertEqual(r.json()["status"], "paid")
        self.assertEqual(self.client.get(f"/api/bills/{bill.id}/").json()["paid_at"], date.today().isoformat())
        row = self.search("engie octombrie")["results"][0]
        self.assertEqual((row["status"], row["paid_at"]), ("paid", date.today().isoformat()))

    # ---- voice ----

    def voice(self, data, name="voice.m4a"):
        return self.client.post("/api/search/voice/", {"audio": SimpleUploadedFile(name, data)}, format="multipart")

    def test_voice_mock(self):
        r = self.voice(M4A)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["transcript"], "Factura PPC din octombrie")
        self.assertEqual(body["target"]["screen"], "Bill")

    def test_voice_rejects(self):
        self.assertEqual(self.client.post("/api/search/voice/", {}, format="multipart").json()["code"], "no_audio")
        self.assertEqual(self.voice(b"MZ\x90\x00 not audio").json()["code"], "unsupported_audio")
        big = M4A + b"\x00" * file_checks.MAX_AUDIO_BYTES
        self.assertEqual(self.voice(big).json()["code"], "audio_too_large")

    @override_settings(AI_MOCK=False)
    def test_voice_gemini_answers(self):
        with patch.object(ai, "transcribe_query",
                          return_value=ai.VoiceQuery(transcript="Arată-mi factura de lumină de luna trecută",
                                                     query="factura de lumină luna trecută")) as call:
            body = self.voice(M4A).json()
        self.assertEqual(call.call_args.args[1], "audio/mp4")
        self.assertIn("PPC", call.call_args.args[2])  # provider names as spelling hints
        self.assertEqual((body["filters"]["category"], body["filters"]["month"]), ("electricity", "2026-09"))
        self.assertEqual(body["transcript"], "Arată-mi factura de lumină de luna trecută")

        with patch.object(ai, "transcribe_query", return_value=ai.VoiceQuery(transcript="Bună ziua", query="")):
            r = self.voice(M4A)
        self.assertEqual((r.status_code, r.json()["code"]), (422, "not_understood"))
        with patch.object(ai, "transcribe_query", side_effect=ai.AIUnavailable()):
            self.assertEqual(self.voice(M4A).status_code, 503)

    def test_audio_sniff(self):
        self.assertEqual(file_checks.sniff_audio(M4A), "audio/mp4")
        self.assertEqual(file_checks.sniff_audio(b"RIFF\x00\x00\x00\x00WAVEfmt "), "audio/wav")
        self.assertEqual(file_checks.sniff_audio(b"OggS\x00\x02"), "audio/ogg")
        self.assertEqual(file_checks.sniff_audio(b"\x1aE\xdf\xa3\x01"), "audio/webm")
        self.assertIsNone(file_checks.sniff_audio(b"\x00\x00\x00\x18ftypheic"))  # a photo is not audio
        self.assertIsNone(file_checks.sniff_audio(b"%PDF-1.7"))


class GeminiTimeoutTests(TestCase):
    """An overloaded model must not hold a request for minutes (docs/API_V2.md §7, voice 'loads forever')."""

    def _fake(self, behaviour):
        from types import SimpleNamespace

        calls = []

        def generate(model, contents, config):
            calls.append((model, config.http_options.timeout))
            return behaviour(model)

        return SimpleNamespace(models=SimpleNamespace(generate_content=generate)), calls

    def test_each_attempt_has_a_deadline_and_hangs_fall_through(self):
        import httpx2
        from types import SimpleNamespace

        def behaviour(model):
            if model == "slow":
                raise httpx2.ReadTimeout("no answer")
            return SimpleNamespace(text='{"transcript": "PPC", "query": "PPC"}')

        fake, calls = self._fake(behaviour)
        with override_settings(GEMINI_MODEL="slow", GEMINI_FALLBACK_MODELS=["fast"]), \
                patch.object(ai, "gemini_client", return_value=fake):
            v = ai.transcribe_query(M4A, "audio/mp4", ["PPC"])
        self.assertEqual(v.query, "PPC")
        self.assertEqual([m for m, _ in calls], ["slow", "fast"])  # a slow model is not tried twice
        self.assertTrue(all(t <= ai.BUDGETS["voice"][1] * 1000 for _, t in calls))

    def test_budget_ends_the_call(self):
        from google.genai import errors

        def behaviour(model):
            raise errors.ServerError(504, {"error": {"code": 504, "message": "deadline", "status": "DEADLINE_EXCEEDED"}})

        fake, calls = self._fake(behaviour)
        clock = iter(range(0, 1000, 8))  # every look at the clock: 8 s later
        with override_settings(GEMINI_MODEL="a", GEMINI_FALLBACK_MODELS=["b", "c", "d", "e"]), \
                patch.object(ai, "gemini_client", return_value=fake), \
                patch.object(ai.time, "monotonic", side_effect=lambda: next(clock)):
            with self.assertRaises(ai.AIUnavailable):
                ai.transcribe_query(M4A, "audio/mp4", [])
        self.assertLess(len(calls), 6)  # stopped by the 25 s budget, not by running out of models

    def test_quota_is_not_retried_on_the_same_model(self):
        from google.genai import errors

        def behaviour(model):
            raise errors.ClientError(429, {"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}})

        fake, calls = self._fake(behaviour)
        with override_settings(GEMINI_MODEL="a", GEMINI_FALLBACK_MODELS=["b"]), \
                patch.object(ai, "gemini_client", return_value=fake):
            with self.assertRaises(ai.AIUnavailable):
                ai.transcribe_query(M4A, "audio/mp4", [])
        self.assertEqual([m for m, _ in calls], ["a", "b"])


@override_settings(AI_MOCK=True, SCAN_RATE=None, ASK_RATE=None, CURRENT_MONTH="2026-10")
class ProviderArchiveTests(TestCase):
    """docs/API_V2.md §8: archiving only changes how the provider list looks."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=io.StringIO())

    def setUp(self):
        self.client = APIClient()

    def slugs(self):
        return [(p["slug"], p["archived"]) for p in self.client.get("/api/providers/").json()]

    def test_archive_and_back(self):
        before = self.slugs()
        self.assertFalse(any(a for _, a in before))
        dashboard = self.client.get("/api/dashboard/").json()

        r = self.client.post("/api/providers/ppc/archive/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["archived"])
        self.assertIsNotNone(r.json()["archived_at"])
        self.assertEqual(self.slugs()[-1], ("ppc", True))  # at the bottom
        self.assertTrue(self.client.get("/api/providers/ppc/").json()["archived"])
        self.assertEqual(self.client.post("/api/providers/ppc/archive/").status_code, 200)  # twice is fine

        # Nothing else changes: bills, history, dashboard, search
        self.assertEqual(self.client.get("/api/dashboard/").json()["total"], dashboard["total"])
        self.assertEqual(len(self.client.get("/api/providers/ppc/").json()["bills"]), 12)
        self.assertEqual(len(self.client.get("/api/search/", {"q": "ppc"}).json()["results"]), 12)

        r = self.client.delete("/api/providers/ppc/archive/")
        self.assertEqual((r.status_code, r.json()["archived"], r.json()["archived_at"]), (200, False, None))
        self.assertEqual(self.slugs(), before)

    def test_unknown_provider(self):
        for method in (self.client.post, self.client.delete):
            r = method("/api/providers/orange/archive/")
            self.assertEqual((r.status_code, r.json()["code"]), (404, "unknown_provider"))

    def test_seed_demo_clears_the_archive(self):
        self.client.post("/api/providers/digi/archive/")
        call_command("seed_demo", stdout=io.StringIO())
        self.assertFalse(any(a for _, a in self.slugs()))
