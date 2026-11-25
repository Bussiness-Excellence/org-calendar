import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { displayTime } from '@/lib/calendar-date';
import { dateLocale, t } from '@/lib/i18n';

type Colors = ReturnType<typeof useColors>;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = ['00', '15', '30', '45'];

const pad = (n: number) => String(n).padStart(2, '0');

/** "9 AM" / "21" etc., in the reader's language. */
function hourLabel(hour: number): string {
  return new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric' }).format(new Date(2024, 0, 1, hour, 0));
}

/** The tappable field that shows the chosen time ("All day" when empty). */
export function TimeField({
  label,
  value,
  open,
  onPress,
  colors,
  testID,
}: {
  label: string;
  value: string;
  open: boolean;
  onPress: () => void;
  colors: Colors;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: colors.secondaryForeground }]}>{label}</Text>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayTime(value)}`}
        accessibilityState={{ expanded: open }}
        style={[
          styles.field,
          { backgroundColor: colors.card, borderColor: open ? colors.primary : colors.border },
        ]}
      >
        <Feather name="clock" size={15} color={value ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.fieldText, { color: value ? colors.foreground : colors.mutedForeground }]}>
          {value ? displayTime(value) : t('All day')}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

/**
 * Drill-down chooser: pick the hour, then the minutes. "All day" clears the time.
 * The chosen hour is kept while minutes are picked.
 */
export function TimePanel({
  value,
  onChange,
  onClose,
  colors,
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  colors: Colors;
  testID?: string;
}) {
  const currentHour = value ? Number(value.slice(0, 2)) : null;
  const [hour, setHour] = React.useState<number | null>(currentHour);
  const currentMinute = value ? value.slice(3, 5) : null;

  return (
    <View
      testID={testID}
      style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.panelHeader}>
        <Text style={[styles.step, { color: colors.secondaryForeground }]}>
          {hour === null ? t('Choose the hour') : t('Choose the minutes')}
        </Text>
        {hour !== null ? (
          <Pressable onPress={() => setHour(null)} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.link, { color: colors.primary }]}>{t('Change hour')}</Text>
          </Pressable>
        ) : null}
      </View>

      {hour === null ? (
        <View style={styles.grid}>
          {HOURS.map((h) => {
            const selected = currentHour === h;
            return (
              <Pressable
                key={h}
                testID={testID ? `${testID}-h${pad(h)}` : undefined}
                onPress={() => setHour(h)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.cell,
                  {
                    backgroundColor: selected ? colors.accent : colors.background,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.cellText, { color: selected ? colors.primary : colors.foreground }]}>
                  {hourLabel(h)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.minuteRow}>
          {MINUTES.map((m) => {
            const next = `${pad(hour)}:${m}`;
            const selected = currentHour === hour && currentMinute === m;
            return (
              <Pressable
                key={m}
                testID={testID ? `${testID}-m${m}` : undefined}
                onPress={() => {
                  onChange(next);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.minuteCell,
                  {
                    backgroundColor: selected ? colors.accent : colors.background,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.cellText, { color: selected ? colors.primary : colors.foreground }]}>
                  {displayTime(next)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            onChange('');
            onClose();
          }}
          accessibilityRole="button"
          style={[styles.footerButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.footerText, { color: colors.secondaryForeground }]}>{t('All day (no time)')}</Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.footerButton}>
          <Text style={[styles.footerText, { color: colors.primary }]}>{t('Done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One hour after a "HH:MM" time, or "" past 22:59 (the end would be the next day). */
export function oneHourLater(value: string): string {
  if (!value) return '';
  const h = Number(value.slice(0, 2));
  if (h >= 23) return '';
  return `${pad(h + 1)}:${value.slice(3, 5)}`;
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7, marginTop: 16 },
  field: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldText: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  step: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  link: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '15%',
    minWidth: 52,
    flexGrow: 1,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  minuteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minuteCell: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  footerButton: {
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
