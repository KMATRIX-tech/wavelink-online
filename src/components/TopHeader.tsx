import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ActiveTab } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { Waves, Sparkles, Mic, Wifi, WifiOff, BatteryCharging } from 'lucide-react';
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

const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string }> = {
  feed: { title: 'WaveLink', subtitle: 'Community social feed' },
  studio: { title: 'Create', subtitle: 'Share a photo, clip, or story' },
  videos: { title: 'Reels', subtitle: 'Watch community videos' },
  announcements: { title: 'Notice Board', subtitle: 'Community events & gatherings' },
  chat: { title: 'Messages', subtitle: 'Chat with friends' },
  directory: { title: 'Members', subtitle: 'Community directory' },
  analytics: { title: 'Analytics', subtitle: 'Post reach & impressions' },
  monetization: { title: 'Support & Tipping', subtitle: 'Creator economy & membership' },
  admin: { title: 'Admin Panel', subtitle: 'Community management' },
  settings: { title: 'Profile', subtitle: 'Account preferences & Pro' }
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onNavigateTab,
  onStartChat,
  onSelectHashtag,
  onOpenWelink,
  hasUnreadNotifications = false
}) => {
  const { currentUser, userProfile, isProEffective, isExemptFromPayments } = useAuth();
  const { isBatterySaver } = useTheme();
  const isProUser = isProEffective || isExemptFromPayments;
  const currentTabInfo = TAB_TITLES[activeTab] || { title: 'WaveLink', subtitle: 'Community' };

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState<boolean>(false);

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
    <header
      className={`sticky top-0 z-20 w-full bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] transition-all ${
        activeTab === 'feed' && isOnline && !justReconnected ? 'hidden md:block' : 'block'
      }`}
    >
      {/* Immediate slim banner when connection is lost */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-amber-500/95 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-2xs"
        >
          <WifiOff size={13} className="shrink-0 animate-pulse" />
          <span>You&apos;re offline — check your network connection.</span>
        </div>
      )}

      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${
          activeTab === 'feed' ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
          {/* Left: View Title, Calm Brand & Subtle Connection Indicator */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => {
                triggerHaptic('tab');
                if (onNavigateTab) onNavigateTab('feed');
              }}
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <div className="w-8 h-8 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
                <Waves size={18} />
              </div>
              <span className="font-extrabold text-base tracking-tight text-[#1C1917] hidden sm:inline">
                Wave<span className="text-[#2563EB]">Link</span>
              </span>
            </div>

            <div className="flex flex-col ml-1 sm:ml-2">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-[#1C1917] tracking-tight">
                  {currentTabInfo.title}
                </h1>
                {isProUser && (
                  <span className="text-[11px] font-semibold text-[#0D9488] bg-[#CCFBF1] px-2 py-0.5 rounded-full">
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
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors select-none ${
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
                      <span>Offline</span>
                    </span>
                  ) : justReconnected ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Wifi size={11} className="shrink-0" />
                      <span>Back online</span>
                    </span>
                  ) : (
                    <span className="hidden lg:inline text-[11px] text-[#78716C]">
                      Online
                    </span>
                  )}
                </div>

                {isBatterySaver && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('settings')}
                    title="Battery Saver Mode Active — reduced animations & optimized network checks"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-[#0D9488] border border-emerald-200/80 text-[11px] font-semibold"
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
          <div className="flex items-center gap-2 shrink-0">
            {onOpenWelink && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenWelink('voice');
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0D9488] border border-teal-200/80 text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95"
                  title="Talk Live with WELINK"
                >
                  <Mic size={14} className="text-[#0D9488]" />
                  <span>Live Talk</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenWelink('chat');
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                  title="Open WELINK AI Guide"
                >
                  <Sparkles size={14} className="text-[#0D9488]" />
                  <span>WELINK AI</span>
                </button>
              </>
            )}

            {currentUser && (
              <div className="flex items-center gap-2">
                <CompactPointsDisplay
                  userId={currentUser.uid}
                  onClick={() => {
                    triggerHaptic('tab');
                    if (onNavigateTab) onNavigateTab('settings');
                  }}
                  className="bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[#78716C] hover:text-[#1C1917]"
                />

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tab');
                    if (onNavigateTab) onNavigateTab('settings');
                  }}
                  className="relative w-8 h-8 rounded-full overflow-hidden border border-[var(--border-hairline)] focus:outline-none ring-2 ring-transparent hover:ring-[#2563EB]/20 transition"
                  title="View Profile"
                >
                  <img
                    src={
                      userProfile?.photoURL ||
                      currentUser?.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`
                    }
                    alt="Profile"
                    className="w-full h-full object-cover"
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

