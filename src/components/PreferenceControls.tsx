import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { LANGUAGES, t, type Language } from '@/lib/i18n';
import { usePreferences, type ThemeMode } from '@/lib/preferences';

type Colors = ReturnType<typeof useColors>;

function Segmented<T extends string>({
  options,
  value,
  onChange,
  colors,
  testID,
}: {
  options: { value: T; label: string; icon?: React.ComponentProps<typeof Feather>['name'] }[];
  value: T;
  onChange: (v: T) => void;
  colors: Colors;
  testID?: string;
}) {
  return (
    <View style={[styles.segment, { backgroundColor: colors.muted, borderColor: colors.border }]} testID={testID}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, selected && { backgroundColor: colors.card }]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            {o.icon ? <Feather name={o.icon} size={14} color={selected ? colors.primary : colors.mutedForeground} /> : null}
            <Text numberOfLines={1} style={[styles.segmentText, { color: selected ? colors.foreground : colors.secondaryForeground }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Compact language switch for the sign-in screens. */
export function LanguageSwitch() {
  const colors = useColors();
  const { language, setLanguage } = usePreferences();
  return (
    <View style={styles.langRow}>
      <Feather name="globe" size={14} color={colors.mutedForeground} />
      {LANGUAGES.map((l) => (
        <Pressable key={l.code} onPress={() => setLanguage(l.code)} accessibilityRole="button" accessibilityState={{ selected: language === l.code }} hitSlop={6}>
          <Text style={[styles.langText, { color: language === l.code ? colors.primary : colors.mutedForeground, fontFamily: language === l.code ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
            {l.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Language, appearance and reminders, for the Account screen. */
export function PreferencesCard({
  remindersSupported,
  permission,
  onRequestPermission,
}: {
  remindersSupported: boolean;
  permission: string;
  onRequestPermission: () => void;
}) {
  const colors = useColors();
  const { language, setLanguage, themeMode, setThemeMode, reminders, setReminders } = usePreferences();
  const themeOptions: { value: ThemeMode; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
    { value: 'system', label: t('System'), icon: 'smartphone' },
    { value: 'light', label: t('Light'), icon: 'sun' },
    { value: 'dark', label: t('Dark'), icon: 'moon' },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.secondaryForeground }]}>{t('Language')}</Text>
      <Segmented<Language>
        testID="pref-language"
        options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        value={language}
        onChange={setLanguage}
        colors={colors}
      />
      <Text style={[styles.label, styles.gap, { color: colors.secondaryForeground }]}>{t('Appearance')}</Text>
      <Segmented<ThemeMode> testID="pref-theme" options={themeOptions} value={themeMode} onChange={setThemeMode} colors={colors} />

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('Event reminders')}</Text>
          <Text style={[styles.rowCopy, { color: colors.mutedForeground }]}>
            {remindersSupported
              ? t('30 minutes before your timed events, and at 8:00 on the day of all-day ones.')
              : t('Reminders work in the phone app. On the web you get alerts for new notifications while the calendar is open.')}
          </Text>
        </View>
        <Switch
          testID="pref-reminders"
          value={reminders}
          onValueChange={(on) => {
            setReminders(on);
            if (on && permission !== 'granted') onRequestPermission();
          }}
          trackColor={{ true: colors.primary, false: colors.input }}
          thumbColor="#FFFFFF"
        />
      </View>
      {permission === 'denied' ? (
        <Text style={[styles.rowCopy, { color: colors.warning }]}>{t('Alerts are blocked for this app. Allow notifications in your device or browser settings.')}</Text>
      ) : permission === 'undetermined' ? (
        <Pressable onPress={onRequestPermission} style={[styles.allow, { backgroundColor: colors.accent }]} accessibilityRole="button">
          <Feather name="bell" size={14} color={colors.primary} />
          <Text style={[styles.allowText, { color: colors.primary }]}>{t('Turn on alerts on this device')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  gap: { marginTop: 14 },
  segment: { flexDirection: 'row', borderRadius: 11, borderWidth: 1, padding: 3, gap: 3 },
  segmentItem: { flex: 1, minHeight: 34, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  divider: { height: 1, marginVertical: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowCopy: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  allow: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, marginTop: 10 },
  allowText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 },
  langText: { fontSize: 12 },
});
