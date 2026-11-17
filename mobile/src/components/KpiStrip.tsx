import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { DashboardResponse } from '../api/types';
import { useStyles, useTheme, type Theme } from '../mode';
import { deltaColor, deltaLabel, money, monthLabel, monthName, tabular } from '../theme';

export interface Kpi {
  label: string;
  value: string;
  delta?: number | null; // colours the value like the other month comparisons
}

/** The four figures of the month, as a short report: total, paid, to pay, change vs the previous month. */
export function kpis(d: Pick<DashboardResponse, 'total' | 'paid_total' | 'unpaid_total' | 'delta_pct' | 'previous_month'>): Kpi[] {
  return [
    { label: 'Total lună', value: money(d.total) },
    { label: 'Achitat', value: money(d.paid_total) },
    { label: 'De plată', value: money(d.unpaid_total) },
    {
      label: d.previous_month ? `Față de ${monthName(d.previous_month)}` : 'Față de luna trecută',
      value: d.delta_pct == null ? '–' : deltaLabel(d.delta_pct),
      delta: d.delta_pct,
    },
  ];
}

/** Plain-text report for "Exportă" (mail, WhatsApp, notes). */
export function reportText(d: DashboardResponse): string {
  const lines = [`Sinteza lunii ${monthLabel(d.month)} · AI Pago`, ...kpis(d).map((k) => `${k.label}: ${k.value}`)];
  if (d.slices.length) lines.push('', 'Pe furnizori:', ...d.slices.map((s) => `• ${s.provider}: ${money(s.total)}${s.status === 'paid' ? '' : ' (de plată)'}`));
  return lines.join('\n');
}

/** "Profesional" mode: a compact executive summary under the budget ring, with an export button. */
export function KpiStrip({ data }: { data: DashboardResponse }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const items = kpis(data);
  return (
    <View style={styles.card} testID="kpi-strip">
      <View style={styles.head}>
        <View style={styles.bar} />
        <Text style={styles.title}>Sinteza lunii</Text>
        <Pressable
          onPress={() => Share.share({ message: reportText(data) }).catch(() => {})}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Exportă sinteza pentru ${monthLabel(data.month)}`}
        >
          <Text style={styles.export}>Exportă</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {items.map((k, i) => (
          <View key={k.label} style={[styles.cell, i % 2 === 1 && styles.cellRight, i > 1 && styles.cellBottom]}>
            <Text style={styles.label} numberOfLines={1}>
              {k.label}
            </Text>
            <Text style={[styles.value, tabular, k.delta !== undefined && { color: deltaColor(k.delta ?? null, t) }]} numberOfLines={1}>
              {k.value}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.foot}>
        {data.bills_count} {data.bills_count === 1 ? 'factură' : 'facturi'} · {monthLabel(data.month)}
      </Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface, borderRadius: t.radius, borderWidth: 1, borderColor: t.border, padding: t.pad, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bar: { width: 4, height: 16, borderRadius: 2, backgroundColor: t.accent },
    title: { flex: 1, color: t.text, fontSize: t.fs(12), fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
    export: { color: t.accent, fontSize: t.fs(13), fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: t.border },
    cell: { width: '50%', paddingVertical: 10, paddingRight: 10, gap: 2 },
    cellRight: { paddingLeft: 12, paddingRight: 0, borderLeftWidth: 1, borderLeftColor: t.border },
    cellBottom: { borderTopWidth: 1, borderTopColor: t.border },
    label: { color: t.muted, fontSize: t.fs(11), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    value: { color: t.text, fontSize: t.fs(17), fontWeight: '800' },
    foot: { color: t.muted, fontSize: t.fs(12) },
  });
