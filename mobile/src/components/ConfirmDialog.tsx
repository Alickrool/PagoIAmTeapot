import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../mode';
import { Button } from './Button';

/** Cross-platform confirm (Alert.alert with buttons does nothing on web). */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirm,
  cancel,
  danger,
  primary = 'cancel',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
  /** Which answer is the big button: 'cancel' for risky actions (default), 'confirm' for a plain yes. */
  primary?: 'confirm' | 'cancel';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={cancel}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad + 4 }]} onPress={() => {}}>
          <Text style={{ color: danger ? t.sev.critical.color : t.text, fontSize: t.fs(20), fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: t.text, fontSize: t.fs(15), lineHeight: t.fs(22) }}>{body}</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {primary === 'cancel' ? (
              <>
                <Button title={cancel} onPress={onCancel} />
                <Button title={confirm} onPress={onConfirm} variant="ghost" />
              </>
            ) : (
              <>
                <Button title={confirm} onPress={onConfirm} />
                <Button title={cancel} onPress={onCancel} variant="ghost" />
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
