import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  ChallengeEntry,
  ChallengeParticipant,
  ChallengeWinner,
  CreatorChallenge,
  CustomBadge,
} from '../types';
import { BADGE_BY_ID } from '../config/progressionConfig';
import { fetchLatestAdminUpdates } from './adminUpdatesService';

const CHALLENGES_CACHE_KEY = 'wavelink_challenges_cache_v2';
const BADGES_CACHE_KEY = 'wavelink_custom_badges_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — avoids redundant Firestore reads

let challengesMemCache: { data: CreatorChallenge[]; fetchedAt: number } | null = null;
let challengesInflight: Promise<CreatorChallenge[]> | null = null;

let badgesMemCache: { data: CustomBadge[]; fetchedAt: number } | null = null;
let badgesInflight: Promise<CustomBadge[]> | null = null;

export interface UnifiedBadgeMeta {
  id: string;
  name: string;
  description: string;
  color: string;
  iconName: string;
  imageUrl?: string;
  rarity?: string;
  isCustom: boolean;
  challengeId?: string | null;
  challengeTitle?: string | null;
}

export const CURATED_BADGE_ICON_KEYS = [
  'trophy',
  'crown',
  'flame',
  'star',
  'sparkles',
  'award',
  'medal',
  'zap',
  'music',
  'camera',
  'video',
  'heart',
  'shield',
  'gem',
  'rocket',
  'palette',
  'globe',
  'compass',
  'sun',
  'feather',
] as const;

