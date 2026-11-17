// Search bar, search screen (text + voice) and the whole-card colours in the providers list (docs/API_V2.md §7).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import searchFixture from '../../shared/fixtures/search.json';
import { api } from '../src/api/client';
import type { ProviderSummary, SearchResponse } from '../src/api/types';
import { SearchBar } from '../src/components/SearchBar';
import { ModeProvider, THEMES } from '../src/mode';
import ProvidersScreen from '../src/screens/ProvidersScreen';
import SearchScreen, { DEBOUNCE_MS, groupByMonth, targetLabel } from '../src/screens/SearchScreen';
import { MAX_SECONDS, MIC_DENIED } from '../src/voice';

jest.mock('../src/api/client', () => ({
  MOCK: false,
  api: { search: jest.fn(), searchVoice: jest.fn(), providers: jest.fn(), billPdfUrl: (id: number) => `http://test/api/bills/${id}/pdf/` },
}));

const mockRecorder = { prepareToRecordAsync: jest.fn(() => Promise.resolve()), record: jest.fn(), stop: jest.fn(() => Promise.resolve()), uri: 'file:///cache/rec.m4a' };
const mockPermission = jest.fn(() => Promise.resolve({ granted: true }));
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => mockRecorder,
  requestRecordingPermissionsAsync: () => mockPermission(),
  setAudioModeAsync: () => Promise.resolve(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});

const cases = searchFixture as unknown as Record<string, SearchResponse>;
const search = api.search as jest.Mock;
const searchVoice = api.searchVoice as jest.Mock;

const nav = () => ({ navigate: jest.fn(), popTo: jest.fn() });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = async (params?: { q?: string; voice?: boolean }, navigation = nav()) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await render(<SearchScreen navigation={navigation as any} route={{ key: 'Search', name: 'Search', params } as any} />);
  return navigation;
};
const flush = () => act(async () => {});
const input = () => screen.getByLabelText('Caută o factură');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  search.mockReset(); // also drops answers queued with mock…Once by an earlier test
  searchVoice.mockReset();
  search.mockImplementation(({ q }: { q?: string }) => Promise.resolve(cases[q ?? ''] ?? cases['ppc octombrie']));
});
afterEach(() => jest.useRealTimers());

