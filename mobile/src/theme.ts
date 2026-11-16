// Mode-independent helpers. Colours that change per generation live in src/mode.tsx (THEMES).
import type { Category, Severity } from './api/types';

/** 501.85 -> "501,85 lei" */
export const money = (v: string | number) => `${Number(v).toFixed(2).replace('.', ',')} lei`;

export const category: Record<Category, { color: string; label: string }> = {
  electricity: { color: '#F59E0B', label: 'Curent' },
  gas: { color: '#EF4444', label: 'Gaz' },
  water: { color: '#0EA5E9', label: 'Apă' },
  telecom: { color: '#8B5CF6', label: 'Internet și TV' },
  other: { color: '#64748B', label: 'Altele' },
};

const SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
const LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/** "2026-10" -> "octombrie 2026" (short: "oct") */
export const monthLabel = (month: string, short = false) => {
  const [y, m] = month.split('-').map(Number);
  return short ? SHORT[m - 1] : `${LONG[m - 1]} ${y}`;
};
export const monthName = (month: string) => LONG[Number(month.split('-')[1]) - 1];

/** +12% / −4,0%, or '' when null */
export const deltaLabel = (pct: number | null) =>
  pct == null
    ? ''
    : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)
        .toFixed(pct !== 0 && Math.abs(pct) < 10 ? 1 : 0)
        .replace('.', ',')}%`;

/** Bills going up are bad (red), going down good (green); small changes stay muted. */
export const deltaColor = (pct: number | null, t: { muted: string; sev: Record<Severity, { color: string }> }) =>
  pct == null || Math.abs(pct) < 5 ? t.muted : pct > 0 ? t.sev.critical.color : t.sev.ok.color;

export const tabular = { fontVariant: ['tabular-nums' as const] };
