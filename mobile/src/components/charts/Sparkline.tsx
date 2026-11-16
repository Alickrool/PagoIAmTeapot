import Svg, { Circle, Polyline } from 'react-native-svg';

/** Tiny trend line for provider cards; last point is marked. */
export function Sparkline({ values, color, width = 90, height = 32 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (max === min ? 0.5 : 1 - (v - min) / (max - min)) * (height - pad * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(last)} cy={y(values[last])} r={3.5} fill={color} />
    </Svg>
  );
}
