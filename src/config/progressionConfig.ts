/**
 * WaveLink Progression, Levels, Achievements & Wellbeing Config
 * Single source of truth shared by both the React client and server.ts.
 * Do NOT import browser-only, React, or asset modules in this file.
 */

export type XpActionType =
  | 'daily_checkin'
  | 'post_created'
  | 'like_received'
  | 'comment_created'
  | 'challenge_joined'
  | 'challenge_won'
  | 'streak_kept';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type BadgeIconKey =
  | 'sparkles'
  | 'flame'
  | 'pen'
  | 'users'
  | 'trophy'
  | 'heart'
  | 'zap'
  | 'crown'
  | 'award'
  | 'shield'
  | 'star'
  | 'rocket';

export interface XpActionRule {
  action: XpActionType;
  xp: number;
  dailyCap: number;
  label: string;
  labelSw: string;
  description: string;
}

export interface AchievementBadgeDefinition {
  id: string;
  name: string;
  nameSw: string;
  description: string;
  descriptionSw: string;
  lockedHint: string;
  lockedHintSw: string;
  rarity: BadgeRarity;
  xpReward: number;
  icon: BadgeIconKey;
  category: 'activity' | 'creator' | 'community' | 'challenges';
}

export interface UserEarnedBadge {
  id: string;
  awardedAt: string;
}

export interface UserChallengeStats {
  joined: number;
  wins: number;
  bestPlace: number | null;
  entries: number;
}

export interface UserRecentChallenge {
  id: string;
  title: string;
  hashtag?: string;
  date: string;
  placement?: number | null;
  participated?: boolean;
  thumbnailUrl?: string;
  badgeWonId?: string;
  likesCount?: number;
}

export interface LevelProgressInfo {
  level: number;
  tierName: 'Newcomer' | 'Explorer' | 'Creator' | 'Star' | 'Legend';
  tierNameSw: string;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXpRequired: number;
  xpRemaining: number;
  progressPercent: number;
}

/**
 * Editable XP & Daily Cap Table.
 * Enforced on the server in POST /api/progression/award so no one can farm XP.
 */
export const XP_ACTIONS_CONFIG: Record<XpActionType, XpActionRule> = {
  daily_checkin: {
    action: 'daily_checkin',
    xp: 50,
    dailyCap: 1,
    label: 'Daily Check-in',
    labelSw: 'Kuingia Kila Siku',
    description: 'Open WaveLink and claim your daily check-in.'
  },
  post_created: {
    action: 'post_created',
    xp: 40,
    dailyCap: 5,
    label: 'Create a Post',
    labelSw: 'Chapisha Maudhui',
    description: 'Share a photo, video, or update with your community.'
  },
  like_received: {
    action: 'like_received',
    xp: 10,
    dailyCap: 25,
    label: 'Like Received',
    labelSw: 'Kupata Like',
    description: 'Earn XP when friends appreciate your posts.'
  },
  comment_created: {
    action: 'comment_created',
    xp: 15,
    dailyCap: 15,
    label: 'Helpful Comment',
    labelSw: 'Kutoa Maoni',
    description: 'Join conversations and support other creators.'
  },
  challenge_joined: {
    action: 'challenge_joined',
    xp: 75,
    dailyCap: 3,
    label: 'Join a Challenge',
    labelSw: 'Shiriki Shindano',
    description: 'Submit an entry to an active weekly creator challenge.'
  },
  challenge_won: {
    action: 'challenge_won',
    xp: 300,
    dailyCap: 2,
    label: 'Win a Challenge',
    labelSw: 'Shinda Shindano',
    description: 'Take the crown in a WaveLink weekly challenge.'
  },
  streak_kept: {
    action: 'streak_kept',
    xp: 35,
    dailyCap: 1,
    label: 'Streak Kept',
    labelSw: 'Endeleza Mfululizo',
    description: 'Keep your daily login streak going.'
  }
};

/**
 * Single Level Formula:
 * Each level needs progressively more XP than the last.
 * Level 1 -> 2: 150 XP
 * Level 2 -> 3: 237 XP
 * Level 3 -> 4: 348 XP
 * Level 5 -> 6: 642 XP
 */