describe('SearchScreen: text', () => {
  it('waits until typing stops (300 ms) and searches only the last text', async () => {
    await open();
    await fireEvent.changeText(input(), 'pp');
    await fireEvent.changeText(input(), 'ppc octombrie');
    await act(() => jest.advanceTimersByTime(DEBOUNCE_MS - 1));
    expect(search).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1));
    await flush();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({ q: 'ppc octombrie' });
    expect(screen.getByText('Am găsit o factură: PPC · octombrie 2026.')).toBeTruthy();
  });

  it('shows examples first; tapping one searches at once', async () => {
    await open();
    await fireEvent.press(screen.getByText('luna trecută'));
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    expect(search).toHaveBeenCalledWith({ q: 'luna trecută' });
    expect(screen.getByText('Septembrie 2026')).toBeTruthy(); // month group header
  });

  it('shows chips, the understood message, month groups and "Plătită pe …"', async () => {
    await open({ q: 'PPC' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    expect(screen.getByLabelText('Scoate filtrul PPC')).toBeTruthy();
    expect(screen.getByText('Octombrie 2026')).toBeTruthy();
    expect(screen.getByText('De plată · scadentă 20.11.2026')).toBeTruthy();
    expect(screen.getAllByText(/^Plătită pe \d\d\.\d\d\.2026$/).length).toBeGreaterThan(0);
  });

  it('the top action opens the one bill found', async () => {
    const navigation = await open({ q: 'ppc octombrie' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    await fireEvent.press(screen.getByText('Deschide factura PPC · octombrie 2026'));
    expect(navigation.navigate).toHaveBeenCalledWith('Bill', { id: 24, notice: undefined });
  });

  it('provider target -> provider history', async () => {
    const navigation = await open({ q: 'PPC' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    await fireEvent.press(screen.getByText('Vezi istoricul PPC'));
    expect(navigation.navigate).toHaveBeenCalledWith('Provider', { slug: 'ppc', provider: 'PPC', month: null });
  });

  it('month target -> back home on that month', async () => {
    const navigation = await open({ q: 'luna trecută' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    await fireEvent.press(screen.getByText('Vezi luna septembrie 2026'));
    expect(navigation.popTo).toHaveBeenCalledWith('Tabs', { screen: 'Overview', params: { month: '2026-09' } });
  });

  it('× on a chip searches again with the other chips as params; the last × clears', async () => {
    await open({ q: 'ppc octombrie' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    search.mockResolvedValueOnce(cases.PPC); // the backend's answer for provider=ppc
    await fireEvent.press(screen.getByLabelText('Scoate filtrul octombrie 2026'));
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    expect(search).toHaveBeenLastCalledWith({ provider: 'ppc' });
    expect(input().props.value).toBe('PPC');

    await fireEvent.press(screen.getByLabelText('Scoate filtrul PPC'));
    expect(input().props.value).toBe('');
    expect(screen.getByText('luna trecută')).toBeTruthy(); // examples again
  });

  it('API errors are shown in Romanian', async () => {
    search.mockRejectedValueOnce(new Error('Luna trebuie să arate ca 2026-10.'));
    await open({ q: '13/2026' });
    await act(() => jest.advanceTimersByTime(0));
    await flush();
    expect(screen.getByText('Luna trebuie să arate ca 2026-10.')).toBeTruthy();
  });

  it('a late answer for old text does not overwrite a cleared field (edge case)', async () => {
    let resolve!: (r: SearchResponse) => void;
    search.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await open();
    await fireEvent.changeText(input(), 'ppc');
    await act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    await fireEvent.press(screen.getByLabelText('Șterge căutarea'));
    await act(async () => resolve(cases.PPC));
    expect(screen.queryByText('Vezi istoricul PPC')).toBeNull();
  });
});

describe('SearchScreen: voice', () => {
  const heard: SearchResponse = { ...cases['ppc octombrie'], transcript: 'Factura PPC din octombrie', query: 'factura PPC din octombrie' };

  it('opened from the mic: listens, sends the recording, shows what it heard and opens the bill', async () => {
    searchVoice.mockResolvedValueOnce(heard);
    const navigation = await open({ voice: true });
    await act(() => jest.advanceTimersByTime(300));
    await flush();
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(screen.getByText('Te ascult… spune ce factură cauți')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText('Oprește înregistrarea')[0]);
    await flush();
    expect(searchVoice).toHaveBeenCalledWith({ uri: 'file:///cache/rec.m4a', name: 'cautare.m4a', mimeType: 'audio/mp4' });
    expect(input().props.value).toBe('Factura PPC din octombrie');
    expect(navigation.navigate).toHaveBeenCalledWith('Bill', { id: 24, notice: 'Am auzit: „Factura PPC din octombrie”' });
  });

  it(`stops by itself after ${MAX_SECONDS} s`, async () => {
    searchVoice.mockResolvedValueOnce(heard);
    await open();
    await fireEvent.press(screen.getByLabelText('Caută cu vocea'));
    await flush();
    expect(mockRecorder.record).toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(MAX_SECONDS * 1000));
    await flush();
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(searchVoice).toHaveBeenCalledTimes(1);
  });

  it('no microphone permission -> a clear message, nothing recorded', async () => {
    mockPermission.mockResolvedValueOnce({ granted: false });
    await open();
    await fireEvent.press(screen.getByLabelText('Caută cu vocea'));
    await flush();
    expect(screen.getByText(MIC_DENIED)).toBeTruthy();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it('server errors (e.g. 422 not understood) are shown and nothing opens', async () => {
    searchVoice.mockRejectedValueOnce(new Error('Am auzit „bună ziua”, dar n-am înțeles ce factură cauți.'));
    const navigation = await open();
    await fireEvent.press(screen.getByLabelText('Caută cu vocea'));
    await flush();
    await fireEvent.press(screen.getAllByLabelText('Oprește înregistrarea')[0]);
    await flush();
    expect(screen.getByText(/bună ziua/)).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('groupByMonth keeps the API order and makes one group per month', () => {
    const groups = groupByMonth(cases.PPC.results);
    expect(groups).toHaveLength(12);
    expect(groups[0].title).toBe('Octombrie 2026');
  });

  it('targetLabel', () => {
    expect(targetLabel({ screen: 'Provider', slug: 'ppc', provider: 'PPC', month: null }, [])).toBe('Vezi istoricul PPC');
    expect(targetLabel({ screen: 'Bill', id: 999 }, [])).toBe('Deschide factura');
  });
});

describe('SearchBar (above the tabs)', () => {
  it('the pill opens search, the mic opens voice search', async () => {
    jest.useRealTimers();
    await render(<SearchBar />);
    await fireEvent.press(screen.getByLabelText('Caută o factură…'));
    expect(mockNavigate).toHaveBeenCalledWith('Search');
    await fireEvent.press(screen.getByLabelText('Caută cu vocea'));
    expect(mockNavigate).toHaveBeenCalledWith('Search', { voice: true });
  });

  it('Senior: the mic comes first', async () => {
    jest.useRealTimers();
    await AsyncStorage.setItem('pago.mode', 'senior');
    await render(
      <ModeProvider>
        <SearchBar />
      </ModeProvider>,
    );
    await screen.findByLabelText('Căutați o factură…');
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Caută cu vocea')).toBeLessThan(tree.indexOf('Căutați o factură…'));
  });
});

describe('Providers list: the whole card takes the colour of its state', () => {
  const p = (slug: string, audit_status: ProviderSummary['audit_status']): ProviderSummary => ({
    provider: slug.toUpperCase(),
    slug,
    category: 'electricity',
    bills_count: 12,
    last_bill_id: 1,
    last_period_end: '2026-10-31',
    last_total: '100.00',
    average_total: '90.00',
    trend_pct: 5,
    audit_status,
    anomalies_count: audit_status === 'ok' ? 0 : 1,
    totals: [],
  });

  it('red for an anomaly, yellow for a warning, plain when ok', async () => {
    jest.useRealTimers();
    await AsyncStorage.clear();
    (api.providers as jest.Mock).mockResolvedValue([p('ppc', 'critical'), p('engie', 'warning'), p('apa', 'ok')]);
    await render(<ProvidersScreen />);
    await screen.findByTestId('provider-ppc');
    const t = THEMES.millennial;
    const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(style('provider-ppc')).toMatchObject({ backgroundColor: t.sev.critical.bg, borderColor: t.sev.critical.color });
    expect(style('provider-engie')).toMatchObject({ backgroundColor: t.sev.warning.bg, borderColor: t.sev.warning.color });
    expect(style('provider-apa').backgroundColor).toBe(t.surface);
    expect(screen.getByLabelText('PPC, anomalie')).toBeTruthy();
  });
});
