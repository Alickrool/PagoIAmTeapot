// Generation modes (design: "Pago pe generații" mockup). One app, three looks + tones:
// genz = dark, lime accent, slang · millennial = light, Pago violet, classy · senior = large text, navy, warm.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuditStatus, Severity } from './api/types';

export type Mode = 'genz' | 'millennial' | 'senior';

export interface Theme {
  mode: Mode;
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  highlight: string; // flagged bill lines
  sev: Record<Severity, { color: string; bg: string }>;
  radius: number; // cards
  inner: number; // elements inside cards = radius − padding
  pad: number; // card padding
  fs: (size: number) => number; // font scale
  touch: number; // min button height
}

const scale = (k: number) => (n: number) => Math.round(n * k);

export const THEMES: Record<Mode, Theme> = {
  genz: {
    mode: 'genz',
    dark: true,
    bg: '#0E0E12',
    surface: '#18181F',
    surface2: '#23232C',
    text: '#F4F4F5',
    muted: '#B4B4BD',
    border: '#2A2A33',
    accent: '#C6FF3D',
    onAccent: '#0E0E12',
    highlight: 'rgba(198,255,61,0.14)',
    sev: {
      ok: { color: '#86EFAC', bg: '#14301F' },
      info: { color: '#93C5FD', bg: '#16243B' },
      warning: { color: '#FDE68A', bg: '#3A3115' },
      critical: { color: '#FF9DBB', bg: '#3A1625' },
    },
    radius: 28,
    inner: 12,
    pad: 16,
    fs: scale(1),
    touch: 48,
  },
  millennial: {
    mode: 'millennial',
    dark: false,
    bg: '#F5F6FA',
    surface: '#FFFFFF',
    surface2: '#F0F1F5',
    text: '#16181D',
    muted: '#4B5160',
    border: '#E5E7EB',
    accent: '#5B3DF5',
    onAccent: '#FFFFFF',
    highlight: '#FFF4CC',
    sev: {
      ok: { color: '#15803D', bg: '#DCFCE7' },
      info: { color: '#1D4ED8', bg: '#DBEAFE' },
      warning: { color: '#B45309', bg: '#FEF3C7' },
      critical: { color: '#B91C1C', bg: '#FEE2E2' },
    },
    radius: 24,
    inner: 8,
    pad: 16,
    fs: scale(1),
    touch: 48,
  },
  senior: {
    mode: 'senior',
    dark: false,
    bg: '#FFFFFF',
    surface: '#F3F4F6',
    surface2: '#E5E7EB',
    text: '#111827',
    muted: '#374151',
    border: '#D1D5DB',
    accent: '#1E3A8A',
    onAccent: '#FFFFFF',
    highlight: '#FEF3C7',
    sev: {
      ok: { color: '#14532D', bg: '#DCFCE7' },
      info: { color: '#1E3A8A', bg: '#DBEAFE' },
      warning: { color: '#78350F', bg: '#FEF3C7' },
      critical: { color: '#991B1B', bg: '#FEE2E2' },
    },
    radius: 24,
    inner: 8,
    pad: 16,
    fs: scale(1.3),
    touch: 64,
  },
};

const lei = (v: number | string) => `${Number(v).toFixed(2).replace('.', ',')} lei`;

