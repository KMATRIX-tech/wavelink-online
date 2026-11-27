/**
 * WaveLink 4-Layer Content Moderation Engine — Shared Normalization & Layer 1 Word Filter
 *
 * HONEST ENGINEERING NOTE:
 * No automated word filter or AI classifier is 100% perfect on its own. Determined users invent
 * new slang, mix languages, or use subtle context that automated filters can miss, while overly
 * aggressive filters can accidentally block innocent words (the "Scunthorpe problem").
 *
 * Therefore WaveLink uses 4 cooperating defense-in-depth layers:
 *   Layer 1 (this module, client + server): instant Unicode normalization, leetspeak/accent/
 *           spacing/dot/repetition collapsing, multilingual profanity dictionary, and allowlist.
 *   Layer 2 (server.ts + functions/index.js + firestore.rules): unbypassable server re-check +
 *           selective Gemini AI check ONLY for suspicious content that passes Layer 1, with strict
 *           rate limits and daily cost caps, plus Firestore rule enforcement of `moderationChecked`.
 *   Layer 3 (server.ts media upload): SafeSearch / Gemini Vision check once at upload time;
 *           unsafe images are blocked, borderline ones are blurred ("Sensitive content - tap to view")
 *           and hidden completely for under-18 accounts.
 *   Layer 4 (community + staff): Report button everywhere, Block & Mute, auto-hide after 3 unique
 *           reporters, 4-step Strikes ladder (Warning -> 24h Mute -> 7d Suspension -> Permanent Ban),
 *           user appeals, Admin/Sub-Admin Moderation Queue, and full audit logging.
 */

import {
  STRONG_SUBSTRING_TERMS,
  WORD_BOUNDARY_TERMS,
  BLOCKED_PHRASES,
  SAFE_ALLOWLIST,
  SUSPICIOUS_AI_TRIGGER_PATTERNS,
  type ModerationTermCategory,
} from './profanityList';

export const MODERATION_FRIENDLY_BLOCK_MESSAGE =
  "This message includes language that isn't allowed on WaveLink";

export const MODERATION_FRIENDLY_BLOCK_MESSAGE_SW =
  'Ujumbe huu una lugha isiyoruhusiwa kwenye WaveLink';

export interface NormalizedModerationText {
  original: string;
  /** Lowercased, accent-stripped, leetspeak-decoded, 3+ repeated letters collapsed, punctuation -> spaces */
  spaced: string;
  /** Same as spaced, but 2+ repeated letters collapsed to 1 (catches "fuuuck", "shiiit", "kummma") */
  spacedSingleChar: string;
  /** Tokens with safe allowlisted words masked out, joined with spaces */
  maskedSpaced: string;
  /** Only alphanumeric letters from non-allowlisted tokens joined together (catches "f.u.c.k", "k u m a", embedded slurs) */
  squished: string;
  /** Same as squished with 2+ repeated letters collapsed to 1 */
  squishedSingleChar: string;
  /** Separated single-letter runs collapsed into words (e.g., "f u c k you" -> "fuck you", "k.u.m.a" -> "kuma") */
  deSpacedRuns: string;
}

export interface LocalModerationResult {
  blocked: boolean;
  /** Convenience alias identical to `blocked` */
  flagged: boolean;
  category: 'safe' | ModerationTermCategory;
  matchedTerms: string[];
  friendlyMessage: string;
  friendlyMessageSw: string;
  /** True if text passed Layer 1 cleanly but shows suspicious signals warranting Layer 2 Gemini review */
  suspiciousForAi: boolean;
  suspiciousReasons: string[];
  cleanedText: string;
}

// Cyrillic / Greek / mathematical lookalike homoglyphs mapped to ASCII Latin
const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0430': 'a', // Cyrillic а
  '\u0435': 'e', // Cyrillic е
  '\u043E': 'o', // Cyrillic о
  '\u0440': 'p', // Cyrillic р
  '\u0441': 'c', // Cyrillic с
  '\u0443': 'y', // Cyrillic у
  '\u0445': 'x', // Cyrillic х
  '\u0456': 'i', // Cyrillic і
  '\u0458': 'j', // Cyrillic ј
  '\u04BB': 'h', // Cyrillic һ
  '\u03B1': 'a', // Greek α
  '\u03B5': 'e', // Greek ε
  '\u03BF': 'o', // Greek ο
  '\u03C1': 'p', // Greek ρ
  '\u03B9': 'i', // Greek ι
  '\u03BA': 'k', // Greek κ
  '\u03BD': 'v', // Greek ν
  '\u03C7': 'x', // Greek χ
  '\u0131': 'i', // dotless ı
  '\u00DF': 'ss', // ß
  '\u00F8': 'o', // ø
  '\u0142': 'l', // ł
};

