import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { NotificationsBell } from '@/components/NotificationsBell';
import { chipColors } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import {
  initialsFor,
  type CalendarEvent,
  type CalendarGroup,
  type CalendarPerson,
  type CalendarProfile,
  type OrgSummary,
} from '@/lib/calendar-context';
import {
  dateTitle,
  displayTime,
  localDateString,
  monthTitle,
  monthWeeks,
  parseLocalDate,
  shortDateTitle,
  shortStampLabel,
  weekdayLabels,
} from '@/lib/calendar-date';
import { membersOf, orderedGroups, subGroupsOf } from '@/lib/departments';
import { backIcon, dateLocale, forwardIcon, t, tn } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { useReminders } from '@/lib/reminders';
import { TeamMemberList, memberCountLabel } from '@/components/TeamMembers';

type Colors = ReturnType<typeof useColors>;
type Mode = 'month' | 'week' | 'list';

export interface DesktopCalendarProps {
  org: OrgSummary | null;
  profile: CalendarProfile | null;
  showAdmin: boolean;
  groups: CalendarGroup[];
  /** Everyone in the organization, for the member counts and lists in the sidebar. */
  people: CalendarPerson[];
  /** Opens the "Assign task" window for a member (managers only). */
  onAssign?: (person: CalendarPerson) => void;
  canAssign?: (person: CalendarPerson) => boolean;
  /** Events this person may see, already filtered by the selected team. */
  events: CalendarEvent[];
  /** Every event this person may see (for search), whatever team is selected. */
  allEvents?: CalendarEvent[];
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

function weekStart(dateKey: string): Date {
  const d = parseLocalDate(dateKey) ?? new Date();
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start;
}

/** "45 min", "1 hr", "1 hr 30 min" from two "HH:MM" times. */
function durationLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return '';
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const mins = toMin(end) - toMin(start);
  if (!(mins > 0)) return '';
  if (mins < 60) return t('{n} min', { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? t('{h} hr {m} min', { h, m }) : t('{n} hr', { n: h });
}

/** Soft card shadow for the floating panels. */
function panelShadow(colors: Colors) {
  return { boxShadow: `0 10px 28px ${colors.shadow}` } as object;
}

export function DesktopCalendar(props: DesktopCalendarProps) {
  const colors = useColors();
  const { setThemeMode } = usePreferences();
  const { reminders } = useReminders();
  // personal reminders whose time has come and are not ticked off yet
  const dueReminders = reminders.filter((r) => !r.done_at && new Date(r.remind_at).getTime() <= Date.now()).length;
  const [mode, setMode] = useState<Mode>('month');
  const {
    org, profile, showAdmin, groups, people, onAssign, canAssign, events, allEvents, groupFilter, setGroupFilter, cursor, setCursor,
    selectedDate, setSelectedDate, reviewQueue, approvalsOn, busy, banner,
    onNewEvent, onOpenEvent, onApprove, onSendBack, onBellOpen, eventColor, groupName, personName,
  } = props;
  const today = localDateString();
  const dark = colors.scheme === 'dark';
  // Departments (and sub-groups whose department this person cannot see) at the top level.
  const topGroups = useMemo(() => {
    const ids = new Set(groups.map((g) => g.id));
    return orderedGroups(groups).filter((g) => !g.parent_id || !ids.has(g.parent_id));
  }, [groups]);

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
  const openFromSearch = (e: CalendarEvent) => {
    const d = parseLocalDate(e.date);
    if (d) pickDay(d);
    onOpenEvent(e);
  };

  const rangeTitle =
    mode === 'week'
      ? `${shortDateTitle(localDateString(weekDays[0]))} – ${shortDateTitle(localDateString(weekDays[6]))}`
      : monthTitle(cursor);

  const selectedEvents = byDate.get(selectedDate) ?? [];
  const selected = parseLocalDate(selectedDate) ?? new Date();
  const selectedWeekday = new Intl.DateTimeFormat(dateLocale(), { weekday: 'long' }).format(selected);
  const selectedShort = new Intl.DateTimeFormat(dateLocale(), { month: 'short', day: 'numeric' }).format(selected);

  const myDept = profile?.group_id ? groupName(profile.group_id) : '';
  const personOf = (id?: string | null) => (id ? people.find((p) => p.id === id) : undefined);
  const colorOfPerson = (p?: CalendarPerson) =>
    groups.find((g) => g.id === p?.group_id)?.color || colors.highlight;
  const attendees = (e: CalendarEvent) => {
    const ids = [e.created_by, e.assigned_to].filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
    return ids.map(personOf).filter((p): p is CalendarPerson => !!p);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Top bar: a floating card */}
      <View style={[styles.topbar, { backgroundColor: colors.card, borderColor: colors.border }, panelShadow(colors)]}>
        <View style={styles.brand}>
          <BrandMark name={org?.name} logoUrl={org?.logo_url} size={42} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={[styles.orgName, { color: colors.foreground }]}>
              {org?.name ? t('{name} Calendar', { name: org.name }) : t('Calendar')}
            </Text>
            {myDept ? (
              <Text numberOfLines={1} style={[styles.orgCaption, { color: colors.mutedForeground }]}>{myDept}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.nav}>
          <Pressable onPress={() => go(-1)} style={[styles.navBtn, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={mode === 'week' ? t('Previous week') : t('Previous month')}>
            <Feather name={backIcon()} size={18} color={colors.secondaryForeground} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.range, { color: colors.foreground }]}>{rangeTitle}</Text>
          <Pressable onPress={() => go(1)} style={[styles.navBtn, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={mode === 'week' ? t('Next week') : t('Next month')}>
            <Feather name={forwardIcon()} size={18} color={colors.secondaryForeground} />
          </Pressable>
          <Pressable onPress={goToday} style={[styles.todayBtn, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button">
            <Text style={[styles.todayText, { color: colors.foreground }]}>{t('Today')}</Text>
          </Pressable>
        </View>

        <SearchBox
          colors={colors}
          events={allEvents ?? events}
          people={people}
          groups={groups}
          groupName={groupName}
          eventColor={eventColor}
          onOpenEvent={openFromSearch}
          onPickGroup={(id) => setGroupFilter(id)}
          onPickPerson={(p) => {
            if (onAssign && canAssign?.(p)) onAssign(p);
            else if (p.group_id) setGroupFilter(p.group_id);
          }}
          canAssign={canAssign}
        />

        <View style={[styles.segment, { backgroundColor: colors.segment }]}>
          {(['month', 'week', 'list'] as const).map((m) => (
            <Pressable
              key={m}
              testID={`desk-view-${m}`}
              onPress={() => setMode(m)}
              style={[styles.segItem, mode === m && { backgroundColor: colors.segmentActive }]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.segText, { color: mode === m ? colors.segmentActiveForeground : colors.secondaryForeground }]}>
                {m === 'month' ? t('Month') : m === 'week' ? t('Week') : t('List')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable testID="new-event" onPress={onNewEvent} style={({ pressed }) => [styles.newBtnWrap, { opacity: pressed ? 0.88 : 1 }]} accessibilityRole="button">
          <LinearGradient colors={[colors.cta, colors.ctaEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.newBtn, { boxShadow: '0 6px 16px rgba(232,137,15,0.28)' } as object]}>
            <Feather name="plus" size={17} color={colors.ctaForeground} />
            <Text style={[styles.newText, { color: colors.ctaForeground }]}>{t('New event')}</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.actions}>
          <NotificationsBell onOpenEvent={onBellOpen} />
          <Pressable
            testID="open-reminders"
            onPress={() => router.push('/reminders' as Href)}
            style={[styles.iconBtn, { backgroundColor: colors.iconSurface }]}
            accessibilityRole="button"
            accessibilityLabel={t('My reminders')}
            {...({ title: t('My reminders') } as object)}
          >
            <Feather name="clock" size={18} color={colors.secondaryForeground} />
            {dueReminders ? (
              <View style={[styles.reminderBadge, { backgroundColor: colors.today, borderColor: colors.card }]}>
                <Text style={styles.reminderBadgeText}>{dueReminders > 9 ? '9+' : dueReminders}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setThemeMode(dark ? 'light' : 'dark')}
            style={[styles.iconBtn, { backgroundColor: colors.iconSurface }]}
            accessibilityRole="button"
            accessibilityLabel={dark ? t('Light') : t('Dark')}
          >
            <Feather name={dark ? 'sun' : 'moon'} size={18} color={colors.secondaryForeground} />
          </Pressable>
          {showAdmin ? (
            <Pressable onPress={() => router.push('/admin' as Href)} style={[styles.iconBtn, { backgroundColor: colors.iconSurface }]} accessibilityRole="button" accessibilityLabel={t('Admin')}>
              <Feather name="sliders" size={18} color={colors.secondaryForeground} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={[styles.avatar, { backgroundColor: colors.highlight, boxShadow: `0 0 0 3px ${dark ? 'rgba(92,195,236,0.25)' : 'rgba(31,127,174,0.18)'}` } as object]}
            accessibilityRole="button"
            accessibilityLabel={t('Open profile')}
          >
            <Text style={[styles.avatarText, { color: colors.highlightForeground }]}>{profile?.initials || initialsFor(profile?.full_name)}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {/* Left panel */}
        <ScrollView style={[styles.sidebar, { backgroundColor: colors.card, borderColor: colors.border }, panelShadow(colors)]} contentContainerStyle={styles.sidebarContent}>
          <View style={styles.statRow}>
            {[
              { n: monthEvents.length, label: t('Events'), color: colors.highlight },
              { n: sharedCount, label: t('Shared'), color: colors.foreground },
              { n: pendingCount, label: t('Pending'), color: colors.todayText },
            ].map((s) => (
              <View key={s.label} style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.statSurface }]}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.n}</Text>
                <Text numberOfLines={1} style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          <MiniMonth colors={colors} cursor={cursor} setCursor={setCursor} selectedDate={selectedDate} byDate={byDate} onPick={pickDay} />

          <Text style={[styles.sideHeading, { color: colors.mutedForeground }]}>{t('Departments').toUpperCase()}</Text>
          <Pressable
            onPress={() => setGroupFilter(null)}
            style={[styles.groupRow, groupFilter === null && { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityState={{ selected: groupFilter === null }}
          >
            <Feather name="grid" size={14} color={colors.highlight} />
            <Text numberOfLines={1} style={[styles.groupName, { color: colors.foreground }]}>{t('All departments')}</Text>
          </Pressable>
          {topGroups.map((dept) => {
            const subs = subGroupsOf(groups, dept.id);
            const deptSelected = groupFilter === dept.id;
            const open = deptSelected || subs.some((sub) => sub.id === groupFilter);
            const total = membersOf(people, groups, dept.id, true).length;
            const deptColor = dept.color || colors.highlight;
            return (
              <View key={dept.id} style={[styles.deptBlock, open && { backgroundColor: colors.accent }]}>
                <Pressable
                  onPress={() => setGroupFilter(deptSelected ? null : dept.id)}
                  style={styles.groupRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected: deptSelected, expanded: open }}
                  accessibilityLabel={`${dept.name}, ${memberCountLabel(total)}`}
                >
                  <View style={[styles.groupDot, { backgroundColor: deptColor }]} />
                  <Text numberOfLines={1} style={[styles.groupName, { color: colors.foreground }]}>{dept.name}</Text>
                  <View style={[styles.countPill, { backgroundColor: open ? colors.card : colors.statSurface }]}>
                    <Text style={[styles.countText, { color: colors.secondaryForeground }]}>{total}</Text>
                  </View>
                </Pressable>
                {open ? (
                  <View style={styles.subTree}>
                    {subs.map((sub) => {
                      const subOpen = groupFilter === sub.id;
                      const subMembers = membersOf(people, groups, sub.id);
                      const subColor = sub.color || deptColor;
                      return (
                        <View key={sub.id}>
                          <Pressable
                            onPress={() => setGroupFilter(subOpen ? dept.id : sub.id)}
                            style={[styles.groupRow, styles.subRow, subOpen && { backgroundColor: colors.card }]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: subOpen, expanded: subOpen }}
                            accessibilityLabel={`${sub.name}, ${memberCountLabel(subMembers.length)}`}
                          >
                            <View style={[styles.subDot, { borderColor: subColor }]} />
                            <Text numberOfLines={1} style={[styles.subName, { color: colors.foreground }]}>{sub.name}</Text>
                            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{subMembers.length}</Text>
                          </Pressable>
                          {subOpen ? (
                            <TeamMemberList members={subMembers} groups={groups} color={subColor} colors={colors} compact onAssign={onAssign} canAssign={canAssign} />
                          ) : null}
                        </View>
                      );
                    })}
                    {deptSelected ? (
                      <TeamMemberList
                        members={membersOf(people, groups, dept.id)}
                        groups={groups}
                        color={deptColor}
                        colors={colors}
                        compact
                        onAssign={onAssign}
                        canAssign={canAssign}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {/* Main panel */}
        <ScrollView style={[styles.main, { backgroundColor: colors.card, borderColor: colors.border }, panelShadow(colors)]} contentContainerStyle={styles.mainContent}>
          {banner}
          {groupFilter || reviewQueue.length > 0 ? (
            <View style={styles.chipRow}>
              {groupFilter ? (
                <Pressable onPress={() => setGroupFilter(null)} style={[styles.chip, { borderColor: colors.highlight, backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel={t('All departments')}>
                  <Feather name="filter" size={13} color={colors.accentForeground} />
                  <Text style={[styles.chipText, { color: colors.accentForeground }]}>{groupName(groupFilter)}</Text>
                  <Feather name="x" size={13} color={colors.accentForeground} />
                </Pressable>
              ) : null}
              {reviewQueue.length > 0 ? (
                <View style={[styles.chip, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
                  <Feather name="clock" size={13} color={colors.warning} />
                  <Text style={[styles.chipText, { color: colors.warning }]}>{tn(reviewQueue.length, '{n} waiting for approval', '{n} waiting for approval')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {mode === 'month' ? (
            <View style={styles.monthWrap}>
              <View style={styles.gridHead}>
                {shortWeekday.map((d, i) => (
                  <Text key={`${d}-${i}`} style={[styles.gridHeadText, { color: colors.mutedForeground }]}>{d.toUpperCase()}</Text>
                ))}
              </View>
              <View style={styles.cells}>
                {monthWeeks(cursor).map((date) => {
                  const key = localDateString(date);
                  const list = byDate.get(key) ?? [];
                  const other = date.getMonth() !== cursor.getMonth();
                  const isToday = key === today;
                  const isSelected = key === selectedDate && !isToday;
                  return (
                    <View key={key} style={styles.cellSlot}>
                      <Pressable
                        testID={`calendar-day-${key}`}
                        onPress={() => pickDay(date)}
                        style={[
                          styles.cell,
                          { borderColor: colors.tileBorder, backgroundColor: other ? colors.tileMuted : colors.tile },
                          isSelected && { borderColor: colors.highlight, borderWidth: 1.5, backgroundColor: colors.accent },
                          isToday && { borderColor: colors.today, borderWidth: 1.5, backgroundColor: colors.todaySurface, boxShadow: `0 0 0 3px ${dark ? 'rgba(242,154,46,0.16)' : 'rgba(232,137,15,0.12)'}` } as object,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: key === selectedDate }}
                        accessibilityLabel={`${dateTitle(key)}${list.length ? `, ${tn(list.length, '{n} event', '{n} events')}` : ''}`}
                      >
                        <View style={[styles.cellNum, isToday && { backgroundColor: colors.today }]}>
                          <Text style={[styles.cellNumText, { color: isToday ? '#FFFFFF' : other ? colors.faint : colors.foreground }]}>
                            {date.getDate()}
                          </Text>
                        </View>
                        <View style={styles.cellEvents}>
                          {list.slice(0, list.length > 3 ? 2 : 3).map((e) => (
                            <EventChip key={e.id} event={e} color={eventColor(e)} colors={colors} onPress={() => onOpenEvent(e)} />
                          ))}
                          {list.length > 3 ? (
                            <Text style={[styles.more, { color: colors.mutedForeground }]}>{t('+{n} more', { n: list.length - 2 })}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    </View>
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
                    style={[
                      styles.weekCol,
                      { borderColor: colors.tileBorder, backgroundColor: colors.tile },
                      isToday && { borderColor: colors.today, borderWidth: 1.5, backgroundColor: colors.todaySurface },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={dateTitle(key)}
                  >
                    <View style={[styles.weekHead, { borderBottomColor: colors.tileBorder }]}>
                      <Text style={[styles.weekDay, { color: colors.mutedForeground }]}>{shortWeekday[i].toUpperCase()}</Text>
                      <View style={[styles.weekNum, isToday && { backgroundColor: colors.today }]}>
                        <Text style={[styles.weekNumText, { color: isToday ? '#FFFFFF' : colors.foreground }]}>{date.getDate()}</Text>
                      </View>
                    </View>
                    <View style={styles.weekEvents}>
                      {list.map((e) => (
                        <EventChip key={e.id} event={e} color={eventColor(e)} colors={colors} tall onPress={() => onOpenEvent(e)} subtitle={personName(e)} />
                      ))}
                      {list.length === 0 ? <Text style={[styles.weekEmpty, { color: colors.faint }]}>—</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.list, { borderColor: colors.tileBorder }]}>
              {monthEvents.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('No events this month.')}</Text>
              ) : (
                monthEvents.map((e, i) => {
                  const showDate = i === 0 || monthEvents[i - 1].date !== e.date;
                  const chip = chipColors(eventColor(e), colors.scheme);
                  return (
                    <View key={e.id}>
                      {showDate ? (
                        <Text style={[styles.listDate, { color: e.date === today ? colors.todayText : colors.mutedForeground, borderTopColor: colors.tileBorder }, i === 0 && { borderTopWidth: 0 }]}>
                          {dateTitle(e.date).toUpperCase()}
                        </Text>
                      ) : null}
                      <Pressable onPress={() => onOpenEvent(e)} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.accent }]} accessibilityRole="button">
                        <View style={[styles.listBar, { backgroundColor: chip.bar }]} />
                        <Text style={[styles.listTime, { color: colors.secondaryForeground }]}>{e.time_start ? displayTime(e.time_start) : t('All day')}</Text>
                        <Text numberOfLines={1} style={[styles.listTitle, { color: colors.foreground }]}>{e.title}</Text>
                        <Text numberOfLines={1} style={[styles.listMeta, { color: colors.mutedForeground }]}>
                          {groupName(e.group_id)} · {personName(e)}
                          {e.created_at ? ` · ${t('Added {when}', { when: shortStampLabel(e.created_at) })}` : ''}
                        </Text>
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

        {/* Right panel: the selected day as a timeline */}
        <ScrollView style={[styles.side, { backgroundColor: colors.card, borderColor: colors.border }, panelShadow(colors)]} contentContainerStyle={styles.sideContent}>
          {reviewQueue.length > 0 ? (
            <View style={styles.reviewBlock}>
              <View style={styles.sideTitleRow}>
                <Text style={[styles.sideTitle, { color: colors.secondaryForeground }]}>{t('Waiting for you')}</Text>
                <View style={[styles.badge, { backgroundColor: colors.warningSurface }]}>
                  <Text style={[styles.badgeText, { color: colors.warning }]}>{reviewQueue.length}</Text>
                </View>
              </View>
              {reviewQueue.map((e) => (
                <View key={e.id} style={[styles.reviewCard, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
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
            </View>
          ) : null}

          <Text style={[styles.dayKicker, { color: colors.todayText }]}>{selectedWeekday.toUpperCase()}</Text>
          <Text style={[styles.dayBig, { color: colors.foreground }]}>{selectedShort}</Text>
          <Text style={[styles.dayCount, { color: colors.mutedForeground }]}>
            {tn(selectedEvents.length, '{n} event scheduled', '{n} events scheduled')}
          </Text>

          {selectedEvents.length === 0 ? (
            <View style={[styles.emptyDay, { borderColor: colors.border }]}>
              <Feather name="sun" size={20} color={colors.faint} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('Nothing planned for this day.')}</Text>
              <Pressable onPress={onNewEvent} style={[styles.emptyAdd, { borderColor: colors.highlight }]} accessibilityRole="button">
                <Feather name="plus" size={14} color={colors.highlight} />
                <Text style={[styles.emptyAddText, { color: colors.highlight }]}>{t('Add event')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.timeline}>
              {[...selectedEvents]
                .sort((a, b) => (a.time_start ?? '').localeCompare(b.time_start ?? ''))
                .map((e) => {
                  const people = attendees(e);
                  const dur = durationLabel(e.time_start, e.time_end);
                  const waiting = e.status !== 'approved';
                  return (
                    <View key={e.id} style={styles.tlRow}>
                      <Text style={[styles.tlTime, { color: colors.secondaryForeground }]}>
                        {e.time_start ? displayTime(e.time_start) : t('All day')}
                      </Text>
                      <Pressable
                        onPress={() => onOpenEvent(e)}
                        style={({ pressed }) => [
                          styles.tlCard,
                          { backgroundColor: dark ? colors.muted : colors.card, borderColor: colors.border, borderStartColor: eventColor(e) },
                          waiting && { borderStyle: 'dashed' },
                          pressed && { opacity: 0.85 },
                        ]}
                        accessibilityRole="button"
                      >
                        <Text numberOfLines={2} style={[styles.tlTitle, { color: colors.foreground }]}>{e.title}</Text>
                        <Text numberOfLines={1} style={[styles.tlMeta, { color: colors.mutedForeground }]}>
                          {[groupName(e.group_id), dur].filter(Boolean).join(' · ')}
                          {waiting ? ` · ${t('Pending')}` : ''}
                        </Text>
                        <View style={styles.tlFoot}>
                          <View style={styles.avatars}>
                            {people.map((p, i) => (
                              <View key={p.id} style={[styles.miniAvatar, { backgroundColor: colorOfPerson(p), borderColor: dark ? colors.muted : colors.card }, i > 0 && { marginStart: -7 }]}>
                                <Text style={styles.miniAvatarText}>{p.initials || initialsFor(p.full_name)}</Text>
                              </View>
                            ))}
                          </View>
                          {e.created_at ? (
                            <Text numberOfLines={1} style={[styles.tlAdded, { color: colors.mutedForeground }]}>
                              {t('Added {when}', { when: shortStampLabel(e.created_at) })}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/** Small month in the sidebar for jumping to any day. */
function MiniMonth({
  colors,
  cursor,
  setCursor,
  selectedDate,
  byDate,
  onPick,
}: {
  colors: Colors;
  cursor: Date;
  setCursor: (d: Date) => void;
  selectedDate: string;
  byDate: Map<string, CalendarEvent[]>;
  onPick: (d: Date) => void;
}) {
  const today = localDateString();
  const labels = weekdayLabels();
  return (
    <View style={styles.mini}>
      <View style={styles.miniHead}>
        <Text style={[styles.miniTitle, { color: colors.foreground }]}>{monthTitle(cursor)}</Text>
        <View style={styles.miniNav}>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('Previous month')}>
            <Feather name={backIcon()} size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('Next month')}>
            <Feather name={forwardIcon()} size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      <View style={styles.miniGrid}>
        {labels.map((l, i) => (
          <Text key={`h${i}`} style={[styles.miniLabel, { color: colors.mutedForeground }]}>{l}</Text>
        ))}
        {monthWeeks(cursor).map((d) => {
          const key = localDateString(d);
          const other = d.getMonth() !== cursor.getMonth();
          const isToday = key === today;
          const isSel = key === selectedDate && !isToday;
          const has = (byDate.get(key)?.length ?? 0) > 0;
          return (
            <Pressable key={key} onPress={() => onPick(d)} style={styles.miniCell} accessibilityRole="button" accessibilityLabel={dateTitle(key)}>
              <View style={[styles.miniDay, isToday && { backgroundColor: colors.today }, isSel && { backgroundColor: colors.accent }]}>
                <Text style={[styles.miniDayText, { color: isToday ? '#FFFFFF' : isSel ? colors.accentForeground : other ? colors.faint : colors.secondaryForeground }, (isToday || isSel) && { fontFamily: 'Inter_700Bold' }]}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={[styles.miniDot, { backgroundColor: has && !other ? colors.highlight : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Header search: events, people and departments. */
function SearchBox({
  colors,
  events,
  people,
  groups,
  groupName,
  eventColor,
  onOpenEvent,
  onPickGroup,
  onPickPerson,
  canAssign,
}: {
  colors: Colors;
  events: CalendarEvent[];
  people: CalendarPerson[];
  groups: CalendarGroup[];
  groupName: (id: string) => string;
  eventColor: (e: CalendarEvent) => string;
  onOpenEvent: (e: CalendarEvent) => void;
  onPickGroup: (id: string) => void;
  onPickPerson: (p: CalendarPerson) => void;
  canAssign?: (p: CalendarPerson) => boolean;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length < 2) return null;
    const hit = (s?: string | null) => !!s && s.toLowerCase().includes(query);
    const today = localDateString();
    return {
      events: events
        .filter((e) => hit(e.title) || hit(e.notes))
        .sort((a, b) => {
          // upcoming first, then the most recent past ones
          const fa = a.date >= today;
          const fb = b.date >= today;
          if (fa !== fb) return fa ? -1 : 1;
          return fa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
        })
        .slice(0, 5),
      people: people.filter((p) => p.is_active && (hit(p.full_name) || hit(p.email) || hit(p.title))).slice(0, 5),
      groups: groups.filter((g) => hit(g.name)).slice(0, 4),
    };
  }, [query, events, people, groups]);
  const empty = results && !results.events.length && !results.people.length && !results.groups.length;
  const done = () => {
    setQ('');
    setFocused(false);
  };

  return (
    <View style={styles.searchWrap}>
      <View style={[styles.search, { backgroundColor: colors.secondary, borderColor: focused ? colors.highlight : colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          testID="desk-search"
          value={q}
          onChangeText={setQ}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyPress={(e) => {
            if ((e.nativeEvent as { key?: string }).key === 'Escape') done();
          }}
          placeholder={t('Search events, people, departments…')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={t('Search')}
          style={[styles.searchInput, { color: colors.foreground }, { outlineStyle: 'none' } as object]}
        />
        {q ? (
          <Pressable onPress={done} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Clear')}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {focused && results ? (
        <View style={[styles.results, { backgroundColor: colors.card, borderColor: colors.border, boxShadow: `0 18px 40px ${colors.shadow}` } as object]}>
          {empty ? <Text style={[styles.resultEmpty, { color: colors.mutedForeground }]}>{t('Nothing found for “{q}”.', { q: q.trim() })}</Text> : null}
          {results.events.length ? <Text style={[styles.resultHead, { color: colors.mutedForeground }]}>{t('Events').toUpperCase()}</Text> : null}
          {results.events.map((e) => (
            <Pressable key={e.id} testID={`search-event-${e.id}`} onPress={() => { onOpenEvent(e); done(); }} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.accent }]} accessibilityRole="button">
              <View style={[styles.resultBar, { backgroundColor: eventColor(e) }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.foreground }]}>{e.title}</Text>
                <Text numberOfLines={1} style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                  {shortDateTitle(e.date)}{e.time_start ? ` · ${displayTime(e.time_start)}` : ''} · {groupName(e.group_id)}
                </Text>
              </View>
            </Pressable>
          ))}
          {results.people.length ? <Text style={[styles.resultHead, { color: colors.mutedForeground }]}>{t('People').toUpperCase()}</Text> : null}
          {results.people.map((p) => {
            const color = groups.find((g) => g.id === p.group_id)?.color || colors.highlight;
            return (
              <Pressable key={p.id} onPress={() => { onPickPerson(p); done(); }} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.accent }]} accessibilityRole="button">
                <View style={[styles.miniAvatar, { backgroundColor: color, borderColor: colors.card }]}>
                  <Text style={styles.miniAvatarText}>{p.initials || initialsFor(p.full_name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.foreground }]}>{p.full_name}</Text>
                  <Text numberOfLines={1} style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                    {p.group_id ? groupName(p.group_id) : t('No department')}{canAssign?.(p) ? ` · ${t('Assign a task')}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {results.groups.length ? <Text style={[styles.resultHead, { color: colors.mutedForeground }]}>{t('Departments').toUpperCase()}</Text> : null}
          {results.groups.map((g) => (
            <Pressable key={g.id} onPress={() => { onPickGroup(g.id); done(); }} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.accent }]} accessibilityRole="button">
              <View style={[styles.groupDot, { backgroundColor: g.color || colors.highlight }]} />
              <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.foreground, flex: 1 }]}>{groupName(g.id)}</Text>
              <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>{t('Show calendar')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** An event inside a day tile: tinted in its color, with a colored edge. Waiting ones are dashed. */
function EventChip({
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
  const chip = chipColors(color, colors.scheme);
  const time = event.time_start ? displayTime(event.time_start) : '';
  return (
    <Pressable
      onPress={(ev) => {
        ev.stopPropagation?.();
        onPress();
      }}
      style={({ pressed }) => [
        styles.block,
        tall && styles.blockTall,
        { backgroundColor: chip.background, borderStartColor: chip.bar },
        waiting && { borderColor: event.status === 'rejected' ? colors.destructive : chip.bar, borderStyle: 'dashed', borderWidth: 1, borderStartWidth: 3, backgroundColor: 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}${waiting ? `, ${t('Pending')}` : ''}`}
    >
      <View style={styles.blockLine}>
        {waiting ? <Feather name="clock" size={10} color={colors.mutedForeground} /> : null}
        {time && tall ? <Text numberOfLines={1} style={[styles.blockTime, { color: chip.text }]}>{time}</Text> : null}
        <Text numberOfLines={1} style={[styles.blockText, { color: waiting ? colors.foreground : chip.text }]}>{event.title}</Text>
      </View>
      {tall && subtitle ? (
        <Text numberOfLines={1} style={[styles.blockSub, { color: colors.mutedForeground }]}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 16 },
  topbar: { minHeight: 70, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12, zIndex: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: 230, flexShrink: 1 },
  orgName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  orgCaption: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  range: { minWidth: 150, textAlign: 'center', fontSize: 18, fontFamily: 'Inter_700Bold' },
  todayBtn: { height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginStart: 2 },
  todayText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  searchWrap: { flex: 1, minWidth: 200, maxWidth: 420, position: 'relative', zIndex: 30 },
  search: { height: 40, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, height: 38, fontSize: 13, fontFamily: 'Inter_400Regular' },
  results: { position: 'absolute', top: 46, left: 0, right: 0, borderRadius: 14, borderWidth: 1, padding: 8, gap: 2, maxHeight: 440, overflow: 'hidden' },
  resultHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  resultRow: { minHeight: 44, borderRadius: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultBar: { width: 4, height: 28, borderRadius: 2 },
  resultTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  resultMeta: { fontSize: 11.5, fontFamily: 'Inter_400Regular', marginTop: 1 },
  resultEmpty: { fontSize: 13, padding: 12, textAlign: 'center' },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 2 },
  segItem: { height: 32, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  newBtnWrap: { borderRadius: 12 },
  newBtn: { height: 42, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  newText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reminderBadge: { position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  reminderBadgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginStart: 4 },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  body: { flex: 1, flexDirection: 'row', minHeight: 0, gap: 16 },
  sidebar: { width: 256, flexGrow: 0, borderRadius: 20, borderWidth: 1 },
  sidebarContent: { padding: 16, gap: 4 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  mini: { marginBottom: 16 },
  miniHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2 },
  miniTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  miniNav: { flexDirection: 'row', gap: 10 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniLabel: { width: '14.2857%', textAlign: 'center', fontSize: 10, fontFamily: 'Inter_700Bold', paddingVertical: 3 },
  miniCell: { width: '14.2857%', alignItems: 'center', paddingVertical: 1 },
  miniDay: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  miniDayText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  miniDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  sideHeading: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 6, marginStart: 4 },
  deptBlock: { borderRadius: 12 },
  groupRow: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupDot: { width: 10, height: 10, borderRadius: 3 },
  groupName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  countPill: { minWidth: 24, height: 20, borderRadius: 10, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  subTree: { paddingStart: 14, paddingBottom: 6, paddingEnd: 4 },
  subRow: { minHeight: 34, borderRadius: 10 },
  subDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2 },
  subName: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  main: { flex: 1, borderRadius: 20, borderWidth: 1 },
  mainContent: { padding: 14, gap: 10, flexGrow: 1 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { height: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  monthWrap: { flex: 1, gap: 8 },
  gridHead: { flexDirection: 'row' },
  gridHeadText: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  cells: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cellSlot: { width: '14.2857%', padding: 3 },
  cell: { flex: 1, minHeight: 112, borderRadius: 14, borderWidth: 1, padding: 6, gap: 4 },
  cellNum: { alignSelf: 'flex-start', minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cellNumText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  cellEvents: { gap: 4 },
  more: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingStart: 4 },
  block: { minHeight: 22, borderRadius: 7, borderStartWidth: 3, paddingHorizontal: 6, paddingVertical: 3, justifyContent: 'center' },
  blockTall: { paddingVertical: 7 },
  blockLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  blockText: { flex: 1, minWidth: 0, fontSize: 11.5, fontFamily: 'Inter_600SemiBold', textAlign: 'auto', writingDirection: 'auto' },
  blockTime: { fontSize: 11.5, fontFamily: 'Inter_700Bold', flexShrink: 0 },
  blockSub: { fontSize: 11, marginTop: 2 },
  week: { flexDirection: 'row', gap: 8, flex: 1 },
  weekCol: { flex: 1, minWidth: 0, minHeight: 520, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  weekHead: { paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, gap: 4 },
  weekDay: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  weekNum: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  weekNumText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  weekEvents: { padding: 6, gap: 6 },
  weekEmpty: { textAlign: 'center', marginTop: 12 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  listDate: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderTopWidth: 1 },
  listRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  listBar: { width: 4, height: 26, borderRadius: 2 },
  listTime: { width: 80, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  listTitle: { flex: 2, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  listMeta: { flex: 1.4, fontSize: 12 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 18, paddingVertical: 6 },
  side: { width: 300, flexGrow: 0, borderRadius: 20, borderWidth: 1 },
  sideContent: { padding: 20, gap: 4 },
  reviewBlock: { gap: 10, marginBottom: 18 },
  sideTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  dayKicker: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  dayBig: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  dayCount: { fontSize: 13, marginBottom: 16 },
  emptyDay: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, alignItems: 'center', paddingVertical: 18, gap: 6 },
  emptyAdd: { height: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  emptyAddText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  timeline: { gap: 12 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlTime: { width: 58, paddingTop: 12, fontSize: 12, fontFamily: 'Inter_700Bold' },
  tlCard: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, borderStartWidth: 4, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  tlTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', lineHeight: 19 },
  tlMeta: { fontSize: 12 },
  tlFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  avatars: { flexDirection: 'row' },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
  tlAdded: { flex: 1, fontSize: 11 },
});
