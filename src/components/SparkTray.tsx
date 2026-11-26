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
  Plus,
  Play,
  Loader2,
  X
} from 'lucide-react';
import { Avatar } from './Avatar';

export const WEEKLY_SPARK_THEMES = [
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
  const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);

  const seenStorageKey = `wavelink_seen_sparks_${currentUser?.uid || 'guest'}`;
  const [seenAuthorMap, setSeenAuthorMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`wavelink_seen_sparks_${currentUser?.uid || 'guest'}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(seenStorageKey);
      setSeenAuthorMap(raw ? JSON.parse(raw) : {});
    } catch {
      setSeenAuthorMap({});
    }
  }, [seenStorageKey]);

  const markGroupSeen = (group: UserSparkGroup) => {
    const latestId = group.sparks[group.sparks.length - 1]?.id || group.latestCreatedAt;
    setSeenAuthorMap((prev) => {
      const next = { ...prev, [group.authorId]: latestId };
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });
  };

  // Open MultiSparkPosterModal automatically when external posts are passed from FeedView or custom event
  useEffect(() => {
    if (externalPostsToShare && externalPostsToShare.length > 0) {
      setIsMultiPosterOpen(true);
    }
  }, [externalPostsToShare]);

  useEffect(() => {
    const handleOpenSparkPoster = () => setIsMultiPosterOpen(true);
    window.addEventListener('wavelink:open-spark-poster', handleOpenSparkPoster);
    return () => window.removeEventListener('wavelink:open-spark-poster', handleOpenSparkPoster);
  }, []);

  // Single limited query (limit 10) for stories/Sparks, detached when leaving screen
  useEffect(() => {
    const q = query(collection(db, 'sparks'), orderBy('createdAt', 'desc'), limit(10));
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

  // Periodic tick every minute to expire 24-hour Sparks
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

  // Group sparks by authorId so multiple posts by the same user appear together as their story
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

  const handleOpenGroup = (group: UserSparkGroup) => {
    markGroupSeen(group);
    setViewingGroup(group);
    setIsSeeAllOpen(false);
  };

  const isGroupSeen = (group: UserSparkGroup) => {
    const latestId = group.sparks[group.sparks.length - 1]?.id || group.latestCreatedAt;
    return seenAuthorMap[group.authorId] === latestId;
  };

  return (
    <>
      <section
        aria-label={language === 'sw' ? 'Hadithi mpya' : 'Fresh stories'}
        className="wavelink-fresh-stories-section w-full max-w-full overflow-hidden rounded-[26px] p-3.5 sm:p-4 space-y-3"
      >
        {/* Section Title + "See all" Link */}
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] tracking-tight">
            {language === 'sw' ? 'Hadithi mpya' : 'Fresh stories'}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (userSparkGroups.length > 0) {
                setIsSeeAllOpen(true);
              } else {
                setIsMultiPosterOpen(true);
              }
            }}
            className="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-extrabold text-[var(--accent-primary)] hover:underline transition cursor-pointer"
          >
            {language === 'sw' ? 'Ona zote' : 'See all'}
          </button>
        </div>

        {/* Inline Background Spark Upload Queue Progress */}
        <SparkUploadQueueBanner variant="inline" />

        {/* Horizontal scroll of round story avatars: "+" own story first, bright gradient ring (unseen) or grey ring (seen), name under each, online green dot */}
        <div className="flex items-center gap-3.5 overflow-x-auto pt-0.5 pb-1 scrollbar-none max-w-full">
          {/* 1. "+" for my own story first */}
          <button
            type="button"
            onClick={() => setIsMultiPosterOpen(true)}
            className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none min-w-[64px] min-h-[44px] cursor-pointer transition-transform active:scale-95"
            aria-label={language === 'sw' ? 'Ongeza hadithi' : 'Add your story'}
          >
            <div
              className={`relative w-15 h-15 rounded-full p-[2.5px] bg-gradient-to-tr from-[#A855F7] via-[#EC4899] to-[#F97316] transition-transform duration-200 group-hover:scale-105 shadow-xs ${
                isUploadingAny ? 'ring-2 ring-[var(--accent-primary)] ring-offset-1' : ''
              }`}
            >
              <div className="w-full h-full rounded-full bg-[var(--bg-surface)] flex items-center justify-center overflow-hidden relative">
                {userProfile?.photoURL || currentUser?.photoURL ? (
                  <>
                    <Avatar
                      uid={currentUser?.uid}
                      src={userProfile?.photoURL || currentUser?.photoURL || undefined}
                      alt="You"
                      fallbackName={userProfile?.displayName || currentUser?.displayName || 'You'}
                      size={52}
                      showStatus={true}
                      onlyWhenVisible={false}
                      targetProfile={userProfile}
                      imageClassName="opacity-85"
                    />
                    <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white ring-2 ring-[var(--bg-surface)] flex items-center justify-center shadow-xs z-20">
                      {isUploadingAny ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Plus size={12} strokeWidth={3} />
                      )}
                    </span>
                  </>
                ) : isUploadingAny ? (
                  <div className="flex flex-col items-center justify-center text-[var(--text-primary)]">
                    <Loader2 size={16} className="animate-spin text-[var(--accent-primary)]" />
                    <span className="text-[9px] font-extrabold font-mono tabular-nums">{overallProgress}%</span>
                  </div>
                ) : (
                  <Plus
                    size={22}
                    strokeWidth={2.5}
                    className="text-[var(--text-primary)] group-hover:scale-110 transition-transform"
                  />
                )}
              </div>
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)] max-w-[68px] truncate">
              {isUploadingAny
                ? `${overallProgress}%`
                : language === 'sw'
                ? 'Yako +'
                : 'Your story'}
            </span>
          </button>

          {/* 2. Active Stories with Bright Gradient Ring (Unseen) or Grey Ring (Seen) & Online Green Dot */}
          {userSparkGroups.map((group) => {
            const isMine = group.authorId === currentUser?.uid;
            const postCount = group.sparks.length;
            const latestSpark = group.sparks[group.sparks.length - 1];
            const seen = isGroupSeen(group);

            return (
              <button
                key={group.authorId}
                type="button"
                onClick={() => handleOpenGroup(group)}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none min-w-[64px] min-h-[44px] cursor-pointer transition-transform active:scale-95"
                title={
                  postCount > 1
                    ? `${group.authorName} (${postCount} stories · ${getHoursLeft(group.latestExpiresAt)} left)`
                    : `${group.authorName} (${getHoursLeft(group.latestExpiresAt)} left)`
                }
              >
                <div
                  className={`relative w-15 h-15 rounded-full p-[2.5px] transition-transform duration-200 group-hover:scale-105 ${
                    seen
                      ? 'bg-slate-300 dark:bg-slate-600'
                      : 'bg-gradient-to-tr from-[#A855F7] via-[#EC4899] to-[#F97316] shadow-xs'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-[var(--bg-surface)] p-[1.5px] relative flex items-center justify-center">
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
                      size={50}
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
                    <div className="absolute -top-0.5 -right-0.5 px-1.5 min-w-[18px] h-[18px] rounded-full bg-[var(--accent-primary)] border border-white text-white text-[9px] font-extrabold flex items-center justify-center shadow-2xs z-20 tabular-nums">
                      {postCount}
                    </div>
                  )}
                </div>

                <span
                  className={`text-xs max-w-[68px] truncate ${
                    seen
                      ? 'font-medium text-[var(--text-secondary)]'
                      : 'font-bold text-[var(--text-primary)]'
                  }`}
                >
                  {isMine ? (language === 'sw' ? 'Wewe' : 'You') : group.authorName.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* "See all" Stories Modal */}
      {isSeeAllOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All fresh stories"
          onClick={() => setIsSeeAllOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 shadow-2xl space-y-4 max-h-[82dvh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Hadithi Zote Mpya' : 'All Fresh Stories'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSeeAllOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  setIsSeeAllOpen(false);
                  setIsMultiPosterOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[var(--bg-subtle)] transition cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#A855F7] via-[#EC4899] to-[#F97316] p-[2px]">
                  <div className="w-full h-full rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-primary)]">
                    <Plus size={22} />
                  </div>
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-full">
                  {language === 'sw' ? '+ Ongeza' : '+ Add story'}
                </span>
              </button>

              {userSparkGroups.map((group) => {
                const seen = isGroupSeen(group);
                return (
                  <button
                    key={group.authorId}
                    type="button"
                    onClick={() => handleOpenGroup(group)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    <div
                      className={`w-14 h-14 rounded-full p-[2.5px] ${
                        seen
                          ? 'bg-slate-300 dark:bg-slate-600'
                          : 'bg-gradient-to-tr from-[#A855F7] via-[#EC4899] to-[#F97316]'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-[var(--bg-surface)] flex items-center justify-center">
                        <Avatar
                          uid={group.authorId}
                          src={
                            group.authorPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${group.authorId}`
                          }
                          alt={group.authorName}
                          fallbackName={group.authorName}
                          size={48}
                          showStatus={true}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-full">
                      {group.authorName.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

