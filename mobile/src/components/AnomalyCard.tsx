import { StyleSheet, Text, View } from 'react-native';
import type { Anomaly, AnomalyAction } from '../api/types';
import { severity as sev } from '../theme';
import { Button } from './Button';

export function AnomalyCard({ anomaly, onAction }: { anomaly: Anomaly; onAction: (a: AnomalyAction) => void }) {
  const s = sev[anomaly.severity];
  return (
    <View style={[styles.card, { backgroundColor: s.bg, borderColor: s.color }]}>
      <Text style={[styles.title, { color: s.color }]}>
        {s.icon} {anomaly.title}
      </Text>
      <Text style={styles.message}>{anomaly.message}</Text>
      {anomaly.actions.length > 0 && (
        <View style={styles.actions}>
          {anomaly.actions.map((a) => (
            <Button key={a.type} title={a.label} onPress={() => onAction(a)} variant="secondary" style={{ height: 40 }} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, gap: 8, borderLeftWidth: 4 },
  title: { fontWeight: '700', fontSize: 15 },
  message: { color: '#1F2937', lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
