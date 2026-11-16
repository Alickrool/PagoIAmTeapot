import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { PayResponse } from '../api/types';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';


export default function AutoPayScreen({ route, navigation }: ScreenProps<'AutoPay'>) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const copy = useCopy();
  const { billId, provider, suggestedMax } = route.params;
  const [max, setMax] = useState(String(suggestedMax));
  const [blockEstimated, setBlockEstimated] = useState(true);
  const [blockAnomaly, setBlockAnomaly] = useState(true);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createAutoPayRule({
        provider,
        max_amount: max,
        block_if_estimated: blockEstimated,
        block_if_anomaly: blockAnomaly,
      });
      // Demo: immediately simulate what auto-pay would do with this month's bill (A6: result on screen, not an Alert).
      setResult(await api.pay(billId, 'auto'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const ok = result.status === 'paid';
    const s = t.sev[ok ? 'ok' : 'warning'];
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} style={{ backgroundColor: t.bg }}>
        <View style={[styles.card, { backgroundColor: s.bg }]}>
          <Text style={[styles.title, { color: s.color }]}>{ok ? copy.autopayOk : copy.autopayBlocked}</Text>
          {result.reasons.length === 0 ? (
            <Text style={{ color: t.text, fontSize: t.fs(15) }}>Toate verificările au trecut.</Text>
          ) : (
            result.reasons.map((r) => (
              <Text key={r} style={{ color: t.text, fontSize: t.fs(15), lineHeight: t.fs(22) }}>
                • {r}
              </Text>
            ))
          )}
        </View>
        <Text style={styles.muted}>Regula pentru {provider} e activă: sub {max} lei{blockEstimated ? ', fără index estimat' : ''}{blockAnomaly ? ', fără anomalii grave' : ''}.</Text>
        <Button title="Gata" onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} style={{ backgroundColor: t.bg }}>
      <Text style={styles.title}>Plătește {provider} automat doar dacă:</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Totalul e sub (lei)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={max} onChangeText={setMax} accessibilityLabel="Limita în lei" />
        <Row label="Indexul nu e estimat" value={blockEstimated} onChange={setBlockEstimated} />
        <Row label="Nu s-a găsit nicio anomalie gravă" value={blockAnomaly} onChange={setBlockAnomaly} />
      </View>
      <Text style={styles.muted}>Altfel plata rămâne în așteptare și primești o notificare.</Text>
      {error && <Text style={{ color: t.sev.critical.color, fontSize: t.fs(14) }}>{error}</Text>}
      {saving ? <ActivityIndicator color={t.accent} /> : <Button title="Pornește plata automată" onPress={save} />}
    </ScrollView>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={{ flex: 1, color: t.text, fontSize: t.fs(15) }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.border }} accessibilityLabel={label} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  title: { fontSize: t.fs(18), fontWeight: '800', color: t.text, lineHeight: t.fs(24) },
  card: { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, gap: 12 },
  label: { color: t.muted, fontSize: t.fs(14) },
  input: { height: t.touch, borderRadius: t.inner + 4, backgroundColor: t.bg, color: t.text, paddingHorizontal: 12, fontSize: t.fs(18) },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: t.touch },
  muted: { color: t.muted, fontSize: t.fs(14) },
});
