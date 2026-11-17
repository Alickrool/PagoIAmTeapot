// Search rules on the phone (docs/API_V2.md §7). Used in mock mode and when the backend has no /search/ yet (404).
// A port of backend/bills/services/search.py: the backend is the reference, keep the two in step.
import { slugify, type Point } from './api/derive';
import type { Category, SearchChip, SearchInput, SearchResponse, SearchResult, SearchStatus, SearchTarget } from './api/types';
import { RO_PROVIDERS } from './providersRo';

export const MAX_RESULTS = 50;

export const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/** "2026-10" -> "octombrie 2026" */
export const monthLabelRo = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const CATEGORY_WORDS: [Category, string[]][] = [
  ['electricity', ['lumina', 'luminii', 'curent', 'curentul', 'curentului', 'electricitate', 'electricitatii', 'energie', 'energia', 'energiei', 'electrice', 'electrica']],
  ['gas', ['gaz', 'gaze', 'gazul', 'gazului', 'gazelor']],
  ['water', ['apa', 'apei', 'canal', 'canalizare']],
  ['telecom', ['internet', 'internetul', 'internetului', 'telefon', 'telefonul', 'telefonului', 'tv', 'televizor', 'cablu', 'mobil', 'abonament']],
];
const ELECTRIC_PHRASES = ['energie electrica', 'energia electrica', 'energiei electrice', 'curent electric', 'curentul electric'];
export const CATEGORY_LABELS: Record<Category, string> = { electricity: 'Curent', gas: 'Gaz', water: 'Apă', telecom: 'Internet și telefon', other: 'Altele' };

// Checked in this order: "nu am platit" must win over "platit".
const STATUS_PHRASES: [SearchStatus, string[]][] = [
  ['unpaid', ['nu am platit', 'n am platit', 'neplatit', 'neplatite', 'neplatita', 'neachitat', 'neachitate', 'de plata', 'de platit', 'restant', 'restante', 'restanta']],
  ['review', ['de verificat', 'cu probleme', 'probleme', 'problema', 'anomalii', 'anomalie', 'greseli', 'greseala', 'suspecte', 'suspecta', 'atentie']],
  ['paid', ['platit', 'platite', 'platita', 'achitat', 'achitate', 'achitata']],
];
export const STATUS_LABELS: Record<SearchStatus, string> = { unpaid: 'Neplătite', paid: 'Plătite', review: 'De verificat' };

