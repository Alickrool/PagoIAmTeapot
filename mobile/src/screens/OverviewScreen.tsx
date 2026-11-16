import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { api, MOCK } from '../api/client';
import type { DashboardMonth, DashboardResponse, DashboardSlice } from '../api/types';
import { useBudget } from '../budget';
import { BudgetModal } from '../components/BudgetModal';
import { Button } from '../components/Button';
import { Donut } from '../components/charts/Donut';
import { MonthBars, monthBar } from '../components/charts/MonthBars';
import { MonthPager } from '../components/MonthPager';
import { SeverityBadge } from '../components/SeverityBadge';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import { useStackNavigation } from '../navigation';
import { category, deltaColor, deltaLabel, money, monthLabel, monthName, tabular } from '../theme';

const EXTRA = ['#10B981', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

/** Category colour per slice; a second provider of the same category gets an extra colour. */
function sliceColors(slices: DashboardSlice[]) {
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
const suggestBudget = (avg: string | null, total: number) => Math.ceil(((avg ? Number(avg) : total) * 1.1) / 50) * 50;

/** Every month we've seen, oldest first. The API returns a 12-month window ending at the selected month,
 *  so picking an older month must not drop the newer ones (the "disappearing months" bug). */
const mergeMonths = (a: DashboardMonth[], b: DashboardMonth[]) =>
  Object.values(Object.fromEntries([...a, ...b].map((m) => [m.month, m]))).sort((x, y) => x.month.localeCompare(y.month));

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function OverviewScreen() {
  const navigation = useStackNavigation();
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [history, setHistory] = useState<DashboardMonth[]>([]);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const current = history.length ? history[history.length - 1].month : data?.month; // latest month = "this month"
  const { budget, setBudget } = useBudget(current);

  const load = useCallback((m?: string) => {
    setLoading(true);
    setError(null);
    api
      .dashboard(m)
      .then((d) => {
        setData(d);
        setHistory((h) => mergeMonths(h, d.months));
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(month), [load, month]));

  if (!data) {
    return (
      <View style={styles.centerFill}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button title="Încearcă din nou" onPress={() => load(month)} />
          </>
        ) : (
          <ActivityIndicator color={t.accent} />
        )}
      </View>
    );
  }

  const months = history.map((m) => m.month);
  const i = months.indexOf(data.month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const total = Number(data.total);
  const diff = data.previous_total != null ? total - Number(data.previous_total) : null;
  const flagged = data.slices.find((s) => s.audit_status === 'critical') ?? null;
  const unpaid = data.slices.filter((s) => s.status !== 'paid');
  const colorOf = sliceColors(data.slices);
  const isCurrent = data.month === current;
  const suggested = suggestBudget(data.average_total, total);
  const budgetFor = (m: string) => (m === current && budget ? budget : suggested);
  const totalOf = (m: string) => Number(history.find((h) => h.month === m)?.total ?? 0);
  const open = (id: number) => navigation.navigate('Bill', { id });

  const switcher = (
    <View style={styles.switcher}>
      <Pressable onPress={() => prev && setMonth(prev)} disabled={!prev} hitSlop={12} accessibilityLabel="Luna anterioară" style={styles.arrowBtn}>
        <Text style={[styles.arrow, !prev && styles.arrowOff]}>‹</Text>
      </Pressable>
      <Text style={styles.monthTitle}>{monthLabel(data.month)}</Text>
      <Pressable onPress={() => next && setMonth(next)} disabled={!next} hitSlop={12} accessibilityLabel="Luna următoare" style={styles.arrowBtn}>
        <Text style={[styles.arrow, !next && styles.arrowOff]}>›</Text>
      </Pressable>
    </View>
  );

  const budgetRow = isCurrent && (
    <Pressable onPress={() => setBudgetOpen(true)} style={({ pressed }) => [styles.budgetRow, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      {budget ? (
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[styles.small, tabular]}>
              Buget: {money(total)} din {money(budget)}
            </Text>
            <Text style={styles.link}>Modifică</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(total / budget, 1) * 100}%`, backgroundColor: total > budget ? t.sev.critical.color : t.accent }]} />
          </View>
        </View>
      ) : (
        <Text style={styles.link}>＋ Creează bugetul pentru {monthName(data.month)}</Text>
      )}
    </Pressable>
  );

  const alert = flagged && (
    <View style={styles.alert}>
      <Text style={styles.alertTitle}>{copy.alertTitle(flagged.provider, flagged.total)}</Text>
      <Button title={copy.alertCta} onPress={() => open(flagged.bill_id)} />
    </View>
  );

  const breakdown = (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{copy.whereMoney}</Text>
      <View style={styles.list}>
        {data.slices.map((s) => (
          <Pressable key={s.bill_id} onPress={() => open(s.bill_id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="button">
            <View style={[styles.colorDot, { backgroundColor: colorOf[s.slug] }]} />
            <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>
              {s.provider}
            </Text>
            {s.audit_status !== 'ok' && <SeverityBadge severity={s.audit_status} />}
            <Text style={[styles.rowTotal, tabular]}>{money(s.total)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const historyCard = (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{copy.history}</Text>
      <View style={styles.card}>
        {t.mode !== 'senior' && <MonthBars bars={history.slice(-12).map(monthBar)} selected={data.month} onSelect={setMonth} height={90} />}
        <ScrollView style={styles.historyBox} nestedScrollEnabled showsVerticalScrollIndicator>
          {[...history].reverse().map((m, idx, arr) => {
            const before = arr[idx + 1];
            const d = before && Number(before.total) ? ((Number(m.total) - Number(before.total)) / Number(before.total)) * 100 : null;
            const sel = m.month === data.month;
            return (
              <Pressable
                key={m.month}
                onPress={() => setMonth(m.month)}
                style={({ pressed }) => [styles.histRow, sel && styles.histRowSel, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <Text style={[styles.rowTitle, { flex: 1 }, sel && { color: t.accent }]}>{monthLabel(m.month)}</Text>
                {d != null && t.mode !== 'senior' && <Text style={[styles.delta, tabular, { color: deltaColor(d, t) }]}>{deltaLabel(Math.round(d * 10) / 10)}</Text>}
                <Text style={[styles.rowTotal, tabular, sel && { color: t.accent }]}>{money(m.total)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <>
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(month)} tintColor={t.accent} />}>
        {MOCK && <Text style={styles.mock}>MOD DEMO: date din shared/fixtures</Text>}

        {t.mode === 'genz' && (
          <>
            <View style={styles.greetRow}>
              <Text style={styles.greet}>{copy.greeting}</Text>
              {i > 1 && <Text style={styles.streak}>{copy.streak(i)}</Text>}
            </View>
            <View style={styles.card}>
              {switcher}
              <MonthPager
                months={months}
                selected={data.month}
                onSelect={setMonth}
                height={248}
                renderPage={(m, sel) =>
                  sel ? (
                    <Donut key={`sel-${m}`} size={232} stroke={24} slices={data.slices.map((s) => ({ key: s.slug, value: Number(s.total), color: colorOf[s.slug] }))}>
                      <Text style={[styles.centerTotal, tabular]}>{total.toFixed(2).replace('.', ',')}</Text>
                      <Text style={styles.small}>lei în {monthName(m)}</Text>
                    </Donut>
                  ) : (
                    <Donut key={m} size={232} stroke={24} animate={false} slices={[{ key: m, value: 1, color: t.surface2 }]}>
                      <Text style={[styles.centerTotal, tabular, { color: t.muted }]}>{totalOf(m).toFixed(2).replace('.', ',')}</Text>
                      <Text style={styles.small}>lei în {monthName(m)}</Text>
                    </Donut>
                  )
                }
              />
              {diff != null && data.previous_month && (
                <Text style={[styles.vsPrev, tabular, { color: deltaColor(data.delta_pct, t) }]}>{copy.vsPrev(diff, monthName(data.previous_month))}</Text>
              )}
              {budgetRow}
            </View>
            {alert}
            {breakdown}
            {historyCard}
          </>
        )}

        {t.mode === 'millennial' && (
          <>
            <View style={styles.card}>
              {switcher}
              <Text style={styles.headline}>
                {total > budgetFor(data.month)
                  ? `${capital(monthName(data.month))} a fost generos: ${money(total - budgetFor(data.month))} peste buget`
                  : `În buget: îți mai rămân ${money(budgetFor(data.month) - total)}`}
              </Text>
              <MonthPager
                months={months}
                selected={data.month}
                onSelect={setMonth}
                height={206}
                renderPage={(m, sel) => (
                  <BudgetRing key={sel ? `sel-${m}` : m} total={totalOf(m)} budget={budgetFor(m)} estimated={!(m === current && budget)} animate={sel} />
                )}
              />
              {diff != null && data.previous_month && <Text style={[styles.small, tabular, { textAlign: 'center' }]}>{copy.vsPrev(diff, monthName(data.previous_month))}</Text>}
              {budgetRow}
            </View>
            {alert}
            {breakdown}
            {historyCard}
          </>
        )}

        {t.mode === 'senior' && (
          <>
            <Text style={styles.greet}>{copy.greeting}</Text>
            <View style={{ gap: 4 }}>
              <Text style={styles.seniorSub}>
                {unpaid.length > 0 ? `Vă așteaptă ${unpaid.length} ${unpaid.length > 1 ? 'facturi' : 'factură'} de plată` : 'Toate facturile sunt plătite'}
              </Text>
              <Text style={[styles.seniorTotal, tabular]}>{money(data.unpaid_total)}</Text>
              {budgetRow}
            </View>
            {alert}
            {breakdown}
            <Button
              title="Trimiteți facturile unui membru al familiei"
              variant="secondary"
              onPress={() =>
                Share.share({
                  message: `Facturile mele din ${monthLabel(data.month)}: ${data.slices.map((s) => `${s.provider} ${money(s.total)}`).join(', ')}. Total ${money(data.total)}.${flagged ? ` ${flagged.provider} pare greșită.` : ''}`,
                })
              }
            />
            {historyCard}
          </>
        )}
      </ScrollView>

      {budgetOpen && current && (
        <BudgetModal
          month={current}
          current={budget}
          suggested={suggested}
          onClose={() => setBudgetOpen(false)}
          onSave={(v) => {
            setBudget(v);
            setBudgetOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Millennial wheel: month total against the budget; overflow drawn in orange. Sweeps in when selected. */
function BudgetRing({ total, budget, estimated, animate }: { total: number; budget: number; estimated: boolean; animate: boolean }) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const used = Math.min(total / budget, 1);
  const over = total > budget ? Math.min((total - budget) / budget, 1) : 0;
  return (
    <Donut
      size={196}
      stroke={18}
      animate={animate}
      slices={[
        { key: 'used', value: Math.max(used - over, 0), color: t.accent },
        ...(over > 0 ? [{ key: 'over', value: over, color: '#C2410C' }] : []),
        ...(used < 1 ? [{ key: 'left', value: 1 - used, color: t.surface2 }] : []),
      ]}
    >
      <Text style={[styles.centerTotal, tabular]}>{total.toFixed(2).replace('.', ',')}</Text>
      <Text style={[styles.small, tabular]}>
        din {budget} lei{estimated ? ' (estimat)' : ''}
      </Text>
    </Donut>
  );
}

const makeStyles = (t: Theme) => ({
  page: { padding: 16, gap: 20, paddingBottom: 32 },
  centerFill: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12, padding: 24, backgroundColor: t.bg },
  mock: { textAlign: 'center' as const, backgroundColor: t.sev.warning.bg, color: t.sev.warning.color, padding: 4, fontSize: 12, borderRadius: 8, overflow: 'hidden' as const },
  card: { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, alignItems: 'center' as const, gap: 12 },
  switcher: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, alignSelf: 'stretch' as const },
  arrowBtn: { minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  arrow: { fontSize: t.fs(30), color: t.accent, lineHeight: t.fs(34) },
  arrowOff: { color: t.border },
  monthTitle: { fontSize: t.fs(17), fontWeight: '700' as const, color: t.text },
  greetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  greet: { fontSize: t.fs(26), fontWeight: '800' as const, color: t.text },
  streak: { fontSize: t.fs(14), fontWeight: '700' as const, color: t.accent },
  headline: { fontSize: t.fs(18), fontWeight: '800' as const, color: t.text, alignSelf: 'stretch' as const, lineHeight: t.fs(24), textAlign: 'center' as const },
  centerTotal: { fontSize: t.fs(30), fontWeight: '800' as const, color: t.text },
  vsPrev: { fontSize: t.fs(14), fontWeight: '700' as const, textAlign: 'center' as const },
  budgetRow: { alignSelf: 'stretch' as const, minHeight: 44, justifyContent: 'center' as const, paddingTop: 8, borderTopWidth: 1, borderColor: t.border },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: 'hidden' as const },
  barFill: { height: 6, borderRadius: 3 },
  link: { color: t.accent, fontWeight: '700' as const, fontSize: t.fs(14), textAlign: 'center' as const },
  alert: { backgroundColor: t.sev.critical.bg, borderRadius: t.radius, padding: t.pad, gap: 12 },
  alertTitle: { color: t.sev.critical.color, fontSize: t.fs(18), fontWeight: '800' as const, lineHeight: t.fs(24) },
  seniorSub: { fontSize: t.fs(17), color: t.muted },
  seniorTotal: { fontSize: t.fs(40), fontWeight: '800' as const, color: t.text, marginLeft: -1 },
  section: { fontWeight: '800' as const, fontSize: t.fs(15), color: t.text },
  list: { backgroundColor: t.surface, borderRadius: t.radius, overflow: 'hidden' as const, paddingVertical: 4 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: t.mode === 'senior' ? 14 : 10, paddingHorizontal: t.pad, minHeight: t.touch },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  historyBox: { alignSelf: 'stretch' as const, maxHeight: t.mode === 'senior' ? 300 : 220, borderRadius: t.inner, backgroundColor: t.bg },
  histRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, minHeight: t.touch - 4, borderLeftWidth: 4, borderColor: 'transparent' },
  histRowSel: { borderColor: t.accent, backgroundColor: t.surface2 },
  rowTitle: { fontWeight: '700' as const, color: t.text, fontSize: t.fs(15) },
  rowTotal: { fontWeight: '800' as const, color: t.text, fontSize: t.fs(15) },
  muted: { color: t.muted, fontSize: t.fs(14), textAlign: 'center' as const },
  small: { color: t.muted, fontSize: t.fs(13) },
  delta: { fontSize: t.fs(12), fontWeight: '700' as const },
});
