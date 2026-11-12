import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Disc,
  RotateCcw,
} from 'lucide-react';
import { resolvePlayableAudioUrl } from '../utils/creatorStudioAudio';
import { EXCLUSIVE_AUDIO_EVENT } from './VideoPlayer';

export interface SongPlayerCardProps {
  title: string;
  artist: string;
  albumArt?: string;
  previewUrl: string;
  albumName?: string;
  compact?: boolean;
  autoPlayOnVisible?: boolean;
  defaultMuted?: boolean;
  startTime?: number;
  volume?: number;
}

// Global coordinator ensuring only ONE post plays audio at a time across the entire app
let activeGlobalAudio: HTMLAudioElement | null = null;
let stopActiveGlobalAudio: (() => void) | null = null;

export const SongPlayerCard: React.FC<SongPlayerCardProps> = ({
  title,
  artist,
  albumArt,
  previewUrl,
  compact = false,
  autoPlayOnVisible = true,
  defaultMuted = false,
  startTime = 0,
  volume = 85,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime || 0);
  const [duration, setDuration] = useState(30);
  const [isMuted, setIsMuted] = useState(defaultMuted);

  const audioInstanceId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const manuallyPausedRef = useRef<boolean>(false);
  const startOffset = Math.max(0, Number(startTime) || 0);
  const normalizedVolume = Math.max(0, Math.min(1, (Number(volume) || 85) / 100));
  const resolvedSrc = resolvePlayableAudioUrl(previewUrl);

  const getOrCreateAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current || audioRef.current.src !== resolvedSrc) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(resolvedSrc);
      audio.preload = 'metadata';
      audio.volume = normalizedVolume;
      audio.muted = isMuted;
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(audio.duration);
          if (startOffset > 0 && startOffset < audio.duration) {
            audio.currentTime = startOffset;
            setCurrentTime(startOffset);
          }
        }
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setHasEnded(true);
      };

      audio.onerror = () => {
        setIsPlaying(false);
      };
    } else {
      audioRef.current.volume = normalizedVolume;
    }
    return audioRef.current;
  }, [resolvedSrc, normalizedVolume, isMuted, startOffset]);

  // Sync volume & mute changes live
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = normalizedVolume;
      audioRef.current.muted = isMuted;
    }
  }, [normalizedVolume, isMuted]);

  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Listen to global exclusive audio events so if a video unmutes/plays audio, this music track pauses
  useEffect(() => {
    const handleOtherAudio = (e: Event) => {
      const custom = e as CustomEvent<{ id?: string }>;
      if (custom.detail?.id && custom.detail.id !== audioInstanceId) {
        pauseAudio();
      }
    };
    window.addEventListener(EXCLUSIVE_AUDIO_EVENT, handleOtherAudio);
    return () => {
      window.removeEventListener(EXCLUSIVE_AUDIO_EVENT, handleOtherAudio);
    };
  }, [audioInstanceId, pauseAudio]);

  const playAudio = useCallback(
    (fromReplay = false) => {
      const audio = getOrCreateAudio();

      // Stop any other post's audio (song or video) so only one post plays audio at a time
      if (activeGlobalAudio && activeGlobalAudio !== audio) {
        activeGlobalAudio.pause();
        if (stopActiveGlobalAudio) stopActiveGlobalAudio();
      }
      if (!audio.muted && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(EXCLUSIVE_AUDIO_EVENT, { detail: { id: audioInstanceId } })
        );
      }

      if (fromReplay || hasEnded || (audio.duration && audio.currentTime >= audio.duration - 0.2)) {
        const targetStart =
          audio.duration && startOffset < audio.duration ? startOffset : 0;
        try {
          audio.currentTime = targetStart;
          setCurrentTime(targetStart);
        } catch {
          // ignore
        }
        setHasEnded(false);
      }

      activeGlobalAudio = audio;
      stopActiveGlobalAudio = () => setIsPlaying(false);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setHasEnded(false);
          })
          .catch(() => {
            // If browser blocks unmuted autoplay before user interaction, fall back to muted autoplay with tap-to-unmute
            if (!audio.muted) {
              audio.muted = true;
              setIsMuted(true);
              audio
                .play()
                .then(() => {
                  setIsPlaying(true);
                  setHasEnded(false);
                })
                .catch(() => {
                  setIsPlaying(false);
                });
            }
          });
      }
    },
    [getOrCreateAudio, hasEnded, startOffset, audioInstanceId]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        if (activeGlobalAudio === audioRef.current) {
          activeGlobalAudio = null;
          stopActiveGlobalAudio = null;
        }
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Auto-play when post is > 60% on screen; pause when it scrolls away
  useEffect(() => {
    if (!autoPlayOnVisible || !cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (!manuallyPausedRef.current && !hasEnded) {
            playAudio(false);
          }
        } else {
          pauseAudio();
          manuallyPausedRef.current = false;
        }
      },
      {
        threshold: [0, 0.6, 0.85],
        rootMargin: '0px 0px -30px 0px',
      }
    );

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [autoPlayOnVisible, hasEnded, playAudio, pauseAudio]);

  const handleTogglePlayOrReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasEnded) {
      manuallyPausedRef.current = false;
      playAudio(true);
      return;
    }
    if (isPlaying) {
      manuallyPausedRef.current = true;
      pauseAudio();
    } else {
      manuallyPausedRef.current = false;
      playAudio(false);
    }
  };

  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    manuallyPausedRef.current = false;
    playAudio(true);
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
    if (!nextMuted && isPlaying && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(EXCLUSIVE_AUDIO_EVENT, { detail: { id: audioInstanceId } })
      );
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = getOrCreateAudio();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const total = duration > 0 ? duration : 30;
    const newTime = ratio * total;
    try {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
      if (hasEnded && newTime < total - 0.5) {
        setHasEnded(false);
      }
    } catch {
      // ignore
    }
  };

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={cardRef}
      className={`wavelink-inpost-player wavelink-glass-music-pill ${
        compact ? 'py-2 px-3' : 'py-2.5 px-3.5'
      } rounded-full transition-all ${
        isPlaying ? 'wavelink-glass-music-pill--playing' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Spinning Disc + Play/Pause Trigger */}
        <button
          type="button"
          onClick={handleTogglePlayOrReplay}
          aria-label={hasEnded ? 'Replay track' : isPlaying ? 'Pause track' : 'Play track'}
          className="relative w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white shadow-sm overflow-hidden"
        >
          {albumArt ? (
            <img
              src={albumArt}
              alt={title}
              className={`w-full h-full object-cover opacity-85 ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '5s' }}
            />
          ) : (
            <Disc
              size={18}
              className={`text-white/90 ${isPlaying ? 'animate-spin' : ''}`}
              style={{ animationDuration: '4s' }}
            />
          )}
          <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
            {hasEnded ? (
              <RotateCcw size={14} className="text-white" />
            ) : isPlaying ? (
              <Pause size={14} className="fill-white text-white" />
            ) : (
              <Play size={14} className="ml-0.5 fill-white text-white" />
            )}
          </span>
        </button>

        {/* Track Info + Thin Scrubbable Progress Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Disc
                size={13}
                className={`shrink-0 text-[var(--accent-primary)] ${
                  isPlaying ? 'animate-spin' : 'opacity-70'
                }`}
                style={{ animationDuration: '3s' }}
              />
              <p className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                {title}
                {artist ? (
                  <span className="font-semibold text-[var(--text-secondary)]"> · {artist}</span>
                ) : null}
              </p>
            </div>

            <span className="text-[10px] font-mono text-[var(--text-secondary)] tabular-nums shrink-0">
              {formatTime(currentTime)}
            </span>
          </div>

          {/* Scrubbable Progress Bar */}
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Audio progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            className="h-1.5 w-full bg-slate-200/70 dark:bg-white/15 rounded-full overflow-hidden cursor-pointer"
          >
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] rounded-full transition-all duration-150"
              style={{ width: `${hasEnded ? 100 : progressPercent}%` }}
            />
          </div>
        </div>

        {/* Dedicated Replay Pill Button */}
        <button
          type="button"
          onClick={handleReplay}
          aria-label="Replay track"
          title="Replay track from start"
          className={`min-h-[38px] px-2.5 rounded-full flex items-center gap-1 text-[11px] font-extrabold shrink-0 transition-transform active:scale-95 cursor-pointer ${
            hasEnded
              ? 'bg-[#0D9488] text-white shadow-xs'
              : 'bg-white/60 dark:bg-white/10 text-[var(--text-primary)] border border-white/40 dark:border-white/15 hover:border-[var(--accent-primary)]'
          }`}
        >
          <RotateCcw size={13} />
          <span className="hidden xs:inline">Replay</span>
        </button>

        {/* Mute / Unmute Button */}
        <button
          type="button"
          onClick={handleToggleMute}
          aria-label={isMuted ? 'Unmute music' : 'Mute music'}
          title={isMuted ? 'Tap to unmute' : 'Mute'}
          className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
            isMuted
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-400/40'
              : 'bg-white/60 dark:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-white/40 dark:border-white/15'
          }`}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </div>
  );
};

