import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  updatePassword as fbUpdatePassword,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  sendEmailVerification as fbSendEmailVerification,
  deleteUser as fbDeleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import {
  auth,
  db,
  OWNER_SESSION_STORAGE_KEY,
  resolveCanonicalAdminRole,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData,
  isAuthNetworkError,
  getFriendlyAuthErrorMessage,
  getAuthHeaders,
  getClientDeviceId,
  setCachedUserProfile,
  sanitizeAvatarUrlForFirestore,
  sanitizeShortHttpsUrl
} from '../firebase';
import { migrateDataUrlImageToCloudinary } from '../utils/mediaStorage';
import {
  UserProfile,
  PointTransaction,
  PointTransactionCategory,
  AfricanCountryCode,
  EastAfricanCurrency,
  PanAfricanLanguageCode,
  KangaPatternFrame,
  PointTransactionType,
  AppearanceTheme,
  ChatThemePreference,
  UserPrivacySettings,
  UserNotificationSettings,
  UserTermsAgreement,
  AuditActionType,
  AppLanguage,
  ProfileCoverPresetId,
  ProfileCoverType,
  StoryHighlightItem,
  CustomAppBackground,
  CustomBackgroundHistoryItem
} from '../types';
import {
  removeCurrentDeviceFcmToken,
  syncExistingDeviceTokenState,
  syncNotificationSettingsToServer
} from '../services/fcmService';
import {
  sanitizeUserText,
  validateStrongPassword,
  checkClientLoginLockout,
  recordClientFailedLogin,
  clearClientFailedLogins,
  SUPPORT_BOT_ID
} from '../utils/security';

export const DAILY_REWARD_SCHEDULE = [10, 15, 20, 25, 30, 40, 50];
const migratedMediaProfileUids = new Set<string>();

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getYesterdayDateKey(date: Date = new Date()): string {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDateKey(yesterday);
}

interface LocalDailyRewardCache {
  points: number;
  wavePoints: number;
  loginStreak: number;
  lastDailyRewardDate: string;
  lastDailyRewardAmount: number;
  totalLoginDays: number;
}

