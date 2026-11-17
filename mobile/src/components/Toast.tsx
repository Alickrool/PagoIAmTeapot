import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../mode';

/** AV2/AV4: short message that slides in, stays ~5 s, and can be tapped away. Mount it with a `key` to replay. */
export function Toast({ message, duration = 5000 }: { message: string | null | undefined; duration?: number }) {
  const t = useTheme();
  const [visible, setVisible] = useState(!!message);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, anim]);

  if (!message || !visible) return null;
  return (
    <Animated.View
      style={[styles.wrap, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Pressable onPress={() => setVisible(false)} style={[styles.box, { backgroundColor: t.dark ? t.surface2 : t.text }]} accessibilityLabel={message}>
        <Text style={{ color: t.dark ? t.text : t.bg, fontSize: t.fs(14), fontWeight: '600' }}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 8, left: 16, right: 16, zIndex: 10 },
  box: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
});
