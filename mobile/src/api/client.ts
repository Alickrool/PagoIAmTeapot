import { Platform } from 'react-native';
import billsFixture from '../../../shared/fixtures/bills.json';
import detailsFixture from '../../../shared/fixtures/bill_details.json';
import { historyWithArchive, localArchive, setLocalArchived, withArchive } from '../archive';
import { localSearch, SearchInputError, searchQueryString } from '../search';
import * as derive from './derive';
import type {
  ApiErrorCode,
  AskResponse,
  AutoPayRule,
  BillDetail,
  BillSummary,
  DashboardResponse,
  DisputeLetter,
  OffersResponse,
  PayResponse,
  ProviderHistory,
  ReadingResponse,
  ProviderSummary,
  SearchInput,
  SearchResponse,
  UploadFile,
  ValidationStatus,
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
  if (!res.ok) throw parseApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: ApiErrorCode | string | null = null,
    /** 409 duplicate_bill: the bill that was already scanned. */
    public existingBillId: number | null = null,
  ) {
    super(message);
  }
}

/** v2 errors are {code, detail, existing_bill_id?}; v1 errors are {detail}; anything else -> the raw text. */
export function parseApiError(status: number, text: string): ApiRequestError {
  let message = text.slice(0, 200) || `HTTP ${status}`;
  let code: string | null = null;
  let existing: number | null = null;
  try {
    const body = JSON.parse(text);
    if (body?.detail) message = String(body.detail);
    if (typeof body?.code === 'string') code = body.code;
    if (body?.existing_bill_id != null && Number.isFinite(Number(body.existing_bill_id))) existing = Number(body.existing_bill_id);
  } catch {}
  return new ApiRequestError(status, message, code, existing);
}

// ---- v2 fallback: while /dashboard/ and /providers/ don't exist on the backend (404), build the same JSON
// on the phone from the bills we already have (see derive.ts and docs/API_V2.md).
let billCache: { at: number; value: Promise<Map<number, BillSummary>> } | null = null;
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

/** Every bill's summary (status, paid_at, validation_status) by id, from GET /bills/?all=1. Cached 30 s. */
function billIndex(): Promise<Map<number, BillSummary>> {
  if (billCache && Date.now() - billCache.at < 30_000) return billCache.value;
  const value = (async () => {
    const all: BillSummary[] = MOCK ? (billsFixture as unknown as BillSummary[]) : await request('/bills/?all=1');
    return new Map(all.map((b) => [b.id, b]));
  })();
  value.catch(() => (billCache = null));
  billCache = { at: Date.now(), value };
  return value;
}

/** Local search errors look like the backend's 400s. */
function runLocal(input: SearchInput, points: ReturnType<typeof derive.toPoints>, transcript: string | null = null) {
  try {
    return localSearch(input, points, transcript);
  } catch (e) {
    if (e instanceof SearchInputError) throw new ApiRequestError(400, e.message, e.code);
    throw e;
  }
}

