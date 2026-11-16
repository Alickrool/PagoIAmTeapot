import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { ProviderSummary } from '../api/types';
import { Button } from '../components/Button';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { SeverityBadge } from '../components/SeverityBadge';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import { useStackNavigation } from '../navigation';
import { pendingProviders } from '../providerList';
import { category, deltaColor, deltaLabel, money, monthLabel, tabular } from '../theme';

/** One compact row per provider: category, bills, last bill, trend vs average, audit. The trend chart is on the provider screen. */
export default function ProvidersScreen() {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const copy = useCopy();
  const navigation = useStackNavigation();
  const [items, setItems] = useState<ProviderSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.providers(), pendingProviders()])
      .then(([list, pending]) => setItems(list.filter((p) => !pending.has(p.slug))))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  if (!items) {
    return (
      <View style={styles.centerFill}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button title="Încearcă din nou" onPress={load} />
          </>
        ) : (
          <ActivityIndicator color={t.accent} />
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={items}
      keyExtractor={(p) => p.slug}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.accent} />}
      ListHeaderComponent={<Text style={styles.intro}>{copy.providersIntro}</Text>}
      renderItem={({ item: p }) => {
        const c = category[p.category] ?? category.other;
        return (
          <Pressable
            onPress={() => navigation.navigate('Provider', { slug: p.slug, provider: p.provider })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <ProviderAvatar provider={p.provider} category={p.category} size={t.mode === 'senior' ? 48 : 40} />
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <View style={styles.line}>
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                  {p.provider}
                </Text>
                <Text style={[styles.total, tabular]}>{money(p.last_total)}</Text>
              </View>
              <View style={styles.line}>
                <Text style={[styles.meta, tabular, { flex: 1 }]} numberOfLines={1}>
                  {c.label} · {p.bills_count} facturi · {monthLabel(p.last_period_end.slice(0, 7))}
                </Text>
                {p.audit_status !== 'ok' ? (
                  <SeverityBadge severity={p.audit_status} />
                ) : (
                  p.trend_pct != null && <Text style={[styles.trend, tabular, { color: deltaColor(p.trend_pct, t) }]}>{deltaLabel(p.trend_pct)} față de medie</Text>
                )}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: t.bg },
    intro: { color: t.muted, fontSize: t.fs(14), marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderRadius: t.radius - 6, paddingVertical: 12, paddingHorizontal: 14, minHeight: t.touch + 12 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    meta: { color: t.muted, fontSize: t.fs(12) },
    total: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    trend: { fontSize: t.fs(11), fontWeight: '700' },
    muted: { color: t.muted, fontSize: t.fs(14), textAlign: 'center' },
  });
