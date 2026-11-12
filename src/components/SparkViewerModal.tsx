import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc
} from 'firebase/firestore';
import { Spark, SparkViewerEntry, SparkLikeEntry } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { Avatar } from './Avatar';
import { sendNotification, toggleFollowUser } from '../services/notificationService';
import {
  resolveVideoUrl,
  deleteSparkAndStorageFile
} from '../utils/mediaStorage';

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
  label: string;
  x: number;
}

interface SparkReplyItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: string;
}

const SOUND_PREF_STORAGE_KEY = 'wavelink_spark_sound_unmuted';
const PHOTO_DURATION_MS = 6000; // Photos last 6 seconds

// WaveLink's own custom reaction set
const WAVELINK_REACTION_SET = [
  { emoji: '🌊', label: 'Tidal' },
  { emoji: '⚡', label: 'Voltage' },
  { emoji: '🐚', label: 'Shell' },
  { emoji: '✨', label: 'Shimmer' },
  { emoji: '💎', label: 'Crystal' },
  { emoji: '🔥', label: 'Solar' }
];

const CAPTION_AND_REPLY_EMOJIS = ['🌊', '⚡', '✨', '🐚', '💎', '🌴', '☀️', '🎶', '🙌', '💙'];

/**
 * Formats createdAt timestamp into "Posted 3h ago", "Posted 15m ago", etc.
 */
function formatPostedTimeAgo(createdAt?: string): string {
  if (!createdAt) return 'Posted 1h ago';
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 'Posted 1h ago';
  const diffSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
  if (diffSec < 60) return 'Posted just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Posted ${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Posted ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Posted ${diffDays}d ago`;
}

/**
 * Formats expiresAt timestamp into "Expires in 2h", "Expires in 35m", etc. for the owner's menu
 */
function formatExpiresInLabel(expiresAt?: string): string {
  if (!expiresAt) return 'Expires in 24h';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Expires soon';
  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) {
    return `Expires in ${hours}h`;
  }
  return `Expires in ${ Math.max(1, minutes) }m`;
}

