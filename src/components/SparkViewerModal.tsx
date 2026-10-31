import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Spark } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { resolveVideoUrl } from '../utils/mediaStorage';
import {
  X,
  Flame,
  Zap,
  Clock,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Trash2,
  Heart,
  ChevronLeft,
  ChevronRight,
  Disc,
  Music,
  Share2,
  Check
} from 'lucide-react';

interface SparkViewerModalProps {
  sparks: Spark[];
  initialIndex?: number;
  onClose: () => void;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

export const SparkViewerModal: React.FC<SparkViewerModalProps> = ({
  sparks,
  initialIndex = 0,
  onClose
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);

  // Floating reaction emojis
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  const currentSpark: Spark | undefined = sparks[currentIndex];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<any>(null);

  // Calculate remaining time until 24h expiration
  const getRemainingTimeText = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expiring now';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  // Video resolution if chunked
  useEffect(() => {
    if (!currentSpark) return;
    let isMounted = true;

    if (currentSpark.mediaType === 'video') {
      if (currentSpark.hasVideoChunks) {
        resolveVideoUrl(currentSpark.id, currentSpark.mediaUrl, true, 'sparks').then((url) => {
          if (isMounted && url) setResolvedVideoUrl(url);
        });
      } else {
        setResolvedVideoUrl(currentSpark.mediaUrl || null);
      }
    } else {
      setResolvedVideoUrl(null);
    }

    return () => {
      isMounted = false;
    };
  }, [currentSpark]);

  // Audio soundtrack handling
  useEffect(() => {
    if (!currentSpark) return;

    if (currentSpark.songPreviewUrl) {
      if (!bgAudioRef.current) {
        bgAudioRef.current = new Audio(currentSpark.songPreviewUrl);
        bgAudioRef.current.loop = true;
      } else {
        bgAudioRef.current.src = currentSpark.songPreviewUrl;
      }
      bgAudioRef.current.muted = isMuted;
      if (!isPaused) {
        bgAudioRef.current.play().catch(() => {});
      }
    } else if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }

    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
    };
  }, [currentSpark, isMuted]);

  // Progress timer (7s per image or video duration)
  useEffect(() => {
    if (!currentSpark || isPaused) return;

    setProgress(0);
    const stepMs = 50;
    const totalMs = currentSpark.mediaType === 'video' ? 12000 : 7000;
    const increment = (stepMs / totalMs) * 100;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + increment;
      });
    }, stepMs);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [currentIndex, isPaused, currentSpark]);

  const handleNext = () => {
    if (currentIndex < sparks.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  };

  const handleToggleLike = async () => {
    if (!currentUser || !currentSpark) return;
    const isLiked = currentSpark.likes?.includes(currentUser.uid);
    const updatedLikes = isLiked
      ? (currentSpark.likes || []).filter((id) => id !== currentUser.uid)
      : [...(currentSpark.likes || []), currentUser.uid];

    // Trigger floating fire emojis!
    triggerReaction('🔥');

    try {
      await updateDoc(doc(db, 'sparks', currentSpark.id), {
        likes: updatedLikes,
        likesCount: updatedLikes.length
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sparks/${currentSpark.id}`);
    }
  };

  const triggerReaction = (emoji: string) => {
    const newReaction: FloatingReaction = {
      id: Date.now() + Math.random(),
      emoji,
      x: 30 + Math.random() * 40 // between 30% and 70% width
    };
    setFloatingReactions((prev) => [...prev, newReaction]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2000);
  };

  const handleDeleteSpark = async () => {
    if (!currentSpark || !confirm('Delete this legendary Spark moment?')) return;
    try {
      await deleteDoc(doc(db, 'sparks', currentSpark.id));
      if (sparks.length <= 1) {
        onClose();
      } else {
        handleNext();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sparks/${currentSpark.id}`);
    }
  };

  const handleShare = () => {
    if (!currentSpark) return;
    navigator.clipboard.writeText(`${window.location.origin}/#spark-${currentSpark.id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!currentSpark) return null;

  const isLiked = currentSpark.likes?.includes(currentUser?.uid || '');
  const canDelete = currentSpark.authorId === currentUser?.uid || isAdmin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none">
      {/* Floating Animated Reaction Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 text-3xl animate-bounce"
            style={{
              left: `${r.x}%`,
              animation: 'floatUp 1.8s ease-out forwards',
              opacity: 0.95
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.8); opacity: 1; }
          100% { transform: translateY(-380px) scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* Main Container Card (Story Aspect Ratio) */}
      <div className="relative w-full max-w-md h-full max-h-[92vh] sm:rounded-3xl bg-gray-950 overflow-hidden flex flex-col justify-between shadow-2xl border border-gray-800">
        {/* Top Progress Bars (Segmented for each spark) */}
        <div className="absolute top-0 inset-x-0 p-3 pt-3.5 z-30 flex items-center gap-1.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {sparks.map((spark, idx) => {
            let fillPct = 0;
            if (idx < currentIndex) fillPct = 100;
            else if (idx === currentIndex) fillPct = progress;

            return (
              <div
                key={spark.id}
                className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden backdrop-blur-xs"
              >
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-75"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Top Header Overlay: Author + Countdown + Controls */}
        <div className="absolute top-6 inset-x-0 p-4 z-30 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <img
              src={
                currentSpark.authorPhotoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${currentSpark.authorId}`
              }
              alt={currentSpark.authorName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-400/80 shadow-md"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <CrystalBadge email={currentSpark.authorEmail} name={currentSpark.authorName} size="sm" />
                <span className="text-[11px] font-mono text-amber-300">
                  {currentSpark.authorUsername || '@waver'}
                </span>
              </div>

              {/* Legendary Tag + 24hr countdown badge */}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-extrabold flex items-center gap-1 shadow-sm">
                  <Flame size={10} />
                  <span>{currentSpark.legendaryTag || 'Legendary'}</span>
                </span>

                <span className="text-[10px] text-amber-200/90 font-mono font-bold flex items-center gap-1">
                  <Clock size={10} />
                  <span>{getRemainingTimeText(currentSpark.expiresAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Mute toggle */}
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (videoRef.current) videoRef.current.muted = nextMuted;
                if (bgAudioRef.current) bgAudioRef.current.muted = nextMuted;
              }}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Delete button */}
            {canDelete && (
              <button
                onClick={handleDeleteSpark}
                className="p-2 rounded-full bg-black/50 hover:bg-rose-600 text-white backdrop-blur-md transition"
                title="Delete Spark"
              >
                <Trash2 size={16} />
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition"
              title="Close Spark"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Player Area (Image or Video) */}
        <div
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden cursor-pointer"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {currentSpark.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={resolvedVideoUrl || currentSpark.mediaUrl}
              autoPlay
              playsInline
              loop
              muted={isMuted}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={currentSpark.mediaUrl}
              alt="Spark Moment"
              className="w-full h-full object-contain"
            />
          )}

          {/* Left / Right Tap zones for navigation */}
          <div
            className="absolute inset-y-0 left-0 w-1/3 z-20"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/3 z-20"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          />

          {/* Pause overlay pill */}
          {isPaused && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 rounded-2xl bg-black/75 backdrop-blur-md text-white font-bold text-xs flex items-center gap-2 pointer-events-none z-30 border border-white/20 animate-pulse">
              <Pause size={14} />
              <span>Paused</span>
            </div>
          )}
        </div>

        {/* Bottom Overlay: Caption + Soundtrack + Reactions */}
        <div className="p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-30 space-y-3">
          {/* Caption */}
          {currentSpark.caption && (
            <div className="p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs sm:text-sm leading-relaxed">
              <p>{currentSpark.caption}</p>
            </div>
          )}

          {/* Attached Online Song Soundtrack Indicator */}
          {currentSpark.songTitle && (
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-purple-950/60 backdrop-blur-md border border-purple-500/40 text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-gray-900 shadow-sm">
                  {currentSpark.songAlbumArt ? (
                    <img
                      src={currentSpark.songAlbumArt}
                      alt={currentSpark.songTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music size={16} className="m-auto text-purple-300" />
                  )}
                  <Disc size={14} className="absolute inset-0 m-auto text-white/90 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-purple-300 font-bold block">Soundtrack</span>
                  <p className="text-xs font-bold truncate">
                    {currentSpark.songTitle} • {currentSpark.songArtist}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-0.5 px-2">
                <span className="w-1 h-3 bg-pink-400 rounded-full animate-bounce" style={{ animationDuration: '500ms' }} />
                <span className="w-1 h-4 bg-purple-400 rounded-full animate-bounce" style={{ animationDuration: '700ms' }} />
                <span className="w-1 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDuration: '600ms' }} />
              </div>
            </div>
          )}

          {/* Action Toolbar: Like + Floating Emoji Bar + Share */}
          <div className="flex items-center justify-between gap-2">
            {/* Legendary Fire Like Button */}
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-1.5 py-2 px-3.5 rounded-2xl transition active:scale-95 text-xs font-bold ${
                isLiked
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                  : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-md'
              }`}
            >
              <Flame size={16} className={isLiked ? 'fill-white text-white' : 'text-amber-400'} />
              <span className="font-mono tabular-numbers">{currentSpark.likesCount || 0} Legendary</span>
            </button>

            {/* Quick Floating Reaction Emojis */}
            <div className="flex items-center gap-1">
              {['🔥', '⚡', '👑', '❤️'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => triggerReaction(emoji)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-sm transition active:scale-125"
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Share */}
            <button
              onClick={handleShare}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md transition"
              title="Share Spark link"
            >
              {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
            </button>
          </div>
        </div>

        {/* Left & Right chevron desktop controls */}
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className="hidden sm:flex absolute -left-14 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {currentIndex < sparks.length - 1 && (
          <button
            onClick={handleNext}
            className="hidden sm:flex absolute -right-14 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
};
