import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  limit
} from 'firebase/firestore';
import { OnlineSong, Post, Spark } from '../types';
import {
  compressImage,
  cloneVideoFileToMemory,
  validateSparkMediaBeforeUpload,
  deleteSparkAndStorageFile,
  formatSparkDuration,
  SPARK_MAX_FILE_MB,
  FREE_SPARK_MAX_SECONDS,
  PRO_SPARK_MAX_SECONDS
} from '../utils/mediaStorage';
import { enqueueSparkUploadJob } from '../services/sparkUploadQueue';
import { moderatePostContent } from '../services/geminiService';
import { SongSelectorModal } from './SongSelectorModal';
import {
  Flame,
  Zap,
  Camera,
  Image as ImageIcon,
  Music,
  X,
  Upload,
  Clock,
  Sparkles,
  Trophy,
  Check,
  Plus,
  Layers,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Type,
  CheckSquare,
  Square,
  Play,
  FileText
} from 'lucide-react';

export interface UserSparkGroup {
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
  sparks: Spark[];
  latestCreatedAt: string;
  latestExpiresAt: string;
  totalLikes: number;
}

/**
 * Groups individual 24-hour Spark posts by authorId so a user with multiple
 * Spark posts appears as a single multi-segment story in the Spark Tray and
 * plays all of their posts sequentially in the Spark Viewer.
 */
export function groupSparksByAuthor(sparks: Spark[], currentUserId?: string): UserSparkGroup[] {
  const map = new Map<string, Spark[]>();

  sparks.forEach((spark) => {
    const key = spark.authorId || 'unknown';
    const existing = map.get(key) || [];
    existing.push(spark);
    map.set(key, existing);
  });

  const groups: UserSparkGroup[] = [];

  map.forEach((userSparks, authorId) => {
    // Sort slides chronologically (oldest first -> newest last) so multi-post stories read in order
    const chronological = [...userSparks].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const newest = chronological[chronological.length - 1];
    const totalLikes = chronological.reduce((sum, s) => sum + (s.likesCount || 0), 0);

    groups.push({
      authorId,
      authorEmail: newest.authorEmail || '',
      authorName: newest.authorName || 'Waver',
      authorUsername: newest.authorUsername,
      authorPhotoURL: newest.authorPhotoURL,
      sparks: chronological,
      latestCreatedAt: newest.createdAt,
      latestExpiresAt: newest.expiresAt,
      totalLikes
    });
  });

  // Sort groups: current user first, then most recently updated group
  groups.sort((a, b) => {
    if (currentUserId) {
      if (a.authorId === currentUserId && b.authorId !== currentUserId) return -1;
      if (b.authorId === currentUserId && a.authorId !== currentUserId) return 1;
    }
    return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
  });

  return groups;
}

export interface SparkTextTheme {
  id: string;
  name: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
}

export const SPARK_TEXT_THEMES: SparkTextTheme[] = [
  {
    id: 'ocean_teal',
    name: 'Ocean Teal',
    bgStart: '#0D9488',
    bgEnd: '#2563EB',
    accent: '#99F6E4'
  },
  {
    id: 'sunset_coral',
    name: 'Warm Coral',
    bgStart: '#EA580C',
    bgEnd: '#E11D48',
    accent: '#FED7AA'
  },
  {
    id: 'royal_blue',
    name: 'Friendly Blue',
    bgStart: '#2563EB',
    bgEnd: '#4F46E5',
    accent: '#BFDBFE'
  },
  {
    id: 'golden_sun',
    name: 'Sunny Amber',
    bgStart: '#D97706',
    bgEnd: '#EA580C',
    accent: '#FDE68A'
  },
  {
    id: 'emerald_sage',
    name: 'Forest Sage',
    bgStart: '#059669',
    bgEnd: '#0D9488',
    accent: '#A7F3D0'
  },
  {
    id: 'warm_berry',
    name: 'Berry Rose',
    bgStart: '#BE185D',
    bgEnd: '#7C3AED',
    accent: '#FBCFE8'
  }
];

/**
 * Renders a text post or quote into a crisp 720x1280 story image DataURL
 * so text-only posts can be published and viewed seamlessly in Sparks.
 */
