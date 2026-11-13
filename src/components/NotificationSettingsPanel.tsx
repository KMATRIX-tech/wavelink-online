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
  saveUserNotificationSettings,
  sendTestPushNotificationToSelf
} from '../services/fcmService';
import { AddToHomeScreenHintCard, PWAInstallButton } from './PWAInstallButton';
import {
  Bell,
  BellOff,
  MessageSquare,
  PhoneCall,
  UserPlus,
  Heart,
  Sparkles,
  Moon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Smartphone,
  ShieldCheck,
  Send,
  Volume2,
  Info
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
              : 'Push notifications are now active on this device!'
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
    const syncedPatch: Partial<UserNotificationSettings> = { ...patch };
    if (patch.likesAndComments !== undefined) {
      syncedPatch.reactions = patch.likesAndComments;
      syncedPatch.replies = patch.likesAndComments;
    }

    const nextSettings: UserNotificationSettings = {
      ...settings,
      ...syncedPatch,
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
      const serverResult = await sendTestPushNotificationToSelf();
      if (serverResult.sent && (serverResult.successCount || 0) > 0) {
        setStatusFeedback({
          type: 'success',
          text:
            language === 'sw'
              ? `Arifa halisi ya jaribio imetumwa kwenye vifaa ${serverResult.successCount}!`
              : `Real test push notification delivered to ${serverResult.successCount} registered device${
                  serverResult.successCount === 1 ? '' : 's'
                }!`
        });
      } else if (serverResult.reason === 'no_tokens') {
        setStatusFeedback({
          type: 'error',
          text:
            'No active FCM device token is saved yet. Tap "Enable Push Notifications" above first (with VITE_FIREBASE_VAPID_KEY configured).'
        });
      } else {
        // If Firebase Admin credentials aren't active in local preview, verify SW notification rendering locally
        if ('serviceWorker' in navigator && Notification.permission === 'granted') {
          const reg =
            (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
            (await navigator.serviceWorker.getRegistration('/'));
          if (reg) {
            await reg.showNotification('WaveLink Test Notification', {
              body:
                serverResult.error ||
                'Local notification preview worked. Deploy Cloud Functions & Firebase credentials for background phone pushes.',
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'wavelink-test-local'
            } as any);
          }
        }
        setStatusFeedback({
          type: 'error',
          text:
            serverResult.error ||
            serverResult.reason ||
            'Server FCM delivery is not configured in this environment yet.'
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        text: err?.message || 'Could not send test notification right now.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const isDeviceSubscribed = Boolean(deviceToken && permissionState === 'granted');
  const registeredDevices = Array.isArray(userProfile?.fcmTokens) ? userProfile!.fcmTokens : [];
  const likesAndCommentsChecked =
    settings.likesAndComments !== undefined
      ? settings.likesAndComments !== false
      : settings.reactions !== false || settings.replies !== false;

  const categoryItems: Array<{
    key: 'messages' | 'calls' | 'followers' | 'likesAndComments' | 'followedPosts' | 'soundAndVibration';
    label: string;
    desc: string;
    checked: boolean;
    icon: React.ReactNode;
    bg: string;
  }> = [
    {
      key: 'messages',
      label: language === 'sw' ? 'Ujumbe (Messages)' : 'Messages',
      desc:
        language === 'sw'
          ? 'Ujumbe wa moja kwa moja na soga za vikundi'
          : 'Direct messages and group chat alerts',
      checked: settings.messages !== false,
      icon: <MessageSquare size={16} className="text-blue-600" />,
      bg: 'bg-blue-50'
    },
    {
      key: 'calls',
      label: language === 'sw' ? 'Simu (Calls)' : 'Calls',
      desc:
        language === 'sw'
          ? 'Arifa kubwa yenye vitufe vya Pokea (Answer) na Kataa (Decline)'
          : 'High-priority incoming video & voice call alerts and missed call notices',
      checked: settings.calls !== false,
      icon: <PhoneCall size={16} className="text-emerald-600" />,
      bg: 'bg-emerald-50'
    },
    {
      key: 'followers',
      label: language === 'sw' ? 'Wafuasi Wapya (New followers)' : 'New followers',
      desc:
        language === 'sw'
          ? 'Mtu anapoanza kukufuata kwenye WaveLink'
          : 'When someone starts following your profile',
      checked: settings.followers !== false,
      icon: <UserPlus size={16} className="text-purple-600" />,
      bg: 'bg-purple-50'
    },
    {
      key: 'likesAndComments',
      label: language === 'sw' ? 'Likes na Maoni (Likes & comments)' : 'Likes and comments',
      desc:
        language === 'sw'
          ? 'Likes, mioyo na maoni kwenye machapisho yako'
          : 'Reactions and new comments on your posts',
      checked: likesAndCommentsChecked,
      icon: <Heart size={16} className="text-rose-600" />,
      bg: 'bg-rose-50'
    },
    {
      key: 'followedPosts',
      label:
        language === 'sw'
          ? 'Machapisho mapya kutoka unaowafuata'
          : 'New posts from people I follow',
      desc:
        language === 'sw'
          ? 'Hadi arifa 1 kwa saa kwa kila mbunifu unayemfuata'
          : 'Up to once per hour per creator you follow',
      checked: settings.followedPosts !== false,
      icon: <Sparkles size={16} className="text-amber-600" />,
      bg: 'bg-amber-50'
    },
    {
      key: 'soundAndVibration',
      label: language === 'sw' ? 'Sauti na Mtetemo (Sound / vibration)' : 'Sound and vibration',
      desc:
        language === 'sw'
          ? 'Toa sauti au mtetemo wa simu arifa zinapoingia'
          : 'Play notification sound and vibrate device on alert',
      checked: settings.soundAndVibration !== false,
      icon: <Volume2 size={16} className="text-teal-600" />,
      bg: 'bg-teal-50'
    }
  ];

  return (
    <div className="space-y-5">
      {/* Install WaveLink & iPhone Home Screen Prompt */}
      <div className="space-y-2.5">
        <PWAInstallButton variant="full" />
        <AddToHomeScreenHintCard />
      </div>

      {/* 1. Device Push Registration Card */}
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

              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed">
                {t('notif.kind_explanation')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleSendTestPush}
              disabled={isSendingTest}
              className="px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{language === 'sw' ? 'Tuma arifa ya jaribio' : 'Send test notification'}</span>
            </button>

            {isDeviceSubscribed ? (
              <button
                type="button"
                onClick={handleDisableDevicePush}
                disabled={isRequestingPermission}
                className="px-3.5 py-2.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-600 border border-stone-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <BellOff size={14} />
                <span>{t('notif.disable_btn')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnableDevicePush}
                disabled={isRequestingPermission}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
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

        {registeredDevices.length > 0 && (
          <div className="pt-2 border-t border-stone-100">
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
              Registered devices ({registeredDevices.length}/5)
            </div>
            <div className="flex flex-wrap gap-2">
              {registeredDevices.map((dev, idx) => (
                <div
                  key={`${dev.deviceId || idx}`}
                  className="px-2.5 py-1 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-700 font-semibold"
                >
                  {dev.deviceName || dev.platform || 'Device'}
                </div>
              ))}
            </div>
          </div>
        )}

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
            {language === 'sw' ? 'Aina za Arifa' : 'Notification Preferences'}
          </h4>
          <p className="text-xs text-stone-500 mt-0.5">
            {language === 'sw'
              ? 'Chagua ni arifa zipi ungependa kupokea kutoka kwenye seva ya WaveLink.'
              : 'Choose which push alerts WaveLink sends to your phone and computer.'}
          </p>
        </div>

        <div className="divide-y divide-stone-100">
          {categoryItems.map((item) => (
            <div
              key={item.key}
              className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4"
            >
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
                aria-checked={item.checked}
                onClick={() => handleUpdateSetting({ [item.key]: !item.checked })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  item.checked ? 'bg-blue-600' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    item.checked ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
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
                Display a short snippet in message alerts, or hide previews completely on your lock screen.
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
                Silence non-urgent push notifications from the server during your rest hours.
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

      {/* 6. Honest Web Push Limits */}
      <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 space-y-1.5">
        <div className="flex items-center gap-2 font-extrabold text-amber-900">
          <Info size={15} className="shrink-0 text-amber-700" />
          <span>How mobile notifications work on a web app</span>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-900/90 leading-relaxed">
          <li>
            <strong>Incoming calls:</strong> Web apps cannot take over the whole phone screen while your phone is locked like a native carrier call. Instead, incoming calls arrive as a loud, high-priority notification with <strong>Answer</strong> and <strong>Decline</strong> buttons.
          </li>
          <li>
            <strong>iPhone &amp; iPad:</strong> Apple requires installing WaveLink to your Home Screen (Safari <strong>Share → Add to Home Screen</strong> on iOS 16.4+) and opening it from your Home Screen icon to receive push alerts.
          </li>
        </ul>
      </div>

      {/* Security Note */}
      <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center gap-2.5 text-[11px] text-stone-500">
        <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
        <span>
          Push notifications are sent exclusively by WaveLink Firebase Cloud Functions using your saved preferences, capped at 20 alerts/hour, and removed automatically when you sign out.
        </span>
      </div>
    </div>
  );
};
