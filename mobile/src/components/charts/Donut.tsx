import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../../theme';

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
}

/** Ring chart; `children` is drawn in the hole (total, month...). Tapping is handled by the legend below it. */
export function Donut({
  slices,
  size = 220,
  stroke = 26,
  selected,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  selected?: string | null;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * circ;
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
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
