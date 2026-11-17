import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { Discrepancy, IndexType, ProviderBill, ProviderHistory, ValidationStatus } from '../api/types';
import { ReviewMark } from '../components/ValidationCard';
import { isFlagged } from '../validation';
import { Button } from '../components/Button';
import { MonthBars } from '../components/charts/MonthBars';
import { ProviderAvatar } from '../components/ProviderAvatar';
import type { ScreenProps } from '../navigation';
import { useStyles, useTheme, type Theme } from '../mode';
import { category, deltaColor, deltaLabel, money, monthLabel } from '../theme';
import { Icon } from '../components/Icon';
import { paidLabel, rowTone } from '../status';

type Metric = 'total' | 'consumption';

const INDEX_LABEL: Record<IndexType, string> = { real: 'Index citit', self: 'Autocitire', estimated: 'Estimat', none: '' };

export default function ProviderScreen({ route, navigation }: ScreenProps<'Provider'>) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const { slug, provider, month } = route.params;
  const [data, setData] = useState<ProviderHistory | null>(null);
  const [statuses, setStatuses] = useState<Map<number, ValidationStatus>>(new Map());
  const [paidDates, setPaidDates] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('total');
  const [selected, setSelected] = useState<number | null>(null);

  const fetchHistory = useCallback(
    () =>
      api
        .providerHistory(slug)
        .then((d) => {
          setData(d);
          api.billStatuses().then(setStatuses).catch(() => {});
          api.paidDates().then(setPaidDates).catch(() => {});
          // Opened from search with a month: select that month's bill in the chart.
          const hit = month ? d.bills.find((b) => b.period_end.slice(0, 7) === month) : undefined;
          if (hit) setSelected(hit.id);
        })
        .catch((e) => setError(String(e?.message ?? e))),
    [slug, month],
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
            <Button title="Încearcă din nou" onPress={load} />
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
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
      {/* Header + stats */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ProviderAvatar provider={data.provider} category={data.category} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{data.provider}</Text>
            <Text style={styles.muted}>
              {c.label} · {data.bills.length} facturi
            </Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat label="Medie" value={data.stats.average_total ? money(data.stats.average_total) : '–'} />
          <Stat label="Minim" value={money(data.stats.min_total)} />
          <Stat label="Maxim" value={money(data.stats.max_total)} />
        </View>
        <View style={styles.stats}>
          <Stat label="Ultimele 12 luni" value={money(data.stats.sum_12m)} />
          {data.stats.average_consumption != null && <Stat label="Consum mediu" value={`${data.stats.average_consumption} ${unit}`} />}
        </View>
      </View>

      {/* Chart */}
      <View style={[styles.card, { gap: 12 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.section, { flex: 1, marginTop: 0 }]}>Ultimele 12 facturi</Text>
          {hasConsumption && (
            <View style={styles.toggle}>
              {(['total', 'consumption'] as Metric[]).map((m) => (
                <Pressable key={m} onPress={() => setMetric(m)} style={[styles.toggleBtn, metric === m && styles.toggleOn]}>
                  <Text style={[styles.toggleText, metric === m && { color: t.onAccent }]}>{m === 'total' ? 'RON' : unit}</Text>
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
          <Legend color={t.accent} label="Selectată" />
          <Legend color={t.sev.critical.color} label="Index estimat" />
          <Legend color={t.sev.critical.color} label="Problemă găsită" dot />
        </View>
        {selected != null && <SelectedBill bill={data.bills.find((b) => b.id === selected)!} unit={unit} onOpen={open} />}
      </View>

      {/* Discrepancies */}
      <Text style={styles.section}>
        Discrepanțe {data.discrepancies.length > 0 ? `· ${data.discrepancies.length}` : ''}
      </Text>
      {data.discrepancies.length === 0 ? (
        <View style={[styles.card, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
          <Icon name="check" color={t.sev.ok.color} size={26} />
          <Text style={{ flex: 1, color: t.text }}>Fiecare factură e în linie cu cele de dinainte.</Text>
        </View>
      ) : (
        data.discrepancies.map((d) => <DiscrepancyCard key={d.id} d={d} onPress={() => open(d.bill_id)} />)
      )}

      {/* Timeline */}
      <Text style={styles.section}>Toate facturile · {data.bills.length}</Text>
      <View style={styles.list}>
        <ScrollView style={{ maxHeight: t.mode === 'senior' ? 420 : 340 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {data.bills.map((b) => (
            <BillRow key={b.id} bill={b} unit={unit} flagged={isFlagged(statuses.get(b.id))} paidAt={paidDates.get(b.id)} onPress={() => open(b.id)} />
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function SelectedBill({ bill, unit, onOpen }: { bill: ProviderBill; unit: string; onOpen: (id: number) => void }) {
  const styles = useStyles(makeStyles);
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
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const s = t.sev[d.severity];
  const numeric = d.previous_value != null && d.current_value != null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.disc, { backgroundColor: s.bg, borderColor: s.color }, pressed && { opacity: 0.7 }]}>
      <View style={styles.headerRow}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
        <Text style={[styles.discTitle, { color: s.color, flex: 1 }]}>
          {d.title}
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

function BillRow({ bill, unit, flagged, paidAt, onPress }: { bill: ProviderBill; unit: string; flagged: boolean; paidAt?: string; onPress: () => void }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const tone = rowTone(bill.audit_status, t); // the whole box: red = anomaly, yellow = attention
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, tone && { backgroundColor: tone.bg, borderColor: tone.border }, pressed && { opacity: 0.6 }]}
      accessibilityLabel={`${monthLabel(bill.period_end.slice(0, 7))}${bill.audit_status !== 'ok' ? `, ${bill.audit_status === 'critical' ? 'anomalie' : 'atenție'}` : ''}`}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.rowTitle}>{monthLabel(bill.period_end.slice(0, 7))}</Text>
          {flagged && <ReviewMark />}
        </View>
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
            <Text key={a.id} style={[styles.chip, { backgroundColor: tone ? t.surface : t.sev[a.severity].bg, color: t.sev[a.severity].color }]}>
              {a.title}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowTotal}>{money(bill.total)}</Text>
        {bill.delta_total_pct != null && (
          <Text style={[styles.delta, { color: deltaColor(bill.delta_total_pct, t) }]}>{deltaLabel(bill.delta_total_pct)}</Text>
        )}
        <Text style={[styles.muted, { fontSize: t.fs(12) }]}>{paidLabel(bill.status, paidAt)}</Text>
      </View>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.small}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Legend({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: dot ? 6 : 10, height: dot ? 6 : 10, borderRadius: dot ? 3 : 2, backgroundColor: color }} />
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: t.bg },
  card: { backgroundColor: t.surface, borderRadius: 18, padding: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: t.text },
  muted: { color: t.muted, fontSize: 12, marginTop: 2 },
  small: { color: t.muted, fontSize: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  statValue: { fontWeight: '700', color: t.text, marginTop: 2 },
  section: { fontWeight: '700', fontSize: 15, color: t.text, marginTop: 4 },
  toggle: { flexDirection: 'row', backgroundColor: t.bg, borderRadius: 999, padding: 3 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  toggleOn: { backgroundColor: t.accent },
  toggleText: { fontSize: 12, fontWeight: '700', color: t.muted },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  selected: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface2, borderRadius: 12, padding: 12 },
  disc: { borderRadius: 14, padding: 14, gap: 6, borderLeftWidth: 4 },
  discTitle: { fontWeight: '700', fontSize: 15 },
  discMonth: { fontSize: 12, color: t.muted, fontWeight: '600' },
  discText: { color: t.text, lineHeight: 20 },
  fromTo: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  fromToText: { color: t.text, fontWeight: '600' },
  list: { borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 8, borderRadius: t.inner + 6, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  rowTitle: { fontWeight: '600', color: t.text },
  rowTotal: { fontWeight: '700', color: t.text },
  delta: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { fontSize: 11, color: t.muted, backgroundColor: t.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chipBad: { backgroundColor: t.sev.critical.bg, color: t.sev.critical.color },
});