export function xpRequiredForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 150 + (safeLevel - 1) * 75 + Math.floor((safeLevel - 1) * (safeLevel - 1) * 12);
}

export function getLevelTier(level: number): {
  tierName: LevelProgressInfo['tierName'];
  tierNameSw: string;
} {
  if (level >= 35) return { tierName: 'Legend', tierNameSw: 'Gwiji' };
  if (level >= 20) return { tierName: 'Star', tierNameSw: 'Nyota' };
  if (level >= 10) return { tierName: 'Creator', tierNameSw: 'Mbunifu' };
  if (level >= 5) return { tierName: 'Explorer', tierNameSw: 'Mpelelezi' };
  return { tierName: 'Newcomer', tierNameSw: 'Mgeni Mpya' };
}

export function getLevelProgress(rawXp: number): LevelProgressInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(rawXp) ? rawXp : 0));
  let level = 1;
  let remaining = totalXp;
  let needed = xpRequiredForNextLevel(level);

  while (remaining >= needed && level < 100) {
    remaining -= needed;
    level += 1;
    needed = xpRequiredForNextLevel(level);
  }

  const { tierName, tierNameSw } = getLevelTier(level);
  const progressPercent = needed > 0 ? Math.min(100, Math.round((remaining / needed) * 100)) : 100;

  return {
    level,
    tierName,
    tierNameSw,
    totalXp,
    currentLevelXp: remaining,
    nextLevelXpRequired: needed,
    xpRemaining: Math.max(0, needed - remaining),
    progressPercent
  };
}

/**
 * Achievement Badge Catalog
 */
