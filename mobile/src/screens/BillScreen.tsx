import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api/client';
import type { Anomaly, AnomalyAction, AskResponse, BillDetail, LineItem } from '../api/types';
import { AnomalyCard } from '../components/AnomalyCard';
import { Button } from '../components/Button';
import { SeverityBadge } from '../components/SeverityBadge';
import type { ScreenProps } from '../navigation';
import { colors, money } from '../theme';

export default function BillScreen({ route, navigation }: ScreenProps<'Bill'>) {
  const { id } = route.params;
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBill(id)
      .then((b) => {
        setBill(b);
        navigation.setOptions({ title: b.provider });
      })
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, [id, navigation]);

  // Line codes referenced by any anomaly get highlighted ("tap me").
  const flagged = useMemo(
    () => new Set(bill?.audit.anomalies.flatMap((a) => a.line_item_codes) ?? []),
    [bill],
  );

  if (!bill) {
    return loadError ? (
      <Text style={[styles.muted, { textAlign: 'center', margin: 32 }]}>{loadError}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 40 }} />
    );
  }

  const ask = async (body: { question?: string; line_item_id?: number }) => {
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await api.ask(bill.id, body));
    } catch (e) {
      Alert.alert('Could not get an answer', String(e));
    } finally {
      setAsking(false);
    }
  };

  // anomaly is undefined when the action comes from an AI answer.
  const onAction = (action: AnomalyAction, anomaly?: Anomaly) => {
    switch (action.type) {
      case 'dispute':
      case 'cancel_service':
        return navigation.navigate('Dispute', { billId: bill.id, anomalyId: anomaly?.id });
      case 'switch_supplier':
        return navigation.navigate('Offers', { billId: bill.id });
      case 'autopay_rule':
        return navigation.navigate('AutoPay', {
          billId: bill.id,
          provider: bill.provider,
          suggestedMax: Math.ceil(Number(bill.total) * 1.1),
        });
      case 'ask':
        return ask({ question: 'Why did my bill go up this month?' });
      case 'submit_reading':
        // TODO(frontend): small modal with a number input; demo-only, no backend call needed.
        return Alert.alert('Submit reading', 'Demo: this opens the supplier self-reading (autocitire) form.');
    }
  };

  const pay = async () => {
    const r = await api.pay(bill.id, 'manual');
    setBill({ ...bill, status: r.status });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        <View style={styles.header}>
          <Text style={styles.muted}>
            {bill.period_start} → {bill.period_end}
          </Text>
          <Text style={styles.total}>{money(bill.total)}</Text>
          <SeverityBadge severity={bill.audit.status} />
          {bill.consumption != null && (
            <Text style={styles.muted}>
              {bill.consumption} {bill.consumption_unit} · index {bill.index_type}
              {bill.all_in_unit_price ? ` · ${bill.all_in_unit_price} RON/${bill.consumption_unit}` : ''}
            </Text>
          )}
        </View>

        {bill.audit.anomalies.map((a) => (
          <AnomalyCard key={a.id} anomaly={a} onAction={(action) => onAction(action, a)} />
        ))}

        {/* TODO(frontend): history bar chart from bill.history (total + consumption), estimated months in red */}

        <Text style={styles.section}>Your bill, line by line · tap any line</Text>
        <View style={styles.lines}>
          {bill.line_items.map((li) => (
            <LineRow key={li.id} item={li} flagged={flagged.has(li.code)} onPress={() => ask({ line_item_id: li.id })} />
          ))}
        </View>

        {(asking || answer) && (
          <View style={styles.answer}>
            {asking ? (
              <ActivityIndicator />
            ) : (
              <>
                <Text style={styles.answerQ}>{answer!.line_item ? answer!.line_item.label : answer!.question}</Text>
                <Text style={styles.answerText}>{answer!.answer}</Text>
                {answer!.sources.length > 0 && (
                  <View style={styles.chips}>
                    {answer!.sources.map((s) => (
                      <Text key={s} style={styles.chip}>
                        📎 {s}
                      </Text>
                    ))}
                  </View>
                )}
                {answer!.suggested_actions.map((a) => (
                  <Button key={a.type} title={a.label} onPress={() => onAction(a)} variant="secondary" style={{ height: 40 }} />
                ))}
              </>
            )}
          </View>
        )}

        {bill.status === 'unpaid' ? (
          <Button title={`Pay ${money(bill.total)}`} onPress={pay} />
        ) : (
          <Text style={[styles.muted, { textAlign: 'center' }]}>Status: {bill.status}</Text>
        )}
      </ScrollView>

      <View style={styles.askBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask about this bill… e.g. Why is VAT so high?"
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={() => question && ask({ question })}
          returnKeyType="send"
        />
        <Button title="Ask" onPress={() => question && ask({ question })} disabled={!question || asking} />
      </View>
    </KeyboardAvoidingView>
  );
}

function LineRow({ item, flagged, onPress }: { item: LineItem; flagged: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.line, flagged && styles.flagged, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineLabel}>{item.label}</Text>
        <Text style={styles.muted}>
          {item.label_en}
          {item.quantity != null && item.unit_price ? ` · ${item.quantity} ${item.unit} × ${Number(item.unit_price)}` : ''}
        </Text>
      </View>
      <Text style={styles.lineAmount}>{money(item.amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 6, alignItems: 'flex-start' },
  total: { fontSize: 32, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  section: { fontWeight: '700', fontSize: 15, marginTop: 8, color: colors.text },
  lines: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden' },
  line: { flexDirection: 'row', padding: 14, borderBottomWidth: 1, borderColor: colors.border, gap: 8 },
  flagged: { backgroundColor: colors.highlight },
  lineLabel: { fontWeight: '600', color: colors.text },
  lineAmount: { fontWeight: '700', color: colors.text },
  answer: { backgroundColor: '#EEEAFE', borderRadius: 14, padding: 16, gap: 6 },
  answerQ: { fontWeight: '700', color: colors.primary },
  answerText: { color: colors.text, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 12, color: colors.primary, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  askBar: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
  input: { flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.bg, paddingHorizontal: 12 },
});
