// "Adaugă furnizor": Romanian provider list, search, hand-added providers; whole-row colours in provider history.
import AsyncStorage from '@react-native-async-storage/async-storage';
import fs from 'fs';
import path from 'path';
import { slugify } from '../src/api/derive';
import { THEMES } from '../src/mode';
import { addManualProvider, fold, manualProviders, removeManualProvider, RO_PROVIDERS, searchProviders, withoutBills } from '../src/providersRo';
import { rowTone } from '../src/status';

beforeEach(() => AsyncStorage.clear());

describe('RO_PROVIDERS', () => {
  it('names and slugs are unique, every provider has a category', () => {
    const names = RO_PROVIDERS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(names.map(slugify)).size).toBe(names.length);
    expect(RO_PROVIDERS.every((p) => p.categories.length > 0)).toBe(true);
  });

  it('uses the same canonical names as the backend, so scanned bills land on them', () => {
    const py = fs.readFileSync(path.join(__dirname, '../../backend/bills/services/providers.py'), 'utf8');
    const canonical = [...new Set([...py.matchAll(/:\s*"([^"]+)",/g)].map((m) => m[1]))];
    expect(canonical.length).toBeGreaterThan(5);
    for (const name of canonical) expect(RO_PROVIDERS.map((p) => p.name)).toContain(name);
  });
});

describe('searchProviders', () => {
  it('ignores diacritics and case', () => {
    expect(fold('București')).toBe('bucuresti');
    expect(searchProviders('BUCURESTI').map((p) => p.name)).toEqual(['Apa Nova București']);
  });

  it('matches aliases (enel -> PPC, rcs -> Digi)', () => {
    expect(searchProviders('enel')[0].name).toBe('PPC');
    expect(searchProviders('rcs')[0].name).toBe('Digi');
  });

  it('prefix matches come before matches in the middle', () => {
    const names = searchProviders('apa').map((p) => p.name);
    expect(names[0]).toMatch(/^Apa/);
    expect(names).toContain('Compania de Apă Someș'); // "Apă" inside the name
  });

  it('filters by category; Engie appears for gas and for electricity', () => {
    expect(searchProviders('', 'gas').map((p) => p.name)).toContain('Engie');
    expect(searchProviders('', 'electricity').map((p) => p.name)).toContain('Engie');
    expect(searchProviders('', 'water').every((p) => p.categories.includes('water'))).toBe(true);
  });

  it('empty query lists everything (alphabetical); no match gives an empty list', () => {
    expect(searchProviders('')).toHaveLength(RO_PROVIDERS.length);
    expect(searchProviders('xyz-nu-exista')).toEqual([]);
  });
});

describe('hand-added providers', () => {
  it('adds once per slug and can remove', async () => {
    await addManualProvider('Premier Energy', 'electricity');
    await addManualProvider('  Premier Energy ', 'gas'); // same slug -> ignored
    expect(await manualProviders()).toEqual([{ name: 'Premier Energy', slug: 'premier-energy', category: 'electricity' }]);
    await removeManualProvider('premier-energy');
    expect(await manualProviders()).toEqual([]);
  });

  it('a custom name (association) is accepted', async () => {
    const p = await addManualProvider('Asociația de proprietari Bl. 5', 'other');
    expect(p.slug).toBe('asociatia-de-proprietari-bl-5');
  });

  it('an empty name is refused (edge case)', async () => {
    await expect(addManualProvider('   ', 'other')).rejects.toThrow(/numele/);
  });

  it('corrupt storage reads as empty (edge case)', async () => {
    await AsyncStorage.setItem('pago.providers.manual', '{"oops":');
    expect(await manualProviders()).toEqual([]);
  });

  it('once the backend has bills for it, the hand-added entry is no longer "without bills"', () => {
    const manual = [
      { name: 'Premier Energy', slug: 'premier-energy', category: 'electricity' as const },
      { name: 'Digi', slug: 'digi', category: 'telecom' as const },
    ];
    expect(withoutBills(manual, [{ slug: 'digi' }]).map((m) => m.slug)).toEqual(['premier-energy']);
  });
});

describe('rowTone (whole-box colour in provider history)', () => {
  const t = THEMES.millennial;
  it('anomaly = red box, attention = yellow box, ok = plain', () => {
    expect(rowTone('critical', t)).toEqual({ bg: t.sev.critical.bg, border: t.sev.critical.color });
    expect(rowTone('warning', t)).toEqual({ bg: t.sev.warning.bg, border: t.sev.warning.color });
    expect(rowTone('ok', t)).toBeNull();
  });

  it('works in the dark Innovative theme too', () => {
    expect(rowTone('critical', THEMES.genz)!.bg).toBe(THEMES.genz.sev.critical.bg);
  });
});
