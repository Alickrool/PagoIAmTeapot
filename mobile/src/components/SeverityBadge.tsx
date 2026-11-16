import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Severity } from '../api/types';
import { useCopy, useTheme } from '../mode';

/** Audit badge. When `severity` changes (e.g. critical -> warning after a reading) it pops, so the change is noticed (A9). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const t = useTheme();
  const copy = useCopy();
  const s = t.sev[severity];
  const pop = useState(() => new Animated.Value(1))[0];
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [severity, pop]);

  return (
    <Animated.View style={[styles.badge, { backgroundColor: s.bg, transform: [{ scale: pop }] }]}>
      <View style={[styles.dot, { backgroundColor: s.color }]} />
      <Text style={[styles.text, { color: s.color, fontSize: t.fs(12) }]}>{copy.sev[severity]}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontWeight: '700' },
});
