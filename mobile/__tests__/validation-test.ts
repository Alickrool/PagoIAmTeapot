// AV2–AV5 logic: checks split, review state, month notice, scan failures (409 / 429 / network).
import { ApiRequestError } from '../src/api/client';
import type { Validation } from '../src/api/types';
import { DUPLICATE_NOTICE, isFlagged, monthNotice, needsReview, scanErrorMessage, scanFailure, splitChecks } from '../src/validation';

const v = (over: Partial<Validation> = {}): Validation => ({
  status: 'accepted',
  assigned_month: '2026-10',
  is_current_month: true,
  confirmed_by_user: false,
  checks: [],
  ...over,
});

describe('splitChecks', () => {
  it('separates warnings from info notes', () => {
    const { warnings, infos } = splitChecks(
      v({
        checks: [
          { id: 'not_current_month', severity: 'info', field: 'period_end', message: 'altă lună' },
          { id: 'vat_amount', severity: 'warning', field: 'line_items.vat', message: 'TVA' },
          { id: 'lines_sum', severity: 'warning', field: 'total', message: 'suma' },
        ],
      }),
    );
    expect(warnings.map((c) => c.id)).toEqual(['vat_amount', 'lines_sum']);
    expect(infos.map((c) => c.id)).toEqual(['not_current_month']);
  });

  it('handles a bill without validation (older backend)', () => {
    expect(splitChecks(undefined)).toEqual({ warnings: [], infos: [] });
  });
});

describe('needsReview / isFlagged', () => {
  it('is true only for needs_review that the user has not confirmed', () => {
    expect(needsReview(v({ status: 'needs_review' }))).toBe(true);
    expect(needsReview(v({ status: 'needs_review', confirmed_by_user: true }))).toBe(false);
    expect(needsReview(v({ status: 'accepted' }))).toBe(false);
    expect(needsReview(undefined)).toBe(false);
  });

  it('flags list rows by validation_status', () => {
    expect(isFlagged('needs_review')).toBe(true);
    expect(isFlagged('accepted')).toBe(false);
    expect(isFlagged(undefined)).toBe(false);
  });
});

describe('monthNotice (AV2)', () => {
  it('is null for a bill of the current month', () => {
    expect(monthNotice({ validation: v() })).toBeNull();
  });

  it('uses the backend message of not_current_month', () => {
    const msg = 'Factura e pentru septembrie 2026, am pus-o în luna ei.';
    expect(
      monthNotice({
        validation: v({ assigned_month: '2026-09', is_current_month: false, checks: [{ id: 'not_current_month', severity: 'info', field: 'period_end', message: msg }] }),
      }),
    ).toBe(msg);
  });

  it('falls back to its own text when the check is missing', () => {
    expect(monthNotice({ validation: v({ assigned_month: '2026-09', is_current_month: false }) })).toBe('Am pus factura în septembrie 2026.');
  });

  it('is null without validation', () => {
    expect(monthNotice({ validation: undefined })).toBeNull();
  });
});

describe('scanErrorMessage', () => {
  it('explains a timeout', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(scanErrorMessage(e)).toMatch(/prea mult/);
  });

  it.each(['Network request failed', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])('turns "%s" into a network hint', (m) => {
    expect(scanErrorMessage(new Error(m))).toMatch(/Nu am putut ajunge la server/);
  });

  it('passes backend messages through unchanged', () => {
    expect(scanErrorMessage(new Error('Nu pare o factură de utilități.'))).toBe('Nu pare o factură de utilități.');
    expect(scanErrorMessage('text simplu')).toBe('text simplu');
  });
});

describe('scanFailure (AV4)', () => {
  it('409 duplicate_bill opens the existing bill', () => {
    const e = new ApiRequestError(409, 'Ai scanat deja factura asta.', 'duplicate_bill', 581);
    expect(scanFailure(e)).toEqual({ kind: 'duplicate', billId: 581, notice: DUPLICATE_NOTICE });
  });

  it('409 without existing_bill_id is shown as an error (edge case)', () => {
    expect(scanFailure(new ApiRequestError(409, 'conflict', 'duplicate_bill', null))).toEqual({ kind: 'error', message: 'conflict' });
  });

  it('429 too_many_requests shows the backend detail', () => {
    const e = new ApiRequestError(429, 'Prea multe scanări. Încearcă peste 12 minute.', 'too_many_requests');
    expect(scanFailure(e)).toEqual({ kind: 'error', message: 'Prea multe scanări. Încearcă peste 12 minute.' });
  });

  it('file safety errors show the backend detail', () => {
    const e = new ApiRequestError(400, 'PDF-ul are JavaScript.', 'suspicious_file');
    expect(scanFailure(e)).toEqual({ kind: 'error', message: 'PDF-ul are JavaScript.' });
  });
});
