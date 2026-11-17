import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COPY, THEMES, useMode, type Mode } from '../mode';

const ORDER: Mode[] = ['genz', 'millennial', 'senior'];
const SAMPLE: Record<Mode, string> = {
  genz: 'Red flag: PPC vrea 501,85 lei',
  millennial: 'Octombrie a fost generos: 131,59 lei peste buget',
  senior: 'Sărut-mâna! Aveți 4 facturi.',
};

/** First launch (and "Schimbă modul"): each card is drawn in that mode's own colours. */
export default function ModePickerScreen() {
  const { mode, setMode } = useMode();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.brand}>AI Pago</Text>
        <Text style={styles.title}>Cum vrei să arate aplicația?</Text>
        <Text style={styles.sub}>Aceleași facturi și aceleași verificări, pe stilul tău. Poți schimba oricând.</Text>
        {ORDER.map((m) => {
          const t = THEMES[m];
          const c = COPY[m];
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: t.surface, borderColor: mode === m ? t.accent : t.border },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: t.bg, borderColor: t.border }]}>
                <View style={[styles.dot, { backgroundColor: t.accent }]} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: t.text, fontSize: t.fs(18), fontWeight: '800' }}>{c.modeName}</Text>
                <Text style={{ color: t.muted, fontSize: t.fs(13) }}>{c.modeDesc}</Text>
                <Text style={{ color: t.accent, fontSize: t.fs(13), fontWeight: '700' }} numberOfLines={2}>
                  „{SAMPLE[m]}”
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F6FA' },
  page: { padding: 20, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brand: { color: '#2B59C3', fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  title: { color: '#16181D', fontSize: 26, fontWeight: '800', lineHeight: 32 },
  sub: { color: '#4B5160', fontSize: 15, lineHeight: 21, marginBottom: 6 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 22, padding: 16, borderWidth: 2 },
  swatch: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
