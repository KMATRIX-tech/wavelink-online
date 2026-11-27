/**
 * WaveLink Client Moderation & Safety Service
 * Coordinates Layer 1 (instant local check), Layer 2 (server check + selective Gemini AI),
 * Layer 3 (upload-time image/thumbnail check), and Layer 4 (reports, blocks, mutes, strikes, queue).
 *
 * ZERO extra Firestore background reads or real-time listeners:
 * - Layer 1 uses the compact local dictionary in profanityList.ts.
 * - Restriction checks read fields already loaded on userProfile.
 * - Admin Moderation Queue loads on-demand via REST only when opened by an admin or sub-admin.
 */

import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getAuthHeaders } from '../firebase';
import {
  checkTextModerationLocal,
  getUserRestrictionStatus,
  MODERATION_FRIENDLY_BLOCK_MESSAGE,
} from '../utils/contentModeration';
import type {
  UserProfile,
  ReportReasonCategory,
  MediaSafetyLevel,
  ModerationQueueResponse,
  StrikeLevel,
} from '../types';

export type ModerationContentContext =
  | 'post'
  | 'comment'
  | 'reply'
  | 'message'
  | 'chat'
  | 'group'
  | 'group_name'
  | 'username'
  | 'bio'
  | 'hashtag'
  | 'challenge'
  | 'spark'
  | 'ai_caption'
  | 'chat_note';

export interface TextModerationVerdict {
  allowed: boolean;
  blocked: boolean;
  category: string;
  friendlyMessage: string;
  moderationChecked: boolean;
  moderationCheckedAt?: string;
  moderationSig?: string;
  usedAi?: boolean;
  quotaExceeded?: boolean;
}

/**
 * Runs Layer 1 locally (instant feedback) + Layer 2 server check (cannot be bypassed).
 * If blocked, returns `{ allowed: false, friendlyMessage }` so the caller keeps the text
 * in the input box and lets the user edit it without shaming.
 */
export async function validateAndModerateText(
  rawText: string,
  context: ModerationContentContext,
  userProfile?: Partial<UserProfile> | null,
  options?: { skipServerIfEmpty?: boolean; forceDeepCheck?: boolean }
): Promise<TextModerationVerdict> {
  const text = typeof rawText === 'string' ? rawText.trim() : '';

  // 0. Check active mute / suspension / ban on the user's already-loaded profile (0 Firestore reads)
  const restriction = getUserRestrictionStatus(userProfile);
  if (restriction.isRestricted && context !== 'username' && context !== 'bio') {
    return {
      allowed: false,
      blocked: true,
      category: 'account_restricted',
      friendlyMessage: restriction.isPermanentlyBanned
        ? 'Your account is permanently restricted from posting. You can submit an appeal in Safety & Support.'
        : restriction.isSuspended
        ? `Your account is temporarily suspended (${restriction.remainingText} remaining). You can submit an appeal if you believe this is a mistake.`
        : `You are temporarily muted for ${restriction.remainingText}. You can still browse and submit an appeal.`,
      moderationChecked: false,
    };
  }

  if (!text) {
    if (options?.skipServerIfEmpty) {
      return {
        allowed: true,
        blocked: false,
        category: 'safe',
        friendlyMessage: '',
        moderationChecked: true,
        moderationCheckedAt: new Date().toISOString(),
      };
    }
    return {
      allowed: true,
      blocked: false,
      category: 'safe',
      friendlyMessage: '',
      moderationChecked: true,
      moderationCheckedAt: new Date().toISOString(),
    };
  }

  // 1. LAYER 1: Instant local normalized multilingual profanity/hate/sexual/scam filter (< 1ms)
  const localCheck = checkTextModerationLocal(text);
  if (localCheck.blocked) {
    return {
      allowed: false,
      blocked: true,
      category: localCheck.category,
      friendlyMessage: localCheck.friendlyMessage || MODERATION_FRIENDLY_BLOCK_MESSAGE,
      moderationChecked: false,
    };
  }

  // 2. LAYER 2: Server check (unbypassable re-check + selective Gemini AI ONLY if suspicious)
  try {
    const headers = await getAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('/api/moderation/check-text', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        text: text.slice(0, 4000),
        context,
        forceDeepCheck: Boolean(options?.forceDeepCheck),
      }),
    });
    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 429) {
      return {
        allowed: false,
        blocked: true,
        category: 'rate_limited',
        friendlyMessage:
          data.error ||
          'Safety check is busy right now. Please wait a few seconds and try again.',
        moderationChecked: false,
        quotaExceeded: true,
      };
    }

    if (resp.status === 403 && data.restricted) {
      return {
        allowed: false,
        blocked: true,
        category: 'account_restricted',
        friendlyMessage:
          data.error || 'Your account is temporarily restricted from posting.',
        moderationChecked: false,
      };
    }

    if (resp.ok && data.flagged) {
      return {
        allowed: false,
        blocked: true,
        category: String(data.category || 'moderation'),
        friendlyMessage: data.friendlyMessage || MODERATION_FRIENDLY_BLOCK_MESSAGE,
        moderationChecked: false,
        usedAi: Boolean(data.usedAi),
      };
    }

    if (resp.ok && data.success) {
      return {
        allowed: true,
        blocked: false,
        category: 'safe',
        friendlyMessage: '',
        moderationChecked: true,
        moderationCheckedAt: String(data.moderationCheckedAt || new Date().toISOString()),
        moderationSig: typeof data.moderationSig === 'string' ? data.moderationSig : undefined,
        usedAi: Boolean(data.usedAi),
      };
    }
  } catch {
    // Never freeze the UI if the server check is momentarily unreachable; Layer 1 already passed
    // and the Firestore-triggered Cloud Function performs an asynchronous Layer 2 backup review.
  }

  return {
    allowed: true,
    blocked: false,
    category: 'safe',
    friendlyMessage: '',
    moderationChecked: true,
    moderationCheckedAt: new Date().toISOString(),
  };
}

