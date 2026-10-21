import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PasswordEditor } from '@/components/PasswordEditor';
import { LanguageSwitch } from '@/components/PreferenceControls';
import { useColors } from '@/hooks/useColors';
import { getRememberedEmail, rememberEmail, useCalendar } from '@/lib/calendar-context';
import { pickLogo, type PickedLogo } from '@/lib/logo-picker';
import { APP_NAME, APP_TAGLINE, FREE_USER_LIMIT, isConfigured, PRIVACY_URL } from '@/lib/supabase-config';
import * as Linking from 'expo-linking';
import { arrowBack, t } from '@/lib/i18n';

type Mode = 'sign-in' | 'register';

export default function EntryScreen() {
  const colors = useColors();
  const { authLoading, userId, profile, org, profileLoading, profileError, signOut } = useCalendar();
  const [mode, setMode] = useState<Mode>('sign-in');

  if (!isConfigured) {
    return <AccountIssue title={t('App not configured')} message={t('This build has no server address. Rebuild it with the Supabase settings.')} />;
  }

  if (authLoading || (userId && profileLoading)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!userId) {
    return mode === 'sign-in' ? (
      <SignInScreen onRegister={() => setMode('register')} />
    ) : (
      <RegisterScreen onSignIn={() => setMode('sign-in')} />
    );
  }

  if (profileError || !profile || !profile.is_active || !org) {
    const message = profileError
      ? t('Your account could not be checked. Check your connection and try again.')
      : profile && !profile.is_active
        ? t('This account has been deactivated. Contact your calendar admin.')
        : t('This account is not part of any organization yet.');
    return <AccountIssue title={t('Calendar access unavailable')} message={message} onSignOut={signOut} />;
  }

  if (profile.must_change_password) return <PasswordEditor required />;

  return <Redirect href="/(tabs)" />;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 40 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  return (
    <View style={[styles.authRoot, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.authScroll}
        contentContainerStyle={[styles.authContent, { paddingTop: top + 20, paddingBottom: bottom + 20 }]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <LanguageSwitch />
        <View style={[styles.authCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function ProductHeader({ subtitle }: { subtitle: string }) {
  const colors = useColors();
  return (
    <>
      <View style={styles.brandBlock}>
        <Image source={require('../assets/images/icon.png')} style={styles.brandIcon} accessibilityLabel={`${APP_NAME} icon`} />
        <Text style={[styles.brandName, { color: colors.primary }]}>{APP_NAME.toUpperCase()}</Text>
      </View>
      <Text style={[styles.tagline, { color: colors.mutedForeground }]}>{t(APP_TAGLINE)}</Text>
      <View style={[styles.brandRule, { backgroundColor: colors.primary }]} />
      <Text style={[styles.subtitle, { color: colors.secondaryForeground }]}>{subtitle}</Text>
    </>
  );
}

function ErrorBox({ message }: { message: string }) {
  const colors = useColors();
  if (!message) return null;
  return (
    <View style={[styles.message, { backgroundColor: colors.warningSurface }]} accessibilityRole="alert">
      <Feather name="alert-circle" size={16} color={colors.warning} />
      <Text style={[styles.messageText, { color: colors.warning }]}>{message}</Text>
    </View>
  );
}

function Field({
  label,
  first = false,
  ...input
}: React.ComponentProps<typeof TextInput> & { label: string; first?: boolean }) {
  const colors = useColors();
  return (
    <>
      <Text style={[styles.label, !first && styles.labelGap, { color: colors.secondaryForeground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...input}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
    </>
  );
}

function PasswordField({
  value,
  onChangeText,
  onSubmitEditing,
  placeholder,
  testID,
  label = t('Password'),
  newPassword = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  testID: string;
  label?: string;
  newPassword?: boolean;
}) {
  const colors = useColors();
  const [show, setShow] = useState(false);
  return (
    <>
      <Text style={[styles.label, styles.labelGap, { color: colors.secondaryForeground }]}>{label}</Text>
      <View style={[styles.passwordWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={!show}
          autoCapitalize="none"
          textContentType={newPassword ? 'newPassword' : 'password'}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          style={[styles.passwordInput, { color: colors.foreground }]}
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={show ? t('Hide password') : t('Show password')}
          hitSlop={10}
        >
          <Feather name={show ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </>
  );
}

function PrimaryButton({ label, busy, onPress, testID }: { label: string; busy: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary, opacity: busy ? 0.7 : pressed ? 0.88 : 1 },
      ]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function SignInScreen({ onRegister }: { onRegister: () => void }) {
  const colors = useColors();
  const { signIn } = useCalendar();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getRememberedEmail()
      .then((saved) => {
        if (active && saved) {
          setEmail(saved);
          setRemember(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t('Enter your email and password.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      void rememberEmail(remember ? email.trim().toLowerCase() : null).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Sign in could not be completed. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <ProductHeader subtitle={t('Your organization’s shared calendar. Sign in to continue.')} />
      <ErrorBox message={error} />
      <Field
        first
        label={t('Email')}
        testID="sign-in-email"
        value={email}
        onChangeText={setEmail}
        placeholder={t('name@company.com')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="next"
      />
      <PasswordField testID="sign-in-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} placeholder={t('Your password')} />
      <Pressable
        testID="remember-email"
        onPress={() => setRemember((r) => !r)}
        style={styles.rememberRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: remember ? colors.primary : colors.input, backgroundColor: remember ? colors.primary : 'transparent' },
          ]}
        >
          {remember ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
        </View>
        <Text style={[styles.rememberText, { color: colors.secondaryForeground }]}>{t('Remember my email')}</Text>
      </Pressable>
      <PrimaryButton testID="sign-in-submit" label={t('Sign in')} busy={busy} onPress={submit} />
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
        {t('Joining a team? Your calendar admin creates your account.')}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.altTitle, { color: colors.foreground }]}>{t('New to {app}?', { app: APP_NAME })}</Text>
      <Pressable
        testID="go-register"
        onPress={onRegister}
        style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        <Feather name="plus-circle" size={16} color={colors.primary} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{t('Create your organization')}</Text>
      </Pressable>
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>{t('Free for up to {n} people.', { n: FREE_USER_LIMIT })}</Text>
    </AuthShell>
  );
}

function RegisterScreen({ onSignIn }: { onSignIn: () => void }) {
  const colors = useColors();
  const { registerOrg } = useCalendar();
  const [orgName, setOrgName] = useState('');
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chooseLogo = async () => {
    setError('');
    try {
      const picked = await pickLogo();
      if (picked) setLogo(picked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That image could not be used.'));
    }
  };

  const submit = async () => {
    if (!orgName.trim()) return setError(t('Enter your organization’s name.'));
    if (!fullName.trim()) return setError(t('Enter your full name.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t('Enter a valid email address.'));
    if (password.length < 8) return setError(t('Use a password of at least 8 characters.'));
    setBusy(true);
    setError('');
    try {
      await registerOrg({
        org_name: orgName.trim(),
        full_name: fullName.trim(),
        email,
        password,
        logo: logo ? { base64: logo.base64, mime: logo.mime } : null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Your organization could not be created. Try again.'));
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Pressable onPress={onSignIn} style={styles.backLink} accessibilityRole="button" hitSlop={8}>
        <Feather name={arrowBack()} size={16} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary }]}>{t('Back to sign in')}</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('Create your organization')}</Text>
      <Text style={[styles.subtitle, { color: colors.secondaryForeground }]}>
        {t('You\'ll be its super admin. Your calendar starts empty and only your people can see it.')}
      </Text>
      <ErrorBox message={error} />

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ORGANIZATION</Text>
      <Field first label={t('Organization name')} testID="register-org-name" value={orgName} onChangeText={setOrgName} placeholder={t('e.g. Acme Pharma')} autoCapitalize="words" maxLength={120} />

      <Text style={[styles.label, styles.labelGap, { color: colors.secondaryForeground }]}>{t('Logo (optional)')}</Text>
      <View style={styles.logoRow}>
        <BrandMark name={orgName || undefined} logoUrl={logo?.uri} size={52} />
        <Pressable
          testID="register-logo"
          onPress={() => void chooseLogo()}
          style={({ pressed }) => [styles.logoButton, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          accessibilityRole="button"
        >
          <Feather name="image" size={15} color={colors.secondaryForeground} />
          <Text style={[styles.logoButtonText, { color: colors.secondaryForeground }]}>{logo ? t('Change logo') : t('Upload logo')}</Text>
        </Pressable>
        {logo ? (
          <Pressable onPress={() => setLogo(null)} accessibilityRole="button" accessibilityLabel={t('Remove logo')} hitSlop={8}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.sectionLabel, styles.sectionGap, { color: colors.mutedForeground }]}>YOUR SUPER ADMIN ACCOUNT</Text>
      <Field first label={t('Full name')} testID="register-full-name" value={fullName} onChangeText={setFullName} placeholder={t('Your name')} autoCapitalize="words" textContentType="name" autoComplete="name" maxLength={120} />
      <Field
        label={t('Work email')}
        testID="register-email"
        value={email}
        onChangeText={setEmail}
        placeholder={t('name@company.com')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        autoComplete="email"
      />
      <PasswordField testID="register-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} placeholder={t('At least 8 characters')} newPassword />

      <View style={[styles.planNote, { backgroundColor: colors.accent }]}>
        <Feather name="gift" size={15} color={colors.primary} />
        <Text style={[styles.planNoteText, { color: colors.secondaryForeground }]}>
          {t('Free for up to {n} people. Upgrade any time for more people and event approvals.', { n: FREE_USER_LIMIT })}
        </Text>
      </View>
      <PrimaryButton testID="register-submit" label={t('Create organization')} busy={busy} onPress={submit} />
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
        {t('By creating an organization you agree to the')}{' '}
        <Text onPress={() => void Linking.openURL(PRIVACY_URL)} style={{ color: colors.primary }} accessibilityRole="link">
          {t('Privacy policy')}
        </Text>
      </Text>
    </AuthShell>
  );
}

function AccountIssue({ title, message, onSignOut }: { title: string; message: string; onSignOut?: () => Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (!onSignOut) return;
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={[
        styles.issueRoot,
        {
          backgroundColor: colors.background,
          paddingTop: (Platform.OS === 'web' ? 40 : insets.top) + 24,
          paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 24,
        },
      ]}
    >
      <View style={[styles.issueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="user-x" size={26} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryForeground }]}>{message}</Text>
        {onSignOut ? <PrimaryButton testID="issue-sign-out" label={t('Sign out')} busy={busy} onPress={() => void leave()} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authRoot: { flex: 1 },
  authScroll: { flex: 1 },
  authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
  authCard: {
    width: '100%',
    maxWidth: 410,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    shadowColor: '#0C1B2A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  brandBlock: { alignItems: 'center', marginBottom: 14 },
  brandIcon: { width: 56, height: 56, borderRadius: 16, marginBottom: 9 },
  brandName: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 1.6 },
  tagline: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 6 },
  brandRule: { height: 2, opacity: 0.16, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 5, marginBottom: 18 },
  message: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 11, borderRadius: 10, marginBottom: 15 },
  messageText: { flex: 1, fontSize: 12, lineHeight: 18 },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 10 },
  sectionGap: { marginTop: 22 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  labelGap: { marginTop: 15 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, fontSize: 15, fontFamily: 'Inter_400Regular' },
  passwordWrap: { height: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 13 },
  passwordInput: { flex: 1, height: '100%', fontSize: 15, fontFamily: 'Inter_400Regular' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, marginBottom: 18 },
  checkbox: { width: 17, height: 17, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rememberText: { fontSize: 13 },
  primaryButton: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: { minHeight: 46, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  footnote: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 12 },
  divider: { height: 1, marginVertical: 20 },
  altTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginBottom: 11 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, alignSelf: 'flex-start' },
  backText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoButton: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  planNote: { flexDirection: 'row', gap: 9, padding: 11, borderRadius: 10, marginTop: 20, marginBottom: 16, alignItems: 'flex-start' },
  planNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  issueRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  issueCard: { maxWidth: 410, width: '100%', alignSelf: 'center', borderRadius: 18, borderWidth: 1, padding: 24, gap: 14 },
});
