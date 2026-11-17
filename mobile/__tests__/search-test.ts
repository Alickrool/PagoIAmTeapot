// Search rules on the phone (docs/API_V2.md §7): parsing, local search, parity with the backend's own answers
// (shared/fixtures/search.json is exported from the real API), and the small status helpers.
import billsFixture from '../../shared/fixtures/bills.json';
import detailsFixture from '../../shared/fixtures/bill_details.json';
import searchFixture from '../../shared/fixtures/search.json';
import { toPoints } from '../src/api/derive';
import type { BillDetail, BillSummary, SearchResponse } from '../src/api/types';
import { THEMES } from '../src/mode';
import { foldQuery, knownProviders, localSearch, parseQuery, searchQueryString, SearchInputError, shiftMonth, similarity, withoutChip } from '../src/search';
import { dateRo, paidLabel, rowTone } from '../src/status';
import { audioFile, VOICE_RECORDING } from '../src/voice';

jest.mock('expo-audio', () => ({ RecordingPresets: { HIGH_QUALITY: {} } }));

const points = toPoints(Object.values(detailsFixture as unknown as Record<string, BillDetail>), billsFixture as unknown as BillSummary[]);
const known = knownProviders(points);
const parse = (q: string) => parseQuery(q, known, '2026-10');

describe('foldQuery', () => {
  it('drops case, diacritics and punctuation; keeps dates together', () => {
    expect(foldQuery('Lumină, n-am PLĂTIT!')).toBe('lumina n am platit');
    expect(foldQuery('10.2026 și 2026-10')).toBe('10/2026 si 2026/10');
  });
});

