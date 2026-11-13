/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { PresenceProvider } from './context/PresenceContext';
import { db, cleanFirestoreData, testConnection } from './firebase';
import { collection, query, where, limit, onSnapshot, updateDoc, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { recordSystemDomain } from './services/verificationService';
import { triggerHaptic } from './utils/haptics';
import { ActiveTab, CallRecipient } from './types';
import { AuthPage } from './components/AuthPage';
import { TopHeader } from './components/TopHeader';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { WarningBanner } from './components/WarningBanner';
import { BannedView } from './components/BannedView';
import { FeedView } from './components/FeedView';
import { StudioEditorView } from './components/StudioEditorView';
import { VideosHubView } from './components/VideosHubView';
import { TrendingChallengesView } from './components/TrendingChallengesView';
import { InterestPickerModal, hasUserCompletedOrSkippedInterests } from './components/InterestPickerModal';
import { AnnouncementsView } from './components/AnnouncementsView';
import { ChatChannelsView, computeDmConversationId } from './components/ChatChannelsView';
import { UserDirectoryView } from './components/UserDirectoryView';
import { AdminDashboard } from './components/AdminDashboard';
import AdminGuard from './components/AdminGuard';
import { SettingsView } from './components/SettingsView';
import { CreatorAnalyticsView } from './components/CreatorAnalyticsView';
import { MonetizationHub } from './components/MonetizationHub';
import { CallingModal } from './components/CallingModal';
import { WelinkAssistantDrawer } from './components/WelinkAssistantDrawer';
import { SparkUploadQueueBanner } from './components/SparkUploadQueueBanner';
import { VideoUploadProgressChip } from './components/VideoUploadProgressChip';
import { ErrorBoundary } from './components/ErrorBoundary';
import { validateFrontendEnvironment } from './utils/envValidation';
import { setDataSaverPreference } from './services/dataSaverService';
import { SimpleModeProvider } from './context/SimpleModeContext';
import { FirstTimeTourModal } from './components/FirstTimeTourModal';
import { HelpModal } from './components/HelpModal';
import { CelebrationBanner } from './components/CelebrationBanner';
import { Waves, PhoneCall, PhoneOff, Video, AlertTriangle, Sparkles, Volume2, VolumeX, MessageSquare, Send, X } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerPhotoURL?: string;
  callType: 'video' | 'voice';
  offer?: any;
  createdAt?: string;
}

interface AuthenticatedAppProps {
  currentUser: FirebaseUser;
}

