import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  AppearanceTheme,
  CustomAppBackground,
  CustomBackgroundHistoryItem,
  CustomThemeMix,
  SavedThemeMix,
  ThemeMixCardStyle,
  ThemeMixCornerRoundness,
  ThemeMixFontFamily,
  ThemeMixChatBubbleStyle,
  ThemeMixNavBarStyle
} from '../types';
import { useAuth } from './AuthContext';
import { useDataSaver } from '../services/dataSaverService';
import { computeEffectiveTextMode } from '../utils/mediaStorage';

export const THEME_MIX_ACCENT_PRESETS: Array<{ hex: string; label: string }> = [
  { hex: '#2563EB', label: 'Ocean Blue' },
  { hex: '#0D9488', label: 'Lagoon Teal' },
  { hex: '#E11D48', label: 'Rose Crimson' },
  { hex: '#EC4899', label: 'Hot Pink' },
  { hex: '#8B5CF6', label: 'Royal Violet' },
  { hex: '#06B6D4', label: 'Electric Cyan' },
  { hex: '#10B981', label: 'Emerald Mint' },
  { hex: '#22C55E', label: 'Neon Green' },
  { hex: '#EA580C', label: 'Sunset Orange' },
  { hex: '#F59E0B', label: 'Solar Amber' },
  { hex: '#EF4444', label: 'Nitro Red' },
  { hex: '#6366F1', label: 'Indigo Pulse' }
];

export const THEME_MIX_FONTS: Record<
  ThemeMixFontFamily,
  { label: string; cssFamily: string; sample: string }
> = {
  jakarta: {
    label: 'Plus Jakarta Sans',
    cssFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: 'Clean & geometric'
  },
  outfit: {
    label: 'Outfit',
    cssFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: 'Modern & friendly'
  },
  space: {
    label: 'Space Grotesk',
    cssFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: 'Tech & expressive'
  },
  playfair: {
    label: 'Playfair Display',
    cssFamily: "'Playfair Display', Georgia, serif",
    sample: 'Editorial serif'
  }
};

function sanitizeHexColor(raw?: string | null, fallback = '#2563EB'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

/**
 * Compute relative luminance (0..1) and WCAG contrast to pick readable button text (#FFFFFF or #0F172A)
 * and ensure the accent color itself remains readable on the current dark/light canvas.
 */
export function evaluateAccentContrast(
  hexColor: string,
  isDarkCanvas: boolean
): {
  buttonTextColor: '#FFFFFF' | '#0F172A';
  readableAccentText: string;
  contrastRatioOnButton: number;
  wasAutoAdjusted: boolean;
} {
  const hex = sanitizeHexColor(hexColor);
  const r8 = parseInt(hex.slice(1, 3), 16);
  const g8 = parseInt(hex.slice(3, 5), 16);
  const b8 = parseInt(hex.slice(5, 7), 16);

  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const lum = 0.2126 * toLinear(r8) + 0.7152 * toLinear(g8) + 0.0722 * toLinear(b8);
  const contrastWithWhite = (1.0 + 0.05) / (lum + 0.05);
  const contrastWithDark = (lum + 0.05) / (0.015 + 0.05);

  const buttonTextColor: '#FFFFFF' | '#0F172A' =
    contrastWithWhite >= 3.2 || contrastWithWhite >= contrastWithDark ? '#FFFFFF' : '#0F172A';
  const contrastRatioOnButton = Math.round(
    Math.max(contrastWithWhite, contrastWithDark) * 10
  ) / 10;

  // Ensure accent text on surface has sufficient contrast
  let readableAccentText = hex;
  let wasAutoAdjusted = false;
  if (isDarkCanvas && lum < 0.14) {
    // Lighten overly dark accent when used as text on dark canvas
    const lift = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.48));
    readableAccentText = `#${lift(r8).toString(16).padStart(2, '0')}${lift(g8)
      .toString(16)
      .padStart(2, '0')}${lift(b8).toString(16).padStart(2, '0')}`.toUpperCase();
    wasAutoAdjusted = true;
  } else if (!isDarkCanvas && lum > 0.62) {
    // Darken overly pale accent when used as text on light canvas
    const darken = (v: number) => Math.max(0, Math.round(v * 0.58));
    readableAccentText = `#${darken(r8).toString(16).padStart(2, '0')}${darken(g8)
      .toString(16)
      .padStart(2, '0')}${darken(b8).toString(16).padStart(2, '0')}`.toUpperCase();
    wasAutoAdjusted = true;
  }

  return {
    buttonTextColor,
    readableAccentText,
    contrastRatioOnButton,
    wasAutoAdjusted
  };
}