export function createTextPostSparkImage(
  text: string,
  authorName: string,
  themeId: string = 'ocean_teal',
  vibeTag: string = '✨ Wave Spark'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const theme = SPARK_TEXT_THEMES.find((t) => t.id === themeId) || SPARK_TEXT_THEMES[0];

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 720, 1280);
  grad.addColorStop(0, theme.bgStart);
  grad.addColorStop(1, theme.bgEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 1280);

  // Soft decorative circles
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(620, 220, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(110, 1060, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Inner glass card
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  const cardX = 56;
  const cardY = 230;
  const cardW = 608;
  const cardH = 820;
  const radius = 40;
  ctx.beginPath();
  ctx.moveTo(cardX + radius, cardY);
  ctx.lineTo(cardX + cardW - radius, cardY);
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
  ctx.lineTo(cardX + cardW, cardY + cardH - radius);
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
  ctx.lineTo(cardX + radius, cardY + cardH);
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
  ctx.lineTo(cardX, cardY + radius);
  ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Top vibe pill text
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(vibeTag.toUpperCase(), 360, 315);

  // Word-wrap main text
  const cleanText = (text || 'Sharing a moment on WaveLink ✨').trim();
  ctx.fillStyle = '#FFFFFF';
  const fontSize = cleanText.length > 220 ? 34 : cleanText.length > 110 ? 42 : 50;
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';

  const words = cleanText.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  const maxWidth = 510;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const visibleLines = lines.slice(0, 11);
  const lineHeight = Math.round(fontSize * 1.38);
  const totalTextHeight = visibleLines.length * lineHeight;
  let startY = 640 - totalTextHeight / 2 + fontSize / 2;

  visibleLines.forEach((line, idx) => {
    const displayLine =
      idx === visibleLines.length - 1 && lines.length > visibleLines.length ? `${line}...` : line;
    ctx.fillText(displayLine, 360, startY + idx * lineHeight);
  });

  // Footer author signature
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.font = '600 26px Inter, system-ui, sans-serif';
  ctx.fillText(`— ${authorName || 'WaveLink Member'}`, 360, 985);

  return canvas.toDataURL('image/jpeg', 0.86);
}

export interface MultiSparkSlideItem {
  id: string;
  sourceType: 'upload' | 'text_card' | 'feed_post';
  sourcePostId?: string;
  mediaDataUrl: string;
  mediaType: 'image' | 'video';
  file?: File | null;
  hasVideoChunks?: boolean;
  videoDurationSeconds?: number;
  videoWidth?: number;
  videoHeight?: number;
  caption: string;
  legendaryTag: string;
  textCardBody?: string;
  textCardTheme?: string;
}

const LEGENDARY_TAGS = [
  '🏆 Legendary Win',
  '🔥 Insane Moment',
  '✨ Once in a Lifetime',
  '⚡ Pure Energy',
  '🌅 Unreal View',
  '🎉 Milestone Reached',
  '🌊 Wave Vibe',
  '🌿 Grateful Today'
];

interface MultiSparkPosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSparkCreated?: () => void;
  initialPostsToShare?: Post[];
}

