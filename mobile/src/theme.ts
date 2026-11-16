import type { Severity } from './api/types';

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