export function normalizeCustomThemeMix(
  raw?: Partial<CustomThemeMix> | null,
  fallbackBaseTheme: AppearanceTheme = 'ocean'
): CustomThemeMix | null {
  if (!raw || typeof raw !== 'object') return null;
  const baseTheme = normalizeAppearanceTheme(raw.baseTheme || fallbackBaseTheme);
  const meta = APPEARANCE_THEMES.find((t) => t.id === baseTheme) || APPEARANCE_THEMES[0];
  const accentColor = sanitizeHexColor(raw.accentColor, meta.previewAccent);

  const validCards: ThemeMixCardStyle[] = ['glass', 'solid', 'outline'];
  const cardStyle: ThemeMixCardStyle = validCards.includes(raw.cardStyle as ThemeMixCardStyle)
    ? (raw.cardStyle as ThemeMixCardStyle)
    : 'glass';

  const validCorners: ThemeMixCornerRoundness[] = ['sharp', 'medium', 'round'];
  const cornerRoundness: ThemeMixCornerRoundness = validCorners.includes(
    raw.cornerRoundness as ThemeMixCornerRoundness
  )
    ? (raw.cornerRoundness as ThemeMixCornerRoundness)
    : 'round';

  const validFonts: ThemeMixFontFamily[] = ['jakarta', 'outfit', 'space', 'playfair'];
  const fontFamily: ThemeMixFontFamily = validFonts.includes(raw.fontFamily as ThemeMixFontFamily)
    ? (raw.fontFamily as ThemeMixFontFamily)
    : 'jakarta';

  const validBubbles: ThemeMixChatBubbleStyle[] = ['modern', 'rounded', 'minimal', 'glass'];
  const chatBubbleStyle: ThemeMixChatBubbleStyle = validBubbles.includes(
    raw.chatBubbleStyle as ThemeMixChatBubbleStyle
  )
    ? (raw.chatBubbleStyle as ThemeMixChatBubbleStyle)
    : 'modern';

  const validNavs: ThemeMixNavBarStyle[] = ['floating', 'solid', 'minimal', 'bordered'];
  const navBarStyle: ThemeMixNavBarStyle = validNavs.includes(raw.navBarStyle as ThemeMixNavBarStyle)
    ? (raw.navBarStyle as ThemeMixNavBarStyle)
    : 'floating';

  return {
    baseTheme,
    accentColor,
    cardStyle,
    cornerRoundness,
    fontFamily,
    chatBubbleStyle,
    navBarStyle,
    ...(raw.name && typeof raw.name === 'string' ? { name: raw.name.slice(0, 40) } : {}),
    ...(raw.updatedAt && typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {})
  };
}

/**
 * Encode a CustomThemeMix into a short, safe share code (contains ONLY colors and style tokens, never images or personal data).
 */
export function encodeShareableThemeMix(mix: CustomThemeMix): string {
  const clean = normalizeCustomThemeMix(mix);
  if (!clean) return '';
  const compactPayload = {
    b: clean.baseTheme,
    a: clean.accentColor,
    c: clean.cardStyle,
    r: clean.cornerRoundness,
    f: clean.fontFamily,
    m: clean.chatBubbleStyle,
    n: clean.navBarStyle,
    ...(clean.name ? { t: clean.name.slice(0, 28) } : {})
  };
  try {
    const json = JSON.stringify(compactPayload);
    const b64 = btoa(encodeURIComponent(json))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `WL-${b64}`;
  } catch {
    return '';
  }
}

