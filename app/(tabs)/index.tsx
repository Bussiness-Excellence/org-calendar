import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { DesktopCalendar } from '@/components/DesktopCalendar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  canEditEvent,
  canManageGroup,
  initialsFor,
  isSuperAdmin,
  useCalendar,
  type CalendarEvent,
  type EventDraft,
} from '@/lib/calendar-context';
import {
  dateTitle,
  displayTime,
  localDateString,
  monthGrid,
  monthTitle,
  parseLocalDate,
  shortDateTitle,
  weekdayLabels,
} from '@/lib/calendar-date';
import { eventPalette } from '@/constants/colors';
import { arrowForward, backIcon, forwardIcon, t, tn } from '@/lib/i18n';

type CalendarView = 'month' | 'schedule';

const emptyDraft = (date: string, groupId: string, color: string): EventDraft => ({
  title: '',
  date,
  notes: '',
  group_id: groupId,
  visibility: 'private',
  color,
  time_start: '',
  time_end: '',
  assigned_to: '',
});

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    userId,
    profile,
    org,
    approvalsOn,
    groups,
    people,
    events,
    dataLoading,
    dataError,
    refresh,
    saveEvent,
    deleteEvent,
    reviewEvent,
  } = useCalendar();
  const [cursor, setCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateString());
  const [view, setView] = useState<CalendarView>('month');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [eventVisible, setEventVisible] = useState<boolean>(false);
  const [targetEvent, setTargetEvent] = useState<CalendarEvent | null>(null);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [draft, setDraft] = useState<EventDraft>(() =>
    emptyDraft(localDateString(), profile?.group_id ?? '', eventPalette[0]),
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);
  const [rejectTarget, setRejectTarget] = useState<CalendarEvent | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectBusy, setRejectBusy] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string>('');

  const elevated = isSuperAdmin(profile);
  const dates = useMemo(() => monthGrid(cursor), [cursor]);
  const today = localDateString();
  const visibleEvents = useMemo(
    () =>
      events
        // The database already returns only what this person may see.
        .filter((event) => !groupFilter || event.group_id === groupFilter)
        .slice()
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (a.time_start ?? '99:99').localeCompare(b.time_start ?? '99:99'),
        ),
    [events, groupFilter],
  );
  const selectedEvents = visibleEvents.filter((event) => event.date === selectedDate);
  const monthEvents = visibleEvents.filter((event) => {
    const date = parseLocalDate(event.date);
    return !!date &&
      date.getFullYear() === cursor.getFullYear() &&
      date.getMonth() === cursor.getMonth();
  });
  const reviewQueue = events.filter(
    (event) =>
      event.status === 'pending' &&
      event.created_by !== userId &&
      canManageGroup(profile, event.group_id),
  );
  const groupOptions = elevated
    ? groups
    : groups.filter((group) => group.id === profile?.group_id);

  const changeMonth = (delta: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
    const selected = parseLocalDate(selectedDate);
    if (!selected || selected.getMonth() !== next.getMonth() || selected.getFullYear() !== next.getFullYear()) {
      const firstDay = new Date(next.getFullYear(), next.getMonth(), 1);
      setSelectedDate(localDateString(firstDay));
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(localDateString(now));
  };

  const selectDay = (date: Date) => {
    void Haptics.selectionAsync();
    setSelectedDate(localDateString(date));
    if (date.getMonth() !== cursor.getMonth() || date.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const openNewEvent = () => {
    if (!groupOptions.length) {
      setNotice(
        elevated
          ? t('Create your first team in Admin, then add events.')
          : t('You are not in a team yet. Ask your calendar admin to add you to one.'),
      );
      return;
    }
    const groupId =
      (elevated ? groupFilter : profile?.group_id) ??
      profile?.group_id ??
      groupOptions[0]?.id ??
      '';
    setTargetEvent(null);
    setDraft(emptyDraft(selectedDate, groupId, eventPalette[0]));
    setEditMode(true);
    setFormError('');
    setDeleteConfirm(false);
    setEventVisible(true);
  };

  const openEvent = (event: CalendarEvent) => {
    setTargetEvent(event);
    setDraft({
      title: event.title,
      date: event.date,
      notes: event.notes ?? '',
      group_id: event.group_id,
      visibility: event.visibility ?? 'private',
      color: event.color ?? groupColor(event.group_id),
      time_start: event.time_start?.slice(0, 5) ?? '',
      time_end: event.time_end?.slice(0, 5) ?? '',
      assigned_to: event.assigned_to ?? '',
    });
    setEditMode(false);
    setFormError('');
    setDeleteConfirm(false);
    setEventVisible(true);
  };

  const setDraftField = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submitEvent = async () => {
    const title = draft.title.trim();
    if (!title) {
      setFormError(t('Give the event a name.'));
      return;
    }
    if (!draft.group_id) {
      setFormError(t('Choose a team for this event.'));
      return;
    }
    if (!parseLocalDate(draft.date)) {
      setFormError(t('Enter a valid date in YYYY-MM-DD format.'));
      return;
    }
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      (draft.time_start && !timePattern.test(draft.time_start)) ||
      (draft.time_end && !timePattern.test(draft.time_end))
    ) {
      setFormError(t('Enter times as HH:MM using a 24-hour clock.'));
      return;
    }
    if (draft.time_start && draft.time_end && draft.time_end <= draft.time_start) {
      setFormError(t('The end time has to be after the start time.'));
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const outcome = await saveEvent(targetEvent?.id ?? null, { ...draft, title });
      setEventVisible(false);
      setTargetEvent(null);
      setNotice(
        outcome === 'pending'
          ? t('Saved. Your team manager will review it before it is published.')
          : targetEvent
            ? t('Event updated.')
            : t('Event added to the calendar.'),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : t('The event could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!targetEvent) return;
    setBusy(true);
    setFormError('');
    try {
      await deleteEvent(targetEvent.id);
      setEventVisible(false);
      setTargetEvent(null);
      setDeleteConfirm(false);
      setNotice(t('Event deleted.'));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : t('The event could not be deleted.'));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (event: CalendarEvent) => {
    setBusy(true);
    setFormError('');
    try {
      await reviewEvent(event.id, true);
      setNotice(t('Event approved.'));
      if (targetEvent?.id === event.id) setEventVisible(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t('The event could not be approved.'));
    } finally {
      setBusy(false);
    }
  };

  const openReject = (event: CalendarEvent) => {
    setRejectTarget(event);
    setRejectReason('');
    setRejectError('');
    setEventVisible(false);
  };

  const sendBack = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError(t('Add a short reason before sending this back.'));
      return;
    }
    setRejectBusy(true);
    setRejectError('');
    try {
      await reviewEvent(rejectTarget.id, false, rejectReason);
      setRejectTarget(null);
      setNotice(t('Event sent back to its creator.'));
    } catch (cause) {
      setRejectError(cause instanceof Error ? cause.message : t('The event could not be sent back.'));
    } finally {
      setRejectBusy(false);
    }
  };

  const eventColor = (event: CalendarEvent) => event.color || groupColor(event.group_id);
  const groupColor = (id: string) =>
    groups.find((group) => group.id === id)?.color || eventPalette[0];
  const groupName = (id: string) =>
    groups.find((group) => group.id === id)?.name || t('Team');
  const personName = (event: CalendarEvent) =>
    people.find((person) => person.id === event.assigned_to)?.full_name ||
    people.find((person) => person.id === event.created_by)?.full_name ||
    t('Unassigned');
  const canReview = (event: CalendarEvent) =>
    event.status === 'pending' &&
    event.created_by !== userId &&
    canManageGroup(profile, event.group_id);

  const topInset = Platform.OS === 'web' ? 16 : insets.top;
  const { width: windowWidth } = useWindowDimensions();
  // Computer screens get the full-width layout; phones and tablets keep the stacked one.
  const wide = Platform.OS === 'web' && windowWidth >= 1100;
  const desktopBanner = (
    <>
      {notice ? (
        <Pressable onPress={() => setNotice('')} style={[styles.notice, { backgroundColor: colors.successSurface, borderColor: colors.success }]} accessibilityRole="alert">
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={[styles.noticeText, { color: colors.success }]}>{notice}</Text>
          <Feather name="x" size={15} color={colors.success} />
        </Pressable>
      ) : null}
      {dataError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.warningSurface }]}>
          <Text style={[styles.noticeText, { color: colors.warning }]}>{t('Calendar data could not be loaded.')}</Text>
          <Pressable onPress={() => void refresh()} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.primary }]}>{t('Retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {!dataLoading && !dataError && elevated && groups.length === 0 ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.accent }]}>
          <Feather name="flag" size={15} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.foreground }]}>{t('Start by creating your teams, then add the people who work in them.')}</Text>
          <Pressable onPress={() => router.push('/admin' as Href)} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.primary }]}>{t('Set up teams')}</Text>
          </Pressable>
        </View>
      ) : null}
      {!dataLoading && !elevated && !profile?.group_id ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.warningSurface }]}>
          <Feather name="info" size={15} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.warning }]}>{t('You are not in a team yet, so you can see events but not add them. Ask your calendar admin to add you to a team.')}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {wide ? (
        <DesktopCalendar
          org={org}
          profile={profile}
          showAdmin={elevated || !!org?.is_platform_admin}
          groups={elevated ? groups : groups.filter((group) => group.id === profile?.group_id)}
          events={visibleEvents}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          cursor={cursor}
          setCursor={setCursor}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          reviewQueue={reviewQueue}
          approvalsOn={approvalsOn}
          busy={busy}
          banner={desktopBanner}
          onNewEvent={openNewEvent}
          onOpenEvent={openEvent}
          onApprove={(event) => void approve(event)}
          onSendBack={openReject}
          onBellOpen={(eventId, date) => {
            const event = events.find((e) => e.id === eventId);
            const day = parseLocalDate(event?.date ?? date ?? '');
            if (day) {
              setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
              setSelectedDate(localDateString(day));
            }
            if (event) openEvent(event);
          }}
          eventColor={eventColor}
          groupName={groupName}
          personName={personName}
        />
      ) : (
      <ScrollView
        style={styles.page}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 10, paddingBottom: 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={dataLoading}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <BrandMark name={org?.name} logoUrl={org?.logo_url} size={38} />
            <View style={styles.brandText}>
              <Text numberOfLines={1} style={[styles.brandName, { color: colors.foreground }]}>
                {org?.name ?? t('Calendar')}
              </Text>
              <Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>{t('Calendar').toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <NotificationsBell
              onOpenEvent={(eventId, date) => {
                const event = events.find((e) => e.id === eventId);
                const day = parseLocalDate(event?.date ?? date ?? '');
                if (day) {
                  setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
                  setSelectedDate(localDateString(day));
                }
                if (event) openEvent(event);
              }}
            />
            <Pressable
              testID="new-event"
              onPress={openNewEvent}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.84 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('Add event')}
            >
              <Feather name="plus" size={21} color={colors.primaryForeground} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              style={[styles.profileButton, { backgroundColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityLabel={t('Open profile')}
            >
              <Text style={[styles.profileInitial, { color: colors.primary }]}>
                {profile?.initials || initialsFor(profile?.full_name)}
              </Text>
            </Pressable>
          </View>
        </View>

        {notice ? (
          <Pressable
            onPress={() => setNotice('')}
            style={[
              styles.notice,
              { backgroundColor: colors.successSurface, borderColor: colors.success },
            ]}
            accessibilityRole="alert"
          >
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={[styles.noticeText, { color: colors.success }]}>{notice}</Text>
            <Feather name="x" size={15} color={colors.success} />
          </Pressable>
        ) : null}

        {dataError ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.warningSurface }]}>
            <Text style={[styles.noticeText, { color: colors.warning }]}>
              {t('Calendar data could not be loaded.')}
            </Text>
            <Pressable onPress={() => void refresh()} accessibilityRole="button">
              <Text style={[styles.retryText, { color: colors.primary }]}>{t('Retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {reviewQueue.length > 0 ? (
          <View
            style={[
              styles.reviewPanel,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.reviewHeading}>
              <View style={[styles.reviewIcon, { backgroundColor: colors.warningSurface }]}>
                <Feather name="clock" size={16} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {t('Needs your review')}
                </Text>
                <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                  {tn(reviewQueue.length, '{n} event awaiting approval', '{n} events awaiting approval')}
                </Text>
              </View>
              <View style={[styles.countBadge, { backgroundColor: colors.warningSurface }]}>
                <Text style={[styles.countText, { color: colors.warning }]}>
                  {reviewQueue.length}
                </Text>
              </View>
            </View>
            {reviewQueue.slice(0, 3).map((event) => (
              <View
                key={event.id}
                style={[styles.reviewRow, { borderTopColor: colors.border }]}
              >
                <Pressable
                  style={styles.reviewEvent}
                  onPress={() => openEvent(event)}
                  accessibilityRole="button"
                >
                  <View style={[styles.eventDot, { backgroundColor: eventColor(event) }]} />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[styles.eventTitle, { color: colors.foreground }]}
                    >
                      {event.title}
                    </Text>
                    <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                      {shortDateTitle(event.date)} · {groupName(event.group_id)}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.reviewActions}>
                  <Pressable
                    onPress={() => void approve(event)}
                    disabled={busy}
                    style={[styles.approveButton, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('Approve {title}', { title: event.title })}
                  >
                    <Feather name="check" size={16} color={colors.primaryForeground} />
                  </Pressable>
                  {approvalsOn ? (
                    <Pressable
                      onPress={() => openReject(event)}
                      style={[styles.returnButton, { borderColor: colors.border }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('Send back {title}', { title: event.title })}
                    >
                      <Feather name="corner-up-left" size={15} color={colors.secondaryForeground} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {reviewQueue.length > 3 ? (
              <Text style={[styles.moreReviews, { color: colors.mutedForeground }]}>
                {t('And {n} more waiting', { n: reviewQueue.length - 3 })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {!dataLoading && !dataError && elevated && groups.length === 0 ? (
          <View style={[styles.setupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.reviewIcon, { backgroundColor: colors.accent }]}>
              <Feather name="flag" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('Welcome to {name}', { name: org?.name ?? '' })}
              </Text>
              <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                {t('Start by creating your teams, then add the people who work in them.')}
              </Text>
              <Pressable
                testID="open-admin-setup"
                onPress={() => router.push('/admin' as Href)}
                style={[styles.setupButton, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('Set up teams')}</Text>
                <Feather name={arrowForward()} size={15} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {!dataLoading && !elevated && !profile?.group_id ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.warningSurface }]}>
            <Feather name="info" size={15} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.warning }]}>
              {t('You are not in a team yet, so you can see events but not add them. Ask your calendar admin to add you to a team.')}
            </Text>
          </View>
        ) : null}

        <View style={styles.monthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {monthTitle(cursor)}
            </Text>
            <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>
              {tn(visibleEvents.length, '{n} event in view', '{n} events in view')}
            </Text>
          </View>
          <Pressable
            onPress={goToToday}
            style={[styles.todayButton, { borderColor: colors.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.todayText, { color: colors.primary }]}>{t('Today')}</Text>
          </Pressable>
          <Pressable
            onPress={() => changeMonth(-1)}
            style={[styles.arrowButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('Previous month')}
          >
            <Feather name={backIcon()} size={19} color={colors.secondaryForeground} />
          </Pressable>
          <Pressable
            onPress={() => changeMonth(1)}
            style={[styles.arrowButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('Next month')}
          >
            <Feather name={forwardIcon()} size={19} color={colors.secondaryForeground} />
          </Pressable>
        </View>

        <View
          style={[
            styles.viewSwitcher,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          {(['month', 'schedule'] as const).map((mode) => (
            <Pressable
              key={mode}
              testID={`view-${mode}`}
              onPress={() => setView(mode)}
              style={[
                styles.viewOption,
                view === mode && [
                  styles.viewOptionActive,
                  { backgroundColor: colors.card },
                ],
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: view === mode }}
            >
              <Feather
                name={mode === 'month' ? 'calendar' : 'list'}
                size={15}
                color={view === mode ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.viewOptionText,
                  { color: view === mode ? colors.foreground : colors.secondaryForeground },
                ]}
              >
                {mode === 'month' ? t('Month') : t('Schedule')}
              </Text>
            </Pressable>
          ))}
        </View>

        {elevated ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupFilters}
          >
            <FilterChip
              label={t('All teams')}
              selected={groupFilter === null}
              onPress={() => setGroupFilter(null)}
            />
            {groups.map((group) => (
              <FilterChip
                key={group.id}
                label={group.name}
                color={group.color ?? undefined}
                selected={groupFilter === group.id}
                onPress={() => setGroupFilter(group.id)}
              />
            ))}
          </ScrollView>
        ) : profile?.group_id ? (
          <View style={styles.groupLabel}>
            <View style={[styles.eventDot, { backgroundColor: groupColor(profile.group_id) }]} />
            <Text style={[styles.groupLabelText, { color: colors.secondaryForeground }]}>
              {groupName(profile.group_id)}
            </Text>
          </View>
        ) : null}

        {view === 'month' ? (
          <View
            style={[
              styles.calendarCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.weekdayRow}>
              {weekdayLabels().map((day, index) => (
                <Text
                  key={`${day}-${index}`}
                  style={[styles.weekday, { color: colors.mutedForeground }]}
                >
                  {day}
                </Text>
              ))}
            </View>
            <View style={[styles.dayGrid, { borderTopColor: colors.border, borderLeftColor: colors.border }]}>
              {dates.map((date) => {
                const dateKey = localDateString(date);
                const inMonth = date.getMonth() === cursor.getMonth();
                const dayEvents = visibleEvents.filter((event) => event.date === dateKey);
                const selected = dateKey === selectedDate;
                const isToday = dateKey === today;
                return (
                  <Pressable
                    key={dateKey}
                    testID={`calendar-day-${dateKey}`}
                    onPress={() => selectDay(date)}
                    style={[
                      styles.dayCell,
                      {
                        borderRightColor: colors.border,
                        borderBottomColor: colors.border,
                        backgroundColor: selected ? colors.accent : colors.card,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${dateTitle(dateKey)}${dayEvents.length ? `, ${tn(dayEvents.length, '{n} event', '{n} events')}` : ''}`}
                    accessibilityState={{ selected }}
                  >
                    <View
                      style={[
                        styles.dayNumber,
                        selected && { backgroundColor: colors.primary },
                        isToday && !selected && { borderColor: colors.primary, borderWidth: 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumberText,
                          {
                            color: !inMonth
                              ? colors.mutedForeground
                              : selected
                                ? colors.primaryForeground
                                : colors.foreground,
                          },
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                    <View style={styles.dayDots}>
                      {dayEvents.slice(0, 3).map((event) => (
                        <View
                          key={event.id}
                          style={[styles.dayDot, { backgroundColor: eventColor(event) }]}
                        />
                      ))}
                      {dayEvents.length > 3 ? (
                        <Text style={[styles.dayMore, { color: colors.mutedForeground }]}>
                          +{dayEvents.length - 3}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.agendaHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {view === 'month' ? dateTitle(selectedDate) : t('This month')}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
              {view === 'month'
                ? tn(selectedEvents.length, '{n} event', '{n} events')
                : tn(monthEvents.length, '{n} event', '{n} events')}
            </Text>
          </View>
          {view === 'month' ? (
            <Pressable
              onPress={() => {
                setView('schedule');
                void Haptics.selectionAsync();
              }}
              style={styles.seeSchedule}
              accessibilityRole="button"
            >
              <Text style={[styles.seeScheduleText, { color: colors.primary }]}>
                {t('Full schedule')}
              </Text>
              <Feather name={arrowForward()} size={15} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {dataLoading && visibleEvents.length === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t('Loading your team calendar…')}
            </Text>
          </View>
        ) : view === 'month' ? (
          selectedEvents.length ? (
            <View style={styles.eventList}>
              {selectedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  groupName={groupName(event.group_id)}
                  assignedName={personName(event)}
                  groupColor={groupColor(event.group_id)}
                  onPress={() => openEvent(event)}
                />
              ))}
            </View>
          ) : (
            <EmptyDay selectedDate={selectedDate} onAdd={openNewEvent} />
          )
        ) : monthEvents.length ? (
          <View style={styles.eventList}>
            {monthEvents.map((event, index) => {
              const previous = monthEvents[index - 1];
              const showDay = !previous || previous.date !== event.date;
              return (
                <View key={event.id}>
                  {showDay ? (
                    <Text style={[styles.scheduleDate, { color: colors.mutedForeground }]}>
                      {dateTitle(event.date)}
                    </Text>
                  ) : null}
                  <EventCard
                    event={event}
                    groupName={groupName(event.group_id)}
                    assignedName={personName(event)}
                    groupColor={groupColor(event.group_id)}
                    onPress={() => openEvent(event)}
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyDay selectedDate={selectedDate} onAdd={openNewEvent} />
        )}
      </ScrollView>
      )}

      <Modal
        visible={eventVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEventVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 14, 24, 0.48)' }]}
            onPress={() => setEventVisible(false)}
            accessibilityLabel={t('Close event')}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 18),
              },
            ]}
          >
            <KeyboardAwareScrollViewCompat
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              bottomOffset={72}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                    {editMode ? (targetEvent ? t('Edit event') : t('New event')) : targetEvent?.title}
                  </Text>
                  {!editMode && targetEvent ? (
                    <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                      {dateTitle(targetEvent.date)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setEventVisible(false)}
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('Close')}
                >
                  <Feather name="x" size={21} color={colors.secondaryForeground} />
                </Pressable>
              </View>

              {formError ? (
                <View style={[styles.formError, { backgroundColor: colors.warningSurface }]}>
                  <Text style={[styles.formErrorText, { color: colors.warning }]}>{formError}</Text>
                </View>
              ) : null}

              {editMode ? (
                <EventForm
                  draft={draft}
                  setField={setDraftField}
                  groups={groupOptions}
                  people={people.filter(
                    (person) =>
                      person.is_active &&
                      (person.group_id === draft.group_id || person.role === 'super_admin'),
                  )}
                  colors={colors}
                  testIDPrefix="event-form"
                />
              ) : targetEvent ? (
                <EventDetails
                  event={targetEvent}
                  groupName={groupName(targetEvent.group_id)}
                  groupColor={groupColor(targetEvent.group_id)}
                  assignedName={personName(targetEvent)}
                  colors={colors}
                />
              ) : null}

              {deleteConfirm ? (
                <View style={[styles.confirmBox, { backgroundColor: colors.warningSurface }]}>
                  <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
                    {t('Delete this event?')}
                  </Text>
                  <Text style={[styles.confirmCopy, { color: colors.secondaryForeground }]}>
                    {t('This cannot be undone.')}
                  </Text>
                  <View style={styles.modalActions}>
                    <Pressable
                      onPress={() => setDeleteConfirm(false)}
                      style={[styles.secondaryButton, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.secondaryForeground }]}>
                        {t('Keep event')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void confirmDelete()}
                      disabled={busy}
                      style={[styles.dangerButton, { backgroundColor: colors.destructive }]}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.destructiveForeground} />
                      ) : (
                        <Text style={[styles.primaryButtonText, { color: colors.destructiveForeground }]}>
                          {t('Delete')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : editMode ? (
                <View style={styles.modalActions}>
                  {targetEvent ? (
                    <Pressable
                      onPress={() => setDeleteConfirm(true)}
                      style={[styles.iconDangerButton, { borderColor: colors.border }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('Delete event')}
                    >
                      <Feather name="trash-2" size={18} color={colors.destructive} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setEventVisible(false);
                    }}
                    style={[styles.secondaryButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.secondaryForeground }]}>
                      {t('Cancel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="save-event"
                    onPress={() => void submitEvent()}
                    disabled={busy}
                    style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                        {t('Save event')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : targetEvent ? (
                <View style={styles.modalActions}>
                  {canReview(targetEvent) ? (
                    <>
                      {approvalsOn ? (
                        <Pressable
                          onPress={() => openReject(targetEvent)}
                          style={[styles.secondaryButton, { borderColor: colors.border }]}
                        >
                          <Text style={[styles.secondaryButtonText, { color: colors.secondaryForeground }]}>
                            {t('Send back')}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => void approve(targetEvent)}
                        disabled={busy}
                        style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                      >
                        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                          {t('Approve')}
                        </Text>
                      </Pressable>
                    </>
                  ) : canEditEvent(profile, userId, targetEvent) ? (
                    <>
                      <Pressable
                        onPress={() => setDeleteConfirm(true)}
                        style={[styles.iconDangerButton, { borderColor: colors.border }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('Delete event')}
                      >
                        <Feather name="trash-2" size={18} color={colors.destructive} />
                      </Pressable>
                      <Pressable
                        onPress={() => setEditMode(true)}
                        style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                      >
                        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                          {t('Edit event')}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <View style={styles.rejectRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 14, 24, 0.5)' }]}
            onPress={() => setRejectTarget(null)}
            accessibilityLabel={t('Close send back dialog')}
          />
          <KeyboardAwareScrollViewCompat
            style={styles.rejectScroll}
            contentContainerStyle={styles.rejectScrollContent}
            bottomOffset={20}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.rejectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t('Send event back')}</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.secondaryForeground }]}>
                {t('Add a short reason for {title}.', { title: rejectTarget?.title ?? '' })}
              </Text>
              {rejectError ? (
                <Text style={[styles.formErrorText, { color: colors.destructive }]}>{rejectError}</Text>
              ) : null}
              <TextInput
                testID="send-back-reason"
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder={t('What needs to change?')}
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
                style={[
                  styles.notesInput,
                  { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
                ]}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setRejectTarget(null)}
                  style={[styles.secondaryButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.secondaryForeground }]}>
                    {t('Cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void sendBack()}
                  disabled={rejectBusy}
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                >
                  {rejectBusy ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                      {t('Send back')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  color,
  onPress,
}: {
  label: string;
  selected: boolean;
  color?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.accent : colors.card,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {color ? <View style={[styles.eventDot, { backgroundColor: color }]} /> : null}
      <Text
        numberOfLines={1}
        style={[
          styles.filterText,
          { color: selected ? colors.primary : colors.secondaryForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EventCard({
  event,
  groupName,
  assignedName,
  groupColor,
  onPress,
}: {
  event: CalendarEvent;
  groupName: string;
  assignedName: string;
  groupColor: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${displayTime(event.time_start)}, ${groupName}`}
    >
      <View
        style={[
          styles.eventStripe,
          { backgroundColor: event.color || groupColor },
        ]}
      />
      <View style={styles.eventInfo}>
        <View style={styles.eventNameLine}>
          <Text numberOfLines={1} style={[styles.eventTitle, { color: colors.foreground }]}>
            {event.title}
          </Text>
          {event.status === 'pending' ? (
            <StatusPill label={t('Waiting')} kind="warning" />
          ) : event.status === 'rejected' ? (
            <StatusPill label={t('Sent back')} kind="danger" />
          ) : null}
        </View>
        <Text numberOfLines={1} style={[styles.eventMeta, { color: colors.mutedForeground }]}>
          {displayTime(event.time_start)}
          {event.time_end ? ` – ${displayTime(event.time_end)}` : ''} · {groupName}
        </Text>
        <Text numberOfLines={1} style={[styles.eventMeta, { color: colors.mutedForeground }]}>
          {assignedName}
        </Text>
      </View>
      <Feather name={forwardIcon()} size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

function StatusPill({
  label,
  kind,
}: {
  label: string;
  kind: 'warning' | 'danger' | 'success';
}) {
  const colors = useColors();
  const foreground =
    kind === 'warning' ? colors.warning : kind === 'danger' ? colors.destructive : colors.success;
  const background =
    kind === 'warning'
      ? colors.warningSurface
      : kind === 'danger'
        ? colors.accent
        : colors.successSurface;
  return (
    <View style={[styles.statusPill, { backgroundColor: background }]}>
      <Text style={[styles.statusText, { color: foreground }]}>{label}</Text>
    </View>
  );
}

function EmptyDay({
  selectedDate,
  onAdd,
}: {
  selectedDate: string;
  onAdd: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
        <Feather name="calendar" size={21} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('Nothing scheduled')}</Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        {t('Add an event for {date} and it will appear here.', { date: shortDateTitle(selectedDate) })}
      </Text>
      <Pressable onPress={onAdd} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
        <Feather name="plus" size={16} color={colors.primary} />
        <Text style={[styles.emptyActionText, { color: colors.primary }]}>{t('Add an event')}</Text>
      </Pressable>
    </View>
  );
}

function EventForm({
  draft,
  setField,
  groups,
  people,
  colors,
  testIDPrefix,
}: {
  draft: EventDraft;
  setField: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  groups: { id: string; name: string; color?: string | null }[];
  people: { id: string; full_name: string }[];
  colors: ReturnType<typeof useColors>;
  testIDPrefix: string;
}) {
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>{t('Event name')}</Text>
      <TextInput
        testID={`${testIDPrefix}-title`}
        value={draft.title}
        onChangeText={(value) => setField('title', value)}
        placeholder={t('Name this event')}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="sentences"
        style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
        {t('Date')}
      </Text>
      <TextInput
        testID={`${testIDPrefix}-date`}
        value={draft.date}
        onChangeText={(value) => setField('date', value)}
        placeholder={t('YYYY-MM-DD')}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />

      <View style={styles.twoFields}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
            {t('Start time')}
          </Text>
          <TextInput
            testID={`${testIDPrefix}-start`}
            value={draft.time_start}
            onChangeText={(value) => setField('time_start', value)}
            placeholder={t('Optional')}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation"
            style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
            {t('End time')}
          </Text>
          <TextInput
            testID={`${testIDPrefix}-end`}
            value={draft.time_end}
            onChangeText={(value) => setField('time_end', value)}
            placeholder={t('Optional')}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation"
            style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
      </View>
      <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
        {t('Use 24-hour time, such as 09:30. Leave blank for all day.')}
      </Text>

      {groups.length ? (
        <>
          <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
            {t('Team')}
          </Text>
          <View style={styles.choiceWrap}>
            {groups.map((group) => {
              const selected = draft.group_id === group.id;
              return (
                <Pressable
                  key={group.id}
                  onPress={() => setField('group_id', group.id)}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: selected ? colors.accent : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.eventDot,
                      { backgroundColor: group.color || colors.primary },
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.choiceText,
                      { color: selected ? colors.primary : colors.secondaryForeground },
                    ]}
                  >
                    {group.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
        {t('Assign to')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceScroll}>
        <ChoiceChip
          label={t('No one')}
          selected={!draft.assigned_to}
          onPress={() => setField('assigned_to', '')}
        />
        {people.map((person) => (
          <ChoiceChip
            key={person.id}
            label={person.full_name}
            selected={draft.assigned_to === person.id}
            onPress={() => setField('assigned_to', person.id)}
          />
        ))}
      </ScrollView>

      <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
        {t('Visibility')}
      </Text>
      <View style={styles.choiceWrap}>
        {(
          [
            ['private', t('Just me')],
            ['group', t('My team')],
            ['company', t('Everyone')],
          ] as const
        ).map(([value, label]) => (
          <ChoiceChip
            key={value}
            label={label}
            selected={draft.visibility === value}
            onPress={() => setField('visibility', value)}
          />
        ))}
      </View>

      <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
        {t('Calendar color')}
      </Text>
      <View style={styles.colorChoices}>
        {eventPalette.map((color) => (
          <Pressable
            key={color}
            onPress={() => setField('color', color)}
            style={[
              styles.colorChoice,
              { backgroundColor: color },
              draft.color === color && { borderColor: colors.foreground, borderWidth: 2 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('Choose event color')}
            accessibilityState={{ selected: draft.color === color }}
          >
            {draft.color === color ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.fieldLabel, styles.fieldGap, { color: colors.secondaryForeground }]}>
        {t('Notes')}
      </Text>
      <TextInput
        testID={`${testIDPrefix}-notes`}
        value={draft.notes}
        onChangeText={(value) => setField('notes', value)}
        placeholder={t('Add context or details')}
        placeholderTextColor={colors.mutedForeground}
        multiline
        textAlignVertical="top"
        style={[
          styles.notesInput,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choiceChip,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.choiceText,
          { color: selected ? colors.primary : colors.secondaryForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EventDetails({
  event,
  groupName,
  groupColor,
  assignedName,
  colors,
}: {
  event: CalendarEvent;
  groupName: string;
  groupColor: string;
  assignedName: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View>
      <View style={[styles.detailStatus, event.status === 'approved' && { display: 'none' }]}>
        <StatusPill
          label={
            event.status === 'pending'
              ? t('Waiting for approval')
              : event.status === 'rejected'
                ? t('Sent back')
                : t('Approved')
          }
          kind={
            event.status === 'pending'
              ? 'warning'
              : event.status === 'rejected'
                ? 'danger'
                : 'success'
          }
        />
      </View>
      <InfoRow icon="clock" label={t('When')} value={`${dateTitle(event.date)} · ${displayTime(event.time_start)}${event.time_end ? ` – ${displayTime(event.time_end)}` : ''}`} />
      <InfoRow icon="users" label={t('Team')} value={groupName} detailColor={groupColor} />
      <InfoRow icon="user" label={t('Assigned to')} value={assignedName} />
      <InfoRow icon="eye" label={t('Visibility')} value={event.visibility === 'company' ? t('Everyone') : event.visibility === 'group' ? t('Team') : t('Just me')} />
      {event.notes ? <InfoRow icon="file-text" label={t('Notes')} value={event.notes} multiline /> : null}
      {event.rejection_note ? (
        <View style={[styles.rejectionBox, { backgroundColor: colors.accent }]}>
          <Text style={[styles.fieldLabel, { color: colors.destructive }]}>{t('Manager’s note')}</Text>
          <Text style={[styles.detailValue, { color: colors.secondaryForeground }]}>
            {event.rejection_note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  detailColor,
  multiline = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  detailColor?: string;
  multiline?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
      <Feather name={icon} size={17} color={colors.mutedForeground} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text
          style={[
            styles.detailValue,
            { color: colors.foreground },
            multiline && styles.multilineValue,
          ]}
        >
          {value}
        </Text>
      </View>
      {detailColor ? <View style={[styles.eventDot, { backgroundColor: detailColor }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 16,
  },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, marginEnd: 10 },
  brandText: { flex: 1, minWidth: 0 },
  brandMark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.2, textAlign: 'auto', writingDirection: 'auto' },
  brandCaption: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  addButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  profileButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  notice: { borderWidth: 1, borderRadius: 11, minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  errorBanner: { borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  retryText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  setupCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  setupButton: { alignSelf: 'flex-start', minHeight: 38, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
  reviewPanel: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  reviewIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sectionMeta: { fontSize: 11, marginTop: 3, lineHeight: 16 },
  countBadge: { minWidth: 25, height: 25, paddingHorizontal: 7, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  reviewRow: { minHeight: 60, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  reviewEvent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  reviewActions: { flexDirection: 'row', gap: 7 },
  approveButton: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  returnButton: { width: 31, height: 31, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  moreReviews: { fontSize: 11, paddingVertical: 8, textAlign: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  monthTitle: { fontSize: 25, letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  monthSub: { fontSize: 12, marginTop: 2 },
  todayButton: { height: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  arrowButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  viewSwitcher: { flexDirection: 'row', borderRadius: 11, borderWidth: 1, padding: 3, gap: 3, alignSelf: 'flex-start' },
  viewOption: { height: 32, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  viewOptionActive: { shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  viewOptionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  groupFilters: { gap: 8, paddingRight: 8, alignItems: 'center' },
  filterChip: { maxWidth: 190, minHeight: 32, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -5 },
  groupLabelText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  eventDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  calendarCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  weekdayRow: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1 },
  dayCell: { width: '14.2857%', height: 54, borderRightWidth: 1, borderBottomWidth: 1, alignItems: 'center', paddingTop: 5 },
  dayNumber: { minWidth: 24, height: 24, paddingHorizontal: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayNumberText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  dayDots: { height: 12, marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  dayMore: { fontSize: 7, fontFamily: 'Inter_600SemiBold' },
  agendaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  seeSchedule: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seeScheduleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  eventList: { gap: 8 },
  eventCard: { minHeight: 68, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 11, gap: 10 },
  eventStripe: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginVertical: 1 },
  eventInfo: { flex: 1, minWidth: 0, gap: 3 },
  eventNameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventTitle: { flexShrink: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  eventMeta: { fontSize: 10, lineHeight: 14 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  statusText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  scheduleDate: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 7, marginTop: 5 },
  emptyCard: { borderRadius: 15, borderWidth: 1, padding: 19, alignItems: 'center' },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, marginTop: 14 },
  emptyActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  loadingCard: { minHeight: 92, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 9 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '93%', alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#8298AE', opacity: 0.45, alignSelf: 'center', marginTop: 9, marginBottom: 17 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  sheetSubtitle: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  closeButton: { padding: 3 },
  formError: { borderRadius: 9, padding: 10, marginBottom: 13 },
  formErrorText: { fontSize: 12, lineHeight: 17 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  fieldGap: { marginTop: 16 },
  fieldInput: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  twoFields: { flexDirection: 'row', gap: 10 },
  fieldHint: { fontSize: 10, marginTop: 5, lineHeight: 15 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceScroll: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  choiceChip: { minHeight: 33, maxWidth: 200, borderWidth: 1, borderRadius: 17, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  choiceText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  colorChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  colorChoice: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  notesInput: { minHeight: 88, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, lineHeight: 19 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 19 },
  primaryAction: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: { minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  iconDangerButton: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  confirmBox: { borderRadius: 12, padding: 14, marginTop: 12 },
  confirmTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  confirmCopy: { fontSize: 12, marginTop: 4 },
  detailStatus: { marginBottom: 8, alignItems: 'flex-start' },
  infoRow: { minHeight: 53, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  infoLabel: { fontSize: 10, marginBottom: 3 },
  detailValue: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 19 },
  multilineValue: { lineHeight: 20 },
  rejectionBox: { padding: 12, borderRadius: 10, marginTop: 9 },
  rejectRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  rejectScroll: { flexGrow: 0, maxHeight: '88%' },
  rejectScrollContent: { justifyContent: 'center' },
  rejectCard: { maxWidth: 500, width: '100%', alignSelf: 'center', borderWidth: 1, borderRadius: 18, padding: 19 },
});
