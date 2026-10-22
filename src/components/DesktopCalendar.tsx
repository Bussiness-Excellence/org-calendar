import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { NotificationsBell } from '@/components/NotificationsBell';
import { useColors } from '@/hooks/useColors';
import {
  initialsFor,
  type CalendarEvent,
  type CalendarGroup,
  type CalendarProfile,
  type OrgSummary,
} from '@/lib/calendar-context';
import {
  dateTitle,
  displayTime,
  localDateString,
  monthGrid,
  monthTitle,
  parseLocalDate,
  shortDateTitle,
} from '@/lib/calendar-date';
import { backIcon, dateLocale, forwardIcon, t, tn } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

type Colors = ReturnType<typeof useColors>;
type Mode = 'month' | 'week' | 'list';

export interface DesktopCalendarProps {
  org: OrgSummary | null;
  profile: CalendarProfile | null;
  showAdmin: boolean;
  groups: CalendarGroup[];
  /** Events this person may see, already filtered by the selected team. */
  events: CalendarEvent[];
  groupFilter: string | null;
  setGroupFilter: (id: string | null) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  reviewQueue: CalendarEvent[];
  approvalsOn: boolean;
  busy: boolean;
  banner: React.ReactNode;
  onNewEvent: () => void;
  onOpenEvent: (e: CalendarEvent) => void;
  onApprove: (e: CalendarEvent) => void;
  onSendBack: (e: CalendarEvent) => void;
  onBellOpen: (eventId: string, date: string | null) => void;
  eventColor: (e: CalendarEvent) => string;
  groupName: (id: string) => string;
  personName: (e: CalendarEvent) => string;
}

