import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, MOCK } from '../api/client';
import type { BillSummary, UploadFile } from '../api/types';
import { Button } from '../components/Button';
import { SeverityBadge } from '../components/SeverityBadge';
import type { ScreenProps } from '../navigation';
import { colors, money } from '../theme';

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listBills()
      .then(setBills)
      .catch((e) => Alert.alert('Could not load bills', String(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const upload = async (file: UploadFile) => {
    setScanning(true);
    try {
      const bill = await api.scanBill(file);
      navigation.navigate('Bill', { id: bill.id });
    } catch (e) {
      Alert.alert('Could not read the bill', String(e));
    } finally {
      setScanning(false);
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.fileName ?? 'bill.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.fileName ?? 'bill.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'] });
    if (res.canceled) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' });
  };

  return (
    <View style={styles.container}>
      {MOCK && <Text style={styles.mock}>MOCK MODE: data from shared/fixtures</Text>}
      <FlatList
        data={bills}
        keyExtractor={(b) => String(b.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Bill', { id: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.provider}>{item.provider}</Text>
              <Text style={styles.muted}>
                {item.category} · due {item.due_date ?? '-'} · {item.status}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={styles.total}>{money(item.total)}</Text>
              <SeverityBadge severity={item.audit_status} />
            </View>
          </Pressable>
        )}
      />
      <View style={styles.scanBar}>
        {scanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator />
            <Text>Reading your bill…</Text>
          </View>
        ) : (
          <>
            <Button title="📷 Camera" onPress={takePhoto} style={{ flex: 1 }} />
            <Button title="🖼 Photo" onPress={pickPhoto} style={{ flex: 1 }} variant="secondary" />
            <Button title="📄 PDF" onPress={pickPdf} style={{ flex: 1 }} variant="secondary" />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  mock: { textAlign: 'center', backgroundColor: colors.highlight, padding: 4, fontSize: 12 },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center' },
  provider: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted, marginTop: 4 },
  total: { fontSize: 17, fontWeight: '700', color: colors.text },
  scanBar: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  scanning: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', height: 48 },
});
