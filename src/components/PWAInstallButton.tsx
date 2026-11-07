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
                {isIOS ? 'Add to iPhone Home' : 'Install WaveLink App'}
              </div>
              <div className="text-[10px] text-slate-500 font-normal">
                {isIOS ? 'Unlock full screen & push alerts' : 'Fast home screen access'}
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
          title="Add WaveLink to Home Screen"
        >
          <Download size={14} />
          <span className="hidden sm:inline">{isIOS ? 'Add to iPhone' : 'Install App'}</span>
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
 * Friendly, dismissible Add to Home Screen Hint Card (especially helpful for iPhone users)
 */
export const AddToHomeScreenHintCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('wavelink_a2hs_hint_dismissed') === '1';
  });
  const [showDetails, setShowDetails] = useState(false);

  if (isInstalled || (dismissed && compact)) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('wavelink_a2hs_hint_dismissed', '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-teal-50 border border-blue-200/80 p-4 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs shrink-0 mt-0.5">
            <Smartphone size={18} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                {isIOS
                  ? 'Using an iPhone? Add WaveLink to your Home Screen'
                  : 'Install WaveLink on your Home Screen'}
              </h4>
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">
                Web App
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isIOS
                ? 'On iPhone, tap the Share button in Safari and choose "Add to Home Screen" so WaveLink opens full-screen and can deliver instant push notifications.'
                : 'Add WaveLink to your Home Screen for one-tap launch, smooth full-screen browsing, and reliable background push notifications.'}
            </p>

            {showDetails && isIOS && (
              <div className="mt-2.5 p-3 rounded-xl bg-white/90 border border-blue-200/70 space-y-2 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Share size={14} className="text-blue-600 shrink-0" />
                  <span>
                    <strong>Step 1:</strong> Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PlusSquare size={14} className="text-emerald-600 shrink-0" />
                  <span>
                    <strong>Step 2:</strong> Tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-500 shrink-0" />
                  <span>
                    <strong>Step 3:</strong> Open WaveLink from your Home Screen to enable push alerts!
                  </span>
                </div>
              </div>
            )}

            <div className="pt-1.5 flex items-center gap-2 flex-wrap">
              {canInstall ? (
                <button
                  type="button"
                  onClick={() => triggerInstall()}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                >
                  <Download size={13} />
                  <span>Add to Home Screen</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <Share size={13} />
                  <span>{showDetails ? 'Hide iPhone Steps' : 'See How on iPhone / Mobile'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {compact && (
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/60 transition shrink-0"
            title="Dismiss hint"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