export const ACHIEVEMENT_BADGES: AchievementBadgeDefinition[] = [
  {
    id: 'first_wave',
    name: 'First Wave',
    nameSw: 'Wimbi la Kwanza',
    description: 'Published your first post on WaveLink.',
    descriptionSw: 'Umechapisha chapisho lako la kwanza kwenye WaveLink.',
    lockedHint: 'Share your first photo, video, or update to unlock.',
    lockedHintSw: 'Shiriki picha, video, au chapisho lako la kwanza.',
    rarity: 'common',
    xpReward: 50,
    icon: 'sparkles',
    category: 'creator'
  },
  {
    id: 'daily_spark',
    name: '3-Day Spark',
    nameSw: 'Mfululizo wa Siku 3',
    description: 'Checked in on WaveLink for 3 days in a row.',
    descriptionSw: 'Umeingia WaveLink siku 3 mfululizo.',
    lockedHint: 'Keep a 3-day daily check-in streak.',
    lockedHintSw: 'Ingia siku 3 mfululizo bila kukosa.',
    rarity: 'common',
    xpReward: 50,
    icon: 'flame',
    category: 'activity'
  },
  {
    id: 'story_creator',
    name: 'Rising Creator',
    nameSw: 'Mbunifu Chipukizi',
    description: 'Shared 5 or more posts with the community.',
    descriptionSw: 'Umeshiriki machapisho 5 au zaidi na jamii.',
    lockedHint: 'Publish 5 posts to earn this creator badge.',
    lockedHintSw: 'Chapisha machapisho 5 kupata beji hii.',
    rarity: 'common',
    xpReward: 75,
    icon: 'pen',
    category: 'creator'
  },
  {
    id: 'social_butterfly',
    name: 'Community Connector',
    nameSw: 'Kiunganishi cha Jamii',
    description: 'Connected with 10+ friends and followers.',
    descriptionSw: 'Umeungana na marafiki au wafuasi 10+.',
    lockedHint: 'Follow or gain 10 combined connections.',
    lockedHintSw: 'Fuata au pata jumla ya wafuasi na marafiki 10.',
    rarity: 'rare',
    xpReward: 100,
    icon: 'users',
    category: 'community'
  },
  {
    id: 'streak_keeper',
    name: 'Week Warrior',
    nameSw: 'Shujaa wa Wiki',
    description: 'Kept a 7-day login streak burning bright.',
    descriptionSw: 'Umedumisha mfululizo wa kuingia kwa siku 7.',
    lockedHint: 'Reach a 7-day check-in streak.',
    lockedHintSw: 'Fikia mfululizo wa siku 7 za kuingia.',
    rarity: 'rare',
    xpReward: 120,
    icon: 'zap',
    category: 'activity'
  },
  {
    id: 'challenger',
    name: 'Challenge Starter',
    nameSw: 'Mshiriki wa Shindano',
    description: 'Joined your first WaveLink Creator Challenge.',
    descriptionSw: 'Umeshiriki shindano lako la kwanza la WaveLink.',
    lockedHint: 'Join any active weekly challenge to unlock.',
    lockedHintSw: 'Shiriki shindano lolote la wiki kufungua.',
    rarity: 'rare',
    xpReward: 120,
    icon: 'rocket',
    category: 'challenges'
  },
  {
    id: 'crowd_favorite',
    name: 'Crowd Favorite',
    nameSw: 'Kipenzi cha Wengi',
    description: 'Earned 25+ likes across your shared posts.',
    descriptionSw: 'Umepata likes 25+ kwenye machapisho yako.',
    lockedHint: 'Receive 25 total likes across your posts.',
    lockedHintSw: 'Pata jumla ya likes 25 kwenye machapisho yako.',
    rarity: 'rare',
    xpReward: 150,
    icon: 'heart',
    category: 'community'
  },
  {
    id: 'level_ten',
    name: 'Creator Tier',
    nameSw: 'Ngazi ya Mbunifu',
    description: 'Reached Level 10 through consistent activity.',
    descriptionSw: 'Umefikia Level 10 kwa ushiriki wako mzuri.',
    lockedHint: 'Earn XP to reach Level 10.',
    lockedHintSw: 'Kusanya XP kufikia Level 10.',
    rarity: 'epic',
    xpReward: 200,
    icon: 'star',
    category: 'activity'
  },
  {
    id: 'challenge_veteran',
    name: 'Challenge Veteran',
    nameSw: 'Mzoefu wa Mashindano',
    description: 'Participated in 5 or more community challenges.',
    descriptionSw: 'Umeshiriki mashindano 5 au zaidi ya jamii.',
    lockedHint: 'Join 5 weekly challenges to unlock.',
    lockedHintSw: 'Shiriki mashindano 5 ya wiki kufungua.',
    rarity: 'epic',
    xpReward: 220,
    icon: 'award',
    category: 'challenges'
  },
  {
    id: 'streak_master',
    name: '30-Day Legend',
    nameSw: 'Gwiji wa Siku 30',
    description: 'Checked in for 30 days in a row.',
    descriptionSw: 'Umeingia kwa siku 30 mfululizo.',
    lockedHint: 'Reach a 30-day check-in streak.',
    lockedHintSw: 'Fikia mfululizo wa siku 30.',
    rarity: 'epic',
    xpReward: 250,
    icon: 'shield',
    category: 'activity'
  },
  {
    id: 'weekly_champion',
    name: 'Weekly Champion',
    nameSw: 'Bingwa wa Wiki',
    description: 'Won a WaveLink Weekly Creator Challenge.',
    descriptionSw: 'Umeshinda Shindano la Wiki la WaveLink.',
    lockedHint: 'Finish #1 in a weekly creator challenge.',
    lockedHintSw: 'Shika nafasi ya #1 kwenye shindano la wiki.',
    rarity: 'legendary',
    xpReward: 350,
    icon: 'trophy',
    category: 'challenges'
  },
  {
    id: 'wavelink_legend',
    name: 'WaveLink Legend',
    nameSw: 'Gwiji wa WaveLink',
    description: 'Reached Level 25 or collected 1,500+ WavePoints.',
    descriptionSw: 'Umefikia Level 25 au WavePoints 1,500+.',
    lockedHint: 'Reach Level 25 or accumulate 1,500 WavePoints.',
    lockedHintSw: 'Fikia Level 25 au kusanya WavePoints 1,500.',
    rarity: 'legendary',
    xpReward: 500,
    icon: 'crown',
    category: 'community'
  }
];

