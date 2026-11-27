/**
 * WaveLink Age Policy & Parental Controls Configuration
 *
 * SINGLE CONFIGURABLE CONSTANT:
 * Change MIN_SIGNUP_AGE below (and keep SERVER_MIN_SIGNUP_AGE in server.ts in sync)
 * to adjust the minimum age required to join WaveLink.
 */
export const MIN_SIGNUP_AGE = 13;

/**
 * Accounts with age >= MIN_SIGNUP_AGE and age < ADULT_AGE_THRESHOLD
 * are automatically treated as protected Teen Accounts.
 */
export const ADULT_AGE_THRESHOLD = 18;

export interface MinimalAgeRecord {
  valid: boolean;
  allowed: boolean;
  age: number;
  isTeen: boolean;
  birthYear: number;
  birthMonth: number; // 1–12
  turns18At: string; // YYYY-MM-DD (minimal milestone date, not raw birthday shown publicly)
  reason?: string;
}

/**
 * Compute exact age in whole years from a YYYY-MM-DD date string using local calendar date.
 */
export function calculateAgeFromDob(dobIso: string, referenceDate: Date = new Date()): number | null {
  if (!dobIso || typeof dobIso !== 'string') return null;
  const match = dobIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > referenceDate.getFullYear()) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dob = new Date(year, month - 1, day);
  // Reject invalid calendar dates like 2010-02-31
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) {
    return null;
  }
  if (dob.getTime() > referenceDate.getTime()) return null;

  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < day)) {
    age -= 1;
  }
  return age;
}

/**
 * Data-minimization helper: converts a sign-up DOB into ONLY the minimal fields
 * needed to enforce minimum age and Teen Account protections.
 * Raw full date of birth is NOT exposed on public profiles.
 */
export function deriveMinimalAgeRecord(dobIso: string, referenceDate: Date = new Date()): MinimalAgeRecord {
  const age = calculateAgeFromDob(dobIso, referenceDate);
  if (age === null) {
    return {
      valid: false,
      allowed: false,
      age: 0,
      isTeen: false,
      birthYear: 0,
      birthMonth: 0,
      turns18At: '',
      reason: 'Please enter a valid date of birth.'
    };
  }

  const [yearStr, monthStr, dayStr] = dobIso.trim().split('-');
  const birthYear = Number(yearStr);
  const birthMonth = Number(monthStr);
  const birthDay = Number(dayStr);

  if (age < MIN_SIGNUP_AGE) {
    return {
      valid: true,
      allowed: false,
      age,
      isTeen: true,
      birthYear,
      birthMonth,
      turns18At: '',
      reason: `You must be at least ${MIN_SIGNUP_AGE} years old to join WaveLink.`
    };
  }

  const isTeen = age < ADULT_AGE_THRESHOLD;
  const turns18Year = birthYear + ADULT_AGE_THRESHOLD;
  const paddedMonth = String(birthMonth).padStart(2, '0');
  const paddedDay = String(Math.min(birthDay, 28)).padStart(2, '0');
  const turns18At = `${turns18Year}-${paddedMonth}-${paddedDay}`;

  return {
    valid: true,
    allowed: true,
    age,
    isTeen,
    birthYear,
    birthMonth,
    turns18At
  };
}

/**
 * Determine if a profile is currently a Teen Account.
 * Automatically honors `turns18At` once the user reaches 18 (unless parent link is still active).
 */
export function isTeenAccountActive(profile?: {
  isUnder18?: boolean;
  turns18At?: string;
  parentalStatus?: string | null;
  privacySettings?: { isTeenAccount?: boolean } | null;
} | null): boolean {
  if (!profile) return false;
  if (profile.parentalStatus === 'linked' || profile.parentalStatus === 'pending_parent' || profile.parentalStatus === 'unverified_teen') {
    return true;
  }
  const flagged = Boolean(profile.isUnder18 || profile.privacySettings?.isTeenAccount);
  if (!flagged) return false;
  if (profile.turns18At && /^\d{4}-\d{2}-\d{2}$/.test(profile.turns18At)) {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (todayIso >= profile.turns18At && profile.parentalStatus !== 'linked') {
      return false;
    }
  }
  return true;
}

export const DEFAULT_UNVERIFIED_TEEN_CONTROLS = {
  dailyLimitMinutes: 60,
  bedtimeEnabled: true,
  bedtimeStart: '22:00',
  bedtimeEnd: '06:30',
  messagingPolicy: 'approved_friends' as const,
  profileVisibility: 'private' as const,
  allowCalls: false,
  strictSensitiveFilter: true as const,
  requireFollowerApproval: true,
  isPaused: false,
  allowLocationSharing: false as const,
  emailAlertsEnabled: true
};

export const DEFAULT_VERIFIED_TEEN_CONTROLS = {
  dailyLimitMinutes: 90,
  bedtimeEnabled: false,
  bedtimeStart: '22:00',
  bedtimeEnd: '06:30',
  messagingPolicy: 'approved_friends' as const,
  profileVisibility: 'private' as const,
  allowCalls: false,
  strictSensitiveFilter: true as const,
  requireFollowerApproval: true,
  isPaused: false,
  allowLocationSharing: false as const,
  emailAlertsEnabled: true
};

export const PARENTAL_PRIVACY_NOTICE = {
  signupShortEn: `We ask for your date of birth only to confirm you meet the minimum age (${MIN_SIGNUP_AGE}+) and to turn on age-appropriate teen safety protections for accounts under ${ADULT_AGE_THRESHOLD}. Your birthday is never shown publicly.`,
  signupShortSw: `Tunauliza tarehe yako ya kuzaliwa ili kuthibitisha umri wa kujiunga (${MIN_SIGNUP_AGE}+) na kuwasha ulinzi wa usalama kwa akaunti za vijana chini ya miaka ${ADULT_AGE_THRESHOLD}. Tarehe yako haionyeshwi hadharani.`,
  teenTransparencyEn:
    'Your parent or guardian can see your daily time spent on WaveLink, number of posts, who you follow and who follows you, challenges joined, and safety alerts. They CANNOT read your private chat messages.',
  teenTransparencySw:
    'Mzazi au mlezi wako anaweza kuona muda wako wa kila siku kwenye WaveLink, idadi ya machapisho, unaowafuata na wanaokufuata, changamoto ulizoshiriki, na arifa za usalama. HAWEZI kusoma ujumbe wako wa faragha.',
  parentConsentEn:
    'By confirming this link, you verify that you are the parent or legal guardian of this teen account. WaveLink stores only minimal age data and never shares private message contents in the Parent Dashboard.'
};
