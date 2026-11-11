import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolveVideoUrl } from '../utils/mediaStorage';
import { Volume2, VolumeX } from 'lucide-react';

export interface VideoPlayerProps {
  postId: string;
  videoUrl?: string;
  hasVideoChunks?: boolean;
  thumbnailUrl?: string;
  duration?: number;
  videoWidth?: number;
  videoHeight?: number;
  aspectRatio?: '1:1' | '4:5' | '9:16' | number;
  className?: string;
  autoPlayOnVisible?: boolean;
  defaultMuted?: boolean;
}

const SOUND_PREF_STORAGE_KEY = 'wavelink_feed_video_sound_pref';
const SOUND_PREF_EVENT = 'wavelink:video-sound-pref';

// Cache natural aspect ratios and captured first-frame posters across scroll mounts
const videoAspectRatioCache = new Map<string, number>();
const firstFramePosterCache = new Map<string, string>();

// Track whether the user has interacted with sound during this page session
let hasUserSelectedUnmuteInSession = false;

function getRememberedSoundMuted(fallbackMuted = true): boolean {
  if (typeof window === 'undefined') return fallbackMuted;
  try {
    const saved = localStorage.getItem(SOUND_PREF_STORAGE_KEY);
    if (saved === 'unmuted') return false;
    if (saved === 'muted') return true;
  } catch {
    // ignore storage errors
  }
  return fallbackMuted;
}

function setRememberedSoundMuted(muted: boolean): void {
  hasUserSelectedUnmuteInSession = !muted;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_PREF_STORAGE_KEY, muted ? 'muted' : 'unmuted');
    window.dispatchEvent(new CustomEvent(SOUND_PREF_EVENT, { detail: { muted } }));
  } catch {
    // ignore storage errors
  }
}

interface RegisteredPlayerEntry {
  instanceId: string;
  postId: string;
  getContainer: () => HTMLDivElement | null;
  intersectionRatio: number;
  isIntersecting: boolean;
  userPaused: boolean;
  autoPlayOnVisible: boolean;
  setAllowedToLoad: (allowed: boolean) => void;
  setIsActivePlayTarget: (active: boolean) => void;
  forcePause: () => void;
}

const registeredPlayers = new Map<string, RegisteredPlayerEntry>();
let activePlayingInstanceId: string | null = null;
let coordinatorRafId: number | null = null;

/**
 * Coordinates all feed video players so that:
 * 1. Strictly ONLY ONE video plays at a time (the one most in view >= 55% or manually tapped).
 * 2. To save mobile data, ONLY the video currently in view and the immediate next one in DOM order
 *    load their video stream; all other videos display their first-frame poster image.
 */
function scheduleCoordinatorEvaluation(): void {
  if (typeof window === 'undefined') return;
  if (coordinatorRafId !== null) return;
  coordinatorRafId = window.requestAnimationFrame(() => {
    coordinatorRafId = null;
    evaluateFeedVideoPlayers();
  });
}

