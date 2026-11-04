/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db, testConnection } from './firebase';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { recordSystemDomain } from './services/verificationService';
import { triggerHaptic } from './utils/haptics';
import { ActiveTab, CallRecipient } from './types';
import { AuthPage } from './components/AuthPage';
import { TopHeader } from './components/TopHeader';
import { MobileBottomNav } from './components/MobileBottomNav';
import { WarningBanner } from './components/WarningBanner';
import { BannedView } from './components/BannedView';
import { FeedView } from './components/FeedView';
import { StudioEditorView } from './components/StudioEditorView';
import { VideosHubView } from './components/VideosHubView';
import { AnnouncementsView } from './components/AnnouncementsView';
import { ChatChannelsView } from './components/ChatChannelsView';
import { UserDirectoryView } from './components/UserDirectoryView';
import { AdminDashboard } from './components/AdminDashboard';
import { SettingsView } from './components/SettingsView';
import { CreatorAnalyticsView } from './components/CreatorAnalyticsView';
import { MonetizationHub } from './components/MonetizationHub';
import { CallingModal } from './components/CallingModal';
import { WelinkAssistantDrawer } from './components/WelinkAssistantDrawer';
import { SparkUploadQueueBanner } from './components/SparkUploadQueueBanner';
import { Waves, PhoneCall, PhoneOff, Video } from 'lucide-react';

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerPhotoURL?: string;
  callType: 'video' | 'voice';
  offer?: any;
}

