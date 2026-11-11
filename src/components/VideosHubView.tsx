import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { Post, PostComment } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { CreatorTipModal } from './CreatorTipModal';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { VideoUploadProgressChip } from './VideoUploadProgressChip';
import { sendNotification } from '../services/notificationService';
import { sharePost } from '../utils/share.js';

function sanitizeUserText(raw: string, maxLen = 800): string {
  return (raw || '').trim().slice(0, maxLen);
}
import {
  cloneVideoFileToMemory,
  inspectAndValidateVideoFile,
  formatVideoFileSize,
  detectFeedMediaType,
  getMaxVideoDurationSeconds,
  resolveVideoUrl,
  MAX_VIDEO_RAW_MB
} from '../utils/mediaStorage';
import { enqueueVideoUploadJob, useVideoUploadQueue } from '../services/videoUploadQueue';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  HandCoins,
  Volume2,
  VolumeX,
  Plus,
  Check,
  Video as VideoIcon,
  X,
  CheckCircle2,
  Send,
  AlertCircle,
  RefreshCw,
  Scissors,
  Music,
  Trash2
} from 'lucide-react';

interface VideosHubViewProps {
  onNavigateToFeed: () => void;
}

const SOUND_PREF_STORAGE_KEY = 'wavelink_feed_video_sound_pref';
const SOUND_PREF_EVENT = 'wavelink:video-sound-pref';

let hasUserUnmutedInSession = false;

function getRememberedMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(SOUND_PREF_STORAGE_KEY);
    if (saved === 'unmuted') return false;
    if (saved === 'muted') return true;
  } catch {
    // ignore storage error
  }
  return true;
}

function saveRememberedMuted(muted: boolean): void {
  hasUserUnmutedInSession = !muted;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_PREF_STORAGE_KEY, muted ? 'muted' : 'unmuted');
    window.dispatchEvent(new CustomEvent(SOUND_PREF_EVENT, { detail: { muted } }));
  } catch {
    // ignore storage error
  }
}

interface ReelSlideItemProps {
  post: Post;
  isActive: boolean;
  shouldMountVideo: boolean;
  shouldPreloadNext: boolean;
  isMuted: boolean;
  onToggleSound: (e: React.MouseEvent) => void;
  isLiked: boolean;
  isSaved: boolean;
  isCopied: boolean;
  onToggleLike: (post: Post) => void;
  onOpenComments: (post: Post) => void;
  onShare: (post: Post) => void;
  onToggleSave: (postId: string) => void;
  onOpenTip: (post: Post) => void;
}

