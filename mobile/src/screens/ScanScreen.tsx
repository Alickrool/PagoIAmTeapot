import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { slugify } from '../api/derive';
import { markPending } from '../providerList';
import { manualProviders } from '../providersRo';
import { monthNotice, scanFailure } from '../validation';
import type { UploadFile } from '../api/types';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { useStackNavigation } from '../navigation';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';


const MAX_FILES = 10; // docs/API_V2.md §1

type Source = 'camera' | 'image' | 'pdf';
const SOURCES: { key: Source; label: string; icon: IconName; action: string; short: string; hint: string }[] = [
  { key: 'camera', label: 'Cameră', icon: 'camera', action: 'Fotografiază factura', short: 'Poză', hint: 'Câte o poză pentru fiecare pagină. Le trimitem împreună, ca o singură factură.' },
  { key: 'image', label: 'Imagine', icon: 'image', action: 'Alege imagini din galerie', short: 'Imagine', hint: 'Poți alege mai multe pagini odată, în ordine.' },
  { key: 'pdf', label: 'PDF', icon: 'file', action: 'Alege factura PDF', short: 'PDF', hint: 'Factura primită pe e-mail, de pe telefon sau din Fișiere.' },
];
const STEP_MS = 2500;

type Page = UploadFile & { key: string };

let nextKey = 0;
const toPage = (f: UploadFile): Page => ({ ...f, key: String(nextKey++) });
const isPdf = (p: UploadFile) => p.mimeType === 'application/pdf' || p.name.toLowerCase().endsWith('.pdf');

