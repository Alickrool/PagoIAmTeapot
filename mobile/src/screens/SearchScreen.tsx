import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, MOCK } from '../api/client';
import type { SearchChip, SearchInput, SearchResponse, SearchResult, SearchTarget, UploadFile } from '../api/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { Toast } from '../components/Toast';
import { ReviewMark } from '../components/ValidationCard';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import type { ScreenProps } from '../navigation';
import { EXAMPLES, monthLabelRo, withoutChip } from '../search';
import { paidLabel, rowTone } from '../status';
import { money, tabular } from '../theme';
import { useVoiceRecorder } from '../voice';

export const DEBOUNCE_MS = 300;

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Results grouped by month, newest first (the order the API already gives). */
export function groupByMonth(results: SearchResult[]): { title: string; data: SearchResult[] }[] {
  const groups: { title: string; data: SearchResult[] }[] = [];
  for (const r of results) {
    const title = capital(r.month_label);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.data.push(r);
    else groups.push({ title, data: [r] });
  }
  return groups;
}

/** Text of the top action button for a `target`. */
export function targetLabel(target: NonNullable<SearchTarget>, results: SearchResult[]): string {
  if (target.screen === 'Bill') {
    const r = results.find((x) => x.id === target.id);
    return r ? `Deschide factura ${r.provider} · ${r.month_label}` : 'Deschide factura';
  }
  if (target.screen === 'Provider') return `Vezi istoricul ${target.provider}`;
  return `Vezi luna ${monthLabelRo(target.month)}`;
}

type Pending = { input: SearchInput; wait: number };

