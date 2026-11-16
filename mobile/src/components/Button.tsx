import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../mode';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** One primary per screen; secondary = outlined; ghost = text only. */
export function Button({ title, onPress, variant = 'primary', disabled, style }: Props) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : 'transparent';
  const fg = variant === 'primary' ? t.onAccent : variant === 'secondary' ? t.accent : t.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        { minHeight: t.touch, borderRadius: t.inner + 4, backgroundColor: bg },
        variant === 'secondary' && { borderWidth: 2, borderColor: t.accent },
        (pressed || disabled) && { opacity: 0.55 },
        style,
      ]}
    >
      <Text style={[styles.text, { color: fg, fontSize: t.fs(15) }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontWeight: '700', textAlign: 'center' },
});
