import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../mode';
import { money, monthName, tabular } from '../theme';
import { Button } from './Button';

/** Set (or remove) the utilities budget for one month. Mount only while open so it starts fresh. */
export function BudgetModal({
  month,
  current,
  suggested,
  onSave,
  onClose,
}: {
  month: string;
  current: number | null;
  suggested: number;
  onSave: (value: number | null) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [value, setValue] = useState(String(current ?? suggested));
  const n = Number(value.replace(',', '.'));
  const valid = value !== '' && !Number.isNaN(n) && n > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Închide" />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderTopLeftRadius: t.radius, borderTopRightRadius: t.radius, padding: t.pad + 4 }]}>
          <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800' }}>Buget pentru {monthName(month)}</Text>
          <Text style={{ color: t.muted, fontSize: t.fs(14), lineHeight: t.fs(20) }}>
            Cât vrei să plătești în total pe utilități luna asta? Media ta + 10% ar fi {money(suggested)}.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
              accessibilityLabel="Bugetul în lei"
              onSubmitEditing={() => valid && onSave(n)}
              style={[styles.input, tabular, { flex: 1, color: t.text, backgroundColor: t.bg, borderColor: t.border, borderRadius: t.inner + 4, fontSize: t.fs(26), height: t.touch + 8 }]}
            />
            <Text style={{ color: t.muted, fontSize: t.fs(18), fontWeight: '700' }}>lei</Text>
          </View>
          <Button title="Salvează bugetul" onPress={() => onSave(n)} disabled={!valid} />
          {current != null && <Button title="Șterge bugetul" variant="ghost" onPress={() => onSave(null)} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  input: { borderWidth: 2, paddingHorizontal: 16 },
});
