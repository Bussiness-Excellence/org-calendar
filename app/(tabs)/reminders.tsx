import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TimeField, TimePanel } from '@/components/TimePicker';
import { useColors } from '@/hooks/useColors';
import { useCalendar } from '@/lib/calendar-context';
import {
  displayTime,
  localDateString,
  monthGrid,
  monthTitle,
  parseLocalDate,
  shortDateTitle,
  weekdayLabels,
} from '@/lib/calendar-date';
import { backIcon, forwardIcon, t } from '@/lib/i18n';
import { useNotifications } from '@/lib/notifications';
import { useReminders, type Reminder, type ReminderDraft } from '@/lib/reminders';

type Colors = ReturnType<typeof useColors>;

const pad = (n: number) => String(n).padStart(2, '0');
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** The coming Monday (a week from today when today is Monday). */
function nextMonday(today: Date): Date {
  const diff = ((8 - today.getDay()) % 7) || 7;
  return addDays(today, diff);
}

/** Next quarter hour, at least 15 minutes from now. */
function soonTime(now: Date): string {
  const d = new Date(now.getTime() + 15 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return localTime(d);
}

function whenLabel(r: Reminder, now: Date): string {
  const at = new Date(r.remind_at);
  const date = localDateString(at);
  const day =
    date === localDateString(now)
      ? t('Today')
      : date === localDateString(addDays(now, 1))
        ? t('Tomorrow')
        : shortDateTitle(date);
  return `${day} · ${displayTime(localTime(at))}`;
}

export default function RemindersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { org } = useCalendar();
  const { reminders, loading, save, setDone, remove } = useReminders();
  const { permission, requestPermission } = useNotifications();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const now = new Date();

  const upcoming = useMemo(() => reminders.filter((r) => !r.done_at), [reminders]);
  const done = useMemo(
    () => reminders.filter((r) => r.done_at).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')).slice(0, 30),
    [reminders],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: (insets.top > 0 ? insets.top : 40) + 12, paddingBottom: 110 }]}
      >
        <Text numberOfLines={1} style={[styles.kicker, { color: colors.primary }]}>
          {org?.name ?? ''}
        </Text>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('My reminders')}</Text>
          <Pressable
            testID="new-reminder"
            onPress={() => setEditing('new')}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{t('New reminder')}</Text>
          </Pressable>
        </View>
        <Text style={[styles.lead, { color: colors.mutedForeground }]}>
          {t('Only you can see these. You get a notification at the time you set.')}
        </Text>

        {permission === 'undetermined' ? (
          <Pressable
            testID="reminders-allow"
            onPress={() => void requestPermission()}
            style={[styles.notice, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
          >
            <Feather name="bell" size={16} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.primary }]}>
              {t('Turn on alerts on this device so reminders reach you even when the app is closed.')}
            </Text>
          </Pressable>
        ) : permission === 'denied' ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSurface }]}>
            <Feather name="bell-off" size={16} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.warning }]}>
              {t('Alerts are blocked for this site or app. Allow notifications in your browser or phone settings; until then reminders appear in the bell only.')}
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t('Coming up')}</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} />
          ) : upcoming.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="clock" size={22} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('No reminders yet. Add one, for example “Unsubscribe from the Google Play service” next Monday.')}
              </Text>
            </View>
          ) : (
            upcoming.map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                now={now}
                colors={colors}
                onToggle={() => setDone.mutate({ id: r.id, done: true })}
                onOpen={() => setEditing(r)}
              />
            ))
          )}
        </View>

        {done.length ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => setShowDone((v) => !v)} style={styles.doneHeader} accessibilityRole="button">
              <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom: 0 }]}>
                {t('Done')} · {done.length}
              </Text>
              <Feather name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </Pressable>
            {showDone
              ? done.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    now={now}
                    colors={colors}
                    onToggle={() => setDone.mutate({ id: r.id, done: false })}
                    onOpen={() => setEditing(r)}
                  />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <ReminderEditor
        key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
        visible={!!editing}
        reminder={editing === 'new' ? null : editing}
        colors={colors}
        saving={save.isPending}
        onClose={() => setEditing(null)}
        onSave={async (draft) => {
          await save.mutateAsync({ id: editing && editing !== 'new' ? editing.id : null, draft });
          setEditing(null);
        }}
        onDelete={async (id) => {
          await remove.mutateAsync(id);
          setEditing(null);
        }}
      />
    </View>
  );
}

