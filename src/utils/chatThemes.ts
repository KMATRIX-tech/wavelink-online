import React from 'react';
import {
  AppearanceTheme,
  ChatThemeId,
  ChatThemePreference
} from '../types';
import { normalizeAppearanceTheme } from '../context/ThemeContext';
import {
  Heart,
  Moon,
  Gamepad2,
  Shield,
  Waves,
  Sunset,
  Flower2,
  Flag,
  Sparkles,
  Cloud,
  Trees,
  Circle,
  Palette
} from 'lucide-react';

export interface ChatAccentOption {
  id: string;
  label: string;
  hex: string;
  secondaryHex: string;
}

export const CHAT_ACCENT_PALETTE: ChatAccentOption[] = [
  { id: 'ocean', label: 'Ocean Blue', hex: '#2563EB', secondaryHex: '#0D9488' },
  { id: 'teal', label: 'Lagoon Teal', hex: '#0D9488', secondaryHex: '#0284C7' },
  { id: 'rose', label: 'Rose Pink', hex: '#E11D48', secondaryHex: '#EC4899' },
  { id: 'violet', label: 'Cosmic Violet', hex: '#7C3AED', secondaryHex: '#2563EB' },
  { id: 'amber', label: 'Warm Sunset', hex: '#EA580C', secondaryHex: '#F59E0B' },
  { id: 'emerald', label: 'Forest Green', hex: '#16A34A', secondaryHex: '#0D9488' },
  { id: 'cyan', label: 'Cyber Cyan', hex: '#0891B2', secondaryHex: '#6366F1' },
  { id: 'indigo', label: 'Deep Indigo', hex: '#4F46E5', secondaryHex: '#06B6D4' }
];

export interface ChatThemeOptionMeta {
  id: ChatThemeId;
  name: string;
  tagline: string;
  isDark: boolean;
  animatedPattern: boolean;
  bgCanvas: string;
  bgSurface: string;
  bgSubtle: string;
  textPrimary: string;
  textSecondary: string;
  borderHairline: string;
  defaultAccent: string;
  defaultSecondary: string;
  receivedBg: string;
  receivedText: string;
  receivedBorder: string;
  headerBg: string;
  inputBg: string;
  previewGradient: string;
  patternDataUri?: string;
  patternSize?: string;
  baseGradient: string;
}

