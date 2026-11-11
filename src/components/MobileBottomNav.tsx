import React from 'react';
import { ActiveTab } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import {
  Home,
  Film,
  Plus,
  MessageSquare,
  User
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  hasUnreadNotifications?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  hasUnreadNotifications = false
}) => {
  const { userProfile, currentUser } = useAuth();
  const { t } = useLanguage();

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: (active: boolean) => React.ReactNode;
    activeColor: string;
    isPrimaryAction?: boolean;
    showDot?: boolean;
  }[] = [
    {
      id: 'feed',
      label: t('nav.home'),
      activeColor: 'text-[#2563EB]',
      showDot: hasUnreadNotifications,
      icon: (active) => (
        <Home
          size={22}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-[#2563EB]' : 'text-[#78716C]'}
        />
      )
    },
    {
      id: 'videos',
      label: t('nav.reels'),
      activeColor: 'text-[#F43F5E]',
      icon: (active) => (
        <Film
          size={22}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-[#F43F5E]' : 'text-[#78716C]'}
        />
      )
    },
    {
      id: 'studio',
      label: t('nav.create'),
      isPrimaryAction: true,
      activeColor: 'text-[#0D9488]',
      icon: () => <Plus size={24} strokeWidth={2.5} className="text-white" />
    },
    {
      id: 'chat',
      label: t('nav.chat'),
      activeColor: 'text-[#0284C7]',
      icon: (active) => (
        <MessageSquare
          size={22}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-[#0284C7]' : 'text-[#78716C]'}
        />
      )
    },
    {
      id: 'settings',
      label: t('nav.profile'),
      activeColor: 'text-[#D97706]',
      icon: (active) => (
        <div className="relative">
          {userProfile?.photoURL || currentUser?.photoURL ? (
            <img
              src={userProfile?.photoURL || currentUser?.photoURL || ''}
              alt="Profile"
              className={`w-6 h-6 rounded-full object-cover transition ring-2 ${
                active ? 'ring-[#D97706]' : 'ring-transparent'
              }`}
            />
          ) : (
            <User
              size={22}
              strokeWidth={active ? 2.5 : 1.8}
              className={active ? 'text-[#D97706]' : 'text-[#78716C]'}
            />
          )}
        </div>
      )
    }
  ];

  const handleNavClick = (id: ActiveTab, isPrimary?: boolean) => {
    triggerHaptic(isPrimary ? 'medium' : 'tab');
    setActiveTab(id);
  };

  return (
    <nav
      className="wavelink-mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-hairline)] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_12px_rgba(28,25,23,0.04)]"
      aria-label="Main Navigation"
    >
      <div className="flex items-center justify-between min-h-[4rem] w-full max-w-xl mx-auto px-2 sm:px-3">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          if (item.isPrimaryAction) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id, true)}
                className="flex flex-col items-center justify-center min-w-[52px] min-h-[48px] -mt-3.5 group active:scale-95 transition-transform"
                title="Create Wave or Reel"
                aria-label="Create new Wave or Reel"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#0D9488] hover:bg-[#0f766e] flex items-center justify-center shadow-md shadow-[#0D9488]/25 transition">
                  {item.icon(isActive)}
                </div>
                <span className="text-[11px] font-bold mt-0.5 text-[#0D9488]">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id, false)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors relative min-w-[44px] min-h-[48px] ${
                isActive ? item.activeColor : 'text-[#78716C] hover:text-[#1C1917]'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                {item.icon(isActive)}
                {item.showDot && (
                  <span
                    className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-white"
                    title="New reaction or reply"
                  />
                )}
              </div>
              <span className={`text-[11px] mt-1 tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
