import React, { useState } from 'react';
import {
  Camera,
  MessageCircle,
  Zap,
  ArrowRight,
  CheckCircle2,
  X
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FirstTimeTourModalProps {
  isOpen: boolean;
  onComplete?: () => void;
  onClose?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const FirstTimeTourModal: React.FC<FirstTimeTourModalProps> = ({
  isOpen,
  onComplete,
  onClose,
  onNavigateTab
}) => {
  const { language } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  if (!isOpen) return null;

  const finishTour = (targetTab?: string) => {
    try {
      localStorage.setItem('wavelink_tour_completed', '1');
      localStorage.setItem('wavelink_first_tour_completed', 'true');
      if (localStorage.getItem('wavelink_hint_bubbles_dismissed') !== '1') {
        localStorage.setItem('wavelink_show_hint_bubbles', '1');
      }
      window.dispatchEvent(new CustomEvent('wavelink:tour-completed'));
    } catch {
      // ignore storage errors
    }
    onComplete?.();
    onClose?.();
    if (targetTab && onNavigateTab) {
      onNavigateTab(targetTab);
    }
  };

  const steps = [
    {
      num: 1,
      badge: language === 'sw' ? '1 / 3 • Shiriki' : '1 / 3 • Share',
      title: language === 'sw' ? 'Shiriki' : 'Share',
      desc:
        language === 'sw'
          ? 'Chapisha picha, video, na Sparks kwa mguso mmoja.'
          : 'Post photos, videos, and 24-hour Sparks with one tap.',
      icon: <Camera size={34} className="text-white" />,
      iconBg: 'from-[#2563EB] to-[#0D9488]',
      chips:
        language === 'sw'
          ? ['📸 Picha', '🎬 Video', '⚡ Sparks']
          : ['📸 Photos', '🎬 Videos', '⚡ Sparks']
    },
    {
      num: 2,
      badge: language === 'sw' ? '2 / 3 • Soga' : '2 / 3 • Chat',
      title: language === 'sw' ? 'Soga' : 'Chat',
      desc:
        language === 'sw'
          ? 'Tuma ujumbe na piga simu bure na marafiki zako.'
          : 'Message and call friends for free with fun chat themes.',
      icon: <MessageCircle size={34} className="text-white" />,
      iconBg: 'from-[#0D9488] to-[#2563EB]',
      chips:
        language === 'sw'
          ? ['💬 Ujumbe', '📞 Simu Bure', '🎨 Mandhari']
          : ['💬 Messages', '📞 Free Calls', '🎨 Themes']
    },
    {
      num: 3,
      badge: language === 'sw' ? '3 / 3 • WavePoints' : '3 / 3 • WavePoints',
      title: language === 'sw' ? 'Pata WavePoints' : 'Earn WavePoints',
      desc:
        language === 'sw'
          ? 'Ingia kila siku na ushiriki machapisho kupata WavePoints.'
          : 'Check in daily and share posts to earn WavePoints.',
      icon: <Zap size={34} className="text-white" />,
      iconBg: 'from-[#D97706] to-[#2563EB]',
      chips:
        language === 'sw'
          ? ['⚡ +10 Kila Siku', '🏆 Beji', '🎁 Zawadi']
          : ['⚡ +10 Daily', '🏆 Badges', '🎁 Perks']
    }
  ];

  const current = steps[step - 1];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
        {/* Top Skip button */}
        <button
          type="button"
          onClick={() => finishTour()}
          className="absolute top-3.5 right-3.5 z-20 min-h-[44px] px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition cursor-pointer"
        >
          <span>{language === 'sw' ? 'Ruka' : 'Skip'}</span>
          <X size={14} />
        </button>

        {/* Top Soft Gradient Banner with Big Friendly Icon */}
        <div className="pt-9 pb-6 px-6 bg-gradient-to-b from-blue-500/10 via-teal-500/5 to-transparent flex flex-col items-center text-center">
          <div
            className={`w-20 h-20 rounded-3xl bg-gradient-to-tr ${current.iconBg} flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4`}
          >
            {current.icon}
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-blue-500/10 text-[#2563EB] dark:text-blue-400 mb-2">
            {current.badge}
          </span>

          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {current.title}
          </h2>

          <p className="text-base text-slate-600 dark:text-slate-300 mt-2 leading-snug max-w-xs">
            {current.desc}
          </p>
        </div>

        {/* Short Visual Pills */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
            {current.chips.map((chip) => (
              <span
                key={chip}
                className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 text-xs font-extrabold text-slate-800 dark:text-slate-100"
              >
                {chip}
              </span>
            ))}
          </div>

          {/* Step Dots */}
          <div className="flex items-center justify-center gap-2 mb-5">
            {[1, 2, 3].map((dot) => (
              <button
                key={dot}
                type="button"
                aria-label={`Step ${dot}`}
                onClick={() => setStep(dot as 1 | 2 | 3)}
                className={`h-2.5 rounded-full transition-all cursor-pointer ${
                  step === dot
                    ? 'w-8 bg-[#2563EB]'
                    : 'w-2.5 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Big Action Buttons */}
          <div className="flex items-center gap-2.5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                className="min-h-[50px] px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-base font-extrabold transition cursor-pointer"
              >
                {language === 'sw' ? 'Nyuma' : 'Back'}
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as 1 | 2 | 3)}
                className="flex-1 min-h-[50px] px-6 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-base font-extrabold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition cursor-pointer"
              >
                <span>{language === 'sw' ? 'Endelea' : 'Next'}</span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => finishTour('feed')}
                className="flex-1 min-h-[50px] px-6 py-3 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white text-base font-extrabold flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 active:scale-95 transition cursor-pointer"
              >
                <CheckCircle2 size={18} />
                <span>{language === 'sw' ? 'Anza Sasa' : 'Start'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
