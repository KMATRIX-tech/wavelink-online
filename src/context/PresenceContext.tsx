/**
 * WaveLink Realtime Presence Management System
 * Uses Firebase Realtime Database (RTDB) for presence & ephemeral typing indicators.
 * Zero extra Firestore reads: only mirrors offline `lastSeenAt` to Firestore at most once per 5 minutes.
 *
 * RTDB Paths:
 * - /status/{uid} = { state: 'online' | 'offline', lastChanged: serverTimestamp }
 * - /connections/{uid}/{connectionId} = true (per-tab/device connection tracking)
 * - /typing/{conversationId}/{uid} = { isTyping: true, lastChanged: serverTimestamp }
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback
} from 'react';
import {
  ref,
  onValue,
  set,
  push,
  get,
  onDisconnect,
  serverTimestamp as rtdbServerTimestamp,
  DatabaseReference
} from 'firebase/database';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { rtdb, db, getCachedUserProfile } from '../firebase';
import { useAuth } from './AuthContext';
import type { UserProfile } from '../types';

const FIRESTORE_HEARTBEAT_OFFLINE_THRESHOLD_MS = 3 * 60 * 1000; // Treat anyone with no update in 3 minutes as offline

function parseLastSeenMs(profile?: Partial<UserProfile> | null): number | undefined {
  if (!profile) return undefined;
  const raw = profile.lastSeenAt || profile.lastSeen;
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function deriveFirestoreHeartbeatPresence(profile?: Partial<UserProfile> | null): {
  state: 'online' | 'offline';
  lastChanged?: number;
} | null {
  if (!profile) return null;
  const lastChanged = parseLastSeenMs(profile);
  if (lastChanged === undefined) {
    return profile.isOnline ? { state: 'online' } : null;
  }
  const isFresh = Date.now() - lastChanged <= FIRESTORE_HEARTBEAT_OFFLINE_THRESHOLD_MS;
  const isOnline = Boolean(profile.isOnline !== false && isFresh);
  return {
    state: isOnline ? 'online' : 'offline',
    lastChanged
  };
}

export type PresenceStatusKind = 'loading' | 'online' | 'offline' | 'hidden' | 'unreachable';

export interface PresenceState {
  status: PresenceStatusKind;
  state: 'online' | 'offline';
  lastChanged?: number;
  loading: boolean;
  canShowLastSeen: boolean;
}

interface PresenceContextValue {
  isOwnOnline: boolean;
  canViewPresence: boolean;
  canViewLastSeen: boolean;
  isRtdbConnected: boolean;
  isRtdbReachable: boolean;
  subscribePresence: (uid: string) => () => void;
  getPresence: (uid?: string, targetProfile?: Partial<UserProfile> | null) => PresenceState;
  getCachedIsOnline: (uid?: string) => boolean;
  setTyping: (conversationId: string, isTyping: boolean) => Promise<void>;
  subscribeTyping: (
    conversationId: string,
    onUpdate: (typers: Record<string, number>) => void
  ) => () => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

// ============================================================================
// EXTERNAL STORE (No whole-tree re-renders when a single user's status changes)
// ============================================================================
interface RawPresenceRecord {
  state: 'online' | 'offline';
  lastChanged?: number;
  loading: boolean;
  errored?: boolean;
}

const presenceStore = new Map<string, RawPresenceRecord>();
const activeListenersByUid = new Map<
  string,
  { refCount: number; unsubscribe: () => void }
>();
const uidSubscribers = new Map<string, Set<() => void>>();
const healthSubscribers = new Set<() => void>();

// Batch & debounce UI updates: flush at most once every 1000ms (1 second)
const UI_BATCH_INTERVAL_MS = 1000;
const pendingFlushUids = new Set<string>();
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushTimestamp = 0;

function flushPendingPresenceNotifications() {
  batchFlushTimer = null;
  lastFlushTimestamp = Date.now();
  const uidsToNotify = Array.from(pendingFlushUids);
  pendingFlushUids.clear();

  uidsToNotify.forEach((uid) => {
    const subs = uidSubscribers.get(uid);
    if (!subs) return;
    subs.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.warn('[Presence] Listener notification error:', err);
      }
    });
  });
}

function schedulePresenceNotification(uid: string) {
  pendingFlushUids.add(uid);
  const elapsed = Date.now() - lastFlushTimestamp;

  // Allow first update immediately if > 1s since last flush, otherwise batch up to 1000ms
  if (!batchFlushTimer) {
    const delay = elapsed >= UI_BATCH_INTERVAL_MS ? 40 : UI_BATCH_INTERVAL_MS - elapsed;
    batchFlushTimer = setTimeout(flushPendingPresenceNotifications, delay);
  }
}

function notifyHealthSubscribers() {
  healthSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

// Track RTDB global reachability across components
let globalRtdbReachable: boolean = Boolean(rtdb);
let globalRtdbConnected: boolean = false;

// Track active local connection ref for explicit logout cleanup before Auth clears
let activeOwnConnectionRef: DatabaseReference | null = null;
let activeOwnUid: string | null = null;
let lastFirestoreMirrorTime = 0;
const FIRESTORE_MIRROR_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const FLAKY_OFFLINE_DELAY_MS = 7000; // Wait 7s before showing offline in UI to prevent network-flap flicker
const BACKGROUND_GRACE_MS = 60000; // 60 seconds background grace period

async function mirrorOfflineToFirestore(uid: string) {
  const now = Date.now();
  if (now - lastFirestoreMirrorTime < FIRESTORE_MIRROR_THROTTLE_MS) {
    return;
  }
  lastFirestoreMirrorTime = now;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', uid), {
      isOnline: false,
      lastSeen: nowIso,
      lastSeenAt: nowIso
    });
  } catch {
    // Non-fatal: RTDB is the source of truth; do not retry on quota error
  }
}

/**
 * Explicitly mark the current user offline and detach active RTDB presence listeners
 * BEFORE Firebase Auth clears credentials on logout.
 */