/**
 * Layer 3: Check an image or video thumbnail base64 data URL once at upload time.
 * Returns { allowed, mediaSafety: 'safe' | 'borderline' | 'unsafe', reason }.
 */
export async function checkImageSafetyOnce(
  base64DataUrl: string,
  mimeType = 'image/jpeg',
  source: 'image_upload' | 'video_thumbnail' | 'avatar' | 'cover' = 'image_upload'
): Promise<{
  allowed: boolean;
  mediaSafety: MediaSafetyLevel;
  reason: string;
  quotaExceeded?: boolean;
}> {
  if (!base64DataUrl || typeof base64DataUrl !== 'string') {
    return { allowed: true, mediaSafety: 'safe', reason: '' };
  }
  try {
    const headers = await getAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const resp = await fetch('/api/moderation/check-image', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        imageDataUrl: base64DataUrl,
        mimeType,
        source,
      }),
    });
    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429) {
      return {
        allowed: false,
        mediaSafety: 'unsafe',
        reason:
          data.error ||
          'Media safety check is busy right now. Please try uploading again in a moment.',
        quotaExceeded: true,
      };
    }
    if (resp.status === 422 || data.mediaSafety === 'unsafe' || data.allowed === false) {
      return {
        allowed: false,
        mediaSafety: 'unsafe',
        reason:
          data.reason ||
          'This image cannot be uploaded because it contains nudity or graphic content that violates WaveLink Community Guidelines.',
      };
    }
    if (data.mediaSafety === 'borderline') {
      return {
        allowed: true,
        mediaSafety: 'borderline',
        reason: data.reason || 'Marked as sensitive content.',
      };
    }
    return { allowed: true, mediaSafety: 'safe', reason: '' };
  } catch {
    return { allowed: true, mediaSafety: 'safe', reason: '' };
  }
}

/**
 * Layer 4: Submit a content or profile report (auto-hides after 3 independent reporters).
 */