function ReminderRow({
  reminder,
  now,
  colors,
  onToggle,
  onOpen,
}: {
  reminder: Reminder;
  now: Date;
  colors: Colors;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const done = !!reminder.done_at;
  const due = !done && new Date(reminder.remind_at).getTime() <= now.getTime();
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <Pressable
        testID={`reminder-check-${reminder.id}`}
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? t('Mark as not done') : t('Mark as done')}
        style={[
          styles.check,
          { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.success : 'transparent' },
        ]}
      >
        {done ? <Feather name="check" size={13} color="#FFFFFF" /> : null}
      </Pressable>
      <Pressable onPress={onOpen} style={styles.rowBody} accessibilityRole="button">
        <Text
          numberOfLines={2}
          style={[
            styles.rowTitle,
            { color: done ? colors.mutedForeground : colors.foreground },
            done && { textDecorationLine: 'line-through' },
          ]}
        >
          {reminder.title}
        </Text>
        <View style={styles.rowMetaLine}>
          <Feather name="clock" size={11} color={due ? colors.destructive : colors.mutedForeground} />
          <Text style={[styles.rowMeta, { color: due ? colors.destructive : colors.mutedForeground }]}>
            {whenLabel(reminder, now)}
          </Text>
          {due ? (
            <View style={[styles.dueChip, { backgroundColor: colors.destructive }]}>
              <Text style={styles.dueChipText}>{t('Due')}</Text>
            </View>
          ) : null}
        </View>
        {reminder.notes ? (
          <Text numberOfLines={2} style={[styles.rowNotes, { color: colors.mutedForeground }]}>
            {reminder.notes}
          </Text>
        ) : null}
      </Pressable>
      <Feather name={forwardIcon()} size={16} color={colors.mutedForeground} />
    </View>
  );
}