function MainApp() {
  const { currentUser, userProfile, isLoading } = useAuth();
  const { appearanceTheme, setAppearanceTheme } = useTheme();

  // Remember user's session tab from where they left off
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem('wavelink_last_active_tab') as ActiveTab;
    const validTabs: ActiveTab[] = [
      'feed',
      'studio',
      'videos',
      'monetization',
      'announcements',
      'chat',
      'directory',
      'analytics',
      'admin',
      'settings'
    ];
    return saved && validTabs.includes(saved) ? saved : 'feed';
  });

  const [targetChatUserId, setTargetChatUserId] = useState<string | undefined>(() => {
    return localStorage.getItem('wavelink_last_chat_target') || undefined;
  });

  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [activeCall, setActiveCall] = useState<{
    type: 'video' | 'voice';
    recipient?: CallRecipient;
    isInitiator?: boolean;
    callId?: string;
    initialOffer?: any;
  } | null>(null);
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [isWelinkOpen, setIsWelinkOpen] = useState(false);
  const [welinkInitialMode, setWelinkInitialMode] = useState<'chat' | 'image' | 'voice'>('chat');
  const [unreadNotificationIds, setUnreadNotificationIds] = useState<string[]>([]);

  // Global delegated haptic feedback for button and interactive tab interactions
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleGlobalInteractiveClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const interactiveEl = target.closest(
        'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), [role="tab"]:not([aria-disabled="true"])'
      ) as HTMLElement | null;
      if (interactiveEl) {
        const isTabRole = interactiveEl.getAttribute('role') === 'tab';
        triggerHaptic(isTabRole ? 'tab' : 'light');
      }
    };
    document.addEventListener('click', handleGlobalInteractiveClick, { passive: true });
    return () => {
      document.removeEventListener('click', handleGlobalInteractiveClick);
    };
  }, []);

  // Sync user's saved appearanceTheme from Firestore across devices
  useEffect(() => {
    if (userProfile?.appearanceTheme && userProfile.appearanceTheme !== appearanceTheme) {
      setAppearanceTheme(userProfile.appearanceTheme);
    }
  }, [userProfile?.appearanceTheme]);

  // Listen for unread reaction/reply notifications to display a small notification dot
  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadNotificationIds([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const unread: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data && data.read === false) {
            unread.push(d.id);
          }
        });
        setUnreadNotificationIds(unread);
      },
      () => {}
    );
    return () => unsub();
  }, [currentUser?.uid]);

  const setActiveTab = (tab: ActiveTab) => {
    triggerHaptic(tab === 'studio' ? 'medium' : 'tab');
    setActiveTabState(tab);
    localStorage.setItem('wavelink_last_active_tab', tab);

    // Clear unread notification dot when user checks Home or Profile
    if ((tab === 'feed' || tab === 'settings') && unreadNotificationIds.length > 0) {
      unreadNotificationIds.slice(0, 10).forEach((id) => {
        updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});
      });
    }
  };

  const handleStartChatWithUser = (userId: string) => {
    setTargetChatUserId(userId);
    localStorage.setItem('wavelink_last_chat_target', userId);
    setActiveTab('chat');
  };

  useEffect(() => {
    testConnection();
    recordSystemDomain();
  }, []);



  // Soft pleasant Web Audio Ringtone loop for incoming calls
  useEffect(() => {
    if (!incomingCall) return;

    let isPlaying = true;
    let timer: any = null;
    let audioCtx: AudioContext | null = null;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();

        const playChime = () => {
          if (!isPlaying || !audioCtx || audioCtx.state === 'closed') return;
          try {
            const now = audioCtx.currentTime;
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sine';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(523.25, now); // C5
            osc1.frequency.setValueAtTime(659.25, now + 0.2); // E5
            osc2.frequency.setValueAtTime(783.99, now + 0.4); // G5

            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start(now);
            osc2.start(now + 0.2);
            osc1.stop(now + 1.2);
            osc2.stop(now + 1.2);

            triggerHaptic('medium');
          } catch (e) {
            // Audio policy exception handling
          }

          timer = setTimeout(playChime, 2600);
        };

        playChime();
      }
    } catch {
      // AudioContext unavailable
    }

    return () => {
      isPlaying = false;
      if (timer) clearTimeout(timer);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [Boolean(incomingCall)]);

  // Real-time listener for incoming call signals via WebSocket
  useEffect(() => {
    if (!currentUser?.uid) return;
    let isCleanedUp = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (isCleanedUp) return;
      ws.send(
        JSON.stringify({
          type: 'chat:join',
          channelId: `user_${currentUser.uid}`,
          userId: currentUser.uid,
          name: userProfile?.displayName || currentUser.displayName || 'Waver'
        })
      );
    };

    ws.onmessage = (event) => {
      if (isCleanedUp) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'call:signal' && data.targetUserId === currentUser.uid) {
          if (data.signalType === 'offer') {
            setIncomingCall({
              callId: data.callId,
              callerId: data.senderId,
              callerName: data.senderName,
              callerPhotoURL: data.senderPhotoURL,
              callType: data.callType || 'video',
              offer: data.sdp
            });
          } else if (data.signalType === 'end' || data.signalType === 'declined') {
            setIncomingCall((prev) => (prev?.callId === data.callId ? null : prev));
          }
        }
      } catch (err) {
        console.warn('Incoming call signal parse notice:', err);
      }
    };

    return () => {
      isCleanedUp = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [currentUser?.uid]);

  const handleOpenCall = (type: 'video' | 'voice', recipient?: CallRecipient) => {
    triggerHaptic('medium');
    // Single popup rule: close any open drawer before opening call modal
    setIsWelinkOpen(false);
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setActiveCall({
      type,
      recipient,
      isInitiator: true,
      callId
    });
  };

  const handleAcceptIncomingCall = () => {
    if (!incomingCall) return;
    const { callId, callerId, callerName, callerPhotoURL, callType, offer } = incomingCall;
    setIncomingCall(null);
    setIsWelinkOpen(false);
    setActiveCall({
      type: callType,
      recipient: {
        id: callerId,
        name: callerName,
        photoURL: callerPhotoURL
      },
      isInitiator: false,
      callId,
      initialOffer: offer
    });
  };

  const handleDeclineIncomingCall = () => {
    if (!incomingCall) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws`);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'call:signal',
            callId: incomingCall.callId,
            senderId: currentUser?.uid,
            senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
            targetUserId: incomingCall.callerId,
            signalType: 'declined'
          })
        );
        setTimeout(() => ws.close(), 300);
      };
    } catch {
      // ws send error
    }
    setIncomingCall(null);
  };

  const handleOpenWelink = (mode: 'chat' | 'image' | 'voice' = 'chat') => {
    triggerHaptic('medium');
    // Single popup rule: close any active call modal before opening WELINK drawer
    setActiveCall(null);
    setWelinkInitialMode(mode);
    setIsWelinkOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <div className="p-4 rounded-3xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white shadow-lg mb-4 animate-bounce">
          <Waves size={36} />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#1C1917]">
          WaveLink
        </h2>
        <p className="text-xs text-[#78716C] mt-1 font-medium">
          Opening your welcoming community space...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  if (userProfile?.isBanned) {
    return <BannedView onOpenSupport={() => setActiveTab('settings')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] antialiased transition-colors duration-300">
      {/* Top in-app warning notice if issued by admin */}
      <WarningBanner />

      {/* Top Header Bar (with non-floating WELINK button) */}
      <TopHeader
        activeTab={activeTab}
        onOpenMobileMenu={() => {}}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onStartChat={handleStartChatWithUser}
        onOpenWelink={handleOpenWelink}
        hasUnreadNotifications={unreadNotificationIds.length > 0}
        onSelectHashtag={(tag) => {
          setSelectedHashtag(tag);
          setActiveTab('feed');
        }}
      />

      {/* Main Body View */}
      <main
        className={`flex-1 w-full max-w-full overflow-x-hidden ${
          activeTab === 'chat' ? 'pb-18' : 'pb-24'
        }`}
      >
        {activeTab === 'feed' && (
          <FeedView
            onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
            initialFilterTag={selectedHashtag}
            onClearFilterTag={() => setSelectedHashtag(null)}
            onOpenWelink={handleOpenWelink}
            onStartChat={handleStartChatWithUser}
          />
        )}
        {activeTab === 'studio' && (
          <StudioEditorView onNavigateToFeed={() => setActiveTab('feed')} />
        )}
        {activeTab === 'videos' && (
          <VideosHubView onNavigateToFeed={() => setActiveTab('feed')} />
        )}
        {activeTab === 'announcements' && <AnnouncementsView />}
        {activeTab === 'chat' && (
          <ChatChannelsView
            onOpenCall={handleOpenCall}
            initialTargetUserId={targetChatUserId}
          />
        )}
        {activeTab === 'directory' && (
          <UserDirectoryView onStartChat={handleStartChatWithUser} />
        )}
        {activeTab === 'analytics' && (
          <CreatorAnalyticsView onOpenUpgradeModal={() => setActiveTab('settings')} />
        )}
        {activeTab === 'monetization' && (
          <MonetizationHub onNavigateToFeed={() => setActiveTab('feed')} />
        )}
        {activeTab === 'admin' && (
          <AdminDashboard onReturnToFeed={() => setActiveTab('settings')} />
        )}
        {activeTab === 'settings' && (
          <SettingsView onOpenAdminPanel={() => setActiveTab('admin')} />
        )}
      </main>

      {/* Non-blocking Background Spark Upload Queue Progress Tracker */}
      <SparkUploadQueueBanner variant="floating" />

      {/* Bottom Tab Bar as the only main navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasUnreadNotifications={unreadNotificationIds.length > 0}
      />

      {/* WELINK AI Assistant Drawer (Only one popup/drawer at a time, with clear close button) */}
      <WelinkAssistantDrawer
        isOpen={isWelinkOpen && !activeCall}
        onClose={() => setIsWelinkOpen(false)}
        onOpenUpgrade={() => setActiveTab('settings')}
        initialMode={welinkInitialMode}
      />

      {/* Incoming Call Notification Ringing Alert Dialog */}
      {incomingCall && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-stone-200 text-center space-y-4">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <img
                src={
                  incomingCall.callerPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${incomingCall.callerId}`
                }
                alt={incomingCall.callerName}
                className="w-full h-full rounded-full object-cover ring-4 ring-emerald-500 shadow-lg relative bg-white"
              />
              <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-emerald-500 text-white shadow-md">
                {incomingCall.callType === 'video' ? <Video size={16} /> : <PhoneCall size={16} />}
              </div>
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call</span>
              </span>
              <h3 className="text-xl font-black text-stone-900 tracking-tight">
                {incomingCall.callerName}
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Wants to connect with you via live {incomingCall.callType} call!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleDeclineIncomingCall}
                className="min-h-[44px] py-3 px-4 rounded-2xl bg-stone-100 hover:bg-stone-200 text-rose-600 font-extrabold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <PhoneOff size={16} />
                <span>Decline</span>
              </button>
              <button
                type="button"
                onClick={handleAcceptIncomingCall}
                className="min-h-[44px] py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition active:scale-95 animate-pulse"
              >
                <PhoneCall size={16} />
                <span>Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WebRTC Video & Voice Calling Overlay Modal (Single popup discipline) */}
      {activeCall && !isWelinkOpen && (
        <CallingModal
          initialType={activeCall.type}
          recipient={activeCall.recipient}
          isInitiator={activeCall.isInitiator}
          callId={activeCall.callId}
          initialOffer={activeCall.initialOffer}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