// Leetspeak & symbol substitutions applied during normalization
const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '^': 'a',
  '$': 's',
  '5': 's',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '€': 'e',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
  '6': 'g',
  '2': 'z',
  '£': 'e',
};

// Cached compiled lookup structures (built once on first import — O(1) runtime cost)
interface CompiledTermEntry {
  term: string;
  singleCharTerm: string;
  category: ModerationTermCategory;
}

const compiledStrongTerms: CompiledTermEntry[] = [];
const compiledBoundaryMap = new Map<string, { term: string; category: ModerationTermCategory }>();
const compiledBoundarySingleMap = new Map<string, { term: string; category: ModerationTermCategory }>();
const compiledPhrases: Array<{ phrase: string; regex: RegExp; category: ModerationTermCategory }> = [];

function collapseAllRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function collapseExcessRepeats(s: string): string {
  return s.replace(/(.)\1{2,}/g, '$1$1');
}

function initModerationCache(): void {
  if (compiledStrongTerms.length > 0) return;

  const categories: ModerationTermCategory[] = ['hate', 'harassment', 'sexual', 'scam', 'profanity'];

  for (const cat of categories) {
    for (const raw of STRONG_SUBSTRING_TERMS[cat]) {
      const clean = raw.toLowerCase().trim();
      if (!clean || clean.length < 3) continue;
      compiledStrongTerms.push({
        term: clean,
        singleCharTerm: collapseAllRepeats(clean),
        category: cat,
      });
    }

    for (const raw of WORD_BOUNDARY_TERMS[cat]) {
      const clean = raw.toLowerCase().trim();
      if (!clean) continue;
      if (!compiledBoundaryMap.has(clean)) {
        compiledBoundaryMap.set(clean, { term: clean, category: cat });
      }
      const single = collapseAllRepeats(clean);
      // Only map single-char form if >= 3 chars so short words like "as" never collide with "ass"
      if (single.length >= 3 && !compiledBoundarySingleMap.has(single)) {
        compiledBoundarySingleMap.set(single, { term: clean, category: cat });
      }
    }
  }

  for (const entry of BLOCKED_PHRASES) {
    const escaped = entry.phrase
      .toLowerCase()
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    compiledPhrases.push({
      phrase: entry.phrase,
      regex: new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i'),
      category: entry.category,
    });
  }
}

initModerationCache();

function stripAccentsAndInvisibles(input: string): string {
  return input
    // Remove zero-width spaces, soft hyphens, bidi overrides
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    // Unicode NFKD decomposes accented characters like é -> e + combining acute accent
    .normalize('NFKD')
    // Strip combining diacritical marks
    .replace(/[\u0300-\u036f]/g, '');
}

function replaceHomoglyphs(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    out += HOMOGLYPH_MAP[ch] ?? ch;
  }
  return out;
}

function decodeLeetToken(token: string): string {
  // Keep pure numbers intact so phone numbers or dates aren't mangled into letters
  if (/^\d+$/.test(token)) return token;
  // Strip sentence-boundary punctuation (!, +, |) when strictly at the end of an otherwise normal word
  // so "Scunthorpe!" stays "scunthorpe" while "b!tch", "sh!t", "!diot" still decode '!' -> 'i'.
  const trimmedEdgePunct = token.replace(/^[!+|]+|[!+|]+$/g, (edge, offset, full) => {
    const rest = offset === 0 ? full.slice(edge.length) : full.slice(0, offset);
    // Keep leading '!' if the token is short or looks like leetspeak, drop trailing '!' after letters
    if (offset > 0 && /[a-z]{2,}$/i.test(rest)) return '';
    return edge;
  });
  let out = '';
  for (let i = 0; i < trimmedEdgePunct.length; i++) {
    const ch = trimmedEdgePunct[i];
    out += LEET_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Collapses runs of separated single letters into joined words:
 * e.g. "f u c k you" -> "fuck you", "k.u.m.a" -> "kuma", "s-h-1-t" -> "shit"
 */
function collapseSeparatedSingleLetters(spacedText: string): string {
  const tokens = spacedText.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].length === 1 && /[a-z0-9]/.test(tokens[i])) {
      let run = tokens[i];
      let j = i + 1;
      while (j < tokens.length && tokens[j].length === 1 && /[a-z0-9]/.test(tokens[j])) {
        run += tokens[j];
        j++;
      }
      if (run.length >= 3) {
        result.push(run);
      } else {
        for (let k = i; k < j; k++) result.push(tokens[k]);
      }
      i = j;
    } else {
      result.push(tokens[i]);
      i++;
    }
  }
  return result.join(' ');
}