export async function goOfflineAndCleanupPresence(uid?: string): Promise<void> {
  const targetUid = uid || activeOwnUid;
  if (rtdb && targetUid) {
    try {
      if (activeOwnConnectionRef) {
        await set(activeOwnConnectionRef, null).catch(() => {});
        activeOwnConnectionRef = null;
      }
      const connectionsSnap = await get(ref(rtdb, `/connections/${targetUid}`)).catch(() => null);
      const hasOtherConns = connectionsSnap && connectionsSnap.exists() && connectionsSnap.hasChildren();
      if (!hasOtherConns) {
        await set(ref(rtdb, `/status/${targetUid}`), {
          state: 'offline',
          lastChanged: rtdbServerTimestamp()
        }).catch(() => {});
      }
      await mirrorOfflineToFirestore(targetUid).catch(() => {});
    } catch {
      // ignore cleanup failures on sign-out
    }
  }

  activeOwnUid = null;

  // Detach all active listeners cleanly
  activeListenersByUid.forEach((entry) => {
    try {
      entry.unsubscribe();
    } catch {
      // ignore
    }
  });
  activeListenersByUid.clear();
  presenceStore.clear();
  pendingFlushUids.clear();
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }
}

/**
 * Evaluate two-way privacy between current user and target user using in-memory profiles only
 * (zero Firestore reads).
 */
