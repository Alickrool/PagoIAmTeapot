import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY, THEMES, useMode, useTheme, type Mode } from '../mode';

const ORDER: Mode[] = ['genz', 'millennial', 'senior'];

/** Header pill showing the current interface; tap -> sheet with the 3 interfaces, switches instantly. */
export function ModeSwitcher() {
  const { mode, setMode } = useMode();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = COPY[mode ?? 'millennial'];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Interfață: ${current.modeName}. Schimbă interfața`}
        hitSlop={8}
        style={({ pressed }) => [styles.pill, { borderColor: t.accent, minHeight: 36 }, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.dot, { backgroundColor: t.accent }]} />
        <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13) }}>{current.modeName}</Text>
        <Text style={{ color: t.accent, fontSize: t.fs(11) }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Închide">
          <Pressable style={[styles.sheet, { backgroundColor: t.surface }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: t.border }]} />
            <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800' }}>Alege interfața</Text>
            {ORDER.map((m) => {
              const mt = THEMES[m];
              const c = COPY[m];
              const selected = m === mode;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    setMode(m);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: mt.bg, borderColor: selected ? mt.accent : mt.border },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.swatch, { backgroundColor: mt.accent }]} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: mt.text, fontSize: mt.fs(16), fontWeight: '800' }}>{c.modeName}</Text>
                    <Text style={{ color: mt.muted, fontSize: mt.fs(13) }}>{c.modeDesc}</Text>
                  </View>
                  {selected && <Text style={{ color: mt.accent, fontSize: 20, fontWeight: '900' }}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, marginRight: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { gap: 12, padding: 20, paddingBottom: 36, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 14, borderWidth: 2, minHeight: 64 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
});
