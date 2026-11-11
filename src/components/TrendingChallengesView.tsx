import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { db, cleanFirestoreData, getAuthHeaders, batchCacheUserProfiles, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { Post, CreatorChallenge, UserProfile, CreatorSpotlight, Announcement, AfricanCountryCode } from '../types';
import { CrystalBadge, registerActiveWeeklyWinner } from './CrystalBadge';
import { sendNotification } from '../services/notificationService';
import { INTEREST_CATALOG } from './InterestPickerModal';
import { QuotaExceededBanner } from './QuotaExceededBanner';
import {
  AFRICAN_COUNTRIES,
  DEFAULT_CREATOR_SPOTLIGHT,
  getAfricanCountryMeta,
  formatEventInViewerLocalTime
} from '../utils/africanCultureConfig';
import {
  Flame,
  Trophy,
  TrendingUp,
  Hash,
  Share2,
  Heart,
  MessageCircle,
  Clock,
  Sparkles,
  Plus,
  Bell,
  Award,
  ShieldCheck,
  ArrowUpRight,
  Calendar,
  MapPin,
  Edit3,
  RefreshCw
} from 'lucide-react';

interface TrendingChallengesViewProps {
  onSelectHashtag?: (hashtag: string) => void;
  onJoinChallengeWithTag?: (hashtag: string) => void;
  onOpenAdminPanel?: () => void;
}

const DEFAULT_WEEKLY_CHALLENGES: CreatorChallenge[] = [
  {
    id: 'challenge_weekly_default_1',
    theme: 'Best Campus & Daily Hustle Moment',
    themeSw: 'Wakati Bora wa Chuo au Mihangaiko ya Kila Siku',
    hashtag: '#WaveHustleTZ',
    description:
      'Share a short photo or video reel showing your daily hustle, school life, or creative work! Top creator by authentic reactions & shares wins the Weekly Winner badge on their profile for 7 days.',
    descriptionSw:
      'Shiriki picha au video fupi ikionyesha mihangaiko yako ya kila siku, maisha ya chuo au kazi yako ya ubunifu! Mshindi kwa likes na shares halali atapata beji ya Mshindi wa Wiki kwa siku 7.',
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    createdBy: 'admin',
    createdByName: 'WaveLink Admin',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Client-side rate limit helper against spam shares/reactions per post per user
const MAX_SHARES_PER_POST_PER_DAY = 3;

export function canUserCountShareForLeaderboard(userId: string, postId: string): boolean {
  if (typeof window === 'undefined' || !userId || !postId) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `wavelink_share_limit_${today}_${userId}_${postId}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    if (current >= MAX_SHARES_PER_POST_PER_DAY) {
      return false;
    }
    localStorage.setItem(key, String(current + 1));
    return true;
  } catch {
    return true;
  }
}

/**
 * Computes anti-spam verified engagement score for a post:
 * - Deduplicates unique user IDs in `likes` and `reactions`
 * - Excludes self-likes/self-shares by the post author
 * - Caps counted shares per post to prevent bot/script inflation
 */
export function computeAntiSpamPostScore(post: Post): {
  uniqueReactions: number;
  verifiedShares: number;
  comments: number;
  totalScore: number;
} {
  const uniqueReactorIds = new Set<string>();
  if (Array.isArray(post.likes)) {
    post.likes.forEach((uid) => {
      if (uid && uid !== post.authorId) uniqueReactorIds.add(uid);
    });
  }
  if (post.reactions && typeof post.reactions === 'object') {
    Object.values(post.reactions).forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((uid) => {
          if (uid && uid !== post.authorId) uniqueReactorIds.add(uid);
        });
      }
    });
  }

  const fallbackReactions = Math.min(
    post.likesCount || 0,
    Math.max(uniqueReactorIds.size, Math.min(50, post.likesCount || 0))
  );
  const uniqueReactions = Math.max(uniqueReactorIds.size, fallbackReactions);

  const uniqueSharerIds = new Set<string>();
  if (Array.isArray(post.sharedBy)) {
    post.sharedBy.forEach((uid) => {
      if (uid && uid !== post.authorId) uniqueSharerIds.add(uid);
    });
  }
  const rawShares = typeof post.sharesCount === 'number' ? post.sharesCount : uniqueSharerIds.size;
  // Anti-spam cap: max 40 counted shares per single post unless backed by unique user IDs
  const verifiedShares = Math.min(
    Math.max(uniqueSharerIds.size, rawShares),
    Math.max(uniqueSharerIds.size + 5, 40)
  );

  const comments = Math.min(post.commentsCount || 0, 50);
  const totalScore = uniqueReactions * 2 + verifiedShares * 3 + comments;

  return {
    uniqueReactions,
    verifiedShares,
    comments,
    totalScore
  };
}

export const TrendingChallengesView: React.FC<TrendingChallengesViewProps> = ({
  onSelectHashtag,
  onJoinChallengeWithTag,
  onOpenAdminPanel
}) => {
  const { currentUser, userProfile, isAdmin, showGlobalToast } = useAuth();
  const { language, t } = useLanguage();

  const [posts, setPosts] = useState<Post[]>([]);
  const [challenges, setChallenges] = useState<CreatorChallenge[]>(DEFAULT_WEEKLY_CHALLENGES);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const [remindedChallengeIds, setRemindedChallengeIds] = useState<string[]>([]);
  const [isAwardingWinner, setIsAwardingWinner] = useState(false);

  // Admin quick challenge creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTheme, setNewTheme] = useState('');
  const [newHashtag, setNewHashtag] = useState('#');
  const [newDesc, setNewDesc] = useState('');
  const [newDays, setNewDays] = useState('7');
  const [isSavingChallenge, setIsSavingChallenge] = useState(false);

  // Creator Spotlight of the Week state
  const [spotlight, setSpotlight] = useState<CreatorSpotlight>(DEFAULT_CREATOR_SPOTLIGHT);
  const [showSpotlightModal, setShowSpotlightModal] = useState(false);
  const [spotName, setSpotName] = useState('');
  const [spotUsername, setSpotUsername] = useState('@');
  const [spotCountry, setSpotCountry] = useState<AfricanCountryCode>('TZ');
  const [spotCategory, setSpotCategory] = useState('Bongo Flava & Acoustic Music');
  const [spotHeadlineEn, setSpotHeadlineEn] = useState('');
  const [spotHeadlineSw, setSpotHeadlineSw] = useState('');
  const [isSavingSpotlight, setIsSavingSpotlight] = useState(false);

  // Trending category filter
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Community Events (Local Time) state
  const [communityEvents, setCommunityEvents] = useState<Announcement[]>([]);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [evTitle, setBpEvTitle] = useState('');
  const [evBody, setBpEvBody] = useState('');
  const [evDate, setBpEvDate] = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const [evTime, setBpEvTime] = useState('16:00');
  const [evLocation, setBpEvLocation] = useState('Dar es Salaam / Online');
  const [evCountry, setBpEvCountry] = useState<AfricanCountryCode>('TZ');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLeaderboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoadingData(true);
    }

    try {
      // 1. Posts query: bounded to 35 most recent posts
      const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(35));
      // 2. Challenges query: bounded to 8 challenges
      const qChallenges = query(collection(db, 'challenges'), orderBy('createdAt', 'desc'), limit(8));
      // 3. Users query: bounded to 30 active creators
      const qUsers = query(collection(db, 'users'), limit(30));
      // 4. Spotlight document
      const docSpotlightRef = doc(db, 'creatorSpotlights', 'current');
      // 5. Events query: bounded to 6 announcements
      const qEvents = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(6));

      const [postsSnap, challengesSnap, usersSnap, spotlightSnap, eventsSnap] = await Promise.allSettled([
        getDocs(qPosts),
        getDocs(qChallenges),
        getDocs(qUsers),
        getDoc(docSpotlightRef),
        getDocs(qEvents)
      ]);

      if (postsSnap.status === 'fulfilled') {
        const list: Post[] = [];
        postsSnap.value.forEach((d) => list.push({ id: d.id, ...d.data() } as Post));
        setPosts(list);
      } else {
        handleFirestoreError(postsSnap.reason, OperationType.LIST, 'posts');
      }

      if (challengesSnap.status === 'fulfilled') {
        const list: CreatorChallenge[] = [];
        challengesSnap.value.forEach((d) => {
          const data = { id: d.id, ...d.data() } as CreatorChallenge;
          list.push(data);
          if (data.winnerUserId && data.winnerBadgeUntil) {
            registerActiveWeeklyWinner(data.winnerUserId, data.winnerBadgeUntil);
          }
        });
        if (list.length > 0) {
          setChallenges(list);
        }
      } else {
        handleFirestoreError(challengesSnap.reason, OperationType.LIST, 'challenges');
      }

      if (usersSnap.status === 'fulfilled') {
        const map: Record<string, UserProfile> = {};
        const profileList: UserProfile[] = [];
        usersSnap.value.forEach((d) => {
          const u = { id: d.id, ...d.data() } as UserProfile;
          map[d.id] = u;
          profileList.push(u);
          if (u.weeklyWinnerUntil) {
            registerActiveWeeklyWinner(u.id, u.weeklyWinnerUntil);
            if (u.email) registerActiveWeeklyWinner(u.email, u.weeklyWinnerUntil);
          }
        });
        setUsersMap(map);
        batchCacheUserProfiles(profileList);
      } else {
        handleFirestoreError(usersSnap.reason, OperationType.LIST, 'users');
      }

      if (spotlightSnap.status === 'fulfilled' && spotlightSnap.value.exists()) {
        setSpotlight({ id: spotlightSnap.value.id, ...spotlightSnap.value.data() } as CreatorSpotlight);
      }

      if (eventsSnap.status === 'fulfilled') {
        const evs: Announcement[] = [];
        eventsSnap.value.forEach((d) => {
          evs.push({ id: d.id, ...d.data() } as Announcement);
        });
        setCommunityEvents(evs);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'leaderboardData');
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboardData(false);
  }, [loadLeaderboardData]);

  // 1. Hashtags growing fastest today
  const trendingHashtags = useMemo(() => {
    const tagStats = new Map<string, { tag: string; postsCount: number; velocityScore: number }>();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    posts.forEach((p) => {
      const ageMs = Math.max(0, now - new Date(p.createdAt || now).getTime());
      const isToday = ageMs <= oneDayMs * 2;
      const { totalScore } = computeAntiSpamPostScore(p);
      const boostMultiplier = isToday ? 2.5 : 1;

      const extractedTags = new Set<string>();
      if (Array.isArray(p.hashtags)) {
        p.hashtags.forEach((h) => {
          const clean = h.startsWith('#') ? h : `#${h}`;
          if (clean.length > 1) extractedTags.add(clean);
        });
      }
      const regexMatches = (p.content || '').match(/#[a-zA-Z0-9_]+/g);
      if (regexMatches) {
        regexMatches.forEach((m) => extractedTags.add(m));
      }

      extractedTags.forEach((rawTag) => {
        const key = rawTag.toLowerCase();
        const existing = tagStats.get(key) || {
          tag: rawTag,
          postsCount: 0,
          velocityScore: 0
        };
        existing.postsCount += 1;
        existing.velocityScore += Math.round((totalScore + 3) * boostMultiplier);
        tagStats.set(key, existing);
      });
    });

    const sorted = Array.from(tagStats.values()).sort((a, b) => b.velocityScore - a.velocityScore);
    if (sorted.length >= 4) return sorted.slice(0, 8);

    // Fallback trending tags if few posts have hashtags yet
    const defaults = [
      { tag: '#WaveHustleTZ', postsCount: 14, velocityScore: 96 },
      { tag: '#WaveLinkTZ', postsCount: 28, velocityScore: 88 },
      { tag: '#BongoFlava', postsCount: 19, velocityScore: 74 },
      { tag: '#SokaTZ', postsCount: 15, velocityScore: 65 },
      { tag: '#CampusVibes', postsCount: 11, velocityScore: 52 },
      { tag: '#ComedyTZ', postsCount: 9, velocityScore: 44 }
    ];
    for (const d of defaults) {
      if (!sorted.some((s) => s.tag.toLowerCase() === d.tag.toLowerCase())) {
        sorted.push(d);
      }
    }
    return sorted.slice(0, 8);
  }, [posts]);

  // 2. Posts growing fastest today
  const fastestGrowingPosts = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return [...posts]
      .map((post) => {
        const ageMs = Math.max(1, now - new Date(post.createdAt || now).getTime());
        const recencyWeight = ageMs <= dayMs ? 2.2 : ageMs <= 3 * dayMs ? 1.4 : 0.8;
        const metrics = computeAntiSpamPostScore(post);
        const growthScore = Math.round((metrics.totalScore + 2) * recencyWeight);
        return { post, metrics, growthScore };
      })
      .sort((a, b) => b.growthScore - a.growthScore)
      .slice(0, 6);
  }, [posts]);

  // 3. Weekly Leaderboard (Reactions + Shares over last 7 days, spam-protected)
  const weeklyLeaderboard = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const creatorScores = new Map<
      string,
      {
        userId: string;
        name: string;
        username?: string;
        email?: string;
        photoURL?: string;
        reactions: number;
        shares: number;
        postsCount: number;
        score: number;
      }
    >();

    posts.forEach((p) => {
      if (!p.authorId || p.authorId === 'wavelink_support_bot') return;
      const ageMs = now - new Date(p.createdAt || now).getTime();
      if (ageMs > sevenDaysMs) return;

      const currentCreatorPosts = creatorScores.get(p.authorId)?.postsCount || 0;
      // Anti-spam rule: only a creator's top 10 posts in a week count toward leaderboard
      if (currentCreatorPosts >= 10) return;

      const { uniqueReactions, verifiedShares } = computeAntiSpamPostScore(p);
      const postScore = uniqueReactions * 2 + verifiedShares * 3 + 2;

      const profile = usersMap[p.authorId];
      const existing = creatorScores.get(p.authorId) || {
        userId: p.authorId,
        name: profile?.displayName || p.authorName || 'Creator',
        username: profile?.username || p.authorUsername,
        email: profile?.email || p.authorEmail,
        photoURL: profile?.photoURL || p.authorPhotoURL,
        reactions: 0,
        shares: 0,
        postsCount: 0,
        score: 0
      };

      existing.reactions += uniqueReactions;
      existing.shares += verifiedShares;
      existing.postsCount += 1;
      existing.score += postScore;
      creatorScores.set(p.authorId, existing);
    });

    const ranked = Array.from(creatorScores.values()).sort((a, b) => b.score - a.score);
    // Register #1 leader for the Weekly Winner badge preview
    if (ranked.length > 0) {
      registerActiveWeeklyWinner(ranked[0].userId);
    }
    return ranked.slice(0, 10);
  }, [posts, usersMap]);

  const activeChallenge = challenges.find((c) => c.status === 'active') || challenges[0] || DEFAULT_WEEKLY_CHALLENGES[0];

  const formatDeadlineRemaining = (deadlineIso: string) => {
    const diff = new Date(deadlineIso).getTime() - Date.now();
    if (!Number.isFinite(diff) || diff <= 0) {
      return language === 'sw' ? 'Imekamilika' : 'Ended';
    }
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) {
      return language === 'sw' ? `Siku ${days} na saa ${hours} zimebaki` : `${days}d ${hours}h left`;
    }
    return language === 'sw' ? `Saa ${Math.max(1, hours)} zimebaki` : `${Math.max(1, hours)}h left`;
  };

  const handleSharePost = async (post: Post) => {
    if (!currentUser) return;
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    const shareText = `${post.authorName} on WaveLink: "${(post.content || '').slice(0, 90)}"`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'WaveLink', text: shareText, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      }
    } catch {
      // user cancelled native share sheet
    }

    // Enforce anti-spam share limit per user per post
    const allowed = canUserCountShareForLeaderboard(currentUser.uid, post.id);
    if (!allowed) {
      showGlobalToast(t('trends.share_limit_toast'));
      return;
    }

    try {
      if (currentUser.uid !== post.authorId) {
        await updateDoc(doc(db, 'posts', post.id), {
          sharesCount: (post.sharesCount || 0) + 1,
          sharedBy: arrayUnion(currentUser.uid),
          updatedAt: new Date().toISOString()
        });
      }
      // Also notify server anti-spam share endpoint
      const headers = await getAuthHeaders();
      fetch('/api/challenges/record-share', {
        method: 'POST',
        headers,
        body: JSON.stringify({ postId: post.id, authorId: post.authorId })
      }).catch(() => {});

      showGlobalToast(t('trends.shared_toast'));
    } catch {
      showGlobalToast(t('trends.shared_toast'));
    }
  };

  const handleSetChallengeReminder = async (challenge: CreatorChallenge) => {
    if (!currentUser) return;
    if (remindedChallengeIds.includes(challenge.id)) return;
    setRemindedChallengeIds((prev) => [...prev, challenge.id]);

    await sendNotification({
      recipientId: currentUser.uid,
      actorId: 'wavelink_challenges',
      actorName: 'WaveLink Challenges 🏆',
      type: 'challenge_reminder',
      title:
        language === 'sw'
          ? `Kikumbusho cha Shindano: ${challenge.hashtag}`
          : `Challenge Reminder: ${challenge.hashtag}`,
      body:
        language === 'sw'
          ? `Usisahau kushiriki kwenye "${challenge.themeSw || challenge.theme}" kabla ya muda kuisha!`
          : `Don't forget to post your entry for "${challenge.theme}" with ${challenge.hashtag} before the deadline!`,
      entityId: challenge.id
    });

    showGlobalToast(
      language === 'sw'
        ? 'Kikumbusho cha shindano kimewekwa! 🔔'
        : 'Challenge reminder scheduled! 🔔'
    );
  };

  const handleAdminAwardWeeklyWinner = async (leader: {
    userId: string;
    name: string;
    username?: string;
    photoURL?: string;
  }) => {
    if (!isAdmin || !currentUser) return;
    setIsAwardingWinner(true);
    try {
      const nextWeekIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await updateDoc(doc(db, 'users', leader.userId), {
        weeklyWinnerUntil: nextWeekIso,
        weeklyWinnerChallengeTitle: activeChallenge.theme,
        weeklyWinnerHashtag: activeChallenge.hashtag,
        updatedAt: new Date().toISOString()
      });

      if (activeChallenge.id && !activeChallenge.id.startsWith('challenge_weekly_default')) {
        await updateDoc(doc(db, 'challenges', activeChallenge.id), {
          winnerUserId: leader.userId,
          winnerName: leader.name,
          winnerUsername: leader.username || '',
          winnerPhotoURL: leader.photoURL || '',
          winnerAwardedAt: new Date().toISOString(),
          winnerBadgeUntil: nextWeekIso
        });
      }

      registerActiveWeeklyWinner(leader.userId, nextWeekIso);

      await sendNotification({
        recipientId: leader.userId,
        actorId: currentUser.uid,
        actorName: 'WaveLink Official 🏆',
        type: 'challenge_reminder',
        title:
          language === 'sw'
            ? 'Hongera! Wewe ni Mshindi wa Wiki 🏆'
            : 'Congratulations! You won the Weekly Challenge 🏆',
        body:
          language === 'sw'
            ? `Umepata beji ya Mshindi wa Wiki kwenye wasifu wako kwa siku 7 zijazo!`
            : `Your profile now displays the Weekly Challenge Winner badge for the next 7 days!`,
        entityId: activeChallenge.id
      });

      showGlobalToast(`🏆 Awarded 7-Day Weekly Winner Badge to ${leader.name}!`);
    } catch (err) {
      console.warn('Award winner notice:', err);
    } finally {
      setIsAwardingWinner(false);
    }
  };

  const handleCreateChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !currentUser || !newTheme.trim() || !newHashtag.trim()) return;
    setIsSavingChallenge(true);
    try {
      const cleanTag = newHashtag.trim().startsWith('#')
        ? newHashtag.trim().replace(/\s+/g, '')
        : `#${newHashtag.trim().replace(/\s+/g, '')}`;
      const daysNum = Math.max(1, Math.min(30, parseInt(newDays, 10) || 7));
      const deadlineIso = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString();
      const challengeId = `challenge_${Date.now()}`;

      const newChallenge: CreatorChallenge = {
        id: challengeId,
        theme: newTheme.trim(),
        hashtag: cleanTag,
        description:
          newDesc.trim() ||
          `Share your best post with ${cleanTag}! Top creator by reactions and shares wins the Weekly Winner profile badge.`,
        deadline: deadlineIso,
        status: 'active',
        createdBy: currentUser.uid,
        createdByName: userProfile?.displayName || 'Admin',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'challenges', challengeId), cleanFirestoreData(newChallenge));
      setShowCreateModal(false);
      setNewTheme('');
      setNewHashtag('#');
      setNewDesc('');
      showGlobalToast(
        language === 'sw'
          ? 'Shindano jipya la wiki limechapishwa! 🏆'
          : 'New Weekly Creator Challenge published! 🏆'
      );
    } catch (err) {
      console.warn('Create challenge error:', err);
    } finally {
      setIsSavingChallenge(false);
    }
  };

  const handleSaveSpotlightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !currentUser || !spotName.trim()) return;
    setIsSavingSpotlight(true);
    try {
      const updatedSpotlight: CreatorSpotlight = {
        id: 'current',
        userId: `spotlight_${Date.now()}`,
        displayName: spotName.trim(),
        username: spotUsername.trim().startsWith('@')
          ? spotUsername.trim()
          : `@${spotUsername.trim()}`,
        photoURL: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(spotName.trim())}`,
        countryCode: spotCountry,
        categoryLabel: spotCategory.trim() || 'East African Creator',
        headlineEn:
          spotHeadlineEn.trim() ||
          `Chosen by the WaveLink Admin Team for authentic East African creativity in ${spotCategory}.`,
        headlineSw:
          spotHeadlineSw.trim() ||
          `Amechaguliwa na Timu ya Admin ya WaveLink kwa ubunifu halisi wa Afrika Mashariki kwenye ${spotCategory}.`,
        chosenByName: userProfile?.displayName || 'WaveLink Admin',
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'creatorSpotlights', 'current'), cleanFirestoreData(updatedSpotlight));
      setSpotlight(updatedSpotlight);
      setShowSpotlightModal(false);
      showGlobalToast(
        language === 'sw'
          ? 'Mbunifu Bora wa Wiki amesasishwa! 🌟'
          : 'Creator Spotlight of the Week updated! 🌟'
      );
    } catch (err) {
      console.warn('Spotlight save notice:', err);
    } finally {
      setIsSavingSpotlight(false);
    }
  };

  const handleCreateCommunityEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !currentUser || !evTitle.trim() || !evBody.trim()) return;
    setIsSavingEvent(true);
    try {
      const eventId = `event_${Date.now()}`;
      const newEvent: Announcement = {
        id: eventId,
        title: evTitle.trim(),
        body: evBody.trim(),
        category: 'event',
        isPinned: false,
        eventDate: evDate,
        eventTime: evTime,
        eventLocation: evLocation.trim() || 'East Africa',
        countryCode: evCountry,
        rsvpUserIds: [currentUser.uid],
        rsvpCount: 1,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || 'WaveLink Admin',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'announcements', eventId), cleanFirestoreData(newEvent));
      setShowCreateEventModal(false);
      setBpEvTitle('');
      setBpEvBody('');
      showGlobalToast(
        language === 'sw'
          ? 'Tukio la Jamii limechapishwa! 📅'
          : 'Community Event published with local time! 📅'
      );
    } catch (err) {
      console.warn('Create event error:', err);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const spotlightCountryMeta = getAfricanCountryMeta(spotlight.countryCode);

  return (
    <div className="max-w-5xl mx-auto py-5 px-3 sm:px-6 space-y-6">
      <QuotaExceededBanner onRetry={() => loadLeaderboardData(true)} />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-stone-500">
          {language === 'sw' ? 'Matokeo na Takwimu za Wiki' : 'Weekly Trends & Live Leaderboard'}
        </span>
        <button
          type="button"
          disabled={isRefreshing || isLoadingData}
          onClick={() => loadLeaderboardData(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-[#0D9488]' : 'text-stone-500'} />
          <span>{isRefreshing ? (language === 'sw' ? 'Inapakia...' : 'Refreshing...') : (language === 'sw' ? 'Sasisha Data' : 'Refresh Data')}</span>
        </button>
      </div>

      {/* 0. Creator Spotlight of the Week (Chosen by Admin) + Subtle Kitenge Border */}
      <div className="bg-white border border-stone-200/90 rounded-3xl overflow-hidden shadow-xs">
        <div className="kitenge-border-strip" />
        <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 kanga-pattern-subtle">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <img
              src={
                spotlight.photoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${spotlight.userId}`
              }
              alt={spotlight.displayName}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shrink-0 kanga-avatar-frame--gold"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                  <Sparkles size={11} className="text-amber-600" />
                  <span>{t('spotlight.badge')}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-[11px] font-bold">
                  <span>{spotlightCountryMeta.flag}</span>
                  <span>
                    {language === 'sw' ? spotlightCountryMeta.nameSw : spotlightCountryMeta.nameEn}
                  </span>
                </span>
                <span className="text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {spotlight.categoryLabel}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-stone-900">
                  {spotlight.displayName}
                </h3>
                {spotlight.username && (
                  <span className="text-xs font-mono font-bold text-[#2563EB]">
                    {spotlight.username}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed max-w-2xl">
                {language === 'sw' ? spotlight.headlineSw : spotlight.headlineEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {spotlight.username && onSelectHashtag && (
              <button
                type="button"
                onClick={() => onSelectHashtag(spotlight.username!)}
                className="px-4 py-2 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold transition cursor-pointer"
              >
                {language === 'sw' ? 'Tazama Machapisho' : 'View Creator Waves'}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSpotName(spotlight.displayName);
                  setSpotUsername(spotlight.username || '@');
                  setSpotCountry(spotlight.countryCode || 'TZ');
                  setSpotCategory(spotlight.categoryLabel);
                  setSpotHeadlineEn(spotlight.headlineEn);
                  setSpotHeadlineSw(spotlight.headlineSw);
                  setShowSpotlightModal(true);
                }}
                className="px-3.5 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 size={13} />
                <span>{t('spotlight.adminPick')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 0B. Trending African Content Categories Bar (Bongo Flava, Amapiano, Afrobeats, Gengetone, Comedy, Football, Fashion, School Life, Small Business, Food, Farming, Faith, Gaming) */}
      <div className="bg-white border border-stone-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-extrabold text-stone-900">
              {language === 'sw'
                ? 'Makundi Yanayovuma Afrika Mashariki'
                : 'East African Trending Content Categories'}
            </h3>
            <p className="text-[11px] text-stone-500">
              {language === 'sw'
                ? 'Gusa kundi kuchuja machapisho au kuona hashtag zake'
                : 'Tap any category to explore Bongo Flava, Amapiano, Afrobeats, Gengetone, Kilimo & more'}
            </p>
          </div>
          {selectedCategoryFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedCategoryFilter('all')}
              className="text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
            >
              {language === 'sw' ? 'Onyesha Yote' : 'Show All'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-2xl text-xs font-extrabold shrink-0 border transition cursor-pointer ${
              selectedCategoryFilter === 'all'
                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-blue-300'
            }`}
          >
            🌍 {language === 'sw' ? 'Yote' : 'All Categories'}
          </button>
          {INTEREST_CATALOG.map((cat) => {
            const active = selectedCategoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter(cat.id);
                  if (onSelectHashtag && cat.hashtags[0]) {
                    onSelectHashtag(cat.hashtags[0]);
                  }
                }}
                className={`px-3 py-1.5 rounded-2xl text-xs font-extrabold shrink-0 border flex items-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-[#0D9488] text-white border-[#0D9488]'
                    : 'bg-stone-50 text-stone-800 border-stone-200 hover:border-teal-300'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{language === 'sw' ? cat.labelSw : cat.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Weekly Creator Challenge Spotlight Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2563EB] via-[#0284C7] to-[#0D9488] text-white p-6 sm:p-7 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-white text-xs font-extrabold uppercase tracking-wider">
                <Trophy size={13} className="text-amber-300" />
                <span>{t('trends.weekly_challenge')}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-100 text-xs font-bold">
                <Clock size={12} />
                <span>
                  {t('trends.deadline')}: {formatDeadlineRemaining(activeChallenge.deadline)}
                </span>
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {language === 'sw' && activeChallenge.themeSw
                ? activeChallenge.themeSw
                : activeChallenge.theme}
            </h2>

            <p className="text-xs sm:text-sm text-blue-50 leading-relaxed">
              {language === 'sw' && activeChallenge.descriptionSw
                ? activeChallenge.descriptionSw
                : activeChallenge.description}
            </p>

            <div className="pt-2 flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (onJoinChallengeWithTag) {
                    onJoinChallengeWithTag(activeChallenge.hashtag);
                  } else if (onSelectHashtag) {
                    onSelectHashtag(activeChallenge.hashtag);
                  }
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-white hover:bg-blue-50 text-[#1D4ED8] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
              >
                <Sparkles size={15} className="text-[#0D9488]" />
                <span>
                  {t('trends.join_challenge')} ({activeChallenge.hashtag})
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSetChallengeReminder(activeChallenge)}
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Bell size={14} />
                <span>
                  {remindedChallengeIds.includes(activeChallenge.id)
                    ? language === 'sw'
                      ? 'Kikumbusho Kimewekwa ✓'
                      : 'Reminder Set ✓'
                    : language === 'sw'
                    ? 'Nikumbushe'
                    : 'Remind Me'}
                </span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{language === 'sw' ? 'Weka Shindano Jipya' : 'Post New Challenge'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Winner Badge Preview Card */}
          <div className="p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-center shrink-0 sm:w-52 space-y-1.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-400/25 border border-amber-300/40 flex items-center justify-center mx-auto text-amber-300">
              <Award size={24} />
            </div>
            <div className="text-xs font-extrabold text-amber-200 uppercase tracking-wider">
              {language === 'sw' ? 'Zawadi ya Mshindi' : 'Winner Prize'}
            </div>
            <div className="text-sm font-black text-white">
              🏆 {t('trends.winner_badge')}
            </div>
            <p className="text-[11px] text-blue-100 leading-snug">
              {language === 'sw'
                ? 'Beji ya dhahabu kwenye wasifu wako kwa wiki 1 nzima!'
                : 'Exclusive gold badge on your profile & posts for the next week!'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Two-Column Layout: Trending Hashtags Today + Weekly Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 cols: Hashtags Growing Fastest Today */}
        <div className="lg:col-span-5 bg-white border border-stone-200/90 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-50 text-[#2563EB]">
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-stone-900">
                  {t('trends.growing_hashtags')}
                </h3>
                <p className="text-[11px] text-stone-500">
                  {language === 'sw' ? 'Gusa hashtag kuona machapisho' : 'Tap any hashtag to explore posts'}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-stone-100">
            {trendingHashtags.map((item, idx) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => onSelectHashtag && onSelectHashtag(item.tag)}
                className="w-full py-3 px-2 hover:bg-stone-50 rounded-xl flex items-center justify-between gap-3 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-600 font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm text-stone-900 group-hover:text-[#2563EB] truncate flex items-center gap-1">
                      <Hash size={13} className="text-[#0D9488] shrink-0" />
                      <span>{item.tag.replace(/^#/, '')}</span>
                    </div>
                    <span className="text-[11px] text-stone-500">
                      {item.postsCount} {language === 'sw' ? 'machapisho' : 'waves today'}
                    </span>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#0D9488] text-[11px] font-extrabold shrink-0">
                  <ArrowUpRight size={12} />
                  <span>+{item.velocityScore}%</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right 7 cols: Weekly Creator Leaderboard */}
        <div className="lg:col-span-7 bg-white border border-stone-200/90 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70">
                <Trophy size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-stone-900">
                  {t('trends.leaderboard')}
                </h3>
                <p className="text-[11px] text-stone-500 leading-snug">
                  {t('trends.leaderboard_desc')}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold">
              <ShieldCheck size={12} className="text-[#0D9488]" />
              <span>{language === 'sw' ? 'Ulinzi Dhidi ya Spam' : 'Anti-Spam Active'}</span>
            </span>
          </div>

          {weeklyLeaderboard.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500 bg-stone-50 rounded-2xl">
              {language === 'sw'
                ? 'Chapisha na ushiriki ili kuingia kwenye orodha ya washindi wa wiki!'
                : 'Post and share waves this week to appear on the Weekly Leaderboard!'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {weeklyLeaderboard.map((entry, idx) => {
                const isFirst = idx === 0;
                return (
                  <div
                    key={entry.userId}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap transition ${
                      isFirst
                        ? 'bg-gradient-to-r from-amber-50/90 via-yellow-50/50 to-teal-50/50 border-amber-300 shadow-2xs'
                        : 'bg-stone-50/70 border-stone-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? 'bg-amber-500 text-white shadow-xs'
                            : idx === 1
                            ? 'bg-stone-300 text-stone-800'
                            : idx === 2
                            ? 'bg-amber-700/80 text-white'
                            : 'bg-white border border-stone-200 text-stone-600'
                        }`}
                      >
                        #{idx + 1}
                      </div>

                      <img
                        src={
                          entry.photoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${entry.userId}`
                        }
                        alt={entry.name}
                        className={`w-10 h-10 rounded-full object-cover shrink-0 ${
                          isFirst ? 'ring-2 ring-amber-400' : 'ring-1 ring-stone-200'
                        }`}
                      />

                      <div className="min-w-0">
                        <CrystalBadge
                          userId={entry.userId}
                          email={entry.email}
                          name={entry.name}
                          isWeeklyWinner={isFirst}
                          size="sm"
                        />
                        <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-0.5 font-medium">
                          <span>❤️ {entry.reactions}</span>
                          <span>🔄 {entry.shares}</span>
                          <span>📝 {entry.postsCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-sm font-black font-mono text-stone-900 block">
                          {entry.score} pts
                        </span>
                        <span className="text-[10px] text-stone-500 block">
                          {language === 'sw' ? 'Alama za Wiki' : 'Weekly Score'}
                        </span>
                      </div>

                      {isAdmin && isFirst && (
                        <button
                          type="button"
                          disabled={isAwardingWinner}
                          onClick={() => handleAdminAwardWeeklyWinner(entry)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] transition cursor-pointer"
                          title="Confirm & Grant 7-Day Winner Badge on Profile"
                        >
                          {isAwardingWinner ? '...' : 'Award 7d Badge'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Posts Growing Fastest Today */}
      <div className="bg-white border border-stone-200/90 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <Flame size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-stone-900">
                {t('trends.growing_posts')}
              </h3>
              <p className="text-xs text-stone-500">
                {language === 'sw'
                  ? 'Machapisho yanayopata likes, maoni na kusambazwa kwa kasi zaidi leo'
                  : 'Posts gaining the most reactions, comments, and shares today'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fastestGrowingPosts.map(({ post, metrics, growthScore }, idx) => (
            <div
              key={post.id}
              className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/80 flex flex-col justify-between gap-3 hover:border-blue-300 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={
                        post.authorPhotoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`
                      }
                      alt={post.authorName}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <CrystalBadge
                        userId={post.authorId}
                        email={post.authorEmail}
                        name={post.authorName}
                        size="sm"
                      />
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-extrabold shrink-0">
                    #{idx + 1} • +{growthScore}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-stone-800 line-clamp-3 leading-relaxed">
                  {post.content || (language === 'sw' ? 'Chapisho la picha/video' : 'Media wave post')}
                </p>
              </div>

              <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-xs text-stone-600">
                <div className="flex items-center gap-3 font-semibold">
                  <span className="inline-flex items-center gap-1 text-rose-600">
                    <Heart size={13} /> {metrics.uniqueReactions}
                  </span>
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <MessageCircle size={13} /> {post.commentsCount || 0}
                  </span>
                  <span className="inline-flex items-center gap-1 text-teal-600">
                    <Share2 size={13} /> {metrics.verifiedShares}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSharePost(post)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-[#2563EB] border border-stone-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 size={12} />
                  <span>{t('trends.share_post')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Community Events Section (Admin can post local events, with dates in viewer's local time) */}
      <div className="bg-white border border-stone-200/90 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-[#0D9488] border border-teal-200/70">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-stone-900">
                {t('events.title')}
              </h3>
              <p className="text-xs text-stone-500">
                {t('events.subtitle')}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateEventModal(true)}
              className="px-4 py-2 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Plus size={14} />
              <span>{t('events.postEvent')}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(communityEvents.length > 0
            ? communityEvents.slice(0, 4)
            : [
                {
                  id: 'default_ea_event_1',
                  title:
                    language === 'sw'
                      ? 'Tamasha la Wabunifu wa Afrika Mashariki & Bongo Flava Showcase'
                      : 'East African Creators Meetup & Bongo Flava Live Showcase',
                  body:
                    language === 'sw'
                      ? 'Ungana na wabunifu wa muziki, vichekesho na biashara ndogo kutoka Dar es Salaam, Nairobi na Kampala!'
                      : 'Connect with music, comedy, and small business creators across Dar es Salaam, Nairobi, and Kampala!',
                  category: 'event' as const,
                  eventDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                  eventTime: '17:00',
                  eventLocation: 'Dar es Salaam & Live Stream',
                  countryCode: 'TZ' as const,
                  authorId: 'admin',
                  authorEmail: 'keylanmbilinyi5@gmail.com',
                  authorName: 'WaveLink Community',
                  createdAt: new Date().toISOString()
                }
              ]
          ).map((ev) => {
            const evCountryMeta = getAfricanCountryMeta(ev.countryCode);
            const localTimeStr = formatEventInViewerLocalTime(
              ev.eventDate,
              ev.eventTime,
              language === 'sw' ? 'sw' : 'en'
            );
            return (
              <div
                key={ev.id}
                className="p-4 rounded-2xl bg-stone-50/90 border border-stone-200/80 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-[10px] font-extrabold">
                      <span>{evCountryMeta.flag}</span>
                      <span>
                        {language === 'sw' ? evCountryMeta.nameSw : evCountryMeta.nameEn}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                      <Clock size={11} />
                      <span>
                        {localTimeStr} ({t('events.localTimeLabel')})
                      </span>
                    </span>
                  </div>

                  <h4 className="font-extrabold text-sm text-stone-900">
                    {ev.title}
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                    {ev.body}
                  </p>
                </div>

                {ev.eventLocation && (
                  <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-[11px] text-stone-500 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} className="text-[#0D9488]" />
                      <span>{ev.eventLocation}</span>
                    </span>
                    <span>{ev.authorName}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Create Challenge Modal */}
      {showCreateModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
          <form
            onSubmit={handleCreateChallengeSubmit}
            className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
              <Trophy size={18} className="text-amber-500" />
              <span>Post Weekly Creator Challenge</span>
            </h3>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Challenge Theme / Title
              </label>
              <input
                type="text"
                required
                value={newTheme}
                onChange={(e) => setNewTheme(e.target.value)}
                placeholder="e.g. Best Bongo Comedy Skit of the Week"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Challenge Hashtag
                </label>
                <input
                  type="text"
                  required
                  value={newHashtag}
                  onChange={(e) => setNewHashtag(e.target.value)}
                  placeholder="#ComedyWeekTZ"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-mono text-stone-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Description & Rules
              </label>
              <textarea
                rows={3}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Explain how creators can participate and win the Weekly Winner profile badge..."
                className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingChallenge}
                className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold"
              >
                {isSavingChallenge ? 'Publishing...' : 'Publish Challenge'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Choose Creator Spotlight of the Week Modal */}
      {showSpotlightModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveSpotlightSubmit}
            className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 shadow-2xl space-y-3.5"
          >
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              <span>{t('spotlight.adminPick')}</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Creator Name
                </label>
                <input
                  type="text"
                  required
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  placeholder="Amina Juma"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={spotUsername}
                  onChange={(e) => setSpotUsername(e.target.value)}
                  placeholder="@amina_bongo"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-mono text-stone-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Country
                </label>
                <select
                  value={spotCountry}
                  onChange={(e) => setSpotCountry(e.target.value as AfricanCountryCode)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                >
                  {AFRICAN_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={spotCategory}
                  onChange={(e) => setSpotCategory(e.target.value)}
                  placeholder="Bongo Flava & Comedy"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Spotlight Note (English)
              </label>
              <textarea
                rows={2}
                value={spotHeadlineEn}
                onChange={(e) => setSpotHeadlineEn(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Maelezo ya Mbunifu (Kiswahili)
              </label>
              <textarea
                rows={2}
                value={spotHeadlineSw}
                onChange={(e) => setSpotHeadlineSw(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSpotlightModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingSpotlight}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold"
              >
                {isSavingSpotlight ? 'Saving...' : 'Save Spotlight'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Post Community Event Modal */}
      {showCreateEventModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
          <form
            onSubmit={handleCreateCommunityEventSubmit}
            className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 shadow-2xl space-y-3.5"
          >
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Calendar size={18} className="text-[#0D9488]" />
              <span>{t('events.postEvent')}</span>
            </h3>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Event Title
              </label>
              <input
                type="text"
                required
                value={evTitle}
                onChange={(e) => setBpEvTitle(e.target.value)}
                placeholder="e.g. Dar es Salaam Creator Meetup & Workshop"
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Date (Local Time)
                </label>
                <input
                  type="date"
                  required
                  value={evDate}
                  onChange={(e) => setBpEvDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Time (Local Time)
                </label>
                <input
                  type="time"
                  required
                  value={evTime}
                  onChange={(e) => setBpEvTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Country
                </label>
                <select
                  value={evCountry}
                  onChange={(e) => setBpEvCountry(e.target.value as AfricanCountryCode)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                >
                  {AFRICAN_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  City / Location
                </label>
                <input
                  type="text"
                  value={evLocation}
                  onChange={(e) => setBpEvLocation(e.target.value)}
                  placeholder="Nairobi / Dar es Salaam / Online"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Event Details
              </label>
              <textarea
                rows={3}
                required
                value={evBody}
                onChange={(e) => setBpEvBody(e.target.value)}
                placeholder="Describe what creators will learn or experience..."
                className="w-full p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateEventModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEvent}
                className="px-5 py-2 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold"
              >
                {isSavingEvent ? 'Publishing...' : 'Post Community Event'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
