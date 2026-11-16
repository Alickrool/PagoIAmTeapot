import { useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { BillDetail, ReadingResponse } from '../api/types';
import { useCopy, useTheme } from '../mode';
import { tabular } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';

/** A6: "Submit real reading" -> POST /bills/{id}/reading/ -> recalculated bill + difference. */
export function ReadingModal({
  bill,
  visible,
  onClose,
  onDone,
}: {
  bill: BillDetail;
  visible: boolean;
  onClose: () => void;
  onDone: (r: ReadingResponse) => void;
}) {
  const t = useTheme();
  const copy = useCopy();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadingResponse | null>(null);
  // Mount it only while open (`{open && <ReadingModal …/>}`) so every opening starts empty.
  const pop = useState(() => new Animated.Value(0))[0];

  const send = async () => {
    const n = Number(value.replace(',', '.'));
    if (!value || Number.isNaN(n)) return setError('Scrie doar cifre.');
    setSending(true);
    setError(null);
    try {
      const r = await api.submitReading(bill.id, n);
      setResult(r);
      onDone(r);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const diff = result?.recalculation.difference ?? 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Închide" />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderTopLeftRadius: t.radius, borderTopRightRadius: t.radius, padding: t.pad + 4 }]}>
          {result ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Animated.View style={[styles.check, { backgroundColor: t.sev.ok.bg, transform: [{ scale: pop }] }]}>
                <Icon name="check" color={t.sev.ok.color} size={36} strokeWidth={2.5} />
              </Animated.View>
              <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800', textAlign: 'center' }}>{copy.readingDone(diff)}</Text>
              <Text style={[{ color: t.muted, fontSize: t.fs(14), textAlign: 'center' }, tabular]}>
                {result.recalculation.previous_consumption} → {result.recalculation.new_consumption} {result.recalculation.unit}
              </Text>
              <Button title="OK" onPress={onClose} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800' }}>{copy.readingTitle}</Text>
              <Text style={{ color: t.muted, fontSize: t.fs(14), lineHeight: t.fs(20) }}>{copy.readingHint(bill.index_old, bill.consumption_unit)}</Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
                placeholder={bill.index_old != null ? String(Math.round(bill.index_old + (bill.consumption ?? 0) / 2)) : ''}
                placeholderTextColor={t.muted}
                autoFocus
                onSubmitEditing={send}
                accessibilityLabel={copy.readingTitle}
                style={[
                  styles.input,
                  tabular,
                  { color: t.text, backgroundColor: t.bg, borderColor: error ? t.sev.critical.color : t.border, borderRadius: t.inner + 4, fontSize: t.fs(24), height: t.touch + 8 },
                ]}
              />
              {error && <Text style={{ color: t.sev.critical.color, fontSize: t.fs(14) }}>{error}</Text>}
              {sending ? <ActivityIndicator color={t.accent} style={{ height: t.touch }} /> : <Button title={copy.readingSend} onPress={send} disabled={!value} />}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  input: { borderWidth: 2, paddingHorizontal: 16 },
  check: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