function evaluatePresencePrivacy(params: {
  viewerUid?: string;
  viewerProfile?: UserProfile | null;
  targetUid?: string;
  targetProfile?: Partial<UserProfile> | null;
}): { canShowDot: boolean; canShowLastSeen: boolean } {
  const { viewerUid, viewerProfile, targetUid, targetProfile } = params;

  if (!targetUid) {
    return { canShowDot: false, canShowLastSeen: false };
  }

  const viewerShowOnline = viewerProfile?.privacySettings?.showOnlineStatus !== false;
  const viewerShowLastSeen = viewerProfile?.privacySettings?.showLastSeen !== false;
  const isSelf = Boolean(viewerUid && viewerUid === targetUid);

  // WhatsApp-style mutual reciprocity: if viewer turned off online status, viewer cannot see others
  if (!viewerShowOnline && !isSelf) {
    return { canShowDot: false, canShowLastSeen: false };
  }

  // Blocked check (either direction)
  if (!isSelf && viewerUid) {
    const viewerBlocked = viewerProfile?.blockedUserIds || [];
    if (viewerBlocked.includes(targetUid)) {
      return { canShowDot: false, canShowLastSeen: false };
    }
  }

  const resolvedTarget = targetProfile || getCachedUserProfile(targetUid);
  if (resolvedTarget && !isSelf) {
    if (viewerUid && resolvedTarget.blockedUserIds?.includes(viewerUid)) {
      return { canShowDot: false, canShowLastSeen: false };
    }

    if (resolvedTarget.privacySettings?.showOnlineStatus === false) {
      return { canShowDot: false, canShowLastSeen: false };
    }

    const audience = resolvedTarget.privacySettings?.onlineStatusAudience;
    if (audience === 'nobody') {
      return { canShowDot: false, canShowLastSeen: false };
    }
    if (audience === 'close_friends') {
      const closeFriends = resolvedTarget.closeFriendIds || [];
      if (!viewerUid || !closeFriends.includes(viewerUid)) {
        return { canShowDot: false, canShowLastSeen: false };
      }
    }
  }

  const targetShowLastSeen =
    resolvedTarget?.privacySettings?.showLastSeen !== false;

  return {
    canShowDot: isSelf ? viewerShowOnline : true,
    canShowLastSeen: isSelf ? viewerShowLastSeen : viewerShowLastSeen && targetShowLastSeen
  };
}

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  const [isRtdbConnected, setIsRtdbConnected] = useState<boolean>(false);
  const [isRtdbReachable, setIsRtdbReachable] = useState<boolean>(Boolean(rtdb));
  const [isOwnOnline, setIsOwnOnline] = useState<boolean>(false);

  const showOnlineStatus = userProfile?.privacySettings?.showOnlineStatus !== false;
  const showLastSeen = userProfile?.privacySettings?.showLastSeen !== false;

  const viewerUidRef = useRef<string | undefined>(currentUser?.uid);
  const viewerProfileRef = useRef<UserProfile | null>(userProfile);
  const showOnlineRef = useRef<boolean>(showOnlineStatus);

  useEffect(() => {
    viewerUidRef.current = currentUser?.uid;
  }, [currentUser?.uid]);

  useEffect(() => {
    viewerProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    showOnlineRef.current = showOnlineStatus;
    notifyHealthSubscribers();
  }, [
    showOnlineStatus,
    showLastSeen,
    userProfile?.blockedUserIds,
    userProfile?.closeFriendIds,
    userProfile?.privacySettings?.onlineStatusAudience
  ]);

  // ==========================================================================
  // (a) PRESENCE WRITER: .info/connected + onDisconnect FIRST + multi-tab
  // ==========================================================================
  useEffect(() => {
    if (!currentUser?.uid) {
      setIsOwnOnline(false);
      setIsRtdbConnected(false);
      globalRtdbConnected = false;
      globalRtdbReachable = Boolean(rtdb);
      setIsRtdbReachable(Boolean(rtdb));
      notifyHealthSubscribers();
      return;
    }

    if (!rtdb) {
      // Firestore heartbeat fallback when RTDB is not configured
      setIsOwnOnline(showOnlineStatus);
      setIsRtdbConnected(false);
      globalRtdbConnected = false;
      globalRtdbReachable = false;
      setIsRtdbReachable(false);
      notifyHealthSubscribers();
      return;
    }

    const uid = currentUser.uid;
    activeOwnUid = uid;
    const connectedRef = ref(rtdb, '.info/connected');
    const userStatusRef = ref(rtdb, `/status/${uid}`);
    const userConnectionsRef = ref(rtdb, `/connections/${uid}`);

    let myConnectionRef: DatabaseReference | null = null;
    let visibilityTimeout: ReturnType<typeof setTimeout> | null = null;
    let isBackgroundOffline = false;
    let isDisposed = false;

    // If RTDB fails to respond within 6s while device browser reports online, treat RTDB as unreachable
    let reachabilityTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!globalRtdbConnected && typeof navigator !== 'undefined' && navigator.onLine) {
        globalRtdbReachable = false;
        setIsRtdbReachable(false);
        notifyHealthSubscribers();
      }
    }, 6000);

    const setStatusOnline = async () => {
      if (!rtdb || isDisposed || isBackgroundOffline) return;

      // Respect user's own privacy toggle: if showOnlineStatus is OFF, keep offline
      if (!showOnlineRef.current) {
        try {
          if (myConnectionRef) {
            await set(myConnectionRef, null);
            myConnectionRef = null;
            activeOwnConnectionRef = null;
          }
          await set(userStatusRef, {
            state: 'offline',
            lastChanged: rtdbServerTimestamp()
          });
          setIsOwnOnline(false);
        } catch {
          // ignore
        }
        return;
      }

      try {
        if (!myConnectionRef) {
          myConnectionRef = push(userConnectionsRef);
          activeOwnConnectionRef = myConnectionRef;
        }

        // CRITICAL ORDER: register onDisconnect() handlers FIRST before going online
        await onDisconnect(myConnectionRef).remove();
        await onDisconnect(userStatusRef).set({
          state: 'offline',
          lastChanged: rtdbServerTimestamp()
        });

        // Mark this tab/device connection active, then mark user online
        await set(myConnectionRef, true);
        await set(userStatusRef, {
          state: 'online',
          lastChanged: rtdbServerTimestamp()
        });

        if (!isDisposed) {
          setIsOwnOnline(true);
        }
      } catch (err) {
        console.warn('[Presence] Failed writing online state:', err);
      }
    };

    const unsubscribeConnected = onValue(
      connectedRef,
      (snapshot) => {
        const connected = Boolean(snapshot.val());
        globalRtdbConnected = connected;
        setIsRtdbConnected(connected);

        if (connected) {
          if (reachabilityTimeout) {
            clearTimeout(reachabilityTimeout);
            reachabilityTimeout = null;
          }
          globalRtdbReachable = true;
          setIsRtdbReachable(true);
          notifyHealthSubscribers();
          setStatusOnline();
        } else {
          setIsOwnOnline(false);
        }
      },
      (err) => {
        console.warn('[Presence] RTDB .info/connected error:', err);
        globalRtdbReachable = false;
        globalRtdbConnected = false;
        setIsRtdbReachable(false);
        setIsRtdbConnected(false);
        notifyHealthSubscribers();
      }
    );

    // Multi-tab resilience:
    // If another tab closes unexpectedly and its server-side onDisconnect sets /status/{uid} offline,
    // any remaining open active tab detects it and immediately restores { state: 'online' }!
    const unsubscribeOwnStatus = onValue(userStatusRef, (snapshot) => {
      if (isDisposed || !globalRtdbConnected || isBackgroundOffline || !showOnlineRef.current) {
        return;
      }
      const val = snapshot.val();
      if (val && val.state === 'offline' && myConnectionRef) {
        // Another tab disconnected while this tab is still active — restore online status
        setStatusOnline();
      }
    });

    // Tab / App visibility: background > 60s -> offline; return -> online
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || !rtdb) return;

      if (document.hidden) {
        if (visibilityTimeout) clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(async () => {
          visibilityTimeout = null;
          if (isDisposed) return;
          isBackgroundOffline = true;
          try {
            if (myConnectionRef) {
              await set(myConnectionRef, null);
              myConnectionRef = null;
              activeOwnConnectionRef = null;
            }
            const remainingSnap = await get(userConnectionsRef).catch(() => null);
            const hasOtherActiveTabs =
              remainingSnap && remainingSnap.exists() && remainingSnap.hasChildren();

            if (!hasOtherActiveTabs) {
              await set(userStatusRef, {
                state: 'offline',
                lastChanged: rtdbServerTimestamp()
              });
              mirrorOfflineToFirestore(uid).catch(() => {});
            }
            if (!isDisposed) setIsOwnOnline(false);
          } catch {
            // ignore
          }
        }, BACKGROUND_GRACE_MS);
      } else {
        if (visibilityTimeout) {
          clearTimeout(visibilityTimeout);
          visibilityTimeout = null;
        }
        isBackgroundOffline = false;
        if (globalRtdbConnected) {
          setStatusOnline();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle clean unload/tab close for remaining connections
    const handlePageHide = () => {
      if (myConnectionRef) {
        try {
          set(myConnectionRef, null);
        } catch {
          // onDisconnect fallback handles this automatically on the RTDB server
        }
      }
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      isDisposed = true;
      if (reachabilityTimeout) clearTimeout(reachabilityTimeout);
      if (visibilityTimeout) clearTimeout(visibilityTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      unsubscribeConnected();
      unsubscribeOwnStatus();

      const connToRemove = myConnectionRef;
      myConnectionRef = null;
      if (activeOwnConnectionRef === connToRemove) {
        activeOwnConnectionRef = null;
      }

      if (connToRemove) {
        set(connToRemove, null)
          .then(async () => {
            const snap = await get(userConnectionsRef).catch(() => null);
            const hasOther = snap && snap.exists() && snap.hasChildren();
            if (hasOther) {
              await onDisconnect(userStatusRef).cancel().catch(() => {});
            }
          })
          .catch(() => {});
      }
    };
  }, [currentUser?.uid, showOnlineStatus]);

  // ==========================================================================
  // (b) SHARED PRESENCE MANAGER (1 listener per UID, ref-counted, 1s batch)
  // ==========================================================================
  const subscribePresence = useCallback((targetUid: string): (() => void) => {
    if (!targetUid) {
      return () => {};
    }

    const existing = activeListenersByUid.get(targetUid);
    if (existing) {
      existing.refCount += 1;
      return () => {
        const entry = activeListenersByUid.get(targetUid);
        if (!entry) return;
        entry.refCount -= 1;
        if (entry.refCount <= 0) {
          entry.unsubscribe();
          activeListenersByUid.delete(targetUid);
        }
      };
    }

    // Initialize loading state in store if not cached yet
    if (!presenceStore.has(targetUid)) {
      const cachedHb = deriveFirestoreHeartbeatPresence(getCachedUserProfile(targetUid));
      presenceStore.set(targetUid, {
        state: cachedHb ? cachedHb.state : 'offline',
        lastChanged: cachedHb?.lastChanged,
        loading: !cachedHb
      });
    }

    let offlineDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubFirestoreFallback: (() => void) | null = null;

    const startFirestoreFallbackListener = () => {
      if (unsubFirestoreFallback) return;
      unsubFirestoreFallback = onSnapshot(
        doc(db, 'users', targetUid),
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data() as Partial<UserProfile>;
          const hb = deriveFirestoreHeartbeatPresence(data);
          if (hb) {
            presenceStore.set(targetUid, {
              state: hb.state,
              lastChanged: hb.lastChanged,
              loading: false,
              errored: false
            });
            schedulePresenceNotification(targetUid);
          }
        },
        () => {
          // Ignore fallback listener error
        }
      );
    };

    let unsubRtdb: (() => void) | null = null;

    if (rtdb && globalRtdbReachable) {
      const targetStatusRef = ref(rtdb, `/status/${targetUid}`);
      unsubRtdb = onValue(
        targetStatusRef,
        (snapshot) => {
          if (!globalRtdbReachable) {
            globalRtdbReachable = true;
            setIsRtdbReachable(true);
            notifyHealthSubscribers();
          }

          const val = snapshot.val();
          if (!val) {
            // No RTDB presence node yet for this user — check Firestore 2-min heartbeat / 3-min threshold
            const cachedHb = deriveFirestoreHeartbeatPresence(getCachedUserProfile(targetUid));
            if (cachedHb) {
              presenceStore.set(targetUid, {
                state: cachedHb.state,
                lastChanged: cachedHb.lastChanged,
                loading: false,
                errored: false
              });
              schedulePresenceNotification(targetUid);
            } else {
              startFirestoreFallbackListener();
            }
            return;
          }

          const rawState: 'online' | 'offline' =
            val && val.state === 'online' ? 'online' : 'offline';
          const lastChanged =
            typeof val?.lastChanged === 'number' ? val.lastChanged : undefined;

          const prev = presenceStore.get(targetUid);

          if (rawState === 'offline' && prev && !prev.loading && prev.state === 'online') {
            // Flaky mobile network protection: wait 7s before flipping to offline in UI
            if (offlineDelayTimer) clearTimeout(offlineDelayTimer);
            offlineDelayTimer = setTimeout(() => {
              offlineDelayTimer = null;
              presenceStore.set(targetUid, {
                state: 'offline',
                lastChanged,
                loading: false,
                errored: false
              });
              schedulePresenceNotification(targetUid);
            }, FLAKY_OFFLINE_DELAY_MS);
            return;
          }

          if (rawState === 'online' && offlineDelayTimer) {
            clearTimeout(offlineDelayTimer);
            offlineDelayTimer = null;
          }

          presenceStore.set(targetUid, {
            state: rawState,
            lastChanged,
            loading: false,
            errored: false
          });
          schedulePresenceNotification(targetUid);
        },
        (err) => {
          console.warn(`[Presence] Read error for ${targetUid}, using Firestore heartbeat fallback:`, err);
          startFirestoreFallbackListener();
        }
      );
    } else {
      startFirestoreFallbackListener();
    }

    const unsubscribe = () => {
      if (offlineDelayTimer) clearTimeout(offlineDelayTimer);
      if (unsubRtdb) {
        try {
          unsubRtdb();
        } catch {
          // ignore
        }
      }
      if (unsubFirestoreFallback) {
        try {
          unsubFirestoreFallback();
        } catch {
          // ignore
        }
      }
    };

    activeListenersByUid.set(targetUid, { refCount: 1, unsubscribe });

    return () => {
      const entry = activeListenersByUid.get(targetUid);
      if (!entry) return;
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        entry.unsubscribe();
        activeListenersByUid.delete(targetUid);
      }
    };
  }, []);

  const getPresence = useCallback(
    (uid?: string, targetProfile?: Partial<UserProfile> | null): PresenceState => {
      if (!uid) {
        return {
          status: 'hidden',
          state: 'offline',
          loading: false,
          canShowLastSeen: false
        };
      }

      const privacy = evaluatePresencePrivacy({
        viewerUid: viewerUidRef.current,
        viewerProfile: viewerProfileRef.current,
        targetUid: uid,
        targetProfile
      });

      if (!privacy.canShowDot) {
        return {
          status: 'hidden',
          state: 'offline',
          loading: false,
          canShowLastSeen: false
        };
      }

      const entry = presenceStore.get(uid);
      const resolvedProfile = targetProfile || getCachedUserProfile(uid);
      const hbFallback = deriveFirestoreHeartbeatPresence(resolvedProfile);

      if (!rtdb || !globalRtdbReachable || (entry && entry.errored)) {
        if (entry && !entry.loading && !entry.errored) {
          const isStale =
            entry.state === 'online' &&
            entry.lastChanged !== undefined &&
            Date.now() - entry.lastChanged > FIRESTORE_HEARTBEAT_OFFLINE_THRESHOLD_MS;
          const finalState = isStale ? 'offline' : entry.state;
          return {
            status: finalState,
            state: finalState,
            lastChanged: entry.lastChanged,
            loading: false,
            canShowLastSeen: privacy.canShowLastSeen
          };
        }
        if (hbFallback) {
          return {
            status: hbFallback.state,
            state: hbFallback.state,
            lastChanged: hbFallback.lastChanged,
            loading: false,
            canShowLastSeen: privacy.canShowLastSeen
          };
        }
        return {
          status: 'offline',
          state: 'offline',
          loading: false,
          canShowLastSeen: privacy.canShowLastSeen
        };
      }

      if (!entry || entry.loading) {
        if (hbFallback) {
          return {
            status: hbFallback.state,
            state: hbFallback.state,
            lastChanged: hbFallback.lastChanged,
            loading: false,
            canShowLastSeen: privacy.canShowLastSeen
          };
        }
        return {
          status: 'loading',
          state: 'offline',
          loading: true,
          canShowLastSeen: privacy.canShowLastSeen
        };
      }

      return {
        status: entry.state,
        state: entry.state,
        lastChanged: entry.lastChanged ?? hbFallback?.lastChanged,
        loading: false,
        canShowLastSeen: privacy.canShowLastSeen
      };
    },
    []
  );

  const getCachedIsOnline = useCallback((uid?: string): boolean => {
    if (!uid) return false;
    const privacy = evaluatePresencePrivacy({
      viewerUid: viewerUidRef.current,
      viewerProfile: viewerProfileRef.current,
      targetUid: uid
    });
    if (!privacy.canShowDot) return false;
    const entry = presenceStore.get(uid);
    if (entry && !entry.loading && !entry.errored) {
      return entry.state === 'online';
    }
    const hbFallback = deriveFirestoreHeartbeatPresence(getCachedUserProfile(uid));
    return Boolean(hbFallback && hbFallback.state === 'online');
  }, []);

  // ==========================================================================
  // TYPING INDICATOR VIA REALTIME DATABASE (/typing/{conversationId}/{uid})
  // ==========================================================================
  const setTyping = useCallback(
    async (conversationId: string, isTyping: boolean): Promise<void> => {
      if (!rtdb || !currentUser?.uid || !conversationId) return;
      try {
        const typingRef = ref(rtdb, `/typing/${conversationId}/${currentUser.uid}`);
        if (isTyping) {
          await onDisconnect(typingRef).remove();
          await set(typingRef, {
            isTyping: true,
            lastChanged: rtdbServerTimestamp()
          });
        } else {
          await set(typingRef, null);
        }
      } catch {
        // Non-fatal
      }
    },
    [currentUser?.uid]
  );

  const subscribeTyping = useCallback(
    (
      conversationId: string,
      onUpdate: (typers: Record<string, number>) => void
    ): (() => void) => {
      if (!rtdb || !conversationId) {
        return () => {};
      }
      const convoTypingRef = ref(rtdb, `/typing/${conversationId}`);
      const unsub = onValue(
        convoTypingRef,
        (snapshot) => {
          const val = snapshot.val() || {};
          const result: Record<string, number> = {};
          Object.entries(val).forEach(([uId, data]: [string, any]) => {
            if (data && data.isTyping && typeof data.lastChanged === 'number') {
              result[uId] = data.lastChanged;
            }
          });
          onUpdate(result);
        },
        () => {
          onUpdate({});
        }
      );
      return () => {
        try {
          unsub();
        } catch {
          // ignore
        }
      };
    },
    []
  );

  const value: PresenceContextValue = useMemo(
    () => ({
      isOwnOnline,
      canViewPresence: showOnlineStatus,
      canViewLastSeen: showLastSeen,
      isRtdbConnected,
      isRtdbReachable,
      subscribePresence,
      getPresence,
      getCachedIsOnline,
      setTyping,
      subscribeTyping
    }),
    [
      isOwnOnline,
      showOnlineStatus,
      showLastSeen,
      isRtdbConnected,
      isRtdbReachable,
      subscribePresence,
      getPresence,
      getCachedIsOnline,
      setTyping,
      subscribeTyping
    ]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};

