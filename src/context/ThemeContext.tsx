import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppearanceTheme } from '../types';
import { useAuth } from './AuthContext';

export interface AppearanceThemeMetadata {
  id: AppearanceTheme;
  name: string;
  nameSw: string;
  description: string;
  descriptionSw: string;
  emoji: string;
  isDark: boolean;
  proOnly: boolean;
  previewBg: string;
  previewCard: string;
  previewText: string;
  previewAccent: string;
  previewSecondary: string;
  previewGradient: string;
}

export const APPEARANCE_THEMES: AppearanceThemeMetadata[] = [
  {
    id: 'ocean',
    name: 'Ocean Waves',
    nameSw: 'Mawimbi ya Bahari',
    description: 'WaveLink default — crisp ocean breeze with signature blue & teal waves',
    descriptionSw: 'Chaguo kuu la WaveLink — rangi za buluu na kijani cha bahari',
    emoji: '🌊',
    isDark: false,
    proOnly: false,
    previewBg: '#F0F7FF',
    previewCard: '#FFFFFF',
    previewText: '#0F172A',
    previewAccent: '#2563EB',
    previewSecondary: '#0D9488',
    previewGradient: 'linear-gradient(135deg, #E0F2FE 0%, #F0FDFA 55%, #EFF6FF 100%)'
  },
  {
    id: 'hearts',
    name: 'Hearts',
    nameSw: 'Mioyo ya Waridi',
    description: 'Soft pastel pink canvas with gentle floating hearts & rose accents',
    descriptionSw: 'Rangi laini ya waridi yenye mioyo inayoelea kwa upole',
    emoji: '💖',
    isDark: false,
    proOnly: false,
    previewBg: '#FFF1F5',
    previewCard: '#FFFFFF',
    previewText: '#3B0A1E',
    previewAccent: '#E11D48',
    previewSecondary: '#EC4899',
    previewGradient: 'linear-gradient(135deg, #FFE4EC 0%, #FFF1F5 50%, #FCE7F3 100%)'
  },
  {
    id: 'midnight',
    name: 'Midnight Black',
    nameSw: 'Usiku wa Manane',
    description: 'Sleek carbon-fiber dark surface with crisp high-contrast silver & blue',
    descriptionSw: 'Muonekano mweusi wa kisasa wenye maandishi yanayosomeka vizuri',
    emoji: '🖤',
    isDark: true,
    proOnly: false,
    previewBg: '#090D16',
    previewCard: '#131B2E',
    previewText: '#F8FAFC',
    previewAccent: '#3B82F6',
    previewSecondary: '#14B8A6',
    previewGradient: 'linear-gradient(135deg, #090D16 0%, #111827 55%, #1E293B 100%)'
  },
  {
    id: 'neon',
    name: 'Neon Gaming',
    nameSw: 'Neon ya Michezo',
    description: 'Cyberpunk arena with electric cyan, neon magenta & glowing grid lines',
    descriptionSw: 'Muonekano wa michezo wenye mwanga wa neon ya samawati na zambarau',
    emoji: '🎮',
    isDark: true,
    proOnly: false,
    previewBg: '#070913',
    previewCard: '#121629',
    previewText: '#F0FDF4',
    previewAccent: '#06B6D4',
    previewSecondary: '#EC4899',
    previewGradient: 'linear-gradient(135deg, #070913 0%, #16113A 55%, #082F49 100%)'
  },
  {
    id: 'camo',
    name: 'Camo',
    nameSw: 'Kombati ya Msitu',
    description: 'Tactical woodland olive & ranger green with warm sand readability',
    descriptionSw: 'Muonekano wa kijani cha msitu na mchanga wenye maandishi wazi',
    emoji: '🌿',
    isDark: true,
    proOnly: false,
    previewBg: '#141E15',
    previewCard: '#1E2D20',
    previewText: '#F4F7F2',
    previewAccent: '#22C55E',
    previewSecondary: '#D97706',
    previewGradient: 'linear-gradient(135deg, #141E15 0%, #233324 50%, #2B3A28 100%)'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    nameSw: 'Machweo ya Jua',
    description: 'Warm golden-hour horizon with coral, peach & amber sunbeams',
    descriptionSw: 'Rangi za machweo ya jua zenye joto la chungwa na dhahabu',
    emoji: '🌅',
    isDark: false,
    proOnly: false,
    previewBg: '#FFF5F0',
    previewCard: '#FFFFFF',
    previewText: '#2A120A',
    previewAccent: '#EA580C',
    previewSecondary: '#E11D48',
    previewGradient: 'linear-gradient(135deg, #FFEDD5 0%, #FFE4E6 55%, #FEF3C7 100%)'
  },
  {
    id: 'flowers',
    name: 'Flowers',
    nameSw: 'Bustani ya Maua',
    description: 'Fresh botanical garden with delicate blossom petals & sage leaves',
    descriptionSw: 'Bustani tulivu yenye maua maridadi na kijani laini',
    emoji: '🌸',
    isDark: false,
    proOnly: false,
    previewBg: '#FDF8FF',
    previewCard: '#FFFFFF',
    previewText: '#1E1B2E',
    previewAccent: '#DB2777',
    previewSecondary: '#0D9488',
    previewGradient: 'linear-gradient(135deg, #FCE7F3 0%, #F3E8FF 50%, #ECFDF5 100%)'
  },
  {
    id: 'racing',
    name: 'Racing',
    nameSw: 'Mbio za Magari',
    description: 'Motorsport asphalt with checkered flag motif & nitro crimson stripes',
    descriptionSw: 'Muonekano wa mbio za magari wenye mistari myeusi na myekundu',
    emoji: '🏎️',
    isDark: true,
    proOnly: false,
    previewBg: '#0C0D12',
    previewCard: '#181A24',
    previewText: '#F8FAFC',
    previewAccent: '#EF4444',
    previewSecondary: '#F59E0B',
    previewGradient: 'linear-gradient(135deg, #0C0D12 0%, #1F1218 55%, #181A24 100%)'
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    nameSw: 'Anga ya Nyota',
    description: 'Deep cosmic nebula with twinkling starlight, violet & indigo aurora',
    descriptionSw: 'Anga ya mbali yenye nyota zinazong’aa na rangi za zambarau',
    emoji: '🌌',
    isDark: true,
    proOnly: false,
    previewBg: '#08071B',
    previewCard: '#141233',
    previewText: '#F5F3FF',
    previewAccent: '#8B5CF6',
    previewSecondary: '#06B6D4',
    previewGradient: 'linear-gradient(135deg, #08071B 0%, #1E1B4B 50%, #311042 100%)'
  }
];

