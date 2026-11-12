import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Post, Spark } from '../types';
import { SparkViewerModal } from './SparkViewerModal';
import {
  MultiSparkPosterModal,
  groupSparksByAuthor,
  UserSparkGroup
} from './MultiSparkPoster';
import { deleteSparkAndStorageFile } from '../utils/mediaStorage';
import { useSparkUploadQueue } from '../services/sparkUploadQueue';
import { SparkUploadQueueBanner } from './SparkUploadQueueBanner';
import {
  Flame,
  Plus,
  Sparkles,
  Play,
  Layers,
  Loader2
} from 'lucide-react';
import { Avatar } from './Avatar';

const WEEKLY_SPARK_THEMES = [
  'Share a quiet moment of gratitude today 🌿',
  'A favorite local meal or tea spot ☕',
  'Something small that made you smile this week ☀️',
  'A view from your neighborhood walk 🌅',
  'A song or creative project inspiring you 🎶',
  'Weekend plans or peaceful rest ahead 🌊',
  'A kind shout-out to someone in the community 🤝'
];

interface SparkTrayProps {
  externalPostsToShare?: Post[] | null;
  onClearExternalPosts?: () => void;
  onStartChat?: (userId: string) => void;
}

export const SparkTray: React.FC<SparkTrayProps> = ({
  externalPostsToShare,
  onClearExternalPosts,
  onStartChat
}) => {
  const { currentUser, userProfile } = useAuth();
  const { language } = useLanguage();
  const { isUploadingAny, overallProgress } = useSparkUploadQueue();
  const [activeSparks, setActiveSparks] = useState<Spark[]>([]);
  const [viewingGroup, setViewingGroup] = useState<UserSparkGroup | null>(null);
  const [isMultiPosterOpen, setIsMultiPosterOpen] = useState(false);

  const dayOfWeek = new Date().getDay();
  const todayTheme = WEEKLY_SPARK_THEMES[dayOfWeek % WEEKLY_SPARK_THEMES.length];

  // Open MultiSparkPosterModal automatically when external posts are passed from FeedView
  useEffect(() => {
    if (externalPostsToShare && externalPostsToShare.length > 0) {
      setIsMultiPosterOpen(true);
    }
  }, [externalPostsToShare]);

  // Real-time listener for sparks + automatic 24-hour expiry & Firebase Storage file cleanup (capped at 30 most recent)
  useEffect(() => {
    const q = query(collection(db, 'sparks'), orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const now = Date.now();
        const list: Spark[] = [];
        const expiredList: Spark[] = [];

        snapshot.forEach((docSnap) => {
          const data = { ...(docSnap.data() as Spark), id: docSnap.id };
          const expiresAtTime = new Date(data.expiresAt).getTime();
          if (expiresAtTime > now) {
            list.push(data);
          } else {
            expiredList.push(data);
          }
        });

        setActiveSparks(list);

        // Delete expired Spark files from Firebase Storage and remove expired Spark documents
        if (expiredList.length > 0 && currentUser) {
          expiredList.forEach((expiredSpark) => {
            deleteSparkAndStorageFile(expiredSpark, true);
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sparks');
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Periodic tick every minute to expire 24-hour Sparks and delete their Storage files
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveSparks((prev) => {
        const stillActive: Spark[] = [];
        prev.forEach((spark) => {
          if (new Date(spark.expiresAt).getTime() > now) {
            stillActive.push(spark);
          } else {
            deleteSparkAndStorageFile(spark, true);
          }
        });
        return stillActive.length === prev.length ? prev : stillActive;
      });
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Group sparks by authorId so multiple posts by the same user appear together as their Spark story
  const userSparkGroups = useMemo(
    () => groupSparksByAuthor(activeSparks, currentUser?.uid),
    [activeSparks, currentUser?.uid]
  );

  // Keep viewingGroup in sync if live data updates
  const activeViewingSparks = useMemo(() => {
    if (!viewingGroup) return null;
    const updatedGroup = userSparkGroups.find((g) => g.authorId === viewingGroup.authorId);
    return updatedGroup ? updatedGroup.sparks : viewingGroup.sparks;
  }, [viewingGroup, userSparkGroups]);

  const getHoursLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return '0m';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  const handleCloseModal = () => {
    setIsMultiPosterOpen(false);
    if (onClearExternalPosts) onClearExternalPosts();
  };

  return (
    <>
      <div className="wavelink-glass-post-card w-full max-w-full overflow-hidden rounded-[26px] p-3 sm:p-3.5 space-y-2.5">
        {/* Friendly Subtitle: Sparks moments that last 24 hours */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <Flame size={14} className="text-[#D97706]" />
            <span>
              {language === 'sw'
                ? 'Sparks · Matukio yanayodumu saa 24'
                : 'Sparks · Moments that last 24 hours'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="wavelink-glass-chip px-2.5 py-0.5 rounded-full text-[11px] font-extrabold text-[#2563EB] dark:text-sky-300 flex items-center gap-1 shrink-0 transition-transform active:scale-95 cursor-pointer"
          >
            <Sparkles size={11} className="text-[#D97706]" />
            <span>{language === 'sw' ? '+ Hadithi' : '+ Story'}</span>
          </button>
        </div>

        {/* Inline Background Spark Upload Queue Progress */}
        <SparkUploadQueueBanner variant="inline" />

        {/* Horizontal row of round story avatars with gradient ring, "+ Add story" first item, and small italic names below */}
        <div className="flex items-center gap-3.5 overflow-x-auto pt-0.5 pb-1 scrollbar-none max-w-full">
          {/* 1. "+ Add story" First Item */}
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none min-w-[60px] cursor-pointer transition-transform active:scale-95"
          >
            <div
              className={`relative w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-white/50 via-[#2563EB]/60 to-[#0D9488]/70 transition-transform duration-200 group-hover:scale-105 shadow-sm ${
                isUploadingAny ? 'ring-2 ring-[#2563EB] ring-offset-1' : ''
              }`}
            >
              <div className="w-full h-full rounded-full bg-slate-900/20 dark:bg-white/10 backdrop-blur-md border border-white/40 flex items-center justify-center overflow-hidden relative">
                {isUploadingAny ? (
                  <div className="flex flex-col items-center justify-center text-[var(--text-primary)]">
                    <Loader2 size={16} className="animate-spin text-[#2563EB]" />
                    <span className="text-[9px] font-extrabold font-mono">{overallProgress}%</span>
                  </div>
                ) : (
                  <Plus
                    size={22}
                    strokeWidth={2.2}
                    className="text-[var(--text-primary)] group-hover:scale-110 transition-transform"
                  />
                )}
              </div>
            </div>
            <span className="text-[11px] italic font-medium text-[var(--text-primary)] max-w-[66px] truncate">
              {isUploadingAny
                ? `${overallProgress}%`
                : language === 'sw'
                ? 'Add story'
                : 'Add story'}
            </span>
          </button>

          {/* 2. Active Community Stories (Grouped by Author with Gradient Ring & Small Italic Names Below) */}
          {userSparkGroups.map((group) => {
            const isMine = group.authorId === currentUser?.uid;
            const postCount = group.sparks.length;
            const latestSpark = group.sparks[group.sparks.length - 1];

            return (
              <button
                key={group.authorId}
                type="button"
                onClick={() => setViewingGroup(group)}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none min-w-[60px] cursor-pointer transition-transform active:scale-95"
                title={
                  postCount > 1
                    ? `${group.authorName}'s Story (${postCount} moments · ${getHoursLeft(group.latestExpiresAt)} left)`
                    : `${group.authorName}'s Story (${getHoursLeft(group.latestExpiresAt)} left)`
                }
              >
                <div
                  className={`relative w-14 h-14 rounded-full p-[2.5px] transition-transform duration-200 group-hover:scale-105 shadow-sm ${
                    postCount > 1
                      ? 'bg-gradient-to-tr from-[#2563EB] via-[#0D9488] to-[#F59E0B]'
                      : 'bg-gradient-to-tr from-[#2563EB] via-[#38BDF8] to-[#0D9488]'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-[var(--bg-surface)] ring-2 ring-white/80 dark:ring-slate-900 relative flex items-center justify-center">
                    <Avatar
                      uid={group.authorId}
                      src={
                        latestSpark.mediaType === 'video'
                          ? latestSpark.thumbnailUrl ||
                            group.authorPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${group.authorId}`
                          : group.authorPhotoURL ||
                            latestSpark.mediaUrl ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${group.authorId}`
                      }
                      alt={group.authorName}
                      fallbackName={group.authorName}
                      size={49}
                      showStatus={true}
                      imageClassName={latestSpark.mediaType === 'video' ? 'opacity-90' : ''}
                    >
                      {latestSpark.mediaType === 'video' && (
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-full pointer-events-none">
                          <Play size={11} className="fill-white text-white" />
                        </div>
                      )}
                    </Avatar>
                  </div>

                  {/* Multi-moment count badge if > 1 */}
                  {postCount > 1 && (
                    <div className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-[#2563EB] border border-white text-white text-[9px] font-extrabold flex items-center justify-center shadow-2xs z-20">
                      {postCount}
                    </div>
                  )}
                </div>

                <span className="text-[11px] italic font-medium text-[var(--text-primary)] max-w-[66px] truncate">
                  {isMine ? 'Your story' : group.authorName.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {/* Compact Spark of the Day prompt chip at the end of the row */}
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="wavelink-glass-chip shrink-0 px-3 py-2 rounded-2xl text-left max-w-[210px] flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
            title="Share today's Spark prompt"
          >
            <Sparkles size={14} className="text-[#D97706] shrink-0" />
            <span className="text-[11px] italic text-[var(--text-secondary)] line-clamp-2 leading-tight">
              {todayTheme}
            </span>
          </button>
        </div>
      </div>

      <MultiSparkPosterModal
        isOpen={isMultiPosterOpen}
        onClose={handleCloseModal}
        initialPostsToShare={externalPostsToShare || undefined}
      />

      {viewingGroup && activeViewingSparks && activeViewingSparks.length > 0 && (
        <SparkViewerModal
          sparks={activeViewingSparks}
          initialIndex={0}
          onClose={() => setViewingGroup(null)}
          onAddMorePosts={() => {
            setViewingGroup(null);
            setIsMultiPosterOpen(true);
          }}
          onStartChat={onStartChat}
        />
      )}
    </>
  );
};
