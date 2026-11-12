import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { db, batchCacheUserProfiles } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ActiveTab, UserProfile, CreatorChallenge } from '../types';
import { LegalModal, LegalDocType } from './LegalModals';
import { triggerHaptic } from '../utils/haptics';
import { Avatar } from './Avatar';
import {
  TrendingUp,
  Trophy,
  UserPlus,
  Clock,
  Sparkles,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowRight
} from 'lucide-react';

interface RightSidebarProps {
  onNavigateTab: (tab: ActiveTab) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onJoinChallenge?: (hashtag: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DEFAULT_TRENDING_TAGS = [
  { tag: '#WaveLinkTZ', count: '18.4k waves', growth: '+32%' },
  { tag: '#BongoFlava', count: '14.2k waves', growth: '+28%' },
  { tag: '#WaveHustleTZ', count: '9.8k waves', growth: '+45%' },
  { tag: '#KitengeFashion', count: '6.4k waves', growth: '+19%' },
  { tag: '#AmapianoEast', count: '4.2k waves', growth: '+15%' }
];

export const RightSidebar: React.FC<RightSidebarProps> = ({
  onNavigateTab,
  onSelectHashtag,
  onJoinChallenge,
  isCollapsed: controlledCollapsed,
  onToggleCollapse
}) => {
  const { currentUser, userProfile, updateUserProfile } = useAuth();
  const { t } = useLanguage();
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  const [activeChallenge, setActiveChallenge] = useState<CreatorChallenge | null>(null);
  const [suggestedCreators, setSuggestedCreators] = useState<UserProfile[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>(userProfile?.followingIds || []);

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_right_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  useEffect(() => {
    try {
      localStorage.setItem('wavelink_right_sidebar_collapsed', String(isCollapsed));
    } catch {
      // ignore
    }
  }, [isCollapsed]);

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  useEffect(() => {
    if (userProfile?.followingIds) {
      setFollowedIds(userProfile.followingIds);
    }
  }, [userProfile?.followingIds]);

  // Load weekly challenge & suggested creators with light queries
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // 1. Weekly challenge
      try {
        const qChallenge = query(collection(db, 'creator_challenges'), orderBy('createdAt', 'desc'), limit(1));
        const snapChallenge = await getDocs(qChallenge);
        if (!isMounted) return;
        if (!snapChallenge.empty) {
          const d = snapChallenge.docs[0];
          setActiveChallenge({ id: d.id, ...d.data() } as CreatorChallenge);
        } else {
          setActiveChallenge({
            id: 'default_weekly',
            theme: 'Best Campus & Daily Hustle Moment',
            themeSw: 'Wakati Bora wa Chuo au Mihangaiko ya Kila Siku',
            hashtag: '#WaveHustleTZ',
            description: 'Share a photo or reel showing your daily hustle or school life.',
            deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
            createdBy: 'admin',
            createdAt: new Date().toISOString()
          });
        }
      } catch {
        if (isMounted) {
          setActiveChallenge({
            id: 'default_weekly',
            theme: 'Best Campus & Daily Hustle Moment',
            themeSw: 'Wakati Bora wa Chuo au Mihangaiko ya Kila Siku',
            hashtag: '#WaveHustleTZ',
            description: 'Share a photo or reel showing your daily hustle or school life.',
            deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
            createdBy: 'admin',
            createdAt: new Date().toISOString()
          });
        }
      }

      // 2. Suggested creators
      if (currentUser?.uid) {
        try {
          const qUsers = query(collection(db, 'users'), limit(8));
          const snapUsers = await getDocs(qUsers);
          if (!isMounted) return;
          const list: UserProfile[] = [];
          snapUsers.forEach((d) => {
            const u = { ...(d.data() as UserProfile), id: d.id };
            if (u.id !== currentUser.uid && !followedIds.includes(u.id)) {
              list.push(u);
            }
          });
          batchCacheUserProfiles(list);
          setSuggestedCreators(list.slice(0, 4));
        } catch {
          // ignore
        }
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  const handleToggleFollow = async (creator: UserProfile) => {
    if (!currentUser?.uid) return;
    triggerHaptic('light');
    const isCurrentlyFollowing = followedIds.includes(creator.id);
    const nextFollowed = isCurrentlyFollowing
      ? followedIds.filter((id) => id !== creator.id)
      : [...followedIds, creator.id];

    setFollowedIds(nextFollowed);

    try {
      await updateUserProfile({ followingIds: nextFollowed });
      const userRef = doc(db, 'users', currentUser.uid);
      const targetRef = doc(db, 'users', creator.id);

      if (isCurrentlyFollowing) {
        await updateDoc(userRef, { followingIds: arrayRemove(creator.id) });
        await updateDoc(targetRef, { followerIds: arrayRemove(currentUser.uid) }).catch(() => {});
      } else {
        await updateDoc(userRef, { followingIds: arrayUnion(creator.id) });
        await updateDoc(targetRef, { followerIds: arrayUnion(currentUser.uid) }).catch(() => {});
      }
    } catch {
      setFollowedIds(followedIds);
    }
  };

  return (
    <aside
      aria-label="Trending and suggestions"
      className={`wavelink-right-panel hidden lg:block shrink-0 sticky top-16 h-[calc(100dvh-4.5rem)] transition-all duration-300 ease-in-out ${
        isCollapsed ? 'wavelink-right-panel--collapsed' : 'wavelink-right-panel--expanded'
      }`}
    >
      {isCollapsed ? (
        /* Slim Collapsed Strip */
        <div className="flex flex-col items-center gap-3 py-4 px-2 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xs">
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-label="Expand right panel"
            title="Expand Trending & Challenges"
            className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center justify-center transition active:scale-95 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-5 h-px bg-[var(--border-hairline)]" />
          <button
            type="button"
            onClick={handleToggleCollapse}
            title="Trending Topics"
            className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-primary)] flex items-center justify-center transition cursor-pointer"
          >
            <TrendingUp size={16} />
          </button>
          <button
            type="button"
            onClick={handleToggleCollapse}
            title="Weekly Challenge"
            className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center transition cursor-pointer"
          >
            <Trophy size={16} />
          </button>
          <button
            type="button"
            onClick={handleToggleCollapse}
            title="Suggested Creators"
            className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-secondary)] flex items-center justify-center transition cursor-pointer"
          >
            <UserPlus size={16} />
          </button>
        </div>
      ) : (
        /* Full Clean Right Panel (Trending, Challenge, Suggested Creators) */
        <div className="h-full overflow-y-auto space-y-3.5 py-1 pr-1 pl-1 scrollbar-none">
          {/* Collapse Header */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <TrendingUp size={13} className="text-[var(--accent-primary)]" />
              <span>Explore &amp; Trends</span>
            </span>
            <button
              type="button"
              onClick={handleToggleCollapse}
              aria-label="Collapse right sidebar"
              className="text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-0.5 cursor-pointer"
            >
              <span>Hide</span>
              <ChevronRight size={13} />
            </button>
          </div>

          {/* 1. Trending Topics Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={15} className="text-[var(--accent-primary)]" />
                <h3 className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)]">
                  {t('nav.trending')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('trending')}
                className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>All</span>
                <ArrowRight size={11} />
              </button>
            </div>

            <div className="space-y-1.5">
              {DEFAULT_TRENDING_TAGS.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (onSelectHashtag) {
                      onSelectHashtag(item.tag);
                    } else {
                      onNavigateTab('feed');
                    }
                  }}
                  className="w-full text-left py-1.5 px-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] transition group cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] block truncate">
                      {item.tag}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      {item.count}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-md shrink-0">
                    {item.growth}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Weekly Creator Challenge Card */}
          {activeChallenge && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Trophy size={15} className="text-amber-500" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-500">
                    {t('trends.weekly_challenge')}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-medium">
                  <Clock size={10} />
                  <span>5d left</span>
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)] leading-snug">
                  {activeChallenge.theme}
                </h4>
                <span className="inline-block mt-0.5 text-xs font-bold text-[var(--accent-primary)]">
                  {activeChallenge.hashtag}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  if (onJoinChallenge) {
                    onJoinChallenge(activeChallenge.hashtag);
                  } else if (onSelectHashtag) {
                    onSelectHashtag(activeChallenge.hashtag);
                  }
                }}
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                }}
                className="w-full py-2 px-3 rounded-2xl hover:opacity-95 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer"
              >
                <Sparkles size={12} />
                <span>{t('trends.join_challenge')}</span>
              </button>
            </div>
          )}

          {/* 3. Suggested Creators Card */}
          {suggestedCreators.length > 0 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserPlus size={15} className="text-[var(--accent-secondary)]" />
                  <h3 className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)]">
                    Suggested Creators
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('directory')}
                  className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  All
                </button>
              </div>

              <div className="space-y-2">
                {suggestedCreators.map((creator) => {
                  const isFollowing = followedIds.includes(creator.id);
                  return (
                    <div
                      key={creator.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar
                          uid={creator.id}
                          src={
                            creator.photoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${creator.id}`
                          }
                          alt={creator.displayName}
                          fallbackName={creator.displayName}
                          size={32}
                          showStatus={true}
                          targetProfile={creator}
                          ringClassName="ring-2 ring-[var(--accent-primary)]/25"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
                            {creator.displayName || 'Wave Creator'}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] block truncate">
                            {creator.username || `@${creator.displayName?.toLowerCase().replace(/\s+/g, '') || 'creator'}`}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleFollow(creator)}
                        className={`py-1 px-2.5 rounded-xl text-[11px] font-bold transition shrink-0 cursor-pointer ${
                          isFollowing
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)]'
                        }`}
                      >
                        {isFollowing ? (
                          <span className="inline-flex items-center gap-1">
                            <Check size={11} />
                            <span>Following</span>
                          </span>
                        ) : (
                          'Follow'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quiet Footer Links */}
          <div className="px-2 pt-2 pb-4 text-[11px] text-[var(--text-secondary)] space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setLegalDoc('privacy')}
                className="hover:underline hover:text-[var(--text-primary)] cursor-pointer"
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => setLegalDoc('terms')}
                className="hover:underline hover:text-[var(--text-primary)] cursor-pointer"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => setLegalDoc('refund')}
                className="hover:underline hover:text-[var(--text-primary)] cursor-pointer"
              >
                Refund
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('announcements')}
                className="hover:underline hover:text-[var(--text-primary)] cursor-pointer"
              >
                Notice Board
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)]">WaveLink © 2026. Empowering African Creators.</p>
          </div>
        </div>
      )}

      {legalDoc && (
        <LegalModal
          isOpen={true}
          initialDoc={legalDoc}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </aside>
  );
};