export const SparkViewerModal: React.FC<SparkViewerModalProps> = ({
  sparks,
  initialIndex = 0,
  onClose,
  onAddMorePosts,
  onStartChat
}) => {
  const { currentUser, userProfile, isAdmin, showGlobalToast } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Videos play automatically, muted at first, with a speaker button to unmute and a remembered choice
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(SOUND_PREF_STORAGE_KEY);
        if (stored === 'true') return false; // User previously chose unmuted
      }
    } catch {
      // default to muted first
    }
    return true;
  });

  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [preloadedNextVideoUrl, setPreloadedNextVideoUrl] = useState<string | null>(null);

  // Menus & Bottom Sheets
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isViewersSheetOpen, setIsViewersSheetOpen] = useState(false);
  const [isRepliesSheetOpen, setIsRepliesSheetOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [localRepliesBySpark, setLocalRepliesBySpark] = useState<Record<string, SparkReplyItem[]>>({});

  // Connections state inside Owner Viewers Sheet
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followActionLoadingId, setFollowActionLoadingId] = useState<string | null>(null);

  // Floating WaveLink reaction particles
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  const currentSpark: Spark | undefined = sparks[currentIndex];
  const nextSpark: Spark | undefined = sparks[currentIndex + 1];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const likeCooldownRef = useRef<number>(0);
  const notifiedSparkLikesRef = useRef<Set<string>>(new Set());

  // Touch & pointer gesture refs (tap left/right, press-and-hold pause, swipe down to close, swipe up for replies)
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    wasHold: boolean;
  } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOverlayOpen =
    isMenuOpen || isViewersSheetOpen || isRepliesSheetOpen || isReplyFocused || showEmojiTray;

  // Listen to current user's follows for the viewers bottom sheet
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

  // Automatically record view when a user watches another creator's Spark
  useEffect(() => {
    if (!currentSpark || !currentUser) return;
    if (currentSpark.authorId === currentUser.uid) return;

    const hasViewed = currentSpark.viewers?.includes(currentUser.uid);
    if (!hasViewed) {
      const viewerEntry: SparkViewerEntry = {
        userId: currentUser.uid,
        name: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        username:
          userProfile?.username ||
          (currentUser.email ? `@${currentUser.email.split('@')[0]}` : '@waver'),
        photoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
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
      }).catch(() => {});
    }
  }, [currentSpark?.id, currentUser?.uid]);

  const handleNext = useCallback(() => {
    setConfirmingDelete(false);
    setIsMenuOpen(false);
    setShowEmojiTray(false);
    if (currentIndex < sparks.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, sparks.length, onClose]);

  const handlePrev = useCallback(() => {
    setConfirmingDelete(false);
    setIsMenuOpen(false);
    setShowEmojiTray(false);
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

  // Resolve current Spark media URL
  useEffect(() => {
    if (!currentSpark) return;
    let isMounted = true;
    setProgress(0);

    if (currentSpark.mediaType === 'video') {
      if (
        nextSpark &&
         preloadedNextVideoUrl &&
        currentSpark.mediaUrl === preloadedNextVideoUrl
      ) {
        setResolvedVideoUrl(preloadedNextVideoUrl);
        setIsVideoBuffering(false);
      } else {
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
      }
    } else {
      setIsVideoBuffering(false);
      setResolvedVideoUrl(null);
    }

    return () => {
      isMounted = false;
    };
  }, [currentSpark?.id]);

  // Preload ONLY the next Spark (sparks[currentIndex + 1])
  useEffect(() => {
    setPreloadedNextVideoUrl(null);
    if (!nextSpark) return;

    let cancelled = false;
    if (nextSpark.mediaType === 'image' && nextSpark.mediaUrl) {
      const preloadImg = new Image();
      preloadImg.src = nextSpark.mediaUrl;
    } else if (nextSpark.mediaType === 'video') {
      resolveVideoUrl(
        nextSpark.id,
        nextSpark.mediaUrl,
        nextSpark.hasVideoChunks,
        'sparks'
      )
        .then((url) => {
          if (!cancelled && url) {
            setPreloadedNextVideoUrl(url);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [nextSpark?.id]);

  // Autoplay video with remembered mute preference (falls back to muted if browser blocks unmuted autoplay)
  useEffect(() => {
    if (!currentSpark || currentSpark.mediaType !== 'video') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const startPlayback = async () => {
      try {
        videoEl.muted = isMuted;
        await videoEl.play();
      } catch {
        try {
          videoEl.muted = true;
          setIsMuted(true);
          await videoEl.play();
        } catch {
          // User can tap play
        }
      }
    };

    startPlayback();
  }, [currentSpark?.id, resolvedVideoUrl]);

  // Pause / resume video when isPaused or any overlay changes
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || currentSpark?.mediaType !== 'video') return;
    if (isPaused || isOverlayOpen) {
      videoEl.pause();
    } else {
      videoEl.play().catch(() => {});
    }
  }, [isPaused, isOverlayOpen, currentSpark?.id]);

  // Optional background audio soundtrack handling
  useEffect(() => {
    if (!currentSpark) return;

    if (currentSpark.songPreviewUrl) {
      if (!bgAudioRef.current) {
        bgAudioRef.current = new Audio(currentSpark.songPreviewUrl);
        bgAudioRef.current.loop = true;
      } else if (bgAudioRef.current.src !== currentSpark.songPreviewUrl) {
        bgAudioRef.current.src = currentSpark.songPreviewUrl;
      }
      bgAudioRef.current.muted = isMuted;
      if (!isPaused && !isOverlayOpen) {
        bgAudioRef.current.play().catch(() => {});
      } else {
        bgAudioRef.current.pause();
      }
    } else if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }

    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
    };
  }, [currentSpark?.id, currentSpark?.songPreviewUrl, isMuted, isPaused, isOverlayOpen]);

  // Photo progress timer: Photos last 6 seconds (6000ms)
  useEffect(() => {
    if (!currentSpark || isPaused || isVideoBuffering || isOverlayOpen) return;

    if (currentSpark.mediaType === 'image') {
      const stepMs = 40;
      const increment = (stepMs / PHOTO_DURATION_MS) * 100;

      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev + increment >= 100) {
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
  }, [currentIndex, isPaused, isVideoBuffering, isOverlayOpen, currentSpark, handleNext]);

  // Speaker button toggle with remembered choice in localStorage
  const handleToggleSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SOUND_PREF_STORAGE_KEY, nextMuted ? 'false' : 'true');
      }
    } catch {
      // ignore storage quota
    }
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current.paused && !isPaused && !isOverlayOpen) {
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

  const triggerReactionParticle = (emoji: string, label = 'Wave') => {
    const newReaction: FloatingReaction = {
      id: Date.now() + Math.random(),
      emoji,
      label,
      x: 18 + Math.random() * 64
    };
    setFloatingReactions((prev) => [...prev, newReaction]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 1900);
  };

  const handleQuickReaction = async (emoji: string, label: string) => {
    triggerReactionParticle(emoji, label);
    if (!currentUser || !currentSpark) return;

    const now = Date.now();
    if (now - likeCooldownRef.current < 900) return;
    likeCooldownRef.current = now;

    const isAlreadyLiked = currentSpark.likes?.includes(currentUser.uid);
    const updatedLikes = Array.from(new Set([...(currentSpark.likes || []), currentUser.uid]));

    const likeEntry: SparkLikeEntry = {
      userId: currentUser.uid,
      name: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
      username:
        userProfile?.username ||
        (currentUser.email ? `@${currentUser.email.split('@')[0]}` : '@waver'),
      photoURL:
        userProfile?.photoURL ||
        currentUser.photoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      likedAt: new Date().toISOString()
    };

    try {
      const remainingLikers = (currentSpark.likedUsers || []).filter(
        (u) => u.userId !== currentUser.uid
      );
      const deduplicatedLikers = [...remainingLikers, likeEntry];
      await updateDoc(doc(db, 'sparks', currentSpark.id), {
        likes: updatedLikes,
        likesCount: updatedLikes.length,
        likedUsers: deduplicatedLikers
      });

      if (
        !isAlreadyLiked &&
        currentSpark.authorId !== currentUser.uid &&
        !notifiedSparkLikesRef.current.has(`${currentSpark.id}_${emoji}`)
      ) {
        notifiedSparkLikesRef.current.add(`${currentSpark.id}_${emoji}`);
        sendNotification({
          recipientId: currentSpark.authorId,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName || currentUser.displayName || 'Someone',
          actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined,
          type: 'post_like',
          title: `Spark Reaction ${emoji}`,
          body: `${
            userProfile?.displayName || currentUser.displayName || 'Someone'
          } reacted with ${emoji} ${label} to your Spark`,
          entityId: currentSpark.id
        }).catch(() => {});
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sparks/${currentSpark.id}`);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSpark || !currentUser) return;
    const cleanText = replyText.trim();
    if (!cleanText || isSendingReply) return;

    setIsSendingReply(true);
    const senderName = userProfile?.displayName || currentUser.displayName || 'Waver';
    const senderAvatar =
      userProfile?.photoURL ||
      currentUser.photoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`;
    const nowIso = new Date().toISOString();

    const newReplyItem: SparkReplyItem = {
      id: `reply_${Date.now()}`,
      userId: currentUser.uid,
      userName: senderName,
      userAvatar: senderAvatar,
      text: cleanText,
      createdAt: nowIso
    };

    setLocalRepliesBySpark((prev) => ({
      ...prev,
      [currentSpark.id]: [...(prev[currentSpark.id] || []), newReplyItem]
    }));
    setReplyText('');
    setShowEmojiTray(false);
    setIsReplyFocused(false);
    replyInputRef.current?.blur();
    triggerReactionParticle('🌊', 'Sent');

    try {
      // Send direct message in deterministic DM channel between viewer and Spark author
      if (currentSpark.authorId !== currentUser.uid) {
        const sortedUids = [currentUser.uid, currentSpark.authorId].sort();
        const dmChannelId = `dm_${sortedUids[0]}_${sortedUids[1]}`;
        await addDoc(collection(db, 'messages'), {
          channelId: dmChannelId,
          senderId: currentUser.uid,
          senderName,
          senderPhotoURL: senderAvatar,
          recipientId: currentSpark.authorId,
          text: `🌊 Replied to your Spark: "${cleanText}"`,
          createdAt: nowIso
        }).catch(() => {});

        sendNotification({
          recipientId: currentSpark.authorId,
          actorId: currentUser.uid,
          actorName: senderName,
          actorPhotoURL: senderAvatar,
          type: 'message',
          title: 'New Spark Reply 🌊',
          body: `${senderName}: ${cleanText.slice(0, 100)}`,
          entityId: currentSpark.id
        }).catch(() => {});
      }
      showGlobalToast('Wave reply sent!');
    } catch {
      // Already stored in local session state
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteSpark = async () => {
    if (!currentSpark) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 4500);
      return;
    }
    try {
      await deleteSparkAndStorageFile(currentSpark, true);
      setConfirmingDelete(false);
      setIsMenuOpen(false);
      setIsViewersSheetOpen(false);
      if (sparks.length <= 1) {
        onClose();
      } else {
        handleNext();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sparks/${currentSpark.id}`);
    }
  };

  const handleShareLink = () => {
    if (!currentSpark) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(`${window.location.origin}/#spark-${currentSpark.id}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

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
    } catch {
      // ignore
    } finally {
      setFollowActionLoadingId(null);
    }
  };

  const handleConnectWithUser = (targetUserId: string) => {
    if (onStartChat) {
      setIsViewersSheetOpen(false);
      onClose();
      onStartChat(targetUserId);
    }
  };

  // Pointer & touch gesture handlers on the main story stage:
  // - Tap left 35%: previous Spark
  // - Tap right 65%: next Spark
  // - Press and hold: pause while held, resume on release
  // - Swipe down: close viewer
  // - Swipe up: open replies sheet
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isOverlayOpen) return;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      wasHold: false
    };
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (pointerStartRef.current) {
        pointerStartRef.current.wasHold = true;
        setIsPaused(true);
      }
    }, 200);
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (start.wasHold) {
      setIsPaused(false);
    }

    // Vertical swipe gestures take priority
    if (absY > 65 && absY > absX * 1.2) {
      if (deltaY > 65) {
        // Swipe down -> close Spark viewer
        onClose();
        return;
      }
      if (deltaY < -65) {
        // Swipe up -> open Replies sheet
        setIsRepliesSheetOpen(true);
        return;
      }
    }

    // Horizontal swipe navigation
    if (absX > 55 && absX > absY * 1.2) {
      if (deltaX < -55) {
        handleNext();
      } else if (deltaX > 55) {
        handlePrev();
      }
      return;
    }

    // Short tap (< 220ms and minimal movement): left side for previous, right side for next
    if (!start.wasHold && absX < 18 && absY < 18) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      if (relativeX < rect.width * 0.36) {
        handlePrev();
      } else {
        handleNext();
      }
    }
  };

  const handleStagePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (pointerStartRef.current?.wasHold) {
      setIsPaused(false);
    }
    pointerStartRef.current = null;
  };

  if (!currentSpark) return null;

  const isAuthor = currentSpark.authorId === currentUser?.uid;
  const canDelete = isAuthor || isAdmin;
  const viewCount =
    currentSpark.viewersCount ||
    currentSpark.viewerUsers?.length ||
    currentSpark.viewers?.length ||
    0;
  const bgBlurMediaUrl =
    currentSpark.mediaType === 'video'
      ? currentSpark.thumbnailUrl ||
        currentSpark.authorPhotoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentSpark.authorId}`
      : currentSpark.mediaUrl;
  const currentReplies = localRepliesBySpark[currentSpark.id] || [];

  return (
    <div
      className="fixed inset-0 z-50 w-screen h-[100dvh] flex items-center justify-center bg-[#040D1A] overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="WaveLink Spark Story Viewer"
    >
      {/* Wider-Screen Soft Blurred Copy of Media Filling Empty Space */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {currentSpark.mediaType === 'video' && (resolvedVideoUrl || currentSpark.mediaUrl) ? (
          <video
            src={resolvedVideoUrl || currentSpark.mediaUrl}
            poster={bgBlurMediaUrl}
            muted
            playsInline
            loop
            autoPlay
            className="w-full h-full object-cover scale-125 blur-3xl opacity-45"
          />
        ) : (
          <img
            src={bgBlurMediaUrl}
            alt=""
            className="w-full h-full object-cover scale-125 blur-3xl opacity-45"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#041426]/70 via-[#06182C]/50 to-[#030B17]/85" />
      </div>

      {/* Hidden Preloader for ONLY the Next Spark Video */}
      {nextSpark && nextSpark.mediaType === 'video' && preloadedNextVideoUrl && (
        <video
          key={`preload_${nextSpark.id}`}
          src={preloadedNextVideoUrl}
          preload="metadata"
          muted
          playsInline
          className="hidden"
          aria-hidden="true"
        />
      )}

      {/* Keyframe Animation for WaveLink Floating Reaction Bubbles */}
      <style>{`
        @keyframes waveFloatRise {
          0% { transform: translateY(0) scale(0.75); opacity: 0; }
          18% { transform: translateY(-28px) scale(1.1); opacity: 1; }
          100% { transform: translateY(-320px) scale(1.35); opacity: 0; }
        }
      `}</style>

      {/* Full-Screen Portrait Stage (Centred on mobile, framed 420-480px column on wider screens) */}
      <div className="relative z-10 w-full h-full sm:w-[450px] sm:min-w-[420px] sm:max-w-[480px] md:h-[94dvh] md:rounded-[32px] bg-[#071324] md:border md:border-teal-400/20 md:shadow-[0_24px_80px_rgba(6,182,212,0.22)] overflow-hidden flex flex-col justify-between">
        {/* Soft Blurred Media Copy Inside Portrait Frame for Non-9:16 Aspect Ratios */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {currentSpark.mediaType === 'video' && (resolvedVideoUrl || currentSpark.mediaUrl) ? (
            <video
              src={resolvedVideoUrl || currentSpark.mediaUrl}
              poster={bgBlurMediaUrl}
              muted
              playsInline
              loop
              autoPlay
              className="w-full h-full object-cover scale-110 blur-2xl opacity-55 brightness-50"
            />
          ) : (
            <img
              src={bgBlurMediaUrl}
              alt=""
              className="w-full h-full object-cover scale-110 blur-2xl opacity-55 brightness-50"
            />
          )}
          <div className="absolute inset-0 bg-[#051020]/45" />
        </div>

        {/* Floating WaveLink Reaction Bubbles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              className="absolute bottom-28 flex flex-col items-center gap-0.5"
              style={{
                left: `${r.x}%`,
                animation: 'waveFloatRise 1.85s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}
            >
              <span className="text-3xl drop-shadow-[0_4px_12px_rgba(13,148,136,0.5)]">
                {r.emoji}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0D9488]/90 text-white text-[9px] font-bold tracking-wide shadow-sm">
                {r.label}
              </span>
            </div>
          ))}
        </div>

        {/* =========================================================
            TOP SAFE-AREA BAR: Wave-Colored Segmented Progress + Creator Header
            ========================================================= */}
        <header
          className="relative z-30 w-full px-3.5 pt-3 pb-3 bg-gradient-to-b from-[#040D1A]/90 via-[#040D1A]/55 to-transparent"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          {/* Thin Segmented Progress Bars in WaveLink's Teal & Blue Wave Colors (Not Plain White) */}
          <div className="flex items-center gap-1.5 mb-3">
            {sparks.map((spark, idx) => {
              let fillPct = 0;
              if (idx < currentIndex) fillPct = 100;
              else if (idx === currentIndex) fillPct = Math.min(100, Math.max(0, progress));

              return (
                <div
                  key={spark.id}
                  className="flex-1 h-1 rounded-full bg-[#0D9488]/25 border border-[#38BDF8]/20 overflow-hidden"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0D9488] via-[#06B6D4] to-[#2563EB] shadow-[0_0_8px_rgba(6,182,212,0.65)] transition-all duration-75"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Creator Row: Avatar with Wave-Ring Border + Name + 'Posted 3h ago' | Pause, Sound & Three-Dot Menu */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Creator Avatar with WaveLink Teal/Blue Wave-Ring Border + Realtime Presence */}
              <div className="relative shrink-0 p-[2px] rounded-full bg-gradient-to-tr from-[#0D9488] via-[#06B6D4] to-[#2563EB] shadow-[0_0_12px_rgba(13,148,136,0.45)]">
                <Avatar
                  uid={currentSpark.authorId}
                  src={
                    currentSpark.authorPhotoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentSpark.authorId}`
                  }
                  alt={currentSpark.authorName}
                  fallbackName={currentSpark.authorName}
                  size={36}
                  showStatus={true}
                  onlyWhenVisible={false}
                  imageClassName="ring-1 ring-[#071324]"
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-bold text-white truncate drop-shadow-xs">
                    {currentSpark.authorName}
                  </span>
                  <CrystalBadge
                    email={currentSpark.authorEmail}
                    name={currentSpark.authorName}
                    size="sm"
                  />
                </div>
                <p className="text-[11px] font-medium text-teal-200/90 drop-shadow-xs">
                  {formatPostedTimeAgo(currentSpark.createdAt)}
                </p>
              </div>
            </div>

            {/* Right Controls: Pause, Sound (Speaker), Three-Dot Menu, Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Pause / Resume Button */}
              <button
                type="button"
                onClick={handleTogglePause}
                aria-label={isPaused ? 'Resume Spark' : 'Pause Spark'}
                title={isPaused ? 'Resume' : 'Pause'}
                className="w-9 h-9 rounded-2xl bg-[#071A2F]/75 hover:bg-[#0D9488]/30 border border-teal-400/25 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer"
              >
                {isPaused ? (
                  <svg className="w-4 h-4 text-teal-300" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5.5v13l11-6.5-11-6.5z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1.5" />
                    <rect x="14" y="5" width="4" height="14" rx="1.5" />
                  </svg>
                )}
              </button>

              {/* Speaker Button (Sound On/Off with Remembered Choice) */}
              <button
                type="button"
                onClick={handleToggleSound}
                aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
                title={isMuted ? 'Unmute sound' : 'Mute sound'}
                className={`w-9 h-9 rounded-2xl border flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer ${
                  isMuted
                    ? 'bg-[#071A2F]/75 border-teal-400/25 text-slate-200 hover:bg-[#0D9488]/30'
                    : 'bg-[#0D9488]/35 border-teal-300/50 text-teal-200'
                }`}
              >
                {isMuted ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H3v6h3l5 4V5z" />
                    <path d="M22 9l-6 6M16 9l6 6" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H3v6h3l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>

              {/* Three-Dot Menu Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen((prev) => !prev);
                  }}
                  aria-label="Spark options menu"
                  title="More options"
                  className="w-9 h-9 rounded-2xl bg-[#071A2F]/75 hover:bg-[#0D9488]/30 border border-teal-400/25 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>

                {/* Three-Dot Dropdown Menu */}
                {isMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-56 rounded-3xl bg-[#07182B]/95 backdrop-blur-xl border border-teal-400/30 shadow-2xl p-2 z-50 text-white space-y-1"
                  >
                    {/* Owner-only 24-hour expiry countdown ('Expires in 2h') */}
                    {isAuthor && (
                      <div className="px-3 py-2 rounded-2xl bg-gradient-to-r from-[#0D9488]/25 to-[#2563EB]/25 border border-teal-400/25 flex items-center justify-between text-xs">
                        <span className="font-semibold text-teal-200">
                          {formatExpiresInLabel(currentSpark.expiresAt)}
                        </span>
                        <span className="text-[10px] font-mono text-teal-300/80">24h Spark</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        handleShareLink();
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-2xl hover:bg-white/10 text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer"
                    >
                      <span>{copiedLink ? 'Link copied!' : 'Copy Spark link'}</span>
                      <span className="text-teal-300 text-xs">🌊</span>
                    </button>

                    {isAuthor && onAddMorePosts && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onClose();
                          onAddMorePosts();
                        }}
                        className="w-full px-3 py-2.5 rounded-2xl hover:bg-white/10 text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer"
                      >
                        <span>Add another Spark</span>
                        <span className="text-teal-300 font-bold">+</span>
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={handleDeleteSpark}
                        className={`w-full px-3 py-2.5 rounded-2xl text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                          confirmingDelete
                            ? 'bg-rose-600 text-white'
                            : 'text-rose-300 hover:bg-rose-500/20'
                        }`}
                      >
                        <span>{confirmingDelete ? 'Tap again to confirm' : 'Delete Spark'}</span>
                        <span>🗑️</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full px-3 py-2 rounded-2xl hover:bg-white/10 text-left text-xs text-slate-300 font-medium transition cursor-pointer"
                    >
                      Close viewer
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Close Pill */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Spark viewer"
                title="Close (or swipe down)"
                className="w-9 h-9 rounded-2xl bg-[#071A2F]/75 hover:bg-rose-500/30 border border-teal-400/25 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* =========================================================
            CENTER PORTRAIT MEDIA STAGE (Tap left/right, Hold to pause, Swipe up/down)
            ========================================================= */}
        <div
          className="relative flex-1 w-full flex items-center justify-center overflow-hidden cursor-pointer touch-pan-x"
          onPointerDown={handleStagePointerDown}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
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
                onCanPlay={() => setIsVideoBuffering(false)}
                onPlaying={() => setIsVideoBuffering(false)}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  const dur =
                    Number.isFinite(vid.duration) && vid.duration > 0
                      ? vid.duration
                      : currentSpark.videoDurationSeconds || 6;
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
                className="relative z-10 w-full h-full object-contain pointer-events-none"
              />

              {isVideoBuffering && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#040D1A]/45 backdrop-blur-xs pointer-events-none gap-2">
                  <div className="w-9 h-9 rounded-full border-2 border-[#06B6D4] border-t-transparent animate-spin" />
                  <span className="text-xs font-semibold text-teal-100">Loading wave...</span>
                </div>
              )}
            </>
          ) : (
            <img
              src={currentSpark.mediaUrl}
              alt={currentSpark.caption || 'WaveLink Spark'}
              className="relative z-10 w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Hold-to-Pause Indicator Pill */}
          {isPaused && !isVideoBuffering && !isOverlayOpen && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-full bg-[#07182B]/85 backdrop-blur-md border border-teal-400/35 text-teal-100 text-xs font-semibold flex items-center gap-2 pointer-events-none shadow-lg">
              <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
              <span>Spark Paused</span>
            </div>
          )}
        </div>

        {/* =========================================================
            BOTTOM READABLE GRADIENT: Caption Pill + Soundtrack + Quick Reactions + Reply Bar + Owner Eye
            ========================================================= */}
        <footer
          className="relative z-30 w-full px-3.5 pt-8 pb-3 bg-gradient-to-t from-[#030B17] via-[#041022]/90 to-transparent space-y-2.5"
          style={{ paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom))' }}
        >
          {/* Optional Attached Song Pill */}
          {currentSpark.songTitle && (
            <div className="flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#071A2F]/85 backdrop-blur-md border border-teal-400/30 text-teal-100 text-xs max-w-full">
                <span className="text-teal-300">🎶</span>
                <span className="font-semibold truncate">
                  {currentSpark.songTitle}
                  {currentSpark.songArtist ? ` • ${currentSpark.songArtist}` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Caption in a Soft Rounded Pill with Emoji Support & Readable Dark Backing */}
          {currentSpark.caption && (
            <div className="w-full flex justify-center">
              <div className="max-w-full px-4 py-2.5 rounded-3xl bg-[#051324]/85 backdrop-blur-md border border-teal-400/25 shadow-lg text-center">
                <p className="text-white text-xs sm:text-sm font-medium leading-relaxed break-words drop-shadow-xs">
                  {currentSpark.caption}
                </p>
              </div>
            </div>
          )}

          {/* WaveLink's Own Quick Reaction Row */}
          <div className="flex items-center justify-between gap-1.5 px-1">
            {WAVELINK_REACTION_SET.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleQuickReaction(item.emoji, item.label)}
                className="flex-1 min-h-[40px] py-1.5 px-2 rounded-2xl bg-[#071A2F]/80 hover:bg-[#0D9488]/30 active:scale-95 border border-teal-400/20 backdrop-blur-md flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs"
                title={`Send ${item.label} (${item.emoji})`}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                <span className="text-[10px] font-semibold text-teal-100/90 hidden sm:inline">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* Emoji Picker Tray for Reply Composer */}
          {showEmojiTray && (
            <div className="flex items-center justify-between gap-1 px-3 py-2 rounded-2xl bg-[#071A2F]/95 border border-teal-400/30 backdrop-blur-md">
              {CAPTION_AND_REPLY_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setReplyText((prev) => `${prev}${em}`);
                    replyInputRef.current?.focus();
                  }}
                  className="w-7 h-7 rounded-xl hover:bg-white/10 flex items-center justify-center text-base transition active:scale-110 cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* Bottom Bar: Reply Input Pill + Owner-Only Eye Icon with View Count */}
          <div className="flex items-center gap-2">
            <form onSubmit={handleSendReply} className="flex-1 flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowEmojiTray((prev) => !prev)}
                  aria-label="Insert emoji"
                  className="absolute left-2.5 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-sm text-teal-300 transition cursor-pointer"
                >
                  🌊
                </button>
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onFocus={() => setIsReplyFocused(true)}
                  onBlur={() => setIsReplyFocused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Wave to ${currentSpark.authorName.split(' ')[0]}...`}
                  className="w-full h-11 pl-10 pr-10 rounded-full bg-[#071A2F]/85 border border-teal-400/30 text-white placeholder-teal-200/50 text-xs sm:text-sm focus:outline-none focus:border-[#06B6D4] focus:bg-[#071A2F] backdrop-blur-md transition"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSendingReply}
                  aria-label="Send reply"
                  className="absolute right-1.5 w-8 h-8 rounded-full bg-gradient-to-r from-[#0D9488] to-[#2563EB] text-white flex items-center justify-center disabled:opacity-40 transition active:scale-95 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </form>

            {/* ONLY the Owner Sees the Eye Icon with the View Count at the Bottom */}
            {isAuthor && (
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setIsViewersSheetOpen(true);
                }}
                aria-label={`Viewers (${viewCount})`}
                title="See who viewed your Spark"
                className="h-11 px-3.5 rounded-full bg-gradient-to-r from-[#0D9488]/35 to-[#2563EB]/35 hover:from-[#0D9488]/55 hover:to-[#2563EB]/55 border border-teal-300/40 text-white flex items-center gap-1.5 backdrop-blur-md shadow-sm transition active:scale-95 cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4 text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="text-xs font-bold font-mono text-teal-100">
                  {viewCount}
                </span>
              </button>
            )}
          </div>
        </footer>

        {/* =========================================================
            SWIPE-UP REPLIES BOTTOM SHEET
            ========================================================= */}
        {isRepliesSheetOpen && (
          <div
            className="absolute inset-0 z-40 bg-[#030B17]/80 backdrop-blur-md flex flex-col justify-end"
            onClick={() => setIsRepliesSheetOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-[28px] bg-[#07182B] border-t border-teal-400/30 p-5 text-white max-h-[72vh] flex flex-col shadow-2xl"
            >
              <div className="w-10 h-1.5 rounded-full bg-teal-400/30 mx-auto mb-3" />
              <div className="flex items-center justify-between pb-3 border-b border-teal-400/15">
                <div>
                  <h3 className="text-sm font-bold text-white">Wave Replies</h3>
                  <p className="text-[11px] text-teal-200/70">
                    Replies go directly to {currentSpark.authorName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRepliesSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-2.5 min-h-[140px]">
                {currentReplies.length === 0 ? (
                  <div className="text-center py-6 text-teal-200/70 text-xs">
                    Swipe up anytime to send a wave reply or reaction to {currentSpark.authorName}.
                  </div>
                ) : (
                  currentReplies.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/5 border border-teal-400/15"
                    >
                      <Avatar
                        uid={item.userId}
                        src={item.userAvatar}
                        alt={item.userName}
                        fallbackName={item.userName}
                        size={28}
                        showStatus={true}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-teal-200">{item.userName}</p>
                        <p className="text-xs text-white mt-0.5 break-words">{item.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendReply} className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${currentSpark.authorName}...`}
                  className="flex-1 h-11 px-4 rounded-full bg-[#041022] border border-teal-400/30 text-white placeholder-teal-200/50 text-xs focus:outline-none focus:border-[#06B6D4]"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSendingReply}
                  className="h-11 px-5 rounded-full bg-gradient-to-r from-[#0D9488] to-[#2563EB] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================
            OWNER-ONLY VIEWERS BOTTOM SHEET (With Delete Spark Option)
            ========================================================= */}
        {isAuthor && isViewersSheetOpen && (
          <div
            className="absolute inset-0 z-40 bg-[#030B17]/80 backdrop-blur-md flex flex-col justify-end"
            onClick={() => {
              setIsViewersSheetOpen(false);
              setIsPaused(false);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-[28px] bg-[#07182B] border-t border-teal-400/30 p-5 text-white max-h-[78vh] flex flex-col shadow-2xl"
            >
              <div className="w-10 h-1.5 rounded-full bg-teal-400/30 mx-auto mb-3" />

              {/* Sheet Header with View Count + Expires in 2h + Delete Spark */}
              <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-teal-400/15">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Spark Viewers ({viewCount})
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-200 text-[11px] font-semibold">
                      {formatExpiresInLabel(currentSpark.expiresAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-teal-200/70 mt-0.5">
                    People who tuned into this 24-hour Spark
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Delete Spark Button Inside Owner Viewers Bottom Sheet */}
                  <button
                    type="button"
                    onClick={handleDeleteSpark}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      confirmingDelete
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200'
                    }`}
                  >
                    <span>🗑️</span>
                    <span>{confirmingDelete ? 'Confirm Delete' : 'Delete Spark'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsViewersSheetOpen(false);
                      setIsPaused(false);
                    }}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs cursor-pointer"
                    aria-label="Close viewers sheet"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Viewers List */}
              <div className="flex-1 overflow-y-auto py-3 space-y-2 max-h-[340px]">
                {!currentSpark.viewerUsers || currentSpark.viewerUsers.length === 0 ? (
                  <div className="text-center py-8 text-teal-200/70">
                    <p className="text-xs font-bold text-white">No viewers yet</p>
                    <p className="text-[11px] text-teal-200/60 mt-1 max-w-xs mx-auto">
                      When members watch your Spark, their profiles will appear right here.
                    </p>
                  </div>
                ) : (
                  currentSpark.viewerUsers.map((viewer, idx) => {
                    const isMe = viewer.userId === currentUser?.uid;
                    const isFollowing = followingMap[viewer.userId];

                    return (
                      <div
                        key={`${viewer.userId}_${idx}`}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-white/5 border border-teal-400/15"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            uid={viewer.userId}
                            src={
                              viewer.photoURL ||
                              `https://api.dicebear.com/7.x/shapes/svg?seed=${viewer.userId}`
                            }
                            alt={viewer.name}
                            fallbackName={viewer.name}
                            size={36}
                            showStatus={true}
                            className="ring-2 ring-[#0D9488]/50 rounded-full"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{viewer.name}</p>
                            <p className="text-[10px] text-teal-300 font-mono truncate">
                              {viewer.username || '@waver'}
                            </p>
                          </div>
                        </div>

                        {!isMe && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {onStartChat && (
                              <button
                                type="button"
                                onClick={() => handleConnectWithUser(viewer.userId)}
                                className="px-3 py-1.5 rounded-full bg-[#2563EB] hover:bg-blue-600 text-white text-[11px] font-semibold transition cursor-pointer"
                              >
                                Wave
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleFollowFromDrawer(viewer.userId, viewer.name)
                              }
                              disabled={followActionLoadingId === viewer.userId}
                              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                                isFollowing
                                  ? 'bg-[#0D9488]/30 text-teal-200 border border-teal-400/30'
                                  : 'bg-white/15 hover:bg-white/25 text-white'
                              }`}
                            >
                              {isFollowing ? 'Connected' : 'Connect'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
