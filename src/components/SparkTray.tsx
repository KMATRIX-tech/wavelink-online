import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
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
      <div className="w-full max-w-full overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-3">
        {/* Weekly Community Challenge & Multi-Post Spark Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <Sparkles size={16} className="text-[#D97706] shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-sm sm:text-xs font-semibold text-[#1C1917] break-words">
              <span className="font-bold text-[#D97706]">Spark of the Day:</span> {todayTheme}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[#2563EB]/10 hover:bg-[#2563EB]/15 text-xs font-extrabold text-[#2563EB] flex items-center justify-center gap-1.5 shrink-0 transition"
          >
            <Layers size={14} />
            <span>Post Multi-Spark</span>
          </button>
        </div>

        {/* Inline Background Spark Upload Queue Progress */}
        <SparkUploadQueueBanner variant="inline" />

        {/* Slim Horizontal Sparks Row (Grouped by User) */}
        <div className="flex items-center gap-3.5 overflow-x-auto pb-1 scrollbar-none max-w-full">
          {/* Add / Queue Multiple Spark Posts Button */}
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none min-w-[64px] min-h-[44px]"
          >
            <div
              className={`relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-[#2563EB] to-[#0D9488] transition-transform group-hover:scale-105 ${
                isUploadingAny ? 'ring-2 ring-[#2563EB] ring-offset-1' : ''
              }`}
            >
              <div className="w-full h-full rounded-full bg-white p-0.5 flex items-center justify-center overflow-hidden relative">
                <img
                  src={
                    userProfile?.photoURL ||
                    currentUser?.photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                  }
                  alt="Add Spark"
                  className="w-full h-full rounded-full object-cover"
                />
                {isUploadingAny && (
                  <div className="absolute inset-0 bg-stone-900/45 flex items-center justify-center text-white text-[10px] font-extrabold font-mono">
                    {overallProgress}%
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#0D9488] border-2 border-white text-white flex items-center justify-center">
                {isUploadingAny ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Plus size={11} className="stroke-[3]" />
                )}
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#1C1917] max-w-[68px] truncate">
              {isUploadingAny ? `Posting ${overallProgress}%` : 'Add Spark'}
            </span>
          </button>

          {/* Active Community Sparks (Grouped by Author so Multi-Post Sparks show as 1 story with count badge) */}
          {userSparkGroups.map((group) => {
            const isMine = group.authorId === currentUser?.uid;
            const postCount = group.sparks.length;
            const latestSpark = group.sparks[group.sparks.length - 1];

            return (
              <button
                key={group.authorId}
                type="button"
                onClick={() => setViewingGroup(group)}
                className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none"
                title={
                  postCount > 1
                    ? `${group.authorName}'s Spark (${postCount} posts)`
                    : `${group.authorName}'s Spark`
                }
              >
                <div
                  className={`relative w-14 h-14 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                    postCount > 1
                      ? 'bg-gradient-to-tr from-[#2563EB] via-[#0D9488] to-[#D97706]'
                      : 'bg-gradient-to-tr from-[#2563EB] to-[#0D9488]'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-[#FAF7F2] overflow-hidden ring-2 ring-white relative">
                    {latestSpark.mediaType === 'video' ? (
                      <div className="w-full h-full bg-stone-800 flex items-center justify-center relative">
                        <img
                          src={
                            latestSpark.thumbnailUrl ||
                            group.authorPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${group.authorId}`
                          }
                          alt={group.authorName}
                          className="w-full h-full object-cover opacity-85"
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <Play size={12} className="fill-white text-white" />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={latestSpark.mediaUrl}
                        alt="Spark"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Badge showing multi-post count or Flame */}
                  {postCount > 1 ? (
                    <div className="absolute -top-1 -right-1 px-1.5 min-w-[20px] h-5 rounded-full bg-[#2563EB] border-2 border-white text-white text-[10px] font-extrabold flex items-center justify-center shadow-2xs">
                      {postCount}
                    </div>
                  ) : (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2563EB] border border-white text-white flex items-center justify-center">
                      <Flame size={9} className="fill-white text-white" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 max-w-[74px]">
                  <span className="text-[11px] font-semibold text-[#1C1917] truncate">
                    {isMine ? 'Your Spark' : group.authorName.split(' ')[0]}
                  </span>
                  <span className="text-[9px] text-[#0D9488] font-bold">
                    {postCount > 1 ? `${postCount}p` : getHoursLeft(group.latestExpiresAt)}
                  </span>
                </div>
              </button>
            );
          })}

          {userSparkGroups.length === 0 && (
            <div className="text-xs text-[#78716C] pl-2 py-2">
              Tap <strong className="text-[#1C1917]">Add Spark</strong> or{' '}
              <strong className="text-[#2563EB]">Post Multi-Spark</strong> to share multiple posts in
              your 24-hour Spark!
            </div>
          )}
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
