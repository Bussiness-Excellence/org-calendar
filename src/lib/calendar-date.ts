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

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function clock(date: Date): string {
  return new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** When something was registered, in full: "Wed, Nov 25, 2026, 2:40 PM". */
export function stampLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** Compact registration time for lists: "Today 2:40 PM", "Nov 21, 9:05 AM", "Dec 3, 2025". */
export function shortStampLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return t('Today {time}', { time: clock(date) });
  if (sameDay(date, yesterday)) return t('Yesterday {time}', { time: clock(date) });
  if (date.getFullYear() === today.getFullYear()) {
    return new Intl.DateTimeFormat(dateLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/** "Online now", "Last seen 5 min ago", "Last seen today at 9:10 AM", … */
export function lastSeenLabel(iso: string | null | undefined, now: number, onlineWindowMs: number): string {
  if (!iso) return t('Not signed in yet');
  const then = new Date(iso);
  const diff = now - then.getTime();
  if (diff < onlineWindowMs) return t('Online now');
  if (diff < 3_600_000) return t('Last seen {n} min ago', { n: Math.max(1, Math.floor(diff / 60_000)) });
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(then, today)) return t('Last seen today at {time}', { time: clock(then) });
  if (sameDay(then, yesterday)) return t('Last seen yesterday at {time}', { time: clock(then) });
  const sameYear = then.getFullYear() === today.getFullYear();
  return t('Last seen {date}', {
    date: new Intl.DateTimeFormat(dateLocale(), sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(then),
  });
}

/** Short form of lastSeenLabel for narrow places: "Online", "5 min ago", "Today 9:10 AM", "Nov 21". */
export function lastSeenShort(iso: string | null | undefined, now: number, onlineWindowMs: number): string {
  if (!iso) return t('Not signed in yet');
  const then = new Date(iso);
  const diff = now - then.getTime();
  if (diff < onlineWindowMs) return t('Online');
  if (diff < 3_600_000) return t('{n} min ago', { n: Math.max(1, Math.floor(diff / 60_000)) });
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(then, today)) return t('Today {time}', { time: clock(then) });
  if (sameDay(then, yesterday)) return t('Yesterday {time}', { time: clock(then) });
  const sameYear = then.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(dateLocale(), sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(then);
}
