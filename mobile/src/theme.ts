import type { Category, Severity } from './api/types';

export const colors = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  text: '#16181D',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#5B3DF5',
  primaryText: '#FFFFFF',
  highlight: '#FFF4CC',
};

export const severity: Record<Severity, { color: string; bg: string; icon: string; label: string }> = {
  ok: { color: '#15803D', bg: '#DCFCE7', icon: '🟢', label: 'Normal' },
  info: { color: '#1D4ED8', bg: '#DBEAFE', icon: 'ℹ️', label: 'Info' },
  warning: { color: '#B45309', bg: '#FEF3C7', icon: '🟡', label: 'Attention' },
  critical: { color: '#B91C1C', bg: '#FEE2E2', icon: '🔴', label: 'Anomaly' },
};

export const money = (v: string | number) => `${Number(v).toFixed(2)} RON`;

export const category: Record<Category, { color: string; icon: string; label: string }> = {
  electricity: { color: '#F59E0B', icon: '⚡', label: 'Electricity' },
  gas: { color: '#EF4444', icon: '🔥', label: 'Gas' },
  water: { color: '#0EA5E9', icon: '💧', label: 'Water' },
  telecom: { color: '#8B5CF6', icon: '📶', label: 'Internet & TV' },
  other: { color: '#64748B', icon: '🧾', label: 'Other' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10" -> "Oct 2026" (short: "Oct") */
export const monthLabel = (month: string, short = false) => {
  const [y, m] = month.split('-').map(Number);
  return short ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
};

/** +12.3% / −4.0%, or '' when null */
export const deltaLabel = (pct: number | null) =>
  pct == null ? '' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(pct !== 0 && Math.abs(pct) < 10 ? 1 : 0)}%`;

/** Bills going up are bad (red), going down good (green). */
export const deltaColor = (pct: number | null) =>
  pct == null || Math.abs(pct) < 5 ? colors.muted : pct > 0 ? '#B91C1C' : '#15803D';
