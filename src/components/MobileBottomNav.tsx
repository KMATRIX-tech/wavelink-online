import React, { useEffect, useState } from 'react';
import { ActiveTab } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import { Avatar } from './Avatar';
import {
  Home,
  Compass,
  Plus,
  MessageSquare,
  User
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  hasUnreadNotifications?: boolean;
  hasNewPosts?: boolean;
  unreadChatCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  hasUnreadNotifications = false,
  hasNewPosts = false,
  unreadChatCount = 0
}) => {
  const { userProfile, currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [liveUnreadChat, setLiveUnreadChat] = useState<number>(unreadChatCount);
  const [isTypingInChat, setIsTypingInChat] = useState<boolean>(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState<boolean>(false);
  const [isHiddenOnScrollDown, setIsHiddenOnScrollDown] = useState<boolean>(false);

  useEffect(() => {
    setIsHiddenOnScrollDown(false);
  }, [activeTab]);

  useEffect(() => {
    setLiveUnreadChat(unreadChatCount);
  }, [unreadChatCount]);

  useEffect(() => {
    const isTextInputEl = (el: Element | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        return true;
      }
      if (el.tagName === 'INPUT') {
        const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'color', 'hidden'].includes(type);
      }
      return false;
    };

    const syncFromDomState = () => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      const sheetOpen =
        root.getAttribute('data-bottom-sheet-open') === 'true' ||
        Boolean(
          document.querySelector(
            '.wavelink-comments-overlay, .wavelink-share-overlay, .wavelink-chat-theme-overlay'
          )
        );
      setIsBottomSheetOpen(sheetOpen);

      const kbOpen = root.getAttribute('data-keyboard-open') === 'true';
      const inputFocusedAttr = root.getAttribute('data-input-focused') === 'true';
      const activeFocused = isTextInputEl(document.activeElement);
      setIsTypingInChat(Boolean(kbOpen || inputFocusedAttr || activeFocused));
    };

    const handleUnreadChatEvent = (e: Event) => {
      const custom = e as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === 'number') {
        setLiveUnreadChat(custom.detail.count);
      }
    };

    const handleChatInputFocusEvent = (e: Event) => {
      const custom = e as CustomEvent<{ focused?: boolean }>;
      if (typeof custom.detail?.focused === 'boolean') {
        setIsTypingInChat(custom.detail.focused);
      } else {
        syncFromDomState();
      }
    };

    const handleBottomSheetEvent = (e: Event) => {
      const custom = e as CustomEvent<{ open?: boolean }>;
      if (typeof custom.detail?.open === 'boolean') {
        setIsBottomSheetOpen(custom.detail.open);
      } else {
        syncFromDomState();
      }
    };

    const handleFeedScrollDirection = (e: Event) => {
      const dir = (e as CustomEvent<{ direction?: 'up' | 'down' }>).detail?.direction;
      if (dir === 'down') {
        setIsHiddenOnScrollDown(true);
      } else if (dir === 'up') {
        setIsHiddenOnScrollDown(false);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (isTextInputEl(target)) {
        setIsTypingInChat(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        syncFromDomState();
      }, 90);
    };

    syncFromDomState();

    const observer = new MutationObserver(() => {
      syncFromDomState();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-bottom-sheet-open',
        'data-keyboard-open',
        'data-input-focused',
        'data-mobile-chat-convo'
      ]
    });

    window.addEventListener('wavelink:unread-chat-count', handleUnreadChatEvent);
    window.addEventListener('wavelink:chat-input-focus', handleChatInputFocusEvent);
    window.addEventListener('wavelink:bottom-sheet-state', handleBottomSheetEvent);
    window.addEventListener('wavelink:feed-scroll-direction', handleFeedScrollDirection);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.visualViewport?.addEventListener('resize', syncFromDomState);

    return () => {
      observer.disconnect();
      window.removeEventListener('wavelink:unread-chat-count', handleUnreadChatEvent);
      window.removeEventListener('wavelink:chat-input-focus', handleChatInputFocusEvent);
      window.removeEventListener('wavelink:bottom-sheet-state', handleBottomSheetEvent);
      window.removeEventListener('wavelink:feed-scroll-direction', handleFeedScrollDirection);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.visualViewport?.removeEventListener('resize', syncFromDomState);
    };
  }, []);

  const effectiveUnreadChat = liveUnreadChat;
  const shouldHideNav = isTypingInChat || isBottomSheetOpen || isHiddenOnScrollDown;

  const navItems: {
    id: ActiveTab;
    ariaLabel: string;
    isCenterCreate?: boolean;
    badgeCount?: number;
    showDot?: boolean;
    renderIcon: (active: boolean) => React.ReactNode;
  }[] = [
    {
      id: 'feed',
      ariaLabel: t('nav.home') || 'Home',
      showDot: Boolean(hasNewPosts || hasUnreadNotifications),
      renderIcon: (active) => (
        <Home
          size={22}
          strokeWidth={active ? 2.6 : 2}
          className="transition-transform duration-300"
        />
      )
    },
    {
      id: 'videos',
      ariaLabel: language === 'sw' ? 'Gundua na Reels' : 'Explore & Reels',
      renderIcon: (active) => (
        <Compass
          size={22}
          strokeWidth={active ? 2.6 : 2}
          className="transition-transform duration-300"
        />
      )
    },
    {
      id: 'studio',
      ariaLabel: t('nav.create') || 'Create',
      isCenterCreate: true,
      renderIcon: (active) => (
        <Plus
          size={26}
          strokeWidth={2.8}
          className={`transition-transform duration-300 ${active ? 'rotate-90' : ''}`}
        />
      )
    },
    {
      id: 'chat',
      ariaLabel: t('nav.chat') || 'Chat',
      badgeCount: effectiveUnreadChat,
      renderIcon: (active) => (
        <MessageSquare
          size={22}
          strokeWidth={active ? 2.6 : 2}
          className="transition-transform duration-300"
        />
      )
    },
    {
      id: 'settings',
      ariaLabel: t('nav.profile') || 'Profile',
      renderIcon: (active) => {
        const avatarUrl = userProfile?.photoURL || currentUser?.photoURL;
        if (avatarUrl) {
          return (
            <Avatar
              uid={currentUser?.uid}
              src={avatarUrl}
              alt="Profile"
              fallbackName={userProfile?.displayName || currentUser?.displayName || 'Waver'}
              size={24}
              showStatus={true}
              onlyWhenVisible={false}
              targetProfile={userProfile}
              ringClassName={
                active ? 'ring-2 ring-stone-950 scale-105 transition-all' : 'ring-1 ring-white/40 transition-all'
              }
            />
          );
        }
        return (
          <User
            size={22}
            strokeWidth={active ? 2.6 : 2}
            className="transition-transform duration-300"
          />
        );
      }
    }
  ];

  const handleNavClick = (id: ActiveTab, isCenter?: boolean) => {
    triggerHaptic(isCenter ? 'medium' : 'tab');
    setActiveTab(id);
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      aria-hidden={shouldHideNav ? 'true' : undefined}
      className={`wavelink-mobile-bottom-nav md:hidden fixed left-3 right-3 bottom-3 z-40 pointer-events-none transition-all duration-300 ease-out ${
        shouldHideNav
          ? 'translate-y-28 opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100'
      }`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div
        className={`wavelink-glass-pill-nav wavelink-float-gentle mx-auto max-w-[23rem] rounded-full px-3 py-1.5 flex items-center justify-between gap-1 ${
          shouldHideNav ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const isCreate = Boolean(item.isCenterCreate);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id, isCreate)}
              aria-label={item.ariaLabel}
              title={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex items-center justify-center min-w-[48px] min-h-[48px] rounded-full select-none cursor-pointer transition-transform duration-200 active:scale-95 focus:outline-none"
            >
              {/* Animated White Circular Highlight behind active icon, or Soft Glowing Pastel Gradient Circle for Centre Create "+" */}
              <span
                aria-hidden="true"
                className={`flex items-center justify-center rounded-full transition-all duration-300 ease-out ${
                  isCreate
                    ? `w-13 h-13 wavelink-nav-pastel-create text-slate-950 ${
                        isActive ? 'scale-105 ring-2 ring-white' : 'hover:scale-105'
                      }`
                    : isActive
                    ? 'w-11 h-11 bg-white text-[#0F172A] shadow-[0_6px_20px_rgba(255,255,255,0.35)] scale-100'
                    : 'w-11 h-11 bg-transparent text-white/80 hover:text-white hover:bg-white/10 scale-95'
                }`}
              >
                {item.renderIcon(isActive)}
              </span>

              {/* Unread Badge on Chat */}
              {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F43F5E] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-[#0F172A] shadow-xs"
                  aria-label={`${item.badgeCount} unread messages`}
                >
                  {item.badgeCount > 99 ? '99+' : item.badgeCount}
                </span>
              )}

              {/* Red Dot on Home if new posts or unread activity */}
              {!item.badgeCount && item.showDot && (
                <span
                  className="absolute top-1.5 right-2 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-[#0F172A] shadow-xs"
                  aria-label="New posts available"
                />
              )}

              <span className="sr-only">{item.ariaLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