const svgToDataUri = (svg: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

const PATTERNS = {
  hearts: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <path d="M32 39c-5-7-16-5-16 4 0 8 16 17 16 17s16-9 16-17c0-9-11-11-16-4z" fill="#e11d48" fill-opacity="0.09"/>
      <path d="M90 82c-4-5.5-12.5-4-12.5 3.2 0 6.5 12.5 13.5 12.5 13.5s12.5-7 12.5-13.5c0-7.2-8.5-8.7-12.5-3.2z" fill="#ec4899" fill-opacity="0.10"/>
      <circle cx="88" cy="28" r="3" fill="#f43f5e" fill-opacity="0.12"/>
      <circle cx="24" cy="96" r="2.5" fill="#ec4899" fill-opacity="0.12"/>
    </svg>`
  ),
  midnight: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <path d="M0 32h64M32 0v64" stroke="#60a5fa" stroke-opacity="0.06" stroke-width="1"/>
      <circle cx="32" cy="32" r="1.5" fill="#93c5fd" fill-opacity="0.14"/>
    </svg>`
  ),
  neon: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <path d="M0 48h96M48 0v96" stroke="#22d3ee" stroke-opacity="0.11" stroke-width="1"/>
      <path d="M0 0l96 96M96 0L0 96" stroke="#f472b6" stroke-opacity="0.05" stroke-width="1"/>
      <circle cx="48" cy="48" r="2.2" fill="#22d3ee" fill-opacity="0.22"/>
    </svg>`
  ),
  camo: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <path d="M18 24c16-8 38-2 46 12 6 11-8 24-24 26-18 2-32-10-30-24 1-6 3-11 8-14z" fill="#4d7c0f" fill-opacity="0.18"/>
      <path d="M98 76c18-10 42-2 48 16 4 12-10 26-28 28-19 2-36-10-32-26 2-8 6-14 12-18z" fill="#3f6212" fill-opacity="0.20"/>
      <path d="M30 112c14-6 32 0 36 12 4 10-8 20-22 20-15 0-24-10-20-20 2-5 3-10 6-12z" fill="#854d0e" fill-opacity="0.13"/>
    </svg>`
  ),
  ocean: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 180 90">
      <path d="M0 30q22.5-14 45 0t45 0 45 0 45 0" fill="none" stroke="#0284c7" stroke-opacity="0.12" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M0 68q22.5-14 45 0t45 0 45 0 45 0" fill="none" stroke="#0d9488" stroke-opacity="0.11" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`
  ),
  sunset: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="46" fill="none" stroke="#ea580c" stroke-opacity="0.09" stroke-width="2"/>
      <circle cx="80" cy="80" r="68" fill="none" stroke="#f59e0b" stroke-opacity="0.08" stroke-width="1.5" stroke-dasharray="6 8"/>
    </svg>`
  ),
  flowers: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
      <g transform="translate(36 36)" fill="#db2777" fill-opacity="0.10">
        <ellipse rx="6" ry="12" transform="rotate(0) translate(0 -9)"/>
        <ellipse rx="6" ry="12" transform="rotate(72) translate(0 -9)"/>
        <ellipse rx="6" ry="12" transform="rotate(144) translate(0 -9)"/>
        <ellipse rx="6" ry="12" transform="rotate(216) translate(0 -9)"/>
        <ellipse rx="6" ry="12" transform="rotate(288) translate(0 -9)"/>
        <circle r="4" fill="#f59e0b" fill-opacity="0.18"/>
      </g>
      <g transform="translate(102 98)" fill="#0d9488" fill-opacity="0.10">
        <ellipse rx="5" ry="10" transform="rotate(20) translate(0 -8)"/>
        <ellipse rx="5" ry="10" transform="rotate(110) translate(0 -8)"/>
        <ellipse rx="5" ry="10" transform="rotate(200) translate(0 -8)"/>
        <ellipse rx="5" ry="10" transform="rotate(290) translate(0 -8)"/>
        <circle r="3.5" fill="#ec4899" fill-opacity="0.16"/>
      </g>
    </svg>`
  ),
  racing: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <rect x="0" y="0" width="20" height="20" fill="#ffffff" fill-opacity="0.035"/>
      <rect x="20" y="20" width="20" height="20" fill="#ffffff" fill-opacity="0.035"/>
      <path d="M-10 70L70 -10M10 90L90 10" stroke="#ef4444" stroke-opacity="0.10" stroke-width="3"/>
    </svg>`
  ),
  galaxy: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
      <circle cx="24" cy="30" r="1.6" fill="#ffffff" fill-opacity="0.55"/>
      <circle cx="96" cy="22" r="1.1" fill="#c4b5fd" fill-opacity="0.50"/>
      <circle cx="128" cy="78" r="1.8" fill="#67e8f9" fill-opacity="0.45"/>
      <circle cx="52" cy="112" r="1.4" fill="#ffffff" fill-opacity="0.45"/>
      <circle cx="110" cy="130" r="1.1" fill="#f9a8d4" fill-opacity="0.45"/>
      <path d="M72 52v10M67 57h10" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`
  ),
  clouds: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160">
      <path d="M22 62c16-14 40-14 54 0 12-10 34-10 46 2 14-8 34-6 44 6" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="18" stroke-linecap="round"/>
      <path d="M-8 134c20-16 48-16 64 0 14-12 38-12 52 2 16-10 40-8 54 4" fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="20" stroke-linecap="round"/>
    </svg>`
  ),
  forest: svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <path d="M36 58l14-26 14 26z" fill="#34d399" fill-opacity="0.11"/>
      <path d="M32 76l18-28 18 28z" fill="#10b981" fill-opacity="0.12"/>
      <path d="M108 118l12-22 12 22z" fill="#34d399" fill-opacity="0.10"/>
      <path d="M104 134l16-24 16 24z" fill="#059669" fill-opacity="0.12"/>
      <circle cx="118" cy="36" r="2.2" fill="#a7f3d0" fill-opacity="0.18"/>
    </svg>`
  )
};