export async function submitContentReport(params: {
  targetType: 'post' | 'comment' | 'message' | 'user' | 'reel' | 'spark';
  targetId: string;
  targetAuthorId?: string;
  targetAuthorName?: string;
  postId?: string;
  channelId?: string;
  groupId?: string;
  targetSummary?: string;
  reasonCategory: ReportReasonCategory;
  details?: string;
}): Promise<{
  success: boolean;
  autoHidden?: boolean;
  reportCount?: number;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/safety/report', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetType: params.targetType,
      targetId: params.targetId,
      targetAuthorId: params.targetAuthorId || '',
      targetAuthorName: params.targetAuthorName || '',
      postId: params.postId || '',
      channelId: params.channelId || '',
      groupId: params.groupId || '',
      targetSummary: (params.targetSummary || '').slice(0, 300),
      reasonCategory: params.reasonCategory,
      reason: `${params.reasonCategory}${params.details?.trim() ? `: ${params.details.trim()}` : ''}`,
      details: (params.details || '').trim().slice(0, 500),
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not submit report right now. Please try again.');
  }
  return {
    success: true,
    autoHidden: Boolean(data.autoHidden),
    reportCount: Number(data.reportCount || 1),
    message:
      data.message ||
      'Thank you for helping keep WaveLink safe. Our moderation team will review this.',
  };
}

/**
 * Layer 4: Block or unblock a user (1 write to current user's profile doc, 0 extra reads).
 */
export async function toggleBlockUser(
  currentUid: string,
  targetUid: string,
  shouldBlock: boolean
): Promise<void> {
  if (!currentUid || !targetUid || currentUid === targetUid) return;
  await updateDoc(doc(db, 'users', currentUid), {
    blockedUserIds: shouldBlock ? arrayUnion(targetUid) : arrayRemove(targetUid),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Layer 4: Mute or unmute a user (hides their posts/comments locally without notifying them — 1 write, 0 reads).
 */
export async function toggleMuteUser(
  currentUid: string,
  targetUid: string,
  shouldMute: boolean
): Promise<void> {
  if (!currentUid || !targetUid || currentUid === targetUid) return;
  await updateDoc(doc(db, 'users', currentUid), {
    mutedUserIds: shouldMute ? arrayUnion(targetUid) : arrayRemove(targetUid),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Layer 4 (Admin & Sub-Admin only): Load Moderation Queue on-demand (no real-time listeners).
 */
export async function fetchModerationQueue(): Promise<ModerationQueueResponse> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/moderation/queue', {
    method: 'GET',
    headers,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not load moderation queue.');
  }
  return {
    reports: Array.isArray(data.reports) ? data.reports : [],
    appeals: Array.isArray(data.appeals) ? data.appeals : [],
    recentLogs: Array.isArray(data.auditLogs)
      ? data.auditLogs
      : Array.isArray(data.recentLogs)
      ? data.recentLogs
      : [],
  };
}

/**
 * Layer 4 (Admin & Sub-Admin only): Execute Approve, Remove, or Strike
 * (`warn` | `mute_24h` | `suspend_7d` | `ban` | `strike_auto`).
 */
export async function executeModerationQueueAction(params: {
  action: 'approve' | 'remove' | 'warn' | 'mute_24h' | 'suspend_7d' | 'ban' | 'strike_auto';
  reportId?: string;
  targetType: 'post' | 'comment' | 'message' | 'user' | 'reel' | 'spark' | 'video';
  targetId: string;
  targetUserId?: string;
  targetAuthorId?: string;
  postId?: string;
  channelId?: string;
  groupId?: string;
  reason?: string;
}): Promise<{ success: boolean; message: string; appliedStrike?: StrikeLevel }> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/moderation/action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...params,
      targetUserId: params.targetUserId || params.targetAuthorId || '',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not complete moderation action.');
  }
  return {
    success: true,
    message: data.message || 'Moderation action recorded.',
    appliedStrike: data.appliedStrike || data.strikeLevel,
  };
}

/**
 * Layer 4 (Admin & Sub-Admin only): Approve or reject a submitted moderation appeal.
 */
export async function reviewModerationAppeal(params: {
  appealId: string;
  status: 'approved' | 'rejected';
  resolutionNote?: string;
}): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/safety/appeal/review', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not update appeal right now.');
  }
  return {
    success: true,
    message: data.message || `Appeal ${params.status}.`,
  };
}

/**
 * Layer 4 (User): Submit an appeal for a warning, mute, suspension, ban, or hidden content.
 */
export async function submitUserAppeal(params: {
  targetType: 'post' | 'comment' | 'reel' | 'account_ban' | 'account_mute' | 'account_suspension' | 'strike';
  targetId: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/safety/appeal', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not submit appeal right now.');
  }
  return {
    success: true,
    message: data.message || 'Appeal submitted. A moderator will review your request.',
  };
}

