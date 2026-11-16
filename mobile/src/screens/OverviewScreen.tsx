import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { api, MOCK } from '../api/client';
import type { DashboardResponse, DashboardSlice } from '../api/types';
import { Button } from '../components/Button';
import { Donut } from '../components/charts/Donut';
import { MonthBars, monthBar } from '../components/charts/MonthBars';
import { ProviderAvatar } from '../components/ProviderAvatar';
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

/** Millennial budget: the 12-month average + 10%, rounded up to 50 lei. */
const budgetFor = (avg: string | null, total: number) => Math.ceil(((avg ? Number(avg) : total) * 1.1) / 50) * 50;

export default function OverviewScreen() {
  const navigation = useStackNavigation();
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const scroll = useRef<ScrollViewInstance>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((m?: string) => {
    setLoading(true);
    setError(null);
    api
      .dashboard(m)
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(month), [load, month]));

  const select = (m: string) => {
    setMonth(m);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

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

  const colorOf = sliceColors(data.slices);
  const months = data.months.map((m) => m.month);
  const i = months.indexOf(data.month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const total = Number(data.total);
  const diff = data.previous_total != null ? total - Number(data.previous_total) : null;
  const flagged = data.slices.find((s) => s.audit_status === 'critical') ?? null;
  const unpaid = data.slices.filter((s) => s.status !== 'paid');
  const streak = Math.max(0, i); // earlier months in the window, all paid in the demo data
  const open = (id: number) => navigation.navigate('Bill', { id });

  const switcher = (
    <View style={styles.switcher}>
      <Pressable onPress={() => prev && select(prev)} disabled={!prev} hitSlop={12} accessibilityLabel="Luna anterioară">
        <Text style={[styles.arrow, !prev && styles.arrowOff]}>‹</Text>
      </Pressable>
      <Text style={styles.monthTitle}>{monthLabel(data.month)}</Text>
      <Pressable onPress={() => next && select(next)} disabled={!next} hitSlop={12} accessibilityLabel="Luna următoare">
        <Text style={[styles.arrow, !next && styles.arrowOff]}>›</Text>
      </Pressable>
    </View>
  );

  const alert = flagged && (
    <View style={styles.alert}>
      <Text style={styles.alertTitle}>{copy.alertTitle(flagged.provider, flagged.total)}</Text>
      <Button title={copy.alertCta} onPress={() => open(flagged.bill_id)} />
    </View>
  );

  const breakdown = (
    <>
      <Text style={styles.section}>{copy.whereMoney}</Text>
      <View style={styles.list}>
        {data.slices.map((s) => (
          <Pressable key={s.bill_id} onPress={() => open(s.bill_id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="button">
            <View style={[styles.colorBar, { backgroundColor: colorOf[s.slug] }]} />
            <ProviderAvatar provider={s.provider} category={s.category} size={t.mode === 'senior' ? 44 : 36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.provider}</Text>
              {t.mode !== 'senior' && (
                <Text style={[styles.small, tabular]} numberOfLines={1}>
                  {s.share_pct.toFixed(0)}% din lună
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.rowTotal, tabular]}>{money(s.total)}</Text>
              {s.audit_status !== 'ok' ? (
                <SeverityBadge severity={s.audit_status} />
              ) : (
                s.delta_pct != null && t.mode !== 'senior' && <Text style={[styles.delta, { color: deltaColor(s.delta_pct, t) }]}>{deltaLabel(s.delta_pct)}</Text>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );

  const history = (
    <>
      <Text style={styles.section}>{copy.history}</Text>
      {t.mode !== 'senior' && (
        <View style={[styles.card, { alignItems: 'stretch' }]}>
          <MonthBars bars={data.months.map(monthBar)} selected={data.month} onSelect={select} />
        </View>
      )}
      <View style={styles.list}>
        {[...data.months].reverse().map((m, idx, arr) => {
          const before = arr[idx + 1];
          const d = before && Number(before.total) ? ((Number(m.total) - Number(before.total)) / Number(before.total)) * 100 : null;
          const sel = m.month === data.month;
          return (
            <Pressable key={m.month} onPress={() => select(m.month)} style={({ pressed }) => [styles.row, sel && styles.rowSel, pressed && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={[styles.rowTitle, { flex: 1 }]}>{monthLabel(m.month)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.rowTotal, tabular]}>{money(m.total)}</Text>
                {d != null && t.mode !== 'senior' && <Text style={[styles.delta, tabular, { color: deltaColor(d, t) }]}>{deltaLabel(Math.round(d * 10) / 10)}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <ScrollView ref={scroll} style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(month)} tintColor={t.accent} />}>
      {MOCK && <Text style={styles.mock}>MOD DEMO: date din shared/fixtures</Text>}

      {t.mode === 'genz' && (
        <>
          <View style={styles.greetRow}>
            <Text style={styles.greet}>{copy.greeting}</Text>
            {streak > 1 && <Text style={styles.streak}>{copy.streak(streak)}</Text>}
          </View>
          <View style={styles.card}>
            {switcher}
            <Donut size={232} stroke={24} slices={data.slices.map((s) => ({ key: s.slug, value: Number(s.total), color: colorOf[s.slug] }))}>
              <Text style={[styles.centerTotal, tabular]}>{total.toFixed(2).replace('.', ',')}</Text>
              <Text style={styles.small}>lei în {monthName(data.month)}</Text>
            </Donut>
            {diff != null && data.previous_month && (
              <Text style={[styles.vsPrev, tabular, { color: deltaColor(data.delta_pct, t) }]}>{copy.vsPrev(diff, monthName(data.previous_month))}</Text>
            )}
          </View>
          {alert}
          {breakdown}
          {history}
        </>
      )}

      {t.mode === 'millennial' && (
        <>
          <BudgetCard data={data} budget={budgetFor(data.average_total, total)} switcher={switcher} />
          {alert}
          {breakdown}
          {history}
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
          {history}
        </>
      )}
    </ScrollView>
  );
}

function BudgetCard({ data, budget, switcher }: { data: DashboardResponse; budget: number; switcher: ReactNode }) {
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const total = Number(data.total);
  const over = total - budget;
  const r = 80;
  const circ = 2 * Math.PI * r;
  const used = Math.min(total / budget, 1);
  const overflow = over > 0 ? Math.min(over / budget, 1) : 0;
  const diff = data.previous_total != null ? total - Number(data.previous_total) : null;

  return (
    <View style={styles.card}>
      {switcher}
      <Text style={styles.headline}>
        {over > 0 ? `${monthName(data.month)[0].toUpperCase()}${monthName(data.month).slice(1)} a fost generos: ${money(over)} peste buget` : `Ești în buget: îți mai rămân ${money(-over)}`}
      </Text>
      <View style={{ width: 200, height: 200 }}>
        <Svg width={200} height={200} viewBox="0 0 200 200" accessibilityLabel={`${money(total)} din ${money(budget)}`}>
          <G transform="rotate(-90 100 100)">
            <Circle cx={100} cy={100} r={r} stroke={t.surface2} strokeWidth={18} fill="none" />
            <Circle cx={100} cy={100} r={r} stroke={t.accent} strokeWidth={18} fill="none" strokeLinecap="round" strokeDasharray={`${used * circ} ${circ}`} />
            {overflow > 0 && (
              <Circle cx={100} cy={100} r={r} stroke="#C2410C" strokeWidth={18} fill="none" strokeLinecap="round" strokeDasharray={`${overflow * circ} ${circ}`} />
            )}
          </G>
        </Svg>
        <View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[styles.centerTotal, tabular]}>{total.toFixed(2).replace('.', ',')}</Text>
          <Text style={[styles.small, tabular]}>din {budget} lei</Text>
        </View>
      </View>
      {diff != null && data.previous_month && <Text style={[styles.small, tabular, { textAlign: 'center' }]}>{copy.vsPrev(diff, monthName(data.previous_month))}</Text>}
    </View>
  );
}

const makeStyles = (t: Theme) => ({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  centerFill: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12, padding: 24, backgroundColor: t.bg },
  mock: { textAlign: 'center' as const, backgroundColor: t.sev.warning.bg, color: t.sev.warning.color, padding: 4, fontSize: 12, borderRadius: 8, overflow: 'hidden' as const },
  card: { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, alignItems: 'center' as const, gap: 12 },
  switcher: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, alignSelf: 'stretch' as const },
  arrow: { fontSize: t.fs(30), color: t.accent, paddingHorizontal: 12, lineHeight: t.fs(34) },
  arrowOff: { color: t.border },
  monthTitle: { fontSize: t.fs(17), fontWeight: '700' as const, color: t.text },
  greetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  greet: { fontSize: t.fs(26), fontWeight: '800' as const, color: t.text },
  streak: { fontSize: t.fs(14), fontWeight: '700' as const, color: t.accent },
  headline: { fontSize: t.fs(19), fontWeight: '800' as const, color: t.text, alignSelf: 'stretch' as const, lineHeight: t.fs(25) },
  centerTotal: { fontSize: t.fs(32), fontWeight: '800' as const, color: t.text },
  vsPrev: { fontSize: t.fs(14), fontWeight: '700' as const, textAlign: 'center' as const },
  alert: { backgroundColor: t.sev.critical.bg, borderRadius: t.radius, padding: t.pad, gap: 12 },
  alertTitle: { color: t.sev.critical.color, fontSize: t.fs(19), fontWeight: '800' as const, lineHeight: t.fs(25) },
  seniorSub: { fontSize: t.fs(17), color: t.muted },
  seniorTotal: { fontSize: t.fs(40), fontWeight: '800' as const, color: t.text, marginLeft: -1 },
  section: { fontWeight: '800' as const, fontSize: t.fs(15), color: t.text, marginTop: 8 },
  list: { backgroundColor: t.surface, borderRadius: t.radius, overflow: 'hidden' as const, paddingVertical: 4 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: t.mode === 'senior' ? 16 : 12, paddingHorizontal: t.pad, minHeight: t.touch },
  rowSel: { backgroundColor: t.surface2 },
  colorBar: { position: 'absolute' as const, left: 0, top: 12, bottom: 12, width: 4, borderRadius: 2 },
  rowTitle: { fontWeight: '700' as const, color: t.text, fontSize: t.fs(15) },
  rowTotal: { fontWeight: '800' as const, color: t.text, fontSize: t.fs(15) },
  muted: { color: t.muted, fontSize: t.fs(14), textAlign: 'center' as const },
  small: { color: t.muted, fontSize: t.fs(13) },
  delta: { fontSize: t.fs(12), fontWeight: '700' as const },
});