const VALID_THEMES: AppearanceTheme[] = [
  'ocean',
  'hearts',
  'midnight',
  'neon',
  'camo',
  'sunset',
  'flowers',
  'racing',
  'galaxy',
  'classic',
  'savanna',
  'zanzibar',
  'kilimanjaro',
  'river',
  'sunrise'
];

const DARK_THEMES = new Set<AppearanceTheme>([
  'midnight',
  'neon',
  'camo',
  'racing',
  'galaxy'
]);

export function isDarkAppearanceTheme(theme: AppearanceTheme): boolean {
  return DARK_THEMES.has(theme);
}

export function normalizeAppearanceTheme(raw?: string | null): AppearanceTheme {
  if (!raw) return 'ocean';
  if (raw === 'classic' || raw === 'zanzibar' || raw === 'river') {
    return 'ocean';
  }
  if (raw === 'savanna' || raw === 'kilimanjaro' || raw === 'sunrise') {
    return 'sunset';
  }
  if (VALID_THEMES.includes(raw as AppearanceTheme)) {
    return raw as AppearanceTheme;
  }
  return 'ocean';
}

interface ThemeContextType {
  theme: 'light' | 'dark';
  appearanceTheme: AppearanceTheme;
  previewTheme: AppearanceTheme | null;
  activeTheme: AppearanceTheme;
  isDarkTheme: boolean;
  setAppearanceTheme: (theme: AppearanceTheme) => void;
  setPreviewTheme: (theme: AppearanceTheme | null) => void;
  saveAppearanceTheme: (theme: AppearanceTheme) => Promise<void>;
  toggleTheme: () => void;
  isBatterySaver: boolean;
  setBatterySaver: (enabled: boolean) => void;
  toggleBatterySaver: () => void;
  isLiteMode: boolean;
  setLiteMode: (enabled: boolean) => void;
  toggleLiteMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  appearanceTheme: 'ocean',
  previewTheme: null,
  activeTheme: 'ocean',
  isDarkTheme: false,
  setAppearanceTheme: () => {},
  setPreviewTheme: () => {},
  saveAppearanceTheme: async () => {},
  toggleTheme: () => {},
  isBatterySaver: false,
  setBatterySaver: () => {},
  toggleBatterySaver: () => {},
  isLiteMode: false,
  setLiteMode: () => {},
  toggleLiteMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile, updateUserProfile } = useAuth();

  const [appearanceTheme, setAppearanceThemeState] = useState<AppearanceTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wavelink_appearance_theme');
      if (saved) {
        return normalizeAppearanceTheme(saved);
      }
    }
    return 'ocean';
  });

  const [previewTheme, setPreviewThemeState] = useState<AppearanceTheme | null>(null);

  const [isBatterySaver, setIsBatterySaverState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('wavelink_lite_mode') === 'true' ||
        localStorage.getItem('wavelink_battery_saver') === 'true'
      );
    }
    return false;
  });

  // Sync from user profile in Firestore when loaded
  useEffect(() => {
    if (userProfile?.appearanceTheme) {
      const normalized = normalizeAppearanceTheme(userProfile.appearanceTheme);
      setAppearanceThemeState(normalized);
      localStorage.setItem('wavelink_appearance_theme', normalized);
    }
  }, [userProfile?.appearanceTheme]);

  const activeTheme: AppearanceTheme = previewTheme || appearanceTheme;
  const isDarkTheme = isDarkAppearanceTheme(activeTheme);

  // Apply active theme (saved or live preview) to <html> immediately
  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-theme', activeTheme);
    root.setAttribute('data-theme-mode', isDarkTheme ? 'dark' : 'light');
    if (isDarkTheme) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [activeTheme, isDarkTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isBatterySaver) {
      root.setAttribute('data-battery-saver', 'true');
      root.setAttribute('data-lite-mode', 'true');
    } else {
      root.removeAttribute('data-battery-saver');
      root.removeAttribute('data-lite-mode');
    }
    localStorage.setItem('wavelink_battery_saver', isBatterySaver ? 'true' : 'false');
    localStorage.setItem('wavelink_lite_mode', isBatterySaver ? 'true' : 'false');
  }, [isBatterySaver]);

  const setAppearanceTheme = useCallback((nextTheme: AppearanceTheme) => {
    const normalized = normalizeAppearanceTheme(nextTheme);
    setPreviewThemeState(null);
    setAppearanceThemeState(normalized);
    localStorage.setItem('wavelink_appearance_theme', normalized);
  }, []);

  const setPreviewTheme = useCallback((nextPreview: AppearanceTheme | null) => {
    setPreviewThemeState(nextPreview ? normalizeAppearanceTheme(nextPreview) : null);
  }, []);

  const saveAppearanceTheme = useCallback(
    async (nextTheme: AppearanceTheme) => {
      const normalized = normalizeAppearanceTheme(nextTheme);
      setPreviewThemeState(null);
      setAppearanceThemeState(normalized);
      localStorage.setItem('wavelink_appearance_theme', normalized);
      try {
        await updateUserProfile({ appearanceTheme: normalized });
      } catch (err) {
        console.error('Failed to save appearanceTheme to Firestore:', err);
      }
    },
    [updateUserProfile]
  );

  const toggleTheme = useCallback(() => {
    const order: AppearanceTheme[] = [
      'ocean',
      'hearts',
      'midnight',
      'neon',
      'camo',
      'sunset',
      'flowers',
      'racing',
      'galaxy'
    ];
    const nextIndex = (order.indexOf(appearanceTheme) + 1) % order.length;
    const next = order[nextIndex];
    void saveAppearanceTheme(next);
  }, [appearanceTheme, saveAppearanceTheme]);

  const setBatterySaver = (enabled: boolean) => {
    setIsBatterySaverState(enabled);
  };

  const toggleBatterySaver = () => {
    setIsBatterySaverState((prev) => !prev);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: isDarkTheme ? 'dark' : 'light',
        appearanceTheme,
        previewTheme,
        activeTheme,
        isDarkTheme,
        setAppearanceTheme,
        setPreviewTheme,
        saveAppearanceTheme,
        toggleTheme,
        isBatterySaver,
        setBatterySaver,
        toggleBatterySaver,
        isLiteMode: isBatterySaver,
        setLiteMode: setBatterySaver,
        toggleLiteMode: toggleBatterySaver,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
