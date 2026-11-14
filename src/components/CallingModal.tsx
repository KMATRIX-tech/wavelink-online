import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  SwitchCamera,
  RotateCcw,
  Sparkles,
  Loader2,
  Shield,
  Radio,
  Captions,
  FileText,
  Download,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  AlertTriangle,
  ChevronUp,
  MessageSquare,
  Smile,
  Monitor,
  MonitorOff,
  MoreHorizontal,
  PhoneCall,
  Send,
  X,
} from 'lucide-react';
import { CallRecipient, ChannelMessage, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  auth,
  db,
  cleanFirestoreData,
  sanitizeAvatarUrlForFirestore,
  sanitizeShortHttpsUrl,
  fetchUserProfileCached,
  getCachedUserProfile,
} from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { sendWelinkChatMessage } from '../services/geminiService';
import { sendNotification } from '../services/notificationService';
import { Avatar } from './Avatar';
import { computeDmConversationId } from './ChatChannelsView';
import {
  fetchIceServersForCall,
  hasRelayIceServer,
  extractIceCandidateInfo,
} from '../utils/webrtcConfig';
import { useBottomSheetLock } from '../utils/sheetLock';

interface LegacyChatContact {
  id: string;
  name: string;
  avatar?: string;
}

export interface CallingModalProps {
  onClose: () => void;
  initialType?: 'video' | 'voice';
  recipient?: CallRecipient;
  isInitiator?: boolean;
  callId?: string;
  initialOffer?: RTCSessionDescriptionInit;
  contact?: LegacyChatContact;
  callType?: 'audio' | 'video';
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  isIncoming?: boolean;
}

type CallLifecycleState =
  | 'ringing'
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'no-answer'
  | 'declined'
  | 'failed'
  | 'ended';

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
}

class CallInitError extends Error {
  reasonCode: string;
  userDetail: string;

  constructor(reasonCode: string, userDetail: string) {
    super(`${reasonCode}: ${userDetail}`);
    this.name = 'CallInitError';
    this.reasonCode = reasonCode;
    this.userDetail = userDetail;
  }
}

function getDomErrorName(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  return String((err as { name?: unknown; code?: unknown }).name || (err as { code?: unknown }).code || '');
}

function classifyMediaFailure(err: unknown, device: 'microphone' | 'camera'): { reasonCode: string; detail: string } {
  const errName = getDomErrorName(err);
  const rawMsg = err instanceof Error ? err.message : String(err || '');

  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || /permission|denied|not allowed/i.test(rawMsg)) {
    return device === 'microphone'
      ? {
          reasonCode: 'no microphone permission',
          detail: 'Microphone access was denied. Enable microphone permission in your browser settings and tap Try again.',
        }
      : {
          reasonCode: 'no camera permission',
          detail: 'Camera access was denied — continuing with voice only.',
        };
  }
  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || /not found|requested device not found/i.test(rawMsg)) {
    return device === 'microphone'
      ? {
          reasonCode: 'microphone unavailable',
          detail: 'No microphone was detected on this device.',
        }
      : {
          reasonCode: 'camera unavailable',
          detail: 'No camera detected on this device — continuing with voice only.',
        };
  }
  if (errName === 'NotReadableError' || errName === 'TrackStartError' || errName === 'AbortError') {
    return device === 'microphone'
      ? {
          reasonCode: 'microphone busy',
          detail: 'Your microphone is currently in use by another app or tab. Close it and tap Try again.',
        }
      : {
          reasonCode: 'camera busy',
          detail: 'Camera is currently in use by another app — continuing with voice only.',
        };
  }
  return {
    reasonCode: device === 'microphone' ? 'microphone error' : 'camera error',
    detail: rawMsg || `Unable to access ${device}.`,
  };
}

function classifySignalingFailure(err: unknown): { reasonCode: string; detail: string } {
  const code = String((err as { code?: unknown } | null)?.code || '');
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  if (code === 'permission-denied' || /permission[-_ ]denied|missing or insufficient permissions/i.test(rawMsg)) {
    return {
      reasonCode: 'signalling permission denied',
      detail: 'Firestore denied permission to read/write this call session. Ensure you are signed in and part of the call.',
    };
  }
  if (code === 'unavailable' || /offline|network|failed to get document/i.test(rawMsg)) {
    return {
      reasonCode: 'signalling network unreachable',
      detail: 'Could not reach Firestore call signalling service. Check your internet connection and tap Try again.',
    };
  }
  return {
    reasonCode: 'signalling failed',
    detail: rawMsg || 'Call signalling failed unexpectedly.',
  };
}