/**
 * Subscribe on-demand to a user's presence ONLY while this hook is mounted and active (`uid` defined).
 * Re-renders ONLY when this specific `uid`'s presence or global privacy/health settings change.
 */
export function usePresence(
  uid?: string,
  targetProfile?: Partial<UserProfile> | null
): PresenceState {
  const context = useContext(PresenceContext);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!context || !uid) return;

    let setForUid = uidSubscribers.get(uid);
    if (!setForUid) {
      setForUid = new Set();
      uidSubscribers.set(uid, setForUid);
    }

    const triggerUpdate = () => setTick((t) => t + 1);
    setForUid.add(triggerUpdate);
    healthSubscribers.add(triggerUpdate);

    const unsubPresence = context.subscribePresence(uid);
    triggerUpdate();

    return () => {
      unsubPresence();
      healthSubscribers.delete(triggerUpdate);
      const currentSet = uidSubscribers.get(uid);
      if (currentSet) {
        currentSet.delete(triggerUpdate);
        if (currentSet.size === 0) {
          uidSubscribers.delete(uid);
        }
      }
    };
  }, [context?.subscribePresence, uid]);

  if (!context || !uid) {
    return {
      status: 'hidden',
      state: 'offline',
      loading: false,
      canShowLastSeen: false
    };
  }

  return context.getPresence(uid, targetProfile);
}

export function usePresenceManager() {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresenceManager must be used within a PresenceProvider');
  }
  return context;
}
