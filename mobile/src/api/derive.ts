// Client-side version of the v2 endpoints (docs/API_V2.md).
// Used in mock mode and as a fallback while the backend endpoints don't exist yet (404).
// Input: the latest BillDetail of each provider (its `history` holds the older bills).
import type {
  AnomalyShort,
  AuditStatus,
  BillDetail,
  BillStatus,
  BillSummary,
  Category,
  DashboardResponse,
  Discrepancy,
  IndexType,
  ProviderBill,
  ProviderHistory,
  ProviderSummary,
} from './types';

export interface Point {
  id: number;
  provider: string;
  slug: string;
  category: Category;
  period_start: string | null;
  period_end: string;
  month: string;
  total: number;
  consumption: number | null;
  unit: string;
  index_type: IndexType;
  status: BillStatus;
  audit_status: AuditStatus;
  anomalies: AnomalyShort[];
  validation_status?: 'accepted' | 'needs_review';
  paid_at?: string | null;
  due_date?: string | null;
}

export const slugify = (provider: string) =>
  provider
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const RANK: Record<AuditStatus, number> = { ok: 0, warning: 1, critical: 2 };
const worst = (list: AuditStatus[]): AuditStatus =>
  list.reduce<AuditStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');

const r1 = (n: number) => Math.round(n * 10) / 10;
const str = (n: number) => n.toFixed(2);
const pct = (cur: number | null, prev: number | null) =>
  cur == null || prev == null || prev === 0 ? null : r1(((cur - prev) / prev) * 100);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** All bills (latest + history) as flat points, oldest first. `summaries` (from /bills/?all=1) fixes status/audit. */
export function toPoints(details: BillDetail[], summaries: BillSummary[] = []): Point[] {
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const points: Point[] = [];
  for (const d of details) {
    const base = { provider: d.provider, slug: slugify(d.provider), category: d.category, unit: d.consumption_unit };
    for (const h of d.history) {
      const s = byId.get(h.id);
      points.push({
        ...base,
        id: h.id,
        period_start: s?.period_start ?? null,
        period_end: h.period_end,
        month: h.period_end.slice(0, 7),
        total: Number(h.total),
        consumption: h.consumption,
        index_type: h.index_type,
        status: s?.status ?? 'paid',
        audit_status: s?.audit_status ?? (h.index_type === 'estimated' ? 'warning' : 'ok'),
        anomalies: [],
        validation_status: s?.validation_status,
        paid_at: s?.paid_at ?? null,
        due_date: s?.due_date ?? null,
      });
    }
    points.push({
      ...base,
      id: d.id,
      period_start: d.period_start,
      period_end: d.period_end,
      month: d.period_end.slice(0, 7),
      total: Number(d.total),
      consumption: d.consumption,
      index_type: d.index_type,
      status: d.status,
      audit_status: d.audit.status,
      anomalies: d.audit.anomalies.map(({ id, severity, title }) => ({ id, severity, title })),
      validation_status: d.validation?.status ?? byId.get(d.id)?.validation_status,
      paid_at: d.paid_at ?? byId.get(d.id)?.paid_at ?? null,
      due_date: d.due_date,
    });
  }
  return points.sort((a, b) => a.period_end.localeCompare(b.period_end) || a.id - b.id);
}

