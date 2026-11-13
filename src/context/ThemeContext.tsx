import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  AppearanceTheme,
  CustomAppBackground,
  CustomBackgroundHistoryItem
} from '../types';
import { useAuth } from './AuthContext';
import { useDataSaver } from '../services/dataSaverService';
import { computeEffectiveTextMode } from '../utils/mediaStorage';

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

export interface SaveThemeResult {
  success: boolean;
  error?: string;
}

interface ThemeContextType {
  theme: 'light' | 'dark';
  appearanceTheme: AppearanceTheme;
  previewTheme: AppearanceTheme | null;
  activeTheme: AppearanceTheme;
  isDarkTheme: boolean;
  isSavingTheme: boolean;
  themeSaveError: string | null;
  setAppearanceTheme: (theme: AppearanceTheme) => void;
  setPreviewTheme: (theme: AppearanceTheme | null) => void;
  saveAppearanceTheme: (theme: AppearanceTheme) => Promise<SaveThemeResult>;
  retrySaveTheme: () => Promise<SaveThemeResult>;
  clearThemeSaveError: () => void;
  toggleTheme: () => void;
  isBatterySaver: boolean;
  setBatterySaver: (enabled: boolean) => void;
  toggleBatterySaver: () => void;
  isLiteMode: boolean;
  setLiteMode: (enabled: boolean) => void;
  toggleLiteMode: () => void;
  // Custom app background (Pro only)
  customBackground: CustomAppBackground | null;
  customBackgroundHistory: CustomBackgroundHistoryItem[];
  activeCustomBackground: CustomAppBackground | null;
  isCustomBackgroundActive: boolean;
  customBgContrast: 'light' | 'dark' | null;
  isDataSaverBlockingCustomBg: boolean;
  customBgLoadFailed: boolean;
  isSavingCustomBg: boolean;
  saveCustomBackground: (
    bg: CustomAppBackground,
    options?: { addToHistory?: boolean }
  ) => Promise<SaveThemeResult>;
  selectCustomBackgroundFromHistory: (
    item: CustomBackgroundHistoryItem
  ) => Promise<SaveThemeResult>;
  removeCustomBackground: () => Promise<SaveThemeResult>;
  reportCustomBgLoadError: (failedUrl: string) => void;
  clearCustomBgLoadError: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  appearanceTheme: 'ocean',
  previewTheme: null,
  activeTheme: 'ocean',
  isDarkTheme: false,
  isSavingTheme: false,
  themeSaveError: null,
  setAppearanceTheme: () => {},
  setPreviewTheme: () => {},
  saveAppearanceTheme: async () => ({ success: true }),
  retrySaveTheme: async () => ({ success: true }),
  clearThemeSaveError: () => {},
  toggleTheme: () => {},
  isBatterySaver: false,
  setBatterySaver: () => {},
  toggleBatterySaver: () => {},
  isLiteMode: false,
  setLiteMode: () => {},
  toggleLiteMode: () => {},
  customBackground: null,
  customBackgroundHistory: [],
  activeCustomBackground: null,
  isCustomBackgroundActive: false,
  customBgContrast: null,
  isDataSaverBlockingCustomBg: false,
  customBgLoadFailed: false,
  isSavingCustomBg: false,
  saveCustomBackground: async () => ({ success: true }),
  selectCustomBackgroundFromHistory: async () => ({ success: true }),
  removeCustomBackground: async () => ({ success: true }),
  reportCustomBgLoadError: () => {},
  clearCustomBgLoadError: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, isProEffective, updateUserProfile } = useAuth();
  const { enabled: isDataSaverOn } = useDataSaver();

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
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [themeSaveError, setThemeSaveError] = useState<string | null>(null);

  // Custom app background state (cached locally per-UID for instant zero-read boot)
  const [customBackground, setCustomBackgroundState] = useState<CustomAppBackground | null>(null);
  const [customBackgroundHistory, setCustomBackgroundHistoryState] = useState<CustomBackgroundHistoryItem[]>([]);
  const [isSavingCustomBg, setIsSavingCustomBg] = useState(false);
  const [failedCustomBgUrl, setFailedCustomBgUrl] = useState<string | null>(null);

  // Prevents stale Firestore onSnapshot events from reverting a newly selected theme
  const pendingSaveRef = useRef<{
    theme: AppearanceTheme;
    inFlight: boolean;
    savedAt: number;
    failed: boolean;
  } | null>(null);

  const pendingCustomBgSaveRef = useRef<{
    updatedAt: string;
    bg: CustomAppBackground | null;
    inFlight: boolean;
    savedAt: number;
  } | null>(null);

  const [isBatterySaver, setIsBatterySaverState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('wavelink_lite_mode') === 'true' ||
        localStorage.getItem('wavelink_battery_saver') === 'true'
      );
    }
    return false;
  });

  // Load cached custom background immediately on uid change (zero extra Firestore reads)
  useEffect(() => {
    if (!currentUser?.uid) {
      setCustomBackgroundState(null);
      setCustomBackgroundHistoryState([]);
      setFailedCustomBgUrl(null);
      return;
    }
    try {
      const cachedRaw = localStorage.getItem(`wavelink_custom_bg_${currentUser.uid}`);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.customBackground !== undefined) {
            setCustomBackgroundState(parsed.customBackground || null);
          }
          if (Array.isArray(parsed.customBackgroundHistory)) {
            setCustomBackgroundHistoryState(parsed.customBackgroundHistory.slice(0, 5));
          }
        }
      }
    } catch {
      // ignore local cache read error
    }
  }, [currentUser?.uid]);

  // Sync custom background from existing userProfile snapshot without extra Firestore reads
  useEffect(() => {
    if (!currentUser?.uid || !userProfile) return;
    const pending = pendingCustomBgSaveRef.current;
    const remoteBg = userProfile.customBackground ?? null;
    const remoteHist = Array.isArray(userProfile.customBackgroundHistory)
      ? userProfile.customBackgroundHistory.slice(0, 5)
      : [];

    if (pending) {
      const sameUrl = (remoteBg?.url || null) === (pending.bg?.url || null);
      if ((pending.inFlight || Date.now() - pending.savedAt < 15000) && !sameUrl) {
        return;
      }
      if (sameUrl) {
        pendingCustomBgSaveRef.current = null;
      }
    }

    setCustomBackgroundState(remoteBg);
    setCustomBackgroundHistoryState(remoteHist);
    setFailedCustomBgUrl(null);
    try {
      localStorage.setItem(
        `wavelink_custom_bg_${currentUser.uid}`,
        JSON.stringify({ customBackground: remoteBg, customBackgroundHistory: remoteHist })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [currentUser?.uid, userProfile?.customBackground, userProfile?.customBackgroundHistory]);

  // Sync from user profile in Firestore ONLY when no newer local selection is in-flight / recently saved / failed
  useEffect(() => {
    if (!userProfile?.appearanceTheme) return;
    const remoteTheme = normalizeAppearanceTheme(userProfile.appearanceTheme);
    const pending = pendingSaveRef.current;

    if (pending) {
      // If a Firestore save failed, keep user's local selection until they retry or switch
      if (pending.failed && remoteTheme !== pending.theme) {
        return;
      }
      // While save is in-flight or within 15s grace window waiting for snapshot propagation, ignore older snapshots
      if (
        (pending.inFlight || Date.now() - pending.savedAt < 15000) &&
        remoteTheme !== pending.theme
      ) {
        return;
      }
      // Once Firestore echoes back our newly saved theme, clear the pending lock
      if (remoteTheme === pending.theme) {
        pendingSaveRef.current = null;
      }
    }

    setAppearanceThemeState(remoteTheme);
    try {
      localStorage.setItem('wavelink_appearance_theme', remoteTheme);
    } catch {
      // ignore storage errors
    }
  }, [userProfile?.appearanceTheme]);

  const activeTheme: AppearanceTheme = previewTheme || appearanceTheme;
  const isDarkTheme = isDarkAppearanceTheme(activeTheme);

  const customBgLoadFailed = Boolean(
    customBackground?.url &&
      failedCustomBgUrl &&
      (failedCustomBgUrl === customBackground.url || failedCustomBgUrl === customBackground.mobileUrl)
  );
  const isDataSaverBlockingCustomBg = Boolean(isDataSaverOn && isProEffective && customBackground?.url);
  const isCustomBackgroundActive = Boolean(
    currentUser?.uid &&
      isProEffective &&
      customBackground?.url &&
      !isDataSaverOn &&
      !customBgLoadFailed
  );

  const customBgContrast: 'light' | 'dark' | null = isCustomBackgroundActive && customBackground
    ? typeof customBackground.avgLuminance === 'number'
      ? computeEffectiveTextMode(customBackground.avgLuminance, customBackground.darken)
      : customBackground.textMode === 'light'
      ? 'light'
      : 'dark'
    : null;

  const effectiveDarkMode = isCustomBackgroundActive
    ? customBgContrast === 'dark'
    : isDarkTheme;

  // Apply active theme + custom background mode/contrast to <html> immediately
  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-theme', activeTheme);
    root.setAttribute('data-theme-mode', effectiveDarkMode ? 'dark' : 'light');
    if (effectiveDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (isCustomBackgroundActive && customBgContrast) {
      root.setAttribute('data-has-custom-bg', 'true');
      root.setAttribute('data-custom-bg-contrast', customBgContrast);
    } else {
      root.removeAttribute('data-has-custom-bg');
      root.removeAttribute('data-custom-bg-contrast');
    }
  }, [activeTheme, effectiveDarkMode, isCustomBackgroundActive, customBgContrast]);

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
    try {
      localStorage.setItem('wavelink_appearance_theme', normalized);
    } catch {
      // ignore storage errors
    }
  }, []);

  const setPreviewTheme = useCallback((nextPreview: AppearanceTheme | null) => {
    setPreviewThemeState(nextPreview ? normalizeAppearanceTheme(nextPreview) : null);
  }, []);

  const clearThemeSaveError = useCallback(() => {
    setThemeSaveError(null);
  }, []);

  const saveAppearanceTheme = useCallback(
    async (nextTheme: AppearanceTheme): Promise<SaveThemeResult> => {
      const normalized = normalizeAppearanceTheme(nextTheme);
      pendingSaveRef.current = {
        theme: normalized,
        inFlight: true,
        savedAt: Date.now(),
        failed: false
      };
      setPreviewThemeState(null);
      setAppearanceThemeState(normalized);
      setThemeSaveError(null);
      try {
        localStorage.setItem('wavelink_appearance_theme', normalized);
      } catch {
        // ignore storage errors
      }

      if (!currentUser) {
        pendingSaveRef.current.inFlight = false;
        return { success: true };
      }

      setIsSavingTheme(true);
      try {
        await updateUserProfile({ appearanceTheme: normalized });
        if (pendingSaveRef.current && pendingSaveRef.current.theme === normalized) {
          pendingSaveRef.current.inFlight = false;
          pendingSaveRef.current.savedAt = Date.now();
          pendingSaveRef.current.failed = false;
        }
        return { success: true };
      } catch (err: any) {
        const rawMsg =
          err instanceof Error
            ? err.message
            : typeof err?.code === 'string'
            ? err.code
            : 'Failed to save theme to your profile.';
        const friendlyMsg =
          rawMsg.toLowerCase().includes('permission')
            ? `Theme save blocked (${rawMsg}). Check Firestore rules for users/${currentUser.uid} and tap Retry.`
            : `Could not save theme (${rawMsg}). Tap Retry to sync to your account.`;
        console.error('[WaveLink Theme] Failed to save appearanceTheme to Firestore:', err);
        if (pendingSaveRef.current && pendingSaveRef.current.theme === normalized) {
          pendingSaveRef.current.inFlight = false;
          pendingSaveRef.current.failed = true;
        }
        setThemeSaveError(friendlyMsg);
        return { success: false, error: friendlyMsg };
      } finally {
        setIsSavingTheme(false);
      }
    },
    [currentUser, updateUserProfile]
  );

  const retrySaveTheme = useCallback(async (): Promise<SaveThemeResult> => {
    return saveAppearanceTheme(appearanceTheme);
  }, [appearanceTheme, saveAppearanceTheme]);

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

  const saveCustomBackground = useCallback(
    async (
      bg: CustomAppBackground,
      options?: { addToHistory?: boolean }
    ): Promise<SaveThemeResult> => {
      if (!currentUser?.uid) {
        return { success: false, error: 'Please sign in first.' };
      }
      if (!isProEffective) {
        return { success: false, error: 'Custom backgrounds are a Pro feature.' };
      }

      const nowIso = new Date().toISOString();
      const normalizedBg: CustomAppBackground = {
        ...bg,
        darken: Math.max(0, Math.min(70, Math.round(bg.darken ?? 25))),
        blur: Math.max(0, Math.min(12, Math.round(bg.blur ?? 0))),
        updatedAt: nowIso
      };

      const shouldAddHistory = options?.addToHistory !== false;
      let nextHistory = customBackgroundHistory;
      if (shouldAddHistory) {
        const historyEntry: CustomBackgroundHistoryItem = {
          id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          url: normalizedBg.url,
          ...(normalizedBg.mobileUrl ? { mobileUrl: normalizedBg.mobileUrl } : {}),
          darken: normalizedBg.darken,
          blur: normalizedBg.blur,
          textMode: normalizedBg.textMode,
          ...(typeof normalizedBg.avgLuminance === 'number'
            ? { avgLuminance: normalizedBg.avgLuminance }
            : {}),
          createdAt: nowIso
        };
        const deduped = customBackgroundHistory.filter((item) => item.url !== normalizedBg.url);
        nextHistory = [historyEntry, ...deduped].slice(0, 5);
      }

      pendingCustomBgSaveRef.current = {
        updatedAt: nowIso,
        bg: normalizedBg,
        inFlight: true,
        savedAt: Date.now()
      };

      setFailedCustomBgUrl(null);
      setCustomBackgroundState(normalizedBg);
      setCustomBackgroundHistoryState(nextHistory);
      try {
        localStorage.setItem(
          `wavelink_custom_bg_${currentUser.uid}`,
          JSON.stringify({ customBackground: normalizedBg, customBackgroundHistory: nextHistory })
        );
      } catch {
        // ignore storage errors
      }

      setIsSavingCustomBg(true);
      try {
        await updateUserProfile({
          customBackground: normalizedBg,
          ...(shouldAddHistory ? { customBackgroundHistory: nextHistory } : {})
        });
        if (pendingCustomBgSaveRef.current?.updatedAt === nowIso) {
          pendingCustomBgSaveRef.current.inFlight = false;
          pendingCustomBgSaveRef.current.savedAt = Date.now();
        }
        return { success: true };
      } catch (err: any) {
        const msg =
          err instanceof Error ? err.message : 'Could not save custom background to your profile.';
        if (pendingCustomBgSaveRef.current?.updatedAt === nowIso) {
          pendingCustomBgSaveRef.current = null;
        }
        return { success: false, error: msg };
      } finally {
        setIsSavingCustomBg(false);
      }
    },
    [currentUser?.uid, isProEffective, customBackgroundHistory, updateUserProfile]
  );

  const selectCustomBackgroundFromHistory = useCallback(
    async (item: CustomBackgroundHistoryItem): Promise<SaveThemeResult> => {
      return saveCustomBackground(
        {
          url: item.url,
          ...(item.mobileUrl ? { mobileUrl: item.mobileUrl } : {}),
          darken: item.darken,
          blur: item.blur,
          textMode: item.textMode,
          ...(typeof item.avgLuminance === 'number' ? { avgLuminance: item.avgLuminance } : {})
        },
        { addToHistory: false }
      );
    },
    [saveCustomBackground]
  );

  const removeCustomBackground = useCallback(async (): Promise<SaveThemeResult> => {
    if (!currentUser?.uid) {
      return { success: false, error: 'Please sign in first.' };
    }
    const nowIso = new Date().toISOString();
    pendingCustomBgSaveRef.current = {
      updatedAt: nowIso,
      bg: null,
      inFlight: true,
      savedAt: Date.now()
    };

    setFailedCustomBgUrl(null);
    setCustomBackgroundState(null);
    try {
      localStorage.setItem(
        `wavelink_custom_bg_${currentUser.uid}`,
        JSON.stringify({ customBackground: null, customBackgroundHistory })
      );
    } catch {
      // ignore storage errors
    }

    setIsSavingCustomBg(true);
    try {
      await updateUserProfile({ customBackground: null });
      if (pendingCustomBgSaveRef.current?.updatedAt === nowIso) {
        pendingCustomBgSaveRef.current.inFlight = false;
        pendingCustomBgSaveRef.current.savedAt = Date.now();
      }
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Could not remove custom background.';
      if (pendingCustomBgSaveRef.current?.updatedAt === nowIso) {
        pendingCustomBgSaveRef.current = null;
      }
      return { success: false, error: msg };
    } finally {
      setIsSavingCustomBg(false);
    }
  }, [currentUser?.uid, customBackgroundHistory, updateUserProfile]);

  const reportCustomBgLoadError = useCallback((failedUrl: string) => {
    setFailedCustomBgUrl(failedUrl);
  }, []);

  const clearCustomBgLoadError = useCallback(() => {
    setFailedCustomBgUrl(null);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveDarkMode ? 'dark' : 'light',
        appearanceTheme,
        previewTheme,
        activeTheme,
        isDarkTheme,
        isSavingTheme,
        themeSaveError,
        setAppearanceTheme,
        setPreviewTheme,
        saveAppearanceTheme,
        retrySaveTheme,
        clearThemeSaveError,
        toggleTheme,
        isBatterySaver,
        setBatterySaver,
        toggleBatterySaver,
        isLiteMode: isBatterySaver,
        setLiteMode: setBatterySaver,
        toggleLiteMode: toggleBatterySaver,
        customBackground,
        customBackgroundHistory,
        activeCustomBackground: isCustomBackgroundActive ? customBackground : null,
        isCustomBackgroundActive,
        customBgContrast,
        isDataSaverBlockingCustomBg,
        customBgLoadFailed,
        isSavingCustomBg,
        saveCustomBackground,
        selectCustomBackgroundFromHistory,
        removeCustomBackground,
        reportCustomBgLoadError,
        clearCustomBgLoadError,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
