import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Minimal line icons (24×24, round caps) used instead of emoji. Stroke follows `color`. */
export type IconName = 'home' | 'scan' | 'providers' | 'camera' | 'image' | 'file' | 'receipt' | 'check' | 'close' | 'plus' | 'document' | 'search' | 'mic' | 'stop';

const SHAPES: Record<IconName, (c: string) => React.ReactNode> = {
  home: () => <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  scan: () => <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />,
  providers: () => <Path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M3 21h18" />,
  camera: () => (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <Circle cx={12} cy={13} r={3.5} />
    </>
  ),
  image: () => (
    <>
      <Rect x={3} y={4} width={18} height={16} rx={2} />
      <Circle cx={9} cy={10} r={1.5} />
      <Path d="M21 16l-5-5-9 9" />
    </>
  ),
  file: () => <Path d="M7 3h7l5 5v13H7zM14 3v5h5" />,
  document: () => <Path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />,
  receipt: () => <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  check: () => <Path d="M5 12l5 5 9-10" />,
  close: () => <Path d="M6 6l12 12M18 6L6 18" />,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  search: () => (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="M16 16l4.5 4.5" />
    </>
  ),
  mic: () => (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  stop: () => <Rect x={7} y={7} width={10} height={10} rx={2} />,
};

export function Icon({ name, size = 24, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      {SHAPES[name](color)}
    </Svg>
  );
}
