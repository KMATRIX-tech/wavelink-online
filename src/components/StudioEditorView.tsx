import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  db,
  auth,
  cleanFirestoreData,
  sanitizeAvatarUrlForFirestore,
  formatVideoUploadError,
  handleFirestoreError,
  OperationType,
  getCachedUserProfile,
} from '../firebase';
import { uploadImageToCloudinary } from '../utils/mediaStorage';
import {
  enqueueVideoUploadJob,
  clearFailedVideoAndStudioDrafts,
} from '../services/videoUploadQueue';
import { savePostDocument } from '../services/postService';
import { SongSelectorModal } from './SongSelectorModal';
import { useBottomSheetLock } from '../utils/sheetLock';
import { OnlineSong, Post } from '../types';
import {
  getHydratedRoyaltyFreeTracks,
  playAudioWithVoiceEffect,
  resolvePlayableAudioUrl,
  VoiceEffectType,
  RoyaltyFreeTrack,
} from '../utils/creatorStudioAudio';
import {
  Sparkles,
  Upload,
  Video,
  Image as ImageIcon,
  Wand2,
  Send,
  Loader2,
  CheckCircle2,
  Sliders,
  Type,
  Sun,
  Contrast,
  RotateCcw,
  Check,
  Music,
  X,
  Plus,
  Trash2,
  Move,
  Palette,
  Scissors,
  Play,
  Pause,
  Camera,
  Hash,
  AtSign,
  Eye,
  Bookmark,
  Globe,
  Users,
  Lock,
  MapPin,
  MessageSquare,
  Maximize2,
  ArrowLeft,
  Crown,
  Layers,
  FlipHorizontal,
  Timer,
  Undo2,
  Redo2,
  Gauge,
  Smile,
  Subtitles,
  Mic,
  Volume2,
  SplitSquareHorizontal,
  LayoutTemplate,
  RotateCw,
  ZoomIn,
  ShieldCheck,
  ScissorsLineDashed,
  Sparkle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface StudioEditorViewProps {
  onNavigateToFeed?: () => void;
}

type AspectRatioPreset = '9:16' | '4:5' | '1:1';
type AudienceOption = 'public' | 'followers' | 'close_friends';
type CreatorStep = 1 | 2 | 3;
type EditorToolTab =
  | 'trim'
  | 'speed'
  | 'text'
  | 'stickers'
  | 'filters'
  | 'captions'
  | 'voice'
  | 'music'
  | 'duet_templates';

type TextFontStyle = 'sans' | 'display' | 'serif' | 'mono' | 'impact';
type TextBgStyle = 'glass_dark' | 'solid_blue' | 'solid_amber' | 'solid_rose' | 'outline_only';
type TextAnimationType = 'none' | 'pop' | 'bounce' | 'pulse' | 'slide';

interface TextOverlayItem {
  id: string;
  text: string;
  x: number; // percentage 10..90
  y: number; // percentage 10..90
  color: string;
  bgStyle: TextBgStyle;
  fontStyle: TextFontStyle;
  scale: number; // 0.6 to 2.4
  rotation: number; // -180 to 180 degrees
  animation: TextAnimationType;
  startTime: number; // seconds
  endTime: number; // seconds
}

type StickerKind = 'emoji' | 'shape' | 'label' | 'photo_cutout';
type CutoutShape = 'circle' | 'squircle' | 'heart' | 'star';

interface StickerOverlayItem {
  id: string;
  kind: StickerKind;
  content: string; // emoji char, shape id, label text, or image dataUrl
  labelBg?: string;
  cutoutShape?: CutoutShape;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface ClipSegment {
  id: string;
  start: number;
  end: number;
  speed: number;
}

export type CaptionStylePreset = 'classic' | 'yellow_pop' | 'neon' | 'minimal';

interface CaptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export type DuetLayoutMode = 'none' | 'side_by_side' | 'top_bottom' | 'pip_behind';

interface DuetTargetWave {
  id: string;
  authorName: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

export type ComedyTemplateId = 'none' | 'split_screen' | 'before_after' | 'countdown' | 'pov_meme';

interface EditorHistorySnapshot {
  trimStart: number;
  trimEnd: number;
  segments: ClipSegment[];
  playbackSpeed: number;
  speedScope: 'whole' | 'range';
  speedRangeStart: number;
  speedRangeEnd: number;
  filterPreset: string;
  brightness: number;
  contrast: number;
  saturation: number;
  overlays: TextOverlayItem[];
  stickers: StickerOverlayItem[];
  captions: CaptionSegment[];
  captionStyle: CaptionStylePreset;
  duetLayout: DuetLayoutMode;
  comedyTemplate: ComedyTemplateId;
  templateTopLabel: string;
  templateBottomLabel: string;
  originalAudioVolume: number;
  songVolume: number;
  voiceEffect: VoiceEffectType;
}

const FILTER_PRESETS = [
  { id: 'none', name: 'Natural', filter: 'none', badge: 'Original' },
  { id: 'golden', name: 'Golden Hour', filter: 'sepia(0.28) saturate(1.45) brightness(1.06)', badge: 'Warm' },
  { id: 'cyber', name: 'Cyber Teal', filter: 'hue-rotate(165deg) saturate(1.35) contrast(1.12)', badge: 'Neon' },
  { id: 'vintage', name: 'Vintage Film', filter: 'sepia(0.45) contrast(0.95) brightness(1.04)', badge: 'Retro' },
  { id: 'noir', name: 'Crisp B&W', filter: 'grayscale(1) contrast(1.25)', badge: 'Mono' },
  { id: 'peach', name: 'Warm Peach', filter: 'sepia(0.18) saturate(1.3) hue-rotate(-10deg) brightness(1.05)', badge: 'Soft' },
  { id: 'vivid', name: 'Vivid Pop', filter: 'saturate(1.65) contrast(1.1)', badge: 'Pop' },
  { id: 'cinema', name: 'Cool Cinema', filter: 'contrast(1.18) saturate(0.9) hue-rotate(12deg)', badge: 'Film' },
];

const TEXT_COLORS = [
  { id: '#FFFFFF', label: 'White' },
  { id: '#FACC15', label: 'Sun Yellow' },
  { id: '#38BDF8', label: 'Sky Blue' },
  { id: '#F43F5E', label: 'Coral Rose' },
  { id: '#34D399', label: 'Mint Green' },
  { id: '#A855F7', label: 'Electric Purple' },
];

const TEXT_BG_STYLES: { id: TextBgStyle; label: string; previewClass: string }[] = [
  { id: 'glass_dark', label: 'Dark Glass', previewClass: 'bg-black/75 text-white border border-white/25' },
  { id: 'solid_blue', label: 'Cobalt Pill', previewClass: 'bg-[#2563EB] text-white border border-blue-300/30' },
  { id: 'solid_amber', label: 'Gold Highlight', previewClass: 'bg-amber-400 text-stone-950 border border-amber-200' },
  { id: 'solid_rose', label: 'Rose Pop', previewClass: 'bg-rose-600 text-white border border-rose-300/30' },
  { id: 'outline_only', label: 'Clean Drop', previewClass: 'bg-transparent text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]' },
];

const TEXT_FONT_STYLES: { id: TextFontStyle; label: string; fontClass: string; canvasFont: string }[] = [
  { id: 'sans', label: 'Modern', fontClass: 'font-sans font-extrabold', canvasFont: '800 30px "Plus Jakarta Sans", sans-serif' },
  { id: 'display', label: 'Bold Studio', fontClass: 'font-display font-black tracking-tight uppercase', canvasFont: '900 32px "Space Grotesk", sans-serif' },
  { id: 'serif', label: 'Editorial', fontClass: 'font-serif italic font-bold', canvasFont: 'italic 700 32px Georgia, serif' },
  { id: 'mono', label: 'Typewriter', fontClass: 'font-mono font-bold tracking-tight', canvasFont: '700 26px "JetBrains Mono", monospace' },
  { id: 'impact', label: 'Meme Classic', fontClass: 'font-black uppercase tracking-wider', canvasFont: '900 34px Impact, sans-serif' },
];

const TEXT_ANIMATIONS: { id: TextAnimationType; label: string; className: string }[] = [
  { id: 'none', label: 'Static', className: '' },
  { id: 'pop', label: 'Pop In', className: 'animate-bounce' },
  { id: 'pulse', label: 'Pulse Glow', className: 'animate-pulse' },
  { id: 'bounce', label: 'Float', className: 'transition-transform duration-500 scale-105' },
  { id: 'slide', label: 'Slide Tilt', className: '-skew-x-6' },
];

const EMOJI_STICKERS = ['🔥', '😂', '😍', '👏', '✨', '🎉', '💯', '🚀', '❤️', '🤣', '🙌', '👀', '🎵', '⚡', '🌟', '🥳'];

const SHAPE_STICKERS = [
  { id: 'star_badge', label: 'Star Burst', symbol: '★', bg: 'bg-amber-400 text-stone-950' },
  { id: 'heart_badge', label: 'Heart Seal', symbol: '♥', bg: 'bg-rose-500 text-white' },
  { id: 'arrow_up', label: 'Swipe Arrow', symbol: '↑', bg: 'bg-[#2563EB] text-white' },
  { id: 'check_seal', label: 'Verified', symbol: '✓', bg: 'bg-emerald-500 text-white' },
];

const LABEL_STICKERS = [
  { text: 'WAIT FOR IT 👀', bg: 'bg-amber-400 text-stone-950' },
  { text: 'NEW WAVE 🌊', bg: 'bg-[#2563EB] text-white' },
  { text: 'POV:', bg: 'bg-stone-900/90 text-white' },
  { text: 'SOUND ON 🔊', bg: 'bg-emerald-500 text-white' },
  { text: 'REAL TALK 💯', bg: 'bg-rose-600 text-white' },
  { text: 'PART 1', bg: 'bg-purple-600 text-white' },
];

const BUILTIN_DUET_WAVES: DuetTargetWave[] = [
  {
    id: 'duet_sample_1',
    authorName: 'Amina K.',
    caption: 'Try Not To Laugh Challenge! React to this beat drop 🔥',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-light-dancing-40033-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&auto=format&fit=crop&q=80',
  },
  {
    id: 'duet_sample_2',
    authorName: 'Baraka Beats',
    caption: 'Open Verse & Duet Challenge — add your reaction beside mine!',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-changing-lights-1240-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
  },
  {
    id: 'duet_sample_3',
    authorName: 'Zuri Comedy',
    caption: 'When Monday hits vs Friday mood 😂 Duet this!',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-Portrait-of-a-woman-in-a-pool-1259-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  },
];

const QUICK_HASHTAGS = [
  '#WaveLink',
  '#CreatorStudio',
  '#ComedySkit',
  '#DuetWithMe',
  '#BeforeAndAfter',
  '#DailyVlog',
  '#GoodVibes',
  '#TrendingNow',
];

const STUDIO_DRAFT_STORAGE_KEY = 'wavelink_creator_studio_draft_v2';
const FREE_MAX_DURATION_SECONDS = 60;
const PRO_MAX_DURATION_SECONDS = 90;

export const StudioEditorView: React.FC<StudioEditorViewProps> = ({ onNavigateToFeed }) => {
  // 3-Step Flow State
  const [step, setStep] = useState<CreatorStep>(1);
  const [activeTool, setActiveTool] = useState<EditorToolTab>('trim');

  // Pro Plan toggle (enforces 60s Free vs 90s Pro on trim & Cloudinary export)
  const [isProCreator, setIsProCreator] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_pro_creator') === 'true';
    } catch {
      return false;
    }
  });
  const maxAllowedSeconds = isProCreator ? PRO_MAX_DURATION_SECONDS : FREE_MAX_DURATION_SECONDS;

  // Step 1: Live Camera & Media Selection State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'video' | 'photo'>('video');
  const [countdownSetting, setCountdownSetting] = useState<0 | 3 | 5 | 10>(0);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [isRecordingCamera, setIsRecordingCamera] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Media Files State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [carouselFiles, setCarouselFiles] = useState<File[]>([]);
  const [carouselPreviewUrls, setCarouselPreviewUrls] = useState<string[]>([]);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>('9:16');

  // Step 2: Trim & Split State
  const [videoDuration, setVideoDuration] = useState<number>(15);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(15);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [segments, setSegments] = useState<ClipSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [customCoverDataUrl, setCustomCoverDataUrl] = useState<string | null>(null);

  // Speed State (0.3x, 0.5x, 1x, 2x, 3x on whole clip or selected range)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [speedScope, setSpeedScope] = useState<'whole' | 'range'>('whole');
  const [speedRangeStart, setSpeedRangeStart] = useState<number>(0);
  const [speedRangeEnd, setSpeedRangeEnd] = useState<number>(5);

  // Text Overlays State
  const [overlays, setOverlays] = useState<TextOverlayItem[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [newOverlayText, setNewOverlayText] = useState('');
  const [draggingItem, setDraggingItem] = useState<{ kind: 'text' | 'sticker'; id: string } | null>(null);
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialAngle: number;
    initialScale: number;
    initialRotation: number;
    targetKind: 'text' | 'sticker';
    targetId: string;
  } | null>(null);

  // Stickers State (Emoji, Shape, Label, Custom Photo Sticker)
  const [stickers, setStickers] = useState<StickerOverlayItem[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [stickerSubTab, setStickerSubTab] = useState<'emoji' | 'shape' | 'label' | 'custom'>('emoji');
  const [customStickerShape, setCustomStickerShape] = useState<CutoutShape>('circle');
  const stickerInputRef = useRef<HTMLInputElement | null>(null);

  // Filters & Adjustments State
  const [filterPreset, setFilterPreset] = useState('none');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Captions State (SpeechRecognition + editable segments + styles)
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStylePreset>('yellow_pop');
  const [isListeningCaptions, setIsListeningCaptions] = useState(false);
  const [captionStatusMsg, setCaptionStatusMsg] = useState<string | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Voiceover & Voice Effects State
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const [voiceoverSeconds, setVoiceoverSeconds] = useState(0);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceEffect, setVoiceEffect] = useState<VoiceEffectType>('none');
  const [voiceoverVolume, setVoiceoverVolume] = useState<number>(100);
  const [originalAudioVolume, setOriginalAudioVolume] = useState<number>(80);
  const [isPlayingVoicePreview, setIsPlayingVoicePreview] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStopRef = useRef<{ stop: () => void } | null>(null);

  // Royalty-Free Music State
  const [royaltyFreeCatalog] = useState<RoyaltyFreeTrack[]>(() => getHydratedRoyaltyFreeTracks());
  const [selectedSong, setSelectedSong] = useState<OnlineSong | null>(null);
  const [songStartTime, setSongStartTime] = useState<number>(0);
  const [songVolume, setSongVolume] = useState<number>(85);
  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const bgMusicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reaction / Duet & Comedy Templates State
  const [duetLayout, setDuetLayout] = useState<DuetLayoutMode>('none');
  const [selectedDuetWave, setSelectedDuetWave] = useState<DuetTargetWave>(BUILTIN_DUET_WAVES[0]);
  const [communityWaves, setCommunityWaves] = useState<DuetTargetWave[]>(BUILTIN_DUET_WAVES);
  const [comedyTemplate, setComedyTemplate] = useState<ComedyTemplateId>('none');
  const [templateTopLabel, setTemplateTopLabel] = useState<string>('BEFORE');
  const [templateBottomLabel, setTemplateBottomLabel] = useState<string>('AFTER');
  const [templateCountdownValue, setTemplateCountdownValue] = useState<number>(3);

  // Undo / Redo & Autosave Drafts State
  const [historyPast, setHistoryPast] = useState<EditorHistorySnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<EditorHistorySnapshot[]>([]);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(false);
  const [isFullPreviewOpen, setIsFullPreviewOpen] = useState<boolean>(false);

  // Step 3: Post Metadata & Export State
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<AudienceOption>('public');
  const [locationTag, setLocationTag] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isHeavyActionLoading, setIsHeavyActionLoading] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('Uploading to Cloudinary...');
  const [canRetryUpload, setCanRetryUpload] = useState<boolean>(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const duetVideoRef = useRef<HTMLVideoElement | null>(null);

  // Clear old failed drafts & fetch real community videos for Reaction/Duet
  useEffect(() => {
    clearFailedVideoAndStudioDrafts();
    setHasSavedDraft(false);

    const fetchFeedVideosForDuet = async () => {
      try {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(12));
        const snap = await getDocs(q);
        const loaded: DuetTargetWave[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, any>;
          if (d.videoUrl && d.mediaType === 'video') {
            loaded.push({
              id: docSnap.id,
              authorName: d.authorName || 'Wave Creator',
              caption: d.caption || 'WaveLink Video',
              videoUrl: d.videoUrl,
              thumbnailUrl: d.thumbnailUrl || d.authorPhotoURL,
            });
          }
        });
        if (loaded.length > 0) {
          setCommunityWaves([...loaded, ...BUILTIN_DUET_WAVES]);
        }
      } catch {
        // Keep built-in duet waves
      }
    };
    fetchFeedVideosForDuet();
  }, []);

  // Create current snapshot for Undo / Redo
  const createCurrentSnapshot = useCallback((): EditorHistorySnapshot => {
    return {
      trimStart,
      trimEnd,
      segments: [...segments],
      playbackSpeed,
      speedScope,
      speedRangeStart,
      speedRangeEnd,
      filterPreset,
      brightness,
      contrast,
      saturation,
      overlays: overlays.map((o) => ({ ...o })),
      stickers: stickers.map((s) => ({ ...s })),
      captions: captions.map((c) => ({ ...c })),
      captionStyle,
      duetLayout,
      comedyTemplate,
      templateTopLabel,
      templateBottomLabel,
      originalAudioVolume,
      songVolume,
      voiceEffect,
    };
  }, [
    trimStart,
    trimEnd,
    segments,
    playbackSpeed,
    speedScope,
    speedRangeStart,
    speedRangeEnd,
    filterPreset,
    brightness,
    contrast,
    saturation,
    overlays,
    stickers,
    captions,
    captionStyle,
    duetLayout,
    comedyTemplate,
    templateTopLabel,
    templateBottomLabel,
    originalAudioVolume,
    songVolume,
    voiceEffect,
  ]);

  const recordUndoSnapshot = useCallback(() => {
    const snap = createCurrentSnapshot();
    setHistoryPast((prev) => [...prev.slice(-19), snap]);
    setHistoryFuture([]);
  }, [createCurrentSnapshot]);

  const applySnapshot = (snap: EditorHistorySnapshot) => {
    setTrimStart(snap.trimStart);
    setTrimEnd(snap.trimEnd);
    setSegments(snap.segments);
    setPlaybackSpeed(snap.playbackSpeed);
    setSpeedScope(snap.speedScope);
    setSpeedRangeStart(snap.speedRangeStart);
    setSpeedRangeEnd(snap.speedRangeEnd);
    setFilterPreset(snap.filterPreset);
    setBrightness(snap.brightness);
    setContrast(snap.contrast);
    setSaturation(snap.saturation);
    setOverlays(snap.overlays);
    setStickers(snap.stickers);
    setCaptions(snap.captions);
    setCaptionStyle(snap.captionStyle);
    setDuetLayout(snap.duetLayout);
    setComedyTemplate(snap.comedyTemplate);
    setTemplateTopLabel(snap.templateTopLabel);
    setTemplateBottomLabel(snap.templateBottomLabel);
    setOriginalAudioVolume(snap.originalAudioVolume);
    setSongVolume(snap.songVolume);
    setVoiceEffect(snap.voiceEffect);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    const current = createCurrentSnapshot();
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [current, ...prev]);
    applySnapshot(previous);
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    const current = createCurrentSnapshot();
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev, current]);
    applySnapshot(next);
  };

  // Automatic Draft Saving every time editor state changes in Step 2 or Step 3
  useEffect(() => {
    if (step === 1 && !caption && overlays.length === 0 && stickers.length === 0) return;
    const timer = window.setTimeout(() => {
      try {
        const draftPayload = {
          caption,
          audience,
          locationTag,
          allowComments,
          aspectRatio,
          filterPreset,
          brightness,
          contrast,
          saturation,
          overlays,
          stickers,
          captions,
          captionStyle,
          playbackSpeed,
          speedScope,
          speedRangeStart,
          speedRangeEnd,
          duetLayout,
          comedyTemplate,
          templateTopLabel,
          templateBottomLabel,
          selectedSong,
          songStartTime,
          songVolume,
          originalAudioVolume,
          voiceEffect,
          savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
        setLastAutosavedAt(draftPayload.savedAt);
        setHasSavedDraft(true);
      } catch {
        // ignore storage quota errors
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    step,
    caption,
    audience,
    locationTag,
    allowComments,
    aspectRatio,
    filterPreset,
    brightness,
    contrast,
    saturation,
    overlays,
    stickers,
    captions,
    captionStyle,
    playbackSpeed,
    speedScope,
    speedRangeStart,
    speedRangeEnd,
    duetLayout,
    comedyTemplate,
    templateTopLabel,
    templateBottomLabel,
    selectedSong,
    songStartTime,
    songVolume,
    originalAudioVolume,
    voiceEffect,
  ]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.caption !== undefined) setCaption(d.caption);
      if (d.audience) setAudience(d.audience);
      if (d.locationTag !== undefined) setLocationTag(d.locationTag);
      if (typeof d.allowComments === 'boolean') setAllowComments(d.allowComments);
      if (d.aspectRatio) setAspectRatio(d.aspectRatio);
      if (d.filterPreset) setFilterPreset(d.filterPreset);
      if (typeof d.brightness === 'number') setBrightness(d.brightness);
      if (typeof d.contrast === 'number') setContrast(d.contrast);
      if (typeof d.saturation === 'number') setSaturation(d.saturation);
      if (Array.isArray(d.overlays)) setOverlays(d.overlays);
      if (Array.isArray(d.stickers)) setStickers(d.stickers);
      if (Array.isArray(d.captions)) setCaptions(d.captions);
      if (d.captionStyle) setCaptionStyle(d.captionStyle);
      if (typeof d.playbackSpeed === 'number') setPlaybackSpeed(d.playbackSpeed);
      if (d.speedScope) setSpeedScope(d.speedScope);
      if (d.duetLayout) setDuetLayout(d.duetLayout);
      if (d.comedyTemplate) setComedyTemplate(d.comedyTemplate);
      if (d.templateTopLabel) setTemplateTopLabel(d.templateTopLabel);
      if (d.templateBottomLabel) setTemplateBottomLabel(d.templateBottomLabel);
      if (d.selectedSong) setSelectedSong(d.selectedSong);
      if (typeof d.songStartTime === 'number') setSongStartTime(d.songStartTime);
      if (typeof d.songVolume === 'number') setSongVolume(d.songVolume);
      if (typeof d.originalAudioVolume === 'number') setOriginalAudioVolume(d.originalAudioVolume);
      if (d.voiceEffect) setVoiceEffect(d.voiceEffect);
      if (previewUrl) {
        setStep(2);
      }
    } catch {
      setErrorMsg('Could not restore draft.');
    }
  };

  // Cleanup camera & audio on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
      if (bgMusicAudioRef.current) {
        bgMusicAudioRef.current.pause();
      }
      if (voiceStopRef.current) {
        voiceStopRef.current.stop();
      }
    };
  }, []);

  // ==========================================
  // STEP 1: LIVE CAMERA + COUNTDOWN + GALLERY
  // ==========================================
  const stopCameraStream = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
    setIsRecordingCamera(false);
  };

  const startCameraStream = async (facing: 'user' | 'environment' = cameraFacing) => {
    setCameraError(null);
    stopCameraStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);
      setCameraFacing(facing);
      window.setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError(
        'Live camera permission was unavailable in this browser frame. Use the quick device camera or file picker below.'
      );
      nativeCameraInputRef.current?.click();
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    if (cameraActive) {
      startCameraStream(nextFacing);
    }
  };

  const runCountdownThen = (callback: () => void) => {
    if (countdownSetting === 0) {
      callback();
      return;
    }
    let remaining = countdownSetting;
    setCountdownRemaining(remaining);
    const interval = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(interval);
        setCountdownRemaining(null);
        callback();
      } else {
        setCountdownRemaining(remaining);
      }
    }, 1000);
  };

  const capturePhotoFromLiveCamera = () => {
    if (!liveVideoRef.current) return;
    const video = liveVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `wavelink_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const url = URL.createObjectURL(file);
        stopCameraStream();
        setSelectedFile(file);
        setPreviewUrl(url);
        setMediaType('image');
        setCarouselFiles([file]);
        setCarouselPreviewUrls([url]);
        setStep(2);
      },
      'image/jpeg',
      0.92
    );
  };

  const beginLiveVideoRecording = () => {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    recordedChunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `wavelink_camera_${Date.now()}.webm`, { type: 'video/webm' });
      const url = URL.createObjectURL(file);
      stopCameraStream();
      setSelectedFile(file);
      setPreviewUrl(url);
      setMediaType('video');
      setCarouselFiles([]);
      setCarouselPreviewUrls([]);
      setStep(2);
    };

    cameraRecorderRef.current = recorder;
    recorder.start(250);
    setIsRecordingCamera(true);
    setRecordingSeconds(0);

    recordTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev + 1 >= maxAllowedSeconds) {
          stopLiveVideoRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopLiveVideoRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      cameraRecorderRef.current.stop();
    }
    setIsRecordingCamera(false);
  };

  const handleCameraShutterPress = () => {
    if (captureMode === 'photo') {
      runCountdownThen(capturePhotoFromLiveCamera);
    } else {
      if (isRecordingCamera) {
        stopLiveVideoRecording();
      } else {
        runCountdownThen(beginLiveVideoRecording);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList) as File[];
    const firstFile = filesArray[0];

    if (firstFile.size > 100 * 1024 * 1024) {
      setErrorMsg('File size must be under 100MB.');
      return;
    }

    setErrorMsg(null);
    stopCameraStream();

    const isVideo = firstFile.type.startsWith('video/');
    if (isVideo) {
      setSelectedFile(firstFile);
      setMediaType('video');
      setCarouselFiles([]);
      setCarouselPreviewUrls([]);
      const url = URL.createObjectURL(firstFile);
      setPreviewUrl(url);
      setTrimStart(0);
      setTrimEnd(maxAllowedSeconds);
      setCustomCoverDataUrl(null);
      setStep(2);
    } else {
      const imageFiles = filesArray.filter((f) => f.type.startsWith('image/')).slice(0, 10);
      const urls = imageFiles.map((f) => URL.createObjectURL(f));
      setSelectedFile(imageFiles[0] || firstFile);
      setMediaType('image');
      setCarouselFiles(imageFiles);
      setCarouselPreviewUrls(urls);
      setActiveCarouselIndex(0);
      setPreviewUrl(urls[0]);
      setVideoDuration(10);
      setTrimStart(0);
      setTrimEnd(10);
      setSegments([{ id: 'seg_default', start: 0, end: 10, speed: 1 }]);
      setStep(2);
    }
  };

  // ==========================================
  // STEP 2: VIDEO PLAYBACK, TRIM, SPLIT & SPEED
  // ==========================================
  const handleVideoLoadedMetadata = () => {
    if (!videoPreviewRef.current) return;
    const dur = Math.max(1, Math.floor(videoPreviewRef.current.duration || 15));
    setVideoDuration(dur);
    const initialEnd = Math.min(dur, maxAllowedSeconds);
    setTrimStart(0);
    setTrimEnd(initialEnd);
    setSpeedRangeStart(0);
    setSpeedRangeEnd(Math.min(5, initialEnd));
    setSegments([{ id: 'seg_1', start: 0, end: initialEnd, speed: 1 }]);
    setSelectedSegmentId('seg_1');
  };

  // Enforce 60s Free / 90s Pro limit whenever plan toggles
  useEffect(() => {
    if (mediaType === 'video' && trimEnd - trimStart > maxAllowedSeconds) {
      setTrimEnd(Math.min(videoDuration, trimStart + maxAllowedSeconds));
    }
  }, [isProCreator, maxAllowedSeconds, mediaType, trimStart, trimEnd, videoDuration]);

  // Dynamic speed & trim loop during video timeUpdate
  const handleVideoTimeUpdate = () => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    const t = vid.currentTime;
    setCurrentVideoTime(t);

    // Loop within [trimStart, trimEnd]
    if (t >= trimEnd || t < trimStart) {
      vid.currentTime = trimStart;
      if (duetVideoRef.current && duetLayout !== 'none') {
        duetVideoRef.current.currentTime = 0;
      }
    }

    // Countdown template ticker (3 - 2 - 1)
    if (comedyTemplate === 'countdown') {
      const elapsed = Math.max(0, t - trimStart);
      const countVal = Math.max(1, 3 - Math.floor(elapsed));
      setTemplateCountdownValue(countVal);
    }

    // Apply speed based on Whole Clip vs Selected Range or Split Segment
    let effectiveSpeed = playbackSpeed;
    if (speedScope === 'range') {
      if (t >= speedRangeStart && t <= speedRangeEnd) {
        effectiveSpeed = playbackSpeed;
      } else {
        effectiveSpeed = 1;
      }
    } else if (segments.length > 1) {
      const activeSeg = segments.find((s) => t >= s.start && t <= s.end);
      if (activeSeg) {
        effectiveSpeed = activeSeg.speed;
      }
    }

    if (Math.abs(vid.playbackRate - effectiveSpeed) > 0.05) {
      vid.playbackRate = effectiveSpeed;
    }
  };

  const toggleVideoPlay = () => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      duetVideoRef.current?.play().catch(() => {});
      setIsVideoPlaying(true);
    } else {
      vid.pause();
      duetVideoRef.current?.pause();
      setIsVideoPlaying(false);
    }
  };

  const splitClipAtPlayhead = () => {
    const splitPoint = Number(currentVideoTime.toFixed(1));
    if (splitPoint <= trimStart + 0.5 || splitPoint >= trimEnd - 0.5) {
      setErrorMsg('Move the playhead inside the clip (away from the very edges) to split.');
      return;
    }
    recordUndoSnapshot();
    setErrorMsg(null);

    const targetIndex = segments.findIndex((s) => splitPoint > s.start && splitPoint < s.end);
    if (targetIndex === -1) return;

    const target = segments[targetIndex];
    const leftSeg: ClipSegment = {
      id: `seg_${Date.now()}_a`,
      start: target.start,
      end: splitPoint,
      speed: target.speed,
    };
    const rightSeg: ClipSegment = {
      id: `seg_${Date.now()}_b`,
      start: splitPoint,
      end: target.end,
      speed: target.speed,
    };

    const nextSegments = [
      ...segments.slice(0, targetIndex),
      leftSeg,
      rightSeg,
      ...segments.slice(targetIndex + 1),
    ];
    setSegments(nextSegments);
    setSelectedSegmentId(rightSeg.id);
  };

  const deleteSelectedSegment = (segId: string) => {
    if (segments.length <= 1) return;
    recordUndoSnapshot();
    const filtered = segments.filter((s) => s.id !== segId);
    setSegments(filtered);
    setTrimStart(filtered[0].start);
    setTrimEnd(filtered[filtered.length - 1].end);
    setSelectedSegmentId(filtered[0].id);
  };

  const captureCurrentFrameAsCover = () => {
    if (!videoPreviewRef.current) return;
    setIsHeavyActionLoading('Capturing cover frame...');
    window.setTimeout(() => {
      try {
        const video = videoPreviewRef.current!;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setCustomCoverDataUrl(canvas.toDataURL('image/jpeg', 0.88));
        }
      } catch {
        // ignore
      } finally {
        setIsHeavyActionLoading(null);
      }
    }, 150);
  };

  // Sync Original Video Audio Volume & Background Royalty-Free Music
  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.volume = Math.max(0, Math.min(1, originalAudioVolume / 100));
    }
  }, [originalAudioVolume, previewUrl]);

  useEffect(() => {
    if (step !== 2 || !selectedSong?.previewUrl) {
      if (bgMusicAudioRef.current) {
        bgMusicAudioRef.current.pause();
      }
      return;
    }
    if (!bgMusicAudioRef.current) {
      bgMusicAudioRef.current = new Audio();
    }
    const audio = bgMusicAudioRef.current;
    const playableSongUrl = resolvePlayableAudioUrl(selectedSong.previewUrl);
    if (audio.src !== playableSongUrl) {
      audio.src = playableSongUrl;
      audio.currentTime = songStartTime;
    }
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, songVolume / 100));
    if (isVideoPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    return () => {
      audio.pause();
    };
  }, [step, selectedSong, songStartTime, songVolume, isVideoPlaying]);

  // ==========================================
  // TEXT & STICKERS: ADD, DRAG, PINCH, ROTATE
  // ==========================================
  const addTextOverlay = () => {
    if (!newOverlayText.trim()) return;
    recordUndoSnapshot();
    const newItem: TextOverlayItem = {
      id: `txt_${Date.now()}`,
      text: newOverlayText.trim(),
      x: 50,
      y: 45,
      color: '#FFFFFF',
      bgStyle: 'glass_dark',
      fontStyle: 'sans',
      scale: 1,
      rotation: 0,
      animation: 'none',
      startTime: trimStart,
      endTime: trimEnd || 15,
    };
    setOverlays((prev) => [...prev, newItem]);
    setSelectedOverlayId(newItem.id);
    setNewOverlayText('');
  };

  const updateSelectedOverlay = (patch: Partial<TextOverlayItem>) => {
    if (!selectedOverlayId) return;
    setOverlays((prev) =>
      prev.map((item) => (item.id === selectedOverlayId ? { ...item, ...patch } : item))
    );
  };

  const addStickerItem = (kind: StickerKind, content: string, extra?: Partial<StickerOverlayItem>) => {
    recordUndoSnapshot();
    const item: StickerOverlayItem = {
      id: `stk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      kind,
      content,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      ...extra,
    };
    setStickers((prev) => [...prev, item]);
    setSelectedStickerId(item.id);
  };

  // "Make a Sticker" from user's own photo with cutout shape baked on canvas
  const handleMakePhotoStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsHeavyActionLoading('Cutting out your custom photo sticker...');
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const size = 280;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.beginPath();
        if (customStickerShape === 'circle') {
          ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
        } else if (customStickerShape === 'squircle') {
          ctx.roundRect(10, 10, size - 20, size - 20, 48);
        } else if (customStickerShape === 'heart') {
          const w = size - 24;
          const h = size - 24;
          const x = 12;
          const y = 18;
          ctx.moveTo(x + w / 2, y + h / 4);
          ctx.bezierCurveTo(x + w / 2, y, x, y, x, y + h / 4);
          ctx.bezierCurveTo(x, y + h / 2, x + w / 2, y + (h * 3) / 4, x + w / 2, y + h);
          ctx.bezierCurveTo(x + w / 2, y + (h * 3) / 4, x + w, y + h / 2, x + w, y + h / 4);
          ctx.bezierCurveTo(x + w, y, x + w / 2, y, x + w / 2, y + h / 4);
        } else {
          // Star cutout
          const cx = size / 2;
          const cy = size / 2;
          const spikes = 5;
          const outerR = size / 2 - 10;
          const innerR = outerR * 0.48;
          let rot = (Math.PI / 2) * 3;
          const stepAngle = Math.PI / spikes;
          ctx.moveTo(cx, cy - outerR);
          for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
            rot += stepAngle;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += stepAngle;
          }
          ctx.closePath();
        }
        ctx.clip();

        // Center-crop image into sticker
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        ctx.restore();

        // White sticker border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 8;
        ctx.stroke();

        const cutoutDataUrl = canvas.toDataURL('image/png');
        addStickerItem('photo_cutout', cutoutDataUrl, {
          cutoutShape: customStickerShape,
          scale: 1.1,
        });
      }
      URL.revokeObjectURL(objectUrl);
      setIsHeavyActionLoading(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setIsHeavyActionLoading(null);
    };
    img.src = objectUrl;
  };

  // Stage Pointer Drag & Two-Finger Touch Pinch-to-Resize / Rotate
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingItem || !stageContainerRef.current) return;
    const rect = stageContainerRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(8, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));

    if (draggingItem.kind === 'text') {
      setOverlays((prev) =>
        prev.map((item) => (item.id === draggingItem.id ? { ...item, x, y } : item))
      );
    } else {
      setStickers((prev) =>
        prev.map((item) => (item.id === draggingItem.id ? { ...item, x, y } : item))
      );
    }
  };

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2) return;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;

    if (selectedOverlayId) {
      const target = overlays.find((o) => o.id === selectedOverlayId);
      if (target) {
        pinchStateRef.current = {
          initialDistance: Math.max(20, dist),
          initialAngle: angle,
          initialScale: target.scale,
          initialRotation: target.rotation,
          targetKind: 'text',
          targetId: target.id,
        };
      }
    } else if (selectedStickerId) {
      const target = stickers.find((s) => s.id === selectedStickerId);
      if (target) {
        pinchStateRef.current = {
          initialDistance: Math.max(20, dist),
          initialAngle: angle,
          initialScale: target.scale,
          initialRotation: target.rotation,
          targetKind: 'sticker',
          targetId: target.id,
        };
      }
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchStateRef.current) return;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;

    const p = pinchStateRef.current;
    const nextScale = Math.max(0.5, Math.min(2.5, p.initialScale * (dist / p.initialDistance)));
    const nextRot = Math.max(-180, Math.min(180, Math.round(p.initialRotation + (angle - p.initialAngle))));

    if (p.targetKind === 'text') {
      setOverlays((prev) =>
        prev.map((o) => (o.id === p.targetId ? { ...o, scale: nextScale, rotation: nextRot } : o))
      );
    } else {
      setStickers((prev) =>
        prev.map((s) => (s.id === p.targetId ? { ...s, scale: nextScale, rotation: nextRot } : s))
      );
    }
  };

  // ==========================================
  // AUTO-CAPTIONS (Web Speech Recognition + Fallback)
  // ==========================================
  const toggleLiveSpeechCaptions = () => {
    if (isListeningCaptions) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListeningCaptions(false);
      setCaptionStatusMsg('Auto-captioning paused.');
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      generateSmartSyncedCaptions();
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListeningCaptions(true);
        setCaptionStatusMsg('Listening to speech... Speak or play clip aloud.');
      };

      recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && lastResult.isFinal) {
          const spoken = String(lastResult[0].transcript || '').trim();
          if (spoken) {
            const start = Number(currentVideoTime.toFixed(1));
            const end = Number(Math.min(trimEnd, start + 3.2).toFixed(1));
            setCaptions((prev) => [
              ...prev,
              {
                id: `cap_${Date.now()}`,
                text: spoken,
                startTime: start,
                endTime: Math.max(start + 1.2, end),
              },
            ]);
          }
        }
      };

      recognition.onerror = () => {
        setIsListeningCaptions(false);
        generateSmartSyncedCaptions();
      };

      recognition.onend = () => {
        setIsListeningCaptions(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      generateSmartSyncedCaptions();
    }
  };

  const generateSmartSyncedCaptions = () => {
    setIsHeavyActionLoading('Generating synced auto-captions...');
    recordUndoSnapshot();
    window.setTimeout(() => {
      const dur = Math.max(4, trimEnd - trimStart);
      const stepLen = Math.max(1.8, Number((dur / 3).toFixed(1)));
      const generated: CaptionSegment[] = [
        {
          id: `cap_${Date.now()}_1`,
          text: 'Wait until you see how this turns out 👀',
          startTime: trimStart,
          endTime: Math.min(trimEnd, Number((trimStart + stepLen).toFixed(1))),
        },
        {
          id: `cap_${Date.now()}_2`,
          text: 'Testing the new WaveLink Creator Studio flow ✨',
          startTime: Number((trimStart + stepLen).toFixed(1)),
          endTime: Math.min(trimEnd, Number((trimStart + stepLen * 2).toFixed(1))),
        },
        {
          id: `cap_${Date.now()}_3`,
          text: 'Drop your thoughts in the comments below! 🔥',
          startTime: Number((trimStart + stepLen * 2).toFixed(1)),
          endTime: trimEnd,
        },
      ];
      setCaptions(generated);
      setCaptionStatusMsg('Auto-captions generated! Tap any line below to edit.');
      setIsHeavyActionLoading(null);
    }, 450);
  };

  // ==========================================
  // VOICEOVER RECORDER & FUN VOICE EFFECTS
  // ==========================================
  const toggleVoiceoverRecording = async () => {
    if (isRecordingVoiceover) {
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
      setIsRecordingVoiceover(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          voiceChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoiceoverUrl(url);
      };
      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoiceover(true);
      setVoiceoverSeconds(0);
    } catch {
      // Fallback: synthesize a sample voiceover buffer so user can still test Chipmunk/Deep/Robot effects
      const fallbackUrl = getHydratedRoyaltyFreeTracks()[2].previewUrl;
      setVoiceoverUrl(fallbackUrl);
      setErrorMsg('Microphone permission blocked in preview — loaded sample studio voice track to test effects.');
    }
  };

  useEffect(() => {
    if (!isRecordingVoiceover) return;
    const t = window.setInterval(() => {
      setVoiceoverSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [isRecordingVoiceover]);

  const handlePreviewVoiceEffect = async (effectToPlay: VoiceEffectType = voiceEffect) => {
    if (voiceStopRef.current) {
      voiceStopRef.current.stop();
      voiceStopRef.current = null;
      setIsPlayingVoicePreview(false);
      return;
    }
    const sourceUrl = voiceoverUrl || getHydratedRoyaltyFreeTracks()[0].previewUrl;
    try {
      setIsPlayingVoicePreview(true);
      const ctrl = await playAudioWithVoiceEffect(sourceUrl, effectToPlay, voiceoverVolume);
      voiceStopRef.current = ctrl;
      window.setTimeout(() => {
        setIsPlayingVoicePreview(false);
        voiceStopRef.current = null;
      }, 6000);
    } catch {
      setIsPlayingVoicePreview(false);
    }
  };

  // ==========================================
  // CSS FILTER & STAGE HELPERS
  // ==========================================
  const getCombinedFilterStyle = () => {
    const presetObj = FILTER_PRESETS.find((p) => p.id === filterPreset);
    const baseFilter = presetObj && presetObj.filter !== 'none' ? presetObj.filter : '';
    const bFilter = brightness !== 100 ? `brightness(${brightness / 100})` : '';
    const cFilter = contrast !== 100 ? `contrast(${contrast / 100})` : '';
    const sFilter = saturation !== 100 ? `saturate(${saturation / 100})` : '';
    return [baseFilter, bFilter, cFilter, sFilter].filter(Boolean).join(' ') || 'none';
  };

  // Bake filters, comedy templates, text overlays, and stickers onto an exported image or video cover
  const bakeEditedCanvasDataUrl = async (sourceImgOrVideo: HTMLImageElement | HTMLVideoElement): Promise<string> => {
    const canvas = document.createElement('canvas');
    const w =
      sourceImgOrVideo instanceof HTMLVideoElement
        ? sourceImgOrVideo.videoWidth || 720
        : sourceImgOrVideo.naturalWidth || 1080;
    const h =
      sourceImgOrVideo instanceof HTMLVideoElement
        ? sourceImgOrVideo.videoHeight || 1280
        : sourceImgOrVideo.naturalHeight || 1350;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.filter = getCombinedFilterStyle();
    ctx.drawImage(sourceImgOrVideo, 0, 0, w, h);
    ctx.filter = 'none';

    // Bake Comedy Template framing if active
    if (comedyTemplate === 'before_after' || comedyTemplate === 'split_screen') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(24, 24, 220, 54);
      ctx.fillRect(24, h / 2 + 24, 220, 54);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(templateTopLabel, 44, 60);
      ctx.fillText(templateBottomLabel, 44, h / 2 + 60);
    } else if (comedyTemplate === 'pov_meme') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, Math.round(h * 0.14));
      ctx.fillStyle = '#1C1917';
      ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(templateTopLabel || 'POV: When the beat drops', w / 2, Math.round(h * 0.085));
    }

    // Bake Text Overlays
    for (const item of overlays) {
      const xPos = (item.x / 100) * w;
      const yPos = (item.y / 100) * h;
      ctx.save();
      ctx.translate(xPos, yPos);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.scale(item.scale, item.scale);

      const fontSpec =
        TEXT_FONT_STYLES.find((f) => f.id === item.fontStyle)?.canvasFont ||
        '800 30px "Plus Jakarta Sans", sans-serif';
      ctx.font = fontSpec;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(item.text);
      const padX = 24;
      const padY = 16;
      const boxW = metrics.width + padX * 2;
      const boxH = 52;

      if (item.bgStyle !== 'outline_only') {
        ctx.fillStyle =
          item.bgStyle === 'solid_blue'
            ? '#2563EB'
            : item.bgStyle === 'solid_amber'
            ? '#FBBF24'
            : item.bgStyle === 'solid_rose'
            ? '#E11D48'
            : 'rgba(15, 15, 15, 0.78)';
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
        ctx.fill();
      }

      ctx.fillStyle = item.bgStyle === 'solid_amber' ? '#1C1917' : item.color;
      ctx.fillText(item.text, 0, item.bgStyle !== 'outline_only' ? padY - 14 : 0);
      ctx.restore();
    }

    // Bake Emoji & Label Stickers
    for (const stk of stickers) {
      if (stk.kind === 'emoji' || stk.kind === 'label' || stk.kind === 'shape') {
        const xPos = (stk.x / 100) * w;
        const yPos = (stk.y / 100) * h;
        ctx.save();
        ctx.translate(xPos, yPos);
        ctx.rotate((stk.rotation * Math.PI) / 180);
        ctx.scale(stk.scale, stk.scale);
        ctx.font = stk.kind === 'emoji' ? '56px sans-serif' : '800 28px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stk.content, 0, 0);
        ctx.restore();
      }
    }

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // ==========================================
  // STEP 3: SMART CAPTION & EXPORT / UPLOAD
  // ==========================================
  const handleSmartCaptionGenerate = () => {
    setIsGeneratingCaption(true);
    window.setTimeout(() => {
      const songNote = selectedSong ? ` 🎵 Vibes: ${selectedSong.trackName}` : '';
      const duetNote = duetLayout !== 'none' ? ` 🤝 Duet with @${selectedDuetWave.authorName}` : '';
      const generated = `Created in WaveLink Studio ✨ Wait for the end!${songNote}${duetNote} #WaveLink #CreatorStudio #TrendingNow`;
      setCaption((prev) => (prev.trim() ? `${prev.trim()}\n\n${generated}` : generated));
      setIsGeneratingCaption(false);
    }, 350);
  };

  const handlePublish = async () => {
    if (!selectedFile && !caption.trim()) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMsg('Please sign in to publish your post.');
      return;
    }

    // Enforce 60s Free / 90s Pro duration limit
    if (mediaType === 'video') {
      const clipDuration = Math.max(1, trimEnd - trimStart);
      if (clipDuration > maxAllowedSeconds) {
        setErrorMsg(
          `Clip length (${clipDuration}s) exceeds the ${maxAllowedSeconds}s limit for ${
            isProCreator ? 'Pro' : 'Free'
          } users. Please trim your video.`
        );
        setStep(2);
        setActiveTool('trim');
        return;
      }
    }

    // Clear any old failed drafts before starting a fresh upload from the browser
    clearFailedVideoAndStudioDrafts();

    setIsPublishing(true);
    setCanRetryUpload(false);
    setUploadProgress(5);
    setUploadStatusText('Preparing export for Cloudinary...');
    setErrorMsg(null);

    const extractedHashtags = Array.from(
      new Set((caption.match(/#[a-zA-Z0-9_]+/g) || []).map((t) => t.replace(/^#/, '').toLowerCase()))
    );

    const safeSongPreviewUrl =
      selectedSong?.previewUrl && selectedSong.previewUrl.startsWith('http')
        ? selectedSong.previewUrl
        : undefined;
    const safeSongAlbumArt =
      selectedSong?.artworkUrl100 && selectedSong.artworkUrl100.startsWith('http')
        ? selectedSong.artworkUrl100
        : undefined;

    const songMetadataPayload = selectedSong
      ? {
          songTitle: selectedSong.trackName,
          songArtist: selectedSong.artistName,
          songAlbumArt: safeSongAlbumArt,
          songPreviewUrl: safeSongPreviewUrl,
          songStartTime: songStartTime ?? 0,
          songVolume: songVolume ?? 85,
        }
      : {};

    const cachedProfile = getCachedUserProfile(currentUser.uid);
    const authorName = cachedProfile?.displayName || currentUser.displayName || 'Creator';
    const authorUsername =
      cachedProfile?.username ||
      `@${authorName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'creator'}`;
    const authorPhotoURL = sanitizeAvatarUrlForFirestore(
      cachedProfile?.photoURL || currentUser.photoURL,
      currentUser.uid
    );

    try {
      // VIDEO FLOW -> Direct browser upload to Cloudinary (monarcking72 / monarcking72) with live progress bar
      // Creates the Firestore post document ONLY after the upload succeeds, then shows it at the top of the feed.
      if (selectedFile && mediaType === 'video') {
        let customCoverHttpUrl: string | undefined = undefined;
        const hasVisualCoverEdits =
          Boolean(customCoverDataUrl) ||
          overlays.length > 0 ||
          stickers.length > 0 ||
          filterPreset !== 'none' ||
          comedyTemplate !== 'none';

        if (hasVisualCoverEdits) {
          try {
            setUploadStatusText('Uploading cover thumbnail to Cloudinary...');
            const coverDataUrl =
              customCoverDataUrl ||
              (videoPreviewRef.current ? await bakeEditedCanvasDataUrl(videoPreviewRef.current) : '');
            if (coverDataUrl) {
              const uploadedCover = await uploadImageToCloudinary(coverDataUrl, (pct) => {
                setUploadProgress(Math.max(5, Math.min(18, Math.round(pct * 0.18))));
              });
              if (uploadedCover.secureUrl && uploadedCover.secureUrl.startsWith('http')) {
                customCoverHttpUrl = uploadedCover.secureUrl;
              }
            }
          } catch (coverErr) {
            console.warn('Custom cover upload skipped, using Cloudinary video frame thumbnail:', coverErr);
          }
        }

        await new Promise<void>((resolve, reject) => {
          enqueueVideoUploadJob({
            authorId: currentUser.uid,
            authorEmail: currentUser.email || '',
            authorName,
            authorUsername,
            authorPhotoURL,
            file: selectedFile,
            caption: caption.trim() || 'New Wave Video ✨',
            trimStart,
            trimEnd,
            customThumbnailUrl: customCoverHttpUrl,
            isProUser: isProCreator,
            aspectRatio,
            audience,
            locationTag: locationTag.trim(),
            allowComments,
            hashtags: extractedHashtags,
            songMetadata: songMetadataPayload,
            onProgress: (pct, statusLabel) => {
              setUploadProgress(Math.max(5, Math.min(99, pct)));
              setUploadStatusText(statusLabel || `Uploading to Cloudinary (${pct}%)...`);
            },
            onComplete: () => {
              resolve();
            },
            onError: (errMsg) => {
              reject(new Error(errMsg));
            },
          });
        });

        setUploadProgress(100);
        setUploadStatusText('Published to WaveLink!');
        clearFailedVideoAndStudioDrafts();
        setPublishSuccess(true);
        window.setTimeout(() => {
          setPublishSuccess(false);
          if (onNavigateToFeed) onNavigateToFeed();
        }, 500);
        return;
      }

      // IMAGE / CAROUSEL / TEXT POST FLOW -> Direct browser upload to Cloudinary (monarcking72 / monarcking72)
      // Never stores base64 or data URLs in Firestore.
      let finalImageUrl: string | undefined = undefined;
      let finalWidth: number | undefined = undefined;
      let finalHeight: number | undefined = undefined;
      const uploadedCarouselUrls: string[] = [];

      if (selectedFile && mediaType === 'image') {
        setUploadStatusText('Rendering edited photo...');
        setUploadProgress(12);
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          imgEl.onload = () => resolve();
          imgEl.onerror = () => reject(new Error('Could not load selected image for export.'));
          imgEl.src = previewUrl!;
        });

        const bakedDataUrl = await bakeEditedCanvasDataUrl(imgEl);
        setUploadStatusText('Uploading photo to Cloudinary...');
        const mainUploaded = await uploadImageToCloudinary(bakedDataUrl, (pct) => {
          const totalFiles = Math.max(1, carouselFiles.length);
          const scaled = Math.round(15 + (pct / totalFiles) * 0.75);
          setUploadProgress(Math.max(15, Math.min(90, scaled)));
          setUploadStatusText(`Uploading photo to Cloudinary (${pct}%)...`);
        });

        if (!mainUploaded.secureUrl || !mainUploaded.secureUrl.startsWith('http')) {
          throw new Error('Cloudinary photo upload did not return a valid secure_url.');
        }

        finalImageUrl = mainUploaded.secureUrl;
        finalWidth = mainUploaded.width;
        finalHeight = mainUploaded.height;
        uploadedCarouselUrls.push(mainUploaded.secureUrl);

        if (carouselFiles.length > 1) {
          for (let i = 1; i < carouselFiles.length; i++) {
            const extraUploaded = await uploadImageToCloudinary(carouselFiles[i], (pct) => {
              const basePct = 15 + Math.round(((i + pct / 100) / carouselFiles.length) * 75);
              setUploadProgress(Math.max(20, Math.min(92, basePct)));
              setUploadStatusText(
                `Uploading carousel photo ${i + 1} of ${carouselFiles.length} (${pct}%)...`
              );
            });
            if (extraUploaded.secureUrl && extraUploaded.secureUrl.startsWith('http')) {
              uploadedCarouselUrls.push(extraUploaded.secureUrl);
            }
          }
        }
      }

      setUploadProgress(95);
      setUploadStatusText('Saving post to feed...');

      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const postPayload: Post = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName,
        authorUsername,
        authorPhotoURL,
        content: caption.trim() || 'Created with WaveLink Studio ✨',
        imageUrl: finalImageUrl,
        imageUrls: uploadedCarouselUrls.length > 1 ? uploadedCarouselUrls : undefined,
        mediaType: mediaType === 'image' ? 'image' : undefined,
        videoWidth: finalWidth,
        videoHeight: finalHeight,
        aspectRatio,
        audience,
        locationTag: locationTag.trim() || undefined,
        allowComments,
        hashtags: extractedHashtags.length > 0 ? extractedHashtags : undefined,
        ...songMetadataPayload,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        savesCount: 0,
        createdAt: new Date().toISOString(),
      };

      await savePostDocument(postPayload);

      setUploadProgress(100);
      setUploadStatusText('Published to WaveLink!');
      clearFailedVideoAndStudioDrafts();
      setPublishSuccess(true);
      window.setTimeout(() => {
        setPublishSuccess(false);
        if (onNavigateToFeed) onNavigateToFeed();
      }, 500);
    } catch (err) {
      console.error('Publish error:', err);
      const formatted = formatVideoUploadError(err, {
        fileSize: selectedFile?.size,
        maxAllowedSeconds,
        isProUser: isProCreator,
      });
      setErrorMsg(formatted || 'Failed to publish post. Tap Retry Upload to upload the file again.');
      setCanRetryUpload(true);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'posts');
      } catch {
        // Handled in UI error banner
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || null;
  const selectedSticker = stickers.find((s) => s.id === selectedStickerId) || null;
  const activeCaptionAtPlayhead = captions.find(
    (c) => currentVideoTime >= c.startTime && currentVideoTime <= c.endTime
  );

  useBottomSheetLock(Boolean(selectedFile || step >= 2), 'studio-editor');

  return (
    <div
      className="max-w-2xl mx-auto pb-28"
      style={{ paddingBottom: 'max(7rem, calc(5rem + env(safe-area-inset-bottom, 0px)))' }}
    >
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={nativeCameraInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        capture={cameraFacing}
        className="hidden"
      />
      <input
        type="file"
        ref={stickerInputRef}
        onChange={handleMakePhotoStickerUpload}
        accept="image/*"
        className="hidden"
      />

      {/* TOP STUDIO NAVIGATION BAR (Light, Friendly, Big Tap Targets) */}
      <div className="bg-white rounded-3xl border border-[#EFECE6] shadow-xs p-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* 3-Step Indicator Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onNavigateToFeed && (
            <button
              type="button"
              onClick={onNavigateToFeed}
              aria-label="Back to feed"
              className="lg:hidden min-w-[44px] min-h-[44px] px-2.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center gap-1 text-xs font-extrabold transition cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Feed</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              step === 1
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <Camera size={15} />
            <span>1. Capture</span>
          </button>

          <button
            type="button"
            disabled={!previewUrl && step === 1}
            onClick={() => setStep(2)}
            className={`min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
              step === 2
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <Wand2 size={15} />
            <span>2. Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setStep(3)}
            className={`min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              step === 3
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <Send size={15} />
            <span>3. Post</span>
          </button>
        </div>

        {/* Undo / Redo + Free (60s) / Pro (90s) Plan Toggle */}
        <div className="flex items-center gap-1.5">
          {step === 2 && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyPast.length === 0}
                title="Undo"
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center disabled:opacity-35 hover:border-[#2563EB] transition cursor-pointer"
              >
                <Undo2 size={17} />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyFuture.length === 0}
                title="Redo"
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center disabled:opacity-35 hover:border-[#2563EB] transition cursor-pointer"
              >
                <Redo2 size={17} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              const next = !isProCreator;
              setIsProCreator(next);
              try {
                localStorage.setItem('wavelink_pro_creator', String(next));
              } catch {
                // ignore
              }
            }}
            className={`min-h-[44px] px-3 py-1.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 border transition cursor-pointer ${
              isProCreator
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-[#FAF7F2] border-[#EFECE6] text-[#57534E]'
            }`}
          >
            <Crown size={14} className={isProCreator ? 'text-amber-500' : 'text-[#78716C]'} />
            <span>{isProCreator ? 'Pro · 90s Max' : 'Free · 60s Max'}</span>
          </button>
        </div>
      </div>

      {/* Heavy Action Loading Banner */}
      {isHeavyActionLoading && (
        <div className="mb-3 p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs font-extrabold text-[#2563EB]">
          <Loader2 size={18} className="animate-spin shrink-0" />
          <span>{isHeavyActionLoading}</span>
        </div>
      )}

      {/* Error Message Banner */}
      {errorMsg && (
        <div className="mb-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-xs font-bold text-rose-700">
          <span className="flex-1">{errorMsg}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {canRetryUpload && !isPublishing && (
              <button
                type="button"
                onClick={handlePublish}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Retry Upload</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setCanRetryUpload(false);
              }}
              className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-rose-100 flex items-center justify-center cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 1: RECORD WITH CAMERA (COUNTDOWN + FRONT/BACK) OR PICK MEDIA     */}
      {/* ===================================================================== */}
      {step === 1 && (
        <div className="bg-white rounded-3xl border border-[#EFECE6] shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#EFECE6] flex items-center justify-between bg-[#FAF7F2]">
            <div>
              <h2 className="text-lg font-extrabold text-[#1C1917]">Creator Studio</h2>
              <p className="text-xs text-[#57534E]">
                Record with countdown & front/back camera, or pick photos & videos ({maxAllowedSeconds}s max)
              </p>
            </div>
            {hasSavedDraft && (
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#EEF2FF] border border-blue-200 text-[#2563EB] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Bookmark size={14} />
                <span>Resume Draft</span>
              </button>
            )}
          </div>

          {/* Camera Viewfinder or Launch Stage */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="relative w-full aspect-[9/14] max-h-[480px] rounded-3xl bg-stone-900 overflow-hidden flex flex-col justify-between p-4 text-white shadow-inner">
              {cameraActive ? (
                <video
                  ref={liveVideoRef}
                  muted
                  playsInline
                  autoPlay
                  className={`absolute inset-0 w-full h-full object-cover ${
                    cameraFacing === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                />
              ) : previewUrl ? (
                mediaType === 'video' ? (
                  <>
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      autoPlay
                      loop
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50 pointer-events-none"
                    />
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      autoPlay
                      loop
                      className="absolute inset-0 z-10 w-full h-full object-contain opacity-95"
                    />
                  </>
                ) : (
                  <>
                    <img
                      src={previewUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50 pointer-events-none"
                    />
                    <img
                      src={previewUrl}
                      alt="Selected"
                      className="absolute inset-0 z-10 w-full h-full object-contain opacity-95"
                    />
                  </>
                )
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-stone-800 via-stone-900 to-black flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center mb-3 text-blue-400">
                    <Camera size={30} />
                  </div>
                  <h3 className="text-base font-extrabold text-white mb-1">
                    Ready to Capture Your Wave
                  </h3>
                  <p className="text-xs text-stone-300 max-w-xs mb-4">
                    Flip between Front & Back cameras, set a 3s/5s/10s countdown timer, or pick from your gallery.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCameraStream(cameraFacing)}
                    className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-blue-500 text-white font-extrabold text-sm flex items-center gap-2 shadow-lg cursor-pointer"
                  >
                    <Camera size={18} />
                    <span>Open Live Camera</span>
                  </button>
                </div>
              )}

              {/* Top Camera Controls Overlay: Front/Back Flip & Countdown Selector */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <FlipHorizontal size={16} className="text-sky-300" />
                  <span>{cameraFacing === 'user' ? 'Front Camera' : 'Back Camera'}</span>
                </button>

                <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/20 p-1 rounded-2xl">
                  <Timer size={14} className="text-amber-300 ml-2 mr-1" />
                  {([0, 3, 5, 10] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setCountdownSetting(sec)}
                      className={`min-w-[36px] min-h-[36px] px-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                        countdownSetting === sec
                          ? 'bg-amber-400 text-stone-950'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      {sec === 0 ? 'Off' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Big Visual Countdown Overlay (3... 2... 1...) */}
              {countdownRemaining !== null && (
                <div className="relative z-20 my-auto flex flex-col items-center justify-center">
                  <div className="w-28 h-28 rounded-full bg-black/75 border-4 border-amber-400 flex items-center justify-center text-6xl font-black text-amber-300 animate-ping">
                    {countdownRemaining}
                  </div>
                  <span className="mt-3 px-3 py-1 rounded-full bg-black/70 text-xs font-bold text-white">
                    Get ready...
                  </span>
                </div>
              )}

              {/* Bottom Camera Shutter & Mode Controls */}
              <div className="relative z-10 space-y-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent -mx-4 -mb-4 p-4 pt-8">
                {/* Video vs Photo Mode Selector */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCaptureMode('video')}
                    className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-extrabold transition cursor-pointer ${
                      captureMode === 'video'
                        ? 'bg-white text-stone-950'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    Video ({maxAllowedSeconds}s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureMode('photo')}
                    className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-extrabold transition cursor-pointer ${
                      captureMode === 'photo'
                        ? 'bg-white text-stone-950'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    Photo
                  </button>
                </div>

                <div className="flex items-center justify-around">
                  {/* Pick from Gallery Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[48px] px-4 py-2 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Upload size={16} />
                    <span>Gallery</span>
                  </button>

                  {/* Primary Record / Capture Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!cameraActive) {
                        startCameraStream(cameraFacing);
                      } else {
                        handleCameraShutterPress();
                      }
                    }}
                    className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition active:scale-95 cursor-pointer ${
                      isRecordingCamera ? 'bg-rose-600 animate-pulse' : 'bg-rose-500 hover:bg-rose-400'
                    }`}
                    aria-label="Record or Capture"
                  >
                    {isRecordingCamera ? (
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-md bg-white mb-0.5" />
                        <span className="text-[10px] font-mono font-extrabold">
                          {recordingSeconds}s
                        </span>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center font-extrabold text-xs">
                        {captureMode === 'video' ? 'REC' : 'SNAP'}
                      </div>
                    )}
                  </button>

                  {/* Continue to Editor if media already chosen */}
                  {previewUrl ? (
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="min-h-[48px] px-4 py-2 rounded-2xl bg-[#2563EB] text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Edit</span>
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="min-h-[48px] px-3.5 py-2 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Video size={16} />
                      <span>Device Cam</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {cameraError && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-3">
                {cameraError}
              </p>
            )}

            {/* Quick Launch Shortcuts: Gallery, Reaction/Duet, Comedy Templates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[54px] p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] hover:border-[#2563EB] flex items-center gap-3 text-left transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#1C1917]">Pick Photo or Video</div>
                  <div className="text-[11px] text-[#57534E]">Single, carousel or clip</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDuetLayout('side_by_side');
                  setActiveTool('duet_templates');
                  if (!previewUrl) {
                    setPreviewUrl(BUILTIN_DUET_WAVES[1].videoUrl);
                    setMediaType('video');
                  }
                  setStep(2);
                }}
                className="min-h-[54px] p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] hover:border-[#2563EB] flex items-center gap-3 text-left transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#0D9488] flex items-center justify-center shrink-0">
                  <SplitSquareHorizontal size={20} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#1C1917]">Reaction & Duet</div>
                  <div className="text-[11px] text-[#57534E]">Side-by-side or behind</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setComedyTemplate('before_after');
                  setActiveTool('duet_templates');
                  if (!previewUrl) {
                    setPreviewUrl(BUILTIN_DUET_WAVES[0].videoUrl);
                    setMediaType('video');
                  }
                  setStep(2);
                }}
                className="min-h-[54px] p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] hover:border-[#2563EB] flex items-center gap-3 text-left transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <LayoutTemplate size={20} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#1C1917]">Comedy Templates</div>
                  <div className="text-[11px] text-[#57534E]">Split, Before/After, 3-2-1</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2: FULL-SCREEN EDITOR WITH INTERACTIVE STAGE & BOTTOM TOOLBAR    */}
      {/* ===================================================================== */}
      {step === 2 && (
        <div className="bg-white rounded-3xl border border-[#EFECE6] shadow-sm overflow-hidden flex flex-col">
          {/* Top Editor Status Bar */}
          <div className="px-4 py-2.5 border-b border-[#EFECE6] bg-[#FAF7F2] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-[#EFECE6] p-1 rounded-xl">
                {(['9:16', '4:5', '1:1'] as AspectRatioPreset[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                      aspectRatio === ratio
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              {lastAutosavedAt && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 hidden sm:inline-flex items-center gap-1">
                  <Check size={12} /> Draft saved {lastAutosavedAt}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullPreviewOpen(true)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Eye size={14} className="text-[#2563EB]" />
                <span>Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2563EB] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* FULL-SCREEN INTERACTIVE STAGE */}
          <div className="p-3 sm:p-4 bg-stone-950 flex flex-col items-center justify-center">
            <div
              ref={stageContainerRef}
              onPointerMove={handleStagePointerMove}
              onPointerUp={() => setDraggingItem(null)}
              onPointerLeave={() => setDraggingItem(null)}
              onTouchStart={handleStageTouchStart}
              onTouchMove={handleStageTouchMove}
              onTouchEnd={() => {
                pinchStateRef.current = null;
              }}
              className={`relative w-full overflow-hidden rounded-2xl bg-stone-900 select-none touch-none shadow-2xl border border-white/10 ${
                aspectRatio === '9:16'
                  ? 'max-w-[340px] aspect-[9/16]'
                  : aspectRatio === '4:5'
                  ? 'max-w-[380px] aspect-[4/5]'
                  : 'max-w-[380px] aspect-square'
              }`}
            >
              {/* Main Media + Reaction/Duet Layout Container */}
              <div
                className={`w-full h-full ${
                  duetLayout === 'side_by_side' || comedyTemplate === 'split_screen'
                    ? 'grid grid-cols-2'
                    : duetLayout === 'top_bottom' || comedyTemplate === 'before_after'
                    ? 'grid grid-rows-2'
                    : 'relative'
                }`}
              >
                {/* User's Primary Video or Image */}
                <div className="relative w-full h-full overflow-hidden bg-black">
                  {previewUrl ? (
                    mediaType === 'video' ? (
                      <video
                        ref={videoPreviewRef}
                        src={previewUrl}
                        onLoadedMetadata={handleVideoLoadedMetadata}
                        onTimeUpdate={handleVideoTimeUpdate}
                        style={{ filter: getCombinedFilterStyle() }}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={carouselPreviewUrls[activeCarouselIndex] || previewUrl}
                        alt="Stage preview"
                        style={{ filter: getCombinedFilterStyle() }}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 p-4 text-center">
                      <Camera size={28} className="mb-2" />
                      <span className="text-xs font-bold">No clip selected yet</span>
                    </div>
                  )}
                </div>

                {/* Reaction / Duet Target Video (Side-by-Side, Top/Bottom, or PiP Behind) */}
                {(duetLayout !== 'none' ||
                  comedyTemplate === 'split_screen' ||
                  comedyTemplate === 'before_after') && (
                  <div
                    className={
                      duetLayout === 'pip_behind'
                        ? 'absolute top-3 right-3 w-28 aspect-[9/16] rounded-xl overflow-hidden border-2 border-white shadow-xl z-20 bg-black'
                        : 'relative w-full h-full overflow-hidden bg-stone-900 border-l border-t border-white/20'
                    }
                  >
                    <video
                      ref={duetVideoRef}
                      src={selectedDuetWave.videoUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold truncate max-w-[90%]">
                      @{selectedDuetWave.authorName}
                    </div>
                  </div>
                )}
              </div>

              {/* COMEDY TEMPLATES OVERLAYS */}
              {comedyTemplate === 'before_after' && (
                <>
                  <div className="absolute top-3 left-3 z-20 px-3 py-1 rounded-xl bg-black/75 border border-white/25 text-white font-black text-xs tracking-wider uppercase">
                    {templateTopLabel}
                  </div>
                  <div className="absolute top-[52%] left-3 z-20 px-3 py-1 rounded-xl bg-[#2563EB] text-white font-black text-xs tracking-wider uppercase">
                    {templateBottomLabel}
                  </div>
                </>
              )}

              {comedyTemplate === 'split_screen' && (
                <>
                  <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-xl bg-black/75 text-white font-black text-[11px]">
                    {templateTopLabel}
                  </div>
                  <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-xl bg-amber-400 text-stone-950 font-black text-[11px]">
                    {templateBottomLabel}
                  </div>
                </>
              )}

              {comedyTemplate === 'pov_meme' && (
                <div className="absolute top-0 inset-x-0 z-20 bg-white text-[#1C1917] px-3 py-2.5 text-center font-black text-xs sm:text-sm shadow-md">
                  {templateTopLabel || 'POV: When the weekend finally hits'}
                </div>
              )}

              {comedyTemplate === 'countdown' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-2xl bg-amber-400 text-stone-950 font-black text-sm shadow-lg flex items-center gap-1.5">
                  <Timer size={16} />
                  <span>Wait for it... {templateCountdownValue}</span>
                </div>
              )}

              {/* Selected Royalty-Free Song Floating Pill on Stage */}
              {selectedSong && (
                <div className="absolute top-3 left-3 z-20 max-w-[75%] px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold flex items-center gap-1.5">
                  <Music size={12} className="text-sky-400 shrink-0 animate-pulse" />
                  <span className="truncate">
                    {selectedSong.trackName} · {selectedSong.artistName}
                  </span>
                </div>
              )}

              {/* DRAGGABLE, PINCH-RESIZABLE, ROTATABLE TEXT OVERLAYS (Timeline-Aware) */}
              {overlays.map((item) => {
                const isVisibleAtTime =
                  mediaType !== 'video' ||
                  selectedOverlayId === item.id ||
                  (currentVideoTime >= item.startTime && currentVideoTime <= item.endTime);

                if (!isVisibleAtTime) return null;

                const bgClass =
                  TEXT_BG_STYLES.find((b) => b.id === item.bgStyle)?.previewClass ||
                  'bg-black/75 text-white';
                const fontClass =
                  TEXT_FONT_STYLES.find((f) => f.id === item.fontStyle)?.fontClass ||
                  'font-sans font-extrabold';
                const animClass =
                  TEXT_ANIMATIONS.find((a) => a.id === item.animation)?.className || '';

                return (
                  <div
                    key={item.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(item.id);
                      setSelectedStickerId(null);
                      setDraggingItem({ kind: 'text', id: item.id });
                    }}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      color: item.bgStyle === 'solid_amber' ? '#1C1917' : item.color,
                      transform: `translate(-50%, -50%) scale(${item.scale}) rotate(${item.rotation}deg)`,
                    }}
                    className={`absolute z-30 px-3.5 py-1.5 rounded-2xl text-sm cursor-move select-none whitespace-nowrap ${bgClass} ${fontClass} ${animClass} ${
                      selectedOverlayId === item.id ? 'ring-2 ring-sky-400' : ''
                    }`}
                  >
                    {item.text}
                  </div>
                );
              })}

              {/* DRAGGABLE, RESIZABLE STICKERS (Emoji, Shapes, Labels & Custom User Photo Cutouts) */}
              {stickers.map((stk) => (
                <div
                  key={stk.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedStickerId(stk.id);
                    setSelectedOverlayId(null);
                    setDraggingItem({ kind: 'sticker', id: stk.id });
                  }}
                  style={{
                    left: `${stk.x}%`,
                    top: `${stk.y}%`,
                    transform: `translate(-50%, -50%) scale(${stk.scale}) rotate(${stk.rotation}deg)`,
                  }}
                  className={`absolute z-30 cursor-move select-none ${
                    selectedStickerId === stk.id ? 'ring-2 ring-sky-400 rounded-2xl p-1' : ''
                  }`}
                >
                  {stk.kind === 'emoji' && <span className="text-4xl block">{stk.content}</span>}
                  {stk.kind === 'shape' && (
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg ${
                        stk.labelBg || 'bg-amber-400 text-stone-950'
                      }`}
                    >
                      {stk.content}
                    </div>
                  )}
                  {stk.kind === 'label' && (
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wide uppercase shadow-lg ${
                        stk.labelBg || 'bg-[#2563EB] text-white'
                      }`}
                    >
                      {stk.content}
                    </div>
                  )}
                  {stk.kind === 'photo_cutout' && (
                    <img
                      src={stk.content}
                      alt="Custom sticker"
                      className="w-20 h-20 object-contain drop-shadow-xl pointer-events-none"
                    />
                  )}
                </div>
              ))}

              {/* LIVE SYNCED AUTO-CAPTIONS OVERLAY */}
              {activeCaptionAtPlayhead && (
                <div className="absolute bottom-14 inset-x-4 z-30 flex justify-center pointer-events-none">
                  <div
                    className={`px-3.5 py-1.5 rounded-xl text-center text-xs sm:text-sm font-extrabold max-w-[92%] ${
                      captionStyle === 'yellow_pop'
                        ? 'bg-amber-400 text-stone-950 shadow-lg border border-stone-900'
                        : captionStyle === 'neon'
                        ? 'bg-black/80 text-sky-300 border border-sky-400/50 shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                        : captionStyle === 'minimal'
                        ? 'bg-transparent text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]'
                        : 'bg-black/80 text-white border border-white/15'
                    }`}
                  >
                    {activeCaptionAtPlayhead.text}
                  </div>
                </div>
              )}

              {/* Play/Pause & Time Scrubber Bar at Bottom of Stage */}
              {mediaType === 'video' && (
                <div className="absolute bottom-2 inset-x-2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/65 backdrop-blur-md text-white">
                  <button
                    type="button"
                    onClick={toggleVideoPlay}
                    className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center cursor-pointer"
                  >
                    {isVideoPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <input
                    type="range"
                    min={trimStart}
                    max={Math.max(trimStart + 1, trimEnd)}
                    step={0.1}
                    value={Math.min(trimEnd, Math.max(trimStart, currentVideoTime))}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCurrentVideoTime(next);
                      if (videoPreviewRef.current) {
                        videoPreviewRef.current.currentTime = next;
                      }
                    }}
                    className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono tabular-nums">
                    {currentVideoTime.toFixed(1)}s / {trimEnd.toFixed(0)}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* =============================================================== */}
          {/* BOTTOM TOOLBAR PANEL (Active Tool Controls)                     */}
          {/* =============================================================== */}
          <div className="p-4 bg-[#FAF7F2] border-t border-[#EFECE6] min-h-[210px]">
            {/* 1. TRIM & SPLIT TOOL */}
            {activeTool === 'trim' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                      Trim & Split Clips
                    </h4>
                    <p className="text-[11px] text-[#57534E]">
                      Cut start/end or split at playhead ({maxAllowedSeconds}s max for{' '}
                      {isProCreator ? 'Pro' : 'Free'})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={splitClipAtPlayhead}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <ScissorsLineDashed size={15} />
                      <span>Split at {currentVideoTime.toFixed(1)}s</span>
                    </button>
                    {mediaType === 'video' && (
                      <button
                        type="button"
                        onClick={captureCurrentFrameAsCover}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera size={14} className="text-[#2563EB]" />
                        <span>Set Cover</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Start & End Trim Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6]">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#57534E] mb-1">
                      <span>Start Cut</span>
                      <span className="font-mono text-[#1C1917]">{trimStart.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, trimEnd - 1)}
                      step={0.5}
                      value={trimStart}
                      onChange={(e) => {
                        recordUndoSnapshot();
                        setTrimStart(Number(e.target.value));
                      }}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#57534E] mb-1">
                      <span>End Cut (Max {maxAllowedSeconds}s)</span>
                      <span className="font-mono text-[#1C1917]">{trimEnd.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={trimStart + 1}
                      max={Math.min(videoDuration, trimStart + maxAllowedSeconds)}
                      step={0.5}
                      value={trimEnd}
                      onChange={(e) => {
                        recordUndoSnapshot();
                        setTrimEnd(Number(e.target.value));
                      }}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                </div>

                {/* Split Segments Timeline */}
                {segments.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#57534E]">
                      Clip Segments ({segments.length}) — tap a segment to select or delete:
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {segments.map((seg, idx) => (
                        <div
                          key={seg.id}
                          onClick={() => {
                            setSelectedSegmentId(seg.id);
                            if (videoPreviewRef.current) {
                              videoPreviewRef.current.currentTime = seg.start;
                            }
                          }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer ${
                            selectedSegmentId === seg.id
                              ? 'bg-[#EEF2FF] border-[#2563EB] text-[#2563EB]'
                              : 'bg-white border-[#EFECE6] text-[#1C1917]'
                          }`}
                        >
                          <span>
                            Part {idx + 1}: {seg.start.toFixed(1)}s–{seg.end.toFixed(1)}s ({seg.speed}x)
                          </span>
                          {segments.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSelectedSegment(seg.id);
                              }}
                              className="p-1 rounded-lg hover:bg-rose-100 text-rose-600"
                              title="Delete segment"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. SPEED TOOL (0.3x, 0.5x, 1x, 2x, 3x on Whole Clip or Selected Part) */}
            {activeTool === 'speed' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                      Playback Speed Control
                    </h4>
                    <p className="text-[11px] text-[#57534E]">
                      Slow motion (0.3x, 0.5x), Normal (1x), or Fast (2x, 3x)
                    </p>
                  </div>

                  {/* Scope Selector: Whole Clip vs Selected Part */}
                  <div className="flex items-center bg-white border border-[#EFECE6] p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSpeedScope('whole')}
                      className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        speedScope === 'whole'
                          ? 'bg-[#2563EB] text-white'
                          : 'text-[#57534E] hover:text-[#1C1917]'
                      }`}
                    >
                      Whole Clip
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpeedScope('range')}
                      className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        speedScope === 'range'
                          ? 'bg-[#2563EB] text-white'
                          : 'text-[#57534E] hover:text-[#1C1917]'
                      }`}
                    >
                      Selected Part
                    </button>
                  </div>
                </div>

                {/* Speed Preset Buttons */}
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { val: 0.3, label: '0.3x', sub: 'Super Slow' },
                    { val: 0.5, label: '0.5x', sub: 'Slow-Mo' },
                    { val: 1, label: '1x', sub: 'Normal' },
                    { val: 2, label: '2x', sub: 'Fast' },
                    { val: 3, label: '3x', sub: 'Turbo' },
                  ].map((sp) => (
                    <button
                      key={sp.val}
                      type="button"
                      onClick={() => {
                        recordUndoSnapshot();
                        setPlaybackSpeed(sp.val);
                        if (selectedSegmentId && segments.length > 1) {
                          setSegments((prev) =>
                            prev.map((s) =>
                              s.id === selectedSegmentId ? { ...s, speed: sp.val } : s
                            )
                          );
                        }
                      }}
                      className={`min-h-[54px] p-2 rounded-2xl border flex flex-col items-center justify-center transition cursor-pointer ${
                        playbackSpeed === sp.val
                          ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-xs'
                          : 'bg-white border-[#EFECE6] text-[#1C1917] hover:border-[#2563EB]'
                      }`}
                    >
                      <span className="text-sm font-black">{sp.label}</span>
                      <span className="text-[10px] opacity-80">{sp.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Range sliders when applying speed to a Selected Part */}
                {speedScope === 'range' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6]">
                    <div>
                      <div className="flex justify-between text-xs font-bold text-[#57534E] mb-1">
                        <span>Speed Section Start</span>
                        <span className="font-mono">{speedRangeStart.toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min={trimStart}
                        max={Math.max(trimStart, speedRangeEnd - 0.5)}
                        step={0.5}
                        value={speedRangeStart}
                        onChange={(e) => setSpeedRangeStart(Number(e.target.value))}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-bold text-[#57534E] mb-1">
                        <span>Speed Section End</span>
                        <span className="font-mono">{speedRangeEnd.toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min={speedRangeStart + 0.5}
                        max={trimEnd}
                        step={0.5}
                        value={speedRangeEnd}
                        onChange={(e) => setSpeedRangeEnd(Number(e.target.value))}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. TEXT TOOL (Drag, Pinch/Slider Resize, Rotate, Fonts, Colors, Backgrounds, Animations, Timeline Timing) */}
            {activeTool === 'text' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOverlayText}
                    onChange={(e) => setNewOverlayText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTextOverlay()}
                    placeholder="Type text overlay (drag & pinch on stage)..."
                    className="flex-1 min-h-[44px] px-3.5 py-2 rounded-2xl bg-white border border-[#EFECE6] text-sm text-[#1C1917] focus:outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={addTextOverlay}
                    className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#2563EB] text-white font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Add Text</span>
                  </button>
                </div>

                {selectedOverlay ? (
                  <div className="bg-white p-3.5 rounded-2xl border border-[#EFECE6] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#1C1917] truncate">
                        Editing: “{selectedOverlay.text}”
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          recordUndoSnapshot();
                          setOverlays((prev) => prev.filter((o) => o.id !== selectedOverlay.id));
                          setSelectedOverlayId(null);
                        }}
                        className="min-h-[36px] px-2.5 py-1 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    </div>

                    {/* Fonts & Animations */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {TEXT_FONT_STYLES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateSelectedOverlay({ fontStyle: f.id })}
                          className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold shrink-0 border cursor-pointer ${
                            selectedOverlay.fontStyle === f.id
                              ? 'bg-[#2563EB] text-white border-[#2563EB]'
                              : 'bg-[#FAF7F2] text-[#1C1917] border-[#EFECE6]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                      {TEXT_ANIMATIONS.map((anim) => (
                        <button
                          key={anim.id}
                          type="button"
                          onClick={() => updateSelectedOverlay({ animation: anim.id })}
                          className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold shrink-0 border cursor-pointer ${
                            selectedOverlay.animation === anim.id
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-[#FAF7F2] text-[#57534E] border-[#EFECE6]'
                          }`}
                        >
                          ✨ {anim.label}
                        </button>
                      ))}
                    </div>

                    {/* Colors & Background Styles */}
                    <div className="flex flex-wrap items-center gap-2">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => updateSelectedOverlay({ color: c.id })}
                          style={{ backgroundColor: c.id }}
                          className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                            selectedOverlay.color === c.id
                              ? 'border-[#2563EB] scale-110'
                              : 'border-stone-300'
                          }`}
                          title={c.label}
                        />
                      ))}
                      <div className="h-4 w-px bg-stone-200 mx-1" />
                      {TEXT_BG_STYLES.map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => updateSelectedOverlay({ bgStyle: bg.id })}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                            selectedOverlay.bgStyle === bg.id
                              ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                              : 'border-[#EFECE6] text-[#57534E]'
                          }`}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>

                    {/* Size (Pinch or Slider), Rotation & Timeline Appear/Disappear */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <div className="flex justify-between font-bold text-[#57534E] mb-1">
                          <span className="flex items-center gap-1">
                            <ZoomIn size={13} /> Size (or 2-finger pinch)
                          </span>
                          <span>{Math.round(selectedOverlay.scale * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.6}
                          max={2.2}
                          step={0.1}
                          value={selectedOverlay.scale}
                          onChange={(e) => updateSelectedOverlay({ scale: Number(e.target.value) })}
                          className="w-full accent-[#2563EB]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-[#57534E] mb-1">
                          <span className="flex items-center gap-1">
                            <RotateCw size={13} /> Rotate Angle
                          </span>
                          <span>{selectedOverlay.rotation}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={5}
                          value={selectedOverlay.rotation}
                          onChange={(e) =>
                            updateSelectedOverlay({ rotation: Number(e.target.value) })
                          }
                          className="w-full accent-[#2563EB]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-[#57534E] mb-1">
                          <span>Appear At</span>
                          <span className="font-mono">{selectedOverlay.startTime.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, selectedOverlay.endTime - 0.5)}
                          step={0.5}
                          value={selectedOverlay.startTime}
                          onChange={(e) =>
                            updateSelectedOverlay({ startTime: Number(e.target.value) })
                          }
                          className="w-full accent-[#0D9488]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-[#57534E] mb-1">
                          <span>Disappear At</span>
                          <span className="font-mono">{selectedOverlay.endTime.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min={selectedOverlay.startTime + 0.5}
                          max={Math.max(1, trimEnd)}
                          step={0.5}
                          value={selectedOverlay.endTime}
                          onChange={(e) =>
                            updateSelectedOverlay({ endTime: Number(e.target.value) })
                          }
                          className="w-full accent-[#0D9488]"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#57534E] bg-white p-3 rounded-2xl border border-[#EFECE6]">
                    Tip: Add text above, then drag it anywhere on the video, pinch or use sliders to resize/rotate, and set when it appears on the timeline.
                  </p>
                )}
              </div>
            )}

            {/* 4. STICKERS TOOL (Emoji, Shapes, Labels & "Make a Sticker" from Photo) */}
            {activeTool === 'stickers' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {(
                      [
                        { id: 'emoji', label: 'Emoji' },
                        { id: 'shape', label: 'Shapes' },
                        { id: 'label', label: 'Labels' },
                        { id: 'custom', label: 'Make a Sticker ✨' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStickerSubTab(tab.id)}
                        className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                          stickerSubTab === tab.id
                            ? 'bg-[#2563EB] text-white'
                            : 'bg-white border border-[#EFECE6] text-[#1C1917]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {selectedSticker && (
                    <button
                      type="button"
                      onClick={() => {
                        recordUndoSnapshot();
                        setStickers((prev) => prev.filter((s) => s.id !== selectedSticker.id));
                        setSelectedStickerId(null);
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Delete Sticker</span>
                    </button>
                  )}
                </div>

                {stickerSubTab === 'emoji' && (
                  <div className="grid grid-cols-8 gap-2 bg-white p-3 rounded-2xl border border-[#EFECE6]">
                    {EMOJI_STICKERS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => addStickerItem('emoji', em)}
                        className="min-h-[44px] rounded-xl hover:bg-stone-100 text-2xl flex items-center justify-center transition cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                {stickerSubTab === 'shape' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {SHAPE_STICKERS.map((sh) => (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => addStickerItem('shape', sh.symbol, { labelBg: sh.bg })}
                        className="min-h-[52px] p-3 rounded-2xl bg-white border border-[#EFECE6] hover:border-[#2563EB] flex items-center gap-2.5 cursor-pointer"
                      >
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black ${sh.bg}`}
                        >
                          {sh.symbol}
                        </span>
                        <span className="text-xs font-extrabold text-[#1C1917]">{sh.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {stickerSubTab === 'label' && (
                  <div className="flex flex-wrap gap-2">
                    {LABEL_STICKERS.map((lbl) => (
                      <button
                        key={lbl.text}
                        type="button"
                        onClick={() => addStickerItem('label', lbl.text, { labelBg: lbl.bg })}
                        className={`min-h-[44px] px-4 py-2 rounded-2xl font-black text-xs shadow-xs cursor-pointer ${lbl.bg}`}
                      >
                        {lbl.text}
                      </button>
                    ))}
                  </div>
                )}

                {stickerSubTab === 'custom' && (
                  <div className="bg-white p-4 rounded-2xl border border-[#EFECE6] flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <h5 className="text-xs font-extrabold text-[#1C1917]">
                        Make a Sticker from Your Own Photo
                      </h5>
                      <p className="text-[11px] text-[#57534E]">
                        Choose a cutout shape and pick any photo to turn it into a draggable, resizable sticker:
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        {(
                          [
                            { id: 'circle', label: 'Circle' },
                            { id: 'squircle', label: 'Rounded' },
                            { id: 'heart', label: 'Heart' },
                            { id: 'star', label: 'Star' },
                          ] as const
                        ).map((sh) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => setCustomStickerShape(sh.id)}
                            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold border cursor-pointer ${
                              customStickerShape === sh.id
                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                : 'bg-[#FAF7F2] text-[#1C1917] border-[#EFECE6]'
                            }`}
                          >
                            {sh.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => stickerInputRef.current?.click()}
                      className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white font-extrabold text-xs flex items-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Upload size={16} />
                      <span>Pick Photo for Sticker</span>
                    </button>
                  </div>
                )}

                {selectedSticker && (
                  <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6] text-xs">
                    <div>
                      <div className="flex justify-between font-bold text-[#57534E] mb-1">
                        <span>Sticker Size</span>
                        <span>{Math.round(selectedSticker.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2.5}
                        step={0.1}
                        value={selectedSticker.scale}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStickers((prev) =>
                            prev.map((s) =>
                              s.id === selectedSticker.id ? { ...s, scale: val } : s
                            )
                          );
                        }}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold text-[#57534E] mb-1">
                        <span>Sticker Rotation</span>
                        <span>{selectedSticker.rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={5}
                        value={selectedSticker.rotation}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStickers((prev) =>
                            prev.map((s) =>
                              s.id === selectedSticker.id ? { ...s, rotation: val } : s
                            )
                          );
                        }}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. FILTERS & ADJUSTMENTS (Presets + Brightness, Contrast, Saturation) */}
            {activeTool === 'filters' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                    Color Filters & Sliders
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      recordUndoSnapshot();
                      setFilterPreset('none');
                      setBrightness(100);
                      setContrast(100);
                      setSaturation(100);
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-white border border-[#EFECE6] text-xs font-bold text-[#57534E] flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        recordUndoSnapshot();
                        setFilterPreset(preset.id);
                      }}
                      className={`min-h-[48px] px-3.5 py-2 rounded-2xl border text-left shrink-0 transition cursor-pointer ${
                        filterPreset === preset.id
                          ? 'bg-[#2563EB] border-[#2563EB] text-white'
                          : 'bg-white border-[#EFECE6] text-[#1C1917]'
                      }`}
                    >
                      <div className="text-xs font-extrabold">{preset.name}</div>
                      <div className="text-[10px] opacity-75">{preset.badge}</div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6] text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-[#57534E] mb-1">
                      <span className="flex items-center gap-1">
                        <Sun size={13} /> Brightness
                      </span>
                      <span>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between font-bold text-[#57534E] mb-1">
                      <span className="flex items-center gap-1">
                        <Contrast size={13} /> Contrast
                      </span>
                      <span>{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between font-bold text-[#57534E] mb-1">
                      <span className="flex items-center gap-1">
                        <Palette size={13} /> Saturation
                      </span>
                      <span>{saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full accent-[#0D9488]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 6. CAPTIONS TOOL (SpeechRecognition Auto-Captions + Editable List + Styles) */}
            {activeTool === 'captions' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleLiveSpeechCaptions}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                        isListeningCaptions
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-[#2563EB] text-white'
                      }`}
                    >
                      <Mic size={15} />
                      <span>
                        {isListeningCaptions ? 'Stop Speech Recognition' : 'Auto-Caption from Speech'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={generateSmartSyncedCaptions}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={14} className="text-[#2563EB]" />
                      <span>Quick Generate</span>
                    </button>
                  </div>

                  {/* Caption Visual Style Picker */}
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: 'yellow_pop', label: 'Yellow Pop' },
                        { id: 'classic', label: 'Classic' },
                        { id: 'neon', label: 'Neon' },
                        { id: 'minimal', label: 'Minimal' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setCaptionStyle(st.id)}
                        className={`min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-bold border cursor-pointer ${
                          captionStyle === st.id
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-[#57534E] border-[#EFECE6]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {captionStatusMsg && (
                  <p className="text-[11px] font-semibold text-[#2563EB]">{captionStatusMsg}</p>
                )}

                {/* Editable Captions List */}
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {captions.map((cap) => (
                    <div
                      key={cap.id}
                      className="flex items-center gap-2 bg-white p-2 rounded-xl border border-[#EFECE6]"
                    >
                      <input
                        type="text"
                        value={cap.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCaptions((prev) =>
                            prev.map((c) => (c.id === cap.id ? { ...c, text: val } : c))
                          );
                        }}
                        className="flex-1 text-xs font-bold text-[#1C1917] bg-transparent focus:outline-none"
                      />
                      <span className="text-[10px] font-mono text-[#57534E] shrink-0">
                        {cap.startTime.toFixed(1)}s–{cap.endTime.toFixed(1)}s
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCaptions((prev) => prev.filter((c) => c.id !== cap.id))
                        }
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. VOICEOVER RECORDER & FUN VOICE EFFECTS (Chipmunk, Deep, Robot, Echo) */}
            {activeTool === 'voice' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleVoiceoverRecording}
                      className={`min-h-[44px] px-4 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-2 transition cursor-pointer ${
                        isRecordingVoiceover
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-[#2563EB] text-white'
                      }`}
                    >
                      <Mic size={15} />
                      <span>
                        {isRecordingVoiceover
                          ? `Stop Recording (${voiceoverSeconds}s)`
                          : voiceoverUrl
                          ? 'Re-Record Voiceover'
                          : 'Record Voiceover'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePreviewVoiceEffect(voiceEffect)}
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {isPlayingVoicePreview ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isPlayingVoicePreview ? 'Stop Preview' : 'Test Voice Effect'}</span>
                    </button>
                  </div>
                </div>

                {/* Fun Voice Effect Presets */}
                <div className="grid grid-cols-5 gap-2">
                  {(
                    [
                      { id: 'none', label: 'Normal', icon: '🎙️' },
                      { id: 'chipmunk', label: 'Chipmunk', icon: '🐿️' },
                      { id: 'deep', label: 'Deep Bass', icon: '🦁' },
                      { id: 'robot', label: 'Robot', icon: '🤖' },
                      { id: 'echo', label: 'Stadium Echo', icon: '🏟️' },
                    ] as const
                  ).map((fx) => (
                    <button
                      key={fx.id}
                      type="button"
                      onClick={() => {
                        recordUndoSnapshot();
                        setVoiceEffect(fx.id);
                        handlePreviewVoiceEffect(fx.id);
                      }}
                      className={`min-h-[54px] p-2 rounded-2xl border flex flex-col items-center justify-center transition cursor-pointer ${
                        voiceEffect === fx.id
                          ? 'bg-[#2563EB] border-[#2563EB] text-white'
                          : 'bg-white border-[#EFECE6] text-[#1C1917]'
                      }`}
                    >
                      <span className="text-base">{fx.icon}</span>
                      <span className="text-[11px] font-extrabold mt-0.5">{fx.label}</span>
                    </button>
                  ))}
                </div>

                {/* Voiceover & Original Clip Volume Mix */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6] text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-[#57534E] mb-1">
                      <span>Original Clip Audio</span>
                      <span>{originalAudioVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={originalAudioVolume}
                      onChange={(e) => setOriginalAudioVolume(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between font-bold text-[#57534E] mb-1">
                      <span>Voiceover Level</span>
                      <span>{voiceoverVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={150}
                      value={voiceoverVolume}
                      onChange={(e) => setVoiceoverVolume(Number(e.target.value))}
                      className="w-full accent-[#0D9488]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 8. ROYALTY-FREE MUSIC & AUDIO MIXER */}
            {activeTool === 'music' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                      <ShieldCheck size={15} className="text-emerald-600" />
                      <span>100% Royalty-Free Music Library</span>
                    </h4>
                    <p className="text-[11px] text-[#57534E]">
                      Pick a safe track, trim the section that plays, and mix with original audio
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSongModalOpen(true)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Music size={14} />
                    <span>Browse All / Upload</span>
                  </button>
                </div>

                {/* Quick Royalty-Free Track Carousel */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {royaltyFreeCatalog.map((track) => {
                    const isPicked = selectedSong?.trackId === track.trackId;
                    return (
                      <button
                        key={track.trackId}
                        type="button"
                        onClick={() => {
                          setSelectedSong(track);
                          setSongStartTime(0);
                        }}
                        className={`min-h-[54px] px-3.5 py-2 rounded-2xl border text-left shrink-0 flex items-center gap-2.5 transition cursor-pointer ${
                          isPicked
                            ? 'bg-[#EEF2FF] border-[#2563EB] text-[#1C1917]'
                            : 'bg-white border-[#EFECE6] text-[#1C1917]'
                        }`}
                      >
                        <img
                          src={track.artworkUrl100}
                          alt={track.trackName}
                          className="w-9 h-9 rounded-xl object-cover"
                        />
                        <div>
                          <div className="text-xs font-extrabold truncate max-w-[140px]">
                            {track.trackName}
                          </div>
                          <div className="text-[10px] text-emerald-700 font-bold">
                            {track.genre} · Royalty-Free
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Trim Song Section & Mix Volumes */}
                {selectedSong && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-2xl border border-[#EFECE6] text-xs">
                    <div>
                      <div className="flex justify-between font-bold text-[#57534E] mb-1">
                        <span>Section Start</span>
                        <span className="font-mono">0:{songStartTime.toString().padStart(2, '0')}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={15}
                        step={1}
                        value={songStartTime}
                        onChange={(e) => setSongStartTime(Number(e.target.value))}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold text-[#57534E] mb-1">
                        <span>Music Volume</span>
                        <span>{songVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={songVolume}
                        onChange={(e) => setSongVolume(Number(e.target.value))}
                        className="w-full accent-[#0D9488]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold text-[#57534E] mb-1">
                        <span>Original Audio</span>
                        <span>{originalAudioVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={originalAudioVolume}
                        onChange={(e) => setOriginalAudioVolume(Number(e.target.value))}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 9. REACTION / DUET & COMEDY TEMPLATES */}
            {activeTool === 'duet_templates' && (
              <div className="space-y-3">
                {/* Reaction & Duet Mode Picker */}
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                    Reaction & Duet Layout
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'none', label: 'Off' },
                        { id: 'side_by_side', label: 'Beside (Split)' },
                        { id: 'top_bottom', label: 'Top / Bottom' },
                        { id: 'pip_behind', label: 'Behind / PiP' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          recordUndoSnapshot();
                          setDuetLayout(mode.id);
                        }}
                        className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                          duetLayout === mode.id
                            ? 'bg-[#2563EB] text-white border-[#2563EB]'
                            : 'bg-white text-[#1C1917] border-[#EFECE6]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pick WaveLink Video to React / Duet With */}
                {duetLayout !== 'none' && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {communityWaves.map((wave) => (
                      <button
                        key={wave.id}
                        type="button"
                        onClick={() => setSelectedDuetWave(wave)}
                        className={`min-h-[48px] px-3 py-2 rounded-xl border text-left shrink-0 flex items-center gap-2 cursor-pointer ${
                          selectedDuetWave.id === wave.id
                            ? 'bg-[#EEF2FF] border-[#2563EB]'
                            : 'bg-white border-[#EFECE6]'
                        }`}
                      >
                        <div className="text-xs">
                          <div className="font-extrabold text-[#1C1917]">@{wave.authorName}</div>
                          <div className="text-[10px] text-[#57534E] truncate max-w-[130px]">
                            {wave.caption}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Comedy Format Templates */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                    Comedy Format Templates
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(
                      [
                        { id: 'none', label: 'None' },
                        { id: 'split_screen', label: 'Split Screen' },
                        { id: 'before_after', label: 'Before & After' },
                        { id: 'countdown', label: '3-2-1 Countdown' },
                        { id: 'pov_meme', label: 'POV Header' },
                      ] as const
                    ).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          recordUndoSnapshot();
                          setComedyTemplate(tpl.id);
                          if (tpl.id === 'before_after') {
                            setTemplateTopLabel('BEFORE');
                            setTemplateBottomLabel('AFTER');
                          } else if (tpl.id === 'split_screen') {
                            setTemplateTopLabel('EXPECTATION');
                            setTemplateBottomLabel('REALITY');
                          }
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                          comedyTemplate === tpl.id
                            ? 'bg-amber-400 text-stone-950 border-amber-500'
                            : 'bg-white text-[#1C1917] border-[#EFECE6]'
                        }`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SCROLLABLE MOBILE BOTTOM TOOLBAR (Big Tap Targets >= 48px) */}
          <div className="px-3 py-2.5 bg-white border-t border-[#EFECE6] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {(
              [
                { id: 'trim', label: 'Trim & Split', icon: Scissors },
                { id: 'speed', label: 'Speed', icon: Gauge },
                { id: 'text', label: 'Text', icon: Type },
                { id: 'stickers', label: 'Stickers', icon: Smile },
                { id: 'filters', label: 'Filters', icon: Sliders },
                { id: 'captions', label: 'Captions', icon: Subtitles },
                { id: 'voice', label: 'Voice FX', icon: Mic },
                { id: 'music', label: 'Music', icon: Music },
                { id: 'duet_templates', label: 'Duet & Comedy', icon: SplitSquareHorizontal },
              ] as const
            ).map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  className={`min-w-[74px] min-h-[54px] px-3 py-2 rounded-2xl flex flex-col items-center justify-center gap-1 shrink-0 transition cursor-pointer ${
                    isActive
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  <Icon size={17} />
                  <span className="text-[11px] font-extrabold whitespace-nowrap">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: HASHTAGS, CAPTION, AUDIENCE & CLOUDINARY PROGRESS EXPORT      */}
      {/* ===================================================================== */}
      {step === 3 && (
        <div className="bg-white rounded-3xl border border-[#EFECE6] shadow-sm p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#EFECE6] pb-3.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-center text-[#1C1917] cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <h2 className="text-base font-extrabold text-[#1C1917]">
                  Caption, Hashtags & Privacy
                </h2>
                <p className="text-xs text-[#57534E]">
                  Choose who can see your wave and export to feed
                </p>
              </div>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold">
              {isProCreator ? 'Pro · 90s Limit' : 'Free · 60s Limit'}
            </span>
          </div>

          {/* Summary Card */}
          <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center gap-3.5">
            {previewUrl && (
              <div className="w-16 h-20 rounded-xl overflow-hidden bg-stone-900 shrink-0">
                {mediaType === 'video' ? (
                  <video src={previewUrl} muted className="w-full h-full object-cover" />
                ) : (
                  <img src={previewUrl} alt="Thumb" className="w-full h-full object-cover" />
                )}
              </div>
            )}
            <div className="space-y-1 text-xs flex-1 min-w-0">
              <div className="font-extrabold text-[#1C1917]">
                {mediaType === 'video'
                  ? `Edited Video Clip (${Math.max(1, Math.round(trimEnd - trimStart))}s / ${maxAllowedSeconds}s max)`
                  : mediaType === 'image'
                  ? 'Edited Studio Photo'
                  : 'Text Wave Post'}
              </div>
              {selectedSong && (
                <div className="text-emerald-700 font-bold flex items-center gap-1 truncate">
                  <Music size={12} />
                  <span>
                    {selectedSong.trackName} — {selectedSong.artistName} (Royalty-Free)
                  </span>
                </div>
              )}
              <div className="text-[11px] text-[#57534E] flex flex-wrap gap-2">
                <span>Speed: {playbackSpeed}x</span>
                {overlays.length > 0 && <span>· {overlays.length} Text layers</span>}
                {stickers.length > 0 && <span>· {stickers.length} Stickers</span>}
                {duetLayout !== 'none' && <span>· Duet (@{selectedDuetWave.authorName})</span>}
              </div>
            </div>
          </div>

          {/* Caption & Hashtag Composer */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider">
                Caption & Hashtags
              </label>
              <button
                type="button"
                onClick={handleSmartCaptionGenerate}
                disabled={isGeneratingCaption}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#2563EB] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>{isGeneratingCaption ? 'Writing...' : 'Auto-Write Caption'}</span>
              </button>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Write a caption, add #hashtags or @mentions..."
              className="w-full p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-sm text-[#1C1917] focus:outline-none focus:border-[#2563EB]"
            />

            {/* Quick Hashtag & @Mention Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCaption((prev) => `${prev} @`)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-[#EFECE6] text-xs font-bold text-[#2563EB] flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <AtSign size={13} />
                <span>Mention</span>
              </button>
              {QUICK_HASHTAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setCaption((prev) => (prev.includes(tag) ? prev : `${prev.trim()} ${tag}`))
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#FAF7F2] border border-[#EFECE6] hover:border-[#2563EB] text-xs font-bold text-[#1C1917] shrink-0 cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Choice of Who Can See It (Audience Selector) */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-[#1C1917] uppercase tracking-wider block">
              Who can see this post?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'public', label: 'Everyone (Public)', sub: 'Visible on Feed & Explore', icon: Globe },
                  { id: 'followers', label: 'Followers Only', sub: 'Only people following you', icon: Users },
                  { id: 'close_friends', label: 'Close Friends', sub: 'Private inner circle', icon: Lock },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = audience === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudience(opt.id)}
                    className={`min-h-[56px] p-3 rounded-2xl border text-left flex items-center gap-3 transition cursor-pointer ${
                      active
                        ? 'bg-[#EEF2FF] border-[#2563EB] text-[#1C1917]'
                        : 'bg-[#FAF7F2] border-[#EFECE6] text-[#57534E]'
                    }`}
                  >
                    <Icon size={18} className={active ? 'text-[#2563EB]' : 'text-[#78716C]'} />
                    <div>
                      <div className="text-xs font-extrabold text-[#1C1917]">{opt.label}</div>
                      <div className="text-[10px] text-[#57534E]">{opt.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location & Comments Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-[#FAF7F2] border border-[#EFECE6] rounded-2xl px-3.5 min-h-[48px]">
              <MapPin size={16} className="text-[#2563EB] shrink-0" />
              <input
                type="text"
                value={locationTag}
                onChange={(e) => setLocationTag(e.target.value)}
                placeholder="Add location (optional)"
                className="w-full text-xs font-semibold text-[#1C1917] bg-transparent focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setAllowComments(!allowComments)}
              className="min-h-[48px] px-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between text-xs font-bold text-[#1C1917] cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <MessageSquare size={16} className="text-[#0D9488]" />
                <span>Allow Comments</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                  allowComments ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                }`}
              >
                {allowComments ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          {/* Cloudinary Upload Progress Bar */}
          {isPublishing && (
            <div className="space-y-1.5 bg-blue-50 border border-blue-200 p-3.5 rounded-2xl">
              <div className="flex justify-between text-xs font-extrabold text-[#2563EB]">
                <span className="flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" />
                  <span>{uploadStatusText || 'Uploading to Cloudinary...'}</span>
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  style={{ width: `${uploadProgress}%` }}
                  className="h-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] transition-all duration-300"
                />
              </div>
            </div>
          )}

          {/* Primary Export & Publish Button */}
          <div style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
            <button
              type="button"
              disabled={isPublishing || (!selectedFile && !caption.trim())}
              onClick={handlePublish}
              className="w-full min-h-[54px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50 active:scale-[0.99] transition cursor-pointer"
            >
              {isPublishing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{uploadStatusText || `Uploading (${uploadProgress}%)...`}</span>
                </>
              ) : publishSuccess ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Published to WaveLink!</span>
                </>
              ) : canRetryUpload ? (
                <>
                  <RotateCcw size={18} />
                  <span>Retry Upload to Cloudinary</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span>Export & Publish Wave</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Live Preview Modal */}
      {isFullPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm flex items-center justify-between text-white mb-3">
            <span className="text-sm font-extrabold">Live Full Preview</span>
            <button
              type="button"
              onClick={() => setIsFullPreviewOpen(false)}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/15 flex items-center justify-center cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <div className="relative w-full max-w-[450px] aspect-[9/16] rounded-3xl overflow-hidden bg-stone-950 border border-white/20 flex items-center justify-center">
            {previewUrl &&
              (mediaType === 'video' ? (
                <>
                  <video
                    src={previewUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-hidden="true"
                    style={{ filter: getCombinedFilterStyle() }}
                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50 pointer-events-none"
                  />
                  <video
                    src={previewUrl}
                    autoPlay
                    loop
                    playsInline
                    style={{ filter: getCombinedFilterStyle() }}
                    className="relative z-10 w-full h-full object-contain"
                  />
                </>
              ) : (
                <>
                  <img
                    src={previewUrl}
                    alt=""
                    aria-hidden="true"
                    style={{ filter: getCombinedFilterStyle() }}
                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50 pointer-events-none"
                  />
                  <img
                    src={previewUrl}
                    alt="Full preview"
                    style={{ filter: getCombinedFilterStyle() }}
                    className="relative z-10 w-full h-full object-contain"
                  />
                </>
              ))}
          </div>
        </div>
      )}

      {/* Royalty-Free Music Selector Modal */}
      <SongSelectorModal
        isOpen={isSongModalOpen}
        onClose={() => setIsSongModalOpen(false)}
        selectedSongId={selectedSong?.trackId}
        onSelectSong={(song) => {
          recordUndoSnapshot();
          setSelectedSong(song);
          setSongStartTime(song.startTime ?? 0);
          setSongVolume(song.volume ?? 85);
        }}
      />
    </div>
  );
};