async function sendCallSignalOverWs(payload: {
  callId: string;
  targetUserId: string;
  fromUserId: string;
  fromName: string;
  callType: 'video' | 'voice';
  signalType: 'offer' | 'answer' | 'end' | 'declined';
  signalData?: RTCSessionDescriptionInit;
}): Promise<void> {
  if (typeof window === 'undefined' || !payload.targetUserId || payload.targetUserId === payload.fromUserId) return;
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => '') || '';
    if (!idToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws?token=${encodeURIComponent(idToken)}`);
    const timer = window.setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }, 3500);
    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'call:signal',
            ...payload,
          })
        );
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 250);
    };
    ws.onerror = () => {
      window.clearTimeout(timer);
    };
  } catch {
    // WebSocket signaling is best-effort alongside Firestore
  }
}

export const CallingModal: React.FC<CallingModalProps> = ({
  onClose,
  initialType,
  recipient,
  isInitiator,
  callId: propCallId,
  initialOffer,
  contact,
  callType: legacyCallType,
  currentUserId: propUserId,
  currentUserName: propUserName,
  currentUserAvatar: propUserAvatar,
  isIncoming: propIsIncoming,
}) => {
  const { currentUser, userProfile } = useAuth();

  const resolvedUserId = propUserId || currentUser?.uid || 'anonymous_user';
  const resolvedUserName =
    propUserName || userProfile?.displayName || currentUser?.displayName || 'WaveLink Member';
  const resolvedUserAvatar =
    sanitizeShortHttpsUrl(propUserAvatar) ||
    sanitizeShortHttpsUrl(userProfile?.photoURL) ||
    sanitizeShortHttpsUrl(currentUser?.photoURL) ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(resolvedUserId)}`;

  const resolvedRecipientId = recipient?.id || contact?.id || 'wavelink_peer';
  const [peerProfile, setPeerProfile] = useState<UserProfile | null>(() =>
    resolvedRecipientId && resolvedRecipientId !== 'wavelink_peer'
      ? getCachedUserProfile(resolvedRecipientId)
      : null
  );

  useEffect(() => {
    let active = true;
    if (!resolvedRecipientId || resolvedRecipientId === 'wavelink_peer') {
      setPeerProfile(null);
      return;
    }
    const cached = getCachedUserProfile(resolvedRecipientId);
    if (cached) {
      setPeerProfile(cached);
      return;
    }
    fetchUserProfileCached(resolvedRecipientId)
      .then((profile) => {
        if (active && profile) {
          setPeerProfile(profile);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [resolvedRecipientId]);

  const resolvedRecipientName =
    peerProfile?.displayName || recipient?.name || contact?.name || 'WaveLink Member';
  const resolvedRecipientAvatar =
    sanitizeShortHttpsUrl(peerProfile?.photoURL) ||
    sanitizeShortHttpsUrl(recipient?.photoURL) ||
    sanitizeShortHttpsUrl(contact?.avatar) ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(resolvedRecipientId)}`;

  const initialIsIncoming =
    typeof isInitiator === 'boolean' ? !isInitiator : Boolean(propIsIncoming);

  // Track effective call role so Retry can cleanly start a fresh outgoing call even from callee side
  const [effectiveIsIncoming, setEffectiveIsIncoming] = useState<boolean>(initialIsIncoming);

  const normalizedMode: 'video' | 'voice' =
    initialType === 'voice' || legacyCallType === 'audio' ? 'voice' : 'video';

  const [callState, setCallState] = useState<CallLifecycleState>(
    initialIsIncoming ? 'connecting' : 'ringing'
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    initialIsIncoming ? 'Connecting' : 'Connecting'
  );
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'weak'>('good');
  const [isStunFallback, setIsStunFallback] = useState(false);
  const [failureNotice, setFailureNotice] = useState<string | null>(null);
  const [failureReasonLabel, setFailureReasonLabel] = useState<string | null>(null);
  const [mediaWarningReason, setMediaWarningReason] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(normalizedMode === 'voice');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // UI-only call screen states (does not alter WebRTC / signaling logic)
  const [isOfferPosted, setIsOfferPosted] = useState(false);
  const [isRemoteVideoPaused, setIsRemoteVideoPaused] = useState(false);
  const [remoteAvatarError, setRemoteAvatarError] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(true);
  const [showMobileMoreSheet, setShowMobileMoreSheet] = useState(false);
  const [activePopover, setActivePopover] = useState<'mic' | 'cam' | 'emoji' | 'more' | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showInCallChat, setShowInCallChat] = useState(false);
  const [inCallChatText, setInCallChatText] = useState('');
  const [inCallMessages, setInCallMessages] = useState<ChannelMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; leftPct: number }>>([]);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pipOffset, setPipOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Live Call Diagnostics state (updated on every ICE/connection/signaling event)
  const [diagIceState, setDiagIceState] = useState<RTCIceConnectionState>('new');
  const [diagConnState, setDiagConnState] = useState<RTCPeerConnectionState>('new');
  const [diagSigState, setDiagSigState] = useState<RTCSignalingState>('stable');
  const [diagCandidateTypes, setDiagCandidateTypes] = useState<string[]>([]);
  const [diagRelayStatus, setDiagRelayStatus] = useState<string>('Checking ICE servers...');

  useBottomSheetLock(true, 'calling-modal');

  // Live Captions & Meeting Notes
  const [isCaptionsActive, setIsCaptionsActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [showMinutesDrawer, setShowMinutesDrawer] = useState(false);
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [meetingMinutes, setMeetingMinutes] = useState<string | null>(null);
  const [copiedMinutes, setCopiedMinutes] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);
  const cameraTrackBeforeShareRef = useRef<MediaStreamTrack | null>(null);
  const remoteMuteTimerRef = useRef<number | null>(null);
  const pipDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    moved: boolean;
  } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Candidate queues, ordering flags & diagnostics
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isCallDocReadyRef = useRef<boolean>(initialIsIncoming);
  const hasRemoteDescriptionRef = useRef<boolean>(false);
  const addedCandidateIdsRef = useRef<Set<string>>(new Set());
  const gatheredCandidateTypesRef = useRef<Set<string>>(new Set());
  const gatheredRelayCandidateRef = useRef<boolean>(false);
  const relayAvailableRef = useRef<boolean>(false);

  // Offer/Answer deduplication & ICE restart counters
  const lastAppliedAnswerSdpRef = useRef<string | null>(null);
  const lastProcessedOfferSdpRef = useRef<string | null>(null);
  const lastIceRestartRequestRef = useRef<string | null>(null);
  const iceRestartCountRef = useRef<number>(0);
  const isRestartingIceRef = useRef<boolean>(false);
  const disconnectedTimerRef = useRef<number | null>(null);

  const isCleaningUpRef = useRef(false);
  const callStateRef = useRef<CallLifecycleState>(initialIsIncoming ? 'connecting' : 'ringing');

  // Stable refs for props so parent re-renders never tear down the active WebRTC call
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialOfferRef = useRef(initialOffer);
  initialOfferRef.current = initialOffer;
  const userMetaRef = useRef({
    userId: resolvedUserId,
    userName: resolvedUserName,
    userAvatar: resolvedUserAvatar,
    recipientId: resolvedRecipientId,
    recipientName: resolvedRecipientName,
    recipientAvatar: resolvedRecipientAvatar,
  });
  userMetaRef.current = {
    userId: resolvedUserId,
    userName: resolvedUserName,
    userAvatar: resolvedUserAvatar,
    recipientId: resolvedRecipientId,
    recipientName: resolvedRecipientName,
    recipientAvatar: resolvedRecipientAvatar,
  };

  const callDocUnsubRef = useRef<(() => void) | null>(null);
  const remoteCandidatesUnsubRef = useRef<(() => void) | null>(null);
  const ringingTimeoutRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const lastPacketSampleRef = useRef<{ received: number; lost: number } | null>(null);
  const recognitionRef = useRef<any>(null);

  const [activeCallId, setActiveCallId] = useState<string>(() => {
    if (propCallId) return propCallId;
    return `call_${resolvedUserId}_${resolvedRecipientId}_${Date.now()}`;
  });

  const updateLifecycleState = useCallback((next: CallLifecycleState, message?: string) => {
    callStateRef.current = next;
    setCallState(next);
    if (message) {
      setStatusMessage(message);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (ringingTimeoutRef.current) {
      window.clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (disconnectedTimerRef.current) {
      window.clearTimeout(disconnectedTimerRef.current);
      disconnectedTimerRef.current = null;
    }
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    lastPacketSampleRef.current = null;
  }, []);

  const cleanupWebRTC = useCallback(() => {
    console.log('[CALL] Cleaning up tracks, peer connection, and Firestore listeners');
    clearTimers();

    if (callDocUnsubRef.current) {
      callDocUnsubRef.current();
      callDocUnsubRef.current = null;
    }
    if (remoteCandidatesUnsubRef.current) {
      remoteCandidatesUnsubRef.current();
      remoteCandidatesUnsubRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onicegatheringstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onsignalingstatechange = null;
        pcRef.current.getSenders().forEach((sender) => {
          try {
            sender.track?.stop();
          } catch {
            // ignore
          }
        });
        pcRef.current.close();
      } catch (err) {
        console.warn('[CALL] Error closing peer connection:', err);
      }
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    pendingIceCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];
    addedCandidateIdsRef.current.clear();
    gatheredCandidateTypesRef.current.clear();
    gatheredRelayCandidateRef.current = false;
    hasRemoteDescriptionRef.current = false;
    lastAppliedAnswerSdpRef.current = null;
    lastProcessedOfferSdpRef.current = null;
    lastIceRestartRequestRef.current = null;
    iceRestartCountRef.current = 0;
    isRestartingIceRef.current = false;
    setHasRemoteVideoTrack(false);
    setIsRemoteVideoPaused(false);
    setDiagIceState('new');
    setDiagConnState('new');
    setDiagSigState('stable');
    setDiagCandidateTypes([]);
    if (remoteMuteTimerRef.current) {
      window.clearTimeout(remoteMuteTimerRef.current);
      remoteMuteTimerRef.current = null;
    }
    if (cameraTrackBeforeShareRef.current) {
      try {
        cameraTrackBeforeShareRef.current.stop();
      } catch {
        // ignore
      }
      cameraTrackBeforeShareRef.current = null;
    }
    setIsScreenSharing(false);
  }, [clearTimers]);

  // Keep local & remote media elements synced with their streams
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      remoteVideoRef.current.muted = !isSpeakerOn;
      if (remoteStreamRef.current.getTracks().length > 0) {
        remoteVideoRef.current.play().catch(() => {});
      }
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      remoteAudioRef.current.muted = !isSpeakerOn;
      if (remoteStreamRef.current.getTracks().length > 0) {
        remoteAudioRef.current.play().catch(() => {});
      }
    }
  }, [callState, hasRemoteVideoTrack, isVideoOff, isSpeakerOn]);

  // Call duration timer runs while call is active (connected or reconnecting mid-call)
  useEffect(() => {
    if (callState !== 'connected' && callState !== 'reconnecting') return;
    const interval = window.setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callState]);

  // Optional speech recognition for live captions
  useEffect(() => {
    if (!isCaptionsActive || callState !== 'connected') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult?.isFinal) {
        const text = lastResult[0]?.transcript?.trim();
        if (text) {
          setTranscript((prev) => [
            ...prev,
            {
              id: `${Date.now()}_${Math.random()}`,
              speaker: userMetaRef.current.userName,
              text,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // ignore
    }

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [isCaptionsActive, callState]);

  // Prevent accidental Esc close & show browser leave confirmation during active/ringing calls
  useEffect(() => {
    const isOngoingCall =
      callState === 'ringing' ||
      callState === 'connecting' ||
      callState === 'reconnecting' ||
      callState === 'connected';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isOngoingCall) return;
      e.preventDefault();
      e.returnValue = '';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (activePopover) {
        setActivePopover(null);
        return;
      }
      if (showMinutesDrawer) {
        setShowMinutesDrawer(false);
        return;
      }
      if (isOngoingCall) {
        setShowLeaveConfirm(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [callState, activePopover, showMinutesDrawer]);

  // Load media device lists for desktop mic & camera device pickers
  const refreshMediaDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
      setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      // ignore enumerateDevices failure
    }
  }, []);

  useEffect(() => {
    refreshMediaDevices();
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices && 'addEventListener' in mediaDevices) {
      mediaDevices.addEventListener('devicechange', refreshMediaDevices);
      return () => {
        mediaDevices.removeEventListener('devicechange', refreshMediaDevices);
      };
    }
  }, [refreshMediaDevices]);

  // Subscribe to DM messages ONLY when in-call chat drawer/sheet is opened (zero idle reads)
  const activeAuthUid = currentUser?.uid || '';
  useEffect(() => {
    if (!showInCallChat) return;
    const myUid = (auth.currentUser || currentUser)?.uid || resolvedUserId;
    if (!myUid || !resolvedRecipientId) return;
    const dmId = computeDmConversationId(myUid, resolvedRecipientId);
    const q = query(
      collection(db, 'channels', dmId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChannelMessage[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<ChannelMessage, 'id'>) });
        });
        list.reverse();
        setInCallMessages(list);
      },
      () => {}
    );
    return () => unsub();
  }, [showInCallChat, activeAuthUid, resolvedUserId, resolvedRecipientId]);

  // Re-clamp draggable PiP corner offset on orientation change or resize
  useEffect(() => {
    const clampPipOnResize = () => {
      const pipEl = pipRef.current;
      const stageEl = stageRef.current;
      if (!pipEl || !stageEl) return;
      const pipRect = pipEl.getBoundingClientRect();
      const stageRect = stageEl.getBoundingClientRect();
      if (pipRect.width === 0 || stageRect.width === 0) return;
      const pad = 10;
      setPipOffset((prev) => {
        const baseLeft = pipRect.left - prev.x;
        const baseTop = pipRect.top - prev.y;
        const minX = stageRect.left + pad - baseLeft;
        const maxX = stageRect.right - pad - (baseLeft + pipRect.width);
        const minY = stageRect.top + pad - baseTop;
        const maxY = stageRect.bottom - pad - (baseTop + pipRect.height);
        const nextX = maxX >= minX ? Math.max(minX, Math.min(maxX, prev.x)) : 0;
        const nextY = maxY >= minY ? Math.max(minY, Math.min(maxY, prev.y)) : 0;
        if (nextX === prev.x && nextY === prev.y) return prev;
        return { x: nextX, y: nextY };
      });
    };
    window.addEventListener('resize', clampPipOnResize);
    window.addEventListener('orientationchange', clampPipOnResize);
    return () => {
      window.removeEventListener('resize', clampPipOnResize);
      window.removeEventListener('orientationchange', clampPipOnResize);
    };
  }, []);

  // Main WebRTC signaling and connection lifecycle
  useEffect(() => {
    let isCancelled = false;
    isCleaningUpRef.current = false;
    isCallDocReadyRef.current = effectiveIsIncoming;

    let networkChangeHandler: (() => void) | null = null;
    let offlineHandler: (() => void) | null = null;
    const navConnection = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string } })
      .connection;

    const logFinalFailure = (reason: string, options?: { checkIceRelay?: boolean }) => {
      const checkIceRelay = options?.checkIceRelay !== false;
      const typesList = Array.from(gatheredCandidateTypesRef.current);
      let relayMissingNote = '';
      if (checkIceRelay && !gatheredRelayCandidateRef.current) {
        if (relayAvailableRef.current) {
          relayMissingNote = ' | TURN relay server not reachable (no relay candidates gathered)';
          console.error('[CALL] TURN server not reachable — no relay ICE candidates were gathered.');
        } else {
          relayMissingNote = ' | STUN-only fallback active (no TURN relay configured)';
        }
      }
      console.error(
        `[CALL] Final reason for failure: ${reason} | gatheredCandidateTypes=[${
          typesList.length > 0 ? typesList.join(', ') : 'none'
        }]${relayMissingNote}`
      );
    };

    const drainQueuedIceCandidates = async (pc: RTCPeerConnection) => {
      if (!hasRemoteDescriptionRef.current || !pc.remoteDescription || !pc.remoteDescription.type) {
        return;
      }
      if (pendingIceCandidatesRef.current.length === 0) return;

      const queued = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = [];
      console.log(`[CALL] Draining ${queued.length} queued remote ICE candidate(s)`);
      for (const candidate of queued) {
        if (isCancelled || pcRef.current !== pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[CALL] Queued remote ICE candidate added');
        } catch (err) {
          console.warn('[CALL] Failed to add queued remote ICE candidate:', err);
        }
      }
    };

    const initializeCall = async () => {
      cleanupWebRTC();
      setCallDuration(0);
      setConnectionQuality('good');
      setFailureNotice(null);
      setFailureReasonLabel(null);
      setMediaWarningReason(null);
      setIsStunFallback(false);
      setIsOfferPosted(false);
      setIsRemoteVideoPaused(false);
      setShowMobileControls(true);
      setDiagRelayStatus('Fetching ICE / TURN config...');

      const activeAuthUser = auth.currentUser || currentUser;
      if (!activeAuthUser?.uid) {
        throw new CallInitError(
          'permission denied',
          'You must be signed in before starting or answering a call.'
        );
      }

      console.log(
        `[CALL] Starting call setup (role=${
          effectiveIsIncoming ? 'callee' : 'caller'
        }, mode=${normalizedMode}, callId=${activeCallId}, attempt=${retryAttempt + 1})`
      );

      // 1. Fetch ICE servers from authenticated GET /api/ice-servers BEFORE creating RTCPeerConnection
      let idToken = '';
      try {
        idToken = await activeAuthUser.getIdToken();
      } catch {
        // handled by fetchIceServersForCall fallback
      }
      if (isCancelled) return;

      const iceConfigResult = await fetchIceServersForCall(idToken);
      if (isCancelled) return;

      const iceServers = iceConfigResult.iceServers;
      const relayAvailable = hasRelayIceServer(iceServers) && !iceConfigResult.isFallback;
      relayAvailableRef.current = relayAvailable;
      setIsStunFallback(!relayAvailable);
      setDiagRelayStatus(
        relayAvailable
          ? `Metered TURN active (${iceServers.length} servers)`
          : `STUN-only fallback (${iceConfigResult.reason || 'relay unavailable'})`
      );

      console.log('[CALL] RTCPeerConnection ICE servers configured:', {
        relayAvailable,
        isFallback: !relayAvailable,
        reason: iceConfigResult.reason || null,
        serverCount: iceServers.length,
      });
      if (!relayAvailable) {
        console.warn(
          '[CALL] /api/ice-servers using STUN-only fallback (no TURN relay configured):',
          iceConfigResult.reason || 'Server TURN configuration unavailable'
        );
      }

      if (isCancelled) return;

      // 2. Acquire local media stream BEFORE creating offer or answer (mic & camera checked separately)
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new CallInitError(
          'microphone unavailable',
          'Browser blocked camera/microphone APIs. Open WaveLink over HTTPS and grant permission.'
        );
      }

      let localStream: MediaStream | null = null;
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (normalizedMode === 'video') {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch (primaryErr) {
          const primaryName = getDomErrorName(primaryErr);
          if (primaryName === 'OverconstrainedError') {
            try {
              localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            } catch (relaxedErr) {
              // Fall through to audio-only below
              console.warn('[CALL] Relaxed video getUserMedia failed:', relaxedErr);
            }
          }

          if (!localStream) {
            // Try audio-only first so we can separate microphone errors from camera errors
            try {
              localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
              setIsVideoOff(true);
              const camDiag = classifyMediaFailure(primaryErr, 'camera');
              setMediaWarningReason(camDiag.reasonCode);
              console.warn(`[CALL] Video fallback to audio-only (${camDiag.reasonCode}):`, primaryErr);
            } catch (audioErr) {
              const micDiag = classifyMediaFailure(audioErr, 'microphone');
              console.error(`[CALL] Microphone acquisition failed (${micDiag.reasonCode}):`, audioErr);
              throw new CallInitError(micDiag.reasonCode, micDiag.detail);
            }
          }
        }
      } else {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
        } catch (audioErr) {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          } catch (fallbackAudioErr) {
            const micDiag = classifyMediaFailure(fallbackAudioErr || audioErr, 'microphone');
            console.error(`[CALL] Voice call microphone failed (${micDiag.reasonCode}):`, fallbackAudioErr);
            throw new CallInitError(micDiag.reasonCode, micDiag.detail);
          }
        }
      }

      console.log(
        '[CALL] Local media stream acquired:',
        localStream.getTracks().map((t) => `${t.kind}:${t.label}`)
      );

      if (isCancelled) {
        localStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = localStream;
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true; // Mute own preview so there is no echo
        localVideoRef.current.play().catch(() => {});
      }

      // 3. Create PeerConnection with Metered ICE servers, iceCandidatePoolSize: 4, and relay UDP/TCP/TLS 443 support
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({
          iceServers,
          iceCandidatePoolSize: 4,
          iceTransportPolicy: 'all',
        });
      } catch (pcErr) {
        throw new CallInitError(
          'peer connection failed',
          pcErr instanceof Error ? pcErr.message : 'Unable to create WebRTC peer connection.'
        );
      }
      pcRef.current = pc;

      // Create one MediaStream for the remote person
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }

      // 4. Add local tracks to PeerConnection BEFORE creating offer or answer
      if (localStream && pc.signalingState !== 'closed') {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream!);
        });
        console.log('[CALL] Local tracks added BEFORE createOffer/createAnswer');
      }

      // 5. Handle incoming remote tracks (add every track to the single remote MediaStream)
      pc.ontrack = (event: RTCTrackEvent) => {
        console.log(
          `[CALL] Remote track received: kind=${event.track.kind} id=${event.track.id} streams=${event.streams.length}`
        );

        const targetRemoteStream = remoteStreamRef.current || new MediaStream();
        remoteStreamRef.current = targetRemoteStream;

        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((track) => {
            if (!targetRemoteStream.getTracks().some((t) => t.id === track.id)) {
              targetRemoteStream.addTrack(track);
            }
          });
        }
        if (!targetRemoteStream.getTracks().some((t) => t.id === event.track.id)) {
          targetRemoteStream.addTrack(event.track);
        }

        if (event.track.kind === 'video') {
          setHasRemoteVideoTrack(true);
          setIsRemoteVideoPaused(Boolean(event.track.muted));
          event.track.onunmute = () => {
            if (remoteMuteTimerRef.current) {
              window.clearTimeout(remoteMuteTimerRef.current);
              remoteMuteTimerRef.current = null;
            }
            setIsRemoteVideoPaused(false);
            setHasRemoteVideoTrack(true);
            remoteVideoRef.current?.play().catch(() => {});
          };
          event.track.onmute = () => {
            if (remoteMuteTimerRef.current) {
              window.clearTimeout(remoteMuteTimerRef.current);
            }
            remoteMuteTimerRef.current = window.setTimeout(() => {
              if (event.track.muted || event.track.readyState === 'ended') {
                setIsRemoteVideoPaused(true);
              }
            }, 1500);
          };
          event.track.onended = () => {
            setIsRemoteVideoPaused(true);
            setHasRemoteVideoTrack(false);
          };
        }

        if (remoteVideoRef.current) {
          if (remoteVideoRef.current.srcObject !== targetRemoteStream) {
            remoteVideoRef.current.srcObject = targetRemoteStream;
          }
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current) {
          if (remoteAudioRef.current.srcObject !== targetRemoteStream) {
            remoteAudioRef.current.srcObject = targetRemoteStream;
          }
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      const callDocRef = doc(db, 'calls', activeCallId);
      const localCandidatesCol = collection(
        db,
        'calls',
        activeCallId,
        effectiveIsIncoming ? 'calleeCandidates' : 'callerCandidates'
      );
      const remoteCandidatesCol = collection(
        db,
        'calls',
        activeCallId,
        effectiveIsIncoming ? 'callerCandidates' : 'calleeCandidates'
      );

      let startConnectionTimer: (label: string, resetExisting?: boolean) => void = () => {};

      const startQualityMonitor = () => {
        if (statsIntervalRef.current) {
          window.clearInterval(statsIntervalRef.current);
        }
        statsIntervalRef.current = window.setInterval(async () => {
          if (isCancelled || !pcRef.current || callStateRef.current !== 'connected') return;
          try {
            const stats = await pcRef.current.getStats();
            let activeRttSec: number | null = null;
            let totalReceived = 0;
            let totalLost = 0;

            stats.forEach((report) => {
              if (
                report.type === 'candidate-pair' &&
                report.state === 'succeeded' &&
                (report.nominated || report.selected)
              ) {
                if (typeof report.currentRoundTripTime === 'number') {
                  activeRttSec = report.currentRoundTripTime;
                }
              }
              if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.kind === 'video')) {
                totalReceived += Number(report.packetsReceived || 0);
                totalLost += Number(report.packetsLost || 0);
              }
            });

            let intervalLossRatio = 0;
            const prev = lastPacketSampleRef.current;
            if (prev) {
              const deltaReceived = Math.max(0, totalReceived - prev.received);
              const deltaLost = Math.max(0, totalLost - prev.lost);
              const totalDelta = deltaReceived + deltaLost;
              if (totalDelta >= 10) {
                intervalLossRatio = deltaLost / totalDelta;
              }
            }
            lastPacketSampleRef.current = { received: totalReceived, lost: totalLost };

            const netType = navConnection?.effectiveType;
            const isSlowCell = netType === '2g' || netType === 'slow-2g';
            const isWeak =
              isSlowCell ||
              (activeRttSec !== null && activeRttSec > 0.45) ||
              intervalLossRatio > 0.08;
            const isHealthy =
              !isSlowCell &&
              (activeRttSec === null || activeRttSec < 0.35) &&
              intervalLossRatio <= 0.05;

            if (isWeak) {
              setConnectionQuality('weak');
            } else if (isHealthy) {
              setConnectionQuality('good');
            }
          } catch {
            // ignore getStats errors on closing peer connections
          }
        }, 2500);
      };

      // Helper to perform automatic ICE restart when network drops or changes
      const triggerAutomaticIceRestart = async (reason: string) => {
        if (isCancelled || isCleaningUpRef.current || !pcRef.current) return;
        if (isRestartingIceRef.current) return;
        if (
          callStateRef.current === 'failed' ||
          callStateRef.current === 'ended' ||
          callStateRef.current === 'no-answer' ||
          callStateRef.current === 'declined'
        ) {
          return;
        }

        if (iceRestartCountRef.current >= 4) {
          logFinalFailure(`ICE restart limit reached (${reason})`);
          setFailureReasonLabel(!gatheredRelayCandidateRef.current ? 'ICE route failed' : 'peer connection failed');
          setFailureNotice(
            !gatheredRelayCandidateRef.current
              ? 'No working ICE/TURN route could be established between devices. Check mobile network or TURN relay settings.'
              : 'Your peer-to-peer connection dropped and could not recover. Tap Try again to reconnect.'
          );
          updateLifecycleState('failed', 'Connection failed');
          return;
        }

        isRestartingIceRef.current = true;
        iceRestartCountRef.current += 1;
        const attempt = iceRestartCountRef.current;

        console.log(
          `[CALL] Automatic ICE restart #${attempt} triggered (reason=${reason}, relayGathered=${gatheredRelayCandidateRef.current})`
        );

        if (callStateRef.current === 'connected' || callStateRef.current === 'reconnecting') {
          updateLifecycleState('reconnecting', 'Reconnecting');
        } else {
          updateLifecycleState('connecting', 'Connecting');
        }
        startConnectionTimer(`ice-restart-${attempt}`, reason === 'network-change' || reason === 'ice-disconnected' || reason === 'ice-failed');

        try {
          if (typeof pcRef.current.restartIce === 'function') {
            pcRef.current.restartIce();
          }

          if (!effectiveIsIncoming) {
            // Caller initiates clean ICE-restart offer
            const restartOffer = await pcRef.current.createOffer({
              iceRestart: true,
              offerToReceiveAudio: true,
              offerToReceiveVideo: normalizedMode === 'video',
            });
            await pcRef.current.setLocalDescription(restartOffer);
            hasRemoteDescriptionRef.current = false;
            lastAppliedAnswerSdpRef.current = null;

            await updateDoc(callDocRef, {
              offer: {
                type: restartOffer.type,
                sdp: restartOffer.sdp,
              },
              answer: null,
              iceRestartCount: attempt,
              updatedAt: new Date().toISOString(),
            });
            console.log(`[CALL] ICE restart offer #${attempt} created and written to Firestore`);
          } else {
            // Callee requests caller to send ICE-restart offer to prevent SDP glare
            await updateDoc(callDocRef, {
              iceRestartRequestedAt: new Date().toISOString(),
              iceRestartReason: reason,
              updatedAt: new Date().toISOString(),
            });
            console.log(`[CALL] Callee requested ICE restart #${attempt} from caller`);
          }
        } catch (err) {
          console.warn(`[CALL] ICE restart attempt #${attempt} failed:`, err);
        } finally {
          window.setTimeout(() => {
            isRestartingIceRef.current = false;
          }, 2000);
        }
      };

      // 20-second connection timeout with clear reason and Try again button
      startConnectionTimer = (label: string, resetExisting = false) => {
        if (connectionTimeoutRef.current) {
          if (!resetExisting) return;
          window.clearTimeout(connectionTimeoutRef.current);
        }
        console.log(`[CALL] Starting 20s connection timeout (${label})`);
        connectionTimeoutRef.current = window.setTimeout(() => {
          connectionTimeoutRef.current = null;
          if (isCancelled || !pcRef.current) return;
          if (callStateRef.current !== 'connected') {
            const currIce = pcRef.current.iceConnectionState;
            const currConn = pcRef.current.connectionState;
            const currSig = pcRef.current.signalingState;
            logFinalFailure(`20s connection timeout (${label}, ice=${currIce}, conn=${currConn}, sig=${currSig})`);
            const missingRelay = !relayAvailableRef.current || !gatheredRelayCandidateRef.current;
            const reasonLabel = !relayAvailableRef.current
              ? 'relay unavailable'
              : currIce === 'failed' || currIce === 'checking' || currIce === 'new' || missingRelay
              ? 'ICE failed'
              : 'ICE failed';
            setFailureReasonLabel(reasonLabel);
            setFailureNotice(
              !relayAvailableRef.current
                ? 'TURN relay unavailable — mobile networks often block direct peer-to-peer calls without relay servers.'
                : !gatheredRelayCandidateRef.current
                ? 'ICE failed within 20s (no relay candidates gathered). Check mobile network or tap Try again.'
                : `Connection timed out after 20 seconds (ICE: ${currIce}). Tap Try again.`
            );
            updateLifecycleState('failed', 'Connection timed out');
          }
        }, 20000);
      };

      // 6. Monitor ICE gathering, iceConnectionState, connectionState, signalingState, and network changes
      pc.onicegatheringstatechange = () => {
        if (!pcRef.current || isCancelled) return;
        const gathering = pcRef.current.iceGatheringState;
        console.log(`[CALL] iceGatheringState changed -> ${gathering}`);
        if (gathering === 'complete' && !gatheredRelayCandidateRef.current) {
          if (relayAvailableRef.current) {
            console.warn('[CALL] TURN server not reachable — ICE gathering completed without any relay candidate.');
            setDiagRelayStatus('TURN configured but no relay candidate gathered');
          } else {
            console.log('[CALL] ICE gathering completed (STUN-only mode, no TURN relay configured).');
          }
        }
      };

      pc.onsignalingstatechange = () => {
        if (!pcRef.current || isCancelled) return;
        const sigState = pcRef.current.signalingState;
        setDiagSigState(sigState);
        console.log(`[CALL] signalingState changed -> ${sigState}`);
      };

      const handlePeerStateUpdate = () => {
        if (!pcRef.current || isCancelled) return;
        const connState = pcRef.current.connectionState;
        const iceState = pcRef.current.iceConnectionState;
        const sigState = pcRef.current.signalingState;

        setDiagConnState(connState);
        setDiagIceState(iceState);
        setDiagSigState(sigState);

        console.log(
          `[CALL] State change -> iceConnectionState=${iceState}, connectionState=${connState}, signalingState=${sigState}`
        );

        if (
          connState === 'connected' ||
          iceState === 'connected' ||
          iceState === 'completed'
        ) {
          if (connectionTimeoutRef.current) {
            window.clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          if (ringingTimeoutRef.current) {
            window.clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
          }
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
            disconnectedTimerRef.current = null;
          }
          isRestartingIceRef.current = false;

          if (
            remoteStreamRef.current &&
            remoteStreamRef.current.getVideoTracks().length > 0
          ) {
            setHasRemoteVideoTrack(true);
          }

          if (callStateRef.current !== 'connected') {
            console.log(
              `[CALL] Peer connection established! Candidate types gathered: [${Array.from(
                gatheredCandidateTypesRef.current
              ).join(', ')}]`
            );
            setFailureNotice(null);
            setFailureReasonLabel(null);
            setConnectionQuality('good');
            updateLifecycleState('connected', 'Connected');
            startQualityMonitor();
          }
        } else if (connState === 'connecting' || iceState === 'checking') {
          if (
            callStateRef.current !== 'connected' &&
            callStateRef.current !== 'ringing' &&
            callStateRef.current !== 'reconnecting'
          ) {
            updateLifecycleState('connecting', 'Connecting');
          }
        } else if (iceState === 'disconnected' || connState === 'disconnected') {
          // Only treat `disconnected` as needing ICE restart once the call was already connected/reconnecting,
          // and give WebRTC 4.5s to self-recover before tearing down the SDP exchange.
          if (callStateRef.current === 'connected' || callStateRef.current === 'reconnecting') {
            if (callStateRef.current === 'connected') {
              updateLifecycleState('reconnecting', 'Reconnecting');
            }
            if (disconnectedTimerRef.current) {
              window.clearTimeout(disconnectedTimerRef.current);
            }
            disconnectedTimerRef.current = window.setTimeout(() => {
              if (!pcRef.current || isCancelled) return;
              const currentIce = pcRef.current.iceConnectionState;
              const currentConn = pcRef.current.connectionState;
              if (
                currentIce === 'disconnected' ||
                currentIce === 'failed' ||
                currentConn === 'disconnected' ||
                currentConn === 'failed'
              ) {
                triggerAutomaticIceRestart('ice-disconnected');
              }
            }, 4500);
          }
        } else if (iceState === 'failed' || connState === 'failed') {
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
            disconnectedTimerRef.current = null;
          }
          if (callStateRef.current === 'connected') {
            updateLifecycleState('reconnecting', 'Reconnecting');
          }
          triggerAutomaticIceRestart(`state-${iceState === 'failed' ? 'ice-failed' : 'conn-failed'}`);
        }
      };

      pc.onconnectionstatechange = handlePeerStateUpdate;
      pc.oniceconnectionstatechange = handlePeerStateUpdate;

      networkChangeHandler = () => {
        if (isCancelled || isCleaningUpRef.current || !pcRef.current) return;
        if (
          callStateRef.current === 'connected' ||
          callStateRef.current === 'reconnecting'
        ) {
          console.log('[CALL] Network drop/change detected -> running automatic ICE restart');
          if (callStateRef.current === 'connected') {
            updateLifecycleState('reconnecting', 'Reconnecting');
          }
          triggerAutomaticIceRestart('network-change');
        }
      };
      offlineHandler = () => {
        if (isCancelled || isCleaningUpRef.current) return;
        if (callStateRef.current === 'connected' || callStateRef.current === 'connecting') {
          updateLifecycleState('reconnecting', 'Reconnecting');
          startConnectionTimer('offline-recovery', true);
        }
      };
      window.addEventListener('online', networkChangeHandler);
      window.addEventListener('offline', offlineHandler);
      navConnection?.addEventListener?.('change', networkChangeHandler);

      // 7. Gather & write local ICE candidates to our own subcollection
      pc.onicecandidate = async (event: RTCPeerConnectionIceEvent) => {
        if (isCancelled) return;
        if (!event.candidate) {
          console.log('[CALL] End of local ICE candidates signaled');
          if (!gatheredRelayCandidateRef.current) {
            if (relayAvailableRef.current) {
              console.warn('[CALL] TURN server not reachable — no relay candidate gathered.');
            } else {
              console.log('[CALL] End of local ICE candidates (STUN-only mode, no TURN relay configured).');
            }
          }
          return;
        }

        const candInfo = extractIceCandidateInfo(event.candidate);
        gatheredCandidateTypesRef.current.add(candInfo.type);
        setDiagCandidateTypes(Array.from(gatheredCandidateTypesRef.current));
        if (candInfo.type === 'relay') {
          gatheredRelayCandidateRef.current = true;
          setDiagRelayStatus('TURN relay candidate gathered ✓');
        }

        console.log(
          `[CALL] Local ICE candidate gathered: type=${candInfo.type} protocol=${candInfo.protocol} port=${
            candInfo.port ?? 'n/a'
          }`
        );

        const candidateJson = event.candidate.toJSON();
        if (!isCallDocReadyRef.current) {
          pendingLocalCandidatesRef.current.push(candidateJson);
          return;
        }

        try {
          await addDoc(localCandidatesCol, candidateJson);
        } catch (err) {
          console.warn('[CALL] Failed to write local ICE candidate:', err);
        }
      };

      const flushPendingLocalCandidates = async () => {
        if (pendingLocalCandidatesRef.current.length === 0) return;
        const toSend = [...pendingLocalCandidatesRef.current];
        pendingLocalCandidatesRef.current = [];
        console.log(
          `[CALL] Flushing ${toSend.length} local ICE candidate(s) to ${
            effectiveIsIncoming ? 'calleeCandidates' : 'callerCandidates'
          }`
        );
        for (const cand of toSend) {
          try {
            await addDoc(localCandidatesCol, cand);
          } catch (err) {
            console.warn('[CALL] Failed to flush local ICE candidate:', err);
          }
        }
      };

      // Subscribe to remote side's ICE candidate subcollection
      const startRemoteCandidatesListener = () => {
        if (remoteCandidatesUnsubRef.current) {
          remoteCandidatesUnsubRef.current();
        }
        remoteCandidatesUnsubRef.current = onSnapshot(
          remoteCandidatesCol,
          (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type !== 'added') return;
              if (addedCandidateIdsRef.current.has(change.doc.id)) return;
              addedCandidateIdsRef.current.add(change.doc.id);

              const candidateData = change.doc.data() as RTCIceCandidateInit;
              if (!candidateData || !candidateData.candidate) return;

              const currentPc = pcRef.current;
              if (!currentPc) return;

              if (
                hasRemoteDescriptionRef.current &&
                currentPc.remoteDescription &&
                currentPc.remoteDescription.type
              ) {
                try {
                  await currentPc.addIceCandidate(new RTCIceCandidate(candidateData));
                  console.log('[CALL] Remote ICE candidate added immediately');
                } catch (err) {
                  console.warn('[CALL] Error adding remote ICE candidate:', err);
                }
              } else {
                console.log(
                  '[CALL] Queued remote ICE candidate (waiting for setRemoteDescription)'
                );
                pendingIceCandidatesRef.current.push(candidateData);
              }
            });
          },
          (err) => {
            console.warn('[CALL] Remote ICE candidates listener error:', err);
            const sigErr = classifySignalingFailure(err);
            if (sigErr.reasonCode === 'signalling permission denied' && callStateRef.current !== 'connected') {
              clearTimers();
              setFailureReasonLabel(sigErr.reasonCode);
              setFailureNotice(sigErr.detail);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        );
      };

      // 8. Exact Signaling Order through Firestore (+ instant WebSocket relay supplement)
      if (!effectiveIsIncoming) {
        updateLifecycleState('ringing', 'Connecting');

        let offer: RTCSessionDescriptionInit;
        try {
          offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: normalizedMode === 'video',
          });
          console.log(`[CALL] Offer created (sdpLength=${offer.sdp?.length || 0})`);
          await pc.setLocalDescription(offer);
          console.log('[CALL] Local description set (offer)');
        } catch (sdpErr) {
          throw new CallInitError(
            'peer connection failed',
            sdpErr instanceof Error ? sdpErr.message : 'Could not create WebRTC call offer.'
          );
        }

        const nowIso = new Date().toISOString();
        const meta = userMetaRef.current;
        const resolvedCallerUid = activeAuthUser.uid;
        try {
          await setDoc(
            callDocRef,
            cleanFirestoreData({
              callerId: resolvedCallerUid,
              callerName: meta.userName,
              calleeId: meta.recipientId,
              type: normalizedMode,
              status: 'ringing',
              offer: {
                type: offer.type,
                sdp: offer.sdp,
              },
              createdAt: nowIso,
              updatedAt: nowIso,
            })
          );
        } catch (signalingErr) {
          const sigDiag = classifySignalingFailure(signalingErr);
          console.error(`[CALL] Firestore call create failed (${sigDiag.reasonCode}):`, signalingErr);
          throw new CallInitError(sigDiag.reasonCode, sigDiag.detail);
        }
        console.log('[CALL] Call document written with offer:', activeCallId);
        if (!isCancelled) {
          setIsOfferPosted(true);
        }

        // Instant WebSocket call:signal offer supplement so phone UI rings immediately
        sendCallSignalOverWs({
          callId: activeCallId,
          targetUserId: meta.recipientId,
          fromUserId: resolvedCallerUid,
          fromName: meta.userName,
          callType: normalizedMode,
          signalType: 'offer',
          signalData: { type: offer.type, sdp: offer.sdp },
        });

        if (meta.recipientId && meta.recipientId !== resolvedCallerUid) {
          sendNotification({
            recipientId: meta.recipientId,
            actorId: resolvedCallerUid,
            actorName: meta.userName,
            actorPhotoURL: sanitizeShortHttpsUrl(meta.userAvatar) || undefined,
            type: 'incoming_call',
            title: normalizedMode === 'video' ? 'Incoming Video Call 📞' : 'Incoming Voice Call 📞',
            body: `${meta.userName} is calling you on WaveLink. Tap to answer.`,
            entityId: activeCallId,
          }).catch(() => {});
        }

        isCallDocReadyRef.current = true;
        await flushPendingLocalCandidates();
        startRemoteCandidatesListener();

        // 20-second ringing timeout if receiver never answers
        ringingTimeoutRef.current = window.setTimeout(async () => {
          if (isCancelled) return;
          if (callStateRef.current === 'ringing') {
            console.log('[CALL] 20s ringing timeout -> no answer received');
            setFailureReasonLabel('no answer received');
            setFailureNotice('No answer received within 20 seconds. Tap Try again to call back.');
            updateLifecycleState('no-answer', 'No answer');
            try {
              await updateDoc(callDocRef, {
                status: 'no_answer',
                updatedAt: new Date().toISOString(),
              });
            } catch {
              // ignore
            }
          }
        }, 20000);

        callDocUnsubRef.current = onSnapshot(
          callDocRef,
          async (snapshot) => {
            const data = snapshot.data();
            if (!data || isCancelled || !pcRef.current) return;

            if (data.status === 'declined' || data.status === 'rejected') {
              clearTimers();
              setFailureReasonLabel('call declined');
              setFailureNotice(`${userMetaRef.current.recipientName} declined the call.`);
              updateLifecycleState('declined', 'No answer');
              return;
            }
            if (data.status === 'missed' || data.status === 'no_answer') {
              clearTimers();
              setFailureReasonLabel('no answer received');
              setFailureNotice('No answer received right now. Tap Try again to call back.');
              updateLifecycleState('no-answer', 'No answer');
              return;
            }
            if (data.status === 'ended' && !isCleaningUpRef.current) {
              clearTimers();
              updateLifecycleState('ended', 'Call ended');
              onCloseRef.current();
              return;
            }

            if (data.status === 'accepted' && callStateRef.current === 'ringing') {
              if (ringingTimeoutRef.current) {
                window.clearTimeout(ringingTimeoutRef.current);
                ringingTimeoutRef.current = null;
              }
              updateLifecycleState('connecting', 'Connecting');
              startConnectionTimer('caller-accepted');
            }

            // Handle ICE restart request initiated by callee
            if (
              data.iceRestartRequestedAt &&
              data.iceRestartRequestedAt !== lastIceRestartRequestRef.current
            ) {
              lastIceRestartRequestRef.current = data.iceRestartRequestedAt;
              console.log('[CALL] Caller received ICE restart request from callee');
              triggerAutomaticIceRestart('callee-requested');
            }

            if (
              data.answer &&
              data.answer.sdp &&
              data.answer.sdp !== lastAppliedAnswerSdpRef.current
            ) {
              if (pcRef.current.signalingState !== 'have-local-offer') {
                console.warn(
                  '[CALL] Skipping answer because signalingState is not have-local-offer:',
                  pcRef.current.signalingState
                );
                return;
              }
              lastAppliedAnswerSdpRef.current = data.answer.sdp;
              console.log(`[CALL] Answer received (sdpLength=${data.answer.sdp.length})`);

              if (ringingTimeoutRef.current) {
                window.clearTimeout(ringingTimeoutRef.current);
                ringingTimeoutRef.current = null;
              }

              if (callStateRef.current !== 'connected' && callStateRef.current !== 'reconnecting') {
                updateLifecycleState('connecting', 'Connecting');
                startConnectionTimer('caller-after-answer');
              }

              try {
                await pcRef.current.setRemoteDescription(
                  new RTCSessionDescription(data.answer as RTCSessionDescriptionInit)
                );
                if (isCancelled || !pcRef.current) return;
                hasRemoteDescriptionRef.current = true;
                console.log('[CALL] Caller setRemoteDescription(answer) complete');
                await drainQueuedIceCandidates(pcRef.current);
              } catch (err) {
                console.error('[CALL] Caller setRemoteDescription(answer) failed:', err);
                logFinalFailure(`Caller setRemoteDescription failed: ${err instanceof Error ? err.message : String(err)}`);
                setFailureReasonLabel('peer connection failed');
                setFailureNotice(
                  err instanceof Error
                    ? `Peer connection setup failed (${err.message}). Tap Try again.`
                    : 'Peer connection setup failed. Tap Try again.'
                );
                updateLifecycleState('failed', 'Connection failed');
              }
            }
          },
          (err) => {
            const sigDiag = classifySignalingFailure(err);
            logFinalFailure(`Caller callDoc listener failed (${sigDiag.reasonCode}): ${sigDiag.detail}`, {
              checkIceRelay: false,
            });
            if (!isCancelled) {
              clearTimers();
              setFailureReasonLabel(sigDiag.reasonCode);
              setFailureNotice(sigDiag.detail);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        );
      } else {
        updateLifecycleState('connecting', 'Connecting');
        startConnectionTimer('receiver-accept');
        startRemoteCandidatesListener();

        const processOfferAndCreateAnswer = async (offerSdp: RTCSessionDescriptionInit) => {
          if (!offerSdp?.sdp || !pcRef.current || isCancelled) return;
          if (lastProcessedOfferSdpRef.current === offerSdp.sdp) return;
          lastProcessedOfferSdpRef.current = offerSdp.sdp;

          try {
            console.log(`[CALL] Offer received by callee (sdpLength=${offerSdp.sdp.length})`);
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offerSdp));
            if (isCancelled || !pcRef.current) return;
            hasRemoteDescriptionRef.current = true;
            console.log('[CALL] Callee setRemoteDescription(offer) complete');
            await drainQueuedIceCandidates(pcRef.current);
            if (isCancelled || !pcRef.current) return;

            const answer = await pcRef.current.createAnswer();
            if (isCancelled || !pcRef.current) return;
            console.log(`[CALL] Answer created (sdpLength=${answer.sdp?.length || 0})`);
            await pcRef.current.setLocalDescription(answer);
            if (isCancelled || !pcRef.current) return;
            console.log('[CALL] Callee local description set (answer)');

            const nowIso = new Date().toISOString();
            try {
              await updateDoc(callDocRef, {
                answer: {
                  type: answer.type,
                  sdp: answer.sdp,
                },
                status: 'accepted',
                acceptedAt: nowIso,
                updatedAt: nowIso,
              });
            } catch (sigErr) {
              const sigDiag = classifySignalingFailure(sigErr);
              logFinalFailure(`Callee answer write failed (${sigDiag.reasonCode}): ${sigDiag.detail}`, {
                checkIceRelay: false,
              });
              setFailureReasonLabel(sigDiag.reasonCode);
              setFailureNotice(sigDiag.detail);
              updateLifecycleState('failed', 'Connection failed');
              return;
            }
            if (isCancelled) return;
            console.log('[CALL] Callee wrote answer to call document');
            await flushPendingLocalCandidates();
          } catch (err) {
            console.error('[CALL] Callee failed to answer offer:', err);
            logFinalFailure(`Callee answer creation failed: ${err instanceof Error ? err.message : String(err)}`, {
              checkIceRelay: false,
            });
            setFailureReasonLabel('peer connection failed');
            setFailureNotice(
              err instanceof Error
                ? `Peer connection answer failed (${err.message}). Tap Try again.`
                : 'Peer connection failed while answering. Tap Try again.'
            );
            updateLifecycleState('failed', 'Connection failed');
          }
        };

        if (initialOfferRef.current && initialOfferRef.current.sdp) {
          await processOfferAndCreateAnswer(initialOfferRef.current);
        } else {
          try {
            const snap = await getDoc(callDocRef);
            const snapData = snap.data();
            if (snapData?.offer?.sdp) {
              await processOfferAndCreateAnswer(snapData.offer as RTCSessionDescriptionInit);
            }
          } catch (err) {
            const sigDiag = classifySignalingFailure(err);
            console.warn(`[CALL] Callee initial getDoc failed (${sigDiag.reasonCode}):`, err);
            if (sigDiag.reasonCode === 'signalling permission denied') {
              clearTimers();
              setFailureReasonLabel(sigDiag.reasonCode);
              setFailureNotice(sigDiag.detail);
              updateLifecycleState('failed', 'Connection failed');
              return;
            }
          }
        }

        callDocUnsubRef.current = onSnapshot(
          callDocRef,
          async (snapshot) => {
            const data = snapshot.data();
            if (!data || isCancelled) return;

            if (
              (data.status === 'ended' ||
                data.status === 'missed' ||
                data.status === 'no_answer' ||
                data.status === 'declined') &&
              !isCleaningUpRef.current
            ) {
              clearTimers();
              updateLifecycleState('ended', 'Call ended');
              onCloseRef.current();
              return;
            }

            if (
              data.offer?.sdp &&
              data.offer.sdp !== lastProcessedOfferSdpRef.current
            ) {
              console.log('[CALL] Callee detected new/restarted offer');
              hasRemoteDescriptionRef.current = false;
              await processOfferAndCreateAnswer(data.offer as RTCSessionDescriptionInit);
            }
          },
          (err) => {
            const sigDiag = classifySignalingFailure(err);
            logFinalFailure(`Callee callDoc listener failed (${sigDiag.reasonCode}): ${sigDiag.detail}`, {
              checkIceRelay: false,
            });
            if (!isCancelled) {
              clearTimers();
              setFailureReasonLabel(sigDiag.reasonCode);
              setFailureNotice(sigDiag.detail);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        );
      }
    };

    initializeCall().catch((err) => {
      const reasonCode =
        err instanceof CallInitError
          ? err.reasonCode
          : classifySignalingFailure(err).reasonCode;
      const detail =
        err instanceof CallInitError
          ? err.userDetail
          : err instanceof Error
          ? err.message
          : 'Unable to initialize call.';
      logFinalFailure(`Fatal call initialization error [${reasonCode}]: ${detail}`, {
        checkIceRelay: false,
      });
      cleanupWebRTC();
      if (!isCancelled) {
        setFailureReasonLabel(reasonCode);
        setFailureNotice(detail);
        updateLifecycleState('failed', 'Connection failed');
      }
    });

    return () => {
      isCancelled = true;
      if (networkChangeHandler) {
        window.removeEventListener('online', networkChangeHandler);
        navConnection?.removeEventListener?.('change', networkChangeHandler);
      }
      if (offlineHandler) {
        window.removeEventListener('offline', offlineHandler);
      }
      cleanupWebRTC();
    };
  }, [
    activeCallId,
    cleanupWebRTC,
    clearTimers,
    activeAuthUid,
    effectiveIsIncoming,
    normalizedMode,
    retryAttempt,
    updateLifecycleState,
  ]);

  const handleEndCall = async () => {
    isCleaningUpRef.current = true;
    console.log('[CALL] Ending call by user action');
    const meta = userMetaRef.current;
    sendCallSignalOverWs({
      callId: activeCallId,
      targetUserId: meta.recipientId,
      fromUserId: (auth.currentUser || currentUser)?.uid || meta.userId,
      fromName: meta.userName,
      callType: normalizedMode,
      signalType: 'end',
    });
    try {
      await updateDoc(doc(db, 'calls', activeCallId), {
        status: 'ended',
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore if doc already removed or unreachable
    }
    cleanupWebRTC();
    onCloseRef.current();
  };

  const handleRetryCall = async () => {
    console.log('[CALL] Retrying call with a fresh peer connection & call session (no page reload)...');
    isCleaningUpRef.current = true;
    const oldCallId = activeCallId;
    cleanupWebRTC();

    try {
      await updateDoc(doc(db, 'calls', oldCallId), {
        status: 'ended',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    const activeUid = (auth.currentUser || currentUser)?.uid || resolvedUserId;
    const nextCallId = `call_${activeUid}_${resolvedRecipientId}_${Date.now()}`;
    initialOfferRef.current = undefined;
    isCleaningUpRef.current = false;
    setFailureNotice(null);
    setFailureReasonLabel(null);
    setMediaWarningReason(null);
    setConnectionQuality('good');
    setEffectiveIsIncoming(false);
    setActiveCallId(nextCallId);
    updateLifecycleState('ringing', 'Connecting');
    setRetryAttempt((prev) => prev + 1);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const toggleCamera = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextVideoOff;
      });
    }
  };

  const handleFlipCamera = async () => {
    if (
      normalizedMode === 'voice' &&
      !isScreenSharing &&
      (!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0)
    ) {
      return;
    }
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);

    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      if (pcRef.current) {
        const videoSender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((oldTrack) => {
          localStreamRef.current?.removeTrack(oldTrack);
          oldTrack.stop();
        });
        localStreamRef.current.addTrack(newVideoTrack);
      } else {
        localStreamRef.current = newVideoStream;
      }

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
      }

      setIsVideoOff(false);
      console.log(`[WaveLink WebRTC] Flipped camera to ${nextFacing}`);
    } catch (err) {
      console.warn('[WaveLink WebRTC] Could not flip camera:', err);
    }
  };

  const toggleSpeaker = () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !nextSpeaker;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !nextSpeaker;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleGenerateMinutes = async () => {
    setIsGeneratingMinutes(true);
    setShowMinutesDrawer(true);
    try {
      const lines =
        transcript.length > 0
          ? transcript.map((t) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n')
          : `Call between ${resolvedUserName} and ${resolvedRecipientName}. Duration: ${formatDuration(
              callDuration
            )}.`;
      const { reply } = await sendWelinkChatMessage({
        messages: [
          {
            role: 'user',
            text: `Summarize this WaveLink call into concise, structured bullet-point meeting notes:\n\n${lines}`,
          },
        ],
      });
      setMeetingMinutes(reply);
    } catch {
      setMeetingMinutes('Unable to generate meeting minutes right now.');
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  const handleCopyMinutes = () => {
    if (!meetingMinutes) return;
    navigator.clipboard.writeText(meetingMinutes);
    setCopiedMinutes(true);
    window.setTimeout(() => setCopiedMinutes(false), 2000);
  };

  const handleDownloadMinutes = () => {
    if (!meetingMinutes) return;
    const blob = new Blob([meetingMinutes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wavelink-call-notes-${resolvedRecipientName
      .toLowerCase()
      .replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Switch Microphone Input Device cleanly via sender.replaceTrack
  const handleSelectAudioDevice = async (deviceId: string) => {
    setActivePopover(null);
    if (!deviceId) return;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const nextAudioTrack = nextStream.getAudioTracks()[0];
      if (!nextAudioTrack) return;
      nextAudioTrack.enabled = !isMuted;

      if (pcRef.current) {
        const audioSender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'audio');
        if (audioSender) {
          await audioSender.replaceTrack(nextAudioTrack);
        }
      }
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((old) => {
          localStreamRef.current?.removeTrack(old);
          old.stop();
        });
        localStreamRef.current.addTrack(nextAudioTrack);
      } else {
        localStreamRef.current = nextStream;
      }
      setSelectedAudioId(deviceId);
    } catch (err) {
      console.warn('[WaveLink WebRTC] Could not switch microphone:', err);
    }
  };

  // Switch Camera Input Device cleanly via sender.replaceTrack
  const handleSelectVideoDevice = async (deviceId: string) => {
    setActivePopover(null);
    if (!deviceId) return;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) return;

      if (pcRef.current) {
        const videoSender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(nextVideoTrack);
        }
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((old) => {
          localStreamRef.current?.removeTrack(old);
          old.stop();
        });
        localStreamRef.current.addTrack(nextVideoTrack);
      } else {
        localStreamRef.current = nextStream;
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
      }
      setIsScreenSharing(false);
      setIsVideoOff(false);
      setSelectedVideoId(deviceId);
    } catch (err) {
      console.warn('[WaveLink WebRTC] Could not switch camera:', err);
    }
  };

  // Toggle Screen Share (Desktop) cleanly via getDisplayMedia + sender.replaceTrack
  const stopScreenShareAndRestoreCamera = useCallback(async () => {
    try {
      let restoreTrack = cameraTrackBeforeShareRef.current;
      if (!restoreTrack || restoreTrack.readyState === 'ended') {
        if (normalizedMode === 'video') {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          restoreTrack = camStream.getVideoTracks()[0] || null;
        } else {
          restoreTrack = null;
        }
      }

      if (pcRef.current) {
        const videoSender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (videoSender && restoreTrack) {
          await videoSender.replaceTrack(restoreTrack);
        }
      }

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          if (t !== restoreTrack) {
            localStreamRef.current?.removeTrack(t);
            t.stop();
          }
        });
        if (restoreTrack && !localStreamRef.current.getVideoTracks().includes(restoreTrack)) {
          localStreamRef.current.addTrack(restoreTrack);
        }
      }

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
      }
      cameraTrackBeforeShareRef.current = null;
    } catch (err) {
      console.warn('[WaveLink WebRTC] Restore camera after screen share:', err);
    } finally {
      setIsScreenSharing(false);
    }
  }, [normalizedMode]);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShareAndRestoreCamera();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      const currentCamTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      if (currentCamTrack) {
        cameraTrackBeforeShareRef.current = currentCamTrack;
      }

      if (pcRef.current) {
        const videoSender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pcRef.current.addTrack(screenTrack, displayStream);
        }
      }

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          localStreamRef.current?.removeTrack(t);
        });
        localStreamRef.current.addTrack(screenTrack);
      } else {
        localStreamRef.current = displayStream;
      }

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
      }

      screenTrack.onended = () => {
        stopScreenShareAndRestoreCamera();
      };

      setIsScreenSharing(true);
      setIsVideoOff(false);
      setActivePopover(null);
    } catch (err) {
      console.warn('[WaveLink WebRTC] Screen share cancelled or unavailable:', err);
    }
  };

  const handleSendInCallMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inCallChatText.trim();
    const myUid = (auth.currentUser || currentUser)?.uid || resolvedUserId;
    if (!text || !myUid || !resolvedRecipientId) return;

    setInCallChatText('');
    try {
      const dmChannelId = computeDmConversationId(myUid, resolvedRecipientId);
      const nowIso = new Date().toISOString();
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const participants = [myUid, resolvedRecipientId].sort();

      await setDoc(
        doc(db, 'channels', dmChannelId, 'messages', msgId),
        cleanFirestoreData({
          id: msgId,
          channelId: dmChannelId,
          conversationId: dmChannelId,
          participants,
          senderId: myUid,
          receiverId: resolvedRecipientId,
          senderName: resolvedUserName,
          senderAvatar: sanitizeAvatarUrlForFirestore(resolvedUserAvatar, myUid),
          text,
          mediaType: 'none',
          isEdited: false,
          isDeleted: false,
          readBy: [myUid],
          timestamp: serverTimestamp(),
          createdAt: nowIso,
        })
      );

      setDoc(
        doc(db, 'channels', dmChannelId),
        {
          id: dmChannelId,
          conversationId: dmChannelId,
          participants,
          lastMessageText: text,
          lastMessageSenderId: myUid,
          lastMessageSenderName: resolvedUserName,
          lastMessageAt: nowIso,
          lastSeen: { [myUid]: nowIso },
          timestamp: serverTimestamp(),
          updatedAt: nowIso,
        },
        { merge: true }
      ).catch(() => {});
    } catch (err) {
      console.warn('[CALL] Could not send in-call DM message:', err);
    }
  };

  const handleTriggerEmojiReaction = (emoji: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const leftPct = 22 + Math.floor(Math.random() * 56);
    setFloatingReactions((prev) => [...prev, { id, emoji, leftPct }]);
    setActivePopover(null);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 1550);
  };

  // Draggable PiP Pointer Events (Mouse + Touch, clamped strictly inside stage)
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const pipEl = pipRef.current;
    const stageEl = stageRef.current;
    if (!pipEl || !stageEl) return;

    const pipRect = pipEl.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const pad = 10;

    // Base un-translated rect bounds
    const baseLeft = pipRect.left - pipOffset.x;
    const baseTop = pipRect.top - pipOffset.y;

    pipEl.setPointerCapture?.(e.pointerId);
    pipDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pipOffset.x,
      originY: pipOffset.y,
      minX: stageRect.left + pad - baseLeft,
      maxX: stageRect.right - pad - (baseLeft + pipRect.width),
      minY: stageRect.top + pad - baseTop,
      maxY: stageRect.bottom - pad - (baseTop + pipRect.height),
      moved: false,
    };
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pipDragRef.current;
    if (!drag || !drag.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }
    const clampedX = Math.max(drag.minX, Math.min(drag.maxX, drag.originX + dx));
    const clampedY = Math.max(drag.minY, Math.min(drag.maxY, drag.originY + dy));
    setPipOffset({ x: clampedX, y: clampedY });
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pipDragRef.current;
    if (!drag) return;
    e.stopPropagation();
    pipRef.current?.releasePointerCapture?.(e.pointerId);
    pipDragRef.current = null;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const liveStatusLabel =
    callState === 'connected'
      ? connectionQuality === 'weak'
        ? 'Weak connection'
        : formatDuration(callDuration)
      : callState === 'reconnecting'
      ? `Reconnecting • ${formatDuration(callDuration)}`
      : callState === 'ringing' && !effectiveIsIncoming
      ? isOfferPosted
        ? 'Ringing...'
        : 'Calling...'
      : callState === 'connecting'
      ? 'Connecting...'
      : statusMessage;

  const isOutgoingRingingOnly =
    !effectiveIsIncoming && callState === 'ringing';

  const showRemoteVideo =
    normalizedMode === 'video' &&
    hasRemoteVideoTrack &&
    !isRemoteVideoPaused &&
    (callState === 'connected' || callState === 'connecting' || callState === 'reconnecting');

  const hasRealRemotePhoto = Boolean(
    resolvedRecipientAvatar &&
      !resolvedRecipientAvatar.includes('dicebear.com') &&
      !remoteAvatarError
  );

  const isFailureTerminalState =
    callState === 'failed' ||
    callState === 'no-answer' ||
    callState === 'declined';

  const showSelfPip =
    (normalizedMode === 'video' || isScreenSharing) &&
    !isFailureTerminalState;

  const handleStageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isFailureTerminalState || isOutgoingRingingOnly) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest('button, input, textarea, [role="dialog"], .wavelink-call-local-pip, .wavelink-call-controls-bar, .wavelink-call-popover')
    ) {
      return;
    }
    if (activePopover) {
      setActivePopover(null);
    }
    setShowMobileControls((prev) => !prev);
  };

  return (
    <div ref={containerRef} className="wavelink-call-overlay">
      {/* Hidden audio element guarantees remote audio playback even in voice-only mode */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="wavelink-call-shell">
        {/* TOP HEADER:
            - Mobile (<768px): Person's name + live call timer / status (auto-toggles on tap)
            - Desktop (>=1024px): Clean top-left title ("Video Call with ..." / "Voice Call with ...") + peer name (no timer here) */}
        <header
          className={`wavelink-call-header ${
            !showMobileControls && !isOutgoingRingingOnly && !isFailureTerminalState
              ? 'wavelink-call-header--hidden'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2.5 w-full">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Mobile & Tablet (<1024px): avatar + caller name + status + top timer */}
              <div className="flex lg:hidden items-center gap-2.5 min-w-0 flex-1">
                <Avatar
                  uid={resolvedRecipientId}
                  src={resolvedRecipientAvatar}
                  alt={resolvedRecipientName}
                  fallbackName={resolvedRecipientName}
                  size={36}
                  showStatus={false}
                  onlyWhenVisible={false}
                  ringClassName="border border-white/40"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-sm sm:text-base truncate leading-tight text-white">
                    {resolvedRecipientName}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white/90 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        callState === 'connected' && connectionQuality === 'good'
                          ? 'bg-emerald-400'
                          : callState === 'connected' && connectionQuality === 'weak'
                          ? 'bg-amber-400'
                          : callState === 'reconnecting'
                          ? 'bg-amber-400 animate-pulse'
                          : isFailureTerminalState
                          ? 'bg-rose-400'
                          : 'bg-cyan-300 animate-pulse'
                      }`}
                    />
                    <span className="truncate font-mono tabular-nums">
                      {callState === 'connected'
                        ? connectionQuality === 'weak'
                          ? `Weak • ${formatDuration(callDuration)}`
                          : formatDuration(callDuration)
                        : liveStatusLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Desktop top-left clean call title & peer name */}
              <div className="hidden lg:flex items-center gap-3 min-w-0">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-2xl text-white shrink-0 border border-white/20"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  }}
                >
                  {normalizedMode === 'video' ? <Video size={17} /> : <PhoneCall size={17} />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/75 leading-none mb-1">
                    {normalizedMode === 'video'
                      ? `Video Call with ${resolvedRecipientName}`
                      : `Voice Call with ${resolvedRecipientName}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-lg truncate leading-tight text-white">
                      {resolvedRecipientName}
                    </h2>
                    {callState === 'reconnecting' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-bold">
                        Reconnecting
                      </span>
                    )}
                    {connectionQuality === 'weak' && callState === 'connected' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-bold">
                        Weak network
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile & Tablet (<1024px) More (...) Menu Trigger (48x48 touch target) */}
            <div className="flex lg:hidden items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileMoreSheet(true);
                }}
                aria-label="More call options"
                className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-black/45 hover:bg-black/60 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>

            {/* Desktop subtle encryption shield indicator only (no participant count or clutter) */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white/85">
                <Shield className="w-3.5 h-3.5 text-emerald-300" />
                Encrypted
              </span>
            </div>
          </div>
        </header>

        {/* STAGE: Full-bleed peer video (with blurred DP / theme gradient avatar fallback) + draggable local PiP */}
        <div ref={stageRef} onClick={handleStageTap} className="wavelink-call-stage">
          <div className="wavelink-call-remote-pane">
            {/* Always-mounted remote video element so audio/video tracks stay attached seamlessly */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`wavelink-call-remote-video ${
                showRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Blurred DP / Theme Gradient Avatar Stage (Outgoing/Ringing, Voice Calls, Camera Off, or Failure) */}
            {!showRemoteVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center overflow-hidden">
                {hasRealRemotePhoto ? (
                  <img
                    src={resolvedRecipientAvatar}
                    alt=""
                    aria-hidden="true"
                    onError={() => setRemoteAvatarError(true)}
                    className="absolute inset-0 w-full h-full object-cover scale-125 pointer-events-none"
                    style={{ filter: 'blur(36px) saturate(1.25)' }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 wavelink-call-theme-gradient pointer-events-none"
                    aria-hidden="true"
                  />
                )}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(6,10,20,0.62) 0%, rgba(6,10,20,0.44) 45%, rgba(6,10,20,0.86) 100%)',
                  }}
                />

                <div className="relative z-10 flex flex-col items-center wavelink-call-avatar-stack">
                  <div className="relative mb-4 wavelink-call-avatar-frame w-[120px] h-[120px] flex items-center justify-center">
                    {!isFailureTerminalState && callState !== 'connected' && (
                      <>
                        <div
                          className="absolute inset-0 rounded-full wavelink-call-pulse-ring"
                          style={{
                            border:
                              '2px solid color-mix(in srgb, var(--accent-primary) 78%, #38bdf8)',
                          }}
                        />
                        <div
                          className="absolute -inset-2 rounded-full wavelink-call-pulse-ring--delayed"
                          style={{
                            border:
                              '2px solid color-mix(in srgb, var(--accent-secondary) 65%, #ffffff)',
                          }}
                        />
                      </>
                    )}
                    <img
                      src={resolvedRecipientAvatar}
                      alt={resolvedRecipientName}
                      className="wavelink-call-avatar-img w-[120px] h-[120px] rounded-full object-cover relative bg-slate-900"
                      style={{
                        boxShadow:
                          '0 0 0 3px color-mix(in srgb, var(--accent-primary) 75%, #ffffff), 0 20px 44px rgba(0, 0, 0, 0.55)',
                      }}
                    />
                  </div>

                  <h3 className="text-2xl lg:text-[1.75rem] font-extrabold text-white tracking-tight truncate max-w-[82vw]">
                    {resolvedRecipientName}
                  </h3>

                  {!isFailureTerminalState && (
                    <p className="mt-1.5 text-sm font-semibold text-white/85 tabular-nums">
                      {callState === 'connected'
                        ? normalizedMode === 'voice'
                          ? `Voice call • ${formatDuration(callDuration)}`
                          : `Camera off • ${formatDuration(callDuration)}`
                        : liveStatusLabel}
                    </p>
                  )}

                  {/* Camera notice fallback while voice continues */}
                  {mediaWarningReason && !isFailureTerminalState && (
                    <div className="mt-3 max-w-xs px-3.5 py-2 rounded-2xl bg-amber-500/20 border border-amber-300/40 text-amber-100 text-xs leading-snug flex items-center gap-2 backdrop-blur-md">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
                      <span>
                        Camera notice: <strong>{mediaWarningReason}</strong> (voice active)
                      </span>
                    </div>
                  )}

                  {/* STUN-only fallback notice */}
                  {isStunFallback && !isFailureTerminalState && (
                    <div className="mt-2.5 max-w-xs px-3.5 py-2 rounded-2xl bg-amber-500/20 border border-amber-300/40 text-amber-100 text-xs leading-snug flex items-center gap-2 backdrop-blur-md">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
                      <span>
                        Calls may not connect on some mobile networks without relay servers.
                      </span>
                    </div>
                  )}

                  {/* Failure / No answer / Declined Retry & Close */}
                  {isFailureTerminalState && (
                    <div className="mt-4 flex flex-col items-center gap-3 max-w-xs px-2">
                      {failureReasonLabel && (
                        <div className="px-3 py-1 rounded-full bg-rose-500/25 border border-rose-400/55 text-rose-100 text-[11px] font-bold uppercase tracking-wider">
                          Reason: {failureReasonLabel}
                        </div>
                      )}
                      {failureNotice && (
                        <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                          {failureNotice}
                        </p>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleRetryCall}
                          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm shadow-lg transition-transform active:scale-95 cursor-pointer"
                          style={{
                            background:
                              'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                          }}
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Try again</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleEndCall}
                          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white font-semibold text-sm border border-white/25 backdrop-blur-md transition-all cursor-pointer"
                        >
                          <span>Close</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Non-intrusive top pill during active video if camera warning or STUN-only fallback is active */}
            {showRemoteVideo && (mediaWarningReason || isStunFallback) && (
              <div className="absolute top-16 lg:top-4 left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-3.5 py-1.5 rounded-full bg-amber-950/85 border border-amber-400/40 text-amber-100 text-[11px] font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span className="truncate">
                  {mediaWarningReason
                    ? `Camera notice: ${mediaWarningReason}`
                    : 'STUN fallback: calls may not connect on some mobile networks.'}
                </span>
              </div>
            )}
          </div>

          {/* Floating Emoji Reaction Bursts */}
          {floatingReactions.map((r) => (
            <span
              key={r.id}
              className="wavelink-call-reaction-burst"
              style={{ left: `${r.leftPct}%` }}
              aria-hidden="true"
            >
              {r.emoji}
            </span>
          ))}

          {/* Single Draggable Self-Video PiP (always mounted with localVideoRef when video/screen share active) */}
          <div
            ref={pipRef}
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
            onPointerCancel={handlePipPointerUp}
            style={{
              transform: `translate3d(${pipOffset.x}px, ${pipOffset.y}px, 0)`,
              display: showSelfPip ? undefined : 'none',
            }}
            className="wavelink-call-local-pip"
            title="Drag to reposition your camera preview"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`wavelink-call-local-video ${
                !isVideoOff && (normalizedMode === 'video' || isScreenSharing)
                  ? 'opacity-100'
                  : 'opacity-0'
              }`}
            />
            {(isVideoOff && !isScreenSharing) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-300 p-2 text-center">
                <Avatar
                  uid={resolvedUserId}
                  src={resolvedUserAvatar}
                  alt={resolvedUserName}
                  fallbackName={resolvedUserName}
                  size={44}
                  showStatus={false}
                  onlyWhenVisible={false}
                  targetProfile={userProfile}
                  ringClassName="border border-white/30"
                />
                <span className="hidden lg:inline text-[11px] font-medium text-slate-300 mt-1.5">
                  Camera Off
                </span>
              </div>
            )}
            <div className="hidden lg:flex items-center gap-1.5 absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white">
              <span>{isScreenSharing ? 'Sharing screen' : 'You'}</span>
              {isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
            </div>
          </div>

          {/* Desktop 2-Person In-Call DM Chat Mini Drawer */}
          {showInCallChat && (
            <div
              className="hidden lg:flex flex-col absolute bottom-24 right-6 z-40 w-80 max-h-[22rem] rounded-3xl bg-slate-950/92 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/12">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={15} className="text-cyan-300 shrink-0" />
                  <span className="text-xs font-bold truncate">
                    Chat with {resolvedRecipientName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInCallChat(false)}
                  aria-label="Close chat"
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 text-white/75 hover:text-white cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2 text-xs">
                {inCallMessages.length === 0 ? (
                  <p className="text-center text-white/50 py-6">
                    Send a message to {resolvedRecipientName} without interrupting the call.
                  </p>
                ) : (
                  inCallMessages.map((m) => {
                    const isMine =
                      m.senderId === ((auth.currentUser || currentUser)?.uid || resolvedUserId);
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] px-3 py-1.5 rounded-2xl leading-snug ${
                            isMine
                              ? 'text-white rounded-br-sm'
                              : 'bg-white/15 text-white rounded-bl-sm'
                          }`}
                          style={
                            isMine
                              ? {
                                  background:
                                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                }
                              : undefined
                          }
                        >
                          {m.text || (m.mediaType && m.mediaType !== 'none' ? `[${m.mediaType}]` : '')}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={handleSendInCallMessage}
                className="flex items-center gap-1.5 p-2.5 border-t border-white/12 bg-black/25"
              >
                <input
                  type="text"
                  value={inCallChatText}
                  onChange={(e) => setInCallChatText(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={500}
                  className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  disabled={!inCallChatText.trim()}
                  aria-label="Send message"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-40 cursor-pointer shrink-0"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  }}
                >
                  <Send size={13} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Live Captions Overlay (when active on desktop) */}
        {isCaptionsActive && transcript.length > 0 && (
          <div className="hidden lg:block absolute bottom-24 left-1/2 -translate-x-1/2 z-30 max-w-xl w-full px-4 pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-2.5 text-center shadow-xl">
              <p className="text-xs text-cyan-300 font-semibold">
                {transcript[transcript.length - 1].speaker}
              </p>
              <p className="text-sm text-white">
                {transcript[transcript.length - 1].text}
              </p>
            </div>
          </div>
        )}

        {/* BOTTOM CONTROLS:
            - Mobile/Tablet (<1024px): One slim 5-button single row above safe-area bottom bar: Mute, Camera, centered Red End, Flip, Speaker (no timer inside bottom bar)
            - Desktop (>=1024px): Clean floating dark toolbar with Mic+picker, Cam+picker, Chat, Emoji, ScreenShare, More(...), Recording-style Timer, End */}
        {!isFailureTerminalState && (
          <>
            {/* Mobile & Tablet (< 1024px) Single-Row 5-Button Control Bar (Center Red End Button) */}
            <footer
              className={`lg:hidden wavelink-call-controls-bar ${
                !showMobileControls && !isOutgoingRingingOnly ? 'wavelink-call-controls-bar--hidden' : ''
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. Mute */}
              <div className="wavelink-call-ctrl-slot">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`wavelink-call-control-btn ${
                    isMuted
                      ? 'bg-rose-500/35 border-rose-400/75 text-rose-100'
                      : 'bg-white/14 border-white/22 text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <span className="wavelink-call-ctrl-label">{isMuted ? 'Unmute' : 'Mute'}</span>
              </div>

              {/* 2. Camera */}
              <div className="wavelink-call-ctrl-slot">
                <button
                  type="button"
                  onClick={toggleCamera}
                  aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`wavelink-call-control-btn ${
                    isVideoOff
                      ? 'bg-rose-500/35 border-rose-400/75 text-rose-100'
                      : 'bg-white/14 border-white/22 text-white'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                <span className="wavelink-call-ctrl-label">Camera</span>
              </div>

              {/* 3. Red End Button in the CENTRE */}
              <div className="wavelink-call-ctrl-slot">
                <button
                  type="button"
                  onClick={handleEndCall}
                  aria-label="End call"
                  className="wavelink-call-control-btn wavelink-call-control-btn--end bg-rose-600 hover:bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-600/45"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <span className="wavelink-call-ctrl-label text-rose-200">End</span>
              </div>

              {/* 4. Flip Camera */}
              <div className="wavelink-call-ctrl-slot">
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  aria-label="Flip camera"
                  className="wavelink-call-control-btn bg-white/14 border-white/22 text-white"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
                <span className="wavelink-call-ctrl-label">Flip</span>
              </div>

              {/* 5. Speaker */}
              <div className="wavelink-call-ctrl-slot">
                <button
                  type="button"
                  onClick={toggleSpeaker}
                  aria-label={isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}
                  className={`wavelink-call-control-btn ${
                    !isSpeakerOn
                      ? 'bg-amber-500/30 border-amber-400/65 text-amber-100'
                      : 'bg-white/14 border-white/22 text-white'
                  }`}
                >
                  {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
                <span className="wavelink-call-ctrl-label">Speaker</span>
              </div>
            </footer>

            {/* Desktop (>= 1024px) Floating Dark Toolbar */}
            <footer className="hidden lg:flex wavelink-call-controls-bar">
              {/* Mic + Device Selector Chevron */}
              <div className="wavelink-call-split-btn">
                <div className="wavelink-call-tooltip-host">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`wavelink-call-control-btn border-0 ${
                      isMuted
                        ? 'bg-rose-500/30 text-rose-200'
                        : 'bg-transparent hover:bg-white/12 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <span className="wavelink-call-tooltip">
                    {isMuted ? 'Unmute mic' : 'Mute mic'}
                  </span>
                </div>
                <div className="wavelink-call-tooltip-host">
                  <button
                    type="button"
                    onClick={() => {
                      refreshMediaDevices();
                      setActivePopover((prev) => (prev === 'mic' ? null : 'mic'));
                    }}
                    aria-label="Choose microphone"
                    className="w-7 h-10 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/12 cursor-pointer"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <span className="wavelink-call-tooltip">Select microphone</span>
                </div>

                {activePopover === 'mic' && (
                  <div className="wavelink-call-popover" onClick={(e) => e.stopPropagation()}>
                    <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/55">
                      Microphone
                    </p>
                    {audioInputs.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-white/70">Default microphone</p>
                    ) : (
                      audioInputs.map((dev, idx) => (
                        <button
                          key={dev.deviceId || idx}
                          type="button"
                          onClick={() => handleSelectAudioDevice(dev.deviceId)}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-white/12 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="truncate">
                            {dev.label || `Microphone ${idx + 1}`}
                          </span>
                          {selectedAudioId === dev.deviceId && (
                            <Check size={14} className="text-emerald-400 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Camera + Device Selector Chevron */}
              <div className="wavelink-call-split-btn">
                <div className="wavelink-call-tooltip-host">
                  <button
                    type="button"
                    onClick={toggleCamera}
                    aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                    className={`wavelink-call-control-btn border-0 ${
                      isVideoOff
                        ? 'bg-rose-500/30 text-rose-200'
                        : 'bg-transparent hover:bg-white/12 text-white'
                    }`}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                  <span className="wavelink-call-tooltip">
                    {isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                  </span>
                </div>
                <div className="wavelink-call-tooltip-host">
                  <button
                    type="button"
                    onClick={() => {
                      refreshMediaDevices();
                      setActivePopover((prev) => (prev === 'cam' ? null : 'cam'));
                    }}
                    aria-label="Choose camera"
                    className="w-7 h-10 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/12 cursor-pointer"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <span className="wavelink-call-tooltip">Select camera</span>
                </div>

                {activePopover === 'cam' && (
                  <div className="wavelink-call-popover" onClick={(e) => e.stopPropagation()}>
                    <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/55">
                      Camera
                    </p>
                    {videoInputs.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-white/70">Default camera</p>
                    ) : (
                      videoInputs.map((dev, idx) => (
                        <button
                          key={dev.deviceId || idx}
                          type="button"
                          onClick={() => handleSelectVideoDevice(dev.deviceId)}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-white/12 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="truncate">{dev.label || `Camera ${idx + 1}`}</span>
                          {selectedVideoId === dev.deviceId && (
                            <Check size={14} className="text-emerald-400 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Chat Toggle */}
              <div className="wavelink-call-tooltip-host">
                <button
                  type="button"
                  onClick={() => {
                    setActivePopover(null);
                    setShowInCallChat((prev) => !prev);
                  }}
                  aria-label="Toggle call chat"
                  className={`wavelink-call-control-btn ${
                    showInCallChat
                      ? 'bg-white/25 border-white/35 text-white'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/18'
                  }`}
                >
                  <MessageSquare className="w-[18px] h-[18px]" />
                </button>
                <span className="wavelink-call-tooltip">Chat</span>
              </div>

              {/* Emoji Reaction */}
              <div className="wavelink-call-tooltip-host">
                <button
                  type="button"
                  onClick={() =>
                    setActivePopover((prev) => (prev === 'emoji' ? null : 'emoji'))
                  }
                  aria-label="Send reaction"
                  className={`wavelink-call-control-btn ${
                    activePopover === 'emoji'
                      ? 'bg-white/25 border-white/35 text-white'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/18'
                  }`}
                >
                  <Smile className="w-[19px] h-[19px]" />
                </button>
                <span className="wavelink-call-tooltip">Reactions</span>

                {activePopover === 'emoji' && (
                  <div
                    className="wavelink-call-popover flex items-center justify-center gap-1.5"
                    style={{ minWidth: 'max-content' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {['👍', '❤️', '😂', '👏', '🔥', '🎉'].map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => handleTriggerEmojiReaction(emo)}
                        className="w-10 h-10 rounded-full hover:bg-white/15 text-xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Screen Share */}
              <div className="wavelink-call-tooltip-host">
                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  aria-label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
                  className={`wavelink-call-control-btn ${
                    isScreenSharing
                      ? 'bg-emerald-500/30 border-emerald-400/70 text-emerald-200'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/18'
                  }`}
                >
                  {isScreenSharing ? (
                    <MonitorOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Monitor className="w-[18px] h-[18px]" />
                  )}
                </button>
                <span className="wavelink-call-tooltip">
                  {isScreenSharing ? 'Stop share' : 'Share screen'}
                </span>
              </div>

              {/* More (...) Menu (Speaker, Captions, AI Notes, Fullscreen) */}
              <div className="wavelink-call-tooltip-host">
                <button
                  type="button"
                  onClick={() =>
                    setActivePopover((prev) => (prev === 'more' ? null : 'more'))
                  }
                  aria-label="More call options"
                  className={`wavelink-call-control-btn ${
                    activePopover === 'more'
                      ? 'bg-white/25 border-white/35 text-white'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/18'
                  }`}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                <span className="wavelink-call-tooltip">More options</span>

                {activePopover === 'more' && (
                  <div className="wavelink-call-popover" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        toggleSpeaker();
                        setActivePopover(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/12 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {isSpeakerOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                        <span>{isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCaptionsActive((prev) => !prev);
                        setActivePopover(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/12 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Captions size={15} />
                        <span>Live Captions</span>
                      </span>
                      {isCaptionsActive && <Check size={14} className="text-emerald-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePopover(null);
                        handleGenerateMinutes();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/12 flex items-center gap-2 cursor-pointer"
                    >
                      <FileText size={15} />
                      <span>AI Call Notes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toggleFullscreen();
                        setActivePopover(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/12 flex items-center gap-2 cursor-pointer"
                    >
                      {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                      <span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Red Recording-Style Timer Badge */}
              <div className="wavelink-call-rec-timer" title="Call duration">
                <span
                  className={`w-2 h-2 rounded-full bg-rose-500 ${
                    callState === 'connected' ? 'animate-pulse' : ''
                  }`}
                />
                <span>{formatDuration(callDuration)}</span>
              </div>

              {/* Red End Call Button */}
              <div className="wavelink-call-tooltip-host">
                <button
                  type="button"
                  onClick={handleEndCall}
                  aria-label="End call"
                  className="wavelink-call-control-btn bg-rose-600 hover:bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-600/35 px-4 !w-auto gap-1.5 font-bold text-xs"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End</span>
                </button>
                <span className="wavelink-call-tooltip">End call</span>
              </div>
            </footer>
          </>
        )}

        {/* MOBILE & TABLET (< 1024px) IN-CALL CHAT BOTTOM SHEET */}
        {showInCallChat && (
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end justify-center"
            onClick={() => setShowInCallChat(false)}
          >
            <div
              className="w-full max-w-lg rounded-t-3xl bg-slate-950/95 border-t border-white/20 text-white shadow-2xl flex flex-col max-h-[75dvh] overflow-hidden"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mt-2.5 mb-1 shrink-0" />
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/12 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={16} className="text-cyan-300 shrink-0" />
                  <span className="text-sm font-bold truncate">
                    Chat with {resolvedRecipientName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInCallChat(false)}
                  aria-label="Close chat"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center bg-white/10 text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 text-xs">
                {inCallMessages.length === 0 ? (
                  <p className="text-center text-white/55 py-8">
                    Send a message to {resolvedRecipientName} without leaving the call.
                  </p>
                ) : (
                  inCallMessages.map((m) => {
                    const isMine =
                      m.senderId === ((auth.currentUser || currentUser)?.uid || resolvedUserId);
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] px-3 py-2 rounded-2xl leading-snug ${
                            isMine ? 'text-white rounded-br-sm' : 'bg-white/15 text-white rounded-bl-sm'
                          }`}
                          style={
                            isMine
                              ? {
                                  background:
                                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                }
                              : undefined
                          }
                        >
                          {m.text || (m.mediaType && m.mediaType !== 'none' ? `[${m.mediaType}]` : '')}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={handleSendInCallMessage}
                className="flex items-center gap-2 p-3 border-t border-white/12 bg-black/30 shrink-0"
              >
                <input
                  type="text"
                  value={inCallChatText}
                  onChange={(e) => setInCallChatText(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={500}
                  className="flex-1 min-w-0 min-h-[44px] bg-white/10 border border-white/18 rounded-full px-4 py-2 text-xs text-white placeholder-white/55 focus:outline-none focus:border-white/45"
                />
                <button
                  type="submit"
                  disabled={!inCallChatText.trim()}
                  aria-label="Send message"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white disabled:opacity-40 cursor-pointer shrink-0"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  }}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MOBILE & TABLET (< 1024px) MORE MENU BOTTOM SHEET (Chat, Reactions, Share Screen on tablet only, Captions, AI Notes, Diagnostics) */}
        {showMobileMoreSheet && (
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center"
            onClick={() => setShowMobileMoreSheet(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Call options"
              className="w-full max-w-lg rounded-t-3xl bg-slate-950/96 border-t border-white/20 text-white shadow-2xl flex flex-col max-h-[82dvh] overflow-hidden"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mt-2.5 mb-1 shrink-0" />
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/12 shrink-0">
                <h3 className="text-sm font-extrabold text-white">Call Options &amp; Diagnostics</h3>
                <button
                  type="button"
                  onClick={() => setShowMobileMoreSheet(false)}
                  aria-label="Close options"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {/* Reactions Row */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/60 mb-2">
                    Reactions
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {['👍', '❤️', '😂', '👏', '🔥', '🎉'].map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => {
                          handleTriggerEmojiReaction(emo);
                          setShowMobileMoreSheet(false);
                        }}
                        className="min-h-[48px] rounded-2xl bg-white/10 hover:bg-white/20 text-2xl flex items-center justify-center active:scale-95 transition cursor-pointer"
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      setShowInCallChat(true);
                    }}
                    className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/12 flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer"
                  >
                    <MessageSquare size={17} className="text-cyan-300 shrink-0" />
                    <span>In-Call Chat</span>
                  </button>

                  {/* Share Screen: hidden on phones (<768px), visible on tablet (>=768px) */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      handleToggleScreenShare();
                    }}
                    className="hidden md:flex min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/12 items-center gap-2.5 text-xs font-bold text-white cursor-pointer"
                  >
                    {isScreenSharing ? (
                      <MonitorOff size={17} className="text-emerald-300 shrink-0" />
                    ) : (
                      <Monitor size={17} className="text-cyan-300 shrink-0" />
                    )}
                    <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCaptionsActive((prev) => !prev);
                      setShowMobileMoreSheet(false);
                    }}
                    className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/12 flex items-center justify-between gap-2 text-xs font-bold text-white cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Captions size={17} className="text-cyan-300 shrink-0" />
                      <span className="truncate">Live Captions</span>
                    </span>
                    {isCaptionsActive && <Check size={15} className="text-emerald-400 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      handleGenerateMinutes();
                    }}
                    className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/12 flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer"
                  >
                    <FileText size={17} className="text-cyan-300 shrink-0" />
                    <span>AI Call Notes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      toggleFullscreen();
                    }}
                    className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/12 flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer"
                  >
                    {isFullscreen ? (
                      <Minimize2 size={17} className="text-cyan-300 shrink-0" />
                    ) : (
                      <Maximize2 size={17} className="text-cyan-300 shrink-0" />
                    )}
                    <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
                  </button>
                </div>

                {/* Live WebRTC Call Diagnostics */}
                <div className="rounded-2xl bg-white/8 border border-white/14 p-3.5 space-y-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-xs font-sans font-extrabold text-cyan-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Radio size={14} />
                      <span>Call Diagnostics</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-white/75">
                      {callState}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-white/85">
                    <span className="text-white/55">ICE State:</span>
                    <span className="font-bold">{diagIceState}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-white/85">
                    <span className="text-white/55">Peer Connection:</span>
                    <span className="font-bold">{diagConnState}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-white/85">
                    <span className="text-white/55">Signaling:</span>
                    <span className="font-bold">{diagSigState}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-white/85">
                    <span className="text-white/55">Candidates:</span>
                    <span className="font-bold truncate">
                      {diagCandidateTypes.length > 0 ? diagCandidateTypes.join(', ') : 'gathering...'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-white/85">
                    <span className="text-white/55">TURN Relay:</span>
                    <span className="font-bold truncate">{diagRelayStatus}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog when pressing Esc during an active call */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Leave call confirmation"
        >
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/20 p-6 shadow-2xl text-white text-center space-y-4">
            <h3 className="text-lg font-extrabold">Leave this call?</h3>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
              Your call with {resolvedRecipientName} is still ongoing. Are you sure you want to hang up?
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                autoFocus
                onClick={() => setShowLeaveConfirm(false)}
                className="min-h-[44px] flex-1 px-4 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-sm font-bold text-white cursor-pointer"
              >
                Stay in call
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  handleEndCall();
                }}
                className="min-h-[44px] flex-1 px-4 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-sm font-bold text-white cursor-pointer"
              >
                End call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Meeting Minutes Drawer */}
      {showMinutesDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col max-h-[80dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Call Summary & Notes</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMinutesDrawer(false)}
                className="text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 text-sm text-slate-200 whitespace-pre-wrap">
              {isGeneratingMinutes ? (
                <div className="flex items-center justify-center gap-2 py-12 text-cyan-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating call notes...</span>
                </div>
              ) : (
                meetingMinutes || 'No notes available.'
              )}
            </div>
            {!isGeneratingMinutes && meetingMinutes && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCopyMinutes}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
                >
                  {copiedMinutes ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedMinutes ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMinutes}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-slate-950"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
