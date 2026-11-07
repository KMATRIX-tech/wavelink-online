import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile as fbUpdateProfile,
  signOut as fbSignOut
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc
} from 'firebase/firestore';
import {
  auth,
  db,
  OWNER_SESSION_STORAGE_KEY,
  getClientDeviceId,
  isAuthNetworkError,
  getFriendlyAuthErrorMessage,
  cleanFirestoreData
} from '../firebase';
import { recordSystemDomain } from '../services/verificationService';
import { validateStrongPassword } from '../utils/security';
import { useAuth } from '../context/AuthContext';
import {
  Waves,
  Mail,
  Lock,
  User,
  AtSign,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  X
} from 'lucide-react';

const GENERIC_OWNER_ERROR = 'Authentication failed. Unable to verify owner credentials.';

export const AuthPage: React.FC = () => {
  const { refreshAdminVerification, completeVerifiedAuthSession } = useAuth();

  // Tab state: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  // Normal user fields: Username & Password + Email verification (Phone verification is disabled and hidden)
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Firebase Authentication built-in email verification state (never displays any code, link, or token in UI)
  const [verificationLinkSent, setVerificationLinkSent] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState<number>(0);

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

  // Automatically record current domain in Firebase on mount for tracking
  useEffect(() => {
    recordSystemDomain().catch(() => {});
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
   * Resolve a username or email/phone identifier to the Firebase Auth email
   */
  const resolveAuthEmailFromIdentifier = async (rawIdentifier: string): Promise<string> => {
    const trimmed = rawIdentifier.trim();
    if (trimmed.includes('@') && !trimmed.startsWith('@')) {
      return trimmed.toLowerCase();
    }

    const cleanHandle = trimmed.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');

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
      // continue to Firestore lookup
    }

    // 2. Check Firestore users collection by username (@handle or handle)
    try {
      const candidates = [`@${cleanHandle}`, cleanHandle];
      const q = query(collection(db, 'users'), where('username', 'in', candidates));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        if (docData?.email && typeof docData.email === 'string' && docData.email.includes('@')) {
          return docData.email.trim().toLowerCase();
        }
      }
    } catch {
      // fallback to deterministic handle email
    }

    return `${cleanHandle || 'member'}@users.wavelink.app`;
  };

  /**
   * When the user returns to the app, call reload() on the Firebase Auth user and check emailVerified.
   * Only when emailVerified is true, show 'Email verified' and allow sign-up to finish.
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
        await activeUser.getIdToken(true).catch(() => {});
        setIsEmailVerified(true);
        setVerificationNotice(null);
        setError(null);
        setStatusMessage('Email verified');
        return true;
      }
    } catch {
      // ignore transient reload error while offline
    }
    return false;
  }, [emailInput]);

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
    if (verificationLinkSent && !isEmailVerified) {
      pollTimer = setInterval(() => {
        checkFirebaseEmailVerified().catch(() => {});
      }, 3500);
    }

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleAppReturn);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [verificationLinkSent, isEmailVerified, checkFirebaseEmailVerified]);

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
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
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
          pwServerData?.error ||
            'Password must be between 8 and 24 characters and contain at least one letter and one number.'
        );
        return;
      }

      // 2. Check 60-second resend cooldown on the server
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

      // 4. Create or use the user's Firebase Auth account
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
            const signInRes = await signInWithEmailAndPassword(auth, cleanEmail, password);
            targetUser = signInRes.user;
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

      // 5. Check if already verified upon reload()
      await targetUser.reload();
      if (targetUser.emailVerified) {
        await targetUser.getIdToken(true).catch(() => {});
        setIsEmailVerified(true);
        setVerificationLinkSent(true);
        setVerificationNotice(null);
        setStatusMessage('Email verified');
        return;
      }

      // 6. Send Firebase Authentication's built-in email verification link
      await sendEmailVerification(targetUser);

      setVerificationLinkSent(true);
      setIsEmailVerified(false);
      setResendCooldownSeconds(
        typeof cooldownData?.cooldownSeconds === 'number' ? cooldownData.cooldownSeconds : 60
      );
      const sentMsg = 'Verification link sent. Check your inbox and spam folder.';
      setVerificationNotice(sentMsg);
      setStatusMessage(sentMsg);
    } catch (err: any) {
      setError(getFriendlyAuthErrorMessage(err, 'email'));
    } finally {
      setIsSendingVerification(false);
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
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
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
          pwServerData?.error ||
            'Password must be between 8 and 24 characters and contain at least one letter and one number.'
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

      // Reload the Firebase Auth user and check emailVerified before allowing sign-up to finish
      const verifiedNow = await checkFirebaseEmailVerified();
      const activeUser = auth.currentUser;

      if (
        !verifiedNow ||
        !activeUser ||
        !activeUser.emailVerified ||
        activeUser.email?.toLowerCase() !== cleanEmail
      ) {
        setIsEmailVerified(false);
        setError(
          'Please verify your email address before completing sign-up. Tap Verify, open the link in your email, and return to WaveLink.'
        );
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
        const idToken = await activeUser.getIdToken(true);

        // Server enforces that emailVerified is true and password meets the 8–24 char rule
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
            authEmail: cleanEmail,
            channel: 'email',
            password
          })
        });
        const regData = await regResp.json().catch(() => ({}));
        if (!regResp.ok || !regData?.success) {
          setError(
            regData?.error ||
              'Email verification is required on the server before completing sign-up.'
          );
          setStatusMessage(null);
          setIsLoading(false);
          return;
        }

        // Write Firestore profile document (enforced by Firestore rules requiring request.auth.token.email_verified == true)
        await setDoc(
          doc(db, 'users', activeUser.uid),
          cleanFirestoreData({
            id: activeUser.uid,
            email: cleanEmail,
            username: formattedUsername,
            displayName: name,
            updatedAt: new Date().toISOString()
          }),
          { merge: true }
        );

        await completeVerifiedAuthSession(name, formattedUsername);
        setStatusMessage('Welcome to WaveLink! Opening your feed...');
      } catch (err: any) {
        setError(getFriendlyAuthErrorMessage(err, 'email'));
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

        let signInRes;
        try {
          signInRes = await signInWithEmailAndPassword(auth, resolvedEmail, password);
        } catch (initialErr) {
          if (isAuthNetworkError(initialErr)) {
            await new Promise((r) => setTimeout(r, 600));
            signInRes = await signInWithEmailAndPassword(auth, resolvedEmail, password);
          } else {
            throw initialErr;
          }
        }

        await signInRes.user.reload();
        if (!signInRes.user.emailVerified) {
          try {
            sessionStorage.setItem('wavelink_signup_verification_pending', 'true');
          } catch {
            // ignore
          }
          setAuthMode('signup');
          setEmailInput(signInRes.user.email || resolvedEmail);
          setIsEmailVerified(false);
          setStatusMessage(null);
          setError(
            'Your email address is not verified yet. Please tap Verify on your email to receive a verification link before continuing.'
          );
          return;
        }

        await completeVerifiedAuthSession();
        setStatusMessage('Welcome back! Logging you in...');
      } catch (err: any) {
        const friendly = getFriendlyAuthErrorMessage(err, 'email');
        setError(friendly);
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    }
  };

  /**
   * Hidden Owner Sign-In Handler:
   * 1. Requires Owner Access Code input
   * 2. Opens Google Sign-In
   * 3. Sends Google ID token + Owner Access Code to server (/api/auth/owner-signin)
   * 4. Server verifies email === process.env.OWNER_EMAIL and code === process.env.OWNER_ACCESS_CODE
   *    using constant-time comparison, enforces 5 attempts/hr/device lockout, and assigns admin role on server only.
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
    } catch {
      // Even if Google popup fails or is closed, still report attempt to server so device rate limit is enforced
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

      // Server verified both OWNER_EMAIL and OWNER_ACCESS_CODE and granted admin role!
      try {
        if (data.ownerSessionToken) {
          sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken);
          localStorage.setItem(OWNER_SESSION_STORAGE_KEY, data.ownerSessionToken);
        }
        sessionStorage.removeItem('wavelink_owner_flow_pending');
      } catch {
        // ignore
      }

      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true).catch(() => {});
      }
      await refreshAdminVerification();
      setShowOwnerModal(false);
      setOwnerAccessCode('');
    } catch {
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
    <div className="min-h-[100dvh] w-full max-w-full relative flex items-center justify-center p-3.5 sm:p-8 overflow-x-hidden overflow-y-auto animate-aurora-bg text-[#0F172A] safe-area-top safe-area-bottom">
      {/* Moving Colorful Floating Orbs */}
      <div className="absolute top-[-10%] left-[-8%] w-[520px] max-w-[90vw] h-[520px] max-h-[90vw] rounded-full bg-gradient-to-br from-blue-500/45 via-cyan-400/40 to-teal-300/35 blur-[95px] pointer-events-none animate-orb-1" />
      <div className="absolute bottom-[-12%] right-[-8%] w-[580px] max-w-[90vw] h-[580px] max-h-[90vw] rounded-full bg-gradient-to-tr from-emerald-400/45 via-teal-400/35 to-cyan-500/40 blur-[105px] pointer-events-none animate-orb-2" />
      <div className="absolute top-[15%] right-[8%] w-[460px] max-w-[85vw] h-[460px] max-h-[85vw] rounded-full bg-gradient-to-bl from-pink-500/40 via-rose-400/35 to-amber-300/40 blur-[95px] pointer-events-none animate-orb-3" />
      <div className="absolute bottom-[12%] left-[10%] w-[440px] max-w-[85vw] h-[440px] max-h-[85vw] rounded-full bg-gradient-to-tr from-violet-500/40 via-fuchsia-400/35 to-amber-400/35 blur-[95px] pointer-events-none animate-orb-4" />

      {/* Animated Moving Colour Waves at the Bottom */}
      <div className="absolute inset-x-0 bottom-0 h-48 pointer-events-none overflow-hidden opacity-75">
        <svg
          className="absolute bottom-0 left-[-10%] w-[120%] h-40 animate-wave-slow"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
              <stop offset="33%" stopColor="#06B6D4" stopOpacity="0.35" />
              <stop offset="66%" stopColor="#10B981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#EC4899" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path
            fill="url(#waveGrad1)"
            d="M0,160L60,170.7C120,181,240,203,360,192C480,181,600,139,720,138.7C840,139,960,181,1080,197.3C1200,213,1320,203,1380,197.3L1440,192L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"
          />
        </svg>
        <svg
          className="absolute bottom-0 left-[-10%] w-[120%] h-32 animate-wave-fast"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path
            fill="url(#waveGrad2)"
            d="M0,224L60,208C120,192,240,160,360,165.3C480,171,600,213,720,229.3C840,245,960,235,1080,208C1200,181,1320,139,1380,117.3L1440,96L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"
          />
        </svg>
      </div>

      {/* Main Welcoming Onboarding Container */}
      <div className="relative w-full max-w-lg z-10">
        {/* Brand Header — Tapping the WaveLink Logo 5 times opens Hidden Owner Sign-In */}
        <div className="text-center mb-7">
          <button
            type="button"
            onClick={handleLogoTap}
            aria-label="WaveLink Logo"
            className="inline-flex items-center justify-center p-4 rounded-3xl animate-moving-btn shadow-xl shadow-blue-500/30 mb-3.5 ring-4 ring-white/90 select-none cursor-pointer focus:outline-none active:scale-95 transition-transform"
          >
            <Waves className="w-8 h-8 text-white animate-bounce" style={{ animationDuration: '3s' }} />
          </button>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F172A]">
            Welcome to <span className="animate-moving-text">WaveLink</span>
          </h1>
          <p className="mt-2 text-sm text-slate-700 font-medium max-w-md mx-auto leading-relaxed">
            A vibrant, colourful community to connect with friends, share stories &amp; reels, and support creators across East Africa.
          </p>

          {/* Colourful Onboarding Feature Highlights */}
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-xs font-bold">
            <span className="px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-blue-200 text-blue-700 shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" style={{ animationDuration: '2.5s' }} />
              Live Community Feed
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-emerald-200 text-emerald-700 shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" style={{ animationDuration: '3s' }} />
              HD Reels &amp; Calling
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-pink-200 text-pink-700 shadow-sm flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-500" />
              Creator Mobile Wallet
            </span>
          </div>
        </div>

        {/* Moving Rainbow Border Wrapper around the Crisp White Card */}
        <div className="p-[3px] rounded-[28px] animate-vibrant-ribbon shadow-[0_20px_60px_-12px_rgba(37,99,235,0.28)]">
          <div className="bg-white/95 backdrop-blur-xl rounded-[25px] p-5 sm:p-8">
            {/* Mode Switcher Tabs: Sign In vs Create Account */}
            <div className="grid grid-cols-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 mb-6 gap-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setStatusMessage(null);
                }}
                className={`min-h-[44px] py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ${
                  authMode === 'signin'
                    ? 'animate-moving-btn text-white shadow-md shadow-blue-500/25 scale-[1.01]'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setError(null);
                  setStatusMessage(null);
                }}
                className={`min-h-[44px] py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ${
                  authMode === 'signup'
                    ? 'animate-moving-btn text-white shadow-md shadow-emerald-500/25 scale-[1.01]'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                <UserPlus size={15} />
                <span>Create Account</span>
              </button>
            </div>

            <div className="mb-5 text-center">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center justify-center gap-2">
                <Sparkles size={17} className="text-pink-500 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="animate-moving-text">
                  {authMode === 'signup'
                    ? 'Create Your Verified Account'
                    : 'Sign In with Username & Password'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {authMode === 'signup'
                  ? 'Choose a username and password (8–24 characters), then verify your email'
                  : 'Enter your username and password to jump right into the feed'}
              </p>
            </div>

            {/* Feedback messages */}
            {error && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">
                  <span>{error}</span>
                </div>
              </div>
            )}

            {statusMessage && !error && (
              <div className="mb-4 p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 text-xs flex items-center gap-2.5 animate-in fade-in font-medium">
                <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Normal User Form: Username & Password + Firebase Built-In Email Verification */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                    Full Name / Display Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 text-emerald-500" size={16} />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Amina Nyerere"
                      className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/25 text-base sm:text-sm transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                  {authMode === 'signup' ? 'Username' : 'Username (or Email)'}
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3.5 top-3.5 text-purple-500" size={16} />
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder={authMode === 'signup' ? 'e.g. amina_tz' : 'e.g. amina_tz or name@domain.com'}
                    className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 text-base sm:text-sm transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#0F172A]">
                    Password
                  </label>
                  <span className="text-[10px] text-pink-600 font-semibold">
                    8–24 chars, at least 1 letter &amp; 1 number
                  </span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-pink-500" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8–24 characters with letters & numbers"
                    minLength={8}
                    maxLength={24}
                    className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-500/25 text-base sm:text-sm transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="min-w-[44px] min-h-[44px] absolute right-0 top-0 flex items-center justify-center text-slate-400 hover:text-pink-600 transition"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Email Verification Section for Normal Users (Phone option disabled & hidden) */}
              {authMode === 'signup' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#0F172A] flex items-center gap-1.5">
                      <Mail size={14} className="text-blue-600" />
                      <span>Email Verification</span>
                    </span>
                    {isEmailVerified && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-extrabold">
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        <span>Email verified</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 text-blue-500" size={16} />
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setIsEmailVerified(false);
                        setVerificationLinkSent(false);
                        setVerificationNotice(null);
                      }}
                      placeholder="name@domain.com"
                      className="w-full min-h-[42px] pl-10 pr-28 py-2 rounded-xl bg-white border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-blue-500 text-xs sm:text-sm"
                    />
                    {!verificationLinkSent && !isEmailVerified && (
                      <button
                        type="button"
                        disabled={isSendingVerification || isEmailVerified}
                        onClick={handleSendEmailVerificationLink}
                        className="absolute right-1.5 top-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] disabled:opacity-50 transition"
                      >
                        {isSendingVerification ? 'Sending...' : 'Verify'}
                      </button>
                    )}
                    {verificationLinkSent && !isEmailVerified && (
                      <button
                        type="button"
                        disabled={isSendingVerification || resendCooldownSeconds > 0}
                        onClick={handleSendEmailVerificationLink}
                        className="absolute right-1.5 top-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] disabled:opacity-50 transition"
                      >
                        {isSendingVerification
                          ? 'Sending...'
                          : resendCooldownSeconds > 0
                          ? `Resend (${resendCooldownSeconds}s)`
                          : 'Resend'}
                      </button>
                    )}
                  </div>

                  {verificationLinkSent && !isEmailVerified && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 font-semibold">
                        {verificationNotice ||
                          'Verification link sent. Check your inbox and spam folder.'}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>
                          Click the link in your email, then return here to finish sign-up.
                        </span>
                        <button
                          type="button"
                          onClick={() => checkFirebaseEmailVerified()}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition"
                        >
                          I&apos;ve Verified
                        </button>
                      </div>
                    </div>
                  )}

                  {isEmailVerified && (
                    <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span>Email verified</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (authMode === 'signup' && !isEmailVerified)}
                className="w-full min-h-[48px] mt-2 py-3.5 px-5 rounded-2xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-pink-500/35 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 animate-moving-btn"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{authMode === 'signup' ? 'Create WaveLink Account' : 'Sign In to WaveLink'}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {/* Toggle between modes */}
            <div className="mt-5 text-center">
              {authMode === 'signin' ? (
                <p className="text-xs text-slate-600 font-medium">
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setError(null);
                      setStatusMessage(null);
                    }}
                    className="animate-moving-text font-extrabold underline transition"
                  >
                    Sign Up Here
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-600 font-medium">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setError(null);
                      setStatusMessage(null);
                    }}
                    className="animate-moving-text font-extrabold underline transition"
                  >
                    Sign In Here
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer credits */}
        <p className="text-center text-xs text-slate-600 mt-6 font-bold">
          WaveLink © 2026 • Empowering East African Creators
        </p>
      </div>

      {/* Hidden Owner Sign-In Modal (Opened only after tapping WaveLink logo 5 times) */}
      {showOwnerModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-signin-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in"
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
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
              aria-label="Close Owner Sign-In"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 id="owner-signin-title" className="text-base sm:text-lg font-extrabold text-[#0F172A]">
                  Owner Sign-In
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Enter owner access code and verify with Google
                </p>
              </div>
            </div>

            {ownerError && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 font-medium">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{ownerError}</span>
              </div>
            )}

            <form onSubmit={handleOwnerSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
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
                    className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 text-sm transition disabled:opacity-50"
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
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-3 transition shadow-md disabled:opacity-50"
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
