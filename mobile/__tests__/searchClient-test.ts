// api.search / api.searchVoice / api.paidDates against a mocked fetch (docs/API_V2.md §7).
import billsFixture from '../../shared/fixtures/bills.json';
import detailsFixture from '../../shared/fixtures/bill_details.json';
import searchFixture from '../../shared/fixtures/search.json';

type Client = typeof import('../src/api/client');

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });

const details = detailsFixture as unknown as Record<string, { id: number }>;
const notFound = () => json(404, { detail: 'Not found.' });

let fetchMock: jest.Mock;
let client: Client;
beforeEach(() => {
  jest.resetModules(); // fresh caches in the client for every test
  client = require('../src/api/client');
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

/** A backend without /search/ (older main): the app answers from /bills/ data. */
const oldBackend = (url: string) => {
  if (url.includes('/search/')) return notFound();
  if (url.endsWith('/bills/?all=1')) return json(200, billsFixture);
  if (url.endsWith('/bills/')) return json(200, billsFixture);
  const id = /\/bills\/(\d+)\/$/.exec(url)?.[1];
  if (id && details[id]) return json(200, details[id]);
  return notFound();
};

describe('api.search', () => {
  it('calls GET /search/ with the text and returns the backend answer', async () => {
    const answer = (searchFixture as Record<string, unknown>)['ppc octombrie'];
    fetchMock.mockReturnValueOnce(json(200, answer));
    const r = await client.api.search({ q: 'ppc octombrie' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/search\/\?q=ppc%20octombrie$/);
    expect(r.target).toEqual({ screen: 'Bill', id: 24 });
  });

  it('sends chip filters as params', async () => {
    fetchMock.mockReturnValueOnce(json(200, { results: [] }));
    await client.api.search({ provider: 'ppc', month: '2026-10' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/search\/\?provider=ppc&month=2026-10$/);
  });

  it('on 404 it searches locally with the same rules', async () => {
    fetchMock.mockImplementation((url: string) => oldBackend(url));
    const r = await client.api.search({ q: 'ppc octombrie' });
    expect(r.filters).toMatchObject({ provider: 'PPC', month: '2026-10' });
    expect(r.target).toEqual({ screen: 'Bill', id: 24 });
  });

  it('local errors look like the backend 400 (empty_query)', async () => {
    fetchMock.mockImplementation((url: string) => oldBackend(url));
    const err = await client.api.search({ q: '  ' }).catch((e) => e);
    expect(err).toBeInstanceOf(client.ApiRequestError);
    expect([err.status, err.code]).toEqual([400, 'empty_query']);
  });

  it('backend errors pass through with their Romanian detail (bad_month)', async () => {
    fetchMock.mockReturnValueOnce(json(400, { code: 'bad_month', detail: 'Luna trebuie să arate ca 2026-10.' }));
    const err = await client.api.search({ month: '2026-13' }).catch((e) => e);
    expect([err.code, err.message]).toEqual(['bad_month', 'Luna trebuie să arate ca 2026-10.']);
  });
});

describe('api.searchVoice', () => {
  const rec = { uri: 'file:///cache/rec.m4a', name: 'cautare.m4a', mimeType: 'audio/mp4' };

  it('POSTs the recording as multipart field "audio"', async () => {
    fetchMock.mockReturnValueOnce(json(200, { transcript: 'Factura PPC din octombrie', query: 'factura PPC din octombrie', results: [] }));
    const r = await client.api.searchVoice(rec);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/search\/voice\/$/);
    expect(init.method).toBe('POST');
    expect((init.body as FormData).getAll('audio')).toHaveLength(1);
    expect(r.transcript).toBe('Factura PPC din octombrie');
  });

  it('404 (voice not deployed) -> a clear message with the keyboard-mic fallback', async () => {
    fetchMock.mockReturnValueOnce(notFound());
    const err = await client.api.searchVoice(rec).catch((e) => e);
    expect(err.message).toBe(client.VOICE_OFF);
  });

  it('422 not_understood shows what was heard', async () => {
    fetchMock.mockReturnValueOnce(json(422, { code: 'not_understood', transcript: 'bună ziua', detail: 'Am auzit „bună ziua”, dar n-am înțeles ce factură cauți.' }));
    const err = await client.api.searchVoice(rec).catch((e) => e);
    expect([err.status, err.code]).toEqual([422, 'not_understood']);
    expect(err.message).toMatch(/bună ziua/);
  });

  it('a request that takes too long ends with a clear message (edge case)', async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    const err = await client.api.searchVoice(rec).catch((e) => e);
    expect([err.code, err.message]).toEqual(['timeout', client.VOICE_SLOW]);
  });

  it('503 ai_busy and 429 keep the backend text', async () => {
    fetchMock.mockReturnValueOnce(json(503, { code: 'ai_busy', detail: 'Asistentul e ocupat. Încearcă din nou.' }));
    expect((await client.api.searchVoice(rec).catch((e) => e)).code).toBe('ai_busy');
    fetchMock.mockReturnValueOnce(json(429, { code: 'too_many_requests', detail: 'Prea multe încercări.' }));
    expect((await client.api.searchVoice(rec).catch((e) => e)).status).toBe(429);
  });
});

describe('api.paidDates', () => {
  it('maps paid bills to paid_at and shares the cached /bills/?all=1 call with billStatuses', async () => {
    fetchMock.mockReturnValueOnce(
      json(200, [
        { id: 1, status: 'paid', paid_at: '2026-10-16', validation_status: 'accepted' },
        { id: 2, status: 'unpaid', paid_at: null, validation_status: 'needs_review' },
        { id: 3, status: 'paid' }, // older backend: no paid_at
      ]),
    );
    const paid = await client.api.paidDates();
    expect([...paid.entries()]).toEqual([[1, '2026-10-16']]);
    expect((await client.api.billStatuses()).get(2)).toBe('needs_review');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('paying drops the cache so the new date shows', async () => {
    fetchMock.mockReturnValueOnce(json(200, [{ id: 1, status: 'unpaid', paid_at: null }]));
    await client.api.paidDates();
    fetchMock.mockReturnValueOnce(json(200, { status: 'paid', reasons: [] }));
    await client.api.pay(1, 'manual');
    fetchMock.mockReturnValueOnce(json(200, [{ id: 1, status: 'paid', paid_at: '2026-11-17' }]));
    expect((await client.api.paidDates()).get(1)).toBe('2026-11-17');
  });
});