function evaluateFeedVideoPlayers(): void {
  if (registeredPlayers.size === 0) return;

  const entries = Array.from(registeredPlayers.values())
    .map((entry) => {
      const el = entry.getContainer();
      const rect = el ? el.getBoundingClientRect() : null;
      return {
        entry,
        rect,
        top: rect ? rect.top : Infinity,
      };
    })
    .filter((item) => item.rect !== null)
    .sort((a, b) => a.top - b.top);

  if (entries.length === 0) return;

  const viewportCenter = (window.innerHeight || 800) / 2;

  // 1. Find the best visible candidate where most of the video is in view (ratio >= 0.55)
  let bestVisibleIndex = -1;
  let bestRatio = 0;
  let bestDistanceToCenter = Infinity;

  entries.forEach((item, idx) => {
    const { entry, rect } = item;
    if (!rect) return;
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - viewportCenter);

    if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
      if (
        entry.intersectionRatio > bestRatio + 0.05 ||
        (Math.abs(entry.intersectionRatio - bestRatio) <= 0.05 && dist < bestDistanceToCenter)
      ) {
        bestRatio = entry.intersectionRatio;
        bestDistanceToCenter = dist;
        bestVisibleIndex = idx;
      }
    }
  });

  // 2. If no video is >= 55% visible yet, find the one closest to the viewport (at or below top) for loading
  let primaryLoadIndex = bestVisibleIndex;
  if (primaryLoadIndex === -1) {
    let minDistance = Infinity;
    entries.forEach((item, idx) => {
      if (!item.rect) return;
      const center = item.rect.top + item.rect.height / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < minDistance) {
        minDistance = dist;
        primaryLoadIndex = idx;
      }
    });
  }

  // 3. Only load the video that is in view (`primaryLoadIndex`) and the next one (`primaryLoadIndex + 1`)
  entries.forEach((item, idx) => {
    const isCurrentOrNext =
      primaryLoadIndex !== -1 && (idx === primaryLoadIndex || idx === primaryLoadIndex + 1);
    item.entry.setAllowedToLoad(isCurrentOrNext);
  });

  // 4. Enforce single active playing video
  const nextActiveInstanceId =
    bestVisibleIndex !== -1 ? entries[bestVisibleIndex].entry.instanceId : null;

  activePlayingInstanceId = nextActiveInstanceId;

  entries.forEach((item, idx) => {
    const isTarget = idx === bestVisibleIndex && item.entry.autoPlayOnVisible && !item.entry.userPaused;
    item.entry.setIsActivePlayTarget(isTarget);
    if (!isTarget) {
      item.entry.forcePause();
    }
  });
}

function notifyManualPlay(instanceId: string): void {
  activePlayingInstanceId = instanceId;
  registeredPlayers.forEach((entry, id) => {
    if (id !== instanceId) {
      entry.setIsActivePlayTarget(false);
      entry.forcePause();
    } else {
      entry.setAllowedToLoad(true);
      entry.setIsActivePlayTarget(true);
    }
  });
}

