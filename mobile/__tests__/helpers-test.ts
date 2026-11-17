// Old code without tests: number/month formatting, per-bill questions, overview math, mode copy.
import type { BillDetail, DashboardMonth, DashboardSlice } from '../src/api/types';
import { COPY, THEMES } from '../src/mode';
import { mergeMonths, sliceColors, suggestBudget } from '../src/overviewMath';
import { questionsFor } from '../src/questions';
import { category, deltaColor, deltaLabel, money, monthLabel, monthName } from '../src/theme';

describe('theme helpers', () => {
  it('money uses a Romanian decimal comma', () => {
    expect(money('501.85')).toBe('501,85 lei');
    expect(money(60)).toBe('60,00 lei');
    expect(money(-248.22)).toBe('-248,22 lei');
  });

  it('month labels are Romanian', () => {
    expect(monthLabel('2026-10')).toBe('octombrie 2026');
    expect(monthLabel('2026-01', true)).toBe('ian');
    expect(monthName('2026-11')).toBe('noiembrie');
  });

  it('deltaLabel: sign, one decimal under 10%, comma', () => {
    expect(deltaLabel(97.74)).toBe('+98%');
    expect(deltaLabel(-4.5)).toBe('−4,5%');
    expect(deltaLabel(0)).toBe('0%');
    expect(deltaLabel(null)).toBe('');
  });

  it('deltaColor: up is bad, down is good, small changes stay muted', () => {
    const t = THEMES.millennial;
    expect(deltaColor(30, t)).toBe(t.sev.critical.color);
    expect(deltaColor(-30, t)).toBe(t.sev.ok.color);
    expect(deltaColor(3, t)).toBe(t.muted);
    expect(deltaColor(null, t)).toBe(t.muted);
  });
});

const bill = (over: Partial<BillDetail>): BillDetail =>
  ({ provider: 'X', category: 'other', audit: { status: 'ok', anomalies: [] }, ...over }) as BillDetail;
const anomaly = (id: string) => ({ id, severity: 'warning' as const, title: id, message: '', line_item_codes: [], evidence: {}, actions: [] });

describe('questionsFor (per-bill Q&A chips)', () => {
  it('water asks about water, with the provider name', () => {
    const q = questionsFor(bill({ provider: 'Apa Brasov', category: 'water' }), 'genz');
    expect(q[0]).toBe('Ce plătesc la Apa Brasov pe lângă apă?');
    expect(q.every((x) => !/gaz|kWh/.test(x))).toBe(true);
  });

  it('gas asks about the gas price cap and m³ → kWh', () => {
    const q = questionsFor(bill({ provider: 'Engie', category: 'gas' }), 'millennial');
    expect(q).toContain('Ce e plafonarea prețului la gaz?');
    expect(q).toContain('Cum transformă Engie metrii cubi în kWh?');
  });

  it('anomaly questions come first and are not duplicated', () => {
    const q = questionsFor(bill({ provider: 'PPC', category: 'electricity', audit: { status: 'critical', anomalies: [anomaly('estimated_index'), anomaly('estimated_index')] } }), 'genz');
    expect(q[0]).toBe('Ce fac dacă PPC mi-a estimat indexul?');
    expect(new Set(q).size).toBe(q.length);
  });

  it('extra services and above-market get their own question', () => {
    const q = questionsFor(bill({ provider: 'Digi', category: 'telecom', audit: { status: 'warning', anomalies: [anomaly('extra_service:tv_extra_option'), anomaly('above_market')] } }), 'genz');
    expect(q.slice(0, 2)).toEqual(['Ce opțiuni plătite am pe factura Digi și cum renunț?', 'Există o ofertă mai ieftină decât Digi?']);
  });

  it('senior gets at most 2 chips, others at most 4', () => {
    const b = bill({ provider: 'PPC', category: 'electricity', audit: { status: 'critical', anomalies: [anomaly('estimated_index'), anomaly('above_market'), anomaly('penalty')] } });
    expect(questionsFor(b, 'senior')).toHaveLength(2);
    expect(questionsFor(b, 'genz')).toHaveLength(4);
  });

  it('an unknown category falls back to generic questions (edge case)', () => {
    expect(questionsFor(bill({ category: 'other' }), 'genz')).toEqual(['De ce a crescut factura?', 'Ce taxe sunt pe această factură?']);
  });
});

const m = (month: string, total: string): DashboardMonth => ({ month, total, bills_count: 1, audit_status: 'ok' });

describe('overview math', () => {
  it('mergeMonths never drops months and keeps them sorted (history bug fix)', () => {
    const latest = [m('2026-08', '1'), m('2026-09', '2'), m('2026-10', '3')];
    const older = [m('2025-11', '9'), m('2026-08', '1')];
    expect(mergeMonths(latest, older).map((x) => x.month)).toEqual(['2025-11', '2026-08', '2026-09', '2026-10']);
  });

  it('mergeMonths: the newer response wins for the same month', () => {
    expect(mergeMonths([m('2026-10', '1')], [m('2026-10', '2')])[0].total).toBe('2');
  });

  it('suggestBudget = average + 10%, rounded up to 50 lei', () => {
    expect(suggestBudget('703.12', 0)).toBe(800);
    expect(suggestBudget(null, 455)).toBe(550);
    expect(suggestBudget('0', 100)).toBe(0); // edge case: average 0 gives a 0 budget
  });

  it('sliceColors: category colour, second provider of the same category gets another colour', () => {
    const s = (slug: string, cat: DashboardSlice['category']) => ({ slug, category: cat }) as DashboardSlice;
    const c = sliceColors([s('ppc', 'electricity'), s('engie', 'electricity'), s('apa', 'water')]);
    expect(c.ppc).toBe(category.electricity.color);
    expect(c.engie).not.toBe(c.ppc);
    expect(c.apa).toBe(category.water.color);
  });
});

describe('modes', () => {
  const keys = (o: object) => Object.keys(o).sort();

  it('every mode has the same copy keys and a theme', () => {
    expect(keys(COPY.millennial)).toEqual(keys(COPY.genz));
    expect(keys(COPY.senior)).toEqual(keys(COPY.genz));
    expect(keys(THEMES)).toEqual(['genz', 'millennial', 'senior']);
  });

  it('senior text and touch targets are larger', () => {
    expect(THEMES.senior.fs(15)).toBeGreaterThan(THEMES.millennial.fs(15));
    expect(THEMES.senior.touch).toBeGreaterThanOrEqual(64);
  });

  it('inner radius = card radius − padding (design rule 14)', () => {
    for (const t of Object.values(THEMES)) expect(t.inner).toBe(t.radius - t.pad);
  });

  it('copy functions produce Romanian text with lei', () => {
    expect(COPY.genz.alertTitle('PPC', '517.06')).toBe('Red flag: PPC vrea 517,06 lei');
    expect(COPY.senior.analyze(1)).toMatch(/1 pagină/);
    expect(COPY.millennial.analyze(3)).toMatch(/3 pagini/);
    expect(COPY.genz.readingDone(-248.22)).toMatch(/248,22 lei/);
  });
});