/** Search bar + voice search (docs/API_V2.md §7). The backend understands the query; this screen shows the answer. */
export default function SearchScreen({ route, navigation }: ScreenProps<'Search'>) {
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const startQ = route.params?.q ?? '';
  const [text, setText] = useState(startQ);
  const [pending, setPending] = useState<Pending | null>(startQ.trim() ? { input: { q: startQ }, wait: 0 } : null);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const seq = useRef(0); // only the latest request may update the screen
  const voice = useVoiceRecorder();
  const [pulse] = useState(() => new Animated.Value(0));

  // Text and chip searches: wait DEBOUNCE_MS after the last key, then ask the API.
  useEffect(() => {
    if (!pending) return;
    const id = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .search(pending.input)
        .then((r) => {
          if (seq.current !== id) return;
          setRes(r);
          setError(null);
        })
        .catch((e) => {
          if (seq.current !== id) return;
          setRes(null);
          setError(errorText(e));
        })
        .finally(() => seq.current === id && setLoading(false));
    }, pending.wait);
    return () => clearTimeout(timer);
  }, [pending]);

  // Listening animation
  useEffect(() => {
    if (!voice.recording) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voice.recording, pulse]);

  const clear = () => {
    seq.current++;
    setText('');
    setPending(null);
    setRes(null);
    setError(null);
    setLoading(false);
  };

  const onChangeText = (value: string) => {
    if (!value.trim()) return clear();
    setText(value);
    setPending({ input: { q: value }, wait: DEBOUNCE_MS });
  };

  const runNow = (value: string) => {
    setText(value);
    setPending({ input: { q: value }, wait: 0 });
  };

  const dropChip = (chip: SearchChip) => {
    if (!res) return;
    const input = withoutChip(res.chips, chip);
    if (!Object.keys(input).length) return clear();
    setText(res.chips.filter((c) => c !== chip).map((c) => c.label).join(' '));
    setPending({ input, wait: 0 });
  };

  const jump = useCallback(
    (target: NonNullable<SearchTarget>, notice?: string) => {
      if (target.screen === 'Bill') navigation.navigate('Bill', { id: target.id, notice });
      else if (target.screen === 'Provider') navigation.navigate('Provider', { slug: target.slug, provider: target.provider, month: target.month });
      else navigation.popTo('Tabs', { screen: 'Overview', params: { month: target.month } }); // back home, on that month
    },
    [navigation],
  );

  const send = useCallback(
    async (file: UploadFile | null) => {
      if (!file) return setError('Nu am prins înregistrarea. Încearcă din nou.');
      const id = ++seq.current;
      setThinking(true);
      try {
        const r = await api.searchVoice(file);
        if (seq.current !== id) return;
        const heard = (r.transcript ?? r.query ?? '').trim();
        setText(heard || r.query);
        setRes(r);
        setError(null);
        if (heard) setToast({ key: Date.now(), text: copy.heard(heard) });
        if (r.target) jump(r.target, heard ? copy.heard(heard) : undefined);
      } catch (e) {
        if (seq.current === id) setError(errorText(e));
      } finally {
        if (seq.current === id) setThinking(false);
      }
    },
    [copy, jump],
  );

  const startVoice = useCallback(() => {
    setError(null);
    seq.current++; // a text search still on its way must not overwrite the voice answer
    voice.start(send).catch((e) => setError(errorText(e)));
  }, [voice, send]);

  const toggleVoice = () => (voice.recording ? void voice.stop() : startVoice());

  // Opened from the mic in the search bar: start listening right away.
  const startedVoice = useRef(false);
  useEffect(() => {
    if (!route.params?.voice || startedVoice.current || MOCK) return;
    startedVoice.current = true;
    const timer = setTimeout(startVoice, 250); // let the screen slide in first
    return () => clearTimeout(timer);
  }, [route.params?.voice, startVoice]);

  const openPdf = (id: number) => Linking.openURL(api.billPdfUrl(id)).catch(() => setError('Nu pot deschide PDF-ul.'));

  const listening = voice.recording || thinking;

  return (
    <View style={styles.page}>
      <View style={styles.inputRow}>
        <View style={styles.inputWrap}>
          <Icon name="search" size={20} color={t.muted} />
          <TextInput
            value={text}
            onChangeText={onChangeText}
            onSubmitEditing={() => text.trim() && runNow(text)}
            placeholder={copy.searchPlaceholder}
            placeholderTextColor={t.muted}
            style={styles.input}
            autoFocus={!route.params?.voice}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Caută o factură"
          />
          {!!text && (
            <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Șterge căutarea">
              <Icon name="close" size={18} color={t.muted} />
            </Pressable>
          )}
        </View>
        {!MOCK && (
          <Pressable
            onPress={toggleVoice}
            disabled={thinking}
            style={({ pressed }) => [styles.mic, voice.recording && { backgroundColor: t.sev.critical.color }, (pressed || thinking) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={voice.recording ? 'Oprește înregistrarea' : 'Caută cu vocea'}
          >
            <Icon name={voice.recording ? 'stop' : 'mic'} size={t.mode === 'senior' ? 26 : 22} color={t.onAccent} />
          </Pressable>
        )}
      </View>

      {listening && (
        <Pressable onPress={voice.recording ? () => void voice.stop() : undefined} style={styles.voicePanel} accessibilityRole="button" accessibilityLabel={voice.recording ? 'Oprește înregistrarea' : copy.thinking}>
          {voice.recording ? (
            <View style={styles.pulseBox}>
              <Animated.View style={[styles.pulse, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />
              <View style={styles.pulseDot}>
                <Icon name="mic" size={28} color={t.onAccent} />
              </View>
            </View>
          ) : (
            <ActivityIndicator color={t.accent} size="large" />
          )}
          <Text style={styles.voiceTitle}>{voice.recording ? copy.listening : copy.thinking}</Text>
          {voice.recording && <Text style={styles.muted}>Atinge ca să trimiți · se oprește singur după 15 secunde</Text>}
        </Pressable>
      )}

      {!!error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {!listening && !res && !loading && !error && (
        <View style={{ gap: 12 }}>
          <Text style={styles.muted}>{copy.searchHint}</Text>
          <View style={styles.chips}>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => runNow(ex)} style={styles.example} accessibilityRole="button">
                <Text style={styles.exampleText}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {loading && !res && <ActivityIndicator color={t.accent} style={{ marginTop: 16 }} />}

      {res && !listening && (
        <SectionList
          sections={groupByMonth(res.results)}
          keyExtractor={(r) => String(r.id)}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 32 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              {res.chips.length > 0 && (
                <View style={styles.chips}>
                  {res.chips.map((c) => (
                    <Pressable key={`${c.kind}-${c.value}`} onPress={() => dropChip(c)} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Scoate filtrul ${c.label}`}>
                      <Text style={styles.chipText}>{c.label}</Text>
                      <Icon name="close" size={14} color={t.onAccent} />
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={styles.message}>{res.message}</Text>
              {res.target && <Button title={targetLabel(res.target, res.results)} onPress={() => jump(res.target!)} />}
            </View>
          }
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => <ResultRow r={item} onPress={() => navigation.navigate('Bill', { id: item.id })} onPdf={() => openPdf(item.id)} />}
        />
      )}
      {toast && <Toast key={toast.key} message={toast.text} />}
    </View>
  );
}

function ResultRow({ r, onPress, onPdf }: { r: SearchResult; onPress: () => void; onPdf: () => void }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const tone = rowTone(r.audit_status, t); // the whole box: red = anomaly, yellow = attention
  const status = paidLabel(r.status, r.paid_at, r.due_date);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, tone && { backgroundColor: tone.bg, borderColor: tone.border }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${r.provider}, ${r.month_label}, ${money(r.total)}, ${status}`}
    >
      <ProviderAvatar provider={r.provider} category={r.category} size={t.mode === 'senior' ? 46 : 40} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.name} numberOfLines={1}>
            {r.provider}
          </Text>
          {r.validation_status === 'needs_review' && <ReviewMark />}
        </View>
        <Text style={[styles.meta, r.status === 'paid' ? { color: t.sev.ok.color } : null]} numberOfLines={1}>
          {status}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[styles.total, tabular]}>{money(r.total)}</Text>
        {r.has_pdf && (
          <Pressable onPress={onPdf} hitSlop={8} style={styles.pdf} accessibilityRole="button" accessibilityLabel={`PDF factura ${r.provider} ${r.month_label}`}>
            <Icon name="document" size={14} color={t.accent} />
            <Text style={styles.pdfText}>PDF</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 },
    inputRow: { flexDirection: t.mode === 'senior' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 },
    inputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: t.mode === 'senior' ? 60 : 48,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: t.surface,
      borderWidth: 1.5,
      borderColor: t.accent,
    },
    input: { flex: 1, color: t.text, fontSize: t.fs(16), paddingVertical: 8, outlineWidth: 0 },
    mic: { width: t.mode === 'senior' ? 60 : 48, height: t.mode === 'senior' ? 60 : 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent },
    voicePanel: { alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 16, borderRadius: t.radius - 6, backgroundColor: t.surface },
    pulseBox: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
    pulse: { position: 'absolute', width: 72, height: 72, borderRadius: 36, backgroundColor: t.accent },
    pulseDot: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent },
    voiceTitle: { color: t.text, fontSize: t.fs(17), fontWeight: '800', textAlign: 'center' },
    muted: { color: t.muted, fontSize: t.fs(14), lineHeight: t.fs(20) },
    error: { color: t.sev.critical.color, backgroundColor: t.sev.critical.bg, fontSize: t.fs(14), fontWeight: '600', padding: 12, borderRadius: 12, overflow: 'hidden' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    example: { paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    exampleText: { color: t.text, fontWeight: '600', fontSize: t.fs(14) },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, minHeight: 34, borderRadius: 999, backgroundColor: t.accent },
    chipText: { color: t.onAccent, fontWeight: '700', fontSize: t.fs(13) },
    message: { color: t.text, fontSize: t.fs(15), fontWeight: '600', lineHeight: t.fs(21) },
    section: { color: t.muted, fontSize: t.fs(13), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderRadius: t.radius - 6, borderWidth: 1.5, borderColor: 'transparent', paddingVertical: 12, paddingHorizontal: 14 },
    name: { color: t.text, fontWeight: '800', fontSize: t.fs(16), flexShrink: 1 },
    meta: { color: t.muted, fontSize: t.fs(13) },
    total: { color: t.text, fontWeight: '800', fontSize: t.fs(16) },
    pdf: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 999, borderWidth: 1.5, borderColor: t.accent },
    pdfText: { color: t.accent, fontWeight: '700', fontSize: t.fs(12) },
  });
