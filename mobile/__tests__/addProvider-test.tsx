// AddProviderScreen: search, add from the list, the "Adaugă factură" step, typing a provider by hand.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { manualProviders } from '../src/providersRo';
import AddProviderScreen from '../src/screens/AddProviderScreen';

const nav = () => ({ navigate: jest.fn(), goBack: jest.fn() });

beforeEach(async () => {
  await AsyncStorage.clear();
  // backend already has bills for Digi only
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ slug: 'digi', provider: 'Digi' }]), text: () => Promise.resolve('') }),
  ) as unknown as typeof fetch;
});

const open = async (navigation = nav()) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await render(<AddProviderScreen navigation={navigation as any} route={{ key: 'AddProvider', name: 'AddProvider' } as any} />);
  await screen.findByText('Digi'); // FlatList draws the first 10 rows (alphabetical) at once
  return navigation;
};

it('lists Romanian providers and marks the ones already added', async () => {
  await open();
  expect(screen.getByText('Engie')).toBeTruthy();
  expect(screen.getAllByText('Adăugat')).toHaveLength(1); // Digi has bills already
});

it('search narrows the list', async () => {
  await open();
  await fireEvent.changeText(screen.getByLabelText('Caută furnizor'), 'hidro');
  expect(screen.getByText('Hidroelectrica')).toBeTruthy();
  expect(screen.queryByText('Engie')).toBeNull();
});

it('adding a provider without bills offers "Adaugă factură", which opens Scan', async () => {
  const navigation = await open();
  await fireEvent.changeText(screen.getByLabelText('Caută furnizor'), 'hidro');
  await fireEvent.press(screen.getByText('Adaugă'));
  expect(await screen.findByText('Ai adăugat Hidroelectrica')).toBeTruthy();
  expect((await manualProviders()).map((p) => p.slug)).toEqual(['hidroelectrica']);
  await fireEvent.press(screen.getByText('Adaugă factură'));
  expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Scan' });
});

it('a provider not in the list can be typed by hand', async () => {
  await open();
  await fireEvent.press(screen.getByText('Nu e în listă? Adaugă manual'));
  await fireEvent.changeText(screen.getByLabelText('Numele furnizorului'), 'Asociația Bl. 5');
  const chips = screen.getAllByText('Altele'); // top filter + the form's category chip
  await fireEvent.press(chips[chips.length - 1]);
  await fireEvent.press(screen.getByText('Adaugă furnizorul'));
  expect(await screen.findByText('Ai adăugat Asociația Bl. 5')).toBeTruthy();
  expect(await manualProviders()).toEqual([{ name: 'Asociația Bl. 5', slug: 'asociatia-bl-5', category: 'other' }]);
});
