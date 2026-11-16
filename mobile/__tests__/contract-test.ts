// Front ↔ back sync: the fixtures are exported from the real backend (`manage.py export_fixtures`), so every field
// the app reads (src/api/types.ts) must be in them. A failure here means the backend changed a shape.
import billsFixture from '../../shared/fixtures/bills.json';
import detailsFixture from '../../shared/fixtures/bill_details.json';

const has = (o: object, keys: string[]) => keys.filter((k) => !(k in o));

const SUMMARY = ['id', 'provider', 'category', 'period_start', 'period_end', 'due_date', 'total', 'currency', 'status', 'audit_status', 'validation_status'];
const DETAIL = [
  'id', 'provider', 'category', 'period_start', 'period_end', 'total', 'currency', 'status',
  'customer_code', 'meter_series', 'place_of_consumption', 'county', 'issue_date', 'vat_rate', 'consumption',
  'consumption_unit', 'index_old', 'index_new', 'index_type', 'all_in_unit_price', 'county_average', 'source',
  'file_url', 'line_items', 'audit', 'history', 'validation',
];
const LINE = ['id', 'code', 'label', 'label_en', 'kind', 'quantity', 'unit', 'unit_price', 'amount', 'bbox'];
const VALIDATION = ['status', 'assigned_month', 'is_current_month', 'confirmed_by_user', 'checks'];

describe('backend fixtures match src/api/types.ts', () => {
  const bills = billsFixture as unknown as Record<string, unknown>[];
  const details = Object.values(detailsFixture as unknown as Record<string, Record<string, unknown>>);

  it('BillSummary fields (incl. validation_status)', () => {
    for (const b of bills) expect(has(b, SUMMARY)).toEqual([]);
  });

  it('BillDetail fields (incl. validation)', () => {
    for (const d of details) expect(has(d, DETAIL)).toEqual([]);
  });

  it('LineItem fields', () => {
    for (const d of details) for (const li of d.line_items as object[]) expect(has(li, LINE)).toEqual([]);
  });

  it('validation object and its checks', () => {
    for (const d of details) {
      const v = d.validation as Record<string, unknown>;
      expect(has(v, VALIDATION)).toEqual([]);
      expect(['accepted', 'needs_review']).toContain(v.status);
      expect(v.assigned_month).toMatch(/^\d{4}-\d{2}$/);
      for (const c of v.checks as object[]) expect(has(c, ['id', 'severity', 'field', 'message'])).toEqual([]);
    }
  });

  it('money comes as strings with 2 decimals (app formats them itself)', () => {
    for (const b of bills) expect(String(b.total)).toMatch(/^-?\d+\.\d{2}$/);
  });
});
