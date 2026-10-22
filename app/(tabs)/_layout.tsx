import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { isSuperAdmin, useCalendar } from '@/lib/calendar-context';
import { t } from '@/lib/i18n';

export default function TabLayout() {
  const colors = useColors();
  const isDark = colors.scheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  // On wide screens keep the three tabs together in the middle instead of spread edge to edge.
  const tabSidePad = width >= 900 ? Math.max(0, (width - 560) / 2) : 0;
  const { authLoading, userId, profile, profileLoading, org } = useCalendar();

  // Nothing inside the tabs is reachable without an active account in an organization.
  if (authLoading || (userId && profileLoading)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!userId || !profile || !profile.is_active || !org || profile.must_change_password) {
    return <Redirect href="/" />;
  }

  const showAdmin = isSuperAdmin(profile) || org.is_platform_admin;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 64, paddingBottom: 8, paddingHorizontal: tabSidePad } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Calendar'),
          tabBarIcon: ({ color }) => <Feather name="calendar" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t('Admin'),
          href: showAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="sliders" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Account'),
          tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
