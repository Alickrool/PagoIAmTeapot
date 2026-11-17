// API client against a mocked fetch: error parsing (AV1), confirm, statuses cache, scan upload, v2 fallback.
import { api, ApiRequestError, parseApiError } from '../src/api/client';

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('parseApiError', () => {
  it('reads v2 {code, detail, existing_bill_id}', () => {
    const e = parseApiError(409, JSON.stringify({ code: 'duplicate_bill', detail: 'Ai scanat deja factura asta.', existing_bill_id: 581 }));
    expect(e).toBeInstanceOf(ApiRequestError);
    expect([e.status, e.code, e.message, e.existingBillId]).toEqual([409, 'duplicate_bill', 'Ai scanat deja factura asta.', 581]);
  });

  it('reads v1 {detail}', () => {
    const e = parseApiError(400, JSON.stringify({ detail: 'Index invalid.' }));
    expect([e.code, e.message, e.existingBillId]).toEqual([null, 'Index invalid.', null]);
  });

  it('keeps raw text that is not JSON (e.g. an HTML error page)', () => {
    expect(parseApiError(500, '<h1>Server Error</h1>').message).toBe('<h1>Server Error</h1>');
  });

  it('never returns an empty message', () => {
    expect(parseApiError(502, '').message).toBe('HTTP 502');
  });

  it('ignores a non-numeric existing_bill_id (edge case)', () => {
    expect(parseApiError(409, JSON.stringify({ code: 'duplicate_bill', detail: 'x', existing_bill_id: 'abc' })).existingBillId).toBeNull();
  });
});

describe('api calls', () => {
  it('confirmBill POSTs to /confirm/ and returns the bill', async () => {
    fetchMock.mockReturnValueOnce(json(200, { id: 7, validation: { status: 'accepted', confirmed_by_user: true } }));
    const bill = await api.confirmBill(7);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/bills\/7\/confirm\/$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(bill.validation?.confirmed_by_user).toBe(true);
  });

  it('billStatuses maps id -> validation_status and caches for 30 s', async () => {
    fetchMock.mockReturnValueOnce(
      json(200, [
        { id: 1, validation_status: 'accepted' },
        { id: 2, validation_status: 'needs_review' },
        { id: 3 }, // older backend without the field
      ]),
    );
    const first = await api.billStatuses();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/bills\/\?all=1$/);
    expect(first.get(2)).toBe('needs_review');
    expect(first.has(3)).toBe(false);
    await api.billStatuses();
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('confirming a bill refreshes the statuses (no stale "De verificat" mark)', async () => {
    let status = 'needs_review';
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/confirm/')) {
        status = 'accepted';
        return json(200, { id: 2, validation: { status, confirmed_by_user: true } });
      }
      return json(200, [{ id: 2, validation_status: status }]);
    });
    await api.confirmBill(2); // also clears whatever an earlier test cached
    status = 'needs_review';
    expect((await api.billStatuses()).get(2)).toBe('needs_review');
    expect((await api.billStatuses()).get(2)).toBe('needs_review'); // cached
    await api.confirmBill(2);
    expect((await api.billStatuses()).get(2)).toBe('accepted'); // cache dropped by confirm
  });

  it('scanBill sends every page as `files` and surfaces 409 with existing_bill_id', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/bills/scan/')) return json(409, { code: 'duplicate_bill', detail: 'Ai scanat deja factura asta.', existing_bill_id: 9 });
      return json(200, {});
    });
    const pages = [
      { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' },
      { uri: 'file:///b.jpg', name: 'b.jpg', mimeType: 'image/jpeg' },
    ];
    const err = await api.scanBill(pages).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.existingBillId).toBe(9);
    const scanCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/bills/scan/'))!;
    const form = scanCall[1].body as FormData;
    expect(form.getAll('files')).toHaveLength(2);
  });

  it('dashboard uses the live endpoint when it exists', async () => {
    fetchMock.mockReturnValueOnce(json(200, { month: '2026-10', total: '10.00', slices: [], months: [] }));
    const d = await api.dashboard('2026-10');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/dashboard\/\?month=2026-10$/);
    expect(d.month).toBe('2026-10');
  });

  it('hasBillPdf is false when the PDF is missing or the network fails', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 404 }));
    expect(await api.hasBillPdf(5)).toBe(false);
    fetchMock.mockReturnValueOnce(Promise.reject(new Error('Network request failed')));
    expect(await api.hasBillPdf(5)).toBe(false);
  });
});
