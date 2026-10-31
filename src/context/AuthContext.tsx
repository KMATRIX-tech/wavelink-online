import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL, isOwnerEmail, isAdminEmail, isSuperAdminEmail, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import { UserProfile } from '../types';

export const DAILY_REWARD_SCHEDULE = [10, 15, 20, 25, 30, 40, 50];

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
  rewardFields: LocalDailyRewardCache;
  newlyAwarded: boolean;
  pointsAwarded: number;
} {
  const todayKey = getLocalDateKey();
  const yesterdayKey = getYesterdayDateKey();
  const localCache = getLocalDailyRewardCache(uid);

  // Merge Firestore and local cache (take whichever has the most recent date / highest points)
  const existingLastDate =
    profileData?.lastDailyRewardDate && localCache?.lastDailyRewardDate
      ? profileData.lastDailyRewardDate >= localCache.lastDailyRewardDate
        ? profileData.lastDailyRewardDate
        : localCache.lastDailyRewardDate
      : profileData?.lastDailyRewardDate || localCache?.lastDailyRewardDate || '';

  const existingPoints = Math.max(
    profileData?.points ?? 0,
    profileData?.wavePoints ?? 0,
    localCache?.points ?? 0,
    localCache?.wavePoints ?? 0
  );
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

  // Already rewarded today
  if (existingLastDate === todayKey && existingPoints > 0) {
    const currentFields: LocalDailyRewardCache = {
      points: existingPoints,
      wavePoints: existingPoints,
      loginStreak: Math.max(1, existingStreak),
      lastDailyRewardDate: todayKey,
      lastDailyRewardAmount: existingLastAmount,
      totalLoginDays: Math.max(1, existingTotalDays)
    };
    setLocalDailyRewardCache(uid, currentFields);
    return {
      rewardFields: currentFields,
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
    rewardFields: updatedFields,
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
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string, username?: string) => Promise<void>;
  quickSignIn: (email: string, pass: string, displayName?: string, username?: string) => Promise<void>;
  authenticateSeamlessly: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (data: {
    displayName?: string;
    username?: string;
    bio?: string;
    photoURL?: string;
    proBorderEffect?: 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
    proAccentColor?: 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';
    proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
  }) => Promise<void>;
  toggleSavePost: (postId: string) => Promise<boolean>;
  dismissWarning: () => Promise<void>;
  toggleSubAdmin: (targetUserId: string, makeSubAdmin: boolean) => Promise<void>;
  toggleVerifyUser: (targetUserId: string, verify: boolean) => Promise<void>;
  activateHarvestPass: () => Promise<void>;
  verifyAndRedeemCoupon: (rawCode: string) => Promise<boolean>;
  showGlobalToast: (message: string) => void;
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

  // Sync profile document in Firestore & evaluate Daily Login Reward
  const syncUserProfileDoc = async (user: FirebaseUser, customName?: string, customUsername?: string) => {
    const userDocRef = doc(db, 'users', user.uid);
    const localPro = hasLocalProPass(user.uid);
    const nowIso = new Date().toISOString();

    try {
      const snap = await getDoc(userDocRef);
      const isOwner = isOwnerEmail(user.email);
      const emailPrefix = user.email ? user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : 'waver';

      if (!snap.exists()) {
        const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(user.uid, null);
        const initialProfile: UserProfile = {
          id: user.uid,
          email: user.email || '',
          username: isOwner ? '@keylan' : (customUsername || `@${emailPrefix}`),
          displayName: isOwner ? 'Keylan Mbilinyi (Platform Owner)' : (customName || user.displayName || user.email?.split('@')[0] || 'Waver'),
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.uid}`,
          bio: isOwner ? 'Founder & Platform Owner of WaveLink 🌊' : 'Connecting on WaveLink 🌊',
          status: 'active',
          isBanned: false,
          savedPostIds: [],
          role: isOwner ? 'super_admin' : 'user',
          isSubAdmin: false,
          hasBlueStar: isOwner || localPro,
          isVerifiedByAdmin: isOwner || localPro,
          isPro: isOwner || localPro,
          proBadge: isOwner ? 'founder' : (localPro ? 'verified' : undefined),
          proBorderEffect: isOwner ? 'aura-gold' : (localPro ? 'neon-pulse' : undefined),
          proAccentColor: isOwner ? 'gold' : (localPro ? 'emerald' : undefined),
          isOnline: true,
          lastSeenAt: nowIso,
          ...rewardFields,
          createdAt: nowIso,
        };
        await setDoc(userDocRef, cleanFirestoreData({
          ...initialProfile,
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
        const data = snap.data() as UserProfile;
        const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(user.uid, data);

        if (isOwner && (!data.isPro || data.role !== 'super_admin' || !data.hasBlueStar)) {
          const ownerProfile: UserProfile = {
            ...data,
            role: 'super_admin',
            hasBlueStar: true,
            isVerifiedByAdmin: true,
            isPro: true,
            proBadge: 'founder',
            proBorderEffect: 'aura-gold',
            proAccentColor: 'gold',
            displayName: data.displayName || 'Keylan Mbilinyi (Platform Owner)',
            username: data.username || '@keylan',
            savedPostIds: data.savedPostIds || [],
            isOnline: true,
            lastSeenAt: nowIso,
            ...rewardFields
          };
          await setDoc(userDocRef, cleanFirestoreData(ownerProfile), { merge: true });
          setUserProfile(ownerProfile);
        } else {
          const mergedProfile: UserProfile = {
            ...data,
            isPro: Boolean(data.isPro || localPro),
            hasBlueStar: Boolean(data.hasBlueStar || data.isPro || localPro),
            proBadge: data.proBadge || (localPro ? 'verified' : undefined),
            isOnline: true,
            lastSeenAt: nowIso,
            ...rewardFields
          };
          setUserProfile(mergedProfile);
          // Non-blocking presence + pro + daily reward sync (ensures 'points' field is always written in Firestore)
          setDoc(
            userDocRef,
            cleanFirestoreData({
              isOnline: true,
              lastSeenAt: nowIso,
              ...rewardFields,
              ...(localPro ? { isPro: true, hasBlueStar: true, proBadge: 'verified' } : {})
            }),
            { merge: true }
          ).catch(() => {});
        }

        if (newlyAwarded) {
          setDailyRewardJustClaimed({
            points: pointsAwarded,
            streak: rewardFields.loginStreak,
            totalPoints: rewardFields.points
          });
          showGlobalToast(`🎁 Daily Login Bonus: +${pointsAwarded} WavePoints! (${rewardFields.loginStreak}-Day Streak 🔥)`);
        }
      }
    } catch (err) {
      console.warn('Profile sync notice:', err);
    }
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
      await setDoc(
        doc(db, 'users', currentUser.uid),
        cleanFirestoreData({
          ...rewardFields,
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

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;
    let presenceInterval: ReturnType<typeof setInterval> | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        const isOwner = isOwnerEmail(user.email);
        const localPro = hasLocalProPass(user.uid);
        const emailPrefix = user.email ? user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : 'waver';
        const nowIso = new Date().toISOString();
        const { rewardFields, newlyAwarded, pointsAwarded } = computeDailyRewardState(user.uid, null);

        if (newlyAwarded) {
          setDailyRewardJustClaimed({
            points: pointsAwarded,
            streak: rewardFields.loginStreak,
            totalPoints: rewardFields.points
          });
          showGlobalToast(`🎁 Daily Login Bonus: +${pointsAwarded} WavePoints! (${rewardFields.loginStreak}-Day Streak 🔥)`);
        }

        setUserProfile((prev) => prev ? {
          ...prev,
          isPro: Boolean(prev.isPro || isOwner || localPro),
          hasBlueStar: Boolean(prev.hasBlueStar || prev.isPro || isOwner || localPro),
          isOnline: true,
          lastSeenAt: nowIso,
          points: Math.max(prev.points ?? 0, prev.wavePoints ?? 0, rewardFields.points),
          wavePoints: Math.max(prev.points ?? 0, prev.wavePoints ?? 0, rewardFields.wavePoints),
          loginStreak: Math.max(prev.loginStreak ?? 0, rewardFields.loginStreak),
          lastDailyRewardDate: rewardFields.lastDailyRewardDate,
          lastDailyRewardAmount: rewardFields.lastDailyRewardAmount,
          totalLoginDays: Math.max(prev.totalLoginDays ?? 0, rewardFields.totalLoginDays)
        } : ({
          id: user.uid,
          email: user.email || '',
          username: isOwner ? '@keylan' : `@${emailPrefix}`,
          displayName: isOwner ? 'Keylan Mbilinyi (Platform Owner)' : (user.displayName || user.email?.split('@')[0] || 'Waver'),
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.uid}`,
          bio: isOwner ? 'Founder & Platform Owner of WaveLink 🌊' : 'Connecting on WaveLink 🌊',
          status: 'active',
          isBanned: false,
          savedPostIds: [],
          role: isOwner ? 'super_admin' : 'user',
          isSubAdmin: false,
          hasBlueStar: isOwner || localPro,
          isVerifiedByAdmin: isOwner || localPro,
          isPro: isOwner || localPro,
          proBadge: isOwner ? 'founder' : (localPro ? 'verified' : undefined),
          proBorderEffect: isOwner ? 'aura-gold' : (localPro ? 'neon-pulse' : undefined),
          proAccentColor: isOwner ? 'gold' : (localPro ? 'emerald' : undefined),
          isOnline: true,
          lastSeenAt: nowIso,
          ...rewardFields,
          createdAt: nowIso
        }));
        setIsLoading(false);

        // Synchronize full profile in the background
        syncUserProfileDoc(user).catch((err) => {
          console.warn('Profile sync notice:', err);
        });

        // Listen for live status changes
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeDoc = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const snapData = docSnap.data() as UserProfile;
              const currentLocalPro = hasLocalProPass(user.uid);
              const localReward = getLocalDailyRewardCache(user.uid);
              const resolvedPoints = Math.max(
                snapData.points ?? 0,
                snapData.wavePoints ?? 0,
                localReward?.points ?? 0,
                localReward?.wavePoints ?? 0
              );
              setUserProfile({
                ...snapData,
                isPro: Boolean(snapData.isPro || currentLocalPro),
                hasBlueStar: Boolean(snapData.hasBlueStar || snapData.isPro || currentLocalPro),
                proBadge: snapData.proBadge || (currentLocalPro ? 'verified' : undefined),
                points: resolvedPoints,
                wavePoints: resolvedPoints,
                loginStreak: Math.max(snapData.loginStreak ?? 0, localReward?.loginStreak ?? 1),
                lastDailyRewardDate: snapData.lastDailyRewardDate || localReward?.lastDailyRewardDate,
                lastDailyRewardAmount: snapData.lastDailyRewardAmount ?? localReward?.lastDailyRewardAmount ?? 10,
                totalLoginDays: Math.max(snapData.totalLoginDays ?? 0, localReward?.totalLoginDays ?? 1)
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

  const signInWithGoogle = async () => {
    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, googleProvider);
      await syncUserProfileDoc(res.user);
    } catch (err: unknown) {
      console.error('Google Sign-In Error:', err);
      throw err;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
      await syncUserProfileDoc(res.user);
    } catch (err: unknown) {
      console.error('Email Sign-In Error:', err);
      throw err;
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string, username?: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (displayName) {
        await fbUpdateProfile(res.user, { displayName });
      }
      await syncUserProfileDoc(res.user, displayName, username);
    } catch (err: unknown) {
      console.error('Registration Error:', err);
      throw err;
    }
  };

  // Unified seamless authentication: attempt sign-in first; if user not found, automatically register
  const authenticateSeamlessly = async (email: string, pass: string) => {
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
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
          const createRes = await createUserWithEmailAndPassword(auth, email, pass);
          const emailPrefix = email.split('@')[0];
          await fbUpdateProfile(createRes.user, { displayName: emailPrefix });
          await syncUserProfileDoc(createRes.user, emailPrefix, `@${emailPrefix}`);
          return;
        } catch (createErr) {
          console.error('Seamless registration error:', createErr);
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
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
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
          const createRes = await createUserWithEmailAndPassword(auth, email, pass);
          if (displayName) {
            await fbUpdateProfile(createRes.user, { displayName });
          }
          await syncUserProfileDoc(createRes.user, displayName, username);
          return;
        } catch (createErr) {
          console.error('Quick account creation error:', createErr);
          throw createErr;
        }
      }
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
      setUserProfile(null);
    } catch (err) {
      console.error('Sign Out Error:', err);
    }
  };

  const updateUserProfile = async (data: {
    displayName?: string;
    username?: string;
    bio?: string;
    photoURL?: string;
    proBorderEffect?: 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
    proAccentColor?: 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';
    proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
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
      if (data.displayName !== undefined) updatePayload.displayName = data.displayName;
      if (formattedUsername !== undefined) updatePayload.username = formattedUsername;
      if (data.bio !== undefined) updatePayload.bio = data.bio;
      if (data.photoURL !== undefined) updatePayload.photoURL = data.photoURL;
      if (data.proBorderEffect !== undefined) updatePayload.proBorderEffect = data.proBorderEffect;
      if (data.proAccentColor !== undefined) updatePayload.proAccentColor = data.proAccentColor;
      if (data.proBadge !== undefined) updatePayload.proBadge = data.proBadge;

      const sanitized = cleanFirestoreData(updatePayload);
      await setDoc(userRef, sanitized, { merge: true });

      if (data.displayName || data.photoURL) {
        await fbUpdateProfile(currentUser, {
          displayName: data.displayName || currentUser.displayName,
          photoURL: data.photoURL || currentUser.photoURL,
        });
      }

      setUserProfile((prev) => (prev ? { ...prev, ...sanitized } : null));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };


  const toggleSavePost = async (postId: string): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;
    const currentSaves = userProfile.savedPostIds || [];
    const isSaved = currentSaves.includes(postId);
    const updatedSaves = isSaved
      ? currentSaves.filter((id) => id !== postId)
      : [...currentSaves, postId];

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { savedPostIds: updatedSaves, updatedAt: new Date().toISOString() }, { merge: true });
      setUserProfile((prev) => (prev ? { ...prev, savedPostIds: updatedSaves } : null));

      // Update post savesCount
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const postData = postSnap.data();
        const currentCount = postData.savesCount || 0;
        await setDoc(postRef, { savesCount: Math.max(0, isSaved ? currentCount - 1 : currentCount + 1) }, { merge: true });
      }

      return !isSaved;
    } catch (err) {
      console.error('Error toggling save post:', err);
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

  const isSuperAdmin = isSuperAdminEmail(currentUser?.email);
  const isSubAdmin = !isSuperAdmin && Boolean(userProfile?.isSubAdmin || userProfile?.role === 'sub_admin');
  const isAdmin = isSuperAdmin || isSubAdmin;

  // Verification status: verified by admin, has blue star, or verified badge
  const isVerified = Boolean(userProfile?.hasBlueStar || userProfile?.isVerifiedByAdmin || userProfile?.proBadge === 'verified');

  // Rule: All premium features do not apply to admins and those verified by admin or who unlocked pro (they get everything free)
  const isProEffective = isSuperAdmin || isSubAdmin || isVerified || Boolean(userProfile?.isPro);
  const isExemptFromPayments = isProEffective;

  // Only admins or verified people with the blue star can talk to the admin
  const canTalkToAdmin = isSuperAdmin || isSubAdmin || isVerified || Boolean(userProfile?.isPro);

  // Admin capability to appoint/demote sub-admins
  const toggleSubAdmin = async (targetUserId: string, makeSubAdmin: boolean) => {
    if (!isSuperAdmin) {
      console.warn('Permission denied: Only Platform Owner (keylanmbilinyi5@gmail.com) can manage administrators.');
      return;
    }
    try {
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
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        quickSignIn,
        authenticateSeamlessly,
        signOut,
        updateUserProfile,
        toggleSavePost,
        dismissWarning,
        toggleSubAdmin,
        toggleVerifyUser,
        activateHarvestPass,
        verifyAndRedeemCoupon,
        showGlobalToast
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
