import React, { useEffect, useRef, useState } from 'react';
import { Heart, Layers, Pin, Play, Sparkles } from 'lucide-react';
import type { Post } from '../types';
import { Avatar } from './Avatar';
import { BadgeIconGlyph } from './BadgeIconGlyph';
import { getCachedUserProfile } from '../firebase';
import { resolveUnifiedBadge } from '../services/challengesService';
import { cleanCaption } from '../utils/cleanCaption';
import { useAuth } from '../context/AuthContext';
import { SensitiveMediaGate } from './SensitiveMediaGate';
import { getMediaSafetyVisibility } from '../utils/contentModeration';

export interface UnifiedPostCardProps {
  post: Post;
  isLiked?: boolean;
  isFeatured?: boolean;
  isPinned?: boolean;
  compact?: boolean;
  aspectOverride?: 'auto' | 'square' | '4:5' | '9:16';
  badgeLabel?: string;
  activeHoverPostId?: string | null;
  onRequestHoverPlay?: (postId: string | null) => void;
  onOpenVideoInReels: (post: Post) => void;
  onOpenPostDetail: (post: Post) => void;
  onToggleLike?: (post: Post) => void;
  onDoubleTapLike?: (post: Post) => void;
  onLongPressQuickActions?: (post: Post) => void;
}

function canDesktopHoverPreview(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const htmlEl = document.documentElement;
  if (
    htmlEl.getAttribute('data-lite-mode') === 'true' ||
    htmlEl.getAttribute('data-low-effects') === 'true' ||
    htmlEl.getAttribute('data-battery-saver') === 'true'
  ) {
    return false;
  }
  return true;
}

export function formatShortDurationBadge(seconds?: number): string {
  const s = Math.max(1, Math.round(seconds || 15));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function resolveCardAspectRatioClass(
  post: Post,
  isFeatured?: boolean,
  aspectOverride: UnifiedPostCardProps['aspectOverride'] = 'auto'
): string {
  if (isFeatured) {
    return 'aspect-[16/10] sm:aspect-[16/9]';
  }
  if (aspectOverride === 'square') return 'wavelink-explore-ratio--1-1';
  if (aspectOverride === '4:5') return 'wavelink-explore-ratio--4-5';
  if (aspectOverride === '9:16') return 'wavelink-explore-ratio--9-16';

  if (post.aspectRatio === '1:1') return 'wavelink-explore-ratio--1-1';
  if (post.aspectRatio === '4:5') return 'wavelink-explore-ratio--4-5';
  if (post.aspectRatio === '9:16') return 'wavelink-explore-ratio--9-16';

  const w = post.videoWidth || 0;
  const h = post.videoHeight || 0;
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio >= 0.92 && ratio <= 1.08) return 'wavelink-explore-ratio--1-1';
    if (ratio > 0.72) return 'wavelink-explore-ratio--4-5';
    return 'wavelink-explore-ratio--9-16';
  }

  const isVideo = Boolean(post.videoUrl || post.hasVideoChunks || post.mediaType === 'video');
  return isVideo ? 'wavelink-explore-ratio--9-16' : 'wavelink-explore-ratio--4-5';
}

export function deriveVideoPosterUrl(post: Post): string | undefined {
  if (post.thumbnailUrl && post.thumbnailUrl.startsWith('http')) {
    return post.thumbnailUrl;
  }
  if (post.imageUrl && post.imageUrl.startsWith('http')) {
    return post.imageUrl;
  }
  if (post.videoUrl && post.videoUrl.includes('res.cloudinary.com')) {
    return post.videoUrl
      .replace('/video/upload/', '/video/upload/so_1.0,w_640,c_limit,q_auto:good/')
      .replace(/\.[a-zA-Z0-9]+(\?.*)?$/, '.jpg');
  }
  return undefined;
}

/**
 * Single canonical post card component used across WaveLink:
 * Home feed (Following, Local, Trending & every pagination batch), Explore (first & later pages),
 * Search results, Profile grids, Hashtag views, Saved posts, and Challenge entries.
 *
 * Variants:
 *  - Video: clean visual video frame ONLY (play + duration badge, subtle/hover heart button, desktop 200ms hover preview). Tap opens full-screen Reels.
 *  - Photo: clean visual photo frame ONLY (multi-photo stack icon if carousel, subtle/hover heart button). Tap opens Post Detail.
 *  - Text-only: clean glass card with cleanCaption() excerpt (max 4 lines) and author's small avatar + presence dot. Tap opens Post Detail.
 */