function parseInitialAspectRatio(
  postId: string,
  videoWidth?: number,
  videoHeight?: number,
  aspectRatio?: '1:1' | '4:5' | '9:16' | number
): number | null {
  const cached = videoAspectRatioCache.get(postId);
  if (cached && Number.isFinite(cached) && cached > 0) {
    return cached;
  }
  if (videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0) {
    const ratio = videoWidth / videoHeight;
    videoAspectRatioCache.set(postId, ratio);
    return ratio;
  }
  if (typeof aspectRatio === 'number' && aspectRatio > 0) {
    return aspectRatio;
  }
  if (aspectRatio === '1:1') return 1;
  if (aspectRatio === '9:16') return 9 / 16;
  if (aspectRatio === '4:5') return 4 / 5;
  return null;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  postId,
  videoUrl,
  hasVideoChunks,
  thumbnailUrl,
  videoWidth,
  videoHeight,
  aspectRatio,
  className = '',
  autoPlayOnVisible = true,
  defaultMuted = true,
}) => {
  const instanceIdRef = useRef<string>(
    `vp_${postId}_${Math.random().toString(36).substring(2, 8)}`
  );

  // Real aspect ratio of the video so portrait videos are tall and landscape videos are wide
  const [naturalRatio, setNaturalRatio] = useState<number | null>(() =>
    parseInitialAspectRatio(postId, videoWidth, videoHeight, aspectRatio)
  );

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(() =>
    videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0
      ? { width: videoWidth, height: videoHeight }
      : null
  );

  // First-frame poster image for off-screen videos and instant preview
  const [posterUrl, setPosterUrl] = useState<string | undefined>(
    () => thumbnailUrl || firstFramePosterCache.get(postId)
  );
  const [isPosterLoaded, setIsPosterLoaded] = useState<boolean>(false);

  // Only true for the video in view and the next one in the feed
  const [allowedToLoad, setAllowedToLoad] = useState<boolean>(false);
  const [isActivePlayTarget, setIsActivePlayTarget] = useState<boolean>(false);

  const [resolvedSrc, setResolvedSrc] = useState<string | null>(
    videoUrl &&
      (videoUrl.startsWith('https://') ||
        videoUrl.startsWith('http://') ||
        videoUrl.startsWith('blob:'))
      ? videoUrl
      : null
  );
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  // Sound state: remembers the user's sound choice across videos
  const [isMuted, setIsMuted] = useState<boolean>(() =>
    getRememberedSoundMuted(defaultMuted)
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgBlurVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userPausedRef = useRef<boolean>(false);

  useEffect(() => {
    if (thumbnailUrl && thumbnailUrl !== posterUrl) {
      setPosterUrl(thumbnailUrl);
      firstFramePosterCache.set(postId, thumbnailUrl);
    }
  }, [thumbnailUrl, postId, posterUrl]);

  useEffect(() => {
    if (videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0) {
      const r = videoWidth / videoHeight;
      videoAspectRatioCache.set(postId, r);
      setNaturalRatio(r);
      setNaturalSize({ width: videoWidth, height: videoHeight });
    }
  }, [postId, videoWidth, videoHeight]);

  // Listen for sound preference changes from any video in the feed
  useEffect(() => {
    const handleSoundPrefChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ muted: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.muted === 'boolean') {
        const nextMuted = customEvent.detail.muted;
        setIsMuted(nextMuted);
        if (videoRef.current) {
          videoRef.current.muted = nextMuted;
        }
      }
    };

    window.addEventListener(SOUND_PREF_EVENT, handleSoundPrefChange);
    return () => {
      window.removeEventListener(SOUND_PREF_EVENT, handleSoundPrefChange);
    };
  }, []);

  // Capture the first frame as poster image if this video didn't have a saved thumbnailUrl
  const captureFirstFramePosterIfNeeded = useCallback(
    (vid: HTMLVideoElement) => {
      if (posterUrl || firstFramePosterCache.has(postId)) return;
      if (!vid.videoWidth || !vid.videoHeight) return;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / Math.max(vid.videoWidth, vid.videoHeight));
        canvas.width = Math.max(1, Math.round(vid.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(vid.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          if (dataUrl && dataUrl.startsWith('data:image/') && dataUrl.length > 512) {
            firstFramePosterCache.set(postId, dataUrl);
            setPosterUrl(dataUrl);
          }
        }
      } catch {
        // Cross-origin canvas taint if CORS not set on bucket; <video poster> fallback still works
      }
    },
    [postId, posterUrl]
  );

  // Pause helper
  const pauseVideo = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    if (bgBlurVideoRef.current && !bgBlurVideoRef.current.paused) {
      bgBlurVideoRef.current.pause();
    }
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  // Play helper: starts muted with playsInline so mobile browsers never block autoplay,
  // while respecting the user's remembered sound preference whenever allowed by the browser
  const playVideo = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const preferredMuted = getRememberedSoundMuted(true);
    // On mobile browsers, unmuted autoplay is only permitted after the user has interacted in this session
    const shouldTryUnmuted = !preferredMuted && hasUserSelectedUnmuteInSession;
    vid.muted = !shouldTryUnmuted;
    setIsMuted(vid.muted);

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
          if (bgBlurVideoRef.current) {
            bgBlurVideoRef.current.currentTime = vid.currentTime;
            bgBlurVideoRef.current.play().catch(() => {});
          }
        })
        .catch(() => {
          // Phones block autoplay with sound — always fall back to muted autoplay so a tap is never required
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
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
  }, []);

  // Register with the feed video coordinator and observe viewport visibility
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    const entry: RegisteredPlayerEntry = {
      instanceId,
      postId,
      getContainer: () => containerRef.current,
      intersectionRatio: 0,
      isIntersecting: false,
      userPaused: userPausedRef.current,
      autoPlayOnVisible,
      setAllowedToLoad: (allowed: boolean) => {
        setAllowedToLoad((prev) => (prev === allowed ? prev : allowed));
      },
      setIsActivePlayTarget: (active: boolean) => {
        setIsActivePlayTarget((prev) => (prev === active ? prev : active));
      },
      forcePause: () => {
        pauseVideo();
      },
    };

    registeredPlayers.set(instanceId, entry);
    scheduleCoordinatorEvaluation();

    const el = containerRef.current;
    if (!el) {
      return () => {
        registeredPlayers.delete(instanceId);
        scheduleCoordinatorEvaluation();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [obsEntry] = entries;
        const reg = registeredPlayers.get(instanceId);
        if (!reg) return;

        reg.isIntersecting = obsEntry.isIntersecting;
        reg.intersectionRatio = obsEntry.intersectionRatio;

        // Reset manual pause when the video scrolls out of view
        if (!obsEntry.isIntersecting || obsEntry.intersectionRatio < 0.2) {
          userPausedRef.current = false;
          reg.userPaused = false;
          pauseVideo();
        }

        scheduleCoordinatorEvaluation();
      },
      {
        threshold: [0, 0.2, 0.4, 0.55, 0.7, 0.85],
        rootMargin: '0px',
      }
    );

    observer.observe(el);

    const handleScrollOrResize = () => {
      scheduleCoordinatorEvaluation();
    };
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      registeredPlayers.delete(instanceId);
      if (activePlayingInstanceId === instanceId) {
        activePlayingInstanceId = null;
      }
      scheduleCoordinatorEvaluation();
    };
  }, [postId, autoPlayOnVisible, pauseVideo]);

  // Resolve video URL only when this video is in view or is the immediate next video
  useEffect(() => {
    if (!allowedToLoad) return;

    if (
      videoUrl &&
      (videoUrl.startsWith('https://') ||
        videoUrl.startsWith('http://') ||
        videoUrl.startsWith('blob:'))
    ) {
      setResolvedSrc(videoUrl);
      setHasError(false);
      return;
    }

    let isMounted = true;
    setIsBuffering(true);
    setHasError(false);

    resolveVideoUrl(postId, videoUrl, hasVideoChunks)
      .then((src) => {
        if (!isMounted) return;
        if (src) {
          setResolvedSrc(src);
        } else {
          setHasError(true);
        }
        setIsBuffering(false);
      })
      .catch(() => {
        if (isMounted) {
          setHasError(true);
          setIsBuffering(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [allowedToLoad, postId, videoUrl, hasVideoChunks]);

  // Start or pause playback whenever coordinator marks this video as the active play target
  useEffect(() => {
    if (isActivePlayTarget && allowedToLoad && resolvedSrc && !userPausedRef.current) {
      playVideo();
    } else if (!isActivePlayTarget) {
      pauseVideo();
    }
  }, [isActivePlayTarget, allowedToLoad, resolvedSrc, playVideo, pauseVideo]);

  // Single tap on the video pauses or resumes it
  const handleVideoTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const instanceId = instanceIdRef.current;
    const reg = registeredPlayers.get(instanceId);

    if (!allowedToLoad) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;

    if (vid.paused) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      playVideo();
    } else {
      userPausedRef.current = true;
      if (reg) reg.userPaused = true;
      pauseVideo();
    }
  };

  // Small corner speaker button: unmutes/mutes and remembers the choice for the next videos
  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setRememberedSoundMuted(nextMuted);

    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current.paused && !userPausedRef.current) {
        notifyManualPlay(instanceIdRef.current);
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      const exactRatio = vid.videoWidth / vid.videoHeight;
      videoAspectRatioCache.set(postId, exactRatio);
      setNaturalRatio(exactRatio);
      setNaturalSize({ width: vid.videoWidth, height: vid.videoHeight });
    }
    setIsVideoReady(true);
    setIsBuffering(false);
  };

  const handleLoadedData = () => {
    const vid = videoRef.current;
    if (vid) {
      captureFirstFramePosterIfNeeded(vid);
    }
    setIsVideoReady(true);
    setIsBuffering(false);
  };

  // Fallback poster URL using `#t=0.001` fragment when no separate thumbnailUrl exists
  const effectivePosterSrc =
    posterUrl ||
    (!allowedToLoad &&
    resolvedSrc &&
    (resolvedSrc.startsWith('https://') || resolvedSrc.startsWith('http://'))
      ? `${resolvedSrc}#t=0.001`
      : undefined);

  const showSoftPlaceholder =
    (!isVideoReady && !isPosterLoaded) || (isBuffering && !isPlaying && !isPosterLoaded);

  const mediaMaxResolutionStyle: React.CSSProperties | undefined = naturalSize
    ? {
        maxWidth: `min(100%, ${naturalSize.width}px)`,
        maxHeight: `min(80dvh, ${naturalSize.height}px)`
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      onClick={handleVideoTap}
      style={{
        aspectRatio: naturalRatio ? String(naturalRatio) : undefined,
        maxHeight: '80dvh',
      }}
      className={`relative w-full max-h-[80dvh] rounded-2xl overflow-hidden bg-[#0C0A09] flex items-center justify-center select-none cursor-pointer ${
        !naturalRatio ? 'min-h-[220px]' : ''
      } ${className}`}
    >
      {/* Soft Loading Placeholder while the video buffers */}
      {showSoftPlaceholder && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[2] bg-gradient-to-br from-stone-200/80 via-stone-100/70 to-stone-200/80 dark:from-slate-800/80 dark:via-slate-900/70 dark:to-slate-800/80 animate-pulse pointer-events-none"
        />
      )}

      {/* Subtle top buffering shimmer bar when mid-stream buffering occurs */}
      {isBuffering && (isPosterLoaded || isVideoReady) && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-1 z-[4] bg-white/40 overflow-hidden pointer-events-none"
        >
          <div className="w-1/2 h-full bg-white/80 animate-pulse rounded-full" />
        </div>
      )}

      {/* Soft blurred, darkened copy of the same video or poster filling empty sides so there are no black bars */}
      {allowedToLoad && resolvedSrc && !hasError ? (
        <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
          <video
            ref={bgBlurVideoRef}
            src={resolvedSrc}
            poster={posterUrl}
            muted
            playsInline
            webkit-playsinline="true"
            loop
            preload={isActivePlayTarget ? 'auto' : 'metadata'}
            className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      ) : (
        posterUrl && (
          <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            <img
              src={posterUrl}
              alt=""
              className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )
      )}

      {/* First-frame poster image for off-screen videos & instant display before playback */}
      {posterUrl && (!isPlaying || !isVideoReady || !allowedToLoad) && (
        <img
          src={posterUrl}
          alt="Video preview"
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            setIsPosterLoaded(true);
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              if (!naturalSize) {
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }
              if (!videoAspectRatioCache.has(postId)) {
                const r = img.naturalWidth / img.naturalHeight;
                videoAspectRatioCache.set(postId, r);
                setNaturalRatio(r);
              }
            }
          }}
          style={mediaMaxResolutionStyle}
          className="relative z-[2] w-full h-full max-h-[80dvh] object-contain block pointer-events-none"
        />
      )}

      {/* Only mount & load the video stream when this video is in view or is the next one */}
      {allowedToLoad && resolvedSrc && !hasError ? (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={posterUrl}
          playsInline
          webkit-playsinline="true"
          preload={isActivePlayTarget ? 'auto' : 'metadata'}
          loop
          muted={isMuted}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsPlaying(true);
            setIsBuffering(false);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (
              bgBlurVideoRef.current &&
              videoRef.current &&
              Math.abs(bgBlurVideoRef.current.currentTime - videoRef.current.currentTime) > 0.4
            ) {
              bgBlurVideoRef.current.currentTime = videoRef.current.currentTime;
            }
          }}
          onError={() => {
            setHasError(true);
            setIsBuffering(false);
          }}
          style={mediaMaxResolutionStyle}
          className="relative z-[2] w-full h-full max-h-[80dvh] object-contain block"
        />
      ) : (
        /* If off-screen and no separate thumbnail image exists yet, render lightweight metadata poster frame */
        !posterUrl &&
        effectivePosterSrc && (
          <video
            src={effectivePosterSrc}
            preload="metadata"
            playsInline
            webkit-playsinline="true"
            muted
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                const exactRatio = vid.videoWidth / vid.videoHeight;
                videoAspectRatioCache.set(postId, exactRatio);
                setNaturalRatio(exactRatio);
                setNaturalSize({ width: vid.videoWidth, height: vid.videoHeight });
              }
              setIsPosterLoaded(true);
            }}
            onLoadedData={(e) => {
              captureFirstFramePosterIfNeeded(e.currentTarget);
              setIsPosterLoaded(true);
            }}
            style={mediaMaxResolutionStyle}
            className="relative z-[2] w-full h-full max-h-[80dvh] object-contain block pointer-events-none"
          />
        )
      )}

      {/* Single small speaker icon in the corner to unmute/mute */}
      <button
        type="button"
        onClick={handleToggleSound}
        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="absolute bottom-2 right-2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <span className="w-8 h-8 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-xs text-white flex items-center justify-center shadow-sm transition active:scale-95">
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </span>
      </button>
    </div>
  );
};