const THIS_MONTH = ['luna asta', 'luna aceasta', 'luna curenta', 'luna actuala', 'luna aceea'];
const LAST_MONTH = ['luna trecuta', 'luna precedenta', 'luna anterioara', 'luna dinainte', 'luna din urma'];
const MONTH_ABBR: Record<string, number> = { ian: 1, feb: 2, mar: 3, apr: 4, iun: 6, iul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_LEAD = new Set(['din', 'in', 'pe', 'luna', 'lui', 'pentru', 'de']);
const STOPWORDS = new Set(
  ('factura facturi facturile facturii facturilor arata aratami mi imi vreau sa vad ce cat cate am ai are de din la pe in si sau cu ' +
    'pentru mea meu mele toate tot luna lunii anul plata plati cauta gaseste deschide ultima ultimele nu mai noi este e a o un una ' +
    'lei suma total chitanta chitante bon dovada').split(' '),
);

export const EXAMPLES = ['PPC octombrie', 'luna trecută', 'neplătite', 'de verificat'];
const TRY = 'Încearcă: „PPC octombrie”, „luna trecută” sau „neplătite”.';

/** Lowercase, no diacritics, only letters/digits/spaces and the / of dates: "Lumină, n-am plătit" -> "lumina n am platit". */
export function foldQuery(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[-/.](?=\d)/g, '$1/') // keep 10/2026, 10.2026 and 2026-10 together
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove a whole-word phrase once; returns [found, rest]. */
function cut(text: string, phrase: string): [boolean, string] {
  const padded = ` ${text} `;
  const i = padded.indexOf(` ${phrase} `);
  if (i < 0) return [false, text];
  return [true, `${padded.slice(0, i)} ${padded.slice(i + phrase.length + 2)}`.replace(/\s+/g, ' ').trim()];
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const n = y * 12 + (m - 1) + delta;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

/** 2 × common subsequence / total length: close to difflib's ratio for short words ("enji" ~ "engie"). */
export function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

export interface Filters {
  provider: string | null;
  slug: string | null;
  category: Category | null;
  month: string | null;
  status: SearchStatus | null;
  monthNoYear: number | null;
}

const isEmpty = (f: Filters) => !(f.slug || f.category || f.month || f.status);

function monthWords(text: string, f: Filters): string {
  const tokens = text.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    let number = 0;
    const full = MONTHS.indexOf(tok);
    if (full >= 0 && tok !== 'mai') number = full + 1;
    else if (MONTH_ABBR[tok]) number = MONTH_ABBR[tok];
    else if (tok === 'mai' || tok === 'noi') {
      // "mai" / "noi" are also everyday words: months only after "din/în/luna…" or before a year
      if (MONTH_LEAD.has(tokens[i - 1] ?? '') || /^20\d\d$/.test(tokens[i + 1] ?? '')) number = tok === 'mai' ? 5 : 11;
    }
    if (!number) continue;
    const year = /^20\d\d$/.test(tokens[i + 1] ?? '') ? Number(tokens[i + 1]) : null;
    if (year) tokens[i + 1] = '';
    tokens[i] = '';
    if (year) f.month = `${year}-${String(number).padStart(2, '0')}`;
    else f.monthNoYear = number;
    break;
  }
  return tokens.filter(Boolean).join(' ');
}

/** Free text -> filters. `known`: folded provider name/alias -> canonical name. `current`: the app's "this month". */
export function parseQuery(text: string, known: Record<string, string>, current: string): Filters {
  const f: Filters = { provider: null, slug: null, category: null, month: null, status: null, monthNoYear: null };
  let t = foldQuery(text);
  let found: boolean;

  // 1. Dates with digits: 2026-10, 10/2026
  let m = /(^|[^\d])(20\d\d)\/(\d{1,2})(?!\d)/.exec(t);
  if (m && Number(m[3]) >= 1 && Number(m[3]) <= 12) {
    f.month = `${m[2]}-${m[3].padStart(2, '0')}`;
    t = t.replace(`${m[2]}/${m[3]}`, ' ');
  }
  m = f.month ? null : /(^|[^\d])(\d{1,2})\/(20\d\d)(?!\d)/.exec(t);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    f.month = `${m[3]}-${m[2].padStart(2, '0')}`;
    t = t.replace(`${m[2]}/${m[3]}`, ' ');
  }

  // 2. This month / last month
  for (const [phrases, delta] of [[THIS_MONTH, 0], [LAST_MONTH, -1]] as const) {
    for (const p of phrases) {
      if (f.month) break;
      [found, t] = cut(t, p);
      if (found) f.month = shiftMonth(current, delta);
    }
  }

  // 3. Status before providers: "neplatite" is not a provider
  outer: for (const [status, phrases] of STATUS_PHRASES) {
    for (const p of phrases) {
      [found, t] = cut(t, p);
      if (found) {
        f.status = status;
        break outer;
      }
    }
  }

  // 3b. "energie electrica" is a kind of bill, not the provider Electrica
  for (const p of ELECTRIC_PHRASES) {
    [found, t] = cut(t, p);
    if (found) {
      f.category = 'electricity';
      break;
    }
  }

  // 4. Providers: longest alias first ("apa brasov" before "apa")
  for (const alias of Object.keys(known).sort((a, b) => b.length - a.length)) {
    [found, t] = cut(t, alias);
    if (found) {
      f.provider = known[alias];
      break;
    }
  }

  // 5. Month names
  if (!f.month) t = monthWords(t, f);

  // 6. Category words
  for (const [cat, words] of CATEGORY_WORDS) {
    for (const w of words) {
      [found, t] = cut(t, w);
      if (found && !f.category) f.category = cat;
    }
    if (f.category) break;
  }

  // 7. A misspelled provider, as speech or fast typing gives it ("enji", "hidroelectica")
  if (!f.provider) {
    const names = Object.keys(known).filter((a) => !a.includes(' ') && a.length >= 3);
    for (const tok of t.split(' ')) {
      if (!tok || STOPWORDS.has(tok) || tok.length < 4 || /^\d+$/.test(tok)) continue;
      let best: string | null = null;
      let score = 0.6;
      for (const n of names) {
        const s = similarity(tok, n);
        if (s >= score) [best, score] = [n, s];
      }
      if (best) {
        f.provider = known[best];
        break;
      }
    }
  }

  if (f.provider) {
    f.slug = slugify(f.provider);
    f.category = null; // the provider says it all ("factura de lumina PPC")
  }
  return f;
}

