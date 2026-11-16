import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../mode';

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
}

const DURATION = 750;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Grows from 0 to 1 once after mount (mount again, e.g. with a new `key`, to replay). */
function useGrow(enabled: boolean) {
  const [p, setP] = useState(enabled ? 0 : 1);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const x = Math.min((Date.now() - start) / DURATION, 1);
      setP(easeOut(x));
      if (x < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
  return p;
}

/** Ring chart; segments sweep in clockwise when it appears. `children` is drawn in the hole. */
export function Donut({
  slices,
  size = 220,
  stroke = 26,
  selected,
  animate = true,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  selected?: string | null;
  animate?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  const p = useGrow(animate);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface2} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * circ * p;
              const dim = selected != null && selected !== s.key;
              const el = (
                <Circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeOpacity={dim ? 0.25 : 1}
                  strokeWidth={selected === s.key ? stroke + 6 : stroke}
                  strokeDasharray={`${Math.max(len - gap, 0.1)} ${circ}`}
                  strokeDashoffset={-offset}
                  fill="none"
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center, { opacity: 0.25 + 0.75 * p }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
