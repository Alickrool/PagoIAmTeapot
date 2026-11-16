import { Platform } from 'react-native';
import billsFixture from '../../../shared/fixtures/bills.json';
import detailsFixture from '../../../shared/fixtures/bill_details.json';
import * as derive from './derive';
import type {
  AskResponse,
  AutoPayRule,
  BillDetail,
  BillSummary,
  DashboardResponse,
  DisputeLetter,
  OffersResponse,
  PayResponse,
  ProviderHistory,
  ProviderSummary,
  UploadFile,
} from './types';

// Set in mobile/.env (see .env.example). On a real phone use your laptop's LAN IP.
const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_URL;
// EXPO_PUBLIC_MOCK=1 -> no backend needed, data comes from shared/fixtures.
export const MOCK = process.env.EXPO_PUBLIC_MOCK === '1';

const details = detailsFixture as unknown as Record<string, BillDetail>;
const delay = <T,>(value: T, ms = 400) => new Promise<T>((r) => setTimeout(() => r(value), ms));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    // v2 errors are {code, detail}; v1 errors are {detail}. Show `detail` when there is one.
    let message = text.slice(0, 200);
    try {
      const body = JSON.parse(text);
      if (body?.detail) message = String(body.detail);
    } catch {}
    throw new ApiRequestError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- v2 fallback: while /dashboard/ and /providers/ don't exist on the backend (404), build the same JSON
// on the phone from the bills we already have (see derive.ts and docs/API_V2.md).
let pointsCache: { at: number; value: Promise<ReturnType<typeof derive.toPoints>> } | null = null;

function loadPoints() {
  if (pointsCache && Date.now() - pointsCache.at < 30_000) return pointsCache.value;
  const value = (async () => {
    if (MOCK) return derive.toPoints(Object.values(details));
    const latest = await request<BillSummary[]>('/bills/');
    const [all, full] = await Promise.all([
      request<BillSummary[]>('/bills/?all=1'),
      Promise.all(latest.map((b) => request<BillDetail>(`/bills/${b.id}/`))),
    ]);
    return derive.toPoints(full, all);
  })();
  value.catch(() => (pointsCache = null));
  pointsCache = { at: Date.now(), value };
  return value;
}

async function v2<T>(path: string, local: (points: ReturnType<typeof derive.toPoints>) => T): Promise<T> {
  if (!MOCK) {
    try {
      return await request<T>(path);
    } catch (e) {
      if (!(e instanceof ApiRequestError && e.status === 404)) throw e;
    }
  }
  const result = local(await loadPoints());
  return MOCK ? delay(result) : result;
}

async function appendFile(form: FormData, field: string, file: UploadFile) {
  if (Platform.OS === 'web') {
    // On web the picker gives a blob:/data: URI; FormData needs the actual Blob.
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.name);
  } else {
    // React Native's FormData accepts {uri, name, type} objects for files.
    form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  listBills: (): Promise<BillSummary[]> =>
    MOCK ? delay(billsFixture as unknown as BillSummary[]) : request('/bills/'),

  getBill: (id: number): Promise<BillDetail> => {
    if (!MOCK) return request(`/bills/${id}/`);
    const bill = details[String(id)];
    // Fixtures only hold the latest bill per provider; older ones exist only on the real backend.
    return bill ? delay(bill) : Promise.reject(new Error('Older bills open only with the real backend (mock mode).'));
  },

  /** One bill from 1–10 files (photos and/or PDFs, in page order). docs/API_V2.md §1 */
  scanBill: async (files: UploadFile[]): Promise<BillDetail> => {
    if (MOCK) {
      const ppc = Object.values(details).find((b) => b.provider === 'PPC')!;
      return delay(ppc, 6000);
    }
    const form = new FormData();
    // One file -> legacy field `file` (works on today's backend too); several -> repeated `files`.
    const field = files.length === 1 ? 'file' : 'files';
    for (const f of files) await appendFile(form, field, f);
    return request('/bills/scan/', { method: 'POST', body: form });
  },

  /** Monthly overview (donut + compare + history). docs/API_V2.md §2 */
  dashboard: (month?: string): Promise<DashboardResponse> =>
    v2(`/dashboard/${month ? `?month=${month}` : ''}`, (p) => derive.dashboard(p, month)),

  /** docs/API_V2.md §3 */
  providers: (): Promise<ProviderSummary[]> => v2('/providers/', derive.providers),

  /** docs/API_V2.md §4 */
  providerHistory: (slug: string): Promise<ProviderHistory> =>
    v2(`/providers/${slug}/`, (p) => derive.providerHistory(p, slug)),

  ask: (billId: number, body: { question?: string; line_item_id?: number }): Promise<AskResponse> =>
    MOCK
      ? delay(
          {
            question: body.question ?? '',
            line_item: null,
            answer: '[mock] VAT is 21% of everything else on the bill, so when the energy price goes up, VAT goes up too.',
            sources: ['Your bill', 'Law 141/2025 (VAT 21%)'],
            suggested_actions: [{ type: 'switch_supplier' as const, label: 'Compare offers' }],
          },
          800,
        )
      : post(`/bills/${billId}/ask/`, body),

  dispute: (billId: number, anomalyId?: string): Promise<DisputeLetter> =>
    MOCK
      ? delay({ to: 'Supplier', subject: '[mock] Contestație factură', body: '[mock] Letter body' })
      : post(`/bills/${billId}/dispute/`, { anomaly_id: anomalyId }),

  offers: (billId: number): Promise<OffersResponse> =>
    MOCK
      ? delay({
          current_all_in_price: 1.434,
          unit: 'kWh',
          offers: [{ supplier: 'Hidroelectrica', offer: 'Casa Verde (demo)', all_in_price: 1.12, estimated_total: 392, savings: 109.85 }],
          disclaimer: 'Demo prices, illustrative only.',
        })
      : request(`/bills/${billId}/offers/`),

  pay: (billId: number, mode: 'manual' | 'auto'): Promise<PayResponse> =>
    MOCK ? delay({ status: mode === 'auto' ? 'blocked' : 'paid', reasons: mode === 'auto' ? ['[mock] Estimated index'] : [] }) : post(`/bills/${billId}/pay/`, { mode }),

  createAutoPayRule: (rule: Pick<AutoPayRule, 'provider' | 'max_amount' | 'block_if_estimated' | 'block_if_anomaly'>): Promise<AutoPayRule> =>
    MOCK ? delay({ ...rule, id: 1, active: true, created_at: new Date().toISOString() }) : post('/autopay-rules/', rule),
};
