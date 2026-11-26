import React from 'react';
import {
  HelpCircle,
  X,
  Camera,
  MessageCircle,
  Zap,
  Palette,
  ShieldCheck,
  Sparkles,
  Bot
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
  onOpenTour?: () => void;
  onOpenAssistant?: () => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onStartTour,
  onOpenTour,
  onOpenAssistant,
  onOpenWelink
}) => {
  const { language } = useLanguage();

  if (!isOpen) return null;

  const handleTourClick = onStartTour || onOpenTour;
  const handleAssistantClick = onOpenAssistant || (onOpenWelink ? () => onOpenWelink('chat') : undefined);

  const shortAnswers = [
    {
      icon: <Camera size={18} className="text-[#2563EB]" />,
      title: language === 'sw' ? '1. Shiriki picha au video' : '1. Share a post',
      answer:
        language === 'sw'
          ? 'Bonyeza + kuchapisha picha, video, au Spark ya saa 24.'
          : 'Tap + to post a photo, video, or 24-hour Spark.'
    },
    {
      icon: <MessageCircle size={18} className="text-[#0D9488]" />,
      title: language === 'sw' ? '2. Soga na piga simu' : '2. Chat & call',
      answer:
        language === 'sw'
          ? 'Fungua Soga kutuma ujumbe au kupiga simu bure.'
          : 'Open Chat to message or call friends for free.'
    },
    {
      icon: <Zap size={18} className="text-[#D97706]" />,
      title: language === 'sw' ? '3. Pata WavePoints' : '3. Earn WavePoints',
      answer:
        language === 'sw'
          ? 'Ingia kila siku na uchapishe kupata WavePoints.'
          : 'Check in daily and share posts to earn WavePoints.'
    },
    {
      icon: <Palette size={18} className="text-pink-600" />,
      title: language === 'sw' ? '4. Badilisha mandhari' : '4. Change themes',
      answer:
        language === 'sw'
          ? 'Fungua Wasifu > Mandhari kuchagua rangi au picha.'
          : 'Open Profile > Themes to pick colors or a photo background.'
    },
    {
      icon: <ShieldCheck size={18} className="text-emerald-600" />,
      title: language === 'sw' ? '5. Usalama na faragha' : '5. Stay safe',
      answer:
        language === 'sw'
          ? 'Fungua Wasifu > Usalama kuwasha uthibitisho wa hatua 2.'
          : 'Open Profile > Security to turn on 2-step login or block anyone.'
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={language === 'sw' ? 'Msaada' : 'Help'}
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <HelpCircle size={22} />
            </div>
            <h2 className="font-extrabold text-lg">
              {language === 'sw' ? 'Msaada' : 'Help'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={language === 'sw' ? 'Funga' : 'Close'}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 5 Short Answers */}
        <div className="p-4 sm:p-5 space-y-2.5 max-h-[75vh] overflow-y-auto">
          {shortAnswers.map((item) => (
            <div
              key={item.title}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                  {item.answer}
                </p>
              </div>
            </div>
          ))}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            {handleTourClick && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  handleTourClick();
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/70 text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Sparkles size={16} />
                <span>{language === 'sw' ? 'Mafunzo' : 'Welcome Tour'}</span>
              </button>
            )}

            {handleAssistantClick && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  handleAssistantClick();
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 text-[#0D9488] dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/70 text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Bot size={16} />
                <span>{language === 'sw' ? 'Uliza WELINK' : 'Ask WELINK'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] mt-1 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm transition active:scale-95 cursor-pointer"
          >
            {language === 'sw' ? 'Sawa' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
