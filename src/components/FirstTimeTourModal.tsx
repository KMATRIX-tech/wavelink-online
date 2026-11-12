import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Heart,
  Camera,
  MessageSquare,
  CheckCircle2,
  Smile
} from 'lucide-react';

interface FirstTimeTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirstTimeTourModal: React.FC<FirstTimeTourModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const tourSteps = [
    {
      badge: language === 'sw' ? 'Hatua ya 1 kati ya 3' : 'Step 1 of 3',
      title: language === 'sw' ? 'Karibu WaveLink! 🌿' : 'Welcome to WaveLink! 🌿',
      subtitle:
        language === 'sw'
          ? 'Nyumbani kwa marafiki, picha na video za kufurahisha'
          : 'Your friendly home for friends, photos, and joyful stories',
      description:
        language === 'sw'
          ? 'Tazama machapisho ya marafiki zako, gundua wabunifu wa Afrika Mashariki, na ushiriki wakati wako wa kila siku kwa urahisi kabisa.'
          : 'See posts from your family and friends, explore East African creators, and share your everyday moments with zero hassle.',
      icon: <Heart size={36} className="text-[#2563EB]" />,
      iconBg: 'bg-blue-100 dark:bg-blue-950/60',
      highlightText:
        language === 'sw'
          ? '✨ Ni bure kabisa na rahisi kutumia kama WhatsApp na Facebook!'
          : '✨ Completely free and as easy to use as WhatsApp and Facebook!'
    },
    {
      badge: language === 'sw' ? 'Hatua ya 2 kati ya 3' : 'Step 2 of 3',
      title: language === 'sw' ? 'Shiriki Picha, Video na Hisia 📷' : 'Share Photos, Videos & Feelings 📷',
      subtitle:
        language === 'sw'
          ? 'Gusa kisanduku kilicho juu kuanza kuchapisha'
          : 'Just tap the friendly box at the top to share',
      description:
        language === 'sw'
          ? 'Weka picha ya familia, video fupi ya siku yako, au chagua jinsi unavyojisikia (kama mwenye furaha au aliyebarikiwa).'
          : 'Post a family photo, a short clip of your day, or pick how you are feeling (like happy 😊 or blessed 🙏) for your friends to see.',
      icon: <Camera size={36} className="text-[#0D9488]" />,
      iconBg: 'bg-teal-100 dark:bg-teal-950/60',
      highlightText:
        language === 'sw'
          ? '💡 Tumia vitufe vikubwa vya Picha, Video na Hisia vilivyo juu ya ukurasa.'
          : '💡 Use the big Photo, Video, and Feeling buttons right at the top of Home.'
    },
    {
      badge: language === 'sw' ? 'Hatua ya 3 kati ya 3' : 'Step 3 of 3',
      title: language === 'sw' ? 'Soga Bure na Hali Rahisi 💬' : 'Free Chat & Simple Mode 💬',
      subtitle:
        language === 'sw'
          ? 'Wasiliana na marafiki bila kulipia'
          : 'Stay connected with big buttons and clear text',
      description:
        language === 'sw'
          ? 'Tuma ujumbe wa bure kwenye Chat, tazama Reels za kuchekesha, na ukipenda unaweza kuwasha "Hali Rahisi" kwenye Wasifu kwa maandishi makubwa zaidi!'
          : 'Send free messages to any friend in Messages, watch funny short Reels, and switch on "Simple Mode" in Settings anytime for extra large text!',
      icon: <Smile size={36} className="text-[#D97706]" />,
      iconBg: 'bg-amber-100 dark:bg-amber-950/60',
      highlightText:
        language === 'sw'
          ? '🎉 Ukiwa na swali lolote, gusa kitufe cha Msaada au muulize WELINK!'
          : '🎉 If you ever need help, just tap the Help button or ask WELINK!'
    }
  ];

  const step = tourSteps[currentStep];

  const handleNext = () => {
    triggerHaptic('light');
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep((p) => p + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    triggerHaptic('light');
    if (currentStep > 0) {
      setCurrentStep((p) => p - 1);
    }
  };

  const handleComplete = () => {
    triggerHaptic('medium');
    try {
      localStorage.setItem('wavelink_tour_completed', '1');
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome Tour"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-stone-900 dark:text-stone-100 flex flex-col justify-between min-h-[460px]">
        {/* Top Header: Badge & Skip Button */}
        <div className="flex items-center justify-between">
          <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#2563EB] text-xs font-extrabold border border-blue-200/60 dark:border-blue-900/50">
            {step.badge}
          </span>
          <button
            type="button"
            onClick={handleComplete}
            className="text-xs font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 py-1 px-2.5 rounded-lg transition cursor-pointer"
          >
            {language === 'sw' ? 'Ruka (Skip)' : 'Skip tour'}
          </button>
        </div>

        {/* Center: Friendly Visual Illustration & Copy */}
        <div className="py-4 my-auto text-center space-y-4">
          <div className={`w-20 h-20 rounded-3xl ${step.iconBg} mx-auto flex items-center justify-center shadow-inner`}>
            {step.icon}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] dark:text-stone-100 tracking-tight">
              {step.title}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-[#0D9488]">
              {step.subtitle}
            </p>
          </div>

          <p className="text-sm text-stone-600 dark:text-stone-300 max-w-md mx-auto leading-relaxed">
            {step.description}
          </p>

          <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300">
            {step.highlightText}
          </div>
        </div>

        {/* Bottom Bar: Indicators & Big Arrows Navigation */}
        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3">
          {/* Step Dots */}
          <div className="flex items-center gap-1.5">
            {tourSteps.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-[#2563EB]'
                    : 'w-2 bg-stone-200 dark:bg-stone-700'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons with Big Arrows */}
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="min-h-[48px] px-4 rounded-2xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 font-bold text-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">{language === 'sw' ? 'Nyuma' : 'Back'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="min-h-[48px] px-6 rounded-2xl bg-[#2563EB] hover:bg-blue-700 text-white font-extrabold text-sm flex items-center gap-2 shadow-md shadow-blue-600/20 transition active:scale-95 cursor-pointer"
            >
              <span>
                {currentStep === tourSteps.length - 1
                  ? language === 'sw'
                    ? 'Anza Sasa! 🎉'
                    : "Let's Go! 🎉"
                  : language === 'sw'
                  ? 'Mbele'
                  : 'Next'}
              </span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
