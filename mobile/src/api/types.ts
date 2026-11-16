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
}

export interface BillDetail extends Omit<BillSummary, 'audit_status'> {
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
