import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { roleLabel, type CalendarPerson } from '@/lib/calendar-context';
import { t, tn } from '@/lib/i18n';

type Colors = ReturnType<typeof useColors>;

/** Active people whose team is `groupId`, managers first, then by name. */
export function teamMembers(people: CalendarPerson[], groupId: string): CalendarPerson[] {
  return people
    .filter((person) => person.is_active && person.group_id === groupId)
    .sort((a, b) => {
      const rank = (p: CalendarPerson) => (p.role === 'group_admin' ? 0 : 1);
      return rank(a) - rank(b) || a.full_name.localeCompare(b.full_name);
    });
}

/** "5 members" in the reader's language. */
export function memberCountLabel(n: number): string {
  return tn(n, '{n} member', '{n} members');
}

function initialsOf(person: CalendarPerson): string {
  if (person.initials) return person.initials.slice(0, 2).toUpperCase();
  const parts = person.full_name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** The members of one team: initials, name, title and a manager tag. */
export function TeamMemberList({
  members,
  color,
  colors,
  compact = false,
}: {
  members: CalendarPerson[];
  color: string;
  colors: Colors;
  /** Tighter rows for the desktop sidebar. */
  compact?: boolean;
}) {
  if (!members.length) {
    return (
      <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('No members in this team yet.')}</Text>
    );
  }
  return (
    <View style={[styles.list, compact && styles.listCompact]}>
      {members.map((person) => (
        <View key={person.id} style={[styles.row, compact && styles.rowCompact]} accessibilityLabel={person.full_name}>
          <View style={[styles.avatar, compact && styles.avatarCompact, { backgroundColor: color }]}>
            <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initialsOf(person)}</Text>
          </View>
          <View style={styles.text}>
            <Text numberOfLines={1} style={[styles.name, compact && styles.nameCompact, { color: colors.foreground }]}>
              {person.full_name}
            </Text>
            {person.title ? (
              <Text numberOfLines={1} style={[styles.sub, { color: colors.mutedForeground }]}>
                {person.title}
              </Text>
            ) : null}
          </View>
          {person.role === 'group_admin' ? (
            <View style={[styles.tag, { backgroundColor: colors.accent }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{roleLabel(person.role)}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  listCompact: { gap: 2, paddingStart: 14, paddingEnd: 4, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  rowCompact: { minHeight: 34, gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarCompact: { width: 24, height: 24, borderRadius: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  avatarTextCompact: { fontSize: 9 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  nameCompact: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  empty: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingStart: 14, paddingVertical: 6 },
});