export const MultiSparkPosterModal: React.FC<MultiSparkPosterModalProps> = ({
  isOpen,
  onClose,
  onSparkCreated,
  initialPostsToShare
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective, recordPointTransaction } = useAuth();
  const isProTier = Boolean(isProEffective || isAdmin);
  const maxActiveSlidesAllowed = isProTier ? 25 : 10;

  const [activeTab, setActiveTab] = useState<'builder' | 'from_posts' | 'active_sparks'>('builder');
  const [slides, setSlides] = useState<MultiSparkSlideItem[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  // Text card creator state
  const [isAddingTextCard, setIsAddingTextCard] = useState(false);
  const [textCardInput, setTextCardInput] = useState('');
  const [textCardTheme, setTextCardTheme] = useState(SPARK_TEXT_THEMES[0].id);

  // Feed posts picker state
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [postFilterMode, setPostFilterMode] = useState<'mine' | 'all'>('mine');

  // User's currently active Sparks in Firestore
  const [myActiveSparks, setMyActiveSparks] = useState<Spark[]>([]);

  // Shared soundtrack across the Spark batch
  const [attachedSong, setAttachedSong] = useState<OnlineSong | null>(null);
  const [isSongSelectorOpen, setIsSongSelectorOpen] = useState(false);

  // Upload progress state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatusText, setPublishStatusText] = useState('');
  const [publishProgress, setPublishProgress] = useState(0);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
    showTryProNote?: boolean;
  } | null>(null);

  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Convert a feed Post into a MultiSparkSlideItem
  const convertPostToSlide = (post: Post): MultiSparkSlideItem => {
    const authorName =
      post.authorName || userProfile?.displayName || currentUser?.displayName || 'Waver';
    const hasVideo = Boolean(post.videoUrl || post.hasVideoChunks || post.mediaType === 'video');
    const hasImage = Boolean(post.imageUrl && !hasVideo);

    let mediaDataUrl = '';
    let mediaType: 'image' | 'video' = 'image';

    if (hasVideo) {
      mediaType = 'video';
      mediaDataUrl = post.videoUrl || post.thumbnailUrl || post.imageUrl || '';
    } else if (hasImage && post.imageUrl) {
      mediaType = 'image';
      mediaDataUrl = post.imageUrl;
    } else {
      mediaType = 'image';
      mediaDataUrl = createTextPostSparkImage(
        post.content || 'Shared Wave on WaveLink',
        authorName,
        'ocean_teal',
        '🌊 Shared Wave'
      );
    }

    return {
      id: `slide_post_${post.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceType: 'feed_post',
      sourcePostId: post.id,
      mediaDataUrl,
      mediaType,
      hasVideoChunks: post.hasVideoChunks,
      caption: post.content ? post.content.slice(0, 480) : '',
      legendaryTag: '🌊 Wave Vibe'
    };
  };

  // Seed initialPostsToShare when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setFeedbackBanner(null);
    if (initialPostsToShare && initialPostsToShare.length > 0) {
      const converted = initialPostsToShare.map((p) => convertPostToSlide(p));
      setSlides(converted);
      setActiveSlideIndex(0);
      setActiveTab('builder');
    }
  }, [isOpen, initialPostsToShare]);

  // Load feed posts so user can pick multiple existing posts to show as their Spark
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Post[] = [];
        snap.forEach((d) => {
          list.push({ ...(d.data() as Post), id: d.id });
        });
        setFeedPosts(list);
      },
      () => {}
    );
    return () => unsub();
  }, [isOpen, currentUser]);

  // Load current user's active Sparks
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const q = query(collection(db, 'sparks'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const mine: Spark[] = [];
        snap.forEach((d) => {
          const data = d.data() as Spark;
          if (data.authorId === currentUser.uid && new Date(data.expiresAt).getTime() > now) {
            mine.push({ ...data, id: d.id });
          }
        });
        setMyActiveSparks(mine);
      },
      () => {}
    );
    return () => unsub();
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const activeSlide: MultiSparkSlideItem | undefined = slides[activeSlideIndex];

  // Handle selecting one or MULTIPLE files at once (checks safe MIME, 80 MB cap, and 60s Free / 90s Pro duration in browser before upload)
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFeedbackBanner(null);

    const newSlides: MultiSparkSlideItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validation = await validateSparkMediaBeforeUpload(file, isProTier);

      if (!validation.valid) {
        setFeedbackBanner({
          type: 'error',
          text:
            validation.error ||
            (!isProTier
              ? 'Free Sparks can be up to 60 seconds. Go Pro for 90.'
              : 'Selected media cannot be added to your Spark.'),
          showTryProNote: Boolean(validation.showTryProNote)
        });
        continue;
      }

      const slideId = `slide_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      if (validation.mediaType === 'image') {
        const compressed = await compressImage(file, 1280, 1280, 0.78);
        newSlides.push({
          id: slideId,
          sourceType: 'upload',
          mediaDataUrl: compressed,
          mediaType: 'image',
          file,
          caption: '',
          legendaryTag: LEGENDARY_TAGS[0]
        });
      } else {
        const safeVideo = await cloneVideoFileToMemory(file);
        const previewUrl = URL.createObjectURL(safeVideo);
        newSlides.push({
          id: slideId,
          sourceType: 'upload',
          mediaDataUrl: previewUrl,
          mediaType: 'video',
          file: safeVideo,
          videoDurationSeconds: validation.durationSeconds,
          videoWidth: validation.width,
          videoHeight: validation.height,
          caption: '',
          legendaryTag: LEGENDARY_TAGS[0]
        });
      }
    }

    if (newSlides.length > 0) {
      setSlides((prev) => {
        const updated = [...prev, ...newSlides];
        setActiveSlideIndex(updated.length - newSlides.length);
        return updated;
      });
    }
  };

  // Add a text/quote post slide to the Spark queue
  const handleAddTextSlide = () => {
    if (!textCardInput.trim()) return;
    const authorName = userProfile?.displayName || currentUser?.displayName || 'Waver';
    const dataUrl = createTextPostSparkImage(
      textCardInput.trim(),
      authorName,
      textCardTheme,
      '✨ Wave Spark'
    );

    const newSlide: MultiSparkSlideItem = {
      id: `slide_text_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceType: 'text_card',
      mediaDataUrl: dataUrl,
      mediaType: 'image',
      caption: textCardInput.trim(),
      legendaryTag: '✨ Once in a Lifetime',
      textCardBody: textCardInput.trim(),
      textCardTheme
    };

    setSlides((prev) => {
      const updated = [...prev, newSlide];
      setActiveSlideIndex(updated.length - 1);
      return updated;
    });
    setTextCardInput('');
    setIsAddingTextCard(false);
  };

  // Toggle selection of existing feed posts
  const handleToggleSelectPost = (postId: string) => {
    setSelectedPostIds((prev) =>
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    );
  };

  // Queue all selected feed posts into the Spark slide deck
  const handleQueueSelectedFeedPosts = () => {
    const selectedPosts = feedPosts.filter((p) => selectedPostIds.includes(p.id));
    if (selectedPosts.length === 0) return;

    const converted = selectedPosts.map((p) => convertPostToSlide(p));
    setSlides((prev) => {
      const updated = [...prev, ...converted];
      setActiveSlideIndex(prev.length);
      return updated;
    });
    setSelectedPostIds([]);
    setActiveTab('builder');
    setFeedbackBanner({
      type: 'success',
      text: `Added ${converted.length} post${converted.length > 1 ? 's' : ''} to your Spark queue!`
    });
  };

  // Update active slide fields
  const updateActiveSlide = (patch: Partial<MultiSparkSlideItem>) => {
    setSlides((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeSlideIndex) return item;
        const next = { ...item, ...patch };
        if (
          next.sourceType === 'text_card' &&
          (patch.textCardBody !== undefined ||
            patch.textCardTheme !== undefined ||
            patch.legendaryTag !== undefined)
        ) {
          const authorName = userProfile?.displayName || currentUser?.displayName || 'Waver';
          next.mediaDataUrl = createTextPostSparkImage(
            next.textCardBody || next.caption || '',
            authorName,
            next.textCardTheme || 'ocean_teal',
            next.legendaryTag || '✨ Wave Spark'
          );
        }
        return next;
      })
    );
  };

  const handleRemoveSlide = (indexToRemove: number) => {
    setSlides((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (activeSlideIndex >= next.length) {
        setActiveSlideIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleMoveSlide = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= slides.length) return;
    setSlides((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
    setActiveSlideIndex(toIndex);
  };

  const handleDeleteExistingSpark = async (sparkId: string) => {
    const targetSpark = myActiveSparks.find((s) => s.id === sparkId);
    try {
      if (targetSpark) {
        await deleteSparkAndStorageFile(targetSpark, true);
      } else {
        await deleteDoc(doc(db, 'sparks', sparkId));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sparks/${sparkId}`);
    }
  };

  // Enqueue ALL queued posts into the background Spark upload queue and close modal immediately
  const handlePublishAllSparks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || slides.length === 0) return;

    // 1. Anti-abuse active Spark cap check (10 active slides Free / 25 Pro)
    if (myActiveSparks.length + slides.length > maxActiveSlidesAllowed) {
      setFeedbackBanner({
        type: 'error',
        showTryProNote: !isProTier,
        text: `You currently have ${myActiveSparks.length} active Spark slide(s). ${
          isProTier ? 'Pro members can have up to 25' : 'Free members can have up to 10'
        } active 24h Spark slides at once.`
      });
      return;
    }

    // 2. Anti-spam cooldown (15s between consecutive Spark batch submissions)
    const lastSparkPostMs = Number(sessionStorage.getItem(`wavelink_last_spark_${currentUser.uid}`) || '0');
    const elapsedMs = Date.now() - lastSparkPostMs;
    if (elapsedMs < 15000) {
      const waitSec = Math.ceil((15000 - elapsedMs) / 1000);
      setFeedbackBanner({
        type: 'error',
        text: `Please wait ${waitSec}s before posting another Spark batch (anti-spam protection).`
      });
      return;
    }

    setIsPublishing(true);
    setPublishProgress(15);
    setFeedbackBanner(null);

    // 3. Pre-publish AI content moderation on slide captions
    const combinedCaptions = slides
      .map((s) => (s.caption || s.textCardBody || '').trim())
      .filter(Boolean)
      .join(' | ');
    if (combinedCaptions) {
      try {
        const modCheck = await moderatePostContent(combinedCaptions);
        if (modCheck.flagged) {
          setFeedbackBanner({
            type: 'error',
            text: modCheck.reason || 'Spark caption flagged by WaveLink AI Safety Moderation.'
          });
          setIsPublishing(false);
          setPublishProgress(0);
          return;
        }
      } catch (err: any) {
        if (err?.message?.includes('rate limit')) {
          setFeedbackBanner({ type: 'error', text: err.message });
          setIsPublishing(false);
          setPublishProgress(0);
          return;
        }
      }
    }

    sessionStorage.setItem(`wavelink_last_spark_${currentUser.uid}`, String(Date.now()));

    // 4. Daily Spark Creator Reward (+20 WavePoints once per day)
    const today = new Date().toISOString().slice(0, 10);
    const rewardKey = `wavelink_spark_reward_${currentUser.uid}_${today}`;
    if (!localStorage.getItem(rewardKey)) {
      localStorage.setItem(rewardKey, '1');
      recordPointTransaction({
        type: 'earned',
        category: 'daily_reward',
        title: 'Daily Spark Creator Bonus ✨',
        description: 'Earned +20 WavePoints for sharing a 24-hour Spark today',
        amount: 20
      }).catch(() => {});
    }

    const slidesSnapshot = slides.map((slide) => ({
      id: slide.id,
      mediaDataUrl: slide.mediaDataUrl,
      mediaType: slide.mediaType,
      file: slide.file || null,
      hasVideoChunks: Boolean(slide.hasVideoChunks),
      videoMeta:
        slide.videoDurationSeconds && slide.videoWidth && slide.videoHeight
          ? {
              durationSeconds: slide.videoDurationSeconds,
              width: slide.videoWidth,
              height: slide.videoHeight,
            }
          : undefined,
      caption: (slide.caption || '').trim(),
      legendaryTag: slide.legendaryTag || LEGENDARY_TAGS[0],
      sourcePostId: slide.sourcePostId,
    }));

    enqueueSparkUploadJob({
      authorId: currentUser.uid,
      authorEmail: currentUser.email || '',
      authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
      authorUsername:
        userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
      authorPhotoURL:
        userProfile?.photoURL ||
        currentUser.photoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      isProTier,
      attachedSong,
      slides: slidesSnapshot,
      onComplete: onSparkCreated,
    });

    setSlides([]);
    setActiveSlideIndex(0);
    setAttachedSong(null);
    setIsPublishing(false);
    setPublishProgress(0);
    setPublishStatusText('');
    onClose();
  };

  const displayedFeedPosts =
    postFilterMode === 'mine'
      ? feedPosts.filter((p) => p.authorId === currentUser?.uid)
      : feedPosts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs transition-opacity"
        onClick={isPublishing ? undefined : onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-[#FFFFFF] rounded-3xl border border-[#EFECE6] shadow-[0_16px_48px_-8px_rgba(28,25,23,0.16)] overflow-hidden z-10 my-auto max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-[#FAF7F2] border-b border-[#EFECE6] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-xs shrink-0">
              <Layers size={22} />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200/80 text-[10px] font-extrabold uppercase tracking-wider text-[#0D9488]">
                <Flame size={11} className="fill-[#0D9488] text-[#0D9488]" />
                <span>Multi-Post 24h Spark Studio</span>
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-[#1C1917] truncate mt-0.5">
                Post Multiple Posts to Your Spark
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="min-w-[40px] min-h-[40px] p-2 rounded-2xl bg-white hover:bg-stone-100 text-[#78716C] border border-[#EFECE6] flex items-center justify-center transition disabled:opacity-50"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Mode Tabs */}
        <div className="px-4 sm:px-5 pt-3 pb-2 bg-[#FAF7F2]/60 border-b border-[#EFECE6] flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('builder')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'builder'
                ? 'bg-[#2563EB] text-white shadow-2xs'
                : 'bg-white text-[#57534E] border border-[#EFECE6] hover:bg-stone-50'
            }`}
          >
            <Layers size={14} />
            <span>Spark Queue ({slides.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('from_posts')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'from_posts'
                ? 'bg-[#0D9488] text-white shadow-2xs'
                : 'bg-white text-[#57534E] border border-[#EFECE6] hover:bg-stone-50'
            }`}
          >
            <CheckSquare size={14} />
            <span>Select From Feed Posts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('active_sparks')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'active_sparks'
                ? 'bg-[#D97706] text-white shadow-2xs'
                : 'bg-white text-[#57534E] border border-[#EFECE6] hover:bg-stone-50'
            }`}
          >
            <Flame size={14} />
            <span>Your Active Spark ({myActiveSparks.length})</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {feedbackBanner && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-bold border space-y-1.5 ${
                feedbackBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-stone-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{feedbackBanner.text}</span>
                <button
                  type="button"
                  onClick={() => setFeedbackBanner(null)}
                  className="p-1 text-stone-400 hover:text-stone-700 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              {feedbackBanner.showTryProNote && (
                <div className="pt-1 flex items-center justify-between flex-wrap gap-2 text-[11px] font-semibold text-[#0D9488] border-t border-amber-200/70">
                  <span>
                    ✨ Try Pro: Post up to 90-second HD Sparks, get your Verified Blue Star &amp; browse ad-free.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: MULTI-POST SPARK BUILDER */}
          {activeTab === 'builder' && (
            <div className="space-y-4">
              {/* Hidden Multi-File & Camera Inputs */}
              <input
                type="file"
                ref={multiFileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v,video/3gpp"
                multiple
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                capture="environment"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {/* Quick Add Bar: Add Multiple Photos/Videos, Text Card, or Pick Feed Posts */}
              <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1C1917]">
                    Add posts to your 24h Spark story:
                  </div>
                  <div className="text-[11px] font-semibold text-[#0D9488]">
                    {isProTier
                      ? `Pro Spark Video: Up to ${PRO_SPARK_MAX_SECONDS}s • 720p HD (Max ${SPARK_MAX_FILE_MB} MB)`
                      : `Free Spark Video: Up to ${FREE_SPARK_MAX_SECONDS}s (Pro: ${PRO_SPARK_MAX_SECONDS}s) • Max ${SPARK_MAX_FILE_MB} MB`}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => multiFileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition"
                  >
                    <ImageIcon size={14} />
                    <span>+ Photos / Videos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddingTextCard((prev) => !prev)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition"
                  >
                    <Type size={14} />
                    <span>+ Text Post</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-stone-100 text-[#1C1917] border border-[#EFECE6] font-bold text-xs flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <Camera size={14} className="text-[#D97706]" />
                    <span>Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('from_posts')}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-stone-100 text-[#2563EB] border border-[#EFECE6] font-bold text-xs flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <FileText size={14} />
                    <span>From Feed</span>
                  </button>
                </div>
              </div>

              {/* Inline Text Post Card Creator */}
              {isAddingTextCard && (
                <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#0D9488] flex items-center gap-1.5">
                      <Sparkles size={14} />
                      <span>Create a Text Post Card for Your Spark</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingTextCard(false)}
                      className="text-xs text-[#78716C] hover:text-[#1C1917]"
                    >
                      Close
                    </button>
                  </div>

                  <textarea
                    value={textCardInput}
                    onChange={(e) => setTextCardInput(e.target.value)}
                    placeholder="Write a thought, announcement, quote, or daily update to add as a post in your Spark..."
                    rows={3}
                    maxLength={320}
                    className="w-full p-3 rounded-xl bg-white border border-teal-200 text-xs sm:text-sm text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#57534E] mr-1">Color:</span>
                      {SPARK_TEXT_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setTextCardTheme(theme.id)}
                          title={theme.name}
                          className={`w-7 h-7 rounded-full border-2 transition ${
                            textCardTheme === theme.id
                              ? 'border-[#1C1917] scale-110'
                              : 'border-white opacity-80'
                          }`}
                          style={{
                            background: `linear-gradient(135deg, ${theme.bgStart}, ${theme.bgEnd})`
                          }}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddTextSlide}
                      disabled={!textCardInput.trim()}
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-40 transition"
                    >
                      Add Post to Queue
                    </button>
                  </div>
                </div>
              )}

              {/* Empty Queue State */}
              {slides.length === 0 ? (
                <div className="border-2 border-dashed border-[#E5E0D8] rounded-3xl p-7 text-center bg-[#FAF7F2]">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white mx-auto flex items-center justify-center mb-3 shadow-xs">
                    <Upload size={24} />
                  </div>
                  <h4 className="text-sm sm:text-base font-extrabold text-[#1C1917] mb-1">
                    Queue Multiple Posts for Your Spark
                  </h4>
                  <p className="text-xs text-[#78716C] max-w-md mx-auto mb-4 leading-relaxed">
                    Select multiple photos or videos at once, write text cards, or pick from your
                    existing feed posts. All queued posts will play in sequence inside your 24-hour
                    Spark ring!
                  </p>
                  <div className="flex items-center justify-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => multiFileInputRef.current?.click()}
                      className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs flex items-center gap-2 shadow-xs active:scale-95 transition"
                    >
                      <ImageIcon size={15} />
                      <span>Select Multiple Photos / Videos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('from_posts')}
                      className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-white hover:bg-stone-100 text-[#0D9488] border border-[#EFECE6] font-extrabold text-xs flex items-center gap-2 active:scale-95 transition"
                    >
                      <CheckSquare size={15} />
                      <span>Choose Existing Feed Posts</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Horizontal Slide Deck Filmstrip */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#1C1917]">
                        Queued Spark Posts ({slides.length}{' '}
                        {slides.length === 1 ? 'post' : 'posts'})
                      </span>
                      <span className="text-[11px] font-semibold text-[#78716C]">
                        Tap a slide below to edit its caption or vibe
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                      {slides.map((slide, idx) => {
                        const isSelected = idx === activeSlideIndex;
                        return (
                          <div
                            key={slide.id}
                            onClick={() => setActiveSlideIndex(idx)}
                            className={`relative w-20 h-28 rounded-2xl overflow-hidden shrink-0 cursor-pointer border-2 transition ${
                              isSelected
                                ? 'border-[#2563EB] ring-2 ring-[#2563EB]/25 scale-102'
                                : 'border-[#EFECE6] opacity-80 hover:opacity-100'
                            }`}
                          >
                            {slide.mediaType === 'video' ? (
                              <div className="w-full h-full bg-stone-900 flex items-center justify-center relative">
                                <video
                                  src={slide.mediaDataUrl}
                                  className="w-full h-full object-cover"
                                  muted
                                />
                                <Play
                                  size={16}
                                  className="absolute text-white fill-white drop-shadow"
                                />
                              </div>
                            ) : (
                              <img
                                src={slide.mediaDataUrl}
                                alt={`Slide ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            )}

                            {/* Slide Number Badge */}
                            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-stone-900/80 text-white text-[10px] font-extrabold">
                              #{idx + 1}
                            </div>

                            {/* Delete Slide Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSlide(idx);
                              }}
                              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700"
                              title="Remove this post from queue"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}

                      {/* Add Another Post Tile */}
                      <button
                        type="button"
                        onClick={() => multiFileInputRef.current?.click()}
                        className="w-20 h-28 rounded-2xl border-2 border-dashed border-[#D6D1C7] hover:border-[#2563EB] bg-[#FAF7F2] flex flex-col items-center justify-center gap-1 text-[#57534E] hover:text-[#2563EB] shrink-0 transition"
                      >
                        <Plus size={18} />
                        <span className="text-[10px] font-bold">Add More</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Slide Editor Card */}
                  {activeSlide && (
                    <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#2563EB]">
                          Editing Post #{activeSlideIndex + 1} of {slides.length}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={activeSlideIndex === 0}
                            onClick={() => handleMoveSlide(activeSlideIndex, -1)}
                            className="p-1.5 rounded-lg bg-white border border-[#EFECE6] text-[#57534E] disabled:opacity-40 hover:bg-stone-100"
                            title="Move earlier"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={activeSlideIndex === slides.length - 1}
                            onClick={() => handleMoveSlide(activeSlideIndex, 1)}
                            className="p-1.5 rounded-lg bg-white border border-[#EFECE6] text-[#57534E] disabled:opacity-40 hover:bg-stone-100"
                            title="Move later"
                          >
                            <ChevronRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSlide(activeSlideIndex)}
                            className="p-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50"
                            title="Remove post"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Preview of Active Slide */}
                      <div className="relative rounded-2xl overflow-hidden bg-stone-950 max-h-60 flex items-center justify-center border border-[#EFECE6]">
                        {activeSlide.mediaType === 'video' ? (
                          <video
                            src={activeSlide.mediaDataUrl}
                            controls
                            playsInline
                            className="relative z-10 w-full h-auto max-h-60 object-contain"
                          />
                        ) : (
                          <>
                            <img
                              src={activeSlide.mediaDataUrl}
                              alt=""
                              aria-hidden="true"
                              className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-55 brightness-50 pointer-events-none"
                            />
                            <img
                              src={activeSlide.mediaDataUrl}
                              alt="Slide preview"
                              className="relative z-10 w-full h-auto max-h-60 object-contain"
                            />
                          </>
                        )}
                        {activeSlide.mediaType === 'video' && activeSlide.videoDurationSeconds && (
                          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-mono font-bold flex items-center gap-1.5">
                            <Clock size={11} className="text-teal-400" />
                            <span>
                              {formatSparkDuration(activeSlide.videoDurationSeconds)} /{' '}
                              {isProTier ? `${PRO_SPARK_MAX_SECONDS}s Pro` : `${FREE_SPARK_MAX_SECONDS}s Free`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Vibe Tag Selector for Active Slide */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#1C1917] flex items-center gap-1.5">
                          <Trophy size={13} className="text-[#0D9488]" />
                          <span>Post #{activeSlideIndex + 1} Vibe Badge:</span>
                        </label>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                          {LEGENDARY_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => updateActiveSlide({ legendaryTag: tag })}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition ${
                                activeSlide.legendaryTag === tag
                                  ? 'bg-[#2563EB] text-white shadow-2xs'
                                  : 'bg-white border border-[#EFECE6] text-[#57534E] hover:bg-stone-50'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Caption for Active Slide */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#1C1917]">
                          Post #{activeSlideIndex + 1} Caption:
                        </label>
                        <textarea
                          value={activeSlide.caption}
                          onChange={(e) =>
                            updateActiveSlide({
                              caption: e.target.value,
                              ...(activeSlide.sourceType === 'text_card'
                                ? { textCardBody: e.target.value }
                                : {})
                            })
                          }
                          placeholder="Add a caption or story note for this slide..."
                          rows={2}
                          maxLength={500}
                          className="w-full p-3 rounded-xl bg-white border border-[#EFECE6] text-xs text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Optional Shared Soundtrack */}
                  <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shrink-0">
                        <Music size={16} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] block">
                          Spark Soundtrack
                        </span>
                        {attachedSong ? (
                          <p className="text-xs font-bold text-[#1C1917] truncate">
                            {attachedSong.trackName} — {attachedSong.artistName}
                          </p>
                        ) : (
                          <p className="text-xs text-[#78716C] truncate">
                            Optional background music for your Spark posts
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {attachedSong && (
                        <button
                          type="button"
                          onClick={() => setAttachedSong(null)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg"
                        >
                          <X size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsSongSelectorOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-50 text-[#2563EB] border border-[#EFECE6] font-bold text-xs transition"
                      >
                        {attachedSong ? 'Change Song' : 'Pick Song'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: SELECT MULTIPLE EXISTING FEED POSTS */}
          {activeTab === 'from_posts' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-[#1C1917]">
                    Select Feed Posts to Show as Your Spark
                  </h4>
                  <p className="text-xs text-[#78716C]">
                    Tap multiple posts below, then add them to your 24-hour Spark deck.
                  </p>
                </div>

                <div className="inline-flex rounded-xl bg-[#FAF7F2] p-1 border border-[#EFECE6]">
                  <button
                    type="button"
                    onClick={() => setPostFilterMode('mine')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      postFilterMode === 'mine'
                        ? 'bg-white text-[#1C1917] shadow-2xs'
                        : 'text-[#78716C]'
                    }`}
                  >
                    My Posts
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostFilterMode('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      postFilterMode === 'all'
                        ? 'bg-white text-[#1C1917] shadow-2xs'
                        : 'text-[#78716C]'
                    }`}
                  >
                    Community Feed
                  </button>
                </div>
              </div>

              {displayedFeedPosts.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-center space-y-2">
                  <p className="text-xs font-bold text-[#1C1917]">
                    {postFilterMode === 'mine'
                      ? 'You have not shared any feed posts yet.'
                      : 'No feed posts found yet.'}
                  </p>
                  {postFilterMode === 'mine' && (
                    <button
                      type="button"
                      onClick={() => setPostFilterMode('all')}
                      className="text-xs font-bold text-[#2563EB] hover:underline"
                    >
                      Browse community posts instead →
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {displayedFeedPosts.map((post) => {
                    const isChecked = selectedPostIds.includes(post.id);
                    return (
                      <div
                        key={post.id}
                        onClick={() => handleToggleSelectPost(post.id)}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                          isChecked
                            ? 'bg-blue-50/70 border-[#2563EB] ring-1 ring-[#2563EB]/30'
                            : 'bg-[#FAF7F2] border-[#EFECE6] hover:bg-stone-100/70'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="text-[#2563EB] shrink-0">
                            {isChecked ? (
                              <CheckSquare size={18} className="fill-[#2563EB] text-white" />
                            ) : (
                              <Square size={18} className="text-[#A8A29E]" />
                            )}
                          </div>

                          {post.imageUrl || post.thumbnailUrl ? (
                            <img
                              src={post.imageUrl || post.thumbnailUrl}
                              alt="Post media"
                              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#EFECE6]"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#0D9488] to-[#2563EB] text-white flex items-center justify-center shrink-0 text-[10px] font-extrabold">
                              TEXT
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold text-[#1C1917] truncate">
                                {post.authorName}
                              </span>
                              <span className="text-[10px] text-[#78716C]">
                                • {new Date(post.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-[#57534E] truncate mt-0.5">
                              {post.content ||
                                (post.mediaType === 'video' ? '🎬 Video Reel' : '📷 Photo Wave')}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                            isChecked
                              ? 'bg-[#2563EB] text-white'
                              : 'bg-white text-[#78716C] border border-[#EFECE6]'
                          }`}
                        >
                          {isChecked ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPostIds.length > 0 && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleQueueSelectedFeedPosts}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-sm active:scale-95 transition"
                  >
                    <Check size={15} />
                    <span>
                      Add {selectedPostIds.length} Selected Post
                      {selectedPostIds.length > 1 ? 's' : ''} to Spark Queue
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: USER'S CURRENTLY ACTIVE SPARK POSTS */}
          {activeTab === 'active_sparks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-[#1C1917]">
                    Posts Currently in Your 24-Hour Spark ({myActiveSparks.length})
                  </h4>
                  <p className="text-xs text-[#78716C]">
                    All active posts below play in order when anyone taps your Spark ring.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('builder')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>Add More Posts</span>
                </button>
              </div>

              {myActiveSparks.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-center space-y-2">
                  <p className="text-xs font-bold text-[#1C1917]">
                    You have no active posts in your Spark right now.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('builder')}
                    className="text-xs font-bold text-[#2563EB] hover:underline"
                  >
                    Create your multi-post Spark now →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {myActiveSparks.map((spark, idx) => (
                    <div
                      key={spark.id}
                      className="rounded-2xl border border-[#EFECE6] bg-[#FAF7F2] overflow-hidden flex flex-col justify-between"
                    >
                      <div className="relative h-36 bg-stone-950 overflow-hidden flex items-center justify-center">
                        <img
                          src={spark.thumbnailUrl || spark.mediaUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-55 brightness-50 pointer-events-none"
                        />
                        {spark.mediaType === 'video' ? (
                          <video
                            src={spark.mediaUrl}
                            poster={spark.thumbnailUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="relative z-10 w-full h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <img
                            src={spark.mediaUrl}
                            alt={spark.caption || `Spark ${idx + 1}`}
                            className="relative z-10 w-full h-full object-contain pointer-events-none"
                          />
                        )}
                        <span className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[10px] font-bold">
                          Post #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteExistingSpark(spark.id)}
                          className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700"
                          title="Delete this Spark post"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="p-2.5 space-y-1">
                        <p className="text-[11px] font-bold text-[#1C1917] truncate">
                          {spark.caption || spark.legendaryTag || 'Spark Moment'}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-[#78716C]">
                          <span>🔥 {spark.likesCount || 0} likes</span>
                          <span className="flex items-center gap-0.5">
                            <Clock size={10} />
                            24h active
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Progress Indicator */}
          {isPublishing && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#1C1917]">
                <span className="flex items-center gap-1.5">
                  <Flame size={14} className="animate-bounce text-[#2563EB]" />
                  <span>{publishStatusText || 'Publishing your Spark posts...'}</span>
                </span>
                <span className="font-mono text-[#2563EB]">{publishProgress}%</span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] transition-all duration-200 rounded-full"
                  style={{ width: `${publishProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer with ONE Primary Action Button */}
        <div className="p-4 sm:p-5 bg-[#FAF7F2] border-t border-[#EFECE6] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold text-[#57534E] hover:bg-white border border-[#EFECE6] transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handlePublishAllSparks}
            disabled={isPublishing || slides.length === 0}
            className="min-h-[48px] px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95 transition disabled:opacity-40"
          >
            <Flame size={16} />
            <span>
              {isPublishing
                ? 'Publishing Spark Posts...'
                : slides.length > 1
                ? `Publish ${slides.length} Posts to Your Spark 🔥`
                : 'Publish Post to Your Spark 🔥'}
            </span>
          </button>
        </div>
      </div>

      {/* Online Song Selector Modal */}
      <SongSelectorModal
        isOpen={isSongSelectorOpen}
        onClose={() => setIsSongSelectorOpen(false)}
        onSelectSong={(song) => setAttachedSong(song)}
        selectedSongId={attachedSong?.trackId}
      />
    </div>
  );
};
