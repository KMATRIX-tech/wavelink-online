import { auth } from '../firebase';
import type {
  ParentalControlsConfig,
  ParentalLinkedTeenSummary,
  ParentalAlertType,
  UserProfile
} from '../types';
import {
  DEFAULT_UNVERIFIED_TEEN_CONTROLS,
  isTeenAccountActive
} from '../config/ageConfig';

const SCREEN_TIME_STORAGE_PREFIX = 'wavelink_teen_screentime_v1_';

async function getBearerHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // ignore
    }
  }
  return headers;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLocalTodayMinutes(uid: string): number {
  if (typeof window === 'undefined' || !uid) return 0;
  try {
    const key = `${SCREEN_TIME_STORAGE_PREFIX}${uid}_${getLocalDateKey()}`;
    const raw = window.localStorage.getItem(key);
    const val = Number(raw || 0);
    return Number.isFinite(val) && val >= 0 ? val : 0;
  } catch {
    return 0;
  }
}

export function addLocalTodayMinutes(uid: string, deltaMinutes: number): number {
  if (typeof window === 'undefined' || !uid) return 0;
  const current = getLocalTodayMinutes(uid);
  const next = Math.min(1440, current + Math.max(0, deltaMinutes));
  try {
    const key = `${SCREEN_TIME_STORAGE_PREFIX}${uid}_${getLocalDateKey()}`;
    window.localStorage.setItem(key, String(next));
  } catch {
    // ignore storage quota
  }
  return next;
}

export function setLocalTodayMinutesAtLeast(uid: string, minutes: number): number {
  if (typeof window === 'undefined' || !uid) return minutes;
  const current = getLocalTodayMinutes(uid);
  const next = Math.max(current, Math.max(0, Math.round(minutes)));
  try {
    const key = `${SCREEN_TIME_STORAGE_PREFIX}${uid}_${getLocalDateKey()}`;
    window.localStorage.setItem(key, String(next));
  } catch {
    // ignore
  }
  return next;
}

/**
 * Checks whether the current local clock time falls inside [startHHMM, endHHMM].
 * Properly handles overnight bedtime spans such as 22:00 -> 06:30.
 */
