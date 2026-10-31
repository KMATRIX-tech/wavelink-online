import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Music,
  Volume2,
  VolumeX,
  Disc,
  Radio,
  Sparkles
} from 'lucide-react';

interface SongPlayerCardProps {
  title: string;
  artist: string;
  albumArt?: string;
  previewUrl: string;
  albumName?: string;
  compact?: boolean;
  autoPlayOnVisible?: boolean;
}

// Global active audio coordinator so only one soundtrack plays at a time across the entire app
let activeGlobalAudio: HTMLAudioElement | null = null;
let stopActiveGlobalAudio: (() => void) | null = null;

export const SongPlayerCard: React.FC<SongPlayerCardProps> = ({
  title,
  artist,
  albumArt,
  previewUrl,
  albumName,
  compact = false,
  autoPlayOnVisible = true
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayTriggered, setIsAutoplayTriggered] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const manuallyPausedRef = useRef<boolean>(false);

  // Initialize or get the audio element
  const getOrCreateAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio(previewUrl);
      audio.preload = 'auto';
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
        if (audio.duration && !isNaN(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.onerror = (e) => {
        console.warn('Audio stream error:', e);
        setIsPlaying(false);
      };
    }
    return audioRef.current;
  }, [previewUrl]);

  // Play audio helper with global coordinator
  const playAudio = useCallback(() => {
    const audio = getOrCreateAudio();

    if (activeGlobalAudio && activeGlobalAudio !== audio) {
      activeGlobalAudio.pause();
      if (stopActiveGlobalAudio) stopActiveGlobalAudio();
    }

    activeGlobalAudio = audio;
    stopActiveGlobalAudio = () => setIsPlaying(false);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.log('Autoplay waiting for user gesture or policy:', err);
          // If browser blocked unmuted autoplay before any gesture on the page,
          // listen for the first touch/click anywhere on document and resume immediately!
          const unlockHandler = () => {
            if (!manuallyPausedRef.current && audioRef.current) {
              audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
            window.removeEventListener('click', unlockHandler);
            window.removeEventListener('touchstart', unlockHandler);
          };
          window.addEventListener('click', unlockHandler, { once: true });
          window.addEventListener('touchstart', unlockHandler, { once: true });
        });
    }
  }, [getOrCreateAudio]);

  // Pause audio helper
  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (activeGlobalAudio === audioRef.current) {
        activeGlobalAudio = null;
        stopActiveGlobalAudio = null;
      }
    };
  }, []);

  // IntersectionObserver: when user scrolls and reaches this post, automatically play the song!
  useEffect(() => {
    if (!autoPlayOnVisible || !cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          // User reached the post
          setIsAutoplayTriggered(true);
          if (!manuallyPausedRef.current) {
            playAudio();
          }
        } else {
          // User scrolled away from post -> pause automatically so songs don't collide
          pauseAudio();
          // Reset manual pause flag when scrolling out so when they come back later it plays again
          manuallyPausedRef.current = false;
        }
      },
      {
        threshold: 0.5, // Triggers when at least 50% of the post/song card is visible in viewport
        rootMargin: '0px 0px -50px 0px'
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [autoPlayOnVisible, playAudio, pauseAudio]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      manuallyPausedRef.current = true;
      pauseAudio();
    } else {
      manuallyPausedRef.current = false;
      playAudio();
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * (duration || 30);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (compact) {
    return (
      <div
        ref={cardRef}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 shadow-2xs"
      >
        <button
          type="button"
          onClick={handleTogglePlay}
          className="w-6 h-6 rounded-full bg-[#3B82F6] text-white flex items-center justify-center shrink-0 hover:bg-blue-600 transition active:scale-95"
        >
          {isPlaying ? <Pause size={10} /> : <Play size={10} className="ml-0.5 fill-white" />}
        </button>
        <span className="text-xs font-bold text-[#0F172A] dark:text-blue-200 truncate max-w-[140px]">
          {title}
        </span>
        <span className="text-[10px] text-[#3B82F6] dark:text-blue-400 truncate max-w-[90px]">
          • {artist}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-4 bg-[#F8FAFC] dark:bg-slate-900/60 border transition duration-300 ${
        isPlaying
          ? 'border-[#3B82F6] shadow-md shadow-blue-500/10'
          : 'border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-blue-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Album Art & Spinning Disc */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-900 shadow-sm">
            {albumArt ? (
              <img
                src={albumArt}
                alt={title}
                className={`w-full h-full object-cover transition-transform duration-500 ${
                  isPlaying ? 'scale-105' : ''
                }`}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-[#3B82F6] to-[#10B981] flex items-center justify-center text-white">
                <Music size={20} />
              </div>
            )}

            {/* Spinning Disc Indicator */}
            <div
              className={`absolute inset-0 bg-black/35 flex items-center justify-center pointer-events-none transition-opacity ${
                isPlaying ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Disc size={20} className="text-white/90 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          {/* Song Details & Animated Equalizer */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6] flex items-center gap-1">
                <Music size={11} />
                <span>Track Soundtrack</span>
              </span>

              {isPlaying && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[#10B981] border border-emerald-200 text-[9px] font-extrabold animate-pulse">
                  <Radio size={9} />
                  <span>Now Playing</span>
                </span>
              )}
            </div>

            <h4 className="text-xs sm:text-sm font-black text-[#0F172A] dark:text-white truncate mt-0.5">
              {title}
            </h4>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-gray-300 truncate">
              {artist}
              {albumName && <span className="text-slate-400 font-normal"> • {albumName}</span>}
            </p>
          </div>
        </div>

        {/* Right: Audio Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleMute}
            className="p-1.5 rounded-xl text-slate-400 hover:text-[#3B82F6] hover:bg-white dark:hover:bg-gray-800 transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={15} className="text-rose-500" /> : <Volume2 size={15} />}
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition shadow-md active:scale-95 ${
              isPlaying
                ? 'bg-[#10B981] hover:bg-emerald-600 text-white shadow-emerald-500/25'
                : 'bg-[#3B82F6] hover:bg-blue-600 text-white shadow-blue-500/25'
            }`}
            title={isPlaying ? 'Pause song' : 'Play online soundtrack'}
          >
            {isPlaying ? (
              <Pause size={17} />
            ) : (
              <Play size={17} className="fill-white ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Interactive Progress Timeline */}
      <div
        onClick={handleSeek}
        className="mt-2.5 h-1.5 w-full bg-slate-200 dark:bg-gray-700/80 rounded-full overflow-hidden cursor-pointer relative group"
        title="Seek soundtrack"
      >
        <div
          className="h-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] rounded-full transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-1 tabular-numbers">
        <span>0:{Math.floor(currentTime).toString().padStart(2, '0')}</span>
        <span className="flex items-center gap-1">
          <Sparkles size={9} className="text-[#3B82F6]" />
          <span>Auto-plays as you reach post</span>
        </span>
      </div>
    </div>
  );
};
