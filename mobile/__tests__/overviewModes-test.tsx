// Home screen per mode: Classic (seniors) starts with what is due, no greeting; the budget bar is thick enough to see.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import billsFixture from '../../shared/fixtures/bills.json';
import detailsFixture from '../../shared/fixtures/bill_details.json';
import { api } from '../src/api/client';
import { dashboard, toPoints } from '../src/api/derive';
import type { BillDetail, BillSummary } from '../src/api/types';
import { ModeProvider } from '../src/mode';
import OverviewScreen from '../src/screens/OverviewScreen';

jest.mock('../src/api/client', () => ({
  MOCK: false,
  api: { dashboard: jest.fn(), billStatuses: jest.fn(() => Promise.resolve(new Map())) },
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
    useRoute: () => ({ key: 'Overview', name: 'Overview', params: undefined }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});

const points = toPoints(Object.values(detailsFixture as unknown as Record<string, BillDetail>), billsFixture as unknown as BillSummary[]);

const open = async (mode: 'genz' | 'millennial' | 'senior', budget?: number) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('pago.mode', mode);
  if (budget) await AsyncStorage.setItem('pago.budget.2026-10', String(budget));
  (api.dashboard as jest.Mock).mockImplementation((m?: string) => Promise.resolve(dashboard(points, m)));
  await render(
    <ModeProvider>
      <OverviewScreen />
    </ModeProvider>,
  );
};

const barHeight = () => StyleSheet.flatten(screen.getByTestId('budget-bar').props.style).height;

it('Classic: no "Sărut-mâna", the screen opens with what is due', async () => {
  await open('senior');
  expect(await screen.findByText(/Vă așteaptă 4 facturi de plată/)).toBeTruthy();
  expect(screen.queryByText(/Sărut-mâna/)).toBeNull();
  expect(screen.queryByText('Bună ziua!')).toBeNull();
});

it('Profesional: the budget bar is 12 px thick (was 6)', async () => {
  await open('millennial', 900);
  await screen.findByText(/Buget: /);
  expect(barHeight()).toBe(12);
  expect(screen.getByText('Sinteza lunii')).toBeTruthy();
});

it('Classic: an even thicker bar (16 px)', async () => {
  await open('senior', 900);
  await screen.findByText(/Buget: /);
  expect(barHeight()).toBe(16);
});
