// Provider archive (docs/API_V2.md §8): helpers, the phone-side copy for mock mode / older backends, and the API calls.
import AsyncStorage from '@react-native-async-storage/async-storage';
import detailsFixture from '../../shared/fixtures/bill_details.json';
import { archivedLabel, historyWithArchive, localArchive, serverKnowsArchive, setLocalArchived, splitArchived, withArchive } from '../src/archive';
import type { ProviderHistory, ProviderSummary } from '../src/api/types';

type Client = typeof import('../src/api/client');

const card = (slug: string, extra: Partial<ProviderSummary> = {}): ProviderSummary => ({
  provider: slug.toUpperCase(),
  slug,
  category: 'electricity',
  bills_count: 12,
  last_bill_id: 1,
  last_period_end: '2026-10-31',
  last_total: '100.00',
  average_total: '90.00',
  trend_pct: 5,
  audit_status: 'ok',
  anomalies_count: 0,
  totals: [],
  ...extra,
});

beforeEach(() => AsyncStorage.clear());

describe('archive helpers', () => {
  it('the backend decides when it sends `archived` (the phone copy is ignored)', () => {
    const fromServer = [card('ppc', { archived: false, archived_at: null }), card('digi', { archived: true, archived_at: '2026-11-17T09:00:00Z' })];
    expect(serverKnowsArchive(fromServer)).toBe(true);
    const out = withArchive(fromServer, { ppc: '2026-11-01T00:00:00Z' });
    expect(out.map((p) => [p.slug, p.archived])).toEqual([
      ['ppc', false],
      ['digi', true],
    ]);
  });

  it('an older backend without the field: the phone copy marks them and moves them last', () => {
    const out = withArchive([card('digi'), card('ppc'), card('engie')], { digi: '2026-11-17T09:00:00Z' });
    expect(out.map((p) => p.slug)).toEqual(['ppc', 'engie', 'digi']);
    expect(out[2]).toMatchObject({ archived: true, archived_at: '2026-11-17T09:00:00Z' });
    expect(out[0]).toMatchObject({ archived: false, archived_at: null });
  });

  it('history: same rule', () => {
    const h = { slug: 'digi', provider: 'Digi' } as ProviderHistory;
    expect(historyWithArchive(h, { digi: '2026-11-17T09:00:00Z' })).toMatchObject({ archived: true });
    expect(historyWithArchive({ ...h, archived: false, archived_at: null }, { digi: 'x' }).archived).toBe(false);
  });

  it('splitArchived keeps the order of each part', () => {
    const { active, archived } = splitArchived([card('a'), card('b', { archived: true }), card('c'), card('d', { archived: true })]);
    expect(active.map((p) => p.slug)).toEqual(['a', 'c']);
    expect(archived.map((p) => p.slug)).toEqual(['b', 'd']);
  });

  it('archivedLabel shows the day in Romanian format', () => {
    expect(archivedLabel('2026-11-17T09:20:11.123456+00:00')).toBe('Arhivat pe 17.11.2026');
    expect(archivedLabel(null)).toBe('Arhivat');
  });

  it('phone copy: archiving twice keeps the first date; un-archiving removes it', async () => {
    await setLocalArchived('digi', true, new Date('2026-11-17T09:00:00Z'));
    await setLocalArchived('digi', true, new Date('2026-12-01T09:00:00Z'));
    expect(await localArchive()).toEqual({ digi: '2026-11-17T09:00:00.000Z' });
    await setLocalArchived('digi', false);
    expect(await localArchive()).toEqual({});
  });

  it('corrupt storage reads as an empty archive (edge case)', async () => {
    await AsyncStorage.setItem('pago.providers.archived', '["oops"]');
    expect(await localArchive()).toEqual({});
  });
});

describe('api.setProviderArchived (§8)', () => {
  const json = (status: number, body: unknown) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  let fetchMock: jest.Mock;
  let client: Client;
  let stored: () => Promise<Record<string, string>>; // the phone copy as the fresh client sees it
  beforeEach(() => {
    jest.resetModules();
    client = require('../src/api/client');
    stored = require('../src/archive').localArchive;
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('POST archives, DELETE brings it back; the backend card is returned', async () => {
    fetchMock.mockReturnValueOnce(json(200, card('digi', { archived: true, archived_at: '2026-11-17T09:00:00Z' })));
    const on = await client.api.setProviderArchived('digi', true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/providers\/digi\/archive\/$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(on.archived).toBe(true);

    fetchMock.mockReturnValueOnce(json(200, card('digi', { archived: false, archived_at: null })));
    const off = await client.api.setProviderArchived('digi', false);
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(off.archived).toBe(false);
  });

  it('404 unknown_provider is shown as is (no phone copy)', async () => {
    fetchMock.mockReturnValueOnce(json(404, { code: 'unknown_provider', detail: 'Nu există furnizorul „xyz”.' }));
    const err = await client.api.setProviderArchived('xyz', true).catch((e) => e);
    expect([err.code, err.message]).toEqual(['unknown_provider', 'Nu există furnizorul „xyz”.']);
    expect(await stored()).toEqual({});
  });

  it('a backend without §8 (bare 404): kept on the phone, and the list shows it archived', async () => {
    const details = detailsFixture as unknown as Record<string, { id: number }>;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/archive/') || url.includes('/providers/')) return json(404, { detail: 'Not found.' });
      if (url.endsWith('/bills/?all=1') || url.endsWith('/bills/')) return json(200, require('../../shared/fixtures/bills.json'));
      const id = /\/bills\/(\d+)\/$/.exec(url)?.[1];
      return id && details[id] ? json(200, details[id]) : json(404, {});
    });
    const result = await client.api.setProviderArchived('digi', true);
    expect(result).toMatchObject({ slug: 'digi', archived: true });
    expect(Object.keys(await stored())).toEqual(['digi']);
    const list = await client.api.providers();
    expect(list[list.length - 1]).toMatchObject({ slug: 'digi', archived: true });
    expect((await client.api.providerHistory('digi')).archived).toBe(true);
  });
});