export default function ScanScreen() {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const copy = useCopy();
  const STEPS = copy.scanSteps;
  const navigation = useStackNavigation();
  const [pages, setPages] = useState<Page[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = not scanning
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('camera'); // camera by default; image / PDF on demand

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
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], multiple: true });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' })));
  };

  const acquire = () => (source === 'camera' ? takePhoto() : source === 'image' ? pickGallery() : pickFiles());

  const remove = (key: string) => setPages((cur) => cur.filter((p) => p.key !== key));

  const analyze = async () => {
    setError(null);
    setStep(0);
    try {
      const bill = await api.scanBill(pages);
      setPages([]);
      // A provider seen for the first time waits outside "my providers" until the user adds it (asked after paying).
      const list = await api.providers().catch(() => []);
      const entry = list.find((p) => p.provider.toLowerCase() === bill.provider.toLowerCase());
      const slug = entry?.slug ?? slugify(bill.provider);
      const handAdded = (await manualProviders()).some((p) => p.slug === slug);
      if (!handAdded && (!entry || entry.bills_count <= 1)) await markPending(slug);
      navigation.navigate('Bill', { id: bill.id, notice: monthNotice(bill) ?? undefined });
    } catch (e) {
      const failure = scanFailure(e);
      if (failure.kind === 'duplicate') {
        setPages([]);
        navigation.navigate('Bill', { id: failure.billId, notice: failure.notice });
      } else {
        setError(failure.message);
      }
    } finally {
      setStep(null);
    }
  };

  if (step != null) return <ScanProgress step={step} pages={pages.length} steps={STEPS} />;

  const src = SOURCES.find((x) => x.key === source)!;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={styles.segment} accessibilityRole="tablist">
          {SOURCES.map((x) => {
            const on = x.key === source;
            return (
              <Pressable
                key={x.key}
                onPress={() => setSource(x.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.segBtn, on && styles.segOn, pressed && { opacity: 0.7 }]}
              >
                <Icon name={x.icon} size={20} color={on ? t.onAccent : t.text} />
                <Text style={[styles.segLabel, on && { color: t.onAccent }]}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>A apărut o eroare la scanare</Text>
            <Text style={styles.errorText}>{error}</Text>
            {pages.length > 0 && <Button title="Încearcă din nou" onPress={analyze} variant="secondary" />}
          </View>
        )}

        {pages.length === 0 ? (
          <Pressable onPress={acquire} style={({ pressed }) => [styles.empty, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={src.action}>
            <View style={styles.emptyIcon}>
              <Icon name={src.icon} size={40} color={t.accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>{source === 'camera' ? copy.scanEmptyTitle : src.action}</Text>
            <Text style={styles.emptyText}>{src.hint}</Text>
          </Pressable>
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
                      <Icon name="file" size={30} color={t.muted} />
                      <Text style={styles.pdfName} numberOfLines={2}>
                        {p.name}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: p.uri }} style={styles.thumbInner} />
                  )}
                  <Text style={styles.pageNo}>{i + 1}</Text>
                  <Pressable onPress={() => remove(p.key)} style={styles.remove} hitSlop={8} accessibilityLabel={`Șterge pagina ${i + 1}`}>
                    <Icon name="close" size={14} color="#fff" strokeWidth={2.5} />
                  </Pressable>
                </View>
              ))}
              {pages.length < MAX_FILES && (
                <Pressable onPress={acquire} style={[styles.thumb, styles.addMore]} accessibilityLabel={src.action}>
                  <Icon name="plus" size={26} color={t.accent} />
                  <Text style={styles.addMoreText}>{src.short}</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {pages.length ? <Button title={copy.analyze(pages.length)} onPress={analyze} /> : <Button title={src.action} onPress={acquire} />}
      </View>
    </View>
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
            <View style={[styles.stepDot, i < step && styles.stepDone, i === step && styles.stepNow]}>
              {i < step ? (
                <Icon name="check" size={16} color={t.sev.ok.color} strokeWidth={3} />
              ) : (
                <Text style={[styles.stepNum, i === step && { color: t.onAccent }]}>{i + 1}</Text>
              )}
            </View>
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
    segment: { flexDirection: 'row', gap: 6, padding: 4, backgroundColor: t.surface, borderRadius: t.inner + 10 },
    segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: t.touch, borderRadius: t.inner + 6 },
    segOn: { backgroundColor: t.accent },
    segLabel: { fontWeight: '700', fontSize: t.fs(14), color: t.text },
    section: { fontWeight: '700', color: t.text, fontSize: t.fs(14) },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24, backgroundColor: t.surface, borderRadius: t.radius, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border },
    emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 },
    emptyTitle: { fontWeight: '800', fontSize: t.fs(18), color: t.text },
    emptyText: { color: t.muted, textAlign: 'center', lineHeight: t.fs(20), fontSize: t.fs(14) },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    thumb: { width: '30%', aspectRatio: 0.72, borderRadius: t.inner + 4, overflow: 'hidden', backgroundColor: t.surface },
    thumbInner: { width: '100%', height: '100%' },
    pdf: { alignItems: 'center', justifyContent: 'center', padding: 6, gap: 6, backgroundColor: t.surface2 },
    pdfName: { fontSize: 11, color: t.text, textAlign: 'center' },
    pageNo: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
    remove: { position: 'absolute', right: 6, top: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    addMore: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.accent, backgroundColor: t.surface },
    addMoreText: { fontSize: t.fs(12), color: t.accent, fontWeight: '700' },
    error: { backgroundColor: t.sev.critical.bg, borderRadius: t.radius, padding: t.pad, gap: 6 },
    errorTitle: { fontWeight: '800', color: t.sev.critical.color, fontSize: t.fs(16) },
    errorText: { color: t.text, fontSize: t.fs(14), lineHeight: t.fs(20) },
    footer: { padding: 16, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.border },
    progress: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    progressTitle: { fontSize: t.fs(20), fontWeight: '700', color: t.text, marginTop: 12 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 },
    stepNum: { color: t.muted, fontWeight: '700', fontSize: 13 },
    stepDone: { backgroundColor: t.sev.ok.bg },
    stepNow: { backgroundColor: t.accent },
    stepText: { color: t.text, fontWeight: '600', fontSize: t.fs(15) },
  });
