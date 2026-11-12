import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolveVideoUrl } from '../utils/mediaStorage';
import {
  useDataSaver,
  shouldBlockVideoAutoplay,
  getOptimizedVideoUrl,
  getOptimizedImagePreviewUrl
} from '../services/dataSaverService';
import { useLanguage } from '../context/LanguageContext';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Sparkles,
  MoreHorizontal
} from 'lucide-react';
import { Avatar } from './Avatar';

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
  // Optional glass overlays inside the floating media frame
  authorName?: string;
  authorPhotoURL?: string;
  authorId?: string;
  onAuthorClick?: () => void;
  onOpenMoreMenu?: (e: React.MouseEvent) => void;
  onOpenAiInfo?: (e: React.MouseEvent) => void;
  showGlassOverlays?: boolean;
  showStatus?: boolean;
}

const SOUND_PREF_STORAGE_KEY = 'wavelink_feed_video_sound_pref';
const SOUND_PREF_EVENT = 'wavelink:video-sound-pref';
export const EXCLUSIVE_AUDIO_EVENT = 'wavelink:exclusive-audio-play';

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
 * 1. Strictly ONLY ONE video plays at a time (the one > 60% on screen or manually tapped).
 * 2. Off-screen videos are lazy-loaded (only the video in view and immediate next one load metadata/stream;
 *    all other off-screen videos show their thumbnail first).
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

  // 1. Find the best visible candidate where more than 60% of the video is on screen (ratio >= 0.6)
  let bestVisibleIndex = -1;
  let bestRatio = 0;
  let bestDistanceToCenter = Infinity;

  entries.forEach((item, idx) => {
    const { entry, rect } = item;
    if (!rect) return;
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - viewportCenter);

    if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
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

  // 2. If no video is >= 60% visible yet, find the one closest to the viewport center for metadata preloading
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

  // 3. Lazy-load off-screen videos: only allow the current visible video and immediate next one to load
  entries.forEach((item, idx) => {
    const isCurrentOrNext =
      primaryLoadIndex !== -1 && (idx === primaryLoadIndex || idx === primaryLoadIndex + 1);
    item.entry.setAllowedToLoad(isCurrentOrNext);
  });

  // 4. Enforce single active playing video
  const blockAutoplay = shouldBlockVideoAutoplay();
  const nextActiveInstanceId =
    !blockAutoplay && bestVisibleIndex !== -1 ? entries[bestVisibleIndex].entry.instanceId : null;

  activePlayingInstanceId = nextActiveInstanceId;

  entries.forEach((item, idx) => {
    const isTarget =
      !blockAutoplay &&
      idx === bestVisibleIndex &&
      item.entry.autoPlayOnVisible &&
      !item.entry.userPaused;
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

function formatCompactTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  postId,
  videoUrl,
  hasVideoChunks,
  thumbnailUrl,
  duration: initialDuration,
  videoWidth,
  videoHeight,
  aspectRatio,
  className = '',
  autoPlayOnVisible = true,
  defaultMuted = true,
  authorName,
  authorPhotoURL,
  authorId,
  onAuthorClick,
  onOpenMoreMenu,
  onOpenAiInfo,
  showGlassOverlays = false,
  showStatus = true
}) => {
  const instanceIdRef = useRef<string>(
    `vp_${postId}_${Math.random().toString(36).substring(2, 8)}`
  );

  const [naturalRatio, setNaturalRatio] = useState<number | null>(() =>
    parseInitialAspectRatio(postId, videoWidth, videoHeight, aspectRatio)
  );

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(() =>
    videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0
      ? { width: videoWidth, height: videoHeight }
      : null
  );

  const [posterUrl, setPosterUrl] = useState<string | undefined>(
    () => thumbnailUrl || firstFramePosterCache.get(postId)
  );
  const [isPosterLoaded, setIsPosterLoaded] = useState<boolean>(false);

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
  const [hasEnded, setHasEnded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(initialDuration || 0);

  // Floating glass controls visibility: fade out after 2.5 seconds of playback, show on tap
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const controlsFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { enabled: isDataSaverOn, blockAutoplay } = useDataSaver();
  const { t, language } = useLanguage();

  const [isMuted, setIsMuted] = useState<boolean>(() =>
    getRememberedSoundMuted(defaultMuted)
  );
  const [userManuallyStarted, setUserManuallyStarted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgBlurVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userPausedRef = useRef<boolean>(false);

  const scheduleControlsFadeOut = useCallback(() => {
    if (controlsFadeTimerRef.current) {
      clearTimeout(controlsFadeTimerRef.current);
      controlsFadeTimerRef.current = null;
    }
    controlsFadeTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        setControlsVisible(false);
      }
    }, 2500);
  }, []);

  const revealControlsWithTimer = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsFadeOut();
  }, [scheduleControlsFadeOut]);

  useEffect(() => {
    return () => {
      if (controlsFadeTimerRef.current) {
        clearTimeout(controlsFadeTimerRef.current);
      }
    };
  }, []);

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

  // Listen for sound preference changes & exclusive audio coordinator events
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

    const handleExclusiveAudio = (e: Event) => {
      const custom = e as CustomEvent<{ sourceId?: string }>;
      if (custom.detail?.sourceId && custom.detail.sourceId !== instanceIdRef.current) {
        // Another post started playing audio; mute or pause this video's audio so only 1 post plays audio at a time
        if (videoRef.current && !videoRef.current.muted) {
          videoRef.current.muted = true;
          setIsMuted(true);
        }
      }
    };

    window.addEventListener(SOUND_PREF_EVENT, handleSoundPrefChange);
    window.addEventListener(EXCLUSIVE_AUDIO_EVENT, handleExclusiveAudio);
    return () => {
      window.removeEventListener(SOUND_PREF_EVENT, handleSoundPrefChange);
      window.removeEventListener(EXCLUSIVE_AUDIO_EVENT, handleExclusiveAudio);
    };
  }, []);

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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          if (dataUrl && dataUrl.startsWith('data:image/') && dataUrl.length > 512) {
            firstFramePosterCache.set(postId, dataUrl);
            setPosterUrl(dataUrl);
          }
        }
      } catch {
        // Cross-origin canvas fallback
      }
    },
    [postId, posterUrl]
  );

  const pauseVideo = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    if (bgBlurVideoRef.current && !bgBlurVideoRef.current.paused) {
      bgBlurVideoRef.current.pause();
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setControlsVisible(true);
  }, []);

  const playVideo = useCallback(
    (fromReplay = false) => {
      const vid = videoRef.current;
      if (!vid) return;

      if (fromReplay || vid.ended || hasEnded) {
        try {
          vid.currentTime = 0;
          setCurrentTime(0);
        } catch {
          // ignore
        }
        setHasEnded(false);
      }

      const preferredMuted = getRememberedSoundMuted(true);
      const shouldTryUnmuted = !preferredMuted && hasUserSelectedUnmuteInSession;
      vid.muted = !shouldTryUnmuted;
      setIsMuted(vid.muted);

      if (!vid.muted) {
        window.dispatchEvent(
          new CustomEvent(EXCLUSIVE_AUDIO_EVENT, {
            detail: { sourceId: instanceIdRef.current }
          })
        );
      }

      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setHasEnded(false);
            setIsBuffering(false);
            scheduleControlsFadeOut();
            if (bgBlurVideoRef.current) {
              bgBlurVideoRef.current.currentTime = vid.currentTime;
              bgBlurVideoRef.current.play().catch(() => {});
            }
          })
          .catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current
                .play()
                .then(() => {
                  setIsPlaying(true);
                  setHasEnded(false);
                  setIsBuffering(false);
                  scheduleControlsFadeOut();
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
    },
    [hasEnded, scheduleControlsFadeOut]
  );

  // Register with the feed video coordinator and observe >60% viewport visibility
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

        // Pause when scrolled away (< 0.25 visible)
        if (!obsEntry.isIntersecting || obsEntry.intersectionRatio < 0.25) {
          userPausedRef.current = false;
          reg.userPaused = false;
          pauseVideo();
        }

        scheduleCoordinatorEvaluation();
      },
      {
        threshold: [0, 0.25, 0.45, 0.6, 0.75, 0.9],
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
      setResolvedSrc(getOptimizedVideoUrl(videoUrl, isDataSaverOn));
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
          setResolvedSrc(getOptimizedVideoUrl(src, isDataSaverOn));
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
  }, [allowedToLoad, postId, videoUrl, hasVideoChunks, isDataSaverOn]);

  // Start or pause playback whenever coordinator marks this video as the active play target
  useEffect(() => {
    if (isActivePlayTarget && allowedToLoad && resolvedSrc && !userPausedRef.current && !hasEnded) {
      playVideo(false);
    } else if (!isActivePlayTarget) {
      pauseVideo();
    }
  }, [isActivePlayTarget, allowedToLoad, resolvedSrc, hasEnded, playVideo, pauseVideo]);

  // Tap on video surface: if controls are hidden, reveal them and start 2.5s fade timer;
  // if controls are visible, toggle play/pause (or replay if ended)
  const handleVideoSurfaceTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const instanceId = instanceIdRef.current;
    const reg = registeredPlayers.get(instanceId);
    setUserManuallyStarted(true);

    if (!controlsVisible && isPlaying && !hasEnded) {
      revealControlsWithTimer();
      return;
    }

    if (!allowedToLoad) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      revealControlsWithTimer();
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;

    if (hasEnded || vid.ended) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      playVideo(true);
      revealControlsWithTimer();
      return;
    }

    if (vid.paused) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      playVideo(false);
      revealControlsWithTimer();
    } else {
      userPausedRef.current = true;
      if (reg) reg.userPaused = true;
      pauseVideo();
      setControlsVisible(true);
    }
  };

  const handleTogglePlayPauseButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    const instanceId = instanceIdRef.current;
    const reg = registeredPlayers.get(instanceId);
    setUserManuallyStarted(true);

    if (!allowedToLoad) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      revealControlsWithTimer();
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;

    if (hasEnded || vid.ended) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      playVideo(true);
      revealControlsWithTimer();
      return;
    }

    if (vid.paused) {
      userPausedRef.current = false;
      if (reg) reg.userPaused = false;
      notifyManualPlay(instanceId);
      playVideo(false);
      revealControlsWithTimer();
    } else {
      userPausedRef.current = true;
      if (reg) reg.userPaused = true;
      pauseVideo();
      setControlsVisible(true);
    }
  };

  const handleReplayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const instanceId = instanceIdRef.current;
    const reg = registeredPlayers.get(instanceId);
    userPausedRef.current = false;
    if (reg) reg.userPaused = false;
    notifyManualPlay(instanceId);
    playVideo(true);
    revealControlsWithTimer();
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setRememberedSoundMuted(nextMuted);
    revealControlsWithTimer();

    if (!nextMuted) {
      window.dispatchEvent(
        new CustomEvent(EXCLUSIVE_AUDIO_EVENT, {
          detail: { sourceId: instanceIdRef.current }
        })
      );
    }

    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current.paused && !userPausedRef.current) {
        notifyManualPlay(instanceIdRef.current);
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const total = vid.duration && Number.isFinite(vid.duration) ? vid.duration : videoDuration || 30;
    const targetTime = ratio * total;
    try {
      vid.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (bgBlurVideoRef.current) {
        bgBlurVideoRef.current.currentTime = targetTime;
      }
      if (hasEnded && targetTime < total - 0.3) {
        setHasEnded(false);
      }
    } catch {
      // ignore seek errors
    }
    revealControlsWithTimer();
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
    if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
      setVideoDuration(vid.duration);
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

  const rawPosterSrc =
    posterUrl ||
    (!allowedToLoad &&
    resolvedSrc &&
    (resolvedSrc.startsWith('https://') || resolvedSrc.startsWith('http://'))
      ? `${resolvedSrc}#t=0.001`
      : undefined);
  const effectivePosterSrc = rawPosterSrc
    ? getOptimizedImagePreviewUrl(rawPosterSrc, isDataSaverOn, userManuallyStarted)
    : undefined;

  const showSoftPlaceholder =
    (!isVideoReady && !isPosterLoaded) || (isBuffering && !isPlaying && !isPosterLoaded);

  const mediaMaxResolutionStyle: React.CSSProperties | undefined = naturalSize
    ? {
        maxWidth: `min(100%, ${naturalSize.width}px)`,
        maxHeight: `min(78dvh, ${naturalSize.height}px)`
      }
    : undefined;

  const effectiveDuration =
    videoDuration > 0
      ? videoDuration
      : initialDuration && initialDuration > 0
      ? initialDuration
      : 0;
  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0;

  return (
    <div
      ref={containerRef}
      onClick={handleVideoSurfaceTap}
      style={{
        aspectRatio: naturalRatio ? String(naturalRatio) : undefined,
        maxHeight: '78dvh',
      }}
      className={`wavelink-glass-media-frame relative w-full max-h-[78dvh] rounded-[28px] overflow-hidden bg-[#090D16] flex items-center justify-center select-none cursor-pointer ${
        !naturalRatio ? 'min-h-[240px]' : ''
      } ${className}`}
    >
      {/* Top-Left & Top-Right Glass Overlays inside the floating media frame */}
      {showGlassOverlays && (
        <div
          className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          {authorName && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick?.();
              }}
              className="wavelink-glass-overlay-pill pointer-events-auto min-h-[42px] pl-1.5 pr-3.5 py-1 rounded-full flex items-center gap-2 text-white shadow-md transition-transform active:scale-96 cursor-pointer max-w-[74%]"
              title={authorName}
            >
              <Avatar
                uid={authorId}
                src={
                  authorPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${authorId || authorName}`
                }
                alt={authorName}
                fallbackName={authorName}
                size={28}
                showStatus={showStatus}
                className="shrink-0"
              />
              <span className="text-xs sm:text-sm font-bold tracking-tight text-white truncate drop-shadow-xs">
                {authorName}
              </span>
            </button>
          )}

          {onOpenMoreMenu && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMoreMenu(e);
              }}
              aria-label="More options"
              title="More options"
              className="wavelink-glass-overlay-pill pointer-events-auto min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-transform active:scale-96 cursor-pointer ml-auto"
            >
              <MoreHorizontal size={18} />
            </button>
          )}
        </div>
      )}

      {/* Soft Loading Placeholder while the video buffers */}
      {showSoftPlaceholder && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[2] bg-gradient-to-br from-slate-800/80 via-slate-900/70 to-slate-800/80 animate-pulse pointer-events-none"
        />
      )}

      {/* Subtle top buffering shimmer bar when mid-stream buffering occurs */}
      {isBuffering && (isPosterLoaded || isVideoReady) && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-1 z-[4] bg-white/30 overflow-hidden pointer-events-none"
        >
          <div className="w-1/2 h-full bg-white/85 animate-pulse rounded-full" />
        </div>
      )}

      {/* Soft blurred background copy of the same video or poster filling empty sides */}
      {allowedToLoad && resolvedSrc && !hasError ? (
        <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
          <video
            ref={bgBlurVideoRef}
            src={resolvedSrc}
            poster={posterUrl}
            muted
            playsInline
            webkit-playsinline="true"
            preload="metadata"
            className="w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      ) : (
        posterUrl && (
          <div aria-hidden="true" className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            <img
              src={posterUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )
      )}

      {/* First-frame poster image for off-screen videos & instant display before playback */}
      {posterUrl && (!isPlaying || !isVideoReady || !allowedToLoad) && (
        <img
          src={posterUrl}
          alt="Video thumbnail preview"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
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
          className="relative z-[2] w-full h-full max-h-[78dvh] object-contain block pointer-events-none"
        />
      )}

      {/* Only mount & load the video stream when this video is in view or is the immediate next one */}
      {allowedToLoad && resolvedSrc && !hasError ? (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={posterUrl}
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          muted={isMuted}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsPlaying(true);
            setHasEnded(false);
            setIsBuffering(false);
            scheduleControlsFadeOut();
          }}
          onPlay={() => {
            setIsPlaying(true);
            setHasEnded(false);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setHasEnded(true);
            setControlsVisible(true);
            if (bgBlurVideoRef.current) {
              bgBlurVideoRef.current.pause();
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              if (
                videoRef.current.duration &&
                Number.isFinite(videoRef.current.duration) &&
                videoRef.current.duration > 0
              ) {
                setVideoDuration(videoRef.current.duration);
              }
              if (
                bgBlurVideoRef.current &&
                Math.abs(bgBlurVideoRef.current.currentTime - videoRef.current.currentTime) > 0.4
              ) {
                bgBlurVideoRef.current.currentTime = videoRef.current.currentTime;
              }
            }
          }}
          onError={() => {
            setHasError(true);
            setIsBuffering(false);
          }}
          style={mediaMaxResolutionStyle}
          className="relative z-[2] w-full h-full max-h-[78dvh] object-contain block"
        />
      ) : (
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
            className="relative z-[2] w-full h-full max-h-[78dvh] object-contain block pointer-events-none"
          />
        )
      )}

      {/* Center Replay Glass Pill when video ends */}
      {hasEnded && (
        <div className="absolute inset-0 z-[12] flex items-center justify-center bg-black/35 pointer-events-none">
          <button
            type="button"
            onClick={handleReplayClick}
            className="wavelink-glass-overlay-pill pointer-events-auto min-h-[48px] px-5 py-2.5 rounded-full text-white font-extrabold text-sm flex items-center gap-2 shadow-xl transition-transform active:scale-96 cursor-pointer"
          >
            <RotateCcw size={17} />
            <span>{language === 'sw' ? 'Cheza Tena' : 'Replay'}</span>
          </button>
        </div>
      )}

      {/* Data Saver / Mobile Data Tap-to-Play Overlay when autoplay is paused to save data */}
      {!isPlaying && !hasEnded && (blockAutoplay || isDataSaverOn) && (
        <div className="absolute inset-0 z-[8] flex flex-col items-center justify-center bg-black/25 pointer-events-none">
          <div className="wavelink-glass-overlay-pill w-13 h-13 rounded-full text-white flex items-center justify-center shadow-lg mb-2">
            <Play size={22} className="ml-0.5 fill-white" />
          </div>
          <span className="wavelink-glass-overlay-pill inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-white text-xs font-bold">
            <Zap size={12} className="text-teal-300" />
            <span>{t('datasaver.videoTapToPlay')}</span>
          </span>
        </div>
      )}

      {/* Bottom-Left "AI info" Glass Pill (with slow 6-8s gentle float) */}
      {showGlassOverlays && onOpenAiInfo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAiInfo(e);
          }}
          aria-label="Open WELINK AI info summary"
          className={`wavelink-glass-overlay-pill wavelink-float-gentle absolute left-3 z-20 min-h-[38px] px-3.5 py-1.5 rounded-full text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition-all duration-300 active:scale-96 cursor-pointer ${
            controlsVisible || !isPlaying || hasEnded ? 'bottom-16' : 'bottom-3.5'
          }`}
        >
          <Sparkles size={13} className="text-amber-300 shrink-0" />
          <span>AI info</span>
        </button>
      )}

      {/* Floating Glass Control Bar inside the video (Play/Pause, Thin Progress Bar, Mute/Unmute, Replay when ended)
          Fades out after 2.5 seconds of playback; shows on tap */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`wavelink-glass-video-controls absolute left-3 right-3 bottom-3 z-20 rounded-full px-2.5 py-1.5 flex items-center gap-2.5 text-white transition-all duration-300 ${
          controlsVisible || !isPlaying || hasEnded
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-1.5 pointer-events-none'
        }`}
      >
        {/* Play / Pause / Replay Button */}
        <button
          type="button"
          onClick={handleTogglePlayPauseButton}
          aria-label={hasEnded ? 'Replay video' : isPlaying ? 'Pause video' : 'Play video'}
          className="min-w-[38px] min-h-[38px] w-9 h-9 rounded-full bg-white/18 hover:bg-white/28 flex items-center justify-center text-white shrink-0 transition-transform active:scale-95 cursor-pointer"
        >
          {hasEnded ? (
            <RotateCcw size={15} />
          ) : isPlaying ? (
            <Pause size={15} className="fill-white" />
          ) : (
            <Play size={15} className="ml-0.5 fill-white" />
          )}
        </button>

        {/* Thin Interactive Progress Bar */}
        <div
          onClick={handleSeekBarClick}
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDuration || 100)}
          aria-valuenow={Math.round(currentTime)}
          className="flex-1 h-6 flex items-center cursor-pointer group/seek"
        >
          <div className="w-full h-1.5 group-hover/seek:h-2 rounded-full bg-white/28 overflow-hidden transition-all relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#60A5FA] via-[#2DD4BF] to-[#FFFFFF] transition-all duration-150"
              style={{ width: `${hasEnded ? 100 : progressPercent}%` }}
            />
          </div>
        </div>

        {/* Compact Time or Replay Label */}
        {hasEnded ? (
          <button
            type="button"
            onClick={handleReplayClick}
            className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-extrabold text-white shrink-0 transition-transform active:scale-95 cursor-pointer"
          >
            {language === 'sw' ? 'Rudia' : 'Replay'}
          </button>
        ) : (
          effectiveDuration > 0 && (
            <span className="text-[11px] font-mono font-semibold text-white/90 tabular-nums shrink-0">
              {formatCompactTime(currentTime)}
            </span>
          )
        )}

        {/* Mute / Unmute Button */}
        <button
          type="button"
          onClick={handleToggleSound}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          title={isMuted ? 'Unmute' : 'Mute'}
          className="min-w-[38px] min-h-[38px] w-9 h-9 rounded-full bg-white/18 hover:bg-white/28 flex items-center justify-center text-white shrink-0 transition-transform active:scale-95 cursor-pointer"
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </div>
  );
};