export const CHAT_THEME_OPTIONS: ChatThemeOptionMeta[] = [
  {
    id: 'hearts',
    name: 'Hearts',
    tagline: 'Soft rose & floating hearts',
    isDark: false,
    animatedPattern: true,
    bgCanvas: '#FFF1F5',
    bgSurface: '#FFFFFF',
    bgSubtle: '#FFE4EC',
    textPrimary: '#3B0A1E',
    textSecondary: '#881337',
    borderHairline: '#FBCFE8',
    defaultAccent: '#E11D48',
    defaultSecondary: '#EC4899',
    receivedBg: 'rgba(255, 255, 255, 0.94)',
    receivedText: '#3B0A1E',
    receivedBorder: 'rgba(225, 29, 72, 0.16)',
    headerBg: 'rgba(255, 248, 250, 0.94)',
    inputBg: 'rgba(255, 255, 255, 0.95)',
    previewGradient: 'linear-gradient(135deg, #FFE4EC 0%, #FFF1F5 55%, #FCE7F3 100%)',
    patternDataUri: PATTERNS.hearts,
    patternSize: '120px 120px',
    baseGradient:
      'radial-gradient(95% 70% at 15% 12%, rgba(244,63,94,0.12) 0%, transparent 60%), linear-gradient(165deg, #FFF1F5 0%, #FFE4EC 55%, #FCE7F3 100%)'
  },
  {
    id: 'midnight',
    name: 'Midnight Black',
    tagline: 'Deep charcoal & silver blue',
    isDark: true,
    animatedPattern: false,
    bgCanvas: '#090D16',
    bgSurface: '#131B2E',
    bgSubtle: '#1A243B',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    borderHairline: '#24324D',
    defaultAccent: '#3B82F6',
    defaultSecondary: '#14B8A6',
    receivedBg: '#172033',
    receivedText: '#F8FAFC',
    receivedBorder: 'rgba(148, 163, 184, 0.22)',
    headerBg: 'rgba(15, 22, 38, 0.94)',
    inputBg: 'rgba(19, 27, 46, 0.96)',
    previewGradient: 'linear-gradient(135deg, #090D16 0%, #111827 55%, #1E293B 100%)',
    patternDataUri: PATTERNS.midnight,
    patternSize: '64px 64px',
    baseGradient:
      'radial-gradient(90% 60% at 85% 12%, rgba(59,130,246,0.16) 0%, transparent 58%), linear-gradient(165deg, #070B12 0%, #0F172A 60%, #090D16 100%)'
  },
  {
    id: 'neon',
    name: 'Neon Gaming',
    tagline: 'Cyber grid & electric cyan',
    isDark: true,
    animatedPattern: true,
    bgCanvas: '#070913',
    bgSurface: '#121629',
    bgSubtle: '#19203B',
    textPrimary: '#F0FDF4',
    textSecondary: '#67E8F9',
    borderHairline: '#1E293B',
    defaultAccent: '#06B6D4',
    defaultSecondary: '#EC4899',
    receivedBg: 'rgba(18, 22, 41, 0.92)',
    receivedText: '#F0FDF4',
    receivedBorder: 'rgba(34, 211, 238, 0.28)',
    headerBg: 'rgba(13, 17, 36, 0.94)',
    inputBg: 'rgba(18, 22, 41, 0.95)',
    previewGradient: 'linear-gradient(135deg, #070913 0%, #16113A 55%, #082F49 100%)',
    patternDataUri: PATTERNS.neon,
    patternSize: '96px 96px',
    baseGradient:
      'radial-gradient(90% 70% at 15% 15%, rgba(6,182,212,0.18) 0%, transparent 55%), radial-gradient(85% 65% at 88% 82%, rgba(236,72,153,0.16) 0%, transparent 58%), linear-gradient(165deg, #060812 0%, #11132D 55%, #071929 100%)'
  },
  {
    id: 'camo',
    name: 'Camo',
    tagline: 'Woodland olive & ranger green',
    isDark: true,
    animatedPattern: false,
    bgCanvas: '#141E15',
    bgSurface: '#1E2D20',
    bgSubtle: '#263829',
    textPrimary: '#F4F7F2',
    textSecondary: '#BBF7D0',
    borderHairline: '#2F4432',
    defaultAccent: '#22C55E',
    defaultSecondary: '#D97706',
    receivedBg: 'rgba(30, 45, 32, 0.94)',
    receivedText: '#F4F7F2',
    receivedBorder: 'rgba(163, 230, 53, 0.20)',
    headerBg: 'rgba(24, 36, 26, 0.95)',
    inputBg: 'rgba(30, 45, 32, 0.96)',
    previewGradient: 'linear-gradient(135deg, #141E15 0%, #233324 50%, #2B3A28 100%)',
    patternDataUri: PATTERNS.camo,
    patternSize: '160px 160px',
    baseGradient:
      'linear-gradient(165deg, #121B13 0%, #1B2A1D 55%, #233121 100%)'
  },
  {
    id: 'ocean',
    name: 'Ocean Waves',
    tagline: 'Breezy blue & teal swells',
    isDark: false,
    animatedPattern: true,
    bgCanvas: '#EFF6FF',
    bgSurface: '#FFFFFF',
    bgSubtle: '#DBEAFE',
    textPrimary: '#0F172A',
    textSecondary: '#1E40AF',
    borderHairline: '#BFDBFE',
    defaultAccent: '#2563EB',
    defaultSecondary: '#0D9488',
    receivedBg: 'rgba(255, 255, 255, 0.94)',
    receivedText: '#0F172A',
    receivedBorder: 'rgba(37, 99, 235, 0.14)',
    headerBg: 'rgba(248, 251, 255, 0.94)',
    inputBg: 'rgba(255, 255, 255, 0.96)',
    previewGradient: 'linear-gradient(135deg, #E0F2FE 0%, #F0FDFA 55%, #EFF6FF 100%)',
    patternDataUri: PATTERNS.ocean,
    patternSize: '180px 90px',
    baseGradient:
      'radial-gradient(110% 70% at 15% 12%, rgba(37,99,235,0.14) 0%, transparent 58%), radial-gradient(95% 65% at 88% 86%, rgba(13,148,136,0.14) 0%, transparent 58%), linear-gradient(170deg, #E0F2FE 0%, #F0F9FF 55%, #ECFEFF 100%)'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    tagline: 'Golden coral & warm peach',
    isDark: false,
    animatedPattern: true,
    bgCanvas: '#FFF5F0',
    bgSurface: '#FFFFFF',
    bgSubtle: '#FFEDD5',
    textPrimary: '#2A120A',
    textSecondary: '#9A3412',
    borderHairline: '#FED7AA',
    defaultAccent: '#EA580C',
    defaultSecondary: '#E11D48',
    receivedBg: 'rgba(255, 255, 255, 0.94)',
    receivedText: '#2A120A',
    receivedBorder: 'rgba(234, 88, 12, 0.16)',
    headerBg: 'rgba(255, 249, 245, 0.95)',
    inputBg: 'rgba(255, 255, 255, 0.96)',
    previewGradient: 'linear-gradient(135deg, #FFEDD5 0%, #FFE4E6 55%, #FEF3C7 100%)',
    patternDataUri: PATTERNS.sunset,
    patternSize: '160px 160px',
    baseGradient:
      'radial-gradient(95% 65% at 80% 18%, rgba(251,146,60,0.22) 0%, transparent 58%), linear-gradient(165deg, #FFF7ED 0%, #FFEDD5 50%, #FFE4E6 100%)'
  },
  {
    id: 'flowers',
    name: 'Flowers',
    tagline: 'Delicate petals & fresh sage',
    isDark: false,
    animatedPattern: true,
    bgCanvas: '#FDF8FF',
    bgSurface: '#FFFFFF',
    bgSubtle: '#FCE7F3',
    textPrimary: '#1E1B2E',
    textSecondary: '#831843',
    borderHairline: '#F5D0FE',
    defaultAccent: '#DB2777',
    defaultSecondary: '#0D9488',
    receivedBg: 'rgba(255, 255, 255, 0.95)',
    receivedText: '#1E1B2E',
    receivedBorder: 'rgba(219, 39, 119, 0.14)',
    headerBg: 'rgba(255, 250, 255, 0.95)',
    inputBg: 'rgba(255, 255, 255, 0.96)',
    previewGradient: 'linear-gradient(135deg, #FCE7F3 0%, #F3E8FF 50%, #ECFDF5 100%)',
    patternDataUri: PATTERNS.flowers,
    patternSize: '140px 140px',
    baseGradient:
      'radial-gradient(90% 65% at 18% 20%, rgba(236,72,153,0.11) 0%, transparent 58%), radial-gradient(85% 60% at 85% 80%, rgba(16,185,129,0.10) 0%, transparent 58%), linear-gradient(165deg, #FDF4FF 0%, #FCE7F3 50%, #ECFDF5 100%)'
  },
  {
    id: 'racing',
    name: 'Racing',
    tagline: 'Track asphalt & nitro stripes',
    isDark: true,
    animatedPattern: false,
    bgCanvas: '#0C0D12',
    bgSurface: '#181A24',
    bgSubtle: '#222533',
    textPrimary: '#F8FAFC',
    textSecondary: '#FCA5A5',
    borderHairline: '#2E3244',
    defaultAccent: '#EF4444',
    defaultSecondary: '#F59E0B',
    receivedBg: 'rgba(24, 26, 36, 0.94)',
    receivedText: '#F8FAFC',
    receivedBorder: 'rgba(239, 68, 68, 0.25)',
    headerBg: 'rgba(18, 20, 28, 0.95)',
    inputBg: 'rgba(24, 26, 36, 0.96)',
    previewGradient: 'linear-gradient(135deg, #0C0D12 0%, #1F1218 55%, #181A24 100%)',
    patternDataUri: PATTERNS.racing,
    patternSize: '80px 80px',
    baseGradient:
      'radial-gradient(85% 55% at 85% 15%, rgba(239,68,68,0.16) 0%, transparent 58%), linear-gradient(165deg, #0B0C10 0%, #181A24 55%, #120E13 100%)'
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    tagline: 'Starlight nebula & violet aurora',
    isDark: true,
    animatedPattern: true,
    bgCanvas: '#08071B',
    bgSurface: '#141233',
    bgSubtle: '#1E1B4B',
    textPrimary: '#F5F3FF',
    textSecondary: '#C4B5FD',
    borderHairline: '#2E2A64',
    defaultAccent: '#8B5CF6',
    defaultSecondary: '#06B6D4',
    receivedBg: 'rgba(20, 18, 51, 0.92)',
    receivedText: '#F5F3FF',
    receivedBorder: 'rgba(139, 92, 246, 0.30)',
    headerBg: 'rgba(15, 13, 38, 0.94)',
    inputBg: 'rgba(20, 18, 51, 0.95)',
    previewGradient: 'linear-gradient(135deg, #08071B 0%, #1E1B4B 50%, #311042 100%)',
    patternDataUri: PATTERNS.galaxy,
    patternSize: '150px 150px',
    baseGradient:
      'radial-gradient(95% 65% at 15% 15%, rgba(139,92,246,0.22) 0%, transparent 58%), radial-gradient(85% 65% at 85% 85%, rgba(6,182,212,0.18) 0%, transparent 58%), linear-gradient(165deg, #070617 0%, #1A1446 55%, #240F38 100%)'
  },
  {
    id: 'clouds',
    name: 'Clouds',
    tagline: 'Soft blue sky & airy clouds',
    isDark: false,
    animatedPattern: true,
    bgCanvas: '#EAF4FF',
    bgSurface: '#FFFFFF',
    bgSubtle: '#DCEEFF',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    borderHairline: '#C7E0FC',
    defaultAccent: '#2563EB',
    defaultSecondary: '#38BDF8',
    receivedBg: 'rgba(255, 255, 255, 0.95)',
    receivedText: '#0F172A',
    receivedBorder: 'rgba(59, 130, 246, 0.14)',
    headerBg: 'rgba(250, 253, 255, 0.95)',
    inputBg: 'rgba(255, 255, 255, 0.96)',
    previewGradient: 'linear-gradient(135deg, #DCEEFF 0%, #F0F7FF 55%, #E0F2FE 100%)',
    patternDataUri: PATTERNS.clouds,
    patternSize: '200px 160px',
    baseGradient:
      'radial-gradient(110% 70% at 20% 15%, rgba(56,189,248,0.18) 0%, transparent 60%), radial-gradient(95% 65% at 82% 85%, rgba(59,130,246,0.13) 0%, transparent 60%), linear-gradient(175deg, #DCEEFF 0%, #EDF6FF 52%, #E2F1FF 100%)'
  },
  {
    id: 'forest',
    name: 'Forest',
    tagline: 'Calm woodland pines & mist',
    isDark: true,
    animatedPattern: true,
    bgCanvas: '#0B1914',
    bgSurface: '#132820',
    bgSubtle: '#1B362B',
    textPrimary: '#ECFDF5',
    textSecondary: '#A7F3D0',
    borderHairline: '#234538',
    defaultAccent: '#10B981',
    defaultSecondary: '#0D9488',
    receivedBg: 'rgba(19, 40, 32, 0.93)',
    receivedText: '#ECFDF5',
    receivedBorder: 'rgba(52, 211, 153, 0.24)',
    headerBg: 'rgba(14, 31, 24, 0.95)',
    inputBg: 'rgba(19, 40, 32, 0.96)',
    previewGradient: 'linear-gradient(135deg, #0B1914 0%, #143326 55%, #0F2922 100%)',
    patternDataUri: PATTERNS.forest,
    patternSize: '160px 160px',
    baseGradient:
      'radial-gradient(95% 65% at 20% 15%, rgba(16,185,129,0.16) 0%, transparent 58%), linear-gradient(165deg, #091511 0%, #122B21 55%, #0C211C 100%)'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Clean plain neutral canvas',
    isDark: false,
    animatedPattern: false,
    bgCanvas: '#F8FAFC',
    bgSurface: '#FFFFFF',
    bgSubtle: '#F1F5F9',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    borderHairline: '#E2E8F0',
    defaultAccent: '#334155',
    defaultSecondary: '#0F172A',
    receivedBg: '#FFFFFF',
    receivedText: '#0F172A',
    receivedBorder: '#E2E8F0',
    headerBg: 'rgba(255, 255, 255, 0.96)',
    inputBg: '#FFFFFF',
    previewGradient: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 55%, #F1F5F9 100%)',
    patternSize: '100% 100%',
    baseGradient: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)'
  },
  {
    id: 'default',
    name: 'Default (my app theme)',
    tagline: 'Follows your WaveLink app theme',
    isDark: false,
    animatedPattern: false,
    bgCanvas: 'var(--bg-canvas)',
    bgSurface: 'var(--bg-surface)',
    bgSubtle: 'var(--bg-subtle)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    borderHairline: 'var(--border-hairline)',
    defaultAccent: '#2563EB',
    defaultSecondary: '#0D9488',
    receivedBg: 'var(--bg-surface)',
    receivedText: 'var(--text-primary)',
    receivedBorder: 'var(--border-hairline)',
    headerBg: 'var(--bg-surface)',
    inputBg: 'var(--bg-surface)',
    previewGradient: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
    patternSize: '100% 100%',
    baseGradient: 'none'
  }
];

