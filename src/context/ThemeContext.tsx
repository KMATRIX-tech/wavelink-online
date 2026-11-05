import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeMode, AppearanceTheme } from '../types';

export interface AppearanceThemeOption {
  id: AppearanceTheme;
  name: string;
  description: string;
  previewBg: string;
  previewAccent: string;
  previewSecondary: string;
  proOnly: boolean;
}

export const APPEARANCE_THEMES: AppearanceThemeOption[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'White and warm cream with friendly blue & teal accents',
    previewBg: '#FAF7F2',
    previewAccent: '#2563EB',
    previewSecondary: '#0D9488',
    proOnly: false,
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    description: 'Warm cream and sunny gold highlights',
    previewBg: '#FEFBF3',
    previewAccent: '#D97706',
    previewSecondary: '#EAB308',
    proOnly: false,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Soft peach, warm orange and gentle coral pink',
    previewBg: '#FFF7F4',
    previewAccent: '#EA580C',
    previewSecondary: '#E11D48',
    proOnly: true,
  },
  {
    id: 'river',
    name: 'River',
    description: 'Refreshing teal, aqua and soft seafoam green',
    previewBg: '#F2FBF9',
    previewAccent: '#0D9488',
    previewSecondary: '#0284C7',
    proOnly: true,
  },
];

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleDarkMode: () => void;
  isDark: boolean;
  appearanceTheme: AppearanceTheme;
  setAppearanceTheme: (next: AppearanceTheme) => void;
  isBatterySaver: boolean;
  setBatterySaver: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const APPEARANCE_STORAGE_KEY = 'wavelink_appearance_theme_v1';
const THEME_MODE_STORAGE_KEY = 'wavelink_theme_mode_v1';
export const BATTERY_SAVER_STORAGE_KEY = 'wavelink_battery_saver_v1';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // default to light
    }
    return 'light';
  });
  const isDark = theme === 'dark';

  const [appearanceTheme, setAppearanceThemeState] = useState<AppearanceTheme>(() => {
    const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY) as AppearanceTheme | null;
    if (saved && ['classic', 'sunset', 'river', 'sunrise'].includes(saved)) {
      return saved;
    }
    return 'classic';
  });

  const [isBatterySaver, setIsBatterySaverState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BATTERY_SAVER_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (isDark) {
      root.classList.add('dark');
      body?.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body?.classList.remove('dark');
      root.setAttribute('data-theme', appearanceTheme);
      root.style.colorScheme = 'light';
    }

    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, appearanceTheme);
      localStorage.setItem(THEME_MODE_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [appearanceTheme, isDark, theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (isBatterySaver) {
      root.setAttribute('data-battery-saver', 'true');
    } else {
      root.removeAttribute('data-battery-saver');
    }
    try {
      localStorage.setItem(BATTERY_SAVER_STORAGE_KEY, isBatterySaver ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wavelink:battery-saver-changed', { detail: { enabled: isBatterySaver } })
      );
    }
  }, [isBatterySaver]);

  const setAppearanceTheme = (next: AppearanceTheme) => {
    if (['classic', 'sunset', 'river', 'sunrise'].includes(next)) {
      setAppearanceThemeState(next);
    }
  };

  const setBatterySaver = (enabled: boolean) => {
    setIsBatterySaverState(Boolean(enabled));
  };

  const setTheme = (nextTheme: ThemeMode) => {
    if (nextTheme === 'dark' || nextTheme === 'light') {
      setThemeState(nextTheme);
    }
  };

  const toggleDarkMode = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleDarkMode,
        isDark,
        appearanceTheme,
        setAppearanceTheme,
        isBatterySaver,
        setBatterySaver,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
