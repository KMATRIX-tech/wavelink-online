import { UserProfile } from '../types';

export const SUPPORT_BOT_ID = 'wavelink_support_bot';
export const SUPPORT_BOT_EMAIL = 'support-bot@wavelink.system';
export const SUPPORT_BOT_USERNAME = '@wavelink_support';
export const SUPPORT_BOT_NAME = 'WaveLink Support';
export const SUPPORT_BOT_AVATAR =
  'https://api.dicebear.com/7.x/bottts/svg?seed=wavelink_support_bot&backgroundColor=dbeafe';

export const SUPPORT_BOT_PROFILE: UserProfile = {
  id: SUPPORT_BOT_ID,
  email: SUPPORT_BOT_EMAIL,
  username: SUPPORT_BOT_USERNAME,
  displayName: SUPPORT_BOT_NAME,
  photoURL: SUPPORT_BOT_AVATAR,
  bio: 'Automated WaveLink Support Assistant (Bot). Here to help with features, Sparks, Reels, Pro & safety tips in English & Swahili. Never asks for passwords or PINs.',
  status: 'active',
  isBanned: false,
  role: 'bot',
  isBot: true,
  isSubAdmin: false,
  hasBlueStar: false,
  isVerifiedByAdmin: false,
  isPro: false,
  isOnline: true,
  createdAt: '2026-01-01T00:00:00.000Z'
};

export function isSupportBotUser(userIdOrEmail?: string | null): boolean {
  if (!userIdOrEmail) return false;
  const clean = userIdOrEmail.trim().toLowerCase();
  return clean === SUPPORT_BOT_ID || clean === SUPPORT_BOT_EMAIL;
}

/**
 * Sanitizes user-supplied text (posts, comments, bios, chat messages, tickets)
 * to prevent XSS, script injection, and dangerous HTML execution.
 */
export function sanitizeUserText(raw: string, maxLength = 2000): string {
  if (typeof raw !== 'string') return '';
  let text = raw
    // Strip script, iframe, object, embed, style, link, meta tags and their contents
    .replace(/<\s*(script|iframe|object|embed|style|applet|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // Strip self-closing or unclosed dangerous tags
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|applet|meta|link|form|input|button|svg|math)[^>]*>/gi, '')
    // Remove inline event handlers like onload=, onerror=, onclick=
    .replace(/\bon[a-z]+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '')
    // Neutralize javascript:, vbscript:, data:text/html URIs
    .replace(/(javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, 'blocked:')
    // Encode raw angle brackets so arbitrary HTML tags cannot execute
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}

/**
 * Validates and sanitizes external URLs or media URLs so javascript: or malicious data: URIs cannot execute.
 */
export function sanitizeSafeUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Allow relative /api/media/... paths
  if (trimmed.startsWith('/api/media/') || trimmed.startsWith('/assets/')) {
    return trimmed;
  }

  // Allow safe base64 media data URLs (image, audio, video only — never text/html)
  if (/^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+);base64,/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Enforces password rule:
 * - Minimum 8 characters and maximum 24 characters
 * - Contains at least one letter and at least one number
 */
export function validateStrongPassword(password: string): {
  valid: boolean;
  message?: string;
  score: number;
} {
  const clean = String(password || '');
  if (clean.length < 8) {
    return {
      valid: false,
      message: 'Password must be 8 to 24 characters long and include at least one letter and one number (currently too short).',
      score: 1
    };
  }
  if (clean.length > 24) {
    return {
      valid: false,
      message: 'Password must be between 8 and 24 characters long (maximum 24 characters exceeded).',
      score: 1
    };
  }
  const hasLetter = /[a-zA-Z]/.test(clean);
  const hasNumber = /[0-9]/.test(clean);
  const hasUpper = /[A-Z]/.test(clean);
  const hasSymbol = /[^a-zA-Z0-9]/.test(clean);

  if (!hasLetter && !hasNumber) {
    return {
      valid: false,
      message: 'Password must be 8–24 characters and contain at least one letter and one number.',
      score: 2
    };
  }
  if (!hasLetter) {
    return {
      valid: false,
      message: 'Password must include at least one letter (8–24 characters total).',
      score: 2
    };
  }
  if (!hasNumber) {
    return {
      valid: false,
      message: 'Password must include at least one number (8–24 characters total).',
      score: 2
    };
  }

  let score = 3;
  if (clean.length >= 10 && (hasUpper || hasSymbol)) score = 4;
  if (clean.length >= 12 && hasUpper && hasSymbol) score = 5;

  return { valid: true, score };
}

const LOGIN_LOCKOUT_STORAGE_KEY = 'wavelink_login_attempts_v1';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_DURATION_MS = 3 * 60 * 1000; // 3 minutes lockout

interface LoginAttemptState {
  count: number;
  lockedUntil: number;
}

export function checkClientLoginLockout(): { locked: boolean; remainingSeconds: number } {
  try {
    if (typeof window === 'undefined') return { locked: false, remainingSeconds: 0 };
    const raw = localStorage.getItem(LOGIN_LOCKOUT_STORAGE_KEY);
    if (!raw) return { locked: false, remainingSeconds: 0 };
    const state = JSON.parse(raw) as LoginAttemptState;
    const now = Date.now();
    if (state.lockedUntil && state.lockedUntil > now) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000)
      };
    }
    return { locked: false, remainingSeconds: 0 };
  } catch {
    return { locked: false, remainingSeconds: 0 };
  }
}

export function recordClientFailedLogin(): { locked: boolean; remainingSeconds: number; attemptsLeft: number } {
  try {
    if (typeof window === 'undefined') {
      return { locked: false, remainingSeconds: 0, attemptsLeft: MAX_FAILED_LOGIN_ATTEMPTS };
    }
    const now = Date.now();
    const raw = localStorage.getItem(LOGIN_LOCKOUT_STORAGE_KEY);
    let state: LoginAttemptState = raw ? JSON.parse(raw) : { count: 0, lockedUntil: 0 };

    if (state.lockedUntil && state.lockedUntil < now) {
      state = { count: 0, lockedUntil: 0 };
    }

    state.count += 1;
    if (state.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
      state.lockedUntil = now + LOGIN_LOCKOUT_DURATION_MS;
      localStorage.setItem(LOGIN_LOCKOUT_STORAGE_KEY, JSON.stringify(state));
      return {
        locked: true,
        remainingSeconds: Math.ceil(LOGIN_LOCKOUT_DURATION_MS / 1000),
        attemptsLeft: 0
      };
    }

    localStorage.setItem(LOGIN_LOCKOUT_STORAGE_KEY, JSON.stringify(state));
    return {
      locked: false,
      remainingSeconds: 0,
      attemptsLeft: Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - state.count)
    };
  } catch {
    return { locked: false, remainingSeconds: 0, attemptsLeft: MAX_FAILED_LOGIN_ATTEMPTS };
  }
}

export function clearClientFailedLogins(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOGIN_LOCKOUT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