export const CURATED_BADGE_COLORS = [
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#ef4444',
  '#f97316',
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function readLocalCache<T>(key: string): { data: T[]; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.data) || typeof parsed?.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(key: string, data: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch {
    // ignore storage quota
  }
}

export function invalidateChallengesCache() {
  challengesMemCache = null;
  try {
    localStorage.removeItem(CHALLENGES_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function invalidateCustomBadgesCache() {
  badgesMemCache = null;
  try {
    localStorage.removeItem(BADGES_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fetch challenges with aggressive memory + localStorage caching (5 min TTL, 0 real-time listeners).
 */
export async function fetchChallengesCached(forceRefresh = false): Promise<CreatorChallenge[]> {
  const now = Date.now();
  if (!forceRefresh && challengesMemCache && now - challengesMemCache.fetchedAt < CACHE_TTL_MS) {
    return challengesMemCache.data;
  }
  if (!forceRefresh) {
    const ls = readLocalCache<CreatorChallenge>(CHALLENGES_CACHE_KEY);
    if (ls && now - ls.fetchedAt < CACHE_TTL_MS) {
      challengesMemCache = ls;
      return ls.data;
    }
  }
  if (challengesInflight && !forceRefresh) return challengesInflight;

  challengesInflight = (async () => {
    try {
      const q = query(collection(db, 'challenges'), orderBy('createdAt', 'desc'), limit(24));
      const snap = await getDocs(q).catch(() => getDocs(query(collection(db, 'challenges'), limit(24))));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CreatorChallenge))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      challengesMemCache = { data: list, fetchedAt: Date.now() };
      writeLocalCache(CHALLENGES_CACHE_KEY, list);
      return list;
    } catch {
      const fallback = readLocalCache<CreatorChallenge>(CHALLENGES_CACHE_KEY);
      return fallback?.data || [];
    } finally {
      challengesInflight = null;
    }
  })();

  return challengesInflight;
}

export function getActiveChallengeFromList(challenges: CreatorChallenge[]): CreatorChallenge | null {
  const now = Date.now();
  const active = challenges.find((c) => {
    if (c.status !== 'active') return false;
    const endMs = c.endDateMs || new Date(c.endDate || c.deadline || 0).getTime();
    return !endMs || endMs > now;
  });
  return active || null;
}

export function isChallengeExpired(challenge: CreatorChallenge): boolean {
  if (challenge.status === 'completed') return true;
  const endMs = challenge.endDateMs || new Date(challenge.endDate || challenge.deadline || 0).getTime();
  return Boolean(endMs && Date.now() > endMs);
}

/**
 * Fetch custom badges once per 5-minute window (bounded limit(50), 0 listeners).
 */
export async function fetchCustomBadgesCached(forceRefresh = false): Promise<CustomBadge[]> {
  const now = Date.now();
  if (!forceRefresh && badgesMemCache && now - badgesMemCache.fetchedAt < CACHE_TTL_MS) {
    return badgesMemCache.data;
  }
  if (!forceRefresh) {
    const ls = readLocalCache<CustomBadge>(BADGES_CACHE_KEY);
    if (ls && now - ls.fetchedAt < CACHE_TTL_MS) {
      badgesMemCache = ls;
      return ls.data;
    }
  }
  if (badgesInflight && !forceRefresh) return badgesInflight;

  badgesInflight = (async () => {
    try {
      const snap = await getDocs(query(collection(db, 'badges'), limit(50)));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CustomBadge))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      badgesMemCache = { data: list, fetchedAt: Date.now() };
      writeLocalCache(BADGES_CACHE_KEY, list);
      return list;
    } catch {
      const fallback = readLocalCache<CustomBadge>(BADGES_CACHE_KEY);
      return fallback?.data || [];
    } finally {
      badgesInflight = null;
    }
  })();

  return badgesInflight;
}

/**
 * Synchronous read from memory / localStorage cache for zero-read inline badge rendering
 * on posts, comments, and profile headers.
 */
export function getCachedCustomBadgesSync(): CustomBadge[] {
  if (badgesMemCache) return badgesMemCache.data;
  const ls = readLocalCache<CustomBadge>(BADGES_CACHE_KEY);
  if (ls) {
    badgesMemCache = ls;
    return ls.data;
  }
  return [];
}

/**
 * Resolve any badgeId (custom Firestore badge OR built-in progression badge) synchronously with 0 Firestore reads.
 */
export function resolveUnifiedBadge(
  badgeId: string | null | undefined,
  customBadgesOverride?: CustomBadge[]
): UnifiedBadgeMeta | null {
  if (!badgeId) return null;
  const customList = customBadgesOverride || getCachedCustomBadgesSync();
  const custom = customList.find((b) => b.id === badgeId);
  if (custom) {
    return {
      id: custom.id,
      name: custom.name,
      description: custom.description || 'Awarded by WaveLink',
      color: custom.color || '#8b5cf6',
      iconName: custom.iconName || 'trophy',
      imageUrl: custom.imageUrl || undefined,
      rarity: 'epic',
      isCustom: true,
      challengeId: custom.challengeId || null,
      challengeTitle: custom.challengeTitle || null,
    };
  }

  const builtIn = BADGE_BY_ID[badgeId];
  if (builtIn) {
    const rarityColor: Record<string, string> = {
      common: '#38bdf8',
      rare: '#a855f7',
      epic: '#ec4899',
      legendary: '#f59e0b',
    };
    return {
      id: builtIn.id,
      name: builtIn.name,
      description: builtIn.description,
      color: rarityColor[builtIn.rarity] || '#8b5cf6',
      iconName: builtIn.icon || 'award',
      rarity: builtIn.rarity,
      isCustom: false,
    };
  }

  return null;
}

export function formatCountdownParts(endDateIso?: string): {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  compact: string;
} {
  if (!endDateIso) {
    return { expired: false, days: 0, hours: 0, minutes: 0, seconds: 0, compact: 'Open' };
  }
  const diff = new Date(endDateIso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, compact: 'Ended' };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  const compact = days > 0 ? `${days}d ${hours}h left` : `${hours}h ${minutes}m left`;
  return { expired: false, days, hours, minutes, seconds, compact };
}

// ---------- SERVER API MUTATIONS & PAGINATED ADMIN READS ----------

export async function saveChallenge(payload: {
  id?: string;
  title: string;
  hashtag: string;
  description: string;
  rules?: string;
  type: 'photo' | 'video' | 'text' | 'any';
  coverImageUrl?: string;
  startDate?: string;
  endDate?: string;
  maxEntriesPerUser?: number | null;
  badgeId?: string | null;
  status?: 'active' | 'completed';
}): Promise<CreatorChallenge> {
  const resp = await fetch('/api/challenges/save', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not save challenge.');
  }
  invalidateChallengesCache();
  return data.challenge as CreatorChallenge;
}

export async function enterPostIntoChallenge(payload: {
  challengeId: string;
  postId: string;
  content: string;
  mediaType: 'image' | 'video' | 'none';
  thumbnailUrl?: string;
  imageUrl?: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
}): Promise<{ entry: ChallengeEntry; participant: ChallengeParticipant }> {
  const resp = await fetch('/api/challenges/enter', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not submit post to this challenge.');
  }
  invalidateChallengesCache();
  return { entry: data.entry, participant: data.participant };
}

export async function syncChallengePostLike(
  challengeId: string,
  postId: string,
  action: 'like' | 'unlike'
): Promise<void> {
  try {
    await fetch('/api/challenges/sync-like', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ challengeId, postId, action }),
    });
  } catch {
    // non-fatal background sync
  }
}

