import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { DisputeLetter } from '../api/types';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { useStyles, useTheme, type Theme } from '../mode';


export default function DisputeScreen({ route }: ScreenProps<'Dispute'>) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const { billId, anomalyId } = route.params;
  const [letter, setLetter] = useState<DisputeLetter | null>(null);

  useEffect(() => {
    api.dispute(billId, anomalyId).then(setLetter);
  }, [billId, anomalyId]);

  if (!letter) {
    return (
      <View style={{ marginTop: 40, alignItems: 'center', gap: 8 }}>
        <ActivityIndicator color={t.accent} />
        <Text style={{ color: t.text }}>Pregătim contestația…</Text>
      </View>
    );
  }

  const email = () =>
    Linking.openURL(`mailto:?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: t.bg }}>
      <Text style={styles.label}>Către</Text>
      <Text style={styles.value}>{letter.to}</Text>
      <Text style={styles.label}>Subiect</Text>
      <Text style={styles.value}>{letter.subject}</Text>
      <Text style={styles.label}>Mesaj (îl poți modifica)</Text>
      <TextInput
        style={styles.body}
        multiline
        value={letter.body}
        onChangeText={(body) => setLetter({ ...letter, body })}
      />
      <Button title="Trimite pe e-mail" onPress={email} />
      <Button title="Distribuie" variant="secondary" onPress={() => Share.share({ title: letter.subject, message: letter.body })} />
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  label: { color: t.muted, fontSize: 12, textTransform: 'uppercase' },
  value: { color: t.text, fontWeight: '600' },
  body: { backgroundColor: t.surface, borderRadius: 12, padding: 12, minHeight: 280, textAlignVertical: 'top', color: t.text },
});
