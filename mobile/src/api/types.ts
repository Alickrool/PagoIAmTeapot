// Mirrors docs/API.md. Keep in sync with backend/bills/serializers.py.

export type Severity = 'ok' | 'info' | 'warning' | 'critical';
export type AuditStatus = 'ok' | 'warning' | 'critical';
export type Category = 'electricity' | 'gas' | 'telecom' | 'water' | 'other';
export type IndexType = 'real' | 'self' | 'estimated' | 'none';
export type BillStatus = 'unpaid' | 'paid' | 'blocked';

export type ActionType =
  | 'submit_reading'
  | 'dispute'
  | 'switch_supplier'
  | 'cancel_service'
  | 'autopay_rule'
  | 'ask';

export interface AnomalyAction {
  type: ActionType;
  label: string;
}

export interface Anomaly {
  id: string; // e.g. "estimated_index", "price_spike", "extra_service:tv_extra_option"
  severity: Exclude<Severity, 'ok'>;
  title: string;
  message: string;
  line_item_codes: string[]; // highlight these lines on the bill
  evidence: Record<string, unknown>;
  actions: AnomalyAction[];
}

export interface Audit {
  status: AuditStatus;
  anomalies: Anomaly[];
}

export interface LineItem {
  id: number;
  code: string;
  label: string; // Romanian, as printed
  label_en: string;
  kind: string;
  quantity: number | null;
  unit: string;
  unit_price: string | null; // decimals come as strings
  amount: string;
  bbox: { page: number; x: number; y: number; w: number; h: number } | null;
}

export interface HistoryPoint {
  id: number;
  period_end: string;
  total: string;
  consumption: number | null;
  index_type: IndexType;
}

export interface BillSummary {
  id: number;
  provider: string;
  category: Category;
  period_start: string;
  period_end: string;
  due_date: string | null;
  total: string;
  currency: string;
  status: BillStatus;
  audit_status: AuditStatus;
  validation_status?: ValidationStatus; // docs/API_V2.md §6
  paid_at?: string | null; // §7: "2026-11-16" when paid
}

// ---------- Scan validation (docs/API_V2.md §6) ----------

export type ValidationStatus = 'accepted' | 'needs_review';

export interface ValidationCheck {
  id: string; // stable, e.g. "not_current_month", "vat_amount", "prompt_injection_suspected"
  severity: 'info' | 'warning';
  field: string;
  message: string; // Romanian, with the real numbers: show as-is
}

export interface Validation {
  status: ValidationStatus;
  assigned_month: string; // "2026-09"
  is_current_month: boolean;
  confirmed_by_user: boolean;
  checks: ValidationCheck[];
}

/** Error codes of POST /bills/scan/ and the other endpoints (API_V2 §1 + §6). */
export type ApiErrorCode =
  | 'no_files'
  | 'too_many_files'
  | 'unsupported_type'
  | 'file_too_large'
  | 'not_a_bill'
  | 'unreadable'
  | 'ai_busy'
  | 'ai_error'
  | 'image_too_large'
  | 'encrypted_pdf'
  | 'suspicious_file'
  | 'too_many_pages'
  | 'unreadable_file'
  | 'invalid_extraction'
  | 'invalid_period'
  | 'duplicate_bill'
  | 'too_many_requests';

export interface BillDetail extends Omit<BillSummary, 'audit_status' | 'validation_status'> {
  customer_code: string;
  meter_series: string;
  place_of_consumption: string;
  county: string;
  issue_date: string | null;
  vat_rate: string | null;
  consumption: number | null;
  consumption_unit: string;
  index_old: number | null;
  index_new: number | null;
  index_type: IndexType;
  all_in_unit_price: number | null;
  county_average: number | null;
  source: 'upload' | 'seed';
  file_url: string | null;
  line_items: LineItem[];
  audit: Audit;
  history: HistoryPoint[]; // oldest first
  validation?: Validation; // §6; optional so older backends / fixtures still type-check
  paid_at?: string | null; // §7
}

export interface AskResponse {
  question: string;
  line_item: LineItem | null;
  answer: string;
  sources: string[]; // e.g. "Your bill", "Law 141/2025 (VAT 21%)" -> render as chips
  suggested_actions: AnomalyAction[]; // never "ask"
}

export interface DisputeLetter {
  to: string;
  subject: string;
  body: string;
}

export interface Offer {
  supplier: string;
  offer: string;
  all_in_price: number;
  estimated_total: number;
  savings: number;
}

export interface OffersResponse {
  current_all_in_price: number | null;
  unit: string;
  offers: Offer[];
  disclaimer: string;
}

