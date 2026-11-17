import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { slugify } from '../api/derive';
import type { Category } from '../api/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { useStyles, useTheme, type Theme } from '../mode';
import type { ScreenProps } from '../navigation';
import { acceptProvider, pendingProviders } from '../providerList';
import { addManualProvider, manualProviders, searchProviders, type RoProvider } from '../providersRo';
import { category as CAT } from '../theme';

const FILTERS: (Category | null)[] = [null, 'electricity', 'gas', 'water', 'telecom', 'other'];

/** "Adaugă furnizor": pick a Romanian provider from the list (or type one), then optionally add its first bill. */
export default function AddProviderScreen({ navigation }: ScreenProps<'AddProvider'>) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Category | null>(null);
  const [mine, setMine] = useState<Set<string> | null>(null); // slugs already in "my providers"
  const [added, setAdded] = useState<{ name: string; hasBills: boolean } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCat, setCustomCat] = useState<Category>('other');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.providers().catch(() => []), pendingProviders(), manualProviders()]).then(([backend, pending, manual]) =>
      setMine(new Set([...backend.filter((p) => !pending.has(p.slug)).map((p) => p.slug), ...manual.map((m) => m.slug)])),
    );
  }, []);

  const results = useMemo(() => searchProviders(query, filter), [query, filter]);

  const add = async (name: string, cat: Category) => {
    setError(null);
    try {
      const slug = slugify(name);
      const backend = await api.providers().catch(() => []);
      const pending = await pendingProviders();
      if (pending.has(slug)) await acceptProvider(slug); // it came from a scan: just accept it
      else await addManualProvider(name, cat);
      setMine((m) => new Set([...(m ?? []), slug]));
      setAdded({ name, hasBills: backend.some((p) => p.slug === slug) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const categoryFor = (p: RoProvider) => (filter && p.categories.includes(filter) ? filter : p.categories[0]);

  if (added) {
    return (
      <View style={[styles.page, styles.center]}>
        <View style={styles.doneIcon}>
          <Icon name="check" size={36} color={t.sev.ok.color} strokeWidth={2.5} />
        </View>
        <Text style={styles.title}>Ai adăugat {added.name}</Text>
        {added.hasBills ? (
          <Text style={styles.muted}>Facturile lui apar deja în lista de furnizori.</Text>
        ) : (
          <>
            <Text style={styles.muted}>Nu are încă facturi. Adaugă prima factură ca să o verificăm și să o comparăm lună de lună.</Text>
            <Button title="Adaugă factură" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} style={{ alignSelf: 'stretch' }} />
          </>
        )}
        <Button title="Înapoi la furnizori" variant="ghost" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Caută furnizor (ex. Engie, Apa Nova)"
          placeholderTextColor={t.muted}
          style={styles.search}
          accessibilityLabel="Caută furnizor"
          autoCorrect={false}
        />
      </View>
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable key={f ?? 'all'} onPress={() => setFilter(f)} style={[styles.filter, on && styles.filterOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[styles.filterText, on && { color: t.onAccent }]}>{f ? CAT[f].label : 'Toate'}</Text>
            </Pressable>
          );
        })}
      </View>

      {mine == null ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => p.name}
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>Nu am găsit „{query}” în listă. Îl poți adăuga mai jos.</Text>}
          renderItem={({ item }) => {
            const already = mine.has(slugify(item.name));
            return (
              <View style={styles.row}>
                <ProviderAvatar provider={item.name} category={item.categories[0]} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.categories.map((c) => CAT[c].label).join(' · ')}
                  </Text>
                </View>
                {already ? (
                  <Text style={styles.addedText}>Adăugat</Text>
                ) : (
                  <Button title="Adaugă" variant="secondary" onPress={() => add(item.name, categoryFor(item))} />
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.custom}>
              {!customOpen ? (
                <Button title="Nu e în listă? Adaugă manual" variant="ghost" onPress={() => {
                  setCustomOpen(true);
                  setCustomName(query);
                }} />
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={styles.label}>Numele furnizorului</Text>
                  <TextInput
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="ex. Asociația de proprietari Bl. 5"
                    placeholderTextColor={t.muted}
                    style={styles.search}
                    accessibilityLabel="Numele furnizorului"
                  />
                  <Text style={styles.label}>Ce fel de factură</Text>
                  <View style={styles.filters}>
                    {(FILTERS.filter(Boolean) as Category[]).map((c) => (
                      <Pressable key={c} onPress={() => setCustomCat(c)} style={[styles.filter, c === customCat && styles.filterOn]} accessibilityRole="button" accessibilityState={{ selected: c === customCat }}>
                        <Text style={[styles.filterText, c === customCat && { color: t.onAccent }]}>{CAT[c].label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button title="Adaugă furnizorul" onPress={() => add(customName, customCat)} disabled={!customName.trim()} />
                </View>
              )}
              {error && <Text style={{ color: t.sev.critical.color, fontSize: t.fs(13) }}>{error}</Text>}
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 },
    center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
    doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.sev.ok.bg, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: t.fs(20), fontWeight: '800', color: t.text, textAlign: 'center' },
    muted: { color: t.muted, fontSize: t.fs(14), lineHeight: t.fs(20), textAlign: 'center' },
    searchBox: {},
    search: { minHeight: t.touch, borderRadius: t.inner + 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, paddingHorizontal: 14, color: t.text, fontSize: t.fs(15) },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    filter: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    filterOn: { backgroundColor: t.accent, borderColor: t.accent },
    filterText: { color: t.text, fontWeight: '600', fontSize: t.fs(13) },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderRadius: t.radius - 6, padding: 12 },
    name: { color: t.text, fontWeight: '800', fontSize: t.fs(15) },
    meta: { color: t.muted, fontSize: t.fs(12), marginTop: 2 },
    addedText: { color: t.sev.ok.color, fontWeight: '700', fontSize: t.fs(13), paddingHorizontal: 8 },
    custom: { marginTop: 8, gap: 8 },
    label: { color: t.muted, fontWeight: '700', fontSize: t.fs(13) },
  });
