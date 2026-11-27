import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, getCachedUserProfile } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  doc,
  updateDoc
} from 'firebase/firestore';
import { CreatorChallenge, Post } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { CreatorTipModal } from './CreatorTipModal';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { VideoUploadProgressChip } from './VideoUploadProgressChip';
import { CommentsSheet } from './CommentsSheet';
import { ShareSheet } from './ShareSheet';
import { Avatar } from './Avatar';
import { UnifiedPostCard } from './UnifiedPostCard';
import { ActiveChallengeBanner } from './ActiveChallengeBanner';
import { WinnersWallView } from './WinnersWallView';
import { fetchChallengesCached, getActiveChallengeFromList } from '../services/challengesService';
import {
  InterestPickerModal,
  getSavedUserInterests,
  hasUserCompletedOrSkippedInterests,
  mapUserInterestsToExploreCategories,
  scorePostByInterests
} from './InterestPickerModal';
import {
  EXPLORE_CATEGORIES,
  requestUploadTimeVideoTagging,
  sanitizeVideoCaptionText
} from '../services/videoAiTagger';
import { formatCompactNumber } from '../utils/safetyFilters';
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
  Flag,
  Search,
  Sparkles,
  ArrowLeft,
  SlidersHorizontal,
  EyeOff,
  Wand2,
  Layers
} from 'lucide-react';

interface VideosHubViewProps {
  onNavigateToFeed: () => void;
  onJoinChallenge?: (challenge: CreatorChallenge) => void;
  onOpenChallengesTab?: () => void;
  onViewProfile?: (userId: string) => void;
}

export interface OpenReelsQueueEventDetail {
  startPost: Post;
  queue: Post[];
}

const SOUND_PREF_STORAGE_KEY = 'wavelink_feed_video_sound_pref';
const SOUND_PREF_EVENT = 'wavelink:video-sound-pref';
const EXPLORE_PAGE_SIZE = 14;

// Module-level in-memory session cache so returning from Reels or switching tabs costs 0 Firestore reads
interface ExploreSessionCacheState {
  posts: Post[];
  lastVisibleDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  fetchedCategories: Set<string>;
  fetchedKeywords: Set<string>;
  scrollY: number;
}

const exploreSessionCache: ExploreSessionCacheState = {
  posts: [],
  lastVisibleDoc: null,
  hasMore: true,
  fetchedCategories: new Set<string>(),
  fetchedKeywords: new Set<string>(),
  scrollY: 0
};

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

function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource-exhausted') ||
    msg.toLowerCase().includes('resource exhausted')
  );
}

