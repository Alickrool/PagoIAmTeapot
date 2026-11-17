import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { ProviderSummary } from '../api/types';
import { archivedLabel, splitArchived } from '../archive';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { SeverityBadge } from '../components/SeverityBadge';
import { SwipeAction } from '../components/SwipeAction';
import { UndoBar } from '../components/UndoBar';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import { useStackNavigation } from '../navigation';
import { acceptProvider, pendingProviders } from '../providerList';
import { manualProviders, withoutBills, type ManualProvider } from '../providersRo';
import { rowTone } from '../status';
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
  const [showArchive, setShowArchive] = useState(false);
  const [undo, setUndo] = useState<{ key: number; slug: string; provider: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  /** §8 from the list (swipe): the card moves at once, the backend follows; on error it goes back. */
  const setArchived = useCallback(async (p: ProviderSummary, on: boolean, offerUndo = on) => {
    setActionError(null);
    const mark = (archived: boolean, archived_at: string | null) =>
      setItems((list) => list && list.map((i) => (i.slug === p.slug ? { ...i, archived, archived_at } : i)));
    mark(on, on ? new Date().toISOString() : null);
    if (offerUndo) setUndo({ key: Date.now(), slug: p.slug, provider: p.provider });
    try {
      const card = await api.setProviderArchived(p.slug, on);
      mark(card.archived ?? on, card.archived_at ?? null);
    } catch (e) {
      mark(!on, p.archived_at ?? null);
      setUndo(null);
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const hideUndo = useCallback(() => setUndo(null), []);

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

  const { active, archived } = splitArchived(items);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        style={{ backgroundColor: t.bg }}
        data={active}
        keyExtractor={(p) => p.slug}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Text style={styles.intro}>{copy.providersIntro}</Text>
            {active.length > 0 && (
              <View style={styles.hintRow}>
                <Icon name="archive" size={14} color={t.muted} />
                <Text style={[styles.meta, { flex: 1 }]}>{copy.swipeHint}</Text>
              </View>
            )}
            {actionError && <Text style={styles.error}>{actionError}</Text>}
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

            {/* §8: providers the user left. Grey, at the bottom; their bills stay. */}
            {archived.length > 0 && (
              <View style={styles.archive}>
                <Pressable
                  onPress={() => setShowArchive((s) => !s)}
                  style={({ pressed }) => [styles.archiveHead, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showArchive }}
                  accessibilityLabel={`${copy.archiveSection}, ${archived.length} ${archived.length === 1 ? 'furnizor' : 'furnizori'}`}
                >
                  <Icon name="archive" size={20} color={t.muted} />
                  <Text style={styles.archiveTitle}>
                    {copy.archiveSection} · {archived.length}
                  </Text>
                  <Text style={styles.archiveToggle}>{showArchive ? 'Ascunde' : 'Arată'}</Text>
                </Pressable>
                {showArchive && (
                  <>
                    <Text style={styles.meta}>{copy.archiveHint}</Text>
                    {archived.map((p) => (
                      <SwipeAction key={p.slug} label={copy.unarchiveShort} icon="providers" onAction={() => setArchived(p, false)} testID={`swipe-archived-${p.slug}`}>
                        <Pressable
                          onPress={() => navigation.navigate('Provider', { slug: p.slug, provider: p.provider })}
                          style={({ pressed }) => [styles.row, styles.archivedRow, pressed && { opacity: 0.7 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`${p.provider}, ${archivedLabel(p.archived_at).toLowerCase()}`}
                          accessibilityActions={[{ name: 'unarchive', label: copy.unarchive }]}
                          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'unarchive' && setArchived(p, false)}
                          testID={`archived-${p.slug}`}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <ProviderAvatar provider={p.provider} category={p.category} size={t.mode === 'senior' ? 48 : 40} />
                          </View>
                          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                            <Text style={[styles.name, { color: t.muted }]} numberOfLines={1}>
                              {p.provider}
                            </Text>
                            <Text style={styles.meta} numberOfLines={1}>
                              {archivedLabel(p.archived_at)} · {p.bills_count} facturi
                            </Text>
                          </View>
                        </Pressable>
                      </SwipeAction>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item: p }) => {
          const c = category[p.category] ?? category.other;
          const tone = rowTone(p.audit_status, t); // the whole card: red = anomaly, yellow = warning
          return (
            // swipe right -> "Arhivează" (contract ended); a long swipe archives at once
            <SwipeAction label={copy.archiveShort} icon="archive" onAction={() => setArchived(p, true)} testID={`swipe-${p.slug}`}>
              <Pressable
                onPress={() => navigation.navigate('Provider', { slug: p.slug, provider: p.provider })}
                style={({ pressed }) => [styles.row, tone && { backgroundColor: tone.bg, borderColor: tone.border }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${p.provider}${p.audit_status === 'critical' ? ', anomalie' : p.audit_status === 'warning' ? ', atenție' : ''}`}
                accessibilityActions={[{ name: 'archive', label: copy.archive }]}
                onAccessibilityAction={(e) => e.nativeEvent.actionName === 'archive' && setArchived(p, true)}
                testID={`provider-${p.slug}`}
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
            </SwipeAction>
          );
        }}
      />
      {undo && (
        <UndoBar
          key={undo.key}
          message={copy.archivedToast(undo.provider)}
          action={copy.undo}
          onHide={hideUndo}
          onAction={() => {
            const p = items.find((i) => i.slug === undo.slug);
            setUndo(null);
            if (p) setArchived(p, false, false);
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: t.bg },
    intro: { color: t.muted, fontSize: t.fs(14), marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderRadius: t.radius - 6, borderWidth: 1.5, borderColor: 'transparent', paddingVertical: 12, paddingHorizontal: 14, minHeight: t.touch + 12 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fresh: { backgroundColor: t.surface, borderRadius: t.radius - 6, padding: 14, gap: 10, borderWidth: 1.5, borderColor: t.accent },
    freshTitle: { fontSize: t.fs(14), fontWeight: '800', color: t.accent },
    freshRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    meta: { color: t.muted, fontSize: t.fs(12) },
    total: { fontSize: t.fs(16), fontWeight: '800', color: t.text },
    trend: { fontSize: t.fs(11), fontWeight: '700' },
    muted: { color: t.muted, fontSize: t.fs(14), textAlign: 'center' },
    archive: { marginTop: 12, gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border },
    archiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: t.touch },
    archiveTitle: { flex: 1, color: t.muted, fontWeight: '800', fontSize: t.fs(15) },
    archiveToggle: { color: t.accent, fontWeight: '700', fontSize: t.fs(14) },
    archivedRow: { backgroundColor: t.bg, borderColor: t.border, borderStyle: 'dashed' },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    error: { color: t.sev.critical.color, fontSize: t.fs(13), fontWeight: '600' },
  });