/** Readable text on a colored event block: dark text on light colors, white on dark ones. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.3 ? '#0C1B2A' : '#FFFFFF';
}

function shortTime(value?: string | null): string {
  return value ? displayTime(value) : '';
}

function weekStart(dateKey: string): Date {
  const d = parseLocalDate(dateKey) ?? new Date();
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start;
}

export function DesktopCalendar(props: DesktopCalendarProps) {
  const colors = useColors();
  const { setThemeMode } = usePreferences();
  const [mode, setMode] = useState<Mode>('month');
  const {
    org, profile, showAdmin, groups, events, groupFilter, setGroupFilter, cursor, setCursor,
    selectedDate, setSelectedDate, reviewQueue, approvalsOn, busy, banner,
    onNewEvent, onOpenEvent, onApprove, onSendBack, onBellOpen, eventColor, groupName, personName,
  } = props;
  const today = localDateString();

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [events]);

  const inMonth = (e: CalendarEvent) => {
    const d = parseLocalDate(e.date);
    return !!d && d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
  };
  const monthEvents = events.filter(inMonth);
  const sharedCount = monthEvents.filter((e) => e.visibility !== 'private').length;
  const pendingCount = monthEvents.filter((e) => e.status === 'pending').length;
  const weekDays = useMemo(() => {
    const start = weekStart(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const shortWeekday = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(dateLocale(), { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, []);

  const go = (delta: number) => {
    if (mode === 'week') {
      const d = parseLocalDate(selectedDate) ?? new Date();
      d.setDate(d.getDate() + delta * 7);
      setSelectedDate(localDateString(d));
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      return;
    }
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
    setSelectedDate(localDateString(next));
  };
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(localDateString(now));
  };
  const pickDay = (d: Date) => {
    setSelectedDate(localDateString(d));
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const rangeTitle =
    mode === 'week'
      ? `${shortDateTitle(localDateString(weekDays[0]))} – ${shortDateTitle(localDateString(weekDays[6]))}`
      : monthTitle(cursor);

  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) if (inMonth(e)) m.set(e.group_id, (m.get(e.group_id) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, cursor]);

  const selectedEvents = byDate.get(selectedDate) ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[styles.topbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.brand}>
          <BrandMark name={org?.name} logoUrl={org?.logo_url} size={38} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={[styles.orgName, { color: colors.foreground }]}>{org?.name ?? t('Calendar')}</Text>
            <Text style={[styles.orgCaption, { color: colors.mutedForeground }]}>{t('Calendar').toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.nav}>
          <Pressable onPress={() => go(-1)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={mode === 'week' ? t('Previous week') : t('Previous month')}>
            <Feather name={backIcon()} size={20} color={colors.secondaryForeground} />
          </Pressable>
          <Text style={[styles.range, { color: colors.foreground }]}>{rangeTitle}</Text>
          <Pressable onPress={() => go(1)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={mode === 'week' ? t('Next week') : t('Next month')}>
            <Feather name={forwardIcon()} size={20} color={colors.secondaryForeground} />
          </Pressable>
          <Pressable onPress={goToday} style={[styles.todayBtn, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.todayText, { color: colors.foreground }]}>{t('Today')}</Text>
          </Pressable>
          <View style={[styles.segment, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            {(['month', 'week', 'list'] as const).map((m) => (
              <Pressable
                key={m}
                testID={`desk-view-${m}`}
                onPress={() => setMode(m)}
                style={[styles.segItem, mode === m && { backgroundColor: colors.card }]}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.segText, { color: mode === m ? colors.foreground : colors.secondaryForeground }]}>
                  {m === 'month' ? t('Month') : m === 'week' ? t('Week') : t('List')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable testID="new-event" onPress={onNewEvent} style={({ pressed }) => [styles.newBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button">
            <Feather name="plus" size={17} color={colors.primaryForeground} />
            <Text style={[styles.newText, { color: colors.primaryForeground }]}>{t('New event')}</Text>
          </Pressable>
          <NotificationsBell onOpenEvent={onBellOpen} />
          <Pressable
            onPress={() => setThemeMode(colors.scheme === 'dark' ? 'light' : 'dark')}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={colors.scheme === 'dark' ? t('Light') : t('Dark')}
          >
            <Feather name={colors.scheme === 'dark' ? 'sun' : 'moon'} size={19} color={colors.secondaryForeground} />
          </Pressable>
          {showAdmin ? (
            <Pressable onPress={() => router.push('/admin' as Href)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('Admin')}>
              <Feather name="sliders" size={19} color={colors.secondaryForeground} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={[styles.avatar, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={t('Open profile')}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{profile?.initials || initialsFor(profile?.full_name)}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {/* Left sidebar */}
        <ScrollView style={[styles.sidebar, { borderEndColor: colors.border, backgroundColor: colors.card }]} contentContainerStyle={styles.sidebarContent}>
          <View style={styles.statRow}>
            {[
              { n: monthEvents.length, label: t('Events'), color: colors.foreground },
              { n: sharedCount, label: t('Shared'), color: colors.foreground },
              { n: pendingCount, label: t('Pending'), color: colors.warning },
            ].map((s) => (
              <View key={s.label} style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.n}</Text>
                <Text numberOfLines={1} style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sideHeading, { color: colors.mutedForeground }]}>{t('Teams')}</Text>
          <Pressable
            onPress={() => setGroupFilter(null)}
            style={[styles.groupRow, groupFilter === null && { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityState={{ selected: groupFilter === null }}
          >
            <Feather name="grid" size={14} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.groupName, { color: colors.foreground }]}>{t('All teams')}</Text>
          </Pressable>
          {groups.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
              style={[styles.groupRow, groupFilter === g.id && { backgroundColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityState={{ selected: groupFilter === g.id }}
            >
              <View style={[styles.groupDot, { backgroundColor: g.color || colors.primary }]} />
              <Text numberOfLines={1} style={[styles.groupName, { color: colors.foreground }]}>{g.name}</Text>
              <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>{groupCounts.get(g.id) ?? 0}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Main area */}
        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
          {banner}
          <View style={styles.chipRow}>
            <View style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
              <Feather name="grid" size={13} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>{groupFilter ? groupName(groupFilter) : t('All teams')}</Text>
            </View>
            {reviewQueue.length > 0 ? (
              <View style={[styles.chip, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
                <Feather name="clock" size={13} color={colors.warning} />
                <Text style={[styles.chipText, { color: colors.warning }]}>{tn(reviewQueue.length, '{n} waiting for approval', '{n} waiting for approval')}</Text>
              </View>
            ) : null}
          </View>

          {mode === 'month' ? (
            <View style={[styles.grid, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.gridHead, { borderBottomColor: colors.border }]}>
                {shortWeekday.map((d, i) => (
                  <Text key={`${d}-${i}`} style={[styles.gridHeadText, { color: colors.mutedForeground }]}>{d}</Text>
                ))}
              </View>
              <View style={styles.cells}>
                {monthGrid(cursor).map((date) => {
                  const key = localDateString(date);
                  const list = byDate.get(key) ?? [];
                  const other = date.getMonth() !== cursor.getMonth();
                  const isToday = key === today;
                  const selected = key === selectedDate;
                  return (
                    <Pressable
                      key={key}
                      testID={`calendar-day-${key}`}
                      onPress={() => pickDay(date)}
                      style={[
                        styles.cell,
                        { borderColor: colors.border, backgroundColor: other ? colors.secondary : colors.card },
                        selected && { backgroundColor: colors.accent },
                        isToday && { borderColor: colors.primary, borderWidth: 2 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${dateTitle(key)}${list.length ? `, ${tn(list.length, '{n} event', '{n} events')}` : ''}`}
                    >
                      <Text style={[styles.cellNum, { color: other ? colors.mutedForeground : isToday ? colors.primary : colors.foreground }, isToday && styles.cellNumToday]}>
                        {date.getDate()}
                      </Text>
                      <View style={styles.cellEvents}>
                        {list.slice(0, 3).map((e) => (
                          <EventBlock key={e.id} event={e} color={eventColor(e)} colors={colors} onPress={() => onOpenEvent(e)} />
                        ))}
                        {list.length > 3 ? (
                          <Text style={[styles.more, { color: colors.mutedForeground }]}>{t('+{n} more', { n: list.length - 3 })}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : mode === 'week' ? (
            <View style={styles.week}>
              {weekDays.map((date, i) => {
                const key = localDateString(date);
                const list = byDate.get(key) ?? [];
                const isToday = key === today;
                return (
                  <Pressable
                    key={key}
                    onPress={() => pickDay(date)}
                    style={[styles.weekCol, { borderColor: isToday ? colors.primary : colors.border, backgroundColor: colors.card }, isToday && { borderWidth: 2 }]}
                    accessibilityRole="button"
                    accessibilityLabel={dateTitle(key)}
                  >
                    <View style={[styles.weekHead, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.weekDay, { color: colors.mutedForeground }]}>{shortWeekday[i]}</Text>
                      <Text style={[styles.weekNum, { color: isToday ? colors.primary : colors.foreground }]}>{date.getDate()}</Text>
                    </View>
                    <View style={styles.weekEvents}>
                      {list.map((e) => (
                        <EventBlock key={e.id} event={e} color={eventColor(e)} colors={colors} tall onPress={() => onOpenEvent(e)} subtitle={personName(e)} />
                      ))}
                      {list.length === 0 ? <Text style={[styles.weekEmpty, { color: colors.mutedForeground }]}>—</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {monthEvents.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('No events this month.')}</Text>
              ) : (
                monthEvents.map((e, i) => {
                  const showDate = i === 0 || monthEvents[i - 1].date !== e.date;
                  return (
                    <View key={e.id}>
                      {showDate ? (
                        <Text style={[styles.listDate, { color: colors.mutedForeground, borderTopColor: colors.border }, i === 0 && { borderTopWidth: 0 }]}>
                          {dateTitle(e.date)}
                        </Text>
                      ) : null}
                      <Pressable onPress={() => onOpenEvent(e)} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.muted }]} accessibilityRole="button">
                        <View style={[styles.listBar, { backgroundColor: eventColor(e) }]} />
                        <Text style={[styles.listTime, { color: colors.secondaryForeground }]}>{e.time_start ? displayTime(e.time_start) : t('All day')}</Text>
                        <Text numberOfLines={1} style={[styles.listTitle, { color: colors.foreground }]}>{e.title}</Text>
                        <Text numberOfLines={1} style={[styles.listMeta, { color: colors.mutedForeground }]}>{groupName(e.group_id)} · {personName(e)}</Text>
                        {e.status === 'pending' ? (
                          <View style={[styles.pill, { backgroundColor: colors.warningSurface }]}>
                            <Text style={[styles.pillText, { color: colors.warning }]}>{t('Pending')}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>

        {/* Right panel */}
        <ScrollView style={[styles.side, { borderStartColor: colors.border, backgroundColor: colors.card }]} contentContainerStyle={styles.sideContent}>
          {reviewQueue.length > 0 ? (
            <>
              <View style={styles.sideTitleRow}>
                <Text style={[styles.sideTitle, { color: colors.secondaryForeground }]}>{t('Waiting for you')}</Text>
                <View style={[styles.badge, { backgroundColor: colors.warningSurface }]}>
                  <Text style={[styles.badgeText, { color: colors.warning }]}>{reviewQueue.length}</Text>
                </View>
              </View>
              {reviewQueue.map((e) => (
                <View key={e.id} style={[styles.reviewCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Pressable onPress={() => onOpenEvent(e)} accessibilityRole="button">
                    <Text style={[styles.reviewTitle, { color: colors.foreground }]}>{e.title}</Text>
                    <Text style={[styles.reviewMeta, { color: colors.mutedForeground }]}>{personName(e)} · {shortDateTitle(e.date)}</Text>
                  </Pressable>
                  <View style={styles.reviewActions}>
                    <Pressable disabled={busy} onPress={() => onApprove(e)} style={[styles.approve, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={t('Approve {title}', { title: e.title })}>
                      <Text style={[styles.approveText, { color: colors.primaryForeground }]}>{t('Approve')}</Text>
                    </Pressable>
                    {approvalsOn ? (
                      <Pressable onPress={() => onSendBack(e)} style={[styles.sendBack, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={t('Send back {title}', { title: e.title })}>
                        <Text style={[styles.sendBackText, { color: colors.foreground }]}>{t('Send back')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.sideTitleRow}>
            <Text style={[styles.sideTitle, { color: colors.secondaryForeground }]}>{dateTitle(selectedDate)}</Text>
          </View>
          {selectedEvents.length === 0 ? (
            <View style={[styles.emptyDay, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('Nothing planned for this day.')}</Text>
              <Pressable onPress={onNewEvent} style={[styles.emptyAdd, { borderColor: colors.primary }]} accessibilityRole="button">
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.emptyAddText, { color: colors.primary }]}>{t('Add event')}</Text>
              </Pressable>
            </View>
          ) : (
            selectedEvents.map((e) => (
              <Pressable key={e.id} onPress={() => onOpenEvent(e)} style={[styles.dayItem, { borderColor: colors.border, backgroundColor: colors.background }]} accessibilityRole="button">
                <View style={[styles.dayBar, { backgroundColor: eventColor(e) }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={[styles.reviewTitle, { color: colors.foreground }]}>{e.title}</Text>
                  <Text numberOfLines={1} style={[styles.reviewMeta, { color: colors.mutedForeground }]}>
                    {e.time_start ? `${displayTime(e.time_start)}${e.time_end ? ` – ${displayTime(e.time_end)}` : ''}` : t('All day')} · {groupName(e.group_id)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function EventBlock({
  event,
  color,
  colors,
  onPress,
  tall,
  subtitle,
}: {
  event: CalendarEvent;
  color: string;
  colors: Colors;
  onPress: () => void;
  tall?: boolean;
  subtitle?: string;
}) {
  const waiting = event.status !== 'approved';
  const fg = waiting ? colors.foreground : textOn(color);
  const time = shortTime(event.time_start);
  return (
    <Pressable
      onPress={(ev) => {
        ev.stopPropagation?.();
        onPress();
      }}
      style={({ pressed }) => [
        styles.block,
        tall && styles.blockTall,
        waiting
          ? { borderColor: event.status === 'rejected' ? colors.destructive : color, borderStyle: 'dashed', borderWidth: 1.5, backgroundColor: colors.card }
          : { backgroundColor: color, borderColor: color },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}${waiting ? `, ${t('Pending')}` : ''}`}
    >
      <View style={styles.blockLine}>
        {waiting ? <Feather name="clock" size={11} color={colors.mutedForeground} /> : null}
        {time ? <Text numberOfLines={1} style={[styles.blockTime, { color: fg }]}>{time}</Text> : null}
        <Text numberOfLines={1} style={[styles.blockText, { color: fg }]}>{event.title}</Text>
      </View>
      {tall && subtitle ? (
        <Text numberOfLines={1} style={[styles.blockSub, { color: fg, opacity: 0.8 }]}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topbar: { height: 68, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 250, minWidth: 0 },
  orgName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  orgCaption: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginTop: 2 },
  nav: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  range: { minWidth: 190, textAlign: 'center', fontSize: 18, fontFamily: 'Inter_700Bold' },
  todayBtn: { height: 36, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginStart: 6 },
  todayText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 2, marginStart: 6 },
  segItem: { height: 32, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  newText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginStart: 4 },
  avatarText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  sidebar: { width: 260, flexGrow: 0, borderEndWidth: 1 },
  sidebarContent: { padding: 14, gap: 4 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, marginTop: 2 },
  sideHeading: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 6, marginStart: 4 },
  groupRow: { minHeight: 40, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupDot: { width: 9, height: 9, borderRadius: 5 },
  groupName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  groupCount: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  main: { flex: 1 },
  mainContent: { padding: 16, gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { height: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  grid: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  gridHead: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 10 },
  gridHeadText: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cells: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', minHeight: 132, borderEndWidth: 1, borderBottomWidth: 1, padding: 6, gap: 4 },
  cellNum: { alignSelf: 'flex-end', fontSize: 13, fontFamily: 'Inter_600SemiBold', minWidth: 24, textAlign: 'center' },
  cellNumToday: { fontFamily: 'Inter_700Bold' },
  cellEvents: { gap: 3 },
  more: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingStart: 4 },
  block: { minHeight: 24, borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, justifyContent: 'center' },
  blockTall: { paddingVertical: 6 },
  blockLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockText: { flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'auto', writingDirection: 'auto' },
  blockTime: { fontSize: 12, fontFamily: 'Inter_700Bold', flexShrink: 0 },
  blockSub: { fontSize: 11, marginTop: 2 },
  week: { flexDirection: 'row', gap: 8 },
  weekCol: { flex: 1, minWidth: 0, minHeight: 520, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  weekHead: { paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1 },
  weekDay: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  weekNum: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 2 },
  weekEvents: { padding: 6, gap: 5 },
  weekEmpty: { textAlign: 'center', marginTop: 12 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  listDate: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderTopWidth: 1 },
  listRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  listBar: { width: 4, height: 26, borderRadius: 2 },
  listTime: { width: 80, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  listTitle: { flex: 2, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  listMeta: { flex: 1.4, fontSize: 12 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 13, textAlign: 'center', padding: 18 },
  side: { width: 330, flexGrow: 0, borderStartWidth: 1 },
  sideContent: { padding: 16, gap: 10 },
  sideTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sideTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  badge: { minWidth: 26, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  reviewCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  reviewTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  reviewMeta: { fontSize: 12, marginTop: 3 },
  reviewActions: { flexDirection: 'row', gap: 8 },
  approve: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  approveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  sendBack: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sendBackText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyDay: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', paddingBottom: 14 },
  emptyAdd: { height: 34, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyAddText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dayItem: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dayBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
