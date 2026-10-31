import React from 'react';
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
  Flame
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenWelink?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  onOpenWelink
}) => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, isSubAdmin, isProEffective, signOut } = useAuth();

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

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#ffffff] border-r border-slate-200/90 select-none shadow-[2px_0_16px_-4px_rgba(15,23,42,0.04)]">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-[#f8fafc]/60 flex items-center justify-between">
        <div
          onClick={() => handleSelectTab('feed')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#2563eb] to-[#10B981] text-white shadow-sm shadow-blue-600/20 group-hover:scale-105 transition-transform">
            <Waves size={21} />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-xl tracking-tight text-[#1e293b]">
              Wave<span className="text-[#2563eb]">Link</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-0.5">
              Community Platform
            </span>
          </div>
        </div>

        {isOpenMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-[#1e293b] hover:text-[#2563eb] rounded-xl md:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1 bg-[#ffffff]">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 py-1 mb-1">
          Platform Navigation
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const isItemAdmin = item.id === 'admin';

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all duration-150 ${
                isActive
                  ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/25'
                  : 'text-[#1e293b] hover:bg-[#f8fafc] hover:text-[#2563eb]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-white' : 'text-[#1e293b]'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
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
          );
        })}

        {onOpenWelink && (
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenWelink();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-[#1e293b] hover:bg-blue-50/80 hover:text-[#2563eb] transition-all duration-150 mt-1 border border-blue-100 bg-[#f8fafc]"
          >
            <div className="flex items-center gap-3">
              <span className="text-[#2563eb]">
                <Waves size={18} />
              </span>
              <span>WELINK AI Guide</span>
            </div>
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#2563eb] to-[#10B981] text-white">
              Pro AI
            </span>
          </button>
        )}
      </div>

      {/* WaveLink Pro Shortcut / Upgrade Button */}
      <div className="px-3.5 mb-2">
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
                <span className="text-xs font-black block tracking-tight">Upgrade to Pro</span>
                <span className="text-[10px] text-blue-50 block truncate">18,000 TZS • 0787473334</span>
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
      </div>

      {/* User Account Footer */}
      <div className="p-3.5 border-t border-slate-100 bg-[#F8FAFC]">
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
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar (Width >= 768px) */}
      <aside className="hidden md:block w-64 lg:w-72 shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay (Width < 768px) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-slide-right">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
