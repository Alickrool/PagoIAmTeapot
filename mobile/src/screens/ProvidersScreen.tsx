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
import { acceptProvider, pendingProviders } from '../providerList';
import { manualProviders, withoutBills, type ManualProvider } from '../providersRo';
import { category, deltaColor, deltaLabel, monthLabel, tabular } from '../theme';

/** One compact row per provider: category, bills, last bill, trend vs average, audit. The trend chart is on the provider screen. */
export default function ProvidersScreen() {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const copy = useCopy();
  const navigation = useStackNavigation();
  const [items, setItems] = useState<ProviderSummary[] | null>(null);
  const [fresh, setFresh] = useState<ProviderSummary[]>([]); // seen in a scanned bill, not added yet
  const [noBills, setNoBills] = useState<ManualProvider[]>([]); // added by hand, no bill yet
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.providers(), pendingProviders(), manualProviders()])
      .then(([list, pending, manual]) => {
        setItems(list.filter((p) => !pending.has(p.slug)));
        setFresh(list.filter((p) => pending.has(p.slug)));
        setNoBills(withoutBills(manual, list));
      })
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
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Text style={styles.intro}>{copy.providersIntro}</Text>
          {fresh.length > 0 && (
            <View style={styles.fresh}>
              <Text style={styles.freshTitle}>Furnizori noi din facturile scanate</Text>
              {fresh.map((p) => (
                <View key={p.slug} style={styles.freshRow}>
                  <ProviderAvatar provider={p.provider} category={p.category} size={36} />
                  <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                    {p.provider}
                  </Text>
                  <Button
                    title="Adaugă"
                    variant="secondary"
                    onPress={async () => {
                      await acceptProvider(p.slug);
                      load();
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      }
      ListFooterComponent={
        <View style={{ gap: 10 }}>
          {noBills.map((m) => (
            <View key={m.slug} style={styles.row}>
              <ProviderAvatar provider={m.name} category={m.category} size={t.mode === 'senior' ? 48 : 40} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.meta}>{category[m.category].label} · nicio factură încă</Text>
              </View>
              <Button title="Adaugă factură" variant="secondary" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} />
            </View>
          ))}
          <Button title="＋ Adaugă furnizor" variant="ghost" onPress={() => navigation.navigate('AddProvider')} style={{ marginTop: 4 }} />
        </View>
      }
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
    fresh: { backgroundColor: t.surface, borderRadius: t.radius - 6, padding: 14, gap: 10, borderWidth: 1.5, borderColor: t.accent },
    freshTitle: { fontSize: t.fs(14), fontWeight: '800', color: t.accent },
    freshRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    meta: { color: t.muted, fontSize: t.fs(12) },
    total: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    trend: { fontSize: t.fs(11), fontWeight: '700' },
    muted: { color: t.muted, fontSize: t.fs(14), textAlign: 'center' },
  });
