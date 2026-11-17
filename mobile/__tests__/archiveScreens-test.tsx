// Archive UI (docs/API_V2.md §8): the "Arhivă" section in the providers list and the buttons on the history screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import billsFixture from '../../shared/fixtures/bills.json';
import detailsFixture from '../../shared/fixtures/bill_details.json';
import { api } from '../src/api/client';
import { providerHistory, toPoints } from '../src/api/derive';
import type { BillDetail, BillSummary, ProviderSummary } from '../src/api/types';
import ProviderScreen from '../src/screens/ProviderScreen';
import ProvidersScreen from '../src/screens/ProvidersScreen';

jest.mock('../src/api/client', () => ({
  MOCK: false,
  api: {
    providers: jest.fn(),
    providerHistory: jest.fn(),
    billStatuses: jest.fn(() => Promise.resolve(new Map())),
    paidDates: jest.fn(() => Promise.resolve(new Map())),
    setProviderArchived: jest.fn(),
  },
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

const points = toPoints(Object.values(detailsFixture as unknown as Record<string, BillDetail>), billsFixture as unknown as BillSummary[]);
const digiHistory = providerHistory(points, 'digi');

const card = (slug: string, provider: string, extra: Partial<ProviderSummary> = {}): ProviderSummary => ({
  provider,
  slug,
  category: 'telecom',
  bills_count: 13,
  last_bill_id: 36,
  last_period_end: '2026-10-31',
  last_total: '60.00',
  average_total: '52.33',
  trend_pct: 5,
  audit_status: 'warning',
  anomalies_count: 1,
  totals: [],
  archived: false,
  archived_at: null,
  ...extra,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('Providers list: the archive section', () => {
  beforeEach(() => {
    (api.providers as jest.Mock).mockResolvedValue([
      card('ppc', 'PPC', { category: 'electricity', audit_status: 'critical' }),
      card('digi', 'Digi', { archived: true, archived_at: '2026-11-17T09:20:11+00:00' }),
    ]);
  });

  it('archived providers are not in the main list; the section is closed and shows the count', async () => {
    await render(<ProvidersScreen />);
    await screen.findByText('PPC');
    expect(screen.getByText('Arhivă · 1')).toBeTruthy();
    expect(screen.queryByText('Digi')).toBeNull();
  });

  it('opening the section shows the grey card with the date; tapping opens the history (bills stay)', async () => {
    await render(<ProvidersScreen />);
    await fireEvent.press(await screen.findByLabelText('Arhivă, 1 furnizor'));
    expect(screen.getByText('Arhivat pe 17.11.2026 · 13 facturi')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('archived-digi'));
    expect(mockNavigate).toHaveBeenCalledWith('Provider', { slug: 'digi', provider: 'Digi' });
  });

  it('no archived providers -> no section', async () => {
    (api.providers as jest.Mock).mockResolvedValue([card('ppc', 'PPC')]);
    await render(<ProvidersScreen />);
    await screen.findByText('PPC');
    expect(screen.queryByText(/^Arhivă/)).toBeNull();
  });
});

describe('Provider history: archive / bring back', () => {
  const nav = () => ({ navigate: jest.fn(), setOptions: jest.fn() });
  const open = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await render(<ProviderScreen navigation={nav() as any} route={{ key: 'Provider', name: 'Provider', params: { slug: 'digi', provider: 'Digi' } } as any} />);
    await screen.findByText('Toate facturile · ' + digiHistory.bills.length);
  };

  it('"Mută în arhivă" asks first, then archives, shows the banner and a toast; the bills stay', async () => {
    (api.providerHistory as jest.Mock).mockResolvedValue({ ...digiHistory, archived: false, archived_at: null });
    (api.setProviderArchived as jest.Mock).mockResolvedValue(card('digi', 'Digi', { archived: true, archived_at: '2026-11-17T09:20:11+00:00' }));
    await open();
    expect(screen.queryByTestId('archived-banner')).toBeNull();

    await fireEvent.press(screen.getByText('Mută în arhivă'));
    expect(screen.getByText('Muți Digi în arhivă?')).toBeTruthy(); // millennial copy (default mode)
    expect(api.setProviderArchived).not.toHaveBeenCalled();

    const buttons = screen.getAllByText('Mută în arhivă'); // the page button + the dialog's confirm
    await fireEvent.press(buttons[buttons.length - 1]);
    await act(async () => {});
    expect(api.setProviderArchived).toHaveBeenCalledWith('digi', true);
    expect(screen.getByTestId('archived-banner')).toBeTruthy();
    expect(screen.getByText('Arhivat pe 17.11.2026 · facturile rămân aici')).toBeTruthy();
    expect(screen.getByText('Digi a fost mutat în arhivă. Facturile rămân disponibile.')).toBeTruthy();
    expect(screen.getByText('Scoate din arhivă')).toBeTruthy();
    expect(screen.getByText('Toate facturile · ' + digiHistory.bills.length)).toBeTruthy();
  });

  it('"Renunță" does nothing', async () => {
    (api.providerHistory as jest.Mock).mockResolvedValue({ ...digiHistory, archived: false, archived_at: null });
    await open();
    await fireEvent.press(screen.getByText('Mută în arhivă'));
    await fireEvent.press(screen.getByText('Renunță'));
    expect(api.setProviderArchived).not.toHaveBeenCalled();
  });

  it('an archived provider can be brought back without a question', async () => {
    (api.providerHistory as jest.Mock).mockResolvedValue({ ...digiHistory, archived: true, archived_at: '2026-11-17T09:20:11+00:00' });
    (api.setProviderArchived as jest.Mock).mockResolvedValue(card('digi', 'Digi', { archived: false, archived_at: null }));
    await open();
    expect(screen.getByTestId('archived-banner')).toBeTruthy();
    await fireEvent.press(screen.getByText('Scoate din arhivă'));
    await act(async () => {});
    expect(api.setProviderArchived).toHaveBeenCalledWith('digi', false);
    expect(screen.queryByTestId('archived-banner')).toBeNull();
    expect(screen.getByText('Digi a revenit în lista de furnizori.')).toBeTruthy();
  });

  it('a server error is shown and the state stays the same', async () => {
    (api.providerHistory as jest.Mock).mockResolvedValue({ ...digiHistory, archived: false, archived_at: null });
    (api.setProviderArchived as jest.Mock).mockRejectedValue(new Error('Nu există furnizorul „digi”.'));
    await open();
    await fireEvent.press(screen.getByText('Mută în arhivă'));
    const buttons = screen.getAllByText('Mută în arhivă');
    await fireEvent.press(buttons[buttons.length - 1]);
    await act(async () => {});
    expect(screen.getByText('Nu există furnizorul „digi”.')).toBeTruthy();
    expect(screen.queryByTestId('archived-banner')).toBeNull();
  });
});
