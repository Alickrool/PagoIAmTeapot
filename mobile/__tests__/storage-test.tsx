// Old code without tests: pending providers (AsyncStorage) and the monthly budget hook.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBudget } from '../src/budget';
import { acceptProvider, markPending, pendingProviders } from '../src/providerList';

beforeEach(() => AsyncStorage.clear());

describe('pending providers', () => {
  it('starts empty, marks and accepts', async () => {
    expect((await pendingProviders()).size).toBe(0);
    await markPending('asoc-bartolomeu');
    await markPending('asoc-bartolomeu'); // twice -> still one
    expect([...(await pendingProviders())]).toEqual(['asoc-bartolomeu']);
    await acceptProvider('asoc-bartolomeu');
    expect((await pendingProviders()).size).toBe(0);
  });

  it('corrupt storage is treated as empty (edge case)', async () => {
    await AsyncStorage.setItem('pago.providers.pending', '{not json');
    expect((await pendingProviders()).size).toBe(0);
  });
});

describe('useBudget', () => {
  it('saves per month, reloads it and can remove it', async () => {
    const { result, unmount } = await renderHook(() => useBudget('2026-10'));
    expect(result.current.budget).toBeNull();
    await act(async () => result.current.setBudget(900));
    expect(result.current.budget).toBe(900);
    expect(await AsyncStorage.getItem('pago.budget.2026-10')).toBe('900');
    await unmount();

    const again = await renderHook(() => useBudget('2026-10'));
    await waitFor(() => expect(again.result.current.budget).toBe(900));
    await act(async () => again.result.current.setBudget(null));
    expect(await AsyncStorage.getItem('pago.budget.2026-10')).toBeNull();
  });

  it('another month has its own budget', async () => {
    await AsyncStorage.setItem('pago.budget.2026-09', '700');
    const { result } = await renderHook(() => useBudget('2026-10'));
    await waitFor(() => expect(result.current.budget).toBeNull());
  });

  it('without a month nothing is saved (edge case)', async () => {
    const { result } = await renderHook(() => useBudget(undefined));
    await act(async () => result.current.setBudget(500));
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