/** Provider names the rules know: the Romanian list (with aliases) plus everyone who has bills. */
export function knownProviders(points: Pick<Point, 'provider' | 'slug'>[]): Record<string, string> {
  const known: Record<string, string> = {};
  for (const p of RO_PROVIDERS) for (const a of [p.name, ...(p.aliases ?? [])]) known[foldQuery(a)] = p.name;
  for (const p of points) {
    known[foldQuery(p.provider)] = p.provider;
    known[foldQuery(p.slug.replace(/-/g, ' '))] = p.provider;
  }
  return known;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : n < 20 || (n % 100 > 0 && n % 100 < 20) ? `${n} ${many}` : `${n} de ${many}`);

function matches(p: Point, f: Filters): boolean {
  if (f.slug && p.slug !== f.slug) return false;
  if (f.category && p.category !== f.category) return false;
  if (f.month && p.month !== f.month) return false;
  if (f.status === 'paid' && p.status !== 'paid') return false;
  if (f.status === 'unpaid' && p.status === 'paid') return false;
  if (f.status === 'review' && p.audit_status === 'ok' && p.validation_status !== 'needs_review') return false;
  return true;
}

export function chipsFor(f: Filters): SearchChip[] {
  const chips: SearchChip[] = [];
  if (f.slug) chips.push({ kind: 'provider', value: f.slug, label: f.provider ?? f.slug });
  if (f.category) chips.push({ kind: 'category', value: f.category, label: CATEGORY_LABELS[f.category] });
  if (f.month) chips.push({ kind: 'month', value: f.month, label: monthLabelRo(f.month) });
  if (f.status) chips.push({ kind: 'status', value: f.status, label: STATUS_LABELS[f.status] });
  return chips;
}

function targetFor(f: Filters, results: SearchResult[]): SearchTarget {
  if (results.length === 1) return { screen: 'Bill', id: results[0].id };
  if (!results.length) return null;
  if (f.slug) return { screen: 'Provider', slug: f.slug, provider: f.provider ?? f.slug, month: f.month };
  if (f.month && !(f.category || f.status)) return { screen: 'Overview', month: f.month };
  return null;
}

function messageFor(f: Filters, chips: SearchChip[], n: number): string {
  if (isEmpty(f)) return `N-am înțeles ce cauți. ${TRY}`;
  const what = chips.map((c) => c.label).join(' · ');
  if (!n) return `N-am găsit facturi pentru: ${what}. Încearcă altă lună sau alt furnizor.`;
  return `Am găsit ${n === 1 ? 'o factură' : plural(n, 'factură', 'facturi')}: ${what}.`;
}

/** Thrown for the same cases the backend answers with 400. */
export class SearchInputError extends Error {
  constructor(
    public code: 'empty_query' | 'bad_month',
    message: string,
  ) {
    super(message);
  }
}

const CATEGORIES: Category[] = ['electricity', 'gas', 'water', 'telecom', 'other'];

