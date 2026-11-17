// "Profesional" mode (corporate look for the middle generation): the monthly summary strip, its export text, and
// readable colours in every mode.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import type { DashboardResponse } from '../src/api/types';
import { KpiStrip, kpis, reportText } from '../src/components/KpiStrip';
import { COPY, THEMES } from '../src/mode';

const month: DashboardResponse = {
  month: '2026-10',
  currency: 'RON',
  total: '1001.83',
  paid_total: '0.00',
  unpaid_total: '1001.83',
  bills_count: 4,
  audit_status: 'critical',
  previous_month: '2026-09',
  previous_total: '811.50',
  delta_pct: 23.5,
  average_total: '700.00',
  slices: [
    { provider: 'PPC', slug: 'ppc', category: 'electricity', bill_id: 24, total: '517.06', status: 'unpaid', audit_status: 'critical' },
    { provider: 'Apa Brasov', slug: 'apa-brasov', category: 'water', bill_id: 48, total: '72.24', status: 'paid', audit_status: 'ok' },
  ],
  months: [],
} as unknown as DashboardResponse;

describe('monthly summary (Sinteza lunii)', () => {
  it('four figures: total, paid, to pay, change vs the previous month', () => {
    expect(kpis(month).map((k) => [k.label, k.value])).toEqual([
      ['Total lună', '1001,83 lei'],
      ['Achitat', '0,00 lei'],
      ['De plată', '1001,83 lei'],
      ['Față de septembrie', '+24%'], // rounded like the other month comparisons
    ]);
  });

  it('first month (no previous one): a dash instead of a percentage (edge case)', () => {
    const k = kpis({ ...month, previous_month: null, delta_pct: null });
    expect(k[3]).toMatchObject({ label: 'Față de luna trecută', value: '–' });
  });

  it('export text: title, the figures and the providers, unpaid ones marked', () => {
    const text = reportText(month);
    expect(text.split('\n')[0]).toBe('Sinteza lunii octombrie 2026 · AI Pago');
    expect(text).toContain('De plată: 1001,83 lei');
    expect(text).toContain('• PPC: 517,06 lei (de plată)');
    expect(text).toContain('• Apa Brasov: 72,24 lei');
    expect(text).not.toContain('Apa Brasov: 72,24 lei (de plată)');
  });

  it('renders the strip and "Exportă" opens the share sheet with the report', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<KpiStrip data={month} />);
    expect(screen.getByText('Sinteza lunii')).toBeTruthy();
    expect(screen.getByText('+24%')).toBeTruthy();
    expect(screen.getByText('4 facturi · octombrie 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Exportă sinteza pentru octombrie 2026'));
    expect(share).toHaveBeenCalledWith({ message: reportText(month) });
  });
});

describe('corporate look and readable colours', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it('Profesional: crisper corners than the other modes, its own accent colour', () => {
    expect(THEMES.millennial.radius).toBeLessThan(THEMES.genz.radius);
    expect(THEMES.millennial.radius).toBeLessThan(THEMES.senior.radius);
    expect(new Set([THEMES.genz.accent, THEMES.millennial.accent, THEMES.senior.accent]).size).toBe(3);
    expect(COPY.millennial.modeDesc).toMatch(/corporate/);
  });

  it.each(Object.keys(THEMES) as (keyof typeof THEMES)[])('%s: text on buttons and on the page is readable (WCAG AA 4.5:1)', (m) => {
    const t = THEMES[m];
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
