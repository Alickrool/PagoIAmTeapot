import { Platform } from 'react-native';
import billsFixture from '../../../shared/fixtures/bills.json';
import detailsFixture from '../../../shared/fixtures/bill_details.json';
import type {
  AskResponse,
  AutoPayRule,
  BillDetail,
  BillSummary,
  DisputeLetter,
  OffersResponse,
  PayResponse,
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
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  listBills: (): Promise<BillSummary[]> =>
    MOCK ? delay(billsFixture as unknown as BillSummary[]) : request('/bills/'),

  getBill: (id: number): Promise<BillDetail> => (MOCK ? delay(details[String(id)]) : request(`/bills/${id}/`)),

  scanBill: async (file: UploadFile): Promise<BillDetail> => {
    if (MOCK) {
      const ppc = Object.values(details).find((b) => b.provider === 'PPC')!;
      return delay(ppc, 1500);
    }
    const form = new FormData();
    // React Native's FormData accepts {uri, name, type} objects for files.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return request('/bills/scan/', { method: 'POST', body: form });
  },

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
