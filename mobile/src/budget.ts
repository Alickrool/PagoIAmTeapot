// Monthly utilities budget, set by the user for the current month. Stored on the phone (per month).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const key = (month: string) => `pago.budget.${month}`;

export function useBudget(month: string | undefined) {
  const [budget, setState] = useState<number | null>(null);

  useEffect(() => {
    if (!month) return;
    let alive = true;
    AsyncStorage.getItem(key(month))
      .then((v) => alive && setState(v ? Number(v) : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [month]);

  const setBudget = useCallback(
    (value: number | null) => {
      if (!month) return;
      setState(value);
      (value == null ? AsyncStorage.removeItem(key(month)) : AsyncStorage.setItem(key(month), String(value))).catch(() => {});
    },
    [month],
  );

  return { budget, setBudget };
}