export const UnifiedPostCard: React.FC<UnifiedPostCardProps> = React.memo(
  ({
    post,
    isLiked = false,
    isFeatured = false,
    isPinned = false,
    compact = false,
    aspectOverride = 'auto',
    badgeLabel,
    activeHoverPostId = null,
    onRequestHoverPlay,
    onOpenVideoInReels,
    onOpenPostDetail,
    onToggleLike,
    onDoubleTapLike,
    onLongPressQuickActions
  }) => {
    const isVideo = Boolean(post.videoUrl || post.hasVideoChunks || post.mediaType === 'video');
    const photoList =
      post.imageUrls && post.imageUrls.length > 0
        ? post.imageUrls
        : post.imageUrl
        ? [post.imageUrl]
        : [];
    const isPhoto = !isVideo && photoList.length > 0;
    const isTextOnly = !isVideo && !isPhoto;

    const hoverTimerRef = useRef<number | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    const lastTapRef = useRef<number>(0);
    const longPressTriggeredRef = useRef<boolean>(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isVideoReadyOnHover, setIsVideoReadyOnHover] = useState(false);

    const { userProfile } = useAuth();
    const mediaVisibility = getMediaSafetyVisibility(post.mediaSafety, userProfile);
    const isHoverPlaying = Boolean(
      isVideo && activeHoverPostId && activeHoverPostId === post.id && mediaVisibility === 'show'
    );

    useEffect(() => {
      return () => {
        if (hoverTimerRef.current) {
          window.clearTimeout(hoverTimerRef.current);
        }
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      const videoEl = videoRef.current;
      if (!isHoverPlaying) {
        setIsVideoReadyOnHover(false);
        if (videoEl) {
          try {
            videoEl.pause();
            videoEl.removeAttribute('src');
            videoEl.load();
          } catch {}
        }
        return;
      }

      if (videoEl && post.videoUrl) {
        try {
          if (videoEl.getAttribute('src') !== post.videoUrl) {
            videoEl.setAttribute('src', post.videoUrl);
          }
          videoEl.muted = true;
          const playPromise = videoEl.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              setIsVideoReadyOnHover(false);
            });
          }
        } catch {
          setIsVideoReadyOnHover(false);
        }
      }
    }, [isHoverPlaying, post.videoUrl]);

    const handleMouseEnter = () => {
      if (!isVideo || !post.videoUrl || !onRequestHoverPlay || !canDesktopHoverPreview()) return;
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
      hoverTimerRef.current = window.setTimeout(() => {
        onRequestHoverPlay(post.id);
      }, 200);
    };

    const handleMouseLeave = () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (onRequestHoverPlay && activeHoverPostId === post.id) {
        onRequestHoverPlay(null);
      }
    };

    const handlePointerDown = () => {
      longPressTriggeredRef.current = false;
      if (!onLongPressQuickActions) return;
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPressQuickActions(post);
      }, 520);
    };

    const clearLongPress = () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleCardClick = () => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      const now = Date.now();
      if (now - lastTapRef.current < 260 && (onDoubleTapLike || onToggleLike)) {
        if (onDoubleTapLike) {
          onDoubleTapLike(post);
        } else if (onToggleLike) {
          onToggleLike(post);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (isVideo) {
        onOpenVideoInReels(post);
      } else {
        onOpenPostDetail(post);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isVideo) {
          onOpenVideoInReels(post);
        } else {
          onOpenPostDetail(post);
        }
      }
    };

    // 1. TEXT-ONLY VARIANT: Clean glass card with short sanitized excerpt (max 4 lines) + author avatar
    if (isTextOnly) {
      const cleanExcerpt = cleanCaption(post.content);
      const squareClass = aspectOverride === 'square' ? 'aspect-square flex flex-col justify-between' : '';
      return (
        <div
          role="button"
          tabIndex={0}
          data-wave-feed-item="true"
          data-post-id={post.id}
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onContextMenu={(e) => {
            if (onLongPressQuickActions) {
              e.preventDefault();
              onLongPressQuickActions(post);
            }
          }}
          className={`wavelink-explore-card wavelink-glass-post-card ${
            compact ? 'p-3' : 'p-4'
          } ${squareClass} cursor-pointer select-none group`}
        >
          {(isPinned || badgeLabel) && (
            <div className="mb-2 flex items-center gap-1.5">
              {isPinned && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-extrabold inline-flex items-center gap-1 shadow-xs">
                  <Pin size={9} />
                  <span>Pinned</span>
                </span>
              )}
              {badgeLabel && (
                <span className="px-2 py-0.5 rounded-full bg-black/25 text-[var(--text-primary)] text-[9px] font-extrabold">
                  {badgeLabel}
                </span>
              )}
            </div>
          )}

          {cleanExcerpt ? (
            <p
              className={`${
                compact ? 'text-xs' : 'text-[13px] sm:text-sm'
              } font-semibold text-[var(--text-primary)] line-clamp-4 leading-relaxed break-words`}
            >
              {cleanExcerpt}
            </p>
          ) : (
            <div className="min-h-[36px]" />
          )}

          <div className="mt-3 pt-2.5 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar
                uid={post.authorId}
                src={post.authorPhotoURL}
                fallbackName={post.authorName}
                size={compact ? 22 : 24}
                showStatus={true}
                className="rounded-full shrink-0"
              />
              {(() => {
                const bid =
                  post.authorHighlightedBadgeId !== undefined
                    ? post.authorHighlightedBadgeId
                    : getCachedUserProfile(post.authorId)?.highlightedBadgeId || null;
                const badge = bid ? resolveUnifiedBadge(bid) : null;
                return badge ? <BadgeIconGlyph badge={badge} size="xs" title={badge.name} /> : null;
              })()}
            </div>
            <div className="flex items-center gap-1.5">
              {post.aiGenerated && (
                <span
                  title="AI-generated content"
                  className="px-1.5 py-0.5 rounded-md bg-black/25 text-[var(--text-secondary)] text-[9px] font-bold tracking-wider uppercase flex items-center gap-0.5"
                >
                  <Sparkles size={9} />
                  <span>AI</span>
                </span>
              )}
              {onToggleLike && (
                <button
                  type="button"
                  data-liked={isLiked ? 'true' : 'false'}
                  aria-label={isLiked ? 'Unlike post' : 'Like post'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(post);
                  }}
                  className={`wavelink-explore-heart-btn w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                    isLiked
                      ? 'bg-rose-500 text-white'
                      : 'bg-black/15 dark:bg-white/10 text-[var(--text-secondary)] hover:text-rose-500'
                  }`}
                >
                  <Heart size={12} className={isLiked ? 'fill-current' : ''} />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 2. VIDEO OR PHOTO VARIANT (including Featured Card):
    // Clean visual media ONLY — NO caption text, NO filename, NO "Trending creator", NO @username, NO like count text, NO hint text
    const ratioClass = resolveCardAspectRatioClass(post, isFeatured, aspectOverride);
    const posterUrl = isVideo ? deriveVideoPosterUrl(post) : photoList[0];
    const durationText = formatShortDurationBadge(post.videoDurationSeconds || post.duration);

    return (
      <div
        role="button"
        tabIndex={0}
        data-wave-feed-item="true"
        data-post-id={post.id}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={(e) => {
          if (onLongPressQuickActions) {
            e.preventDefault();
            onLongPressQuickActions(post);
          }
        }}
        className={`wavelink-explore-card ${ratioClass} cursor-pointer select-none group bg-slate-900`}
      >
        {/* Thumbnail / Poster Image (gated by Layer 3 SensitiveMediaGate for borderline media) */}
        <SensitiveMediaGate
          mediaSafety={post.mediaSafety}
          userProfile={userProfile}
          compact={true}
          className="absolute inset-0 w-full h-full"
        >
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${
                isHoverPlaying && isVideoReadyOnHover ? 'opacity-0' : 'opacity-100'
              }`}
            />
          ) : isVideo && post.videoUrl ? (
            <video
              src={`${post.videoUrl}#t=0.5`}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ background: 'var(--accent-gradient)' }}
            />
          )}

          {/* Desktop 200ms Hover Preview Video (preload="none", src attached ONLY on hover) */}
          {isVideo && isHoverPlaying && (
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              preload="none"
              onPlaying={() => setIsVideoReadyOnHover(true)}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}
        </SensitiveMediaGate>

        {/* Top-left tiny icon details ONLY */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 pointer-events-none">
          {isPinned && (
            <span
              title="Pinned"
              className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-extrabold flex items-center gap-0.5 shadow-xs"
            >
              <Pin size={9} />
            </span>
          )}
          {badgeLabel && (
            <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-extrabold shadow-xs">
              {badgeLabel}
            </span>
          )}
          {isVideo && (
            <span className="px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold font-mono flex items-center gap-1 shadow-xs">
              <Play size={9} className="fill-white" />
              <span>{durationText}</span>
            </span>
          )}
          {!isVideo && photoList.length > 1 && (
            <span className="p-1.5 rounded-full bg-black/55 text-white flex items-center justify-center shadow-xs">
              <Layers size={11} />
            </span>
          )}
          {post.aiGenerated && (
            <span
              title="AI-generated"
              className="px-1.5 py-0.5 rounded-full bg-black/55 text-white/90 text-[9px] font-bold tracking-wider uppercase flex items-center gap-0.5 shadow-xs"
            >
              <Sparkles size={8} />
              <span>AI</span>
            </span>
          )}
        </div>

        {/* Top-right tiny heart button: subtle on mobile, appears on hover on desktop */}
        {onToggleLike && (
          <button
            type="button"
            data-liked={isLiked ? 'true' : 'false'}
            aria-label={isLiked ? 'Unlike' : 'Like'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike(post);
            }}
            className={`wavelink-explore-heart-btn absolute top-2 right-2 z-10 ${
              compact ? 'w-7 h-7' : 'w-8 h-8'
            } rounded-full flex items-center justify-center cursor-pointer ${
              isLiked
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-black/45 text-white/90 hover:bg-black/65'
            }`}
          >
            <Heart size={compact ? 11 : 13} className={isLiked ? 'fill-current' : ''} />
          </button>
        )}
      </div>
    );
  }
);
