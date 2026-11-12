import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Maximize2,
  Minimize2,
  Heart,
  ChevronLeft,
  ChevronRight,
  Music,
  EyeOff
} from 'lucide-react';
import { Post } from '../types';
import { resolveVideoUrl } from '../utils/mediaStorage';
import {
  useDataSaver,
  getOptimizedVideoUrl,
  getOptimizedImagePreviewUrl
} from '../services/dataSaverService';
import { EXCLUSIVE_AUDIO_EVENT } from './VideoPlayer';

export interface ReelSlideMediaProps {
  post: Post;
  isActive: boolean;
  isNextSlide: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  autoLoop: boolean;
  onSingleTapPlayPause?: (playing: boolean) => void;
  onDoubleTapLike: (clientX: number, clientY: number) => void;
  onLongPressChange: (holding: boolean) => void;
  onSwipeLeftProfile: () => void;
  language: string;
  registerVideoActions?: (actions: {
    togglePlay: () => void;
    toggleFullscreen: () => void;
  } | null) => void;
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const ReelSlideMedia: React.FC<ReelSlideMediaProps> = ({
  post,
  isActive,
  isNextSlide,
  isMuted,
  onToggleMute,
  autoLoop,
  onSingleTapPlayPause,
  onDoubleTapLike,
  onLongPressChange,
  onSwipeLeftProfile,
  language,
  registerVideoActions
}) => {
  const { enabled: isDataSaverOn } = useDataSaver();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const hasVideo = Boolean(post.videoUrl || post.hasVideoChunks || post.mediaType === 'video');
  const imageSlides =
    post.imageUrls && post.imageUrls.length > 0
      ? post.imageUrls
      : post.imageUrl
      ? [post.imageUrl]
      : [];
  const hasImages = !hasVideo && imageSlides.length > 0;

  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(post.duration || post.videoDurationSeconds || 0);
  const [volume, setVolume] = useState<number>(isMuted ? 0 : 0.85);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [carouselIdx, setCarouselIdx] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  // Quick center feedback icon on single tap (play/pause)
  const [tapFeedbackIcon, setTapFeedbackIcon] = useState<'play' | 'pause' | null>(null);
  // Double-tap big heart burst coordinates
  const [doubleTapBursts, setDoubleTapBursts] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const [isHoldToView, setIsHoldToView] = useState<boolean>(false);

  // Gesture tracking refs
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posterUrl = post.thumbnailUrl || post.imageUrl || imageSlides[0] || '';
  const optimizedPoster = posterUrl
    ? getOptimizedImagePreviewUrl(posterUrl, isDataSaverOn) || posterUrl
    : '';

  // Resolve video URL for active slide OR next slide (preload="metadata" for next video only)
  useEffect(() => {
    if (!hasVideo) return;
    if (!isActive && !isNextSlide) {
      return;
    }

    let cancelled = false;
    const rawUrl = post.videoUrl || '';
    if (rawUrl && !post.hasVideoChunks) {
      setResolvedSrc(getOptimizedVideoUrl(rawUrl, isDataSaverOn) || rawUrl);
      return;
    }

    resolveVideoUrl(post.id, rawUrl, post.hasVideoChunks)
      .then((url) => {
        if (!cancelled && url) {
          setResolvedSrc(getOptimizedVideoUrl(url, isDataSaverOn) || url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [hasVideo, isActive, isNextSlide, post.id, post.videoUrl, post.hasVideoChunks, isDataSaverOn]);

  // Sync muted and volume state with video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
    if (!isMuted && v.volume === 0) {
      v.volume = volume > 0 ? volume : 0.85;
    }
  }, [isMuted, volume]);

  // Autoplay when active (> 60% visible in parent snap container), pause when off-screen
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;

    if (isActive && resolvedSrc) {
      setIsEnded(false);
      v.muted = isMuted;
      v.playbackRate = playbackRate;
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            if (!isMuted && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(EXCLUSIVE_AUDIO_EVENT, {
                  detail: { sourceId: `reel_${post.id}` }
                })
              );
            }
          })
          .catch(() => {
            // Fallback to muted autoplay if browser blocked unmuted play
            v.muted = true;
            v.play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          });
      }
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [isActive, hasVideo, resolvedSrc, isMuted, playbackRate, post.id]);

