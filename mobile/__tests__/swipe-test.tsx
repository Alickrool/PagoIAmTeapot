// Swipe left to archive (docs/API_V2.md §8), the undo bar, the app name "AI Pago" and the mode names.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { Text } from 'react-native';
import { api } from '../src/api/client';
import type { ProviderSummary } from '../src/api/types';
import { ACTION_W, COMMIT_DX, rubber, SwipeAction, swipeEnd } from '../src/components/SwipeAction';
import { UndoBar } from '../src/components/UndoBar';
import { COPY } from '../src/mode';
import ProvidersScreen from '../src/screens/ProvidersScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('../src/api/client', () => ({
  MOCK: false,
  api: { providers: jest.fn(), setProviderArchived: jest.fn() },
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

const card = (slug: string, provider: string, extra: Partial<ProviderSummary> = {}): ProviderSummary => ({
  provider,
  slug,
  category: 'telecom',
  bills_count: 13,
  last_bill_id: 1,
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

describe('swipe rules (distances measured to the left)', () => {
  it('a short swipe goes back, half the button opens it, a long swipe does it at once', () => {
    expect(swipeEnd(30, 0, false)).toBe('close');
    expect(swipeEnd(ACTION_W / 2, 0, false)).toBe('open');
    expect(swipeEnd(COMMIT_DX, 0, false)).toBe('commit');
  });

  it('a quick flick opens even when short; dragging an open card back closes it', () => {
    expect(swipeEnd(30, 0.8, false)).toBe('open');
    expect(swipeEnd(-80, -0.5, true)).toBe('close');
    expect(swipeEnd(COMMIT_DX - ACTION_W, 0, true)).toBe('commit'); // already open: counts from the button
  });

  it('past the button the card follows more slowly (rubber band); never goes left', () => {
    expect(rubber(-20)).toBe(0);
    expect(rubber(ACTION_W)).toBe(ACTION_W);
    expect(rubber(ACTION_W + 100)).toBe(ACTION_W + 60);
  });
});

describe('SwipeAction', () => {
  it('the uncovered button runs the action after the fly-out animation', async () => {
    const onAction = jest.fn();
    await render(
      <SwipeAction label="Arhivează" icon="archive" onAction={onAction} testID="swipe-x">
        <Text>Digi</Text>
      </SwipeAction>,
    );
    await fireEvent.press(screen.getByTestId('swipe-x-action'));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByTestId('swipe-x-action')); // a second tap during/after the animation does nothing
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('UndoBar', () => {
  it('shows the message, undo works, and it leaves by itself', async () => {
    jest.useFakeTimers();
    const onAction = jest.fn();
    const onHide = jest.fn();
    await render(<UndoBar message="Digi e în arhivă." action="Anulează" onAction={onAction} onHide={onHide} duration={6000} />);
    await fireEvent.press(screen.getByText('Anulează'));
    expect(onAction).toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(6500));
    expect(onHide).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('Providers list: archive from the list', () => {
  beforeEach(() => {
    (api.providers as jest.Mock).mockResolvedValue([card('ppc', 'PPC', { audit_status: 'critical' }), card('digi', 'Digi')]);
  });

  it('no intro sentence on top; the swipe hint sits under "Adaugă furnizor"', async () => {
    await render(<ProvidersScreen />);
    expect(await screen.findByText(COPY.millennial.swipeHint)).toBeTruthy();
    expect(screen.queryByText(/Fiecare factură, comparată/)).toBeNull();
    // texts in screen order
    const order = screen.getAllByText(/.+/).map((n) => [n.props.children].flat().join(''));
    const at = (s: string) => order.findIndex((x) => x.includes(s));
    expect(at('Adaugă furnizor')).toBeGreaterThan(-1);
    expect(at('Adaugă furnizor')).toBeLessThan(at(COPY.millennial.swipeHint));
    expect(at('Digi')).toBeLessThan(at(COPY.millennial.swipeHint)); // under the list, not above it
  });

  it('archiving moves the card to "Arhivă" at once and offers "Anulează"; undo brings it back', async () => {
    (api.setProviderArchived as jest.Mock)
      .mockResolvedValueOnce(card('digi', 'Digi', { archived: true, archived_at: '2026-11-17T09:20:11+00:00' }))
      .mockResolvedValueOnce(card('digi', 'Digi', { archived: false, archived_at: null }));
    await render(<ProvidersScreen />);
    await fireEvent(await screen.findByTestId('provider-digi'), 'accessibilityAction', { nativeEvent: { actionName: 'archive' } });
    await act(async () => {});
    expect(api.setProviderArchived).toHaveBeenCalledWith('digi', true);
    expect(screen.queryByTestId('provider-digi')).toBeNull();
    expect(screen.getByText('Arhivă · 1')).toBeTruthy();
    expect(screen.getByText('Digi a fost mutat în arhivă. Facturile rămân disponibile.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Anulează'));
    await act(async () => {});
    expect(api.setProviderArchived).toHaveBeenLastCalledWith('digi', false);
    expect(screen.getByTestId('provider-digi')).toBeTruthy();
    expect(screen.queryByText(/^Arhivă/)).toBeNull();
  });

  it('the uncovered "Arhivează" button archives too', async () => {
    (api.setProviderArchived as jest.Mock).mockResolvedValue(card('digi', 'Digi', { archived: true, archived_at: '2026-11-17T09:20:11+00:00' }));
    await render(<ProvidersScreen />);
    await fireEvent.press(await screen.findByTestId('swipe-digi-action'));
    await waitFor(() => expect(api.setProviderArchived).toHaveBeenCalledWith('digi', true));
  });

  it('a server error puts the card back and says why', async () => {
    (api.setProviderArchived as jest.Mock).mockRejectedValue(new Error('Nu există furnizorul „digi”.'));
    await render(<ProvidersScreen />);
    await fireEvent(await screen.findByTestId('provider-digi'), 'accessibilityAction', { nativeEvent: { actionName: 'archive' } });
    await act(async () => {});
    expect(screen.getByTestId('provider-digi')).toBeTruthy();
    expect(screen.getByText('Nu există furnizorul „digi”.')).toBeTruthy();
    expect(screen.queryByText('Anulează')).toBeNull();
  });

  it('in the archive, the same gesture brings a provider back', async () => {
    (api.providers as jest.Mock).mockResolvedValue([card('ppc', 'PPC'), card('digi', 'Digi', { archived: true, archived_at: '2026-11-17T09:20:11+00:00' })]);
    (api.setProviderArchived as jest.Mock).mockResolvedValue(card('digi', 'Digi', { archived: false, archived_at: null }));
    await render(<ProvidersScreen />);
    await fireEvent.press(await screen.findByLabelText('Arhivă, 1 furnizor'));
    await fireEvent(screen.getByTestId('archived-digi'), 'accessibilityAction', { nativeEvent: { actionName: 'unarchive' } });
    await act(async () => {});
    expect(api.setProviderArchived).toHaveBeenCalledWith('digi', false);
    expect(screen.getByTestId('provider-digi')).toBeTruthy();
  });
});

describe('names', () => {
  const root = path.join(__dirname, '..');

  it('the app is called "AI Pago" (the Expo slug stays, so Expo Go keeps the project)', () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
    expect(app.name).toBe('AI Pago');
    expect(app.slug).toBe('pago-bill-audit');
    expect(JSON.stringify(app.plugins)).toMatch(/AI Pago folosește microfonul/);
  });

  it('modes: Innovative (young), Profesional (middle age), Classic (seniors)', () => {
    expect(COPY.genz.modeName).toBe('Innovative');
    expect(COPY.millennial.modeName).toBe('Profesional');
    expect(COPY.senior.modeName).toBe('Classic');
    // the line under each name describes the style, not the age group
    for (const c of Object.values(COPY)) expect(c.modeDesc).not.toMatch(/^Pentru |tineri|vârsta de mijloc|seniori/i);
  });

  it('every mode has the swipe texts', () => {
    for (const c of Object.values(COPY)) {
      expect(c.swipeHint).toMatch(/stânga/);
      expect(c.archiveShort && c.unarchiveShort && c.undo).toBeTruthy();
    }
  });

  it('no tab swipe on Furnizori, where swiping a provider archives it', () => {
    const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
    expect(app).toMatch(/name="Providers" component=\{ProvidersScreen\} options=\{\{ swipeEnabled: false \}\}/);
  });
});
