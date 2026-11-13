import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserNotificationSettings, FcmTokenEntry } from '../types';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchDeviceTokenFromUserDoc,
  fetchUserNotificationSettings,
  getBrowserNotificationPermission,
  getDeviceSavedTokenFromUserDoc,
  getMessagingServiceWorkerRegistration,
  getNotificationStatusKind,
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
  Info,
  RefreshCw
} from 'lucide-react';

export const NotificationSettingsPanel: React.FC = () => {
  const { currentUser, userProfile, showGlobalToast } = useAuth();
  const { language, t } = useLanguage();

  const [settings, setSettings] = useState<UserNotificationSettings>(() => ({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(userProfile?.notificationSettings || {})
  }));

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [docDeviceToken, setDocDeviceToken] = useState<string | null>(() =>
    getDeviceSavedTokenFromUserDoc(userProfile)
  );
  const [registeredDevices, setRegisteredDevices] = useState<FcmTokenEntry[]>([]);
  const [isRechecking, setIsRechecking] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Load notification toggles from users/{uid}/settings/notifications
  useEffect(() => {
    if (!currentUser?.uid) return;
    let cancelled = false;
    fetchUserNotificationSettings(currentUser.uid, userProfile?.notificationSettings)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((err) => {
        console.warn('[WaveLink Push] Could not load users/{uid}/settings/notifications:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, userProfile?.notificationSettings]);

  const refreshStatusFromBrowserAndFirestore = useCallback(
    async (showMessage = false) => {
      const nextPermission = getBrowserNotificationPermission();
      setPermissionState(nextPermission);

      if (!currentUser?.uid) return;
      setIsRechecking(true);
      if (showMessage) setStatusFeedback(null);
      try {
        const { tokenInDoc, allTokens } = await fetchDeviceTokenFromUserDoc(currentUser.uid);
        setDocDeviceToken(tokenInDoc);
        setRegisteredDevices(allTokens);
        if (showMessage) {
          if (nextPermission === 'denied') {
            setStatusFeedback({
              type: 'error',
              text: 'Still blocked in the browser. Follow steps 1–3 above in Chrome, then tap Re-check.'
            });
          } else if (nextPermission === 'granted' && tokenInDoc) {
            setStatusFeedback({
              type: 'success',
              text: 'Notifications are On and this device token is saved in users/{uid}/fcmTokens.'
            });
          } else if (nextPermission === 'granted' && !tokenInDoc) {
            setStatusFeedback({
              type: 'info',
              text: 'Browser permission is now allowed! Tap "Enable notifications" to save your device token.'
            });
          } else {
            setStatusFeedback({
              type: 'info',
              text: 'Notifications are not set up yet. Tap "Enable notifications" to turn them on.'
            });
          }
        }
      } catch (err: any) {
        console.error('[WaveLink Push] Failed to check users/{uid}/fcmTokens:', err);
        if (showMessage) {
          setStatusFeedback({
            type: 'error',
            text: `Could not verify saved device token in Firestore: ${err?.message || String(err)}`
          });
        }
      } finally {
        setIsRechecking(false);
      }
    },
    [currentUser?.uid]
  );

  // Verify Firestore subcollection token state when panel mounts
  useEffect(() => {
    refreshStatusFromBrowserAndFirestore(false);
  }, [refreshStatusFromBrowserAndFirestore]);

  const handleEnableDevicePush = async () => {
    if (!currentUser) return;
    setIsRequestingPermission(true);
    setStatusFeedback(null);

    try {
      const result = await requestPushPermissionAndSaveToken(currentUser.uid);
      setPermissionState(result.permission);
      if (result.success && result.token) {
        setDocDeviceToken(result.token);
        await refreshStatusFromBrowserAndFirestore(false);
        setStatusFeedback({
          type: 'success',
          text:
            language === 'sw'
              ? 'Arifa za simu zimewashwa kwenye kifaa hiki!'
              : 'Notifications are now On! Device token saved in users/{uid}/fcmTokens.'
        });
        showGlobalToast(
          language === 'sw'
            ? 'Arifa zimewashwa kwenye kifaa hiki!'
            : 'Notifications enabled on this device!'
        );
      } else {
        setStatusFeedback({
          type: 'error',
          text:
            result.error ||
            'Could not enable notifications on this device.'
        });
      }
    } catch (err: any) {
      console.error('[WaveLink Push] Unexpected enable failure:', err);
      setStatusFeedback({
        type: 'error',
        text: err?.message || String(err) || 'Could not enable notifications.'
      });
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
      setDocDeviceToken(null);
      await refreshStatusFromBrowserAndFirestore(false);
      setStatusFeedback({
        type: 'success',
        text:
          language === 'sw'
            ? 'Kifaa hiki kimeondolewa na hakitapokea tena arifa.'
            : 'This device token has been removed from users/{uid}/fcmTokens.'
      });
      showGlobalToast(
        language === 'sw'
          ? 'Arifa zimezimwa kwenye kifaa hiki.'
          : 'Push notifications turned off for this device.'
      );
    } catch (err: any) {
      console.error('[WaveLink Push] Error removing device token:', err);
      setStatusFeedback({
        type: 'error',
        text: `Could not turn off notifications on this device: ${err?.message || String(err)}`
      });
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
    } catch (err: any) {
      console.error('Failed to save notification settings:', err);
      setStatusFeedback({
        type: 'error',
        text: `Failed to save notification setting: ${err?.message || String(err)}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!currentUser) return;
    setIsSendingTest(true);
    setStatusFeedback(null);

    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setStatusFeedback({
          type: 'error',
          text: 'Browser Notification API is not supported in this browser.'
        });
        return;
      }

      const currentPerm = Notification.permission;
      setPermissionState(currentPerm);

      if (currentPerm === 'denied') {
        setStatusFeedback({
          type: 'error',
          text: 'Notifications are blocked in the browser. Follow the Chrome unblock steps above, then tap Re-check.'
        });
        return;
      }

      if (currentPerm !== 'granted') {
        setStatusFeedback({
          type: 'error',
          text: 'Notification permission is not granted yet. Tap "Enable notifications" first.'
        });
        return;
      }

      // 1. Immediately verify device side using the service worker's showNotification
      let swReg: ServiceWorkerRegistration;
      try {
        swReg = await getMessagingServiceWorkerRegistration();
      } catch (swErr: any) {
        console.error('[WaveLink Test Push] Service worker error:', swErr);
        setStatusFeedback({
          type: 'error',
          text: `Service worker failed: ${swErr?.message || String(swErr)}`
        });
        return;
      }

      try {
        await swReg.showNotification('WaveLink Test Notification', {
          body: 'Device notifications are working! Checking server push...',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'wavelink-test-local'
        } as any);
      } catch (localErr: any) {
        console.error('[WaveLink Test Push] Local showNotification error:', localErr);
        setStatusFeedback({
          type: 'error',
          text: `Local notification failed (showNotification): ${localErr?.message || String(localErr)}`
        });
        return;
      }

      // 2. Also ask the server endpoint / function to send a real push if available
      try {
        const serverResult = await sendTestPushNotificationToSelf();
        if (serverResult.sent && (serverResult.successCount || 0) > 0) {
          setStatusFeedback({
            type: 'success',
            text:
              language === 'sw'
                ? `Arifa ya kifaa imeonyeshwa na arifa halisi ya seva imetumwa kwenye vifaa ${serverResult.successCount}!`
                : `Local notification shown right away, and real server push delivered to ${serverResult.successCount} registered device${
                    serverResult.successCount === 1 ? '' : 's'
                  }!`
          });
        } else if (serverResult.reason === 'no_tokens') {
          setStatusFeedback({
            type: 'info',
            text: 'Local notification worked on this device! No FCM token is saved on the server yet — tap "Enable notifications" to save your token.'
          });
        } else {
          setStatusFeedback({
            type: 'info',
            text: `Local notification worked on this device! Server push response: ${
              serverResult.error || serverResult.reason || 'Server push is not active in this environment.'
            }`
          });
        }
      } catch (serverErr: any) {
        console.error('[WaveLink Test Push] Server push check failed:', serverErr);
        setStatusFeedback({
          type: 'info',
          text: `Local notification worked on this device! Server push check failed: ${
            serverErr?.message || String(serverErr)
          }`
        });
      }
    } finally {
      setIsSendingTest(false);
    }
  };

  const statusKind = getNotificationStatusKind(permissionState, docDeviceToken || getSavedDeviceToken());
  const isDeviceSubscribed = statusKind === 'on';
  const likesAndCommentsChecked =
    settings.likesAndComments !== undefined
      ? settings.likesAndComments !== false
      : settings.reactions !== false || settings.replies !== false;

  const statusLabel =
    statusKind === 'on'
      ? 'On'
      : statusKind === 'blocked'
      ? 'Blocked in the browser'
      : 'Not set up yet';

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
                statusKind === 'on'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : statusKind === 'blocked'
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}
            >
              {statusKind === 'on' ? (
                <Bell size={22} />
              ) : statusKind === 'blocked' ? (
                <BellOff size={22} />
              ) : (
                <Smartphone size={22} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-stone-900">
                  {language === 'sw' ? 'Arifa (Notifications)' : 'Notifications'}
                </h3>
                {statusKind === 'on' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                    <CheckCircle2 size={12} />
                    <span>{statusLabel}</span>
                  </span>
                ) : statusKind === 'blocked' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                    <AlertCircle size={12} />
                    <span>{statusLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                    <span>{statusLabel}</span>
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed">
                {t('notif.kind_explanation')}
              </p>
              <p className="text-[11px] text-stone-500 mt-1.5 font-medium">
                Browser permission: <strong>{permissionState}</strong> • User profile token:{' '}
                <strong>{docDeviceToken ? 'Saved on this device' : 'Not saved yet'}</strong>
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
                    <span>{language === 'sw' ? 'Inawasha...' : 'Enabling...'}</span>
                  </>
                ) : (
                  <>
                    <Bell size={15} />
                    <span>{language === 'sw' ? 'Washa arifa' : 'Enable notifications'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Short plain Chrome unblock steps + Re-check button when blocked */}
        {statusKind === 'blocked' && (
          <div className="p-4 rounded-xl bg-rose-50/90 border border-rose-200 text-xs text-rose-950 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-extrabold text-rose-900">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>How to unblock notifications in Chrome:</span>
              </div>
              <button
                type="button"
                onClick={() => refreshStatusFromBrowserAndFirestore(true)}
                disabled={isRechecking}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw size={13} className={isRechecking ? 'animate-spin' : ''} />
                <span>{isRechecking ? 'Checking...' : 'Re-check'}</span>
              </button>
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-[11px] sm:text-xs text-rose-900 leading-relaxed">
              <li>
                Tap the <strong>site settings / tune (or lock) icon</strong> to the left of the website address in Chrome.
              </li>
              <li>
                Open <strong>Notifications</strong> (or <strong>Permissions → Notifications</strong>) and change it from <strong>Block</strong> to <strong>Allow</strong>.
              </li>
              <li>
                Tap <strong>Re-check</strong> above, then tap <strong>Enable notifications</strong>.
              </li>
            </ol>
          </div>
        )}

        {registeredDevices.length > 0 && (
          <div className="pt-2 border-t border-stone-100">
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
              Registered devices ({registeredDevices.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {registeredDevices.map((dev, idx) => (
                <div
                  key={`${dev.token || dev.deviceId || idx}`}
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
            className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 border ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : statusFeedback.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
            ) : statusFeedback.type === 'info' ? (
              <Info size={15} className="shrink-0 mt-0.5 text-blue-600" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
            )}
            <span className="break-words">{statusFeedback.text}</span>
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
