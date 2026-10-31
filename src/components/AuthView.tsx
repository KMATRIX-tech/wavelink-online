import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isOwnerEmail, ADMIN_EMAIL } from '../firebase';
import {
  Waves,
  Sparkles,
  LogIn,
  UserPlus,
  Lock,
  Mail,
  User,
  AlertCircle,
  ArrowRight,
  Crown,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';

export const AuthView: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, quickSignIn } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('WaveLinkAdmin2025!');
  const [displayName, setDisplayName] = useState('Keylan Mbilinyi (Platform Owner)');
  const [username, setUsername] = useState('keylan');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Strict owner verification check
    if (!isOwnerEmail(email)) {
      setError(`Access Restricted: WaveLink is in Private Owner Mode. Only ${ADMIN_EMAIL} is allowed to enter.`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, displayName.trim() || 'Keylan Mbilinyi (Platform Owner)', username.trim() || 'keylan');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('auth/invalid-credential') ||
        msg.includes('auth/wrong-password') ||
        msg.includes('auth/user-not-found')
      ) {
        setError('Invalid credentials. Use 1-Click Owner Launch below for instant access.');
      } else if (msg.includes('auth/email-already-in-use')) {
        // If owner already exists, switch to sign-in and proceed
        setMode('signin');
        setError('Account exists. Please enter your password or click 1-Click Owner Launch.');
      } else if (msg.includes('auth/weak-password')) {
        setError('Password should be at least 6 characters.');
      } else {
        setError(msg.replace('Firebase: ', ''));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('auth/popup-closed-by-user')) {
        setError(msg.replace('Firebase: ', ''));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOwnerQuickLaunch = async () => {
    setError(null);
    setQuickLoading(true);
    try {
      await quickSignIn(
        ADMIN_EMAIL,
        'WaveLinkAdmin2025!',
        'Keylan Mbilinyi (Platform Owner)',
        '@keylan'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Owner quick launch error:', err);
      setEmail(ADMIN_EMAIL);
      setPassword('WaveLinkAdmin2025!');
      setError(`Owner launch attempt: ${msg.replace('Firebase: ', '')}. Credentials filled above.`);
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden animate-aurora-bg text-[#0F172A]">
      {/* Moving colourful ambient orbs */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] rounded-full bg-gradient-to-br from-blue-500/40 via-cyan-400/35 to-emerald-400/35 blur-3xl pointer-events-none animate-orb-1"
      />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-pink-500/35 via-purple-500/35 to-amber-400/35 blur-3xl pointer-events-none animate-orb-2" />
      <div className="absolute top-[35%] right-[15%] w-[400px] h-[400px] rounded-full bg-gradient-to-bl from-cyan-500/35 via-emerald-400/30 to-blue-500/35 blur-3xl pointer-events-none animate-orb-3" />

      {/* Main card */}
      <div className="relative w-full max-w-md z-10">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl animate-moving-btn shadow-xl shadow-blue-500/30 mb-3 ring-4 ring-white/80">
            <Waves className="w-8 h-8 text-white animate-bounce" style={{ animationDuration: '3s' }} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight animate-moving-text">
            WaveLink
          </h1>
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/80 border border-purple-300 text-purple-700 text-xs font-semibold">
            <Crown size={12} className="text-amber-500" />
            <span>Private Platform • Owner Edition</span>
          </div>
          <p className="mt-2 text-xs text-slate-600 font-medium">
            Exclusive access reserved for <span className="text-[#0F172A] font-mono font-bold">{ADMIN_EMAIL}</span>
          </p>
        </div>

        {/* Auth form box */}
        <div className="p-[3px] rounded-3xl animate-vibrant-ribbon shadow-2xl">
        <div className="bg-white/95 backdrop-blur-xl rounded-[21px] p-5 sm:p-7">
          {/* Strict Owner Lock Notice */}
          <div className="mb-4 p-3 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-800 flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-semibold text-[#0F172A]">Owner Security Gate Active:</span> All other registrations and sign-ins are strictly blocked.
            </div>
          </div>

          {/* Primary Owner 1-Click Launch Button */}
          <div className="mb-5">
            <button
              type="button"
              onClick={handleOwnerQuickLaunch}
              disabled={quickLoading || isSubmitting}
              className="w-full py-3 px-4 rounded-2xl animate-moving-btn font-bold text-sm text-white flex items-center justify-center gap-2.5 shadow-xl shadow-blue-500/30 active:scale-[0.99] transition disabled:opacity-50"
            >
              {quickLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Crown size={16} className="text-amber-200" />
                  <span>Enter as Platform Owner</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-purple-300/60 mt-1.5">
              1-Click instant sign-in with full super administrator authority
            </p>
          </div>

          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-white/15" />
            <span className="px-3 text-[10px] uppercase tracking-wider text-purple-200/50 font-bold">
              or credentials
            </span>
            <div className="flex-1 border-t border-white/15" />
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-2xl bg-black/25 p-1 mb-4 border border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                mode === 'signin'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/50'
                  : 'text-purple-200/70 hover:text-white'
              }`}
            >
              <LogIn size={13} />
              Owner Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                mode === 'signup'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-900/50'
                  : 'text-purple-200/70 hover:text-white'
              }`}
            >
              <UserPlus size={13} />
              Owner Setup
            </button>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2 animate-in fade-in">
              <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-purple-200/90 mb-1">
                Owner Email Address (Locked)
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-purple-300/60" size={15} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="keylanmbilinyi5@gmail.com"
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-purple-500/30 text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm font-mono"
                />
              </div>
              {!isOwnerEmail(email) && (
                <p className="text-[10px] text-rose-300 mt-1 flex items-center gap-1">
                  <ShieldAlert size={11} /> Only {ADMIN_EMAIL} can enter.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-purple-200/90 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-purple-300/60" size={15} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || quickLoading || !isOwnerEmail(email)}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-950/60 active:scale-[0.99] transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In as Owner' : 'Initialize Owner Account'}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Google Sign-in */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || quickLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs flex items-center justify-center gap-2.5 transition disabled:opacity-50"
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
              <span>Continue with Owner Google Account</span>
            </button>
          </div>

          {/* Footer note */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <Sparkles size={11} className="text-amber-500" />
              Owner: <code className="text-blue-600 font-mono">keylanmbilinyi5@...</code>
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