export function dashboard(points: Point[], month?: string): DashboardResponse {
  const months = [...new Set(points.map((p) => p.month))].sort();
  const selected = month && months.includes(month) ? month : months[months.length - 1];
  const idx = months.indexOf(selected);
  const prevMonth = idx > 0 ? months[idx - 1] : null;

  const inMonth = (m: string) => points.filter((p) => p.month === m);
  const sum = (ps: Point[]) => ps.reduce((a, p) => a + p.total, 0);

  const bills = inMonth(selected);
  const prevBills = prevMonth ? inMonth(prevMonth) : [];
  const total = sum(bills);
  const prevTotal = prevMonth ? sum(prevBills) : null;

  const window = months.slice(Math.max(0, idx - 11), idx + 1);
  const others = window.filter((m) => m !== selected).map((m) => sum(inMonth(m)));
  const average = avg(others);

  return {
    month: selected,
    currency: 'RON',
    total: str(total),
    paid_total: str(sum(bills.filter((p) => p.status === 'paid'))),
    unpaid_total: str(sum(bills.filter((p) => p.status !== 'paid'))),
    bills_count: bills.length,
    audit_status: worst(bills.map((p) => p.audit_status)),
    previous_month: prevMonth,
    previous_total: prevTotal == null ? null : str(prevTotal),
    delta_pct: pct(total, prevTotal),
    average_total: average == null ? null : str(average),
    slices: bills
      .map((p) => {
        const prev = prevBills.find((q) => q.slug === p.slug);
        return {
          provider: p.provider,
          slug: p.slug,
          category: p.category,
          bill_id: p.id,
          total: str(p.total),
          share_pct: total ? r1((p.total / total) * 100) : 0,
          previous_total: prev ? str(prev.total) : null,
          delta_pct: pct(p.total, prev?.total ?? null),
          status: p.status,
          audit_status: p.audit_status,
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total)),
    months: window.map((m) => {
      const ps = inMonth(m);
      return { month: m, total: str(sum(ps)), bills_count: ps.length, audit_status: worst(ps.map((p) => p.audit_status)) };
    }),
  };
}

const groupByProvider = (points: Point[]) => {
  const groups = new Map<string, Point[]>();
  for (const p of points) groups.set(p.slug, [...(groups.get(p.slug) ?? []), p]);
  return groups; // each group oldest first
};

export function providers(points: Point[]): ProviderSummary[] {
  return [...groupByProvider(points).values()]
    .map((ps) => {
      const last = ps[ps.length - 1];
      const average = avg(ps.slice(0, -1).map((p) => p.total));
      return {
        provider: last.provider,
        slug: last.slug,
        category: last.category,
        bills_count: ps.length,
        last_bill_id: last.id,
        last_period_end: last.period_end,
        last_total: str(last.total),
        average_total: average == null ? null : str(average),
        trend_pct: pct(last.total, average),
        audit_status: last.audit_status,
        anomalies_count: last.anomalies.filter((a) => a.severity !== 'info').length,
        totals: ps.slice(-12).map((p) => str(p.total)),
      };
    })
    .sort((a, b) => b.last_period_end.localeCompare(a.last_period_end) || a.provider.localeCompare(b.provider));
}

const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

/** Discrepancy rules from docs/API_V2.md (index_gap and new_line_item need backend data, so they are skipped here). */
function discrepancies(ps: Point[], unit: string): Discrepancy[] {
  const out: Discrepancy[] = [];
  const consumptions = ps.map((p) => p.consumption).filter((c): c is number => c != null);
  const avgCons = avg(consumptions);
  const price = (p: Point) => (p.consumption ? p.total / p.consumption : null);

  ps.forEach((cur, i) => {
    const prev = i > 0 ? ps[i - 1] : null;
    const add = (d: Omit<Discrepancy, 'id' | 'bill_id' | 'period_end'>) =>
      out.push({ ...d, id: `${d.type}:${cur.id}`, bill_id: cur.id, period_end: cur.period_end });

    if (cur.index_type === 'estimated') {
      const high = avgCons != null && cur.consumption != null && cur.consumption >= avgCons * 1.3;
      add({
        type: 'estimated_index',
        severity: high ? 'critical' : 'warning',
        title: 'Index estimat',
        message: high
          ? `Facturat pe index estimat: ${cur.consumption} ${unit}, media ta e ${r1(avgCons!)} ${unit}.`
          : 'Facturat pe index estimat, nu pe citirea reală a contorului.',
        previous_value: avgCons == null ? null : r1(avgCons),
        current_value: cur.consumption,
        unit,
      });
    }
    if (!prev) return;

    const gap = monthsBetween(prev.month, cur.month);
    if (gap > 1) {
      add({
        type: 'missing_month',
        severity: 'info',
        title: 'Lipsește o factură',
        message: `Nicio factură între ${prev.month} și ${cur.month} (${gap - 1} ${gap > 2 ? 'luni' : 'lună'}).`,
        previous_value: null,
        current_value: null,
        unit: '',
      });
    }

    const dc = pct(cur.consumption, prev.consumption);
    if (dc != null && Math.abs(dc) >= 30) {
      const up = dc > 0;
      add({
        type: 'consumption_jump',
        severity: up && (dc >= 60 || cur.index_type === 'estimated') ? 'critical' : up ? 'warning' : 'info',
        title: up ? (dc >= 90 ? 'Consumul s-a dublat' : 'Consumul a sărit') : 'Consumul a scăzut',
        message: `${cur.consumption} ${unit} acum, față de ${prev.consumption} ${unit} pe factura trecută (${up ? '+' : ''}${dc}%).${
          cur.index_type === 'estimated' ? ' Indexul a fost estimat.' : ''
        }`,
        previous_value: prev.consumption,
        current_value: cur.consumption,
        unit,
      });
    }

    const dt = pct(cur.total, prev.total);
    if (dt != null && Math.abs(dt) >= 25) {
      const up = dt > 0;
      // Price-driven increase: the bill grew much faster than consumption.
      const priceDriven = up && dc != null && dc < dt / 2 ? ` Consumul doar ${dc >= 0 ? '+' : ''}${dc}%.` : '';
      add({
        type: 'total_jump',
        severity: !up ? 'info' : dt >= 50 ? 'critical' : 'warning',
        title: up ? 'Factura a crescut' : 'Factura a scăzut',
        message: `${str(cur.total)} lei, față de ${str(prev.total)} lei pe factura trecută (${up ? '+' : ''}${dt}%).${priceDriven}`,
        previous_value: prev.total,
        current_value: cur.total,
        unit: 'lei',
      });
    }

    const dp = pct(price(cur), price(prev));
    if (dp != null && Math.abs(dp) >= 10) {
      add({
        type: 'price_change',
        severity: 'warning',
        title: dp > 0 ? 'Prețul pe unitate a crescut' : 'Prețul pe unitate a scăzut',
        message: `${price(cur)!.toFixed(3)} lei/${unit}, față de ${price(prev)!.toFixed(3)} lei/${unit} (${dp > 0 ? '+' : ''}${dp}%).`,
        previous_value: Number(price(prev)!.toFixed(3)),
        current_value: Number(price(cur)!.toFixed(3)),
        unit: `lei/${unit}`,
      });
    }
  });

  const sev = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => b.period_end.localeCompare(a.period_end) || sev[a.severity] - sev[b.severity]);
}

