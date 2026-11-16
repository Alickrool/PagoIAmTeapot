// Old code without tests until now: the on-phone fallback for /dashboard/ and /providers/ (derive.ts),
// checked against the real demo fixtures exported from the backend (shared/fixtures).
import detailsFixture from '../../shared/fixtures/bill_details.json';
import * as derive from '../src/api/derive';
import type { BillDetail } from '../src/api/types';

const details = Object.values(detailsFixture as unknown as Record<string, BillDetail>);
const points = derive.toPoints(details);

describe('slugify', () => {
  it.each([
    ['Apa Brasov', 'apa-brasov'],
    ['PPC', 'ppc'],
    ['E.ON Energie', 'e-on-energie'],
    ['Asociația de proprietari  Bl. 5', 'asociatia-de-proprietari-bl-5'],
    ['  --Digi--  ', 'digi'],
  ])('%s -> %s', (input, out) => expect(derive.slugify(input)).toBe(out));
});

describe('toPoints', () => {
  it('flattens every provider history plus the latest bill, oldest first', () => {
    expect(points).toHaveLength(details.reduce((n, d) => n + d.history.length + 1, 0));
    const ends = points.map((p) => p.period_end);
    expect([...ends].sort()).toEqual(ends);
  });

  it('marks history bills paid and keeps the latest bill status and anomalies', () => {
    const ppc = points.filter((p) => p.slug === 'ppc');
    expect(ppc.slice(0, -1).every((p) => p.status === 'paid')).toBe(true);
    expect(ppc[ppc.length - 1].anomalies.map((a) => a.id)).toContain('estimated_index');
  });
});

describe('dashboard', () => {
  const d = derive.dashboard(points);

  it('defaults to the latest month and sums its bills', () => {
    expect(d.month).toBe('2026-10');
    expect(d.total).toBe('1001.83');
    expect(d.bills_count).toBe(4);
    expect(d.audit_status).toBe('critical');
  });

  it('compares with the previous month', () => {
    expect(d.previous_month).toBe('2026-09');
    expect(d.previous_total).toBe('642.81');
    expect(d.delta_pct).toBeCloseTo(55.9, 1);
  });

  it('slices are sorted by total and their shares add up to ~100%', () => {
    const totals = d.slices.map((s) => Number(s.total));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(d.slices.reduce((a, s) => a + s.share_pct, 0)).toBeGreaterThan(99.5);
    const ppc = d.slices.find((s) => s.slug === 'ppc')!;
    expect(ppc.delta_pct).toBeCloseTo(97.7, 1);
  });

  it('months window is at most 12, oldest first, ending at the selected month', () => {
    expect(d.months.length).toBeLessThanOrEqual(12);
    expect(d.months[d.months.length - 1].month).toBe('2026-10');
  });

  it('an older month gets its own window (this is why the app merges months)', () => {
    const old = derive.dashboard(points, '2026-03');
    expect(old.month).toBe('2026-03');
    expect(old.months[old.months.length - 1].month).toBe('2026-03');
    expect(old.months.find((m) => m.month === '2026-10')).toBeUndefined();
  });

  it('an unknown month falls back to the latest one (edge case)', () => {
    expect(derive.dashboard(points, '1999-01').month).toBe('2026-10');
  });
});

describe('providers', () => {
  const list = derive.providers(points);

  it('one entry per provider with 12 totals for the sparkline', () => {
    expect(list.map((p) => p.slug).sort()).toEqual(['apa-brasov', 'digi', 'engie', 'ppc']);
    expect(list.every((p) => p.totals.length <= 12)).toBe(true);
  });

  it('PPC trend is far above its average and has 2 non-info issues', () => {
    const ppc = list.find((p) => p.slug === 'ppc')!;
    expect(ppc.trend_pct!).toBeGreaterThan(50);
    expect(ppc.audit_status).toBe('critical');
    expect(ppc.anomalies_count).toBeGreaterThanOrEqual(2);
  });
});

describe('providerHistory discrepancies', () => {
  it('PPC October: estimated index, doubled consumption and a big jump, all critical', () => {
    const h = derive.providerHistory(points, 'ppc');
    const oct = h.discrepancies.filter((x) => x.period_end === '2026-10-31');
    expect(oct.map((x) => x.type).sort()).toEqual(['consumption_jump', 'estimated_index', 'total_jump']);
    expect(oct.every((x) => x.severity === 'critical')).toBe(true);
    expect(oct.find((x) => x.type === 'consumption_jump')!.title).toBe('Consumul s-a dublat');
  });

  it('Engie October: the bill grew much faster than consumption (price-driven)', () => {
    const jump = derive.providerHistory(points, 'engie').discrepancies.find((x) => x.type === 'total_jump' && x.period_end === '2026-10-31')!;
    expect(jump.message).toMatch(/Consumul doar/);
  });

  it('Apa Brasov has no warnings or criticals', () => {
    const h = derive.providerHistory(points, 'apa-brasov');
    expect(h.discrepancies.filter((x) => x.severity !== 'info')).toEqual([]);
  });

  it('newest first, criticals before warnings within a month', () => {
    const list = derive.providerHistory(points, 'ppc').discrepancies;
    const ends = list.map((x) => x.period_end);
    expect([...ends].sort().reverse()).toEqual(ends);
  });

  it('bills are newest first with deltas against the previous bill', () => {
    const h = derive.providerHistory(points, 'ppc');
    expect(h.bills[0].period_end).toBe('2026-10-31');
    expect(h.bills[0].delta_total_pct).toBeCloseTo(97.7, 1);
    expect(h.bills[h.bills.length - 1].delta_total_pct).toBeNull();
  });

  it('a missing month gives an info discrepancy (edge case)', () => {
    const ppcOnly = points.filter((p) => p.slug === 'ppc' && p.month !== '2026-06');
    const types = derive.providerHistory(ppcOnly, 'ppc').discrepancies.map((x) => x.type);
    expect(types).toContain('missing_month');
  });

  it('unknown provider throws a 404-like error', () => {
    expect(() => derive.providerHistory(points, 'nu-exista')).toThrow(/404/);
  });
});