function AuthenticatedApp({ currentUser }: AuthenticatedAppProps) {
  const { userProfile } = useAuth();
  const { appearanceTheme, setAppearanceTheme } = useTheme();
  const { setLanguage, language, t } = useLanguage();

  // Remember user's session tab from where they left off
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    try {
      const saved = localStorage.getItem('wavelink_last_active_tab') as ActiveTab;
      const validTabs: ActiveTab[] = [
        'feed',
        'trending',
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
    } catch {
      return 'feed';
    }
  });

  const [targetChatUserId, setTargetChatUserId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('wavelink_last_chat_target') || undefined;
    } catch {
      return undefined;
    }
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
  const [viewedProfileUserId, setViewedProfileUserId] = useState<string | null>(null);
  const [isWelinkOpen, setIsWelinkOpen] = useState(false);
  const [welinkInitialMode, setWelinkInitialMode] = useState<'chat' | 'image' | 'voice'>('chat');
  const [unreadNotificationIds, setUnreadNotificationIds] = useState<string[]>([]);
  const [showInterestPicker, setShowInterestPicker] = useState<boolean>(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_tour_completed') !== '1';
    } catch {
      return false;
    }
  });
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [isRingtoneMuted, setIsRingtoneMuted] = useState(false);
  const [incomingAcceptMode, setIncomingAcceptMode] = useState<'video' | 'voice'>('video');
  const [showCustomQuickReply, setShowCustomQuickReply] = useState(false);
  const [customQuickReplyText, setCustomQuickReplyText] = useState('');
  const [incomingBgError, setIncomingBgError] = useState(false);

  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const handledCallIdsRef = useRef<Set<string>>(new Set());

  const stopIncomingRingtone = useCallback(() => {
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(0);
      } catch {
        // ignore vibration errors on unsupported browsers
      }
    }
  }, []);

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

  // ThemeContext directly syncs appearanceTheme from Firestore without overwriting in-flight saves

  useEffect(() => {
    if (userProfile?.language && (userProfile.language === 'sw' || userProfile.language === 'en') && userProfile.language !== language) {
      setLanguage(userProfile.language);
    }
  }, [userProfile?.language, language, setLanguage]);

  useEffect(() => {
    if (typeof userProfile?.dataSaverEnabled === 'boolean') {
      setDataSaverPreference(userProfile.dataSaverEnabled);
    }
  }, [userProfile?.dataSaverEnabled]);

  // Phase 3: Show skippable post-signup Interest Picker if the user hasn't picked or skipped yet
  useEffect(() => {
    if (!currentUser?.uid || !userProfile) return;
    if (!hasUserCompletedOrSkippedInterests(currentUser.uid, userProfile)) {
      const timer = setTimeout(() => {
        setShowInterestPicker(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.uid, userProfile]);

  // Listen for unread reaction/reply notifications to display a small notification dot
  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadNotificationIds([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('read', '==', false),
      limit(20)
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
    if (tab === 'settings') {
      setViewedProfileUserId(null);
    }
    setActiveTabState(tab);
    try {
      localStorage.setItem('wavelink_last_active_tab', tab);
    } catch {
      // ignore storage quota
    }

    // Clear unread notification dot when user checks Home or Profile
    if ((tab === 'feed' || tab === 'settings') && unreadNotificationIds.length > 0) {
      unreadNotificationIds.slice(0, 10).forEach((id) => {
        updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});
      });
    }
  };

  const handleStartChatWithUser = (userId: string) => {
    setTargetChatUserId(userId);
    try {
      localStorage.setItem('wavelink_last_chat_target', userId);
    } catch {
      // ignore
    }
    setActiveTab('chat');
  };

  useEffect(() => {
    testConnection().catch(() => {});
    recordSystemDomain().catch(() => {});

    const handleGlobalHashtag = (e: Event) => {
      const detail = (e as CustomEvent<string | { hashtag?: string; tag?: string }>).detail;
      const tag = typeof detail === 'string' ? detail : detail?.hashtag || (detail?.tag ? `#${detail.tag}` : '');
      if (tag) {
        setSelectedHashtag(tag.startsWith('#') ? tag : `#${tag}`);
        setActiveTab('feed');
      }
    };
    const handleGlobalMention = (e: Event) => {
      const detail = (e as CustomEvent<string | { userId?: string; handle?: string; username?: string }>).detail;
      if (typeof detail === 'object' && detail?.userId) {
        setViewedProfileUserId(detail.userId);
        setActiveTabState('settings');
        return;
      }
      const mention = typeof detail === 'string' ? detail : detail?.handle || detail?.username || '';
      if (mention) {
        const query = mention.startsWith('@') ? mention : `@${mention}`;
        setSelectedHashtag(query);
        setActiveTab('feed');
      }
    };
    const handleGlobalChat = (e: Event) => {
      const detail = (e as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId) {
        handleStartChatWithUser(detail.userId);
      }
    };
    const handleGlobalNavigateTab = (e: Event) => {
      const tab = (e as CustomEvent<ActiveTab>).detail;
      if (tab) {
        setActiveTab(tab);
      }
    };
    const handleOpenInterestPicker = () => {
      setShowInterestPicker(true);
    };
    const handleOpenTourEvent = () => {
      setIsTourOpen(true);
    };
    const handleOpenHelpEvent = () => {
      setIsHelpOpen(true);
    };
    window.addEventListener('wavelink:hashtag', handleGlobalHashtag);
    window.addEventListener('wavelink:navigate-tag', handleGlobalHashtag);
    window.addEventListener('wavelink:mention', handleGlobalMention);
    window.addEventListener('wavelink:navigate-profile', handleGlobalMention);
    window.addEventListener('wavelink:start-chat', handleGlobalChat);
    window.addEventListener('wavelink:navigate-tab', handleGlobalNavigateTab);
    window.addEventListener('wavelink:open-interest-picker', handleOpenInterestPicker);
    window.addEventListener('wavelink:open-tour', handleOpenTourEvent);
    window.addEventListener('wavelink:open-help', handleOpenHelpEvent);
    return () => {
      window.removeEventListener('wavelink:hashtag', handleGlobalHashtag);
      window.removeEventListener('wavelink:navigate-tag', handleGlobalHashtag);
      window.removeEventListener('wavelink:mention', handleGlobalMention);
      window.removeEventListener('wavelink:navigate-profile', handleGlobalMention);
      window.removeEventListener('wavelink:start-chat', handleGlobalChat);
      window.removeEventListener('wavelink:navigate-tab', handleGlobalNavigateTab);
      window.removeEventListener('wavelink:open-interest-picker', handleOpenInterestPicker);
      window.removeEventListener('wavelink:open-tour', handleOpenTourEvent);
      window.removeEventListener('wavelink:open-help', handleOpenHelpEvent);
    };
  }, []);

  // Ringtone + vibration ONLY for the person receiving the call; stops immediately on mute, accept, decline, or call end
  const isReceivingRingingCall = Boolean(
    incomingCall && !activeCall && incomingCall.callerId !== currentUser?.uid
  );

  // Reset incoming UI state whenever a new incoming call arrives
  useEffect(() => {
    if (!incomingCall) {
      setShowCustomQuickReply(false);
      setCustomQuickReplyText('');
      setIncomingBgError(false);
      return;
    }
    setIsRingtoneMuted(false);
    setIncomingAcceptMode(incomingCall.callType === 'voice' ? 'voice' : 'video');
    setShowCustomQuickReply(false);
    setCustomQuickReplyText('');
    setIncomingBgError(false);
  }, [incomingCall?.callId, incomingCall?.callType]);

  // Prevent Esc key from dismissing incoming call screen accidentally
  useEffect(() => {
    if (!isReceivingRingingCall) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isReceivingRingingCall]);

  useEffect(() => {
    if (!isReceivingRingingCall || isRingtoneMuted) {
      stopIncomingRingtone();
      return;
    }

    let isPlaying = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let audioCtx: AudioContext | null = null;
    let activeOscillators: OscillatorNode[] = [];

    const triggerIncomingVibrate = () => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([420, 220, 420]);
        } catch {
          // ignore
        }
      }
    };

    const cleanupAudio = () => {
      isPlaying = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(0);
        } catch {
          // ignore
        }
      }
      activeOscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore already stopped
        }
      });
      activeOscillators = [];
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    };

    ringtoneStopRef.current = cleanupAudio;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const startChimeLoop = () => {
        if (!isPlaying) return;
        triggerIncomingVibrate();

        if (AudioCtxClass && audioCtx && audioCtx.state !== 'closed') {
          try {
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }

            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
            osc1.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.35); // E5

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
            osc2.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.35); // G5

            gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.9);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(audioCtx.currentTime + 0.95);
            osc2.stop(audioCtx.currentTime + 0.95);

            activeOscillators.push(osc1, osc2);
            setTimeout(() => {
              activeOscillators = activeOscillators.filter((o) => o !== osc1 && o !== osc2);
            }, 1000);
          } catch {
            // chime synth error
          }
        }

        if (isPlaying) {
          timer = setTimeout(startChimeLoop, 2400);
        }
      };

      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
      startChimeLoop();
    } catch {
      // AudioContext unavailable
    }

    return () => {
      cleanupAudio();
    };
  }, [isReceivingRingingCall, isRingtoneMuted, stopIncomingRingtone]);

  // 30-second receiver-side auto-timeout in case caller disconnected abruptly while ringing
  useEffect(() => {
    if (!incomingCall) return;
    const targetCallId = incomingCall.callId;
    const timeout = setTimeout(() => {
      stopIncomingRingtone();
      setIncomingCall((prev) => (prev?.callId === targetCallId ? null : prev));
      updateDoc(doc(db, 'calls', targetCallId), {
        status: 'no_answer',
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    }, 30000);

    return () => clearTimeout(timeout);
  }, [incomingCall?.callId, stopIncomingRingtone]);

  // Real-time Firestore listener for calls addressed to the logged-in user
  useEffect(() => {
    if (!currentUser?.uid) {
      setIncomingCall(null);
      return;
    }

    const processCallSnapshots = (docs: Array<{ id: string; data: () => any }>) => {
      const now = Date.now();
      let newestRinging: IncomingCallData | null = null;
      let newestTime = -Infinity;

      docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        const callId = docSnap.id;
        const status = data.status;
        const parsedTime = data.createdAt ? new Date(data.createdAt).getTime() : now;
        const createdAtMs = isNaN(parsedTime) ? now : parsedTime;
        const ageMs = now - createdAtMs;

        if (
          status === 'ringing' &&
          ageMs < 120000 &&
          !handledCallIdsRef.current.has(callId) &&
          (data.callerId || data.caller) !== currentUser.uid
        ) {
          if (createdAtMs >= newestTime) {
            newestTime = createdAtMs;
            newestRinging = {
              callId,
              callerId: data.callerId || data.caller,
              callerName: data.callerName || 'WaveLink Member',
              callerPhotoURL: data.callerPhotoURL || undefined,
              callType: (data.type || data.callType) === 'voice' ? 'voice' : 'video',
              offer: data.offer || undefined,
              createdAt: data.createdAt
            };
          }
        }
      });

      if (newestRinging) {
        setIncomingCall((prev) => {
          if (prev && prev.callId === newestRinging!.callId) {
            return { ...prev, offer: newestRinging!.offer || prev.offer };
          }
          return newestRinging;
        });
      } else {
        setIncomingCall((prev) => {
          if (!prev) return null;
          const matchingDoc = docs.find((d) => d.id === prev.callId);
          if (matchingDoc) {
            const st = matchingDoc.data()?.status;
            if (st && st !== 'ringing') {
              stopIncomingRingtone();
              return null;
            }
          }
          return prev;
        });
      }
    };

    const qByReceiverId = query(
      collection(db, 'calls'),
      where('receiverId', '==', currentUser.uid),
      limit(30)
    );
    const qByReceiver = query(
      collection(db, 'calls'),
      where('receiver', '==', currentUser.uid),
      limit(30)
    );

    let docsByReceiverId: Array<{ id: string; data: () => any }> = [];
    let docsByReceiver: Array<{ id: string; data: () => any }> = [];

    const mergeAndProcess = () => {
      const seen = new Set<string>();
      const combined: Array<{ id: string; data: () => any }> = [];
      [...docsByReceiverId, ...docsByReceiver].forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          combined.push(d);
        }
      });
      processCallSnapshots(combined);
    };

    const unsub1 = onSnapshot(
      qByReceiverId,
      (snapshot) => {
        docsByReceiverId = snapshot.docs;
        mergeAndProcess();
      },
      (err) => {
        console.warn('Incoming calls (receiverId) listener notice:', err);
      }
    );

    const unsub2 = onSnapshot(
      qByReceiver,
      (snapshot) => {
        docsByReceiver = snapshot.docs;
        mergeAndProcess();
      },
      (err) => {
        console.warn('Incoming calls (receiver) listener notice:', err);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUser?.uid, stopIncomingRingtone]);

  // Real-time listener for incoming call signals via WebSocket (instant low-latency supplement)
  useEffect(() => {
    if (!currentUser?.uid) return;
    let isCleanedUp = false;

    try {
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
            const callerId = data.fromUserId || data.senderId;
            if (data.signalType === 'offer' && callerId && !handledCallIdsRef.current.has(data.callId)) {
              setIncomingCall((prev) => ({
                callId: data.callId,
                callerId,
                callerName: data.fromName || data.senderName || prev?.callerName || 'WaveLink Member',
                callerPhotoURL: data.fromPhotoURL || data.senderPhotoURL || prev?.callerPhotoURL,
                callType: data.callType || prev?.callType || 'video',
                offer: data.signalData || data.sdp || prev?.offer
              }));
            } else if (data.signalType === 'end' || data.signalType === 'declined') {
              stopIncomingRingtone();
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
    } catch {
      // Non-blocking WebSocket setup
    }
  }, [currentUser?.uid, stopIncomingRingtone, userProfile?.displayName, currentUser?.displayName]);

  const handleOpenCall = (type: 'video' | 'voice', recipient?: CallRecipient) => {
    triggerHaptic('medium');
    setIsWelinkOpen(false);
    setActiveCall({
      type,
      recipient,
      isInitiator: true
    });
  };

  const handleAcceptIncomingCall = (overrideMode?: 'video' | 'voice') => {
    if (!incomingCall) return;
    stopIncomingRingtone();
    const { callId, callerId, callerName, callerPhotoURL, callType, offer } = incomingCall;
    const chosenMode =
      overrideMode || (callType === 'video' ? incomingAcceptMode : 'voice');
    handledCallIdsRef.current.add(callId);
    setIncomingCall(null);
    setIsWelinkOpen(false);

    setActiveCall({
      type: chosenMode,
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
    stopIncomingRingtone();
    const { callId, callerId } = incomingCall;
    handledCallIdsRef.current.add(callId);
    setIncomingCall(null);

    updateDoc(doc(db, 'calls', callId), {
      status: 'declined',
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).catch(() => {});

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws`);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'call:signal',
            callId,
            senderId: currentUser.uid,
            senderName: userProfile?.displayName || currentUser.displayName || 'Waver',
            targetUserId: callerId,
            signalType: 'declined'
          })
        );
        setTimeout(() => ws.close(), 300);
      };
    } catch {
      // ws send error
    }
  };

  const handleQuickReplyDecline = async (rawMessage: string) => {
    const replyText = rawMessage.trim();
    if (!incomingCall || !replyText || !currentUser?.uid) return;
    const targetCallerId = incomingCall.callerId;
    handleDeclineIncomingCall();

    try {
      const dmChannelId = computeDmConversationId(currentUser.uid, targetCallerId);
      const nowIso = new Date().toISOString();
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const senderDisplayName =
        userProfile?.displayName || currentUser.displayName || 'Waver';
      const senderAvatar =
        userProfile?.photoURL ||
        currentUser.photoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`;
      const participants = [currentUser.uid, targetCallerId].sort();

      await setDoc(
        doc(db, 'channels', dmChannelId, 'messages', msgId),
        cleanFirestoreData({
          id: msgId,
          channelId: dmChannelId,
          conversationId: dmChannelId,
          participants,
          senderId: currentUser.uid,
          receiverId: targetCallerId,
          senderName: senderDisplayName,
          senderAvatar,
          text: replyText,
          mediaType: 'none',
          isEdited: false,
          isDeleted: false,
          readBy: [currentUser.uid],
          timestamp: serverTimestamp(),
          createdAt: nowIso
        })
      );

      setDoc(
        doc(db, 'channels', dmChannelId),
        {
          id: dmChannelId,
          conversationId: dmChannelId,
          participants,
          lastMessageText: replyText,
          lastMessageSenderId: currentUser.uid,
          lastMessageSenderName: senderDisplayName,
          lastMessageAt: nowIso,
          lastSeen: { [currentUser.uid]: nowIso },
          timestamp: serverTimestamp(),
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});
    } catch (err) {
      console.warn('[CALL] Failed to send quick reply message:', err);
    }
  };

  const handleOpenWelink = (mode: 'chat' | 'image' | 'voice' = 'chat') => {
    triggerHaptic('medium');
    setActiveCall(null);
    setWelinkInitialMode(mode);
    setIsWelinkOpen(true);
  };

  // Phase 6: Listen for Service Worker push notification Answer / Decline call actions
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;

    const executeCallActionById = async (action: 'answer' | 'decline', callId?: string, callerId?: string, callerName?: string, callType?: 'video' | 'voice') => {
      if (!callId) {
        if (action === 'answer' && incomingCall) {
          handleAcceptIncomingCall();
        } else if (action === 'decline' && incomingCall) {
          handleDeclineIncomingCall();
        }
        return;
      }

      stopIncomingRingtone();
      handledCallIdsRef.current.add(callId);
      setIncomingCall(null);

      if (action === 'decline') {
        updateDoc(doc(db, 'calls', callId), {
          status: 'declined',
          endedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).catch(() => {});
        return;
      }

      if (action === 'answer') {
        try {
          const callSnap = await getDoc(doc(db, 'calls', callId));
          const callData = callSnap.exists() ? callSnap.data() : null;
          setActiveCall({
            type: (callData?.type || callData?.callType || callType) === 'voice' ? 'voice' : 'video',
            recipient: {
              id: callData?.callerId || callData?.caller || callerId || '',
              name: callData?.callerName || callerName || 'WaveLink Member',
              photoURL: callData?.callerPhotoURL
            },
            isInitiator: false,
            callId,
            initialOffer: callData?.offer
          });
        } catch {
          setActiveCall({
            type: callType === 'voice' ? 'voice' : 'video',
            recipient: {
              id: callerId || '',
              name: callerName || 'WaveLink Member'
            },
            isInitiator: false,
            callId
          });
        }
      }
    };

    // Check URL query params when opened from push notification action button
    try {
      const params = new URLSearchParams(window.location.search);
      const urlCallAction = params.get('callAction');
      const urlCallId = params.get('callId') || undefined;
      if (urlCallAction === 'answer' || urlCallAction === 'decline') {
        executeCallActionById(urlCallAction, urlCallId);
        params.delete('callAction');
        params.delete('callId');
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // ignore URL parsing errors
    }

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'WAVELINK_CALL_NOTIFICATION_ACTION') {
        const action = data.action === 'decline' ? 'decline' : 'answer';
        executeCallActionById(action, data.callId, data.callerId, data.callerName, data.callType);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, [currentUser?.uid, incomingCall, stopIncomingRingtone]);

  if (userProfile?.isBanned) {
    return <BannedView onOpenSupport={() => setActiveTab('settings')} />;
  }

  return (
    <div className="wavelink-app-shell bg-[var(--bg-canvas)] text-[var(--text-primary)] antialiased transition-colors duration-300">
      {/* Top in-app warning notice if issued by admin */}
      <WarningBanner />

      {/* Top Header Bar */}
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

      {/* Responsive Workspace: Single-Column on Mobile (< 768px) / Left Sidebar + Main View on Desktop (>= 1024px) */}
      <div className="wavelink-body-workspace">
        {/* Desktop Left Sidebar Navigation (strictly >= 1024px) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpenMobile={false}
          onCloseMobile={() => {}}
          onOpenWelink={() => handleOpenWelink('chat')}
        />

        {/* Main Body View with subtle fade-in transition when switching tabs */}
        <main
          key={activeTab}
          className={`wavelink-main-content wavelink-tab-fade-in ${
            activeTab === 'chat' ? 'wavelink-main-content--chat' : ''
          } ${activeTab === 'videos' ? 'wavelink-main-content--reels' : ''}`}
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
          {activeTab === 'trending' && (
            <TrendingChallengesView
              onSelectHashtag={(tag) => {
                setSelectedHashtag(tag.startsWith('#') ? tag : `#${tag}`);
                setActiveTab('feed');
              }}
              onJoinChallengeWithTag={(tag) => {
                setSelectedHashtag(tag.startsWith('#') ? tag : `#${tag}`);
                setActiveTab('feed');
              }}
            />
          )}
          {activeTab === 'studio' && (
            <div className="wavelink-page-desktop-container">
              <div className="wavelink-page-desktop-row">
                <div className="wavelink-page-desktop-center">
                  <StudioEditorView onNavigateToFeed={() => setActiveTab('feed')} />
                </div>
                <RightSidebar
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onSelectHashtag={(tag) => {
                    setSelectedHashtag(tag.startsWith('#') ? tag : `#${tag}`);
                    setActiveTab('feed');
                  }}
                />
              </div>
            </div>
          )}
          {activeTab === 'videos' && (
            <div className="wavelink-reels-desktop-row">
              <div className="wavelink-reels-desktop-center">
                <VideosHubView onNavigateToFeed={() => setActiveTab('feed')} />
              </div>
              <RightSidebar
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectHashtag={(tag) => {
                  setSelectedHashtag(tag.startsWith('#') ? tag : `#${tag}`);
                  setActiveTab('feed');
                }}
              />
            </div>
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
            <AdminGuard>
              <AdminDashboard onReturnToFeed={() => setActiveTab('settings')} />
            </AdminGuard>
          )}
          {activeTab === 'settings' && (
            <div className="wavelink-page-desktop-container">
              <SettingsView
                onOpenAdminPanel={() => setActiveTab('admin')}
                viewedUserId={viewedProfileUserId}
                onSelectUserProfile={(uid) => setViewedProfileUserId(uid)}
                onStartChatWithUser={handleStartChatWithUser}
                onStartCallWithUser={(recipient, callType) => handleOpenCall(callType, recipient)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Phase 3: Skippable Post-Signup Interest Picker Modal */}
      {showInterestPicker && (
        <InterestPickerModal
          isOpen={showInterestPicker}
          onClose={() => setShowInterestPicker(false)}
          initialInterests={userProfile?.interests || []}
        />
      )}

      {/* Non-blocking Background Spark & Video Upload Queue Progress Trackers */}
      <SparkUploadQueueBanner variant="floating" />
      {activeTab !== 'feed' && activeTab !== 'studio' && activeTab !== 'videos' && (
        <VideoUploadProgressChip variant="floating" />
      )}

      {/* Bottom Tab Bar on Mobile & Tablet (< 1024px) with safe-area padding */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasUnreadNotifications={unreadNotificationIds.length > 0}
      />

      {/* Single Floating Assistant Button (hidden on Chat so it never overlaps Send/menu buttons on phones) */}
      {!isWelinkOpen && !activeCall && activeTab !== 'chat' && (
        <button
          type="button"
          onClick={() => handleOpenWelink('chat')}
          aria-label="Open WELINK AI Assistant"
          title="WELINK AI Assistant"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95 cursor-pointer group"
        >
          <Sparkles size={20} className="transition-transform group-hover:rotate-12" />
        </button>
      )}

      {/* WELINK AI Assistant Drawer */}
      <WelinkAssistantDrawer
        isOpen={isWelinkOpen && !activeCall}
        onClose={() => setIsWelinkOpen(false)}
        onOpenUpgrade={() => setActiveTab('settings')}
        initialMode={welinkInitialMode}
      />

      {/* Full-Screen / Centered Incoming Call Screen */}
      {incomingCall && !activeCall && (() => {
        const hasRealPhoto = Boolean(
          incomingCall.callerPhotoURL &&
            !incomingCall.callerPhotoURL.includes('dicebear.com') &&
            !incomingBgError
        );
        const quickReplies = [
          'Busy right now, please wait',
          "In a meeting, I'll call after",
          "Can't talk, text me!"
        ];

        return (
          <div className="wavelink-incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Incoming call">
            {hasRealPhoto ? (
              <img
                src={incomingCall.callerPhotoURL}
                alt=""
                aria-hidden="true"
                onError={() => setIncomingBgError(true)}
                className="wavelink-incoming-call-bg"
              />
            ) : (
              <div className="wavelink-incoming-call-bg wavelink-call-theme-gradient" aria-hidden="true" />
            )}
            <div className="wavelink-incoming-call-scrim" aria-hidden="true" />

            <div className="wavelink-incoming-call-card">
              {/* Top-right mute ringtone speaker toggle */}
              <button
                type="button"
                onClick={() => setIsRingtoneMuted((prev) => !prev)}
                aria-label={isRingtoneMuted ? 'Unmute ringtone' : 'Mute ringtone'}
                title={isRingtoneMuted ? 'Unmute ringtone' : 'Mute ringtone'}
                className="wavelink-incoming-call-mute-btn"
              >
                {isRingtoneMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              {/* Caller avatar & identity near the top */}
              <div className="flex flex-col items-center pt-4 lg:pt-1">
                <div className="relative mx-auto w-[120px] h-[120px] flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full wavelink-call-pulse-ring"
                    style={{
                      border: '2px solid color-mix(in srgb, var(--accent-primary) 75%, #22c55e)'
                    }}
                  />
                  <div
                    className="absolute -inset-2 rounded-full wavelink-call-pulse-ring--delayed"
                    style={{
                      border: '2px solid color-mix(in srgb, var(--accent-secondary) 60%, #ffffff)'
                    }}
                  />
                  <img
                    src={
                      incomingCall.callerPhotoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${incomingCall.callerId}`
                    }
                    alt={incomingCall.callerName}
                    className="w-[120px] h-[120px] rounded-full object-cover shadow-2xl relative bg-slate-900"
                    style={{
                      boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent-primary) 75%, #ffffff), 0 18px 40px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                </div>

                <h3 className="mt-5 text-2xl sm:text-[1.65rem] font-extrabold text-white tracking-tight max-w-[85vw] truncate">
                  {incomingCall.callerName}
                </h3>

                <div className="mt-1.5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90">
                  {incomingCall.callType === 'video' ? (
                    <Video size={14} className="shrink-0 text-emerald-300" />
                  ) : (
                    <PhoneCall size={14} className="shrink-0 text-emerald-300" />
                  )}
                  <span>
                    {incomingCall.callType === 'video'
                      ? 'Incoming video call'
                      : 'Incoming voice call'}
                  </span>
                </div>
              </div>

              {/* Quick reply messages (declines call & sends DM) */}
              <div className="w-full flex flex-col items-center">
                {!showCustomQuickReply ? (
                  <div className="wavelink-incoming-call-replies">
                    {quickReplies.map((msg) => (
                      <button
                        key={msg}
                        type="button"
                        onClick={() => handleQuickReplyDecline(msg)}
                        className="wavelink-incoming-call-reply-btn inline-flex items-center gap-1.5"
                      >
                        <MessageSquare size={13} className="opacity-75 shrink-0" />
                        <span>{msg}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomQuickReply(true)}
                      className="wavelink-incoming-call-reply-btn inline-flex items-center gap-1.5"
                    >
                      <MessageSquare size={13} className="opacity-75 shrink-0" />
                      <span>Custom</span>
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleQuickReplyDecline(customQuickReplyText);
                    }}
                    className="w-full max-w-sm flex items-center gap-2 my-2 bg-white/12 border border-white/25 rounded-full p-1.5 backdrop-blur-md"
                  >
                    <input
                      type="text"
                      value={customQuickReplyText}
                      onChange={(e) => setCustomQuickReplyText(e.target.value)}
                      placeholder="Type a quick reply..."
                      autoFocus
                      maxLength={180}
                      className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-sm text-white placeholder-white/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomQuickReply(false)}
                      aria-label="Cancel custom reply"
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10"
                    >
                      <X size={16} />
                    </button>
                    <button
                      type="submit"
                      disabled={!customQuickReplyText.trim()}
                      aria-label="Send quick reply and decline"
                      className="w-9 h-9 rounded-full flex items-center justify-center bg-white text-slate-950 disabled:opacity-40"
                    >
                      <Send size={15} />
                    </button>
                  </form>
                )}
              </div>

              {/* Bottom Accept/Reject controls + Video/Voice-only choice for video calls */}
              <div className="w-full flex flex-col items-center">
                {incomingCall.callType === 'video' && (
                  <div className="wavelink-incoming-call-mode-toggle" role="group" aria-label="Answer mode">
                    <button
                      type="button"
                      onClick={() => setIncomingAcceptMode('video')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        incomingAcceptMode === 'video'
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      Accept with video
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncomingAcceptMode('voice')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        incomingAcceptMode === 'voice'
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      Accept voice only
                    </button>
                  </div>
                )}

                <div className="wavelink-incoming-call-actions">
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptIncomingCall(incomingAcceptMode)}
                      aria-label={t('call.answer')}
                      className="wavelink-incoming-call-btn wavelink-incoming-call-btn--accept"
                    >
                      {incomingCall.callType === 'video' && incomingAcceptMode === 'video' ? (
                        <Video size={28} />
                      ) : (
                        <PhoneCall size={28} />
                      )}
                    </button>
                    <span className="text-xs font-bold text-white/90">
                      {t('call.answer') || 'Accept'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeclineIncomingCall}
                      aria-label={t('call.decline')}
                      className="wavelink-incoming-call-btn wavelink-incoming-call-btn--reject"
                    >
                      <PhoneOff size={28} />
                    </button>
                    <span className="text-xs font-bold text-white/90">
                      {t('call.decline') || 'Reject'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* WebRTC Video & Voice Calling Overlay Modal */}
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

      {/* Celebration Toast Banner for Milestones */}
      <CelebrationBanner />

      {/* 3-Step First-Time Welcome Tour Modal */}
      <FirstTimeTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />

      {/* Friendly Help & Answers Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onOpenWelink={handleOpenWelink}
        onOpenTour={() => setIsTourOpen(true)}
      />
    </div>
  );
}

function RootAppContent() {
  const envValidation = validateFrontendEnvironment();
  const { currentUser, isLoading } = useAuth();

  // 1. Build & Runtime Environment Check
  if (!envValidation.isValid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A] p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-amber-200 p-6 sm:p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={30} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Configuration Notice</h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            {envValidation.message}
          </p>
          <div className="bg-slate-100 rounded-xl p-3 text-xs font-mono text-slate-700 text-left overflow-x-auto">
            Missing configuration: {envValidation.missingKeys.join(', ')}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  // 2. Plain Loading Screen until sign-in state is known (no code reads user, admin or settings before they exist)
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A] px-4 font-sans select-none">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
          <Waves size={36} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[#0F172A]">WaveLink</h2>
        <p className="text-sm text-[#64748B] mt-2 font-medium">Loading WaveLink...</p>
      </div>
    );
  }

  // 3. Unauthenticated Screen
  if (!currentUser) {
    return <AuthPage />;
  }

  // 4. Authenticated Workspace
  return <AuthenticatedApp currentUser={currentUser} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <PresenceProvider>
            <ThemeProvider>
              <SimpleModeProvider>
                <RootAppContent />
              </SimpleModeProvider>
            </ThemeProvider>
          </PresenceProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
