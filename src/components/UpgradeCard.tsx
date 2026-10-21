import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCalendar } from '@/lib/calendar-context';
import { PRO_PRICE, proYearlyTotal, SELL_IN_APP, UPGRADE_URL } from '@/lib/supabase-config';
import { t } from '@/lib/i18n';

/** Shown to super admins on the free plan, and when the people limit is hit. */
export function UpgradeCard({
  reason,
  compact = false,
}: {
  reason?: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const { org } = useCalendar();
  const people = org?.active_users ?? 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Feather name="zap" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{SELL_IN_APP ? t('Upgrade to Pro · {price} per person / year', { price: PRO_PRICE }) : t('Pro plan')}</Text>
          <Text style={[styles.copy, { color: colors.secondaryForeground }]}>
            {reason ?? t('Unlimited people and manager approval for events.')}
          </Text>
        </View>
      </View>
      {!compact ? (
        <View style={styles.features}>
          {[t('Unlimited people'), t('Managers approve team events'), t('Everything in Free')].map((line) => (
            <View key={line} style={styles.feature}>
              <Feather name="check" size={14} color={colors.success} />
              <Text style={[styles.featureText, { color: colors.secondaryForeground }]}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {SELL_IN_APP && people > 0 ? (
        <Text style={[styles.estimate, { color: colors.secondaryForeground }]}>
          {t('For your {n} people: {total} per year', { n: people, total: proYearlyTotal(people) })}
        </Text>
      ) : null}
      {SELL_IN_APP ? (
      <Pressable
        testID="upgrade-button"
        onPress={() => void Linking.openURL(UPGRADE_URL)}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.86 : 1 }]}
        accessibilityRole="link"
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{t('Request Pro')}</Text>
        <Feather name="arrow-up-right" size={15} color={colors.primaryForeground} />
      </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  header: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  copy: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  features: { gap: 6, paddingLeft: 2 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 12 },
  estimate: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  button: { minHeight: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
