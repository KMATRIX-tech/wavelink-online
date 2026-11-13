import React, { useEffect, useState } from 'react';
import { Bell, X, Share, PlusSquare, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getBrowserNotificationPermission,
  isIOSDevice,
  isStandalonePWA,
  requestPushPermissionAndSaveToken
} from '../services/fcmService';

const PROMPT_DISMISSED_KEY = 'wavelink_push_prompt_snooze_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const PushNotificationPrompt: React.FC = () => {
  const { currentUser, userProfile, showGlobalToast } = useAuth();
  const [visible, setVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const isIOS = isIOSDevice();
  const isStandalone = isStandalonePWA();
  const needsIOSHomeScreen = isIOS && !isStandalone;

  useEffect(() => {
    if (!currentUser?.uid || !userProfile) return;

    const permission = getBrowserNotificationPermission();
    // Only prompt gently if permission has not been decided yet, or if iOS needs Add to Home Screen
    if (permission === 'granted' || permission === 'denied') return;
    if (permission === 'unsupported' && !needsIOSHomeScreen) return;

    try {
      const snoozeUntil = Number(localStorage.getItem(PROMPT_DISMISSED_KEY) || '0');
      if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) return;
    } catch {
      // ignore storage errors
    }

    // Never prompt on initial load — wait patiently after sign-in
    const timer = setTimeout(() => {
      setVisible(true);
    }, 8000);

    return () => clearTimeout(timer);
  }, [currentUser?.uid, userProfile, needsIOSHomeScreen]);

  if (!visible || !currentUser?.uid) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // ignore
    }
  };

  const handleTurnOn = async () => {
    setIsEnabling(true);
    setErrorText(null);
    try {
      const res = await requestPushPermissionAndSaveToken(currentUser.uid);
      if (res.success) {
        setVisible(false);
        showGlobalToast('Notifications turned on! You will get alerts even when WaveLink is closed.');
      } else {
        setErrorText(res.error || 'Could not enable notifications on this device.');
        if (res.permission === 'denied') {
          setTimeout(() => setVisible(false), 3500);
        }
      }
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Turn on notifications"
      className="fixed bottom-20 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl p-4 text-[var(--text-primary)] animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/12 text-blue-600 flex items-center justify-center shrink-0">
          <Bell size={20} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-extrabold leading-snug">Turn on notifications</h4>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close notification prompt"
              className="p-1 -mt-1 -mr-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            {needsIOSHomeScreen
              ? 'On iPhone, tap Share then Add to Home Screen first so WaveLink can send you message and call alerts.'
              : 'Get instant alerts on your phone for new messages, calls, and replies—even when WaveLink is closed.'}
          </p>

          {needsIOSHomeScreen && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 text-[11px] text-[var(--text-secondary)] space-y-1">
              <div className="flex items-center gap-1.5">
                <Share size={12} className="text-blue-600 shrink-0" />
                <span>1. Tap <strong>Share</strong> in Safari</span>
              </div>
              <div className="flex items-center gap-1.5">
                <PlusSquare size={12} className="text-emerald-600 shrink-0" />
                <span>2. Tap <strong>Add to Home Screen</strong>, then open WaveLink from your Home Screen</span>
              </div>
            </div>
          )}

          {errorText && (
            <p className="mt-2 text-[11px] font-semibold text-rose-600 leading-snug">
              {errorText}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            {!needsIOSHomeScreen && (
              <button
                type="button"
                onClick={handleTurnOn}
                disabled={isEnabling}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                {isEnabling ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                <span>{isEnabling ? 'Turning on...' : 'Turn on'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/8 dark:hover:bg-white/14 text-xs font-bold text-[var(--text-secondary)] transition cursor-pointer"
            >
              {needsIOSHomeScreen ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
