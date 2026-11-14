import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Bookmark,
  CheckCircle2,
  Crown,
  Flame,
  Heart,
  MessageCircle,
  Pin,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Waves,
  X
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import { db, fetchUserProfileCached, getCachedUserProfile } from '../firebase';
import { Post, Spark, StoryHighlightItem, UserProfile } from '../types';
import { CommentsSheet } from './CommentsSheet';
import { ShareSheet } from './ShareSheet';
import { Avatar } from './Avatar';
import { uploadImageToCloudinary } from '../utils/mediaStorage';
import { useBottomSheetLock } from '../utils/sheetLock';

export interface ProfileBadgeInfo {
  id: 'streak' | 'pro' | 'verified' | 'early_member' | 'top_supporter';
  labelEn: string;
  labelSw: string;
  howEarnedEn: string;
  howEarnedSw: string;
  earned: boolean;
  accentClass: string;
  icon: React.ReactNode;
}

export function computeProfileBadges(
  profile: UserProfile | null,
  isProEffective: boolean,
  isVerifiedEffective: boolean
): ProfileBadgeInfo[] {
  const streak = Math.max(1, profile?.loginStreak || 1);
  const points = profile?.wavePoints ?? profile?.points ?? 0;
  const isPro = Boolean(
    isProEffective ||
      profile?.isPro ||
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      profile?.role === 'sub_admin'
  );
  const isVerified = Boolean(
    isVerifiedEffective ||
      profile?.hasBlueStar ||
      profile?.isVerifiedByAdmin ||
      profile?.proBadge === 'verified'
  );

  return [
    {
      id: 'streak',
      labelEn: `${streak}d Streak`,
      labelSw: `Mfululizo Siku ${streak}`,
      howEarnedEn: `Earned by checking in ${streak} day${streak === 1 ? '' : 's'} in a row on WaveLink.`,
      howEarnedSw: `Imepatikana kwa kuingia mfululizo kwa siku ${streak} kwenye WaveLink.`,
      earned: streak >= 1,
      accentClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
      icon: <Flame size={14} className="text-amber-500 shrink-0" />
    },
    {
      id: 'pro',
      labelEn: 'Pro Member',
      labelSw: 'Mwanachama wa Pro',
      howEarnedEn: 'Earned by subscribing to WaveLink Pro or activating a Pro Creator pass.',
      howEarnedSw: 'Imepatikana kwa kujiunga na WaveLink Pro.',
      earned: isPro,
      accentClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30',
      icon: <Crown size={14} className="text-purple-500 shrink-0" />
    },
    {
      id: 'verified',
      labelEn: 'Verified',
      labelSw: 'Imethibitishwa',
      howEarnedEn: 'Earned through official WaveLink Blue Star identity & creator verification.',
      howEarnedSw: 'Imepatikana kupitia uthibitisho rasmi wa Nyota ya Bluu ya WaveLink.',
      earned: isVerified,
      accentClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30',
      icon: <ShieldCheck size={14} className="text-blue-500 shrink-0" />
    },
    {
      id: 'early_member',
      labelEn: 'Early Member',
      labelSw: 'Mwanzilishi',
      howEarnedEn: 'Awarded to founding members who joined the WaveLink community early.',
      howEarnedSw: 'Inatolewa kwa wanachama wa mwanzo waliojiunga na WaveLink.',
      earned: true,
      accentClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30',
      icon: <Waves size={14} className="text-teal-500 shrink-0" />
    },
    {
      id: 'top_supporter',
      labelEn: 'Top Supporter',
      labelSw: 'Mfadhili Bora',
      howEarnedEn: 'Earned by collecting 100+ WavePoints or tipping & uplifting fellow creators.',
      howEarnedSw: 'Imepatikana kwa kukusanya WavePoints 100+ au kusaidia wabunifu wengine.',
      earned: points >= 100 || isPro,
      accentClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30',
      icon: <Award size={14} className="text-rose-500 shrink-0" />
    }
  ];
}

interface ProfileBadgesRowProps {
  profile: UserProfile | null;
  isProEffective: boolean;
  isVerifiedEffective: boolean;
  language: 'en' | 'sw';
}

