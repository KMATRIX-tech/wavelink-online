import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserNotificationSettings } from '../types';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getBrowserNotificationPermission,
  getSavedDeviceToken,
  requestPushPermissionAndSaveToken,
  removeCurrentDeviceFcmToken,
  saveUserNotificationSettings
} from '../services/fcmService';
import { sendNotification } from '../services/notificationService';
import { AddToHomeScreenHintCard } from './PWAInstallButton';
import {
  Bell,
  BellOff,
  MessageSquare,
  PhoneCall,
  UserPlus,
  Heart,
  Megaphone,
  Coins,
  Moon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Smartphone,
  ShieldCheck,
  Send,
  Trophy,
  MessageCircle
} from 'lucide-react';

export const NotificationSettingsPanel: React.FC = () => {
  const { currentUser, userProfile, updateUserProfile, showGlobalToast } = useAuth();
  const { language, t } = useLanguage();

  const [settings, setSettings] = useState<UserNotificationSettings>(() => ({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(userProfile?.notificationSettings || {})
  }));

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [deviceToken, setDeviceToken] = useState<string | null>(() => getSavedDeviceToken());
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (userProfile?.notificationSettings) {
      setSettings({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...userProfile.notificationSettings
      });
    }
  }, [userProfile?.notificationSettings]);

  const handleEnableDevicePush = async () => {
    if (!currentUser) return;
    setIsRequestingPermission(true);
    setStatusFeedback(null);

    try {
      const result = await requestPushPermissionAndSaveToken(currentUser.uid);
      setPermissionState(result.permission);
      if (result.success && result.token) {
        setDeviceToken(result.token);
        setStatusFeedback({
          type: 'success',
          text:
            language === 'sw'
              ? 'Arifa za simu zimewashwa kwenye kifaa hiki!'
              : 'Push notifications are now enabled for this device!'
        });
        showGlobalToast(
          language === 'sw'
            ? 'Arifa zimewashwa kwenye kifaa hiki!'
            : 'Push notifications enabled on this device!'
        );
      } else {
        setStatusFeedback({
          type: 'error',
          text:
            result.error ||
            (language === 'sw'
              ? 'Imeshindikana kuwasha arifa. Tafadhali angalia ruhusa za kivinjari chako.'
              : 'Could not enable push notifications. Please check your browser permission settings.')
        });
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleDisableDevicePush = async () => {
    if (!currentUser) return;
    setIsRequestingPermission(true);
    setStatusFeedback(null);
    try {
      await removeCurrentDeviceFcmToken(currentUser.uid);
      setDeviceToken(null);
      setStatusFeedback({
        type: 'success',
        text:
          language === 'sw'
            ? 'Kifaa hiki kimeondolewa na hakitapokea tena arifa.'
            : 'This device token has been removed and will no longer receive push alerts.'
      });
      showGlobalToast(
        language === 'sw'
          ? 'Arifa zimezimwa kwenye kifaa hiki.'
          : 'Push notifications turned off for this device.'
      );
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleUpdateSetting = async (patch: Partial<UserNotificationSettings>) => {
    if (!currentUser) return;
    const nextSettings: UserNotificationSettings = {
      ...settings,
      ...patch,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      updatedAt: new Date().toISOString()
    };
    setSettings(nextSettings);
    setIsSaving(true);
    try {
      await saveUserNotificationSettings(currentUser.uid, nextSettings);
      await updateUserProfile({ notificationSettings: nextSettings });
    } catch (err) {
      console.warn('Failed to save notification settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!currentUser) return;
    setIsSendingTest(true);
    setStatusFeedback(null);
    try {
      await sendNotification({
        recipientId: `${currentUser.uid}`,
        actorId: 'wavelink_push_test',
        actorName: 'WaveLink Security',
        type: 'incoming_call',
        title:
          language === 'sw'
            ? 'Simu Inayoingia ya Jaribio 📞'
            : 'Incoming Call Push Test 📞',
        body:
          language === 'sw'
            ? 'Jaribio la arifa yenye kitufe cha Pokea (Answer) na Kataa (Decline).'
            : 'Loud notification test with Answer and Decline buttons!'
      });

      // Also show a browser notification via Service Worker if granted on this device
      if ('serviceWorker' in navigator && Notification.permission === 'granted' && settings.masterEnabled) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          await reg.showNotification(
            language === 'sw' ? 'Simu Inayoingia • WaveLink 📞' : 'Incoming WaveLink Call 📞',
            {
              body:
                language === 'sw'
                  ? 'Gusa Pokea (Answer) au Kataa (Decline).'
                  : 'Tap Answer to connect or Decline.',
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'wavelink-call-test',
              requireInteraction: true,
              vibrate: [400, 150, 400, 150, 500],
              actions: [
                { action: 'answer_call', title: '📞 Answer' },
                { action: 'decline_call', title: '✕ Decline' }
              ]
            } as any
          );
        }
      }

      setStatusFeedback({
        type: 'success',
        text:
          language === 'sw'
            ? 'Arifa ya jaribio imetumwa! Angalia sehemu ya arifa ya simu yako.'
            : 'Test notification sent! Check your device notification tray and the bell icon.'
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text:
          language === 'sw'
            ? 'Imeshindikana kutuma arifa ya jaribio kwa sasa.'
            : 'Could not send test notification right now.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const isDeviceSubscribed = Boolean(deviceToken && permissionState === 'granted');

  return (
    <div className="space-y-5">
      {/* Friendly Add to Home Screen Hint (Especially for iPhone Users) */}
      <AddToHomeScreenHintCard />

      {/* 1. Explicit Permission Opt-In Card (One Kind Sentence, Never Prompts on Load) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5 max-w-xl">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                isDeviceSubscribed
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}
            >
              {isDeviceSubscribed ? <Bell size={22} /> : <Smartphone size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-stone-900">
                  {t('notif.settings_title')}
                </h3>
                {isDeviceSubscribed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                    <CheckCircle2 size={12} />
                    <span>{language === 'sw' ? 'Imewashwa' : 'Active'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[11px] font-bold">
                    <span>{language === 'sw' ? 'Bado haijawashwa' : 'Not enabled yet'}</span>
                  </span>
                )}
              </div>

              {/* Kind explanation sentence */}
              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed">
                {t('notif.kind_explanation')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isDeviceSubscribed ? (
              <>
                <button
                  type="button"
                  onClick={handleSendTestPush}
                  disabled={isSendingTest}
                  className="px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>{t('notif.test_btn')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisableDevicePush}
                  disabled={isRequestingPermission}
                  className="px-3.5 py-2.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-600 border border-stone-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <BellOff size={14} />
                  <span>{t('notif.disable_btn')}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleEnableDevicePush}
                disabled={isRequestingPermission}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-sm transition active:scale-95"
              >
                {isRequestingPermission ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{language === 'sw' ? 'Inaomba ruhusa...' : 'Requesting Permission...'}</span>
                  </>
                ) : (
                  <>
                    <Bell size={15} />
                    <span>{t('notif.enable_btn')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {statusFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
            )}
            <span>{statusFeedback.text}</span>
          </div>
        )}
      </div>

      {/* 2. Master Switch */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                settings.masterEnabled ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-500'
              }`}
            >
              {settings.masterEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-extrabold text-stone-900">
                  {language === 'sw' ? 'Swichi Kuu ya Arifa' : 'Master Notification Switch'}
                </h4>
                {isSaving && (
                  <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    {language === 'sw' ? 'Inahifadhi...' : 'Saving...'}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                {settings.masterEnabled
                  ? language === 'sw'
                    ? 'Aina zote za arifa ulizochagua hapa chini zimewashwa.'
                    : 'All selected notification categories below are active.'
                  : language === 'sw'
                  ? 'Arifa zote zimesitishwa kwenye vifaa vyako.'
                  : 'All push notifications are paused across your devices.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.masterEnabled}
            onClick={() => handleUpdateSetting({ masterEnabled: !settings.masterEnabled })}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.masterEnabled ? 'bg-blue-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                settings.masterEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 3. Per-Category Notification Toggles */}
      <div
        className={`bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-4 transition-opacity ${
          settings.masterEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div>
          <h4 className="text-sm font-extrabold text-stone-900">
            {language === 'sw' ? 'Aina za Arifa' : 'Notification Categories'}
          </h4>
          <p className="text-xs text-stone-500 mt-0.5">
            {language === 'sw'
              ? 'Chagua ni arifa zipi ungependa kupokea kutoka kwenye seva ya WaveLink.'
              : 'Choose exactly which updates WaveLink sends from the server to your devices.'}
          </p>
        </div>

        <div className="divide-y divide-stone-100">
          {[
            {
              key: 'messages' as const,
              label: t('notif.cat_messages'),
              desc:
                language === 'sw'
                  ? 'Ujumbe wa moja kwa moja na soga za vikundi'
                  : 'Direct messages and group chat messages',
              icon: <MessageSquare size={16} className="text-blue-600" />,
              bg: 'bg-blue-50'
            },
            {
              key: 'calls' as const,
              label: t('notif.cat_calls'),
              desc:
                language === 'sw'
                  ? 'Arifa kubwa yenye kitufe cha Pokea (Answer) na Kataa (Decline)'
                  : 'Loud high-priority alert with Answer & Decline action buttons',
              icon: <PhoneCall size={16} className="text-emerald-600" />,
              bg: 'bg-emerald-50'
            },
            {
              key: 'followers' as const,
              label: t('notif.cat_followers'),
              desc:
                language === 'sw'
                  ? 'Mtu anapoanza kukufuata kwenye WaveLink'
                  : 'When someone starts following your profile',
              icon: <UserPlus size={16} className="text-purple-600" />,
              bg: 'bg-purple-50'
            },
            {
              key: 'reactions' as const,
              label: t('notif.cat_reactions'),
              desc:
                language === 'sw'
                  ? 'Likes, mioyo na moto kwenye machapisho, Reels na Sparks zako'
                  : 'Likes, hearts, and fire reactions on your posts, Reels & Sparks',
              icon: <Heart size={16} className="text-rose-600" />,
              bg: 'bg-rose-50'
            },
            {
              key: 'replies' as const,
              label: t('notif.cat_replies'),
              desc:
                language === 'sw'
                  ? 'Maoni na majibu kwenye machapisho au Sparks zako'
                  : 'Comments and replies on your posts, Reels, and Sparks',
              icon: <MessageCircle size={16} className="text-sky-600" />,
              bg: 'bg-sky-50'
            },
            {
              key: 'challenges' as const,
              label: t('notif.cat_challenges'),
              desc:
                language === 'sw'
                  ? 'Vikumbusho vya mashindano ya wabunifu ya wiki na matokeo ya washindi'
                  : 'Weekly creator challenge reminders, deadlines, and leaderboard results',
              icon: <Trophy size={16} className="text-amber-600" />,
              bg: 'bg-amber-50'
            },
            {
              key: 'announcements' as const,
              label:
                language === 'sw' ? 'Matangazo na Matukio' : 'Announcements & Events',
              desc:
                language === 'sw'
                  ? 'Matangazo rasmi ya jumuiya na ratiba za matukio'
                  : 'Official Notice Board bulletins, schedules, and community events',
              icon: <Megaphone size={16} className="text-orange-600" />,
              bg: 'bg-orange-50'
            },
            {
              key: 'payments' as const,
              label:
                language === 'sw'
                  ? 'Malipo na Zawadi za Wabunifu'
                  : 'Payment Confirmations & Tips',
              desc:
                language === 'sw'
                  ? 'Zawadi za pesa za simu, kuongeza ufikiaji na uthibitisho wa Pro'
                  : 'Mobile money creator tips, post boosts, and Pro pass receipts',
              icon: <Coins size={16} className="text-teal-600" />,
              bg: 'bg-teal-50'
            }
          ].map((item) => {
            const isChecked = settings[item.key] !== false;
            return (
              <div key={item.key} className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-xl ${item.bg} shrink-0`}>{item.icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-stone-900">{item.label}</div>
                    <div className="text-[11px] text-stone-500">{item.desc}</div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isChecked}
                  onClick={() => handleUpdateSetting({ [item.key]: !isChecked })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isChecked ? 'bg-blue-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isChecked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Message Preview Privacy Control */}
      <div
        className={`bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-3 transition-opacity ${
          settings.masterEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              {settings.showMessagePreviews ? <Eye size={18} /> : <EyeOff size={18} />}
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-stone-900">
                Show Short Message Previews
              </h4>
              <p className="text-xs text-stone-500 mt-0.5">
                WaveLink never sends full private messages in push notifications—only a brief snippet, or you can hide previews completely.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.showMessagePreviews}
            onClick={() =>
              handleUpdateSetting({ showMessagePreviews: !settings.showMessagePreviews })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.showMessagePreviews ? 'bg-blue-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                settings.showMessagePreviews ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Live Lock-Screen Preview Example */}
        <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
            W
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-stone-900">
                {settings.showMessagePreviews ? 'Amani Creative' : 'New message from Amani Creative'}
              </span>
              <span className="text-stone-400">now</span>
            </div>
            <p className="text-xs text-stone-600 truncate mt-0.5">
              {settings.showMessagePreviews
                ? 'Hey! Are you joining the WaveLink creator meetup…'
                : 'Sent you a private message on WaveLink. Tap to view.'}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Quiet Hours */}
      <div
        className={`bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-4 transition-opacity ${
          settings.masterEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
              <Moon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-stone-900">Quiet Hours</h4>
              <p className="text-xs text-stone-500 mt-0.5">
                Automatically silence push notifications from the server during your rest hours.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.quietHoursEnabled}
            onClick={() =>
              handleUpdateSetting({ quietHoursEnabled: !settings.quietHoursEnabled })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.quietHoursEnabled ? 'bg-blue-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                settings.quietHoursEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {settings.quietHoursEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">
                Quiet Hours Start
              </label>
              <input
                type="time"
                value={settings.quietHoursStart || '22:00'}
                onChange={(e) => handleUpdateSetting({ quietHoursStart: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-900 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">
                Quiet Hours End
              </label>
              <input
                type="time"
                value={settings.quietHoursEnd || '07:00'}
                onChange={(e) => handleUpdateSetting({ quietHoursEnd: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* Security Note */}
      <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-2.5 text-[11px] text-stone-500">
        <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
        <span>
          Push notifications are dispatched exclusively by the WaveLink server using Firebase Cloud Messaging. Your device token is stored privately under your account and automatically deleted when you sign out.
        </span>
      </div>
    </div>
  );
};
