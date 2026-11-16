import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { ProviderSummary } from '../api/types';
import { Button } from '../components/Button';
import { Sparkline } from '../components/charts/Sparkline';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { SeverityBadge } from '../components/SeverityBadge';
import { useStackNavigation } from '../navigation';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import { category, deltaColor, deltaLabel, money, monthLabel } from '../theme';

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
    api
      .providers()
      .then(setItems)
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
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={items}
      keyExtractor={(p) => p.slug}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={<Text style={styles.intro}>{copy.providersIntro}</Text>}
      renderItem={({ item: p }) => {
        const c = category[p.category] ?? category.other;
        return (
          <Pressable
            onPress={() => navigation.navigate('Provider', { slug: p.slug, provider: p.provider })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.top}>
              <ProviderAvatar provider={p.provider} category={p.category} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.provider}</Text>
                <Text style={styles.muted}>
                  {c.icon} {c.label} · {p.bills_count} facturi
                </Text>
              </View>
              <Sparkline values={p.totals.map(Number)} color={c.color} />
            </View>
            <View style={styles.bottom}>
              <View>
                <Text style={styles.small}>Ultima · {monthLabel(p.last_period_end.slice(0, 7))}</Text>
                <Text style={styles.total}>{money(p.last_total)}</Text>
              </View>
              <View>
                <Text style={styles.small}>față de medie</Text>
                <Text style={[styles.trend, { color: deltaColor(p.trend_pct, t) }]}>
                  {p.trend_pct == null ? '–' : deltaLabel(p.trend_pct)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <SeverityBadge severity={p.audit_status} />
                {p.anomalies_count > 0 && (
                  <Text style={styles.small}>
                    {p.anomalies_count} {p.anomalies_count > 1 ? 'probleme' : 'problemă'}
                  </Text>
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
  intro: { color: t.muted, marginBottom: 4 },
  card: { backgroundColor: t.surface, borderRadius: 18, padding: 16, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12, borderTopWidth: 1, borderColor: t.border },
  name: { fontSize: 17, fontWeight: '700', color: t.text },
  muted: { color: t.muted, fontSize: 13, marginTop: 2 },
  small: { color: t.muted, fontSize: 12 },
  total: { fontSize: 18, fontWeight: '800', color: t.text, marginTop: 2 },
  trend: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});