export interface AutoPayRule {
  id: number;
  provider: string;
  max_amount: string;
  block_if_estimated: boolean;
  block_if_anomaly: boolean;
  active: boolean;
  created_at: string;
}

export interface PayResponse {
  status: BillStatus;
  reasons: string[];
}

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

// ---------- v2: Scan / Overview / Providers (docs/API_V2.md) ----------

export interface ApiError {
  code: string;
  detail: string;
}

export interface DashboardSlice {
  provider: string;
  slug: string;
  category: Category;
  bill_id: number;
  total: string;
  share_pct: number;
  previous_total: string | null;
  delta_pct: number | null;
  status: BillStatus;
  audit_status: AuditStatus;
}

export interface DashboardMonth {
  month: string; // "2026-10"
  total: string;
  bills_count: number;
  audit_status: AuditStatus;
}

export interface DashboardResponse {
  month: string;
  currency: string;
  total: string;
  paid_total: string;
  unpaid_total: string;
  bills_count: number;
  audit_status: AuditStatus;
  previous_month: string | null;
  previous_total: string | null;
  delta_pct: number | null;
  average_total: string | null;
  slices: DashboardSlice[]; // sorted by total desc
  months: DashboardMonth[]; // oldest first, max 12
}

export interface ProviderSummary {
  provider: string;
  slug: string;
  category: Category;
  bills_count: number;
  last_bill_id: number;
  last_period_end: string;
  last_total: string;
  average_total: string | null;
  trend_pct: number | null;
  audit_status: AuditStatus;
  anomalies_count: number;
  totals: string[]; // oldest first, max 12
}

export interface AnomalyShort {
  id: string;
  severity: Exclude<Severity, 'ok'>;
  title: string;
}

export interface ProviderBill {
  id: number;
  period_start: string | null;
  period_end: string;
  total: string;
  consumption: number | null;
  index_old: number | null;
  index_new: number | null;
  index_type: IndexType;
  unit_price: number | null;
  status: BillStatus;
  audit_status: AuditStatus;
  delta_total_pct: number | null;
  delta_consumption_pct: number | null;
  anomalies: AnomalyShort[];
}

export type DiscrepancyType =
  | 'total_jump'
  | 'consumption_jump'
  | 'price_change'
  | 'estimated_index'
  | 'index_gap'
  | 'new_line_item'
  | 'missing_month';

export interface Discrepancy {
  id: string; // "{type}:{bill_id}"
  bill_id: number;
  period_end: string;
  type: DiscrepancyType;
  severity: Exclude<Severity, 'ok'>;
  title: string;
  message: string;
  previous_value: number | null;
  current_value: number | null;
  unit: string;
}

export interface ProviderHistory {
  provider: string;
  slug: string;
  category: Category;
  currency: string;
  consumption_unit: string;
  stats: {
    average_total: string | null;
    min_total: string;
    max_total: string;
    sum_12m: string;
    average_consumption: number | null;
  };
  bills: ProviderBill[]; // newest first
  discrepancies: Discrepancy[]; // newest first, then by severity
}

// POST /bills/{id}/reading/ (docs/API.md "Submit reading response")
export interface Recalculation {
  previous_total: number;
  new_total: number;
  difference: number;
  previous_consumption: number;
  new_consumption: number;
  unit: string;
}

export type ReadingResponse = BillDetail & { recalculation: Recalculation };

// ---------- Search + voice search (docs/API_V2.md §7) ----------

export type SearchStatus = 'unpaid' | 'paid' | 'review';

export interface SearchFilters {
  provider: string | null;
  slug: string | null;
  category: Category | null;
  month: string | null; // "2026-10"
  status: SearchStatus | null;
}

export interface SearchChip {
  kind: 'provider' | 'category' | 'month' | 'status';
  value: string;
  label: string;
}

export type SearchTarget =
  | { screen: 'Bill'; id: number }
  | { screen: 'Provider'; slug: string; provider: string; month: string | null }
  | { screen: 'Overview'; month: string }
  | null;

export interface SearchResult {
  id: number;
  provider: string;
  slug: string;
  category: Category;
  month: string;
  month_label: string;
  period_start: string | null;
  period_end: string;
  due_date: string | null;
  total: string;
  status: BillStatus;
  paid_at: string | null;
  audit_status: AuditStatus;
  validation_status: ValidationStatus;
  has_pdf: boolean;
}

export interface SearchResponse {
  query: string;
  transcript: string | null;
  filters: SearchFilters;
  chips: SearchChip[];
  target: SearchTarget;
  message: string;
  results: SearchResult[];
}

/** What the app sends: free text and/or explicit filters (filters win over `q`). */
export interface SearchInput {
  q?: string;
  provider?: string; // slug
  category?: Category;
  month?: string;
  status?: SearchStatus;
}
