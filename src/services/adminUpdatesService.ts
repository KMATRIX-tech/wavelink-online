import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { AdminUpdateItem, AdminUpdateType } from '../types';

const PAGE_SIZE = 10;
const LOCAL_SEEN_PREFIX = 'wavelink_last_seen_update_at_';
const LOCAL_TOAST_DISMISSED_PREFIX = 'wavelink_admin_update_toast_dismissed_';

// Shared in-memory singleton cache so the entire app performs at most ONE initial query (10 docs)
let cachedUpdates: AdminUpdateItem[] = [];
let hasFetchedInitial = false;
let isFetchingInitial = false;
let lastDocCursor: QueryDocumentSnapshot<DocumentData> | null = null;
let hasMoreOlder = false;
let lastQuotaError = false;
let latestNewlyPostedId: string | null = null;

type CacheListener = () => void;
const listeners = new Set<CacheListener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

function normalizeAdminUpdateDoc(id: string, data: Record<string, any>): AdminUpdateItem {
  const validTypes: AdminUpdateType[] = [
    'new_feature',
    'improvement',
    'bug_fix',
    'maintenance',
    'announcement',
  ];
  const rawType = String(data.type || 'announcement') as AdminUpdateType;
  const type: AdminUpdateType = validTypes.includes(rawType) ? rawType : 'announcement';
  const role = data.role === 'subadmin' ? 'subadmin' : 'admin';

  return {
    id,
    title: String(data.title || 'WaveLink Update').slice(0, 60),
    message: String(data.message || ''),
    messageSw: data.messageSw ? String(data.messageSw) : undefined,
    type,
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    authorUid: String(data.authorUid || ''),
    authorName: String(data.authorName || 'WaveLink Admin'),
    role,
    createdAt: String(data.createdAt || new Date().toISOString()),
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    pinned: Boolean(data.pinned),
    deleted: Boolean(data.deleted),
    alsoSendPush: Boolean(data.alsoSendPush),
  };
}

function sortUpdatesList(items: AdminUpdateItem[]): AdminUpdateItem[] {
  return [...items]
    .filter((item) => !item.deleted)
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
}

function isQuotaExceededError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('quota') ||
    msg.includes('resource exhausted')
  );
}

/**
 * Fetches the latest 10 adminUpdates with a single getDocs query and caches them in memory.
 * No real-time listeners are created.
 */
