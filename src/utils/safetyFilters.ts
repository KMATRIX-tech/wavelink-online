/**
 * WaveLink Safety & Moderation Utilities
 * - Bilingual (English + Swahili) profanity, hate speech, and scam word filter
 * - Client-side & server-compatible spam detection (repeated messages, mass following, link flooding)
 * - External link detector & validator
 * - Friendly error message sanitizer (never shows raw stack traces or codes to users)
 * - Support Helper PII email redactor
 */

// Bilingual English + Swahili word filter terms (profanity, hate speech, and phishing/scam lures)
const BLOCKED_WORDS_EN = [
  'fuck',
  'fucking',
  'motherfucker',
  'bitch',
  'asshole',
  'bastard',
  'dickhead',
  'cunt',
  'whore',
  'slut',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'kill yourself',
  'kys',
  'send your password',
  'send your pin',
  'mpesa pin',
  'airtel pin',
  'tigopesa pin'
];

const BLOCKED_WORDS_SW = [
  'kuma',
  'kumamako',
  'kumamae',
  'malaya',
  'msenge',
  'wasenge',
  'mboo',
  'mkundu',
  'kundu',
  'shoga',
  'mashoga',
  'mpumbavu',
  'mjinga mkubwa',
  'mbwa wewe',
  'shetani wewe',
  'tuma nenosiri',
  'tuma siri yako',
  'namba ya siri ya mpesa',
  'tuma pin yako'
];

const ALL_BLOCKED_TERMS = [...BLOCKED_WORDS_EN, ...BLOCKED_WORDS_SW];

export interface WordFilterResult {
  flagged: boolean;
  matchedTerms: string[];
  cleanedText: string;
  friendlyReasonEn?: string;
  friendlyReasonSw?: string;
}

/**
 * Checks text against English & Swahili word filters and returns both a flag and a masked version.
 */
export function checkWordFilter(rawText: string): WordFilterResult {
  if (!rawText || typeof rawText !== 'string') {
    return { flagged: false, matchedTerms: [], cleanedText: '' };
  }

  let cleanedText = rawText;
  const matchedTerms: string[] = [];

  for (const term of ALL_BLOCKED_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (regex.test(cleanedText)) {
      matchedTerms.push(term);
      cleanedText = cleanedText.replace(regex, (m) => '*'.repeat(Math.max(3, m.length)));
    }
  }

  if (matchedTerms.length > 0) {
    return {
      flagged: true,
      matchedTerms,
      cleanedText,
      friendlyReasonEn:
        'Please keep WaveLink respectful and safe. Your message contains blocked words or unsafe phrases (such as asking for PINs/passwords or profanity).',
      friendlyReasonSw:
        'Tafadhali dumisha heshima na usalama kwenye WaveLink. Ujumbe wako una maneno yasiyoruhusiwa au ombi la nenosiri/PIN.'
    };
  }

  return {
    flagged: false,
    matchedTerms: [],
    cleanedText
  };
}

// ============================================================================
// SPAM DETECTION (Repeated identical messages, mass following, link flooding)
// ============================================================================
interface ClientSpamTracker {
  recentMessages: { text: string; timestamp: number }[];
  recentFollows: number[];
  recentPosts: { text: string; timestamp: number }[];
}

const clientSpamState: ClientSpamTracker = {
  recentMessages: [],
  recentFollows: [],
  recentPosts: []
};

export interface SpamCheckResult {
  blocked: boolean;
  isSpam: boolean;
  reason?: string;
  reasonEn?: string;
  reasonSw?: string;
}

export function extractExternalUrls(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/https?:\/\/[^\s)<>"']+/gi) || [];
  return matches.filter((url) => !isInternalWaveLinkUrl(url));
}