const ReelSlideItem: React.FC<ReelSlideItemProps> = ({
  post,
  isActive,
  shouldMountVideo,
  shouldPreloadNext,
  isMuted,
  onToggleSound,
  isLiked,
  isSaved,
  isCopied,
  onToggleLike,
  onOpenComments,
  onShare,
  onToggleSave,
  onOpenTip
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(() => {
    if (post.videoWidth && post.videoHeight && post.videoWidth > 0 && post.videoHeight > 0) {
      return { width: post.videoWidth, height: post.videoHeight };
    }
    return null;
  });

  // Use the raw videoUrl directly without adding extra Cloudinary transformations so original quality is preserved
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (
      post.videoUrl &&
      (post.videoUrl.startsWith('https://') ||
        post.videoUrl.startsWith('http://') ||
        post.videoUrl.startsWith('blob:'))
    ) {
      return post.videoUrl;
    }
    return null;
  });

  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgBlurVideoRef = useRef<HTMLVideoElement | null>(null);
  const userPausedRef = useRef<boolean>(false);

  // Resolve legacy chunked videos only when mounted
  useEffect(() => {
    if (!shouldMountVideo) return;
    if (
      post.videoUrl &&
      (post.videoUrl.startsWith('https://') ||
        post.videoUrl.startsWith('http://') ||
        post.videoUrl.startsWith('blob:'))
    ) {
      setResolvedSrc(post.videoUrl);
      return;
    }

    let mounted = true;
    resolveVideoUrl(post.id, post.videoUrl, post.hasVideoChunks)
      .then((url) => {
        if (mounted && url) {
          setResolvedSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [shouldMountVideo, post.id, post.videoUrl, post.hasVideoChunks]);

  // Keep muted state in sync with user preference
  useEffect(() => {
    if (mainVideoRef.current) {
      mainVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const pauseReel = useCallback(() => {
    if (mainVideoRef.current && !mainVideoRef.current.paused) {
      mainVideoRef.current.pause();
    }
    if (bgBlurVideoRef.current && !bgBlurVideoRef.current.paused) {
      bgBlurVideoRef.current.pause();
    }
    setIsBuffering(false);
  }, []);

  const playReel = useCallback(() => {
    const vid = mainVideoRef.current;
    if (!vid) return;

    const wantUnmuted = !isMuted && hasUserUnmutedInSession;
    vid.muted = !wantUnmuted;

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsBuffering(false);
          if (bgBlurVideoRef.current) {
            bgBlurVideoRef.current.currentTime = vid.currentTime;
            bgBlurVideoRef.current.play().catch(() => {});
          }
        })
        .catch(() => {
          // Mobile browsers block unmuted autoplay until user taps speaker — fall back to muted autoplay
          if (mainVideoRef.current) {
            mainVideoRef.current.muted = true;
            mainVideoRef.current
              .play()
              .then(() => {
                setIsBuffering(false);
                if (bgBlurVideoRef.current) {
                  bgBlurVideoRef.current.play().catch(() => {});
                }
              })
              .catch(() => {
                setIsBuffering(false);
              });
          }
        });
    }
  }, [isMuted]);

  // Autoplay when this reel enters view, and pause immediately when it leaves view
  useEffect(() => {
    if (!shouldMountVideo || !resolvedSrc) {
      pauseReel();
      return;
    }

    if (isActive) {
      if (!userPausedRef.current) {
        playReel();
      }
    } else {
      userPausedRef.current = false;
      pauseReel();
      if (mainVideoRef.current) {
        try {
          mainVideoRef.current.currentTime = 0;
        } catch {
          // ignore seek error before metadata
        }
      }
    }
  }, [isActive, shouldMountVideo, resolvedSrc, playReel, pauseReel]);

  // Single tap on the video pauses or resumes it
  const handleTapVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const vid = mainVideoRef.current;
    if (!vid) return;

    if (vid.paused) {
      userPausedRef.current = false;
      playReel();
    } else {
      userPausedRef.current = true;
      pauseReel();
    }
  };

  const handleLoadedMetadata = () => {
    const vid = mainVideoRef.current;
    if (!vid) return;
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      setNaturalSize({ width: vid.videoWidth, height: vid.videoHeight });
    }
    setIsVideoReady(true);
    setIsBuffering(false);
    if (isActive && !userPausedRef.current) {
      playReel();
    }
  };

  // Load original sharp image file first before falling back to thumbnail
  const sharpImageUrl = post.imageUrl || post.thumbnailUrl || undefined;
  const preloadMode = isActive || shouldPreloadNext ? 'auto' : 'metadata';

  // Never upscale beyond the media's real resolution
  const mediaConstrainStyle: React.CSSProperties | undefined = naturalSize
    ? {
        maxWidth: `min(100%, ${naturalSize.width}px)`,
        maxHeight: `min(100%, ${naturalSize.height}px)`
      }
    : undefined;

  return (
    <div
      onClick={handleTapVideo}
      className="relative w-full h-full bg-[#0C0A09] overflow-hidden flex items-center justify-center cursor-pointer select-none"
    >
      {/* Soft loading placeholder while buffering */}
      {!isVideoReady && !sharpImageUrl && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1] bg-gradient-to-b from-stone-900 via-stone-800 to-stone-950 animate-pulse pointer-events-none"
        />
      )}

      {/* Subtle top shimmer line when mid-stream buffering occurs */}
      {isBuffering && isActive && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-0.5 z-30 bg-white/25 overflow-hidden pointer-events-none"
        >
          <div className="w-1/2 h-full bg-white/85 animate-pulse rounded-full" />
        </div>
      )}

      {/* Full-bleed soft blurred, darkened copy of the same video or photo filling empty sides so there are no black bars */}
      {shouldMountVideo && resolvedSrc ? (
        <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
          <video
            ref={bgBlurVideoRef}
            src={resolvedSrc}
            poster={sharpImageUrl}
            muted
            playsInline
            webkit-playsinline="true"
            loop
            preload={preloadMode}
            className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
          />
          <div className="absolute inset-0 bg-black/35" />
        </div>
      ) : (
        sharpImageUrl && (
          <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            <img
              src={sharpImageUrl}
              alt=""
              className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
            />
            <div className="absolute inset-0 bg-black/35" />
          </div>
        )
      )}

      {/* Centered Reel Stage + Right-Side Action Buttons */}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        {/* Reel Column: Full-screen on phones, 420–480px wide & full height on wide screens */}
        <div className="relative w-full sm:w-[456px] sm:min-w-[420px] sm:max-w-[480px] h-full flex items-center justify-center overflow-hidden sm:shadow-[0_0_48px_rgba(0,0,0,0.55)]">
          {/* Sharp Image / Poster when video is not mounted or still initializing */}
          {sharpImageUrl && (!shouldMountVideo || !isVideoReady || !resolvedSrc) && (
            <img
              src={sharpImageUrl}
              alt={post.content || 'Reel preview'}
              decoding="async"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0 && !naturalSize) {
                  setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                }
              }}
              style={mediaConstrainStyle}
              className="relative z-[2] w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Primary Reel Video: True aspect ratio with object-contain, never stretched, never cropped, never upscaled beyond real resolution */}
          {shouldMountVideo && resolvedSrc && (
            <video
              ref={mainVideoRef}
              src={resolvedSrc}
              poster={sharpImageUrl}
              playsInline
              webkit-playsinline="true"
              loop
              muted={isMuted}
              preload={preloadMode}
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={() => {
                setIsVideoReady(true);
                setIsBuffering(false);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsVideoReady(true);
                setIsBuffering(false);
              }}
              onTimeUpdate={() => {
                if (
                  bgBlurVideoRef.current &&
                  mainVideoRef.current &&
                  Math.abs(bgBlurVideoRef.current.currentTime - mainVideoRef.current.currentTime) > 0.4
                ) {
                  bgBlurVideoRef.current.currentTime = mainVideoRef.current.currentTime;
                }
              }}
              style={mediaConstrainStyle}
              className="relative z-[2] w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Small Speaker Button to Unmute / Mute (Top-Right of Reel) */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={isMuted ? 'Unmute reel' : 'Mute reel'}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="absolute top-16 right-3.5 sm:right-4 z-25 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
          >
            <span className="w-9 h-9 rounded-2xl bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-md transition active:scale-95">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-[#10B981]" />}
            </span>
          </button>

          {/* Bottom Soft Gradient Scrim so Author Info & Caption are always readable */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-64 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none"
          />

          {/* Bottom of Video: Creator Avatar, Name, Caption & Attached Song */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-3.5 sm:left-4 right-20 sm:right-4 bottom-4 sm:bottom-6 z-20 flex flex-col gap-2 text-white pointer-events-auto"
          >
            <div className="flex items-center gap-2.5">
              <img
                src={
                  post.authorPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`
                }
                alt={post.authorName}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-2xl object-cover ring-2 ring-white/85 shadow-md shrink-0 bg-stone-800"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-sm sm:text-base text-white drop-shadow-xs truncate">
                    {post.authorName}
                  </span>
                  <CrystalBadge email={post.authorEmail} name="" size="sm" />
                </div>
                <span className="text-[11px] font-mono text-white/80 block truncate">
                  {post.authorUsername || '@waver'}
                </span>
              </div>
            </div>

            {post.content && (
              <p className="text-xs sm:text-sm text-white/95 leading-snug line-clamp-3 break-words drop-shadow-xs">
                {post.content}
              </p>
            )}

            {post.songTitle && (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90 truncate max-w-xs">
                <Music size={12} className="text-[#10B981] shrink-0" />
                <span className="truncate">
                  {post.songTitle}
                  {post.songArtist ? ` · ${post.songArtist}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Vertical Action Stack (Beside the reel on wide screens, over right edge on mobile) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-4 sm:static sm:ml-3.5 sm:self-end sm:mb-6 z-20 flex flex-col items-center gap-3 pointer-events-auto"
        >
          {/* 1. Like */}
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            aria-label="Like reel"
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition active:scale-90 shadow-md ${
                isLiked
                  ? 'bg-[#F43F5E] border-[#F43F5E] text-white shadow-[#F43F5E]/30'
                  : 'bg-black/45 hover:bg-black/65 backdrop-blur-md border-white/25 text-white'
              }`}
            >
              <Heart size={20} className={isLiked ? 'fill-white' : ''} />
            </span>
            <span className="text-[11px] font-mono font-bold text-white tabular-nums drop-shadow-xs">
              {post.likesCount || 0}
            </span>
          </button>

          {/* 2. Comment (Opens Bottom Sheet over Reel) */}
          <button
            type="button"
            onClick={() => onOpenComments(post)}
            aria-label="Open comments"
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span className="w-11 h-11 rounded-2xl bg-black/45 hover:bg-[#2563EB] backdrop-blur-md border border-white/25 text-white flex items-center justify-center transition active:scale-90 shadow-md">
              <MessageCircle size={20} />
            </span>
            <span className="text-[11px] font-mono font-bold text-white tabular-nums drop-shadow-xs">
              {post.commentsCount || 0}
            </span>
          </button>

          {/* 3. Share */}
          <button
            type="button"
            onClick={() => onShare(post)}
            aria-label="Share reel"
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition active:scale-90 shadow-md ${
                isCopied
                  ? 'bg-[#10B981] border-[#10B981] text-white'
                  : 'bg-black/45 hover:bg-[#0284C7] backdrop-blur-md border-white/25 text-white'
              }`}
            >
              {isCopied ? <Check size={19} /> : <Share2 size={19} />}
            </span>
            <span className="text-[10px] font-bold text-white drop-shadow-xs">
              {isCopied ? 'Copied' : 'Share'}
            </span>
          </button>

          {/* 4. Save */}
          <button
            type="button"
            onClick={() => onToggleSave(post.id)}
            aria-label={isSaved ? 'Remove from saved' : 'Save reel'}
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition active:scale-90 shadow-md ${
                isSaved
                  ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-[#2563EB]/30'
                  : 'bg-black/45 hover:bg-black/65 backdrop-blur-md border-white/25 text-white'
              }`}
            >
              <Bookmark size={19} className={isSaved ? 'fill-white' : ''} />
            </span>
            <span className="text-[11px] font-mono font-bold text-white tabular-nums drop-shadow-xs">
              {post.savesCount || 0}
            </span>
          </button>

          {/* 5. Tip Creator */}
          <button
            type="button"
            onClick={() => onOpenTip(post)}
            aria-label={`Tip ${post.authorName}`}
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0D9488] to-[#2563EB] hover:opacity-95 border border-white/35 text-white flex items-center justify-center transition active:scale-90 shadow-md shadow-[#0D9488]/30">
              <HandCoins size={19} />
            </span>
            <span className="text-[10px] font-extrabold text-white drop-shadow-xs">Tip</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const VideosHubView: React.FC<VideosHubViewProps> = () => {
  const { currentUser, userProfile, isAdmin, isProEffective, toggleSavePost } = useAuth();
  const isProTier = Boolean(isProEffective || isAdmin);
  const maxVideoSeconds = getMaxVideoDurationSeconds(isProTier);
  const { jobs: videoUploadJobs } = useVideoUploadQueue();
  const activeOrFailedVideoJobs = videoUploadJobs.filter((j) => j.status !== 'completed');

  const [videoPosts, setVideoPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<'all' | 'saved' | 'popular'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active reel index in the vertical pager
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Remembered sound preference across reels
  const [isMuted, setIsMuted] = useState<boolean>(() => getRememberedMuted());

  // Comments Bottom Sheet state
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [reelComments, setReelComments] = useState<PostComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [isSendingComment, setIsSendingComment] = useState<boolean>(false);

  // Tip Creator Modal state
  const [tippingPost, setTippingPost] = useState<Post | null>(null);

  // Video Uploader state
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [videoCaption, setVideoCaption] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [videoTrimStart, setVideoTrimStart] = useState<number>(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState<number>(30);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText] = useState('Preparing video...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [sizeLimitWarning, setSizeLimitWarning] = useState<{
    message: string;
    canUpgrade: boolean;
  } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Sync sound preference across components
  useEffect(() => {
    const handleSoundPref = (e: Event) => {
      const customEvent = e as CustomEvent<{ muted: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.muted === 'boolean') {
        setIsMuted(customEvent.detail.muted);
      }
    };
    window.addEventListener(SOUND_PREF_EVENT, handleSoundPref);
    return () => window.removeEventListener(SOUND_PREF_EVENT, handleSoundPref);
  }, []);

  // Real-time listener for video posts
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Post[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.videoUrl || data.hasVideoChunks || data.mediaType === 'video') {
            list.push({ ...data, id: d.id } as Post);
          }
        });
        setVideoPosts(list);
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
    );

    return () => unsub();
  }, []);

  // Immediately insert completed video posts at the top of the Reels pager
  useEffect(() => {
    const handleVideoPostCreated = (event: Event) => {
      const customEvent = event as CustomEvent<Post>;
      const created = customEvent.detail;
      if (!created || !created.id) return;
      setVideoPosts((prev) => {
        if (prev.some((p) => p.id === created.id)) return prev;
        return [created, ...prev];
      });
      setActiveIndex(0);
      if (pagerRef.current) {
        pagerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('wavelink:video-post-created', handleVideoPostCreated);
    return () => window.removeEventListener('wavelink:video-post-created', handleVideoPostCreated);
  }, []);

  const filteredPosts = videoPosts.filter((post) => {
    if (filter === 'saved') {
      return (userProfile?.savedPostIds || []).includes(post.id);
    }
    if (filter === 'popular') {
      return (post.likesCount || 0) > 0;
    }
    return true;
  });

  // Reset activeIndex when filter changes
  useEffect(() => {
    setActiveIndex(0);
    if (pagerRef.current) {
      pagerRef.current.scrollTo({ top: 0 });
    }
  }, [filter]);

  // Observe which reel slide is snapped in view
  useEffect(() => {
    const root = pagerRef.current;
    if (!root || filteredPosts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const idxAttr = entry.target.getAttribute('data-reel-index');
            const idx = idxAttr !== null ? Number(idxAttr) : -1;
            if (idx >= 0 && entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestIdx = idx;
            }
          }
        });
        if (bestIdx !== -1) {
          setActiveIndex((prev) => (prev === bestIdx ? prev : bestIdx));
        }
      },
      {
        root,
        threshold: [0.55, 0.75, 0.9]
      }
    );

    slideRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredPosts.length, filter]);

  // Fallback scroll handler so activeIndex stays accurate on rapid flicks
  const handlePagerScroll = () => {
    const root = pagerRef.current;
    if (!root || root.clientHeight <= 0) return;
    const nextIdx = Math.round(root.scrollTop / root.clientHeight);
    if (nextIdx >= 0 && nextIdx < filteredPosts.length && nextIdx !== activeIndex) {
      setActiveIndex(nextIdx);
    }
  };

  // Real-time comments listener for the active bottom sheet reel
  useEffect(() => {
    if (!activeCommentsPost?.id) {
      setReelComments([]);
      return;
    }
    setIsLoadingComments(true);
    const q = query(
      collection(db, 'posts', activeCommentsPost.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PostComment[] = [];
        snap.forEach((d) => {
          list.push({ ...(d.data() as Omit<PostComment, 'id'>), id: d.id });
        });
        setReelComments(list);
        setIsLoadingComments(false);
      },
      (err) => {
        setIsLoadingComments(false);
        handleFirestoreError(err, OperationType.LIST, `posts/${activeCommentsPost.id}/comments`);
      }
    );
    return () => unsub();
  }, [activeCommentsPost?.id]);

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    saveRememberedMuted(nextMuted);
  };

  const handleToggleLike = async (post: Post) => {
    if (!currentUser) return;
    const isLiked = post.likes?.includes(currentUser.uid);
    const updatedLikes = isLiked
      ? (post.likes || []).filter((id) => id !== currentUser.uid)
      : [...(post.likes || []), currentUser.uid];

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: updatedLikes,
        likesCount: updatedLikes.length
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleToggleSave = async (postId: string) => {
    await toggleSavePost(postId);
  };

  const handleShare = async (post: Post) => {
    try {
      const res = await sharePost(post);
      if (res?.method === 'clipboard') {
        setCopiedId(post.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      navigator.clipboard?.writeText(`${window.location.origin}/#video-${post.id}`);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleSubmitReelComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeCommentsPost) return;
    const cleanText = sanitizeUserText(commentText, 800);
    if (!cleanText) return;

    setIsSendingComment(true);
    try {
      const postId = activeCommentsPost.id;
      const commentData = {
        postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername:
          userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        content: cleanText,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'posts', postId, 'comments'), commentData);

      const latestPost = videoPosts.find((p) => p.id === postId) || activeCommentsPost;
      const newCount = (latestPost.commentsCount || 0) + 1;
      await updateDoc(doc(db, 'posts', postId), {
        commentsCount: newCount
      });

      if (latestPost.authorId && latestPost.authorId !== currentUser.uid) {
        sendNotification({
          recipientId: latestPost.authorId,
          type: 'post_comment',
          title: 'New Comment on Reel 💬',
          body: `${userProfile?.displayName || currentUser.displayName || 'A waver'} commented: "${cleanText.substring(0, 50)}${cleanText.length > 50 ? '...' : ''}"`,
          entityId: postId,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName || currentUser.displayName || 'A waver',
          actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined
        }).catch(() => {});
      }

      setCommentText('');
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `posts/${activeCommentsPost.id}/comments`
      );
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleDeleteReelComment = async (comment: PostComment) => {
    if (!currentUser || !activeCommentsPost) return;
    if (comment.authorId !== currentUser.uid && !isAdmin) return;
    try {
      const postId = activeCommentsPost.id;
      await deleteDoc(doc(db, 'posts', postId, 'comments', comment.id));
      const latestPost = videoPosts.find((p) => p.id === postId) || activeCommentsPost;
      const nextCount = Math.max(0, (latestPost.commentsCount || 1) - 1);
      await updateDoc(doc(db, 'posts', postId), {
        commentsCount: nextCount
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `posts/${activeCommentsPost.id}/comments/${comment.id}`
      );
    }
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile || detectFeedMediaType(rawFile) !== 'video') return;

    const inspection = await inspectAndValidateVideoFile(rawFile, isProTier);
    if (inspection.tooLarge || (!inspection.valid && !inspection.needsTrim)) {
      e.target.value = '';
      setSizeLimitWarning({
        message:
          inspection.error ||
          `This video is larger than the ${MAX_VIDEO_RAW_MB} MB maximum size limit. Please choose a smaller video.`,
        canUpgrade: false
      });
      return;
    }

    const safeFile = await cloneVideoFileToMemory(rawFile);
    e.target.value = '';
    const rawDur = Math.max(1, Math.round(inspection.durationSeconds || 30));
    setSelectedVideoFile(safeFile);
    setVideoPreviewUrl(URL.createObjectURL(safeFile));
    setVideoDuration(rawDur);
    setVideoTrimStart(0);
    setVideoTrimEnd(Math.min(maxVideoSeconds, rawDur));
    setUploadError(null);
    setShowUploadBox(true);

    if (inspection.needsTrim || rawDur > maxVideoSeconds) {
      setSizeLimitWarning({
        message: isProTier
          ? `Pro videos can be up to 90 seconds (yours is ${rawDur}s). Use the trim controls below to select up to 90 seconds.`
          : `Free accounts can upload videos up to 60 seconds, or up to 90 seconds with Pro (yours is ${rawDur}s). Trim below to ${maxVideoSeconds}s or upgrade to Pro.`,
        canUpgrade: !isProTier && rawDur <= 90
      });
    } else {
      setSizeLimitWarning(null);
    }
  };

  const handlePublishVideoToFirestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !selectedVideoFile) return;

    const clipDur = Math.max(1, videoTrimEnd - videoTrimStart);
    if (clipDur > maxVideoSeconds + 0.5) {
      setUploadError(
        isProTier
          ? 'Pro videos can be up to 90 seconds. Please trim your clip to 90 seconds or less.'
          : 'Free accounts can upload videos up to 60 seconds (90s for Pro). Please trim your clip to 60 seconds or less.'
      );
      setVideoTrimEnd(Math.min(videoDuration, videoTrimStart + maxVideoSeconds));
      return;
    }

    setIsUploadingVideo(true);
    setUploadProgress(10);
    setUploadError(null);
    setUploadNotice(null);

    const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';
    enqueueVideoUploadJob({
      file: selectedVideoFile,
      authorId: currentUser.uid,
      authorEmail: currentUser.email || '',
      authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
      authorUsername: userProfile?.username || `@${emailPrefix}`,
      authorPhotoURL:
        userProfile?.photoURL ||
        currentUser.photoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      content: videoCaption.trim() || `Shared a new video reel: ${selectedVideoFile.name}`,
      trimStart: videoTrimStart,
      trimEnd: videoTrimEnd,
      isProUser: isProTier
    });

    setSelectedVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoCaption('');
    setShowUploadBox(false);
    setSizeLimitWarning(null);
    setIsUploadingVideo(false);
    setUploadNotice('Uploading video to Cloudinary — keep browsing!');
    setTimeout(() => setUploadNotice(null), 4000);
  };

  return (
    <div className="relative w-full h-full bg-[#0C0A09] overflow-hidden select-none">
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        onChange={handleVideoFileChange}
        className="hidden"
      />

      {/* Top Safe-Area Overlay Bar: Filter Tabs + Upload Reel Button */}
      <div
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        className="absolute top-0 inset-x-0 z-30 px-3.5 sm:px-6 pb-3 bg-gradient-to-b from-black/75 via-black/35 to-transparent flex items-center justify-between gap-2 pointer-events-none"
      >
        <div className="flex items-center gap-1 bg-black/45 backdrop-blur-md border border-white/15 p-1 rounded-2xl pointer-events-auto">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'text-white/80 hover:text-white'
            }`}
          >
            For You
          </button>
          <button
            type="button"
            onClick={() => setFilter('popular')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              filter === 'popular'
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'text-white/80 hover:text-white'
            }`}
          >
            Trending
          </button>
          <button
            type="button"
            onClick={() => setFilter('saved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              filter === 'saved'
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'text-white/80 hover:text-white'
            }`}
          >
            Saved
          </button>
        </div>

        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#0D9488] hover:bg-[#0f766e] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-[#0D9488]/25 transition active:scale-95 pointer-events-auto cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>New Reel</span>
        </button>
      </div>

      {/* Live Cloudinary Upload Progress Chip / Warning Banner Overlaid at Top */}
      {(activeOrFailedVideoJobs.length > 0 || uploadNotice || sizeLimitWarning) && (
        <div className="absolute top-16 left-3.5 right-16 sm:left-6 sm:right-20 z-30 space-y-2 pointer-events-auto max-w-md">
          <VideoUploadProgressChip variant="feed-inline" />

          {uploadNotice && (
            <div className="p-3 rounded-2xl bg-emerald-950/90 backdrop-blur-md border border-emerald-500/40 text-emerald-100 text-xs font-bold flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={15} className="text-[#10B981] shrink-0" />
                <span className="truncate">{uploadNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadNotice(null)}
                className="p-1 text-emerald-300 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {sizeLimitWarning && !showUploadBox && (
            <div className="p-3 rounded-2xl bg-amber-950/95 backdrop-blur-md border border-amber-500/40 text-amber-100 text-xs flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={15} className="text-amber-400 shrink-0" />
                <span className="font-semibold leading-snug">{sizeLimitWarning.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSizeLimitWarning(null)}
                className="p-1 text-amber-300 hover:text-white shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Vertical Scroll-Snap Pager */}
      {isLoading ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-white/80 gap-3">
          <div className="w-9 h-9 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Loading Reels...</span>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 text-white">
          <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 text-[#2563EB] flex items-center justify-center mb-4">
            <VideoIcon size={30} />
          </div>
          <h3 className="text-lg font-extrabold text-white mb-1">
            {filter === 'saved' ? 'No Saved Reels Yet' : 'No Reels Shared Yet'}
          </h3>
          <p className="text-xs sm:text-sm text-white/70 max-w-xs mb-6 leading-relaxed">
            {filter === 'saved'
              ? 'Tap the bookmark icon on any reel to save it here.'
              : 'Share your first portrait or landscape video reel with the WaveLink community.'}
          </p>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="px-6 py-3 rounded-2xl bg-[#2563EB] hover:bg-blue-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition active:scale-95 cursor-pointer"
          >
            Upload a Reel
          </button>
        </div>
      ) : (
        <div
          ref={pagerRef}
          onScroll={handlePagerScroll}
          className="wavelink-reels-pager"
        >
          {filteredPosts.map((post, idx) => {
            const isLiked = Boolean(post.likes?.includes(currentUser?.uid || ''));
            const isSaved = Boolean((userProfile?.savedPostIds || []).includes(post.id));
            // Keep at most 3 videos mounted (previous, current, next) to save mobile data
            const shouldMountVideo = Math.abs(idx - activeIndex) <= 1;
            // Preload only the immediate next reel
            const shouldPreloadNext = idx === activeIndex + 1;

            return (
              <section
                key={post.id}
                data-reel-index={idx}
                ref={(el) => {
                  if (el) {
                    slideRefs.current.set(idx, el);
                  } else {
                    slideRefs.current.delete(idx);
                  }
                }}
                className="wavelink-reel-slide"
              >
                <ReelSlideItem
                  post={post}
                  isActive={idx === activeIndex}
                  shouldMountVideo={shouldMountVideo}
                  shouldPreloadNext={shouldPreloadNext}
                  isMuted={isMuted}
                  onToggleSound={handleToggleSound}
                  isLiked={isLiked}
                  isSaved={isSaved}
                  isCopied={copiedId === post.id}
                  onToggleLike={handleToggleLike}
                  onOpenComments={(targetPost) => setActiveCommentsPost(targetPost)}
                  onShare={handleShare}
                  onToggleSave={handleToggleSave}
                  onOpenTip={(targetPost) => setTippingPost(targetPost)}
                />
              </section>
            );
          })}
        </div>
      )}

      {/* Comments Bottom Sheet over the Active Reel */}
      {activeCommentsPost && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 backdrop-blur-xs animate-fade-in"
          onClick={() => setActiveCommentsPost(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
            className="w-full max-w-xl mx-auto bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-t-3xl border-t border-[var(--border-hairline)] shadow-2xl max-h-[72dvh] flex flex-col overflow-hidden"
          >
            {/* Grab Handle & Header */}
            <div className="pt-2.5 pb-3 px-5 border-b border-[var(--border-hairline)] flex flex-col items-center relative">
              <div className="w-10 h-1.5 rounded-full bg-stone-300 mb-2" />
              <div className="w-full flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Comments ({reelComments.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveCommentsPost(null)}
                  className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  aria-label="Close comments"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Comments List */}
            <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-3 min-h-[180px]">
              {isLoadingComments ? (
                <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                  Loading comments...
                </div>
              ) : reelComments.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                  No comments yet. Start the conversation!
                </div>
              ) : (
                reelComments.map((comment) => {
                  const canDeleteComment =
                    currentUser?.uid === comment.authorId || isAdmin;
                  return (
                    <div
                      key={comment.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-[var(--bg-subtle)]/70"
                    >
                      <img
                        src={
                          comment.authorPhotoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${comment.authorId}`
                        }
                        alt={comment.authorName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-xl object-cover shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                              {comment.authorName}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                              {new Date(comment.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {canDeleteComment && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReelComment(comment)}
                              className="p-1 text-stone-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                              title="Delete comment"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-primary)] mt-0.5 break-words leading-relaxed">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Comment Input Form */}
            <form
              onSubmit={handleSubmitReelComment}
              className="px-4 pt-2.5 pb-1 border-t border-[var(--border-hairline)] flex items-center gap-2"
            >
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                maxLength={800}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[#2563EB]"
              />
              <button
                type="submit"
                disabled={isSendingComment || !commentText.trim()}
                className="min-h-[42px] px-4 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-blue-600 text-white font-extrabold text-xs flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer shrink-0"
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload Reel Modal over Reels */}
      {showUploadBox && selectedVideoFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => {
            if (!isUploadingVideo) {
              setShowUploadBox(false);
              setSelectedVideoFile(null);
              setVideoPreviewUrl(null);
            }
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handlePublishVideoToFirestore}
            className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
                  <VideoIcon size={18} className="text-[#2563EB]" />
                  <span>Publish Video Reel</span>
                </h3>
                <span className="text-xs font-mono text-slate-500">
                  {formatVideoFileSize(selectedVideoFile.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUploadBox(false);
                  setSelectedVideoFile(null);
                  setVideoPreviewUrl(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {sizeLimitWarning && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-center justify-between gap-2">
                <span className="font-semibold">{sizeLimitWarning.message}</span>
                {videoDuration > maxVideoSeconds && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoTrimStart(0);
                      setVideoTrimEnd(maxVideoSeconds);
                      setSizeLimitWarning(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1 shrink-0"
                  >
                    <Scissors size={12} />
                    <span>Trim to {maxVideoSeconds}s</span>
                  </button>
                )}
              </div>
            )}

            {videoPreviewUrl && (
              <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                <video
                  src={videoPreviewUrl}
                  controls
                  playsInline
                  className="w-full max-h-64 object-contain"
                />
                <div className="p-3 bg-slate-900 border-t border-white/10 text-white space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>
                      Clip length:{' '}
                      <span className="text-blue-400 font-mono">
                        {Math.max(1, Math.round(videoTrimEnd - videoTrimStart))}s
                      </span>{' '}
                      / {maxVideoSeconds}s max ({isProTier ? 'Pro' : 'Free'})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-0.5">
                        <span>Start</span>
                        <span className="font-mono">{videoTrimStart}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, videoDuration - 1)}
                        step={1}
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
                      <div className="flex justify-between text-slate-300 mb-0.5">
                        <span>End</span>
                        <span className="font-mono">{videoTrimEnd}s</span>
                      </div>
                      <input
                        type="range"
                        min={Math.min(videoDuration, videoTrimStart + 1)}
                        max={Math.min(videoDuration, videoTrimStart + maxVideoSeconds)}
                        step={1}
                        value={videoTrimEnd}
                        onChange={(e) => setVideoTrimEnd(Number(e.target.value))}
                        className="w-full accent-[#10B981]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <input
              type="text"
              value={videoCaption}
              onChange={(e) => setVideoCaption(e.target.value)}
              placeholder="Write a caption for your reel..."
              className="w-full px-4 py-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#2563EB]"
            />

            {isUploadingVideo && (
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                  <span>{uploadStatusText}</span>
                  <span className="font-mono text-[#2563EB] font-black">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] to-[#10B981] transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handlePublishVideoToFirestore()}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw size={13} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUploadBox(false);
                  setSelectedVideoFile(null);
                  setVideoPreviewUrl(null);
                  setUploadError(null);
                }}
                className="px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploadingVideo}
                className="px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Send size={14} />
                <span>
                  {isUploadingVideo ? `Uploading (${uploadProgress}%)...` : 'Publish Reel'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tip Creator Modal over Active Reel */}
      {tippingPost && (
        <CreatorTipModal
          post={tippingPost}
          isOpen={Boolean(tippingPost)}
          onClose={() => setTippingPost(null)}
        />
      )}

      {isPaymentModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            setSizeLimitWarning(null);
          }}
        />
      )}
    </div>
  );
};
