// Provider archive (docs/API_V2.md §8): a provider the user left (ended the contract) goes grey to the bottom of the
// list. Only the look changes: its bills, history, totals and search results stay.
// The backend stores the archive. This file keeps a copy on the phone only for mock mode and for an older backend
// without the endpoint (404 without a code), the same way derive.ts stands in for missing v2 endpoints.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProviderHistory, ProviderSummary } from './api/types';
import { dateRo } from './status';

const KEY = 'pago.providers.archived'; // {slug: ISO date-time}

export async function localArchive(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export async function setLocalArchived(slug: string, archived: boolean, now = new Date()): Promise<void> {
  const map = await localArchive();
  if (archived) map[slug] = map[slug] ?? now.toISOString();
  else delete map[slug];
  await AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});
}

/** True when the backend already speaks §8 (every card has a boolean `archived`). */
export const serverKnowsArchive = (list: Pick<ProviderSummary, 'archived'>[]) => list.length > 0 && list.every((p) => typeof p.archived === 'boolean');

/** Fill `archived` / `archived_at` from the phone's copy when the backend did not send them; archived go last. */
export function withArchive<T extends Pick<ProviderSummary, 'slug' | 'archived' | 'archived_at'>>(list: T[], local: Record<string, string>): T[] {
  const marked = serverKnowsArchive(list) ? list : list.map((p) => ({ ...p, archived: p.slug in local, archived_at: local[p.slug] ?? null }));
  return [...marked.filter((p) => !p.archived), ...marked.filter((p) => p.archived)];
}

export function historyWithArchive(h: ProviderHistory, local: Record<string, string>): ProviderHistory {
  if (typeof h.archived === 'boolean') return h;
  return { ...h, archived: h.slug in local, archived_at: local[h.slug] ?? null };
}

/** Active providers first (as given), the archive apart. */
export function splitArchived<T extends Pick<ProviderSummary, 'archived'>>(list: T[]): { active: T[]; archived: T[] } {
  return { active: list.filter((p) => !p.archived), archived: list.filter((p) => p.archived) };
}

/** "Arhivat pe 17.11.2026" (or just "Arhivat" without a date). */
export const archivedLabel = (at: string | null | undefined) => (at ? `Arhivat pe ${dateRo(at)}` : 'Arhivat');
