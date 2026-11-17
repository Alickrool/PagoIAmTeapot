import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../mode';

/** A bar that slides up from the bottom with a message and one "undo" button; it leaves by itself after `duration`. */
export function UndoBar({ message, action, onAction, onHide, duration = 6000 }: { message: string; action: string; onAction: () => void; onHide: () => void; duration?: number }) {
  const t = useTheme();
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(y, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onHide());
    }, duration);
    return () => clearTimeout(timer);
  }, [y, duration, onHide]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: t.dark ? t.surface2 : t.text, opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={{ flex: 1, color: t.dark ? t.text : t.bg, fontSize: t.fs(14), fontWeight: '600' }}>{message}</Text>
      <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={action} style={styles.button}>
        <Text style={{ color: t.dark ? t.accent : t.bg, fontWeight: '800', fontSize: t.fs(14), textDecorationLine: t.dark ? 'none' : 'underline' }}>{action}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  button: { paddingHorizontal: 8, minHeight: 32, justifyContent: 'center' },
});
