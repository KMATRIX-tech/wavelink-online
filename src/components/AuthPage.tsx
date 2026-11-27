import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
  updatePassword,
  updateProfile as fbUpdateProfile,
  signOut as fbSignOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type MultiFactorInfo
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  limit
} from 'firebase/firestore';
import {
  auth,
  db,
  OWNER_SESSION_STORAGE_KEY,
  getClientDeviceId,
  isAuthNetworkError,
  formatEmailVerificationError,
  extractSafeFirebaseAuthCode,
  cleanFirestoreData,
  getBestAuthUserPhotoUrl,
  isRealUserPhotoUrl,
  formatFirebaseMfaError,
  getFriendlyAuthErrorMessage
} from '../firebase';
import { recordSystemDomain } from '../services/verificationService';
import { validateStrongPassword, clearClientFailedLogins } from '../utils/security';
import { checkTextModerationLocal } from '../utils/contentModeration';
import { useAuth } from '../context/AuthContext';
import { LegalModal, LegalDocType } from './LegalModals';
import {
  MIN_SIGNUP_AGE,
  ADULT_AGE_THRESHOLD,
  deriveMinimalAgeRecord,
  PARENTAL_PRIVACY_NOTICE
} from '../config/ageConfig';
import {
  Waves,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  X,
  ArrowLeft,
  Smartphone,
  RotateCcw
} from 'lucide-react';

const GENERIC_OWNER_ERROR = 'We could not verify the owner code. Please check your code and tap Try again.';
const GENERIC_USER_AUTH_ERROR = 'We could not sign you in. Please check your details and tap Try again.';
const EXISTING_ACCOUNT_EMAIL_STORAGE_KEY = 'wavelink_existing_account_email';

async function logFailureOnServerOnly(
  flow: string,
  errOrReason: unknown,
  uid?: string
): Promise<void> {
  try {
    const code = extractSafeFirebaseAuthCode(errOrReason) || '';
    const rawMsg =
      errOrReason instanceof Error
        ? errOrReason.message
        : typeof errOrReason === 'string'
        ? errOrReason
        : JSON.stringify(errOrReason || 'Unknown error');
    await fetch('/api/auth/log-failure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WaveLink-Device-Id': getClientDeviceId()
      },
      body: JSON.stringify({
        flow,
        code,
        uid: uid || auth.currentUser?.uid || '',
        reason: rawMsg.slice(0, 350)
      })
    });
  } catch {
    // never fail client on server log transport
  }
}

