import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { lastSeenLabel, lastSeenShort } from '@/lib/calendar-date';
import { isOnline, ONLINE_WINDOW_MS, usePresence } from '@/lib/presence';

type Colors = ReturnType<typeof useColors>;

const ONLINE_GREEN = '#22C55E';

/** Small patch under a name: "● Online now" or "Last seen 5 min ago". */
export function LastSeenPatch({ personId, colors, small = false }: { personId: string; colors: Colors; small?: boolean }) {
  const { lastSeen, now } = usePresence();
  const iso = lastSeen[personId];
  const online = isOnline(iso, now);
  const full = lastSeenLabel(iso, now, ONLINE_WINDOW_MS);
  // Narrow places get the short form; the full sentence stays available as a tooltip / screen-reader label.
  const label = small ? lastSeenShort(iso, now, ONLINE_WINDOW_MS) : full;
  return (
    <View
      testID={`seen-${personId}`}
      accessibilityLabel={full}
      {...({ title: full } as object)}
      style={[styles.patch, small && styles.patchSmall, { backgroundColor: online ? colors.successSurface : colors.muted }]}
    >
      {online ? (
        <View style={[styles.patchDot, { backgroundColor: ONLINE_GREEN }]} />
      ) : (
        <Feather name="clock" size={small ? 9 : 10} color={colors.mutedForeground} />
      )}
      <Text
        numberOfLines={1}
        style={[styles.patchText, small && styles.patchTextSmall, { color: online ? colors.success : colors.mutedForeground }]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Green dot on the corner of an avatar while the person is online. */
export function OnlineDot({ personId, colors, size = 10 }: { personId: string; colors: Colors; size?: number }) {
  const { lastSeen, now } = usePresence();
  if (!isOnline(lastSeen[personId], now)) return null;
  return (
    <View
      testID={`online-${personId}`}
      accessibilityLabel="online"
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: ONLINE_GREEN, borderColor: colors.card },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  patch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
    maxWidth: '100%',
  },
  patchSmall: { paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 },
  patchDot: { width: 6, height: 6, borderRadius: 3 },
  patchText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  patchTextSmall: { fontSize: 9.5 },
  dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2 },
});
