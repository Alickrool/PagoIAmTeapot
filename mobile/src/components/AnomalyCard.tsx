import { StyleSheet, Text, View } from 'react-native';
import type { Anomaly, AnomalyAction } from '../api/types';
import { useTheme } from '../mode';
import { severityIcon } from '../theme';
import { Button } from './Button';

export function AnomalyCard({ anomaly, onAction }: { anomaly: Anomaly; onAction: (a: AnomalyAction) => void }) {
  const t = useTheme();
  const s = t.sev[anomaly.severity];
  return (
    <View style={[styles.card, { backgroundColor: s.bg, borderRadius: t.radius, padding: t.pad }]}>
      <Text style={[styles.title, { color: s.color, fontSize: t.fs(16) }]}>
        {severityIcon[anomaly.severity]} {anomaly.title}
      </Text>
      <Text style={{ color: t.text, lineHeight: t.fs(21), fontSize: t.fs(14) }}>{anomaly.message}</Text>
      {anomaly.actions.length > 0 && (
        <View style={styles.actions}>
          {anomaly.actions.map((a, i) => (
            <Button key={a.type} title={a.label} onPress={() => onAction(a)} variant={i === 0 && anomaly.severity === 'critical' ? 'primary' : 'secondary'} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  title: { fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
