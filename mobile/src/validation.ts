// Scan validation helpers (docs/API_V2.md §6). Pure functions, so they are unit-tested on their own.
import { ApiRequestError } from './api/client';
import type { BillDetail, Validation, ValidationCheck, ValidationStatus } from './api/types';
import { monthLabel } from './theme';

export function splitChecks(v: Validation | undefined): { warnings: ValidationCheck[]; infos: ValidationCheck[] } {
  const checks = v?.checks ?? [];
  return { warnings: checks.filter((c) => c.severity === 'warning'), infos: checks.filter((c) => c.severity !== 'warning') };
}

/** A bill the user still has to look at: needs_review and not confirmed yet. */
export const needsReview = (v: Validation | undefined) => v?.status === 'needs_review' && !v.confirmed_by_user;

export const isFlagged = (status: ValidationStatus | undefined) => status === 'needs_review';

/** AV2: "Am pus factura în septembrie 2026" when a scanned bill belongs to another month (null otherwise). */
export function monthNotice(bill: Pick<BillDetail, 'validation'>): string | null {
  const v = bill.validation;
  if (!v || v.is_current_month) return null;
  const check = v.checks.find((c) => c.id === 'not_current_month');
  return check?.message ?? `Am pus factura în ${monthLabel(v.assigned_month)}.`;
}

/** Turn transport errors into something a person can act on; backend errors already come as readable Romanian text. */
export function scanErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.name === 'AbortError') return 'Citirea a durat prea mult. Încearcă din nou, eventual cu mai puține pagini.';
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(msg))
    return 'Nu am putut ajunge la server. Verifică internetul (telefonul și laptopul în aceeași rețea) și încearcă din nou.';
  return msg;
}

export const DUPLICATE_NOTICE = 'Ai scanat deja factura asta. Ți-am deschis-o pe cea existentă.';

export type ScanFailure = { kind: 'duplicate'; billId: number; notice: string } | { kind: 'error'; message: string };

/** AV4: 409 duplicate_bill opens the existing bill; everything else (429 included) shows the message. */
export function scanFailure(e: unknown): ScanFailure {
  if (e instanceof ApiRequestError && e.status === 409 && e.existingBillId != null)
    return { kind: 'duplicate', billId: e.existingBillId, notice: DUPLICATE_NOTICE };
  return { kind: 'error', message: scanErrorMessage(e) };
}