export const BADGE_BY_ID: Record<string, AchievementBadgeDefinition> = ACHIEVEMENT_BADGES.reduce(
  (acc, badge) => {
    acc[badge.id] = badge;
    return acc;
  },
  {} as Record<string, AchievementBadgeDefinition>
);

export const RARITY_ORDER: Record<BadgeRarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1
};

export interface ProgressionEvaluationInput {
  xp?: number;
  level?: number;
  streak?: number;
  longestStreak?: number;
  loginStreak?: number;
  totalLoginDays?: number;
  daysActive?: number;
  wavePoints?: number;
  points?: number;
  postsCount?: number;
  likesReceived?: number;
  connectionsCount?: number;
  challengeStats?: Partial<UserChallengeStats>;
  recentChallenges?: UserRecentChallenge[];
  badges?: UserEarnedBadge[];
  weeklyWinnerChallengeTitle?: string;
  weeklyWinnerUntil?: string;
  createdAt?: string;
}

/**
 * Evaluates all badges a user qualifies for based on stored profile fields and loaded post metrics.
 * Used both on the server (when awarding XP) and on the client (for zero-read baseline display).
 */
export function evaluateEligibleBadgeIds(input: ProgressionEvaluationInput): string[] {
  const earned = new Set<string>();
  if (Array.isArray(input.badges)) {
    input.badges.forEach((b) => {
      if (b?.id && BADGE_BY_ID[b.id]) earned.add(b.id);
    });
  }

  const effectiveStreak = Math.max(
    input.streak ?? 0,
    input.longestStreak ?? 0,
    input.loginStreak ?? 0
  );
  const postsCount = Math.max(0, input.postsCount ?? 0);
  const likesReceived = Math.max(0, input.likesReceived ?? 0);
  const connectionsCount = Math.max(0, input.connectionsCount ?? 0);
  const wavePoints = Math.max(0, input.wavePoints ?? input.points ?? 0);
  const effectiveXp = Math.max(0, input.xp ?? Math.round(wavePoints * 1.5));
  const levelInfo = getLevelProgress(effectiveXp);
  const effectiveLevel = Math.max(input.level ?? 1, levelInfo.level);

  const joinedCount = Math.max(
    input.challengeStats?.joined ?? 0,
    Array.isArray(input.recentChallenges) ? input.recentChallenges.length : 0,
    input.weeklyWinnerChallengeTitle ? 1 : 0
  );
  const winsCount = Math.max(
    input.challengeStats?.wins ?? 0,
    input.weeklyWinnerChallengeTitle ? 1 : 0
  );

  if (postsCount >= 1) earned.add('first_wave');
  if (effectiveStreak >= 3) earned.add('daily_spark');
  if (postsCount >= 5) earned.add('story_creator');
  if (connectionsCount >= 10) earned.add('social_butterfly');
  if (effectiveStreak >= 7) earned.add('streak_keeper');
  if (joinedCount >= 1) earned.add('challenger');
  if (likesReceived >= 25) earned.add('crowd_favorite');
  if (effectiveLevel >= 10) earned.add('level_ten');
  if (joinedCount >= 5) earned.add('challenge_veteran');
  if (effectiveStreak >= 30) earned.add('streak_master');
  if (winsCount >= 1) earned.add('weekly_champion');
  if (effectiveLevel >= 25 || wavePoints >= 1500) earned.add('wavelink_legend');

  return Array.from(earned);
}

/**
 * Resolves display-ready progression metrics from a single UserProfile doc (0 extra Firestore reads).
 */
