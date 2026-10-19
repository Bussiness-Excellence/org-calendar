import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { detectLanguage, setLanguage as applyLanguage, type Language } from './i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

interface Preferences {
  themeMode: ThemeMode;
  scheme: 'light' | 'dark';
  language: Language;
  reminders: boolean;
  ready: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
  setReminders: (on: boolean) => void;
}

const KEY = 'org-calendar.preferences';
const PreferencesContext = createContext<Preferences | null>(null);

interface Stored {
  themeMode?: ThemeMode;
  language?: Language;
  reminders?: boolean;
}

async function load(): Promise<Stored> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

async function save(patch: Stored) {
  try {
    const current = await load();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // preferences are a convenience; the app works without them
  }
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [language, setLanguageState] = useState<Language>(detectLanguage());
  const [reminders, setRemindersState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void load().then(async (stored) => {
      if (!alive) return;
      const lang = stored.language ?? detectLanguage();
      setThemeModeState(stored.themeMode ?? 'system');
      setRemindersState(stored.reminders ?? true);
      setLanguageState(lang);
      if (applyLanguage(lang)) {
        // layout direction changed (Arabic on/off) — native needs a restart
        await reloadAppAsync().catch(() => undefined);
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void save({ themeMode: mode });
    try {
      Appearance.setColorScheme?.(mode === 'system' ? 'unspecified' : mode);
    } catch {
      // not supported on every platform
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    void save({ language: lang }).then(async () => {
      if (applyLanguage(lang)) await reloadAppAsync().catch(() => undefined);
    });
  }, []);

  const setReminders = useCallback((on: boolean) => {
    setRemindersState(on);
    void save({ reminders: on });
  }, []);

  const scheme: 'light' | 'dark' = themeMode === 'system' ? (system === 'dark' ? 'dark' : 'light') : themeMode;

  const value = useMemo<Preferences>(
    () => ({ themeMode, scheme, language, reminders, ready, setThemeMode, setLanguage, setReminders }),
    [language, ready, reminders, scheme, setLanguage, setReminders, setThemeMode, themeMode],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider.');
  return ctx;
}

/** The scheme to draw with: the person's choice, or the device setting. */
export function useScheme(): 'light' | 'dark' {
  const ctx = useContext(PreferencesContext);
  const system = useColorScheme();
  return ctx?.scheme ?? (system === 'dark' ? 'dark' : 'light');
}
