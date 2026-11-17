import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { api } from '../api/client';
import { slugify } from '../api/derive';
import { acceptProvider, pendingProviders } from '../providerList';
import { questionsFor } from '../questions';
import type { Anomaly, AnomalyAction, AskResponse, BillDetail, LineItem, Recalculation } from '../api/types';
import { AnomalyCard } from '../components/AnomalyCard';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';
import { paidLabel } from '../status';
import { ValidationCard } from '../components/ValidationCard';
import { Icon } from '../components/Icon';
import { ReadingModal } from '../components/ReadingModal';
import { SeverityBadge } from '../components/SeverityBadge';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import type { ScreenProps } from '../navigation';
import { money, tabular } from '../theme';

export default function BillScreen({ route, navigation }: ScreenProps<'Bill'>) {
  const { id, notice } = route.params;
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const scroll = useRef<ScrollViewInstance>(null);
  const answerY = useRef(0);

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const [recalc, setRecalc] = useState<Recalculation | null>(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const [askAddProvider, setAskAddProvider] = useState(false);
  const [isPending, setIsPending] = useState(false); // provider not in "my providers" yet
  const [pdfNote, setPdfNote] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBill(id)
      .then((b) => {
        setBill(b);
        navigation.setOptions({ title: b.provider });
        pendingProviders().then((p) => setIsPending(p.has(slugify(b.provider))));
      })
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, [id, navigation]);

  // Line codes referenced by any anomaly get highlighted ("tap me").
  const flagged = useMemo(() => new Set(bill?.audit.anomalies.flatMap((a) => a.line_item_codes) ?? []), [bill]);

  const questions = bill ? questionsFor(bill, t.mode) : [];

  if (!bill) {
    return loadError ? (
      <Text style={[styles.muted, { textAlign: 'center', margin: 32 }]}>{loadError}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
    );
  }

  const scrollToAnswer = () => setTimeout(() => scroll.current?.scrollTo({ y: Math.max(answerY.current - 12, 0), animated: true }), 60);

  const ask = async (body: { question?: string; line_item_id?: number }) => {
    setAsking(true);
    setAnswer(null);
    setAskError(null);
    scrollToAnswer();
    try {
      setAnswer(await api.ask(bill.id, body));
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
      scrollToAnswer();
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
        return navigation.navigate('AutoPay', { billId: bill.id, provider: bill.provider, suggestedMax: Math.ceil(Number(bill.total) * 1.1) });
      case 'ask':
        return ask({ question: questions[0] });
      case 'submit_reading':
        return setReadingOpen(true);
    }
  };

  const doPay = async () => {
    setConfirmPay(false);
    setPaying(true);
    try {
      const r = await api.pay(bill.id, 'manual');
      setBill({ ...bill, status: r.status, paid_at: r.status === 'paid' ? new Date().toISOString().slice(0, 10) : null });
      // First bill from this provider (came in through a scan)? Offer to add it to "my providers".
      if (r.status === 'paid' && isPending) setAskAddProvider(true);
    } finally {
      setPaying(false);
    }
  };

  const openPdf = async () => {
    setPdfNote(null);
    if (bill.file_url && bill.file_url.toLowerCase().endsWith('.pdf')) return Linking.openURL(bill.file_url);
    if (await api.hasBillPdf(bill.id)) return Linking.openURL(api.billPdfUrl(bill.id));
    setPdfNote('PDF-ul acestei facturi nu e încă disponibil.');
  };

  // A3: a critical bill asks for confirmation before paying.
  const pay = () => (bill.audit.status === 'critical' ? setConfirmPay(true) : doPay());

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={styles.header}>
          <Text style={styles.muted}>
            {bill.period_start} → {bill.period_end}
          </Text>
          <Text style={[styles.total, tabular]}>{money(bill.total)}</Text>
          <SeverityBadge severity={bill.audit.status} />
          {recalc && (
            <Text style={[styles.recalc, tabular]}>
              {copy.readingDone(recalc.difference)} ({money(recalc.previous_total)} → {money(recalc.new_total)})
            </Text>
          )}
          {bill.consumption != null && (
            <Text style={[styles.muted, tabular]}>
              {bill.consumption} {bill.consumption_unit} · index {bill.index_type}
              {bill.all_in_unit_price ? ` · ${bill.all_in_unit_price} lei/${bill.consumption_unit}` : ''}
            </Text>
          )}
          <View style={styles.headerActions}>
            <Pressable onPress={openPdf} style={({ pressed }) => [styles.pdfBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button">
              <Icon name="document" size={18} color={t.accent} />
              <Text style={styles.pdfText}>Vezi factura (PDF)</Text>
            </Pressable>
            {isPending && (
              <Pressable
                onPress={() => {
                  acceptProvider(slugify(bill.provider));
                  setIsPending(false);
                }}
                style={({ pressed }) => [styles.pdfBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <Icon name="plus" size={18} color={t.accent} />
                <Text style={styles.pdfText}>Adaugă la furnizori</Text>
              </Pressable>
            )}
          </View>
          {pdfNote && <Text style={styles.muted}>{pdfNote}</Text>}
        </View>

        <ValidationCard
          validation={bill.validation}
          onConfirm={async () => {
            const updated = await api.confirmBill(bill.id);
            setBill(updated);
          }}
        />

        {bill.audit.anomalies.map((a) => (
          <AnomalyCard key={a.id} anomaly={a} onAction={(action) => onAction(action, a)} />
        ))}

        <Text style={styles.section}>{copy.lines}</Text>
        <View style={styles.lines}>
          {bill.line_items.map((li) => (
            <LineRow key={li.id} item={li} flagged={flagged.has(li.code)} onPress={() => ask({ line_item_id: li.id })} />
          ))}
        </View>

        <View onLayout={(e) => (answerY.current = e.nativeEvent.layout.y)}>
          {(asking || answer || askError) && (
            <View style={styles.answer} accessibilityLiveRegion="polite">
              {asking ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <ActivityIndicator color={t.accent} />
                  <Text style={styles.muted}>…</Text>
                </View>
              ) : askError ? (
                <Text style={{ color: t.sev.critical.color, fontSize: t.fs(14) }}>{askError}</Text>
              ) : (
                <>
                  <Text style={styles.answerQ}>{answer!.line_item ? answer!.line_item.label : answer!.question}</Text>
                  <Text style={styles.answerText}>{answer!.answer}</Text>
                  {answer!.sources.length > 0 && (
                    <View style={styles.chips}>
                      {answer!.sources.map((s) => (
                        <Text key={s} style={styles.source}>
                          {s}
                        </Text>
                      ))}
                    </View>
                  )}
                  {answer!.suggested_actions.map((a) => (
                    <Button key={a.type} title={a.label} onPress={() => onAction(a)} variant="secondary" />
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        {bill.status === 'unpaid' ? (
          paying ? (
            <ActivityIndicator color={t.accent} style={{ height: t.touch }} />
          ) : (
            <Button title={copy.pay(bill.total)} onPress={pay} variant={bill.audit.status === 'critical' ? 'secondary' : 'primary'} />
          )
        ) : (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={[styles.muted, { textAlign: 'center' }]}>{bill.status === 'paid' ? copy.paid : paidLabel(bill.status)}</Text>
            {bill.status === 'paid' && bill.paid_at && <Text style={[styles.muted, { textAlign: 'center', fontWeight: '700' }]}>{paidLabel('paid', bill.paid_at)}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.askBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {questions.map((c) => (
            <Pressable key={c} onPress={() => ask({ question: c })} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]} disabled={asking}>
              <Text style={styles.chipText}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
          <TextInput
            style={styles.input}
            placeholder={copy.askPlaceholder}
            placeholderTextColor={t.muted}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => question && ask({ question })}
            returnKeyType="send"
            accessibilityLabel={copy.askPlaceholder}
          />
          <Button title={copy.ask} onPress={() => question && ask({ question })} disabled={!question || asking} variant="secondary" />
        </View>
      </View>

      <Toast key={`${id}-${notice ?? ''}`} message={notice} />

      {readingOpen && (
        <ReadingModal
          bill={bill}
          visible
          onClose={() => setReadingOpen(false)}
          onDone={(r) => {
            const { recalculation, ...updated } = r;
            setBill(updated);
            setRecalc(recalculation);
          }}
        />
      )}
      <ConfirmDialog
        visible={askAddProvider}
        primary="confirm"
        title={`Adaugi ${bill.provider} la furnizorii tăi?`}
        body={`Așa vezi facturile ${bill.provider} în tabul Furnizori și le comparăm lună de lună.`}
        confirm="Adaugă furnizorul"
        cancel="Nu acum"
        onConfirm={() => {
          acceptProvider(slugify(bill.provider));
          setIsPending(false);
          setAskAddProvider(false);
        }}
        onCancel={() => setAskAddProvider(false)}
      />
      <ConfirmDialog
        visible={confirmPay}
        danger
        title={copy.payConfirmTitle}
        body={copy.payConfirmBody}
        confirm={copy.payAnyway}
        cancel={copy.cancel}
        onConfirm={doPay}
        onCancel={() => setConfirmPay(false)}
      />
    </KeyboardAvoidingView>
  );
}

function LineRow({ item, flagged, onPress }: { item: LineItem; flagged: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.line, flagged && styles.flagged, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.lineLabel}>{item.label}</Text>
        <Text style={[styles.muted, tabular]}>
          {item.label_en}
          {item.quantity != null && item.unit_price ? ` · ${item.quantity} ${item.unit} × ${Number(item.unit_price)}` : ''}
        </Text>
      </View>
      <Text style={[styles.lineAmount, tabular]}>{money(item.amount)}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) => ({
  header: { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, gap: 6, alignItems: 'flex-start' as const },
  total: { fontSize: t.fs(34), fontWeight: '800' as const, color: t.text, marginLeft: -1 },
  headerActions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 6 },
  pdfBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: t.accent },
  pdfText: { color: t.accent, fontWeight: '700' as const, fontSize: t.fs(13) },
  recalc: { fontSize: t.fs(15), fontWeight: '700' as const, color: t.sev.ok.color },
  muted: { color: t.muted, fontSize: t.fs(13) },
  section: { fontWeight: '700' as const, fontSize: t.fs(15), marginTop: 8, color: t.text },
  lines: { backgroundColor: t.surface, borderRadius: t.radius, overflow: 'hidden' as const, paddingVertical: 4 },
  line: { flexDirection: 'row' as const, paddingVertical: 12, paddingHorizontal: t.pad, gap: 8 },
  flagged: { backgroundColor: t.highlight },
  lineLabel: { fontWeight: '600' as const, color: t.text, fontSize: t.fs(14) },
  lineAmount: { fontWeight: '700' as const, color: t.text, fontSize: t.fs(14) },
  answer: { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, gap: 8, borderWidth: 2, borderColor: t.accent },
  answerQ: { fontWeight: '800' as const, color: t.accent, fontSize: t.fs(15) },
  answerText: { color: t.text, lineHeight: t.fs(22), fontSize: t.fs(15) },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  source: { fontSize: t.fs(12), color: t.muted, backgroundColor: t.surface2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' as const },
  askBar: { gap: 8, paddingVertical: 10, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.border },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: t.accent, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' as const },
  chipText: { color: t.accent, fontWeight: '600' as const, fontSize: t.fs(13) },
  input: { flex: 1, minHeight: t.touch, borderRadius: t.inner + 4, backgroundColor: t.bg, paddingHorizontal: 12, color: t.text, fontSize: t.fs(15) },
});
