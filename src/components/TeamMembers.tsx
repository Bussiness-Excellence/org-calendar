import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { roleLabel, type CalendarGroup, type CalendarPerson } from '@/lib/calendar-context';
import { findGroup } from '@/lib/departments';
import { t, tn } from '@/lib/i18n';

type Colors = ReturnType<typeof useColors>;

/** "5 members" in the reader's language. */
export function memberCountLabel(n: number): string {
  return tn(n, '{n} member', '{n} members');
}

function initialsOf(person: CalendarPerson): string {
  if (person.initials) return person.initials.slice(0, 2).toUpperCase();
  const parts = person.full_name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * The members of a department or sub-group: initials, name, title and a
 * manager tag. When `onAssign` is given and `canAssign(person)` is true,
 * tapping a person opens an "Assign task" window for them.
 */
export function TeamMemberList({
  members,
  groups,
  color,
  colors,
  compact = false,
  onAssign,
  canAssign,
}: {
  members: CalendarPerson[];
  groups: CalendarGroup[];
  color: string;
  colors: Colors;
  /** Tighter rows for the desktop sidebar. */
  compact?: boolean;
  onAssign?: (person: CalendarPerson) => void;
  canAssign?: (person: CalendarPerson) => boolean;
}) {
  if (!members.length) {
    return (
      <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('No members yet.')}</Text>
    );
  }
  return (
    <View style={[styles.list, compact && styles.listCompact]}>
      {members.map((person) => {
        const assignable = !!onAssign && (canAssign ? canAssign(person) : true);
        const body = (
          <>
            <View style={[styles.avatar, compact && styles.avatarCompact, { backgroundColor: color }]}>
              <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initialsOf(person)}</Text>
            </View>
            <View style={styles.text}>
              <Text numberOfLines={1} style={[styles.name, compact && styles.nameCompact, { color: colors.foreground }]}>
                {person.full_name}
              </Text>
              {compact && person.role !== 'user' ? (
                <Text numberOfLines={1} style={[styles.sub, styles.subRole, { color: colors.primary }]}>
                  {roleLabel(person.role, findGroup(groups, person.group_id))}
                </Text>
              ) : person.title ? (
                <Text numberOfLines={1} style={[styles.sub, { color: colors.mutedForeground }]}>
                  {person.title}
                </Text>
              ) : null}
            </View>
            {!compact && person.role !== 'user' ? (
              <View style={[styles.tag, { backgroundColor: colors.accent }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>
                  {roleLabel(person.role, findGroup(groups, person.group_id))}
                </Text>
              </View>
            ) : null}
            {assignable ? <Feather name="plus-circle" size={compact ? 14 : 16} color={colors.primary} /> : null}
          </>
        );
        return assignable ? (
          <Pressable
            key={person.id}
            testID={`assign-${person.id}`}
            onPress={() => onAssign?.(person)}
            style={({ pressed }) => [styles.row, compact && styles.rowCompact, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('Assign a task to {name}', { name: person.full_name })}
          >
            {body}
          </Pressable>
        ) : (
          <View key={person.id} style={[styles.row, compact && styles.rowCompact]} accessibilityLabel={person.full_name}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  listCompact: { gap: 2, paddingStart: 14, paddingEnd: 4, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, borderRadius: 8 },
  rowCompact: { minHeight: 34, gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarCompact: { width: 24, height: 24, borderRadius: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  avatarTextCompact: { fontSize: 9 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  nameCompact: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  subRole: { fontFamily: 'Inter_600SemiBold' },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  empty: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingStart: 14, paddingVertical: 6 },
});
