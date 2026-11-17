// Small shared helpers for how a bill's state looks: whole-box colour and the "Plătită pe …" line.
import type { AuditStatus, BillStatus } from './api/types';
import type { Theme } from './mode';

/** Whole-box colour for a bill or provider card: anomaly = red box, attention = yellow box, ok = plain. */
export function rowTone(status: AuditStatus | null | undefined, t: Theme): { bg: string; border: string } | null {
  if (status === 'critical') return { bg: t.sev.critical.bg, border: t.sev.critical.color };
  if (status === 'warning') return { bg: t.sev.warning.bg, border: t.sev.warning.color };
  return null;
}

/** "2026-11-16" -> "16.11.2026" (same as the backend's date_ro). Anything else is returned as is. */
export function dateRo(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso ?? '');
}

/** Payment line for a bill: "Plătită pe 16.11.2026", "Plătită", "De plată · scadentă 20.11.2026", "Plată oprită". */
export function paidLabel(status: BillStatus | string, paidAt?: string | null, dueDate?: string | null): string {
  if (status === 'paid') return paidAt ? `Plătită pe ${dateRo(paidAt)}` : 'Plătită';
  if (status === 'blocked') return 'Plată oprită';
  return dueDate ? `De plată · scadentă ${dateRo(dueDate)}` : 'De plată';
}
