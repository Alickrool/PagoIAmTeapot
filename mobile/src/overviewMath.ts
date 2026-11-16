// Pure helpers behind the Overview screen (unit-tested in __tests__/overviewMath-test.ts).
import type { DashboardMonth, DashboardSlice } from './api/types';
import { category } from './theme';

const EXTRA = ['#10B981', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

/** Category colour per slice; a second provider of the same category gets an extra colour. */
export function sliceColors(slices: DashboardSlice[]) {
  const used = new Set<string>();
  let extra = 0;
  return Object.fromEntries(
    slices.map((s) => {
      let c = (category[s.category] ?? category.other).color;
      if (used.has(c)) c = EXTRA[extra++ % EXTRA.length];
      used.add(c);
      return [s.slug, c];
    }),
  );
}

/** Suggested budget: the average month + 10%, rounded up to 50 lei. */
export const suggestBudget = (avg: string | null, total: number) => Math.ceil(((avg ? Number(avg) : total) * 1.1) / 50) * 50;

/** Every month we've seen, oldest first. The API returns a 12-month window ending at the selected month,
 *  so picking an older month must not drop the newer ones (the "disappearing months" bug). */
export const mergeMonths = (a: DashboardMonth[], b: DashboardMonth[]) =>
  Object.values(Object.fromEntries([...a, ...b].map((m) => [m.month, m]))).sort((x, y) => x.month.localeCompare(y.month));

