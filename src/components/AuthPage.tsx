import React, { useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile
} from 'firebase/auth';
import { auth, ADMIN_EMAIL, isOwnerEmail } from '../firebase';
import { recordSystemDomain } from '../services/verificationService';
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
  Crown,
  Eye,
  EyeOff,
  UserPlus,
  LogIn
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { quickSignIn } = useAuth();
  
  // Tab state: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Automatically record current domain in Firebase on mount for tracking
  React.useEffect(() => {
    recordSystemDomain().catch(() => {});
  }, []);

  /**
   * 1. Built-in Firebase Google Sign-In via standard signInWithPopup(auth, googleProvider)
   */
  const handleGoogleSignIn = async () => {
    setError(null);
    setStatusMessage('Connecting to Google...');
    setIsGoogleLoading(true);

    try {
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
      setStatusMessage('Signed in successfully! Loading your profile...');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('auth/popup-closed-by-user') && !msg.includes('auth/cancelled-popup-request')) {
        setError(msg.replace('Firebase: ', ''));
      }
      setStatusMessage(null);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  /**
   * 2. Built-in Firebase Email & Password Form Handler
   * Explicitly supports both Signing Up (creating a new account) and Signing In
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError(null);
    setIsLoading(true);

    if (authMode === 'signup') {
      // ==========================================
      // SIGN UP: Built-in Firebase User Creation
      // ==========================================
      const name = displayName.trim() || cleanEmail.split('@')[0];
      setStatusMessage('Creating your WaveLink account with Firebase...');

      try {
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await fbUpdateProfile(res.user, {
          displayName: name
        });
        setStatusMessage('Welcome to WaveLink! Opening your dashboard...');
      } catch (err: any) {
        const code = err?.code || '';
        const msg = err?.message || String(err);

        if (code === 'auth/email-already-in-use') {
          setError('An account with this email already exists. Switching to Sign In...');
          setAuthMode('signin');
        } else if (code === 'auth/weak-password') {
          setError('Password is too weak. Please use at least 6 characters.');
        } else if (code === 'auth/invalid-email') {
          setError('Please enter a valid email address.');
        } else {
          setError(msg.replace('Firebase: ', ''));
        }
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    } else {
      // ==========================================
      // SIGN IN: Built-in Firebase Sign In
      // ==========================================
      setStatusMessage('Signing in to your WaveLink account...');

      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        setStatusMessage('Welcome back! Logging you in...');
      } catch (err: any) {
        const code = err?.code || '';
        const msg = err?.message || String(err);

        if (
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-credential' ||
          msg.includes('user-not-found') ||
          msg.includes('invalid-credential')
        ) {
          // Offer seamless auto-registration or switch to signup
          setStatusMessage('No account found. Automatically registering your new account with Firebase...');
          try {
            const createRes = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            const name = displayName.trim() || cleanEmail.split('@')[0];
            await fbUpdateProfile(createRes.user, { displayName: name });
            setStatusMessage('Account created successfully! Welcome to WaveLink 🌊');
            return;
          } catch (createErr: any) {
            const createCode = createErr?.code || '';
            const createMsg = createErr?.message || String(createErr);

            if (createCode === 'auth/email-already-in-use') {
              setError('Incorrect password for this account. Please try again.');
            } else if (createCode === 'auth/weak-password') {
              setError('Password is too weak. Must be at least 6 characters.');
            } else {
              setError(createMsg.replace('Firebase: ', ''));
            }
            setStatusMessage(null);
            return;
          }
        } else if (code === 'auth/wrong-password') {
          setError('Incorrect password. Please verify your password and try again.');
          setStatusMessage(null);
        } else if (code === 'auth/too-many-requests') {
          setError('Too many attempts. Please wait a minute and try again.');
          setStatusMessage(null);
        } else if (code === 'auth/invalid-email') {
          setError('Please enter a valid email address.');
          setStatusMessage(null);
        } else {
          setError(msg.replace('Firebase: ', ''));
          setStatusMessage(null);
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  /**
   * Quick Owner fill & sign-in for Keylan (Platform Owner)
   */
  const handleOwnerQuickAccess = async () => {
    setEmail(ADMIN_EMAIL);
    setPassword('WaveLinkAdmin2025!');
    setDisplayName('Keylan Mbilinyi (Platform Owner)');
    setUsername('keylan');
    setError(null);
    setStatusMessage('Signing in as Platform Owner (Keylan)...');
    setIsLoading(true);

    try {
      await quickSignIn(
        ADMIN_EMAIL,
        'WaveLinkAdmin2025!',
        'Keylan Mbilinyi (Platform Owner)',
        '@keylan'
      );
    } catch (err: any) {
      console.log('Owner quick sign-in ready in form:', err);
      // If error, values are populated in the form for 1-click submit
      setStatusMessage('Owner credentials loaded into form. Click Sign In to proceed.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-8 overflow-hidden animate-aurora-bg text-[#0F172A]">
      {/* Moving Colorful Floating Orbs */}
      <div
        className="absolute top-[-10%] left-[-8%] w-[520px] h-[520px] rounded-full bg-gradient-to-br from-blue-500/45 via-cyan-400/40 to-teal-300/35 blur-[95px] pointer-events-none animate-orb-1"
      />
      <div
        className="absolute bottom-[-12%] right-[-8%] w-[580px] h-[580px] rounded-full bg-gradient-to-tr from-emerald-400/45 via-teal-400/35 to-cyan-500/40 blur-[105px] pointer-events-none animate-orb-2"
      />
      <div
        className="absolute top-[15%] right-[8%] w-[460px] h-[460px] rounded-full bg-gradient-to-bl from-pink-500/40 via-rose-400/35 to-amber-300/40 blur-[95px] pointer-events-none animate-orb-3"
      />
      <div
        className="absolute bottom-[12%] left-[10%] w-[440px] h-[440px] rounded-full bg-gradient-to-tr from-violet-500/40 via-fuchsia-400/35 to-amber-400/35 blur-[95px] pointer-events-none animate-orb-4"
      />

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
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center p-4 rounded-3xl animate-moving-btn shadow-xl shadow-blue-500/30 mb-3.5 ring-4 ring-white/90">
            <Waves className="w-8 h-8 text-white animate-bounce" style={{ animationDuration: '3s' }} />
          </div>
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
          <div className="bg-white/95 backdrop-blur-xl rounded-[25px] p-6 sm:p-8">
            {/* Mode Switcher Tabs: Sign In vs Sign Up */}
            <div className="grid grid-cols-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setStatusMessage(null);
                }}
                className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ${
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
                className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ${
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
                    ? 'Create Your Free Account'
                    : 'Sign In to Your Account'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {authMode === 'signup'
                  ? 'Join in seconds to share waves, chat with members, and explore reels'
                  : 'Welcome back! Enter your details to jump right into the colourful feed'}
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
                <div className="w-3.5 h-3.5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* 1. Firebase Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-50/70 via-purple-50/70 to-pink-50/70 hover:from-blue-100/80 hover:via-purple-100/80 hover:to-pink-100/80 border border-blue-200/80 text-[#0F172A] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-3 transition shadow-xs active:scale-[0.99] disabled:opacity-50"
            >
              {isGoogleLoading ? (
                <div className="w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
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
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center my-5">
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-blue-200 to-pink-200" />
              <span className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-extrabold">
                or with email &amp; password
              </span>
              <div className="flex-1 h-[1px] bg-gradient-to-r from-pink-200 via-emerald-200 to-transparent" />
            </div>

            {/* 2. Built-in Firebase Sign In & Sign Up Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                      Full Name / Display Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 text-emerald-500" size={16} />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Keylan Mbilinyi"
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/25 text-xs sm:text-sm transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                      Username (optional)
                    </label>
                    <div className="relative">
                      <AtSign className="absolute left-3.5 top-3 text-purple-500" size={16} />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. keylan"
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 text-xs sm:text-sm transition"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 text-blue-500" size={16} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/25 text-xs sm:text-sm transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#0F172A]">
                    Password
                  </label>
                  <span className="text-[10px] text-pink-600 font-semibold">Min. 6 characters</span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 text-pink-500" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-500/25 text-xs sm:text-sm transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-pink-600 transition"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full mt-2 py-3.5 px-5 rounded-2xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-pink-500/35 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 animate-moving-btn"
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

            {/* Quick Helper for Platform Owner (Keylan) */}
            <div className="mt-5 pt-4 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
              <button
                type="button"
                onClick={handleOwnerQuickAccess}
                className="inline-flex items-center gap-1.5 text-[#2563EB] hover:text-pink-600 font-bold transition"
                title="Quickly fill Platform Owner (Keylan) credentials"
              >
                <Crown size={13} className="text-amber-500" />
                <span>Owner (Keylan) 1-Click Access</span>
              </button>
              <span className="animate-moving-text font-extrabold">Colourful Live UI</span>
            </div>
          </div>
        </div>

        {/* Footer credits */}
        <p className="text-center text-xs text-slate-600 mt-6 font-bold">
          WaveLink © 2026 • Empowering East African Creators
        </p>
      </div>
    </div>
  );
};
