import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { Validation } from '../api/types';
import { useTheme } from '../mode';
import { splitChecks } from '../validation';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * AV3: what the backend checked on a scanned bill. Warnings sit in one card with "E corect" (confirm);
 * info checks are small notes. Nothing is shown for a bill without checks.
 */
export function ValidationCard({ validation, onConfirm }: { validation: Validation | undefined; onConfirm: () => Promise<void> }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { warnings, infos } = splitChecks(validation);
  if (!validation || (warnings.length === 0 && infos.length === 0)) return null;

  const confirmed = validation.confirmed_by_user || validation.status === 'accepted';
  const s = t.sev.warning;

  return (
    <View style={{ gap: 8 }} testID="validation-card">
      {warnings.length > 0 && (
        <View style={[styles.card, { backgroundColor: s.bg, borderRadius: t.radius, padding: t.pad }]}>
          <View style={styles.head}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={{ color: s.color, fontWeight: '800', fontSize: t.fs(16), flex: 1 }}>
              {confirmed ? 'Ai confirmat datele facturii' : 'Verifică datele citite de pe factură'}
            </Text>
          </View>
          {warnings.map((c) => (
            <Text key={c.id} style={{ color: t.text, fontSize: t.fs(14), lineHeight: t.fs(20) }}>
              • {c.message}
            </Text>
          ))}
          {!confirmed &&
            (busy ? (
              <ActivityIndicator color={t.accent} style={{ height: t.touch }} />
            ) : (
              <Button
                title="E corect"
                variant="secondary"
                onPress={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await onConfirm();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}
          {confirmed && (
            <View style={styles.head}>
              <Icon name="check" size={18} color={t.sev.ok.color} strokeWidth={2.5} />
              <Text style={{ color: t.sev.ok.color, fontWeight: '700', fontSize: t.fs(13) }}>Confirmată</Text>
            </View>
          )}
          {error && <Text style={{ color: t.sev.critical.color, fontSize: t.fs(13) }}>{error}</Text>}
        </View>
      )}
      {infos.map((c) => (
        <View key={c.id} style={[styles.note, { backgroundColor: t.surface, borderRadius: t.inner + 4 }]}>
          <View style={[styles.dot, { backgroundColor: t.sev.info.color }]} />
          <Text style={{ color: t.muted, fontSize: t.fs(13), flex: 1, lineHeight: t.fs(18) }}>{c.message}</Text>
        </View>
      ))}
    </View>
  );
}

/** AV5: small "De verificat" mark for lists. */
export function ReviewMark() {
  const t = useTheme();
  return (
    <View style={[styles.mark, { backgroundColor: t.sev.warning.bg }]} accessibilityLabel="Factură de verificat">
      <View style={[styles.dotSmall, { backgroundColor: t.sev.warning.color }]} />
      <Text style={{ color: t.sev.warning.color, fontSize: t.fs(11), fontWeight: '700' }}>De verificat</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
});
