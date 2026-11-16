import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AuditStatus } from '../../api/types';
import { useTheme } from '../../mode';
import { monthLabel } from '../../theme';

export interface Bar {
  key: string; // month "2026-10" or bill id
  label: string;
  value: number;
  status?: AuditStatus; // dot above the bar when not ok
  highlight?: boolean; // e.g. estimated index -> red bar
}

/** Vertical bar chart built from Views (works on web and in Expo Go). Tap a bar to select it. */
export function MonthBars({
  bars,
  selected,
  onSelect,
  height = 120,
}: {
  bars: Bar[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const t = useTheme();
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <View style={[styles.row, { height: height + 34 }]}>
      {bars.map((b) => {
        const isSel = b.key === selected;
        const color = b.highlight ? t.sev.critical.color : isSel ? t.accent : t.surface2;
        return (
          <Pressable key={b.key} style={styles.col} onPress={() => onSelect?.(b.key)} disabled={!onSelect}>
            <View style={{ height: 10, justifyContent: 'center' }}>
              {b.status && b.status !== 'ok' && <View style={[styles.dot, { backgroundColor: t.sev[b.status].color }]} />}
            </View>
            <View style={{ height, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
              <View style={[styles.bar, { height: Math.max((b.value / max) * height, 3), backgroundColor: color }]} />
            </View>
            <Text style={[styles.label, { color: isSel ? t.accent : t.muted, fontSize: t.fs(10) }, isSel && styles.labelSel]} numberOfLines={1}>
              {b.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const monthBar = (m: { month: string; total: string; audit_status: AuditStatus }): Bar => ({
  key: m.month,
  label: monthLabel(m.month, true),
  value: Number(m.total),
  status: m.audit_status,
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '70%', maxWidth: 22, borderRadius: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {},
  labelSel: { fontWeight: '800' },
});