describe('parseQuery (same rules as backend/bills/services/search.py)', () => {
  it('provider + month name', () => {
    expect(parse('ppc octombrie')).toMatchObject({ provider: 'PPC', slug: 'ppc', monthNoYear: 10, month: null });
  });

  it('aliases and misspellings from speech (enel -> PPC, enji -> Engie, rcs -> Digi)', () => {
    expect(parse('factura enel').provider).toBe('PPC');
    expect(parse('enji').provider).toBe('Engie');
    expect(parse('rcs').provider).toBe('Digi');
    expect(parse('hidroelectica').provider).toBe('Hidroelectrica');
  });

  it('"apa brasov" is the provider, not the water category', () => {
    expect(parse('apa brasov')).toMatchObject({ provider: 'Apa Brasov', category: null });
    expect(parse('factura de apă')).toMatchObject({ provider: null, category: 'water' });
  });

  it('"energie electrică" is a kind of bill, not the provider Electrica', () => {
    expect(parse('energie electrică')).toMatchObject({ provider: null, category: 'electricity' });
  });

  it('a provider wins over the category ("factura de lumina PPC")', () => {
    expect(parse('factura de lumina PPC')).toMatchObject({ provider: 'PPC', category: null });
  });

  it('dates with digits: 2026-10, 10/2026, 10.2026', () => {
    for (const q of ['2026-10', '10/2026', '10.2026', 'octombrie 2026']) expect(parse(q).month).toBe('2026-10');
    expect(parse('13/2026').month).toBeNull(); // not a month (edge case)
  });

  it('this month / last month', () => {
    expect(parse('luna asta').month).toBe('2026-10');
    expect(parse('luna trecută').month).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('status words; "nu am plătit" is unpaid, not paid', () => {
    expect(parse('nu am plătit').status).toBe('unpaid');
    expect(parse('neplătite').status).toBe('unpaid');
    expect(parse('de plată').status).toBe('unpaid');
    expect(parse('plătite').status).toBe('paid');
    expect(parse('anomalii').status).toBe('review');
  });

  it('"mai" / "noi" are months only after "din/în/luna…" or before a year (edge case)', () => {
    expect(parse('ce mai am de plata')).toMatchObject({ monthNoYear: null, status: 'unpaid' });
    expect(parse('factura din mai').monthNoYear).toBe(5);
    expect(parse('noi 2025').month).toBe('2025-11');
  });

  it('nothing understood -> empty filters', () => {
    expect(parse('bla bla')).toMatchObject({ provider: null, category: null, month: null, status: null });
  });

  it('similarity is close to difflib for short words', () => {
    expect(similarity('enji', 'engie')).toBeGreaterThanOrEqual(0.6);
    expect(similarity('vreau', 'engie')).toBeLessThan(0.6);
  });
});

describe('localSearch', () => {
  it('one result -> target is that bill', () => {
    const r = localSearch({ q: 'ppc octombrie' }, points);
    expect(r.results.map((x) => x.id)).toEqual([24]);
    expect(r.target).toEqual({ screen: 'Bill', id: 24 });
    expect(r.message).toBe('Am găsit o factură: PPC · octombrie 2026.');
  });

  it('provider only -> provider screen; newest month first, one bill per month', () => {
    const r = localSearch({ q: 'PPC' }, points);
    expect(r.target).toEqual({ screen: 'Provider', slug: 'ppc', provider: 'PPC', month: null });
    const months = r.results.map((x) => x.month);
    expect(months).toEqual([...months].sort().reverse());
    expect(new Set(months).size).toBe(months.length);
  });

  it('month only -> overview of that month', () => {
    expect(localSearch({ q: 'luna trecută' }, points).target).toEqual({ screen: 'Overview', month: '2026-09' });
  });

  it('explicit params win over the text', () => {
    const r = localSearch({ q: 'engie', provider: 'ppc', month: '2026-09' }, points);
    expect(r.filters).toMatchObject({ provider: 'PPC', slug: 'ppc', month: '2026-09' });
  });

  it('a month without a year = the latest such month with bills', () => {
    expect(localSearch({ q: 'noiembrie' }, points).filters.month).toBe('2025-11');
  });

  it('no results -> a message that says what was understood', () => {
    const r = localSearch({ q: 'orange' }, points);
    expect(r.results).toEqual([]);
    expect(r.target).toBeNull();
    expect(r.message).toBe('N-am găsit facturi pentru: Orange. Încearcă altă lună sau alt furnizor.');
  });

  it('empty query and bad month are errors, like the backend 400s (edge case)', () => {
    expect(() => localSearch({ q: '   ' }, points)).toThrow(SearchInputError);
    expect(() => localSearch({ month: '2026-13' }, points)).toThrow(/2026-10/);
  });

  it('dropping a chip keeps the others as params', () => {
    const r = localSearch({ q: 'ppc octombrie' }, points);
    expect(withoutChip(r.chips, r.chips[1])).toEqual({ provider: 'ppc' });
    expect(withoutChip(r.chips.slice(0, 1), r.chips[0])).toEqual({});
  });

  it('query string: encoded, empty values left out', () => {
    expect(searchQueryString({ q: 'luna trecută', month: '', status: 'paid' })).toBe('q=luna%20trecut%C4%83&status=paid');
  });
});

describe('parity with the real API (shared/fixtures/search.json)', () => {
  const cases = searchFixture as unknown as Record<string, SearchResponse>;

  it.each(Object.keys(cases))('"%s": same filters and chips', (q) => {
    const local = localSearch({ q }, points);
    expect(local.filters).toEqual(cases[q].filters);
    expect(local.chips).toEqual(cases[q].chips);
  });

  // "de verificat" also counts older bills' anomalies, which only the backend knows.
  it.each(Object.keys(cases).filter((q) => q !== 'de verificat'))('"%s": same target, count and message', (q) => {
    const local = localSearch({ q }, points);
    expect(local.target).toEqual(cases[q].target);
    expect(local.results.length).toBe(cases[q].results.length);
    expect(local.message).toBe(cases[q].message);
  });
});

describe('status helpers', () => {
  it('dateRo', () => {
    expect(dateRo('2026-11-16')).toBe('16.11.2026');
    expect(dateRo(null)).toBe('');
  });

  it('paidLabel: paid with/without date, unpaid with due date, blocked', () => {
    expect(paidLabel('paid', '2026-11-16')).toBe('Plătită pe 16.11.2026');
    expect(paidLabel('paid', null)).toBe('Plătită'); // older backend without paid_at
    expect(paidLabel('unpaid', null, '2026-11-20')).toBe('De plată · scadentă 20.11.2026');
    expect(paidLabel('blocked')).toBe('Plată oprită');
  });

  it('rowTone colours the whole card: red anomaly, yellow warning, none when ok', () => {
    const t = THEMES.senior;
    expect(rowTone('critical', t)).toEqual({ bg: t.sev.critical.bg, border: t.sev.critical.color });
    expect(rowTone('warning', t)).toEqual({ bg: t.sev.warning.bg, border: t.sev.warning.color });
    expect(rowTone('ok', t)).toBeNull();
    expect(rowTone(undefined, t)).toBeNull();
  });
});

describe('audioFile (voice upload)', () => {
  it('iPhone records 16 kHz mono WAV (Gemini did not understand the same words as m4a), small enough for 1 MB', () => {
    expect(VOICE_RECORDING.ios).toMatchObject({ extension: '.wav', outputFormat: 'lpcm', sampleRate: 16000 });
    expect(VOICE_RECORDING.numberOfChannels).toBe(1);
    expect(16000 * 2 * 15).toBeLessThan(1024 * 1024); // 15 s of 16-bit samples
  });

  it('WAV from the iPhone, m4a from Android, webm from the browser', () => {
    expect(audioFile('file:///cache/rec-1.wav')).toEqual({ uri: 'file:///cache/rec-1.wav', name: 'cautare.wav', mimeType: 'audio/wav' });
    expect(audioFile('file:///cache/rec-1.m4a')).toEqual({ uri: 'file:///cache/rec-1.m4a', name: 'cautare.m4a', mimeType: 'audio/mp4' });
    expect(audioFile('blob:http://localhost/abc.webm').mimeType).toBe('audio/webm');
  });
});
