import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Disc,
  RotateCcw,
} from 'lucide-react';
import { resolvePlayableAudioUrl } from '../utils/creatorStudioAudio';

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

  const playAudio = useCallback(
    (fromReplay = false) => {
      const audio = getOrCreateAudio();

      // Stop any other post's audio so only one post plays at a time
      if (activeGlobalAudio && activeGlobalAudio !== audio) {
        activeGlobalAudio.pause();
        if (stopActiveGlobalAudio) stopActiveGlobalAudio();
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
    [getOrCreateAudio, hasEnded, startOffset]
  );

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

  // Auto-play when post scrolls into view; pause when it scrolls away
  useEffect(() => {
    if (!autoPlayOnVisible || !cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          if (!manuallyPausedRef.current && !hasEnded) {
            playAudio(false);
          }
        } else {
          pauseAudio();
          manuallyPausedRef.current = false;
        }
      },
      {
        threshold: 0.55,
        rootMargin: '0px 0px -40px 0px',
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

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
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
      className={`wavelink-inpost-player ${
        compact ? 'py-2 px-3' : 'py-2.5 px-3.5'
      } rounded-2xl bg-[#FAF7F2] border transition-all ${
        isPlaying
          ? 'border-[#2563EB]/60 shadow-2xs'
          : 'border-[#EFECE6] hover:border-[#2563EB]/30'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Play / Pause / Replay Button (>=44px touch target) */}
        <button
          type="button"
          onClick={handleTogglePlayOrReplay}
          aria-label={hasEnded ? 'Replay track' : isPlaying ? 'Pause track' : 'Play track'}
          className={`min-h-[44px] ${
            hasEnded ? 'px-3.5 gap-1.5' : 'min-w-[44px] w-11'
          } rounded-xl flex items-center justify-center shrink-0 font-bold text-xs transition active:scale-95 cursor-pointer ${
            hasEnded
              ? 'bg-[#0D9488] hover:bg-teal-700 text-white shadow-2xs'
              : isPlaying
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'bg-white border border-[#EFECE6] text-[#1C1917] hover:border-[#2563EB]'
          }`}
        >
          {hasEnded ? (
            <>
              <RotateCcw size={15} />
              <span>Replay</span>
            </>
          ) : isPlaying ? (
            <Pause size={16} />
          ) : (
            <Play size={16} className="ml-0.5 fill-current" />
          )}
        </button>

        {/* Spinning Disc + Track Info + Progress Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative w-6 h-6 rounded-full overflow-hidden shrink-0 bg-slate-900 flex items-center justify-center border border-[#EFECE6]">
                {albumArt ? (
                  <img
                    src={albumArt}
                    alt={title}
                    className={`w-full h-full object-cover ${
                      isPlaying ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: '4s' }}
                  />
                ) : (
                  <Disc
                    size={14}
                    className={`text-[#2563EB] ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                  />
                )}
              </div>
              <Disc
                size={14}
                className={`shrink-0 text-[#2563EB] ${isPlaying ? 'animate-spin' : 'opacity-60'}`}
                style={{ animationDuration: '3s' }}
              />
              <p className="text-xs font-bold text-[#1C1917] truncate">
                {title}
                {artist ? (
                  <span className="font-medium text-[#57534E]"> · {artist}</span>
                ) : null}
              </p>
            </div>

            <span className="text-[11px] font-mono text-[#78716C] tabular-nums shrink-0">
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
            className="h-1.5 w-full bg-[#EFECE6] rounded-full overflow-hidden cursor-pointer"
          >
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] rounded-full transition-all duration-150"
              style={{ width: `${hasEnded ? 100 : progressPercent}%` }}
            />
          </div>
        </div>

        {/* Mute / Unmute Button (>=44px touch target) */}
        <button
          type="button"
          onClick={handleToggleMute}
          aria-label={isMuted ? 'Unmute music' : 'Mute music'}
          title={isMuted ? 'Tap to unmute' : 'Mute'}
          className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer ${
            isMuted
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'text-[#57534E] hover:text-[#1C1917] hover:bg-white'
          }`}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );
};
