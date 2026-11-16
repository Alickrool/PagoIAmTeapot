import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { DisputeLetter } from '../api/types';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { colors } from '../theme';

export default function DisputeScreen({ route }: ScreenProps<'Dispute'>) {
  const { billId, anomalyId } = route.params;
  const [letter, setLetter] = useState<DisputeLetter | null>(null);

  useEffect(() => {
    api.dispute(billId, anomalyId).then(setLetter);
  }, [billId, anomalyId]);

  if (!letter) {
    return (
      <View style={{ marginTop: 40, alignItems: 'center', gap: 8 }}>
        <ActivityIndicator />
        <Text>Drafting your complaint…</Text>
      </View>
    );
  }

  const email = () =>
    Linking.openURL(`mailto:?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: colors.bg }}>
      <Text style={styles.label}>To</Text>
      <Text style={styles.value}>{letter.to}</Text>
      <Text style={styles.label}>Subject</Text>
      <Text style={styles.value}>{letter.subject}</Text>
      <Text style={styles.label}>Message (editable)</Text>
      <TextInput
        style={styles.body}
        multiline
        value={letter.body}
        onChangeText={(body) => setLetter({ ...letter, body })}
      />
      <Button title="Send by e-mail" onPress={email} />
      <Button title="Share" variant="secondary" onPress={() => Share.share({ title: letter.subject, message: letter.body })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 12, textTransform: 'uppercase' },
  value: { color: colors.text, fontWeight: '600' },
  body: { backgroundColor: colors.card, borderRadius: 12, padding: 12, minHeight: 280, textAlignVertical: 'top', color: colors.text },
});
