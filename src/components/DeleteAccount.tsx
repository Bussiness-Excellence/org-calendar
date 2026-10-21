import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { isSuperAdmin, useCalendar } from '@/lib/calendar-context';
import { t } from '@/lib/i18n';
import { AdminError, callAdmin } from '@/lib/supabase';

/** Account deletion (Google Play requires it in the app) and, for super admins, deleting the organization. */
export function DeleteAccount() {
  const colors = useColors();
  const { profile, org, signOut } = useCalendar();
  const [mode, setMode] = useState<'' | 'self' | 'org'>('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const superAdmin = isSuperAdmin(profile);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'org') await callAdmin('delete_org', { confirm_name: confirmName });
      else await callAdmin('delete_self');
      await signOut();
    } catch (cause) {
      if (cause instanceof AdminError && cause.code === 'LAST_SUPER') {
        setError(t('You are the only super admin. Make someone else a super admin first, or delete the whole organization.'));
      } else {
        setError(cause instanceof Error ? cause.message : t('That did not work. Try again.'));
      }
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('Delete account')}</Text>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

      {mode === '' ? (
        <>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            {t('Deleting your account removes your login and the events you created. This cannot be undone.')}
          </Text>
          <View style={styles.row}>
            <Pressable testID="delete-self" onPress={() => setMode('self')} style={[styles.button, { borderColor: colors.destructive }]} accessibilityRole="button">
              <Feather name="user-x" size={14} color={colors.destructive} />
              <Text style={[styles.buttonText, { color: colors.destructive }]}>{t('Delete my account')}</Text>
            </Pressable>
            {superAdmin ? (
              <Pressable testID="delete-org" onPress={() => setMode('org')} style={[styles.button, { borderColor: colors.destructive }]} accessibilityRole="button">
                <Feather name="trash-2" size={14} color={colors.destructive} />
                <Text style={[styles.buttonText, { color: colors.destructive }]}>{t('Delete organization')}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <View style={[styles.confirm, { backgroundColor: colors.warningSurface }]}>
          <Text style={[styles.copy, { color: colors.foreground }]}>
            {mode === 'org'
              ? t('This permanently deletes {name}: every person, team, event and notification. Type the organization name to confirm.', { name: org?.name ?? '' })
              : t('Delete your account now? You will be signed out and your events will be removed.')}
          </Text>
          {mode === 'org' ? (
            <TextInput
              testID="delete-org-name"
              value={confirmName}
              onChangeText={setConfirmName}
              placeholder={org?.name ?? ''}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            />
          ) : null}
          <View style={styles.row}>
            <Pressable onPress={() => { setMode(''); setError(''); setConfirmName(''); }} style={[styles.button, { borderColor: colors.border }]} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: colors.secondaryForeground }]}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              testID="confirm-delete-account"
              onPress={() => void run()}
              disabled={busy || (mode === 'org' && confirmName.trim().toLowerCase() !== (org?.name ?? '').trim().toLowerCase())}
              style={({ pressed }) => [
                styles.button,
                styles.danger,
                {
                  backgroundColor: colors.destructive,
                  borderColor: colors.destructive,
                  opacity: busy || (mode === 'org' && confirmName.trim().toLowerCase() !== (org?.name ?? '').trim().toLowerCase()) ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.destructiveForeground} /> : (
                <Text style={[styles.buttonText, { color: colors.destructiveForeground }]}>{t('Delete permanently')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  title: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  copy: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  danger: { flexGrow: 1 },
  buttonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  confirm: { borderRadius: 11, padding: 12, gap: 10 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
});
