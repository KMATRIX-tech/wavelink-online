import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, cleanFirestoreData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { OnlineSong } from '../types';
import { generatePostCaptions } from '../services/geminiService';
import {
  compressImage,
  generateVideoThumbnail,
  cloneVideoFileToMemory,
  inspectAndValidateVideoFile,
  detectFeedMediaType,
  getMaxVideoDurationSeconds,
  MAX_VIDEO_RAW_MB,
} from '../utils/mediaStorage';
import { enqueueVideoUploadJob } from '../services/videoUploadQueue';
import { VideoUploadProgressChip } from './VideoUploadProgressChip';
import { SongSelectorModal } from './SongSelectorModal';
import { SongPlayerCard } from './SongPlayerCard';
import {
  Wand2,
  Image as ImageIcon,
  Video as VideoIcon,
  Type,
  Sliders,
  Music,
  Send,
  Camera,
  Trash2,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Crop,
  Scissors,
  Eye,
  Globe,
  Users,
  Heart,
  MapPin,
  MessageSquare,
  MessageSquareOff,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Hash,
  AtSign,
  ArrowLeft,
  Film
} from 'lucide-react';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  color: string;
  bgColor: 'none' | 'dark' | 'light' | 'gradient';
  fontStyle: 'sans' | 'display' | 'mono' | 'hand';
}

interface FilterPreset {
  name: string;
  label: string;
  brightness: number;
  contrast: number;
  saturate: number;
  sepia: number;
  grayscale: number;
}

const FILTER_PRESETS: FilterPreset[] = [
  { name: 'Normal', label: 'Original', brightness: 100, contrast: 100, saturate: 100, sepia: 0, grayscale: 0 },
  { name: 'Vibrant', label: 'Vibrant', brightness: 105, contrast: 112, saturate: 140, sepia: 0, grayscale: 0 },
  { name: 'Neon', label: 'Cyber', brightness: 102, contrast: 125, saturate: 160, sepia: 0, grayscale: 0 },
  { name: 'Golden', label: 'Warm', brightness: 105, contrast: 105, saturate: 130, sepia: 28, grayscale: 0 },
  { name: 'Noir', label: 'B&W', brightness: 96, contrast: 122, saturate: 0, sepia: 0, grayscale: 100 },
  { name: 'Vintage', label: 'Film', brightness: 96, contrast: 95, saturate: 90, sepia: 42, grayscale: 0 },
  { name: 'Cinema', label: 'Cinema', brightness: 102, contrast: 118, saturate: 125, sepia: 12, grayscale: 0 }
];

const STICKER_PRESETS = [
  '🔥',
  '🌊',
  '⚡',
  '✨',
  '💯',
  '❤️',
  '🚀',
  '👑',
  '🎧',
  '📸',
  '🔥 LIT',
  '🌊 WAVE',
  '✨ VIBES',
  '⚡ LIVE',
  '👑 ICONIC',
  '🌙 NIGHT'
];

const HASHTAG_SUGGESTIONS = [
  '#WaveLink',
  '#NewWave',
  '#CreatorVibes',
  '#DailyDrop',
  '#MusicVibes',
  '#BehindTheScenes',
  '#TrendingNow',
  '#Aesthetic'
];

const MENTION_SUGGESTIONS = [
  '@wavelink',
  '@creators',
  '@musicclub',
  '@designers',
  '@featured',
  '@bestfriends'
];

const LOCATION_PRESETS = [
  'Los Angeles, CA',
  'New York, NY',
  'London, UK',
  'Tokyo, JP',
  'Miami, FL',
  'Studio Session'
];

type ToolTab = 'crop' | 'filters' | 'trim' | 'text' | 'stickers' | 'music';

interface StudioEditorViewProps {
  onNavigateToFeed: () => void;
}