export const VOICE_OFF = 'Căutarea vocală nu e încă activă pe server. Folosește microfonul de pe tastatură.';
export const VOICE_SLOW = 'Căutarea vocală durează prea mult acum. Încearcă din nou sau scrie ce cauți.';
/** Same sentence as the backend's AI_MOCK (docs/API_V2.md §7). */
export const MOCK_TRANSCRIPT = 'Factura PPC din octombrie';

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
    for (const f of files) await appendFile(form, 'files', f); // pages of ONE bill, in order (API_V2 §1)
    // Gemini usually answers in 10–20 s; give up after 2 minutes instead of spinning forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      return await request<BillDetail>('/bills/scan/', { method: 'POST', body: form, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  /** Monthly overview (donut + compare + history). docs/API_V2.md §2 */
  dashboard: (month?: string): Promise<DashboardResponse> =>
    v2(`/dashboard/${month ? `?month=${month}` : ''}`, (p) => derive.dashboard(p, month)),

  /** docs/API_V2.md §3; archived providers (§8) last */
  providers: async (): Promise<ProviderSummary[]> => withArchive(await v2('/providers/', derive.providers), await localArchive()),

  /** docs/API_V2.md §4 */
  providerHistory: async (slug: string): Promise<ProviderHistory> =>
    historyWithArchive(await v2(`/providers/${slug}/`, (p) => derive.providerHistory(p, slug)), await localArchive()),

  /** Move a provider to the archive (contract ended) or back; bills stay. Returns its card. docs/API_V2.md §8 */
  setProviderArchived: async (slug: string, archived: boolean): Promise<ProviderSummary> => {
    if (!MOCK) {
      try {
        const card = await request<ProviderSummary>(`/providers/${slug}/archive/`, { method: archived ? 'POST' : 'DELETE' });
        if (typeof card?.archived === 'boolean') return card;
      } catch (e) {
        // unknown_provider is a real answer; a bare 404 means a backend without §8 -> keep it on the phone
        if (!(e instanceof ApiRequestError && e.status === 404 && e.code !== 'unknown_provider')) throw e;
      }
    }
    await setLocalArchived(slug, archived);
    const card = (await api.providers()).find((p) => p.slug === slug);
    if (!card) throw new ApiRequestError(404, `Nu există furnizorul „${slug}”.`, 'unknown_provider');
    return card;
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

  /** User says a needs_review bill is right. docs/API_V2.md §6 */
  confirmBill: (billId: number): Promise<BillDetail> => {
    billCache = null; // the "De verificat" marks must update right away
    if (!MOCK) return post(`/bills/${billId}/confirm/`, {});
    const bill = details[String(billId)];
    if (!bill) return Promise.reject(new Error('Factura nu există în datele demo.'));
    const base = bill.validation ?? { assigned_month: bill.period_end.slice(0, 7), is_current_month: true, checks: [] };
    return delay({ ...bill, validation: { ...base, status: 'accepted' as const, confirmed_by_user: true } });
  },

  /** validation_status of every bill, by id (for the "de verificat" marks in lists). Cached 30 s. */
  billStatuses: async (): Promise<Map<number, ValidationStatus>> => {
    const all = [...(await billIndex()).values()];
    return new Map(all.filter((b) => b.validation_status).map((b) => [b.id, b.validation_status!]));
  },

  /** paid_at of every paid bill, by id (provider history rows show "Plătită pe …"). docs/API_V2.md §7 */
  paidDates: async (): Promise<Map<number, string>> => {
    const all = [...(await billIndex()).values()];
    return new Map(all.filter((b) => b.paid_at).map((b) => [b.id, b.paid_at!]));
  },

  /** Search bar: free text and/or filters (filters win). Local rules on 404 and in mock mode. docs/API_V2.md §7 */
  search: async (input: SearchInput): Promise<SearchResponse> => {
    if (!MOCK) {
      try {
        return await request<SearchResponse>(`/search/?${searchQueryString(input)}`);
      } catch (e) {
        if (!(e instanceof ApiRequestError && e.status === 404)) throw e;
      }
    }
    const result = runLocal(input, await loadPoints());
    return MOCK ? delay(result, 200) : result;
  },

  /** Voice search: one short recording (m4a on the phone, webm on web), field `audio`. docs/API_V2.md §7 */
  searchVoice: async (audio: UploadFile): Promise<SearchResponse> => {
    if (MOCK) return delay(runLocal({ q: MOCK_TRANSCRIPT }, await loadPoints(), MOCK_TRANSCRIPT), 1200);
    const form = new FormData();
    await appendFile(form, 'audio', audio);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      return await request<SearchResponse>('/search/voice/', { method: 'POST', body: form, signal: controller.signal });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) throw new ApiRequestError(404, VOICE_OFF, 'voice_off');
      if ((e as Error)?.name === 'AbortError') throw new ApiRequestError(504, VOICE_SLOW, 'timeout');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  /** The bill as a PDF (original upload, or generated by the backend). docs/API_V2.md §5 */
  billPdfUrl: (billId: number) => `${API_URL}/api/bills/${billId}/pdf/`,

  /** true when the backend can serve the bill PDF (404 until the endpoint / file exists). */
  hasBillPdf: async (billId: number): Promise<boolean> => {
    if (MOCK) return false;
    try {
      const res = await fetch(`${API_URL}/api/bills/${billId}/pdf/`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Submit the real meter index -> recalculated bill (A6). */
  submitReading: (billId: number, indexNew: number): Promise<ReadingResponse> => {
    if (!MOCK) return post(`/bills/${billId}/reading/`, { index_new: indexNew });
    const bill = details[String(billId)];
    const consumption = bill ? indexNew - (bill.index_old ?? 0) : 0;
    if (!bill || consumption <= 0) return Promise.reject(new Error('Indexul nou trebuie să fie mai mare decât cel vechi.'));
    const ratio = consumption / (bill.consumption || consumption);
    const newTotal = Math.round(Number(bill.total) * ratio * 100) / 100;
    const anomalies = bill.audit.anomalies.filter((a) => a.id !== 'estimated_index');
    return delay({
      ...bill,
      index_new: indexNew,
      index_type: 'self' as const,
      consumption,
      total: newTotal.toFixed(2),
      audit: { status: anomalies.some((a) => a.severity === 'critical') ? 'critical' : anomalies.some((a) => a.severity === 'warning') ? 'warning' : 'ok', anomalies },
      recalculation: {
        previous_total: Number(bill.total),
        new_total: newTotal,
        difference: Math.round((newTotal - Number(bill.total)) * 100) / 100,
        previous_consumption: bill.consumption ?? 0,
        new_consumption: consumption,
        unit: bill.consumption_unit,
      },
    }, 900);
  },

  pay: (billId: number, mode: 'manual' | 'auto'): Promise<PayResponse> => {
    billCache = null; // status and paid_at change
    pointsCache = null;
    return MOCK ? delay({ status: mode === 'auto' ? 'blocked' : 'paid', reasons: mode === 'auto' ? ['[mock] Estimated index'] : [] }) : post(`/bills/${billId}/pay/`, { mode });
  },

  createAutoPayRule: (rule: Pick<AutoPayRule, 'provider' | 'max_amount' | 'block_if_estimated' | 'block_if_anomaly'>): Promise<AutoPayRule> =>
    MOCK ? delay({ ...rule, id: 1, active: true, created_at: new Date().toISOString() }) : post('/autopay-rules/', rule),
};
