import { dateLocale, t } from './i18n';

/** Narrow weekday names, Sunday first, in the current language. */
export function weekdayLabels(): string[] {
  const fmt = new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localDateString(date) === value ? date : null;
}

export function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  first.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function monthTitle(date: Date): string {
  return new Intl.DateTimeFormat(dateLocale(), { month: 'long', year: 'numeric' }).format(date);
}

export function dateTitle(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(dateLocale(), { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

export function shortDateTitle(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(dateLocale(), { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

export function displayTime(value: string | null | undefined): string {
  if (!value) return t('All day');
  const [h = '0', m = '00'] = value.split(':');
  const hours = Number(h);
  const minutes = Number(m.slice(0, 2));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(2024, 0, 1, hours, minutes));
}

/** Short relative time for notifications: "5 min ago", "Yesterday", or a date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return t('Just now');
  if (diff < 3600) return t('{n} min ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('{n} h ago', { n: Math.floor(diff / 3600) });
  if (diff < 172800) return t('Yesterday');
  return new Intl.DateTimeFormat(dateLocale(), { month: 'short', day: 'numeric' }).format(new Date(then));
}