/** The same JSON as GET /api/search/, computed from the bills already on the phone. */
export function localSearch(input: SearchInput, allPoints: Point[], transcript: string | null = null): SearchResponse {
  const q = (input.q ?? '').trim().slice(0, 200);
  if (!q && !input.provider && !input.category && !input.month && !input.status)
    throw new SearchInputError('empty_query', 'Scrie ce cauți, de exemplu „PPC octombrie”.');

  // One bill per provider per month (the newest), like the dashboard.
  const byKey = new Map<string, Point>();
  for (const p of allPoints) {
    const k = `${p.slug}|${p.month}`;
    const had = byKey.get(k);
    if (!had || p.id > had.id) byKey.set(k, p);
  }
  const points = [...byKey.values()];
  const months = [...new Set(points.map((p) => p.month))].sort();
  const current = months[months.length - 1] ?? new Date().toISOString().slice(0, 7);

  const f = q
    ? parseQuery(q, knownProviders(points), current)
    : { provider: null, slug: null, category: null, month: null, status: null, monthNoYear: null };

  // Explicit filters win over the text.
  const slug = (input.provider ?? '').trim().toLowerCase();
  if (slug) {
    f.slug = slug;
    f.provider = points.find((p) => p.slug === slug)?.provider ?? RO_PROVIDERS.find((p) => slugify(p.name) === slug)?.name ?? slug;
    f.category = null;
  }
  if (input.category && CATEGORIES.includes(input.category)) f.category = input.category;
  if (input.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new SearchInputError('bad_month', 'Luna trebuie să arate ca 2026-10.');
    f.month = input.month;
  }
  if (input.status && STATUS_LABELS[input.status]) f.status = input.status;

  // A month without a year = the latest such month that has bills (else the last one before "this month").
  if (!f.month && f.monthNoYear) {
    const suffix = `-${String(f.monthNoYear).padStart(2, '0')}`;
    const have = months.filter((m) => m.endsWith(suffix));
    const year = Number(current.slice(0, 4)) - (`${current.slice(0, 4)}${suffix}` > current ? 1 : 0);
    f.month = have.length ? have[have.length - 1] : `${year}${suffix}`;
  }

  const found = isEmpty(f)
    ? []
    : points
        .filter((p) => matches(p, f))
        .sort((a, b) => b.month.localeCompare(a.month) || a.provider.toLowerCase().localeCompare(b.provider.toLowerCase()))
        .slice(0, MAX_RESULTS);
  const results: SearchResult[] = found.map((p) => ({
    id: p.id,
    provider: p.provider,
    slug: p.slug,
    category: p.category,
    month: p.month,
    month_label: monthLabelRo(p.month),
    period_start: p.period_start,
    period_end: p.period_end,
    due_date: p.due_date ?? null,
    total: p.total.toFixed(2),
    status: p.status,
    paid_at: p.paid_at ?? null,
    audit_status: p.audit_status,
    validation_status: p.validation_status ?? 'accepted',
    has_pdf: false, // only the backend knows; the bill screen checks on its own
  }));
  const chips = chipsFor(f);
  return {
    query: q,
    transcript,
    filters: { provider: f.provider, slug: f.slug, category: f.category, month: f.month, status: f.status },
    chips,
    target: targetFor(f, results),
    message: messageFor(f, chips, results.length),
    results,
  };
}

/** Params for "drop this chip": the other chips' values, no text (docs/API_V2.md §7). */
export function withoutChip(chips: SearchChip[], drop: SearchChip): SearchInput {
  const input: SearchInput = {};
  for (const c of chips) {
    if (c.kind === drop.kind && c.value === drop.value) continue;
    if (c.kind === 'provider') input.provider = c.value;
    if (c.kind === 'category') input.category = c.value as Category;
    if (c.kind === 'month') input.month = c.value;
    if (c.kind === 'status') input.status = c.value as SearchStatus;
  }
  return input;
}

/** Query string for GET /search/ (no URLSearchParams: React Native's is incomplete). */
export function searchQueryString(input: SearchInput): string {
  return (['q', 'provider', 'category', 'month', 'status'] as const)
    .map((k) => [k, (input[k] ?? '').trim()] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
