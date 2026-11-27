import { getAuthHeaders } from '../firebase';
import { XpActionType, LevelProgressInfo } from '../config/progressionConfig';

export interface ProgressionAwardMetadata {
  challengeId?: string;
  challengeTitle?: string;
  challengeHashtag?: string;
  thumbnailUrl?: string;
  placement?: number;
  streak?: number;
  postsCount?: number;
  likesReceived?: number;
  targetUserId?: string; // Only honored server-side for admin challenge_won or like_received
}

export interface ProgressionAwardResult {
  success: boolean;
  xpAwarded: number;
  dailyCapReached: boolean;
  xp: number;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
  tierName?: string;
  newBadges: string[];
  levelInfo?: LevelProgressInfo;
  error?: string;
}

export interface LevelUpEventDetail {
  newLevel: number;
  previousLevel: number;
  tierName: string;
  xpAwarded: number;
  newBadges: string[];
}

const LEVEL_UP_EVENT = 'wavelink:level-up';

/**
 * Subscribe to server-confirmed level-up events to display a celebration banner/toast.
 */
export function onLevelUp(handler: (detail: LevelUpEventDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (evt: Event) => {
    const custom = evt as CustomEvent<LevelUpEventDetail>;
    if (custom?.detail) {
      handler(custom.detail);
    }
  };
  window.addEventListener(LEVEL_UP_EVENT, listener);
  return () => window.removeEventListener(LEVEL_UP_EVENT, listener);
}

/**
 * Triggers a server-verified XP & badge award on POST /api/progression/award.
 * Daily caps and level calculations are strictly enforced on the server.
 */
export async function awardProgressionAction(
  action: XpActionType,
  metadata?: ProgressionAwardMetadata
): Promise<ProgressionAwardResult | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers || !(headers as Record<string, string>)['Authorization']) {
      return null;
    }

    const res = await fetch('/api/progression/award', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, metadata: metadata || {} })
    });

    if (!res.ok) return null;
    const data = (await res.json()) as ProgressionAwardResult;
    if (data?.success && data.leveledUp && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<LevelUpEventDetail>(LEVEL_UP_EVENT, {
          detail: {
            newLevel: data.level,
            previousLevel: data.previousLevel,
            tierName: data.tierName || 'Creator',
            xpAwarded: data.xpAwarded,
            newBadges: Array.isArray(data.newBadges) ? data.newBadges : []
          }
        })
      );
    }
    return data;
  } catch {
    return null;
  }
}
