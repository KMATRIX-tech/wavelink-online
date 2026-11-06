import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
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
  ChevronRight
} from 'lucide-react';
import { inviteFriends } from '../utils/share.js';

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
  const { currentUser, userProfile, isAdmin, isSuperAdmin, isSubAdmin, isProEffective, signOut } = useAuth();
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

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'feed', label: 'Home Feed', icon: <Rss size={18} /> },
    { id: 'videos', label: 'Video Reels', icon: <Film size={18} /> },
    { id: 'studio', label: 'Media Studio', icon: <Wand2 size={18} />, badge: 'Create' },
    { id: 'announcements', label: 'Notice Board & Events', icon: <CalendarDays size={18} />, badge: 'Events' },
    { id: 'chat', label: 'Messages', icon: <MessageSquare size={18} /> },
    { id: 'monetization', label: 'Monetization Hub', icon: <Coins size={18} />, badge: 'TZS' },
    { id: 'directory', label: 'Members', icon: <Users size={18} /> },
    { id: 'analytics', label: 'Creator Analytics', icon: <BarChart3 size={18} />, badge: isProUser ? 'Pro' : undefined },
    // Restrict Admin / Moderator Desk to authorized admins
    ...(isAdmin
      ? [{
          id: 'admin' as ActiveTab,
          label: isSuperAdmin ? 'Admin Desk' : 'Moderator Desk',
          icon: <Shield size={18} />,
          badge: isSuperAdmin ? 'Owner' : 'Mod'
        }]
      : []),
    { id: 'settings', label: 'Profile & Settings', icon: <Settings size={18} /> },
  ];

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    onCloseMobile();
  };

  const renderSidebarContent = (collapsedMode: boolean) => (
    <div className="relative flex flex-col h-full bg-[#ffffff] border-r border-slate-200/90 select-none shadow-[2px_0_16px_-4px_rgba(15,23,42,0.04)] transition-all duration-300 ease-in-out">
      {/* Desktop Edge Collapse / Expand Toggle Button */}
      <button
        type="button"
        onClick={handleToggleCollapse}
        aria-label={collapsedMode ? 'Expand left sidebar' : 'Collapse left sidebar'}
        title={collapsedMode ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
        className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-[#2563eb] hover:border-blue-300 shadow-md absolute -right-3.5 top-5 z-40 transition-transform active:scale-95 cursor-pointer"
      >
        {collapsedMode ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      {/* Brand Header */}
      <div
        className={`border-b border-slate-100 bg-[#f8fafc]/60 flex items-center ${
          collapsedMode ? 'justify-center px-2 py-4' : 'justify-between px-5 py-4'
        }`}
      >
        <div
          onClick={() => handleSelectTab('feed')}
          title="WaveLink Home Feed"
          className={`flex items-center cursor-pointer group ${
            collapsedMode ? 'justify-center' : 'gap-3'
          }`}
        >
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#2563eb] to-[#10B981] text-white shadow-sm shadow-blue-600/20 group-hover:scale-105 transition-transform shrink-0">
            <Waves size={21} />
          </div>
          {!collapsedMode && (
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-xl tracking-tight text-[#1e293b] truncate">
                Wave<span className="text-[#2563eb]">Link</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-0.5 truncate">
                Community Platform
              </span>
            </div>
          )}
        </div>

        {isOpenMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-[#1e293b] hover:text-[#2563eb] rounded-xl lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 bg-[#ffffff] ${
          collapsedMode ? 'px-2' : 'px-3.5'
        }`}
      >
        {!collapsedMode && (
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 py-1 mb-1">
            Platform Navigation
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
                className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold transition-all duration-150 ${
                  collapsedMode
                    ? 'justify-center px-0 py-2.5'
                    : 'justify-between px-3.5 py-2.5'
                } ${
                  isActive
                    ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/25'
                    : 'text-[#1e293b] hover:bg-[#f8fafc] hover:text-[#2563eb]'
                }`}
              >
                <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3 min-w-0'}`}>
                  <span className={`shrink-0 ${isActive ? 'text-white' : 'text-[#1e293b]'}`}>
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
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-[#f8fafc] text-[#2563eb] border border-blue-200/70'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Clean Hover Tooltip when Collapsed */}
              {collapsedMode && (
                <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold whitespace-nowrap shadow-lg flex items-center gap-1.5 -translate-y-9">
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

        {onOpenWelink && (
          <div className="relative group/nav">
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onOpenWelink();
              }}
              title="WELINK AI Guide"
              aria-label="WELINK AI Guide"
              className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold text-[#1e293b] hover:bg-blue-50/80 hover:text-[#2563eb] transition-all duration-150 mt-1 border border-blue-100 bg-[#f8fafc] ${
                collapsedMode ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
              }`}
            >
              <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3'}`}>
                <span className="text-[#2563eb] shrink-0">
                  <Waves size={18} />
                </span>
                {!collapsedMode && <span>WELINK AI Guide</span>}
              </div>
              {!collapsedMode && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#2563eb] to-[#10B981] text-white">
                  Pro AI
                </span>
              )}
            </button>
            {collapsedMode && (
              <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold whitespace-nowrap shadow-lg -translate-y-9">
                WELINK AI Guide
              </div>
            )}
          </div>
        )}

        {/* Invite Friends via WhatsApp */}
        <div className="relative group/nav">
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              inviteFriends();
            }}
            title="Invite Friends via WhatsApp"
            aria-label="Invite Friends via WhatsApp"
            className={`w-full min-h-[44px] flex items-center rounded-2xl text-sm font-bold text-emerald-800 hover:bg-emerald-50 transition-all duration-150 mt-1 border border-emerald-200/80 bg-emerald-50/50 ${
              collapsedMode ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
            }`}
          >
            <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-3'}`}>
              <span className="text-emerald-600 shrink-0">
                <UserPlus size={18} />
              </span>
              {!collapsedMode && <span>Invite Friends</span>}
            </div>
            {!collapsedMode && (
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-600 text-white">
                WhatsApp
              </span>
            )}
          </button>
          {collapsedMode && (
            <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold whitespace-nowrap shadow-lg -translate-y-9">
              Invite Friends (WhatsApp)
            </div>
          )}
        </div>
      </div>

      {/* WaveLink Pro Shortcut / Upgrade Button */}
      <div className={collapsedMode ? 'px-2 mb-2' : 'px-3.5 mb-2'}>
        {collapsedMode ? (
          <div className="relative group/nav flex justify-center">
            <button
              onClick={() => handleSelectTab('monetization')}
              title={isProUser ? 'WaveLink Pro Active (VIP)' : 'Upgrade to WaveLink Pro'}
              aria-label={isProUser ? 'WaveLink Pro Active (VIP)' : 'Upgrade to WaveLink Pro'}
              className="w-11 h-11 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 text-white shadow-sm shadow-blue-600/20 active:scale-95 transition flex items-center justify-center"
            >
              <Crown size={18} className="text-amber-200" />
            </button>
            <div className="pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 fixed left-[76px] z-50 px-2.5 py-1.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold whitespace-nowrap shadow-lg translate-y-2">
              {isProUser ? 'WaveLink Pro Active (VIP)' : 'WaveLink Pro • 18,000 TZS'}
            </div>
          </div>
        ) : (
          <>
            {!isProUser ? (
              <button
                onClick={() => handleSelectTab('monetization')}
                className="w-full p-3 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 text-white shadow-sm shadow-blue-600/20 active:scale-95 transition flex items-center justify-between gap-2 group"
              >
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="p-1.5 rounded-xl bg-white/20">
                    <Crown size={15} className="text-amber-200" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black block tracking-tight">WaveLink Pro</span>
                    <span className="text-[10px] text-blue-50 block truncate">18,000 TZS • WaveLink</span>
                  </div>
                </div>
                <Sparkles size={14} className="text-amber-200 shrink-0 group-hover:rotate-12 transition-transform" />
              </button>
            ) : (
              <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                  <Crown size={13} className="text-amber-500" />
                  <span>WaveLink Pro Active</span>
                </span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">VIP</span>
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

      {/* User Account Footer */}
      <div className={`border-t border-slate-100 bg-[#F8FAFC] ${collapsedMode ? 'p-2' : 'p-3.5'}`}>
        {collapsedMode ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => handleSelectTab('settings')}
              title={`${userProfile?.displayName || currentUser?.displayName || 'Waver'} • Profile & Settings`}
              className="relative group/avatar cursor-pointer"
            >
              <img
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Avatar"
                className={`w-9 h-9 rounded-full object-cover shrink-0 ${
                  userProfile?.isPro
                    ? 'pro-aura-gold ring-2 ring-amber-400'
                    : 'ring-2 ring-blue-500/20'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl transition"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[#FFFFFF] border border-slate-200/90 shadow-2xs">
            <div
              onClick={() => handleSelectTab('settings')}
              className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
            >
              <img
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Avatar"
                className={`w-9 h-9 rounded-full object-cover shrink-0 ${
                  userProfile?.isPro
                    ? 'pro-aura-gold ring-2 ring-amber-400'
                    : 'ring-2 ring-blue-500/20'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <CrystalBadge
                    email={currentUser?.email}
                    name={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                    isPro={userProfile?.isPro}
                    hasBlueStar={isProUser}
                    isSubAdmin={isSubAdmin}
                    size="sm"
                    showAdminTag={isAdmin}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mt-0.5">
                  <span className="inline-flex items-center gap-0.5 text-amber-600 font-extrabold">
                    <Coins size={10} className="text-amber-500" />
                    {(userProfile?.wavePoints ?? 10).toLocaleString()} pts
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-0.5 text-orange-600 font-extrabold">
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
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl transition"
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