export function isWithinBedtimeWindow(
  bedtimeEnabled: boolean,
  startHHMM?: string,
  endHHMM?: string,
  now: Date = new Date()
): boolean {
  if (!bedtimeEnabled || !startHHMM || !endHHMM) return false;
  const parse = (hhmm: string): number | null => {
    const m = hhmm.trim().match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = parse(startHHMM);
  const end = parse(endHHMM);
  if (start === null || end === null || start === end) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight span (e.g. 22:00 to 06:30)
  return current >= start || current < end;
}

export interface TeenRestrictionState {
  isTeen: boolean;
  isParentVerified: boolean;
  parentalStatus: 'none' | 'unverified_teen' | 'pending_parent' | 'linked';
  controls: ParentalControlsConfig | null;
  canPostPublicly: boolean;
  canShareLocation: boolean;
  canUseCalls: boolean;
  canReceiveStrangerMessages: boolean;
  messagingPolicy: 'everyone' | 'approved_friends' | 'nobody';
  requireFollowerApproval: boolean;
  strictSensitiveFilterLocked: boolean;
  isPaused: boolean;
  isBedtimeNow: boolean;
  todayMinutes: number;
  dailyLimitMinutes: number;
  remainingMinutes: number;
  isDailyLimitReached: boolean;
  lockReason: 'paused' | 'bedtime' | 'daily_limit' | null;
}

/**
 * Computes all effective teen safety & parental limits directly from the already-loaded
 * `userProfile` + local screen-time counter — ZERO extra Firestore reads or listeners!
 */
export function getTeenRestrictionState(
  userProfile?: UserProfile | null,
  overrideTodayMinutes?: number
): TeenRestrictionState {
  const isTeen = isTeenAccountActive(userProfile);
  if (!isTeen || !userProfile) {
    return {
      isTeen: false,
      isParentVerified: false,
      parentalStatus: 'none',
      controls: null,
      canPostPublicly: true,
      canShareLocation: true,
      canUseCalls: true,
      canReceiveStrangerMessages: true,
      messagingPolicy: 'everyone',
      requireFollowerApproval: false,
      strictSensitiveFilterLocked: false,
      isPaused: false,
      isBedtimeNow: false,
      todayMinutes: 0,
      dailyLimitMinutes: 1440,
      remainingMinutes: 1440,
      isDailyLimitReached: false,
      lockReason: null
    };
  }

  const parentalStatus =
    userProfile.parentalStatus || 'unverified_teen';
  const isParentVerified = parentalStatus === 'linked';
  const controls: ParentalControlsConfig = isParentVerified && userProfile.parentalSettings
    ? {
        ...DEFAULT_UNVERIFIED_TEEN_CONTROLS,
        ...userProfile.parentalSettings,
        strictSensitiveFilter: true,
        allowLocationSharing: false
      }
    : { ...DEFAULT_UNVERIFIED_TEEN_CONTROLS };

  const todayMinutes =
    typeof overrideTodayMinutes === 'number'
      ? overrideTodayMinutes
      : getLocalTodayMinutes(userProfile.id);

  const dailyLimitMinutes = controls.dailyLimitMinutes || 60;
  const remainingMinutes = Math.max(0, dailyLimitMinutes - todayMinutes);
  const isDailyLimitReached = isParentVerified && todayMinutes >= dailyLimitMinutes;
  const isBedtimeNow =
    isParentVerified &&
    isWithinBedtimeWindow(controls.bedtimeEnabled, controls.bedtimeStart, controls.bedtimeEnd);
  const isPaused = Boolean(controls.isPaused);

  let lockReason: 'paused' | 'bedtime' | 'daily_limit' | null = null;
  if (isPaused) lockReason = 'paused';
  else if (isBedtimeNow) lockReason = 'bedtime';
  else if (isDailyLimitReached) lockReason = 'daily_limit';

  return {
    isTeen: true,
    isParentVerified,
    parentalStatus,
    controls,
    // Until parent confirms, NO public posting, NO calls, NO stranger messages
    canPostPublicly: isParentVerified && controls.profileVisibility === 'public' && !isPaused,
    canShareLocation: false, // ALWAYS blocked for teen accounts
    canUseCalls: isParentVerified && Boolean(controls.allowCalls) && !isPaused,
    canReceiveStrangerMessages: false, // ALWAYS blocked for teen accounts
    messagingPolicy: !isParentVerified ? 'approved_friends' : controls.messagingPolicy,
    requireFollowerApproval: !isParentVerified ? true : Boolean(controls.requireFollowerApproval),
    strictSensitiveFilterLocked: true, // ALWAYS locked ON
    isPaused,
    isBedtimeNow,
    todayMinutes,
    dailyLimitMinutes,
    remainingMinutes,
    isDailyLimitReached,
    lockReason
  };
}

/**
 * Helper to decide whether a teen profile should be hidden from search/directory results
 * for non-connected adult strangers.
 */
export function shouldHideTeenFromSearch(
  targetUser: UserProfile,
  viewerProfile?: UserProfile | null,
  isViewerConnectedToTarget?: boolean,
  isViewerAdmin?: boolean
): boolean {
  if (!isTeenAccountActive(targetUser)) return false;
  if (!viewerProfile) return true; // Never expose teen profiles to unauthenticated viewers
  if (targetUser.id === viewerProfile.id) return false; // Teen can see themselves
  if (isViewerAdmin) return false; // Moderators/admins
  if (isViewerConnectedToTarget) return false; // Already following / friend
  // Hide teen accounts from adult strangers in search results
  const viewerIsAdult = !isTeenAccountActive(viewerProfile);
  if (viewerIsAdult) return true;
  // Even for other teens, hide unverified/private teens unless connected
  if (targetUser.parentalStatus !== 'linked' || targetUser.parentalSettings?.profileVisibility !== 'public') {
    return true;
  }
  return false;
}

// ===============================================================
// SERVER API CALLS (Zero extra Firestore listeners)
// ===============================================================

export async function requestParentLink(parentEmail: string): Promise<{
  success: boolean;
  maskedEmail?: string;
  emailSent?: boolean;
  message?: string;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/request-link', {
    method: 'POST',
    headers,
    body: JSON.stringify({ parentEmail: parentEmail.trim().toLowerCase() })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function verifyParentLink(payload: {
  token?: string;
  teenUid?: string;
  code?: string;
}): Promise<{
  success: boolean;
  alreadyVerified?: boolean;
  teenUid?: string;
  teenDisplayName?: string;
  controls?: ParentalControlsConfig;
  message?: string;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/verify-link', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function fetchTeenParentalStatus(): Promise<{
  success: boolean;
  isUnder18?: boolean;
  turns18At?: string | null;
  parentalStatus?: 'none' | 'unverified_teen' | 'pending_parent' | 'linked';
  parentEmailMasked?: string | null;
  verifiedAt?: string | null;
  controls?: ParentalControlsConfig | null;
  todayMinutes?: number;
  deletionRequested?: boolean;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/teen-status', { method: 'GET', headers });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function syncTeenScreenTime(deltaMinutes: number): Promise<{
  success: boolean;
  todayMinutes?: number;
}> {
  if (deltaMinutes <= 0) return { success: true };
  try {
    const headers = await getBearerHeaders();
    const resp = await fetch('/api/parental/sync-screen-time', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: getLocalDateKey(), deltaMinutes })
    });
    return resp.json().catch(() => ({ success: false }));
  } catch {
    return { success: false };
  }
}

export async function fetchParentDashboard(): Promise<{
  success: boolean;
  teens?: ParentalLinkedTeenSummary[];
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/dashboard', { method: 'GET', headers });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function updateTeenControlsByParent(
  teenUid: string,
  controls: Partial<ParentalControlsConfig>
): Promise<{
  success: boolean;
  controls?: ParentalControlsConfig;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/update-controls', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teenUid, controls })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function submitTeenFollowRequest(teenUid: string): Promise<{
  success: boolean;
  pendingApproval?: boolean;
  message?: string;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/follow-request', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teenUid })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function decideTeenFollowerByParent(
  requestId: string,
  decision: 'approve' | 'decline'
): Promise<{ success: boolean; decision?: string; error?: string }> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/approve-follower', {
    method: 'POST',
    headers,
    body: JSON.stringify({ requestId, decision })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function triggerParentalAlert(
  teenUid: string,
  type: Exclude<ParentalAlertType, 'link_verified' | 'deletion_requested'>,
  actorName?: string
): Promise<void> {
  try {
    const headers = await getBearerHeaders();
    await fetch('/api/parental/trigger-alert', {
      method: 'POST',
      headers,
      body: JSON.stringify({ teenUid, type, actorName })
    });
  } catch {
    // Non-blocking safety notification
  }
}

export async function markParentAlertsRead(teenUid: string): Promise<{ success: boolean }> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/alerts/mark-read', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teenUid })
  });
  return resp.json().catch(() => ({ success: false }));
}

export async function unlinkTeenByParent(teenUid: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/unlink', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teenUid })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}

export async function requestTeenDeletionByParent(
  teenUid: string,
  reason?: string
): Promise<{
  success: boolean;
  requestId?: string;
  message?: string;
  error?: string;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/parental/request-deletion', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teenUid, reason })
  });
  return resp.json().catch(() => ({ success: false, error: 'Network error.' }));
}