export function resolveProfileProgression(
  profile: {
    xp?: number;
    level?: number;
    streak?: number;
    longestStreak?: number;
    daysActive?: number;
    totalLikesReceived?: number;
    highlightedBadges?: string[];
    badges?: UserEarnedBadge[];
    challengeStats?: UserChallengeStats;
    recentChallenges?: UserRecentChallenge[];
    loginStreak?: number;
    totalLoginDays?: number;
    wavePoints?: number;
    points?: number;
    weeklyWinnerChallengeTitle?: string;
    weeklyWinnerHashtag?: string;
    weeklyWinnerUntil?: string;
    createdAt?: string;
    followingIds?: string[];
  } | null | undefined,
  loadedPostsCount = 0,
  loadedLikesReceived = 0,
  loadedFollowersCount = 0
) {
  const wavePoints = Math.max(0, profile?.wavePoints ?? profile?.points ?? 0);
  const streak = Math.max(0, profile?.streak ?? profile?.loginStreak ?? 0);
  const longestStreak = Math.max(streak, profile?.longestStreak ?? profile?.loginStreak ?? 0);
  const daysActive = Math.max(
    streak,
    profile?.daysActive ?? profile?.totalLoginDays ?? (profile?.createdAt ? 1 : 0)
  );
  const totalLikesReceived = Math.max(profile?.totalLikesReceived ?? 0, loadedLikesReceived);
  const connectionsCount = (profile?.followingIds?.length ?? 0) + loadedFollowersCount;

  // Use trusted server xp if present; otherwise derive gentle baseline from existing wavePoints + posts + streak
  const derivedBaselineXp =
    wavePoints * 2 + loadedPostsCount * 35 + Math.max(0, streak - 1) * 25;
  const totalXp = typeof profile?.xp === 'number' && profile.xp >= 0 ? profile.xp : derivedBaselineXp;
  const levelInfo = getLevelProgress(totalXp);

  const storedBadgesMap = new Map<string, UserEarnedBadge>();
  if (Array.isArray(profile?.badges)) {
    profile.badges.forEach((b) => {
      if (b?.id && BADGE_BY_ID[b.id]) {
        storedBadgesMap.set(b.id, b);
      }
    });
  }

  const eligibleIds = evaluateEligibleBadgeIds({
    xp: totalXp,
    level: levelInfo.level,
    streak,
    longestStreak,
    loginStreak: profile?.loginStreak,
    totalLoginDays: profile?.totalLoginDays,
    daysActive,
    wavePoints,
    points: profile?.points,
    postsCount: loadedPostsCount,
    likesReceived: totalLikesReceived,
    connectionsCount,
    challengeStats: profile?.challengeStats,
    recentChallenges: profile?.recentChallenges,
    badges: profile?.badges,
    weeklyWinnerChallengeTitle: profile?.weeklyWinnerChallengeTitle,
    weeklyWinnerUntil: profile?.weeklyWinnerUntil,
    createdAt: profile?.createdAt
  });

  const fallbackDate = profile?.createdAt || new Date().toISOString();
  const earnedBadges: UserEarnedBadge[] = eligibleIds
    .map((id) => storedBadgesMap.get(id) || { id, awardedAt: fallbackDate })
    .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime());

  const earnedSet = new Set(earnedBadges.map((b) => b.id));

  // Highlighted badges: owner-chosen (max 3), filtered to valid earned badges; fallback to top 3 rarest earned
  const validHighlighted = (profile?.highlightedBadges || [])
    .filter((id) => typeof id === 'string' && earnedSet.has(id) && Boolean(BADGE_BY_ID[id]))
    .slice(0, 3);

  const displayedHighlightedBadges =
    validHighlighted.length > 0
      ? validHighlighted
      : [...earnedBadges]
          .sort(
            (a, b) =>
              (RARITY_ORDER[BADGE_BY_ID[b.id]?.rarity || 'common'] || 1) -
              (RARITY_ORDER[BADGE_BY_ID[a.id]?.rarity || 'common'] || 1)
          )
          .slice(0, 3)
          .map((b) => b.id);

  // Recent challenges (latest 10 from profile doc, plus weeklyWinner fallback if stored on older doc)
  const recentChallenges: UserRecentChallenge[] = Array.isArray(profile?.recentChallenges)
    ? profile.recentChallenges.slice(0, 10)
    : [];

  if (
    recentChallenges.length === 0 &&
    profile?.weeklyWinnerChallengeTitle
  ) {
    recentChallenges.push({
      id: 'weekly_winner_legacy',
      title: profile.weeklyWinnerChallengeTitle,
      hashtag: profile.weeklyWinnerHashtag,
      date: profile.weeklyWinnerUntil || profile.createdAt || new Date().toISOString(),
      placement: 1,
      participated: true,
      badgeWonId: 'weekly_champion'
    });
  }

  const winsCount = Math.max(
    profile?.challengeStats?.wins ?? 0,
    recentChallenges.filter((c) => c.placement === 1).length,
    profile?.weeklyWinnerChallengeTitle ? 1 : 0
  );
  const joinedCount = Math.max(
    profile?.challengeStats?.joined ?? 0,
    recentChallenges.length,
    winsCount
  );
  const entriesCount = Math.max(
    profile?.challengeStats?.entries ?? 0,
    recentChallenges.length
  );
  const bestPlaceFromList = recentChallenges.reduce<number | null>((best, item) => {
    if (typeof item.placement === 'number' && item.placement >= 1) {
      return best === null ? item.placement : Math.min(best, item.placement);
    }
    return best;
  }, profile?.challengeStats?.bestPlace ?? null);

  const challengeStats: UserChallengeStats = {
    joined: joinedCount,
    wins: winsCount,
    bestPlace: winsCount > 0 ? 1 : bestPlaceFromList,
    entries: entriesCount
  };

  return {
    levelInfo,
    streak,
    longestStreak,
    daysActive,
    totalLikesReceived,
    earnedBadges,
    earnedBadgeIds: earnedSet,
    highlightedBadges: validHighlighted,
    displayedHighlightedBadges,
    challengeStats,
    recentChallenges
  };
}