function inferPostCategory(post: Post): string {
  if (post.category && typeof post.category === 'string' && post.category.trim()) {
    const matched = EXPLORE_CATEGORIES.find(
      (c) => c.toLowerCase() === post.category!.trim().toLowerCase()
    );
    if (matched) return matched;
  }
  const text = `${post.content || ''} ${(post.hashtags || []).join(' ')} ${(post.keywords || []).join(' ')} ${post.songTitle || ''}`.toLowerCase();
  if (/(music|muziki|bongo|flava|amapiano|afrobeat|singeli|song|wimbo|dance)/.test(text)) return 'Music';
  if (/(comedy|vichekesho|funny|skit|joke|laugh|cheka|meme)/.test(text)) return 'Comedy';
  if (/(sport|football|soccer|soka|mpira|simba|yanga|goal|gym|afcon)/.test(text)) return 'Sports';
  if (/(fashion|mitindo|style|outfit|kitenge|kanga|dress|urembo)/.test(text)) return 'Fashion';
  if (/(food|chakula|mapishi|cook|recipe|pilau|biryani|nyama|ugali)/.test(text)) return 'Food';
  if (/(travel|safari|zanzibar|serengeti|kilimanjaro|beach|arusha|nairobi)/.test(text)) return 'Travel';
  if (/(tech|coding|code|software|phone|app|laptop|gadget|teknolojia)/.test(text)) return 'Tech';
  if (/(gaming|game|ps5|fifa|eafc|pubg|cod|esports|gamer)/.test(text)) return 'Gaming';
  if (/(art|sanaa|painting|drawing|design|sketch|photography|portrait)/.test(text)) return 'Art';
  if (/(education|elimu|school|shule|chuo|learn|study|tutorial|campus)/.test(text)) return 'Education';
  if (/(lifestyle|maisha|vlog|family|motivation|faith|baraka|biashara)/.test(text)) return 'Lifestyle';
  return 'Other';
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
  onReport: (post: Post) => void;
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
  onOpenTip,
  onReport
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(() => {
    if (post.videoWidth && post.videoHeight && post.videoWidth > 0 && post.videoHeight > 0) {
      return { width: post.videoWidth, height: post.videoHeight };
    }
    return null;
  });

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
        } catch {}
      }
    }
  }, [isActive, shouldMountVideo, resolvedSrc, playReel, pauseReel]);

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

  const sharpImageUrl = post.imageUrl || post.thumbnailUrl || undefined;
  const preloadMode = isActive || shouldPreloadNext ? 'auto' : 'metadata';
  const cleanCaption = sanitizeVideoCaptionText(post.content);

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
      {!isVideoReady && !sharpImageUrl && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1] bg-gradient-to-b from-stone-900 via-stone-800 to-stone-950 animate-pulse pointer-events-none"
        />
      )}

      {isBuffering && isActive && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-0.5 z-30 bg-white/25 overflow-hidden pointer-events-none"
        >
          <div className="w-1/2 h-full bg-white/85 animate-pulse rounded-full" />
        </div>
      )}

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

      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <div className="relative w-full sm:w-[456px] sm:min-w-[420px] sm:max-w-[480px] h-full flex items-center justify-center overflow-hidden sm:shadow-[0_0_48px_rgba(0,0,0,0.55)]">
          {sharpImageUrl && (!shouldMountVideo || !isVideoReady || !resolvedSrc) && (
            <img
              src={sharpImageUrl}
              alt={cleanCaption || 'Reel preview'}
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

          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-64 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-3.5 sm:left-4 right-20 sm:right-4 bottom-4 sm:bottom-6 z-20 flex flex-col gap-2 text-white pointer-events-auto"
          >
            <div className="flex items-center gap-2.5">
              <Avatar
                uid={post.authorId}
                src={
                  post.authorPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`
                }
                alt={post.authorName}
                fallbackName={post.authorName}
                size={40}
                showStatus={true}
                ringClassName="ring-2 ring-white/85 shadow-md bg-stone-800"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-sm sm:text-base text-white drop-shadow-xs truncate">
                    {post.authorName}
                  </span>
                  <CrystalBadge email={post.authorEmail} name="" size="sm" />
                  {post.aiGenerated && (
                    <span className="px-1.5 py-0.5 rounded-md bg-white/15 text-white/90 text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5">
                      <Sparkles size={9} />
                      <span>AI</span>
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-white/80 block truncate">
                  {post.authorUsername || '@waver'}
                </span>
              </div>
            </div>

            {cleanCaption && (
              <p className="text-xs sm:text-sm text-white/95 leading-snug line-clamp-3 break-words drop-shadow-xs">
                {cleanCaption}
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

        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-4 sm:static sm:ml-3.5 sm:self-end sm:mb-6 z-20 flex flex-col items-center gap-3 pointer-events-auto"
        >
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
              {formatCompactNumber(post.likesCount || 0)}
            </span>
          </button>

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
              {formatCompactNumber(post.commentsCount || 0)}
            </span>
          </button>

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
            <span className="text-[11px] font-mono font-bold text-white tabular-nums drop-shadow-xs">
              {isCopied ? 'Shared' : post.sharesCount ? formatCompactNumber(post.sharesCount) : 'Share'}
            </span>
          </button>

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
              {formatCompactNumber(post.savesCount || 0)}
            </span>
          </button>

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

          <button
            type="button"
            onClick={() => onReport(post)}
            aria-label="Report reel"
            className="flex flex-col items-center gap-1 group cursor-pointer min-w-[44px]"
          >
            <span className="w-10 h-10 rounded-2xl bg-black/45 hover:bg-rose-600/80 backdrop-blur-md border border-white/25 text-white/85 hover:text-white flex items-center justify-center transition active:scale-90 shadow-md">
              <Flag size={16} />
            </span>
            <span className="text-[10px] font-bold text-white/85 drop-shadow-xs">Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const VideosHubView: React.FC<VideosHubViewProps> = ({
  onNavigateToFeed,
  onJoinChallenge,
  onOpenChallengesTab,
  onViewProfile
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isProEffective,
    toggleSavePost,
    reportContent,
    updateUserProfile,
    showGlobalToast
  } = useAuth();
  const isProTier = Boolean(isProEffective || isAdmin);
  const maxVideoSeconds = getMaxVideoDurationSeconds(isProTier);
  const { jobs: videoUploadJobs } = useVideoUploadQueue();
  const activeOrFailedVideoJobs = videoUploadJobs.filter((j) => j.status !== 'completed');

  // Active Weekly Challenge banner (uses shared 5-min memory/localStorage cache — 0 extra reads)
  const [activeExploreChallenge, setActiveExploreChallenge] = useState<CreatorChallenge | null>(null);
  const [winnersWallChallenge, setWinnersWallChallenge] = useState<CreatorChallenge | null>(null);

  useEffect(() => {
    let active = true;
    fetchChallengesCached(false)
      .then((list) => {
        if (!active) return;
        setActiveExploreChallenge(getActiveChallengeFromList(list));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Explore vs Full-Screen Reels Player state
  const [viewMode, setViewMode] = useState<'explore' | 'reels'>('explore');
  const [reelsQueue, setReelsQueue] = useState<Post[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const savedScrollYRef = useRef<number>(exploreSessionCache.scrollY);

  // Explore Posts state (seeded from in-memory session cache for 0 extra Firestore reads)
  const [explorePosts, setExplorePosts] = useState<Post[]>(() => exploreSessionCache.posts);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(
    () => exploreSessionCache.lastVisibleDoc
  );
  const [hasMorePosts, setHasMorePosts] = useState<boolean>(() => exploreSessionCache.hasMore);
  const [isLoading, setIsLoading] = useState<boolean>(() => exploreSessionCache.posts.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [quotaErrorBanner, setQuotaErrorBanner] = useState<string | null>(null);

  // Explore Category, Search, AI Filter & Hover Preview state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeHoverPostId, setActiveHoverPostId] = useState<string | null>(null);
  const [hideAiGenerated, setHideAiGenerated] = useState<boolean>(() => {
    if (userProfile?.hideAiGenerated !== undefined) return Boolean(userProfile.hideAiGenerated);
    try {
      return localStorage.getItem('wavelink_hide_ai_generated') === '1';
    } catch {
      return false;
    }
  });
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);

  // Pick-Your-Interests modal state (opens automatically on first visit to Explore if not completed)
  const [isInterestModalOpen, setIsInterestModalOpen] = useState<boolean>(false);

  // Selected Photo / Text Post Detail Modal state
  const [selectedDetailPost, setSelectedDetailPost] = useState<Post | null>(null);
  const [quickActionPost, setQuickActionPost] = useState<Post | null>(null);

  // Admin AI Tagging Backfill Tool state
  const [showBackfillPanel, setShowBackfillPanel] = useState<boolean>(false);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [backfillStats, setBackfillStats] = useState<{
    processed: number;
    tagged: number;
    skipped: number;
    readsUsed: number;
    writesUsed: number;
    statusText: string;
  }>({
    processed: 0,
    tagged: 0,
    skipped: 0,
    readsUsed: 0,
    writesUsed: 0,
    statusText: 'Ready to tag untagged videos in batches of 10.'
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => getRememberedMuted());
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
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

  // Prompt user to choose interests on first visit to Explore
  useEffect(() => {
    if (!currentUser?.uid) return;
    if (!hasUserCompletedOrSkippedInterests(currentUser.uid, userProfile)) {
      setIsInterestModalOpen(true);
    }
  }, [currentUser?.uid, userProfile]);

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

  const mergePostsIntoSessionCache = useCallback((incoming: Post[]) => {
    if (incoming.length === 0) return;
    setExplorePosts((prev) => {
      const map = new Map<string, Post>();
      for (const p of prev) map.set(p.id, p);
      for (const p of incoming) map.set(p.id, p);
      const merged = Array.from(map.values()).sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      exploreSessionCache.posts = merged;
      return merged;
    });
  }, []);

  // Load initial Explore page (limit 14) ONLY if session cache is empty
  const loadInitialExplorePosts = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && exploreSessionCache.posts.length > 0) {
      setExplorePosts(exploreSessionCache.posts);
      setLastVisibleDoc(exploreSessionCache.lastVisibleDoc);
      setHasMorePosts(exploreSessionCache.hasMore);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setQuotaErrorBanner(null);
    try {
      const q = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        limit(EXPLORE_PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      const list: Post[] = [];
      snapshot.forEach((d) => {
        list.push({ ...(d.data() as Post), id: d.id });
      });
      exploreSessionCache.posts = list;
      const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      const hasMore = snapshot.docs.length >= EXPLORE_PAGE_SIZE;
      exploreSessionCache.lastVisibleDoc = lastDoc;
      exploreSessionCache.hasMore = hasMore;

      setExplorePosts(list);
      setLastVisibleDoc(lastDoc);
      setHasMorePosts(hasMore);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        setQuotaErrorBanner(
          'Daily database read quota reached. Showing cached Explore posts — please try again shortly.'
        );
      } else {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMoreExplorePosts = useCallback(async () => {
    if (!lastVisibleDoc || isLoadingMore || !hasMorePosts) return;
    setIsLoadingMore(true);
    setQuotaErrorBanner(null);
    try {
      const q = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        limit(EXPLORE_PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      const list: Post[] = [];
      snapshot.forEach((d) => {
        list.push({ ...(d.data() as Post), id: d.id });
      });
      if (list.length > 0) {
        mergePostsIntoSessionCache(list);
      }
      const nextLastDoc =
        snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : lastVisibleDoc;
      const more = snapshot.docs.length >= EXPLORE_PAGE_SIZE;
      exploreSessionCache.lastVisibleDoc = nextLastDoc;
      exploreSessionCache.hasMore = more;
      setLastVisibleDoc(nextLastDoc);
      setHasMorePosts(more);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        setQuotaErrorBanner(
          'Daily database read quota reached. Showing cached posts in memory.'
        );
      } else {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [lastVisibleDoc, isLoadingMore, hasMorePosts, mergePostsIntoSessionCache]);

  useEffect(() => {
    void loadInitialExplorePosts(false);
  }, [loadInitialExplorePosts]);

  // Targeted 1-page query when a user taps a specific category chip (cached per session so each chip queries at most once)
  useEffect(() => {
    if (selectedCategory === 'All') return;
    if (exploreSessionCache.fetchedCategories.has(selectedCategory)) return;

    const runCategoryQuery = async () => {
      exploreSessionCache.fetchedCategories.add(selectedCategory);
      try {
        const q = query(
          collection(db, 'posts'),
          where('category', '==', selectedCategory),
          limit(EXPLORE_PAGE_SIZE)
        );
        const snap = await getDocs(q);
        const found: Post[] = [];
        snap.forEach((d) => found.push({ ...(d.data() as Post), id: d.id }));
        if (found.length > 0) {
          mergePostsIntoSessionCache(found);
        }
      } catch (err) {
        if (isQuotaExceededError(err)) {
          setQuotaErrorBanner(
            'Daily database read quota reached. Filtering from cached Explore posts.'
          );
        }
      }
    };
    void runCategoryQuery();
  }, [selectedCategory, mergePostsIntoSessionCache]);

  // Targeted keyword array-contains query when user searches a keyword (debounced 450ms, cached per token, 0 Gemini calls)
  useEffect(() => {
    const cleanTerm = searchQuery.trim().toLowerCase().replace(/^[@#]/, '');
    if (cleanTerm.length < 3) return;
    const primaryToken = cleanTerm.split(/\s+/)[0];
    if (!primaryToken || primaryToken.length < 3) return;
    if (exploreSessionCache.fetchedKeywords.has(primaryToken)) return;

    const timer = window.setTimeout(async () => {
      exploreSessionCache.fetchedKeywords.add(primaryToken);
      try {
        const q = query(
          collection(db, 'posts'),
          where('keywords', 'array-contains', primaryToken),
          limit(EXPLORE_PAGE_SIZE)
        );
        const snap = await getDocs(q);
        const found: Post[] = [];
        snap.forEach((d) => found.push({ ...(d.data() as Post), id: d.id }));
        if (found.length > 0) {
          mergePostsIntoSessionCache(found);
        }
      } catch {
        // Client-side search over cached posts continues seamlessly
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [searchQuery, mergePostsIntoSessionCache]);

  // Listen for newly uploaded video posts and external "open in reels" requests
  useEffect(() => {
    const handleVideoPostCreated = (event: Event) => {
      const customEvent = event as CustomEvent<Post>;
      const created = customEvent.detail;
      if (!created || !created.id) return;
      mergePostsIntoSessionCache([created]);
    };

    const handleOpenReelsQueue = (event: Event) => {
      const customEvent = event as CustomEvent<OpenReelsQueueEventDetail>;
      const detail = customEvent.detail;
      if (!detail || !detail.startPost) return;
      const queue =
        detail.queue && detail.queue.length > 0 ? detail.queue : [detail.startPost];
      const idx = Math.max(
        0,
        queue.findIndex((p) => p.id === detail.startPost.id)
      );
      savedScrollYRef.current = window.scrollY;
      exploreSessionCache.scrollY = window.scrollY;
      setActiveHoverPostId(null);
      setReelsQueue(queue);
      setActiveIndex(idx);
      setViewMode('reels');
    };

    window.addEventListener('wavelink:video-post-created', handleVideoPostCreated);
    window.addEventListener('wavelink:open-reels-queue', handleOpenReelsQueue);
    return () => {
      window.removeEventListener('wavelink:video-post-created', handleVideoPostCreated);
      window.removeEventListener('wavelink:open-reels-queue', handleOpenReelsQueue);
    };
  }, [mergePostsIntoSessionCache]);

  const userInterests = useMemo(
    () => getSavedUserInterests(currentUser?.uid, userProfile?.interests),
    [currentUser?.uid, userProfile?.interests]
  );

  const userInterestCategories = useMemo(
    () => mapUserInterestsToExploreCategories(userInterests),
    [userInterests]
  );

  // Filter & rank Explore posts by visibility, AI filter, selected category, search keywords, and user interests
  const visibleExplorePosts = useMemo(() => {
    const blockedIds = userProfile?.blockedUserIds || [];
    const mutedIds = userProfile?.mutedUserIds || [];
    const qLower = searchQuery.trim().toLowerCase();
    const searchTokens = qLower
      .replace(/[@#]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    const eligible = explorePosts.filter((post) => {
      if (hiddenPostIds.includes(post.id)) return false;
      if (post.isHidden && post.authorId !== currentUser?.uid && !isAdmin) return false;
      if (blockedIds.includes(post.authorId)) return false;
      if (mutedIds.includes(post.authorId)) return false;
      const authorCached = post.authorId ? getCachedUserProfile(post.authorId) : null;
      if (currentUser?.uid && (authorCached?.blockedUserIds || []).includes(currentUser.uid)) {
        return false;
      }
      if (post.authorId !== currentUser?.uid && !isAdmin) {
        const audience = post.audience || 'public';
        if (audience === 'followers' && !(userProfile?.followingIds || []).includes(post.authorId)) {
          return false;
        }
        if (
          audience === 'close_friends' &&
          (!currentUser?.uid || !(authorCached?.closeFriendIds || []).includes(currentUser.uid))
        ) {
          return false;
        }
      }

      if (hideAiGenerated && post.aiGenerated) {
        return false;
      }

      // Search box matches AI keywords, category, caption, hashtags, and creator name/username
      // (Note: when searching, videos outside user's interests still appear if they match the search!)
      if (searchTokens.length > 0) {
        const postCategory = inferPostCategory(post).toLowerCase();
        const postKeywords = (post.keywords || []).map((k) => k.toLowerCase());
        const postHashtags = (post.hashtags || []).map((h) => h.toLowerCase());
        const cleanText = sanitizeVideoCaptionText(post.content).toLowerCase();
        const creatorText = `${post.authorName || ''} ${post.authorUsername || ''}`.toLowerCase();

        return searchTokens.every(
          (tok) =>
            postCategory.includes(tok) ||
            postKeywords.some((kw) => kw.includes(tok)) ||
            postHashtags.some((ht) => ht.includes(tok)) ||
            cleanText.includes(tok) ||
            creatorText.includes(tok)
        );
      }

      // When a specific category chip is selected, show ONLY posts in that category
      if (selectedCategory !== 'All') {
        const postCat = inferPostCategory(post);
        return postCat.toLowerCase() === selectedCategory.toLowerCase();
      }

      return true;
    });

    // When on "All" ("Made for you") with no active search query, rank posts matching user's interests
    // mixed with trending posts (~30%) for variety
    if (selectedCategory === 'All' && searchTokens.length === 0 && userInterestCategories.length > 0) {
      const interestMatched: Post[] = [];
      const trendingOther: Post[] = [];

      for (const post of eligible) {
        const cat = inferPostCategory(post);
        const score = scorePostByInterests(post, userInterests);
        if (userInterestCategories.includes(cat) || score >= 3) {
          interestMatched.push(post);
        } else {
          trendingOther.push(post);
        }
      }

      trendingOther.sort(
        (a, b) =>
          (b.likesCount || 0) * 2 +
          (b.commentsCount || 0) * 3 -
          ((a.likesCount || 0) * 2 + (a.commentsCount || 0) * 3)
      );

      // Interleave 2-3 interest-matched posts with 1 trending post for discovery variety
      const mixed: Post[] = [];
      let iIdx = 0;
      let tIdx = 0;
      while (iIdx < interestMatched.length || tIdx < trendingOther.length) {
        for (let k = 0; k < 2 && iIdx < interestMatched.length; k++) {
          mixed.push(interestMatched[iIdx++]);
        }
        if (tIdx < trendingOther.length) {
          mixed.push(trendingOther[tIdx++]);
        }
      }
      return mixed;
    }

    return eligible;
  }, [
    explorePosts,
    hiddenPostIds,
    currentUser?.uid,
    isAdmin,
    userProfile?.blockedUserIds,
    userProfile?.mutedUserIds,
    userProfile?.followingIds,
    hideAiGenerated,
    searchQuery,
    selectedCategory,
    userInterests,
    userInterestCategories
  ]);

  // Video queue extracted from the current visible Explore list for swipe navigation in Reels
  const exploreVideoQueue = useMemo(
    () =>
      visibleExplorePosts.filter((p) =>
        Boolean(p.videoUrl || p.hasVideoChunks || p.mediaType === 'video')
      ),
    [visibleExplorePosts]
  );

  // Big top featured card: pick top-engaged video or photo from the current visible list
  const featuredExplorePost = useMemo(() => {
    if (searchQuery.trim().length > 0) return null;
    const visualCandidates = visibleExplorePosts.filter((p) =>
      Boolean(
        p.videoUrl ||
          p.hasVideoChunks ||
          p.mediaType === 'video' ||
          p.imageUrl ||
          (p.imageUrls && p.imageUrls.length > 0)
      )
    );
    if (visualCandidates.length === 0) return null;
    return [...visualCandidates].sort(
      (a, b) =>
        (b.likesCount || 0) * 2 +
        (b.commentsCount || 0) * 3 -
        ((a.likesCount || 0) * 2 + (a.commentsCount || 0) * 3)
    )[0];
  }, [visibleExplorePosts, searchQuery]);

  const gridExplorePosts = useMemo(() => {
    if (!featuredExplorePost) return visibleExplorePosts;
    return visibleExplorePosts.filter((p) => p.id !== featuredExplorePost.id);
  }, [visibleExplorePosts, featuredExplorePost]);

  // Open full-screen Reels starting at the exact tapped video with the rest of the Explore list as the swipe queue
  const handleOpenVideoInReels = useCallback(
    (targetVideoPost: Post) => {
      savedScrollYRef.current = window.scrollY;
      exploreSessionCache.scrollY = window.scrollY;
      setActiveHoverPostId(null);

      const queue =
        exploreVideoQueue.length > 0 &&
        exploreVideoQueue.some((v) => v.id === targetVideoPost.id)
          ? exploreVideoQueue
          : [targetVideoPost, ...exploreVideoQueue.filter((v) => v.id !== targetVideoPost.id)];

      const startIdx = Math.max(
        0,
        queue.findIndex((v) => v.id === targetVideoPost.id)
      );
      setReelsQueue(queue);
      setActiveIndex(startIdx);
      setViewMode('reels');
    },
    [exploreVideoQueue]
  );

  // Return to Explore from Reels at the exact same scroll position without re-fetching
  const handleReturnToExploreFromReels = useCallback(() => {
    setViewMode('explore');
    const targetY = savedScrollYRef.current;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior });
    });
  }, []);

  // Scroll Reels pager to activeIndex when opening Reels
  useEffect(() => {
    if (viewMode !== 'reels') return;
    const root = pagerRef.current;
    if (!root) return;
    window.requestAnimationFrame(() => {
      if (root.clientHeight > 0) {
        root.scrollTo({
          top: activeIndex * root.clientHeight,
          behavior: 'instant' as ScrollBehavior
        });
      }
    });
  }, [viewMode]);

  // Observe which reel slide is snapped in view while in Reels mode
  useEffect(() => {
    if (viewMode !== 'reels') return;
    const root = pagerRef.current;
    if (!root || reelsQueue.length === 0) return;

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
          if (bestIdx >= reelsQueue.length - 3 && hasMorePosts && !isLoadingMore) {
            void loadMoreExplorePosts();
          }
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
  }, [viewMode, reelsQueue.length, hasMorePosts, isLoadingMore, loadMoreExplorePosts]);

  const handlePagerScroll = () => {
    const root = pagerRef.current;
    if (!root || root.clientHeight <= 0) return;
    const nextIdx = Math.round(root.scrollTop / root.clientHeight);
    if (nextIdx >= 0 && nextIdx < reelsQueue.length && nextIdx !== activeIndex) {
      setActiveIndex(nextIdx);
    }
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    saveRememberedMuted(nextMuted);
  };

  const handleToggleLike = useCallback(
    async (post: Post) => {
      if (!currentUser) return;
      const isLiked = post.likes?.includes(currentUser.uid);
      const updatedLikes = isLiked
        ? (post.likes || []).filter((id) => id !== currentUser.uid)
        : [...(post.likes || []), currentUser.uid];
      const nextLikesCount = updatedLikes.length;

      const patchPost = (item: Post) =>
        item.id === post.id ? { ...item, likes: updatedLikes, likesCount: nextLikesCount } : item;

      setExplorePosts((prev) => {
        const next = prev.map(patchPost);
        exploreSessionCache.posts = next;
        return next;
      });
      setReelsQueue((prev) => prev.map(patchPost));
      setSelectedDetailPost((prev) => (prev && prev.id === post.id ? patchPost(prev) : prev));

      try {
        await updateDoc(doc(db, 'posts', post.id), {
          likes: updatedLikes,
          likesCount: nextLikesCount
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
      }
    },
    [currentUser]
  );

  const handleToggleHideAi = async () => {
    const next = !hideAiGenerated;
    setHideAiGenerated(next);
    try {
      localStorage.setItem('wavelink_hide_ai_generated', next ? '1' : '0');
    } catch {}
    if (currentUser?.uid) {
      updateUserProfile({ hideAiGenerated: next }).catch(() => {});
    }
  };

  // Admin Backfill Tool: tags existing untagged videos in batches of 10 with a delay, skipping already-tagged posts
  const handleRunAdminBackfillBatch = async () => {
    if (!isAdmin || isBackfilling) return;
    setIsBackfilling(true);
    setBackfillStats((prev) => ({
      ...prev,
      statusText: 'Querying up to 10 posts from Firestore (10 reads)...'
    }));

    try {
      // Find untagged videos from current cache first, or fetch a batch of 10 posts
      let candidates = explorePosts
        .filter(
          (p) =>
            Boolean(p.videoUrl || p.hasVideoChunks || p.mediaType === 'video') &&
            (!p.taggedAt || !p.category)
        )
        .slice(0, 10);

      let batchReads = 0;
      if (candidates.length === 0) {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        batchReads = snap.docs.length;
        const fetched: Post[] = [];
        snap.forEach((d) => fetched.push({ ...(d.data() as Post), id: d.id }));
        mergePostsIntoSessionCache(fetched);
        candidates = fetched.filter(
          (p) =>
            Boolean(p.videoUrl || p.hasVideoChunks || p.mediaType === 'video') &&
            (!p.taggedAt || !p.category)
        );
      }

      if (candidates.length === 0) {
        setBackfillStats((prev) => ({
          ...prev,
          readsUsed: prev.readsUsed + batchReads,
          statusText: 'All loaded video posts are already tagged! (0 writes needed)'
        }));
        setIsBackfilling(false);
        return;
      }

      let taggedCount = 0;
      let skippedCount = 0;
      let writesCount = 0;

      for (let i = 0; i < candidates.length; i++) {
        const post = candidates[i];
        if (post.taggedAt && post.category) {
          skippedCount += 1;
          continue;
        }

        setBackfillStats((prev) => ({
          ...prev,
          statusText: `Tagging video ${i + 1} of ${candidates.length} via Gemini...`
        }));

        const tagRes = await requestUploadTimeVideoTagging({
          postId: post.id,
          videoUrl: post.videoUrl,
          caption: post.content,
          persistToPost: true
        });

        writesCount += 1;
        taggedCount += 1;

        const updatedPost: Post = {
          ...post,
          content: sanitizeVideoCaptionText(post.content),
          category: tagRes.category,
          keywords: tagRes.keywords,
          language: tagRes.language,
          aiGenerated: tagRes.aiGenerated,
          aiConfidence: tagRes.aiConfidence,
          taggedAt: tagRes.taggedAt || new Date().toISOString()
        };
        mergePostsIntoSessionCache([updatedPost]);

        setBackfillStats((prev) => ({
          processed: prev.processed + 1,
          tagged: prev.tagged + 1,
          skipped: prev.skipped,
          readsUsed: prev.readsUsed + (i === 0 ? batchReads : 0),
          writesUsed: prev.writesUsed + 1,
          statusText: `Tagged ${i + 1}/${candidates.length} (${tagRes.category})`
        }));

        // 2.2s delay between items to respect Gemini & Firestore rate limits
        if (i < candidates.length - 1) {
          await new Promise((res) => window.setTimeout(res, 2200));
        }
      }

      setBackfillStats((prev) => ({
        ...prev,
        skipped: prev.skipped + skippedCount,
        statusText: `Batch complete: ${taggedCount} tagged, ${skippedCount} skipped (${batchReads} reads, ${writesCount} writes).`
      }));
    } catch (err: any) {
      setBackfillStats((prev) => ({
        ...prev,
        statusText: `Backfill paused: ${err?.message || 'Unable to complete batch'}`
      }));
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleToggleSave = async (postId: string) => {
    await toggleSavePost(postId);
  };

  const handleShare = (post: Post) => {
    setActiveSharePost(post);
  };

  const handleCommentCountChange = useCallback((postId: string, newCount: number) => {
    const patch = (p: Post) => (p.id === postId ? { ...p, commentsCount: newCount } : p);
    setExplorePosts((prev) => {
      const next = prev.map(patch);
      exploreSessionCache.posts = next;
      return next;
    });
    setReelsQueue((prev) => prev.map(patch));
    setActiveCommentsPost((prev) =>
      prev && prev.id === postId ? { ...prev, commentsCount: newCount } : prev
    );
  }, []);

  const handleShareCountChange = useCallback((postId: string, newCount: number) => {
    const patch = (p: Post) => (p.id === postId ? { ...p, sharesCount: newCount } : p);
    setExplorePosts((prev) => {
      const next = prev.map(patch);
      exploreSessionCache.posts = next;
      return next;
    });
    setReelsQueue((prev) => prev.map(patch));
    setActiveSharePost((prev) =>
      prev && prev.id === postId ? { ...prev, sharesCount: newCount } : prev
    );
    setCopiedId(postId);
    setTimeout(() => setCopiedId((prev) => (prev === postId ? null : prev)), 2000);
  }, []);

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
      content: sanitizeVideoCaptionText(videoCaption),
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
    setUploadNotice('Uploading & AI-tagging video — keep browsing!');
    setTimeout(() => setUploadNotice(null), 4000);
  };

  const allCategoryChips = useMemo(() => ['All', ...EXPLORE_CATEGORIES], []);

  return (
    <div className="relative w-full min-h-full select-none">
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        onChange={handleVideoFileChange}
        className="hidden"
      />

      {/* =====================================================================
          1. VISUAL EXPLORE MASONRY PAGE (Mobile 2-col / Desktop 4-5 col up to 1400px)
          ===================================================================== */}
      <div className="wavelink-explore-shell space-y-4">
        {/* Explore Header: Search Bar + Interests Button + AI Filter + Upload Reel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search by AI Keywords, Category, Caption & Creator */}
          <div className="relative flex-1 min-w-0">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics, AI keywords, places or @creators..."
              className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-primary)] shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action Pills: Interests, Hide AI Toggle, Admin Backfill, New Reel */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => setIsInterestModalOpen(true)}
              className="min-h-[40px] px-3 py-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-1.5 hover:border-[var(--accent-primary)] transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal size={13} className="text-[var(--accent-primary)]" />
              <span>Interests</span>
              {userInterestCategories.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-black">
                  {userInterestCategories.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleHideAi}
              title={hideAiGenerated ? 'Showing human-only content' : 'Filter AI-generated content'}
              className={`min-h-[40px] px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                hideAiGenerated
                  ? 'bg-[var(--accent-primary)] text-white border-transparent'
                  : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <EyeOff size={13} />
              <span>{hideAiGenerated ? 'AI Hidden' : 'Hide AI'}</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowBackfillPanel((prev) => !prev)}
                className="min-h-[40px] px-3 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Wand2 size={13} />
                <span>AI Backfill</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              style={{ background: 'var(--accent-gradient)' }}
              className="min-h-[40px] px-3.5 py-2 rounded-2xl text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>New Reel</span>
            </button>
          </div>
        </div>

        {/* Active Weekly Challenge Banner at top of Explore (shared cache, 0 extra reads) */}
        {activeExploreChallenge && (
          <ActiveChallengeBanner
            challenge={activeExploreChallenge}
            compact
            onJoinWithPost={(ch) => {
              if (onJoinChallenge) {
                onJoinChallenge(ch);
              } else {
                onNavigateToFeed();
              }
            }}
            onOpenWinnersWall={(ch) => setWinnersWallChallenge(ch)}
            onExploreAllChallenges={onOpenChallengesTab}
          />
        )}

        {/* Admin-Only AI Tagging Backfill Panel */}
        {isAdmin && showBackfillPanel && (
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-amber-500/40 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Wand2 size={16} className="text-amber-500 shrink-0" />
                <h4 className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
                  Admin AI Video Tagging Backfill (Batches of 10)
                </h4>
              </div>
              <button
                type="button"
                disabled={isBackfilling}
                onClick={handleRunAdminBackfillBatch}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} className={isBackfilling ? 'animate-spin' : ''} />
                <span>{isBackfilling ? 'Tagging Batch...' : 'Run Next Batch (10 Videos)'}</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {backfillStats.statusText} • Skips already-tagged posts (<code>taggedAt</code> set) • Cost per batch: at most <strong>10 Firestore reads + 10 Firestore writes</strong> and 1 Gemini call per untagged video (2.2s delay between items).
            </p>
            <div className="flex items-center gap-4 text-[11px] font-mono text-[var(--text-secondary)]">
              <span>Tagged: <strong>{backfillStats.tagged}</strong></span>
              <span>Skipped: <strong>{backfillStats.skipped}</strong></span>
              <span>Reads: <strong>{backfillStats.readsUsed}</strong></span>
              <span>Writes: <strong>{backfillStats.writesUsed}</strong></span>
            </div>
          </div>
        )}

        {/* Upload Progress / Notice Banner */}
        {(activeOrFailedVideoJobs.length > 0 || uploadNotice || sizeLimitWarning || quotaErrorBanner) && (
          <div className="space-y-2">
            <VideoUploadProgressChip variant="feed-inline" />

            {uploadNotice && (
              <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-100 text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={15} className="text-[#10B981] shrink-0" />
                  <span className="truncate">{uploadNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadNotice(null)}
                  className="p-1 text-emerald-300 hover:text-white cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {quotaErrorBanner && (
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-[var(--text-primary)] text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle size={15} className="text-amber-500 shrink-0" />
                  <span className="font-semibold">{quotaErrorBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadInitialExplorePosts(true)}
                  className="px-3 py-1 rounded-xl bg-[var(--accent-primary)] text-white text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Horizontal Category Chips: All, Art, Fashion, Travel, Music, Sports, Food, Comedy, Tech, Gaming, Education, Lifestyle, Other */}
        <div
          role="tablist"
          aria-label="Explore categories"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {allCategoryChips.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedCategory(cat)}
                style={
                  isSelected
                    ? {
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--accent-contrast-text, #FFFFFF)'
                      }
                    : undefined
                }
                className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition active:scale-95 cursor-pointer shrink-0 ${
                  isSelected
                    ? 'shadow-xs'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
              >
                {cat === 'All' ? 'All • Made for you' : cat}
              </button>
            );
          })}
        </div>

        {/* Big Top Featured Card (Visual Media Only — Zero Text Overlay, Tap Video Opens Reels) */}
        {featuredExplorePost && (
          <div className="w-full">
            <UnifiedPostCard
              post={featuredExplorePost}
              isLiked={Boolean(featuredExplorePost.likes?.includes(currentUser?.uid || ''))}
              isFeatured={true}
              activeHoverPostId={activeHoverPostId}
              onRequestHoverPlay={setActiveHoverPostId}
              onOpenVideoInReels={handleOpenVideoInReels}
              onOpenPostDetail={(post) => setSelectedDetailPost(post)}
              onToggleLike={handleToggleLike}
              onDoubleTapLike={handleToggleLike}
              onLongPressQuickActions={(post) => setQuickActionPost(post)}
            />
          </div>
        )}

        {/* Main Explore Masonry Grid (2 columns on mobile, 4-5 columns on desktop up to 1400px) */}
        {isLoading && explorePosts.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
            <div className="w-8 h-8 border-3 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold">Loading Explore...</span>
          </div>
        ) : visibleExplorePosts.length === 0 ? (
          <div className="py-14 px-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center mx-auto">
              <VideoIcon size={24} />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
              {searchQuery
                ? `No matches found for "${searchQuery}"`
                : selectedCategory !== 'All'
                ? `No posts in ${selectedCategory} yet`
                : 'No Explore posts yet'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'All'
                ? 'Try clearing your search or switching to All categories.'
                : 'Upload the first reel or photo to light up Explore.'}
            </p>
            {(searchQuery || selectedCategory !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="px-4 py-2 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-extrabold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="wavelink-explore-masonry">
            {gridExplorePosts.map((post) => {
              const isLiked = Boolean(post.likes?.includes(currentUser?.uid || ''));
              return (
                <UnifiedPostCard
                  key={post.id}
                  post={post}
                  isLiked={isLiked}
                  activeHoverPostId={activeHoverPostId}
                  onRequestHoverPlay={setActiveHoverPostId}
                  onOpenVideoInReels={handleOpenVideoInReels}
                  onOpenPostDetail={(target) => setSelectedDetailPost(target)}
                  onToggleLike={handleToggleLike}
                  onDoubleTapLike={handleToggleLike}
                  onLongPressQuickActions={(target) => setQuickActionPost(target)}
                />
              );
            })}
          </div>
        )}

        {/* Load More Pagination Button (Zero Real-Time Listeners) */}
        {hasMorePosts && visibleExplorePosts.length > 0 && (
          <div className="pt-2 pb-6 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={loadMoreExplorePosts}
              className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoadingMore ? 'animate-spin' : ''} />
              <span>{isLoadingMore ? 'Loading more...' : 'Load More on Explore'}</span>
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. FULL-SCREEN REELS PLAYER OVERLAY (Starts at Tapped Video + Swipe Queue)
          ===================================================================== */}
      {viewMode === 'reels' && (
        <div className="fixed inset-0 z-40 bg-[#0C0A09] overflow-hidden select-none">
          {/* Top Bar with Back to Explore Button (Restores Exact Scroll Position) */}
          <div
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
            className="absolute top-0 inset-x-0 z-30 px-3.5 sm:px-6 pb-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2 pointer-events-none"
          >
            <button
              type="button"
              onClick={handleReturnToExploreFromReels}
              className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/20 text-white text-xs font-extrabold flex items-center gap-2 shadow-md transition active:scale-95 pointer-events-auto cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Explore</span>
            </button>

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#0D9488] hover:bg-[#0f766e] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 pointer-events-auto cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>New Reel</span>
            </button>
          </div>

          <div
            ref={pagerRef}
            onScroll={handlePagerScroll}
            className="wavelink-reels-pager"
          >
            {reelsQueue.map((post, idx) => {
              const isLiked = Boolean(post.likes?.includes(currentUser?.uid || ''));
              const isSaved = Boolean((userProfile?.savedPostIds || []).includes(post.id));
              const shouldMountVideo = Math.abs(idx - activeIndex) <= 1;
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
                    onReport={async (targetPost) => {
                      await reportContent({
                        targetType: 'video',
                        targetId: targetPost.id,
                        targetSummary: `${targetPost.authorName}: ${(targetPost.content || 'Video Reel').slice(0, 80)}`,
                        reason: 'Reported from Reels Hub for safety review'
                      });
                      setUploadNotice('Reel reported to WaveLink Safety Team for review.');
                      setTimeout(() => setUploadNotice(null), 3500);
                    }}
                  />
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. PHOTO & TEXT-ONLY POST DETAIL VIEW MODAL
          ===================================================================== */}
      {selectedDetailPost && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedDetailPost(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-3xl overflow-hidden shadow-2xl max-h-[90dvh] flex flex-col"
          >
            <div className="p-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  uid={selectedDetailPost.authorId}
                  src={selectedDetailPost.authorPhotoURL}
                  fallbackName={selectedDetailPost.authorName}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm truncate">
                      {selectedDetailPost.authorName}
                    </span>
                    <CrystalBadge email={selectedDetailPost.authorEmail} name="" size="sm" />
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)] font-mono block truncate">
                    {selectedDetailPost.authorUsername || '@waver'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailPost(null)}
                className="p-2 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {((selectedDetailPost.imageUrls && selectedDetailPost.imageUrls.length > 0) ||
                selectedDetailPost.imageUrl) && (
                <div className="space-y-2">
                  {(selectedDetailPost.imageUrls && selectedDetailPost.imageUrls.length > 0
                    ? selectedDetailPost.imageUrls
                    : [selectedDetailPost.imageUrl!]
                  ).map((imgUrl, i) => (
                    <img
                      key={i}
                      src={imgUrl}
                      alt=""
                      className="w-full max-h-[60dvh] object-contain rounded-2xl bg-black/5"
                    />
                  ))}
                </div>
              )}

              {sanitizeVideoCaptionText(selectedDetailPost.content) && (
                <p className="text-sm sm:text-base text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                  {sanitizeVideoCaptionText(selectedDetailPost.content)}
                </p>
              )}

              <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(selectedDetailPost)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                      selectedDetailPost.likes?.includes(currentUser?.uid || '')
                        ? 'bg-rose-500 text-white'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <Heart
                      size={15}
                      className={
                        selectedDetailPost.likes?.includes(currentUser?.uid || '')
                          ? 'fill-current'
                          : ''
                      }
                    />
                    <span>{formatCompactNumber(selectedDetailPost.likesCount || 0)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedDetailPost;
                      setSelectedDetailPost(null);
                      setActiveCommentsPost(target);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <MessageCircle size={15} />
                    <span>
                      Comments ({formatCompactNumber(selectedDetailPost.commentsCount || 0)})
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSave(selectedDetailPost.id)}
                    className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] cursor-pointer"
                  >
                    <Bookmark
                      size={15}
                      className={
                        (userProfile?.savedPostIds || []).includes(selectedDetailPost.id)
                          ? 'fill-current text-[var(--accent-primary)]'
                          : ''
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(selectedDetailPost)}
                    className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] cursor-pointer"
                  >
                    <Share2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Long-Press Quick Actions Sheet */}
      {quickActionPost && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQuickActionPost(null)}
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-4 space-y-2 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
              <span className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
                Quick Actions
              </span>
              <button
                type="button"
                onClick={() => setQuickActionPost(null)}
                className="p-1.5 rounded-full hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleToggleSave(quickActionPost.id);
                setQuickActionPost(null);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
            >
              <Bookmark size={16} />
              <span>
                {(userProfile?.savedPostIds || []).includes(quickActionPost.id)
                  ? 'Remove from Saved'
                  : 'Save Post'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                const target = quickActionPost;
                setQuickActionPost(null);
                handleShare(target);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
            >
              <Share2 size={16} />
              <span>Share Post</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setHiddenPostIds((prev) => [...prev, quickActionPost.id]);
                setQuickActionPost(null);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
            >
              <EyeOff size={16} />
              <span>Hide from Explore</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const target = quickActionPost;
                setQuickActionPost(null);
                await reportContent({
                  targetType: 'post',
                  targetId: target.id,
                  targetSummary: `${target.authorName}: ${(target.content || 'Post').slice(0, 80)}`,
                  reason: 'Reported from Explore quick actions'
                });
                showGlobalToast('Reported to WaveLink Safety Team.');
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-rose-500/10 flex items-center gap-3 text-sm font-bold text-rose-500 cursor-pointer"
            >
              <Flag size={16} />
              <span>Report Content</span>
            </button>
          </div>
        </div>
      )}

      {/* Pick Your Interests Modal (First Visit & Interests Button) */}
      <InterestPickerModal
        isOpen={isInterestModalOpen}
        onClose={() => setIsInterestModalOpen(false)}
      />

      {/* Comments Sheet */}
      <CommentsSheet
        post={activeCommentsPost}
        isOpen={Boolean(activeCommentsPost)}
        onClose={() => setActiveCommentsPost(null)}
        onCommentCountChange={handleCommentCountChange}
      />

      {/* Share Sheet */}
      <ShareSheet
        post={activeSharePost}
        isOpen={Boolean(activeSharePost)}
        onClose={() => setActiveSharePost(null)}
        onShareCountChange={handleShareCountChange}
      />

      {/* Upload Reel Modal */}
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
            className="w-full max-w-lg bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <VideoIcon size={18} className="text-[#2563EB]" />
                  <span>Publish Video Reel</span>
                </h3>
                <span className="text-xs font-mono text-[var(--text-secondary)]">
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
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
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
              placeholder="Write a caption for your reel (AI auto-tags category & keywords)..."
              className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#2563EB]"
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
                className="px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs font-bold"
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

      <WinnersWallView
        challenge={winnersWallChallenge}
        onClose={() => setWinnersWallChallenge(null)}
        onViewProfile={onViewProfile}
      />
    </div>
  );
};