export const AuthPage: React.FC = () => {
  const { refreshAdminVerification, completeVerifiedAuthSession, sendPasswordReset } = useAuth();
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);

  // Tab state: 'signin' | 'signup' | 'existing' ("I already have an account")
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'existing'>('signin');

  // Normal user fields: Username & Password + Email verification (Phone verification is disabled and hidden)
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Firebase Authentication built-in email verification state (never displays any code, link, or token in UI)
  const [verificationLinkSent, setVerificationLinkSent] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationErrorCode, setVerificationErrorCode] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState<number>(0);
  const [existingAccountDetected, setExistingAccountDetected] = useState(false);

  // "I already have an account" state (for existing users who first signed up with Google)
  const [existingVerifiedUid, setExistingVerifiedUid] = useState<string | null>(null);
  const [existingVerifiedEmail, setExistingVerifiedEmail] = useState<string>('');
  const [existingEmailLinkSent, setExistingEmailLinkSent] = useState(false);
  const [isVerifyingExisting, setIsVerifyingExisting] = useState(false);

  // Status & feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Hidden Owner Sign-In state (opened by tapping the WaveLink logo 5 times)
  const logoTapCountRef = useRef<number>(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [ownerAccessCode, setOwnerAccessCode] = useState('');
  const [showOwnerCode, setShowOwnerCode] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerLockedOut, setOwnerLockedOut] = useState(false);
  const [isOwnerSubmitting, setIsOwnerSubmitting] = useState(false);

  // Firebase Built-In TOTP Multi-Factor Sign-In Challenge state
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaHints, setMfaHints] = useState<MultiFactorInfo[]>([]);
  const [mfaDigits, setMfaDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [showLostAuthHelp, setShowLostAuthHelp] = useState(false);
  const [mfaFlowContext, setMfaFlowContext] = useState<{
    type: 'signin' | 'google' | 'existing' | 'owner';
    ownerAccessCode?: string;
  } | null>(null);
  const mfaOtpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // System domains are recorded by signed-in admins inside App.tsx

  // Load existing Firestore profile details for a verified existing UID so username & displayName are pre-filled
  const loadExistingAccountProfileIntoForm = useCallback(async (uid: string, fallbackEmail: string, fallbackName?: string | null) => {
    setExistingVerifiedUid(uid);
    setExistingVerifiedEmail(fallbackEmail);
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data?.username && typeof data.username === 'string') {
          setUsernameInput(data.username.replace(/^@/, ''));
        } else if (fallbackEmail) {
          setUsernameInput(fallbackEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, ''));
        }
        if (data?.displayName && typeof data.displayName === 'string') {
          setDisplayName(data.displayName);
        } else if (fallbackName) {
          setDisplayName(fallbackName);
        }
      } else {
        if (fallbackEmail && !usernameInput) {
          setUsernameInput(fallbackEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, ''));
        }
        if (fallbackName && !displayName) {
          setDisplayName(fallbackName);
        }
      }
    } catch (err) {
      await logFailureOnServerOnly('existing_account_profile_prefetch', err, uid);
    }
  }, [displayName, usernameInput]);

  // Handle return from Firebase Email Sign-In Link for "I already have an account"
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHref = window.location.href;
    if (!isSignInWithEmailLink(auth, currentHref)) return;

    const storedEmail =
      window.localStorage.getItem(EXISTING_ACCOUNT_EMAIL_STORAGE_KEY) || '';
    if (!storedEmail) {
      setAuthMode('existing');
      setStatusMessage('Enter your email address below to complete email link verification.');
      return;
    }

    (async () => {
      try {
        sessionStorage.setItem('wavelink_existing_account_setup_pending', 'true');
        setAuthMode('existing');
        setIsVerifyingExisting(true);
        const result = await signInWithEmailLink(auth, storedEmail, currentHref);
        window.localStorage.removeItem(EXISTING_ACCOUNT_EMAIL_STORAGE_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
        await loadExistingAccountProfileIntoForm(
          result.user.uid,
          result.user.email || storedEmail,
          result.user.displayName
        );
        setStatusMessage(
          'Account verified! Choose your username and password below to keep all your existing data.'
        );
      } catch (err) {
        await logFailureOnServerOnly('existing_account_email_link_complete', err);
        setError(GENERIC_USER_AUTH_ERROR);
      } finally {
        setIsVerifyingExisting(false);
      }
    })();
  }, [loadExistingAccountProfileIntoForm]);

  // Clear stale auth flow session flags if landing unauthenticated without an active email link callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isEmailLink = isSignInWithEmailLink(auth, window.location.href);
    if (!isEmailLink && !auth.currentUser) {
      try {
        sessionStorage.removeItem('wavelink_signup_verification_pending');
        sessionStorage.removeItem('wavelink_existing_account_setup_pending');
        sessionStorage.removeItem('wavelink_owner_flow_pending');
      } catch {
        // ignore
      }
    }
  }, []);

  // 60-second resend cooldown timer
  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setResendCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldownSeconds]);

  /**
   * Hidden Owner Sign-In Trigger: Tapping the WaveLink logo 5 times
   */
  const handleLogoTap = () => {
    logoTapCountRef.current += 1;
    if (logoTapTimerRef.current) {
      clearTimeout(logoTapTimerRef.current);
    }

    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      setOwnerError(null);
      setOwnerAccessCode('');
      setShowOwnerModal(true);
      return;
    }

    logoTapTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0;
    }, 2500);
  };

  /**
   * Resolve a username or email identifier to the Firebase Auth email (returns null if unknown username)
   */
  const resolveAuthEmailFromIdentifier = async (rawIdentifier: string): Promise<string | null> => {
    const trimmed = rawIdentifier.trim();
    if (trimmed.includes('@') && !trimmed.startsWith('@')) {
      return trimmed.toLowerCase();
    }

    const cleanHandle = trimmed.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    if (!cleanHandle) return null;

    // 1. Check server-side username lookup
    try {
      const resp = await fetch('/api/auth/lookup-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({ username: cleanHandle })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.authEmail) {
          return String(data.authEmail).trim().toLowerCase();
        }
      }
    } catch {
      // continue to Firestore lookup if signed in
    }

    // 2. Check Firestore users collection by username if currently authenticated
    if (auth.currentUser) {
      try {
        const candidates = [`@${cleanHandle}`, cleanHandle];
        const q = query(collection(db, 'users'), where('username', 'in', candidates), limit(5));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          if (docData?.email && typeof docData.email === 'string' && docData.email.includes('@')) {
            return docData.email.trim().toLowerCase();
          }
        }
      } catch {
        // ignore
      }
    }

    return null;
  };

  /**
   * When the user returns to the app, call reload() on the Firebase Auth user and check emailVerified.
   * When the user returns to the app, call reload() on the Firebase Auth user, force-refresh the ID token,
   * and confirm with the server.
   * Only after the server confirms email_verified, show 'Email verified' in the UI and allow sign-up to finish.
   */
  const checkFirebaseEmailVerified = useCallback(async (): Promise<boolean> => {
    const activeUser = auth.currentUser;
    if (!activeUser) return false;

    const cleanTypedEmail = emailInput.trim().toLowerCase();
    if (cleanTypedEmail && activeUser.email && activeUser.email.toLowerCase() !== cleanTypedEmail) {
      return false;
    }

    try {
      await activeUser.reload();
      if (activeUser.emailVerified) {
        const idToken = await activeUser.getIdToken(true).catch(() => '');
        if (!idToken) return false;

        // Authoritatively verify on the server before showing 'Email verified'
        const resp = await fetch('/api/auth/verify-email-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WaveLink-Device-Id': getClientDeviceId(),
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({ email: cleanTypedEmail })
        });
        const data = await resp.json().catch(() => ({}));

        if (resp.ok && data?.verified && data?.emailVerified) {
          if (data.existingAccount) {
            setExistingAccountDetected(true);
            setError('This email already has an account');
          } else {
            setExistingAccountDetected(false);
          }

          if (authMode === 'existing') {
            await loadExistingAccountProfileIntoForm(
              activeUser.uid,
              activeUser.email || cleanTypedEmail,
              activeUser.displayName
            );
            setStatusMessage(
              'Email verified! Choose your username and password below to keep all your existing data.'
            );
            return true;
          }

          setIsEmailVerified(true);
          setVerificationNotice(null);
          setVerificationErrorCode(null);
          if (!data.existingAccount) {
            setError(null);
          }
          setStatusMessage('Email verified');
          return true;
        } else {
          setIsEmailVerified(false);
          return false;
        }
      }
    } catch {
      // ignore transient reload error while offline
    }
    return false;
  }, [emailInput, authMode, loadExistingAccountProfileIntoForm]);

  useEffect(() => {
    const handleAppReturn = () => {
      if (document.visibilityState === 'visible') {
        checkFirebaseEmailVerified().catch(() => {});
      }
    };
    const handleWindowFocus = () => {
      checkFirebaseEmailVerified().catch(() => {});
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleAppReturn);

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if ((verificationLinkSent && !isEmailVerified) || (existingEmailLinkSent && !existingVerifiedUid)) {
      pollTimer = setInterval(() => {
        checkFirebaseEmailVerified().catch(() => {});
      }, 3500);
    }

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleAppReturn);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [
    verificationLinkSent,
    isEmailVerified,
    existingEmailLinkSent,
    existingVerifiedUid,
    checkFirebaseEmailVerified
  ]);

  /**
   * When a user taps Verify (or Resend) on their email:
   * - Validates email and password rule (8–24 chars, at least 1 letter and 1 number, frontend + server)
   * - Enforces a 60-second resend cooldown
   * - Creates or uses their Firebase Auth account and calls sendEmailVerification(user)
   * - Shows 'Verification link sent. Check your inbox and spam folder.'
   */
  const handleSendEmailVerificationLink = async () => {
    if (resendCooldownSeconds > 0 || isSendingVerification) return;
    setError(null);
    setVerificationNotice(null);
    setVerificationErrorCode(null);

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address for verification.');
      return;
    }

    // Enforce password rule (8–24 chars, at least 1 letter and 1 number) on frontend before creating/using Firebase Auth account
    const pwValidation = validateStrongPassword(password);
    if (!pwValidation.valid) {
      setError(
        pwValidation.message ||
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
      );
      return;
    }

    setIsSendingVerification(true);
    try {
      // 1. Validate password rule on the server
      const pwServerResp = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({ password })
      });
      const pwServerData = await pwServerResp.json().catch(() => ({}));
      if (!pwServerResp.ok || !pwServerData?.valid) {
        setError(
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
        );
        return;
      }

      const alreadySignedInSameUnverified = Boolean(
        auth.currentUser &&
          auth.currentUser.email?.toLowerCase() === cleanEmail &&
          !auth.currentUser.emailVerified
      );

      // 2. Check if email already belongs to a completed/verified account on the server
      if (!alreadySignedInSameUnverified) {
        try {
          const checkResp = await fetch('/api/auth/check-email-availability', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WaveLink-Device-Id': getClientDeviceId()
            },
            body: JSON.stringify({ email: cleanEmail })
          });
          const checkData = await checkResp.json().catch(() => ({}));
          if (checkData?.exists) {
            setExistingAccountDetected(true);
            setError('This email already has an account');
            return;
          }
        } catch {
          // continue
        }
      }

      // 2B. Check 60-second resend cooldown on the server
      const cooldownResp = await fetch('/api/auth/check-verification-cooldown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({
          channel: 'email',
          email: cleanEmail,
          password
        })
      });
      const cooldownData = await cooldownResp.json().catch(() => ({}));
      if (!cooldownResp.ok || !cooldownData?.success) {
        if (
          typeof cooldownData?.cooldownRemainingSeconds === 'number' &&
          cooldownData.cooldownRemainingSeconds > 0
        ) {
          setResendCooldownSeconds(cooldownData.cooldownRemainingSeconds);
        }
        setError(cooldownData?.error || 'Please wait before resending the verification link.');
        return;
      }

      // 3. Keep user on AuthPage until emailVerified is true and sign-up finishes
      try {
        sessionStorage.setItem('wavelink_signup_verification_pending', 'true');
      } catch {
        // ignore
      }

      // 4. Create or reuse the user's Firebase Auth account
      let targetUser = auth.currentUser;
      if (!targetUser || targetUser.email?.toLowerCase() !== cleanEmail) {
        if (targetUser) {
          await fbSignOut(auth).catch(() => {});
        }
        try {
          const createRes = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          targetUser = createRes.user;
        } catch (authErr: any) {
          if (authErr?.code === 'auth/email-already-in-use') {
            // Attempt sign-in with the supplied password to resume an incomplete/unverified sign-up
            try {
              const resumeRes = await signInWithEmailAndPassword(auth, cleanEmail, password);
              if (!resumeRes.user.emailVerified) {
                targetUser = resumeRes.user;
              } else {
                setExistingAccountDetected(true);
                setError('This email already has an account');
                return;
              }
            } catch {
              setExistingAccountDetected(true);
              setError('This email already has an account');
              return;
            }
          } else if (isAuthNetworkError(authErr)) {
            await new Promise((r) => setTimeout(r, 600));
            const retryRes = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            targetUser = retryRes.user;
          } else {
            throw authErr;
          }
        }
      }

      if (!targetUser) {
        setError('Could not initialize your account for email verification. Please try again.');
        return;
      }

      if (displayName.trim()) {
        await fbUpdateProfile(targetUser, { displayName: displayName.trim() }).catch(() => {});
      }

      // 5. Check if already verified upon reload() and confirm with server
      await targetUser.reload();
      if (targetUser.emailVerified) {
        const idToken = await targetUser.getIdToken(true).catch(() => '');
        if (idToken) {
          const verifyResp = await fetch('/api/auth/verify-email-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WaveLink-Device-Id': getClientDeviceId(),
              Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({ email: cleanEmail })
          });
          const verifyData = await verifyResp.json().catch(() => ({}));
          if (verifyResp.ok && verifyData?.verified && verifyData?.emailVerified) {
            if (verifyData.existingAccount) {
              setExistingAccountDetected(true);
              setError('This email already has an account');
              return;
            }
            setIsEmailVerified(true);
            setVerificationLinkSent(true);
            setVerificationNotice(null);
            setVerificationErrorCode(null);
            setStatusMessage('Email verified');
            return;
          }
        }
      }

      // 6. Send Firebase Authentication's built-in email verification link
      await sendEmailVerification(targetUser);

      setVerificationLinkSent(true);
      setIsEmailVerified(false);
      setVerificationErrorCode(null);
      setResendCooldownSeconds(
        typeof cooldownData?.cooldownSeconds === 'number' ? cooldownData.cooldownSeconds : 60
      );
      const sentMsg = 'Verification link sent. Check your inbox and spam folder.';
      setVerificationNotice(sentMsg);
      setStatusMessage(sentMsg);
    } catch (err: any) {
      await logFailureOnServerOnly('send_email_verification', err);
      const formatted = formatEmailVerificationError(err);
      setError(formatted.message);
      setVerificationErrorCode(formatted.code || extractSafeFirebaseAuthCode(err));
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleStartExistingAccountLink = (prefillEmail?: string) => {
    if (prefillEmail) {
      setEmailInput(prefillEmail);
    }
    setAuthMode('existing');
    setError(null);
    setExistingAccountDetected(false);
    setStatusMessage(
      'Verify your existing account once with Google or an email link to set your username and password.'
    );
  };

  /**
   * "I already have an account" — Step 1A: Verify existing account once through Google
   * Signs into the user's EXISTING Google-linked Firebase account (preserving UID and all data)
   * and transitions to Step 2 (choose username and password).
   */
  const handleVerifyExistingWithGoogle = async () => {
    if (isVerifyingExisting || isLoading) return;
    setError(null);
    setStatusMessage(null);
    setVerificationErrorCode(null);
    setIsVerifyingExisting(true);

    try {
      sessionStorage.setItem('wavelink_existing_account_setup_pending', 'true');
    } catch {
      // ignore
    }

    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, googleProvider);
      const existingUser = res.user;
      await loadExistingAccountProfileIntoForm(
        existingUser.uid,
        existingUser.email || '',
        existingUser.displayName
      );
      setStatusMessage(
        'Google account verified! Choose your username and password below to keep all your posts, followers, points, and Pro status.'
      );
    } catch (err) {
      if ((err as { code?: string })?.code === 'auth/multi-factor-auth-required') {
        handleMultiFactorRequiredError(err, { type: 'existing' });
        return;
      }
      const friendly = getFriendlyAuthErrorMessage(err, 'google');
      if (friendly) {
        await logFailureOnServerOnly('existing_account_google_verify', err);
        setError(friendly);
      }
    } finally {
      setIsVerifyingExisting(false);
    }
  };

  /**
   * "I already have an account" — Step 1B: Verify existing account once through an Email Link
   */
  const handleVerifyExistingWithEmailLink = async () => {
    if (isVerifyingExisting || resendCooldownSeconds > 0) return;
    setError(null);
    setStatusMessage(null);
    setVerificationErrorCode(null);

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter the email address of your existing WaveLink account.');
      return;
    }

    setIsVerifyingExisting(true);
    try {
      sessionStorage.setItem('wavelink_existing_account_setup_pending', 'true');
      window.localStorage.setItem(EXISTING_ACCOUNT_EMAIL_STORAGE_KEY, cleanEmail);
    } catch {
      // ignore
    }

    try {
      // If user already completed email link sign-in on this page URL, finish verification immediately
      if (typeof window !== 'undefined' && isSignInWithEmailLink(auth, window.location.href)) {
        const res = await signInWithEmailLink(auth, cleanEmail, window.location.href);
        window.localStorage.removeItem(EXISTING_ACCOUNT_EMAIL_STORAGE_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
        await loadExistingAccountProfileIntoForm(
          res.user.uid,
          res.user.email || cleanEmail,
          res.user.displayName
        );
        setStatusMessage(
          'Email link verified! Choose your username and password below to keep all your existing data.'
        );
        return;
      }

      // Send Firebase sign-in email link to the existing user's email
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true
      };
      await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
      setExistingEmailLinkSent(true);
      setResendCooldownSeconds(60);
      setStatusMessage('Verification link sent. Check your inbox and spam folder.');
    } catch (err: any) {
      await logFailureOnServerOnly('existing_account_send_email_link', err);
      // Fallback: if activeUser matches cleanEmail, send standard Firebase email verification link
      const activeUser = auth.currentUser;
      if (activeUser && activeUser.email?.toLowerCase() === cleanEmail) {
        try {
          await sendEmailVerification(activeUser);
          setExistingEmailLinkSent(true);
          setResendCooldownSeconds(60);
          setStatusMessage('Verification link sent. Check your inbox and spam folder.');
          return;
        } catch (innerErr) {
          await logFailureOnServerOnly('existing_account_fallback_email_verify', innerErr);
        }
      }
      const code = extractSafeFirebaseAuthCode(err);
      setVerificationErrorCode(code);
      setError(getFriendlyAuthErrorMessage(err) || GENERIC_USER_AUTH_ERROR);
    } finally {
      setIsVerifyingExisting(false);
    }
  };

  /**
   * "I already have an account" — Step 2: Save chosen username & password onto the EXISTING UID
   * Preserves all existing posts, followers, points, and Pro status on that account.
   */
  const handleCompleteExistingAccountSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeUser = auth.currentUser;
    if (!activeUser || !existingVerifiedUid || activeUser.uid !== existingVerifiedUid) {
      setError('Please verify your existing account with Google or an email link first.');
      return;
    }

    const rawUsername = usernameInput.trim();
    if (!rawUsername) {
      setError('Please choose a username for your account.');
      return;
    }

    const identityMod = checkTextModerationLocal(`${rawUsername} ${displayName.trim()}`);
    if (identityMod.flagged) {
      setError(identityMod.friendlyMessage);
      return;
    }

    const pwValidation = validateStrongPassword(password);
    if (!pwValidation.valid) {
      setError(
        pwValidation.message ||
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
      );
      return;
    }

    setError(null);
    setIsLoading(true);
    setStatusMessage('Saving your username & password to your existing account...');

    try {
      // 1. Validate password rule on the server
      const pwServerResp = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({ password })
      });
      const pwServerData = await pwServerResp.json().catch(() => ({}));
      if (!pwServerResp.ok || !pwServerData?.valid) {
        setError(
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
        );
        setStatusMessage(null);
        setIsLoading(false);
        return;
      }

      const targetEmail = (activeUser.email || existingVerifiedEmail || emailInput).trim().toLowerCase();
      const cleanHandle =
        rawUsername.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'waver';
      const formattedUsername = `@${cleanHandle}`;
      const name = displayName.trim() || activeUser.displayName || cleanHandle;

      // 2. Link Email & Password credential directly to the EXISTING Firebase Auth UID (never creates a new account)
      const hasPasswordProvider = activeUser.providerData.some((p) => p.providerId === 'password');
      if (hasPasswordProvider) {
        await updatePassword(activeUser, password);
      } else {
        try {
          const cred = EmailAuthProvider.credential(targetEmail, password);
          await linkWithCredential(activeUser, cred);
        } catch (linkErr: any) {
          if (linkErr?.code === 'auth/provider-already-linked') {
            await updatePassword(activeUser, password);
          } else {
            throw linkErr;
          }
        }
      }

      await fbUpdateProfile(activeUser, { displayName: name }).catch(() => {});
      const idToken = await activeUser.getIdToken(true);

      // 3. Register username -> email mapping on the server for this existing UID (with isLinkingExisting: true)
      const regResp = await fetch('/api/auth/register-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId(),
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          uid: activeUser.uid,
          username: cleanHandle,
          displayName: name,
          authEmail: targetEmail,
          channel: 'email',
          password,
          isLinkingExisting: true
        })
      });
      const regData = await regResp.json().catch(() => ({}));
      if (!regResp.ok || !regData?.success) {
        await logFailureOnServerOnly(
          'existing_account_register_username',
          regData?.error || 'Server rejected username registration',
          activeUser.uid
        );
        setError(regData?.error || GENERIC_USER_AUTH_ERROR);
        setStatusMessage(null);
        setIsLoading(false);
        return;
      }

      // 4. Merge username, displayName, and Google/Auth photoURL into /users/{uid} so all existing posts, followers, points, and Pro status remain intact
      const setupPhotoUrl = getBestAuthUserPhotoUrl(activeUser, null);
      await setDoc(
        doc(db, 'users', activeUser.uid),
        cleanFirestoreData({
          id: activeUser.uid,
          email: targetEmail,
          username: formattedUsername,
          displayName: name,
          ...(isRealUserPhotoUrl(setupPhotoUrl) ? { photoURL: setupPhotoUrl } : {}),
          updatedAt: new Date().toISOString()
        }),
        { merge: true }
      ).catch(() => {});

      await completeVerifiedAuthSession(name, formattedUsername);
      setStatusMessage('Account updated! Signing you in with all your existing data...');
    } catch (err) {
      await logFailureOnServerOnly('existing_account_setup_complete', err, activeUser?.uid);
      setError(getFriendlyAuthErrorMessage(err) || GENERIC_USER_AUTH_ERROR);
      setStatusMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Normal User Sign-In & Sign-Up Form Handler (Username & Password + Firebase Built-In Email Verification)
   * Enforces 8–24 character password with at least 1 letter and 1 number on both frontend and server.
   * Does not let anyone complete sign-up with an unverified email (enforced on frontend, server, and Firestore rules).
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawUsername = usernameInput.trim();
    if (!rawUsername) {
      setError('Please enter your username.');
      return;
    }

    // 1. Frontend password rule check (8–24 chars, at least 1 letter and 1 number)
    const pwValidation = validateStrongPassword(password);
    if (!pwValidation.valid) {
      setError(
        pwValidation.message ||
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
      );
      return;
    }

    setError(null);
    setIsLoading(true);

    // 2. Server-side password rule check
    try {
      const pwServerResp = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId()
        },
        body: JSON.stringify({ password })
      });
      const pwServerData = await pwServerResp.json().catch(() => ({}));
      if (!pwServerResp.ok || !pwServerData?.valid) {
        setError(
          'Please choose a password with eight to twenty-four characters, including a letter and a number.'
        );
        setIsLoading(false);
        return;
      }
    } catch {
      // fallback to frontend check if offline
    }

    if (authMode === 'signup') {
      const cleanEmail = emailInput.trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setError('Please enter a valid email address for verification.');
        setIsLoading(false);
        return;
      }

      // Reload the Firebase Auth user and force-refresh the ID token before calling the sign-up endpoint
      const activeUser = auth.currentUser;
      if (!activeUser) {
        setError('Please verify your email address before completing sign-up.');
        setIsLoading(false);
        return;
      }

      await activeUser.reload();
      const idToken = await activeUser.getIdToken(true);

      const verifiedNow = await checkFirebaseEmailVerified();

      if (
        !verifiedNow ||
        !isEmailVerified ||
        !activeUser.emailVerified ||
        activeUser.email?.toLowerCase() !== cleanEmail
      ) {
        setIsEmailVerified(false);
        setError(
          'Email verification is required on the server before completing sign-up. Please tap Verify, open the link in your email, and return to WaveLink.'
        );
        setIsLoading(false);
        return;
      }

      const ageRecord = deriveMinimalAgeRecord(birthDate);
      if (!ageRecord.valid) {
        setError(ageRecord.reason || 'Please enter your date of birth to continue.');
        setIsLoading(false);
        return;
      }
      if (!ageRecord.allowed) {
        setError(
          ageRecord.reason ||
            `You must be at least ${MIN_SIGNUP_AGE} years old to join WaveLink.`
        );
        setIsLoading(false);
        return;
      }

      if (!isAgeConfirmed) {
        setError('Please accept WaveLink Community Guidelines, Terms of Service, and Privacy Policy before creating your account.');
        setIsLoading(false);
        return;
      }

      const signupIdentityMod = checkTextModerationLocal(`${rawUsername} ${displayName.trim()}`);
      if (signupIdentityMod.flagged) {
        setError(signupIdentityMod.friendlyMessage);
        setIsLoading(false);
        return;
      }

      const cleanHandle =
        rawUsername.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'waver';
      const formattedUsername = `@${cleanHandle}`;
      const name = displayName.trim() || rawUsername.replace(/^@/, '');

      setStatusMessage('Completing your verified WaveLink account...');

      try {
        await fbUpdateProfile(activeUser, { displayName: name }).catch(() => {});

        // Server authoritatively verifies the ID token with Firebase Admin SDK and checks email_verified directly in Firebase Auth
        const regResp = await fetch('/api/auth/register-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WaveLink-Device-Id': getClientDeviceId(),
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            uid: activeUser.uid,
            username: cleanHandle,
            displayName: name,
            authEmail: cleanEmail,
            channel: 'email',
            password
          })
        });
        const regData = await regResp.json().catch(() => ({}));
        if (!regResp.ok || !regData?.success) {
          await logFailureOnServerOnly(
            'signup_register_username',
            regData?.error || 'Server rejected signup',
            activeUser.uid
          );
          if (regData?.existingAccount || regResp.status === 409) {
            setExistingAccountDetected(true);
            setError('This email already has an account');
          } else {
            setError(
              regData?.error ||
                'Email verification is required on the server before completing sign-up.'
            );
          }
          setStatusMessage(null);
          setIsLoading(false);
          return;
        }

        // Write Firestore profile document (enforced by Firestore rules requiring request.auth.token.email_verified == true)
        // Data minimization: store only birthYear, birthMonth, turns18At, and isUnder18 (never expose raw birthday publicly)
        const signupPhotoUrl = getBestAuthUserPhotoUrl(activeUser, null);
        const acceptedIso = new Date().toISOString();
        const isTeenSignup = ageRecord.isTeen;
        await setDoc(
          doc(db, 'users', activeUser.uid),
          cleanFirestoreData({
            id: activeUser.uid,
            email: cleanEmail,
            username: formattedUsername,
            displayName: name,
            ...(isRealUserPhotoUrl(signupPhotoUrl) ? { photoURL: signupPhotoUrl } : {}),
            isUnder18: isTeenSignup,
            birthYear: ageRecord.birthYear,
            birthMonth: ageRecord.birthMonth,
            turns18At: ageRecord.turns18At,
            parentalStatus: isTeenSignup ? 'unverified_teen' : 'none',
            sensitiveContentFilter: true,
            guidelinesAcceptedAt: acceptedIso,
            guidelinesVersion: '2026-v2',
            termsAgreement: {
              accepted: true,
              acceptedAt: acceptedIso,
              termsVersion: '2026-v2',
              marketingOptIn: false,
              communityCodeAccepted: true
            },
            ...(isTeenSignup
              ? {
                  privacySettings: {
                    whoCanSeePosts: 'followers',
                    whoCanMessageMe: 'followers',
                    whoCanCallMe: 'nobody',
                    showOnlineStatus: false,
                    showLastSeen: false,
                    onlineVisibility: 'nobody',
                    isTeenAccount: true,
                    hideAdultMedia: true,
                    updatedAt: acceptedIso
                  }
                }
              : {}),
            updatedAt: acceptedIso
          }),
          { merge: true }
        );

        await completeVerifiedAuthSession(name, formattedUsername);
        setStatusMessage('Welcome to WaveLink! Opening your feed...');
      } catch (err: any) {
        await logFailureOnServerOnly('signup_complete', err);
        setError(GENERIC_USER_AUTH_ERROR);
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    } else {
      // ==========================================
      // SIGN IN: Username (or Email) & Password
      // ==========================================
      setStatusMessage('Signing in to your WaveLink account...');

      try {
        const resolvedEmail = await resolveAuthEmailFromIdentifier(rawUsername);
        if (!resolvedEmail) {
          setError('Username not found. Please sign in using your email address instead.');
          setStatusMessage(null);
          setIsLoading(false);
          return;
        }

        // 1. Check server-side temporary lockout (15-min lockout after 5 failed attempts)
        try {
          const lockCheckResp = await fetch('/api/auth/check-lockout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WaveLink-Device-Id': getClientDeviceId()
            },
            body: JSON.stringify({ email: resolvedEmail })
          });
          const lockCheckData = await lockCheckResp.json().catch(() => ({}));
          if (lockCheckData?.locked) {
            setLockedAccountEmail(resolvedEmail);
            setLockoutSecondsLeft(lockCheckData.remainingSeconds || 900);
            setError(
              lockCheckData.message ||
                'Account temporarily locked after repeated failed login attempts. Unlock below with an email verification code.'
            );
            setStatusMessage(null);
            setIsLoading(false);
            return;
          }
        } catch {
          // continue if offline
        }

        let signInRes;
        try {
          signInRes = await signInWithEmailAndPassword(auth, resolvedEmail, password);
        } catch (initialErr: any) {
          if (initialErr?.code === 'auth/multi-factor-auth-required') {
            handleMultiFactorRequiredError(initialErr, { type: 'signin' });
            setIsLoading(false);
            return;
          }
          if (isAuthNetworkError(initialErr)) {
            await new Promise((r) => setTimeout(r, 600));
            try {
              signInRes = await signInWithEmailAndPassword(auth, resolvedEmail, password);
            } catch (retryErr: any) {
              if (retryErr?.code === 'auth/multi-factor-auth-required') {
                handleMultiFactorRequiredError(retryErr, { type: 'signin' });
                setIsLoading(false);
                return;
              }
              throw retryErr;
            }
          } else {
            // Record failed login attempt on server (never triggered for MFA challenge)
            try {
              const failResp = await fetch('/api/auth/record-failed-login', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-WaveLink-Device-Id': getClientDeviceId()
                },
                body: JSON.stringify({ email: resolvedEmail })
              });
              const failData = await failResp.json().catch(() => ({}));
              if (failData?.locked) {
                setLockedAccountEmail(resolvedEmail);
                setLockoutSecondsLeft(failData.remainingSeconds || 900);
                setError(
                  'Your account is locked for a short time after repeated failed sign-in tries. You can unlock it below by email.'
                );
                setStatusMessage(null);
                setIsLoading(false);
                return;
              }
            } catch {
              // ignore
            }
            throw initialErr;
          }
        }

        // Clear failed login counter on successful sign-in (authenticated)
        setLockedAccountEmail(null);
        setLockoutSecondsLeft(0);
        clearClientFailedLogins();
        signInRes.user
          .getIdToken()
          .then((token) =>
            fetch('/api/auth/clear-failed-login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-WaveLink-Device-Id': getClientDeviceId()
              },
              body: JSON.stringify({ email: resolvedEmail })
            })
          )
          .catch(() => {});

        await signInRes.user.reload();
        const hasGoogleProvider = signInRes.user.providerData.some(
          (p) => p.providerId === 'google.com'
        );
        if (!signInRes.user.emailVerified && !hasGoogleProvider) {
          try {
            sessionStorage.setItem('wavelink_signup_verification_pending', 'true');
          } catch {
            // ignore
          }
          setAuthMode('signup');
          setEmailInput(signInRes.user.email || resolvedEmail);
          setIsEmailVerified(false);
          setVerificationLinkSent(true);
          try {
            await sendEmailVerification(signInRes.user);
            setResendCooldownSeconds(60);
            setVerificationNotice('Verification link sent. Open it in your inbox, then tap "I\'ve verified".');
            setStatusMessage('Verification link sent. Check your inbox and spam folder.');
          } catch {
            setVerificationNotice('Tap "Send verification link" or confirm after verifying your email.');
            setStatusMessage(null);
          }
          setError(
            'Your email address is not verified yet. Please verify your email using the link sent to your inbox, then tap "I\'ve verified".'
          );
          return;
        }

        await completeVerifiedAuthSession();
        setStatusMessage('Welcome back! Logging you in...');
      } catch (err: any) {
        await logFailureOnServerOnly('signin_username_password', err);
        setError(getFriendlyAuthErrorMessage(err) || GENERIC_USER_AUTH_ERROR);
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Account Lockout Countdown & Self-Service Email Verification Unlock state
  const [lockedAccountEmail, setLockedAccountEmail] = useState<string | null>(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
  const [unlockCodeSent, setUnlockCodeSent] = useState(false);
  const [unlockCodeInput, setUnlockCodeInput] = useState('');
  const [unlockPreviewCode, setUnlockPreviewCode] = useState<string | null>(null);
  const [isSendingUnlock, setIsSendingUnlock] = useState(false);

  useEffect(() => {
    if (lockoutSecondsLeft <= 0) return;
    const t = setInterval(() => {
      setLockoutSecondsLeft((prev) => {
        if (prev <= 1) {
          setLockedAccountEmail(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutSecondsLeft]);

  const handleRequestLockoutUnlockCode = async () => {
    const rawTarget = (lockedAccountEmail || emailInput || usernameInput).trim();
    if (!rawTarget) return;
    setIsSendingUnlock(true);
    try {
      const resolvedEmail = await resolveAuthEmailFromIdentifier(rawTarget);
      const targetEmail = resolvedEmail || rawTarget;
      const resp = await fetch('/api/auth/request-unlock-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, identifier: rawTarget })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        setUnlockCodeSent(true);
        const hint = data.previewFallbackCode || data.demoCodeHint;
        if (hint) setUnlockPreviewCode(String(hint));
        setStatusMessage(data.message || `6-digit unlock code sent to ${targetEmail}.`);
      } else {
        setError(data.error || 'Could not send unlock verification code.');
      }
    } catch {
      setError('Could not request unlock verification code.');
    } finally {
      setIsSendingUnlock(false);
    }
  };

  const handleVerifyLockoutUnlockCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTarget = (lockedAccountEmail || emailInput || usernameInput).trim();
    if (!rawTarget || !unlockCodeInput.trim()) return;
    setIsSendingUnlock(true);
    try {
      const resolvedEmail = await resolveAuthEmailFromIdentifier(rawTarget);
      const targetEmail = resolvedEmail || rawTarget;
      const resp = await fetch('/api/auth/verify-unlock-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, identifier: rawTarget, code: unlockCodeInput.trim() })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        clearClientFailedLogins();
        setLockedAccountEmail(null);
        setLockoutSecondsLeft(0);
        setUnlockCodeSent(false);
        setUnlockCodeInput('');
        setUnlockPreviewCode(null);
        setError(null);
        setStatusMessage('Account unlocked! You may now sign in.');
      } else {
        setError(data.error || 'Invalid or expired unlock code.');
      }
    } catch {
      setError('Could not verify unlock code.');
    } finally {
      setIsSendingUnlock(false);
    }
  };

  const handleForgotPasswordReset = async () => {
    if (isSendingPasswordReset) return;
    const rawTarget = (emailInput || usernameInput).trim();
    if (!rawTarget) {
      setError('Please enter your email address or username first.');
      return;
    }
    setError(null);
    setStatusMessage(null);
    setIsSendingPasswordReset(true);
    try {
      const resolvedEmail = await resolveAuthEmailFromIdentifier(rawTarget);
      if (!resolvedEmail || !resolvedEmail.includes('@')) {
        setError('Please enter your email address to receive a password reset link.');
        return;
      }
      await sendPasswordReset(resolvedEmail);
      setStatusMessage(`Password reset link sent to ${resolvedEmail}. Check your inbox and spam folder.`);
    } catch (err) {
      setError(getFriendlyAuthErrorMessage(err) || 'Could not send password reset email right now.');
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const [authStep, setAuthStep] = useState<'landing' | 'email' | 'password'>('landing');
  const [isStepTransitioning, setIsStepTransitioning] = useState(false);
  const [activeLegalNotice, setActiveLegalNotice] = useState<LegalDocType | null>(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const legalParam = params.get('legal');
    if (path === '/guidelines' || legalParam === 'guidelines') return 'guidelines';
    if (path === '/privacy' || legalParam === 'privacy') return 'privacy';
    if (path === '/terms' || legalParam === 'terms') return 'terms';
    if (legalParam === 'security') return 'security';
    if (legalParam === 'refund') return 'refund';
    return null;
  });
  const [isAgeConfirmed, setIsAgeConfirmed] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const signupAgeEval = birthDate ? deriveMinimalAgeRecord(birthDate) : null;
  const stepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailFieldRef = useRef<HTMLInputElement | null>(null);
  const passwordFieldRef = useRef<HTMLInputElement | null>(null);

  const transitionToStep = useCallback((nextStep: 'landing' | 'email' | 'password') => {
    setError(null);
    setStatusMessage(null);
    setVerificationErrorCode(null);
    if (stepTimeoutRef.current) {
      clearTimeout(stepTimeoutRef.current);
    }
    setIsStepTransitioning(true);
    stepTimeoutRef.current = setTimeout(() => {
      setAuthStep(nextStep);
      requestAnimationFrame(() => {
        setIsStepTransitioning(false);
        if (nextStep === 'email') {
          setTimeout(() => emailFieldRef.current?.focus(), 60);
        } else if (nextStep === 'password') {
          setTimeout(() => passwordFieldRef.current?.focus(), 60);
        }
      });
    }, 170);
  }, []);

  useEffect(() => {
    return () => {
      if (stepTimeoutRef.current) {
        clearTimeout(stepTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Direct Google Sign-In from the circular Google provider button on the minimalist landing screen
   */
  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setError(null);
    setStatusMessage(null);
    setIsLoading(true);

    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, googleProvider);
      const fbUser = res.user;

      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef).catch(() => null);
      const existingData = userSnap && userSnap.exists() ? userSnap.data() : null;

      const cleanEmail = (fbUser.email || '').trim().toLowerCase();
      const fallbackHandle =
        (cleanEmail.split('@')[0] || 'waver').replace(/[^a-z0-9_.-]/g, '') || 'waver';
      const resolvedUsername =
        existingData?.username || `@${fallbackHandle}`;
      const resolvedDisplayName =
        existingData?.displayName || fbUser.displayName || fallbackHandle;
      const isOwnerAccount =
        cleanEmail === 'keylanmbilinyi5@gmail.com' && Boolean(fbUser.emailVerified);

      const resolvedPhotoUrl = getBestAuthUserPhotoUrl(fbUser, existingData);

      await setDoc(
        userRef,
        cleanFirestoreData({
          id: fbUser.uid,
          email: cleanEmail,
          username: resolvedUsername,
          displayName: resolvedDisplayName,
          photoURL: resolvedPhotoUrl,
          avatar: resolvedPhotoUrl,
          ...(isOwnerAccount ? { role: 'admin', isOwner: true } : {}),
          updatedAt: new Date().toISOString()
        }),
        { merge: true }
      ).catch(() => {});

      await completeVerifiedAuthSession(resolvedDisplayName, resolvedUsername);
      if (isOwnerAccount) {
        await refreshAdminVerification().catch(() => {});
      }
    } catch (err) {
      if ((err as { code?: string })?.code === 'auth/multi-factor-auth-required') {
        handleMultiFactorRequiredError(err, { type: 'google' });
        return;
      }
      const friendly = getFriendlyAuthErrorMessage(err, 'google');
      if (friendly) {
        await logFailureOnServerOnly('google_direct_signin', err);
        setError(friendly);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // FIREBASE TOTP MULTI-FACTOR CHALLENGE HANDLERS
  // =========================================================================
  function handleMultiFactorRequiredError(
    err: unknown,
    context: { type: 'signin' | 'google' | 'existing' | 'owner'; ownerAccessCode?: string }
  ) {
    try {
      const resolver = getMultiFactorResolver(auth, err as MultiFactorError);
      setMfaResolver(resolver);
      setMfaHints(resolver.hints || []);
      setMfaDigits(['', '', '', '', '', '']);
      setMfaError(null);
      setShowLostAuthHelp(false);
      setMfaFlowContext(context);
      setError(null);
      setStatusMessage(null);
      setOwnerError(null);
      setTimeout(() => mfaOtpRefs.current[0]?.focus(), 80);
    } catch (resolverErr) {
      setError(formatFirebaseMfaError(resolverErr));
    }
  }

  const handleMfaDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const next = ['', '', '', '', '', ''];
      for (let i = 0; i < Math.min(6, cleaned.length); i++) {
        next[i] = cleaned[i];
      }
      setMfaDigits(next);
      mfaOtpRefs.current[Math.min(5, cleaned.length - 1)]?.focus();
      return;
    }
    const next = [...mfaDigits];
    next[index] = cleaned;
    setMfaDigits(next);
    if (cleaned && index < 5) {
      mfaOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleMfaDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !mfaDigits[index] && index > 0) {
      mfaOtpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      mfaOtpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      mfaOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleMfaDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setMfaDigits(next);
    mfaOtpRefs.current[Math.min(5, Math.max(0, pasted.length - 1))]?.focus();
  };

  const handleCancelMfaChallenge = () => {
    try {
      sessionStorage.removeItem('wavelink_owner_flow_pending');
    } catch {
      // ignore
    }
    setMfaResolver(null);
    setMfaHints([]);
    setMfaDigits(['', '', '', '', '', '']);
    setMfaError(null);
    setShowLostAuthHelp(false);
    setMfaFlowContext(null);
  };

  const handleVerifyMfaSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || isVerifyingMfa) return;
    const code = mfaDigits.join('').trim();
    if (!/^\d{6}$/.test(code)) {
      setMfaError('Please enter all six digits from your authenticator app.');
      return;
    }

    const totpHint =
      mfaHints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfaHints[0];
    if (!totpHint) {
      setMfaError('We could not find an authenticator app on this sign-in session. Please go back and sign in again.');
      return;
    }

    setMfaError(null);
    setIsVerifyingMfa(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, code);
      const userCredential = await mfaResolver.resolveSignIn(assertion);
      const fbUser = userCredential.user;
      const flow = mfaFlowContext;

      if (flow?.type === 'existing') {
        await loadExistingAccountProfileIntoForm(
          fbUser.uid,
          fbUser.email || '',
          fbUser.displayName
        );
        setMfaResolver(null);
        setMfaFlowContext(null);
        setAuthMode('existing');
        setStatusMessage(
          '2-step verification complete! Choose your username and password below to keep all your existing data.'
        );
        return;
      }

      if (flow?.type === 'owner' && flow.ownerAccessCode) {
        const freshToken = await fbUser.getIdToken(true);
        const resp = await fetch('/api/auth/owner-signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WaveLink-Device-Id': getClientDeviceId(),
            Authorization: `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            accessCode: flow.ownerAccessCode,
            idToken: freshToken,
            deviceId: getClientDeviceId()
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.success || !data?.authorized) {
          try {
            sessionStorage.removeItem('wavelink_owner_flow_pending');
            sessionStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
            localStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
          } catch {
            // ignore
          }
          await fbSignOut(auth).catch(() => {});
          setMfaResolver(null);
          setMfaFlowContext(null);
          setError(data?.error || GENERIC_OWNER_ERROR);
          return;
        }
        try {
          if (data.ownerSessionToken) {
            sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken);
            localStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
          }
          sessionStorage.removeItem('wavelink_owner_flow_pending');
        } catch {
          // ignore
        }
        await fbUser.getIdToken(true).catch(() => {});
        await fbUser.getIdTokenResult(true).catch(() => {});
        await completeVerifiedAuthSession('Keylan', '@keylan');
        await refreshAdminVerification();
        setMfaResolver(null);
        setMfaFlowContext(null);
        return;
      }

      // Google or Email/Password sign-in completion
      const cleanEmail = (fbUser.email || '').trim().toLowerCase();
      if (flow?.type === 'google') {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef).catch(() => null);
        const existingData = userSnap && userSnap.exists() ? userSnap.data() : null;
        const fallbackHandle =
          (cleanEmail.split('@')[0] || 'waver').replace(/[^a-z0-9_.-]/g, '') || 'waver';
        const resolvedUsername = existingData?.username || `@${fallbackHandle}`;
        const resolvedDisplayName =
          existingData?.displayName || fbUser.displayName || fallbackHandle;
        const isOwnerAccount =
          cleanEmail === 'keylanmbilinyi5@gmail.com' && Boolean(fbUser.emailVerified);
        const resolvedPhotoUrl = getBestAuthUserPhotoUrl(fbUser, existingData);

        await setDoc(
          userRef,
          cleanFirestoreData({
            id: fbUser.uid,
            email: cleanEmail,
            username: resolvedUsername,
            displayName: resolvedDisplayName,
            photoURL: resolvedPhotoUrl,
            avatar: resolvedPhotoUrl,
            ...(isOwnerAccount ? { role: 'admin', isOwner: true } : {}),
            updatedAt: new Date().toISOString()
          }),
          { merge: true }
        ).catch(() => {});

        await completeVerifiedAuthSession(resolvedDisplayName, resolvedUsername);
        if (isOwnerAccount) {
          await refreshAdminVerification().catch(() => {});
        }
      } else {
        await completeVerifiedAuthSession();
        if (cleanEmail === 'keylanmbilinyi5@gmail.com' && Boolean(fbUser.emailVerified)) {
          await refreshAdminVerification().catch(() => {});
        }
      }

      setMfaResolver(null);
      setMfaFlowContext(null);
      setStatusMessage('Welcome back! Logging you in...');
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  /**
   * Step 2 -> Step 3 handler: Validates email (or username/email) before fading to the password step
   */
  const handleEmailStepContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (authMode === 'signup') {
      const cleanEmail = emailInput.trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setError('Please enter a valid email address to continue.');
        return;
      }
      if (!usernameInput.trim()) {
        const suggested = cleanEmail.split('@')[0].replace(/[^a-z0-9_.-]/g, '');
        if (suggested) setUsernameInput(suggested);
      }
      transitionToStep('password');
      return;
    }

    const identifier = (emailInput || usernameInput).trim();
    if (!identifier) {
      setError('Please enter your email address or username to continue.');
      return;
    }
    setUsernameInput(identifier);
    if (identifier.includes('@') && !identifier.startsWith('@')) {
      setEmailInput(identifier.toLowerCase());
    }
    transitionToStep('password');
  };

  /**
   * Hidden Owner Sign-In Handler:
   * 1. Requires Owner Access Code input
   * 2. Signs into the owner's EXISTING Google-linked Firebase account (same UID as before; never creates a new account)
   * 3. Sends Google ID token + Owner Access Code to server (/api/auth/owner-signin)
   * 4. Server verifies email === process.env.OWNER_EMAIL and code === process.env.OWNER_ACCESS_CODE
   *    using constant-time comparison, grants the 'admin' role to that existing UID, and logs any failure reason on the server only.
   * 5. Client refreshes session token immediately so admin privileges and all existing posts, followers, points, and Pro status apply right away.
   */
  const handleOwnerSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ownerLockedOut || isOwnerSubmitting) return;

    const trimmedCode = ownerAccessCode.trim();
    if (!trimmedCode) {
      setOwnerError(GENERIC_OWNER_ERROR);
      return;
    }

    setOwnerError(null);
    setIsOwnerSubmitting(true);

    // Hold AuthContext transition until server verification completes
    try {
      sessionStorage.setItem('wavelink_owner_flow_pending', 'true');
    } catch {
      // ignore
    }

    let idToken = '';
    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const popupRes = await signInWithPopup(auth, googleProvider);
      idToken = await popupRes.user.getIdToken(true);
    } catch (popupErr: any) {
      if (popupErr?.code === 'auth/multi-factor-auth-required') {
        setShowOwnerModal(false);
        setIsOwnerSubmitting(false);
        handleMultiFactorRequiredError(popupErr, {
          type: 'owner',
          ownerAccessCode: trimmedCode
        });
        return;
      }
      await logFailureOnServerOnly('owner_signin_google_popup', popupErr);
      // Still report attempt to server so device rate limit and server logging are enforced
      idToken = '';
    }

    try {
      const resp = await fetch('/api/auth/owner-signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WaveLink-Device-Id': getClientDeviceId(),
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          accessCode: trimmedCode,
          idToken,
          deviceId: getClientDeviceId()
        })
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.success || !data?.authorized) {
        try {
          sessionStorage.removeItem('wavelink_owner_flow_pending');
          sessionStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
          localStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
        await fbSignOut(auth).catch(() => {});

        if (resp.status === 429 || data?.lockedOut) {
          setOwnerLockedOut(true);
          setOwnerError(
            data?.error || 'Too many attempts from this device. Access is locked for 1 hour.'
          );
        } else {
          setOwnerError(GENERIC_OWNER_ERROR);
        }
        return;
      }

      // Server verified both OWNER_EMAIL and OWNER_ACCESS_CODE and granted admin role to the existing UID!
      try {
        if (data.ownerSessionToken) {
          sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken);
          localStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
        }
        sessionStorage.removeItem('wavelink_owner_flow_pending');
      } catch {
        // ignore
      }

      // Force client to refresh its Firebase ID token immediately so custom claims (role: 'admin') apply on the existing UID
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true).catch(() => {});
        await auth.currentUser.getIdTokenResult(true).catch(() => {});
      }
      await completeVerifiedAuthSession('Keylan', '@keylan');
      await refreshAdminVerification();
      setShowOwnerModal(false);
      setOwnerAccessCode('');
    } catch (networkErr) {
      await logFailureOnServerOnly('owner_signin_network', networkErr);
      try {
        sessionStorage.removeItem('wavelink_owner_flow_pending');
      } catch {
        // ignore
      }
      await fbSignOut(auth).catch(() => {});
      setOwnerError(GENERIC_OWNER_ERROR);
    } finally {
      setIsOwnerSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-white text-[#0F172A] flex flex-col justify-between items-center px-6 py-8 sm:py-12 overflow-x-hidden overflow-y-auto safe-area-top safe-area-bottom">
      {/* Top balanced spacer */}
      <div className="w-full max-w-[23.75rem] h-2" aria-hidden="true" />

      {/* Centered Authentication Content */}
      <main className="w-full max-w-[22.5rem] mx-auto my-auto flex flex-col items-center">
        {/* Centered Branding — Tapping the WaveLink Logo 5 times opens Hidden Owner Sign-In */}
        <div className="flex flex-col items-center text-center mb-8">
          <button
            type="button"
            onClick={handleLogoTap}
            aria-label="WaveLink"
            className="w-12 h-12 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center shadow-xs hover:bg-slate-800 active:scale-95 transition-all duration-200 mb-4 cursor-pointer focus:outline-none"
          >
            <Waves className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-2xl sm:text-[1.625rem] font-semibold tracking-tight text-[#0F172A]">
            {mfaResolver
              ? 'Enter your 6-digit code'
              : authMode === 'existing'
              ? 'Link your account'
              : authStep === 'landing'
              ? 'Welcome to WaveLink'
              : authStep === 'email'
              ? authMode === 'signup'
                ? 'Create your account'
                : 'Enter your email'
              : authMode === 'signup'
              ? 'Set your password'
              : 'Enter your password'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 font-normal leading-relaxed">
            {mfaResolver
              ? `Open your authenticator app (${
                  (mfaHints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfaHints[0])
                    ?.displayName || 'Authenticator app'
                }) and enter the current 6-digit code`
              : authMode === 'existing'
              ? 'Verify once to attach a username and password to your account'
              : authStep === 'landing'
              ? 'Sign in or create an account to continue'
              : authStep === 'email'
              ? authMode === 'signup'
                ? 'Enter the email address you want to use on WaveLink'
                : 'Use your email address or username to continue'
              : authMode === 'signup'
              ? 'Choose a strong password and verify your email'
              : 'Enter your password to sign in to WaveLink'}
          </p>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="w-full mb-5 px-4 py-3 rounded-2xl bg-rose-50/90 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2.5 transition-opacity duration-200">
            <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="block font-medium leading-relaxed flex-1 min-w-0">{error}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setVerificationErrorCode(null);
                  }}
                  className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Try again</span>
                </button>
              </div>
              {lockoutSecondsLeft > 0 && (
                <div className="p-2.5 rounded-xl bg-white border border-rose-200 text-[#0F172A] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span>Wait time left:</span>
                    <span className="font-mono text-rose-600">
                      {Math.floor(lockoutSecondsLeft / 60)}:
                      {String(lockoutSecondsLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  {!unlockCodeSent ? (
                    <button
                      type="button"
                      disabled={isSendingUnlock}
                      onClick={handleRequestLockoutUnlockCode}
                      className="w-full min-h-[2.75rem] py-2 px-3 rounded-xl bg-[#0F172A] text-white text-xs font-semibold cursor-pointer"
                    >
                      {isSendingUnlock ? 'Sending...' : 'Unlock by email'}
                    </button>
                  ) : (
                    <form onSubmit={handleVerifyLockoutUnlockCode} className="space-y-1.5">
                      {unlockPreviewCode && (
                        <p className="text-[10px] text-slate-600">
                          Code sent (Preview: <strong className="font-mono">{unlockPreviewCode}</strong>)
                        </p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={unlockCodeInput}
                          onChange={(e) => setUnlockCodeInput(e.target.value)}
                          placeholder="6-digit code"
                          className="flex-1 min-h-[2.75rem] px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                        />
                        <button
                          type="submit"
                          disabled={isSendingUnlock}
                          className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Unlock
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {statusMessage && !error && (
          <div className="w-full mb-5 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-2.5 transition-opacity duration-200">
            <CheckCircle2 size={15} className="text-slate-900 shrink-0" />
            <span className="font-medium leading-relaxed">{statusMessage}</span>
          </div>
        )}

        {/* Step Container with Smooth Fade Transitions */}
        <div
          className={`w-full transition-all duration-200 ease-out ${
            isStepTransitioning
              ? 'opacity-0 translate-y-1 pointer-events-none'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {mfaResolver ? (
            /* =====================================================================
               FIREBASE BUILT-IN TOTP 2-STEP VERIFICATION CHALLENGE
               ===================================================================== */
            <form onSubmit={handleVerifyMfaSignIn} className="w-full space-y-4" noValidate>
              {mfaError && (
                <div className="w-full px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2.5 flex-wrap">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed break-words">{mfaError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaError(null);
                      setMfaDigits(['', '', '', '', '', '']);
                      mfaOtpRefs.current[0]?.focus();
                    }}
                    className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Try again</span>
                  </button>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
                  <Smartphone size={14} className="text-[#0F172A] shrink-0" />
                  <span>Enter the 6-digit verification code</span>
                </div>

                <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                  {mfaDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        mfaOtpRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleMfaDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleMfaDigitKeyDown(idx, e)}
                      onPaste={handleMfaDigitPaste}
                      aria-label={`Authenticator digit ${idx + 1} of 6`}
                      className="w-full min-h-[48px] h-12 text-center rounded-xl bg-white border border-slate-200 focus:border-[#0F172A] focus:outline-none font-mono text-lg font-semibold text-[#0F172A] transition-colors"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingMfa || mfaDigits.join('').length !== 6}
                className="w-full min-h-[48px] h-12 px-6 rounded-full bg-[#0F172A] hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-medium tracking-tight flex items-center justify-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {isVerifyingMfa ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </div>
                ) : (
                  <span>Verify &amp; sign in</span>
                )}
              </button>

              <div className="pt-1 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLostAuthHelp((prev) => !prev)}
                  className="min-h-[44px] px-3 text-xs font-medium text-slate-600 hover:text-[#0F172A] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Lost my phone
                </button>

                {showLostAuthHelp && (
                  <div className="w-full p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs text-slate-600 leading-relaxed">
                    <p className="font-semibold text-[#0F172A]">
                      How to get help if you lost your phone
                    </p>
                    <p>
                      Because WaveLink uses Firebase Authenticator App 2-step verification, an admin must verify your identity to turn off your old authenticator app.
                    </p>
                    <p>
                      Send an email from your registered account address to WaveLink Support at{' '}
                      <span className="font-mono font-semibold text-[#0F172A] break-all">
                        keylanmbilinyi5@gmail.com
                      </span>{' '}
                      asking to reset your 2-step verification so you can sign in and set up a new phone.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCancelMfaChallenge}
                  disabled={isVerifyingMfa}
                  className="min-h-[44px] px-4 text-xs font-medium text-slate-500 hover:text-[#0F172A] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back to sign in</span>
                </button>
              </div>
            </form>
          ) : authMode === 'existing' ? (
            /* =====================================================================
               "I ALREADY HAVE AN ACCOUNT" FLOW (Existing Google-Linked Users)
               ===================================================================== */
            <div className="w-full space-y-4">
              {!existingVerifiedUid ? (
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Verify your existing account once using Google or an email link so we can attach your username and password to your original profile.
                  </p>

                  <button
                    type="button"
                    disabled={isVerifyingExisting}
                    onClick={handleVerifyExistingWithGoogle}
                    className="w-full h-12 px-5 rounded-full bg-white hover:bg-slate-50 text-[#0F172A] border border-slate-200 font-medium text-sm flex items-center justify-center gap-3 shadow-2xs transition-all duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>
                      {isVerifyingExisting ? 'Verifying...' : 'Verify with Google'}
                    </span>
                  </button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs text-slate-400">or</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="space-y-2.5">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Existing email address"
                      className="w-full h-11 px-4 rounded-full bg-white border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-slate-900 text-sm transition-colors"
                    />
                    <button
                      type="button"
                      disabled={isVerifyingExisting || resendCooldownSeconds > 0}
                      onClick={handleVerifyExistingWithEmailLink}
                      className="w-full h-11 px-5 rounded-full bg-[#0F172A] hover:bg-slate-800 text-white font-medium text-sm disabled:opacity-50 transition-all duration-200 cursor-pointer"
                    >
                      {isVerifyingExisting
                        ? 'Sending link...'
                        : resendCooldownSeconds > 0
                        ? `Resend in ${resendCooldownSeconds}s`
                        : existingEmailLinkSent
                        ? 'Resend verification link'
                        : 'Send verification link'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCompleteExistingAccountSetup} className="space-y-3.5" noValidate>
                  <div className="px-4 py-2.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {existingVerifiedEmail || auth.currentUser?.email}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setExistingVerifiedUid(null);
                        setExistingVerifiedEmail('');
                        await fbSignOut(auth).catch(() => {});
                      }}
                      className="text-xs font-medium underline text-slate-600 hover:text-slate-900 shrink-0 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name"
                    className="w-full h-12 px-4 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 text-sm transition-all"
                  />

                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Username (e.g. keylan_tz)"
                    className="w-full h-12 px-4 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 text-sm transition-all"
                  />

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (8–24 chars, letters & numbers)"
                      minLength={8}
                      maxLength={24}
                      className="w-full h-12 pl-4 pr-11 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 text-sm transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="w-11 h-12 absolute right-0.5 top-0 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 rounded-full bg-[#0F172A] hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? 'Saving...' : 'Save and continue'}
                  </button>
                </form>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    transitionToStep('landing');
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-[#0F172A] transition-colors cursor-pointer"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : authStep === 'landing' ? (
            /* =====================================================================
               STEP 1: MINIMALIST LANDING VIEW
               Circular smooth social provider buttons (Google & Email),
               subtle 'or' divider, and full-width rounded pill button for email continuation
               ===================================================================== */
            <div className="w-full flex flex-col items-center">
              {/* Circular Smooth Social Provider Buttons for Google and Email */}
              <div className="flex items-center justify-center gap-4 w-full">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGoogleSignIn}
                  aria-label="Continue with Google"
                  title="Continue with Google"
                  className="w-14 h-14 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 active:scale-95 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => transitionToStep('email')}
                  aria-label="Continue with Email"
                  title="Continue with Email"
                  className="w-14 h-14 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 active:scale-95 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-center text-[#0F172A] cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-5 h-5 stroke-[1.8]" />
                </button>
              </div>

              {/* Subtle 'or' Divider */}
              <div className="flex items-center w-full gap-3.5 my-6">
                <div className="h-px flex-1 bg-slate-200/80" />
                <span className="text-xs font-normal text-slate-400 lowercase select-none">
                  or
                </span>
                <div className="h-px flex-1 bg-slate-200/80" />
              </div>

              {/* Full-Width Rounded Pill Button for Email Continuation */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => transitionToStep('email')}
                className="w-full h-12 px-6 rounded-full bg-[#0F172A] hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-medium tracking-tight flex items-center justify-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                <span>Continue with email</span>
              </button>

              {/* Subtle Secondary Account Actions */}
              <div className="mt-6 flex flex-col items-center gap-2 text-xs text-slate-500">
                <div>
                  {authMode === 'signup' ? (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signin');
                          transitionToStep('email');
                        }}
                        className="text-[#0F172A] font-medium hover:underline cursor-pointer"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New to WaveLink?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signup');
                          transitionToStep('email');
                        }}
                        className="text-[#0F172A] font-medium hover:underline cursor-pointer"
                      >
                        Create account
                      </button>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('existing');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  First signed up with Google? Link username &amp; password
                </button>
              </div>
            </div>
          ) : authStep === 'email' ? (
            /* =====================================================================
               STEP 2: EMAIL INPUT STEP
               ===================================================================== */
            <form onSubmit={handleEmailStepContinue} className="w-full space-y-4" noValidate>
              {/* Clean Mode Switcher Pills */}
              <div className="grid grid-cols-2 p-1 rounded-full bg-slate-100/90 border border-slate-200/70 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className={`min-h-[2.75rem] rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                    authMode === 'signin'
                      ? 'bg-white text-[#0F172A] shadow-2xs'
                      : 'text-slate-500 hover:text-[#0F172A]'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setError(null);
                    setStatusMessage(null);
                    setExistingAccountDetected(false);
                  }}
                  className={`min-h-[2.75rem] rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                    authMode === 'signup'
                      ? 'bg-white text-[#0F172A] shadow-2xs'
                      : 'text-slate-500 hover:text-[#0F172A]'
                  }`}
                >
                  Create account
                </button>
              </div>

              <div>
                <label className="sr-only">
                  {authMode === 'signup' ? 'Email address' : 'Email address or username'}
                </label>
                <input
                  ref={emailFieldRef}
                  type={authMode === 'signup' ? 'email' : 'text'}
                  required
                  value={authMode === 'signup' ? emailInput : emailInput || usernameInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (authMode === 'signup') {
                      setEmailInput(val);
                      setIsEmailVerified(false);
                      setVerificationLinkSent(false);
                      setVerificationNotice(null);
                      setVerificationErrorCode(null);
                    } else {
                      setEmailInput(val);
                      setUsernameInput(val);
                    }
                  }}
                  placeholder={
                    authMode === 'signup'
                      ? 'name@example.com'
                      : 'Email address or username'
                  }
                  autoComplete="email"
                  className="w-full h-12 px-5 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0F172A] text-sm transition-all duration-200"
                />
              </div>

              <button
                type="submit"
                className="w-full h-12 px-6 rounded-full bg-[#0F172A] hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-medium tracking-tight flex items-center justify-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer"
              >
                <span>Continue</span>
              </button>

              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => transitionToStep('landing')}
                  className="text-xs font-medium text-slate-500 hover:text-[#0F172A] transition-colors cursor-pointer"
                >
                  Back to all options
                </button>
              </div>
            </form>
          ) : (
            /* =====================================================================
               STEP 3: PASSWORD INPUT STEP
               ===================================================================== */
            <form onSubmit={handleSubmit} className="w-full space-y-3.5" noValidate>
              {/* Entered Email / Identifier Pill with Edit Action */}
              <div className="w-full h-10 px-4 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-xs text-slate-700">
                <span className="truncate font-medium">
                  {authMode === 'signup'
                    ? emailInput
                    : emailInput || usernameInput}
                </span>
                <button
                  type="button"
                  onClick={() => transitionToStep('email')}
                  className="text-slate-500 hover:text-[#0F172A] font-medium underline underline-offset-2 shrink-0 cursor-pointer"
                >
                  Edit
                </button>
              </div>

              {authMode === 'signup' && (
                <>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Full name"
                    className="w-full h-12 px-5 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0F172A] text-sm transition-all duration-200"
                  />

                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Username (e.g. amina_tz)"
                    className="w-full h-12 px-5 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0F172A] text-sm transition-all duration-200"
                  />
                </>
              )}

              {/* Password Field */}
              <div>
                <div className="relative">
                  <input
                    ref={passwordFieldRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      authMode === 'signup'
                        ? 'Password (8–24 chars, letters & numbers)'
                        : 'Password'
                    }
                    minLength={8}
                    maxLength={24}
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full h-12 pl-5 pr-11 rounded-full bg-slate-50/70 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0F172A] text-sm transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="w-11 h-12 absolute right-0.5 top-0 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {authMode === 'signin' && (
                  <div className="mt-2 flex justify-end px-1">
                    <button
                      type="button"
                      onClick={handleForgotPasswordReset}
                      disabled={isSendingPasswordReset}
                      className="text-xs font-medium text-slate-500 hover:text-[#0F172A] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSendingPasswordReset ? 'Sending reset link...' : 'Forgot password?'}
                    </button>
                  </div>
                )}
              </div>

              {/* Built-In Email Verification Control for Sign-Up */}
              {authMode === 'signup' && (
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      Verify your email to complete sign-up
                    </span>
                    {isEmailVerified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          isSendingVerification ||
                          (verificationLinkSent && resendCooldownSeconds > 0)
                        }
                        onClick={handleSendEmailVerificationLink}
                        className="px-3.5 py-1.5 rounded-full bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-medium disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {isSendingVerification
                          ? 'Sending...'
                          : verificationLinkSent
                          ? resendCooldownSeconds > 0
                            ? `Resend (${resendCooldownSeconds}s)`
                            : 'Resend link'
                          : 'Send verification link'}
                      </button>
                    )}
                  </div>

                  {verificationLinkSent && !isEmailVerified && (
                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-600">
                      <span>
                        {verificationNotice ||
                          'Open the verification link in your inbox, then tap confirm.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => checkFirebaseEmailVerified()}
                        className="shrink-0 px-3 py-1 rounded-full bg-white border border-slate-300 hover:border-slate-900 text-[#0F172A] font-medium text-[11px] transition-colors cursor-pointer"
                      >
                        I&apos;ve verified
                      </button>
                    </div>
                  )}

                  {existingAccountDetected && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
                      <p className="font-medium">
                        An account with this email already exists.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('signin');
                            setUsernameInput(emailInput.trim().toLowerCase());
                            setExistingAccountDetected(false);
                            setError(null);
                          }}
                          className="px-3 py-1.5 rounded-full bg-[#0F172A] text-white text-xs font-medium cursor-pointer"
                        >
                          Sign in instead
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExistingAccountDetected(false);
                            handleStartExistingAccountLink(emailInput.trim().toLowerCase());
                          }}
                          className="px-3 py-1.5 rounded-full bg-white border border-amber-300 text-amber-900 text-xs font-medium cursor-pointer"
                        >
                          Link Google account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Date of Birth (Minimum Age Check + Teen Protection Notice) + Legal Acceptance on Sign-Up */}
              {authMode === 'signup' && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="signup-dob-input"
                        className="text-xs font-semibold text-slate-800"
                      >
                        Date of birth <span className="text-rose-600">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Minimum age: {MIN_SIGNUP_AGE}+
                      </span>
                    </div>
                    <input
                      id="signup-dob-input"
                      type="date"
                      value={birthDate}
                      max={new Date().toISOString().slice(0, 10)}
                      min="1905-01-01"
                      onChange={(e) => {
                        setBirthDate(e.target.value);
                        if (error) setError(null);
                      }}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                    />
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      {PARENTAL_PRIVACY_NOTICE.signupShortEn}
                    </p>

                    {signupAgeEval && !signupAgeEval.allowed && signupAgeEval.valid && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <span>
                          Sorry, you must be at least <strong>{MIN_SIGNUP_AGE} years old</strong> to create a WaveLink account.
                        </span>
                      </div>
                    )}

                    {signupAgeEval && signupAgeEval.allowed && signupAgeEval.isTeen && (
                      <div className="p-2.5 rounded-xl bg-teal-50/90 border border-teal-200 text-teal-900 text-xs space-y-1">
                        <p className="font-semibold flex items-center gap-1.5">
                          <ShieldCheck size={14} className="shrink-0 text-teal-700" />
                          <span>Teen Account Safety Active (Under {ADULT_AGE_THRESHOLD})</span>
                        </p>
                        <p className="text-[11px] leading-snug text-teal-800">
                          Your account starts in protected private mode (no stranger messages, no calls, no public posting, strict safety filter ON) until a parent or guardian confirms in <strong>Settings &rarr; Parental Control</strong>.
                        </p>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAgeConfirmed}
                      onChange={(e) => setIsAgeConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0F172A] focus:ring-[#0F172A]"
                    />
                    <span className="leading-snug">
                      I confirm my date of birth is accurate, I am <strong>{MIN_SIGNUP_AGE} years or older</strong>, and I agree to WaveLink&apos;s{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveLegalNotice('guidelines');
                        }}
                        className="underline font-semibold text-[#0F172A]"
                      >
                        Community Guidelines
                      </button>
                      ,{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveLegalNotice('terms');
                        }}
                        className="underline font-semibold text-[#0F172A]"
                      >
                        Terms of Service
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveLegalNotice('privacy');
                        }}
                        className="underline font-semibold text-[#0F172A]"
                      >
                        Privacy Policy
                      </button>
                      .
                    </span>
                  </label>
                </div>
              )}

              {/* Full-Width Rounded Pill Submit Button */}
              <button
                type="submit"
                disabled={
                  isLoading ||
                  (authMode === 'signup' &&
                    (!isEmailVerified || !isAgeConfirmed || !signupAgeEval?.allowed))
                }
                className="w-full h-12 px-6 rounded-full bg-[#0F172A] hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-medium tracking-tight flex items-center justify-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Please wait...</span>
                  </div>
                ) : (
                  <span>
                    {authMode === 'signup' ? 'Create account' : 'Sign in'}
                  </span>
                )}
              </button>

              <div className="pt-2 flex items-center justify-between text-xs text-slate-500 px-1">
                <button
                  type="button"
                  onClick={() => transitionToStep('email')}
                  className="hover:text-[#0F172A] transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem('wavelink_signup_verification_pending');
                    } catch {
                      // ignore
                    }
                    setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
                    setError(null);
                    setStatusMessage(null);
                    setExistingAccountDetected(false);
                  }}
                  className="hover:text-[#0F172A] transition-colors cursor-pointer"
                >
                  {authMode === 'signup' ? 'Sign in instead' : 'Create an account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Clean Compact Terms Text at the Bottom */}
      <footer className="w-full max-w-[20rem] mx-auto pt-8 text-center">
        <p className="text-[11px] leading-relaxed text-slate-400 font-normal">
          By continuing, you agree to WaveLink&apos;s{' '}
          <button
            type="button"
            onClick={() => setActiveLegalNotice('terms')}
            className="underline underline-offset-2 text-slate-500 hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            Terms of Service
          </button>{' '}
          and acknowledge that you have read our{' '}
          <button
            type="button"
            onClick={() => setActiveLegalNotice('privacy')}
            className="underline underline-offset-2 text-slate-500 hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          .
        </p>
      </footer>

      {/* Full Legal & Privacy Policy Modal (Privacy Policy, Terms & Content Rules, Security, Refunds) */}
      {activeLegalNotice && (
        <LegalModal
          isOpen={true}
          initialDoc={activeLegalNotice}
          onClose={() => setActiveLegalNotice(null)}
        />
      )}

      {/* Hidden Owner Sign-In Modal (Opened only after tapping WaveLink logo 5 times) */}
      {showOwnerModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-signin-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 sm:p-7 text-[#0F172A] relative">
            <button
              type="button"
              onClick={() => {
                if (!isOwnerSubmitting) {
                  setShowOwnerModal(false);
                  setOwnerAccessCode('');
                  setOwnerError(null);
                }
              }}
              className="absolute top-4 right-4 min-w-[2.75rem] min-h-[2.75rem] rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
              aria-label="Close Owner Sign-In"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 id="owner-signin-title" className="text-base sm:text-lg font-bold text-[#0F172A]">
                  Owner Sign-In
                </h3>
                <p className="text-xs text-slate-500">
                  Enter owner access code and sign in with your existing Google account
                </p>
              </div>
            </div>

            {ownerError && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2.5 flex-wrap font-medium">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{ownerError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOwnerError(null)}
                  className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Try again</span>
                </button>
              </div>
            )}

            <form onSubmit={handleOwnerSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Owner Access Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3.5 text-slate-500" size={16} />
                  <input
                    type={showOwnerCode ? 'text' : 'password'}
                    required
                    disabled={ownerLockedOut || isOwnerSubmitting}
                    value={ownerAccessCode}
                    onChange={(e) => setOwnerAccessCode(e.target.value)}
                    placeholder="Enter access code"
                    autoComplete="off"
                    className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-full bg-slate-50 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 text-sm transition disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerCode(!showOwnerCode)}
                    className="min-w-[44px] min-h-[44px] absolute right-0 top-0 flex items-center justify-center text-slate-400 hover:text-slate-700"
                    title={showOwnerCode ? 'Hide code' : 'Show code'}
                  >
                    {showOwnerCode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={ownerLockedOut || isOwnerSubmitting || !ownerAccessCode.trim()}
                className="w-full min-h-[48px] py-3 px-5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-3 transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isOwnerSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>{isOwnerSubmitting ? 'Verifying on Server...' : 'Continue with Google Sign-In'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


