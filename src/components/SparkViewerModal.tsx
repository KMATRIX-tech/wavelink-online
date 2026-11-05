import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, arrayUnion, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Spark, SparkViewerEntry, SparkLikeEntry } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { sendNotification, toggleFollowUser } from '../services/notificationService';
import {
  resolveVideoUrl,
  deleteSparkAndStorageFile,
  formatSparkDuration
} from '../utils/mediaStorage';
import {
  X,
  Flame,
  Clock,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Disc,
  Music,
  Share2,
  Check,
  Loader2,
  Eye,
  MessageSquare,
  UserPlus,
  Sparkles,
  Plus
} from 'lucide-react';

interface SparkViewerModalProps {
  sparks: Spark[];
  initialIndex?: number;
  onClose: () => void;
  onAddMorePosts?: () => void;
  onStartChat?: (userId: string) => void;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

export const SparkViewerModal: React.FC<SparkViewerModalProps> = ({
  sparks,
  initialIndex = 0,
  onClose,
  onAddMorePosts,
  onStartChat
}) => {
  const { currentUser, userProfile, isAdmin } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);
  const [videoCurrentSec, setVideoCurrentSec] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Spark Audience & Connections Drawer state
  const [isAudienceDrawerOpen, setIsAudienceDrawerOpen] = useState(false);
  const [audienceTab, setAudienceTab] = useState<'viewers' | 'likers'>('viewers');
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followActionLoadingId, setFollowActionLoadingId] = useState<string | null>(null);

  // Floating reaction emojis
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  const currentSpark: Spark | undefined = sparks[currentIndex];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<any>(null);
  const likeCooldownRef = useRef<number>(0);
  const notifiedSparkLikesRef = useRef<Set<string>>(new Set());

  // Listen to current user's follows
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'follows'), where('followerId', '==', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, boolean> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data.targetUserId) map[data.targetUserId] = true;
        });
        setFollowingMap(map);
      },
      () => {}
    );
    return () => unsub();
  }, [currentUser?.uid]);

  // Automatically track viewer when user watches another creator's Spark
  useEffect(() => {
    if (!currentSpark || !currentUser) return;
    if (currentSpark.authorId === currentUser.uid) return;

    const hasViewed = currentSpark.viewers?.includes(currentUser.uid);
    if (!hasViewed) {
      const viewerEntry: SparkViewerEntry = {
        userId: currentUser.uid,
        name: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        username: userProfile?.username || (currentUser.email ? `@${currentUser.email.split('@')[0]}` : '@waver'),
        photoURL: userProfile?.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        viewedAt: new Date().toISOString()
      };

      const deduplicatedViewerUsers = [
        ...(currentSpark.viewerUsers || []).filter((u) => u.userId !== currentUser.uid),
        viewerEntry
      ];
      const deduplicatedViewerIds = Array.from(
        new Set([...(currentSpark.viewers || []), currentUser.uid])
      );

      updateDoc(doc(db, 'sparks', currentSpark.id), {
        viewers: deduplicatedViewerIds,
        viewersCount: deduplicatedViewerIds.length,
        viewerUsers: deduplicatedViewerUsers
      }).catch((err) => {
        console.warn('Spark view registration notice:', err);
      });
    }
  }, [currentSpark?.id, currentUser?.uid]);

  const handleToggleFollowFromDrawer = async (targetUserId: string, targetName: string) => {
    if (!currentUser || followActionLoadingId) return;
    setFollowActionLoadingId(targetUserId);
    try {
      const isNowFollowing = await toggleFollowUser(
        currentUser.uid,
        userProfile?.displayName || currentUser.displayName || 'A waver',
        targetUserId,
        targetName
      );
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: isNowFollowing }));
    } catch (err) {
      console.warn('Follow toggle notice:', err);
    } finally {
      setFollowActionLoadingId(null);
    }
  };

  const handleConnectWithUser = (targetUserId: string) => {
    if (onStartChat) {
      setIsAudienceDrawerOpen(false);
      onClose();
      onStartChat(targetUserId);
    }
  };

  const handleNext = useCallback(() => {
    setConfirmingDelete(false);
    if (currentIndex < sparks.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, sparks.length, onClose]);

  const handlePrev = useCallback(() => {
    setConfirmingDelete(false);
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    } else {
      setProgress(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [currentIndex]);

  // Calculate remaining time until 24h expiration
  const getRemainingTimeText = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expiring now';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  // Resolve video URL (Firebase Storage URL first, or cached/legacy fallback)
  useEffect(() => {
    if (!currentSpark) return;
    let isMounted = true;
    setProgress(0);
    setVideoCurrentSec(0);
    setVideoDurationSec(currentSpark.videoDurationSeconds || 0);

    if (currentSpark.mediaType === 'video') {
      setIsVideoBuffering(true);
      resolveVideoUrl(
        currentSpark.id,
        currentSpark.mediaUrl,
        currentSpark.hasVideoChunks,
        'sparks'
      ).then((url) => {
        if (!isMounted) return;
        setResolvedVideoUrl(url || currentSpark.mediaUrl || null);
      });
    } else {
      setIsVideoBuffering(false);
      setResolvedVideoUrl(null);
    }

    return () => {
      isMounted = false;
    };
  }, [currentSpark?.id]);

  // Ensure reliable mobile & desktop video playback when resolvedVideoUrl is ready
  useEffect(() => {
    if (!currentSpark || currentSpark.mediaType !== 'video') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const startPlayback = async () => {
      try {
        videoEl.muted = isMuted;
        await videoEl.play();
      } catch {
        // Mobile browsers (iOS Safari / Chrome Android) may require muted autoplay if audio wasn't unlocked yet
        try {
          videoEl.muted = true;
          setIsMuted(true);
          await videoEl.play();
        } catch {
          // User can tap Play button
        }
      }
    };

    startPlayback();
  }, [currentSpark?.id, resolvedVideoUrl]);

  // Pause / resume underlying <video> element when isPaused toggles
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || currentSpark?.mediaType !== 'video') return;
    if (isPaused) {
      videoEl.pause();
    } else {
      videoEl.play().catch(() => {});
    }
  }, [isPaused, currentSpark?.id]);

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
  }, [currentSpark, isMuted, isPaused]);

  // Progress timer:
  // - For photos: 7s smooth interval timer
  // - For short 1-3s videos (or if video duration metadata isn't reported): fallback timer while not buffering
  // - For standard/long videos (up to 60s Free / 90s Pro): driven by video.onTimeUpdate & video.onEnded
  useEffect(() => {
    if (!currentSpark || isPaused || isVideoBuffering || isAudienceDrawerOpen) return;

    if (currentSpark.mediaType === 'image') {
      const stepMs = 50;
      const totalMs = 7000;
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
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [currentIndex, isPaused, isVideoBuffering, isAudienceDrawerOpen, currentSpark, handleNext]);

  const handleToggleSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current.paused && !isPaused) {
        videoRef.current.play().catch(() => {});
      }
    }
    if (bgAudioRef.current) {
      bgAudioRef.current.muted = nextMuted;
    }
  };

  const handleTogglePause = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsPaused((prev) => !prev);
  };

  const handleToggleLike = async () => {
    if (!currentUser || !currentSpark) return;

    // Anti-abuse rapid toggle debounce (1.2s cooldown)
    const now = Date.now();
    if (now - likeCooldownRef.current < 1200) return;
    likeCooldownRef.current = now;

    const isLiked = currentSpark.likes?.includes(currentUser.uid);
    const updatedLikes = isLiked
      ? (currentSpark.likes || []).filter((id) => id !== currentUser.uid)
      : Array.from(new Set([...(currentSpark.likes || []), currentUser.uid]));

    triggerReaction('🔥');

    const likeEntry: SparkLikeEntry = {
      userId: currentUser.uid,
      name: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
      username: userProfile?.username || (currentUser.email ? `@${currentUser.email.split('@')[0]}` : '@waver'),
      photoURL: userProfile?.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      likedAt: new Date().toISOString()
    };

    try {
      const remainingLikers = (currentSpark.likedUsers || []).filter((u) => u.userId !== currentUser.uid);
      if (!isLiked) {
        const deduplicatedLikers = [...remainingLikers, likeEntry];
        await updateDoc(doc(db, 'sparks', currentSpark.id), {
          likes: updatedLikes,
          likesCount: updatedLikes.length,
          likedUsers: deduplicatedLikers
        });
        // Only notify author once per session per Spark to prevent like/unlike notification spam
        if (currentSpark.authorId !== currentUser.uid && !notifiedSparkLikesRef.current.has(currentSpark.id)) {
          notifiedSparkLikesRef.current.add(currentSpark.id);
          sendNotification({
            recipientId: currentSpark.authorId,
            actorId: currentUser.uid,
            actorName: userProfile?.displayName || currentUser.displayName || 'Someone',
            actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined,
            type: 'post_like',
            title: 'Spark Liked 🔥',
            body: `${userProfile?.displayName || currentUser.displayName || 'Someone'} liked your 24h Spark!`,
            entityId: currentSpark.id
          }).catch(() => {});
        }
      } else {
        await updateDoc(doc(db, 'sparks', currentSpark.id), {
          likes: updatedLikes,
          likesCount: updatedLikes.length,
          likedUsers: remainingLikers
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sparks/${currentSpark.id}`);
    }
  };

  const triggerReaction = (emoji: string) => {
    const newReaction: FloatingReaction = {
      id: Date.now() + Math.random(),
      emoji,
      x: 30 + Math.random() * 40
    };
    setFloatingReactions((prev) => [...prev, newReaction]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2000);
  };

  const handleDeleteSpark = async () => {
    if (!currentSpark) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 4000);
      return;
    }
    try {
      await deleteSparkAndStorageFile(currentSpark, true);
      setConfirmingDelete(false);
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
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(`${window.location.origin}/#spark-${currentSpark.id}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (!currentSpark) return null;

  const isLiked = currentSpark.likes?.includes(currentUser?.uid || '');
  const canDelete = currentSpark.authorId === currentUser?.uid || isAdmin;
  const isAuthor = currentSpark.authorId === currentUser?.uid;

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
            else if (idx === currentIndex) fillPct = Math.min(100, Math.max(0, progress));

            return (
              <div
                key={spark.id}
                className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden backdrop-blur-xs"
              >
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-100"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Top Header Overlay: Author + Countdown + Controls */}
        <div className="absolute top-6 inset-x-0 p-4 z-30 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={
                currentSpark.authorPhotoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${currentSpark.authorId}`
              }
              alt={currentSpark.authorName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-400/80 shadow-md shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CrystalBadge email={currentSpark.authorEmail} name={currentSpark.authorName} size="sm" />
                <span className="text-[11px] font-mono text-amber-300 truncate">
                  {currentSpark.authorUsername || '@waver'}
                </span>
              </div>

              {/* Legendary Tag + Slide counter + 24hr countdown badge */}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-extrabold flex items-center gap-1 shadow-sm">
                  <Flame size={10} />
                  <span>{currentSpark.legendaryTag || 'Legendary'}</span>
                </span>

                {sparks.length > 1 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-extrabold">
                    {currentIndex + 1}/{sparks.length}
                  </span>
                )}

                {currentSpark.mediaType === 'video' && (videoDurationSec > 0 || currentSpark.videoDurationSeconds) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-teal-300 font-mono font-bold">
                    {formatSparkDuration(videoCurrentSec)} /{' '}
                    {formatSparkDuration(videoDurationSec || currentSpark.videoDurationSeconds)}
                  </span>
                )}

                <span className="text-[10px] text-amber-200/90 font-mono font-bold flex items-center gap-1">
                  <Clock size={10} />
                  <span>{getRemainingTimeText(currentSpark.expiresAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onAddMorePosts && currentSpark.authorId === currentUser?.uid && (
              <button
                onClick={() => {
                  onClose();
                  onAddMorePosts();
                }}
                className="px-2.5 py-1.5 rounded-full bg-[#2563EB] hover:bg-blue-600 text-white text-[11px] font-extrabold backdrop-blur-md transition"
                title="Add more posts to your Spark"
              >
                + Add
              </button>
            )}

            {/* Play / Pause toggle */}
            <button
              onClick={handleTogglePause}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition"
              title={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>

            {/* Audio Mute / Unmute toggle */}
            <button
              onClick={handleToggleSound}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition"
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Delete button */}
            {canDelete && (
              <button
                onClick={handleDeleteSpark}
                className={`px-2.5 py-2 rounded-full text-white backdrop-blur-md transition flex items-center gap-1 text-[11px] font-bold ${
                  confirmingDelete
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-black/50 hover:bg-rose-600'
                }`}
                title="Delete Spark"
              >
                <Trash2 size={15} />
                {confirmingDelete && <span>Confirm</span>}
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

        {/* Media Player Area (Image or Video with Buffering State & Mobile Sound Controls) */}
        <div
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden cursor-pointer"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {currentSpark.mediaType === 'video' ? (
            <>
              <video
                key={currentSpark.id}
                ref={videoRef}
                src={resolvedVideoUrl || currentSpark.mediaUrl}
                poster={currentSpark.thumbnailUrl}
                autoPlay
                playsInline
                preload="auto"
                muted={isMuted}
                onLoadStart={() => setIsVideoBuffering(true)}
                onWaiting={() => setIsVideoBuffering(true)}
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration;
                  if (Number.isFinite(dur) && dur > 0) {
                    setVideoDurationSec(dur);
                  }
                }}
                onCanPlay={() => setIsVideoBuffering(false)}
                onPlaying={() => setIsVideoBuffering(false)}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  const dur =
                    Number.isFinite(vid.duration) && vid.duration > 0
                      ? vid.duration
                      : currentSpark.videoDurationSeconds || 3;
                  setVideoCurrentSec(vid.currentTime);
                  if (dur > 0) {
                    setProgress(Math.min(100, (vid.currentTime / dur) * 100));
                  }
                }}
                onEnded={() => {
                  setProgress(100);
                  handleNext();
                }}
                onError={() => {
                  setIsVideoBuffering(false);
                }}
                className="w-full h-full object-contain"
              />

              {/* Loading / Buffering Spinner Overlay */}
              {isVideoBuffering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-xs pointer-events-none z-30 gap-2">
                  <Loader2 size={34} className="text-white animate-spin" />
                  <span className="text-xs font-bold text-white/90 tracking-wide">
                    Buffering video...
                  </span>
                </div>
              )}

              {/* Mobile-friendly Sound Control Pill */}
              <button
                type="button"
                onClick={handleToggleSound}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="absolute bottom-4 right-4 z-30 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/85 text-white border border-white/20 backdrop-blur-md text-xs font-bold flex items-center gap-1.5 shadow-lg transition active:scale-95"
              >
                {isMuted ? (
                  <>
                    <VolumeX size={14} className="text-amber-400" />
                    <span>Tap for Sound</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={14} className="text-emerald-400" />
                    <span>Sound On</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <img
              src={currentSpark.mediaUrl}
              alt="Spark Moment"
              className="w-full h-full object-contain"
            />
          )}

          {/* Left / Right Tap zones for navigation */}
          <div
            className="absolute inset-y-16 left-0 w-1/3 z-20"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          />
          <div
            className="absolute inset-y-16 right-0 w-1/3 z-20"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          />

          {/* Pause overlay pill */}
          {isPaused && !isVideoBuffering && (
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

          {/* Spark Audience & Viewers Indicator Bar */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsPaused(true);
                setIsAudienceDrawerOpen(true);
              }}
              className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md text-xs font-semibold border border-white/15 transition active:scale-95 cursor-pointer shadow-sm"
              title="See people who watched and liked this Spark"
            >
              <div className="flex items-center gap-1.5 text-cyan-300">
                <Eye size={14} />
                <span className="font-mono font-bold">
                  {currentSpark.viewersCount || currentSpark.viewers?.length || (currentSpark.viewerUsers?.length ?? 0)}
                </span>
                <span className="text-[11px] text-white/80">views</span>
              </div>
              <span className="text-white/30">•</span>
              <div className="flex items-center gap-1.5 text-rose-400">
                <Flame size={14} className="fill-rose-400" />
                <span className="font-mono font-bold">
                  {currentSpark.likesCount || (currentSpark.likes?.length ?? 0)}
                </span>
                <span className="text-[11px] text-white/80">likes</span>
              </div>
              <span className="text-[10px] font-bold text-amber-300 underline group-hover:text-amber-200 ml-1">
                {isAuthor ? 'Who watched? →' : 'Audience →'}
              </span>
            </button>

            {isAuthor && onAddMorePosts && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddMorePosts();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[11px] font-extrabold shadow-sm active:scale-95 transition"
                title="Add another post to your 24-hour Spark"
              >
                <Plus size={13} />
                <span>Add Story</span>
              </button>
            )}
          </div>

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

        {/* Slide-up Audience & Connections Drawer */}
        {isAudienceDrawerOpen && (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-fade-in rounded-3xl overflow-hidden">
            <div className="bg-[#1C1917] border-t border-white/15 rounded-t-3xl max-h-[78vh] flex flex-col p-4 sm:p-5 shadow-2xl text-white">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-white">
                      Spark Audience & Connections
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-extrabold uppercase">
                      Live
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Connect with everyone who watched and liked your Spark!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAudienceDrawerOpen(false);
                    setIsPaused(false);
                  }}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                  title="Close Audience Drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 gap-2 my-3">
                <button
                  type="button"
                  onClick={() => setAudienceTab('viewers')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    audienceTab === 'viewers'
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                      : 'bg-white/10 text-stone-300 hover:bg-white/15'
                  }`}
                >
                  <Eye size={14} />
                  <span>
                    Watched ({currentSpark.viewerUsers?.length || currentSpark.viewers?.length || 0})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceTab('likers')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    audienceTab === 'likers'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-white/10 text-stone-300 hover:bg-white/15'
                  }`}
                >
                  <Flame size={14} />
                  <span>
                    Liked ({currentSpark.likedUsers?.length || currentSpark.likes?.length || 0})
                  </span>
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-2 py-1 max-h-[300px]">
                {audienceTab === 'viewers' ? (
                  !currentSpark.viewerUsers || currentSpark.viewerUsers.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <Eye size={28} className="mx-auto mb-2 opacity-40 text-cyan-400" />
                      <p className="text-xs font-bold text-white">No views recorded yet</p>
                      <p className="text-[11px] text-stone-400 mt-1 max-w-xs mx-auto">
                        When other wavers watch this Spark, their names and profiles will appear right here!
                      </p>
                    </div>
                  ) : (
                    currentSpark.viewerUsers.map((viewer, idx) => {
                      const isMe = viewer.userId === currentUser?.uid;
                      const isFollowing = followingMap[viewer.userId];

                      return (
                        <div
                          key={`${viewer.userId}_${idx}`}
                          className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/15 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={viewer.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${viewer.userId}`}
                              alt={viewer.name}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-cyan-500/30 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate">
                                {viewer.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
                                <span className="text-cyan-400 font-mono font-semibold truncate">
                                  {viewer.username || '@waver'}
                                </span>
                                <span>•</span>
                                <span>
                                  {viewer.viewedAt ? new Date(viewer.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Watched'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isMe && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {onStartChat && (
                                <button
                                  type="button"
                                  onClick={() => handleConnectWithUser(viewer.userId)}
                                  className="px-2.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-[11px] font-bold flex items-center gap-1 transition active:scale-95 shadow-sm"
                                  title="Send a direct message"
                                >
                                  <MessageSquare size={12} />
                                  <span>Message</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleFollowFromDrawer(viewer.userId, viewer.name)}
                                disabled={followActionLoadingId === viewer.userId}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition active:scale-95 ${
                                  isFollowing
                                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-white/15 hover:bg-white/25 text-white'
                                }`}
                              >
                                {isFollowing ? (
                                  <>
                                    <Check size={12} />
                                    <span>Following</span>
                                  </>
                                ) : (
                                  <>
                                    <UserPlus size={12} />
                                    <span>Follow</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                ) : (
                  !currentSpark.likedUsers || currentSpark.likedUsers.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <Flame size={28} className="mx-auto mb-2 opacity-40 text-rose-400" />
                      <p className="text-xs font-bold text-white">No likes yet</p>
                      <p className="text-[11px] text-stone-400 mt-1 max-w-xs mx-auto">
                        {currentSpark.likesCount && currentSpark.likesCount > 0
                          ? `${currentSpark.likesCount} people gave a Legendary Fire reaction!`
                          : 'Be the first or wait for friends to react!'}
                      </p>
                    </div>
                  ) : (
                    currentSpark.likedUsers.map((liker, idx) => {
                      const isMe = liker.userId === currentUser?.uid;
                      const isFollowing = followingMap[liker.userId];

                      return (
                        <div
                          key={`${liker.userId}_${idx}`}
                          className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/15 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={liker.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${liker.userId}`}
                              alt={liker.name}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-rose-500/30 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate flex items-center gap-1">
                                <span>{liker.name}</span>
                                <Flame size={12} className="text-rose-400 fill-rose-400" />
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
                                <span className="text-rose-400 font-mono font-semibold truncate">
                                  {liker.username || '@waver'}
                                </span>
                                <span>•</span>
                                <span>
                                  {liker.likedAt ? new Date(liker.likedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Liked'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isMe && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {onStartChat && (
                                <button
                                  type="button"
                                  onClick={() => handleConnectWithUser(liker.userId)}
                                  className="px-2.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-[11px] font-bold flex items-center gap-1 transition active:scale-95 shadow-sm"
                                  title="Send a direct message"
                                >
                                  <MessageSquare size={12} />
                                  <span>Message</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleFollowFromDrawer(liker.userId, liker.name)}
                                disabled={followActionLoadingId === liker.userId}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition active:scale-95 ${
                                  isFollowing
                                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-white/15 hover:bg-white/25 text-white'
                                }`}
                              >
                                {isFollowing ? (
                                  <>
                                    <Check size={12} />
                                    <span>Following</span>
                                  </>
                                ) : (
                                  <>
                                    <UserPlus size={12} />
                                    <span>Follow</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                )}
              </div>

              {/* Creator Encouragement Banner */}
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                    <Sparkles size={12} />
                    <span>Engage to grow your community!</span>
                  </p>
                  <p className="text-[10px] text-stone-400 truncate">
                    Connecting with viewers encourages them to watch every Spark.
                  </p>
                </div>
                {isAuthor && onAddMorePosts && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAudienceDrawerOpen(false);
                      onClose();
                      onAddMorePosts();
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-[11px] shadow-sm transition active:scale-95 flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>Post New Spark</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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
