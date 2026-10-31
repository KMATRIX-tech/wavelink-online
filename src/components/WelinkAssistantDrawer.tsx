import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Waves,
  Sparkles,
  X,
  Send,
  Crown,
  Lock,
  MessageSquare,
  Image as ImageIcon,
  Film,
  Mic,
  MicOff,
  Loader2,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowRight,
  Bot,
  Volume2,
} from 'lucide-react';

interface WelinkAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgrade: () => void;
}

type WelinkMode = 'chat' | 'image' | 'video' | 'voice';
type ChatModel = 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
}

const QUICK_PROMPTS = [
  'Give me 5 viral Wave Reel ideas for this week',
  'How do WaveLink Pro, Blue Star & creator tipping work?',
  'Help me write an engaging Notice Board event post',
  'Write 3 catchy captions with hashtags for my next photo',
];

function float32ToPcm16Base64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const WelinkAssistantDrawer: React.FC<WelinkAssistantDrawerProps> = ({
  isOpen,
  onClose,
  onOpenUpgrade,
}) => {
  const { currentUser, userProfile, isProEffective, verifyAndRedeemCoupon } = useAuth();

  const [mode, setMode] = useState<WelinkMode>('chat');
  const [selectedModel, setSelectedModel] = useState<ChatModel>('gemini-3.8-flash');

  // Chat state
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hi ${userProfile?.displayName || currentUser?.displayName || 'Waver'}! I'm WELINK, your WaveLink AI Community Guide. Ask me anything about WaveLink features, brainstorm viral post & reel ideas, or switch tabs above to create images, generate videos, or chat by voice!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Image Studio state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceImageMime, setSourceImageMime] = useState<string>('image/png');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedImageCaption, setGeneratedImageCaption] = useState<string>('');
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video Generator state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedVideoCaption, setGeneratedVideoCaption] = useState<string>('');
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Voice Live API state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Coupon redemption state for Free Users
  const [couponInput, setCouponInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen && mode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, mode]);

  // Cleanup voice session if drawer closes or component unmounts
  useEffect(() => {
    if (!isOpen && isVoiceActive) {
      stopVoiceSession();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const handleSendMessage = async (textOverride?: string) => {
    const promptText = (textOverride ?? chatInput).trim();
    if (!promptText || isChatLoading) return;

    setChatError(null);
    const newUserTurn: ChatTurn = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, newUserTurn];
    setMessages(updatedMessages);
    if (!textOverride) setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/welink/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'WELINK could not process that request.');
      }

      const modelTurn: ChatTurn = {
        id: `model_${Date.now()}`,
        role: 'model',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.model,
      };

      setMessages((prev) => [...prev, modelTurn]);
    } catch (err: any) {
      setChatError(err.message || 'Connection error while talking to WELINK.');
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSourceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim() || isImageLoading) return;

    setIsImageLoading(true);
    setImageError(null);

    try {
      const response = await fetch('/api/welink/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt.trim(),
          imageBase64: sourceImageBase64,
          imageMimeType: sourceImageMime,
          aspectRatio: imageAspectRatio,
          imageSize: '1K',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate image.');
      }

      setGeneratedImageUrl(data.imageUrl);
      setGeneratedImageCaption(data.caption || '');
    } catch (err: any) {
      setImageError(err.message || 'Image generation failed.');
    } finally {
      setIsImageLoading(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPrompt.trim() || isVideoLoading) return;

    setIsVideoLoading(true);
    setVideoError(null);
    setGeneratedVideoUrl(null);

    try {
      const response = await fetch('/api/welink/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt.trim(),
          aspectRatio: videoAspectRatio,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate video.');
      }

      setGeneratedVideoUrl(data.videoUrl);
      setGeneratedVideoCaption(data.caption || '');
    } catch (err: any) {
      setVideoError(err.message || 'Video generation failed.');
    } finally {
      setIsVideoLoading(false);
    }
  };

  const playPcm24kAudio = (base64Data: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;

    const binaryString = window.atob(base64Data);
    const byteLength = binaryString.length;
    const bytes = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const sampleCount = Math.floor(byteLength / 2);
    const audioBuffer = outCtx.createBuffer(1, sampleCount, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);

    for (let i = 0; i < sampleCount; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
  };

  const startVoiceSession = async () => {
    if (isVoiceActive || isVoiceConnecting) return;
    setVoiceError(null);
    setIsVoiceConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/welink/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const base64Audio = float32ToPcm16Base64(e.inputBuffer.getChannelData(0));
            wsRef.current.send(JSON.stringify({ audio: base64Audio }));
          }
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.status === 'connected') {
            setIsVoiceConnecting(false);
            setIsVoiceActive(true);
          }
          if (msg.audio) {
            playPcm24kAudio(msg.audio);
          }
          if (msg.inputTranscript) {
            setVoiceTranscripts((prev) => [
              ...prev.slice(-15),
              { role: 'user', text: msg.inputTranscript },
            ]);
          }
          if (msg.outputTranscript) {
            setVoiceTranscripts((prev) => [
              ...prev.slice(-15),
              { role: 'model', text: msg.outputTranscript },
            ]);
          }
          if (msg.interrupted) {
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          }
          if (msg.error) {
            setVoiceError(msg.error);
            stopVoiceSession();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setVoiceError('Live voice connection interrupted.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        setIsVoiceActive(false);
        setIsVoiceConnecting(false);
      };
    } catch (err: any) {
      setVoiceError(err.message || 'Microphone access is required for WELINK Live Voice.');
      setIsVoiceConnecting(false);
      stopVoiceSession();
    }
  };

  const stopVoiceSession = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    activeSourcesRef.current = [];
    setIsVoiceActive(false);
    setIsVoiceConnecting(false);
  };

  const handleRedeemCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim() || isRedeeming) return;

    setIsRedeeming(true);
    setCouponMessage(null);

    try {
      const success = await verifyAndRedeemCoupon(couponInput.trim());
      if (success) {
        setCouponMessage({
          type: 'success',
          text: 'WaveLink Pro Pass activated! Unlocking WELINK AI...',
        });
        setCouponInput('');
      } else {
        setCouponMessage({
          type: 'error',
          text: 'Invalid or expired coupon code. Please check your code and try again.',
        });
      }
    } catch (err: any) {
      setCouponMessage({
        type: 'error',
        text: err.message || 'Could not verify coupon pass.',
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <aside className="relative z-10 w-full max-w-md sm:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-slide-left">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#2563eb] via-[#3B82F6] to-[#10B981] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-xs shadow-inner flex items-center justify-center">
              <Waves size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-lg tracking-tight leading-none">
                  WELINK AI
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-300 text-slate-900 shadow-2xs">
                  <Crown size={10} />
                  Pro Exclusive
                </span>
              </div>
              <p className="text-xs text-blue-50 font-medium mt-1">
                Your WaveLink Community Guide & Creative Studio
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition"
            title="Close WELINK"
          >
            <X size={18} />
          </button>
        </div>

        {/* Access Control Gate: Strict Pro Check */}
        {!isProEffective ? (
          <div className="flex-1 overflow-y-auto p-6 bg-[#F8FAFC] flex flex-col justify-between">
            <div className="space-y-5">
              {/* Friendly Invite Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#2563eb] to-[#10B981] text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                  <Sparkles size={30} />
                </div>

                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-[#2563eb] border border-blue-200">
                    <Lock size={12} />
                    WaveLink Pro Feature
                  </span>
                  <h3 className="text-xl font-extrabold text-[#0F172A]">
                    Unlock WELINK AI Assistant
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Meet <strong className="text-[#0F172A]">WELINK</strong> — your personal community guide, viral content strategist, and multimodal creative studio built exclusively for WaveLink Pro members.
                  </p>
                </div>

                {/* Feature Highlights */}
                <div className="grid grid-cols-1 gap-2.5 text-left pt-2">
                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200/70">
                    <div className="p-2 rounded-xl bg-blue-100 text-[#2563eb] shrink-0">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-[#0F172A]">
                        24/7 Community Guide & Content Coach
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Get instant answers about WaveLink, viral Reel scripts, captions, and event ideas.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200/70">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                      <ImageIcon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-[#0F172A]">
                        WELINK Image Studio & Video Lab
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Create & edit custom graphics or generate HD clips for your Wave Feed & Reels.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200/70">
                    <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                      <Mic size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-[#0F172A]">
                        Real-Time Voice Conversations
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Speak naturally with WELINK Live for hands-free brainstorming and platform support.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenUpgrade();
                  }}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 text-white font-extrabold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition active:scale-98"
                >
                  <Crown size={17} className="text-amber-200" />
                  <span>Upgrade to WaveLink Pro (18,000 TZS)</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Direct Official Coupon Pass Activation */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-[#0F172A]">
                  <KeyRound size={16} className="text-[#2563eb]" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider">
                    Have an Official Pro Pass Code?
                  </h4>
                </div>
                <p className="text-xs text-slate-500">
                  Enter your official coupon code below to activate your pass.
                </p>

                <form onSubmit={handleRedeemCoupon} className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Enter official coupon code..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs font-bold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                  <button
                    type="submit"
                    disabled={isRedeeming || !couponInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-extrabold transition shrink-0 flex items-center gap-1.5"
                  >
                    {isRedeeming ? <Loader2 size={14} className="animate-spin" /> : null}
                    <span>Activate</span>
                  </button>
                </form>

                {couponMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      couponMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {couponMessage.type === 'success' ? (
                      <CheckCircle2 size={15} className="shrink-0" />
                    ) : (
                      <AlertCircle size={15} className="shrink-0" />
                    )}
                    <span>{couponMessage.text}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 text-center text-[11px] text-slate-400 font-medium">
              WaveLink Pro • Supporting community creators across Tanzania & beyond
            </div>
          </div>
        ) : (
          /* Pro User Authenticated View */
          <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC]">
            {/* Mode Navigation Tabs */}
            <div className="px-3 pt-3 pb-2 bg-white border-b border-slate-200/80 flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setMode('chat')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                  mode === 'chat'
                    ? 'bg-[#2563eb] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MessageSquare size={14} />
                <span>Chat Guide</span>
              </button>

              <button
                onClick={() => setMode('image')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                  mode === 'image'
                    ? 'bg-[#2563eb] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ImageIcon size={14} />
                <span>Images</span>
              </button>

              <button
                onClick={() => setMode('video')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                  mode === 'video'
                    ? 'bg-[#2563eb] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Film size={14} />
                <span>Video</span>
              </button>

              <button
                onClick={() => setMode('voice')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                  mode === 'voice'
                    ? 'bg-[#10B981] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Mic size={14} />
                <span>Live Voice</span>
              </button>
            </div>

            {/* TAB 1: MULTI-TURN CHAT GUIDE */}
            {mode === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Model Selector Bar */}
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200/70 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-slate-500 flex items-center gap-1">
                    <Bot size={13} className="text-[#2563eb]" />
                    WELINK Engine:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedModel('gemini-3.1-flash-lite')}
                      className={`px-2 py-1 rounded-lg font-bold transition ${
                        selectedModel === 'gemini-3.1-flash-lite'
                          ? 'bg-blue-100 text-[#2563eb]'
                          : 'text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      Fast Lite
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedModel('gemini-3.8-flash')}
                      className={`px-2 py-1 rounded-lg font-bold transition ${
                        selectedModel === 'gemini-3.8-flash'
                          ? 'bg-blue-100 text-[#2563eb]'
                          : 'text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      Flash 3.8
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedModel('gemini-4-argon')}
                      className={`px-2 py-1 rounded-lg font-bold transition ${
                        selectedModel === 'gemini-4-argon'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      Pro Argon
                    </button>
                  </div>
                </div>

                {/* Messages Scroll Thread */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((turn) => (
                    <div
                      key={turn.id}
                      className={`flex ${
                        turn.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                          turn.role === 'user'
                            ? 'bg-[#2563eb] text-white rounded-br-xs'
                            : 'bg-white text-[#0F172A] border border-slate-200/90 rounded-bl-xs'
                        }`}
                      >
                        {turn.role === 'model' && (
                          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-extrabold text-[#2563eb] uppercase tracking-wider">
                            <Waves size={11} />
                            <span>WELINK Guide</span>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{turn.text}</div>
                        <div
                          className={`text-[10px] mt-1.5 text-right ${
                            turn.role === 'user' ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          {turn.timestamp}
                        </div>
                      </div>
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200/90 rounded-2xl rounded-bl-xs px-4 py-3 flex items-center gap-2 text-xs font-bold text-slate-600 shadow-2xs">
                        <Loader2 size={14} className="animate-spin text-[#2563eb]" />
                        <span>WELINK is thinking...</span>
                      </div>
                    </div>
                  )}

                  {chatError && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{chatError}</span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Quick Starter Prompts */}
                {messages.length <= 2 && (
                  <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSendMessage(q)}
                        className="shrink-0 px-3 py-1.5 rounded-full bg-white hover:bg-blue-50 text-[#0F172A] hover:text-[#2563eb] border border-slate-200 text-[11px] font-bold transition shadow-2xs"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="p-3 bg-white border-t border-slate-200/90 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask WELINK about WaveLink or content ideas..."
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="p-2.5 rounded-2xl bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50 text-white transition shadow-xs"
                    title="Send to WELINK"
                  >
                    <Send size={17} />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: CREATE & EDIT IMAGES (gemini-nano-banana-2.1) */}
            {mode === 'image' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#0F172A]">
                        WELINK Image Studio
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Create custom visuals or upload an image to edit with AI
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#2563eb] border border-blue-200">
                      Nano Banana 2.1
                    </span>
                  </div>

                  {/* Optional Reference Image Upload */}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleSourceImageUpload}
                      className="hidden"
                    />
                    {!sourceImageBase64 ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#2563eb] bg-[#F8FAFC] text-xs font-bold text-slate-600 hover:text-[#2563eb] flex items-center justify-center gap-2 transition"
                      >
                        <Upload size={15} />
                        <span>Optional: Upload a photo to edit or restyle</span>
                      </button>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={sourceImageBase64}
                            alt="Source preview"
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200"
                          />
                          <div>
                            <div className="text-xs font-extrabold text-[#0F172A]">
                              Reference Image Attached
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Describe how WELINK should edit this image
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSourceImageBase64(null)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="Remove reference image"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 mr-1">
                      Ratio:
                    </span>
                    {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setImageAspectRatio(ratio)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition ${
                          imageAspectRatio === ratio
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleGenerateImage} className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder={
                        sourceImageBase64
                          ? 'Describe your edit (e.g., Add a warm golden sunset background)...'
                          : 'Describe the image you want to create for your Wave Feed...'
                      }
                      className="w-full p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                    />
                    <button
                      type="submit"
                      disabled={isImageLoading || !imagePrompt.trim()}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      {isImageLoading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Generating with WELINK Image Studio...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} />
                          <span>{sourceImageBase64 ? 'Edit Image' : 'Create Image'}</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {imageError && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}

                {generatedImageUrl && (
                  <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                    <img
                      src={generatedImageUrl}
                      alt="Generated by WELINK"
                      className="w-full rounded-2xl object-contain max-h-80 bg-slate-50 border border-slate-100"
                    />
                    {generatedImageCaption && (
                      <p className="text-xs text-slate-600">{generatedImageCaption}</p>
                    )}
                    <a
                      href={generatedImageUrl}
                      download={`welink-image-${Date.now()}.png`}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition"
                    >
                      <Download size={14} />
                      <span>Download Image</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: GENERATE VIDEO (gemini-omni-1.1-flash) */}
            {mode === 'video' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#0F172A]">
                        WELINK Video Lab
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Generate 720p videos from text prompts for Wave Reels
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Omni Flash
                    </span>
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVideoAspectRatio('16:9')}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold border transition ${
                        videoAspectRatio === '16:9'
                          ? 'bg-[#2563eb] text-white border-[#2563eb]'
                          : 'bg-[#F8FAFC] text-slate-600 border-slate-200'
                      }`}
                    >
                      16:9 Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoAspectRatio('9:16')}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold border transition ${
                        videoAspectRatio === '9:16'
                          ? 'bg-[#2563eb] text-white border-[#2563eb]'
                          : 'bg-[#F8FAFC] text-slate-600 border-slate-200'
                      }`}
                    >
                      9:16 Vertical Reel
                    </button>
                  </div>

                  <form onSubmit={handleGenerateVideo} className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      placeholder="Describe the video scene (e.g., Aerial sunset flight over Dar es Salaam coastline with warm cinematic lighting)..."
                      className="w-full p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                    />
                    <button
                      type="submit"
                      disabled={isVideoLoading || !videoPrompt.trim()}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      {isVideoLoading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Rendering 720p Video (may take ~20-40s)...</span>
                        </>
                      ) : (
                        <>
                          <Film size={15} />
                          <span>Generate Video Clip</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {videoError && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{videoError}</span>
                  </div>
                )}

                {generatedVideoUrl && (
                  <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full rounded-2xl max-h-80 bg-slate-900"
                    />
                    {generatedVideoCaption && (
                      <p className="text-xs text-slate-600">{generatedVideoCaption}</p>
                    )}
                    <a
                      href={generatedVideoUrl}
                      download={`welink-video-${Date.now()}.mp4`}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition"
                    >
                      <Download size={14} />
                      <span>Download MP4 Video</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: LIVE VOICE CONVERSATION (gemini-3.8-live) */}
            {mode === 'voice' && (
              <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center space-y-5">
                  <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                    {isVoiceActive && (
                      <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
                    )}
                    <div
                      className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition ${
                        isVoiceActive
                          ? 'bg-gradient-to-tr from-[#10B981] to-[#2563eb] text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isVoiceActive ? <Volume2 size={32} /> : <Mic size={32} />}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-[#0F172A]">
                      {isVoiceActive
                        ? 'WELINK Live Voice Active'
                        : isVoiceConnecting
                        ? 'Connecting to WELINK Live...'
                        : 'Talk with WELINK Live'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      {isVoiceActive
                        ? 'Speak naturally into your microphone. WELINK is listening and will reply in real time.'
                        : 'Start a real-time voice conversation with WELINK for instant community guidance and brainstorming.'}
                    </p>
                  </div>

                  {!isVoiceActive ? (
                    <button
                      type="button"
                      onClick={startVoiceSession}
                      disabled={isVoiceConnecting}
                      className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#10B981] to-[#2563eb] hover:opacity-95 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition"
                    >
                      {isVoiceConnecting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Starting Live Session...</span>
                        </>
                      ) : (
                        <>
                          <Mic size={16} />
                          <span>Start Voice Conversation</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopVoiceSession}
                      className="w-full py-3.5 px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <MicOff size={16} />
                      <span>End Voice Session</span>
                    </button>
                  )}

                  {voiceError && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 text-left">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{voiceError}</span>
                    </div>
                  )}
                </div>

                {/* Live Transcripts */}
                {voiceTranscripts.length > 0 && (
                  <div className="mt-4 bg-white rounded-3xl p-4 border border-slate-200/90 max-h-56 overflow-y-auto space-y-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Live Voice Transcript
                    </div>
                    {voiceTranscripts.map((item, idx) => (
                      <div key={idx} className="text-xs">
                        <span
                          className={`font-extrabold mr-1.5 ${
                            item.role === 'user' ? 'text-[#2563eb]' : 'text-emerald-600'
                          }`}
                        >
                          {item.role === 'user' ? 'You:' : 'WELINK:'}
                        </span>
                        <span className="text-slate-700">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