export async function fetchLatestAdminUpdates(forceRefresh = false): Promise<{
  updates: AdminUpdateItem[];
  quotaError: boolean;
}> {
  if (hasFetchedInitial && !forceRefresh) {
    return { updates: cachedUpdates, quotaError: lastQuotaError };
  }
  if (isFetchingInitial) {
    return { updates: cachedUpdates, quotaError: lastQuotaError };
  }

  isFetchingInitial = true;
  lastQuotaError = false;
  notifyListeners();

  try {
    const q = query(
      collection(db, 'adminUpdates'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    const fetched: AdminUpdateItem[] = [];
    snap.docs.forEach((d) => {
      const normalized = normalizeAdminUpdateDoc(d.id, d.data());
      if (!normalized.deleted) {
        fetched.push(normalized);
      }
    });

    cachedUpdates = sortUpdatesList(fetched);
    lastDocCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    hasMoreOlder = snap.docs.length === PAGE_SIZE;
    hasFetchedInitial = true;
    lastQuotaError = false;
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      lastQuotaError = true;
    } else {
      console.warn('Admin updates fetch notice:', err);
    }
  } finally {
    isFetchingInitial = false;
    notifyListeners();
  }

  return { updates: cachedUpdates, quotaError: lastQuotaError };
}

/**
 * Paginates older adminUpdates 10 at a time when the user clicks "Load older updates".
 */
export async function loadOlderAdminUpdates(): Promise<{
  updates: AdminUpdateItem[];
  hasMore: boolean;
  quotaError: boolean;
}> {
  if (!lastDocCursor || !hasMoreOlder) {
    return { updates: cachedUpdates, hasMore: false, quotaError: lastQuotaError };
  }

  try {
    const q = query(
      collection(db, 'adminUpdates'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDocCursor),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    const olderBatch: AdminUpdateItem[] = [];
    snap.docs.forEach((d) => {
      const normalized = normalizeAdminUpdateDoc(d.id, d.data());
      if (!normalized.deleted) {
        olderBatch.push(normalized);
      }
    });

    const existingIds = new Set(cachedUpdates.map((u) => u.id));
    const merged = [...cachedUpdates];
    for (const item of olderBatch) {
      if (!existingIds.has(item.id)) {
        merged.push(item);
      }
    }

    cachedUpdates = sortUpdatesList(merged);
    lastDocCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : lastDocCursor;
    hasMoreOlder = snap.docs.length === PAGE_SIZE;
    lastQuotaError = false;
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      lastQuotaError = true;
    }
  }

  notifyListeners();
  return { updates: cachedUpdates, hasMore: hasMoreOlder, quotaError: lastQuotaError };
}

/**
 * Immediately inserts or updates a posted/edited update in the in-memory cache
 * without requiring an extra Firestore read, and triggers the in-app toast.
 */
export function upsertCachedAdminUpdate(item: AdminUpdateItem, triggerInAppToast = false) {
  const filtered = cachedUpdates.filter((u) => u.id !== item.id);
  if (!item.deleted) {
    filtered.unshift(item);
  }
  cachedUpdates = sortUpdatesList(filtered);
  hasFetchedInitial = true;
  if (triggerInAppToast && !item.deleted) {
    latestNewlyPostedId = item.id;
  }
  notifyListeners();
}

export function removeCachedAdminUpdate(updateId: string) {
  cachedUpdates = cachedUpdates.filter((u) => u.id !== updateId);
  if (latestNewlyPostedId === updateId) {
    latestNewlyPostedId = null;
  }
  notifyListeners();
}

export function getEffectiveLastSeenUpdateAt(
  uid?: string | null,
  profileLastSeenUpdateAt?: string | null
): string {
  let localVal = '';
  if (uid && typeof window !== 'undefined') {
    try {
      localVal = localStorage.getItem(`${LOCAL_SEEN_PREFIX}${uid}`) || '';
    } catch {
      // ignore storage errors
    }
  }
  const propVal = profileLastSeenUpdateAt || '';
  if (localVal && propVal) {
    return localVal > propVal ? localVal : propVal;
  }
  return localVal || propVal || '';
}

export function setLocalLastSeenUpdateAt(uid: string, isoTimestamp: string) {
  if (!uid || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_SEEN_PREFIX}${uid}`, isoTimestamp);
  } catch {
    // ignore
  }
}

export function getUpdateTypeMeta(type: AdminUpdateType): {
  label: string;
  labelSw: string;
  badgeColor: string;
  borderColor: string;
  glowColor: string;
  emoji: string;
} {
  switch (type) {
    case 'new_feature':
      return {
        label: 'New feature',
        labelSw: 'Kipengele kipya',
        badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
        borderColor: 'rgba(56, 189, 248, 0.35)',
        glowColor: 'rgba(56, 189, 248, 0.14)',
        emoji: '✨',
      };
    case 'improvement':
      return {
        label: 'Improvement',
        labelSw: 'Maboresho',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
        borderColor: 'rgba(52, 211, 153, 0.35)',
        glowColor: 'rgba(52, 211, 153, 0.14)',
        emoji: '⚡',
      };
    case 'bug_fix':
      return {
        label: 'Bug fix',
        labelSw: 'Marekebisho',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
        borderColor: 'rgba(251, 191, 36, 0.35)',
        glowColor: 'rgba(251, 191, 36, 0.14)',
        emoji: '🛠️',
      };
    case 'maintenance':
      return {
        label: 'Maintenance',
        labelSw: 'Matengenezo',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
        borderColor: 'rgba(192, 132, 252, 0.35)',
        glowColor: 'rgba(192, 132, 252, 0.14)',
        emoji: '🔧',
      };
    case 'announcement':
    default:
      return {
        label: 'Announcement',
        labelSw: 'Tangazo',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
        borderColor: 'rgba(251, 113, 133, 0.35)',
        glowColor: 'rgba(251, 113, 133, 0.14)',
        emoji: '📢',
      };
  }
}

export function formatAdminUpdateDateTime(isoString?: string): string {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isToday) {
    return `Today, ${timeStr}`;
  }
  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${dateStr}, ${timeStr}`;
}

export function useAdminUpdates(
  uid?: string | null,
  profileLastSeenUpdateAt?: string | null,
  updateUserProfileFn?: (data: { lastSeenUpdateAt?: string }) => Promise<void>
) {
  const [, setTick] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dismissedToastId, setDismissedToastId] = useState<string | null>(() => {
    if (!uid || typeof window === 'undefined') return null;
    try {
      return sessionStorage.getItem(`${LOCAL_TOAST_DISMISSED_PREFIX}${uid}`);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    if (!hasFetchedInitial && !isFetchingInitial && uid) {
      fetchLatestAdminUpdates(false);
    }
    return () => {
      listeners.delete(listener);
    };
  }, [uid]);

  const lastSeenAt = getEffectiveLastSeenUpdateAt(uid, profileLastSeenUpdateAt);

  const unseenUpdates = useMemo(() => {
    if (!cachedUpdates.length) return [];
    if (!lastSeenAt) return cachedUpdates;
    return cachedUpdates.filter((u) => !u.deleted && u.createdAt > lastSeenAt);
  }, [lastSeenAt, cachedUpdates]);

  const unseenCount = unseenUpdates.length;

  const latestUnseenToast = useMemo((): AdminUpdateItem | null => {
    if (!unseenUpdates.length) return null;
    const candidate =
      (latestNewlyPostedId && unseenUpdates.find((u) => u.id === latestNewlyPostedId)) ||
      unseenUpdates[0];
    if (!candidate) return null;
    if (dismissedToastId === candidate.id) return null;
    return candidate;
  }, [unseenUpdates, dismissedToastId]);

  const dismissUnseenToast = useCallback(
    (updateId?: string) => {
      const targetId = updateId || latestUnseenToast?.id || null;
      setDismissedToastId(targetId);
      if (uid && targetId && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`${LOCAL_TOAST_DISMISSED_PREFIX}${uid}`, targetId);
        } catch {
          // ignore
        }
      }
    },
    [uid, latestUnseenToast]
  );

  /**
   * Marks all current updates as seen using ONE write to users/{uid}.lastSeenUpdateAt
   * and immediate localStorage sync.
   */
  const markAllSeen = useCallback(async () => {
    if (!uid) return;
    const newestCreatedAt = cachedUpdates.reduce(
      (maxIso, item) => (item.createdAt > maxIso ? item.createdAt : maxIso),
      new Date().toISOString()
    );
    const prevSeen = getEffectiveLastSeenUpdateAt(uid, profileLastSeenUpdateAt);
    const shouldWrite = !prevSeen || newestCreatedAt > prevSeen || unseenCount > 0;

    setLocalLastSeenUpdateAt(uid, newestCreatedAt);
    if (latestNewlyPostedId) {
      latestNewlyPostedId = null;
    }
    notifyListeners();

    if (shouldWrite && updateUserProfileFn) {
      try {
        await updateUserProfileFn({ lastSeenUpdateAt: newestCreatedAt });
      } catch {
        // local cache still prevents repeated badges
      }
    }
  }, [uid, profileLastSeenUpdateAt, unseenCount, updateUserProfileFn]);

  /**
   * Marks up to a specific update timestamp (or now) as seen when clicking "Got it" on a card.
   */
  const markCardSeen = useCallback(
    async (cardCreatedAt: string) => {
      if (!uid) return;
      const currentSeen = getEffectiveLastSeenUpdateAt(uid, profileLastSeenUpdateAt);
      const nextSeen =
        cardCreatedAt > currentSeen ? cardCreatedAt : new Date().toISOString();
      setLocalLastSeenUpdateAt(uid, nextSeen);
      notifyListeners();
      if (updateUserProfileFn && (!currentSeen || nextSeen > currentSeen)) {
        try {
          await updateUserProfileFn({ lastSeenUpdateAt: nextSeen });
        } catch {
          // ignore
        }
      }
    },
    [uid, profileLastSeenUpdateAt, updateUserProfileFn]
  );

  const refresh = useCallback(async () => {
    await fetchLatestAdminUpdates(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMoreOlder) return;
    setIsLoadingMore(true);
    try {
      await loadOlderAdminUpdates();
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore]);

  return {
    updates: cachedUpdates,
    lastSeenAt,
    unseenCount,
    hasMore: hasMoreOlder,
    isLoading: isFetchingInitial,
    isLoadingMore,
    quotaError: lastQuotaError,
    latestUnseenToast,
    dismissUnseenToast,
    markAllSeen,
    markCardSeen,
    refresh,
    loadMore,
  };
}
