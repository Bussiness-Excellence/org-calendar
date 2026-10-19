import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useCalendar } from '@/lib/calendar-context';
import { t } from '@/lib/i18n';

export function PasswordEditor({
  required = false,
  visible = true,
  onClose,
}: {
  required?: boolean;
  visible?: boolean;
  onClose?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { changePassword } = useCalendar();
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const submit = async () => {
    if (password.length < 6) {
      setError(t('Use at least 6 characters.'));
      return;
    }
    if (password !== confirm) {
      setError(t('The passwords do not match.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await changePassword(password);
      setPassword('');
      setConfirm('');
      onClose?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Password could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      {!required && onClose ? (
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          hitSlop={10}
        >
          <Feather name="x" size={22} color={colors.secondaryForeground} />
        </Pressable>
      ) : null}
      <View style={[styles.icon, { backgroundColor: colors.accent }]}>
        <Feather name="lock" size={20} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {required ? t('Choose a new password') : t('Change password')}
      </Text>
      <Text style={[styles.copy, { color: colors.secondaryForeground }]}>
        {required
          ? t('Set a password only you know before continuing to the calendar.')
          : t('Use at least 6 characters.')}
      </Text>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.warningSurface }]}>
          <Text style={[styles.errorText, { color: colors.warning }]}>{error}</Text>
        </View>
      ) : null}
      <Text style={[styles.label, { color: colors.secondaryForeground }]}>{t('New password')}</Text>
      <TextInput
        testID="new-password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        textContentType="newPassword"
        placeholder={t('At least 6 characters')}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
      />
      <Text style={[styles.label, styles.confirmLabel, { color: colors.secondaryForeground }]}>
        {t('Confirm password')}
      </Text>
      <TextInput
        testID="confirm-password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        textContentType="newPassword"
        placeholder={t('Repeat your new password')}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
      />
      <Pressable
        onPress={() => setShowPassword((current) => !current)}
        style={styles.showPassword}
        accessibilityRole="button"
      >
        <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.primary} />
        <Text style={[styles.showText, { color: colors.primary }]}>
          {showPassword ? t('Hide passwords') : t('Show passwords')}
        </Text>
      </Pressable>
      <Pressable
        testID="save-password"
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: colors.primary, opacity: busy ? 0.65 : pressed ? 0.88 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {t('Save password')}
          </Text>
        )}
      </Pressable>
    </View>
  );

  if (required) {
    return (
      <View
        style={[
          styles.requiredRoot,
          {
            backgroundColor: colors.background,
            paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 18,
            paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom,
          },
        ]}
      >
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={styles.requiredContent}
          bottomOffset={72}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 14, 24, 0.48)' }]}
          onPress={onClose}
          accessibilityLabel={t('Dismiss password editor')}
        />
        <KeyboardAwareScrollViewCompat
          style={styles.modalScroll}
          contentContainerStyle={styles.modalContent}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  requiredRoot: { flex: 1, paddingHorizontal: 22 },
  requiredContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 0, maxHeight: '92%' },
  modalContent: { justifyContent: 'flex-end' },
  card: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 23,
    shadowColor: '#0C1B2A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  close: { position: 'absolute', right: 18, top: 17, padding: 2, zIndex: 1 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 21, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  copy: { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  errorBox: { padding: 11, borderRadius: 9, marginBottom: 15 },
  errorText: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  confirmLabel: { marginTop: 15 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, fontSize: 15, fontFamily: 'Inter_400Regular' },
  showPassword: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 13, marginBottom: 19 },
  showText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveButton: { minHeight: 49, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
