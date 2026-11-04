import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { CallRecipient, CallSignalMessage } from '../types';
import { sendNotification } from '../services/notificationService';
import {
  Video,
  PhoneCall,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Radio,
  Share2,
  Check,
  AlertCircle,
  ShieldCheck,
  MonitorUp,
  Crown,
  Sparkles,
  Volume2
} from 'lucide-react';

interface CallingModalProps {
  initialType: 'video' | 'voice';
  recipient?: CallRecipient;
  isInitiator?: boolean;
  callId?: string;
  initialOffer?: any;
  onClose: () => void;
}

export const CallingModal: React.FC<CallingModalProps> = ({
  initialType,
  recipient,
  isInitiator = true,
  callId: propCallId,
  initialOffer,
  onClose
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective, canTalkToAdmin } = useAuth();
  const isProUser = isProEffective;

  // Check if call recipient is Platform Admin
  const isRecipientAdmin =
    recipient?.email === 'keylanmbilinyi5@gmail.com' ||
    recipient?.email?.toLowerCase() === 'keylanmbilinyi5@gmail.com';
  const isCallBlocked = isRecipientAdmin && !canTalkToAdmin;

  const [callType, setCallType] = useState<'video' | 'voice'>(initialType);
  const [isMediaActive, setIsMediaActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(callType === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [callState, setCallState] = useState<'initiating' | 'ringing' | 'connected' | 'ended'>('initiating');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteAudioActive, setRemoteAudioActive] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const effectiveCallIdRef = useRef<string>(
    propCallId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );
  const effectiveCallId = effectiveCallIdRef.current;

  // Process any ICE candidates that arrived before remoteDescription was set
  const drainCandidateQueue = useCallback(async (pc: RTCPeerConnection) => {
    while (queuedCandidatesRef.current.length > 0) {
      const cand = queuedCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('Queued candidate error:', e);
        }
      }
    }
  }, []);

  // Initialize media devices (Camera + Microphone)
  const initLocalStream = useCallback(async () => {
    setPermissionError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const videoResolution = isProUser
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: callType === 'video' && !isVideoDisabled ? videoResolution : false
      };

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('Fallback to audio-only stream:', firstErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (callType === 'video' && !isVideoDisabled) {
          setIsVideoDisabled(true);
        }
      }

      streamRef.current = mediaStream;

      if (localVideoRef.current && mediaStream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = mediaStream;
      }

      // If peer connection already created, add tracks
      if (peerConnectionRef.current) {
        mediaStream.getTracks().forEach((track) => {
          peerConnectionRef.current?.addTrack(track, mediaStream);
        });
      }

      setIsMediaActive(true);
      return mediaStream;
    } catch (err: unknown) {
      console.error('Failed to get media devices:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setPermissionError(`Camera / Microphone permission notice: ${msg}`);
      setIsMediaActive(true);
      return null;
    }
  }, [callType, isVideoDisabled, isProUser]);

  // Main WebRTC and WebSocket setup lifecycle
  useEffect(() => {
    if (isCallBlocked) return;
    let isCleanedUp = false;

    // Send in-app notification to call recipient if initiating
    if (isInitiator && recipient?.id && currentUser) {
      sendNotification({
        recipientId: recipient.id,
        actorId: currentUser.uid,
        actorName: userProfile?.displayName || currentUser.displayName || 'A waver',
        actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined,
        type: 'call',
        title: `Incoming ${initialType === 'video' ? 'Video' : 'Voice'} Call 📞`,
        body: `${userProfile?.displayName || currentUser.displayName || 'Someone'} is video calling you. Tap to join!`,
        entityId: effectiveCallId
      }).catch(console.error);
    }

    // 1. Create RTCPeerConnection with STUN servers
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnectionRef.current = pc;

    // Handle remote tracks (audio & video)
    pc.ontrack = (event) => {
      if (isCleanedUp) return;
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }

      const hasVideo = remoteStream.getVideoTracks().length > 0;
      const hasAudio = remoteStream.getAudioTracks().length > 0;
      setHasRemoteVideo(hasVideo);
      setRemoteAudioActive(hasAudio);
      setCallState('connected');
    };

    // ICE candidate event
    pc.onicecandidate = (event) => {
      if (isCleanedUp) return;
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && recipient?.id) {
        const msg: CallSignalMessage = {
          type: 'call:signal',
          callId: effectiveCallId,
          senderId: currentUser?.uid || '',
          senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
          senderPhotoURL: userProfile?.photoURL || currentUser?.photoURL || undefined,
          targetUserId: recipient.id,
          callType,
          signalType: 'candidate',
          candidate: event.candidate.toJSON()
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    };

    pc.onconnectionstatechange = () => {
      if (isCleanedUp) return;
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'disconnected') {
        setStatusNotice('Call disconnected');
      } else if (pc.connectionState === 'failed') {
        setStatusNotice('Connection failed. Switching to direct retry...');
      }
    };

    // 2. Connect WebSocket for signaling
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      if (isCleanedUp) return;
      // Start local media
      const localStream = await initLocalStream();
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStream);
          } catch (e) {
            console.warn('Track add error:', e);
          }
        });
      }

      if (isInitiator) {
        setCallState('ringing');
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === 'video'
          });
          await pc.setLocalDescription(offer);

          if (recipient?.id) {
            const offerMsg: CallSignalMessage = {
              type: 'call:signal',
              callId: effectiveCallId,
              senderId: currentUser?.uid || '',
              senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
              senderPhotoURL: userProfile?.photoURL || currentUser?.photoURL || undefined,
              targetUserId: recipient.id,
              callType,
              signalType: 'offer',
              sdp: offer
            };
            ws.send(JSON.stringify(offerMsg));
          }
        } catch (err) {
          console.warn('Offer creation error:', err);
        }
      } else if (initialOffer) {
        // Receiver answering with provided initialOffer
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
          await drainCandidateQueue(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (recipient?.id) {
            const answerMsg: CallSignalMessage = {
              type: 'call:signal',
              callId: effectiveCallId,
              senderId: currentUser?.uid || '',
              senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
              senderPhotoURL: userProfile?.photoURL || currentUser?.photoURL || undefined,
              targetUserId: recipient.id,
              callType,
              signalType: 'answer',
              sdp: answer
            };
            ws.send(JSON.stringify(answerMsg));
          }
          setCallState('connected');
        } catch (err) {
          console.warn('Answer creation error:', err);
        }
      }
    };

    ws.onmessage = async (event) => {
      if (isCleanedUp) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'call:signal' || data.callId !== effectiveCallId) return;
        if (data.senderId === currentUser?.uid) return;

        if (data.signalType === 'offer' && !isInitiator) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await drainCandidateQueue(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (recipient?.id) {
            const answerMsg: CallSignalMessage = {
              type: 'call:signal',
              callId: effectiveCallId,
              senderId: currentUser?.uid || '',
              senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
              senderPhotoURL: userProfile?.photoURL || currentUser?.photoURL || undefined,
              targetUserId: recipient.id,
              callType,
              signalType: 'answer',
              sdp: answer
            };
            ws.send(JSON.stringify(answerMsg));
          }
          setCallState('connected');
        } else if (data.signalType === 'answer' && isInitiator) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await drainCandidateQueue(pc);
          setCallState('connected');
        } else if (data.signalType === 'candidate' && data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            queuedCandidatesRef.current.push(data.candidate);
          }
        } else if (data.signalType === 'declined') {
          setStatusNotice('Call declined by recipient');
          setCallState('ended');
          setTimeout(() => {
            if (!isCleanedUp) onClose();
          }, 2000);
        } else if (data.signalType === 'end') {
          setStatusNotice('Call ended');
          setCallState('ended');
          setTimeout(() => {
            if (!isCleanedUp) onClose();
          }, 1500);
        }
      } catch (err) {
        console.warn('Signaling message parse notice:', err);
      }
    };

    return () => {
      isCleanedUp = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [effectiveCallId, isCallBlocked, isInitiator, recipient?.id]);

  // Duration timer when connected
  useEffect(() => {
    let interval: any = null;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  // Audio track mute toggle
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted; // Toggle enabled
      });
      setIsMuted(!isMuted);
    }
  };

  // Video track on/off toggle
  const toggleVideo = async () => {
    if (isVideoDisabled) {
      setIsVideoDisabled(false);
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: isProUser
            ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (streamRef.current) {
          const oldTrack = streamRef.current.getVideoTracks()[0];
          if (oldTrack) streamRef.current.removeTrack(oldTrack);
          streamRef.current.addTrack(newTrack);
        } else {
          streamRef.current = videoStream;
        }

        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newTrack);
          } else if (streamRef.current) {
            peerConnectionRef.current.addTrack(newTrack, streamRef.current);
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }
      } catch (e) {
        console.warn('Could not re-enable video track:', e);
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((t) => {
          t.enabled = false;
          t.stop();
        });
      }
      setIsVideoDisabled(true);
    }
  };

  // Screen share toggle
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          initLocalStream();
        };
        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share canceled or error:', err);
      }
    } else {
      setIsScreenSharing(false);
      initLocalStream();
    }
  };

  // End Call handler
  const handleEndCall = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && recipient?.id) {
      const endMsg: CallSignalMessage = {
        type: 'call:signal',
        callId: effectiveCallId,
        senderId: currentUser?.uid || '',
        senderName: userProfile?.displayName || currentUser?.displayName || 'Waver',
        targetUserId: recipient.id,
        callType,
        signalType: 'end'
      };
      wsRef.current.send(JSON.stringify(endMsg));
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsMediaActive(false);
    onClose();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/#call-${effectiveCallId}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const targetName = recipient?.name || 'WaveLink Member';
  const targetUsername = recipient?.username || `@${recipient?.email?.split('@')[0] || 'member'}`;
  const targetPhoto = recipient?.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${recipient?.id || 'partner'}`;

  if (isCallBlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-md bg-white border border-amber-200 rounded-3xl p-7 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 mx-auto flex items-center justify-center ring-8 ring-amber-50">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-xl font-black text-[#1C1917]">
            Protected Administrator Call
          </h3>
          <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed">
            Direct audio and video calls to Platform Administrator (@keylan) are restricted exclusively to Verified Blue Star subscribers and Administrators.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-bold text-xs shadow-md transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-900/75 backdrop-blur-md animate-fade-in">
      {/* Hidden audio element to ensure remote audio streams always play smoothly */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative w-full max-w-3xl bg-white border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-[#FAF7F2]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={targetPhoto}
              alt={targetName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-[#2563EB] shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-extrabold text-[#1C1917] text-base truncate flex items-center gap-2">
                <span>{targetName}</span>
                <span className="text-xs font-mono font-semibold text-[#2563EB]">
                  {targetUsername}
                </span>
              </h3>
              <p className="text-xs text-[#57534E] flex items-center gap-1.5 font-medium">
                <span
                  className={`w-2 h-2 rounded-full ${
                    callState === 'connected'
                      ? 'bg-emerald-500 animate-pulse'
                      : callState === 'ringing'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-blue-400'
                  }`}
                />
                {callState === 'connected'
                  ? `Live Call (${formatTime(callDuration)})`
                  : callState === 'ringing'
                  ? 'Ringing second person...'
                  : callState === 'ended'
                  ? 'Call ended'
                  : 'Establishing secure peer connection...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isProUser && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white shadow-xs">
                <Crown size={12} className="text-amber-300" />
                <span>1080p Full HD Pro</span>
              </span>
            )}

            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EEF2FF] text-[#2563EB]">
              <ShieldCheck size={12} />
              P2P Encrypted
            </span>

            <button
              onClick={copyRoomLink}
              title="Copy Call Invitation Link"
              className="p-2 rounded-xl text-[#57534E] hover:bg-stone-100 transition"
            >
              {copiedLink ? <Check size={16} className="text-emerald-600" /> : <Share2 size={16} />}
            </button>
          </div>
        </div>

        {/* Notices */}
        {statusNotice && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2 font-medium">
            <Sparkles size={15} className="text-blue-600 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {permissionError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>{permissionError}</span>
          </div>
        )}

        {/* Main Video / Voice Viewports */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col justify-center overflow-y-auto bg-stone-900/5">
          {callType === 'video' ? (
            /* Video Conference Grid */
            <div className="relative w-full aspect-video max-h-[460px] rounded-3xl overflow-hidden bg-stone-950 border-2 border-[#2563EB]/20 shadow-lg flex items-center justify-center">
              {/* Remote Participant Real Video Stream if connected */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`absolute inset-0 w-full h-full object-cover ${
                  hasRemoteVideo && callState === 'connected' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              />

              {/* Remote Partner Avatar & Ringing / Calling Indicator when video stream is pending */}
              {(!hasRemoteVideo || callState !== 'connected') && (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center relative z-10 bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white">
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-full bg-[#2563EB]/25 blur-xl animate-ping"
                      style={{ animationDuration: '3s' }}
                    />
                    <img
                      src={targetPhoto}
                      alt={targetName}
                      className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover ring-4 ring-[#2563EB] shadow-xl mx-auto mb-4 bg-white"
                    />
                    <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-emerald-500 text-white shadow-md">
                      <Radio size={14} className="animate-spin" style={{ animationDuration: '4s' }} />
                    </div>
                  </div>

                  <h4 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    {targetName}
                  </h4>
                  <p className="text-xs text-blue-400 font-mono font-semibold mt-0.5">
                    {targetUsername}
                  </p>

                  <div className="mt-3 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md shadow-xs text-[11px] font-semibold text-white/90 border border-white/10 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        callState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                      }`}
                    />
                    <span>
                      {callState === 'connected'
                        ? 'Remote audio connected • Video loading...'
                        : callState === 'ringing'
                        ? 'Notifying and ringing second person...'
                        : 'Connecting camera & microphone...'}
                    </span>
                  </div>
                </div>
              )}

              {/* Local User Camera PIP Viewport (Picture-in-Picture) */}
              <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden border-2 border-white/80 shadow-2xl bg-stone-900 z-20">
                {!isVideoDisabled ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-stone-900 text-white p-2">
                    <VideoOff size={18} className="text-rose-400 mb-1" />
                    <span className="text-[10px] font-semibold text-stone-300">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs">
                  You {isMuted && '(Muted)'}
                </div>
              </div>
            </div>
          ) : (
            /* Voice-Only Audio Room */
            <div className="w-full aspect-video max-h-[380px] rounded-3xl overflow-hidden bg-gradient-to-br from-[#EEF2FF] via-[#FAF7F2] to-[#F0FDFA] border-2 border-[#0D9488]/20 shadow-lg flex flex-col items-center justify-center p-8 text-center text-[#1C1917] relative">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-[#0D9488]/20 blur-2xl animate-pulse" />
                <img
                  src={targetPhoto}
                  alt={targetName}
                  className="relative w-24 h-24 rounded-full object-cover ring-4 ring-[#0D9488] shadow-xl mx-auto bg-white"
                />
                <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-[#2563EB] text-white shadow-sm">
                  <PhoneCall size={14} />
                </div>
              </div>

              <h4 className="text-xl font-bold text-[#1C1917] tracking-tight">
                {targetName}
              </h4>
              <p className="text-xs text-[#2563EB] font-mono font-semibold mt-0.5">
                {targetUsername}
              </p>

              {/* Animated Audio Frequency Meter */}
              <div className="flex items-center gap-1.5 mt-6 h-8">
                {[40, 75, 55, 95, 60, 85, 45, 90, 70, 50].map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-[#2563EB] to-[#0D9488] animate-pulse"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '1.2s'
                    }}
                  />
                ))}
              </div>

              <span className="text-xs text-[#57534E] mt-4 font-mono font-semibold">
                {callState === 'connected'
                  ? `In Call • ${formatTime(callDuration)}`
                  : callState === 'ringing'
                  ? 'Ringing second person...'
                  : 'Calling...'}
              </span>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="px-6 py-4 bg-[#FAF7F2] border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {/* Mode switch */}
            <button
              onClick={() => {
                const nextType = callType === 'video' ? 'voice' : 'video';
                setCallType(nextType);
                setIsVideoDisabled(nextType === 'voice');
              }}
              className="py-2 px-3 rounded-xl bg-white text-[#1C1917] border border-[var(--border-subtle)] text-xs font-semibold hover:bg-stone-100 transition active:scale-95 shadow-2xs"
            >
              Switch to {callType === 'video' ? 'Voice Only' : 'Video Call'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {/* Mute Mic */}
            <button
              onClick={toggleMute}
              className={`p-3 rounded-2xl transition active:scale-95 shadow-sm ${
                isMuted
                  ? 'bg-rose-500 hover:bg-rose-600 text-white ring-4 ring-rose-500/20'
                  : 'bg-white text-[#1C1917] hover:bg-stone-100 border border-[var(--border-subtle)]'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Video Toggle */}
            {callType === 'video' && (
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-2xl transition active:scale-95 shadow-sm ${
                  isVideoDisabled
                    ? 'bg-rose-500 hover:bg-rose-600 text-white ring-4 ring-rose-500/20'
                    : 'bg-white text-[#1C1917] hover:bg-stone-100 border border-[var(--border-subtle)]'
                }`}
                title={isVideoDisabled ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoDisabled ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            )}

            {/* Screen Share */}
            {callType === 'video' && (
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-2xl transition active:scale-95 shadow-sm ${
                  isScreenSharing
                    ? 'bg-[#2563EB] text-white ring-4 ring-[#2563EB]/20'
                    : 'bg-white text-[#1C1917] hover:bg-stone-100 border border-[var(--border-subtle)]'
                }`}
                title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
              >
                <MonitorUp size={20} />
              </button>
            )}

            {/* End Call */}
            <button
              onClick={handleEndCall}
              className="py-3 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm flex items-center gap-2 shadow-md transition active:scale-95"
            >
              <PhoneOff size={18} />
              <span>End Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
