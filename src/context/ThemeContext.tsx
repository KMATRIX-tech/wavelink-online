import React, { createContext, useContext, useEffect } from 'react';
import { ThemeMode } from '../types';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'wavelink_theme_pure_white_v3';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Enforce pure white light mode across the entire platform
  const theme: ThemeMode = 'light';
  const isDark = false;

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove('dark');
    body?.classList.remove('dark');
    root.style.backgroundColor = '#FFFFFF';
    root.style.colorScheme = 'light';
    if (body) {
      body.style.backgroundColor = '#FFFFFF';
      body.style.color = '#0F172A';
    }
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
  }, []);

  const setTheme = () => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('dark');
    body?.classList.remove('dark');
    root.style.backgroundColor = '#FFFFFF';
    root.style.colorScheme = 'light';
    if (body) {
      body.style.backgroundColor = '#FFFFFF';
      body.style.color = '#0F172A';
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
