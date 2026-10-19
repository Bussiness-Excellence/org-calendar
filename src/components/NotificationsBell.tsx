import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCalendar } from '@/lib/calendar-context';
import { relativeTime } from '@/lib/calendar-date';
import { t } from '@/lib/i18n';
import { describeNotification, useNotifications, type AppNotification } from '@/lib/notifications';

const ICONS: Record<AppNotification['kind'], React.ComponentProps<typeof Feather>['name']> = {
  assigned: 'user-check',
  review_needed: 'clock',
  approved: 'check-circle',
  sent_back: 'corner-up-left',
  shared: 'calendar',
};

/** Bell with unread count; opens the notification list. */
export function NotificationsBell({ onOpenEvent }: { onOpenEvent: (eventId: string, date: string | null) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { people } = useCalendar();
  const { items, unread, markAllRead, markRead, remove, permission, requestPermission } = useNotifications();
  const [open, setOpen] = useState(false);

  const tone = (kind: AppNotification['kind']) =>
    kind === 'sent_back' ? colors.destructive : kind === 'review_needed' ? colors.warning : kind === 'approved' ? colors.success : colors.primary;

  return (
    <>
      <Pressable
        testID="notifications-bell"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.bell, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}
      >
        <Feather name="bell" size={18} color={colors.secondaryForeground} />
        {unread ? (
          <View style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.background }]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 14, 24, 0.48)' }]} onPress={() => setOpen(false)} accessibilityLabel={t('Close')} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t('Notifications')}</Text>
              {unread ? (
                <Pressable onPress={() => void markAllRead()} accessibilityRole="button" hitSlop={8}>
                  <Text style={[styles.link, { color: colors.primary }]}>{t('Mark all read')}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('Close')} hitSlop={10}>
                <Feather name="x" size={21} color={colors.secondaryForeground} />
              </Pressable>
            </View>

            {permission === 'undetermined' ? (
              <Pressable
                onPress={() => void requestPermission()}
                style={[styles.permission, { backgroundColor: colors.accent }]}
                accessibilityRole="button"
              >
                <Feather name="bell" size={15} color={colors.primary} />
                <Text style={[styles.permissionText, { color: colors.primary }]}>{t('Turn on alerts on this device')}</Text>
              </Pressable>
            ) : null}

            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
              {items.length === 0 ? (
                <View style={styles.empty}>
                  <Feather name="inbox" size={26} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('No notifications yet. You’ll see assignments, approvals and new shared events here.')}</Text>
                </View>
              ) : (
                items.map((n) => {
                  const actor = people.find((p) => p.id === n.actor_id)?.full_name;
                  const { title, body } = describeNotification(n, actor);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => {
                        void markRead(n.id);
                        if (n.event_id) {
                          setOpen(false);
                          onOpenEvent(n.event_id, n.event_date);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        { borderTopColor: colors.border, backgroundColor: n.read_at ? 'transparent' : colors.accent, opacity: pressed ? 0.85 : 1 },
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={[styles.icon, { backgroundColor: colors.card }]}>
                        <Feather name={ICONS[n.kind]} size={15} color={tone(n.kind)} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
                        <Text style={[styles.rowBody, { color: colors.secondaryForeground }]}>{body}</Text>
                        <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{relativeTime(n.created_at)}</Text>
                      </View>
                      <Pressable onPress={() => void remove(n.id)} accessibilityRole="button" accessibilityLabel={t('Remove')} hitSlop={8}>
                        <Feather name="x" size={15} color={colors.mutedForeground} />
                      </Pressable>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bell: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '86%', alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 18 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#8298AE', opacity: 0.45, alignSelf: 'center', marginTop: 9, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  link: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  permission: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 10, marginBottom: 10 },
  permissionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  list: { flexGrow: 0 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 20 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 11, paddingVertical: 11, paddingHorizontal: 8, borderTopWidth: 1, borderRadius: 10, alignItems: 'flex-start' },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowTime: { fontSize: 10, marginTop: 4 },
});
