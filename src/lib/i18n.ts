import * as Localization from 'expo-localization';
import { I18nManager, Platform } from 'react-native';
import { ar } from './locales/ar';
import { fr } from './locales/fr';

export type Language = 'en' | 'ar' | 'fr';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
];

const dictionaries: Record<Language, Record<string, string>> = { en: {}, ar, fr };

let current: Language = detectLanguage();

/** The device's language, if we support it; otherwise English. */
export function detectLanguage(): Language {
  try {
    const code = Localization.getLocales()[0]?.languageCode ?? 'en';
    return code === 'ar' || code === 'fr' ? code : 'en';
  } catch {
    return 'en';
  }
}

export function getLanguage(): Language {
  return current;
}

export function isRTL(lang: Language = current): boolean {
  return lang === 'ar';
}

/** Locale for dates and times. Arabic keeps Western digits so dates match the input fields. */
export function dateLocale(lang: Language = current): string {
  return lang === 'ar' ? 'ar-EG-u-nu-latn' : lang === 'fr' ? 'fr-FR' : 'en-US';
}

/** Switches the language. Returns true when the app must reload to flip layout direction (native only). */
export function setLanguage(lang: Language): boolean {
  current = lang;
  const rtl = isRTL(lang);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    }
    return false;
  }
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

/**
 * Translates an English UI string. The English text is the key, so anything
 * without a translation (including messages from the server) shows in English.
 * `{name}` placeholders are filled from params.
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const translated = dictionaries[current][text] ?? text;
  if (!params) return translated;
  // In Arabic, wrap inserted names/titles in direction isolates so Latin text
  // inside an Arabic sentence keeps its place (no scrambled punctuation).
  const wrap = (v: string) => (current === 'ar' ? `\u2068${v}\u2069` : v);
  return translated.replace(/\{(\w+)\}/g, (_, key: string) => (key in params ? wrap(String(params[key])) : `{${key}}`));
}

/** Count-aware text: tn(3, '{n} event', '{n} events'). Arabic gets its dual/plural forms from the dictionary. */
export function tn(n: number, one: string, other: string): string {
  if (current === 'ar') {
    const base = other;
    const form = n === 0 ? 'zero' : n === 1 ? 'one' : n === 2 ? 'two' : n % 100 >= 3 && n % 100 <= 10 ? 'few' : 'many';
    const key = `${base}|${form}`;
    if (dictionaries.ar[key]) return dictionaries.ar[key].replace('{n}', String(n));
  }
  return t(n === 1 ? one : other, { n });
}

/** A chevron that points "forward" in the reading direction. */
export function forwardIcon(): 'chevron-right' | 'chevron-left' {
  return isRTL() ? 'chevron-left' : 'chevron-right';
}
export function backIcon(): 'chevron-left' | 'chevron-right' {
  return isRTL() ? 'chevron-right' : 'chevron-left';
}
export function arrowForward(): 'arrow-right' | 'arrow-left' {
  return isRTL() ? 'arrow-left' : 'arrow-right';
}
export function arrowBack(): 'arrow-left' | 'arrow-right' {
  return isRTL() ? 'arrow-right' : 'arrow-left';
}
