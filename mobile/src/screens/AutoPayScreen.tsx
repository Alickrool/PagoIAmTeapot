import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { colors } from '../theme';

export default function AutoPayScreen({ route, navigation }: ScreenProps<'AutoPay'>) {
  const { billId, provider, suggestedMax } = route.params;
  const [max, setMax] = useState(String(suggestedMax));
  const [blockEstimated, setBlockEstimated] = useState(true);
  const [blockAnomaly, setBlockAnomaly] = useState(true);

  const save = async () => {
    await api.createAutoPayRule({
      provider,
      max_amount: max,
      block_if_estimated: blockEstimated,
      block_if_anomaly: blockAnomaly,
    });
    // Demo: immediately simulate what auto-pay would do with this month's bill.
    const r = await api.pay(billId, 'auto');
    Alert.alert(
      r.status === 'paid' ? 'Auto-pay would pay this bill ✅' : 'Auto-pay would block this bill 🛡️',
      r.reasons.join('\n') || 'All checks passed.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} style={{ backgroundColor: colors.bg }}>
      <Text style={styles.title}>Pay {provider} automatically only if:</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Total is under (RON)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={max} onChangeText={setMax} />
        <Row label="The index is not estimated" value={blockEstimated} onChange={setBlockEstimated} />
        <Row label="No critical anomaly was found" value={blockAnomaly} onChange={setBlockAnomaly} />
      </View>
      <Text style={styles.muted}>Otherwise the payment is held and you get a notification.</Text>
      <Button title="Turn on Smart Auto-Pay" onPress={save} />
    </ScrollView>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={{ flex: 1, color: colors.text }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 12 },
  label: { color: colors.muted },
  input: { height: 48, borderRadius: 12, backgroundColor: colors.bg, paddingHorizontal: 12, fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { color: colors.muted },
});
