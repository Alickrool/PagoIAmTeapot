// Romanian utility / telecom providers the user can add by hand ("Adaugă furnizor").
// Names that the backend already normalizes (backend/bills/services/providers.py KNOWN) use the SAME canonical
// spelling, so a bill scanned later lands on the provider added here. The list (names, categories) still needs a
// human check against ANRE / ANCOM before a public release, like the knowledge base.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { slugify } from './api/derive';
import type { Category, ProviderSummary } from './api/types';

export interface RoProvider {
  name: string; // canonical name, as stored by the backend
  categories: Category[];
  aliases?: string[]; // what people may type
}

export const RO_PROVIDERS: RoProvider[] = [
  { name: 'PPC', categories: ['electricity', 'gas'], aliases: ['enel', 'ppc energie'] },
  { name: 'Hidroelectrica', categories: ['electricity'] },
  { name: 'E.ON', categories: ['electricity', 'gas'], aliases: ['eon', 'e.on energie'] },
  { name: 'Electrica Furnizare', categories: ['electricity'], aliases: ['electrica'] },
  { name: 'Engie', categories: ['gas', 'electricity'], aliases: ['engie romania', 'gdf suez'] },
  { name: 'Premier Energy', categories: ['electricity', 'gas'] },
  { name: 'Apa Brasov', categories: ['water'], aliases: ['compania apa brasov'] },
  { name: 'Apa Nova București', categories: ['water'], aliases: ['apa nova', 'bucuresti'] },
  { name: 'Apavital Iași', categories: ['water'], aliases: ['apavital', 'iasi'] },
  { name: 'Compania de Apă Someș', categories: ['water'], aliases: ['cluj', 'somes'] },
  { name: 'Aquatim Timișoara', categories: ['water'], aliases: ['aquatim', 'timisoara'] },
  { name: 'RAJA Constanța', categories: ['water'], aliases: ['raja', 'constanta'] },
  { name: 'Compania de Apă Oltenia', categories: ['water'], aliases: ['craiova', 'oltenia'] },
  { name: 'Digi', categories: ['telecom'], aliases: ['rcs', 'rds', 'digi romania'] },
  { name: 'Orange', categories: ['telecom'], aliases: ['orange romania'] },
  { name: 'Vodafone', categories: ['telecom'], aliases: ['vodafone romania'] },
];

/** Lowercase, no diacritics: "București" and "bucuresti" match. */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Providers matching `query` (name or alias, diacritics ignored) and `category` (if given); best matches first. */
export function searchProviders(query: string, category?: Category | null, list: RoProvider[] = RO_PROVIDERS): RoProvider[] {
  const q = fold(query);
  const scored = list
    .filter((p) => !category || p.categories.includes(category))
    .map((p) => {
      const names = [p.name, ...(p.aliases ?? [])].map(fold);
      const score = !q ? 1 : names.some((n) => n.startsWith(q)) ? 3 : names.some((n) => n.includes(q)) ? 2 : 0;
      return { p, score };
    })
    .filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'ro')).map((x) => x.p);
}

// ---- "My providers" added by hand (no bills yet). Stored on the phone. ----

export interface ManualProvider {
  name: string;
  slug: string;
  category: Category;
}

const KEY = 'pago.providers.manual';

export async function manualProviders(): Promise<ManualProvider[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ManualProvider[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Adds once (by slug). Returns the stored entry. */
export async function addManualProvider(name: string, category: Category): Promise<ManualProvider> {
  const entry = { name: name.trim(), slug: slugify(name), category };
  if (!entry.slug) throw new Error('Scrie numele furnizorului.');
  const list = await manualProviders();
  if (!list.some((p) => p.slug === entry.slug)) {
    list.push(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
  }
  return entry;
}

export async function removeManualProvider(slug: string) {
  const list = (await manualProviders()).filter((p) => p.slug !== slug);
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

/** Hand-added providers that have no bills on the backend yet (once a bill is scanned, the backend entry wins). */
export const withoutBills = (manual: ManualProvider[], fromBackend: Pick<ProviderSummary, 'slug'>[]) =>
  manual.filter((m) => !fromBackend.some((b) => b.slug === m.slug));
