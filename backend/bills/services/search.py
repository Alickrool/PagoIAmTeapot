"""Bill search for the search bar and voice search (docs/API_V2.md §7).

Rules only, no AI: "ppc octombrie", "factura de lumina de luna trecuta", "ce n-am platit" become filters
(provider, category, month, status). Voice search runs these same rules on what Gemini heard, so the model never
decides the filters itself.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass, field

from bills.models import Bill, BillFile, Category
from bills.services import overview, providers, ro
from bills.services.validation import current_month

MAX_RESULTS = 50

CATEGORY_WORDS = {
    Category.ELECTRICITY: ["lumina", "luminii", "curent", "curentul", "curentului", "electricitate", "electricitatii",
                           "energie", "energia", "energiei", "electrice", "electrica"],
    Category.GAS: ["gaz", "gaze", "gazul", "gazului", "gazelor"],
    Category.WATER: ["apa", "apei", "canal", "canalizare"],
    Category.TELECOM: ["internet", "internetul", "internetului", "telefon", "telefonul", "telefonului", "tv",
                       "televizor", "cablu", "mobil", "abonament"],
}
ELECTRIC_PHRASES = ["energie electrica", "energia electrica", "energiei electrice", "curent electric",
                    "curentul electric"]
CATEGORY_LABELS = {Category.ELECTRICITY: "Curent", Category.GAS: "Gaz", Category.WATER: "Apă",
                   Category.TELECOM: "Internet și telefon", Category.OTHER: "Altele"}

# Checked in this order: "nu am platit" must win over "platit".
STATUS_PHRASES = [
    ("unpaid", ["nu am platit", "n am platit", "neplatit", "neplatite", "neplatita", "neachitat", "neachitate",
                "de plata", "de platit", "restant", "restante", "restanta"]),
    ("review", ["de verificat", "cu probleme", "probleme", "problema", "anomalii", "anomalie", "greseli", "greseala",
                "suspecte", "suspecta", "atentie"]),
    ("paid", ["platit", "platite", "platita", "achitat", "achitate", "achitata"]),
]
STATUS_LABELS = {"unpaid": "Neplătite", "paid": "Plătite", "review": "De verificat"}

THIS_MONTH = ["luna asta", "luna aceasta", "luna curenta", "luna actuala", "luna aceea"]
LAST_MONTH = ["luna trecuta", "luna precedenta", "luna anterioara", "luna dinainte", "luna din urma"]

# Short forms people type. "mai" and "noi" are also everyday words ("ce mai am", "noi"), see _month_words.
MONTH_ABBR = {"ian": 1, "feb": 2, "mar": 3, "apr": 4, "iun": 6, "iul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10,
              "nov": 11, "dec": 12}
MONTH_LEAD = {"din", "in", "pe", "luna", "lui", "pentru", "de"}

# Words that never name a provider, so the misspelling matcher leaves them alone.
STOPWORDS = {"factura", "facturi", "facturile", "facturii", "facturilor", "arata", "aratami", "mi", "imi", "vreau",
             "sa", "vad", "ce", "cat", "cate", "am", "ai", "are", "de", "din", "la", "pe", "in", "si", "sau", "cu",
             "pentru", "mea", "meu", "mele", "toate", "tot", "luna", "lunii", "anul", "plata", "plati", "cauta",
             "gaseste", "deschide", "ultima", "ultimele", "nu", "mai", "noi", "este", "e", "a", "o", "un", "una",
             "lei", "suma", "total", "chitanta", "chitante", "bon", "dovada"}


class BadMonth(ValueError):
    pass


def fold(text: str) -> str:
    """Lowercase, no diacritics, only letters/digits/spaces and the / - of dates: "Lumină, n-am plătit" ->
    "lumina n am platit"."""
    s = unicodedata.normalize("NFD", (text or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"(?<=\d)[-/.](?=\d)", "/", s)  # keep 10/2026, 10.2026 and 2026-10 together
    s = re.sub(r"[^a-z0-9/]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _cut(text: str, phrase: str) -> tuple[bool, str]:
    """Remove a whole-word phrase from text; returns (found, rest)."""
    pattern = rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])"
    if re.search(pattern, text):
        return True, re.sub(r"\s+", " ", re.sub(pattern, " ", text, count=1)).strip()
    return False, text


def _shift(month: str, delta: int) -> str:
    y, m = map(int, month.split("-"))
    m += delta
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}"


@dataclass
class Filters:
    provider: str | None = None   # canonical name, "PPC"
    slug: str | None = None
    category: str | None = None
    month: str | None = None      # "2026-10"
    status: str | None = None     # unpaid | paid | review
    rest: str = ""                # words nothing understood
    _month_no_year: int | None = field(default=None, repr=False)

    def empty(self) -> bool:
        return not (self.slug or self.category or self.month or self.status)


def _month_words(text: str, f: Filters) -> str:
    """Romanian month names, short forms and an optional year next to them."""
    tokens = text.split()
    for i, tok in enumerate(tokens):
        number = None
        full = next((n for n, name in enumerate(ro.MONTHS, 1) if tok == name and tok != "mai"), None)
        if full:
            number = full
        elif tok in MONTH_ABBR:
            number = MONTH_ABBR[tok]
        elif tok in ("mai", "noi"):
            before = tokens[i - 1] if i > 0 else ""
            after = tokens[i + 1] if i + 1 < len(tokens) else ""
            if before in MONTH_LEAD or re.fullmatch(r"20\d\d", after):
                number = 5 if tok == "mai" else 11
        if not number:
            continue
        year = None
        if i + 1 < len(tokens) and re.fullmatch(r"20\d\d", tokens[i + 1]):
            year = int(tokens[i + 1])
            tokens[i + 1] = ""
        tokens[i] = ""
        if year:
            f.month = f"{year:04d}-{number:02d}"
        else:
            f._month_no_year = number
        break
    return " ".join(t for t in tokens if t)


def parse(text: str, known: dict[str, str]) -> Filters:
    """known: folded provider name/alias -> canonical provider name."""
    f = Filters()
    t = fold(text)

    # 1. Dates written with digits: 2026-10, 10/2026
    if m := re.search(r"(?<!\d)(20\d\d)[-/](\d{1,2})(?!\d)", t):
        y, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            f.month, t = f"{y:04d}-{mo:02d}", t.replace(m.group(0), " ")
    if not f.month and (m := re.search(r"(?<!\d)(\d{1,2})/(20\d\d)(?!\d)", t)):
        mo, y = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            f.month, t = f"{y:04d}-{mo:02d}", t.replace(m.group(0), " ")

    # 2. This month / last month
    if not f.month:
        for phrase in THIS_MONTH:
            found, t = _cut(t, phrase)
            if found:
                f.month = current_month()
                break
    if not f.month:
        for phrase in LAST_MONTH:
            found, t = _cut(t, phrase)
            if found:
                f.month = _shift(current_month(), -1)
                break

    # 3. Status, before providers: "neplatite" is not a provider
    for status, phrases in STATUS_PHRASES:
        for phrase in phrases:
            found, t = _cut(t, phrase)
            if found:
                f.status = f.status or status
                break
        if f.status:
            break

    # 3b. "energie electrica" is a kind of bill, not the provider Electrica
    for phrase in ELECTRIC_PHRASES:
        found, t = _cut(t, phrase)
        if found:
            f.category = Category.ELECTRICITY
            break

    # 4. Providers: longest alias first ("apa brasov" before "apa")
    for alias in sorted(known, key=len, reverse=True):
        found, t = _cut(t, alias)
        if found:
            f.provider = known[alias]
            break

    # 5. Month names
    if not f.month:
        t = _month_words(t, f)

    # 6. Category words
    for category, words in CATEGORY_WORDS.items():
        for w in words:
            found, t = _cut(t, w)
            if found:
                f.category = f.category or category
        if f.category:
            break

    # 7. A misspelled provider, as speech or fast typing gives it ("enji", "hidroelectica")
    if not f.provider:
        names = {a: c for a, c in known.items() if " " not in a and len(a) >= 3}
        for tok in t.split():
            if tok in STOPWORDS or len(tok) < 4 or tok.isdigit():
                continue
            close = difflib.get_close_matches(tok, names, n=1, cutoff=0.6)
            if close:
                f.provider = names[close[0]]
                t = re.sub(rf"(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])", " ", t, count=1)
                break

    if f.provider:
        f.slug = overview.slugify(f.provider)
        f.category = None  # the provider says it all ("factura de lumina PPC")
    f.rest = " ".join(w for w in t.split() if w not in STOPWORDS)
    return f


def known_providers(pts: list[overview.Point]) -> dict[str, str]:
    known = {fold(alias): canonical for alias, canonical in providers.KNOWN.items()}
    for p in pts:
        known[fold(p.bill.provider)] = p.bill.provider
        known[fold(p.slug.replace("-", " "))] = p.bill.provider
    return known


def _resolve_month(f: Filters, months: list[str]) -> None:
    """A month said without a year = the latest such month that has bills (else the one before CURRENT_MONTH)."""
    if f.month or not f._month_no_year:
        return
    suffix = f"-{f._month_no_year:02d}"
    have = [m for m in months if m.endswith(suffix)]
    if have:
        f.month = max(have)
        return
    cur = current_month()
    year = int(cur[:4]) - (1 if f"{cur[:4]}{suffix}" > cur else 0)
    f.month = f"{year:04d}{suffix}"


def _apply_params(f: Filters, params: dict, pts: list[overview.Point]) -> None:
    """Explicit filters (?provider=&category=&month=&status=) win over the text."""
    if slug := (params.get("provider") or "").strip().lower():
        f.slug = slug
        f.provider = next((p.bill.provider for p in pts if p.slug == slug), None) or \
            next((c for c in providers.KNOWN.values() if overview.slugify(c) == slug), slug)
        f.category = None
    if (category := params.get("category")) in Category.values:
        f.category = category
    if month := params.get("month"):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise BadMonth(month)
        f.month = month
    if (status := params.get("status")) in STATUS_LABELS:
        f.status = status


def _matches(p: overview.Point, f: Filters) -> bool:
    b = p.bill
    if f.slug and p.slug != f.slug:
        return False
    if f.category and b.category != f.category:
        return False
    if f.month and p.month != f.month:
        return False
    if f.status == "paid" and b.status != Bill.Status.PAID:
        return False
    if f.status == "unpaid" and b.status == Bill.Status.PAID:
        return False
    if f.status == "review" and p.audit_status == "ok" and b.validation_status != "needs_review":
        return False
    return True


def _chips(f: Filters) -> list[dict]:
    chips = []
    if f.slug:
        chips.append({"kind": "provider", "value": f.slug, "label": f.provider or f.slug})
    if f.category:
        chips.append({"kind": "category", "value": f.category, "label": CATEGORY_LABELS[f.category]})
    if f.month:
        chips.append({"kind": "month", "value": f.month, "label": ro.month_label(f.month)})
    if f.status:
        chips.append({"kind": "status", "value": f.status, "label": STATUS_LABELS[f.status]})
    return chips


def _row(p: overview.Point, with_files: set[int]) -> dict:
    b = p.bill
    return {
        "id": b.id, "provider": b.provider, "slug": p.slug, "category": b.category,
        "month": p.month, "month_label": ro.month_label(p.month),
        "period_start": b.period_start.isoformat(), "period_end": b.period_end.isoformat(),
        "due_date": b.due_date.isoformat() if b.due_date else None,
        "total": overview.money(b.total), "status": b.status,
        "paid_at": b.paid_at.isoformat() if b.paid_at else None,
        "audit_status": p.audit_status, "validation_status": b.validation_status,
        "has_pdf": b.source == Bill.Source.SEED or b.id in with_files or bool(b.file),
    }


def _target(f: Filters, results: list[dict]) -> dict | None:
    if len(results) == 1:
        return {"screen": "Bill", "id": results[0]["id"]}
    if not results:
        return None
    if f.slug:
        return {"screen": "Provider", "slug": f.slug, "provider": f.provider, "month": f.month}
    if f.month and not (f.category or f.status):
        return {"screen": "Overview", "month": f.month}
    return None


EXAMPLES = "Încearcă: „PPC octombrie”, „luna trecută” sau „neplătite”."


def _message(f: Filters, chips: list[dict], n: int) -> str:
    if f.empty():
        return f"N-am înțeles ce cauți. {EXAMPLES}"
    what = " · ".join(c["label"] for c in chips)
    if n == 0:
        return f"N-am găsit facturi pentru: {what}. Încearcă altă lună sau alt furnizor."
    count = "o factură" if n == 1 else ro.plural(n, "factură", "facturi")
    return f"Am găsit {count}: {what}."


def search(q: str = "", params: dict | None = None, transcript: str | None = None) -> dict:
    """The response of GET /api/search/ (and of POST /api/search/voice/ with `transcript`)."""
    params = params or {}
    pts = overview.points()
    f = parse(q, known_providers(pts)) if q else Filters()
    _apply_params(f, params, pts)
    _resolve_month(f, sorted({p.month for p in pts}))

    found = [] if f.empty() else [p for p in pts if _matches(p, f)]
    found.sort(key=lambda p: p.bill.provider.lower())
    found.sort(key=lambda p: p.month, reverse=True)
    found = found[:MAX_RESULTS]
    with_files = set(BillFile.objects.filter(bill_id__in=[p.bill.id for p in found])
                     .values_list("bill_id", flat=True))
    results = [_row(p, with_files) for p in found]
    chips = _chips(f)
    return {
        "query": q,
        "transcript": transcript,
        "filters": {"provider": f.provider, "slug": f.slug, "category": f.category, "month": f.month,
                    "status": f.status},
        "chips": chips,
        "target": _target(f, results),
        "message": _message(f, chips, len(results)),
        "results": results,
    }
