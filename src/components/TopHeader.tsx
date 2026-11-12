import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDataSaver } from '../services/dataSaverService';
import { useAfricanRegion, AFRICAN_COUNTRIES, KANGA_PATTERN_FRAMES } from '../utils/africanCultureConfig';
import { ActiveTab, AfricanCountryCode } from '../types';
import { triggerHaptic } from '../utils/haptics';
import {
  Waves,
  Sparkles,
  Mic,
  WifiOff,
  UserPlus,
  Search,
  Bell,
  Plus,
  Check,
  Zap,
  Globe,
  HelpCircle,
  Compass,
  X
} from 'lucide-react';
import { inviteFriends } from '../utils/share.js';
import { GlobalSearchBar } from './GlobalSearchBar';
import { Avatar } from './Avatar';

interface TopHeaderProps {
  activeTab: ActiveTab;
  onOpenMobileMenu?: () => void;
  onNavigateTab?: (tab: ActiveTab) => void;
  onStartChat?: (userId: string) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
  hasUnreadNotifications?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onNavigateTab,
  onStartChat,
  onSelectHashtag,
  onOpenWelink,
  hasUnreadNotifications = false
}) => {
  const { currentUser, userProfile, updateUserProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { enabled: isDataSaverOn, setEnabled: toggleDataSaver, formattedSaved } = useDataSaver();
  const { countryMeta, setCountryCode, patternFrame } = useAfricanRegion(userProfile);

  const activeFrameClass =
    KANGA_PATTERN_FRAMES.find((f) => f.id === patternFrame)?.cssClass || '';

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Dropdown states for right cluster
  const [isLangCountryOpen, setIsLangCountryOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const langCountryRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (langCountryRef.current && !langCountryRef.current.contains(target)) {
        setIsLangCountryOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setIsMoreMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Online / Offline listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pointsCount = (userProfile?.wavePoints ?? 15).toLocaleString();

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] safe-area-top transition-all">
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-amber-500 text-white px-3 py-1 text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <WifiOff size={13} className="shrink-0 animate-pulse" />
          <span>{t('header.offlineNotice')}</span>
        </div>
      )}

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* 1. Left: Single Logo & Brand Mark */}
          <div
            onClick={() => {
              triggerHaptic('tab');
              if (onNavigateTab) onNavigateTab('feed');
            }}
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
            role="button"
            tabIndex={0}
            aria-label="WaveLink Home"
          >
            <div className="w-8 h-8 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
              <Waves size={16} />
            </div>
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#1C1917] dark:text-stone-100">
              Wave<span className="text-[#2563EB]">Link</span>
            </span>
          </div>

          {/* 2. Center: One Search Box that expands when tapped */}
          <div
            ref={searchContainerRef}
            className={`transition-all duration-200 ${
              isSearchExpanded
                ? 'flex-1 max-w-lg'
                : 'flex-1 max-w-xs sm:max-w-sm md:max-w-md'
            }`}
          >
            <div
              onClick={() => setIsSearchExpanded(true)}
              className="w-full"
            >
              <GlobalSearchBar
                onNavigateTab={(tab) => {
                  setIsSearchExpanded(false);
                  if (onNavigateTab) onNavigateTab(tab);
                }}
                onStartChat={(uid) => {
                  setIsSearchExpanded(false);
                  if (onStartChat) onStartChat(uid);
                }}
                onSelectHashtag={(tag) => {
                  setIsSearchExpanded(false);
                  if (onSelectHashtag) onSelectHashtag(tag);
                }}
              />
            </div>
          </div>

          {/* 3. Right: Exactly 5 items visible (Points Chip, Country/Lang, More Menu, Bell, Avatar) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Item 1: Points Chip */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (onNavigateTab) onNavigateTab('settings');
              }}
              title={`${pointsCount} WavePoints`}
              className="min-h-[38px] px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60 text-xs font-extrabold flex items-center gap-1 transition active:scale-95 cursor-pointer"
            >
              <Sparkles size={13} className="text-amber-600 shrink-0" />
              <span className="tabular-nums">{pointsCount}</span>
              <span className="hidden sm:inline text-[10px] text-amber-700/80 font-bold">pts</span>
            </button>

            {/* Item 2: Small Country & Language Choice Menu */}
            <div className="relative" ref={langCountryRef}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsLangCountryOpen((prev) => !prev);
                  setIsMoreMenuOpen(false);
                }}
                className="min-h-[38px] px-2 sm:px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 text-xs font-extrabold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                title={`${countryMeta.flag} ${countryMeta.nameEn} · ${language === 'sw' ? 'Kiswahili' : 'English'}`}
                aria-label="Country and Language"
                aria-expanded={isLangCountryOpen}
              >
                <span>{countryMeta.flag}</span>
                <span className="text-[11px] font-bold">{language.toUpperCase()}</span>
              </button>

              {isLangCountryOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl p-3 z-50 animate-in fade-in space-y-3">
                  {/* Language switch */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                      {t('lang.title')}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setLanguage('en');
                          updateUserProfile({ language: 'en' }).catch(() => {});
                          setIsLangCountryOpen(false);
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                          language === 'en'
                            ? 'bg-[#2563EB] text-white shadow-2xs'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                        }`}
                      >
                        {language === 'en' && <Check size={12} />}
                        <span>English</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLanguage('sw');
                          updateUserProfile({ language: 'sw' }).catch(() => {});
                          setIsLangCountryOpen(false);
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                          language === 'sw'
                            ? 'bg-[#0D9488] text-white shadow-2xs'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                        }`}
                      >
                        {language === 'sw' && <Check size={12} />}
                        <span>Kiswahili</span>
                      </button>
                    </div>
                  </div>

                  {/* Country & Region Picker */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                      Select Country & Currency
                    </span>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {AFRICAN_COUNTRIES.map((c) => {
                        const isSelected = c.code === countryMeta.code;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCountryCode(c.code as AfricanCountryCode);
                              updateUserProfile({
                                countryCode: c.code,
                                preferredCurrency: c.defaultCurrency
                              }).catch(() => {});
                              setIsLangCountryOpen(false);
                            }}
                            className={`w-full py-1.5 px-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0D9488] font-bold'
                                : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span>{language === 'sw' ? c.nameSw : c.nameEn}</span>
                            </span>
                            <span className="text-[10px] text-stone-400 font-mono">
                              {c.defaultCurrency}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Item 3: ‘+’ or ‘More’ Menu (Houses Live Talk, WELINK AI, Invite Friends, Data Saver) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsMoreMenuOpen((prev) => !prev);
                  setIsLangCountryOpen(false);
                }}
                className="min-h-[38px] min-w-[38px] p-2 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 text-xs font-bold flex items-center justify-center transition active:scale-95 cursor-pointer"
                title={t('header.more')}
                aria-label={t('header.more')}
                aria-expanded={isMoreMenuOpen}
              >
                <Plus size={16} />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl p-2 z-50 animate-in fade-in space-y-1">
                  {onOpenWelink && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          onOpenWelink('voice');
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40 text-left text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-[#0D9488] flex items-center justify-center shrink-0">
                          <Mic size={14} />
                        </div>
                        <div>
                          <div className="font-bold">{t('header.liveTalk')}</div>
                          <div className="text-[10px] text-stone-400">Voice talk with WELINK</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          onOpenWelink('chat');
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 text-left text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#2563EB] flex items-center justify-center shrink-0">
                          <Sparkles size={14} />
                        </div>
                        <div>
                          <div className="font-bold">{t('header.welinkAi')}</div>
                          <div className="text-[10px] text-stone-400">AI Creator assistant</div>
                        </div>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      inviteFriends();
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-left text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center shrink-0">
                      <UserPlus size={14} />
                    </div>
                    <div>
                      <div className="font-bold">{t('nav.inviteFriends')}</div>
                      <div className="text-[10px] text-stone-400">Share via WhatsApp</div>
                    </div>
                  </button>

                  <div className="pt-1 mt-1 border-t border-stone-100 dark:border-stone-800 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        window.dispatchEvent(new CustomEvent('wavelink:open-help'));
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40 text-left text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-[#0D9488] flex items-center justify-center shrink-0">
                        <HelpCircle size={14} />
                      </div>
                      <div>
                        <div className="font-bold">{language === 'sw' ? 'Msaada na Maswali' : 'Help & Answers'}</div>
                        <div className="text-[10px] text-stone-400">Quick guides & assistance</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        window.dispatchEvent(new CustomEvent('wavelink:open-tour'));
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 text-left text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#2563EB] flex items-center justify-center shrink-0">
                        <Compass size={14} />
                      </div>
                      <div>
                        <div className="font-bold">{language === 'sw' ? 'Nionyeshe Jinsi ya Kutumia' : 'Show me around'}</div>
                        <div className="text-[10px] text-stone-400">3-step friendly tour</div>
                      </div>
                    </button>
                  </div>

                  <div className="pt-1 mt-1 border-t border-stone-100 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => {
                        toggleDataSaver();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-left text-xs flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isDataSaverOn ? 'bg-teal-100 text-[#0D9488]' : 'bg-stone-100 text-stone-500'
                        }`}>
                          <Zap size={14} />
                        </div>
                        <div>
                          <div className="font-bold text-stone-800 dark:text-stone-200">
                            {isDataSaverOn ? t('datasaver.on') : t('datasaver.off')}
                          </div>
                          <div className="text-[10px] text-stone-400">{formattedSaved}</div>
                        </div>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${isDataSaverOn ? 'bg-[#0D9488]' : 'bg-stone-300'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Item 4: Notifications Bell */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (onNavigateTab) onNavigateTab('announcements');
              }}
              className="relative min-h-[38px] min-w-[38px] p-2 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 flex items-center justify-center transition active:scale-95 cursor-pointer"
              title={t('header.notifications')}
              aria-label={t('header.notifications')}
            >
              <Bell size={16} />
              {hasUnreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#F43F5E] ring-2 ring-white dark:ring-stone-900" />
              )}
            </button>

            {/* Item 5: Profile Avatar */}
            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tab');
                  if (onNavigateTab) onNavigateTab('settings');
                }}
                className={`relative w-9 h-9 min-w-[36px] min-h-[36px] rounded-full focus:outline-none ring-2 ring-transparent hover:ring-[#2563EB]/20 transition shrink-0 flex items-center justify-center cursor-pointer ${activeFrameClass}`}
                title="Profile"
                aria-label="Profile"
              >
                <Avatar
                  uid={currentUser.uid}
                  src={
                    userProfile?.photoURL ||
                    currentUser?.photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`
                  }
                  alt="Profile"
                  fallbackName={userProfile?.displayName || currentUser.displayName || 'Waver'}
                  size={36}
                  showStatus={true}
                  onlyWhenVisible={false}
                  targetProfile={userProfile}
                  ringClassName="border border-stone-200 dark:border-stone-700"
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
