import { StyleSheet, Text, View } from 'react-native';
import type { Category } from '../api/types';
import { category as cat } from '../theme';

/** Coloured circle with the provider's initials (until we have real logos). */
export function ProviderAvatar({ provider, category, size = 42 }: { provider: string; category: Category; size?: number }) {
  const initials = provider
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const c = cat[category] ?? cat.other;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.color }]}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});