const CHAT_THEME_MAP = new Map<ChatThemeId, ChatThemeOptionMeta>(
  CHAT_THEME_OPTIONS.map((t) => [t.id, t])
);

export function getChatThemeMeta(
  themeId?: ChatThemeId | string | null,
  appActiveTheme?: AppearanceTheme
): ChatThemeOptionMeta {
  const id = (themeId || 'default') as ChatThemeId;
  if (id === 'default') {
    const normalizedApp = normalizeAppearanceTheme(appActiveTheme);
    const matched = CHAT_THEME_MAP.get(normalizedApp as ChatThemeId);
    if (matched) {
      return {
        ...matched,
        id: 'default',
        name: 'Default (my app theme)'
      };
    }
    return CHAT_THEME_MAP.get('ocean')!;
  }
  return CHAT_THEME_MAP.get(id) || CHAT_THEME_MAP.get('ocean')!;
}

export function getChatThemeDisplayName(themeId?: ChatThemeId | string | null): string {
  const id = (themeId || 'default') as ChatThemeId;
  return CHAT_THEME_MAP.get(id)?.name || 'Default';
}

// ============================================================================
// WCAG CONTRAST HELPERS
// ============================================================================
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.15;
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

export function getAccessibleTextOnColor(bgHex: string): '#FFFFFF' | '#0F172A' {
  const whiteContrast = getContrastRatio(bgHex, '#FFFFFF');
  const darkContrast = getContrastRatio(bgHex, '#0F172A');
  return whiteContrast >= 4.5 || whiteContrast >= darkContrast ? '#FFFFFF' : '#0F172A';
}

function shiftHexColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(rgb.r + amount).toString(16).padStart(2, '0');
  const g = clamp(rgb.g + amount).toString(16).padStart(2, '0');
  const b = clamp(rgb.b + amount).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export interface ComputedChatTheme {
  hasCustomTheme: boolean;
  isDark: boolean;
  isAnimatedPattern: boolean;
  hasCustomPhoto: boolean;
  resolvedThemeId: ChatThemeId;
  styleVars: React.CSSProperties;
}

export function computeChatThemeVars(
  pref: ChatThemePreference | null | undefined,
  appActiveTheme?: AppearanceTheme,
  appIsDark?: boolean
): ComputedChatTheme {
  const themeId: ChatThemeId = pref?.themeId || 'default';
  const accentColor = pref?.accentColor?.trim() || '';
  const customBgUrl = pref?.customBgUrl?.trim() || '';
  const hasCustomPhoto = Boolean(customBgUrl && (customBgUrl.startsWith('https://') || customBgUrl.startsWith('http://') || customBgUrl.startsWith('blob:')));
  const hasCustomTheme = Boolean(
    pref && (themeId !== 'default' || accentColor || hasCustomPhoto)
  );

  if (!hasCustomTheme) {
    return {
      hasCustomTheme: false,
      isDark: Boolean(appIsDark),
      isAnimatedPattern: false,
      hasCustomPhoto: false,
      resolvedThemeId: 'default',
      styleVars: {}
    };
  }

  const resolvedMeta = getChatThemeMeta(themeId, appActiveTheme);
  const matchedAccentPalette = accentColor
    ? CHAT_ACCENT_PALETTE.find((c) => c.hex.toLowerCase() === accentColor.toLowerCase())
    : undefined;

  const primaryAccent = accentColor || resolvedMeta.defaultAccent;
  const secondaryAccent =
    matchedAccentPalette?.secondaryHex ||
    (accentColor ? shiftHexColor(accentColor, -24) : resolvedMeta.defaultSecondary);
  const sentTextColor = getAccessibleTextOnColor(primaryAccent);

  // Scrim opacity (0 to 85%) for Pro custom photo backgrounds
  const darknessPct = Math.max(0, Math.min(85, Number(pref?.bgDarkness ?? 35)));
  const scrimAlpha = (darknessPct / 100).toFixed(2);

  let bgImage = resolvedMeta.patternDataUri
    ? `${resolvedMeta.patternDataUri}, ${resolvedMeta.baseGradient}`
    : resolvedMeta.baseGradient;
  let bgSize = resolvedMeta.patternDataUri
    ? `${resolvedMeta.patternSize || '140px 140px'}, 100% 100%`
    : '100% 100%';
  let bgRepeat = resolvedMeta.patternDataUri ? 'repeat, no-repeat' : 'no-repeat';
  let bgPosition = 'center center';

  if (hasCustomPhoto) {
    const safeUrl = customBgUrl.replace(/"/g, '%22');
    bgImage = `linear-gradient(rgba(6, 10, 20, ${scrimAlpha}), rgba(6, 10, 20, ${scrimAlpha})), url("${safeUrl}")`;
    bgSize = 'cover';
    bgRepeat = 'no-repeat';
    bgPosition = 'center center';
  }

  // Ensure crisp legibility on custom photos even if darkness is low (0–30%)
  const effectiveDark = hasCustomPhoto ? darknessPct >= 30 : resolvedMeta.isDark;
  const receivedBg = hasCustomPhoto
    ? 'rgba(255, 255, 255, 0.94)'
    : resolvedMeta.receivedBg;
  const receivedText = hasCustomPhoto ? '#0F172A' : resolvedMeta.receivedText;
  const receivedBorder = hasCustomPhoto
    ? 'rgba(255, 255, 255, 0.45)'
    : resolvedMeta.receivedBorder;

  const headerBg = hasCustomPhoto
    ? 'rgba(255, 255, 255, 0.92)'
    : resolvedMeta.headerBg;
  const headerText = hasCustomPhoto
    ? '#0F172A'
    : resolvedMeta.isDark
    ? resolvedMeta.textPrimary
    : '#0F172A';
  const headerSubtext = hasCustomPhoto
    ? '#475569'
    : resolvedMeta.textSecondary;

  const inputBg = hasCustomPhoto
    ? 'rgba(255, 255, 255, 0.95)'
    : resolvedMeta.inputBg;
  const inputText = hasCustomPhoto
    ? '#0F172A'
    : resolvedMeta.textPrimary;

  const metaOnBgText = hasCustomPhoto
    ? darknessPct >= 20
      ? 'rgba(248, 250, 252, 0.92)'
      : '#0F172A'
    : resolvedMeta.textSecondary;

  const btnBg = hasCustomPhoto
    ? 'rgba(15, 23, 42, 0.08)'
    : resolvedMeta.isDark
    ? 'rgba(255, 255, 255, 0.12)'
    : resolvedMeta.bgSubtle;

  const styleVars = {
    '--chat-bg-color': resolvedMeta.bgCanvas,
    '--chat-bg-image': bgImage,
    '--chat-bg-size': bgSize,
    '--chat-bg-repeat': bgRepeat,
    '--chat-bg-position': bgPosition,
    '--chat-header-bg': headerBg,
    '--chat-header-text': headerText,
    '--chat-header-subtext': headerSubtext,
    '--chat-header-border': hasCustomPhoto ? 'rgba(255,255,255,0.35)' : resolvedMeta.borderHairline,
    '--chat-btn-bg': btnBg,
    '--chat-menu-bg': hasCustomPhoto ? 'rgba(255, 255, 255, 0.96)' : resolvedMeta.bgSurface,
    '--chat-sent-bg': `linear-gradient(135deg, ${primaryAccent} 0%, ${secondaryAccent} 100%)`,
    '--chat-sent-text': sentTextColor,
    '--chat-received-bg': receivedBg,
    '--chat-received-text': receivedText,
    '--chat-received-border': receivedBorder,
    '--chat-input-bg': inputBg,
    '--chat-input-text': inputText,
    '--chat-input-border': hasCustomPhoto ? 'rgba(255,255,255,0.4)' : resolvedMeta.borderHairline,
    '--chat-meta-text': metaOnBgText,
    '--chat-accent-primary': primaryAccent,
    '--chat-accent-secondary': secondaryAccent,
    '--chat-date-bg': hasCustomPhoto
      ? 'rgba(15, 23, 42, 0.72)'
      : resolvedMeta.isDark
      ? 'rgba(15, 23, 42, 0.78)'
      : 'rgba(255, 255, 255, 0.90)',
    '--chat-date-text': hasCustomPhoto || resolvedMeta.isDark ? '#F8FAFC' : '#334155',
    '--chat-system-bg': hasCustomPhoto
      ? 'rgba(15, 23, 42, 0.68)'
      : resolvedMeta.isDark
      ? 'rgba(255, 255, 255, 0.11)'
      : 'rgba(15, 23, 42, 0.07)',
    '--chat-system-text': hasCustomPhoto || resolvedMeta.isDark ? '#F1F5F9' : '#334155'
  } as React.CSSProperties;

  return {
    hasCustomTheme: true,
    isDark: effectiveDark,
    isAnimatedPattern: resolvedMeta.animatedPattern && !hasCustomPhoto,
    hasCustomPhoto,
    resolvedThemeId: themeId,
    styleVars
  };
}

export const ChatThemeBadgeIcon: React.FC<{
  themeId?: ChatThemeId | string | null;
  size?: number;
  className?: string;
}> = ({ themeId, size = 14, className = '' }) => {
  switch (themeId) {
    case 'hearts':
      return React.createElement(Heart, { size, className: `text-rose-500 ${className}` });
    case 'midnight':
      return React.createElement(Moon, { size, className: `text-blue-400 ${className}` });
    case 'neon':
      return React.createElement(Gamepad2, { size, className: `text-cyan-400 ${className}` });
    case 'camo':
      return React.createElement(Shield, { size, className: `text-emerald-500 ${className}` });
    case 'ocean':
      return React.createElement(Waves, { size, className: `text-blue-500 ${className}` });
    case 'sunset':
      return React.createElement(Sunset, { size, className: `text-orange-500 ${className}` });
    case 'flowers':
      return React.createElement(Flower2, { size, className: `text-pink-500 ${className}` });
    case 'racing':
      return React.createElement(Flag, { size, className: `text-red-500 ${className}` });
    case 'galaxy':
      return React.createElement(Sparkles, { size, className: `text-violet-400 ${className}` });
    case 'clouds':
      return React.createElement(Cloud, { size, className: `text-sky-500 ${className}` });
    case 'forest':
      return React.createElement(Trees, { size, className: `text-emerald-600 ${className}` });
    case 'minimal':
      return React.createElement(Circle, { size, className: `text-slate-500 ${className}` });
    default:
      return React.createElement(Palette, { size, className: `text-[var(--accent-primary)] ${className}` });
  }
};
