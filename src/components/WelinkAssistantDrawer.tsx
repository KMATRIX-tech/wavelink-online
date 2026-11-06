import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import {
  Waves,
  Sparkles,
  X,
  Send,
  MessageSquare,
  Image as ImageIcon,
  Mic,
  MicOff,
  Loader2,
  Download,
  Upload,
  Trash2,
  AlertCircle,
  Bot,
  Volume2,
  VolumeX,
  PhoneCall,
  PhoneOff,
  Radio,
  Zap,
  RotateCcw,
  Lightbulb,
} from 'lucide-react';
import {
  sendWelinkChatMessage,
  sendWelinkChatMessageStream,
  generateWelinkImage,
  getWelinkLiveVoiceWsUrl,
  sendWelinkVoiceTurn,
} from '../services/geminiService';
import {
  buildWelinkCacheKey,
  getCachedWelinkResponse,
  findCachedResponseByPrompt,
  setCachedWelinkResponse,
  loadDrawerThreadFromCache,
  saveDrawerThreadToCache,
  clearDrawerThreadCache,
  CachedWelinkResponse,
} from '../services/welinkCache';
import {
  detectUpgradeIdea,
  recordUpgradeFeedback,
} from '../services/upgradeFeedbackService';

export type WelinkMode = 'chat' | 'image' | 'voice';

interface WelinkAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgrade: () => void;
  initialMode?: WelinkMode;
}

type ChatModel = 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';
export type WelinkVoicePersona = 'Zephyr' | 'Kore' | 'Puck' | 'Fenrir';

const VOICE_PERSONAS: { id: WelinkVoicePersona; label: string; desc: string; pitch: number; rate: number }[] = [
  { id: 'Zephyr', label: 'Zephyr', desc: 'Warm & Calm', pitch: 1.02, rate: 1.0 },
  { id: 'Kore', label: 'Kore', desc: 'Friendly & Clear', pitch: 1.1, rate: 1.03 },
  { id: 'Puck', label: 'Puck', desc: 'Upbeat & Creative', pitch: 1.06, rate: 1.06 },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Deep & Steady', pitch: 0.9, rate: 0.97 },
];

const LIVE_VOICE_STARTERS = [
  'Hey WELINK, I have an upgrade idea for WaveLink',
  'Hey WELINK, give me 3 viral reel ideas!',
  'How do I grow my followers on WaveLink?',
  'Explain WaveLink Pro and Blue Star perks',
  'Help me brainstorm a caption for my Spark',
];

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  fromCache?: boolean;
}

