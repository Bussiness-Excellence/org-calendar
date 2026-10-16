import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { PasswordEditor } from '@/components/PasswordEditor';
import { useColors } from '@/hooks/useColors';
import { initialsFor, roleLabel, useCalendar } from '@/lib/calendar-context';
import { APP_NAME } from '@/lib/supabase-config';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, email, groups, org, signOut } = useCalendar();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const group = groups.find((item) => item.id === profile?.group_id);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
      setSigningOut(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: (insets.top > 0 ? insets.top : 40) + 12, paddingBottom: 96 }]}
      >
        <View style={styles.headingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.kicker, { color: colors.primary }]}>
              {(org?.name ?? APP_NAME).toUpperCase()}
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Your account</Text>
          </View>
          <BrandMark name={org?.name} logoUrl={org?.logo_url} size={42} />
        </View>

        <View style={[styles.identityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: group?.color || colors.primary }]}>
            <Text style={styles.avatarText}>{profile?.initials || initialsFor(profile?.full_name)}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.fullName, { color: colors.foreground }]}>{profile?.full_name}</Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>{email || profile?.email}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{roleLabel(profile?.role)}</Text>
              </View>
              {group ? (
                <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                  <View style={[styles.groupDot, { backgroundColor: group.color || colors.primary }]} />
                  <Text style={[styles.badgeText, { color: colors.secondaryForeground }]}>{group.name}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Security</Text>
        <View style={[styles.securityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.securityIcon, { backgroundColor: colors.accent }]}>
            <Feather name="lock" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.securityTitle, { color: colors.foreground }]}>Password</Text>
            <Text style={[styles.securityCopy, { color: colors.mutedForeground }]}>Keep your calendar account secure.</Text>
          </View>
          <Pressable
            testID="change-password"
            onPress={() => setPasswordVisible(true)}
            style={[styles.changeButton, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
          >
            <Text style={[styles.changeText, { color: colors.primary }]}>Change</Text>
          </Pressable>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoHeading}>
            <Feather name="shield" size={17} color={colors.primary} />
            <Text style={[styles.securityTitle, { color: colors.foreground }]}>Private to {org?.name ?? 'your organization'}</Text>
          </View>
          <Text style={[styles.infoCopy, { color: colors.mutedForeground }]}>
            Only people in your organization can see its calendar. Your team and permissions are managed by your super admin.
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.warningSurface }]}>
            <Text style={[styles.errorText, { color: colors.warning }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          testID="sign-out"
          onPress={() => void handleSignOut()}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || signingOut ? 0.75 : 1 },
          ]}
          accessibilityRole="button"
        >
          {signingOut ? (
            <ActivityIndicator color={colors.destructive} />
          ) : (
            <>
              <Feather name="log-out" size={17} color={colors.destructive} />
              <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>{APP_NAME}</Text>
      </ScrollView>
      <PasswordEditor visible={passwordVisible} onClose={() => setPasswordVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  kicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  title: { fontSize: 25, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 3 },
  identityCard: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  avatar: { width: 53, height: 53, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_700Bold' },
  identityText: { flex: 1, minWidth: 0, gap: 4 },
  fullName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  email: { fontSize: 12, marginBottom: 7 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { minHeight: 24, borderRadius: 7, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  sectionHeading: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 5 },
  securityCard: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  securityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  securityTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  securityCopy: { fontSize: 11, marginTop: 3 },
  changeButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  changeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  infoCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 },
  infoHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoCopy: { fontSize: 12, lineHeight: 18 },
  errorBox: { borderRadius: 9, padding: 11 },
  errorText: { fontSize: 12, lineHeight: 17 },
  signOutButton: { minHeight: 48, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4 },
  signOutText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  footer: { textAlign: 'center', fontSize: 11, paddingTop: 3 },
});