export function isInternalWaveLinkUrl(rawUrl: string): boolean {
  if (!rawUrl) return true;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (typeof window !== 'undefined' && parsed.hostname === window.location.hostname) {
      return true;
    }
    const trustedMediaHosts = [
      'res.cloudinary.com',
      'lh3.googleusercontent.com',
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'api.dicebear.com',
      'images.unsplash.com',
      'media.tenor.com',
      'i.scdn.co',
      'is1-ssl.mzstatic.com'
    ];
    if (trustedMediaHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if a message, post, or follow action exhibits spam patterns:
 * - Link flooding (> 3 external links in one message/post)
 * - Repeated identical messages (same message >= 3 times within 60 seconds)
 * - Rapid message burst (> 12 messages within 15 seconds)
 * - Mass following (> 10 follows within 60 seconds)
 */
export function checkClientSpam(
  actionType: 'message' | 'post' | 'comment' | 'follow',
  textPayload = ''
): SpamCheckResult {
  const now = Date.now();

  if (actionType === 'follow') {
    clientSpamState.recentFollows = clientSpamState.recentFollows.filter((t) => now - t < 60_000);
    if (clientSpamState.recentFollows.length >= 10) {
      const reasonEn = 'You are following accounts too quickly. Please wait a minute before following more people.';
      return {
        blocked: true,
        isSpam: true,
        reason: reasonEn,
        reasonEn,
        reasonSw: 'Unafuata akaunti kwa kasi sana. Tafadhali subiri dakika moja kabla ya kuendelea.'
      };
    }
    clientSpamState.recentFollows.push(now);
    return { blocked: false, isSpam: false };
  }

  const normalized = textPayload.trim().toLowerCase().replace(/\s+/g, ' ');

  // 1. Link flooding check (> 3 external links)
  const links = extractExternalUrls(textPayload);
  if (links.length > 3) {
    const reasonEn = 'Link flooding detected: Please include at most 3 external links in a single message or post.';
    return {
      blocked: true,
      isSpam: true,
      reason: reasonEn,
      reasonEn,
      reasonSw: 'Viungo vingi mno vimegunduliwa: Tafadhali weka viungo visivyozidi 3 kwenye ujumbe mmoja.'
    };
  }

  // 2. Word filter check
  const wordCheck = checkWordFilter(textPayload);
  if (wordCheck.flagged) {
    return {
      blocked: true,
      isSpam: true,
      reason: wordCheck.friendlyReasonEn,
      reasonEn: wordCheck.friendlyReasonEn,
      reasonSw: wordCheck.friendlyReasonSw
    };
  }

  // 3. Repeated identical messages/comments check
  if (normalized.length > 0) {
    clientSpamState.recentMessages = clientSpamState.recentMessages.filter((m) => now - m.timestamp < 60_000);
    const identicalCount = clientSpamState.recentMessages.filter((m) => m.text === normalized).length;
    if (identicalCount >= 2) {
      const reasonEn = 'Spam protection: You just sent that exact message multiple times. Please wait a moment.';
      return {
        blocked: true,
        isSpam: true,
        reason: reasonEn,
        reasonEn,
        reasonSw: 'Ulinzi dhidi ya taka: Umetuma ujumbe huohuo mara nyingi. Tafadhali subiri kidogo.'
      };
    }

    const burstCount = clientSpamState.recentMessages.filter((m) => now - m.timestamp < 15_000).length;
    if (burstCount >= 10) {
      const reasonEn = 'You are sending messages too fast. Please slow down for a few seconds.';
      return {
        blocked: true,
        isSpam: true,
        reason: reasonEn,
        reasonEn,
        reasonSw: 'Unatuma jumbe kwa kasi sana. Tafadhali punguza kasi kwa sekunde chache.'
      };
    }

    clientSpamState.recentMessages.push({ text: normalized, timestamp: now });
  }

  return { blocked: false, isSpam: false };
}

/**
 * Redacts user email addresses when viewed by a Support Helper role.
 */
export function redactEmailIfSupportHelper(
  email?: string | null,
  viewerRole?: string | boolean | null
): string {
  if (!email) return 'Hidden';
  if (viewerRole === true || viewerRole === 'support_helper') {
    return '🔒 [Email hidden for Support Helper]';
  }
  return email;
}

/**
 * Sanitizes any error into a clean, user-friendly message without raw JSON, stack traces, or internal codes.
 */
export function sanitizeUserFacingError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please check your internet and tap Try again.'
): string {
  if (!error) return fallbackMessage;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : fallbackMessage;

  const lower = raw.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'You cannot do that right now. Please sign in again and tap Try again.';
  }
  if (lower.includes('quota') || lower.includes('resource-exhausted')) {
    return 'WaveLink is busy right now. Please wait a moment and tap Try again.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('offline')) {
    return 'Your internet connection dropped. Please check your Wi-Fi or data and tap Try again.';
  }
  if (lower.includes('too-many-requests') || lower.includes('rate limit')) {
    return 'You tapped too fast. Please wait a minute and tap Try again.';
  }

  // Strip JSON blobs, stack traces, or Firebase internal prefixes
  if (raw.startsWith('{') || raw.includes('at ') || raw.includes('Error:')) {
    return fallbackMessage;
  }

  return (
    raw
      .replace(/^Firebase:\s*/i, '')
      .replace(/\([a-z0-9_-]+\/[a-z0-9_-]+\)\.?/gi, '')
      .replace(/\b(?:auth|storage|firestore|functions|cloudinary)\/[a-z0-9_-]+\b/gi, '')
      .replace(/\b(?:HTTP|Error|Status|Code)\s*\d{3,}\b/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .slice(0, 220)
      .trim() || fallbackMessage
  );
}

/**
 * Formats large numbers into clean, compact strings (e.g., 1.2K, 15.4K, 1.5M)
 * so big numbers never overflow or squash badges and buttons on small mobile screens.
 */
export function formatCompactNumber(value?: number | null): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (num >= 10_000) {
    const thousands = num / 1_000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(num);
}

/**
 * Per-user sliding-window rate limits for Posting (5/min), Commenting (15/min),
 * Messaging (30/min), and Calling (6/min).
 */
const actionRateBuckets = new Map<string, number[]>();

export function checkActionRateLimit(
  userId: string,
  action: 'post' | 'comment' | 'message' | 'call'
): { allowed: boolean; retryAfterSeconds: number; message?: string } {
  const limits: Record<
    'post' | 'comment' | 'message' | 'call',
    { windowMs: number; max: number; label: string }
  > = {
    post: { windowMs: 60_000, max: 5, label: 'posting' },
    comment: { windowMs: 60_000, max: 15, label: 'commenting' },
    message: { windowMs: 60_000, max: 30, label: 'sending messages' },
    call: { windowMs: 60_000, max: 6, label: 'starting calls' },
  };

  const rule = limits[action] || limits.post;
  const key = `${userId || 'anon'}:${action}`;
  const now = Date.now();
  const recent = (actionRateBuckets.get(key) || []).filter((ts) => now - ts < rule.windowMs);

  if (recent.length >= rule.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rule.windowMs - (now - recent[0])) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      message: `You are ${rule.label} too fast. Please wait ${retryAfterSeconds} seconds and try again.`,
    };
  }

  recent.push(now);
  actionRateBuckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}