export const ProfileBadgesRow: React.FC<ProfileBadgesRowProps> = ({
  profile,
  isProEffective,
  isVerifiedEffective,
  language
}) => {
  const [selectedBadge, setSelectedBadge] = useState<ProfileBadgeInfo | null>(null);
  const badges = computeProfileBadges(profile, isProEffective, isVerifiedEffective);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {badges.map((badge) => (
          <button
            key={badge.id}
            type="button"
            onClick={() =>
              setSelectedBadge((prev) => (prev?.id === badge.id ? null : badge))
            }
            className={`min-h-[34px] px-2.5 py-1 rounded-full border text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
              badge.earned
                ? badge.accentClass
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] opacity-65'
            }`}
          >
            {badge.icon}
            <span>{language === 'sw' ? badge.labelSw : badge.labelEn}</span>
          </button>
        ))}
      </div>

      {selectedBadge && (
        <div
          role="status"
          className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-start justify-between gap-3 text-xs animate-in fade-in"
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5">{selectedBadge.icon}</div>
            <div>
              <span className="font-extrabold text-[var(--text-primary)] block">
                {language === 'sw' ? selectedBadge.labelSw : selectedBadge.labelEn}{' '}
                {selectedBadge.earned ? '✓' : language === 'sw' ? '(Imejaa Kufuli)' : '(Locked)'}
              </span>
              <span className="text-[var(--text-secondary)] leading-relaxed block mt-0.5">
                {language === 'sw' ? selectedBadge.howEarnedSw : selectedBadge.howEarnedEn}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedBadge(null)}
            aria-label="Close badge tooltip"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

interface FollowersListModalProps {
  isOpen: boolean;
  initialTab: 'followers' | 'following';
  onClose: () => void;
  followerIds: string[];
  followingIds: string[];
  myFollowingIds: string[];
  currentUserId?: string;
  language: 'en' | 'sw';
  onToggleFollow: (targetUserId: string, targetName?: string) => Promise<void>;
  onSelectUserProfile: (targetUserId: string) => void;
  onStartChatWithUser?: (targetUserId: string) => void;
}

export const FollowersListModal: React.FC<FollowersListModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  followerIds,
  followingIds,
  myFollowingIds,
  currentUserId,
  language,
  onToggleFollow,
  onSelectUserProfile,
  onStartChatWithUser
}) => {
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const ids = tab === 'followers' ? followerIds : followingIds;
    const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 60);

    if (uniqueIds.length === 0) {
      setProfiles([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      uniqueIds.map(async (uid) => {
        const cached = getCachedUserProfile(uid);
        if (cached) return cached;
        return fetchUserProfileCached(uid);
      })
    )
      .then((resolved) => {
        if (cancelled) return;
        const valid = resolved.filter((p): p is UserProfile => Boolean(p && p.id));
        setProfiles(valid);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, followerIds, followingIds]);

  useBottomSheetLock(isOpen, 'followers-modal');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[var(--accent-primary)]" />
            <h3 className="font-extrabold text-base text-[var(--text-primary)]">
              {tab === 'followers'
                ? language === 'sw'
                  ? `Wafuasi (${followerIds.length})`
                  : `Followers (${followerIds.length})`
                : language === 'sw'
                ? `Anaowafuata (${followingIds.length})`
                : `Following (${followingIds.length})`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list"
            className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Switch */}
        <div className="p-3 border-b border-[var(--border-hairline)] grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab('followers')}
            className={`min-h-[42px] rounded-xl text-xs font-extrabold transition cursor-pointer ${
              tab === 'followers'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            {language === 'sw' ? 'Wafuasi' : 'Followers'} ({followerIds.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('following')}
            className={`min-h-[42px] rounded-xl text-xs font-extrabold transition cursor-pointer ${
              tab === 'following'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            {language === 'sw' ? 'Anaowafuata' : 'Following'} ({followingIds.length})
          </button>
        </div>

        {/* List */}
        <div
          className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-2.5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 rounded-2xl bg-[var(--bg-subtle)] animate-pulse"
                />
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
              {tab === 'followers'
                ? language === 'sw'
                  ? 'Bado hakuna wafuasi.'
                  : 'No followers yet.'
                : language === 'sw'
                ? 'Bado hafuati mtu yeyote.'
                : 'Not following anyone yet.'}
            </div>
          ) : (
            profiles.map((person) => {
              const isMe = person.id === currentUserId;
              const isFollowingPerson = myFollowingIds.includes(person.id);
              const verified = Boolean(person.hasBlueStar || person.isVerifiedByAdmin);

              return (
                <div
                  key={person.id}
                  className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectUserProfile(person.id);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <Avatar
                      uid={person.id}
                      src={
                        person.photoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
                      }
                      alt={person.displayName}
                      fallbackName={person.displayName}
                      size={44}
                      showStatus={true}
                      targetProfile={person}
                      className="border border-[var(--border-hairline)] rounded-full"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] truncate">
                          {person.displayName || 'Waver'}
                        </span>
                        {verified && (
                          <CheckCircle2 size={13} className="text-[#2563EB] shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)] block truncate">
                        {person.username?.startsWith('@')
                          ? person.username
                          : `@${person.username || 'waver'}`}
                      </span>
                    </div>
                  </button>

                  {!isMe && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleFollow(person.id, person.displayName)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition cursor-pointer ${
                          isFollowingPerson
                            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                            : 'bg-[var(--accent-primary)] text-white'
                        }`}
                      >
                        {isFollowingPerson ? (
                          <>
                            <UserCheck size={13} />
                            <span>{language === 'sw' ? 'Unafuata' : 'Following'}</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={13} />
                            <span>{language === 'sw' ? 'Fuata' : 'Follow'}</span>
                          </>
                        )}
                      </button>

                      {onStartChatWithUser && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onStartChatWithUser(person.id);
                          }}
                          aria-label={`Message ${person.displayName}`}
                          className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                        >
                          <MessageCircle size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

interface ProfilePostViewerModalProps {
  isOpen: boolean;
  posts: Post[];
  initialPostId: string | null;
  onClose: () => void;
  currentUserId?: string;
  pinnedPostId?: string;
  savedPostIds: string[];
  isOwnProfile: boolean;
  language: 'en' | 'sw';
  onTogglePinPost: (postId: string) => Promise<void>;
  onToggleSavePost: (postId: string) => Promise<boolean>;
  onPostUpdated: (updatedPost: Post) => void;
}

export const ProfilePostViewerModal: React.FC<ProfilePostViewerModalProps> = ({
  isOpen,
  posts,
  initialPostId,
  onClose,
  currentUserId,
  pinnedPostId,
  savedPostIds,
  isOwnProfile,
  language,
  onTogglePinPost,
  onToggleSavePost,
  onPostUpdated
}) => {
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!isOpen || !initialPostId) return;
    const timer = setTimeout(() => {
      const el = cardRefs.current[initialPostId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [isOpen, initialPostId]);

  useBottomSheetLock(isOpen, 'profile-post-viewer');

  if (!isOpen) return null;

  const handleToggleLike = async (post: Post) => {
    if (!currentUserId) return;
    const existingLikes = Array.isArray(post.likes) ? post.likes : [];
    const alreadyLiked = existingLikes.includes(currentUserId);
    const nextLikes = alreadyLiked
      ? existingLikes.filter((id) => id !== currentUserId)
      : [...existingLikes, currentUserId];
    const nextCount = Math.max(0, nextLikes.length);

    const updated: Post = {
      ...post,
      likes: nextLikes,
      likesCount: nextCount
    };
    onPostUpdated(updated);

    try {
      await setDoc(
        doc(db, 'posts', post.id),
        {
          likes: nextLikes,
          likesCount: nextCount,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch {
      // ignore offline
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-md flex flex-col"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="px-4 sm:px-6 py-3.5 bg-[var(--bg-surface)] border-b border-[var(--border-hairline)] flex items-center justify-between shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--accent-primary)]" />
          <h3 className="font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
            {language === 'sw' ? 'Machapisho ya Wasifu' : 'Profile Posts'} ({posts.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close post viewer"
          className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
        >
          <X size={16} />
          <span>{language === 'sw' ? 'Funga' : 'Close'}</span>
        </button>
      </div>

      {/* Scrollable Feed of User's Posts */}
      <div
        className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 max-w-2xl w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {posts.map((post) => {
          const isLiked = Boolean(currentUserId && post.likes?.includes(currentUserId));
          const isSaved = savedPostIds.includes(post.id);
          const isPinned = pinnedPostId === post.id;
          const images =
            Array.isArray(post.imageUrls) && post.imageUrls.length > 0
              ? post.imageUrls
              : post.imageUrl
              ? [post.imageUrl]
              : [];

          return (
            <article
              key={post.id}
              ref={(el) => {
                cardRefs.current[post.id] = el;
              }}
              className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-lg overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    uid={post.authorId}
                    src={
                      post.authorPhotoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`
                    }
                    alt={post.authorName}
                    fallbackName={post.authorName}
                    size={40}
                    showStatus={true}
                    className="border border-[var(--border-hairline)] rounded-full"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                        {post.authorName}
                      </span>
                      {isPinned && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-extrabold inline-flex items-center gap-1">
                          <Pin size={10} />
                          {language === 'sw' ? 'Imebandikwa' : 'Pinned'}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">
                      {new Date(post.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>

                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => onTogglePinPost(post.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition cursor-pointer ${
                      isPinned
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                    }`}
                  >
                    <Pin size={13} />
                    <span>
                      {isPinned
                        ? language === 'sw'
                          ? 'Ondoa Pin'
                          : 'Unpin'
                        : language === 'sw'
                        ? 'Bandika Juu'
                        : 'Pin to Top'}
                    </span>
                  </button>
                )}
              </div>

              {/* Post Text */}
              {post.content && (
                <div className="px-4 pb-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                  {post.content}
                </div>
              )}

              {/* Media */}
              {post.videoUrl ? (
                <div className="w-full bg-black max-h-[480px] flex items-center justify-center overflow-hidden">
                  <video
                    src={post.videoUrl}
                    poster={post.thumbnailUrl || post.imageUrl}
                    controls
                    playsInline
                    className="w-full max-h-[480px] object-contain"
                  />
                </div>
              ) : images.length > 0 ? (
                <div
                  className={`grid gap-1 bg-black/5 ${
                    images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {images.map((imgUrl, idx) => (
                    <img
                      key={idx}
                      src={imgUrl}
                      alt={`${post.authorName} post media ${idx + 1}`}
                      className="w-full max-h-[460px] object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : null}

              {/* Action Bar */}
              <div className="p-3.5 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(post)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                      isLiked
                        ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    <Heart size={15} className={isLiked ? 'fill-rose-500 text-rose-500' : ''} />
                    <span>{post.likesCount || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCommentPost(post)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <MessageCircle size={15} />
                    <span>{post.commentsCount || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSharePost(post)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Share2 size={15} />
                    <span>{language === 'sw' ? 'Shiriki' : 'Share'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleSavePost(post.id)}
                  aria-label="Save post"
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 border transition cursor-pointer ${
                    isSaved
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                  }`}
                >
                  <Bookmark size={15} className={isSaved ? 'fill-white' : ''} />
                  <span>{isSaved ? (language === 'sw' ? 'Imehifadhiwa' : 'Saved') : language === 'sw' ? 'Hifadhi' : 'Save'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Comments & Share Bottom Sheets / Desktop Modals */}
      {activeCommentPost && (
        <CommentsSheet
          isOpen={true}
          onClose={() => setActiveCommentPost(null)}
          post={activeCommentPost}
        />
      )}

      {activeSharePost && (
        <ShareSheet
          isOpen={true}
          onClose={() => setActiveSharePost(null)}
          post={activeSharePost}
        />
      )}
    </div>
  );
};

interface StoryHighlightsBarProps {
  profile: UserProfile | null;
  activeSparks: Spark[];
  isOwnProfile: boolean;
  language: 'en' | 'sw';
  onSaveHighlights: (highlights: StoryHighlightItem[]) => Promise<void>;
}

export const StoryHighlightsBar: React.FC<StoryHighlightsBarProps> = ({
  profile,
  activeSparks,
  isOwnProfile,
  language,
  onSaveHighlights
}) => {
  const [viewingHighlight, setViewingHighlight] = useState<StoryHighlightItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState<boolean>(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string>('');

  useBottomSheetLock(Boolean(viewingHighlight || isAddModalOpen), 'profile-highlight-modal');

  const savedHighlights = Array.isArray(profile?.storyHighlights)
    ? profile!.storyHighlights!
    : [];

  // Combine saved highlights + active 24h Sparks so the row always feels alive
  const sparkHighlights: StoryHighlightItem[] = activeSparks.slice(0, 6).map((sp) => ({
    id: `spark_${sp.id}`,
    title: sp.legendaryTag || (language === 'sw' ? 'Spark Mpya' : '24h Spark'),
    coverUrl: sp.thumbnailUrl || sp.mediaUrl,
    mediaUrl: sp.mediaUrl,
    mediaType: sp.mediaType,
    sparkId: sp.id,
    createdAt: sp.createdAt
  }));

  const combinedHighlights = [...savedHighlights, ...sparkHighlights];

  if (combinedHighlights.length === 0 && !isOwnProfile) {
    return null;
  }

  const handleUploadHighlightImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const res = await uploadImageToCloudinary(file);
      setCustomCoverUrl(res.secureUrl);
    } catch {
      // ignore
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim() || (language === 'sw' ? 'Kumbukumbu' : 'Moments');
    const chosenCover =
      customCoverUrl ||
      activeSparks[0]?.thumbnailUrl ||
      activeSparks[0]?.mediaUrl ||
      profile?.photoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${profile?.id || 'highlight'}`;

    const item: StoryHighlightItem = {
      id: `hl_${Date.now()}`,
      title: cleanTitle.slice(0, 24),
      coverUrl: chosenCover,
      mediaUrl: chosenCover,
      mediaType: 'image',
      createdAt: new Date().toISOString()
    };

    await onSaveHighlights([item, ...savedHighlights]);
    setNewTitle('');
    setCustomCoverUrl('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-3.5 sm:p-4 shadow-2xs">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <span className="text-xs font-extrabold text-[var(--text-primary)]">
          {language === 'sw' ? 'Kumbukumbu za Sparks (Highlights)' : 'Story Highlights'}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)]">
          {combinedHighlights.length}{' '}
          {language === 'sw' ? 'zilizohifadhiwa' : 'saved'}
        </span>
      </div>

      <div className="flex items-center gap-3.5 overflow-x-auto pb-1 no-scrollbar">
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
          >
            <div className="w-15 h-15 rounded-full bg-[var(--bg-subtle)] border-2 border-dashed border-[var(--accent-primary)]/60 group-hover:border-[var(--accent-primary)] flex items-center justify-center text-[var(--accent-primary)] transition">
              <Plus size={22} />
            </div>
            <span className="text-[11px] font-bold text-[var(--text-secondary)] max-w-[68px] truncate">
              {language === 'sw' ? 'Mpya' : 'New'}
            </span>
          </button>
        )}

        {combinedHighlights.map((hl) => (
          <button
            key={hl.id}
            type="button"
            onClick={() => setViewingHighlight(hl)}
            className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
          >
            <div className="w-15 h-15 rounded-full p-0.5 bg-gradient-to-tr from-[var(--accent-primary)] to-[var(--accent-secondary)] shadow-xs group-hover:scale-105 transition">
              <img
                src={
                  hl.coverUrl ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${hl.id}`
                }
                alt={hl.title}
                className="w-full h-full rounded-full object-cover border-2 border-[var(--bg-surface)] bg-[var(--bg-subtle)]"
              />
            </div>
            <span className="text-[11px] font-bold text-[var(--text-primary)] max-w-[72px] truncate">
              {hl.title}
            </span>
          </button>
        ))}
      </div>

      {/* Highlight Viewer Modal */}
      {viewingHighlight && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setViewingHighlight(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-stone-950 border border-white/15 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent absolute top-0 inset-x-0 z-10">
              <span className="text-xs font-extrabold text-white px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-xs">
                {viewingHighlight.title}
              </span>
              <button
                type="button"
                onClick={() => setViewingHighlight(null)}
                aria-label="Close highlight"
                className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="aspect-[9/14] w-full bg-black flex items-center justify-center">
              {viewingHighlight.mediaType === 'video' ? (
                <video
                  src={viewingHighlight.mediaUrl || viewingHighlight.coverUrl}
                  autoPlay
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={viewingHighlight.mediaUrl || viewingHighlight.coverUrl}
                  alt={viewingHighlight.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Highlight Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsAddModalOpen(false)}
        >
          <form
            onSubmit={handleCreateHighlight}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-[var(--text-primary)]">
                {language === 'sw' ? 'Ongeza Kumbukumbu Mpya' : 'New Story Highlight'}
              </h4>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-[var(--text-secondary)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                {language === 'sw' ? 'Jina la Kumbukumbu' : 'Highlight Title'}
              </label>
              <input
                type="text"
                required
                maxLength={24}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={language === 'sw' ? 'mf. Safari, Familia, Kazi' : 'e.g. Travel, Family, Music'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                {language === 'sw' ? 'Picha ya Jalada' : 'Highlight Photo'}
              </label>
              <label className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--accent-primary)] flex items-center justify-center gap-2 cursor-pointer">
                <Plus size={15} />
                <span>
                  {uploadingCover
                    ? language === 'sw'
                      ? 'Inapakia...'
                      : 'Uploading...'
                    : customCoverUrl
                    ? language === 'sw'
                      ? 'Picha Imechaguliwa ✓'
                      : 'Photo Ready ✓'
                    : language === 'sw'
                    ? 'Chagua Picha'
                    : 'Choose Photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadHighlightImage}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={uploadingCover}
              className="w-full min-h-[44px] rounded-xl bg-[var(--accent-primary)] text-white text-xs font-extrabold transition disabled:opacity-50 cursor-pointer"
            >
              {language === 'sw' ? 'Hifadhi Kumbukumbu' : 'Add Highlight'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