export const StudioEditorView: React.FC<StudioEditorViewProps> = ({ onNavigateToFeed }) => {
  const { currentUser, userProfile, isAdmin, isProEffective } = useAuth();
  const isProUser = isProEffective;
  const isProTier = Boolean(isProEffective || isAdmin);
  const maxVideoSeconds = getMaxVideoDurationSeconds(isProTier);

  // Media state (supports single photo, multi-photo carousel, or video)
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');

  // Crop & Aspect Ratio ('1:1' | '4:5' | '9:16')
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '9:16'>('4:5');

  // Video Trim & Cover / Thumbnail
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [videoTrimStart, setVideoTrimStart] = useState<number>(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState<number>(30);
  const [videoCoverTime, setVideoCoverTime] = useState<number>(0.5);
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState<string>('');

  // Active Tool Tab
  const [activeTool, setActiveTool] = useState<ToolTab>('filters');

  // Text Overlays & Stickers
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [newTextString, setNewTextString] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textBgColor, setTextBgColor] = useState<'none' | 'dark' | 'light' | 'gradient'>('dark');
  const [textFontSize, setTextFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [textFontStyle, setTextFontStyle] = useState<'sans' | 'display' | 'mono' | 'hand'>('display');

  // Filters & Adjustments
  const [activeFilter, setActiveFilter] = useState<FilterPreset>(FILTER_PRESETS[0]);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  // Soundtrack with clip start & volume
  const [selectedSong, setSelectedSong] = useState<OnlineSong | null>(null);
  const [songStartTime, setSongStartTime] = useState<number>(0);
  const [songVolume, setSongVolume] = useState<number>(85);
  const [isSongSelectorOpen, setIsSongSelectorOpen] = useState(false);

  // Caption, Smart AI Captions, Hashtag/Mention suggestions
  const [caption, setCaption] = useState('');
  const [smartCaptions, setSmartCaptions] = useState<string[]>([]);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<'none' | 'hashtag' | 'mention'>('none');

  // Post Metadata: Audience, Location, Comments toggle
  const [audience, setAudience] = useState<'public' | 'followers' | 'close_friends'>('public');
  const [locationTag, setLocationTag] = useState<string>('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [allowComments, setAllowComments] = useState<boolean>(true);

  // Draft & Full Feed Preview Modal
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Upload / Publish state with error + retry
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addCarouselInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const draftStorageKey = currentUser ? `wavelink_studio_draft_${currentUser.uid}` : 'wavelink_studio_draft_guest';

  // Restore saved draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.caption) setCaption(draft.caption);
      if (draft.aspectRatio) setAspectRatio(draft.aspectRatio);
      if (draft.audience) setAudience(draft.audience);
      if (draft.locationTag) setLocationTag(draft.locationTag);
      if (typeof draft.allowComments === 'boolean') setAllowComments(draft.allowComments);
      if (draft.selectedSong) setSelectedSong(draft.selectedSong);
      if (typeof draft.songStartTime === 'number') setSongStartTime(draft.songStartTime);
      if (typeof draft.songVolume === 'number') setSongVolume(draft.songVolume);
      if (Array.isArray(draft.textOverlays)) setTextOverlays(draft.textOverlays);
      if (typeof draft.brightness === 'number') setBrightness(draft.brightness);
      if (typeof draft.contrast === 'number') setContrast(draft.contrast);
      if (draft.mediaType === 'image' && Array.isArray(draft.carouselImages) && draft.carouselImages.length > 0) {
        setMediaType('image');
        setCarouselImages(draft.carouselImages);
        setMediaUrl(draft.carouselImages[0]);
      }
      setDraftSavedAt('Saved');
    } catch {
      // Ignore corrupt draft
    }
  }, [draftStorageKey]);

  // Auto-save draft whenever key state changes
  useEffect(() => {
    const hasContent =
      Boolean(caption.trim()) ||
      Boolean(selectedSong) ||
      textOverlays.length > 0 ||
      carouselImages.length > 0 ||
      Boolean(locationTag.trim());

    if (!hasContent) return;

    const timer = window.setTimeout(() => {
      try {
        const draftPayload = {
          caption,
          aspectRatio,
          audience,
          locationTag,
          allowComments,
          selectedSong,
          songStartTime,
          songVolume,
          textOverlays,
          brightness,
          contrast,
          mediaType: mediaType === 'image' ? 'image' : 'none',
          carouselImages: mediaType === 'image' ? carouselImages.slice(0, 4) : []
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
        setDraftSavedAt('Draft saved');
      } catch {
        // Storage quota full — save lightweight metadata only
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    caption,
    aspectRatio,
    audience,
    locationTag,
    allowComments,
    selectedSong,
    songStartTime,
    songVolume,
    textOverlays,
    brightness,
    contrast,
    mediaType,
    carouselImages,
    draftStorageKey
  ]);

  // Keep video preview playback inside trim range
  const handleVideoTimeUpdate = () => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    if (vid.currentTime < videoTrimStart) {
      vid.currentTime = videoTrimStart;
    } else if (videoTrimEnd > videoTrimStart && vid.currentTime >= videoTrimEnd) {
      vid.currentTime = videoTrimStart;
    }
  };

  // Capture video frame at time for cover thumbnail
  const handleCaptureVideoCoverAt = (timeSec: number) => {
    setVideoCoverTime(timeSec);
    const vid = videoPreviewRef.current;
    if (!vid) return;
    vid.currentTime = timeSec;
    window.setTimeout(() => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = vid.videoWidth || 640;
        canvas.height = vid.videoHeight || 640;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.filter = getFilterStyleString();
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            setCustomThumbnailUrl(dataUrl);
          }
        }
      } catch {
        // Ignore cross-origin canvas error if any
      }
    }, 180);
  };

  // Handle single or multiple file selection
  const handleMediaFilesSelect = async (files: FileList | File[], appendToCarousel = false) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setStudioNotice(null);
    setPublishError(null);

    const firstFile = fileArray[0];
    const detected = detectFeedMediaType(firstFile);
    const isVid = detected === 'video' && !appendToCarousel;
    const isImg = detected === 'image';

    if (!isVid && !isImg) {
      setStudioNotice('Select a photo (JPG, PNG, WebP) or video (MP4, WebM, MOV).');
      return;
    }

    if (isVid) {
      const inspection = await inspectAndValidateVideoFile(firstFile, isProTier);
      if (inspection.tooLarge || (!inspection.valid && !inspection.needsTrim)) {
        setStudioNotice(
          inspection.error ||
            `This video is larger than the ${MAX_VIDEO_RAW_MB} MB maximum size limit. Please choose a smaller video.`
        );
        return;
      }

      const safeVideo = await cloneVideoFileToMemory(firstFile);
      const rawDuration = Math.max(1, Math.round(inspection.durationSeconds || 30));
      setOriginalFile(safeVideo);
      setFileName(safeVideo.name);
      setMediaType('video');
      setCarouselImages([]);
      const objectUrl = URL.createObjectURL(safeVideo);
      setMediaUrl(objectUrl);
      setVideoDuration(rawDuration);
      setVideoTrimStart(0);
      setVideoTrimEnd(Math.min(maxVideoSeconds, rawDuration));
      setVideoCoverTime(Math.min(1.0, rawDuration));
      setActiveTool('trim');

      if (inspection.needsTrim || rawDuration > maxVideoSeconds) {
        setStudioNotice(
          isProTier
            ? `Pro videos can be up to 90 seconds (yours is ${rawDuration}s). Use the Trim sliders below to select any 90-second clip.`
            : `Free accounts can upload videos up to 60 seconds, or up to 90 seconds with Pro (yours is ${rawDuration}s). Use the Trim sliders below to select a ${maxVideoSeconds}-second clip.`
        );
      }

      const thumb = await generateVideoThumbnail(safeVideo, 1.0);
      if (thumb) setCustomThumbnailUrl(thumb);
      return;
    }

    // Handle one or multiple images (carousel up to 8 slides)
    const imageFiles = fileArray.filter((f) => detectFeedMediaType(f) === 'image').slice(0, 8);
    if (imageFiles.length === 0) return;

    const compressedSlides: string[] = [];
    for (const imgFile of imageFiles) {
      if (imgFile.size > 50 * 1024 * 1024) continue;
      const safeImage = await cloneVideoFileToMemory(imgFile);
      if (!originalFile) {
        setOriginalFile(safeImage);
        setFileName(safeImage.name);
      }
      const compressed = await compressImage(safeImage, 1280, 1280, 0.82);
      compressedSlides.push(compressed || URL.createObjectURL(safeImage));
    }

    if (compressedSlides.length > 0) {
      setMediaType('image');
      setCarouselImages((prev) => {
        const next = appendToCarousel ? [...prev, ...compressedSlides].slice(0, 8) : compressedSlides;
        setActiveSlideIndex(appendToCarousel ? next.length - 1 : 0);
        setMediaUrl(next[appendToCarousel ? next.length - 1 : 0]);
        return next;
      });
    }
  };

  const handleRemoveCurrentSlide = () => {
    if (mediaType === 'video') {
      setMediaUrl('');
      setMediaType('none');
      setOriginalFile(null);
      setCustomThumbnailUrl('');
      return;
    }
    if (carouselImages.length <= 1) {
      setCarouselImages([]);
      setMediaUrl('');
      setMediaType('none');
      setOriginalFile(null);
      setActiveSlideIndex(0);
      return;
    }
    const updated = carouselImages.filter((_, idx) => idx !== activeSlideIndex);
    const nextIdx = Math.min(activeSlideIndex, updated.length - 1);
    setCarouselImages(updated);
    setActiveSlideIndex(nextIdx);
    setMediaUrl(updated[nextIdx]);
  };

  const handleClearAll = () => {
    setMediaUrl('');
    setCarouselImages([]);
    setActiveSlideIndex(0);
    setMediaType('none');
    setOriginalFile(null);
    setTextOverlays([]);
    setActiveFilter(FILTER_PRESETS[0]);
    setBrightness(100);
    setContrast(100);
    setSelectedSong(null);
    setCaption('');
    setLocationTag('');
    setCustomThumbnailUrl('');
    setPublishError(null);
    setStudioNotice(null);
    try {
      localStorage.removeItem(draftStorageKey);
      setDraftSavedAt(null);
    } catch {
      // ignore
    }
  };

  // Add text overlay
  const handleAddTextOverlay = () => {
    if (!newTextString.trim()) return;
    const newOverlay: TextOverlay = {
      id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: newTextString.trim(),
      x: 50,
      y: 45 + ((textOverlays.length * 10) % 35),
      fontSize: textFontSize,
      color: textColor,
      bgColor: textBgColor,
      fontStyle: textFontStyle
    };
    setTextOverlays((prev) => [...prev, newOverlay]);
    setActiveTextId(newOverlay.id);
    setNewTextString('');
  };

  // Add sticker / emoji
  const handleAddSticker = (stickerText: string) => {
    const isSingleEmoji = stickerText.length <= 3;
    const newOverlay: TextOverlay = {
      id: `stk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: stickerText,
      x: 35 + ((textOverlays.length * 15) % 40),
      y: 35 + ((textOverlays.length * 12) % 40),
      fontSize: 'xl',
      color: '#FFFFFF',
      bgColor: isSingleEmoji ? 'none' : 'gradient',
      fontStyle: 'display'
    };
    setTextOverlays((prev) => [...prev, newOverlay]);
    setActiveTextId(newOverlay.id);
  };

  const handleRemoveTextOverlay = (id: string) => {
    setTextOverlays((prev) => prev.filter((o) => o.id !== id));
    if (activeTextId === id) setActiveTextId(null);
  };

  const handleUpdatePosition = (id: string, xPercent: number, yPercent: number) => {
    setTextOverlays((prev) =>
      prev.map((item) => (item.id === id ? { ...item, x: xPercent, y: yPercent } : item))
    );
  };

  // Live CSS filter string
  const getFilterStyleString = () => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${activeFilter.saturate}%) ${
      activeFilter.sepia ? `sepia(${activeFilter.sepia}%)` : ''
    } ${activeFilter.grayscale ? `grayscale(${activeFilter.grayscale}%)` : ''}`.trim();
  };

  // Aspect ratio CSS helper
  const getAspectFrameClass = () => {
    if (aspectRatio === '1:1') return 'aspect-square max-h-[420px]';
    if (aspectRatio === '9:16') return 'aspect-[9/16] max-h-[480px]';
    return 'aspect-[4/5] max-h-[450px]';
  };

  // Render composite image with crop aspect ratio, filters, and text/sticker overlays
  const renderCompositeSlide = (sourceUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      if (!sourceUrl) {
        resolve(sourceUrl);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const targetRatio =
          aspectRatio === '1:1' ? 1 : aspectRatio === '9:16' ? 9 / 16 : 4 / 5;
        const srcRatio = img.width / img.height;

        let cropWidth = img.width;
        let cropHeight = img.height;
        let cropX = 0;
        let cropY = 0;

        if (srcRatio > targetRatio) {
          cropWidth = Math.round(img.height * targetRatio);
          cropX = Math.round((img.width - cropWidth) / 2);
        } else if (srcRatio < targetRatio) {
          cropHeight = Math.round(img.width / targetRatio);
          cropY = Math.round((img.height - cropHeight) / 2);
        }

        const maxDim = 1080;
        const scale = Math.min(1, maxDim / Math.max(cropWidth, cropHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(cropWidth * scale));
        canvas.height = Math.max(1, Math.round(cropHeight * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }

        ctx.filter = getFilterStyleString();
        ctx.drawImage(
          img,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        ctx.filter = 'none';

        textOverlays.forEach((overlay) => {
          const pixelX = (overlay.x / 100) * canvas.width;
          const pixelY = (overlay.y / 100) * canvas.height;

          let sizePx = Math.max(24, Math.round(canvas.width * 0.055));
          if (overlay.fontSize === 'sm') sizePx = Math.round(canvas.width * 0.038);
          if (overlay.fontSize === 'md') sizePx = Math.round(canvas.width * 0.048);
          if (overlay.fontSize === 'xl') sizePx = Math.round(canvas.width * 0.075);

          let fontFam = 'system-ui, sans-serif';
          if (overlay.fontStyle === 'display') fontFam = '"Plus Jakarta Sans", system-ui, sans-serif';
          if (overlay.fontStyle === 'mono') fontFam = '"JetBrains Mono", monospace';
          if (overlay.fontStyle === 'hand') fontFam = 'cursive, sans-serif';

          ctx.font = `800 ${sizePx}px ${fontFam}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const metrics = ctx.measureText(overlay.text);
          const paddingX = sizePx * 0.45;
          const paddingY = sizePx * 0.28;
          const bgWidth = metrics.width + paddingX * 2;
          const bgHeight = sizePx + paddingY * 2;

          if (overlay.bgColor !== 'none') {
            ctx.save();
            if (overlay.bgColor === 'dark') {
              ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            } else if (overlay.bgColor === 'light') {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            } else if (overlay.bgColor === 'gradient') {
              const grad = ctx.createLinearGradient(
                pixelX - bgWidth / 2,
                pixelY,
                pixelX + bgWidth / 2,
                pixelY
              );
              grad.addColorStop(0, '#2563EB');
              grad.addColorStop(1, '#10B981');
              ctx.fillStyle = grad;
            }

            const r = Math.min(16, bgHeight / 2);
            ctx.beginPath();
            ctx.roundRect(pixelX - bgWidth / 2, pixelY - bgHeight / 2, bgWidth, bgHeight, r);
            ctx.fill();
            ctx.restore();
          }

          ctx.save();
          ctx.fillStyle = overlay.bgColor === 'light' ? '#0F172A' : overlay.color;
          if (overlay.bgColor === 'none') {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
          }
          ctx.fillText(overlay.text, pixelX, pixelY);
          ctx.restore();
        });

        let finalDataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (finalDataUrl.length > 350 * 1024) {
          finalDataUrl = canvas.toDataURL('image/jpeg', 0.62);
        }
        if (finalDataUrl.length > 350 * 1024) {
          finalDataUrl = canvas.toDataURL('image/jpeg', 0.48);
        }
        resolve(finalDataUrl);
      };

      img.onerror = () => resolve(sourceUrl);
      img.src = sourceUrl;
    });
  };

  // Smart Caption AI generator
  const handleSmartCaption = async () => {
    setIsGeneratingCaptions(true);
    try {
      const contextStr = [
        caption.trim(),
        selectedSong ? `Song: ${selectedSong.trackName} by ${selectedSong.artistName}` : '',
        locationTag ? `Location: ${locationTag}` : '',
        textOverlays.map((t) => t.text).join(' '),
        mediaType !== 'none' ? `${mediaType} post` : 'WaveLink social post'
      ]
        .filter(Boolean)
        .join(' | ');

      const suggestions = await generatePostCaptions({
        text: contextStr || 'Sharing a moment on WaveLink',
        mediaType: mediaType === 'none' ? 'text' : mediaType,
        tone: 'engaging',
        isPro: Boolean(isProUser || isAdmin)
      });
      if (suggestions && suggestions.length > 0) {
        setSmartCaptions(suggestions);
      }
    } catch {
      setSmartCaptions([
        'Caught in the wave 🌊✨ #WaveLink #Vibes',
        'Turning moments into memories ⚡ #CreatorVibes',
        'Sound on for this one 🎧🔥 #NewWave'
      ]);
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Caption change handler with # and @ detection
  const handleCaptionChange = (val: string) => {
    setCaption(val);
    const words = val.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    if (lastWord.startsWith('#')) {
      setSuggestionMode('hashtag');
    } else if (lastWord.startsWith('@')) {
      setSuggestionMode('mention');
    } else {
      setSuggestionMode('none');
    }
  };

  const handleInsertTagOrMention = (token: string) => {
    const trimmed = caption.trimEnd();
    const words = trimmed ? trimmed.split(/\s+/) : [];
    const lastWord = words[words.length - 1] || '';
    if (
      (token.startsWith('#') && lastWord.startsWith('#')) ||
      (token.startsWith('@') && lastWord.startsWith('@'))
    ) {
      words[words.length - 1] = token;
      setCaption(`${words.join(' ')} `);
    } else {
      setCaption(trimmed ? `${trimmed} ${token} ` : `${token} `);
    }
    setSuggestionMode('none');
  };

  // Publish to Feed with Progress Bar & Retry support
  const handlePublishToFeed = async () => {
    if (!currentUser) return;
    const hasMedia = mediaType !== 'none' && (Boolean(mediaUrl) || carouselImages.length > 0);
    if (!hasMedia && !caption.trim() && !selectedSong) {
      setStudioNotice('Add a photo, video, music track, or caption to post.');
      return;
    }

    setIsPublishing(true);
    setPublishProgress(12);
    setPublishError(null);
    setStudioNotice(null);

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const extractedHashtags = Array.from(
        new Set(
          (caption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.replace(/^#/, ''))
        )
      );

      const postPayload: Record<string, any> = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Creator',
        authorUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        content: caption.trim(),
        mediaType: mediaType === 'none' ? undefined : mediaType,
        aspectRatio,
        audience,
        locationTag: locationTag.trim() || undefined,
        allowComments,
        hashtags: extractedHashtags.length > 0 ? extractedHashtags : undefined,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        savesCount: 0,
        createdAt: new Date().toISOString()
      };

      if (selectedSong) {
        postPayload.songTitle = selectedSong.trackName;
        postPayload.songArtist = selectedSong.artistName;
        postPayload.songAlbumArt = selectedSong.artworkUrl100;
        postPayload.songPreviewUrl = selectedSong.previewUrl;
        postPayload.songStartTime = songStartTime;
        postPayload.songVolume = songVolume;
        if (selectedSong.collectionName) {
          postPayload.songAlbumName = selectedSong.collectionName;
        }
      }

      if (mediaType === 'image') {
        setPublishProgress(35);
        const slidesToExport = carouselImages.length > 0 ? carouselImages : [mediaUrl];
        const renderedSlides: string[] = [];

        for (let i = 0; i < slidesToExport.length; i++) {
          const composite = await renderCompositeSlide(slidesToExport[i]);
          renderedSlides.push(composite);
          setPublishProgress(35 + Math.round(((i + 1) / slidesToExport.length) * 45));
        }

        postPayload.imageUrl = renderedSlides[0];
        if (renderedSlides.length > 1) {
          postPayload.imageUrls = renderedSlides;
        }
        setPublishProgress(85);
      } else if (mediaType === 'video') {
        const selectedClipLength = Math.max(0, videoTrimEnd - videoTrimStart);
        if (selectedClipLength > maxVideoSeconds + 0.5) {
          setStudioNotice(
            isProTier
              ? 'Pro videos can be up to 90 seconds. Please trim your video to 90 seconds or less.'
              : 'Free accounts can upload videos up to 60 seconds (90s for Pro). Please trim your video to 60 seconds or less.'
          );
          setActiveTool('trim');
          setVideoTrimEnd(Math.min(videoDuration, videoTrimStart + maxVideoSeconds));
          setIsPublishing(false);
          return;
        }

        if (originalFile) {
          const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';
          enqueueVideoUploadJob({
            file: originalFile,
            authorId: currentUser.uid,
            authorEmail: currentUser.email || '',
            authorName: userProfile?.displayName || currentUser.displayName || 'Creator',
            authorUsername: userProfile?.username || `@${emailPrefix}`,
            authorPhotoURL:
              userProfile?.photoURL ||
              currentUser.photoURL ||
              `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
            content: caption.trim(),
            aspectRatio,
            audience,
            locationTag: locationTag.trim() || undefined,
            allowComments,
            hashtags: extractedHashtags.length > 0 ? extractedHashtags : undefined,
            trimStart: videoTrimStart,
            trimEnd: videoTrimEnd,
            customThumbnailDataUrl: customThumbnailUrl || undefined,
            isProUser: isProTier,
            songMetadata: selectedSong
              ? {
                  songTitle: selectedSong.trackName,
                  songArtist: selectedSong.artistName,
                  songAlbumArt: selectedSong.artworkUrl100,
                  songPreviewUrl: selectedSong.previewUrl,
                  songStartTime,
                  songVolume,
                  songAlbumName: selectedSong.collectionName,
                }
              : undefined,
          });

          try {
            localStorage.removeItem(draftStorageKey);
          } catch {
            // ignore
          }
          setPublishProgress(100);
          setPublishSuccess(true);
          onNavigateToFeed();
          return;
        } else if (mediaUrl && !mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('data:')) {
          postPayload.videoUrl = mediaUrl;
          postPayload.thumbnailUrl = customThumbnailUrl || '';
          postPayload.duration = Math.min(
            maxVideoSeconds,
            Math.max(1, Math.round(videoTrimEnd - videoTrimStart))
          );
          postPayload.videoDurationSeconds = postPayload.duration;
          postPayload.hasVideoChunks = false;
        }
      }

      const writePromise = setDoc(doc(db, 'posts', postId), cleanFirestoreData(postPayload));
      const writeTimeout = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 6000)
      );
      await Promise.race([writePromise, writeTimeout]);

      setPublishProgress(100);
      setPublishSuccess(true);
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }

      setTimeout(() => {
        onNavigateToFeed();
      }, 800);
    } catch (error) {
      console.error('Studio publish error:', error);
      setPublishError('Upload failed. Check your connection or try a smaller media file.');
    } finally {
      setIsPublishing(false);
    }
  };

  const currentSlideUrl =
    mediaType === 'image' && carouselImages.length > 0
      ? carouselImages[activeSlideIndex] || mediaUrl
      : mediaUrl;

  return (
    <div className="wavelink-studio-shell">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleMediaFilesSelect(e.target.files, false);
          }
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        type="file"
        ref={addCarouselInputRef}
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleMediaFilesSelect(e.target.files, true);
          }
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*,video/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleMediaFilesSelect(e.target.files, false);
          }
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        type="file"
        ref={coverInputRef}
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            const compressed = await compressImage(f, 960, 960, 0.8);
            if (compressed) setCustomThumbnailUrl(compressed);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Minimal Clutter-Free Top Bar */}
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateToFeed}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white border border-slate-200/90 text-[#0F172A] hover:text-[#2563EB] flex items-center justify-center transition active:scale-95 shadow-2xs"
            title="Back to Feed"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#0F172A] leading-tight flex items-center gap-1.5">
              <span>Create</span>
              {draftSavedAt && (
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg">
                  {draftSavedAt}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(mediaUrl || caption.trim() || selectedSong) && (
            <>
              <button
                type="button"
                onClick={handleClearAll}
                className="min-h-[44px] px-3 rounded-2xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/90 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="Reset draft"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(true)}
                className="min-h-[44px] px-3.5 rounded-2xl bg-white hover:bg-blue-50 text-[#0F172A] hover:text-[#2563EB] border border-slate-200/90 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-2xs"
              >
                <Eye size={15} className="text-[#2563EB]" />
                <span>Preview</span>
              </button>
            </>
          )}
        </div>
      </div>

      <VideoUploadProgressChip variant="feed-inline" />

      {studioNotice && (
        <div className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between gap-2 flex-wrap">
          <span>{studioNotice}</span>
          <div className="flex items-center gap-1.5">
            {mediaType === 'video' && videoDuration > maxVideoSeconds && (
              <button
                type="button"
                onClick={() => {
                  setActiveTool('trim');
                  setVideoTrimStart(0);
                  setVideoTrimEnd(maxVideoSeconds);
                  setStudioNotice(null);
                }}
                className="min-h-[36px] px-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold flex items-center gap-1"
              >
                <Scissors size={13} />
                <span>Trim to {maxVideoSeconds}s</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setStudioNotice(null)}
              className="min-h-[36px] px-2.5 rounded-xl hover:bg-amber-100 text-amber-800 font-bold"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Main Responsive Layout: Single column on Mobile, 2-column on Desktop >=1024px */}
      <div className="wavelink-studio-layout">
        {/* TOP / LEFT COLUMN: Media Preview & In-Post Music Preview */}
        <div className="wavelink-studio-preview-column space-y-3">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-3 sm:p-4 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]">
            {/* Media Preview Stage */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-[#0F172A] flex items-center justify-center min-h-[280px]">
              {!currentSlideUrl ? (
                <div className="w-full py-10 px-4 text-center flex flex-col items-center justify-center bg-[#F8FAFC] rounded-2xl border-2 border-dashed border-slate-200">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#10B981] text-white flex items-center justify-center shadow-md shadow-blue-500/20 mb-3">
                    <ImageIcon size={26} />
                  </div>
                  <p className="text-sm font-extrabold text-[#0F172A] mb-3">
                    Add Photos or Video
                  </p>

                  <div className="flex items-center justify-center gap-2 flex-wrap w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
                    >
                      <ImageIcon size={16} />
                      <span>Gallery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
                    >
                      <Camera size={16} />
                      <span>Camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`relative w-full mx-auto overflow-hidden flex items-center justify-center ${getAspectFrameClass()}`}>
                  {mediaType === 'video' ? (
                    <video
                      ref={videoPreviewRef}
                      src={currentSlideUrl}
                      controls
                      playsInline
                      onLoadedMetadata={(e) => {
                        const dur = Math.max(1, Math.round(e.currentTarget.duration || 30));
                        setVideoDuration(dur);
                        setVideoTrimEnd(Math.min(maxVideoSeconds, dur));
                      }}
                      onTimeUpdate={handleVideoTimeUpdate}
                      className="w-full h-full object-cover transition-all"
                      style={{ filter: getFilterStyleString() }}
                    />
                  ) : (
                    <img
                      src={currentSlideUrl}
                      alt="Preview"
                      className="w-full h-full object-cover transition-all"
                      style={{ filter: getFilterStyleString() }}
                    />
                  )}

                  {/* Top Overlay Quick Actions (Aspect Ratio Badge, Add Carousel Slide, Delete) */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
                    <div className="flex items-center gap-1.5 pointer-events-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setAspectRatio((prev) =>
                            prev === '1:1' ? '4:5' : prev === '4:5' ? '9:16' : '1:1'
                          )
                        }
                        className="min-h-[44px] px-3 rounded-xl bg-black/65 hover:bg-black/80 text-white backdrop-blur-md text-xs font-bold flex items-center gap-1.5 transition"
                        title="Change Aspect Ratio"
                      >
                        <Crop size={14} />
                        <span>{aspectRatio}</span>
                      </button>

                      {mediaType === 'image' && carouselImages.length < 8 && (
                        <button
                          type="button"
                          onClick={() => addCarouselInputRef.current?.click()}
                          className="min-h-[44px] px-3 rounded-xl bg-black/65 hover:bg-black/80 text-white backdrop-blur-md text-xs font-bold flex items-center gap-1 transition"
                          title="Add more photos to carousel"
                        >
                          <Plus size={15} />
                          <span>{carouselImages.length}/8</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveCurrentSlide}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-black/65 hover:bg-rose-600 text-white backdrop-blur-md flex items-center justify-center pointer-events-auto transition"
                      title="Remove media"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Carousel Prev / Next Controls */}
                  {mediaType === 'image' && carouselImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const prevIdx =
                            (activeSlideIndex - 1 + carouselImages.length) % carouselImages.length;
                          setActiveSlideIndex(prevIdx);
                          setMediaUrl(carouselImages[prevIdx]);
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs z-10 transition"
                        aria-label="Previous slide"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = (activeSlideIndex + 1) % carouselImages.length;
                          setActiveSlideIndex(nextIdx);
                          setMediaUrl(carouselImages[nextIdx]);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs z-10 transition"
                        aria-label="Next slide"
                      >
                        <ChevronRight size={20} />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-xs z-10">
                        {carouselImages.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setActiveSlideIndex(idx);
                              setMediaUrl(carouselImages[idx]);
                            }}
                            className={`h-1.5 rounded-full transition-all ${
                              idx === activeSlideIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                            }`}
                            aria-label={`Slide ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Text & Sticker Overlays on Preview */}
                  {textOverlays.map((overlay) => {
                    const isSelected = activeTextId === overlay.id;
                    let bgClass = 'bg-transparent';
                    if (overlay.bgColor === 'dark')
                      bgClass = 'bg-slate-900/80 backdrop-blur-xs px-3.5 py-1.5 rounded-2xl';
                    if (overlay.bgColor === 'light')
                      bgClass = 'bg-white/95 text-[#0F172A] px-3.5 py-1.5 rounded-2xl shadow-md';
                    if (overlay.bgColor === 'gradient')
                      bgClass =
                        'bg-gradient-to-r from-[#2563EB] to-[#10B981] text-white px-3.5 py-1.5 rounded-2xl shadow-lg';

                    let sizeClass = 'text-base sm:text-lg';
                    if (overlay.fontSize === 'sm') sizeClass = 'text-xs sm:text-sm';
                    if (overlay.fontSize === 'md') sizeClass = 'text-sm sm:text-base';
                    if (overlay.fontSize === 'xl') sizeClass = 'text-xl sm:text-2xl';

                    let fontClass = 'font-sans font-bold';
                    if (overlay.fontStyle === 'display') fontClass = 'font-black tracking-tight';
                    if (overlay.fontStyle === 'mono') fontClass = 'font-mono font-bold';
                    if (overlay.fontStyle === 'hand') fontClass = 'italic font-serif font-bold';

                    return (
                      <div
                        key={overlay.id}
                        onClick={() => setActiveTextId(overlay.id)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform z-10 ${
                          isSelected ? 'ring-2 ring-[#3B82F6] rounded-2xl' : ''
                        }`}
                        style={{
                          left: `${overlay.x}%`,
                          top: `${overlay.y}%`,
                          color: overlay.bgColor === 'light' ? '#0F172A' : overlay.color
                        }}
                      >
                        <div className={`${bgClass} ${sizeClass} ${fontClass} text-center whitespace-nowrap`}>
                          {overlay.text}
                        </div>

                        {isSelected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTextOverlay(overlay.id);
                            }}
                            className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* In-Post Music Player Preview directly under Media */}
            {selectedSong && (
              <div className="mt-2.5">
                <SongPlayerCard
                  title={selectedSong.trackName}
                  artist={selectedSong.artistName}
                  albumArt={selectedSong.artworkUrl100}
                  previewUrl={selectedSong.previewUrl}
                  albumName={selectedSong.collectionName}
                  startTime={songStartTime}
                  volume={songVolume}
                  autoPlayOnVisible={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM / RIGHT COLUMN: Icon Tool Row + Active Tool Panel + Caption & Post Button */}
        <div className="wavelink-studio-controls-column space-y-3">
          {/* Row of Icon Tools */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-2xs">
            <div className="wavelink-studio-tool-strip">
              <button
                type="button"
                onClick={() => setActiveTool('crop')}
                className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  activeTool === 'crop'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Crop size={16} />
                <span>Crop</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('filters')}
                className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  activeTool === 'filters'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Sliders size={16} />
                <span>Filters</span>
              </button>

              {mediaType === 'video' && (
                <button
                  type="button"
                  onClick={() => setActiveTool('trim')}
                  className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                    activeTool === 'trim'
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Scissors size={16} />
                  <span>Trim</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTool('text')}
                className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  activeTool === 'text'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Type size={16} />
                <span>Text</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('stickers')}
                className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  activeTool === 'stickers'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Sparkles size={16} />
                <span>Stickers</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('music')}
                className={`min-h-[44px] flex-1 min-w-[60px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  activeTool === 'music'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Music size={16} />
                <span>Music</span>
              </button>
            </div>
          </div>

          {/* Compact Active Tool Panel */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-3.5 sm:p-4 shadow-2xs">
            {/* TOOL 1: CROP & MEDIA PICKER */}
            {activeTool === 'crop' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#0F172A]">Aspect Ratio</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#0F172A] flex items-center gap-1.5 transition"
                    >
                      <ImageIcon size={14} />
                      <span>Replace</span>
                    </button>
                    {mediaType === 'image' && (
                      <button
                        type="button"
                        onClick={() => addCarouselInputRef.current?.click()}
                        className="min-h-[44px] px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-xs font-bold text-[#2563EB] flex items-center gap-1 transition"
                      >
                        <Plus size={14} />
                        <span>Carousel</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['1:1', '4:5', '9:16'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition ${
                        aspectRatio === ratio
                          ? 'bg-blue-50 border-[#2563EB] text-[#2563EB]'
                          : 'bg-[#F8FAFC] border-slate-200 text-slate-600 hover:text-[#0F172A]'
                      }`}
                    >
                      <Crop size={14} />
                      <span>{ratio}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TOOL 2: FILTERS & BRIGHTNESS/CONTRAST */}
            {activeTool === 'filters' && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setActiveFilter(preset);
                        setBrightness(preset.brightness);
                        setContrast(preset.contrast);
                      }}
                      className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-bold shrink-0 transition ${
                        activeFilter.name === preset.name
                          ? 'bg-[#2563EB] border-[#2563EB] text-white'
                          : 'bg-[#F8FAFC] border-slate-200 text-[#0F172A] hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>Brightness</span>
                      <span className="font-mono">{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="140"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>Contrast</span>
                      <span className="font-mono">{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="150"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TOOL 3: VIDEO TRIM & COVER THUMBNAIL */}
            {activeTool === 'trim' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                  <span>
                    Selected clip: <strong className="text-[#2563EB] font-mono">{Math.max(1, Math.round(videoTrimEnd - videoTrimStart))}s</strong> / {maxVideoSeconds}s max ({isProTier ? 'Pro' : 'Free'})
                  </span>
                  {videoDuration > maxVideoSeconds && (
                    <button
                      type="button"
                      onClick={() => {
                        setVideoTrimStart(0);
                        setVideoTrimEnd(maxVideoSeconds);
                      }}
                      className="text-[#2563EB] hover:underline font-extrabold"
                    >
                      First {maxVideoSeconds}s
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>Start</span>
                      <span className="font-mono">{videoTrimStart}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, videoDuration - 1)}
                      step={0.5}
                      value={videoTrimStart}
                      onChange={(e) => {
                        const nextStart = Number(e.target.value);
                        setVideoTrimStart(nextStart);
                        if (videoTrimEnd <= nextStart) {
                          setVideoTrimEnd(Math.min(videoDuration, nextStart + 1));
                        } else if (videoTrimEnd - nextStart > maxVideoSeconds) {
                          setVideoTrimEnd(Math.min(videoDuration, nextStart + maxVideoSeconds));
                        }
                      }}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>End</span>
                      <span className="font-mono">{videoTrimEnd}s</span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(videoDuration, videoTrimStart + 1)}
                      max={Math.min(videoDuration, videoTrimStart + maxVideoSeconds)}
                      step={0.5}
                      value={videoTrimEnd}
                      onChange={(e) => setVideoTrimEnd(Number(e.target.value))}
                      className="w-full accent-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span className="flex items-center gap-1">
                        <Film size={12} />
                        <span>Cover Frame</span>
                      </span>
                      <span className="font-mono">{videoCoverTime}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={videoDuration}
                      step={0.5}
                      value={videoCoverTime}
                      onChange={(e) => handleCaptureVideoCoverAt(Number(e.target.value))}
                      className="w-full accent-[#10B981]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="min-h-[44px] px-3 rounded-xl bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#0F172A] flex items-center gap-1.5"
                  >
                    <ImageIcon size={14} className="text-[#2563EB]" />
                    <span>Upload Cover</span>
                  </button>
                </div>
              </div>
            )}

            {/* TOOL 4: TEXT OVERLAY */}
            {activeTool === 'text' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTextString}
                    onChange={(e) => setNewTextString(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTextOverlay();
                    }}
                    placeholder="Add text overlay..."
                    maxLength={80}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-base sm:text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={handleAddTextOverlay}
                    disabled={!newTextString.trim()}
                    className="min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-40 transition"
                  >
                    Add
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {['#FFFFFF', '#FDE047', '#F43F5E', '#3B82F6', '#10B981', '#0F172A'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTextColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition ${
                          textColor === c ? 'border-[#2563EB] scale-110' : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>

                  <div className="flex rounded-xl bg-[#F8FAFC] border border-slate-200 p-0.5">
                    {(['none', 'dark', 'light', 'gradient'] as const).map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setTextBgColor(bg)}
                        className={`min-h-[36px] px-2.5 rounded-lg font-bold text-[11px] capitalize transition ${
                          textBgColor === bg ? 'bg-[#2563EB] text-white' : 'text-slate-600'
                        }`}
                      >
                        {bg === 'gradient' ? 'Wave' : bg}
                      </button>
                    ))}
                  </div>
                </div>

                {activeTextId && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {([
                      { label: 'Top', x: 50, y: 20 },
                      { label: 'Center', x: 50, y: 50 },
                      { label: 'Bottom', x: 50, y: 80 }
                    ] as const).map((pos) => (
                      <button
                        key={pos.label}
                        type="button"
                        onClick={() => handleUpdatePosition(activeTextId, pos.x, pos.y)}
                        className="flex-1 min-h-[40px] rounded-xl bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 text-xs font-bold text-[#0F172A]"
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TOOL 5: STICKERS & EMOJI */}
            {activeTool === 'stickers' && (
              <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                {STICKER_PRESETS.map((sticker) => (
                  <button
                    key={sticker}
                    type="button"
                    onClick={() => handleAddSticker(sticker)}
                    className="min-h-[44px] px-2 rounded-xl bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 text-xs font-bold text-[#0F172A] flex items-center justify-center transition active:scale-95"
                  >
                    {sticker}
                  </button>
                ))}
              </div>
            )}

            {/* TOOL 6: MUSIC (SEARCH OR UPLOAD + CLIP START & VOLUME) */}
            {activeTool === 'music' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSongSelectorOpen(true)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
                  >
                    <Music size={15} />
                    <span>{selectedSong ? 'Change Track / Upload' : 'Search or Upload Music'}</span>
                  </button>
                  {selectedSong && (
                    <button
                      type="button"
                      onClick={() => setSelectedSong(null)}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition"
                      title="Remove Music"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {selectedSong && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Clip Start</span>
                        <span className="font-mono">{songStartTime}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={25}
                        step={1}
                        value={songStartTime}
                        onChange={(e) => setSongStartTime(Number(e.target.value))}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Volume</span>
                        <span className="font-mono">{Math.round(songVolume)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={songVolume}
                        onChange={(e) => setSongVolume(Number(e.target.value))}
                        className="w-full accent-[#10B981]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CAPTION, SMART AI CAPTION, AUDIENCE/LOCATION/COMMENTS & POST BUTTON */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-3.5 sm:p-4 shadow-2xs space-y-3">
            {/* Caption Header Bar: #Hashtag, @Mention, and Smart Caption AI button */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSuggestionMode((prev) => (prev === 'hashtag' ? 'none' : 'hashtag'))
                  }
                  className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                    suggestionMode === 'hashtag'
                      ? 'bg-blue-50 border-[#2563EB] text-[#2563EB]'
                      : 'bg-[#F8FAFC] border-slate-200 text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Hash size={14} />
                  <span>Tags</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSuggestionMode((prev) => (prev === 'mention' ? 'none' : 'mention'))
                  }
                  className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                    suggestionMode === 'mention'
                      ? 'bg-blue-50 border-[#2563EB] text-[#2563EB]'
                      : 'bg-[#F8FAFC] border-slate-200 text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <AtSign size={14} />
                  <span>Mention</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSmartCaption}
                disabled={isGeneratingCaptions}
                className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#10B981] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition active:scale-95 disabled:opacity-60"
              >
                <Wand2 size={14} className={isGeneratingCaptions ? 'animate-spin' : ''} />
                <span>{isGeneratingCaptions ? 'Thinking...' : 'Smart Caption'}</span>
              </button>
            </div>

            {/* Hashtag or @Mention Suggestion Chips */}
            {suggestionMode !== 'none' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {(suggestionMode === 'hashtag' ? HASHTAG_SUGGESTIONS : MENTION_SUGGESTIONS).map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleInsertTagOrMention(item)}
                      className="min-h-[38px] px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold shrink-0 transition"
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            )}

            {/* Smart Caption AI Loading Skeleton or Results */}
            {isGeneratingCaptions && (
              <div className="space-y-1.5">
                <div className="h-9 rounded-xl wavelink-skeleton w-full" />
                <div className="h-9 rounded-xl wavelink-skeleton w-4/5" />
              </div>
            )}

            {!isGeneratingCaptions && smartCaptions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400">Tap to use AI caption</span>
                  <button
                    type="button"
                    onClick={() => setSmartCaptions([])}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    Hide
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {smartCaptions.map((sc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCaption(sc);
                        setSmartCaptions([]);
                      }}
                      className="min-h-[44px] p-2.5 rounded-xl bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-left text-xs font-semibold text-[#0F172A] transition"
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Caption Textarea */}
            <textarea
              value={caption}
              onChange={(e) => handleCaptionChange(e.target.value)}
              placeholder="Write a caption... use #hashtags or @mentions"
              rows={2}
              maxLength={2000}
              className="w-full p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-base sm:text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
            />

            {/* Compact Post Options Row: Audience, Location, Comments On/Off */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* Audience Selector */}
              <div className="flex rounded-xl bg-[#F8FAFC] border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setAudience('public')}
                  className={`min-h-[44px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                    audience === 'public'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                  title="Public"
                >
                  <Globe size={14} />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('followers')}
                  className={`min-h-[44px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                    audience === 'followers'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                  title="Followers"
                >
                  <Users size={14} />
                  <span>Followers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('close_friends')}
                  className={`min-h-[44px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                    audience === 'close_friends'
                      ? 'bg-[#10B981] text-white'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                  title="Close Friends"
                >
                  <Heart size={14} />
                  <span>Close</span>
                </button>
              </div>

              {/* Location Tag Toggle */}
              <button
                type="button"
                onClick={() => setShowLocationInput((prev) => !prev)}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                  locationTag
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-[#F8FAFC] border-slate-200 text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                <MapPin size={14} />
                <span className="truncate max-w-[110px]">{locationTag || 'Location'}</span>
              </button>

              {/* Comments On/Off Toggle */}
              <button
                type="button"
                onClick={() => setAllowComments((prev) => !prev)}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                  allowComments
                    ? 'bg-[#F8FAFC] border-slate-200 text-slate-700'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
                title="Toggle comments"
              >
                {allowComments ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
                <span>{allowComments ? 'Comments On' : 'Comments Off'}</span>
              </button>
            </div>

            {/* Expandable Location Input & Quick Presets */}
            {showLocationInput && (
              <div className="p-2.5 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={locationTag}
                    onChange={(e) => setLocationTag(e.target.value)}
                    placeholder="Add location..."
                    maxLength={60}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-white border border-slate-200 text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  {locationTag && (
                    <button
                      type="button"
                      onClick={() => setLocationTag('')}
                      className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {LOCATION_PRESETS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => {
                        setLocationTag(loc);
                        setShowLocationInput(false);
                      }}
                      className="min-h-[36px] px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:border-[#2563EB] shrink-0"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress Bar */}
            {isPublishing && (
              <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                  <span>Uploading post...</span>
                  <span className="font-mono">{publishProgress}%</span>
                </div>
                <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] to-[#10B981] transition-all duration-150 rounded-full"
                    style={{ width: `${publishProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Error Banner with Retry Button */}
            {publishError && !isPublishing && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-800 min-w-0">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span className="truncate">{publishError}</span>
                </div>
                <button
                  type="button"
                  onClick={handlePublishToFeed}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition active:scale-95"
                >
                  <RotateCcw size={14} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Publish Success or Post Button */}
            {publishSuccess ? (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Check size={16} className="text-[#10B981]" />
                  <span>Posted!</span>
                </span>
                <button
                  type="button"
                  onClick={onNavigateToFeed}
                  className="min-h-[44px] px-4 rounded-xl bg-[#10B981] text-white text-xs font-bold"
                >
                  Open Feed
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePublishToFeed}
                disabled={
                  isPublishing ||
                  (!currentSlideUrl && !caption.trim() && !selectedSong)
                }
                className="w-full min-h-[48px] py-3 px-6 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99] disabled:opacity-40"
              >
                <Send size={16} />
                <span>Post</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FULL FEED PREVIEW MODAL */}
      {isPreviewModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setIsPreviewModalOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#0F172A] flex items-center gap-1.5">
                <Eye size={15} className="text-[#2563EB]" />
                <span>Feed Preview</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[80dvh] overflow-y-auto">
              {/* Author Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    src={
                      userProfile?.photoURL ||
                      currentUser?.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'wave'}`
                    }
                    alt="Author"
                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                  />
                  <div>
                    <p className="text-sm font-extrabold text-[#0F172A] leading-tight">
                      {userProfile?.displayName || currentUser?.displayName || 'Creator'}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>Just now</span>
                      {locationTag && (
                        <>
                          <span>•</span>
                          <span className="text-[#2563EB] font-semibold">{locationTag}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="capitalize">{audience.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Media Preview */}
              {currentSlideUrl && (
                <div className={`relative w-full rounded-2xl overflow-hidden bg-slate-950 ${getAspectFrameClass()}`}>
                  {mediaType === 'video' ? (
                    <video
                      src={currentSlideUrl}
                      controls
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ filter: getFilterStyleString() }}
                    />
                  ) : (
                    <img
                      src={currentSlideUrl}
                      alt="Feed preview"
                      className="w-full h-full object-cover"
                      style={{ filter: getFilterStyleString() }}
                    />
                  )}
                </div>
              )}

              {/* In-Post Music Player right under media */}
              {selectedSong && (
                <SongPlayerCard
                  title={selectedSong.trackName}
                  artist={selectedSong.artistName}
                  albumArt={selectedSong.artworkUrl100}
                  previewUrl={selectedSong.previewUrl}
                  albumName={selectedSong.collectionName}
                  startTime={songStartTime}
                  volume={songVolume}
                  autoPlayOnVisible={false}
                />
              )}

              {/* Caption */}
              {caption.trim() && (
                <p className="text-sm text-[#0F172A] whitespace-pre-wrap leading-relaxed">
                  {caption}
                </p>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#0F172A]"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  handlePublishToFeed();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#2563EB] hover:bg-blue-700 text-xs font-extrabold text-white flex items-center justify-center gap-1.5"
              >
                <Send size={14} />
                <span>Post Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Music Search & Custom Audio Upload Modal */}
      <SongSelectorModal
        isOpen={isSongSelectorOpen}
        onClose={() => setIsSongSelectorOpen(false)}
        onSelectSong={(song) => {
          setSelectedSong(song);
          if (song.startTime !== undefined) setSongStartTime(song.startTime);
          if (song.volume !== undefined) setSongVolume(song.volume);
        }}
        selectedSongId={selectedSong?.trackId}
      />
    </div>
  );
};