  // Listen for exclusive audio events from other players
  useEffect(() => {
    const handleExclusiveAudio = (e: Event) => {
      const sourceId = (e as CustomEvent<{ sourceId?: string }>).detail?.sourceId;
      if (sourceId && sourceId !== `reel_${post.id}`) {
        const v = videoRef.current;
        if (v && !v.paused && !isActive) {
          v.pause();
          setIsPlaying(false);
        }
      }
    };
    window.addEventListener(EXCLUSIVE_AUDIO_EVENT, handleExclusiveAudio);
    return () => window.removeEventListener(EXCLUSIVE_AUDIO_EVENT, handleExclusiveAudio);
  }, [post.id, isActive]);

  const showQuickPlayPauseFeedback = useCallback((icon: 'play' | 'pause') => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setTapFeedbackIcon(icon);
    feedbackTimerRef.current = setTimeout(() => {
      setTapFeedbackIcon(null);
    }, 650);
  }, []);

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (v.paused || v.ended) {
      if (v.ended) {
        v.currentTime = 0;
        setIsEnded(false);
      }
      v.play()
        .then(() => {
          setIsPlaying(true);
          showQuickPlayPauseFeedback('play');
          onSingleTapPlayPause?.(true);
        })
        .catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
      showQuickPlayPauseFeedback('pause');
      onSingleTapPlayPause?.(false);
    }
  }, [hasVideo, onSingleTapPlayPause, showQuickPlayPauseFeedback]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document.exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!registerVideoActions) return;
    if (isActive) {
      registerVideoActions({
        togglePlay: togglePlayPause,
        toggleFullscreen
      });
      return () => registerVideoActions(null);
    }
  }, [isActive, registerVideoActions, togglePlayPause, toggleFullscreen]);

  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setIsEnded(false);
    v.play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const nextPct = Number(e.target.value);
    setProgressPercent(nextPct);
    const v = videoRef.current;
    if (v && duration > 0) {
      v.currentTime = (nextPct / 100) * duration;
      setCurrentTime(v.currentTime);
    }
  };

  const handleVolumeSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = Number(e.target.value);
    setVolume(val);
    const v = videoRef.current;
    if (v) {
      v.volume = val;
      if (val === 0 && !isMuted) {
        onToggleMute();
      } else if (val > 0 && isMuted) {
        onToggleMute();
      }
    }
  };

  const cyclePlaybackSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (PLAYBACK_SPEEDS.indexOf(playbackRate) + 1) % PLAYBACK_SPEEDS.length;
    const nextRate = PLAYBACK_SPEEDS[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  // Pointer gestures: Single tap (play/pause), Double tap (heart burst + like), Long press (hold-to-view), Swipe left (creator profile)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore clicks on interactive controls
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, [data-no-gesture="true"]')) return;

    pointerDownPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setIsHoldToView(true);
      onLongPressChange(true);
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }, 420);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDownPosRef.current) return;
    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
    if (dx > 14 || dy > 14) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, [data-no-gesture="true"]')) return;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isHoldToView) {
      setIsHoldToView(false);
      onLongPressChange(false);
      if (videoRef.current && isActive && !isEnded) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      pointerDownPosRef.current = null;
      return;
    }

    const start = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Horizontal swipe left -> open creator's profile (when horizontal swipe dominates)
    if (dx < -75 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipeLeftProfile();
      return;
    }

    // Ignore significant vertical drag (handled by scroll-snap)
    if (Math.abs(dy) > 25 || Math.abs(dx) > 25) {
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    if (timeSinceLastTap < 280) {
      // Double tap -> Like + Big Heart Burst
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapTimeRef.current = 0;

      const rect = containerRef.current?.getBoundingClientRect();
      const burstX = rect ? e.clientX - rect.left : e.clientX;
      const burstY = rect ? e.clientY - rect.top : e.clientY;
      const burstId = Date.now() + Math.random();

      setDoubleTapBursts((prev) => [...prev.slice(-4), { id: burstId, x: burstX, y: burstY }]);
      setTimeout(() => {
        setDoubleTapBursts((prev) => prev.filter((b) => b.id !== burstId));
      }, 850);

      onDoubleTapLike(e.clientX, e.clientY);
    } else {
      lastTapTimeRef.current = now;
      singleTapTimerRef.current = setTimeout(() => {
        if (hasVideo) {
          togglePlayPause();
        }
        singleTapTimerRef.current = null;
      }, 250);
    }
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="wavelink-reel-media-stage relative w-full h-full overflow-hidden select-none bg-slate-950 group/reelstage"
    >
      {/* 1. VIDEO POST */}
      {hasVideo && (
        <>
          {/* Thumbnail / Poster First */}
          {optimizedPoster && (
            <img
              src={optimizedPoster}
              alt={post.authorName || 'Wave video thumbnail'}
              referrerPolicy="no-referrer"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isVideoReady && !isBuffering ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />
          )}

          {/* Shimmer Loading Skeleton before video frames arrive */}
          {(!isVideoReady || isBuffering) && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-800/25 to-slate-950/70 animate-pulse pointer-events-none"
            />
          )}

          {resolvedSrc && (
            <video
              ref={videoRef}
              src={resolvedSrc}
              poster={optimizedPoster || undefined}
              preload="metadata"
              playsInline
              muted={isMuted}
              loop={autoLoop}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.duration && isFinite(v.duration)) {
                  setDuration(v.duration);
                }
                setIsVideoReady(true);
                setIsBuffering(false);
              }}
              onCanPlay={() => {
                setIsVideoReady(true);
                setIsBuffering(false);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
                setIsEnded(false);
              }}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                setCurrentTime(v.currentTime);
                const total = v.duration || duration || 1;
                setProgressPercent(Math.min(100, Math.max(0, (v.currentTime / total) * 100)));
              }}
              onEnded={() => {
                if (!autoLoop) {
                  setIsPlaying(false);
                  setIsEnded(true);
                  setProgressPercent(100);
                }
              }}
              className="w-full h-full object-cover"
            />
          )}

          {/* Replay overlay button when video ends and autoLoop is off */}
          {isEnded && !autoLoop && (
            <div
              data-no-gesture="true"
              className="absolute inset-0 z-25 flex items-center justify-center bg-slate-950/45"
            >
              <button
                type="button"
                onClick={handleReplay}
                className="wavelink-glass-top-pill px-5 py-3 rounded-full text-white font-bold text-sm flex items-center gap-2.5 shadow-xl cursor-pointer active:scale-95 transition-transform"
              >
                <RotateCcw size={18} />
                <span>{language === 'sw' ? 'Cheza Tena' : 'Replay'}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 2. PHOTO / CAROUSEL POST (Full-screen object-fit: cover frame) */}
      {hasImages && (
        <div className="relative w-full h-full">
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 animate-pulse" />
          )}
          <img
            src={getOptimizedImagePreviewUrl(imageSlides[carouselIdx], isDataSaverOn) || imageSlides[carouselIdx]}
            alt={post.content?.slice(0, 60) || `${post.authorName} photo`}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            className="w-full h-full object-cover transition-opacity duration-300"
          />

          {/* Carousel Prev/Next & Dots if multiple photos */}
          {imageSlides.length > 1 && (
            <div data-no-gesture="true" className="contents">
              {carouselIdx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCarouselIdx((i) => Math.max(0, i - 1));
                  }}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-25 w-10 h-10 rounded-full bg-slate-950/60 text-white border border-white/25 flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              {carouselIdx < imageSlides.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCarouselIdx((i) => Math.min(imageSlides.length - 1, i + 1));
                  }}
                  aria-label="Next photo"
                  className="absolute right-16 top-1/2 -translate-y-1/2 z-25 w-10 h-10 rounded-full bg-slate-950/60 text-white border border-white/25 flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <ChevronRight size={20} />
                </button>
              )}
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-25 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/55 border border-white/20">
                {imageSlides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCarouselIdx(idx);
                    }}
                    aria-label={`Slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      idx === carouselIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/45'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. TEXT / AUDIO WAVE POST (Full-screen atmospheric gradient canvas) */}
      {!hasVideo && !hasImages && (
        <div
          className="w-full h-full flex flex-col items-center justify-center px-8 text-center"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.42) 0%, transparent 50%), radial-gradient(circle at 80% 75%, rgba(13, 148, 136, 0.42) 0%, transparent 55%), linear-gradient(165deg, #071326 0%, #091E36 52%, #042029 100%)'
          }}
        >
          {post.songTitle && (
            <div className="mb-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/12 border border-white/20 text-teal-200 text-xs font-bold">
              <Music size={14} className="animate-spin" style={{ animationDuration: '6s' }} />
              <span>
                {post.songTitle}
                {post.songArtist ? ` · ${post.songArtist}` : ''}
              </span>
            </div>
          )}
          <p className="text-white text-xl sm:text-2xl font-extrabold leading-relaxed max-w-md text-balance drop-shadow-md">
            {post.content}
          </p>
        </div>
      )}

      {/* Soft dark gradient scrim at top and bottom so overlay text is always >= 4.5:1 readable */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(2, 6, 23, 0.72) 0%, rgba(2, 6, 23, 0.18) 22%, rgba(2, 6, 23, 0.05) 52%, rgba(2, 6, 23, 0.58) 76%, rgba(2, 6, 23, 0.90) 100%)'
        }}
      />

      {/* Hold-to-View indicator pill */}
      {isHoldToView && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-slate-950/75 border border-white/25 text-white text-xs font-bold flex items-center gap-1.5">
          <EyeOff size={13} />
          <span>{language === 'sw' ? 'Hali ya kutazama wazi' : 'Hold-to-view mode'}</span>
        </div>
      )}

      {/* Quick Play / Pause Icon Burst on Single Tap */}
      {tapFeedbackIcon && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <div className="w-18 h-18 rounded-full bg-slate-950/65 border border-white/30 text-white flex items-center justify-center shadow-2xl animate-ping-once">
            {tapFeedbackIcon === 'play' ? (
              <Play size={32} className="fill-white text-white ml-1" />
            ) : (
              <Pause size={32} className="fill-white text-white" />
            )}
          </div>
        </div>
      )}

      {/* Double-Tap Big Heart Bursts */}
      {doubleTapBursts.map((burst) => (
        <div
          key={burst.id}
          aria-hidden="true"
          style={{
            left: `${burst.x}px`,
            top: `${burst.y}px`
          }}
          className="pointer-events-none absolute z-35 -translate-x-1/2 -translate-y-1/2 wavelink-double-tap-heart"
        >
          <Heart size={84} className="fill-rose-500 text-rose-400 drop-shadow-[0_10px_28px_rgba(244,63,94,0.65)]" />
        </div>
      ))}

      {/* Mute / Unmute floating button (visible on video slides when not in hold-to-view) */}
      {hasVideo && !isHoldToView && (
        <button
          type="button"
          data-no-gesture="true"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          className="absolute right-3.5 top-18 z-25 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-slate-950/60 hover:bg-slate-950/80 text-white border border-white/25 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-white"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}

      {/* DESKTOP Hover Control Bar (Play/Pause, Volume Slider, Scrubbing, Speed, Fullscreen) */}
      {hasVideo && !isHoldToView && (
        <div
          data-no-gesture="true"
          className="wavelink-desktop-video-hover-bar hidden lg:flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/75 border border-white/20 text-white opacity-0 group-hover/reelstage:opacity-100 focus-within:opacity-100 transition-opacity duration-200 absolute left-3 right-3 bottom-3 z-30"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>

          <span className="text-[11px] font-mono tabular-nums text-white/90 shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <input
            type="range"
            min={0}
            max={100}
            step={0.2}
            value={progressPercent}
            onChange={handleScrub}
            aria-label="Seek video progress"
            className="flex-1 h-1.5 accent-teal-400 bg-white/25 rounded-full cursor-pointer"
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeSlider}
              aria-label="Volume"
              className="w-16 h-1 accent-teal-400 bg-white/25 rounded-full cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={cyclePlaybackSpeed}
            title="Playback Speed"
            className="px-2 py-1 rounded-lg bg-white/12 hover:bg-white/20 text-[11px] font-mono font-bold tabular-nums cursor-pointer"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label="Toggle Fullscreen"
            title="Fullscreen (F)"
            className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      )}

      {/* Thin Scrubbable Progress Line at the VERY BOTTOM of the video frame */}
      {hasVideo && (
        <div
          data-no-gesture="true"
          className="absolute left-0 right-0 bottom-0 z-25 h-4 flex items-end group/scrub"
        >
          <div className="w-full h-1 group-hover/scrub:h-2 bg-white/20 transition-all relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#14B8A6]"
              style={{
                width: `${progressPercent}%`
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.2}
            value={progressPercent}
            onChange={handleScrub}
            aria-label="Video progress"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      )}
    </div>
  );
};