export async function fetchChallengeParticipantsPage(
  challengeId: string,
  options: { sortBy: 'likes' | 'entries'; offset?: number; limit?: number; search?: string }
): Promise<{
  participants: ChallengeParticipant[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const params = new URLSearchParams();
  params.set('sortBy', options.sortBy);
  params.set('offset', String(options.offset || 0));
  params.set('limit', String(Math.min(20, options.limit || 20)));
  if (options.search?.trim()) params.set('search', options.search.trim());

  const resp = await fetch(`/api/challenges/${encodeURIComponent(challengeId)}/participants?${params.toString()}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not load participants.');
  }
  return {
    participants: Array.isArray(data.participants) ? data.participants : [],
    hasMore: Boolean(data.hasMore),
    nextOffset: Number(data.nextOffset || 0),
  };
}

export async function fetchParticipantEntries(
  challengeId: string,
  participantUid: string
): Promise<ChallengeEntry[]> {
  const resp = await fetch(
    `/api/challenges/${encodeURIComponent(challengeId)}/participants/${encodeURIComponent(participantUid)}/entries`,
    {
      method: 'GET',
      headers: await getAuthHeaders(),
    }
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not load participant entries.');
  }
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function chooseChallengeWinners(
  challengeId: string,
  payload: {
    winners: Array<{ uid: string; placement: number; postId?: string; badgeId?: string }>;
    badgeId?: string | null;
    announcementNote?: string;
    markCompleted?: boolean;
  }
): Promise<{
  challenge: CreatorChallenge;
  winners: ChallengeWinner[];
  adminUpdateId: string;
}> {
  const resp = await fetch(`/api/challenges/${encodeURIComponent(challengeId)}/choose-winners`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not confirm challenge winners.');
  }
  invalidateChallengesCache();
  fetchLatestAdminUpdates(true).catch(() => {});
  return {
    challenge: data.challenge,
    winners: data.winners,
    adminUpdateId: data.adminUpdateId,
  };
}

export async function saveCustomBadge(payload: {
  id?: string;
  name: string;
  description: string;
  color: string;
  iconName?: string;
  imageUrl?: string;
  challengeId?: string | null;
  challengeTitle?: string | null;
}): Promise<CustomBadge> {
  const resp = await fetch('/api/badges/save', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not save badge.');
  }
  invalidateCustomBadgesCache();
  return data.badge as CustomBadge;
}

export async function deleteCustomBadge(badgeId: string): Promise<void> {
  const resp = await fetch(`/api/badges/${encodeURIComponent(badgeId)}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Could not delete badge.');
  }
  invalidateCustomBadgesCache();
}
