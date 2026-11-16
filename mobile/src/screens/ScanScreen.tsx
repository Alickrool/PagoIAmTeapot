import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { UploadFile } from '../api/types';
import { Button } from '../components/Button';
import { useStackNavigation } from '../navigation';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';


const MAX_FILES = 10; // docs/API_V2.md §1
const STEP_MS = 2500;

type Page = UploadFile & { key: string };
let nextKey = 0;
const toPage = (f: UploadFile): Page => ({ ...f, key: String(nextKey++) });
const isPdf = (p: UploadFile) => p.mimeType === 'application/pdf' || p.name.toLowerCase().endsWith('.pdf');

export default function ScanScreen() {
  const styles = useStyles(makeStyles);
  const copy = useCopy();
  const STEPS = copy.scanSteps;
  const navigation = useStackNavigation();
  const [pages, setPages] = useState<Page[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = not scanning
  const [error, setError] = useState<string | null>(null);

  // Staged loader: advance one step every STEP_MS, stay on the last one until the backend answers.
  useEffect(() => {
    if (step == null || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => (s == null ? s : s + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [step, STEPS.length]);

  const add = (files: UploadFile[]) => {
    setError(null);
    setPages((cur) => {
      const room = MAX_FILES - cur.length;
      if (files.length > room) Alert.alert('Prea multe pagini', `O factură poate avea cel mult ${MAX_FILES} pagini.`);
      return [...cur, ...files.slice(0, Math.max(0, room)).map(toPage)];
    });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Cameră', 'Permite accesul la cameră ca să fotografiezi factura.');
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

  if (step != null) return <ScanProgress step={step} pages={pages.length} steps={STEPS} />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={styles.sources}>
          <Source icon="📷" label="Cameră" onPress={takePhoto} primary />
          <Source icon="🖼" label="Galerie" onPress={pickGallery} />
          <Source icon="📄" label="PDF / Fișiere" onPress={pickFiles} />
        </View>

        {error && (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>Nu am putut citi factura</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {pages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🧾</Text>
            <Text style={styles.emptyTitle}>{copy.scanEmptyTitle}</Text>
            <Text style={styles.emptyText}>{copy.scanEmptyBody}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.section}>
              {pages.length} {pages.length > 1 ? 'pagini' : 'pagină'} · maxim {MAX_FILES}
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
          title={pages.length ? copy.analyze(pages.length) : copy.addPage}
          onPress={analyze}
          disabled={!pages.length}
        />
      </View>
    </View>
  );
}

function Source({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.source, primary && styles.sourcePrimary, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={[styles.sourceLabel, primary && { color: t.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

function ScanProgress({ step, pages, steps: STEPS }: { step: number; pages: number; steps: string[] }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.container, styles.progress]}>
      <ActivityIndicator size="large" color={t.accent} />
      <Text style={styles.progressTitle}>{STEPS[step]}…</Text>
      <Text style={styles.emptyText}>
        {pages} {pages > 1 ? 'pagini' : 'pagină'} · de obicei 10–20 secunde
      </Text>
      <View style={{ gap: 10, marginTop: 16, alignSelf: 'stretch' }}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.stepRow}>
            <Text style={[styles.stepDot, i < step && styles.stepDone, i === step && styles.stepNow]}>{i < step ? '✓' : i + 1}</Text>
            <Text style={[styles.stepText, i > step && { color: t.muted }]}>{s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, backgroundColor: t.surface, borderRadius: 16, paddingVertical: 18, alignItems: 'center', gap: 6 },
  sourcePrimary: { backgroundColor: t.accent },
  sourceLabel: { fontWeight: '600', color: t.accent },
  section: { fontWeight: '700', color: t.text },
  empty: { alignItems: 'center', gap: 8, padding: 24, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border },
  emptyTitle: { fontWeight: '700', fontSize: 16, color: t.text },
  emptyText: { color: t.muted, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: '30%', aspectRatio: 0.72, borderRadius: 12, overflow: 'hidden', backgroundColor: t.surface },
  thumbInner: { width: '100%', height: '100%' },
  pdf: { alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4, backgroundColor: '#FEF2F2' },
  pdfName: { fontSize: 11, color: t.text, textAlign: 'center' },
  pageNo: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  remove: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addMore: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: t.accent, backgroundColor: '#EEEAFE' },
  addMoreText: { fontSize: 28, color: t.accent },
  error: { backgroundColor: '#FEE2E2', borderRadius: 14, padding: 14, gap: 4, borderLeftWidth: 4, borderColor: '#B91C1C' },
  errorTitle: { fontWeight: '700', color: '#B91C1C' },
  errorText: { color: '#1F2937' },
  footer: { padding: 16, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.border },
  progress: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  progressTitle: { fontSize: 20, fontWeight: '700', color: t.text, marginTop: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, backgroundColor: t.border, color: t.muted, fontWeight: '700', overflow: 'hidden' },
  stepDone: { backgroundColor: '#DCFCE7', color: '#15803D' },
  stepNow: { backgroundColor: t.accent, color: t.onAccent },
  stepText: { color: t.text, fontWeight: '600' },
});
