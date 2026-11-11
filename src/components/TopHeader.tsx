import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useDataSaver } from '../services/dataSaverService';
import { useAfricanRegion, KANGA_PATTERN_FRAMES } from '../utils/africanCultureConfig';
import { ActiveTab } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { Waves, Sparkles, Mic, Wifi, WifiOff, BatteryCharging, UserPlus, Search, Globe, Zap } from 'lucide-react';
import { inviteFriends } from '../utils/share.js';
import { GlobalSearchBar } from './GlobalSearchBar';
import { CompactPointsDisplay } from './CompactPointsDisplay';

interface TopHeaderProps {
  activeTab: ActiveTab;
  onOpenMobileMenu: () => void;
  onNavigateTab?: (tab: ActiveTab) => void;
  onStartChat?: (userId: string) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
  hasUnreadNotifications?: boolean;
}

const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string; tKey: string }> = {
  feed: { title: 'WaveLink', subtitle: 'Community social feed', tKey: 'nav.home' },
  trending: { title: 'Trending & Challenges', subtitle: 'Fastest growing tags & weekly challenges', tKey: 'nav.trending' },
  studio: { title: 'Create', subtitle: 'Share a photo, clip, or story', tKey: 'nav.create' },
  videos: { title: 'Reels', subtitle: 'Watch community videos', tKey: 'nav.reels' },
  announcements: { title: 'Notice Board', subtitle: 'Community events & gatherings', tKey: 'nav.announcements' },
  chat: { title: 'Messages', subtitle: 'Chat with friends', tKey: 'nav.chat' },
  directory: { title: 'Members', subtitle: 'Community directory', tKey: 'nav.members' },
  analytics: { title: 'Stats', subtitle: 'Post reach & impressions', tKey: 'nav.analytics' },
  monetization: { title: 'Support & Tipping', subtitle: 'Creator economy & membership', tKey: 'nav.monetization' },
  admin: { title: 'Admin Panel', subtitle: 'Community management', tKey: 'nav.admin' },
  settings: { title: 'Profile', subtitle: 'Account preferences & Pro', tKey: 'nav.profile' }
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onNavigateTab,
  onStartChat,
  onSelectHashtag,
  onOpenWelink,
  hasUnreadNotifications = false
}) => {
  const { currentUser, userProfile, isProEffective, isExemptFromPayments, updateUserProfile } = useAuth();
  const { isBatterySaver } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { enabled: isDataSaverOn, formattedSaved } = useDataSaver();
  const { countryMeta, patternFrame } = useAfricanRegion(userProfile);
  const activeFrameClass =
    KANGA_PATTERN_FRAMES.find((f) => f.id === patternFrame)?.cssClass || '';
  const isProUser = isProEffective || isExemptFromPayments;
  const currentTabInfo = TAB_TITLES[activeTab] || { title: 'WaveLink', subtitle: 'Community', tKey: 'nav.home' };

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState<boolean>(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        setJustReconnected(false);
      }, 3500);
    };

    const handleOffline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setIsOnline(false);
      setJustReconnected(false);
    };

    // Active network status check: runs more frequently in Battery Saver mode (every 6s vs 25s)
    // while foregrounded so dropped connections are detected immediately without wasted background retries.
    const checkNetworkStatusNow = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const currentNavigatorStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline((prev) => {
        if (!prev && currentNavigatorStatus) {
          setJustReconnected(true);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => setJustReconnected(false), 3500);
        } else if (prev && !currentNavigatorStatus) {
          setJustReconnected(false);
        }
        return currentNavigatorStatus;
      });
    };

    const pollIntervalMs = isBatterySaver ? 6000 : 25000;
    const statusPollTimer = setInterval(checkNetworkStatusNow, pollIntervalMs);

    const conn = (navigator as any)?.connection;
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', checkNetworkStatusNow);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', checkNetworkStatusNow);

    return () => {
      clearInterval(statusPollTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', checkNetworkStatusNow);
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', checkNetworkStatusNow);
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [isBatterySaver]);

  return (
    <header className="sticky top-0 z-20 w-full max-w-full bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] safe-area-top transition-all block">
      {/* Immediate slim banner when connection is lost */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-amber-500/95 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-2xs"
        >
          <WifiOff size={13} className="shrink-0 animate-pulse" />
          <span>{t('header.offlineNotice')}</span>
        </div>
      )}

      {/* Mobile Search Overlay Bar */}
      {isMobileSearchOpen && (
        <div className="sm:hidden px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-2 animate-in fade-in">
          <div className="flex-1 min-w-0">
            <GlobalSearchBar
              onNavigateTab={(tab) => {
                setIsMobileSearchOpen(false);
                if (onNavigateTab) onNavigateTab(tab);
              }}
              onStartChat={(userId) => {
                setIsMobileSearchOpen(false);
                if (onStartChat) onStartChat(userId);
              }}
              onSelectHashtag={(tag) => {
                setIsMobileSearchOpen(false);
                if (onSelectHashtag) onSelectHashtag(tag);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen(false)}
            className="px-2 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 block">
        <div className="flex items-center justify-between min-h-[3.5rem] sm:min-h-[4rem] gap-2 sm:gap-3">
          {/* Left: View Title, Calm Brand & Subtle Connection Indicator */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div
              onClick={() => {
                triggerHaptic('tab');
                if (onNavigateTab) onNavigateTab('feed');
              }}
              className="flex items-center gap-2 cursor-pointer select-none shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
                <Waves size={18} />
              </div>
              <span className="font-extrabold text-base tracking-tight text-[#1C1917] hidden sm:inline">
                Wave<span className="text-[#2563EB]">Link</span>
              </span>
            </div>

            <div className="flex flex-col min-w-0 ml-0.5 sm:ml-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h1 className="font-bold text-base sm:text-lg text-[#1C1917] tracking-tight truncate">
                  {activeTab === 'feed' ? 'WaveLink' : t(currentTabInfo.tKey)}
                </h1>
                {isProUser && (
                  <span className="text-[11px] font-semibold text-[#0D9488] bg-[#CCFBF1] px-2 py-0.5 rounded-full shrink-0">
                    Pro
                  </span>
                )}

                {/* Subtle Online / Offline Connection Status Indicator */}
                <div
                  role="status"
                  aria-live="polite"
                  title={
                    isOnline
                      ? isBatterySaver
                        ? 'Connected • Fast network checks active (Battery Saver)'
                        : 'Connected to network'
                      : 'Offline — network connection lost'
                  }
                  className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors select-none shrink-0 ${
                    !isOnline
                      ? 'bg-amber-50 text-amber-800 border border-amber-200/90'
                      : justReconnected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                        : 'text-[#78716C] bg-transparent'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      !isOnline
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-emerald-500'
                    }`}
                  />
                  {!isOnline ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <WifiOff size={11} className="shrink-0" />
                      <span className="hidden xs:inline">{t('header.offline')}</span>
                    </span>
                  ) : justReconnected ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Wifi size={11} className="shrink-0" />
                      <span className="hidden xs:inline">{t('header.backOnline')}</span>
                    </span>
                  ) : (
                    <span className="hidden lg:inline text-[11px] text-[#78716C]">
                      {t('header.online')}
                    </span>
                  )}
                </div>

                {isDataSaverOn && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('settings')}
                    title={`${t('datasaver.title')}: ${formattedSaved}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-[#0D9488] border border-teal-200/80 text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    <Zap size={11} className="shrink-0" />
                    <span className="hidden md:inline">{t('datasaver.badge')} • {formattedSaved}</span>
                    <span className="md:hidden">{formattedSaved}</span>
                  </button>
                )}

                {isBatterySaver && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('settings')}
                    title="Battery Saver Mode Active — reduced animations & optimized network checks"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-[#0D9488] border border-emerald-200/80 text-[11px] font-semibold shrink-0"
                  >
                    <BatteryCharging size={12} className="shrink-0" />
                    <span className="hidden sm:inline">Saver</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-2 hidden sm:block">
            <GlobalSearchBar
              onNavigateTab={(tab) => {
                triggerHaptic('tab');
                if (onNavigateTab) onNavigateTab(tab);
              }}
              onStartChat={onStartChat}
              onSelectHashtag={onSelectHashtag}
            />
          </div>

          {/* Right: Non-floating WELINK Guide & Live Voice Buttons, Points & Profile Shortcut */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Search Trigger Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsMobileSearchOpen((prev) => !prev);
              }}
              aria-label="Search people, posts, or tags"
              title="Search people, posts, or tags"
              className="sm:hidden min-h-[38px] min-w-[38px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition flex items-center justify-center cursor-pointer"
            >
              <Search size={16} />
            </button>
            {onOpenWelink && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenWelink('voice');
                  }}
                  className="min-h-[42px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0D9488] border border-teal-200/80 text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95"
                  title="Talk Live with WELINK"
                >
                  <Mic size={14} className="text-[#0D9488] shrink-0" />
                  <span className="hidden md:inline">Live Talk</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenWelink('chat');
                  }}
                  className="min-h-[42px] px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                  title="Open WELINK AI Guide"
                >
                  <Sparkles size={14} className="text-[#0D9488] shrink-0" />
                  <span className="hidden sm:inline">WELINK AI</span>
                </button>
              </>
            )}

            {/* Country Flag & Region Quick Badge */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (onNavigateTab) onNavigateTab('settings');
              }}
              className="min-h-[38px] px-2 py-1.5 rounded-xl bg-amber-50/80 hover:bg-amber-100/80 text-stone-800 border border-amber-200/80 text-xs font-extrabold flex items-center gap-1 transition active:scale-95 cursor-pointer"
              title={`${countryMeta.flag} ${countryMeta.nameEn} • ${countryMeta.defaultCurrency}`}
            >
              <span>{countryMeta.flag}</span>
              <span className="hidden md:inline">{countryMeta.code}</span>
            </button>

            {/* Phase 2: Quick Language Switch (English / Kiswahili) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                const nextLang = language === 'sw' ? 'en' : 'sw';
                setLanguage(nextLang);
                updateUserProfile({ language: nextLang }).catch(() => {});
              }}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 text-xs font-extrabold flex items-center gap-1 transition active:scale-95 cursor-pointer"
              title={language === 'sw' ? 'Badili Lugha (Kiingereza / Kiswahili)' : 'Switch Language (English / Kiswahili)'}
            >
              <Globe size={13} className="text-[#2563EB] shrink-0" />
              <span>{language === 'sw' ? 'SW' : 'EN'}</span>
            </button>

            {/* Invite Friends Button (WhatsApp / Web Share) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                inviteFriends();
              }}
              className="min-h-[42px] min-w-[42px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
              title="Invite Friends to WaveLink via WhatsApp"
            >
              <UserPlus size={15} className="text-emerald-600 shrink-0" />
              <span className="hidden lg:inline">{t('nav.inviteFriends')}</span>
            </button>

            {currentUser && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="hidden xs:block">
                  <CompactPointsDisplay
                    userId={currentUser.uid}
                    onClick={() => {
                      triggerHaptic('tab');
                      if (onNavigateTab) onNavigateTab('settings');
                    }}
                    className="bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[#78716C] hover:text-[#1C1917]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tab');
                    if (onNavigateTab) onNavigateTab('settings');
                  }}
                  className={`relative w-9 h-9 rounded-full overflow-hidden border border-[var(--border-hairline)] focus:outline-none ring-2 ring-transparent hover:ring-[#2563EB]/20 transition shrink-0 ${activeFrameClass}`}
                  title="View Profile"
                >
                  <img
                    src={
                      userProfile?.photoURL ||
                      currentUser?.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`
                    }
                    alt="Profile"
                    className="w-full h-full rounded-full object-cover"
                  />
                  {hasUnreadNotifications && (
                    <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-white" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

