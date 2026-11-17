import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MOCK } from '../api/client';
import { useCopy, useStyles, useTheme, type Theme } from '../mode';
import { useStackNavigation } from '../navigation';
import { Icon } from './Icon';

/** The strip above the tabs (all 3 tabs): a pill that opens the search screen, and a mic for voice search. */
export function SearchBar() {
  const t = useTheme();
  const copy = useCopy();
  const styles = useStyles(makeStyles);
  const navigation = useStackNavigation();
  const senior = t.mode === 'senior';
  const icon = senior ? 26 : 20;

  const mic = MOCK ? null : (
    <Pressable
      key="mic"
      onPress={() => navigation.navigate('Search', { voice: true })}
      style={({ pressed }) => [styles.mic, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel="Caută cu vocea"
      hitSlop={6}
    >
      <Icon name="mic" size={icon} color={t.onAccent} />
    </Pressable>
  );
  const pill = (
    <Pressable
      key="pill"
      onPress={() => navigation.navigate('Search')}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
      accessibilityRole="search"
      accessibilityLabel={copy.searchPlaceholder}
    >
      <Icon name="search" size={icon} color={t.muted} />
      <Text style={styles.placeholder} numberOfLines={1}>
        {copy.searchPlaceholder}
      </Text>
    </Pressable>
  );
  // Senior: the mic comes first and is bigger; speaking is easier than typing.
  return <View style={styles.strip}>{senior ? [mic, pill] : [pill, mic]}</View>;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, backgroundColor: t.bg },
    pill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: t.mode === 'senior' ? 60 : 46,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    placeholder: { flex: 1, color: t.muted, fontSize: t.fs(15), fontWeight: '600' },
    mic: {
      width: t.mode === 'senior' ? 60 : 46,
      height: t.mode === 'senior' ? 60 : 46,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
    },
  });
