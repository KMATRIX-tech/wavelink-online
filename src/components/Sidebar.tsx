import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useAfricanRegion, KANGA_PATTERN_FRAMES } from '../utils/africanCultureConfig';
import { CrystalBadge } from './CrystalBadge';
import { ActiveTab } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { AdsterraAdBanner } from './AdsterraAdBanner';
import {
  Waves,
  Rss,
  Film,
  MessageSquare,
  Users,
  Shield,
  Settings,
  LogOut,
  X,
  Wand2,
  BarChart3,
  Crown,
  Sparkles,
  Coins,
  CalendarDays,
  Flame,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Bell,
  Palette
} from 'lucide-react';
import { useSimpleMode } from '../context/SimpleModeContext';
import { useTheme, APPEARANCE_THEMES } from '../context/ThemeContext';
import { inviteFriends } from '../utils/share.js';
import { Avatar } from './Avatar';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenWelink?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  onOpenWelink,
  isCollapsed: controlledCollapsed,
  onToggleCollapse
}) => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, isSubAdmin, isProEffective, adminCheckFailedReason, signOut } = useAuth();
  const { t, language } = useLanguage();
  const { isSimpleMode } = useSimpleMode();
  const { appearanceTheme, setAppearanceTheme } = useTheme();
  const { currency, countryMeta, patternFrame, formatPrice } = useAfricanRegion(userProfile);
  const activeFrameClass =
    KANGA_PATTERN_FRAMES.find((f) => f.id === patternFrame)?.cssClass || '';
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_left_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  useEffect(() => {
    try {
      localStorage.setItem('wavelink_left_sidebar_collapsed', String(isCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isCollapsed]);

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const isProUser = isProEffective;

  // In Simple Mode, keep only Home, Messages, Notifications, Profile with larger text
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = isSimpleMode
    ? [
        { id: 'feed', label: t('nav.home'), icon: <Rss size={22} /> },
        { id: 'chat', label: language === 'sw' ? 'Ujumbe (Chat)' : 'Messages', icon: <MessageSquare size={22} /> },
        { id: 'announcements', label: language === 'sw' ? 'Taarifa' : 'Notifications', icon: <Bell size={22} /> },
        { id: 'settings', label: t('nav.profile'), icon: <Settings size={22} /> },
      ]
    : [
        { id: 'feed', label: t('nav.home'), icon: <Rss size={18} /> },
        { id: 'trending', label: t('nav.trending'), icon: <Trophy size={18} />, badge: 'Hot' },
        { id: 'videos', label: t('nav.reels'), icon: <Film size={18} /> },
        { id: 'studio', label: t('nav.create'), icon: <Wand2 size={18} />, badge: 'Create' },
        { id: 'announcements', label: t('nav.announcements'), icon: <CalendarDays size={18} />, badge: 'Events' },
        { id: 'chat', label: t('nav.chat'), icon: <MessageSquare size={18} /> },
        { id: 'monetization', label: t('nav.monetization'), icon: <Coins size={18} />, badge: currency },
        { id: 'directory', label: t('nav.members'), icon: <Users size={18} /> },
        { id: 'analytics', label: t('nav.analytics'), icon: <BarChart3 size={18} />, badge: 'Private' },
        // Restrict Admin / Moderator Desk to authorized admins (or owner session needing re-verification)
        ...(isAdmin ||
        adminCheckFailedReason === 'owner sign-in not used' ||
        adminCheckFailedReason === 'session needs refresh'
          ? [{
              id: 'admin' as ActiveTab,
              label: isSuperAdmin || !isSubAdmin ? t('nav.admin') : 'Moderator Desk',
              icon: <Shield size={18} />,
              badge: isSuperAdmin || !isSubAdmin ? 'Owner' : 'Mod'
            }]
          : []),
        { id: 'settings', label: t('nav.profile'), icon: <Settings size={18} /> },
      ];

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    onCloseMobile();
  };

  const renderSidebarContent = (collapsedMode: boolean) => (
    <div className="relative flex flex-col h-full bg-[var(--bg-surface)] text-[var(--text-primary)] border-r border-[var(--border-hairline)] select-none shadow-[2px_0_16px_-4px_rgba(15,23,42,0.04)] transition-all duration-300 ease-in-out">
      {/* Desktop Edge Collapse / Expand Toggle Button */}
      <button
        type="button"
        onClick={handleToggleCollapse}
        aria-label={collapsedMode ? 'Expand left sidebar' : 'Collapse left sidebar'}
        title={collapsedMode ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
        className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] shadow-md absolute -right-3.5 top-5 z-40 transition-transform active:scale-95 cursor-pointer"
      >
        {collapsedMode ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      {/* Brand Header */}
      <div
        className={`border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 flex items-center ${
          collapsedMode ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4'
        }`}
      >
        <div
          onClick={() => handleSelectTab('feed')}
          title="WaveLink Home Feed"
          className={`flex items-center cursor-pointer group ${
            collapsedMode ? 'justify-center' : 'gap-3'
          }`}
        >
          <div
            className="p-2.5 rounded-2xl text-white shadow-sm group-hover:scale-105 transition-transform shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
            }}
          >
            <Waves size={20} />
          </div>
          {!collapsedMode && (
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-lg tracking-tight text-[var(--text-primary)] truncate">
                Wave<span style={{ color: 'var(--accent-primary)' }}>Link</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] -mt-0.5 truncate">
                {countryMeta.flag} African Creators
              </span>
            </div>
          )}
        </div>

        {isOpenMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-[var(--text-primary)] hover:text-[var(--accent-primary)] rounded-xl lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden py-3.5 space-y-1 bg-[var(--bg-surface)] ${
          collapsedMode ? 'px-2' : 'px-3'
        }`}
      >
        {!collapsedMode && (
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] px-3 py-1 mb-1">
            Navigation
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const isItemAdmin = item.id === 'admin';

          return (
            <div key={item.id} className="relative group/nav">
              <button
                onClick={() => handleSelectTab(item.id)}
                title={item.label}
                aria-label={item.label}
                style={
                  isActive
                    ? {
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }
                    : undefined
                }
                className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold transition-all duration-150 cursor-pointer ${
                  collapsedMode
                    ? 'justify-center px-0 py-2.5'
                    : 'justify-between px-3.5 py-2.5'
                } ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)]'
                }`}
              >
                <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3 min-w-0'}`}>
                  <span className={`shrink-0 ${isActive ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                    {item.icon}
                  </span>
                  {!collapsedMode && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsedMode && item.badge && (
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : isItemAdmin && isAdmin
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-[var(--bg-subtle)] text-[var(--accent-primary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Clean Hover Tooltip when Collapsed */}
              {collapsedMode && (
                <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap shadow-lg flex items-center gap-1.5 -translate-y-9">
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded-md bg-blue-500/30 text-blue-200 text-[10px] uppercase">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!isSimpleMode && onOpenWelink && (
          <div className="relative group/nav">
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onOpenWelink();
              }}
              title="WELINK AI Guide"
              aria-label="WELINK AI Guide"
              className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-all duration-150 mt-1 border border-[var(--border-hairline)] bg-[var(--bg-subtle)] cursor-pointer ${
                collapsedMode ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
              }`}
            >
              <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3'}`}>
                <span className="text-[var(--accent-primary)] shrink-0">
                  <Waves size={18} />
                </span>
                {!collapsedMode && <span>WELINK AI</span>}
              </div>
              {!collapsedMode && (
                <span
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider text-white"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  AI
                </span>
              )}
            </button>
            {collapsedMode && (
              <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap shadow-lg -translate-y-9">
                WELINK AI Guide
              </div>
            )}
          </div>
        )}

        {!isSimpleMode && (
          /* Invite Friends via WhatsApp */
          <div className="relative group/nav">
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                inviteFriends();
              }}
              title="Invite Friends via WhatsApp"
              aria-label="Invite Friends via WhatsApp"
              className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 transition-all duration-150 mt-1 border border-emerald-500/30 bg-emerald-500/10 cursor-pointer ${
                collapsedMode ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
              }`}
            >
              <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3'}`}>
                <span className="text-emerald-500 shrink-0">
                  <UserPlus size={18} />
                </span>
                {!collapsedMode && <span>Invite Friends</span>}
              </div>
              {!collapsedMode && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-600 text-white">
                  Share
                </span>
              )}
            </button>
            {collapsedMode && (
              <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap shadow-lg -translate-y-9">
                Invite Friends (WhatsApp)
              </div>
            )}
          </div>
        )}

        {/* Theme / Appearance Quick Shortcut */}
        <div className="relative group/nav">
          <button
            type="button"
            onClick={() => {
              const available = APPEARANCE_THEMES.filter((th) => !th.proOnly || isProUser);
              const idx = available.findIndex((th) => th.id === appearanceTheme);
              const nextTheme = available[(idx + 1) % available.length] || APPEARANCE_THEMES[0];
              setAppearanceTheme(nextTheme.id);
            }}
            title={
              language === 'sw'
                ? 'Badilisha Mandhari / Rangi'
                : 'Switch Theme / Appearance'
            }
            aria-label="Switch Theme / Appearance"
            className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-all duration-150 mt-1 border border-[var(--border-hairline)] bg-[var(--bg-subtle)] cursor-pointer ${
              collapsedMode ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
            }`}
          >
            <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3 min-w-0'}`}>
              <span className="text-[var(--accent-primary)] shrink-0">
                <Palette size={18} />
              </span>
              {!collapsedMode && (
                <span className="truncate">
                  {language === 'sw' ? 'Mandhari' : 'Theme'}
                </span>
              )}
            </div>
            {!collapsedMode && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] truncate max-w-[92px]">
                {APPEARANCE_THEMES.find((th) => th.id === appearanceTheme)?.emoji || '🌊'}{' '}
                {APPEARANCE_THEMES.find((th) => th.id === appearanceTheme)?.name.split(' ')[0] || 'Ocean'}
              </span>
            )}
          </button>
          {collapsedMode && (
            <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap shadow-lg -translate-y-9">
              Theme / Appearance
            </div>
          )}
        </div>
      </div>

      {/* WaveLink Pro Shortcut / Upgrade Button (Hidden in Simple Mode) */}
      {!isSimpleMode && (
        <div className={collapsedMode ? 'px-2 mb-2' : 'px-3 mb-2'}>
          {collapsedMode ? (
            <div className="relative group/nav flex justify-center">
              <button
                onClick={() => handleSelectTab('monetization')}
                title={isProUser ? 'WaveLink Pro Active (VIP)' : 'Upgrade to WaveLink Pro'}
                aria-label={isProUser ? 'WaveLink Pro Active (VIP)' : 'Upgrade to WaveLink Pro'}
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                }}
                className="w-11 h-11 rounded-2xl hover:opacity-95 text-white shadow-sm active:scale-95 transition flex items-center justify-center cursor-pointer"
              >
                <Crown size={18} className="text-amber-200" />
              </button>
              <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap shadow-lg translate-y-2">
                {isProUser ? 'WaveLink Pro Active (VIP)' : `WaveLink Pro • ${formatPrice(18000)}`}
              </div>
            </div>
          ) : (
            <>
              {!isProUser ? (
                <button
                  onClick={() => handleSelectTab('monetization')}
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                  className="w-full p-3 rounded-2xl hover:opacity-95 text-white shadow-sm active:scale-95 transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-left min-w-0">
                    <div className="p-1.5 rounded-xl bg-white/20">
                      <Crown size={15} className="text-amber-200" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-black block tracking-tight">WaveLink Pro</span>
                      <span className="text-[10px] text-white/90 block truncate">{formatPrice(18000)} • Mobile Money</span>
                    </div>
                  </div>
                  <Sparkles size={14} className="text-amber-200 shrink-0 group-hover:rotate-12 transition-transform" />
                </button>
              ) : (
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <Crown size={13} className="text-amber-500" />
                    <span>WaveLink Pro Active</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-500/15 px-2 py-0.5 rounded-full">VIP</span>
                </div>
              )}

              {/* Adsterra Sidebar Sponsored Banner (Free Users Only - hidden if Pro, Blue Star, or Admin) */}
              <AdsterraAdBanner
                variant="sidebar"
                onOpenUpgradeModal={() => handleSelectTab('monetization')}
              />

              {/* PWA Install Button */}
              <div className="pt-2">
                <PWAInstallButton variant="full" />
              </div>
            </>
          )}
        </div>
      )}

      {/* User Account Footer */}
      <div className={`border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/70 ${collapsedMode ? 'p-2' : 'p-3'}`}>
        {collapsedMode ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => handleSelectTab('settings')}
              title={`${userProfile?.displayName || currentUser?.displayName || 'Waver'} • Profile & Settings`}
              className="relative group/avatar cursor-pointer"
            >
              <Avatar
                uid={currentUser?.uid}
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Avatar"
                fallbackName={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                size={36}
                showStatus={true}
                onlyWhenVisible={false}
                targetProfile={userProfile}
                ringClassName={
                  userProfile?.isPro
                    ? 'pro-aura-gold ring-2 ring-amber-400'
                    : 'ring-2 ring-[var(--accent-primary)]/30'
                }
              />
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1.5 text-[var(--text-secondary)] hover:text-rose-600 rounded-xl transition cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xs">
            <div
              onClick={() => handleSelectTab('settings')}
              className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
            >
              <Avatar
                uid={currentUser?.uid}
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Avatar"
                fallbackName={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                size={36}
                showStatus={true}
                onlyWhenVisible={false}
                targetProfile={userProfile}
                ringClassName={
                  activeFrameClass
                    ? activeFrameClass
                    : userProfile?.isPro
                    ? 'pro-aura-gold ring-2 ring-amber-400'
                    : 'ring-2 ring-[var(--accent-primary)]/30'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <CrystalBadge
                    userId={currentUser?.uid}
                    email={currentUser?.email}
                    name={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                    isPro={userProfile?.isPro}
                    hasBlueStar={isProUser}
                    isSubAdmin={isSubAdmin}
                    weeklyWinnerUntil={userProfile?.weeklyWinnerUntil}
                    size="sm"
                    showAdminTag={isAdmin}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-secondary)] mt-0.5">
                  <span className="inline-flex items-center gap-0.5 text-amber-500 font-extrabold">
                    <Coins size={10} />
                    {(userProfile?.wavePoints ?? 10).toLocaleString()} pts
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-0.5 text-orange-500 font-extrabold">
                    <Flame size={10} className="fill-orange-500 text-orange-500" />
                    {Math.max(1, userProfile?.loginStreak ?? 1)}d
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={signOut}
                title="Sign Out"
                className="p-1.5 text-[var(--text-secondary)] hover:text-rose-600 rounded-xl transition cursor-pointer"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Left Sidebar Navigation (Screens >= 1024px ONLY) */}
      <aside
        className={`wavelink-desktop-sidebar hidden lg:block ${
          isCollapsed ? 'wavelink-desktop-sidebar--collapsed' : 'wavelink-desktop-sidebar--expanded'
        }`}
      >
        {renderSidebarContent(isCollapsed)}
      </aside>

      {/* Optional Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85%] h-[100dvh] shadow-2xl z-10">
            {renderSidebarContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