export function providerHistory(points: Point[], slug: string): ProviderHistory {
  const ps = groupByProvider(points).get(slug);
  if (!ps) throw new Error(`404: unknown provider ${slug}`);
  const last = ps[ps.length - 1];
  const totals = ps.map((p) => p.total);
  const cons = ps.map((p) => p.consumption).filter((c): c is number => c != null);
  const average = avg(totals.slice(0, -1));
  const avgCons = avg(cons);

  const bills: ProviderBill[] = ps.map((p, i) => {
    const prev = i > 0 ? ps[i - 1] : null;
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      total: str(p.total),
      consumption: p.consumption,
      index_old: null,
      index_new: null,
      index_type: p.index_type,
      unit_price: p.consumption ? Number((p.total / p.consumption).toFixed(3)) : null,
      status: p.status,
      audit_status: p.audit_status,
      delta_total_pct: pct(p.total, prev?.total ?? null),
      delta_consumption_pct: pct(p.consumption, prev?.consumption ?? null),
      anomalies: p.anomalies,
    };
  });

  return {
    provider: last.provider,
    slug,
    category: last.category,
    currency: 'RON',
    consumption_unit: last.unit,
    stats: {
      average_total: average == null ? null : str(average),
      min_total: str(Math.min(...totals)),
      max_total: str(Math.max(...totals)),
      sum_12m: str(totals.slice(-12).reduce((a, b) => a + b, 0)),
      average_consumption: avgCons == null ? null : r1(avgCons),
    },
    bills: bills.reverse().slice(0, 24),
    discrepancies: discrepancies(ps, last.unit),
  };
}
