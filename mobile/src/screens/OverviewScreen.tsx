import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { api, MOCK } from '../api/client';
import type { DashboardResponse, DashboardSlice } from '../api/types';
import { Button } from '../components/Button';
import { Donut } from '../components/charts/Donut';
import { MonthBars, monthBar } from '../components/charts/MonthBars';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { SeverityBadge } from '../components/SeverityBadge';
import { useStackNavigation } from '../navigation';
import { category, colors, deltaColor, deltaLabel, money, monthLabel } from '../theme';

const EXTRA = ['#10B981', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

/** Category colour per slice; a second provider of the same category gets an extra colour. */
function sliceColors(slices: DashboardSlice[]) {
  const used = new Set<string>();
  let extra = 0;
  return Object.fromEntries(
    slices.map((s) => {
      let c = (category[s.category] ?? category.other).color;
      if (used.has(c)) c = EXTRA[extra++ % EXTRA.length];
      used.add(c);
      return [s.slug, c];
    }),
  );
}

export default function OverviewScreen() {
  const navigation = useStackNavigation();
  const scroll = useRef<ScrollViewInstance>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((m?: string) => {
    setLoading(true);
    setError(null);
    api
      .dashboard(m)
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(month), [load, month]));

  const select = (m: string) => {
    setMonth(m);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  if (!data) {
    return (
      <View style={styles.centerFill}>
        {error ? (
          <>
            <Text style={styles.errorText}>Could not load your bills{'\n'}{error}</Text>
            <Button title="Try again" onPress={() => load(month)} />
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const colorOf = sliceColors(data.slices);
  const months = data.months.map((m) => m.month);
  const i = months.indexOf(data.month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const total = Number(data.total);
  const diff = data.previous_total != null ? total - Number(data.previous_total) : null;
  const vsAvg = data.average_total != null ? total - Number(data.average_total) : null;

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(month)} />}
    >
      {MOCK && <Text style={styles.mock}>MOCK MODE: data from shared/fixtures</Text>}

      {/* Month switcher + donut */}
      <View style={styles.card}>
        <View style={styles.switcher}>
          <Pressable onPress={() => prev && select(prev)} disabled={!prev} hitSlop={12}>
            <Text style={[styles.arrow, !prev && styles.arrowOff]}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{monthLabel(data.month)}</Text>
          <Pressable onPress={() => next && select(next)} disabled={!next} hitSlop={12}>
            <Text style={[styles.arrow, !next && styles.arrowOff]}>›</Text>
          </Pressable>
        </View>

        <Donut slices={data.slices.map((s) => ({ key: s.slug, value: Number(s.total), color: colorOf[s.slug] }))}>
          <Text style={styles.centerLabel}>{data.bills_count} bills</Text>
          <Text style={styles.centerTotal}>{total.toFixed(2)}</Text>
          <Text style={styles.centerLabel}>RON</Text>
          {data.delta_pct != null && (
            <Text style={[styles.centerDelta, { color: deltaColor(data.delta_pct) }]}>
              {deltaLabel(data.delta_pct)} vs {monthLabel(data.previous_month!, true)}
            </Text>
          )}
        </Donut>

        <View style={styles.split}>
          <Stat label="To pay" value={money(data.unpaid_total)} strong />
          <Stat label="Paid" value={money(data.paid_total)} />
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.statLabel}>Audit</Text>
            <SeverityBadge severity={data.audit_status} />
          </View>
        </View>
      </View>

      {/* Breakdown by provider (= donut legend) */}
      <Text style={styles.section}>Where the money goes</Text>
      <View style={styles.list}>
        {data.slices.map((s) => (
          <Pressable
            key={s.bill_id}
            onPress={() => navigation.navigate('Bill', { id: s.bill_id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.colorBar, { backgroundColor: colorOf[s.slug] }]} />
            <ProviderAvatar provider={s.provider} category={s.category} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.provider}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {s.share_pct.toFixed(0)}% of the month · {s.status}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={styles.rowTotal}>{money(s.total)}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {s.delta_pct != null && <Text style={[styles.delta, { color: deltaColor(s.delta_pct) }]}>{deltaLabel(s.delta_pct)}</Text>}
                {s.audit_status !== 'ok' && <SeverityBadge severity={s.audit_status} />}
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Compare */}
      <Text style={styles.section}>Compare</Text>
      <View style={[styles.card, { gap: 10, alignItems: 'stretch' }]}>
        <CompareRow
          label={data.previous_month ? `vs ${monthLabel(data.previous_month)}` : 'vs previous month'}
          diff={diff}
          pct={data.delta_pct}
          base={data.previous_total}
        />
        <CompareRow label="vs your monthly average" diff={vsAvg} pct={data.average_total ? Math.round((vsAvg! / Number(data.average_total)) * 1000) / 10 : null} base={data.average_total} />
      </View>

      {/* History */}
      <Text style={styles.section}>History · tap a month</Text>
      <View style={[styles.card, { alignItems: 'stretch' }]}>
        <MonthBars bars={data.months.map(monthBar)} selected={data.month} onSelect={select} />
      </View>
      <View style={styles.list}>
        {[...data.months].reverse().map((m, idx, arr) => {
          const before = arr[idx + 1];
          const d = before && Number(before.total) ? ((Number(m.total) - Number(before.total)) / Number(before.total)) * 100 : null;
          const sel = m.month === data.month;
          return (
            <Pressable key={m.month} onPress={() => select(m.month)} style={({ pressed }) => [styles.row, sel && styles.rowSel, pressed && { opacity: 0.6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{monthLabel(m.month)}</Text>
                <Text style={styles.muted}>{m.bills_count} bills</Text>
              </View>
              {m.audit_status !== 'ok' && <SeverityBadge severity={m.audit_status} />}
              <View style={{ alignItems: 'flex-end', minWidth: 96 }}>
                <Text style={styles.rowTotal}>{money(m.total)}</Text>
                {d != null && <Text style={[styles.delta, { color: deltaColor(d) }]}>{deltaLabel(Math.round(d * 10) / 10)}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, strong && { color: colors.primary }]}>{value}</Text>
    </View>
  );
}

function CompareRow({ label, diff, pct, base }: { label: string; diff: number | null; pct: number | null; base: string | null }) {
  return (
    <View style={styles.compareRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.muted}>{base != null ? money(base) : 'No data yet'}</Text>
      </View>
      {diff != null && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.rowTotal, { color: deltaColor(pct) }]}>
            {diff > 0 ? '+' : diff < 0 ? '−' : ''}
            {money(Math.abs(diff))}
          </Text>
          <Text style={[styles.delta, { color: deltaColor(pct) }]}>{deltaLabel(pct)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg },
  errorText: { textAlign: 'center', color: colors.muted },
  mock: { textAlign: 'center', backgroundColor: colors.highlight, padding: 4, fontSize: 12, borderRadius: 8, overflow: 'hidden' },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, alignItems: 'center', gap: 12 },
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  arrow: { fontSize: 30, color: colors.primary, paddingHorizontal: 12, lineHeight: 32 },
  arrowOff: { color: colors.border },
  monthTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  centerLabel: { color: colors.muted, fontSize: 13 },
  centerTotal: { fontSize: 30, fontWeight: '800', color: colors.text },
  centerDelta: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingTop: 12, borderTopWidth: 1, borderColor: colors.border },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { fontWeight: '700', fontSize: 16, color: colors.text },
  section: { fontWeight: '700', fontSize: 15, color: colors.text, marginTop: 4 },
  list: { backgroundColor: colors.card, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderColor: colors.border },
  rowSel: { backgroundColor: '#EEEAFE' },
  colorBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderRadius: 2 },
  rowTitle: { fontWeight: '600', color: colors.text },
  rowTotal: { fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 12, marginTop: 2 },
  delta: { fontSize: 12, fontWeight: '700' },
  compareRow: { flexDirection: 'row', alignItems: 'center' },
});