/**
 * Privacy & Teen Wellbeing Guard:
 * - Own profile: always visible.
 * - If user disabled `privacySettings.showAchievementsAndChallenges` (explicit `false`): hidden from visitors.
 * - If user is a teen / under-18 account (`isUnder18` or `privacySettings.isTeenAccount`):
 *   level, badges, and challenge history are visible ONLY to self and mutual/close friends.
 */
export function canVisitorViewProgression(params: {
  targetProfile: {
    id?: string;
    isUnder18?: boolean;
    followingIds?: string[];
    closeFriendIds?: string[];
    privacySettings?: {
      showAchievementsAndChallenges?: boolean;
      isTeenAccount?: boolean;
    };
  } | null | undefined;
  viewerUid?: string | null;
  viewerFollowingIds?: string[];
}): { allowed: boolean; reason: 'own' | 'public' | 'friend' | 'hidden_by_privacy' | 'teen_friends_only' } {
  const { targetProfile, viewerUid, viewerFollowingIds = [] } = params;
  if (!targetProfile) return { allowed: true, reason: 'public' };
  if (viewerUid && targetProfile.id && viewerUid === targetProfile.id) {
    return { allowed: true, reason: 'own' };
  }

  if (targetProfile.privacySettings?.showAchievementsAndChallenges === false) {
    return { allowed: false, reason: 'hidden_by_privacy' };
  }

  const isTeen = Boolean(
    targetProfile.isUnder18 || targetProfile.privacySettings?.isTeenAccount
  );
  if (isTeen) {
    const isCloseFriend = Boolean(
      viewerUid && Array.isArray(targetProfile.closeFriendIds) && targetProfile.closeFriendIds.includes(viewerUid)
    );
    const targetFollowsViewer = Boolean(
      viewerUid && Array.isArray(targetProfile.followingIds) && targetProfile.followingIds.includes(viewerUid)
    );
    const viewerFollowsTarget = Boolean(
      targetProfile.id && viewerFollowingIds.includes(targetProfile.id)
    );
    if (isCloseFriend || (targetFollowsViewer && viewerFollowsTarget)) {
      return { allowed: true, reason: 'friend' };
    }
    return { allowed: false, reason: 'teen_friends_only' };
  }

  return { allowed: true, reason: 'public' };
}

/**
 * Teen accounts must never appear on public leaderboards to strangers.
 */
export function isExcludedFromPublicLeaderboards(
  profile: {
    isUnder18?: boolean;
    privacySettings?: { isTeenAccount?: boolean; showAchievementsAndChallenges?: boolean };
  } | null | undefined
): boolean {
  if (!profile) return false;
  return Boolean(profile.isUnder18 || profile.privacySettings?.isTeenAccount);
}
