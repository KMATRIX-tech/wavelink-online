import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import { Sparkles, Heart, UserPlus, CheckCircle2, X } from 'lucide-react';

export type CelebrationType = 'post' | 'like' | 'follow';

interface CelebrationData {
  type: CelebrationType;
  title: string;
  message: string;
  icon: React.ReactNode;
  iconBg: string;
}

export function triggerCelebration(type: CelebrationType) {
  if (typeof window === 'undefined') return;
  const key = `wavelink_celebrated_${type}`;
  try {
    if (localStorage.getItem(key)) return; // Only celebrate once per milestone
    localStorage.setItem(key, '1');
  } catch {
    // ignore
  }

  triggerHaptic('success');
  window.dispatchEvent(new CustomEvent('wavelink:celebration', { detail: { type } }));
}

export const CelebrationBanner: React.FC = () => {
  const { language } = useLanguage();
  const [current, setCurrent] = useState<CelebrationData | null>(null);

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const type = (e as CustomEvent<{ type: CelebrationType }>).detail?.type;
      if (!type) return;

      let data: CelebrationData;
      if (type === 'post') {
        data = {
          type: 'post',
          title: language === 'sw' ? '🎉 Hongera! Chapisho lako limekamilika!' : '🎉 Congratulations! Your wave is live!',
          message:
            language === 'sw'
              ? 'Marafiki na familia sasa wanaweza kuona na kufurahia picha au video yako.'
              : 'Friends and family can now see, enjoy, and celebrate your moment.',
          icon: <Sparkles size={24} className="text-amber-500 animate-spin" />,
          iconBg: 'bg-amber-100 dark:bg-amber-950/60'
        };
      } else if (type === 'like') {
        data = {
          type: 'like',
          title: language === 'sw' ? '❤️ Umetuma Upendo!' : '❤️ You Shared Love!',
          message:
            language === 'sw'
              ? 'Asante kwa kumuunga mkono mtayarishaji huyu wa Afrika Mashariki.'
              : 'Thank you for encouraging and uplifting this creator.',
          icon: <Heart size={24} className="text-rose-500 fill-rose-500 animate-bounce" />,
          iconBg: 'bg-rose-100 dark:bg-rose-950/60'
        };
      } else {
        data = {
          type: 'follow',
          title: language === 'sw' ? '🌿 Umeungana na Rafiki Mpya!' : '🌿 You Connected with a Creator!',
          message:
            language === 'sw'
              ? 'Sasa utaona hadithi na machapisho yao mapya kwanza kwenye ukurasa wako.'
              : 'You will now see their latest stories and moments right in your feed.',
          icon: <UserPlus size={24} className="text-emerald-600 animate-pulse" />,
          iconBg: 'bg-emerald-100 dark:bg-emerald-950/60'
        };
      }

      setCurrent(data);

      const timer = setTimeout(() => {
        setCurrent(null);
      }, 5500);

      return () => clearTimeout(timer);
    };

    window.addEventListener('wavelink:celebration', handleEvent);
    return () => window.removeEventListener('wavelink:celebration', handleEvent);
  }, [language]);

  if (!current) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-18 sm:top-20 inset-x-0 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="pointer-events-auto max-w-md w-full bg-white dark:bg-stone-900 border-2 border-amber-300 dark:border-amber-700/60 rounded-3xl p-4 shadow-2xl flex items-start gap-3.5 text-stone-900 dark:text-stone-100">
        <div className={`w-12 h-12 rounded-2xl ${current.iconBg} flex items-center justify-center shrink-0`}>
          {current.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-extrabold text-sm sm:text-base text-stone-900 dark:text-stone-100 tracking-tight">
            {current.title}
          </h4>
          <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5 leading-relaxed">
            {current.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCurrent(null)}
          className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition cursor-pointer shrink-0"
          aria-label="Dismiss celebration"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