function ReminderEditor({
  visible,
  reminder,
  colors,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  reminder: Reminder | null;
  colors: Colors;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ReminderDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const initial: ReminderDraft = reminder
    ? {
        title: reminder.title,
        notes: reminder.notes ?? '',
        date: localDateString(new Date(reminder.remind_at)),
        time: localTime(new Date(reminder.remind_at)),
      }
    : { title: '', notes: '', date: localDateString(today), time: soonTime(today) };
  const [draft, setDraft] = useState<ReminderDraft>(initial);
  const [timeOpen, setTimeOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseLocalDate(initial.date) ?? today);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof ReminderDraft>(k: K, v: ReminderDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const pickDate = (d: Date) => {
    set('date', localDateString(d));
    setCursor(d);
  };

  const quick: [string, Date][] = [
    [t('Today'), today],
    [t('Tomorrow'), addDays(today, 1)],
    [t('Next Monday'), nextMonday(today)],
    [t('In a week'), addDays(today, 7)],
  ];

  const submit = async () => {
    setError('');
    const at = new Date(`${draft.date}T${draft.time || '09:00'}:00`);
    if (!draft.title.trim()) return setError(t('Write what to remind you about.'));
    if (Number.isNaN(at.getTime())) return setError(t('Choose a date and time.'));
    if (at.getTime() < Date.now() - 60_000) return setError(t('That time has already passed. Choose a later time.'));
    try {
      await onSave({ ...draft, time: draft.time || '09:00' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('Close')} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {reminder ? t('Edit reminder') : t('New reminder')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Close')}>
              <Feather name="x" size={21} color={colors.secondaryForeground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {error ? (
              <View style={[styles.error, { backgroundColor: colors.accent }]}>
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.secondaryForeground }]}>{t('Remind me to')}</Text>
            <TextInput
              testID="reminder-title"
              value={draft.title}
              onChangeText={(v) => set('title', v)}
              placeholder={t('e.g. Unsubscribe from the Google Play service')}
              placeholderTextColor={colors.mutedForeground}
              maxLength={200}
              autoFocus={!reminder}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />

            <Text style={[styles.label, { color: colors.secondaryForeground }]}>{t('Day')}</Text>
            <View style={styles.chips}>
              {quick.map(([label, d]) => {
                const selected = draft.date === localDateString(d);
                return (
                  <Pressable
                    key={label}
                    testID={`reminder-quick-${label}`}
                    onPress={() => pickDate(d)}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? colors.accent : colors.background, borderColor: selected ? colors.primary : colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, { color: selected ? colors.primary : colors.secondaryForeground }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <MiniMonth cursor={cursor} setCursor={setCursor} value={draft.date} onPick={pickDate} colors={colors} />

            <TimeField
              label={t('Time')}
              value={draft.time}
              open={timeOpen}
              onPress={() => setTimeOpen((v) => !v)}
              colors={colors}
              testID="reminder-time"
            />
            {timeOpen ? (
              <TimePanel
                value={draft.time}
                onChange={(v) => set('time', v || '09:00')}
                onClose={() => setTimeOpen(false)}
                colors={colors}
                testID="reminder-time-panel"
              />
            ) : null}

            <Text style={[styles.label, { color: colors.secondaryForeground }]}>{t('Notes (optional)')}</Text>
            <TextInput
              testID="reminder-notes"
              value={draft.notes}
              onChangeText={(v) => set('notes', v)}
              placeholder={t('Anything that helps, e.g. a link or account name')}
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={2000}
              style={[
                styles.input,
                styles.notes,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
            />
          </ScrollView>

          <View style={styles.actions}>
            {reminder ? (
              confirmDelete ? (
                <Pressable
                  testID="reminder-delete-confirm"
                  onPress={() => void onDelete(reminder.id)}
                  style={[styles.secondary, { borderColor: colors.destructive }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryText, { color: colors.destructive }]}>{t('Yes, delete')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  testID="reminder-delete"
                  onPress={() => setConfirmDelete(true)}
                  style={[styles.secondary, { borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </Pressable>
              )
            ) : (
              <Pressable onPress={onClose} style={[styles.secondary, { borderColor: colors.border }]} accessibilityRole="button">
                <Text style={[styles.secondaryText, { color: colors.secondaryForeground }]}>{t('Cancel')}</Text>
              </Pressable>
            )}
            <Pressable
              testID="reminder-save"
              onPress={() => void submit()}
              disabled={saving}
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.8 : 1 }]}
              accessibilityRole="button"
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t('Save reminder')}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MiniMonth({
  cursor,
  setCursor,
  value,
  onPick,
  colors,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  value: string;
  onPick: (d: Date) => void;
  colors: Colors;
}) {
  const today = localDateString(new Date());
  const days = monthGrid(cursor);
  const labels = weekdayLabels();
  return (
    <View style={[styles.month, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.monthHeader}>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Previous month')}
        >
          <Feather name={backIcon()} size={18} color={colors.secondaryForeground} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthTitle(cursor)}</Text>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Next month')}
        >
          <Feather name={forwardIcon()} size={18} color={colors.secondaryForeground} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {labels.map((l, i) => (
          <Text key={i} style={[styles.weekLabel, { color: colors.mutedForeground }]}>
            {l}
          </Text>
        ))}
      </View>
      <View style={styles.daysGrid}>
        {days.map((d) => {
          const key = localDateString(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const past = key < today;
          const selected = key === value;
          return (
            <Pressable
              key={key}
              testID={`reminder-day-${key}`}
              disabled={past}
              onPress={() => onPick(d)}
              style={[styles.dayCell, selected && { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: past }}
            >
              <Text
                style={[
                  styles.dayText,
                  {
                    color: selected
                      ? '#FFFFFF'
                      : past || !inMonth
                        ? colors.mutedForeground
                        : key === today
                          ? colors.primary
                          : colors.foreground,
                    opacity: past ? 0.45 : 1,
                  },
                ]}
              >
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16 },
  kicker: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  lead: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 6, marginBottom: 14, lineHeight: 19 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 13, minHeight: 40 },
  addBtnText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 12, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  doneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 10 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rowMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  rowNotes: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  dueChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  dueChipText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: 'rgba(4, 14, 24, 0.48)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  error: { borderRadius: 10, padding: 10, marginTop: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 46, fontSize: 14, fontFamily: 'Inter_500Medium' },
  notes: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  month: { borderWidth: 1, borderRadius: 12, padding: 10 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  monthTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingVertical: 3 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  dayText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    minHeight: 46,
    minWidth: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primary: { flex: 1, minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' },
});
