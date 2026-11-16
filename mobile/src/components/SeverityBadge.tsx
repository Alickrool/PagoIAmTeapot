import { StyleSheet, Text, View } from 'react-native';
import type { Severity } from '../api/types';
import { severity as sev } from '../theme';

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = sev[severity];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.color }]}>
        {s.icon} {s.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '600' },
});
