import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { UploadFile } from '../api/types';
import { Button } from '../components/Button';
import { useStackNavigation } from '../navigation';
import { colors } from '../theme';

const MAX_FILES = 10; // docs/API_V2.md §1
const STEPS = ['Uploading pages', 'Reading your bill', 'Comparing with your history', 'Checking for anomalies'];
const STEP_MS = 2500;

type Page = UploadFile & { key: string };
let nextKey = 0;
const toPage = (f: UploadFile): Page => ({ ...f, key: String(nextKey++) });
const isPdf = (p: UploadFile) => p.mimeType === 'application/pdf' || p.name.toLowerCase().endsWith('.pdf');

export default function ScanScreen() {
  const navigation = useStackNavigation();
  const [pages, setPages] = useState<Page[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = not scanning
  const [error, setError] = useState<string | null>(null);

  // Staged loader: advance one step every STEP_MS, stay on the last one until the backend answers.
  useEffect(() => {
    if (step == null || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => (s == null ? s : s + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [step]);

  const add = (files: UploadFile[]) => {
    setError(null);
    setPages((cur) => {
      const room = MAX_FILES - cur.length;
      if (files.length > room) Alert.alert('Too many pages', `A bill can have at most ${MAX_FILES} pages.`);
      return [...cur, ...files.slice(0, Math.max(0, room)).map(toPage)];
    });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera', 'Allow camera access to photograph your bill.');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? `page-${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' })));
  };

  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_FILES - pages.length,
      orderedSelection: true,
    });
    if (res.canceled) return;
    add(res.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `page-${i + 1}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' })));
  };

  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' })));
  };

  const remove = (key: string) => setPages((cur) => cur.filter((p) => p.key !== key));

  const analyze = async () => {
    setError(null);
    setStep(0);
    try {
      const bill = await api.scanBill(pages);
      setPages([]);
      navigation.navigate('Bill', { id: bill.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  if (step != null) return <ScanProgress step={step} pages={pages.length} />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={styles.sources}>
          <Source icon="📷" label="Camera" onPress={takePhoto} primary />
          <Source icon="🖼" label="Gallery" onPress={pickGallery} />
          <Source icon="📄" label="PDF / Files" onPress={pickFiles} />
        </View>

        {error && (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>Could not read the bill</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {pages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🧾</Text>
            <Text style={styles.emptyTitle}>Add the pages of one bill</Text>
            <Text style={styles.emptyText}>
              Take photos, pick images from your gallery or add a PDF. You can mix them: they are sent together, in this
              order, as one bill.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.section}>
              {pages.length} page{pages.length > 1 ? 's' : ''} · max {MAX_FILES}
            </Text>
            <View style={styles.grid}>
              {pages.map((p, i) => (
                <View key={p.key} style={styles.thumb}>
                  {isPdf(p) ? (
                    <View style={[styles.thumbInner, styles.pdf]}>
                      <Text style={{ fontSize: 28 }}>📄</Text>
                      <Text style={styles.pdfName} numberOfLines={2}>
                        {p.name}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: p.uri }} style={styles.thumbInner} />
                  )}
                  <Text style={styles.pageNo}>{i + 1}</Text>
                  <Pressable onPress={() => remove(p.key)} style={styles.remove} hitSlop={8}>
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {pages.length < MAX_FILES && (
                <Pressable onPress={pickGallery} style={[styles.thumb, styles.addMore]}>
                  <Text style={styles.addMoreText}>＋</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={pages.length ? `Analyze bill · ${pages.length} page${pages.length > 1 ? 's' : ''}` : 'Add at least one page'}
          onPress={analyze}
          disabled={!pages.length}
        />
      </View>
    </View>
  );
}

function Source({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.source, primary && styles.sourcePrimary, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={[styles.sourceLabel, primary && { color: colors.primaryText }]}>{label}</Text>
    </Pressable>
  );
}

function ScanProgress({ step, pages }: { step: number; pages: number }) {
  return (
    <View style={[styles.container, styles.progress]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.progressTitle}>{STEPS[step]}…</Text>
      <Text style={styles.emptyText}>
        {pages} page{pages > 1 ? 's' : ''} · usually 10–20 seconds
      </Text>
      <View style={{ gap: 10, marginTop: 16, alignSelf: 'stretch' }}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.stepRow}>
            <Text style={[styles.stepDot, i < step && styles.stepDone, i === step && styles.stepNow]}>{i < step ? '✓' : i + 1}</Text>
            <Text style={[styles.stepText, i > step && { color: colors.muted }]}>{s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 18, alignItems: 'center', gap: 6 },
  sourcePrimary: { backgroundColor: colors.primary },
  sourceLabel: { fontWeight: '600', color: colors.primary },
  section: { fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', gap: 8, padding: 24, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  emptyTitle: { fontWeight: '700', fontSize: 16, color: colors.text },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: '30%', aspectRatio: 0.72, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card },
  thumbInner: { width: '100%', height: '100%' },
  pdf: { alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4, backgroundColor: '#FEF2F2' },
  pdfName: { fontSize: 11, color: colors.text, textAlign: 'center' },
  pageNo: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  remove: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addMore: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: '#EEEAFE' },
  addMoreText: { fontSize: 28, color: colors.primary },
  error: { backgroundColor: '#FEE2E2', borderRadius: 14, padding: 14, gap: 4, borderLeftWidth: 4, borderColor: '#B91C1C' },
  errorTitle: { fontWeight: '700', color: '#B91C1C' },
  errorText: { color: '#1F2937' },
  footer: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
  progress: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  progressTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, backgroundColor: colors.border, color: colors.muted, fontWeight: '700', overflow: 'hidden' },
  stepDone: { backgroundColor: '#DCFCE7', color: '#15803D' },
  stepNow: { backgroundColor: colors.primary, color: colors.primaryText },
  stepText: { color: colors.text, fontWeight: '600' },
});
