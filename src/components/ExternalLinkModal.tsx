import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { isInternalWaveLinkUrl } from '../utils/safetyFilters';
import { SystemStatusBannerConfig } from '../types';
import {
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  X,
  Info,
  AlertOctagon,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

/**
 * GlobalServiceStatusBanner:
 * 1. Displays the Owner-controlled Service Status Banner (system_config/status_banner) when enabled.
 * 2. Displays a high-priority Force Password Reset banner if the user triggered "This wasn't me".
 */
export const GlobalServiceStatusBanner: React.FC = () => {
  const { currentUser: user, userProfile, signOut } = useAuth();
  const [banner, setBanner] = useState<SystemStatusBannerConfig | null>(null);
  const [dismissedBannerAt, setDismissedBannerAt] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    let active = true;
    // Fetch initial from server fallback
    fetch('/api/system/status-banner')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.banner) {
          setBanner(data.banner);
        }
      })
      .catch(() => {});

    // Real-time Firestore listener if authenticated
    if (!user) return () => { active = false; };
    const unsub = onSnapshot(
      doc(db, 'system_config', 'status_banner'),
      (snap) => {
        if (snap.exists()) {
          setBanner(snap.data() as SystemStatusBannerConfig);
        }
      },
      () => {}
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user?.uid]);

  const handleSendPasswordReset = async () => {
    if (!user?.email || sendingReset) return;
    setSendingReset(true);
    setResetError(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailSent(true);
    } catch (err: any) {
      setResetError(err?.message || 'Could not send reset email right now.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleConfirmResetDoneAndSignOut = async () => {
    if (!user) return;
    try {
      // Sign out cleanly; user should sign back in with their updated password, or change password in Settings
      await signOut();
    } catch {
      // ignore
    }
  };

  const showStatusBanner =
    banner?.enabled &&
    (banner.messageEn || banner.messageSw) &&
    dismissedBannerAt !== banner.updatedAt;

  const bannerLevel = banner?.level || banner?.severity || 'info';
  const showForceResetBanner = Boolean(userProfile?.forcePasswordReset);

  if (!showStatusBanner && !showForceResetBanner) return null;

  return (
    <div className="w-full z-40 flex flex-col">
      {showForceResetBanner && (
        <div className="bg-rose-950/95 border-b border-rose-500/40 px-4 py-2.5 text-rose-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Security Lock Active: You reported an unrecognized device login. Change your password in Settings or complete the reset link sent to your email.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {resetError && (
              <span className="text-xs font-semibold text-amber-200">{resetError}</span>
            )}
            {resetEmailSent ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Reset link sent to {user?.email}
                </span>
                <button
                  onClick={handleConfirmResetDoneAndSignOut}
                  className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Sign Out &amp; Re-authenticate
                </button>
              </>
            ) : (
              <button
                onClick={handleSendPasswordReset}
                disabled={sendingReset}
                className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {sendingReset ? 'Sending...' : 'Send Password Reset Email'}
              </button>
            )}
          </div>
        </div>
      )}

      {showStatusBanner && banner && (
        <div
          className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 text-xs sm:text-sm font-medium ${
            bannerLevel === 'outage'
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-100'
              : bannerLevel === 'warning'
              ? 'bg-amber-950/95 border-amber-500/40 text-amber-100'
              : 'bg-sky-950/95 border-sky-500/40 text-sky-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {bannerLevel === 'outage' ? (
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            ) : bannerLevel === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <div className="truncate sm:whitespace-normal">
              <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-black/30 mr-2">
                {bannerLevel === 'outage'
                  ? 'Service Outage'
                  : bannerLevel === 'warning'
                  ? 'Maintenance'
                  : 'System Notice'}
              </span>
              <span>{banner.messageEn}</span>
              {banner.messageSw && banner.messageSw !== banner.messageEn && (
                <span className="opacity-80 ml-2">• {banner.messageSw}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setDismissedBannerAt(banner.updatedAt)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white shrink-0 cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * ExternalLinkInterceptorModal:
 * Intercepts clicks on external links (`<a href="http...">`) and warns users before leaving WaveLink.
 */
export const ExternalLinkInterceptorModal: React.FC = () => {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('http://') && !href.startsWith('https://')) return;
      if (anchor.getAttribute('data-bypass-warning') === 'true') return;

      if (!isInternalWaveLinkUrl(href)) {
        e.preventDefault();
        e.stopPropagation();
        setPendingUrl(href);
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  if (!pendingUrl) return null;

  let hostname = '';
  try {
    hostname = new URL(pendingUrl).hostname;
  } catch {
    hostname = pendingUrl;
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#11131A] border border-white/15 shadow-2xl p-6 space-y-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Leaving WaveLink</h3>
              <p className="text-xs text-zinc-400">External link safety warning • Tahadhari ya kiungo cha nje</p>
            </div>
          </div>
          <button
            onClick={() => setPendingUrl(null)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-zinc-300 space-y-2 leading-relaxed">
          <p>
            You are about to open an external website outside of WaveLink. Never enter your WaveLink password or 2-step verification codes on external sites.
          </p>
          <div className="p-3 rounded-xl bg-black/50 border border-white/10 font-mono text-xs text-amber-300 break-all">
            {pendingUrl}
          </div>
          <p className="text-[11px] text-zinc-400">
            Domain: <strong className="text-zinc-200">{hostname}</strong>
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={() => setPendingUrl(null)}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Go Back Safely
          </button>
          <a
            href={pendingUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-bypass-warning="true"
            onClick={() => setPendingUrl(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors cursor-pointer"
          >
            <span>Continue to Site</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
