import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../mode';
import { Icon, type IconName } from './Icon';

// Swipe to the LEFT: the finger moves left, the card follows, the button shows on the right.
// Inside, `x` is the distance moved (always >= 0); the card is drawn at -x.

/** Width of the button that the swipe uncovers. */
export const ACTION_W = 104;
/** A long swipe (this far) does the action at once, without tapping the button. */
export const COMMIT_DX = 210;

/** Where the card goes when the finger lifts: back, open on the button, or all the way (do it).
 *  `dx` / `vx` are measured towards the left (finger moving left = positive). */
export function swipeEnd(dx: number, vx: number, wasOpen: boolean): 'close' | 'open' | 'commit' {
  const pos = (wasOpen ? ACTION_W : 0) + dx;
  if (pos >= COMMIT_DX) return 'commit';
  if (pos >= ACTION_W * 0.5 || (vx > 0.4 && pos > 24)) return 'open';
  return 'close';
}

/** Past the button the card follows the finger more slowly, like a rubber band. */
export const rubber = (raw: number) => (raw <= ACTION_W ? Math.max(0, raw) : ACTION_W + (raw - ACTION_W) * 0.6);

const buzz = (kind: 'light' | 'done') => {
  if (Platform.OS === 'web') return;
  try {
    const p = kind === 'light' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    p?.catch?.(() => {});
  } catch {}
};

/** All the swipe state lives here (not in refs), so the component only reads what it renders. */
function createSwipe(setIsOpen: (v: boolean) => void, setFolding: (v: boolean) => void) {
  const x = new Animated.Value(0);
  const fade = new Animated.Value(1);
  const height = new Animated.Value(0);
  let open = false;
  let buzzed = false;
  let busy = false;
  let folding = false;
  let size = { w: 360, h: 0 };
  let onAction = () => {};

  const springTo = (to: number) => {
    open = to > 0;
    setIsOpen(open);
    Animated.spring(x, { toValue: to, speed: 18, bounciness: 7, useNativeDriver: false }).start(); // quick, with a small bounce
  };
  const commit = () => {
    if (busy) return;
    busy = true;
    folding = true;
    buzz('done');
    height.setValue(size.h);
    setFolding(true);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(x, { toValue: size.w + 40, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: false }),
      ]),
      Animated.timing(height, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start(() => onAction());
  };
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || open),
    onPanResponderGrant: () => {
      x.stopAnimation();
      buzzed = open;
    },
    onPanResponderMove: (_, g) => {
      const raw = (open ? ACTION_W : 0) - g.dx;
      x.setValue(rubber(raw));
      if (!buzzed && raw >= ACTION_W) {
        buzzed = true;
        buzz('light');
      }
    },
    onPanResponderRelease: (_, g) => {
      const end = swipeEnd(-g.dx, -g.vx, open);
      if (end === 'commit') commit();
      else springTo(end === 'open' ? ACTION_W : 0);
    },
    onPanResponderTerminate: () => springTo(open ? ACTION_W : 0),
    onPanResponderTerminationRequest: () => false,
  });

  return {
    x,
    fade,
    height,
    pan,
    springTo,
    commit,
    setOnAction: (f: () => void) => {
      onAction = f;
    },
    measure: (w: number, h: number) => {
      if (!folding) size = { w, h };
    },
  };
}

/**
 * Swipe the card to the left to uncover an action button on the right (archive / bring back). The icon grows and tilts
 * as the card moves, a light tap of the phone marks the point where the button is fully shown; on the action the card
 * flies out to the left, fades and the row folds away, then `onAction` runs.
 */
export function SwipeAction({
  children,
  label,
  icon,
  onAction,
  testID,
}: {
  children: ReactNode;
  label: string;
  icon: IconName;
  onAction: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [folding, setFolding] = useState(false);
  const [ctl] = useState(() => createSwipe(setIsOpen, setFolding));
  useEffect(() => ctl.setOnAction(onAction), [ctl, onAction]);
  const { x, fade, height } = ctl;
  const [left] = useState(() => Animated.multiply(x, -1));

  const scale = x.interpolate({ inputRange: [0, ACTION_W, COMMIT_DX], outputRange: [0.4, 1, 1.2], extrapolate: 'clamp' });
  const rotate = x.interpolate({ inputRange: [0, ACTION_W, COMMIT_DX], outputRange: ['30deg', '0deg', '-12deg'], extrapolate: 'clamp' });
  const reveal = x.interpolate({ inputRange: [0, 28], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Animated.View
      style={folding ? { height, overflow: 'hidden' } : null}
      onLayout={(e) => ctl.measure(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      testID={testID}
    >
      {/* the button under the card, uncovered by the swipe */}
      <Animated.View style={[styles.under, { width: x, opacity: reveal, backgroundColor: t.accent, borderRadius: t.radius - 6 }]}>
        <Pressable onPress={ctl.commit} style={styles.button} accessibilityRole="button" accessibilityLabel={label} testID={testID ? `${testID}-action` : undefined}>
          <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
            <Icon name={icon} size={26} color={t.onAccent} strokeWidth={2.2} />
          </Animated.View>
          <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: t.fs(13) }} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: left }], opacity: fade }} {...ctl.pan.panHandlers}>
        {children}
        {/* while open, a tap on the card closes it instead of opening the provider */}
        {isOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => ctl.springTo(0)} accessibilityLabel="Închide" />}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  under: { position: 'absolute', right: 0, top: 0, bottom: 0, overflow: 'hidden', justifyContent: 'center', alignItems: 'flex-end' },
  button: { width: ACTION_W, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