/**
 * Decode a shared theme code or URL containing ?themeMix=...
 */
export function decodeShareableThemeMix(input: string): CustomThemeMix | null {
  if (!input || typeof input !== 'string') return null;
  let token = input.trim();
  try {
    if (token.includes('themeMix=')) {
      const urlObj = new URL(token, window.location.origin);
      token = urlObj.searchParams.get('themeMix') || token;
    }
  } catch {
    const match = token.match(/[?&]themeMix=([^&#\s]+)/);
    if (match?.[1]) token = decodeURIComponent(match[1]);
  }
  if (token.startsWith('WL-')) {
    token = token.slice(3);
  }
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(atob(padded));
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeCustomThemeMix({
      baseTheme: parsed.b || parsed.baseTheme,
      accentColor: parsed.a || parsed.accentColor,
      cardStyle: parsed.c || parsed.cardStyle,
      cornerRoundness: parsed.r || parsed.cornerRoundness,
      fontFamily: parsed.f || parsed.fontFamily,
      chatBubbleStyle: parsed.m || parsed.chatBubbleStyle,
      navBarStyle: parsed.n || parsed.navBarStyle,
      name: typeof (parsed.t || parsed.name) === 'string' ? (parsed.t || parsed.name).slice(0, 28) : undefined
    });
  } catch {
    return null;
  }
}

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
  // Mix your own theme (Free for everyone)
  customThemeMix: CustomThemeMix | null;
  previewThemeMix: CustomThemeMix | null;
  activeThemeMix: CustomThemeMix | null;
  savedThemeMixes: SavedThemeMix[];
  sharedThemeMixCandidate: CustomThemeMix | null;
  isSavingThemeMix: boolean;
  setPreviewThemeMix: (mix: CustomThemeMix | null) => void;
  saveCustomThemeMix: (mix: CustomThemeMix) => Promise<SaveThemeResult>;
  resetCustomThemeMix: () => Promise<SaveThemeResult>;
  saveAsNewThemeMix: (mix: CustomThemeMix, name: string) => Promise<SaveThemeResult>;
  deleteSavedThemeMix: (id: string) => Promise<SaveThemeResult>;
  dismissSharedThemeMixCandidate: () => void;
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
  customThemeMix: null,
  previewThemeMix: null,
  activeThemeMix: null,
  savedThemeMixes: [],
  sharedThemeMixCandidate: null,
  isSavingThemeMix: false,
  setPreviewThemeMix: () => {},
  saveCustomThemeMix: async () => ({ success: true }),
  resetCustomThemeMix: async () => ({ success: true }),
  saveAsNewThemeMix: async () => ({ success: true }),
  deleteSavedThemeMix: async () => ({ success: true }),
  dismissSharedThemeMixCandidate: () => {},
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

  // Mix your own theme state (free for everyone)
  const [customThemeMix, setCustomThemeMixState] = useState<CustomThemeMix | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('wavelink_custom_theme_mix');
        if (raw) return normalizeCustomThemeMix(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
    return null;
  });
  const [previewThemeMix, setPreviewThemeMixState] = useState<CustomThemeMix | null>(null);
  const [savedThemeMixes, setSavedThemeMixesState] = useState<SavedThemeMix[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('wavelink_saved_theme_mixes');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.slice(0, 3);
        }
      } catch {
        // ignore
      }
    }
    return [];
  });
  const [sharedThemeMixCandidate, setSharedThemeMixCandidate] = useState<CustomThemeMix | null>(null);
  const [isSavingThemeMix, setIsSavingThemeMix] = useState(false);

  // Detect ?themeMix=... in URL on boot so a friend opening a shared link can preview and save it
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('themeMix');
    if (!code) return;
    const decoded = decodeShareableThemeMix(code);
    if (decoded) {
      setSharedThemeMixCandidate(decoded);
      setPreviewThemeMixState(decoded);
      // Clean URL query parameter without reloading
      params.delete('themeMix');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

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

  const pendingThemeMixSaveRef = useRef<{
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

  // Sync customThemeMix and savedThemeMixes from existing userProfile snapshot (zero extra reads)
  useEffect(() => {
    if (!currentUser?.uid || !userProfile) return;
    const pendingMix = pendingThemeMixSaveRef.current;
    if (pendingMix && (pendingMix.inFlight || Date.now() - pendingMix.savedAt < 12000)) {
      return;
    }

    const remoteMix = userProfile.customThemeMix
      ? normalizeCustomThemeMix(userProfile.customThemeMix)
      : null;
    const remoteSaved = Array.isArray(userProfile.savedThemeMixes)
      ? userProfile.savedThemeMixes
          .map((item) => {
            const norm = normalizeCustomThemeMix(item);
            if (!norm) return null;
            return {
              ...norm,
              id: typeof item.id === 'string' ? item.id : `mix_${Date.now()}`,
              name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 32) : 'My Mix',
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString()
            } as SavedThemeMix;
          })
          .filter((x): x is SavedThemeMix => Boolean(x))
          .slice(0, 3)
      : [];

    setCustomThemeMixState(remoteMix);
    setSavedThemeMixesState(remoteSaved);
    try {
      if (remoteMix) {
        localStorage.setItem('wavelink_custom_theme_mix', JSON.stringify(remoteMix));
      } else {
        localStorage.removeItem('wavelink_custom_theme_mix');
      }
      localStorage.setItem('wavelink_saved_theme_mixes', JSON.stringify(remoteSaved));
    } catch {
      // ignore storage errors
    }
  }, [currentUser?.uid, userProfile?.customThemeMix, userProfile?.savedThemeMixes]);

  // Sync from user profile in Firestore ONLY when no newer local selection is in-flight / recently saved / failed
  useEffect(() => {
    if (!userProfile?.appearanceTheme) return;
    const remoteTheme = normalizeAppearanceTheme(userProfile.appearanceTheme);
    const pending = pendingSaveRef.current;

    if (pending) {
      if (pending.failed && remoteTheme !== pending.theme) {
        return;
      }
      if (
        (pending.inFlight || Date.now() - pending.savedAt < 15000) &&
        remoteTheme !== pending.theme
      ) {
        return;
      }
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

  const activeThemeMix: CustomThemeMix | null = previewThemeMix !== null ? previewThemeMix : customThemeMix;
  const activeTheme: AppearanceTheme =
    previewTheme || (activeThemeMix ? activeThemeMix.baseTheme : appearanceTheme);
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

  // Apply active theme + custom background mode/contrast + Mix Your Own Theme CSS variables to <html> immediately
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

    if (activeThemeMix) {
      const contrast = evaluateAccentContrast(activeThemeMix.accentColor, effectiveDarkMode);
      const fontMeta = THEME_MIX_FONTS[activeThemeMix.fontFamily] || THEME_MIX_FONTS.jakarta;
      const radiusPx =
        activeThemeMix.cornerRoundness === 'sharp'
          ? '10px'
          : activeThemeMix.cornerRoundness === 'medium'
          ? '18px'
          : '26px';
      const btnRadiusPx =
        activeThemeMix.cornerRoundness === 'sharp'
          ? '8px'
          : activeThemeMix.cornerRoundness === 'medium'
          ? '14px'
          : '9999px';

      root.setAttribute('data-has-theme-mix', 'true');
      root.setAttribute('data-card-style', activeThemeMix.cardStyle);
      root.setAttribute('data-corner-roundness', activeThemeMix.cornerRoundness);
      root.setAttribute('data-theme-font', activeThemeMix.fontFamily);
      root.setAttribute('data-chat-bubble-style', activeThemeMix.chatBubbleStyle);
      root.setAttribute('data-nav-style', activeThemeMix.navBarStyle);

      root.style.setProperty('--accent-primary', activeThemeMix.accentColor);
      root.style.setProperty('--accent-readable-text', contrast.readableAccentText);
      root.style.setProperty('--accent-contrast-text', contrast.buttonTextColor);
      root.style.setProperty('--mix-card-radius', radiusPx);
      root.style.setProperty('--mix-btn-radius', btnRadiusPx);
      root.style.setProperty('--mix-font-family', fontMeta.cssFamily);
    } else {
      root.removeAttribute('data-has-theme-mix');
      root.removeAttribute('data-card-style');
      root.removeAttribute('data-corner-roundness');
      root.removeAttribute('data-theme-font');
      root.removeAttribute('data-chat-bubble-style');
      root.removeAttribute('data-nav-style');

      root.style.removeProperty('--accent-primary');
      root.style.removeProperty('--accent-readable-text');
      root.style.removeProperty('--accent-contrast-text');
      root.style.removeProperty('--mix-card-radius');
      root.style.removeProperty('--mix-btn-radius');
      root.style.removeProperty('--mix-font-family');
    }
  }, [activeTheme, effectiveDarkMode, isCustomBackgroundActive, customBgContrast, activeThemeMix]);

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

  const setPreviewThemeMix = useCallback((mix: CustomThemeMix | null) => {
    setPreviewThemeMixState(mix ? normalizeCustomThemeMix(mix) : null);
  }, []);

  const dismissSharedThemeMixCandidate = useCallback(() => {
    setSharedThemeMixCandidate(null);
    setPreviewThemeMixState(null);
  }, []);

  const saveCustomThemeMix = useCallback(
    async (mix: CustomThemeMix): Promise<SaveThemeResult> => {
      const normalized = normalizeCustomThemeMix(mix, appearanceTheme);
      if (!normalized) {
        return { success: false, error: 'Invalid theme configuration.' };
      }
      const withTimestamp: CustomThemeMix = {
        ...normalized,
        updatedAt: new Date().toISOString()
      };

      pendingThemeMixSaveRef.current = { inFlight: true, savedAt: Date.now() };
      setPreviewThemeMixState(null);
      setPreviewThemeState(null);
      setSharedThemeMixCandidate(null);
      setCustomThemeMixState(withTimestamp);
      setAppearanceThemeState(withTimestamp.baseTheme);

      try {
        localStorage.setItem('wavelink_custom_theme_mix', JSON.stringify(withTimestamp));
        localStorage.setItem('wavelink_appearance_theme', withTimestamp.baseTheme);
      } catch {
        // ignore storage errors
      }

      if (!currentUser?.uid) {
        pendingThemeMixSaveRef.current = null;
        return { success: true };
      }

      setIsSavingThemeMix(true);
      try {
        await updateUserProfile({
          appearanceTheme: withTimestamp.baseTheme,
          customThemeMix: withTimestamp
        });
        if (pendingThemeMixSaveRef.current) {
          pendingThemeMixSaveRef.current.inFlight = false;
          pendingThemeMixSaveRef.current.savedAt = Date.now();
        }
        return { success: true };
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to save custom theme mix.';
        setThemeSaveError(msg);
        return { success: false, error: msg };
      } finally {
        setIsSavingThemeMix(false);
      }
    },
    [appearanceTheme, currentUser?.uid, updateUserProfile]
  );

  const resetCustomThemeMix = useCallback(async (): Promise<SaveThemeResult> => {
    pendingThemeMixSaveRef.current = { inFlight: true, savedAt: Date.now() };
    setPreviewThemeMixState(null);
    setSharedThemeMixCandidate(null);
    setCustomThemeMixState(null);
    try {
      localStorage.removeItem('wavelink_custom_theme_mix');
    } catch {
      // ignore
    }

    if (!currentUser?.uid) {
      pendingThemeMixSaveRef.current = null;
      return { success: true };
    }

    setIsSavingThemeMix(true);
    try {
      await updateUserProfile({ customThemeMix: null });
      if (pendingThemeMixSaveRef.current) {
        pendingThemeMixSaveRef.current.inFlight = false;
        pendingThemeMixSaveRef.current.savedAt = Date.now();
      }
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to reset custom theme mix.';
      return { success: false, error: msg };
    } finally {
      setIsSavingThemeMix(false);
    }
  }, [currentUser?.uid, updateUserProfile]);

  const saveAsNewThemeMix = useCallback(
    async (mix: CustomThemeMix, name: string): Promise<SaveThemeResult> => {
      const normalized = normalizeCustomThemeMix(mix, appearanceTheme);
      if (!normalized) {
        return { success: false, error: 'Invalid theme configuration.' };
      }
      const cleanName = (name || 'My Custom Theme').trim().slice(0, 32) || 'My Custom Theme';
      const nowIso = new Date().toISOString();
      const newEntry: SavedThemeMix = {
        ...normalized,
        id: `mix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // Keep up to 3 saved themes (if already 3, replace oldest or same name)
      const withoutSameName = savedThemeMixes.filter(
        (m) => m.name.toLowerCase() !== cleanName.toLowerCase()
      );
      const nextSaved = [newEntry, ...withoutSameName].slice(0, 3);

      pendingThemeMixSaveRef.current = { inFlight: true, savedAt: Date.now() };
      setPreviewThemeMixState(null);
      setSharedThemeMixCandidate(null);
      setCustomThemeMixState(newEntry);
      setSavedThemeMixesState(nextSaved);
      setAppearanceThemeState(newEntry.baseTheme);

      try {
        localStorage.setItem('wavelink_custom_theme_mix', JSON.stringify(newEntry));
        localStorage.setItem('wavelink_saved_theme_mixes', JSON.stringify(nextSaved));
        localStorage.setItem('wavelink_appearance_theme', newEntry.baseTheme);
      } catch {
        // ignore
      }

      if (!currentUser?.uid) {
        pendingThemeMixSaveRef.current = null;
        return { success: true };
      }

      setIsSavingThemeMix(true);
      try {
        await updateUserProfile({
          appearanceTheme: newEntry.baseTheme,
          customThemeMix: newEntry,
          savedThemeMixes: nextSaved
        });
        if (pendingThemeMixSaveRef.current) {
          pendingThemeMixSaveRef.current.inFlight = false;
          pendingThemeMixSaveRef.current.savedAt = Date.now();
        }
        return { success: true };
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to save new theme preset.';
        return { success: false, error: msg };
      } finally {
        setIsSavingThemeMix(false);
      }
    },
    [appearanceTheme, currentUser?.uid, savedThemeMixes, updateUserProfile]
  );

  const deleteSavedThemeMix = useCallback(
    async (id: string): Promise<SaveThemeResult> => {
      const nextSaved = savedThemeMixes.filter((m) => m.id !== id);
      pendingThemeMixSaveRef.current = { inFlight: true, savedAt: Date.now() };
      setSavedThemeMixesState(nextSaved);
      try {
        localStorage.setItem('wavelink_saved_theme_mixes', JSON.stringify(nextSaved));
      } catch {
        // ignore
      }
      if (!currentUser?.uid) {
        pendingThemeMixSaveRef.current = null;
        return { success: true };
      }
      setIsSavingThemeMix(true);
      try {
        await updateUserProfile({ savedThemeMixes: nextSaved });
        if (pendingThemeMixSaveRef.current) {
          pendingThemeMixSaveRef.current.inFlight = false;
          pendingThemeMixSaveRef.current.savedAt = Date.now();
        }
        return { success: true };
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to delete saved theme.';
        return { success: false, error: msg };
      } finally {
        setIsSavingThemeMix(false);
      }
    },
    [currentUser?.uid, savedThemeMixes, updateUserProfile]
  );

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
        customThemeMix,
        previewThemeMix,
        activeThemeMix,
        savedThemeMixes,
        sharedThemeMixCandidate,
        isSavingThemeMix,
        setPreviewThemeMix,
        saveCustomThemeMix,
        resetCustomThemeMix,
        saveAsNewThemeMix,
        deleteSavedThemeMix,
        dismissSharedThemeMixCandidate,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