export function getLocalPointTransactions(uid?: string | null): PointTransaction[] {
  try {
    if (typeof window === 'undefined' || !uid) return [];
    const raw = localStorage.getItem(`wavelink_point_transactions_${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PointTransaction[]) : [];
  } catch {
    return [];
  }
}

export function setLocalPointTransactions(uid: string, txs: PointTransaction[]) {
  try {
    if (typeof window === 'undefined' || !uid) return;
    localStorage.setItem(`wavelink_point_transactions_${uid}`, JSON.stringify(txs.slice(0, 60)));
  } catch {
    // Ignore storage quota issues
  }
}

export function mergePointTransactions(
  uid: string,
  ...lists: (PointTransaction[] | undefined | null)[]
): PointTransaction[] {
  const map = new Map<string, PointTransaction>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && item.id && !map.has(item.id)) {
        map.set(item.id, item);
      }
    }
  }
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (uid) {
    setLocalPointTransactions(uid, merged);
  }
  return merged.slice(0, 60);
}

function getLocalDailyRewardCache(uid?: string | null): LocalDailyRewardCache | null {
  try {
    if (typeof window === 'undefined' || !uid) return null;
    const raw = localStorage.getItem(`wavelink_daily_reward_${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalDailyRewardCache;
  } catch {
    return null;
  }
}

function setLocalDailyRewardCache(uid: string, data: LocalDailyRewardCache) {
  try {
    if (typeof window === 'undefined' || !uid) return;
    localStorage.setItem(`wavelink_daily_reward_${uid}`, JSON.stringify(data));
  } catch {
    // Ignore storage quota issues
  }
}

function computeDailyRewardState(
  uid: string,
  profileData?: Partial<UserProfile> | null
): {
  rewardFields: LocalDailyRewardCache & { pointTransactions: PointTransaction[] };
  newlyAwarded: boolean;
  pointsAwarded: number;
} {
  const todayKey = getLocalDateKey();
  const yesterdayKey = getYesterdayDateKey();
  const localCache = getLocalDailyRewardCache(uid);
  const existingTxs = mergePointTransactions(
    uid,
    profileData?.pointTransactions,
    getLocalPointTransactions(uid)
  );

  // Merge Firestore and local cache
  const existingLastDate =
    profileData?.lastDailyRewardDate && localCache?.lastDailyRewardDate
      ? profileData.lastDailyRewardDate >= localCache.lastDailyRewardDate
        ? profileData.lastDailyRewardDate
        : localCache.lastDailyRewardDate
      : profileData?.lastDailyRewardDate || localCache?.lastDailyRewardDate || '';

  const existingPoints =
    typeof profileData?.points === 'number'
      ? profileData.points
      : typeof profileData?.wavePoints === 'number'
      ? profileData.wavePoints
      : localCache?.points ?? localCache?.wavePoints ?? 0;

  const existingStreak = Math.max(
    profileData?.loginStreak ?? 0,
    localCache?.loginStreak ?? 0
  );
  const existingLastAmount =
    profileData?.lastDailyRewardAmount ??
    localCache?.lastDailyRewardAmount ??
    DAILY_REWARD_SCHEDULE[0];
  const existingTotalDays = Math.max(
    profileData?.totalLoginDays ?? 0,
    localCache?.totalLoginDays ?? 0
  );

  const todayTxId = `daily_reward_${todayKey}`;

  // Already rewarded today
  if (existingLastDate === todayKey && (existingPoints > 0 || existingTxs.some((t) => t.id === todayTxId))) {
    const streakVal = Math.max(1, existingStreak);
    let updatedTxs = existingTxs;
    if (!existingTxs.some((t) => t.id === todayTxId)) {
      const seededTodayTx: PointTransaction = {
        id: todayTxId,
        userId: uid,
        type: 'earned',
        category: 'daily_reward',
        title: `Day ${streakVal} Daily Login Bonus`,
        description: `Habitual engagement streak reward (${streakVal}-day streak)`,
        amount: existingLastAmount,
        balanceAfter: existingPoints,
        reference: `DLY-${todayKey.replace(/-/g, '')}`,
        createdAt: new Date().toISOString()
      };
      updatedTxs = mergePointTransactions(uid, [seededTodayTx], existingTxs);
    }

    const currentFields = {
      points: existingPoints,
      wavePoints: existingPoints,
      loginStreak: streakVal,
      lastDailyRewardDate: todayKey,
      lastDailyRewardAmount: existingLastAmount,
      totalLoginDays: Math.max(1, existingTotalDays)
    };
    setLocalDailyRewardCache(uid, currentFields);
    return {
      rewardFields: { ...currentFields, pointTransactions: updatedTxs },
      newlyAwarded: false,
      pointsAwarded: 0
    };
  }

  // Award today's login bonus!
  const isConsecutive = existingLastDate === yesterdayKey;
  const nextStreak = isConsecutive ? existingStreak + 1 : 1;
  const cycleIndex = (nextStreak - 1) % DAILY_REWARD_SCHEDULE.length;
  const bonusPoints = DAILY_REWARD_SCHEDULE[cycleIndex];
  const nextTotalPoints = existingPoints + bonusPoints;
  const nextTotalDays = existingTotalDays + 1;

  const rewardTx: PointTransaction = {
    id: todayTxId,
    userId: uid,
    type: 'earned',
    category: 'daily_reward',
    title: `Day ${nextStreak} Daily Login Bonus`,
    description: `Habitual engagement streak reward (${nextStreak}-day login streak)`,
    amount: bonusPoints,
    balanceAfter: nextTotalPoints,
    reference: `DLY-${todayKey.replace(/-/g, '')}`,
    createdAt: new Date().toISOString()
  };

  const updatedTxs = mergePointTransactions(uid, [rewardTx], existingTxs);

  const updatedFields: LocalDailyRewardCache = {
    points: nextTotalPoints,
    wavePoints: nextTotalPoints,
    loginStreak: nextStreak,
    lastDailyRewardDate: todayKey,
    lastDailyRewardAmount: bonusPoints,
    totalLoginDays: nextTotalDays
  };

  setLocalDailyRewardCache(uid, updatedFields);
  return {
    rewardFields: { ...updatedFields, pointTransactions: updatedTxs },
    newlyAwarded: true,
    pointsAwarded: bonusPoints
  };
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isSuperAdmin: boolean;
  isSubAdmin: boolean;
  isAdmin: boolean;
  isProEffective: boolean;
  isExemptFromPayments: boolean;
  isVerified: boolean;
  canTalkToAdmin: boolean;
  isLoading: boolean;
  dailyRewardJustClaimed: { points: number; streak: number; totalPoints: number } | null;
  dismissDailyRewardNotice: () => void;
  claimDailyReward: () => Promise<{ claimed: boolean; pointsAwarded: number; streak: number; totalPoints: number }>;
  recordPointTransaction: (params: {
    type: PointTransactionType;
    category: PointTransactionCategory;
    title: string;
    description: string;
    amount: number;
    reference?: string;
    id?: string;
  }) => Promise<{ success: boolean; newBalance: number; transaction?: PointTransaction; error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string, username?: string) => Promise<void>;
  quickSignIn: (email: string, pass: string, displayName?: string, username?: string) => Promise<void>;
  authenticateSeamlessly: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendPasswordReset: (email?: string) => Promise<void>;
  updateUserProfile: (data: {
    displayName?: string;
    username?: string;
    bio?: string;
    photoURL?: string;
    proBorderEffect?: 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
    proAccentColor?: 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';
    proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
    appearanceTheme?: AppearanceTheme;
    followingIds?: string[];
    closeFriendIds?: string[];
    privacySettings?: UserPrivacySettings;
    notificationSettings?: UserNotificationSettings;
    termsAgreement?: UserTermsAgreement;
    dataSaverEnabled?: boolean;
    language?: AppLanguage;
    panAfricanLanguage?: PanAfricanLanguageCode;
    countryCode?: AfricanCountryCode;
    regionName?: string;
    preferredCurrency?: EastAfricanCurrency;
    patternFrame?: KangaPatternFrame;
    kangaBackgroundEnabled?: boolean;
    interests?: string[];
    interestsCompleted?: boolean;
    weeklyWinnerUntil?: string;
    weeklyWinnerChallengeTitle?: string;
    weeklyWinnerHashtag?: string;
    isCreatorSpotlight?: boolean;
    spotlightNote?: string;
    coverImageUrl?: string;
    coverPresetId?: ProfileCoverPresetId;
    coverType?: ProfileCoverType;
    pinnedPostId?: string;
    storyHighlights?: StoryHighlightItem[];
    chatThemes?: Record<string, ChatThemePreference>;
    customBackground?: CustomAppBackground | null;
    customBackgroundHistory?: CustomBackgroundHistoryItem[];
    mutedChannelIds?: string[];
  }) => Promise<void>;
  toggleSavePost: (postId: string) => Promise<boolean>;
  toggleBlockUser: (targetUserId: string) => Promise<boolean>;
  reportContent: (params: {
    targetType: 'user' | 'post' | 'bot_reply' | 'comment' | 'video';
    targetId: string;
    targetAuthorId?: string;
    targetSummary?: string;
    reason: string;
  }) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  deleteMyAccount: (currentPassword?: string) => Promise<void>;
  recordAdminAuditLog: (params: {
    action: AuditActionType;
    targetId: string;
    targetLabel?: string;
    details: string;
  }) => Promise<void>;
  dismissWarning: () => Promise<void>;
  toggleSubAdmin: (targetUserId: string, makeSubAdmin: boolean) => Promise<void>;
  toggleVerifyUser: (targetUserId: string, verify: boolean) => Promise<void>;
  activateHarvestPass: () => Promise<void>;
  verifyAndRedeemCoupon: (rawCode: string) => Promise<boolean>;
  showGlobalToast: (message: string) => void;
  refreshAdminVerification: () => Promise<boolean>;
  reverifyOwnerAccess: (accessCode: string) => Promise<{
    authorized: boolean;
    failedCheck?: string | null;
    error?: string;
  }>;
  adminCheckFailedReason: string | null;
  completeVerifiedAuthSession: (customName?: string, customUsername?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function hasLocalProPass(uid?: string | null): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (localStorage.getItem('wavelink_pro_pass') === 'true') return true;
    if (uid && localStorage.getItem(`wavelink_pro_pass_${uid}`) === 'true') return true;
    return false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [customClaimRole, setCustomClaimRole] = useState<'admin' | 'sub_admin' | 'user'>('user');
  const [serverVerifiedRole, setServerVerifiedRole] = useState<'admin' | 'super_admin' | 'sub_admin' | 'user'>('user');
  const [adminCheckFailedReason, setAdminCheckFailedReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [globalToast, setGlobalToast] = useState<string | null>(null);
  const [dailyRewardJustClaimed, setDailyRewardJustClaimed] = useState<{
    points: number;
    streak: number;
    totalPoints: number;
  } | null>(null);

  const showGlobalToast = (message: string) => {
    setGlobalToast(message);
    setTimeout(() => {
      setGlobalToast((prev) => (prev === message ? null : prev));
    }, 4500);
  };

  const dismissDailyRewardNotice = () => {
    setDailyRewardJustClaimed(null);
  };

  const readTokenClaimRole = async (
    user: FirebaseUser,
    forceRefresh = false
  ): Promise<'admin' | 'sub_admin' | 'user'> => {
    try {
      if (forceRefresh) {
        await user.getIdToken(true);
      }
      const tokenResult = await user.getIdTokenResult(forceRefresh);
      const claims = tokenResult?.claims || {};
      if (claims.role === 'admin' || claims.role === 'super_admin' || claims.admin === true) {
        setCustomClaimRole('admin');
        return 'admin';
      }
      if (claims.role === 'sub_admin') {
        setCustomClaimRole('sub_admin');
        return 'sub_admin';
      }
    } catch {
      // ignore token claim read error
    }
    setCustomClaimRole('user');
    return 'user';
  };

  // Verify admin role strictly against the server (/api/admin/verify) and refresh session token immediately
  const refreshAdminVerification = async (passiveCheck = false): Promise<boolean> => {
    const activeUser = auth.currentUser;
    if (!activeUser) {
      setCustomClaimRole('user');
      setServerVerifiedRole('user');
      setAdminCheckFailedReason('session needs refresh');
      return false;
    }

    const cleanActiveEmail = (activeUser.email || '').trim().toLowerCase();
    if (cleanActiveEmail === 'keylanmbilinyi5@gmail.com') {
      setServerVerifiedRole('admin');
      setAdminCheckFailedReason(null);
    }

    // Force-refresh Firebase ID token so updated custom claims & session privileges apply immediately
    const claimRole = await readTokenClaimRole(activeUser, !passiveCheck);

    // Ensure currentUser state is synced after Owner sign-in completes
    setCurrentUser(activeUser);

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/admin/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: activeUser.email,
          isSubAdmin: Boolean(userProfile?.isSubAdmin || userProfile?.role === 'sub_admin'),
          passiveCheck
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.authorized) {
        if (typeof data.ownerSessionToken === 'string' && data.ownerSessionToken.trim()) {
          try {
            sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken.trim());
            localStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken.trim());
          } catch {
            // ignore storage errors
          }
        }
        if (data.needsTokenRefresh) {
          await readTokenClaimRole(activeUser, true);
        }
        const resolvedRole = resolveCanonicalAdminRole(data?.role, data?.role === 'sub_admin');
        if (resolvedRole === 'admin' || resolvedRole === 'sub_admin') {
          setServerVerifiedRole(resolvedRole);
          setAdminCheckFailedReason(null);
          await syncUserProfileDoc(activeUser, undefined, undefined, resolvedRole);
          return true;
        }
      } else if (cleanActiveEmail !== 'keylanmbilinyi5@gmail.com') {
        const reason =
          typeof data?.failedCheck === 'string' && data.failedCheck.trim()
            ? data.failedCheck.trim()
            : claimRole === 'admin'
            ? 'session needs refresh'
            : 'owner sign-in not used';
        setAdminCheckFailedReason(reason);
      }
    } catch {
      if (claimRole === 'admin' || cleanActiveEmail === 'keylanmbilinyi5@gmail.com') {
        setServerVerifiedRole('admin');
        setAdminCheckFailedReason(null);
        return true;
      }
      setAdminCheckFailedReason('session needs refresh');
    }
    if (cleanActiveEmail === 'keylanmbilinyi5@gmail.com') {
      return true;
    }
    setServerVerifiedRole('user');
    return false;
  };

  // Re-verify owner access using the owner access code on the existing UID, set custom claims on server, and force immediate token refresh
  const reverifyOwnerAccess = async (
    accessCode: string
  ): Promise<{
    authorized: boolean;
    failedCheck?: string | null;
    error?: string;
  }> => {
    const cleanCode = accessCode.trim();
    if (!cleanCode) {
      return {
        authorized: false,
        failedCheck: 'owner sign-in not used',
        error: 'Please enter your Owner Access Code.'
      };
    }

    try {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const googleProvider = new GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        const googleRes = await signInWithPopup(auth, googleProvider);
        activeUser = googleRes.user;
      }

      const idToken = await activeUser.getIdToken(true);
      const resp = await fetch('/api/auth/owner-signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({
          idToken,
          accessCode: cleanCode,
          deviceId: getClientDeviceId()
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        const failedCheck =
          typeof data?.failedCheck === 'string' && data.failedCheck.trim()
            ? data.failedCheck.trim()
            : 'owner sign-in not used';
        setAdminCheckFailedReason(failedCheck);
        return {
          authorized: false,
          failedCheck,
          error: data?.error || 'Unable to verify owner credentials.'
        };
      }

      if (typeof data.ownerSessionToken === 'string' && data.ownerSessionToken.trim()) {
        try {
          sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken.trim());
          localStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken.trim());
        } catch {
          // ignore storage errors
        }
      }

      // Force client to refresh its ID token immediately so Firebase custom claims take effect right away
      await readTokenClaimRole(activeUser, true);
      setServerVerifiedRole('admin');
      setAdminCheckFailedReason(null);
      await refreshAdminVerification();

      return {
        authorized: true,
        failedCheck: null
      };
    } catch (err: unknown) {
      const friendly = getFriendlyAuthErrorMessage(err, 'google');
      return {
        authorized: false,
        failedCheck: 'session needs refresh',
        error: friendly || 'Unable to complete owner verification. Please try again.'
      };
    }
  };

  // Transition a verified Firebase Auth user into the active WaveLink session after verification
  const completeVerifiedAuthSession = async (customName?: string, customUsername?: string): Promise<void> => {
    const activeUser = auth.currentUser;
    if (!activeUser) {
      throw new Error('Please sign in first.');
    }
    await activeUser.reload();
    const hasGoogleProvider = activeUser.providerData.some((p) => p.providerId === 'google.com');
    if (!activeUser.emailVerified && !hasGoogleProvider) {
      throw new Error('Please verify your email address before completing sign-up.');
    }
    await activeUser.getIdToken(true).catch(() => {});
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('wavelink_signup_verification_pending');
        sessionStorage.removeItem('wavelink_existing_account_setup_pending');
      }
    } catch {
      // ignore
    }
    setCurrentUser(activeUser);
    await syncUserProfileDoc(activeUser, customName, customUsername);
  };

  // Sync profile document in Firestore & evaluate Daily Login Reward while preserving all existing account data
  const syncUserProfileDoc = async (
    user: FirebaseUser,
    customName?: string,
    customUsername?: string,
    verifiedRoleOverride?: 'admin' | 'sub_admin' | 'user'
  ) => {
    const userDocRef = doc(db, 'users', user.uid);
    const localPro = hasLocalProPass(user.uid);
    const nowIso = new Date().toISOString();

    try {
      const cleanUserEmail = (user.email || '').trim().toLowerCase();
      const isOwnerEmail = cleanUserEmail === 'keylanmbilinyi5@gmail.com';
      const claimRole = await readTokenClaimRole(user, false);

      if (isOwnerEmail) {
        setDoc(
          userDocRef,
          {
            email: user.email,
            role: 'admin',
            isOwner: true
          },
          { merge: true }
        ).catch(() => {});
      }

      // 1. Look up existing user document by Firebase UID first
      let resolvedData: UserProfile | null = null;
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        resolvedData = snap.data() as UserProfile;
        if (resolvedData.mergedIntoUid) {
          try {
            const primarySnap = await getDoc(doc(db, 'users', resolvedData.mergedIntoUid));
            if (primarySnap.exists()) {
              resolvedData = primarySnap.data() as UserProfile;
            }
          } catch {
            // fallback to current snapshot data
          }
        }
      }

      // 2. If no document was found by UID, look up by verified email and ALWAYS reuse it (never create a duplicate)
      if (!resolvedData && cleanUserEmail) {
        try {
          const qEmail = query(collection(db, 'users'), where('email', '==', cleanUserEmail));
          const emailSnap = await getDocs(qEmail);
          if (!emailSnap.empty) {
            const bestMatch = emailSnap.docs.find((d) => !d.data()?.isDuplicateDisabled) || emailSnap.docs[0];
            resolvedData = bestMatch.data() as UserProfile;
          }
        } catch (emailLookupErr) {
          console.warn('Existing email lookup notice:', emailLookupErr);
        }
      }

      const emailPrefix = cleanUserEmail ? cleanUserEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') : 'waver';

      if (!resolvedData) {
        // No existing profile found for UID or verified email: initialize single primary profile
        const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(user.uid, null);
        const initialRole: UserProfile['role'] =
          isOwnerEmail || verifiedRoleOverride === 'admin' || claimRole === 'admin'
            ? 'admin'
            : verifiedRoleOverride === 'sub_admin' || claimRole === 'sub_admin'
            ? 'sub_admin'
            : 'user';
        const isInitialAdmin = initialRole === 'admin';
        const initialProfile: UserProfile = {
          id: user.uid,
          email: cleanUserEmail,
          username: isOwnerEmail ? '@keylan' : customUsername || `@${emailPrefix}`,
          displayName: isOwnerEmail ? 'Keylan' : customName || user.displayName || emailPrefix || 'Waver',
          photoURL: sanitizeAvatarUrlForFirestore(user.photoURL, user.uid),
          bio: isInitialAdmin ? 'Platform Owner & Founder of WaveLink 🌊' : 'Connecting on WaveLink 🌊',
          status: 'active',
          isBanned: false,
          savedPostIds: [],
          role: initialRole,
          isSubAdmin: initialRole === 'sub_admin',
          hasBlueStar: Boolean(localPro || isInitialAdmin),
          isVerifiedByAdmin: Boolean(localPro || isInitialAdmin),
          isPro: Boolean(localPro || isInitialAdmin),
          proBadge: isInitialAdmin ? 'founder' : localPro ? 'verified' : undefined,
          proBorderEffect: isInitialAdmin ? 'aura-gold' : localPro ? 'neon-pulse' : undefined,
          proAccentColor: isInitialAdmin ? 'gold' : localPro ? 'emerald' : undefined,
          isOnline: true,
          lastSeenAt: nowIso,
          ...rewardFields,
          createdAt: nowIso,
        };
        await setDoc(userDocRef, cleanFirestoreData({
          ...initialProfile,
          ...(isOwnerEmail ? { isOwner: true } : {}),
          serverTimestamp: serverTimestamp()
        }), { merge: true });
        setUserProfile(initialProfile);

        if (newlyAwarded) {
          setDailyRewardJustClaimed({
            points: pointsAwarded,
            streak: rewardFields.loginStreak,
            totalPoints: rewardFields.points
          });
          showGlobalToast(`🎁 Daily Login Bonus: +${pointsAwarded} WavePoints! (${rewardFields.loginStreak}-Day Streak 🔥)`);
        }
      } else {
        // REUSE existing profile: all existing posts, followers, points, Pro status, and themes stay attached!
        const data = resolvedData;
        const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(user.uid, data);

        const canonicalExistingRole = resolveCanonicalAdminRole(data.role, data.isSubAdmin);
        const effectiveRole: UserProfile['role'] =
          isOwnerEmail || (data as any).isOwner === true || verifiedRoleOverride === 'admin' || claimRole === 'admin' || canonicalExistingRole === 'admin'
            ? 'admin'
            : verifiedRoleOverride === 'sub_admin' || claimRole === 'sub_admin' || canonicalExistingRole === 'sub_admin'
            ? 'sub_admin'
            : data.role || 'user';
        const isEffectiveAdmin = effectiveRole === 'admin';

        const mergedProfile: UserProfile = {
          ...data,
          id: user.uid,
          email: data.email || cleanUserEmail,
          username: customUsername || data.username || (isOwnerEmail ? '@keylan' : `@${emailPrefix}`),
          displayName: customName || data.displayName || user.displayName || (isOwnerEmail ? 'Keylan' : emailPrefix || 'Waver'),
          role: effectiveRole,
          isSubAdmin: effectiveRole === 'sub_admin',
          isPro: Boolean(data.isPro || localPro || isEffectiveAdmin),
          hasBlueStar: Boolean(data.hasBlueStar || data.isPro || localPro || isEffectiveAdmin),
          isVerifiedByAdmin: Boolean(data.isVerifiedByAdmin || localPro || isEffectiveAdmin),
          proBadge: isEffectiveAdmin ? 'founder' : data.proBadge || (localPro ? 'verified' : undefined),
          isOnline: true,
          lastSeenAt: nowIso,
          ...rewardFields
        };
        setUserProfile(mergedProfile);
        if (effectiveRole === 'admin' || effectiveRole === 'sub_admin') {
          setServerVerifiedRole(effectiveRole);
          setAdminCheckFailedReason(null);
        }

        // Non-blocking presence sync (never write protected role/Pro/points fields from non-admin client)
        setDoc(
          userDocRef,
          cleanFirestoreData({
            isOnline: true,
            lastSeenAt: nowIso,
            ...(isOwnerEmail ? { email: user.email || cleanUserEmail, role: 'admin', isOwner: true } : {}),
            ...(customName ? { displayName: customName } : {}),
            ...(customUsername ? { username: customUsername } : {}),
            loginStreak: rewardFields.loginStreak,
            lastDailyRewardDate: rewardFields.lastDailyRewardDate,
            lastDailyRewardAmount: rewardFields.lastDailyRewardAmount,
            totalLoginDays: rewardFields.totalLoginDays,
            ...(isEffectiveAdmin ? { points: rewardFields.points, wavePoints: rewardFields.wavePoints } : {})
          }),
          { merge: true }
        ).catch(() => {});

        if (newlyAwarded) {
          setDailyRewardJustClaimed({
            points: pointsAwarded,
            streak: rewardFields.loginStreak,
            totalPoints: rewardFields.points
          });
          showGlobalToast(`🎁 Daily Login Bonus: +${pointsAwarded} WavePoints! (${rewardFields.loginStreak}-Day Streak 🔥)`);
        }

        // One-time migration for any legacy data:image/* or blob: media still stored in /users/{uid}
        migrateLegacyProfileMediaIfNeeded(user, mergedProfile).catch(() => {});

        // Passively sync existing notification settings & token state (never prompts on load)
        syncExistingDeviceTokenState(user.uid, data.notificationSettings).catch(() => {});
      }
    } catch (err) {
      console.warn('Profile sync notice:', err);
    }
  };

  const migrateLegacyProfileMediaIfNeeded = async (user: FirebaseUser, profile: UserProfile) => {
    const uid = user.uid;
    if (!uid || migratedMediaProfileUids.has(uid)) return;

    const isLegacyDataImage = (val: unknown): boolean =>
      typeof val === 'string' && val.trim().startsWith('data:image/');
    const isStaleBlobOrBadUrl = (val: unknown): boolean =>
      typeof val === 'string' &&
      val.trim().length > 0 &&
      (val.trim().startsWith('blob:') || (!val.trim().startsWith('https://') && !val.trim().startsWith('data:image/')));

    const hasLegacyPhoto =
      isLegacyDataImage(profile.photoURL) ||
      isStaleBlobOrBadUrl(profile.photoURL) ||
      (typeof profile.photoURL === 'string' && profile.photoURL.trim().length >= 500);
    const hasLegacyCover =
      isLegacyDataImage(profile.coverImageUrl) || isStaleBlobOrBadUrl(profile.coverImageUrl);
    const hasLegacyChatThemes = Boolean(
      profile.chatThemes &&
        typeof profile.chatThemes === 'object' &&
        Object.values(profile.chatThemes).some(
          (pref) => pref?.customBgUrl && (isLegacyDataImage(pref.customBgUrl) || isStaleBlobOrBadUrl(pref.customBgUrl))
        )
    );
    const hasLegacyHighlights = Boolean(
      Array.isArray(profile.storyHighlights) &&
        profile.storyHighlights.some(
          (hl) =>
            isLegacyDataImage(hl?.coverUrl) ||
            isStaleBlobOrBadUrl(hl?.coverUrl) ||
            isLegacyDataImage(hl?.mediaUrl) ||
            isStaleBlobOrBadUrl(hl?.mediaUrl)
        )
    );

    if (!hasLegacyPhoto && !hasLegacyCover && !hasLegacyChatThemes && !hasLegacyHighlights) {
      migratedMediaProfileUids.add(uid);
      return;
    }

    migratedMediaProfileUids.add(uid);
    const patch: Record<string, any> = {};

    if (hasLegacyPhoto) {
      if (typeof profile.photoURL === 'string' && isLegacyDataImage(profile.photoURL)) {
        try {
          const uploadedUrl = await migrateDataUrlImageToCloudinary(profile.photoURL, {
            maxWidth: 512,
            maxHeight: 512,
            targetMaxBytes: 240 * 1024
          });
          patch.photoURL = sanitizeAvatarUrlForFirestore(uploadedUrl, uid);
        } catch {
          // Leave untouched if offline; retry next session
          migratedMediaProfileUids.delete(uid);
        }
      } else {
        patch.photoURL = sanitizeAvatarUrlForFirestore('', uid);
      }
    }

    if (hasLegacyCover) {
      if (typeof profile.coverImageUrl === 'string' && isLegacyDataImage(profile.coverImageUrl)) {
        try {
          const uploadedCover = await migrateDataUrlImageToCloudinary(profile.coverImageUrl, {
            maxWidth: 1600,
            maxHeight: 534,
            targetMaxBytes: 420 * 1024
          });
          patch.coverImageUrl = sanitizeShortHttpsUrl(uploadedCover, 500) || '';
        } catch {
          migratedMediaProfileUids.delete(uid);
        }
      } else {
        patch.coverImageUrl = '';
      }
    }

    if (hasLegacyChatThemes && profile.chatThemes) {
      const nextThemes: Record<string, ChatThemePreference> = { ...profile.chatThemes };
      let changedThemes = false;
      for (const [convId, pref] of Object.entries(profile.chatThemes)) {
        if (!pref?.customBgUrl) continue;
        if (isLegacyDataImage(pref.customBgUrl)) {
          try {
            const uploadedThemeUrl = await migrateDataUrlImageToCloudinary(pref.customBgUrl, {
              maxWidth: 1080,
              maxHeight: 1440,
              targetMaxBytes: 380 * 1024
            });
            const cleanUrl = sanitizeShortHttpsUrl(uploadedThemeUrl, 500);
            if (cleanUrl) {
              nextThemes[convId] = { ...pref, customBgUrl: cleanUrl };
              changedThemes = true;
            }
          } catch {
            migratedMediaProfileUids.delete(uid);
          }
        } else if (isStaleBlobOrBadUrl(pref.customBgUrl)) {
          const { customBgUrl: _dropped, ...rest } = pref;
          nextThemes[convId] = rest;
          changedThemes = true;
        }
      }
      if (changedThemes) {
        patch.chatThemes = nextThemes;
      }
    }

    if (hasLegacyHighlights && Array.isArray(profile.storyHighlights)) {
      let changedHl = false;
      const nextHighlights = await Promise.all(
        profile.storyHighlights.map(async (hl) => {
          let nextCover = hl.coverUrl;
          let nextMedia = hl.mediaUrl;
          if (isLegacyDataImage(nextCover)) {
            try {
              nextCover =
                sanitizeShortHttpsUrl(
                  await migrateDataUrlImageToCloudinary(nextCover, {
                    maxWidth: 720,
                    maxHeight: 1280,
                    targetMaxBytes: 350 * 1024
                  }),
                  500
                ) || nextCover;
              changedHl = true;
            } catch {
              migratedMediaProfileUids.delete(uid);
            }
          } else if (isStaleBlobOrBadUrl(nextCover)) {
            nextCover = sanitizeAvatarUrlForFirestore('', uid);
            changedHl = true;
          }

          if (typeof nextMedia === 'string' && isLegacyDataImage(nextMedia)) {
            if (nextMedia === hl.coverUrl && nextCover && nextCover.startsWith('https://')) {
              nextMedia = nextCover;
              changedHl = true;
            } else {
              try {
                nextMedia =
                  sanitizeShortHttpsUrl(
                    await migrateDataUrlImageToCloudinary(nextMedia, {
                      maxWidth: 720,
                      maxHeight: 1280,
                      targetMaxBytes: 350 * 1024
                    }),
                    500
                  ) || nextMedia;
                changedHl = true;
              } catch {
                migratedMediaProfileUids.delete(uid);
              }
            }
          } else if (isStaleBlobOrBadUrl(nextMedia)) {
            nextMedia = nextCover && nextCover.startsWith('https://') ? nextCover : sanitizeAvatarUrlForFirestore('', uid);
            changedHl = true;
          }

          return { ...hl, coverUrl: nextCover, mediaUrl: nextMedia };
        })
      );
      if (changedHl) {
        patch.storyHighlights = nextHighlights;
      }
    }

    if (Object.keys(patch).length === 0) return;

    patch.updatedAt = new Date().toISOString();
    const sanitizedPatch = cleanFirestoreData(patch);
    await setDoc(doc(db, 'users', uid), sanitizedPatch, { merge: true });

    if (typeof patch.photoURL === 'string') {
      await fbUpdateProfile(user, { photoURL: patch.photoURL }).catch(() => {});
    }

    setUserProfile((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...sanitizedPatch } as UserProfile;
      setCachedUserProfile(uid, updated);
      return updated;
    });
  };

  const claimDailyReward = async (): Promise<{
    claimed: boolean;
    pointsAwarded: number;
    streak: number;
    totalPoints: number;
  }> => {
    if (!currentUser) {
      return { claimed: false, pointsAwarded: 0, streak: 0, totalPoints: 0 };
    }
    const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(
      currentUser.uid,
      userProfile
    );
    setUserProfile((prev) => (prev ? { ...prev, ...rewardFields } : prev));
    if (newlyAwarded) {
      setDailyRewardJustClaimed({
        points: pointsAwarded,
        streak: rewardFields.loginStreak,
        totalPoints: rewardFields.points
      });
      showGlobalToast(`🎁 Daily Login Bonus: +${pointsAwarded} WavePoints! (${rewardFields.loginStreak}-Day Streak 🔥)`);
    }
    try {
      const { points: _pts, wavePoints: _wpts, ...safeRewardFields } = rewardFields;
      const rewardWritePayload = isAdmin ? rewardFields : safeRewardFields;
      await setDoc(
        doc(db, 'users', currentUser.uid),
        cleanFirestoreData({
          ...rewardWritePayload,
          updatedAt: new Date().toISOString()
        }),
        { merge: true }
      );
    } catch {
      // Fallback already cached locally
    }
    return {
      claimed: newlyAwarded,
      pointsAwarded: newlyAwarded ? pointsAwarded : rewardFields.lastDailyRewardAmount,
      streak: rewardFields.loginStreak,
      totalPoints: rewardFields.points
    };
  };

  const recordPointTransaction = async (params: {
    type: PointTransactionType;
    category: PointTransactionCategory;
    title: string;
    description: string;
    amount: number;
    reference?: string;
    id?: string;
  }): Promise<{ success: boolean; newBalance: number; transaction?: PointTransaction; error?: string }> => {
    if (!currentUser) {
      return { success: false, newBalance: 0, error: 'You must be signed in to manage points.' };
    }

    const uid = currentUser.uid;
    const localCache = getLocalDailyRewardCache(uid);
    const currentPoints =
      typeof userProfile?.points === 'number'
        ? userProfile.points
        : typeof userProfile?.wavePoints === 'number'
        ? userProfile.wavePoints
        : localCache?.points ?? DAILY_REWARD_SCHEDULE[0];

    const absAmount = Math.max(1, Math.round(Math.abs(params.amount)));
    if (params.type === 'spent' && currentPoints < absAmount) {
      return {
        success: false,
        newBalance: currentPoints,
        error: `Insufficient WavePoints. You need ${absAmount} pts (Current balance: ${currentPoints} pts).`
      };
    }

    const newBalance = params.type === 'earned' ? currentPoints + absAmount : currentPoints - absAmount;
    const nowIso = new Date().toISOString();
    const txId = params.id || `pt_tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reference = params.reference || `WVP-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTx: PointTransaction = {
      id: txId,
      userId: uid,
      type: params.type,
      category: params.category,
      title: params.title,
      description: params.description,
      amount: absAmount,
      balanceAfter: newBalance,
      reference,
      createdAt: nowIso
    };

    const updatedTxs = mergePointTransactions(
      uid,
      [newTx],
      userProfile?.pointTransactions,
      getLocalPointTransactions(uid)
    );

    const updatedCache: LocalDailyRewardCache = {
      points: newBalance,
      wavePoints: newBalance,
      loginStreak: userProfile?.loginStreak ?? localCache?.loginStreak ?? 1,
      lastDailyRewardDate: userProfile?.lastDailyRewardDate || localCache?.lastDailyRewardDate || getLocalDateKey(),
      lastDailyRewardAmount: userProfile?.lastDailyRewardAmount ?? localCache?.lastDailyRewardAmount ?? DAILY_REWARD_SCHEDULE[0],
      totalLoginDays: userProfile?.totalLoginDays ?? localCache?.totalLoginDays ?? 1
    };
    setLocalDailyRewardCache(uid, updatedCache);

    setUserProfile((prev) =>
      prev
        ? {
            ...prev,
            points: newBalance,
            wavePoints: newBalance,
            pointTransactions: updatedTxs,
            updatedAt: nowIso
          }
        : prev
    );

    try {
      const txPayload: Record<string, any> = {
        pointTransactions: updatedTxs,
        updatedAt: nowIso
      };
      if (isAdmin) {
        txPayload.points = newBalance;
        txPayload.wavePoints = newBalance;
      }
      await setDoc(
        doc(db, 'users', uid),
        cleanFirestoreData(txPayload),
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore point transaction sync fallback:', err);
    }

    return {
      success: true,
      newBalance,
      transaction: newTx
    };
  };

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;
    let presenceInterval: ReturnType<typeof setInterval> | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // If Hidden Owner Sign-In, Existing Account Setup, or Sign-Up Email Verification is pending, keep user on AuthPage
      try {
        if (user && typeof window !== 'undefined') {
          if (
            sessionStorage.getItem('wavelink_owner_flow_pending') === 'true' ||
            sessionStorage.getItem('wavelink_existing_account_setup_pending') === 'true'
          ) {
            setIsLoading(false);
            return;
          }
          const isOwnerTokenPresent = Boolean(
            sessionStorage.getItem(OWNER_SESSION_STORAGE_KEY) ||
              localStorage.getItem(OWNER_SESSION_STORAGE_KEY)
          );
          const hasGoogleProvider = user.providerData.some((p) => p.providerId === 'google.com');
          if (
            !isOwnerTokenPresent &&
            (sessionStorage.getItem('wavelink_signup_verification_pending') === 'true' ||
              (!user.emailVerified && !hasGoogleProvider))
          ) {
            setCurrentUser(null);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }

      setCurrentUser(user);

      if (user) {
        const cleanEmail = (user.email || '').trim().toLowerCase();
        const hasOwnerSessionToken = Boolean(
          typeof window !== 'undefined' &&
            (sessionStorage.getItem(OWNER_SESSION_STORAGE_KEY) ||
              localStorage.getItem(OWNER_SESSION_STORAGE_KEY))
        );
        if (cleanEmail === 'keylanmbilinyi5@gmail.com') {
          setServerVerifiedRole('admin');
          setAdminCheckFailedReason(null);
        }
        setIsLoading(false);

        // Synchronize full existing profile from Firestore in the background without blocking UI
        syncUserProfileDoc(user).catch((err) => {
          console.warn('Profile sync notice:', err);
        });

        // Only verify server-side admin session on mount if owner email or owner token is present
        if (cleanEmail === 'keylanmbilinyi5@gmail.com' || hasOwnerSessionToken) {
          refreshAdminVerification(true).catch(() => {});
        }

        // Listen for live status changes on /users/{uid} (single canonical source for role & profile)
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeDoc = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const snapData = docSnap.data() as UserProfile;
              const currentLocalPro = hasLocalProPass(user.uid);
              const localReward = getLocalDailyRewardCache(user.uid);
              const canonicalRole = resolveCanonicalAdminRole(snapData.role, snapData.isSubAdmin);
              const isSnapAdmin = canonicalRole === 'admin';
              const resolvedPoints =
                typeof snapData.points === 'number'
                  ? snapData.points
                  : typeof snapData.wavePoints === 'number'
                  ? snapData.wavePoints
                  : localReward?.points ?? localReward?.wavePoints ?? DAILY_REWARD_SCHEDULE[0];
              const mergedTxs = mergePointTransactions(
                user.uid,
                snapData.pointTransactions,
                getLocalPointTransactions(user.uid)
              );
              if (canonicalRole === 'admin' || canonicalRole === 'sub_admin') {
                setServerVerifiedRole(canonicalRole);
              }
              setUserProfile({
                ...snapData,
                isPro: Boolean(snapData.isPro || currentLocalPro || isSnapAdmin),
                hasBlueStar: Boolean(snapData.hasBlueStar || snapData.isPro || currentLocalPro || isSnapAdmin),
                proBadge: snapData.proBadge || (isSnapAdmin ? 'founder' : currentLocalPro ? 'verified' : undefined),
                points: resolvedPoints,
                wavePoints: resolvedPoints,
                loginStreak: Math.max(snapData.loginStreak ?? 0, localReward?.loginStreak ?? 1),
                lastDailyRewardDate: snapData.lastDailyRewardDate || localReward?.lastDailyRewardDate,
                lastDailyRewardAmount: snapData.lastDailyRewardAmount ?? localReward?.lastDailyRewardAmount ?? 10,
                totalLoginDays: Math.max(snapData.totalLoginDays ?? 0, localReward?.totalLoginDays ?? 1),
                pointTransactions: mergedTxs
              });
            }
          },
          (error) => {
            console.warn('Profile snapshot notice:', error);
          }
        );

        // Heartbeat for online status
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = setInterval(() => {
          setDoc(
            userDocRef,
            { isOnline: true, lastSeenAt: new Date().toISOString() },
            { merge: true }
          ).catch(() => {});
        }, 60000);
      } else {
        if (unsubscribeDoc) unsubscribeDoc();
        if (presenceInterval) clearInterval(presenceInterval);
        setUserProfile(null);
        setServerVerifiedRole('user');
        setDailyRewardJustClaimed(null);
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (presenceInterval) clearInterval(presenceInterval);
    };
  }, []);

  // Defensive network retry helper for transient Firebase Auth connection errors
  const withAuthNetworkRetry = async <T,>(fn: () => Promise<T>, maxRetries = 1): Promise<T> => {
    try {
      return await fn();
    } catch (err: unknown) {
      if (isAuthNetworkError(err) && maxRetries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return await fn();
      }
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, googleProvider);
      await syncUserProfileDoc(res.user);
    } catch (err: unknown) {
      console.warn('Google Sign-In Attempt notice:', err);
      if (isAuthNetworkError(err)) {
        throw new Error(
          'Google Sign-In popup could not connect due to browser cross-origin iframe security. Please use Email Sign-In or 1-Click Platform Owner Launch below.'
        );
      }
      throw err;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const lockout = checkClientLoginLockout();
    if (lockout.locked) {
      throw new Error(
        `Too many failed login attempts. Please wait ${lockout.remainingSeconds} seconds before trying again.`
      );
    }
    try {
      const cleanEmail = email.trim();
      const res = await withAuthNetworkRetry(() =>
        signInWithEmailAndPassword(auth, cleanEmail, pass)
      );
      clearClientFailedLogins();
      await syncUserProfileDoc(res.user);
    } catch (err: unknown) {
      const attempt = recordClientFailedLogin();
      console.warn('Email Sign-In Notice:', err);
      if (attempt.locked) {
        throw new Error(
          `Too many failed login attempts. Login is temporarily locked for ${attempt.remainingSeconds} seconds.`
        );
      }
      throw err;
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string, username?: string) => {
    const pwCheck = validateStrongPassword(pass);
    if (!pwCheck.valid) {
      throw new Error(
        pwCheck.message ||
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
      );
    }
    const serverPwResp = await fetch('/api/auth/validate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const serverPwData = await serverPwResp.json().catch(() => ({}));
    if (!serverPwResp.ok || !serverPwData.valid) {
      throw new Error(
        serverPwData.error ||
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
      );
    }
    try {
      const cleanEmail = email.trim();
      const safeDisplayName = sanitizeUserText(displayName, 80);
      const safeUsername = username ? sanitizeUserText(username, 40) : undefined;
      const res = await withAuthNetworkRetry(() =>
        createUserWithEmailAndPassword(auth, cleanEmail, pass)
      );
      if (safeDisplayName) {
        await fbUpdateProfile(res.user, { displayName: safeDisplayName });
      }
      clearClientFailedLogins();
      await syncUserProfileDoc(res.user, safeDisplayName, safeUsername);
    } catch (err: unknown) {
      console.warn('Registration Notice:', err);
      throw err;
    }
  };

  // Unified seamless authentication: attempt sign-in first; if user not found, automatically register
  const authenticateSeamlessly = async (email: string, pass: string) => {
    const cleanEmail = email.trim();
    try {
      const res = await withAuthNetworkRetry(() =>
        signInWithEmailAndPassword(auth, cleanEmail, pass)
      );
      await syncUserProfileDoc(res.user);
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || String(err);
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        msg.includes('user-not-found') ||
        msg.includes('invalid-credential')
      ) {
        try {
          const createRes = await withAuthNetworkRetry(() =>
            createUserWithEmailAndPassword(auth, cleanEmail, pass)
          );
          const emailPrefix = cleanEmail.split('@')[0];
          await fbUpdateProfile(createRes.user, { displayName: emailPrefix });
          await syncUserProfileDoc(createRes.user, emailPrefix, `@${emailPrefix}`);
          return;
        } catch (createErr) {
          console.warn('Seamless registration notice:', createErr);
          throw createErr;
        }
      }
      throw err;
    }
  };

  const quickSignIn = async (
    email: string,
    pass: string,
    displayName?: string,
    username?: string
  ) => {
    const cleanEmail = email.trim();
    try {
      const res = await withAuthNetworkRetry(() =>
        signInWithEmailAndPassword(auth, cleanEmail, pass)
      );
      await syncUserProfileDoc(res.user, displayName, username);
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || String(err);
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        msg.includes('user-not-found') ||
        msg.includes('invalid-credential')
      ) {
        try {
          const createRes = await withAuthNetworkRetry(() =>
            createUserWithEmailAndPassword(auth, cleanEmail, pass)
          );
          if (displayName) {
            await fbUpdateProfile(createRes.user, { displayName });
          }
          await syncUserProfileDoc(createRes.user, displayName, username);
          return;
        } catch (createErr) {
          console.warn('Quick account creation notice:', createErr);
          throw createErr;
        }
      }
      throw err;
    }
  };

  const signOut = async () => {
    try {
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
          localStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
          sessionStorage.removeItem('wavelink_owner_flow_pending');
          sessionStorage.removeItem('wavelink_signup_verification_pending');
          sessionStorage.removeItem('wavelink_existing_account_setup_pending');
        }
      } catch {
        // ignore
      }
      const uid = currentUser?.uid;
      if (uid) {
        // Mark offline in Firebase Realtime Database & detach presence listeners BEFORE signing out
        try {
          const { goOfflineAndCleanupPresence } = await import('./PresenceContext');
          await goOfflineAndCleanupPresence(uid);
        } catch {
          // ignore
        }
        // Delete this device's FCM token from Firestore & server on logout
        await removeCurrentDeviceFcmToken(uid).catch(() => {});
        await setDoc(
          doc(db, 'users', uid),
          { isOnline: false, lastSeenAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => {});
      }
      await fbSignOut(auth);
      setUserProfile(null);
      setServerVerifiedRole('user');
    } catch (err) {
      console.error('Sign Out Error:', err);
    }
  };

  const changeUserPassword = async (currentPassword: string, newPassword: string) => {
    if (!currentUser) {
      throw new Error('You must be signed in to change your password.');
    }
    const cleanNew = newPassword.trim();
    const pwCheck = validateStrongPassword(cleanNew);
    if (!pwCheck.valid) {
      throw new Error(
        pwCheck.message ||
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
      );
    }

    const serverPwResp = await fetch('/api/auth/validate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanNew })
    });
    const serverPwData = await serverPwResp.json().catch(() => ({}));
    if (!serverPwResp.ok || !serverPwData.valid) {
      throw new Error(
        serverPwData.error ||
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
      );
    }

    // Re-authenticate first if currentPassword is provided and user has an email
    if (currentPassword.trim() && currentUser.email) {
      try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword.trim());
        await reauthenticateWithCredential(currentUser, credential);
      } catch (reauthErr: any) {
        const code = reauthErr?.code || '';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          throw new Error('Your current password is incorrect. Please check and try again.');
        }
      }
    }

    try {
      await fbUpdatePassword(currentUser, cleanNew);
      await setDoc(
        doc(db, 'users', currentUser.uid),
        { passwordUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/requires-recent-login') {
        if (currentPassword.trim() && currentUser.email) {
          const credential = EmailAuthProvider.credential(currentUser.email, currentPassword.trim());
          await reauthenticateWithCredential(currentUser, credential);
          await fbUpdatePassword(currentUser, cleanNew);
          return;
        }
        throw new Error('For security, please enter your Current Password above to confirm changing your password.');
      }
      throw new Error(getFriendlyAuthErrorMessage(err));
    }
  };

  const sendPasswordReset = async (email?: string) => {
    const targetEmail = (email || currentUser?.email || userProfile?.email || '').trim();
    if (!targetEmail) {
      throw new Error('No email address is linked to this account.');
    }
    await fbSendPasswordResetEmail(auth, targetEmail);
  };

  const updateUserProfile = async (data: {
    displayName?: string;
    username?: string;
    bio?: string;
    photoURL?: string;
    proBorderEffect?: 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
    proAccentColor?: 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';
    proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
    appearanceTheme?: AppearanceTheme;
    followingIds?: string[];
    closeFriendIds?: string[];
    privacySettings?: UserPrivacySettings;
    notificationSettings?: UserNotificationSettings;
    termsAgreement?: UserTermsAgreement;
    dataSaverEnabled?: boolean;
    language?: AppLanguage;
    panAfricanLanguage?: PanAfricanLanguageCode;
    countryCode?: AfricanCountryCode;
    regionName?: string;
    preferredCurrency?: EastAfricanCurrency;
    patternFrame?: KangaPatternFrame;
    kangaBackgroundEnabled?: boolean;
    interests?: string[];
    interestsCompleted?: boolean;
    weeklyWinnerUntil?: string;
    weeklyWinnerChallengeTitle?: string;
    weeklyWinnerHashtag?: string;
    isCreatorSpotlight?: boolean;
    spotlightNote?: string;
    coverImageUrl?: string;
    coverPresetId?: ProfileCoverPresetId;
    coverType?: ProfileCoverType;
    pinnedPostId?: string;
    storyHighlights?: StoryHighlightItem[];
    chatThemes?: Record<string, ChatThemePreference>;
    customBackground?: CustomAppBackground | null;
    customBackgroundHistory?: CustomBackgroundHistoryItem[];
    mutedChannelIds?: string[];
  }) => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);

      // Clean username formatting
      let formattedUsername = data.username?.trim();
      if (formattedUsername && !formattedUsername.startsWith('@')) {
        formattedUsername = `@${formattedUsername}`;
      }

      const updatePayload: Record<string, any> = {
        updatedAt: new Date().toISOString()
      };
      if (data.displayName !== undefined) updatePayload.displayName = sanitizeUserText(data.displayName, 80);
      if (formattedUsername !== undefined) updatePayload.username = sanitizeUserText(formattedUsername, 40);
      if (data.bio !== undefined) updatePayload.bio = sanitizeUserText(data.bio, 280);
      if (data.photoURL !== undefined) {
        let nextPhotoUrl = String(data.photoURL || '').trim();
        if (nextPhotoUrl.startsWith('data:image/')) {
          nextPhotoUrl = await migrateDataUrlImageToCloudinary(nextPhotoUrl, {
            maxWidth: 512,
            maxHeight: 512,
            targetMaxBytes: 240 * 1024
          });
        }
        updatePayload.photoURL = sanitizeAvatarUrlForFirestore(nextPhotoUrl, currentUser.uid);
      }
      if (data.proBorderEffect !== undefined) updatePayload.proBorderEffect = data.proBorderEffect;
      if (data.proAccentColor !== undefined) updatePayload.proAccentColor = data.proAccentColor;
      if (data.proBadge !== undefined) updatePayload.proBadge = data.proBadge;
      if (data.appearanceTheme !== undefined) updatePayload.appearanceTheme = data.appearanceTheme;
      if (data.followingIds !== undefined) updatePayload.followingIds = data.followingIds;
      if (data.closeFriendIds !== undefined) updatePayload.closeFriendIds = data.closeFriendIds;
      if (data.privacySettings !== undefined) {
        updatePayload.privacySettings = data.privacySettings;
        updatePayload.isOnline = data.privacySettings.showOnlineStatus;
      }
      if (data.notificationSettings !== undefined) {
        updatePayload.notificationSettings = data.notificationSettings;
        syncNotificationSettingsToServer(currentUser.uid, data.notificationSettings).catch(() => {});
      }
      if (data.mutedChannelIds !== undefined && Array.isArray(data.mutedChannelIds)) {
        updatePayload.mutedChannelIds = data.mutedChannelIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .slice(0, 200);
      }
      if (data.termsAgreement !== undefined) {
        updatePayload.termsAgreement = data.termsAgreement;
      }
      if (data.dataSaverEnabled !== undefined) {
        updatePayload.dataSaverEnabled = Boolean(data.dataSaverEnabled);
      }
      if (data.language !== undefined) {
        updatePayload.language = data.language === 'sw' ? 'sw' : 'en';
      }
      if (data.panAfricanLanguage !== undefined) {
        updatePayload.panAfricanLanguage = data.panAfricanLanguage;
      }
      if (data.countryCode !== undefined) {
        updatePayload.countryCode = data.countryCode;
      }
      if (data.regionName !== undefined) {
        updatePayload.regionName = sanitizeUserText(data.regionName, 60);
      }
      if (data.preferredCurrency !== undefined) {
        updatePayload.preferredCurrency = data.preferredCurrency;
      }
      if (data.patternFrame !== undefined) {
        updatePayload.patternFrame = data.patternFrame;
      }
      if (data.kangaBackgroundEnabled !== undefined) {
        updatePayload.kangaBackgroundEnabled = Boolean(data.kangaBackgroundEnabled);
      }
      if (data.interests !== undefined) {
        updatePayload.interests = Array.isArray(data.interests) ? data.interests.slice(0, 15) : [];
      }
      if (data.interestsCompleted !== undefined) {
        updatePayload.interestsCompleted = Boolean(data.interestsCompleted);
      }
      if (data.weeklyWinnerUntil !== undefined) {
        updatePayload.weeklyWinnerUntil = data.weeklyWinnerUntil;
      }
      if (data.weeklyWinnerChallengeTitle !== undefined) {
        updatePayload.weeklyWinnerChallengeTitle = sanitizeUserText(data.weeklyWinnerChallengeTitle, 120);
      }
      if (data.weeklyWinnerHashtag !== undefined) {
        updatePayload.weeklyWinnerHashtag = sanitizeUserText(data.weeklyWinnerHashtag, 60);
      }
      if (data.isCreatorSpotlight !== undefined) {
        updatePayload.isCreatorSpotlight = Boolean(data.isCreatorSpotlight);
      }
      if (data.spotlightNote !== undefined) {
        updatePayload.spotlightNote = sanitizeUserText(data.spotlightNote, 200);
      }
      if (data.coverImageUrl !== undefined) {
        let cleanCoverUrl = String(data.coverImageUrl || '').trim();
        if (cleanCoverUrl.startsWith('data:image/')) {
          cleanCoverUrl = await migrateDataUrlImageToCloudinary(cleanCoverUrl, {
            maxWidth: 1600,
            maxHeight: 534,
            targetMaxBytes: 420 * 1024
          });
        }
        updatePayload.coverImageUrl =
          cleanCoverUrl === '' ? '' : sanitizeShortHttpsUrl(cleanCoverUrl, 500) || '';
      }
      if (data.coverPresetId !== undefined) {
        updatePayload.coverPresetId = data.coverPresetId;
      }
      if (data.coverType !== undefined) {
        updatePayload.coverType = data.coverType;
      }
      if (data.pinnedPostId !== undefined) {
        updatePayload.pinnedPostId = sanitizeUserText(data.pinnedPostId, 160);
      }
      if (data.storyHighlights !== undefined && Array.isArray(data.storyHighlights)) {
        updatePayload.storyHighlights = await Promise.all(
          data.storyHighlights.slice(0, 20).map(async (hl) => {
            let coverUrl = String(hl.coverUrl || '').trim();
            let mediaUrl = String(hl.mediaUrl || '').trim();
            if (coverUrl.startsWith('data:image/')) {
              coverUrl = await migrateDataUrlImageToCloudinary(coverUrl, {
                maxWidth: 720,
                maxHeight: 1280,
                targetMaxBytes: 350 * 1024
              });
            }
            if (mediaUrl.startsWith('data:image/')) {
              mediaUrl =
                mediaUrl === hl.coverUrl && coverUrl.startsWith('https://')
                  ? coverUrl
                  : await migrateDataUrlImageToCloudinary(mediaUrl, {
                      maxWidth: 720,
                      maxHeight: 1280,
                      targetMaxBytes: 350 * 1024
                    });
            }
            return {
              ...hl,
              coverUrl: sanitizeAvatarUrlForFirestore(coverUrl, currentUser.uid),
              mediaUrl: sanitizeAvatarUrlForFirestore(mediaUrl || coverUrl, currentUser.uid)
            };
          })
        );
      }
      if (data.chatThemes !== undefined && data.chatThemes && typeof data.chatThemes === 'object') {
        const cleanedThemes: Record<string, ChatThemePreference> = {};
        for (const [convId, pref] of Object.entries(data.chatThemes)) {
          if (!pref || typeof pref !== 'object') continue;
          let customBgUrl = typeof pref.customBgUrl === 'string' ? pref.customBgUrl.trim() : undefined;
          if (customBgUrl && customBgUrl.startsWith('data:image/')) {
            customBgUrl = await migrateDataUrlImageToCloudinary(customBgUrl, {
              maxWidth: 1080,
              maxHeight: 1440,
              targetMaxBytes: 380 * 1024
            });
          }
          const validCustomBgUrl = customBgUrl ? sanitizeShortHttpsUrl(customBgUrl, 500) : null;
          const { customBgUrl: _ignored, ...rest } = pref;
          cleanedThemes[convId] = validCustomBgUrl ? { ...rest, customBgUrl: validCustomBgUrl } : rest;
        }
        updatePayload.chatThemes = cleanedThemes;
      }
      if (data.customBackground !== undefined) {
        if (data.customBackground === null) {
          updatePayload.customBackground = null;
        } else if (typeof data.customBackground === 'object') {
          const safeDesktopUrl = sanitizeShortHttpsUrl(data.customBackground.url, 500);
          const safeMobileUrl = data.customBackground.mobileUrl
            ? sanitizeShortHttpsUrl(data.customBackground.mobileUrl, 500)
            : undefined;
          if (!safeDesktopUrl) {
            throw new Error('Custom background URL must be a valid short HTTPS Cloudinary link.');
          }
          updatePayload.customBackground = {
            url: safeDesktopUrl,
            ...(safeMobileUrl ? { mobileUrl: safeMobileUrl } : {}),
            darken: Math.max(0, Math.min(70, Math.round(Number(data.customBackground.darken) || 0))),
            blur: Math.max(0, Math.min(12, Math.round(Number(data.customBackground.blur) || 0))),
            textMode: data.customBackground.textMode === 'light' ? 'light' : 'dark',
            ...(typeof data.customBackground.avgLuminance === 'number'
              ? { avgLuminance: Math.max(0, Math.min(100, Math.round(data.customBackground.avgLuminance))) }
              : {}),
            updatedAt: data.customBackground.updatedAt || new Date().toISOString()
          };
        }
      }
      if (data.customBackgroundHistory !== undefined && Array.isArray(data.customBackgroundHistory)) {
        updatePayload.customBackgroundHistory = data.customBackgroundHistory
          .slice(0, 5)
          .map((item) => {
            const safeUrl = sanitizeShortHttpsUrl(item?.url, 500);
            if (!safeUrl) return null;
            const safeMobile = item?.mobileUrl ? sanitizeShortHttpsUrl(item.mobileUrl, 500) : undefined;
            return {
              id: sanitizeUserText(item.id || `bg_${Date.now()}`, 64),
              url: safeUrl,
              ...(safeMobile ? { mobileUrl: safeMobile } : {}),
              darken: Math.max(0, Math.min(70, Math.round(Number(item.darken) || 0))),
              blur: Math.max(0, Math.min(12, Math.round(Number(item.blur) || 0))),
              textMode: item.textMode === 'light' ? 'light' : 'dark',
              ...(typeof item.avgLuminance === 'number'
                ? { avgLuminance: Math.max(0, Math.min(100, Math.round(item.avgLuminance))) }
                : {}),
              createdAt: item.createdAt || new Date().toISOString()
            };
          })
          .filter(Boolean);
      }

      const sanitized = cleanFirestoreData(updatePayload);
      if (data.chatThemes !== undefined || data.customBackground !== undefined || data.customBackgroundHistory !== undefined) {
        try {
          await updateDoc(userRef, sanitized);
        } catch {
          await setDoc(userRef, sanitized, { merge: true });
        }
      } else {
        await setDoc(userRef, sanitized, { merge: true });
      }

      if (updatePayload.displayName || updatePayload.photoURL) {
        await fbUpdateProfile(currentUser, {
          displayName: updatePayload.displayName || currentUser.displayName,
          photoURL: updatePayload.photoURL || currentUser.photoURL,
        });
      }

      setUserProfile((prev) => {
        if (!prev) return null;
        const nextProfile = { ...prev, ...sanitized } as UserProfile;
        setCachedUserProfile(currentUser.uid, nextProfile);
        return nextProfile;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const toggleBlockUser = async (targetUserId: string): Promise<boolean> => {
    if (!currentUser || !userProfile || !targetUserId || targetUserId === currentUser.uid) {
      return false;
    }
    const existingBlocked = userProfile.blockedUserIds || [];
    const isAlreadyBlocked = existingBlocked.includes(targetUserId);
    const nextBlocked = isAlreadyBlocked
      ? existingBlocked.filter((id) => id !== targetUserId)
      : [...existingBlocked, targetUserId];

    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        { blockedUserIds: nextBlocked, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setUserProfile((prev) => (prev ? { ...prev, blockedUserIds: nextBlocked } : null));
      showGlobalToast(
        isAlreadyBlocked ? 'User unblocked.' : 'User blocked. You will no longer see their posts or messages.'
      );
      return !isAlreadyBlocked;
    } catch (err) {
      console.error('Error toggling block user:', err);
      return isAlreadyBlocked;
    }
  };

  const reportContent = async (params: {
    targetType: 'user' | 'post' | 'bot_reply' | 'comment' | 'video';
    targetId: string;
    targetAuthorId?: string;
    targetSummary?: string;
    reason: string;
  }) => {
    if (!currentUser) return;
    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const cleanReason = sanitizeUserText(params.reason || 'Reported for safety review', 500);
    const cleanSummary = sanitizeUserText(params.targetSummary || '', 400);

    await setDoc(
      doc(db, 'contentReports', reportId),
      cleanFirestoreData({
        id: reportId,
        reporterId: currentUser.uid,
        reporterEmail: currentUser.email || 'user',
        reporterName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        targetType: params.targetType,
        targetId: params.targetId,
        targetAuthorId: params.targetAuthorId,
        targetSummary: cleanSummary,
        reason: cleanReason,
        status: 'open',
        createdAt: nowIso
      })
    );
    showGlobalToast('Thank you. Your report has been sent to the WaveLink safety team.');
  };

  const sendVerificationEmail = async () => {
    const activeUser = auth.currentUser || currentUser;
    if (!activeUser || !activeUser.email) {
      throw new Error('Please sign in with an email address first.');
    }
    const resp = await fetch('/api/auth/check-verification-cooldown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        email: activeUser.email
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Please wait before resending the verification email.');
    }
    try {
      await fbSendEmailVerification(activeUser);
    } catch (err: any) {
      throw err;
    }
    showGlobalToast('Verification link sent. Check your inbox and spam folder.');
  };

  const recordAdminAuditLog = async (params: {
    action: AuditActionType;
    targetId: string;
    targetLabel?: string;
    details: string;
  }) => {
    if (!currentUser) return;
    try {
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(
        doc(db, 'adminAuditLogs', auditId),
        cleanFirestoreData({
          id: auditId,
          actorId: currentUser.uid,
          actorEmail: currentUser.email || 'unknown',
          actorName: userProfile?.displayName || currentUser.displayName || 'Administrator',
          action: params.action,
          targetId: params.targetId,
          targetLabel: params.targetLabel ? sanitizeUserText(params.targetLabel, 140) : undefined,
          details: sanitizeUserText(params.details, 800),
          createdAt: new Date().toISOString()
        })
      );
    } catch (err) {
      console.warn('Audit log write notice:', err);
    }
  };

  const deleteMyAccount = async (currentPassword?: string) => {
    if (!currentUser) {
      throw new Error('You must be signed in to delete your account.');
    }
    const uid = currentUser.uid;
    const email = currentUser.email || '';

    if (currentPassword && currentPassword.trim() && email) {
      const credential = EmailAuthProvider.credential(email, currentPassword.trim());
      await reauthenticateWithCredential(currentUser, credential);
    }

    // 1. Record deletion in audit log
    await recordAdminAuditLog({
      action: 'delete_account',
      targetId: uid,
      targetLabel: email,
      details: `User permanently deleted their own account (${email}).`
    });

    // 2. Delete user's posts and sparks
    try {
      const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid)));
      for (const p of postsSnap.docs) {
        await deleteDoc(doc(db, 'posts', p.id)).catch(() => {});
      }
      const sparksSnap = await getDocs(query(collection(db, 'sparks'), where('authorId', '==', uid)));
      for (const s of sparksSnap.docs) {
        await deleteDoc(doc(db, 'sparks', s.id)).catch(() => {});
      }
    } catch {
      // continue cleanup
    }

    // 3. Delete device FCM token and user profile document
    await removeCurrentDeviceFcmToken(uid).catch(() => {});
    await deleteDoc(doc(db, 'users', uid)).catch(() => {});

    // 4. Clear local storage caches
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`wavelink_daily_reward_${uid}`);
        localStorage.removeItem(`wavelink_point_transactions_${uid}`);
        localStorage.removeItem(`wavelink_pro_pass_${uid}`);
        localStorage.removeItem(`wavelink_privacy_${uid}`);
        localStorage.removeItem(`wavelink_terms_${uid}`);
      }
    } catch {
      // ignore
    }

    // 5. Delete Firebase Auth user or sign out if recent login is required
    try {
      await fbDeleteUser(currentUser);
    } catch {
      await fbSignOut(auth);
    }
    setUserProfile(null);
  };


  const toggleSavePost = async (postId: string): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;
    const currentSaves = userProfile.savedPostIds || [];
    const isSaved = currentSaves.includes(postId);
    const updatedSaves = isSaved
      ? currentSaves.filter((id) => id !== postId)
      : [...currentSaves, postId];

    try {
      // 1. Update user profile saved IDs array
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { savedPostIds: updatedSaves, updatedAt: new Date().toISOString() }, { merge: true });
      setUserProfile((prev) => (prev ? { ...prev, savedPostIds: updatedSaves } : null));

      // 2. Persist to private 'savedPosts' subcollection: /users/{userId}/savedPosts/{postId}
      const userSavedDocRef = doc(db, 'users', currentUser.uid, 'savedPosts', postId);
      if (isSaved) {
        await deleteDoc(userSavedDocRef).catch(() => {});
      } else {
        await setDoc(userSavedDocRef, {
          id: postId,
          postId,
          userId: currentUser.uid,
          savedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }

      // 3. Persist to top-level private 'savedPosts' collection: /savedPosts/{userId_postId}
      const topLevelSavedRef = doc(db, 'savedPosts', `${currentUser.uid}_${postId}`);
      if (isSaved) {
        await deleteDoc(topLevelSavedRef).catch(() => {});
      } else {
        await setDoc(topLevelSavedRef, {
          id: `${currentUser.uid}_${postId}`,
          postId,
          userId: currentUser.uid,
          savedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }

      // 4. Update post savesCount
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const postData = postSnap.data();
        const currentCount = postData.savesCount || 0;
        await setDoc(postRef, { savesCount: Math.max(0, isSaved ? currentCount - 1 : currentCount + 1) }, { merge: true });
      }

      return !isSaved;
    } catch (err) {
      console.error('Error toggling save post in Firestore:', err);
      return isSaved;
    }
  };

  const dismissWarning = async () => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(
        userRef,
        {
          status: 'active',
          warningMessage: '',
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to dismiss warning:', err);
    }
  };

  // Single canonical source of truth for admin role across Admin Desk, Server Routes, and Firestore rules:
  const isOwnerEmailMatch = Boolean(
    currentUser?.email && currentUser.email.trim().toLowerCase() === 'keylanmbilinyi5@gmail.com'
  );
  const canonicalClaimRole = resolveCanonicalAdminRole(customClaimRole, customClaimRole === 'sub_admin');
  const canonicalProfileRole = resolveCanonicalAdminRole(userProfile?.role, userProfile?.isSubAdmin);
  const canonicalServerRole = resolveCanonicalAdminRole(serverVerifiedRole, serverVerifiedRole === 'sub_admin');

  const isSuperAdmin =
    isOwnerEmailMatch ||
    Boolean((userProfile as any)?.isOwner) ||
    canonicalClaimRole === 'admin' ||
    canonicalProfileRole === 'admin' ||
    canonicalServerRole === 'admin';
  const isSubAdmin =
    !isSuperAdmin &&
    (canonicalClaimRole === 'sub_admin' ||
      canonicalProfileRole === 'sub_admin' ||
      canonicalServerRole === 'sub_admin');
  const isAdmin = isSuperAdmin || isSubAdmin;

  // Verification status: verified by admin, has blue star, or verified badge
  const isVerified = Boolean(userProfile?.hasBlueStar || userProfile?.isVerifiedByAdmin || userProfile?.proBadge === 'verified');
  const isProSubscriptionExpired = Boolean(
    userProfile?.proExpiresAt &&
      !isNaN(Date.parse(userProfile.proExpiresAt)) &&
      Date.parse(userProfile.proExpiresAt) <= Date.now()
  );

  // Rule: All premium features do not apply to admins and those verified by admin or who unlocked active Pro
  const isProEffective =
    isSuperAdmin ||
    isSubAdmin ||
    Boolean(userProfile?.isVerifiedByAdmin) ||
    ((isVerified || Boolean(userProfile?.isPro)) && !isProSubscriptionExpired);
  const isExemptFromPayments = isProEffective;

  // Only admins or verified people with the blue star can talk to the admin
  const canTalkToAdmin = isSuperAdmin || isSubAdmin || isVerified || Boolean(userProfile?.isPro);

  // Admin capability to appoint/demote sub-admins (enforced on server + Firestore + audit log)
  const toggleSubAdmin = async (targetUserId: string, makeSubAdmin: boolean) => {
    if (!isSuperAdmin) {
      console.warn('Permission denied: Only the Platform Owner can manage administrators.');
      return;
    }
    if (targetUserId === SUPPORT_BOT_ID) {
      showGlobalToast('WaveLink Support Bot cannot be granted admin privileges.');
      return;
    }
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/admin/role', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          callerEmail: currentUser?.email,
          targetUserId,
          makeSubAdmin
        })
      }).catch(() => {});

      const targetUserRef = doc(db, 'users', targetUserId);
      await setDoc(
        targetUserRef,
        {
          isSubAdmin: makeSubAdmin,
          role: makeSubAdmin ? 'sub_admin' : 'user',
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      await recordAdminAuditLog({
        action: 'role_change',
        targetId: targetUserId,
        details: `${makeSubAdmin ? 'Promoted user to Sub-Admin' : 'Demoted Sub-Admin to standard User'}`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
    }
  };

  // Admin capability to verify member & grant complimentary Pro status
  const toggleVerifyUser = async (targetUserId: string, verify: boolean) => {
    if (!isAdmin) {
      console.warn('Permission denied: Only administrators can verify members.');
      return;
    }
    if (targetUserId === SUPPORT_BOT_ID) return;
    try {
      const targetUserRef = doc(db, 'users', targetUserId);
      await setDoc(
        targetUserRef,
        {
          hasBlueStar: verify,
          isVerifiedByAdmin: verify,
          isPro: verify,
          proBadge: verify ? 'verified' : 'none',
          proBorderEffect: verify ? 'aura-gold' : 'none',
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      await recordAdminAuditLog({
        action: 'verify_user',
        targetId: targetUserId,
        details: `${verify ? 'Granted Blue Star verification & Pro status' : 'Revoked verification & Pro status'}`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
    }
  };

  // Instant Harvest Pass ("HARVEST2026") activation:
  // Updates local state + localStorage immediately, purges Adsterra ads, adds Blue Star badge,
  // and syncs to Firestore with a 1.5s timeout so network checks never block or hang.
  const activateHarvestPass = async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('wavelink_pro_pass', 'true');
        if (currentUser?.uid) {
          localStorage.setItem(`wavelink_pro_pass_${currentUser.uid}`, 'true');
        }
      }
    } catch (_) {}

    const proFields = {
      isPro: true,
      hasBlueStar: true,
      isVerifiedByAdmin: true,
      proPlan: 'annual' as const,
      proExpiresAt: expiresAt,
      proBadge: 'verified' as const,
      proBorderEffect: 'neon-pulse' as const,
      proAccentColor: 'emerald' as const,
      updatedAt: now.toISOString()
    };

    // 1. Immediately update local state so UI, Blue Star badge, and Adsterra removal react instantaneously
    setUserProfile((prev) =>
      prev
        ? { ...prev, ...proFields }
        : currentUser
        ? {
            id: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Waver',
            username: `@${(currentUser.email?.split('@')[0] || 'waver').toLowerCase()}`,
            status: 'active',
            isBanned: false,
            createdAt: now.toISOString(),
            ...proFields
          }
        : null
    );

    // 2. Show global toast notification ("Harvest Pass Activated!")
    showGlobalToast('Harvest Pass Activated!');

    // 3. Sync to Firestore with a strict 1.2s timeout fallback so it never hangs on network errors
    if (currentUser?.uid) {
      const userRef = doc(db, 'users', currentUser.uid);
      const writePromise = setDoc(userRef, cleanFirestoreData(proFields), { merge: true }).catch((err) => {
        console.warn('Firestore Harvest Pass sync fallback:', err);
      });
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1200));
      await Promise.race([writePromise, timeoutPromise]);
    }
  };

  // Verify official coupon code (supports built-in official code or any valid code stored in Firestore)
  const verifyAndRedeemCoupon = async (rawCode: string): Promise<boolean> => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) return false;

    if (clean === 'HARVEST2026') {
      await activateHarvestPass();
      return true;
    }

    try {
      const checkFirestoreCoupon = async (): Promise<boolean> => {
        const couponSnap = await getDoc(doc(db, 'coupons', clean));
        if (couponSnap.exists() && couponSnap.data()?.active !== false) {
          return true;
        }
        const promoSnap = await getDoc(doc(db, 'promo_codes', clean));
        if (promoSnap.exists() && promoSnap.data()?.active !== false) {
          return true;
        }
        return false;
      };

      const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));
      const isValidInDb = await Promise.race([checkFirestoreCoupon(), timeoutPromise]);
      if (isValidInDb) {
        await activateHarvestPass();
        return true;
      }
    } catch {
      // Fallback gracefully if offline
    }

    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isSuperAdmin,
        isSubAdmin,
        isAdmin,
        isProEffective,
        isExemptFromPayments,
        isVerified,
        canTalkToAdmin,
        isLoading,
        dailyRewardJustClaimed,
        dismissDailyRewardNotice,
        claimDailyReward,
        recordPointTransaction,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        quickSignIn,
        authenticateSeamlessly,
        signOut,
        changeUserPassword,
        sendPasswordReset,
        updateUserProfile,
        toggleSavePost,
        toggleBlockUser,
        reportContent,
        sendVerificationEmail,
        deleteMyAccount,
        recordAdminAuditLog,
        dismissWarning,
        toggleSubAdmin,
        toggleVerifyUser,
        activateHarvestPass,
        verifyAndRedeemCoupon,
        showGlobalToast,
        refreshAdminVerification,
        reverifyOwnerAccess,
        adminCheckFailedReason,
        completeVerifiedAuthSession
      }}
    >
      {globalToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-600/30 border border-emerald-400 flex items-center gap-2.5 animate-fade-in">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          <span>{globalToast}</span>
          <span className="text-[11px] font-semibold bg-white/20 px-2 py-0.5 rounded-full">
            Blue Star &amp; Ad-Free Active
          </span>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
