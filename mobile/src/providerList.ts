// "My providers": a provider that first appears through a scan is kept aside (pending) and only shows up in the
// Providers tab after the user says yes ("Adaugi X la furnizorii tăi?", asked after paying its bill).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pago.providers.pending';

export async function pendingProviders(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function save(set: Set<string>) {
  await AsyncStorage.setItem(KEY, JSON.stringify([...set])).catch(() => {});
}

export async function markPending(slug: string) {
  const set = await pendingProviders();
  set.add(slug);
  await save(set);
}

/** User answered "Adaugă": the provider joins the list. */
export async function acceptProvider(slug: string) {
  const set = await pendingProviders();
  set.delete(slug);
  await save(set);
}
