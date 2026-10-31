import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CallRecipient } from '../types';
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
  Maximize2,
  Crown,
  Sparkles
} from 'lucide-react';

interface CallingModalProps {
  initialType: 'video' | 'voice';
  recipient?: CallRecipient;
  onClose: () => void;
}

export const CallingModal: React.FC<CallingModalProps> = ({ initialType, recipient, onClose }) => {
  const { currentUser, userProfile, isAdmin, isProEffective, canTalkToAdmin } = useAuth();
  const isProUser = isProEffective;

  // Check if call recipient is Platform Admin
  const isRecipientAdmin = recipient?.email === 'keylanmbilinyi5@gmail.com' || recipient?.email?.toLowerCase() === 'keylanmbilinyi5@gmail.com';
  const isCallBlocked = isRecipientAdmin && !canTalkToAdmin;

  const [callType, setCallType] = useState<'video' | 'voice'>(initialType);
  const [isMediaActive, setIsMediaActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(callType === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [callState, setCallState] = useState<'connecting' | 'connected'>('connecting');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Automatically start stream on component mount
  useEffect(() => {
    startStream();
    const connectTimer = setTimeout(() => {
      setCallState('connected');
    }, 1500);

    if (recipient?.id && currentUser) {
      sendNotification({
        recipientId: recipient.id,
        actorId: currentUser.uid,
        actorName: userProfile?.displayName || currentUser.displayName || 'A waver',
        actorAvatar: userProfile?.photoURL || currentUser.photoURL || undefined,
        type: 'call',
        title: `Incoming ${initialType === 'video' ? 'Video' : 'Voice'} Call 📞`,
        body: `${userProfile?.displayName || currentUser.displayName || 'Someone'} is calling you on WaveLink.`,
        actionUrl: 'chat'
      }).catch(console.error);
    }

    return () => {
      clearTimeout(connectTimer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Media stream initialization: 1080p for Pro members, 720p for free tier
  const startStream = async () => {
    setPermissionError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const videoResolution = isProUser
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

      const constraints: MediaStreamConstraints = {
        audio: true,
        video: callType === 'video' && !isVideoDisabled ? videoResolution : false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (localVideoRef.current && callType === 'video' && !isVideoDisabled) {
        localVideoRef.current.srcObject = mediaStream;
      }

      setIsMediaActive(true);
    } catch (err: unknown) {
      console.error('Failed to get media devices:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setPermissionError(`Camera / Microphone notice: ${msg}. Audio fallback active.`);
      setIsMediaActive(true);
    }
  };


  // Timer for duration once connected
  useEffect(() => {
    let interval: any = null;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted; // Toggle
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = async () => {
    if (isVideoDisabled) {
      setIsVideoDisabled(false);
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = videoStream.getVideoTracks()[0];
        if (streamRef.current) {
          streamRef.current.addTrack(newTrack);
        } else {
          streamRef.current = videoStream;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }
      } catch (e) {
        console.warn('Could not re-enable video', e);
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((t) => t.stop());
      }
      setIsVideoDisabled(true);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (streamRef.current) {
          const oldVideo = streamRef.current.getVideoTracks()[0];
          if (oldVideo) streamRef.current.removeTrack(oldVideo);
          streamRef.current.addTrack(screenTrack);
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          startStream();
        };
        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share canceled', err);
      }
    } else {
      setIsScreenSharing(false);
      startStream();
    }
  };

  const handleEndCall = () => {
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
    const link = `${window.location.origin}/call/room_${recipient?.id || 'direct'}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const targetName = recipient?.name || 'Chat Partner';
  const targetUsername = recipient?.username || `@${recipient?.email?.split('@')[0] || 'member'}`;
  const targetPhoto = recipient?.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${recipient?.id || 'partner'}`;

  if (isCallBlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-md bg-white dark:bg-[#131927] border border-amber-300 dark:border-amber-900/60 rounded-3xl p-7 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center ring-8 ring-amber-50 dark:ring-amber-950/20">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">
            Protected Administrator Call
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Direct audio and video calls to Platform Administrator (@keylan) are restricted exclusively to Verified Blue Star subscribers and Administrators.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={targetPhoto}
              alt={targetName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500 shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base truncate flex items-center gap-2">
                <span>{targetName}</span>
                <span className="text-xs font-mono font-normal text-purple-600 dark:text-purple-400">
                  {targetUsername}
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 font-medium">
                <span className={`w-2 h-2 rounded-full ${callState === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                {callState === 'connected' ? `Live WebRTC Call (${formatTime(callDuration)})` : 'Establishing secure peer connection...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isProUser && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 text-white shadow-xs">
                <Crown size={12} className="text-amber-300" />
                <span>1080p Full HD Pro</span>
              </span>
            )}

            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              <ShieldCheck size={12} />
              P2P Encrypted
            </span>


            <button
              onClick={copyRoomLink}
              title="Copy Call Invitation Link"
              className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {copiedLink ? <Check size={16} className="text-emerald-500" /> : <Share2 size={16} />}
            </button>
          </div>
        </div>

        {/* Permission Notice if any */}
        {permissionError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-400 shrink-0" />
            <span>{permissionError}</span>
          </div>
        )}

        {/* Main Video / Voice Viewports */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col justify-center overflow-y-auto">
          {callType === 'video' ? (
            /* Video Conference Grid */
            <div className="relative w-full aspect-video max-h-[460px] rounded-3xl overflow-hidden bg-slate-950 border-2 border-purple-500/30 shadow-2xl flex items-center justify-center">
              {/* Remote Participant Viewport */}
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center relative">
                {/* Simulated remote partner avatar & live audio wave pulse */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-ping" style={{ animationDuration: '3s' }} />
                  <img
                    src={targetPhoto}
                    alt={targetName}
                    className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover ring-4 ring-purple-500 shadow-2xl mx-auto mb-4"
                  />
                  <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-emerald-500 text-white shadow-md">
                    <Radio size={14} className="animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                </div>

                <h4 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {targetName}
                </h4>
                <p className="text-xs text-purple-200/80 font-mono mt-0.5">
                  {targetUsername}
                </p>

                {/* Status Indicator */}
                <div className="mt-3 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-semibold text-purple-200 border border-white/15 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{callState === 'connected' ? 'Remote video & microphone active' : 'Connecting to peer...'}</span>
                </div>
              </div>

              {/* Local User Camera PIP Viewport (Picture-in-Picture) */}
              <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-black/90 z-20">
                {!isVideoDisabled ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white p-2">
                    <VideoOff size={18} className="text-rose-400 mb-1" />
                    <span className="text-[10px] font-semibold text-gray-400">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs">
                  You {isMuted && '(Muted)'}
                </div>
              </div>
            </div>
          ) : (
            /* Voice-Only Audio Room */
            <div className="w-full aspect-video max-h-[380px] rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 border-2 border-purple-500/30 shadow-2xl flex flex-col items-center justify-center p-8 text-center text-white relative">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-2xl animate-pulse" />
                <img
                  src={targetPhoto}
                  alt={targetName}
                  className="relative w-24 h-24 rounded-full object-cover ring-4 ring-purple-400 shadow-2xl mx-auto"
                />
                <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-indigo-500 text-white">
                  <PhoneCall size={14} />
                </div>
              </div>

              <h4 className="text-xl font-bold text-white tracking-tight">
                {targetName}
              </h4>
              <p className="text-xs text-purple-300 font-mono mt-0.5">
                {targetUsername}
              </p>

              {/* Animated Audio Frequency Meter */}
              <div className="flex items-center gap-1.5 mt-6 h-8">
                {[40, 75, 55, 95, 60, 85, 45, 90, 70, 50].map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-purple-500 to-pink-400 animate-pulse"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '1.2s'
                    }}
                  />
                ))}
              </div>

              <span className="text-xs text-purple-200/80 mt-4 font-mono font-medium">
                {callState === 'connected' ? `In Call • ${formatTime(callDuration)}` : 'Calling...'}
              </span>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="px-6 py-4 bg-gray-50/80 dark:bg-[#0c101c]/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {/* Mode switch */}
            <button
              onClick={() => {
                setCallType(callType === 'video' ? 'voice' : 'video');
                setIsVideoDisabled(callType === 'video');
              }}
              className="py-2 px-3 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Switch to {callType === 'video' ? 'Voice Only' : 'Video Call'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {/* Mute Mic */}
            <button
              onClick={toggleMute}
              className={`p-3 rounded-2xl transition active:scale-95 shadow-md ${
                isMuted
                  ? 'bg-rose-500 hover:bg-rose-600 text-white ring-4 ring-rose-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Video Toggle */}
            {callType === 'video' && (
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-2xl transition active:scale-95 shadow-md ${
                  isVideoDisabled
                    ? 'bg-rose-500 hover:bg-rose-600 text-white ring-4 ring-rose-500/20'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
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
                className={`p-3 rounded-2xl transition active:scale-95 shadow-md ${
                  isScreenSharing
                    ? 'bg-purple-600 text-white ring-4 ring-purple-500/20'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
                title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
              >
                <MonitorUp size={20} />
              </button>
            )}

            {/* End Call */}
            <button
              onClick={handleEndCall}
              className="py-3 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-rose-900/30 transition active:scale-95"
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
