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
  Wifi,
  AlertCircle,
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
} from 'lucide-react';
import { CallRecipient } from '../types';
import { useAuth } from '../context/AuthContext';
import { db, cleanFirestoreData } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
} from 'firebase/firestore';
import { sendWelinkChatMessage } from '../services/geminiService';

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

const isPlaceholderValue = (val?: string): boolean => {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    !trimmed ||
    trimmed === 'YOUR_TURN_USERNAME' ||
    trimmed === 'YOUR_TURN_CREDENTIAL' ||
    trimmed.startsWith('YOUR_')
  );
};

const buildIceServersFromEnv = (): RTCIceServer[] => {
  const rawTurnUrls = (
    (import.meta.env.VITE_TURN_URLS as string | undefined) ||
    (import.meta.env.VITE_TURN_URL as string | undefined) ||
    ''
  ).trim();
  const rawTurnUsername = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
  const rawTurnCredential = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();

  const turnUrls = rawTurnUrls
    ? rawTurnUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ];

  const turnUsername = isPlaceholderValue(rawTurnUsername)
    ? 'openrelayproject'
    : rawTurnUsername!;
  const turnCredential = isPlaceholderValue(rawTurnCredential)
    ? 'openrelayproject'
    : rawTurnCredential!;

  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    },
  ];
};

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
    propUserAvatar ||
    userProfile?.photoURL ||
    currentUser?.photoURL ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${resolvedUserId}`;

  const resolvedRecipientId = recipient?.id || contact?.id || 'wavelink_peer';
  const resolvedRecipientName = recipient?.name || contact?.name || 'WaveLink Member';
  const resolvedRecipientAvatar =
    recipient?.photoURL ||
    contact?.avatar ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${resolvedRecipientId}`;

  const resolvedIsIncoming =
    typeof isInitiator === 'boolean' ? !isInitiator : Boolean(propIsIncoming);

  const normalizedMode: 'video' | 'voice' =
    initialType === 'voice' || legacyCallType === 'audio' ? 'voice' : 'video';

  const [callState, setCallState] = useState<CallLifecycleState>(
    resolvedIsIncoming ? 'connecting' : 'ringing'
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    resolvedIsIncoming ? 'Connecting...' : 'Ringing...'
  );
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(normalizedMode === 'voice');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Candidate queues & deduplication sets
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isCallDocReadyRef = useRef<boolean>(resolvedIsIncoming);
  const addedCandidateIdsRef = useRef<Set<string>>(new Set());

  // Offer/Answer deduplication & ICE restart counters
  const lastAppliedAnswerSdpRef = useRef<string | null>(null);
  const lastProcessedOfferSdpRef = useRef<string | null>(null);
  const iceRestartCountRef = useRef<number>(0);
  const isRestartingIceRef = useRef<boolean>(false);
  const disconnectedTimerRef = useRef<number | null>(null);

  const isCleaningUpRef = useRef(false);
  const callStateRef = useRef<CallLifecycleState>(resolvedIsIncoming ? 'connecting' : 'ringing');

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
  }, []);

  const cleanupWebRTC = useCallback(() => {
    console.log('[WaveLink WebRTC] Cleaning up tracks, peer connection, and listeners');
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
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.getSenders().forEach((sender) => {
          try {
            pcRef.current?.removeTrack(sender);
          } catch {
            // ignore
          }
        });
        pcRef.current.close();
      } catch (err) {
        console.warn('[WaveLink WebRTC] Error closing peer connection:', err);
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
    lastAppliedAnswerSdpRef.current = null;
    lastProcessedOfferSdpRef.current = null;
    iceRestartCountRef.current = 0;
    isRestartingIceRef.current = false;
    setHasRemoteVideoTrack(false);
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

  // Call duration timer starts ONLY when peer connection state is actually 'connected'
  useEffect(() => {
    if (callState !== 'connected') return;
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

  // Main WebRTC signaling and connection lifecycle
  useEffect(() => {
    let isCancelled = false;
    isCleaningUpRef.current = false;
    isCallDocReadyRef.current = resolvedIsIncoming;

    const startConnectionTimer = (label: string) => {
      if (connectionTimeoutRef.current) {
        window.clearTimeout(connectionTimeoutRef.current);
      }
      console.log(`[WaveLink WebRTC] Starting 20s connection timeout (${label})`);
      connectionTimeoutRef.current = window.setTimeout(() => {
        if (isCancelled) return;
        if (callStateRef.current !== 'connected') {
          console.warn(
            '[WaveLink WebRTC] 20s connection timeout expired; state never became connected'
          );
          updateLifecycleState('failed', 'Connection failed');
        }
      }, 20000);
    };

    const drainQueuedIceCandidates = async (pc: RTCPeerConnection) => {
      if (!pc.remoteDescription || !pc.remoteDescription.type) return;
      if (pendingIceCandidatesRef.current.length === 0) return;

      const queued = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = [];
      console.log(`[WaveLink WebRTC] Draining ${queued.length} queued remote ICE candidate(s)`);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WaveLink WebRTC] Failed to add queued ICE candidate:', err);
        }
      }
    };

    const initializeCall = async () => {
      cleanupWebRTC();
      setCallDuration(0);

      // 1. Resolve STUN + TURN servers (env vars + server endpoint)
      let iceServers = buildIceServersFromEnv();
      try {
        const res = await fetch('/api/calls/ice-servers');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
            iceServers = data.iceServers;
          }
        }
      } catch {
        // Fallback to client env ICE servers
      }

      if (isCancelled) return;

      // 2. Acquire local media stream BEFORE creating offer or answer
      let localStream: MediaStream | null = null;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video:
            normalizedMode === 'video'
              ? {
                  facingMode: 'user',
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : false,
        });
        console.log(
          '[WaveLink WebRTC] Local media stream acquired:',
          localStream.getTracks().map((t) => `${t.kind}:${t.label}`)
        );
      } catch (mediaErr) {
        console.warn(
          '[WaveLink WebRTC] Primary getUserMedia failed, trying audio-only fallback:',
          mediaErr
        );
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setIsVideoOff(true);
        } catch (audioErr) {
          console.error('[WaveLink WebRTC] Could not access microphone/camera:', audioErr);
        }
      }

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

      // 3. Create PeerConnection with STUN + TURN and iceCandidatePoolSize: 10
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
      });
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
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream!);
        });
        console.log('[WaveLink WebRTC] Local tracks added to RTCPeerConnection before offer/answer');
      }

      // 5. Handle incoming remote tracks (add every track to the single remote MediaStream)
      pc.ontrack = (event: RTCTrackEvent) => {
        console.log(
          '[WaveLink WebRTC] Track received:',
          event.track.kind,
          event.track.id,
          'streams:',
          event.streams.length
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
          event.track.onunmute = () => {
            setHasRemoteVideoTrack(true);
            remoteVideoRef.current?.play().catch(() => {});
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
        resolvedIsIncoming ? 'calleeCandidates' : 'callerCandidates'
      );
      const remoteCandidatesCol = collection(
        db,
        'calls',
        activeCallId,
        resolvedIsIncoming ? 'callerCandidates' : 'calleeCandidates'
      );

      // Helper to perform automatic ICE restart (up to 3 times) when ICE becomes disconnected or failed
      const triggerAutomaticIceRestart = async (reason: string) => {
        if (isCancelled || isCleaningUpRef.current || !pcRef.current) return;
        if (isRestartingIceRef.current) return;

        if (iceRestartCountRef.current >= 3) {
          console.error(
            `[WaveLink WebRTC] ICE restart limit (3/3) reached after ${reason}. Marking call as failed.`
          );
          updateLifecycleState('failed', 'Connection failed');
          return;
        }

        isRestartingIceRef.current = true;
        iceRestartCountRef.current += 1;
        const attempt = iceRestartCountRef.current;

        console.log(
          `[WaveLink WebRTC] ICE state is "${reason}" — performing automatic ICE restart (attempt ${attempt}/3)...`
        );

        if (callStateRef.current !== 'connected') {
          updateLifecycleState('connecting', 'Connecting...');
        }
        startConnectionTimer(`ice-restart-${attempt}`);

        try {
          // Caller initiates the new offer with iceRestart: true; if on receiver side, caller also detects and restarts,
          // or receiver can push a restart offer if caller hasn't yet.
          if (!resolvedIsIncoming || attempt > 0) {
            const restartOffer = await pcRef.current.createOffer({
              iceRestart: true,
              offerToReceiveAudio: true,
              offerToReceiveVideo: normalizedMode === 'video',
            });
            await pcRef.current.setLocalDescription(restartOffer);
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
            console.log(
              `[WaveLink WebRTC] ICE restart offer (${attempt}/3) created and written to Firestore`
            );
          }
        } catch (err) {
          console.warn(`[WaveLink WebRTC] ICE restart attempt ${attempt}/3 error:`, err);
        } finally {
          window.setTimeout(() => {
            isRestartingIceRef.current = false;
          }, 2500);
        }
      };

      // 6. Monitor PeerConnection and ICE states — ONLY mark 'connected' when genuinely connected
      const checkConnectionState = () => {
        if (!pcRef.current || isCancelled) return;
        const connState = pcRef.current.connectionState;
        const iceState = pcRef.current.iceConnectionState;

        console.log(
          `[WaveLink WebRTC] State update -> connectionState: ${connState}, iceConnectionState: ${iceState}`
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

          // Check if remote stream already has a video track
          if (
            remoteStreamRef.current &&
            remoteStreamRef.current.getVideoTracks().length > 0
          ) {
            setHasRemoteVideoTrack(true);
          }

          if (callStateRef.current !== 'connected') {
            console.log('[WaveLink WebRTC] Peer connection established! Starting call timer.');
            updateLifecycleState('connected', 'Connected');
          }
        } else if (connState === 'connecting' || iceState === 'checking') {
          if (callStateRef.current !== 'connected' && callStateRef.current !== 'ringing') {
            updateLifecycleState('connecting', 'Connecting...');
          }
        } else if (iceState === 'disconnected') {
          // Give brief transient network blips 1.5s to self-heal, then auto-restart ICE (up to 3 times)
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
          }
          disconnectedTimerRef.current = window.setTimeout(() => {
            if (!pcRef.current || isCancelled) return;
            const currentIce = pcRef.current.iceConnectionState;
            if (currentIce === 'disconnected' || currentIce === 'failed') {
              triggerAutomaticIceRestart(currentIce);
            }
          }, 1500);
        } else if (iceState === 'failed' || connState === 'failed') {
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
            disconnectedTimerRef.current = null;
          }
          triggerAutomaticIceRestart('failed');
        }
      };

      pc.onconnectionstatechange = checkConnectionState;
      pc.oniceconnectionstatechange = checkConnectionState;

      // 7. Write local ICE candidates to our own subcollection (buffering if call doc isn't created yet)
      pc.onicecandidate = async (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate || isCancelled) return;
        const candidateJson = event.candidate.toJSON();

        if (!isCallDocReadyRef.current) {
          pendingLocalCandidatesRef.current.push(candidateJson);
          return;
        }

        console.log(
          `[WaveLink WebRTC] Local ICE candidate generated -> writing to ${
            resolvedIsIncoming ? 'calleeCandidates' : 'callerCandidates'
          }`
        );
        try {
          await addDoc(localCandidatesCol, candidateJson);
        } catch (err) {
          console.warn('[WaveLink WebRTC] Failed to write local ICE candidate:', err);
        }
      };

      const flushPendingLocalCandidates = async () => {
        if (pendingLocalCandidatesRef.current.length === 0) return;
        const toSend = [...pendingLocalCandidatesRef.current];
        pendingLocalCandidatesRef.current = [];
        console.log(
          `[WaveLink WebRTC] Flushing ${toSend.length} local ICE candidate(s) to ${
            resolvedIsIncoming ? 'calleeCandidates' : 'callerCandidates'
          }`
        );
        for (const cand of toSend) {
          try {
            await addDoc(localCandidatesCol, cand);
          } catch (err) {
            console.warn('[WaveLink WebRTC] Failed to flush local ICE candidate:', err);
          }
        }
      };

      // Helper to subscribe to remote side's ICE candidate subcollection AFTER call doc exists
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

              if (currentPc.remoteDescription && currentPc.remoteDescription.type) {
                try {
                  await currentPc.addIceCandidate(new RTCIceCandidate(candidateData));
                  console.log('[WaveLink WebRTC] Added remote ICE candidate immediately');
                } catch (err) {
                  console.warn('[WaveLink WebRTC] Error adding remote ICE candidate:', err);
                }
              } else {
                console.log(
                  '[WaveLink WebRTC] Queued remote ICE candidate (waiting for setRemoteDescription)'
                );
                pendingIceCandidatesRef.current.push(candidateData);
              }
            });
          },
          (err) => {
            console.warn('[WaveLink WebRTC] Remote ICE candidates listener error:', err);
          }
        );
      };

      // 8. Exact Signaling Order through Firestore
      if (!resolvedIsIncoming) {
        // STEP 1 (CALLER): Create offer, setLocalDescription, and create the call document with the offer
        updateLifecycleState('ringing', 'Ringing...');

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: normalizedMode === 'video',
        });
        await pc.setLocalDescription(offer);
        console.log('[WaveLink WebRTC] Offer created and set as local description');

        const nowIso = new Date().toISOString();
        const meta = userMetaRef.current;
        await setDoc(
          callDocRef,
          cleanFirestoreData({
            id: activeCallId,
            callId: activeCallId,
            caller: meta.userId,
            callerId: meta.userId,
            callerName: meta.userName,
            callerPhotoURL: meta.userAvatar,
            receiver: meta.recipientId,
            receiverId: meta.recipientId,
            receiverName: meta.recipientName,
            receiverPhotoURL: meta.recipientAvatar,
            type: normalizedMode,
            callType: normalizedMode,
            status: 'ringing',
            offer: {
              type: offer.type,
              sdp: offer.sdp,
            },
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
          { merge: true }
        );
        console.log('[WaveLink WebRTC] Call document created with offer:', activeCallId);

        // Now that the call document exists in Firestore, flush buffered local candidates and attach remote candidates listener
        isCallDocReadyRef.current = true;
        await flushPendingLocalCandidates();
        startRemoteCandidatesListener();

        // 30-second ringing timeout if receiver never answers
        ringingTimeoutRef.current = window.setTimeout(async () => {
          if (isCancelled) return;
          if (callStateRef.current === 'ringing') {
            console.log('[WaveLink WebRTC] 30s ringing timeout -> No answer');
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
        }, 30000);

        // STEP 3 (CALLER): Listen to the call document; when answer appears, call setRemoteDescription once
        callDocUnsubRef.current = onSnapshot(callDocRef, async (snapshot) => {
          const data = snapshot.data();
          if (!data || isCancelled || !pcRef.current) return;

          if (data.status === 'declined' || data.status === 'rejected') {
            clearTimers();
            updateLifecycleState('declined', 'No answer');
            return;
          }
          if (data.status === 'missed' || data.status === 'no_answer') {
            clearTimers();
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
            updateLifecycleState('connecting', 'Connecting...');
            startConnectionTimer('caller-accepted');
          }

          if (
            data.answer &&
            data.answer.sdp &&
            data.answer.sdp !== lastAppliedAnswerSdpRef.current
          ) {
            lastAppliedAnswerSdpRef.current = data.answer.sdp;
            console.log('[WaveLink WebRTC] Answer received from receiver');

            if (ringingTimeoutRef.current) {
              window.clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }

            if (callStateRef.current !== 'connected') {
              updateLifecycleState('connecting', 'Connecting...');
              startConnectionTimer('caller-after-answer');
            }

            try {
              await pcRef.current.setRemoteDescription(
                new RTCSessionDescription(data.answer as RTCSessionDescriptionInit)
              );
              console.log('[WaveLink WebRTC] Caller setRemoteDescription(answer) complete');
              await drainQueuedIceCandidates(pcRef.current);
            } catch (err) {
              console.error('[WaveLink WebRTC] Caller setRemoteDescription failed:', err);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        });
      } else {
        // STEP 2 (RECEIVER): Show "Connecting...", start remote candidate listener, read offer, setRemoteDescription, createAnswer, setLocalDescription, write answer
        updateLifecycleState('connecting', 'Connecting...');
        startConnectionTimer('receiver-accept');
        startRemoteCandidatesListener();

        const processOfferAndCreateAnswer = async (offerSdp: RTCSessionDescriptionInit) => {
          if (!offerSdp?.sdp || !pcRef.current || isCancelled) return;
          if (lastProcessedOfferSdpRef.current === offerSdp.sdp) return;
          lastProcessedOfferSdpRef.current = offerSdp.sdp;

          try {
            console.log('[WaveLink WebRTC] Receiver setting remote description from offer');
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offerSdp));
            await drainQueuedIceCandidates(pcRef.current);

            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            console.log('[WaveLink WebRTC] Receiver created answer and setLocalDescription');

            const nowIso = new Date().toISOString();
            await updateDoc(callDocRef, {
              answer: {
                type: answer.type,
                sdp: answer.sdp,
              },
              status: 'accepted',
              acceptedAt: nowIso,
              updatedAt: nowIso,
            });
            console.log('[WaveLink WebRTC] Receiver wrote answer to call document');
            await flushPendingLocalCandidates();
          } catch (err) {
            console.error('[WaveLink WebRTC] Receiver failed to answer offer:', err);
            updateLifecycleState('failed', 'Connection failed');
          }
        };

        // Check initialOffer or read call document immediately
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
            console.warn('[WaveLink WebRTC] Receiver initial getDoc failed:', err);
          }
        }

        // Listen for initial offer, ICE restart offers, and call termination
        callDocUnsubRef.current = onSnapshot(callDocRef, async (snapshot) => {
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
            console.log('[WaveLink WebRTC] Receiver detected new/restarted offer');
            await processOfferAndCreateAnswer(data.offer as RTCSessionDescriptionInit);
          }
        });
      }
    };

    initializeCall().catch((err) => {
      console.error('[WaveLink WebRTC] Fatal call initialization error:', err);
      if (!isCancelled) {
        updateLifecycleState('failed', 'Connection failed');
      }
    });

    return () => {
      isCancelled = true;
      cleanupWebRTC();
    };
  }, [
    activeCallId,
    cleanupWebRTC,
    clearTimers,
    normalizedMode,
    resolvedIsIncoming,
    retryAttempt,
    updateLifecycleState,
  ]);

  const handleEndCall = async () => {
    isCleaningUpRef.current = true;
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
    console.log('[WaveLink WebRTC] Retrying call connection...');
    try {
      await updateDoc(doc(db, 'calls', activeCallId), {
        status: 'ended',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    cleanupWebRTC();

    if (!resolvedIsIncoming) {
      const nextCallId = `call_${resolvedUserId}_${resolvedRecipientId}_${Date.now()}`;
      setActiveCallId(nextCallId);
      updateLifecycleState('ringing', 'Ringing...');
    } else {
      updateLifecycleState('connecting', 'Connecting...');
    }
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const headerTimeOrStatus =
    callState === 'connected' ? formatDuration(callDuration) : statusMessage;

  const showRemoteVideo =
    normalizedMode === 'video' &&
    hasRemoteVideoTrack &&
    (callState === 'connected' || callState === 'connecting');

  return (
    <div ref={containerRef} className="wavelink-call-overlay">
      {/* Hidden audio element guarantees remote audio playback even in voice-only mode */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="wavelink-call-shell">
        {/* TOP HEADER: On phones (<768px) shows ONLY the person's name and the call time/status */}
        <header className="wavelink-call-header">
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={resolvedRecipientAvatar}
                alt={resolvedRecipientName}
                className="w-9 h-9 rounded-full object-cover border border-cyan-500/40 shrink-0"
              />
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate leading-tight">
                  {resolvedRecipientName}
                </h2>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 lg:text-[#0D9488]">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      callState === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : callState === 'failed' ||
                          callState === 'no-answer' ||
                          callState === 'declined'
                        ? 'bg-rose-500'
                        : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span className="truncate font-mono">{headerTimeOrStatus}</span>
                </div>
              </div>
            </div>

            {/* Desktop-only badges & secondary actions (hidden on phones so header stays minimal) */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/70 text-[11px] font-semibold text-cyan-300">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                E2E WebRTC
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/70 text-[11px] font-semibold text-slate-300">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                {callState === 'connected' ? 'Peer Connected' : statusMessage}
              </span>
              <button
                type="button"
                onClick={() => setIsCaptionsActive((prev) => !prev)}
                className={`p-2 rounded-xl border transition-colors ${
                  isCaptionsActive
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-400 hover:text-white'
                }`}
                title="Live Captions"
              >
                <Captions className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleGenerateMinutes}
                className="p-2 rounded-xl bg-slate-800/70 border border-slate-700/60 text-slate-400 hover:text-white transition-colors"
                title="AI Call Notes"
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-slate-800/70 border border-slate-700/60 text-slate-400 hover:text-white transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* STAGE: Full-screen remote video + 100x140 top-right PIP on phones; Side-by-side on desktop (>=1024px) */}
        <div className="wavelink-call-stage">
          {/* Remote Participant Pane */}
          <div className="wavelink-call-remote-pane">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`wavelink-call-remote-video ${
                showRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Avatar / Connecting / Failure Overlay when remote video isn't actively rendering */}
            {!showRemoteVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950">
                <div className="relative mb-4">
                  {callState !== 'connected' &&
                    callState !== 'failed' &&
                    callState !== 'no-answer' &&
                    callState !== 'declined' && (
                      <>
                        <div className="absolute -inset-4 rounded-full bg-cyan-500/20 animate-ping" />
                        <div className="absolute -inset-2 rounded-full bg-cyan-500/30 animate-pulse" />
                      </>
                    )}
                  <img
                    src={resolvedRecipientAvatar}
                    alt={resolvedRecipientName}
                    className="relative w-24 h-24 lg:w-32 lg:h-32 rounded-full object-cover border-2 border-cyan-400/60 shadow-2xl"
                  />
                </div>

                {/* On phones (<768px), keep text minimal (only name + call time/status) */}
                <h3 className="text-lg lg:text-2xl font-bold text-white mb-1 truncate max-w-[85vw]">
                  {resolvedRecipientName}
                </h3>
                <p className="text-sm lg:text-base font-medium text-cyan-300 flex items-center gap-2">
                  {(callState === 'ringing' || callState === 'connecting') && (
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  )}
                  <span>{headerTimeOrStatus}</span>
                </p>

                {/* Error / Retry state when 20s timeout expires or receiver doesn't answer */}
                {(callState === 'failed' ||
                  callState === 'no-answer' ||
                  callState === 'declined') && (
                  <div className="mt-5 flex flex-col items-center gap-3 max-w-xs">
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-medium">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        {callState === 'failed' ? 'Connection failed' : 'No answer'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRetryCall}
                        className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleEndCall}
                        className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 transition-all cursor-pointer"
                      >
                        <span>Close</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Desktop participant label */}
            <div className="hidden lg:flex items-center gap-2 absolute bottom-4 left-4 px-3 py-1.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-slate-800/80 text-xs font-semibold text-white">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>{resolvedRecipientName}</span>
            </div>
          </div>

          {/* Local Camera Pane: 100x140px PIP in top-right corner on phones; side-by-side second column on desktop */}
          <div className="wavelink-call-local-pip">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`wavelink-call-local-video ${
                !isVideoOff && normalizedMode === 'video' ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {(isVideoOff || normalizedMode === 'voice') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-400 p-2 text-center">
                {resolvedUserAvatar ? (
                  <img
                    src={resolvedUserAvatar}
                    alt={resolvedUserName}
                    className="w-10 h-10 lg:w-20 lg:h-20 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <VideoOff className="w-6 h-6 lg:w-10 lg:h-10 text-slate-500" />
                )}
                <span className="hidden lg:inline text-xs font-medium text-slate-400 mt-2">
                  {isVideoOff ? 'Camera Off' : 'Voice Mode'}
                </span>
              </div>
            )}
            <div className="hidden lg:flex items-center gap-2 absolute bottom-4 left-4 px-3 py-1.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-slate-800/80 text-xs font-semibold text-white">
              <span>You ({resolvedUserName})</span>
              {isMuted && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
            </div>
          </div>
        </div>

        {/* Live Captions Overlay (when active on desktop) */}
        {isCaptionsActive && transcript.length > 0 && (
          <div className="hidden lg:block absolute bottom-24 left-1/2 -translate-x-1/2 z-30 max-w-xl w-full px-4">
            <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-2.5 text-center shadow-xl">
              <p className="text-xs text-cyan-400 font-semibold">
                {transcript[transcript.length - 1].speaker}
              </p>
              <p className="text-sm text-white">
                {transcript[transcript.length - 1].text}
              </p>
            </div>
          </div>
        )}

        {/* BOTTOM CONTROLS: Single row at the bottom with safe-area padding (mute, camera, flip camera, end call) */}
        <footer className="wavelink-call-controls-bar">
          {/* Mute / Unmute */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`wavelink-call-control-btn ${
              isMuted
                ? 'bg-rose-500/25 border-rose-500/70 text-rose-300'
                : 'bg-slate-800/90 border-slate-700/80 text-white hover:bg-slate-700'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Camera On / Off */}
          <button
            type="button"
            onClick={toggleCamera}
            aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            className={`wavelink-call-control-btn ${
              isVideoOff
                ? 'bg-rose-500/25 border-rose-500/70 text-rose-300'
                : 'bg-slate-800/90 border-slate-700/80 text-white hover:bg-slate-700'
            }`}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Flip Camera */}
          <button
            type="button"
            onClick={handleFlipCamera}
            aria-label="Flip camera"
            className="wavelink-call-control-btn bg-slate-800/90 border-slate-700/80 text-white hover:bg-slate-700"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {/* Desktop-only Speaker toggle (hidden on phones so the 4 required controls sit in a clean single row) */}
          <button
            type="button"
            onClick={toggleSpeaker}
            aria-label={isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}
            className={`hidden lg:inline-flex wavelink-call-control-btn ${
              !isSpeakerOn
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                : 'bg-slate-800/90 border-slate-700/80 text-white hover:bg-slate-700'
            }`}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* End Call */}
          <button
            type="button"
            onClick={handleEndCall}
            aria-label="End call"
            className="wavelink-call-control-btn bg-rose-600 hover:bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-600/30"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </footer>
      </div>

      {/* AI Meeting Minutes Drawer (Desktop Optional Feature Preserved) */}
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
