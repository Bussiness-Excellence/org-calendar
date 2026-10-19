import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { initialsFor } from '@/lib/calendar-context';
import { t } from '@/lib/i18n';

/** The organization's logo, or its initials when there is no logo. */
export function BrandMark({
  name,
  logoUrl,
  size = 36,
}: {
  name?: string | null;
  logoUrl?: string | null;
  size?: number;
}) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.3);

  if (logoUrl && !failed) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.logo, { width: size, height: size, borderRadius: radius, borderColor: colors.border }]}
        contentFit="contain"
        accessibilityLabel={name ? t('{name} logo', { name }) : t('Organization logo')}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: colors.primary }]}
      accessibilityLabel={name ? t('{name} logo', { name }) : t('Calendar')}
    >
      {name ? (
        <Text style={[styles.initials, { color: colors.primaryForeground, fontSize: Math.round(size * 0.36) }]}>
          {initialsFor(name, 'C')}
        </Text>
      ) : (
        <Feather name="calendar" size={Math.round(size * 0.48)} color={colors.primaryForeground} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
});