/**
 * Full normalization pipeline for Layer 1 & Layer 2 text checks.
 */
export function normalizeTextForModeration(rawText: string): NormalizedModerationText {
  const original = typeof rawText === 'string' ? rawText : '';
  if (!original.trim()) {
    return {
      original,
      spaced: '',
      spacedSingleChar: '',
      maskedSpaced: '',
      squished: '',
      squishedSingleChar: '',
      deSpacedRuns: '',
    };
  }

  // Step 1: Lowercase, strip accents & zero-width chars, map homoglyphs
  const base = replaceHomoglyphs(stripAccentsAndInvisibles(original.toLowerCase()));

  // Step 2: Strip URLs before leetspeak decoding so harmless URLs aren't distorted
  const withoutUrls = base.replace(/https?:\/\/[^\s]+/gi, ' ');

  // Step 3: Handle inline separator obfuscation inside a single non-space chunk
  // e.g. "f.u.c.k", "k_u_m_a", "b-i-t-c-h", "f*u*c*k" -> collapse dot/dash/underscore separators between single chars
  const collapsedInlineSep = withoutUrls.replace(
    /\b(?:[a-z0-9@$!|€+£][._\-*~`'"^]){2,}[a-z0-9@$!|€+£]\b/gi,
    (match) => match.replace(/[._\-*~`'"^]/g, '')
  );

  // Step 4: Replace remaining non-letter/non-leet separators with spaces (keep Arabic/Cyrillic letters too)
  const rawTokens = collapsedInlineSep
    .replace(/[^a-z0-9@$!|€+£\u0400-\u04FF\u0600-\u06FF]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Step 5: Decode leetspeak per token and collapse 3+ repeats (keep double letters like "ass", "classic")
  const decodedTokens = rawTokens.map((tok) => collapseExcessRepeats(decodeLeetToken(tok)));
  const spaced = decodedTokens.join(' ');
  const spacedSingleChar = decodedTokens.map((t) => collapseAllRepeats(t)).join(' ');
  const deSpacedRuns = collapseSeparatedSingleLetters(spaced);

  // Step 6: Build anti-Scunthorpe masked representation (remove allowlisted safe words before substring check)
  const nonAllowlistedTokens = decodedTokens.filter((tok) => {
    const cleanWord = tok.replace(/[^a-z\u0400-\u04FF\u0600-\u06FF]/g, '');
    if (!cleanWord) return false;
    if (SAFE_ALLOWLIST.has(cleanWord)) return false;
    // Also check simple plural/suffix variations of allowlisted words (e.g. "classic" -> "classics", "sukuma" -> "sukumawiki")
    if (cleanWord.endsWith('s') && SAFE_ALLOWLIST.has(cleanWord.slice(0, -1))) return false;
    if (cleanWord.endsWith('ed') && SAFE_ALLOWLIST.has(cleanWord.slice(0, -2))) return false;
    if (cleanWord.endsWith('ing') && SAFE_ALLOWLIST.has(cleanWord.slice(0, -3))) return false;
    return true;
  });

  const maskedSpaced = nonAllowlistedTokens.join(' ');
  const squished = nonAllowlistedTokens
    .join('')
    .replace(/[^a-z\u0400-\u04FF\u0600-\u06FF]/g, '');
  const squishedSingleChar = collapseAllRepeats(squished);

  return {
    original,
    spaced,
    spacedSingleChar,
    maskedSpaced,
    squished,
    squishedSingleChar,
    deSpacedRuns,
  };
}

/**
 * Cheap heuristic to decide if Layer-1-clean text looks suspicious enough to send to Gemini AI
 * in Layer 2. Keeps Gemini cost tiny while catching sneaky slang, other languages, and context abuse.
 */
export function evaluateSuspiciousSignals(rawText: string): {
  suspicious: boolean;
  reasons: string[];
} {
  if (!rawText || typeof rawText !== 'string') return { suspicious: false, reasons: [] };
  const trimmed = rawText.trim();
  if (trimmed.length < 4) return { suspicious: false, reasons: [] };

  const reasons: string[] = [];

  for (const pattern of SUSPICIOUS_AI_TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      reasons.push('suspicious_pattern');
      break;
    }
  }

  // High density of symbol/leetspeak obfuscation inside letters (e.g. "y0u @r3 $t*p1d")
  const obfuscatedTokens = trimmed.match(/\b(?=[a-z0-9@$!*#_]{3,}\b)[a-z]*[@$!*#_0-9][a-z]+/gi) || [];
  if (obfuscatedTokens.length >= 2) {
    reasons.push('obfuscated_leetspeak');
  }

  // Excessive spaced single letters (e.g., "y o u  a r e  a ...")
  if (/(?:\b[a-zA-Z]\s+){4,}[a-zA-Z]\b/.test(trimmed)) {
    reasons.push('spaced_evasion');
  }

  // Asterisk-censored swear attempts (e.g., "f***", "b****", "sh*t", "k*ma")
  if (/\b[a-zA-Z]{1,3}\*{2,}[a-zA-Z]{0,3}\b/.test(trimmed)) {
    reasons.push('asterisk_evasion');
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

/**
 * Layer 1 fast local text check (runs < 1ms on client AND re-runs on server).
 * Blocks profanity, hate speech, sexual content, severe harassment, and PIN/password scams
 * across English, Swahili, and major global languages while protecting allowlisted innocent words.
 */
export function checkTextModerationLocal(rawText: string): LocalModerationResult {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      blocked: false,
      flagged: false,
      category: 'safe',
      matchedTerms: [],
      friendlyMessage: '',
      friendlyMessageSw: '',
      suspiciousForAi: false,
      suspiciousReasons: [],
      cleanedText: rawText || '',
    };
  }

  const norm = normalizeTextForModeration(rawText);
  const matchedSet = new Set<string>();
  let detectedCategory: ModerationTermCategory | null = null;

  const recordMatch = (term: string, cat: ModerationTermCategory) => {
    matchedSet.add(term);
    // Prioritize severity: hate > harassment > sexual > scam > profanity
    const priority: Record<ModerationTermCategory, number> = {
      hate: 5,
      harassment: 4,
      sexual: 3,
      scam: 2,
      profanity: 1,
    };
    if (!detectedCategory || priority[cat] > priority[detectedCategory]) {
      detectedCategory = cat;
    }
  };

  // 1. Check multi-word blocked phrases on spaced & de-spaced text
  const phraseSearchHaystack = `${norm.spaced} | ${norm.deSpacedRuns}`;
  for (const item of compiledPhrases) {
    if (item.regex.test(phraseSearchHaystack)) {
      recordMatch(item.phrase, item.category);
    }
  }

  // 2. Check word-boundary terms across tokens from BOTH spaced AND deSpacedRuns (catches "k u m a", "f.a.g")
  const candidateTokens = new Set<string>([
    ...norm.spaced.split(/\s+/).filter(Boolean),
    ...norm.deSpacedRuns.split(/\s+/).filter(Boolean),
  ]);

  for (const tok of candidateTokens) {
    const alphaTok = tok.replace(/[^a-z\u0400-\u04FF\u0600-\u06FF]/g, '');
    if (!alphaTok || SAFE_ALLOWLIST.has(alphaTok)) continue;

    const exactHit = compiledBoundaryMap.get(alphaTok);
    if (exactHit) {
      recordMatch(exactHit.term, exactHit.category);
      continue;
    }

    // Check collapsed-repeat version ("shiiiit" -> "shit", "kummmma" -> "kuma")
    // Guard: don't match 3-char single-char reductions against 3-char normal words like "as"
    if (alphaTok.length >= 4) {
      const single = collapseAllRepeats(alphaTok);
      const singleHit = compiledBoundarySingleMap.get(single);
      if (singleHit && !SAFE_ALLOWLIST.has(alphaTok)) {
        recordMatch(singleHit.term, singleHit.category);
      }
    }
  }

  // 3. Check unambiguous strong terms inside masked tokens & squished string (catches hidden words inside other text)
  if (norm.squished.length >= 4) {
    const maskedTokens = norm.maskedSpaced.split(/\s+/).filter(Boolean);
    for (const entry of compiledStrongTerms) {
      // Direct substring on non-allowlisted individual tokens first (most accurate)
      let hit = false;
      for (const mTok of maskedTokens) {
        if (mTok.length >= entry.term.length && mTok.includes(entry.term)) {
          hit = true;
          break;
        }
        if (
          entry.singleCharTerm.length >= 4 &&
          mTok.length >= entry.singleCharTerm.length &&
          collapseAllRepeats(mTok).includes(entry.singleCharTerm)
        ) {
          hit = true;
          break;
        }
      }

      // Cross-token squished check for terms >= 5 chars (catches "f u c k i n g", "m.o.t.h.e.r.f.u.c.k.e.r", "k.u.m.a.m.a.k.o")
      // plus high-confidence 4-char explicit roots ("fuck", "cunt", "porn", "nude", "rape", "slut")
      if (
        !hit &&
        (entry.term.length >= 5 ||
          entry.term === 'fuck' ||
          entry.term === 'cunt' ||
          entry.term === 'porn' ||
          entry.term === 'rape' ||
          entry.term === 'slut')
      ) {
        if (norm.squished.includes(entry.term)) {
          hit = true;
        } else if (
          entry.singleCharTerm.length >= 5 &&
          norm.squishedSingleChar.includes(entry.singleCharTerm)
        ) {
          hit = true;
        }
      }

      if (hit) {
        recordMatch(entry.term, entry.category);
      }
    }
  }

  const matchedTerms = Array.from(matchedSet);
  if (matchedTerms.length > 0 && detectedCategory) {
    return {
      blocked: true,
      flagged: true,
      category: detectedCategory,
      matchedTerms,
      friendlyMessage: MODERATION_FRIENDLY_BLOCK_MESSAGE,
      friendlyMessageSw: MODERATION_FRIENDLY_BLOCK_MESSAGE_SW,
      suspiciousForAi: false,
      suspiciousReasons: [],
      cleanedText: rawText,
    };
  }

  // Passed Layer 1! Check if Layer 2 should optionally inspect with Gemini AI
  const suspiciousEval = evaluateSuspiciousSignals(rawText);

  return {
    blocked: false,
    flagged: false,
    category: 'safe',
    matchedTerms: [],
    friendlyMessage: '',
    friendlyMessageSw: '',
    suspiciousForAi: suspiciousEval.suspicious,
    suspiciousReasons: suspiciousEval.reasons,
    cleanedText: rawText,
  };
}

/**
 * Convenience helper for Layer 1 checks on usernames, bios, group names, hashtags, and AI captions.
 */
export function isTextAllowedLocally(rawText: string): {
  allowed: boolean;
  message: string;
  category: 'safe' | ModerationTermCategory;
  suspiciousForAi: boolean;
} {
  const res = checkTextModerationLocal(rawText);
  return {
    allowed: !res.blocked,
    message: res.blocked ? res.friendlyMessage : '',
    category: res.category,
    suspiciousForAi: res.suspiciousForAi,
  };
}

/**
 * Filters AI-generated captions/suggestions so AI never inserts disallowed language.
 * Returns empty string if the AI output fails Layer 1.
 */
export function sanitizeAiCaptionText(rawText?: string | null): string {
  if (!rawText || typeof rawText !== 'string') return '';
  const trimmed = rawText.trim();
  if (!trimmed) return '';
  const check = checkTextModerationLocal(trimmed);
  if (check.blocked) return '';
  return trimmed;
}

/**
 * Checks whether a user is currently muted (24h strike 2), temporarily suspended (7d strike 3),
 * or permanently banned (strike 4) using fields already present on UserProfile — ZERO extra Firestore reads.
 */
export interface UserRestrictionStatus {
  isRestricted: boolean;
  /** Convenience alias identical to `isRestricted` */
  restricted: boolean;
  isMuted: boolean;
  isSuspended: boolean;
  isPermanentlyBanned: boolean;
  remainingText: string;
  reason: string;
  /** Human-readable restriction message */
  message: string;
  untilMs: number;
}

export function formatRemainingDuration(ms: number): string {
  if (ms <= 0) return 'a moment';
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days} day${days === 1 ? '' : 's'}`;
}

export function getUserRestrictionStatus(
  profile?: {
    isBanned?: boolean;
    strikeLevel?: string;
    mutedUntilMs?: number;
    suspendedUntilMs?: number;
    warningMessage?: string;
    banReason?: string;
  } | null,
  nowMs?: number
): UserRestrictionStatus {
  if (!profile) {
    return {
      isRestricted: false,
      restricted: false,
      isMuted: false,
      isSuspended: false,
      isPermanentlyBanned: false,
      remainingText: '',
      reason: '',
      message: '',
      untilMs: 0,
    };
  }
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  if (profile.isBanned || profile.strikeLevel === 'permanent_ban') {
    const reason =
      profile.banReason || profile.warningMessage || 'Repeated community guideline violations.';
    return {
      isRestricted: true,
      restricted: true,
      isMuted: true,
      isSuspended: true,
      isPermanentlyBanned: true,
      remainingText: 'permanently',
      reason,
      message: `Your account is permanently restricted from posting (${reason}). You can submit an appeal in Safety & Support.`,
      untilMs: 0,
    };
  }
  if (typeof profile.suspendedUntilMs === 'number' && profile.suspendedUntilMs > now) {
    const rem = formatRemainingDuration(profile.suspendedUntilMs - now);
    const reason =
      profile.warningMessage || 'Temporary 7-day suspension for community guideline violations.';
    return {
      isRestricted: true,
      restricted: true,
      isMuted: true,
      isSuspended: true,
      isPermanentlyBanned: false,
      remainingText: rem,
      reason,
      message: `Your account is temporarily suspended for ${rem}. You can submit an appeal in Safety & Support.`,
      untilMs: profile.suspendedUntilMs,
    };
  }
  if (typeof profile.mutedUntilMs === 'number' && profile.mutedUntilMs > now) {
    const rem = formatRemainingDuration(profile.mutedUntilMs - now);
    const reason =
      profile.warningMessage ||
      `Your account is temporarily muted for ${rem}. You can still read posts and submit an appeal.`;
    return {
      isRestricted: true,
      restricted: true,
      isMuted: true,
      isSuspended: false,
      isPermanentlyBanned: false,
      remainingText: rem,
      reason,
      message: reason,
      untilMs: profile.mutedUntilMs,
    };
  }
  return {
    isRestricted: false,
    restricted: false,
    isMuted: false,
    isSuspended: false,
    isPermanentlyBanned: false,
    remainingText: '',
    reason: '',
    message: '',
    untilMs: 0,
  };
}

/**
 * Helper to determine whether a viewer should blur or completely hide borderline media.
 * - Under-18 accounts: Sensitive content filter is ALWAYS locked ON, and borderline media is hidden completely.
 * - 18+ accounts: Sensitive content filter is ON by default (`sensitiveContentFilter !== false`) and blurs borderline media.
 */
export function getMediaSafetyVisibility(
  mediaSafety: 'safe' | 'borderline' | 'unsafe' | null | undefined,
  viewerProfile?: {
    isUnder18?: boolean;
    sensitiveContentFilter?: boolean;
    privacySettings?: { isTeenAccount?: boolean };
  } | null
): 'show' | 'blur' | 'hide' {
  if (!mediaSafety || mediaSafety === 'safe') return 'show';
  if (mediaSafety === 'unsafe') return 'hide';

  // mediaSafety === 'borderline'
  const isMinor = Boolean(
    viewerProfile?.isUnder18 || viewerProfile?.privacySettings?.isTeenAccount
  );
  if (isMinor) return 'hide';

  const filterEnabled = viewerProfile?.sensitiveContentFilter !== false;
  return filterEnabled ? 'blur' : 'show';
}
