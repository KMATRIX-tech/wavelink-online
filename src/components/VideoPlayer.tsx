import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolveVideoUrl } from '../utils/mediaStorage';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Loader2,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface VideoPlayerProps {
  postId: string;
  videoUrl?: string;
  hasVideoChunks?: boolean;
  thumbnailUrl?: string;
  className?: string;
  autoPlayOnVisible?: boolean;
  defaultMuted?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  postId,
  videoUrl,
  hasVideoChunks,
  thumbnailUrl,
  className = '',
  autoPlayOnVisible = true,
  defaultMuted = true
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(defaultMuted);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userPausedRef = useRef<boolean>(false);

  // 1. Resolve video source from cache, chunks or direct URL
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    resolveVideoUrl(postId, videoUrl, hasVideoChunks)
      .then((src) => {
        if (!isMounted) return;
        if (src) {
          setResolvedSrc(src);
        } else {
          setHasError(true);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error resolving video:', err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [postId, videoUrl, hasVideoChunks]);

  // 2. Play helper
  const playVideo = useCallback(() => {
    if (!videoRef.current) return;
    const playPromise = videoRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.log('Video autoplay prevented, fallback to muted or click:', err);
          // If unmuted autoplay blocked, mute and retry
          if (videoRef.current && !videoRef.current.muted) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });
    }
  }, []);

  // 3. Pause helper
  const pauseVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // 4. Toggle Play/Pause on user click
  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      userPausedRef.current = false;
      playVideo();
    } else {
      userPausedRef.current = true;
      pauseVideo();
    }
  };

  // 5. Toggle Mute / Sound
  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  // 6. Viewport IntersectionObserver: Autoplay when user reaches the post
  useEffect(() => {
    if (!autoPlayOnVisible || !containerRef.current || !resolvedSrc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          // User scrolled to and reached the video post
          if (!userPausedRef.current) {
            playVideo();
          }
        } else {
          // User scrolled away -> pause video to save CPU
          pauseVideo();
          // Reset manual pause on scroll-out
          userPausedRef.current = false;
        }
      },
      {
        threshold: 0.5, // 50% visible in screen
        rootMargin: '0px 0px -40px 0px'
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [autoPlayOnVisible, resolvedSrc, playVideo, pauseVideo]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const total = videoRef.current.duration || 1;
    setCurrentTime(current);
    setProgress((current / total) * 100);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pos * (videoRef.current.duration || 0);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  if (isLoading) {
    return (
      <div className={`aspect-video w-full rounded-2xl bg-slate-900 border border-slate-200 flex flex-col items-center justify-center text-white/90 ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6] mb-2" />
        <span className="text-xs font-semibold">Loading video from Firestore...</span>
        <span className="text-[10px] text-slate-400 mt-0.5">Assembling high-definition stream</span>
      </div>
    );
  }

  if (hasError || !resolvedSrc) {
    return (
      <div className={`aspect-video w-full rounded-2xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-500 p-4 ${className}`}>
        <p className="text-xs font-bold text-slate-700">Video stream unavailable</p>
        <span className="text-[10px] text-slate-500 mt-1">Re-upload or refresh to view</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 group select-none shadow-sm border border-slate-200/80 ${className}`}
    >
      {/* HTML5 Video element with inline support */}
      <video
        ref={videoRef}
        src={resolvedSrc}
        poster={thumbnailUrl}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
        loop
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer bg-slate-950"
      />

      {/* Floating Big Play Button when paused */}
      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-purple-600/90 hover:bg-purple-600 text-white flex items-center justify-center shadow-2xl backdrop-blur-xs hover:scale-110 active:scale-95 transition-transform z-10"
          title="Play video"
        >
          <Play size={28} className="ml-1 fill-white" />
        </button>
      )}

      {/* Floating Sound / Unmute Pill Badge */}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-3 right-3 px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5 z-10 transition shadow-lg active:scale-95"
        title={isMuted ? 'Click to Unmute' : 'Click to Mute'}
      >
        {isMuted ? (
          <>
            <VolumeX size={14} className="text-rose-400" />
            <span className="hidden sm:inline">Tap for sound</span>
          </>
        ) : (
          <>
            <Volume2 size={14} className="text-emerald-400" />
            <span className="hidden sm:inline">Sound on</span>
          </>
        )}
      </button>

      {/* Auto-playing indicator badge */}
      {isPlaying && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1 pointer-events-none opacity-80 group-hover:opacity-100 transition">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Playing</span>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 opacity-95 group-hover:opacity-100 transition-opacity z-10">
        {/* Scrubbable Progress Bar */}
        <div
          onClick={handleSeek}
          className="w-full h-1.5 bg-white/30 hover:h-2.5 rounded-full cursor-pointer relative transition-all"
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1 text-white hover:text-purple-300 transition active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={17} /> : <Play size={17} className="fill-white ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="p-1 text-white hover:text-purple-300 transition active:scale-95"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={17} className="text-rose-400" /> : <Volume2 size={17} />}
            </button>

            {/* Time display */}
            <span className="text-[10px] font-mono text-gray-300 tabular-numbers">
              {Math.floor(currentTime)}s / {Math.floor(duration || 0)}s
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1 text-white hover:text-purple-300 transition active:scale-95"
            title="Fullscreen"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
