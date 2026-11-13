import React, { useState } from 'react';
import { Download, Smartphone, X, Share, PlusSquare, CheckCircle2, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'header' | 'banner' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'sidebar' }) => {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'sidebar' || variant === 'full') {
      return (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-700 font-semibold">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span>WaveLink App Installed</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (canInstall) {
      await triggerInstall();
    } else {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {(variant === 'sidebar' || variant === 'full') && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-blue-600/10 to-teal-500/10 hover:from-blue-600/15 hover:to-teal-500/15 border border-blue-200 text-slate-900 font-bold text-xs flex items-center justify-between transition group shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-blue-600 text-white shadow-xs group-hover:scale-105 transition">
              <Smartphone size={14} />
            </div>
            <div className="text-left">
              <div className="leading-tight font-extrabold text-slate-900">
                Install WaveLink
              </div>
              <div className="text-[10px] text-slate-500 font-normal">
                {isIOS ? 'Share → Add to Home Screen' : 'Fast home screen access & alerts'}
              </div>
            </div>
          </div>
          <Download size={14} className="text-blue-600 group-hover:translate-y-0.5 transition" />
        </button>
      )}

      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold transition"
          title="Install WaveLink"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Install WaveLink</span>
        </button>
      )}

      {/* Friendly Add to Home Screen Modal (Tailored for iPhone / iOS & Android) */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Add WaveLink to Home Screen
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isIOS ? 'Best experience & push notifications on iPhone' : 'Quick 2-step home screen shortcut'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p className="font-medium text-slate-700">
                  Apple requires web apps to be saved to your Home Screen to send push notifications on iPhone and iPad:
                </p>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <span>
                      Tap the <strong>Share</strong> icon{' '}
                      <Share size={14} className="inline mx-0.5 text-blue-600" /> at the bottom of Safari.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <span>
                      Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>{' '}
                      <PlusSquare size={14} className="inline mx-0.5 text-emerald-600" />.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <span>
                      Open <strong>WaveLink</strong> from your Home Screen and tap <strong>Enable Push Notifications</strong>.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  Install WaveLink on your phone or computer for instant launch and push notifications:
                </p>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <span>
                      Open your browser menu (<strong>⋮</strong> in Chrome or address bar install icon).
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <span>
                      Select <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Friendly, dismissible Add to Home Screen Hint Strip (shows once a week, never on top of content on phones)
 */
export const AddToHomeScreenHintCard: React.FC<{ compact?: boolean }> = ({ compact = true }) => {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const untilStr = localStorage.getItem('wavelink_a2hs_dismissed_until');
      if (untilStr) {
        const until = parseInt(untilStr, 10);
        if (Number.isFinite(until) && Date.now() < until) {
          return true;
        }
      }
      return localStorage.getItem('wavelink_a2hs_hint_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [showDetails, setShowDetails] = useState(false);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      // Dismiss for 7 days (shows only once a week, never above feed after dismissal)
      const oneWeekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem('wavelink_a2hs_dismissed_until', String(oneWeekFromNow));
      localStorage.setItem('wavelink_a2hs_hint_dismissed', '1');
    } catch {
      // ignore
    }
  };

  return (
    <aside
      aria-label="Install app notice"
      className="w-full max-w-full rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 px-3 py-1.5 shadow-2xs flex flex-col gap-1.5 transition-all animate-in fade-in"
    >
      <div className="flex items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone size={14} className="text-[#2563EB] shrink-0" />
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
            {isIOS
              ? 'Add WaveLink to iPhone Home Screen for instant launch & alerts'
              : 'Install WaveLink on your Home Screen'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canInstall ? (
            <button
              type="button"
              onClick={() => triggerInstall()}
              className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
            >
              <Download size={11} />
              <span>Install</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetails((p) => !p)}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 text-[#2563EB] border border-blue-200/80 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
            >
              <Share size={11} />
              <span>{showDetails ? 'Hide' : 'Steps'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0 cursor-pointer"
            title="Dismiss for 1 week"
            aria-label="Dismiss banner"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="pt-1 pb-0.5 border-t border-blue-200/50 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap">
          {isIOS ? (
            <>
              <span>1. Tap Safari <strong>Share</strong> <Share size={11} className="inline text-[#2563EB]" /></span>
              <span>2. Choose <strong>Add to Home Screen</strong> <PlusSquare size={11} className="inline text-emerald-600" /></span>
              <span>3. Open full-screen from your Home Screen</span>
            </>
          ) : (
            <>
              <span>1. Open browser menu (<strong>⋮</strong>)</span>
              <span>2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong></span>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