/** Copy per mode. Same facts, different voice. */
export const COPY = {
  genz: {
    modeName: 'Gen Z',
    modeDesc: 'Dark mode, direct, cu slang',
    tabOverview: 'Acasă',
    tabScan: 'Scanează',
    tabProviders: 'Furnizori',
    overviewTitle: 'Facturile tale',
    greeting: 'Yo!',
    streak: (n: number) => `${n} luni streak`,
    vsPrev: (diff: number, month: string) =>
      diff > 0 ? `+${lei(diff)} față de ${month}. Nu e vibe-ul.` : `${lei(diff)} față de ${month}. Slay.`,
    alertTitle: (provider: string, total: string) => `Red flag: ${provider} vrea ${lei(total)}`,
    alertCta: 'Vezi ce e',
    whereMoney: 'Pe ce s-au dus banii',
    compare: 'Compară',
    history: 'Istoric · tap pe o lună',
    sev: { ok: 'OK', info: 'Info', warning: 'Hmm', critical: 'Red flag' } as Record<Severity, string>,
    pay: (total: string) => `Plătește ${lei(total)}`,
    payConfirmTitle: 'Stai, ești sigur?',
    payConfirmBody: 'Factura asta are un red flag. Dacă plătești acum, greu mai recuperezi banii.',
    payAnyway: 'Plătesc oricum',
    cancel: 'Las-o',
    paid: 'Plătită, legend.',
    askPlaceholder: 'Întreabă orice despre factură…',
    ask: 'Întreabă',
    lines: 'Factura, rând cu rând · tap pe orice rând',
    readingTitle: 'Dă-le indexul real',
    readingHint: (old: number | null, unit: string) =>
      old != null ? `Ultimul index: ${old}. Scrie ce arată contorul acum (${unit}).` : 'Scrie ce arată contorul acum.',
    readingSend: 'Trimite',
    readingDone: (diff: number) => (diff < 0 ? `Gata. Ai scăpat de ${lei(-diff)}. Easy.` : `Gata. Diferență: ${lei(diff)}.`),
    providersIntro: 'Fiecare factură, comparată cu cele de dinainte. Nimic nu scapă.',
    scanEmptyTitle: 'Pozează factura',
    scanEmptyBody: 'Poze, galerie sau PDF. Le poți amesteca, le trimitem ca o singură factură.',
    scanSteps: ['Urcăm pozele', 'Citim factura', 'Facem stalking pe ultimele 12 luni', 'Vânăm red flags'],
    analyze: (n: number) => `Analizează · ${n} ${n > 1 ? 'pagini' : 'pagină'}`,
    addPage: 'Adaugă măcar o pagină',
    autopayOk: 'Ar plăti singur. Chill.',
    autopayBlocked: 'Blocată. Te-am salvat.',
    searchPlaceholder: 'Caută o factură…',
    searchHint: 'Zi „PPC octombrie” sau „ce n-am plătit”',
    listening: 'Te ascult… zi ce factură cauți',
    thinking: 'Stai o sec…',
    heard: (s: string) => `Am auzit: „${s}”`,
  },
  millennial: {
    modeName: 'Millennials',
    modeDesc: 'Buget, automatizare, economii',
    tabOverview: 'Buget',
    tabScan: 'Scanează',
    tabProviders: 'Furnizori',
    overviewTitle: 'Bugetul lunii',
    greeting: 'Bună',
    streak: (n: number) => `${n} luni plătite la timp`,
    vsPrev: (diff: number, month: string) =>
      diff > 0 ? `Cu ${lei(diff)} mai mult decât în ${month}` : `Cu ${lei(-diff)} mai puțin decât în ${month}`,
    alertTitle: (provider: string, total: string) => `${provider} merită o a doua privire: ${lei(total)}`,
    alertCta: 'Revizuiește factura',
    whereMoney: 'Unde se duc banii',
    compare: 'Comparație',
    history: 'Istoric · alege o lună',
    sev: { ok: 'În regulă', info: 'Info', warning: 'Atenție', critical: 'Anomalie' } as Record<Severity, string>,
    pay: (total: string) => `Plătește ${lei(total)}`,
    payConfirmTitle: 'Plătești o factură cu anomalie?',
    payConfirmBody: 'Am găsit o problemă gravă pe această factură. Îți recomandăm să o revizuiești înainte.',
    payAnyway: 'Plătește oricum',
    cancel: 'Revin mai târziu',
    paid: 'Achitată.',
    askPlaceholder: 'Întreabă despre această factură…',
    ask: 'Întreabă',
    lines: 'Factura, rând cu rând · atinge orice rând',
    readingTitle: 'Trimite indexul real',
    readingHint: (old: number | null, unit: string) =>
      old != null ? `Indexul anterior: ${old}. Introdu valoarea de pe contor (${unit}).` : 'Introdu valoarea de pe contor.',
    readingSend: 'Recalculează factura',
    readingDone: (diff: number) => (diff < 0 ? `Factura a fost recalculată: ${lei(diff)}` : `Factura a fost recalculată: +${lei(diff)}`),
    providersIntro: 'Fiecare factură, comparată cu cele anterioare.',
    scanEmptyTitle: 'Adaugă paginile unei facturi',
    scanEmptyBody: 'Fotografii, imagini din galerie sau PDF, în ordinea paginilor. Le analizăm împreună.',
    scanSteps: ['Încărcăm paginile', 'Citim factura', 'Comparăm cu istoricul tău', 'Verificăm anomaliile'],
    analyze: (n: number) => `Analizează factura · ${n} ${n > 1 ? 'pagini' : 'pagină'}`,
    addPage: 'Adaugă cel puțin o pagină',
    autopayOk: 'Autopilotul ar achita această factură.',
    autopayBlocked: 'Autopilotul ar pune plata în așteptare.',
    searchPlaceholder: 'Caută o factură…',
    searchHint: 'De exemplu „PPC octombrie” sau „neplătite”',
    listening: 'Te ascult… spune ce factură cauți',
    thinking: 'Mă gândesc…',
    heard: (s: string) => `Am auzit: „${s}”`,
  },
  senior: {
    modeName: 'Senior',
    modeDesc: 'Text mare, simplu și clar',
    tabOverview: 'Facturi',
    tabScan: 'Fotografiați',
    tabProviders: 'Istoric',
    overviewTitle: 'Acasă',
    greeting: 'Sărut-mâna!',
    streak: (n: number) => `Ați plătit la timp ${n} luni la rând`,
    vsPrev: (diff: number, month: string) =>
      diff > 0 ? `Cu ${lei(diff)} mai mult decât în ${month}` : `Cu ${lei(-diff)} mai puțin decât în ${month}`,
    alertTitle: (provider: string, total: string) => `${provider}: vi se cer ${lei(total)}. Pare greșit.`,
    alertCta: 'Să vedem împreună',
    whereMoney: 'Facturile lunii',
    compare: 'Comparație',
    history: 'Lunile trecute',
    sev: { ok: 'Totul e bine', info: 'De știut', warning: 'Atenție', critical: 'Problemă' } as Record<Severity, string>,
    pay: (total: string) => `Plătiți ${lei(total)}`,
    payConfirmTitle: 'Vă rugăm, nu plătiți încă',
    payConfirmBody: 'Această factură pare greșită. Dacă o plătiți acum, banii se recuperează greu.',
    payAnyway: 'Plătesc totuși',
    cancel: 'Nu plătesc acum',
    paid: 'Factura este plătită.',
    askPlaceholder: 'Scrieți întrebarea dumneavoastră…',
    ask: 'Întrebați',
    lines: 'Ce scrie pe factură · atingeți un rând',
    readingTitle: 'Vă rugăm, scrieți cifra de pe contor',
    readingHint: (old: number | null) => (old != null ? `Data trecută contorul arăta ${old}.` : 'Scrieți numărul de pe contor.'),
    readingSend: 'Trimiteți cifra',
    readingDone: (diff: number) => (diff < 0 ? `Mulțumim! Plătiți cu ${lei(-diff)} mai puțin.` : `Mulțumim! Factura a fost refăcută.`),
    providersIntro: 'Fiecare factură, comparată cu cele de dinainte.',
    scanEmptyTitle: 'Fotografiați factura',
    scanEmptyBody: 'Faceți câte o poză fiecărei pagini. Noi o citim și vă spunem dacă e ceva greșit.',
    scanSteps: ['Trimitem pozele', 'Citim factura', 'O comparăm cu cele vechi', 'Căutăm greșeli'],
    analyze: (n: number) => `Verificați factura (${n} ${n > 1 ? 'pagini' : 'pagină'})`,
    addPage: 'Adăugați o poză',
    autopayOk: 'Factura s-ar plăti singură.',
    autopayBlocked: 'Plata ar fi oprită, ca să vă protejăm.',
    searchPlaceholder: 'Căutați o factură…',
    searchHint: 'Apăsați microfonul și spuneți, de exemplu, „factura PPC din octombrie”',
    listening: 'Vă ascult… spuneți ce factură căutați',
    thinking: 'Mă gândesc…',
    heard: (s: string) => `Am auzit: „${s}”`,
  },
};

export type Copy = (typeof COPY)['genz'];

const KEY = 'pago.mode';

interface ModeState {
  mode: Mode | null; // null = not chosen yet -> show the picker
  ready: boolean;
  setMode: (m: Mode | null) => void;
}

const ModeContext = createContext<ModeState>({ mode: 'millennial', ready: true, setMode: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && v in THEMES && setModeState(v as Mode))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<ModeState>(
    () => ({
      mode,
      ready,
      setMode: (m) => {
        setModeState(m);
        (m ? AsyncStorage.setItem(KEY, m) : AsyncStorage.removeItem(KEY)).catch(() => {});
      },
    }),
    [mode, ready],
  );
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
export const useTheme = () => THEMES[useContext(ModeContext).mode ?? 'millennial'];
export const useCopy = (): Copy => COPY[useContext(ModeContext).mode ?? 'millennial'];

/** Styles that depend on the theme: `const styles = useStyles(makeStyles)`. */
export function useStyles<T>(make: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => make(t), [t, make]);
}

export const worstOf = (list: AuditStatus[]): AuditStatus =>
  list.includes('critical') ? 'critical' : list.includes('warning') ? 'warning' : 'ok';
