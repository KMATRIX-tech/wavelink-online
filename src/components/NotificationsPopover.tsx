import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit
} from 'firebase/firestore';
import { AppNotification, NotificationType, ActiveTab } from '../types';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  sendNotification
} from '../services/notificationService';
import {
  fetchDeviceTokenFromUserDoc,
  getBrowserNotificationPermission,
  getDeviceSavedTokenFromUserDoc,
  getNotificationStatusKind,
  getSavedDeviceToken,
  requestPushPermissionAndSaveToken
} from '../services/fcmService';
import {
  Bell,
  CheckCheck,
  Trash2,
  MessageSquare,
  PhoneCall,
  Heart,
  MessageCircle,
  Coins,
  UserPlus,
  Sparkles,
  ExternalLink,
  Settings,
  Megaphone,
  X,
  AlertCircle
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface NotificationsPopoverProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onStartChat?: (userId: string) => void;
  hasUnreadNotifications?: boolean;
  unreadNotificationCount?: number;
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  onNavigateTab,
  onStartChat,
  hasUnreadNotifications = false,
  unreadNotificationCount = 0
}) => {
  const { currentUser, userProfile, showGlobalToast } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [savedTokenInDoc, setSavedTokenInDoc] = useState<string | null>(() =>
    getDeviceSavedTokenFromUserDoc(userProfile) || getSavedDeviceToken()
  );
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [popoverError, setPopoverError] = useState<string | null>(null);

  useEffect(() => {
    setPermissionState(getBrowserNotificationPermission());
    setSavedTokenInDoc(getDeviceSavedTokenFromUserDoc(userProfile) || getSavedDeviceToken());
    if (!currentUser?.uid) return;
    let cancelled = false;
    fetchDeviceTokenFromUserDoc(currentUser.uid)
      .then((res) => {
        if (!cancelled && res.tokenInDoc) {
          setSavedTokenInDoc(res.tokenInDoc);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, userProfile, isOpen]);

  const statusKind = getNotificationStatusKind(permissionState, savedTokenInDoc);
  const isPushEnabled = statusKind === 'on';

  const containerRef = useRef<HTMLDivElement>(null);

  // Real-time listener for user's notifications
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AppNotification));
        setNotifications(list);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Notifications snapshot error (non-fatal):', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = Math.max(
    notifications.filter((n) => !n.read).length,
    unreadNotificationCount
  );

  // Sync unread bell count to App.tsx for browser tab title & Badging API
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('wavelink:unread-bell-count', {
        detail: { count: notifications.filter((n) => !n.read).length }
      })
    );
  }, [notifications]);

  // Filter list
  const filteredNotifications = notifications.filter((n) => {
    if (filterType === 'all') return true;
    if (filterType === 'messages') return n.type === 'message';
    if (filterType === 'calls') return n.type === 'call' || n.type === 'incoming_call';
    if (filterType === 'posts') return ['post_like', 'post_comment', 'post_tip', 'post_boost', 'post_reaction'].includes(n.type);
    if (filterType === 'follows') return n.type === 'follow';
    return true;
  });

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === notif.id ? { ...item, read: true } : item))
      );
      await markNotificationAsRead(notif.id);
    }
    setIsOpen(false);

    if (notif.type === 'message' || notif.type === 'call' || notif.type === 'incoming_call') {
      if (onStartChat && notif.actorId) {
        onStartChat(notif.actorId);
      } else if (onNavigateTab) {
        onNavigateTab('chat');
      }
    } else if (['post_like', 'post_comment', 'post_tip', 'post_boost', 'post_reaction'].includes(notif.type)) {
      if (onNavigateTab) {
        onNavigateTab('feed');
      }
    } else if (notif.type === 'follow') {
      if (onNavigateTab) {
        onNavigateTab('directory');
      }
    }
  };

  const handleSendSampleAlert = async () => {
    if (!currentUser) return;
    const sampleTypes: { type: NotificationType; title: string; body: string }[] = [
      {
        type: 'message',
        title: 'New Wave Message 💬',
        body: 'A community creator sent you a private message: "Love your latest audio reel!"'
      },
      {
        type: 'call',
        title: 'Incoming WebRTC Call 📞',
        body: 'Missed audio call from verified creator.'
      },
      {
        type: 'post_like',
        title: 'Wave Liked! ❤️',
        body: 'A creator liked your wave reel.'
      },
      {
        type: 'post_comment',
        title: 'New Comment 💬',
        body: 'Someone commented: "Incredible video vibe! 🌊🔥"'
      },
      {
        type: 'follow',
        title: 'New Follower! 🌟',
        body: 'A creator started following your waves.'
      }
    ];

    const pick = sampleTypes[Math.floor(Math.random() * sampleTypes.length)];
    await sendNotification({
      recipientId: currentUser.uid,
      actorId: 'sample_bot_1',
      actorName: 'Amani Creative',
      actorUsername: '@amani_tz',
      actorPhotoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      type: pick.type,
      title: pick.title,
      body: pick.body
    });
  };

  const handleOpenNotificationSettings = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wavelink_settings_initial_section', 'notifications');
      window.dispatchEvent(new CustomEvent('wavelink:open-notification-settings'));
    }
    if (onNavigateTab) {
      onNavigateTab('settings');
    }
  };

  const handleEnablePushFromPopover = async () => {
    if (!currentUser) return;
    setIsEnablingPush(true);
    setPopoverError(null);
    try {
      const res = await requestPushPermissionAndSaveToken(currentUser.uid);
      setPermissionState(res.permission);
      if (res.success && res.token) {
        setSavedTokenInDoc(res.token);
        showGlobalToast('Notifications enabled on this device!');
      } else if (res.error) {
        setPopoverError(res.error);
        showGlobalToast(res.error);
      }
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Could not enable notifications.';
      setPopoverError(msg);
      showGlobalToast(msg);
    } finally {
      setIsEnablingPush(false);
    }
  };

  const renderIcon = (type: NotificationType) => {
    switch (type) {
      case 'message':
        return <MessageSquare size={14} className="text-blue-400" />;
      case 'call':
      case 'incoming_call':
        return <PhoneCall size={14} className="text-emerald-400" />;
      case 'post_like':
      case 'post_reaction':
      case 'spark_like':
        return <Heart size={14} className="text-rose-400 fill-rose-400" />;
      case 'post_comment':
        return <MessageCircle size={14} className="text-indigo-400" />;
      case 'post_tip':
      case 'payment_verified':
        return <Coins size={14} className="text-amber-400" />;
      case 'announcement':
        return <Megaphone size={14} className="text-amber-500" />;
      case 'follow':
        return <UserPlus size={14} className="text-purple-400" />;
      default:
        return <Bell size={14} className="text-gray-400" />;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setIsOpen((prev) => !prev);
          window.dispatchEvent(new CustomEvent('wavelink:bell-opened'));
        }}
        className="relative min-h-[44px] min-w-[44px] p-2 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 flex items-center justify-center transition active:scale-95 cursor-pointer"
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F43F5E] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-stone-900 shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : (
          hasUnreadNotifications && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-white dark:ring-stone-900" />
          )
        )}
      </button>

      {/* Floating Notifications Popover */}
      {isOpen && (
        <div className="absolute right-[-44px] sm:right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 rounded-3xl bg-white border border-slate-200/80 text-[#0F172A] shadow-[0_12px_40px_-8px_rgba(15,23,42,0.12)] overflow-hidden z-50 animate-in fade-in">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-blue-50 text-[#3B82F6]">
                <Bell size={16} />
              </div>
              <h3 className="font-extrabold text-sm text-[#0F172A]">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-[#F43F5E] border border-rose-200">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {(unreadCount > 0 || notifications.some((n) => !n.read)) && (
                <button
                  type="button"
                  onClick={() => {
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                    window.dispatchEvent(new CustomEvent('wavelink:notifications-marked-read'));
                    if (currentUser) {
                      void markAllNotificationsAsRead(currentUser.uid);
                    }
                  }}
                  className="px-2 py-1 rounded-lg text-xs text-[#3B82F6] hover:bg-blue-50 hover:text-blue-700 font-extrabold flex items-center gap-1 transition cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span className="text-[11px]">Mark all as read</span>
                </button>
              )}
              <button
                onClick={handleOpenNotificationSettings}
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#3B82F6] hover:bg-blue-50 transition"
                title="Notification Settings"
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-[#0F172A]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Permanent Push Notification Status & Quick Enable / Settings Strip */}
          <div className="px-3.5 py-2.5 bg-blue-50/80 border-b border-blue-100 space-y-2">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-extrabold text-slate-800">Push status:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      statusKind === 'on'
                        ? 'bg-emerald-100 text-emerald-800'
                        : statusKind === 'blocked'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {statusKind === 'on'
                      ? 'On'
                      : statusKind === 'blocked'
                      ? 'Blocked in the browser'
                      : 'Not set up yet'}
                  </span>
                </div>
                {!isPushEnabled && (
                  <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
                    {statusKind === 'blocked'
                      ? 'Blocked in Chrome. Open Notification Settings for unblock steps.'
                      : 'Turn on notifications for messages, calls & updates.'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {statusKind === 'not_set_up' && (
                  <button
                    type="button"
                    disabled={isEnablingPush}
                    onClick={handleEnablePushFromPopover}
                    className="px-2.5 py-1.5 rounded-xl bg-[#3B82F6] hover:bg-blue-700 text-white text-[11px] font-bold transition active:scale-95 cursor-pointer"
                  >
                    {isEnablingPush ? 'Enabling...' : 'Enable'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenNotificationSettings}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold transition cursor-pointer"
                >
                  Settings
                </button>
              </div>
            </div>

            {popoverError && (
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-start gap-1.5">
                <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-600" />
                <span className="break-words">{popoverError}</span>
              </div>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex px-3 pt-2 pb-1 gap-1 border-b border-slate-100 bg-white overflow-x-auto scrollbar-none text-[11px] font-semibold">
            {['all', 'messages', 'calls', 'posts', 'follows'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-2.5 py-1 rounded-xl capitalize transition whitespace-nowrap ${
                  filterType === f
                    ? 'bg-[#3B82F6] text-white font-bold shadow-2xs'
                    : 'text-slate-500 hover:text-[#0F172A] bg-[#F8FAFC]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* List Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <div className="w-5 h-5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Loading your notifications...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Bell size={28} className="mx-auto opacity-30 text-[#3B82F6]" />
                <p className="text-xs font-semibold text-[#0F172A]">
                  {filterType === 'all'
                    ? 'You have zero notifications right now'
                    : `No ${filterType} alerts at this time`}
                </p>
                <p className="text-[11px]">
                  Alerts for direct messages, WebRTC calls, post likes &amp; follows will appear here in real-time.
                </p>
                <button
                  onClick={handleSendSampleAlert}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[#3B82F6] text-xs font-bold transition hover:bg-blue-100 inline-flex items-center gap-1.5 active:scale-95"
                >
                  <Sparkles size={13} className="text-[#10B981]" />
                  <span>Simulate Community Alert</span>
                </button>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3 transition cursor-pointer flex items-start justify-between gap-3 group ${
                    !n.read
                      ? 'bg-blue-50/50 hover:bg-blue-50'
                      : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="relative shrink-0 mt-0.5">
                      <img
                        src={n.actorPhotoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${n.actorId}`}
                        alt="Actor"
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-blue-500/20"
                      />
                      <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white ring-1 ring-slate-200">
                        {renderIcon(n.type)}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-[#0F172A] truncate">
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                        {n.body}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-500 opacity-40 group-hover:opacity-100 transition shrink-0"
                    title="Dismiss"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-[#F8FAFC] border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <button
              type="button"
              onClick={handleOpenNotificationSettings}
              className="text-slate-600 hover:text-[#3B82F6] font-bold flex items-center gap-1 transition"
            >
              <Settings size={11} />
              <span>Notification Settings</span>
            </button>
            {onNavigateTab && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNavigateTab('announcements');
                }}
                className="text-[#3B82F6] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>View Announcements</span>
                <ExternalLink size={10} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
