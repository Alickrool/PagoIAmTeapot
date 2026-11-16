import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { Discrepancy, IndexType, ProviderBill, ProviderHistory } from '../api/types';
import { Button } from '../components/Button';
import { MonthBars } from '../components/charts/MonthBars';
import { ProviderAvatar } from '../components/ProviderAvatar';
import type { ScreenProps } from '../navigation';
import { category, colors, deltaColor, deltaLabel, money, monthLabel, severity } from '../theme';

type Metric = 'total' | 'consumption';

const INDEX_LABEL: Record<IndexType, string> = { real: 'Real index', self: 'Self-read', estimated: 'Estimated', none: '' };

export default function ProviderScreen({ route, navigation }: ScreenProps<'Provider'>) {
  const { slug, provider } = route.params;
  const [data, setData] = useState<ProviderHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('total');
  const [selected, setSelected] = useState<number | null>(null);

  const fetchHistory = useCallback(
    () =>
      api
        .providerHistory(slug)
        .then(setData)
        .catch((e) => setError(String(e?.message ?? e))),
    [slug],
  );

  const load = () => {
    setError(null);
    fetchHistory();
  };

  useEffect(() => {
    navigation.setOptions({ title: provider });
    fetchHistory();
  }, [navigation, provider, fetchHistory]);

  if (!data) {
    return (
      <View style={styles.centerFill}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button title="Try again" onPress={load} />
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const c = category[data.category] ?? category.other;
  const hasConsumption = data.bills.some((b) => b.consumption != null);
  const chronological = [...data.bills].reverse().slice(-12);
  const open = (id: number) => navigation.navigate('Bill', { id });
  const unit = data.consumption_unit;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
      {/* Header + stats */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ProviderAvatar provider={data.provider} category={data.category} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{data.provider}</Text>
            <Text style={styles.muted}>
              {c.icon} {c.label} · {data.bills.length} bills
            </Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat label="Average" value={data.stats.average_total ? money(data.stats.average_total) : '–'} />
          <Stat label="Lowest" value={money(data.stats.min_total)} />
          <Stat label="Highest" value={money(data.stats.max_total)} />
        </View>
        <View style={styles.stats}>
          <Stat label="Last 12 months" value={money(data.stats.sum_12m)} />
          {data.stats.average_consumption != null && <Stat label="Avg. consumption" value={`${data.stats.average_consumption} ${unit}`} />}
        </View>
      </View>

      {/* Chart */}
      <View style={[styles.card, { gap: 12 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.section, { flex: 1, marginTop: 0 }]}>Last 12 bills</Text>
          {hasConsumption && (
            <View style={styles.toggle}>
              {(['total', 'consumption'] as Metric[]).map((m) => (
                <Pressable key={m} onPress={() => setMetric(m)} style={[styles.toggleBtn, metric === m && styles.toggleOn]}>
                  <Text style={[styles.toggleText, metric === m && { color: colors.primaryText }]}>{m === 'total' ? 'RON' : unit}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <MonthBars
          bars={chronological.map((b) => ({
            key: String(b.id),
            label: monthLabel(b.period_end.slice(0, 7), true),
            value: metric === 'total' ? Number(b.total) : (b.consumption ?? 0),
            status: b.audit_status,
            highlight: b.index_type === 'estimated',
          }))}
          selected={selected != null ? String(selected) : String(data.bills[0]?.id)}
          onSelect={(k) => setSelected(Number(k))}
        />
        <View style={styles.legend}>
          <Legend color={colors.primary} label="Selected" />
          <Legend color="#EF4444" label="Estimated index" />
          <Legend color={severity.critical.color} label="Issue found" dot />
        </View>
        {selected != null && <SelectedBill bill={data.bills.find((b) => b.id === selected)!} unit={unit} onOpen={open} />}
      </View>

      {/* Discrepancies */}
      <Text style={styles.section}>
        Discrepancies {data.discrepancies.length > 0 ? `· ${data.discrepancies.length}` : ''}
      </Text>
      {data.discrepancies.length === 0 ? (
        <View style={[styles.card, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
          <Text style={{ fontSize: 22 }}>🟢</Text>
          <Text style={{ flex: 1, color: colors.text }}>Every bill is in line with the ones before it.</Text>
        </View>
      ) : (
        data.discrepancies.map((d) => <DiscrepancyCard key={d.id} d={d} onPress={() => open(d.bill_id)} />)
      )}

      {/* Timeline */}
      <Text style={styles.section}>All bills</Text>
      <View style={styles.list}>
        {data.bills.map((b) => (
          <BillRow key={b.id} bill={b} unit={unit} onPress={() => open(b.id)} />
        ))}
      </View>
    </ScrollView>
  );
}

function SelectedBill({ bill, unit, onOpen }: { bill: ProviderBill; unit: string; onOpen: (id: number) => void }) {
  return (
    <Pressable onPress={() => onOpen(bill.id)} style={styles.selected}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{monthLabel(bill.period_end.slice(0, 7))}</Text>
        <Text style={styles.muted}>
          {bill.consumption != null ? `${bill.consumption} ${unit}` : ''}
          {bill.unit_price != null ? ` · ${bill.unit_price} RON/${unit}` : ''}
        </Text>
      </View>
      <Text style={styles.rowTotal}>{money(bill.total)} ›</Text>
    </Pressable>
  );
}

function DiscrepancyCard({ d, onPress }: { d: Discrepancy; onPress: () => void }) {
  const s = severity[d.severity];
  const numeric = d.previous_value != null && d.current_value != null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.disc, { backgroundColor: s.bg, borderColor: s.color }, pressed && { opacity: 0.7 }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.discTitle, { color: s.color, flex: 1 }]}>
          {s.icon} {d.title}
        </Text>
        <Text style={styles.discMonth}>{monthLabel(d.period_end.slice(0, 7))}</Text>
      </View>
      <Text style={styles.discText}>{d.message}</Text>
      {numeric && (
        <View style={styles.fromTo}>
          <Text style={styles.fromToText}>
            {d.previous_value} {d.unit}
          </Text>
          <Text style={[styles.fromToText, { color: s.color }]}>→</Text>
          <Text style={[styles.fromToText, { fontWeight: '800' }]}>
            {d.current_value} {d.unit}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function BillRow({ bill, unit, onPress }: { bill: ProviderBill; unit: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={[styles.statusBar, { backgroundColor: severity[bill.audit_status].color }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{monthLabel(bill.period_end.slice(0, 7))}</Text>
        <View style={styles.chips}>
          {bill.consumption != null && (
            <Text style={styles.chip}>
              {bill.consumption} {unit}
              {bill.delta_consumption_pct != null ? ` (${deltaLabel(bill.delta_consumption_pct)})` : ''}
            </Text>
          )}
          {INDEX_LABEL[bill.index_type] !== '' && (
            <Text style={[styles.chip, bill.index_type === 'estimated' && styles.chipBad]}>{INDEX_LABEL[bill.index_type]}</Text>
          )}
          {bill.anomalies.map((a) => (
            <Text key={a.id} style={[styles.chip, { backgroundColor: severity[a.severity].bg, color: severity[a.severity].color }]}>
              {a.title}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowTotal}>{money(bill.total)}</Text>
        {bill.delta_total_pct != null && (
          <Text style={[styles.delta, { color: deltaColor(bill.delta_total_pct) }]}>{deltaLabel(bill.delta_total_pct)}</Text>
        )}
        <Text style={styles.muted}>{bill.status}</Text>
      </View>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.small}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Legend({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: dot ? 6 : 10, height: dot ? 6 : 10, borderRadius: dot ? 3 : 2, backgroundColor: color }} />
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 12, marginTop: 2 },
  small: { color: colors.muted, fontSize: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  statValue: { fontWeight: '700', color: colors.text, marginTop: 2 },
  section: { fontWeight: '700', fontSize: 15, color: colors.text, marginTop: 4 },
  toggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 999, padding: 3 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  selected: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEEAFE', borderRadius: 12, padding: 12 },
  disc: { borderRadius: 14, padding: 14, gap: 6, borderLeftWidth: 4 },
  discTitle: { fontWeight: '700', fontSize: 15 },
  discMonth: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  discText: { color: '#1F2937', lineHeight: 20 },
  fromTo: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  fromToText: { color: colors.text, fontWeight: '600' },
  list: { backgroundColor: colors.card, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingLeft: 18, borderBottomWidth: 1, borderColor: colors.border },
  statusBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderRadius: 2 },
  rowTitle: { fontWeight: '600', color: colors.text },
  rowTotal: { fontWeight: '700', color: colors.text },
  delta: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { fontSize: 11, color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chipBad: { backgroundColor: '#FEE2E2', color: '#B91C1C' },
});
