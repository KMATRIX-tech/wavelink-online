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
import { sendNotification } from '../services/notificationService';
import { Avatar } from './Avatar';
import {
  buildIceServersFromEnv,
  extractIceCandidateInfo,
  logTurnEnvStartupWarning
} from '../utils/webrtcConfig';

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
    initialIsIncoming ? 'Connecting...' : 'Ringing...'
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

  // Candidate queues, ordering flags & diagnostics
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isCallDocReadyRef = useRef<boolean>(initialIsIncoming);
  const hasRemoteDescriptionRef = useRef<boolean>(false);
  const addedCandidateIdsRef = useRef<Set<string>>(new Set());
  const gatheredCandidateTypesRef = useRef<Set<string>>(new Set());
  const gatheredRelayCandidateRef = useRef<boolean>(false);

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
    isCallDocReadyRef.current = effectiveIsIncoming;

    logTurnEnvStartupWarning();

    const logFinalFailure = (reason: string) => {
      const typesList = Array.from(gatheredCandidateTypesRef.current);
      const relayMissingNote = !gatheredRelayCandidateRef.current
        ? ' | TURN server not reachable (no relay candidates gathered)'
        : '';
      if (!gatheredRelayCandidateRef.current) {
        console.error('[CALL] TURN server not reachable — no relay ICE candidates were gathered.');
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

      console.log(
        `[CALL] Starting call setup (role=${
          effectiveIsIncoming ? 'callee' : 'caller'
        }, mode=${normalizedMode}, callId=${activeCallId}, attempt=${retryAttempt + 1})`
      );

      // 1. Resolve STUN + TURN servers (Vite env vars take priority; server used if custom configured or client missing env vars)
      const envConfig = buildIceServersFromEnv();
      let iceServers = envConfig.iceServers;
      let resolvedTurnUrls = envConfig.turnUrls;

      try {
        const res = await fetch('/api/calls/ice-servers');
        if (res.ok) {
          const data = await res.json();
          if (
            Array.isArray(data?.iceServers) &&
            data.iceServers.length > 0 &&
            (!envConfig.hasCustomTurnEnv || data.hasCustomTurnConfig)
          ) {
            if (!envConfig.hasCustomTurnEnv) {
              iceServers = data.iceServers;
              const turnEntry = data.iceServers.find((s: RTCIceServer) => s.username || s.credential);
              resolvedTurnUrls = Array.isArray(turnEntry?.urls)
                ? turnEntry.urls
                : turnEntry?.urls
                ? [turnEntry.urls]
                : [];
            }
          }
        }
      } catch {
        // Fallback cleanly to client env ICE servers
      }

      console.log('[CALL] RTCPeerConnection ICE servers configured:', {
        hasCustomTurnEnv: envConfig.hasCustomTurnEnv,
        stunCount: iceServers.filter((s) => !s.username).length,
        turnUrls: resolvedTurnUrls,
      });

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
          '[CALL] Local media stream acquired:',
          localStream.getTracks().map((t) => `${t.kind}:${t.label}`)
        );
      } catch (mediaErr) {
        console.warn('[CALL] Primary getUserMedia failed, trying audio-only fallback:', mediaErr);
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setIsVideoOff(true);
        } catch (audioErr) {
          console.error('[CALL] Could not access microphone/camera:', audioErr);
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
        console.log('[CALL] Local tracks added BEFORE createOffer/createAnswer');
      } else {
        console.warn('[CALL] Proceeding without local tracks (receive-only fallback)');
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
        effectiveIsIncoming ? 'calleeCandidates' : 'callerCandidates'
      );
      const remoteCandidatesCol = collection(
        db,
        'calls',
        activeCallId,
        effectiveIsIncoming ? 'callerCandidates' : 'calleeCandidates'
      );

      let startConnectionTimer: (label: string) => void = () => {};

      // Helper to perform automatic ICE restart (up to 3 times) before showing "Connection failed"
      const triggerAutomaticIceRestart = async (reason: string) => {
        if (isCancelled || isCleaningUpRef.current || !pcRef.current) return;
        if (isRestartingIceRef.current) return;

        if (iceRestartCountRef.current >= 3) {
          logFinalFailure(`ICE restart limit (3/3) reached (${reason})`);
          updateLifecycleState('failed', 'Connection failed');
          return;
        }

        isRestartingIceRef.current = true;
        iceRestartCountRef.current += 1;
        const attempt = iceRestartCountRef.current;

        console.log(
          `[CALL] ICE restart ${attempt}/3 triggered (reason=${reason}, relayGathered=${gatheredRelayCandidateRef.current})`
        );

        if (callStateRef.current !== 'connected') {
          updateLifecycleState('connecting', 'Connecting...');
        }
        startConnectionTimer(`ice-restart-${attempt}`);

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
            console.log(`[CALL] ICE restart offer (${attempt}/3) created and written to Firestore`);
          } else {
            // Callee requests caller to send ICE-restart offer to prevent SDP glare
            await updateDoc(callDocRef, {
              iceRestartRequestedAt: new Date().toISOString(),
              iceRestartReason: reason,
              updatedAt: new Date().toISOString(),
            });
            console.log(`[CALL] Callee requested ICE restart (${attempt}/3) from caller`);
          }
        } catch (err) {
          console.warn(`[CALL] ICE restart attempt ${attempt}/3 failed:`, err);
        } finally {
          window.setTimeout(() => {
            isRestartingIceRef.current = false;
          }, 2500);
        }
      };

      startConnectionTimer = (label: string) => {
        if (connectionTimeoutRef.current) {
          window.clearTimeout(connectionTimeoutRef.current);
        }
        console.log(`[CALL] Starting 20s connection timer (${label})`);
        connectionTimeoutRef.current = window.setTimeout(() => {
          if (isCancelled || !pcRef.current) return;
          if (callStateRef.current !== 'connected') {
            const currIce = pcRef.current.iceConnectionState;
            const currConn = pcRef.current.connectionState;
            console.warn(
              `[CALL] 20s connection timer expired (${label}) | iceConnectionState=${currIce}, connectionState=${currConn}, relayGathered=${gatheredRelayCandidateRef.current}`
            );
            if (!gatheredRelayCandidateRef.current) {
              console.warn('[CALL] TURN server not reachable (no relay ICE candidates gathered)');
            }
            if (iceRestartCountRef.current < 3) {
              triggerAutomaticIceRestart(`20s-timeout-${label}`);
            } else {
              logFinalFailure(`20s timeout after 3 ICE restarts (ice=${currIce}, conn=${currConn})`);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        }, 20000);
      };

      // 6. Monitor ICE gathering, iceConnectionState, and connectionState
      pc.onicegatheringstatechange = () => {
        if (!pcRef.current || isCancelled) return;
        const gathering = pcRef.current.iceGatheringState;
        console.log(`[CALL] iceGatheringState changed -> ${gathering}`);
        if (gathering === 'complete' && !gatheredRelayCandidateRef.current) {
          console.warn('[CALL] TURN server not reachable — ICE gathering completed without any relay candidate.');
        }
      };

      const handlePeerStateUpdate = () => {
        if (!pcRef.current || isCancelled) return;
        const connState = pcRef.current.connectionState;
        const iceState = pcRef.current.iceConnectionState;

        console.log(
          `[CALL] State change -> iceConnectionState=${iceState}, connectionState=${connState}`
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
            updateLifecycleState('connected', 'Connected');
          }
        } else if (connState === 'connecting' || iceState === 'checking') {
          if (callStateRef.current !== 'connected' && callStateRef.current !== 'ringing') {
            updateLifecycleState('connecting', 'Connecting...');
          }
        } else if (iceState === 'disconnected') {
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
          }
          disconnectedTimerRef.current = window.setTimeout(() => {
            if (!pcRef.current || isCancelled) return;
            const currentIce = pcRef.current.iceConnectionState;
            if (currentIce === 'disconnected' || currentIce === 'failed') {
              triggerAutomaticIceRestart(`ice-${currentIce}`);
            }
          }, 1500);
        } else if (iceState === 'failed' || connState === 'failed') {
          if (disconnectedTimerRef.current) {
            window.clearTimeout(disconnectedTimerRef.current);
            disconnectedTimerRef.current = null;
          }
          triggerAutomaticIceRestart(`state-${iceState === 'failed' ? 'ice-failed' : 'conn-failed'}`);
        }
      };

      pc.onconnectionstatechange = handlePeerStateUpdate;
      pc.oniceconnectionstatechange = handlePeerStateUpdate;

      // 7. Gather & write local ICE candidates to our own subcollection
      pc.onicecandidate = async (event: RTCPeerConnectionIceEvent) => {
        if (isCancelled) return;
        if (!event.candidate) {
          console.log('[CALL] End of local ICE candidates signaled');
          if (!gatheredRelayCandidateRef.current) {
            console.warn('[CALL] TURN server not reachable — no relay candidate gathered.');
          }
          return;
        }

        const candInfo = extractIceCandidateInfo(event.candidate);
        gatheredCandidateTypesRef.current.add(candInfo.type);
        if (candInfo.type === 'relay') {
          gatheredRelayCandidateRef.current = true;
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
          }
        );
      };

      // 8. Exact Signaling Order through Firestore
      if (!effectiveIsIncoming) {
        updateLifecycleState('ringing', 'Ringing...');

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: normalizedMode === 'video',
        });
        console.log(`[CALL] Offer created (sdpLength=${offer.sdp?.length || 0})`);
        await pc.setLocalDescription(offer);
        console.log('[CALL] Local description set (offer)');

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
        console.log('[CALL] Call document written with offer:', activeCallId);

        if (meta.recipientId && meta.recipientId !== meta.userId) {
          sendNotification({
            recipientId: meta.recipientId,
            actorId: meta.userId,
            actorName: meta.userName,
            actorPhotoURL: meta.userAvatar,
            type: 'incoming_call',
            title: normalizedMode === 'video' ? 'Incoming Video Call 📞' : 'Incoming Voice Call 📞',
            body: `${meta.userName} is calling you on WaveLink. Tap to answer.`,
            entityId: activeCallId,
          }).catch(() => {});
        }

        isCallDocReadyRef.current = true;
        await flushPendingLocalCandidates();
        startRemoteCandidatesListener();

        // 30-second ringing timeout if receiver never answers
        ringingTimeoutRef.current = window.setTimeout(async () => {
          if (isCancelled) return;
          if (callStateRef.current === 'ringing') {
            console.log('[CALL] 30s ringing timeout -> No answer');
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
            lastAppliedAnswerSdpRef.current = data.answer.sdp;
            console.log(`[CALL] Answer received (sdpLength=${data.answer.sdp.length})`);

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
              hasRemoteDescriptionRef.current = true;
              console.log('[CALL] Caller setRemoteDescription(answer) complete');
              await drainQueuedIceCandidates(pcRef.current);
            } catch (err) {
              console.error('[CALL] Caller setRemoteDescription(answer) failed:', err);
              logFinalFailure(`Caller setRemoteDescription failed: ${err instanceof Error ? err.message : String(err)}`);
              updateLifecycleState('failed', 'Connection failed');
            }
          }
        });
      } else {
        updateLifecycleState('connecting', 'Connecting...');
        startConnectionTimer('receiver-accept');
        startRemoteCandidatesListener();

        const processOfferAndCreateAnswer = async (offerSdp: RTCSessionDescriptionInit) => {
          if (!offerSdp?.sdp || !pcRef.current || isCancelled) return;
          if (lastProcessedOfferSdpRef.current === offerSdp.sdp) return;
          lastProcessedOfferSdpRef.current = offerSdp.sdp;

          try {
            console.log(`[CALL] Offer received by callee (sdpLength=${offerSdp.sdp.length})`);
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offerSdp));
            hasRemoteDescriptionRef.current = true;
            console.log('[CALL] Callee setRemoteDescription(offer) complete');
            await drainQueuedIceCandidates(pcRef.current);

            const answer = await pcRef.current.createAnswer();
            console.log(`[CALL] Answer created (sdpLength=${answer.sdp?.length || 0})`);
            await pcRef.current.setLocalDescription(answer);
            console.log('[CALL] Callee local description set (answer)');

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
            console.log('[CALL] Callee wrote answer to call document');
            await flushPendingLocalCandidates();
          } catch (err) {
            console.error('[CALL] Callee failed to answer offer:', err);
            logFinalFailure(`Callee answer creation failed: ${err instanceof Error ? err.message : String(err)}`);
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
            console.warn('[CALL] Callee initial getDoc failed:', err);
          }
        }

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
            console.log('[CALL] Callee detected new/restarted offer');
            hasRemoteDescriptionRef.current = false;
            await processOfferAndCreateAnswer(data.offer as RTCSessionDescriptionInit);
          }
        });
      }
    };

    initializeCall().catch((err) => {
      logFinalFailure(`Fatal call initialization error: ${err instanceof Error ? err.message : String(err)}`);
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
    effectiveIsIncoming,
    normalizedMode,
    retryAttempt,
    updateLifecycleState,
  ]);

  const handleEndCall = async () => {
    isCleaningUpRef.current = true;
    console.log('[CALL] Ending call by user action');
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

    const nextCallId = `call_${resolvedUserId}_${resolvedRecipientId}_${Date.now()}`;
    initialOfferRef.current = undefined;
    isCleaningUpRef.current = false;
    setEffectiveIsIncoming(false);
    setActiveCallId(nextCallId);
    updateLifecycleState('ringing', 'Ringing...');
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
              <Avatar
                uid={resolvedRecipientId}
                src={resolvedRecipientAvatar}
                alt={resolvedRecipientName}
                fallbackName={resolvedRecipientName}
                size={36}
                showStatus={true}
                onlyWhenVisible={false}
                ringClassName="border border-cyan-500/40"
              />
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate leading-tight">
                  {resolvedRecipientName}
                </h2>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 lg:text-cyan-300">
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

            {/* Desktop-only badges & secondary actions (status is NOT repeated here) */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/70 text-[11px] font-semibold text-cyan-300">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                E2E WebRTC
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

        {/* STAGE: Full-screen on mobile with top-right self view; side-by-side panes on desktop */}
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
                  <Avatar
                    uid={resolvedRecipientId}
                    src={resolvedRecipientAvatar}
                    alt={resolvedRecipientName}
                    fallbackName={resolvedRecipientName}
                    size={96}
                    showStatus={true}
                    onlyWhenVisible={false}
                    ringClassName="border-2 border-cyan-400/60 shadow-2xl"
                  />
                </div>

                {/* Name only (status text is shown once in the header) */}
                <h3 className="text-lg lg:text-2xl font-bold text-white mb-1 truncate max-w-[85vw]">
                  {resolvedRecipientName}
                </h3>

                {/* Retry / Close actions when call fails or goes unanswered */}
                {(callState === 'failed' ||
                  callState === 'no-answer' ||
                  callState === 'declined') && (
                  <div className="mt-5 flex flex-col items-center gap-3 max-w-xs">
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

            {/* Desktop participant label positioned cleanly at bottom-left so it never overlaps the header */}
            <div className="hidden lg:flex items-center gap-2 absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-slate-800/80 text-xs font-semibold text-white">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>{resolvedRecipientName}</span>
            </div>
          </div>

          {/* Local Camera Pane: 100x140px PIP in top-right corner on phones; floating box in bottom-right corner on desktop */}
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
                  <Avatar
                    uid={resolvedUserId}
                    src={resolvedUserAvatar}
                    alt={resolvedUserName}
                    fallbackName={resolvedUserName}
                    size={44}
                    showStatus={true}
                    onlyWhenVisible={false}
                    targetProfile={userProfile}
                    ringClassName="border border-slate-700"
                  />
                ) : (
                  <VideoOff className="w-6 h-6 lg:w-7 lg:h-7 text-slate-500" />
                )}
                <span className="hidden lg:inline text-[11px] font-medium text-slate-400 mt-1.5">
                  {isVideoOff ? 'Camera Off' : 'Voice Mode'}
                </span>
              </div>
            )}
            <div className="hidden lg:flex items-center gap-1.5 absolute bottom-2 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800/80 text-[11px] font-semibold text-white">
              <span>You</span>
              {isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
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