const QUICK_PROMPTS = [
  '💡 I want to suggest an upgrade to improve WaveLink',
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
  initialMode,
}) => {
  const { currentUser, userProfile, isProEffective } = useAuth();

  const [mode, setMode] = useState<WelinkMode>(initialMode || 'chat');
  const [selectedModel, setSelectedModel] = useState<ChatModel>('gemini-3.8-flash');

  useEffect(() => {
    if (isOpen && initialMode) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Strictly scoped user namespace for WELINK Assistant drawer cache
  const userScope = currentUser?.uid || userProfile?.email || 'guest';

  const getWelcomeTurn = (): ChatTurn => ({
    id: 'welcome',
    role: 'model',
    text: `Hi **${userProfile?.displayName || currentUser?.displayName || 'Friend'}**! I'm **WELINK**, your WaveLink AI Community Guide.\n\n* Ask me anything about WaveLink features\n* Brainstorm post captions and reel ideas\n* Switch tabs above to create AI images or talk live by voice!`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  // Chat state (strictly isolated to WelinkAssistantDrawer)
  const [messages, setMessages] = useState<ChatTurn[]>(() => [getWelcomeTurn()]);
  const [chatInput, setChatInput] = useState('');
  const [debouncedChatInput, setDebouncedChatInput] = useState('');
  const [instantCacheHit, setInstantCacheHit] = useState<CachedWelinkResponse | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmitTimeRef = useRef<number>(0);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const isDrawerOpenRef = useRef<boolean>(isOpen);
  const hasHydratedThreadRef = useRef<string>('');

  // Image Studio state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceImageMime, setSourceImageMime] = useState<string>('image/png');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedImageCaption, setGeneratedImageCaption] = useState<string>('');
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [tryProNote, setTryProNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Live Talking state
  const [selectedVoice, setSelectedVoice] = useState<WelinkVoicePersona>('Zephyr');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isWelinkSpeaking, setIsWelinkSpeaking] = useState(false);
  const [isWelinkThinkingVoice, setIsWelinkThinkingVoice] = useState(false);
  const [userAudioLevel, setUserAudioLevel] = useState(0);
  const [liveInterimText, setLiveInterimText] = useState('');
  const [voiceQuickInput, setVoiceQuickInput] = useState('');
  const [voiceCallSeconds, setVoiceCallSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<{ role: 'user' | 'model'; text: string; time?: string }[]>([]);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);

  // Refs for audio & websocket callbacks to prevent stale closures
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const isMicMutedRef = useRef<boolean>(false);
  const isSpeakerMutedRef = useRef<boolean>(false);
  const isVoiceActiveRef = useRef<boolean>(false);
  const bridgeModeRef = useRef<'native_live' | 'hybrid'>('hybrid');
  const selectedVoiceRef = useRef<WelinkVoicePersona>('Zephyr');
  const voiceTranscriptsRef = useRef<{ role: 'user' | 'model'; text: string }[]>([]);
  const lastLevelUpdateRef = useRef<number>(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
    if (isSpeakerMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsWelinkSpeaking(false);
    }
  }, [isSpeakerMuted]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    voiceTranscriptsRef.current = voiceTranscripts;
    if (mode === 'voice') {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [voiceTranscripts, mode]);

  useEffect(() => {
    if (!isVoiceActive) {
      setVoiceCallSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setVoiceCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isVoiceActive]);

  useEffect(() => {
    if (isOpen && mode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, mode]);

  useEffect(() => {
    isDrawerOpenRef.current = isOpen;
    if (!isOpen) {
      if (isVoiceActive) {
        stopVoiceSession();
      }
      // Abort any in-flight chat stream when drawer closes so state never leaks
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
        chatAbortControllerRef.current = null;
      }
      if (inputDebounceTimerRef.current) {
        clearTimeout(inputDebounceTimerRef.current);
        inputDebounceTimerRef.current = null;
      }
      setIsChatLoading(false);
      setHasReceivedFirstChunk(false);
    }
  }, [isOpen]);

  // Hydrate isolated drawer conversation thread from IndexedDB when opened
  useEffect(() => {
    if (!isOpen || hasHydratedThreadRef.current === userScope) return;
    let cancelled = false;
    loadDrawerThreadFromCache(userScope).then((cachedTurns) => {
      if (cancelled || !isDrawerOpenRef.current) return;
      hasHydratedThreadRef.current = userScope;
      if (cachedTurns && cachedTurns.length > 0) {
        setMessages(cachedTurns);
      } else {
        setMessages([getWelcomeTurn()]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, userScope]);

  // Persist isolated drawer conversation thread to IndexedDB when messages update
  useEffect(() => {
    if (!isOpen || messages.length <= 1) return;
    void saveDrawerThreadToCache(userScope, messages);
  }, [messages, isOpen, userScope]);

  // Debounced input lookup against IndexedDB for instant cache preview (<5ms)
  useEffect(() => {
    let active = true;
    const trimmed = debouncedChatInput.trim();
    if (trimmed.length < 3) {
      setInstantCacheHit(null);
      return;
    }
    findCachedResponseByPrompt(userScope, selectedModel, trimmed).then((hit) => {
      if (active && isDrawerOpenRef.current) {
        setInstantCacheHit(hit);
      }
    });
    return () => {
      active = false;
    };
  }, [debouncedChatInput, userScope, selectedModel]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
        chatAbortControllerRef.current = null;
      }
      if (inputDebounceTimerRef.current) {
        clearTimeout(inputDebounceTimerRef.current);
        inputDebounceTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Debounced chat input handler:
   * Immediately updates the controlled input for responsive typing while debouncing
   * normalization & IndexedDB cache lookups by 220ms to avoid unnecessary re-renders.
   */
  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setChatInput(nextValue);

    if (inputDebounceTimerRef.current) {
      clearTimeout(inputDebounceTimerRef.current);
    }
    if (!nextValue.trim()) {
      setDebouncedChatInput('');
      setInstantCacheHit(null);
      return;
    }
    inputDebounceTimerRef.current = setTimeout(() => {
      if (isDrawerOpenRef.current) {
        setDebouncedChatInput(nextValue);
      }
    }, 220);
  };

  const handleClearDrawerChat = async () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    setIsChatLoading(false);
    setHasReceivedFirstChunk(false);
    setChatError(null);
    setInstantCacheHit(null);
    const freshWelcome = getWelcomeTurn();
    setMessages([freshWelcome]);
    await clearDrawerThreadCache(userScope);
  };

  const handleSendMessage = async (textOverride?: string) => {
    const promptText = (textOverride ?? chatInput).trim();
    if (!promptText || isChatLoading) return;

    // Debounce rapid duplicate submissions within 350ms
    const nowMs = Date.now();
    if (nowMs - lastSubmitTimeRef.current < 350) return;
    lastSubmitTimeRef.current = nowMs;

    if (inputDebounceTimerRef.current) {
      clearTimeout(inputDebounceTimerRef.current);
      inputDebounceTimerRef.current = null;
    }

    setChatError(null);
    setInstantCacheHit(null);
    setDebouncedChatInput('');

    const nowTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newUserTurn: ChatTurn = {
      id: `user_${nowMs}`,
      role: 'user',
      text: promptText,
      timestamp: nowTimestamp,
    };

    const previousUserTurns = messages.filter((m) => m.role === 'user');
    const lastUserText = previousUserTurns[previousUserTurns.length - 1]?.text;
    const exactCacheKey = buildWelinkCacheKey(userScope, selectedModel, promptText, lastUserText);
    const promptOnlyKey = buildWelinkCacheKey(userScope, selectedModel, promptText);

    const updatedMessages = [...messages, newUserTurn];
    setMessages(updatedMessages);
    if (!textOverride) setChatInput('');

    // Check if the user is sharing an upgrade suggestion or platform improvement idea
    const detectedUpgrade = detectUpgradeIdea(promptText);
    if (detectedUpgrade) {
      void recordUpgradeFeedback({
        source: 'welink_ai',
        title: detectedUpgrade.title,
        summary: detectedUpgrade.summary,
        userQuote: promptText,
        category: detectedUpgrade.category,
        impact: detectedUpgrade.impact,
        userId: currentUser?.uid,
        userName: userProfile?.displayName || currentUser?.displayName || 'WaveLink Member',
        userEmail: userProfile?.email || currentUser?.email || undefined,
      }).then(() => {
        setUpgradeNotice(`💡 Upgrade suggestion "${detectedUpgrade.title}" captured for Founder Keylan!`);
        setTimeout(() => setUpgradeNotice(null), 5000);
      });
    }

    // 1. Only use instant cache if there is no prior conversation history (so multi-turn context is always preserved)
    if (previousUserTurns.length === 0) {
      const cachedHit =
        (await getCachedWelinkResponse(exactCacheKey)) ||
        (await getCachedWelinkResponse(promptOnlyKey));

      if (cachedHit && cachedHit.reply) {
        if (!isDrawerOpenRef.current) return;
        const cachedTurn: ChatTurn = {
          id: `model_${Date.now()}`,
          role: 'model',
          text: cachedHit.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: cachedHit.model || selectedModel,
          fromCache: true,
        };
        setMessages((prev) => [...prev, cachedTurn]);
        return;
      }
    }

    setIsChatLoading(true);
    setHasReceivedFirstChunk(false);

    // Send full recent conversation history (up to 20 turns) so the AI remembers context
    const apiHistory = updatedMessages
      .filter((m) => m.id !== 'welcome')
      .slice(-20)
      .map((m) => ({
        role: m.role,
        text: m.text,
      }));

    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    const modelTurnId = `model_${Date.now()}`;
    let accumulatedText = '';

    try {
      const streamRes = await sendWelinkChatMessageStream({
        model: selectedModel,
        messages: apiHistory,
        signal: controller.signal,
        onChunk: (chunkText) => {
          if (!isDrawerOpenRef.current || controller.signal.aborted) return;
          accumulatedText += chunkText;
          setHasReceivedFirstChunk(true);
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === modelTurnId);
            if (exists) {
              return prev.map((m) =>
                m.id === modelTurnId ? { ...m, text: accumulatedText } : m
              );
            }
            return [
              ...prev,
              {
                id: modelTurnId,
                role: 'model',
                text: accumulatedText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                modelUsed: selectedModel,
              },
            ];
          });
        },
      });

      const finalReply = (accumulatedText || streamRes.fullText || '').trim();
      if (finalReply && isDrawerOpenRef.current && !controller.signal.aborted && previousUserTurns.length === 0) {
        void setCachedWelinkResponse({
          key: exactCacheKey,
          userScope,
          prompt: promptText,
          reply: finalReply,
          model: streamRes.model || selectedModel,
        });
      }
    } catch (streamErr: any) {
      if (controller.signal.aborted || !isDrawerOpenRef.current) {
        return;
      }
      if (accumulatedText) {
        setChatError(null);
      } else {
        try {
          const data = await sendWelinkChatMessage({
            model: selectedModel,
            messages: apiHistory,
            signal: controller.signal,
          });
          if (!isDrawerOpenRef.current || controller.signal.aborted) return;

          const modelTurn: ChatTurn = {
            id: modelTurnId,
            role: 'model',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelUsed: data.model,
          };

          setMessages((prev) => [...prev, modelTurn]);
          void setCachedWelinkResponse({
            key: exactCacheKey,
            userScope,
            prompt: promptText,
            reply: data.reply,
            model: data.model || selectedModel,
          });
        } catch (fallbackErr: any) {
          if (controller.signal.aborted || !isDrawerOpenRef.current) return;
          setChatError(
            fallbackErr.message ||
              streamErr.message ||
              'WELINK Chat is taking a quick breather. Please try again in a moment.'
          );
        }
      }
    } finally {
      if (chatAbortControllerRef.current === controller) {
        chatAbortControllerRef.current = null;
      }
      if (isDrawerOpenRef.current) {
        setIsChatLoading(false);
        setHasReceivedFirstChunk(false);
      }
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyCountKey = `wavelink_ai_img_count_${todayKey}`;
  const usedTodayCount = Number(localStorage.getItem(dailyCountKey) || '0');
  const freeDailyLimit = 1;
  const proDailyLimit = 25;
  const canGenerateToday = isProEffective ? usedTodayCount < proDailyLimit : usedTodayCount < freeDailyLimit;

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim() || isImageLoading) return;

    setImageError(null);
    setTryProNote(null);

    if (!canGenerateToday) {
      if (!isProEffective) {
        setTryProNote(
          "You've enjoyed your 1 free AI image for today! Try Pro in your Profile for more daily AI image creations."
        );
      } else {
        setImageError("You've reached today's image limit. Please try again tomorrow!");
      }
      return;
    }

    setIsImageLoading(true);

    try {
      const data = await generateWelinkImage({
        prompt: imagePrompt.trim(),
        imageBase64: sourceImageBase64,
        imageMimeType: sourceImageMime,
        aspectRatio: imageAspectRatio,
        imageSize: '1K',
      });

      setGeneratedImageUrl(data.imageUrl);
      setGeneratedImageCaption(data.caption || '');

      localStorage.setItem(dailyCountKey, String(usedTodayCount + 1));
    } catch (err: any) {
      setImageError(err.message || 'Image creation is resting right now, please try again later.');
    } finally {
      setIsImageLoading(false);
    }
  };

  const speakWithBrowserVoice = (rawText: string) => {
    if (isSpeakerMutedRef.current) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const cleanSpeech = rawText
      .replace(/[*#_`~>]+/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();
    if (!cleanSpeech) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      const persona = VOICE_PERSONAS.find((p) => p.id === selectedVoiceRef.current) || VOICE_PERSONAS[0];
      utterance.pitch = persona.pitch;
      utterance.rate = persona.rate;

      const voices = window.speechSynthesis.getVoices();
      const englishVoice =
        voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onstart = () => setIsWelinkSpeaking(true);
      utterance.onend = () => setIsWelinkSpeaking(false);
      utterance.onerror = () => setIsWelinkSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch {
      setIsWelinkSpeaking(false);
    }
  };

  const interruptWelinkSpeech = () => {
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsWelinkSpeaking(false);
  };

  const playPcm24kAudio = (base64Data: string) => {
    if (isSpeakerMutedRef.current) return;
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
    setIsWelinkSpeaking(true);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsWelinkSpeaking(false);
      }
    };
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
  };

  const handleSendSpokenTurn = async (spokenText: string) => {
    const cleanText = spokenText.trim();
    if (!cleanText) return;

    interruptWelinkSpeech();
    setLiveInterimText('');
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setVoiceTranscripts((prev) => [
      ...prev.slice(-20),
      { role: 'user', text: cleanText, time: nowTime },
    ]);

    // Check if the user is sharing an upgrade suggestion or platform improvement idea via voice
    const detectedUpgrade = detectUpgradeIdea(cleanText);
    if (detectedUpgrade) {
      void recordUpgradeFeedback({
        source: 'live_talk',
        title: detectedUpgrade.title,
        summary: detectedUpgrade.summary,
        userQuote: cleanText,
        category: detectedUpgrade.category,
        impact: detectedUpgrade.impact,
        userId: currentUser?.uid,
        userName: userProfile?.displayName || currentUser?.displayName || 'WaveLink Member',
        userEmail: userProfile?.email || currentUser?.email || undefined,
      }).then(() => {
        setUpgradeNotice(`💡 Live voice upgrade "${detectedUpgrade.title}" captured for Founder Keylan!`);
        setTimeout(() => setUpgradeNotice(null), 5000);
      });
    }

    // If WebSocket is open in native or hybrid mode, send via WebSocket first
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsWelinkThinkingVoice(true);
      wsRef.current.send(
        JSON.stringify({
          speechText: cleanText,
          forceHybrid: bridgeModeRef.current === 'hybrid',
        })
      );
      return;
    }

    // Direct REST voice-turn fallback so Live Talking always responds even without WebSocket
    setIsWelinkThinkingVoice(true);
    try {
      const history = voiceTranscriptsRef.current.slice(-8).map((t) => ({
        role: t.role,
        text: t.text,
      }));
      const res = await sendWelinkVoiceTurn({
        transcript: cleanText,
        history,
      });
      setVoiceTranscripts((prev) => [
        ...prev.slice(-20),
        {
          role: 'model',
          text: res.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      speakWithBrowserVoice(res.spokenText || res.reply);
    } catch {
      // ignore
    } finally {
      setIsWelinkThinkingVoice(false);
    }
  };

  const startBrowserSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        if (isMicMutedRef.current) return;
        let interim = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim.trim()) {
          setLiveInterimText(interim.trim());
        }

        if (finalTranscript.trim()) {
          setLiveInterimText('');
          const spoken = finalTranscript.trim();
          if (bridgeModeRef.current === 'hybrid' || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            handleSendSpokenTurn(spoken);
          } else {
            // In native_live mode, show the user's transcript immediately as well
            setVoiceTranscripts((prev) => [
              ...prev.slice(-20),
              {
                role: 'user',
                text: spoken,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          }
        }
      };

      recognition.onerror = () => {
        // Keep session active even if browser speech recognition pauses
      };

      recognition.onend = () => {
        if (isVoiceActiveRef.current && !isMicMutedRef.current) {
          try {
            recognition.start();
          } catch {
            // ignore restart error
          }
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      // Browser speech recognition optional
    }
  };

  const startVoiceSession = async () => {
    if (isVoiceActive || isVoiceConnecting) return;
    setVoiceError(null);
    setIsVoiceConnecting(true);
    setIsMicMuted(false);
    isMicMutedRef.current = false;

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;
    } catch {
      // If microphone hardware is unavailable in preview iframe, continue in interactive Live Voice Bridge mode
      stream = null;
    }

    startBrowserSpeechRecognition();

    try {
      const wsUrl = getWelinkLiveVoiceWsUrl(selectedVoice);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (stream && inputAudioCtxRef.current) {
          const inputCtx = inputAudioCtxRef.current;
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (isMicMutedRef.current) {
              setUserAudioLevel(0);
              return;
            }
            const channelData = e.inputBuffer.getChannelData(0);

            // Compute RMS audio level for live voice orb animation
            const now = Date.now();
            if (now - lastLevelUpdateRef.current > 90) {
              let sum = 0;
              for (let i = 0; i < channelData.length; i += 4) {
                sum += channelData[i] * channelData[i];
              }
              const rms = Math.sqrt(sum / (channelData.length / 4));
              const normalizedLevel = Math.min(100, Math.round(rms * 420));
              setUserAudioLevel(normalizedLevel);
              lastLevelUpdateRef.current = now;
            }

            if (wsRef.current?.readyState === WebSocket.OPEN && bridgeModeRef.current === 'native_live') {
              const base64Audio = float32ToPcm16Base64(channelData);
              wsRef.current.send(JSON.stringify({ audio: base64Audio }));
            }
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.status === 'connected') {
            bridgeModeRef.current = msg.bridgeMode === 'native_live' ? 'native_live' : 'hybrid';
            setIsVoiceConnecting(false);
            setIsVoiceActive(true);
            isVoiceActiveRef.current = true;

            // Greet user on initial connection if transcript is empty
            if (voiceTranscriptsRef.current.length === 0) {
              const userName = userProfile?.displayName?.split(' ')[0] || currentUser?.displayName?.split(' ')[0] || 'Friend';
              const greeting = `Hi ${userName}! I'm WELINK, live and ready to talk. Ask me anything about WaveLink, content ideas, or community growth!`;
              setVoiceTranscripts([
                {
                  role: 'model',
                  text: greeting,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
              if (bridgeModeRef.current === 'hybrid') {
                speakWithBrowserVoice(greeting);
              }
            }
          }
          if (msg.audio) {
            setIsWelinkThinkingVoice(false);
            playPcm24kAudio(msg.audio);
          }
          if (msg.inputTranscript) {
            setLiveInterimText('');
            const spoken = String(msg.inputTranscript).trim();
            setVoiceTranscripts((prev) => [
              ...prev.slice(-20),
              {
                role: 'user',
                text: spoken,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);

            const detectedUpgrade = detectUpgradeIdea(spoken);
            if (detectedUpgrade) {
              void recordUpgradeFeedback({
                source: 'live_talk',
                title: detectedUpgrade.title,
                summary: detectedUpgrade.summary,
                userQuote: spoken,
                category: detectedUpgrade.category,
                impact: detectedUpgrade.impact,
                userId: currentUser?.uid,
                userName: userProfile?.displayName || currentUser?.displayName || 'WaveLink Member',
                userEmail: userProfile?.email || currentUser?.email || undefined,
              }).then(() => {
                setUpgradeNotice(`💡 Live voice upgrade "${detectedUpgrade.title}" captured for Founder Keylan!`);
                setTimeout(() => setUpgradeNotice(null), 5000);
              });
            }
          }
          if (msg.outputTranscript) {
            setIsWelinkThinkingVoice(false);
            setVoiceTranscripts((prev) => [
              ...prev.slice(-20),
              {
                role: 'model',
                text: msg.outputTranscript,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
            if (msg.speakAloud) {
              speakWithBrowserVoice(msg.outputTranscript);
            }
          }
          if (msg.interrupted) {
            interruptWelinkSpeech();
          }
          if (msg.error) {
            // Switch to hybrid mode rather than dropping the call
            bridgeModeRef.current = 'hybrid';
            setIsVoiceConnecting(false);
            setIsVoiceActive(true);
            isVoiceActiveRef.current = true;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Fallback to direct voice turn mode so the user can still talk live
        bridgeModeRef.current = 'hybrid';
        setIsVoiceConnecting(false);
        setIsVoiceActive(true);
        isVoiceActiveRef.current = true;
      };

      ws.onclose = () => {
        if (!isVoiceActiveRef.current) {
          setIsVoiceConnecting(false);
        }
      };
    } catch {
      bridgeModeRef.current = 'hybrid';
      setIsVoiceConnecting(false);
      setIsVoiceActive(true);
      isVoiceActiveRef.current = true;
    }
  };

  const stopVoiceSession = () => {
    isVoiceActiveRef.current = false;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    activeSourcesRef.current = [];
    setUserAudioLevel(0);
    setLiveInterimText('');
    setIsWelinkSpeaking(false);
    setIsWelinkThinkingVoice(false);
    setIsVoiceActive(false);
    setIsVoiceConnecting(false);
  };

  const formatCallDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <aside className="relative z-10 w-full max-w-md sm:max-w-lg bg-[var(--bg-surface,#FFFFFF)] h-full shadow-2xl border-l border-[var(--border-hairline,#EFECE6)] flex flex-col overflow-hidden animate-slide-left">
        {/* Calm Warm Header */}
        <div className="px-5 py-4 bg-[var(--bg-surface,#FFFFFF)] border-b border-[var(--border-hairline,#EFECE6)] text-[var(--text-primary,#1C1917)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-primary,#2563EB)] text-white flex items-center justify-center shadow-xs">
              <Waves size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base tracking-tight text-[var(--text-primary,#1C1917)] leading-none">
                  WELINK AI
                </h2>
                {isProEffective && (
                  <span className="text-[10px] font-bold text-[#0D9488] bg-[#CCFBF1] px-2 py-0.5 rounded-full">
                    Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary,#78716C)] mt-0.5">
                Community Guide &amp; Image Studio
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] hover:bg-[var(--bg-canvas,#FAF7F2)] transition active:scale-95"
            title="Close WELINK"
            aria-label="Close WELINK"
          >
            <X size={20} />
          </button>
        </div>

        {/* Upgrade Suggestion Recorded Notification Banner */}
        {upgradeNotice && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white text-xs font-bold flex items-center justify-between gap-2 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-200 shrink-0" />
              <span>{upgradeNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setUpgradeNotice(null)}
              className="text-white/80 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-white/20 transition"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-canvas,#FAF7F2)]">
          {/* Mode Navigation Tabs (Chat Guide, Images, Live Voice) */}
          <div className="px-3 pt-3 pb-2 bg-[var(--bg-surface,#FFFFFF)] border-b border-[var(--border-hairline,#EFECE6)] flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`flex-1 min-h-[44px] py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                mode === 'chat'
                  ? 'bg-[var(--accent-primary,#2563EB)] text-white shadow-xs'
                  : 'text-[var(--text-secondary,#78716C)] hover:bg-[var(--bg-canvas,#FAF7F2)] hover:text-[var(--text-primary,#1C1917)]'
              }`}
            >
              <MessageSquare size={15} />
              <span>Chat Guide</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('image')}
              className={`flex-1 min-h-[44px] py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                mode === 'image'
                  ? 'bg-[var(--accent-primary,#2563EB)] text-white shadow-xs'
                  : 'text-[var(--text-secondary,#78716C)] hover:bg-[var(--bg-canvas,#FAF7F2)] hover:text-[var(--text-primary,#1C1917)]'
              }`}
            >
              <ImageIcon size={15} />
              <span>Images</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('voice')}
              className={`flex-1 min-h-[44px] py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                mode === 'voice'
                  ? 'bg-[#0D9488] text-white shadow-xs'
                  : 'text-[var(--text-secondary,#78716C)] hover:bg-[var(--bg-canvas,#FAF7F2)] hover:text-[var(--text-primary,#1C1917)]'
              }`}
            >
              <Mic size={15} />
              <span>Live Voice</span>
            </button>
          </div>

          {/* TAB 1: MULTI-TURN CHAT GUIDE (Rendered with react-markdown) */}
          {mode === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Model Selector Bar */}
              <div className="px-4 py-2 bg-[var(--bg-subtle,#F5F1EA)] border-b border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[var(--text-secondary,#78716C)] flex items-center gap-1">
                  <Bot size={13} className="text-[var(--accent-primary,#2563EB)]" />
                  WELINK Style:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-3.1-flash-lite')}
                    className={`px-2.5 py-1 rounded-xl font-bold transition ${
                      selectedModel === 'gemini-3.1-flash-lite'
                        ? 'bg-white text-[var(--accent-primary,#2563EB)] shadow-2xs'
                        : 'text-[var(--text-secondary,#78716C)] hover:bg-white/60'
                    }`}
                  >
                    Quick
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-3.8-flash')}
                    className={`px-2.5 py-1 rounded-xl font-bold transition ${
                      selectedModel === 'gemini-3.8-flash'
                        ? 'bg-white text-[var(--accent-primary,#2563EB)] shadow-2xs'
                        : 'text-[var(--text-secondary,#78716C)] hover:bg-white/60'
                    }`}
                  >
                    Balanced
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-4-argon')}
                    className={`px-2.5 py-1 rounded-xl font-bold transition ${
                      selectedModel === 'gemini-4-argon'
                        ? 'bg-white text-[#0D9488] shadow-2xs'
                        : 'text-[var(--text-secondary,#78716C)] hover:bg-white/60'
                    }`}
                  >
                    Deep
                  </button>
                  {messages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearDrawerChat}
                      className="ml-1 px-2 py-1 rounded-xl text-[var(--text-secondary,#78716C)] hover:text-rose-600 hover:bg-white/60 font-bold flex items-center gap-1 transition"
                      title="Reset WELINK drawer conversation"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Scroll Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                        turn.role === 'user'
                          ? 'bg-[var(--accent-primary,#2563EB)] text-white rounded-br-sm'
                          : 'bg-white text-[var(--text-primary,#1C1917)] border border-[var(--border-hairline,#EFECE6)] rounded-bl-sm'
                      }`}
                    >
                      {turn.role === 'model' && (
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] font-extrabold text-[var(--accent-primary,#2563EB)] uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <Waves size={12} />
                            <span>WELINK Guide</span>
                          </span>
                          {turn.fromCache && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-50 text-[#0D9488] text-[9px] font-bold normal-case tracking-normal border border-teal-200/70"
                              title="Served instantly from local IndexedDB cache"
                            >
                              <Zap size={9} />
                              <span>Instant</span>
                            </span>
                          )}
                        </div>
                      )}

                      {turn.role === 'model' ? (
                        <div className="prose prose-sm max-w-none text-[var(--text-primary,#1C1917)] [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-extrabold [&_strong]:text-[var(--text-primary,#1C1917)]">
                          <ReactMarkdown>{turn.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{turn.text}</div>
                      )}

                      <div
                        className={`text-[10px] mt-1.5 text-right ${
                          turn.role === 'user' ? 'text-blue-100' : 'text-[var(--text-secondary,#78716C)]'
                        }`}
                      >
                        {turn.timestamp}
                      </div>
                    </div>
                  </div>
                ))}

                {isChatLoading && !hasReceivedFirstChunk && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-[var(--border-hairline,#EFECE6)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs font-bold text-[var(--text-secondary,#78716C)] shadow-2xs">
                      <Loader2 size={14} className="animate-spin text-[var(--accent-primary,#2563EB)]" />
                      <span>WELINK is thinking...</span>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0 text-amber-600" />
                    <span>{chatError}</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Instant IndexedDB Cache Match Bar (from debounced input) */}
              {instantCacheHit && chatInput.trim().length >= 3 && !isChatLoading && (
                <div className="px-4 pb-1.5">
                  <button
                    type="button"
                    onClick={() => handleSendMessage(chatInput)}
                    className="w-full px-3 py-1.5 rounded-xl bg-teal-50/90 hover:bg-teal-100/80 border border-teal-200/80 text-[#0D9488] text-[11px] font-bold flex items-center justify-between gap-2 transition"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Zap size={12} className="shrink-0" />
                      <span className="truncate">Instant cached answer ready — press Enter or tap to view</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold shrink-0">
                      0ms
                    </span>
                  </button>
                </div>
              )}

              {/* Quick Starter Prompts */}
              {messages.length <= 2 && (
                <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSendMessage(q)}
                      className="shrink-0 px-3.5 py-2 rounded-full bg-white hover:bg-blue-50 text-[var(--text-primary,#1C1917)] hover:text-[var(--accent-primary,#2563EB)] border border-[var(--border-hairline,#EFECE6)] text-xs font-bold transition shadow-2xs"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Input Bar (Debounced Input + Single Send Button) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 bg-white border-t border-[var(--border-hairline,#EFECE6)] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  placeholder="Ask WELINK anything..."
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-sm text-[var(--text-primary,#1C1917)] placeholder:text-[var(--text-secondary,#78716C)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="min-w-[46px] min-h-[46px] px-4 rounded-2xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
                  title="Send to WELINK"
                >
                  <Send size={17} />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: CREATE & EDIT IMAGES */}
          {mode === 'image' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Daily Image Allowance Note */}
              <div className="p-3.5 rounded-2xl bg-white border border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-2 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#0D9488] shrink-0" />
                  <span className="text-[var(--text-primary,#1C1917)] font-semibold">
                    {isProEffective
                      ? `WaveLink Pro: ${Math.max(0, proDailyLimit - usedTodayCount)} AI images remaining today`
                      : usedTodayCount < freeDailyLimit
                      ? '1 free AI image available today'
                      : "Today's 1 free AI image has been used"}
                  </span>
                </div>
                {!isProEffective && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpgrade();
                    }}
                    className="text-xs font-extrabold text-[var(--accent-primary,#2563EB)] hover:underline shrink-0"
                  >
                    Try Pro
                  </button>
                )}
              </div>

              {/* Gentle Try Pro Note when free user taps after using daily free image */}
              {tryProNote && (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-stone-800 text-xs flex items-center justify-between gap-3">
                  <span>{tryProNote}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpgrade();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 font-extrabold shrink-0 hover:bg-amber-100 transition"
                  >
                    Try Pro
                  </button>
                </div>
              )}

              <div className="bg-white rounded-3xl p-5 border border-[var(--border-hairline,#EFECE6)] shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-[var(--text-primary,#1C1917)]">
                    Create an AI Image
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#78716C)] mt-0.5">
                    Describe what you'd like to see, or attach a photo to restyle.
                  </p>
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
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl border border-dashed border-[var(--border-hairline,#EFECE6)] bg-[var(--bg-canvas,#FAF7F2)] text-xs font-bold text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] flex items-center justify-center gap-2 transition"
                    >
                      <Upload size={15} />
                      <span>Optional: Attach a reference photo</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)]">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={sourceImageBase64}
                          alt="Source preview"
                          className="w-11 h-11 rounded-xl object-cover border border-[var(--border-hairline,#EFECE6)]"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-[var(--text-primary,#1C1917)]">
                            Reference Photo Ready
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary,#78716C)]">
                            Describe how to restyle it below
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSourceImageBase64(null)}
                        className="p-2 text-stone-400 hover:text-rose-600 rounded-xl"
                        title="Remove photo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Aspect Ratio Selector */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-[var(--text-secondary,#78716C)] mr-1">
                    Shape:
                  </span>
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImageAspectRatio(ratio)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        imageAspectRatio === ratio
                          ? 'bg-[var(--accent-primary,#2563EB)] text-white'
                          : 'bg-[var(--bg-canvas,#FAF7F2)] text-[var(--text-secondary,#78716C)]'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>

                {/* Form with ONE main action button */}
                <form onSubmit={handleGenerateImage} className="space-y-3">
                  <textarea
                    rows={3}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="e.g., A warm golden sunrise over Zanzibar beach with dhows..."
                    className="w-full p-3.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-sm text-[var(--text-primary,#1C1917)] placeholder:text-[var(--text-secondary,#78716C)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)]"
                  />
                  <button
                    type="submit"
                    disabled={isImageLoading || !imagePrompt.trim()}
                    className="w-full min-h-[48px] py-3 rounded-2xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 disabled:opacity-40 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
                  >
                    {isImageLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Creating your image...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Create Image</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {imageError && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-bold flex items-center gap-2.5">
                  <AlertCircle size={17} className="shrink-0 text-amber-600" />
                  <span>{imageError}</span>
                </div>
              )}

              {generatedImageUrl && (
                <div className="bg-white rounded-3xl p-4 border border-[var(--border-hairline,#EFECE6)] shadow-xs space-y-3">
                  <img
                    src={generatedImageUrl}
                    alt="Created with WELINK"
                    className="w-full rounded-2xl object-contain max-h-80 bg-[var(--bg-canvas,#FAF7F2)]"
                  />
                  {generatedImageCaption && (
                    <p className="text-xs text-[var(--text-secondary,#78716C)]">{generatedImageCaption}</p>
                  )}
                  <a
                    href={generatedImageUrl}
                    download={`wavelink-image-${Date.now()}.png`}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] hover:bg-[var(--bg-subtle,#F5F1EA)] text-[var(--text-primary,#1C1917)] border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <Download size={14} />
                    <span>Save Image</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE VOICE CONVERSATION (USER <-> WELINK LIVE TALKING) */}
          {mode === 'voice' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Top Voice Persona Bar */}
              <div className="px-4 py-2.5 bg-[var(--bg-subtle,#F5F1EA)] border-b border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-secondary,#78716C)]">
                  <Radio size={13} className="text-[#0D9488]" />
                  <span>WELINK Voice:</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {VOICE_PERSONAS.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => {
                        setSelectedVoice(persona.id);
                        if (isVoiceActive) {
                          speakWithBrowserVoice(`Switched to ${persona.label} voice.`);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition whitespace-nowrap ${
                        selectedVoice === persona.id
                          ? 'bg-[#0D9488] text-white shadow-2xs'
                          : 'bg-white/70 text-[var(--text-secondary,#78716C)] hover:bg-white'
                      }`}
                      title={persona.desc}
                    >
                      {persona.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Scrollable Live Talking Stage */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Interactive Live Talking Visualizer Card */}
                <div className="bg-white rounded-3xl p-5 border border-[var(--border-hairline,#EFECE6)] text-center space-y-4 shadow-xs relative overflow-hidden">
                  {/* Live Status Pill & Timer */}
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-extrabold ${
                        isVoiceActive
                          ? 'bg-teal-50 text-[#0D9488] border border-teal-200'
                          : 'bg-stone-100 text-[#78716C]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isVoiceActive ? 'bg-[#0D9488] animate-ping' : 'bg-stone-400'
                        }`}
                      />
                      <span>
                        {isVoiceActive
                          ? isMicMuted
                            ? 'Mic Muted'
                            : isWelinkSpeaking
                            ? 'WELINK Speaking'
                            : 'Live & Listening'
                          : 'Ready to Talk'}
                      </span>
                    </span>

                    {isVoiceActive && (
                      <span className="font-mono font-bold text-xs text-[#78716C] bg-[var(--bg-canvas,#FAF7F2)] px-2.5 py-1 rounded-xl border border-[var(--border-hairline,#EFECE6)]">
                        {formatCallDuration(voiceCallSeconds)}
                      </span>
                    )}
                  </div>

                  {/* Animated Dual Avatar / Voice Orb Stage */}
                  <div className="py-2 flex items-center justify-center gap-6">
                    {/* User Avatar Node */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-all duration-150 ${
                          isVoiceActive && !isMicMuted && userAudioLevel > 8
                            ? 'border-[#2563EB] ring-4 ring-blue-100 scale-105'
                            : 'border-[var(--border-hairline,#EFECE6)]'
                        }`}
                      >
                        <img
                          src={
                            userProfile?.photoURL ||
                            currentUser?.photoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                          }
                          alt="You"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-[11px] font-bold text-[#1C1917]">You</span>
                    </div>

                    {/* Central Live Waveform / Connection Bridge */}
                    <div className="flex items-center gap-1 h-12 px-2">
                      {[0, 1, 2, 3, 4].map((barIdx) => {
                        const activeHeight = isWelinkSpeaking
                          ? 18 + ((barIdx * 11) % 22)
                          : isVoiceActive && !isMicMuted
                          ? Math.max(8, Math.min(40, Math.round((userAudioLevel * (barIdx + 2)) / 5)))
                          : 8;
                        return (
                          <span
                            key={barIdx}
                            style={{ height: `${activeHeight}px` }}
                            className={`w-1.5 rounded-full transition-all duration-150 ${
                              isWelinkSpeaking
                                ? 'bg-[#0D9488] animate-pulse'
                                : isVoiceActive && !isMicMuted && userAudioLevel > 5
                                ? 'bg-[#2563EB]'
                                : 'bg-stone-200'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* WELINK AI Voice Orb */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                          isWelinkSpeaking
                            ? 'bg-gradient-to-tr from-[#0D9488] to-[#2563EB] text-white ring-6 ring-[#CCFBF1] scale-110'
                            : isVoiceActive
                            ? 'bg-[#0D9488] text-white ring-4 ring-teal-50'
                            : 'bg-[var(--bg-canvas,#FAF7F2)] text-[#0D9488] border border-[var(--border-hairline,#EFECE6)]'
                        }`}
                      >
                        {isWelinkSpeaking ? <Volume2 size={24} className="animate-bounce" /> : <Waves size={24} />}
                      </div>
                      <span className="text-[11px] font-bold text-[#0D9488]">
                        WELINK ({selectedVoice})
                      </span>
                    </div>
                  </div>

                  {/* Status Headline & Subtitle */}
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-primary,#1C1917)]">
                      {isWelinkSpeaking
                        ? 'WELINK is talking to you...'
                        : isWelinkThinkingVoice
                        ? 'WELINK is thinking...'
                        : isVoiceActive
                        ? isMicMuted
                          ? 'Microphone is muted'
                          : 'Listening to your voice...'
                        : isVoiceConnecting
                        ? 'Connecting Live Voice...'
                        : 'Talk Live with WELINK'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary,#78716C)] max-w-xs mx-auto mt-1 leading-relaxed">
                      {isVoiceActive
                        ? 'Speak naturally into your mic, or tap a topic below to talk with WELINK in real time.'
                        : 'Start a live two-way voice conversation with WELINK for instant ideas, advice, and community help.'}
                    </p>
                  </div>

                  {/* Live Interim Speech Bubble while user is speaking */}
                  {liveInterimText && (
                    <div className="p-2.5 rounded-2xl bg-blue-50/90 border border-blue-200 text-xs text-[#1E40AF] font-semibold animate-fade-in">
                      <span className="font-extrabold">Hearing you: </span>
                      <span>&ldquo;{liveInterimText}...&rdquo;</span>
                    </div>
                  )}

                  {/* Secondary Call Controls (Mute Mic, Mute Speaker, Interrupt) when active */}
                  {isVoiceActive && (
                    <div className="flex items-center justify-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsMicMuted((prev) => !prev)}
                        className={`min-h-[42px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 border transition ${
                          isMicMuted
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-[var(--bg-canvas,#FAF7F2)] text-[#1C1917] border-[var(--border-hairline,#EFECE6)] hover:bg-stone-100'
                        }`}
                      >
                        {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
                        <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsSpeakerMuted((prev) => !prev)}
                        className={`min-h-[42px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 border transition ${
                          isSpeakerMuted
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-[var(--bg-canvas,#FAF7F2)] text-[#1C1917] border-[var(--border-hairline,#EFECE6)] hover:bg-stone-100'
                        }`}
                      >
                        {isSpeakerMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        <span>{isSpeakerMuted ? 'Speaker Off' : 'Speaker On'}</span>
                      </button>

                      {isWelinkSpeaking && (
                        <button
                          type="button"
                          onClick={interruptWelinkSpeech}
                          className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200 text-xs font-extrabold hover:bg-teal-100 transition"
                        >
                          Stop Speaking
                        </button>
                      )}
                    </div>
                  )}

                  {voiceError && (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2 text-left">
                      <AlertCircle size={15} className="shrink-0 text-amber-600" />
                      <span>{voiceError}</span>
                    </div>
                  )}

                  {/* Primary Call Action Button */}
                  {!isVoiceActive ? (
                    <button
                      type="button"
                      onClick={startVoiceSession}
                      disabled={isVoiceConnecting}
                      className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[#0D9488] hover:opacity-95 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
                    >
                      {isVoiceConnecting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Connecting Live Voice...</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall size={18} />
                          <span>Start Live Talking with WELINK</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopVoiceSession}
                      className="w-full min-h-[48px] py-3 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
                    >
                      <PhoneOff size={17} />
                      <span>End Live Voice Call</span>
                    </button>
                  )}
                </div>

                {/* Quick Voice Conversation Starters (Tap to say out loud to WELINK) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary,#78716C)]">
                      Tap a topic to talk out loud with WELINK
                    </span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {LIVE_VOICE_STARTERS.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={async () => {
                          if (!isVoiceActive && !isVoiceConnecting) {
                            await startVoiceSession();
                          }
                          handleSendSpokenTurn(topic);
                        }}
                        className="shrink-0 px-3.5 py-2 rounded-2xl bg-white hover:bg-teal-50 text-[var(--text-primary,#1C1917)] hover:text-[#0D9488] border border-[var(--border-hairline,#EFECE6)] text-xs font-bold transition shadow-2xs"
                      >
                        🎙️ {topic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Two-Way Voice Transcript History */}
                {voiceTranscripts.length > 0 && (
                  <div className="bg-white rounded-3xl p-4 border border-[var(--border-hairline,#EFECE6)] shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[var(--text-primary,#1C1917)]">
                        Live Voice Transcript
                      </span>
                      <button
                        type="button"
                        onClick={() => setVoiceTranscripts([])}
                        className="text-[11px] font-bold text-[var(--text-secondary,#78716C)] hover:text-rose-600"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-2.5 pr-1">
                      {voiceTranscripts.map((t, i) => (
                        <div
                          key={i}
                          className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              t.role === 'user'
                                ? 'bg-[#2563EB] text-white rounded-br-xs'
                                : 'bg-[var(--bg-canvas,#FAF7F2)] text-[var(--text-primary,#1C1917)] border border-[var(--border-hairline,#EFECE6)] rounded-bl-xs'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span
                                className={`font-extrabold text-[10px] uppercase tracking-wider ${
                                  t.role === 'user' ? 'text-blue-100' : 'text-[#0D9488]'
                                }`}
                              >
                                {t.role === 'user' ? 'You (Voice)' : `WELINK (${selectedVoice})`}
                              </span>
                              {t.role === 'model' && (
                                <button
                                  type="button"
                                  onClick={() => speakWithBrowserVoice(t.text)}
                                  className="text-[10px] font-bold text-[#0D9488] hover:underline flex items-center gap-0.5"
                                  title="Replay voice aloud"
                                >
                                  <Volume2 size={11} />
                                  <span>Speak</span>
                                </button>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap">{t.text}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Voice-or-Type Input Bar so users can also speak a phrase by typing during a call */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const text = voiceQuickInput.trim();
                  if (!text) return;
                  setVoiceQuickInput('');
                  if (!isVoiceActive && !isVoiceConnecting) {
                    await startVoiceSession();
                  }
                  handleSendSpokenTurn(text);
                }}
                className="p-3 bg-white border-t border-[var(--border-hairline,#EFECE6)] flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={voiceQuickInput}
                  onChange={(e) => setVoiceQuickInput(e.target.value)}
                  placeholder="Or type something for WELINK to answer out loud..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-xs sm:text-sm text-[var(--text-primary,#1C1917)] placeholder:text-[var(--text-secondary,#78716C)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                />
                <button
                  type="submit"
                  disabled={!voiceQuickInput.trim() || isWelinkThinkingVoice}
                  className="min-w-[44px] min-h-[44px] px-3.5 rounded-2xl bg-[#0D9488] hover:opacity-95 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1 transition shadow-xs"
                  title="Send & Speak Aloud"
                >
                  <Volume2 size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
