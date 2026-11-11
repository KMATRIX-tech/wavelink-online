import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, X, ShieldCheck } from 'lucide-react';
import { subscribeQuotaState, clearQuotaExceededState } from '../firebase';
import { useLanguage } from '../context/LanguageContext';

interface QuotaExceededBannerProps {
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export const QuotaExceededBanner: React.FC<QuotaExceededBannerProps> = ({
  onRetry,
  className = '',
  compact = false
}) => {
  const { language } = useLanguage();
  const [isExceeded, setIsExceeded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const unsub = subscribeQuotaState((exceeded) => {
      setIsExceeded(exceeded);
      if (!exceeded) {
        setIsDismissed(false);
      }
    });

    const handleCustomEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ isExceeded: boolean }>).detail;
      if (detail && typeof detail.isExceeded === 'boolean') {
        setIsExceeded(detail.isExceeded);
      }
    };
    window.addEventListener('wavelink:quota-exceeded', handleCustomEvent);

    return () => {
      unsub();
      window.removeEventListener('wavelink:quota-exceeded', handleCustomEvent);
    };
  }, []);

  if (!isExceeded || isDismissed) {
    return null;
  }

  const isSw = language === 'sw';

  const handleRetry = async () => {
    setIsRetrying(true);
    clearQuotaExceededState();
    if (onRetry) {
      try {
        await Promise.resolve(onRetry());
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      setIsRetrying(false);
    }, 1200);
  };

  if (compact) {
    return (
      <div
        role="alert"
        className={`w-full p-2.5 px-3.5 rounded-xl bg-amber-50/95 border border-amber-200/90 text-amber-900 text-xs flex items-center justify-between gap-2 shadow-xs ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Database size={14} className="text-amber-600 shrink-0" />
          <span className="truncate font-medium">
            {isSw
              ? 'Hali ya nje ya mtandao: maudhui yaliyohifadhiwa yanaonyeshwa.'
              : 'Cached mode: browsing from local offline storage.'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="px-2 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-200 text-amber-950 font-semibold text-[11px] shrink-0 transition active:scale-95 cursor-pointer flex items-center gap-1"
        >
          <RefreshCw size={11} className={isRetrying ? 'animate-spin' : ''} />
          <span>{isSw ? 'Onyesha Upya' : 'Retry'}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`w-full rounded-2xl bg-linear-to-r from-amber-50 via-teal-50/40 to-blue-50/30 border border-amber-200/90 p-4 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
            <Database size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-stone-900 tracking-tight">
                {isSw
                  ? 'WaveLink Inatumia Hifadhi ya Kwenye Simu (Hali ya Nje ya Mtandao)'
                  : 'WaveLink is Running in Cached Offline Mode'}
              </h4>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100/80 text-teal-800">
                <ShieldCheck size={11} />
                {isSw ? 'Maudhui Yapo Salama' : 'Data Preserved'}
              </span>
            </div>
            <p className="text-xs text-stone-700 leading-relaxed max-w-2xl">
              {isSw
                ? 'Kikomo cha kila siku cha usomaji wa bure kimefikiwa kwa sasa. Hakuna kitakachopotea: machapisho yako yaliyohifadhiwa, jumbe, na maelezo bado yapo hapa kwenye simu yako. Data mpya itasasishwa mara tu kikomo kinapowekwa upya.'
                : 'The free daily database read quota has been reached. Don\'t worry! Your cached posts, stories, chats, and saved waves remain fully readable from local storage. New updates will refresh automatically when the daily quota resets.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition shrink-0 cursor-pointer"
          title={isSw ? 'Funga' : 'Dismiss'}
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 pt-2.5 border-t border-amber-200/50 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-stone-500 font-medium">
          {isSw
            ? 'Unaweza kuendelea kusoma machapisho na kutumia vipengele vyote vilivyohifadhiwa.'
            : 'You can continue reading posts, viewing profiles, and accessing offline data.'}
        </span>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer"
        >
          <RefreshCw size={13} className={isRetrying ? 'animate-spin' : ''} />
          <span>{isSw ? 'Jaribu Kuonyesha Upya' : 'Refresh / Retry'}</span>
        </button>
      </div>
    </div>
  );
};
