import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import {
  HelpCircle,
  X,
  Sparkles,
  Mic,
  ChevronDown,
  ChevronUp,
  Compass,
  MessageCircle,
  CheckCircle2
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
  onOpenTour?: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onOpenWelink,
  onOpenTour
}) => {
  const { language } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!isOpen) return null;

  const faqs = [
    {
      q:
        language === 'sw'
          ? 'Ninawezaje kuweka picha au video?'
          : 'How do I share a photo or video?',
      a:
        language === 'sw'
          ? 'Kwenye ukurasa wa Mwanzo (Home), gusa kisanduku kikubwa kilicho juu kinachosema "Shiriki kitu na marafiki zako", chagua kitufe cha Picha au Video, kisha gusa "Chapisha".'
          : 'At the top of Home, tap the big box that says "Share something with your friends", tap Photo or Video, select your file, and tap "Post Wave".'
    },
    {
      q:
        language === 'sw'
          ? 'Je, kutuma ujumbe kwenye Chat ni bure?'
          : 'Is sending messages free on WaveLink?',
      a:
        language === 'sw'
          ? 'Ndio! Kutuma ujumbe na kupiga soga na rafiki yeyote kwenye WaveLink ni bure kabisa.'
          : 'Yes! Sending messages, chatting, and connecting with friends on WaveLink is 100% free.'
    },
    {
      q:
        language === 'sw'
          ? 'Sparks ni nini?'
          : 'What are Sparks?',
      a:
        language === 'sw'
          ? 'Sparks ni picha au video fupi za matukio ya siku yako zinazodumu kwa saa 24 kisha hupotea, sawa na Status kwenye WhatsApp.'
          : 'Sparks are fun 24-hour moments that disappear after a day, just like WhatsApp Status or Instagram Stories.'
    },
    {
      q:
        language === 'sw'
          ? 'Hali Rahisi (Simple Mode) inasaidia nini?'
          : 'What is Simple Mode?',
      a:
        language === 'sw'
          ? 'Hali Rahisi hufanya maandishi na vitufe kuwa vikubwa zaidi na huficha menyu ngumu, ikikupa ukurasa mwepesi na rahisi kutumia.'
          : 'Simple Mode makes all text and buttons larger and hides advanced menus, creating a calm, high-contrast experience perfect for parents and easy everyday browsing.'
    },
    {
      q:
        language === 'sw'
          ? 'Nabadilishaje kati ya Kiswahili na Kiingereza?'
          : 'How do I change language between English and Kiswahili?',
      a:
        language === 'sw'
          ? 'Gusa bendera ya nchi na herufi za lugha (kama 🇹🇿 SW) zilizo juu kulia mwa ukurasa ili kuchagua Kiswahili au Kiingereza papo hapo.'
          : 'Tap the country flag and language icon (like 🇹🇿 SW or 🇰🇪 EN) at the top right of the header to switch languages instantly.'
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help and Answers"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-2xl relative text-stone-900 dark:text-stone-100 max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-[#0D9488] flex items-center justify-center shrink-0">
              <HelpCircle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1C1917] dark:text-stone-100">
                {language === 'sw' ? 'Msaada na Maswali' : 'Help & Friendly Answers'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {language === 'sw' ? 'Majibu mafupi na msaidizi wa WELINK' : 'Simple answers and friendly guidance'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable FAQ Accordion */}
        <div className="flex-1 overflow-y-auto py-4 space-y-2.5 pr-1">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-stone-50/60 dark:bg-stone-800/40 transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full p-3.5 text-left flex items-center justify-between gap-2 font-bold text-xs sm:text-sm text-stone-800 dark:text-stone-200 hover:text-[#2563EB] transition cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} className="shrink-0 text-stone-400" /> : <ChevronDown size={16} className="shrink-0 text-stone-400" />}
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3.5 pt-0 text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed border-t border-stone-100 dark:border-stone-700/50 pt-2.5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Actions: Ask WELINK + Show Me Around */}
        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-2 shrink-0">
          {onOpenWelink && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWelink('chat');
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-[#2563EB] font-extrabold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Sparkles size={14} />
                <span>{language === 'sw' ? 'Muulize WELINK' : 'Ask WELINK'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWelink('voice');
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 text-[#0D9488] font-extrabold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Mic size={14} />
                <span>{language === 'sw' ? 'Ongea na WELINK' : 'Voice with WELINK'}</span>
              </button>
            </div>
          )}

          {onOpenTour && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTour();
              }}
              className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Compass size={15} />
              <span>{language === 'sw' ? 'Nionyeshe Jinsi ya Kutumia (Show me around)' : 'Show me around (Quick Tour)'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
