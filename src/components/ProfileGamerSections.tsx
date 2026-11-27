import React, { useMemo, useState, useEffect } from 'react';
import {
  Sparkles,
  Flame,
  PenTool,
  Users,
  Trophy,
  Heart,
  Zap,
  Crown,
  Award,
  Shield,
  Star,
  Rocket,
  Lock,
  Check,
  X,
  Calendar,
  MapPin,
  Target,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  Pin
} from 'lucide-react';
import { Post, UserProfile } from '../types';
import {
  ACHIEVEMENT_BADGES,
  BADGE_BY_ID,
  RARITY_ORDER,
  AchievementBadgeDefinition,
  BadgeIconKey,
  BadgeRarity,
  LevelProgressInfo,
  UserChallengeStats,
  UserEarnedBadge,
  UserRecentChallenge
} from '../config/progressionConfig';
import { onLevelUp, LevelUpEventDetail } from '../services/progressionService';

export function formatJoinedMonthYear(isoDate?: string, language: 'en' | 'sw' = 'en'): string {
  if (!isoDate) {
    return language === 'sw' ? 'Alijiunga WaveLink' : 'Joined WaveLink';
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return language === 'sw' ? 'Alijiunga WaveLink' : 'Joined WaveLink';
  }
  const formatted = d.toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-US', {
    month: 'long',
    year: 'numeric'
  });
  return language === 'sw' ? `Alijiunga ${formatted}` : `Joined ${formatted}`;
}

export function BadgeIconGlyph({
  icon,
  size = 18,
  className = ''
}: {
  icon: BadgeIconKey;
  size?: number;
  className?: string;
}) {
  switch (icon) {
    case 'flame':
      return <Flame size={size} className={className} />;
    case 'pen':
      return <PenTool size={size} className={className} />;
    case 'users':
      return <Users size={size} className={className} />;
    case 'trophy':
      return <Trophy size={size} className={className} />;
    case 'heart':
      return <Heart size={size} className={className} />;
    case 'zap':
      return <Zap size={size} className={className} />;
    case 'crown':
      return <Crown size={size} className={className} />;
    case 'award':
      return <Award size={size} className={className} />;
    case 'shield':
      return <Shield size={size} className={className} />;
    case 'star':
      return <Star size={size} className={className} />;
    case 'rocket':
      return <Rocket size={size} className={className} />;
    default:
      return <Sparkles size={size} className={className} />;
  }
}

export const RARITY_META: Record<
  BadgeRarity,
  {
    label: string;
    labelSw: string;
    borderClass: string;
    pillClass: string;
    iconBgClass: string;
  }
> = {
  common: {
    label: 'Common',
    labelSw: 'Kawaida',
    borderClass: 'border-[var(--border-hairline)]',
    pillClass: 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]',
    iconBgClass: 'bg-sky-500/15 text-sky-500'
  },
  rare: {
    label: 'Rare',
    labelSw: 'Adimu',
    borderClass: 'border-sky-500/45',
    pillClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/35',
    iconBgClass: 'bg-sky-500/20 text-sky-500'
  },
  epic: {
    label: 'Epic',
    labelSw: 'Kuu',
    borderClass: 'border-violet-500/50',
    pillClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/35',
    iconBgClass: 'bg-violet-500/20 text-violet-500'
  },
  legendary: {
    label: 'Legendary',
    labelSw: 'Gwiji',
    borderClass: 'border-amber-500/60',
    pillClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
    iconBgClass: 'bg-amber-500/20 text-amber-500'
  }
};

/* ============================================================================
   1. HIGHLIGHTED BADGES INLINE NEXT TO NAME (max 3)
============================================================================ */
export const HighlightedBadgesInline: React.FC<{
  badgeIds: string[];
  language: 'en' | 'sw';
  onSelectBadge?: (badgeId: string) => void;
}> = ({ badgeIds, language, onSelectBadge }) => {
  if (!badgeIds || badgeIds.length === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-1 flex-wrap"
      aria-label={language === 'sw' ? 'Beji zilizoangaziwa' : 'Highlighted badges'}
    >
      {badgeIds.slice(0, 3).map((id) => {
        const def = BADGE_BY_ID[id];
        if (!def) return null;
        const rarity = RARITY_META[def.rarity];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectBadge?.(id)}
            title={`${language === 'sw' ? def.nameSw : def.name} (${rarity.label})`}
            aria-label={`${language === 'sw' ? def.nameSw : def.name}`}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border ${rarity.borderClass} ${rarity.iconBgClass} transition hover:scale-105 cursor-pointer shrink-0`}
          >
            <BadgeIconGlyph icon={def.icon} size={13} />
          </button>
        );
      })}
    </div>
  );
};

/* ============================================================================
   2. LEVEL CARD (Right of Header on Desktop, Under Bio on Mobile)
============================================================================ */
export const ProfileLevelCard: React.FC<{
  levelInfo: LevelProgressInfo;
  streak: number;
  language: 'en' | 'sw';
  isSimpleMode?: boolean;
  onOpenAchievements?: () => void;
}> = ({ levelInfo, streak, language, isSimpleMode = false, onOpenAchievements }) => {
  return (
    <div
      onClick={onOpenAchievements}
      role={onOpenAchievements ? 'button' : undefined}
      tabIndex={onOpenAchievements ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpenAchievements && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenAchievements();
        }
      }}
      className="wavelink-gamer-level-card group"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="wavelink-gamer-level-emblem shrink-0">
            <Crown size={16} />
            <span className="tabular-nums font-black text-xs">{levelInfo.level}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-black text-[var(--text-primary)] tracking-tight tabular-nums">
                {language === 'sw' ? `Ngazi ${levelInfo.level}` : `Level ${levelInfo.level}`}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/25">
                {language === 'sw' ? levelInfo.tierNameSw : levelInfo.tierName}
              </span>
            </div>
            <span className="text-[11px] font-bold text-[var(--text-secondary)] block tabular-nums">
              {levelInfo.currentLevelXp.toLocaleString()} /{' '}
              {levelInfo.nextLevelXpRequired.toLocaleString()} XP
            </span>
          </div>
        </div>

        {/* Daily Login Streak Pill */}
        <div
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 shrink-0"
          title={language === 'sw' ? 'Mfululizo wa siku za kuingia' : 'Daily check-in streak'}
        >
          <Flame size={14} className="fill-amber-500 text-amber-500 shrink-0" />
          <span className="text-xs font-black tabular-nums">
            {streak}
            <span className="font-bold text-[10px] ml-0.5">
              {language === 'sw' ? 'siku' : 'd'}
            </span>
          </span>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="mt-3 space-y-1.5">
        <div
          className="w-full h-2.5 rounded-full bg-[var(--bg-canvas)] border border-[var(--border-hairline)] overflow-hidden"
          role="progressbar"
          aria-valuenow={levelInfo.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Level ${levelInfo.level} XP progress`}
        >
          <div
            className={`h-full rounded-full wavelink-gamer-xp-bar-fill ${
              isSimpleMode ? '' : 'transition-all duration-500 ease-out'
            }`}
            style={{ width: `${Math.max(4, levelInfo.progressPercent)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
          <span>
            {language === 'sw'
              ? `Jumla: ${levelInfo.totalXp.toLocaleString()} XP`
              : `Total: ${levelInfo.totalXp.toLocaleString()} XP`}
          </span>
          <span>
            {language === 'sw'
              ? `${levelInfo.xpRemaining.toLocaleString()} XP kufikia Lv ${levelInfo.level + 1}`
              : `${levelInfo.xpRemaining.toLocaleString()} XP to Lv ${levelInfo.level + 1}`}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   3. DESKTOP SIDEBAR FAVORITE BADGES SUMMARY CARD
============================================================================ */
export const ProfileFavoriteBadgesCard: React.FC<{
  displayedHighlightedBadges: string[];
  earnedCount: number;
  totalCount: number;
  language: 'en' | 'sw';
  onOpenAchievements: () => void;
  onSelectBadge: (badgeId: string) => void;
}> = ({
  displayedHighlightedBadges,
  earnedCount,
  totalCount,
  language,
  onOpenAchievements,
  onSelectBadge
}) => {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
          <Award size={14} className="text-[var(--accent-primary)]" />
          <span>{language === 'sw' ? 'Beji Bora' : 'Favorite Badges'}</span>
        </h3>
        <button
          type="button"
          onClick={onOpenAchievements}
          className="text-[11px] font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer tabular-nums"
        >
          {earnedCount}/{totalCount} {language === 'sw' ? 'Zote' : 'View all'}
        </button>
      </div>

      {displayedHighlightedBadges.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {language === 'sw'
            ? 'Bado hakuna beji. Shiriki shindano au chapisha wimbi lako la kwanza!'
            : 'No badges yet. Join a challenge or share your first post!'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {displayedHighlightedBadges.slice(0, 3).map((id) => {
            const def = BADGE_BY_ID[id];
            if (!def) return null;
            const rarity = RARITY_META[def.rarity];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectBadge(id)}
                className={`p-2.5 rounded-2xl bg-[var(--bg-subtle)] border ${rarity.borderClass} flex flex-col items-center text-center gap-1.5 transition hover:-translate-y-0.5 cursor-pointer min-h-[82px]`}
              >
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${rarity.iconBgClass}`}
                >
                  <BadgeIconGlyph icon={def.icon} size={17} />
                </span>
                <span className="text-[11px] font-extrabold text-[var(--text-primary)] line-clamp-1">
                  {language === 'sw' ? def.nameSw : def.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   4. "NEXT GOALS" CARD (OWNER ONLY — Gentle, Positive & Motivating)
============================================================================ */
export const ProfileNextGoalsCard: React.FC<{
  levelInfo: LevelProgressInfo;
  streak: number;
  checkedInToday: boolean;
  earnedBadgeIds: Set<string>;
  challengeJoinedCount: number;
  language: 'en' | 'sw';
  onOpenCheckIn: () => void;
  onOpenAchievements: () => void;
  onOpenChallenges: () => void;
}> = ({
  levelInfo,
  streak,
  checkedInToday,
  earnedBadgeIds,
  challengeJoinedCount,
  language,
  onOpenCheckIn,
  onOpenAchievements,
  onOpenChallenges
}) => {
  const nextLockedBadge = useMemo(() => {
    return ACHIEVEMENT_BADGES.find((b) => !earnedBadgeIds.has(b.id)) || null;
  }, [earnedBadgeIds]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
          <Target size={14} className="text-[var(--accent-secondary)]" />
          <span>{language === 'sw' ? 'Malengo Yako Yanayofuata' : 'Your Next Goals'}</span>
        </h3>
        <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full border border-[var(--border-hairline)]">
          {language === 'sw' ? 'Wewe pekee' : 'Only you see this'}
        </span>
      </div>

      <div className="space-y-2">
        {/* Goal 1: Next Level */}
        <button
          type="button"
          onClick={onOpenAchievements}
          className="w-full min-h-[48px] p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 text-left transition hover:border-[var(--accent-primary)]/40 cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Crown size={15} />
            </span>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                {language === 'sw'
                  ? `Bado ${levelInfo.xpRemaining.toLocaleString()} XP kufikia Ngazi ${levelInfo.level + 1}`
                  : `${levelInfo.xpRemaining.toLocaleString()} XP to reach Level ${levelInfo.level + 1}`}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                {language === 'sw'
                  ? 'Chapisha, toa maoni au ingia kila siku'
                  : 'Post, comment, or check in daily at your own pace'}
              </span>
            </div>
          </div>
          <span className="text-xs font-black text-[var(--accent-primary)] tabular-nums shrink-0">
            {levelInfo.progressPercent}%
          </span>
        </button>

        {/* Goal 2: Daily Check-in / Positive Streak */}
        <button
          type="button"
          onClick={onOpenCheckIn}
          className="w-full min-h-[48px] p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 text-left transition hover:border-amber-500/40 cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Flame size={15} />
            </span>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                {checkedInToday
                  ? language === 'sw'
                    ? `Mfululizo wa siku ${Math.max(1, streak)} unaendelea vizuri!`
                    : `${Math.max(1, streak)}-day streak going strong!`
                  : language === 'sw'
                  ? 'Dai zawadi ya leo (+50 XP)'
                  : 'Claim today’s check-in (+50 XP)'}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                {checkedInToday
                  ? language === 'sw'
                    ? 'Umeingia leo — kazi nzuri!'
                    : 'Checked in today — nice momentum!'
                  : language === 'sw'
                  ? 'Hatua moja ndogo kila siku huleta mafanikio.'
                  : 'A quick check-in keeps your wave glowing.'}
              </span>
            </div>
          </div>
          {checkedInToday ? (
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          ) : (
            <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-300 shrink-0">
              +50 XP
            </span>
          )}
        </button>

        {/* Goal 3: Next Closest Badge or Challenge */}
        {nextLockedBadge ? (
          <button
            type="button"
            onClick={
              nextLockedBadge.category === 'challenges' ? onOpenChallenges : onOpenAchievements
            }
            className="w-full min-h-[48px] p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 text-left transition hover:border-[var(--accent-secondary)]/40 cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0">
                <BadgeIconGlyph icon={nextLockedBadge.icon} size={15} />
              </span>
              <div className="min-w-0">
                <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                  {language === 'sw'
                    ? `Beji inayofuata: ${nextLockedBadge.nameSw}`
                    : `Next badge: ${nextLockedBadge.name}`}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                  {language === 'sw' ? nextLockedBadge.lockedHintSw : nextLockedBadge.lockedHint}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-extrabold text-violet-500 shrink-0 tabular-nums">
              +{nextLockedBadge.xpReward} XP
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenChallenges}
            className="w-full min-h-[48px] p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <Trophy size={15} />
              </span>
              <div className="min-w-0">
                <span className="text-xs font-extrabold text-[var(--text-primary)] block">
                  {language === 'sw'
                    ? 'Umefungua beji zote za sasa!'
                    : 'All current badges unlocked!'}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] block">
                  {challengeJoinedCount > 0
                    ? `${challengeJoinedCount} challenges joined so far`
                    : 'Join a weekly challenge anytime for bonus XP.'}
                </span>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   5. ACHIEVEMENTS TAB (Recent Badges + Highlight Picker + Best Achievements Grid + Activity Summary)
============================================================================ */
export const ProfileAchievementsTab: React.FC<{
  earnedBadges: UserEarnedBadge[];
  earnedBadgeIds: Set<string>;
  highlightedBadges: string[];
  isOwnProfile: boolean;
  streak: number;
  longestStreak: number;
  daysActive: number;
  totalPosts: number;
  totalLikesReceived: number;
  language: 'en' | 'sw';
  selectedBadgeId: string | null;
  onSelectBadge: (badgeId: string | null) => void;
  onToggleHighlightBadge: (badgeId: string) => Promise<void>;
  onGoToChallenges: () => void;
}> = ({
  earnedBadges,
  earnedBadgeIds,
  highlightedBadges,
  isOwnProfile,
  streak,
  longestStreak,
  daysActive,
  totalPosts,
  totalLikesReceived,
  language,
  selectedBadgeId,
  onSelectBadge,
  onToggleHighlightBadge,
  onGoToChallenges
}) => {
  const [savingHighlightId, setSavingHighlightId] = useState<string | null>(null);

  const recentEarned = useMemo(() => earnedBadges.slice(0, 5), [earnedBadges]);
  const earnedDateMap = useMemo(() => {
    const map = new Map<string, string>();
    earnedBadges.forEach((b) => map.set(b.id, b.awardedAt));
    return map;
  }, [earnedBadges]);

  const sortedCatalog = useMemo(() => {
    return [...ACHIEVEMENT_BADGES].sort((a, b) => {
      const aEarned = earnedBadgeIds.has(a.id) ? 1 : 0;
      const bEarned = earnedBadgeIds.has(b.id) ? 1 : 0;
      if (aEarned !== bEarned) return bEarned - aEarned;
      return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
    });
  }, [earnedBadgeIds]);

  const activeSheetBadge: AchievementBadgeDefinition | null = selectedBadgeId
    ? BADGE_BY_ID[selectedBadgeId] || null
    : null;
  const activeSheetEarnedAt = selectedBadgeId ? earnedDateMap.get(selectedBadgeId) : undefined;
  const isSheetHighlighted = Boolean(selectedBadgeId && highlightedBadges.includes(selectedBadgeId));

  const handleToggleHighlight = async (badgeId: string) => {
    if (!isOwnProfile) return;
    setSavingHighlightId(badgeId);
    try {
      await onToggleHighlightBadge(badgeId);
    } finally {
      setSavingHighlightId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Recent Badges Row (Last 5 earned, newest first) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {language === 'sw' ? 'Beji za Hivi Karibuni' : 'Recent Badges'}
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {isOwnProfile
                ? language === 'sw'
                  ? 'Gusa beji yoyote kuona maelezo au kuchagua hadi 3 za kuonekana karibu na jina lako.'
                  : 'Tap any badge for details or pin up to 3 next to your name.'
                : language === 'sw'
                ? 'Gusa beji kuona jinsi ilivyopatikana.'
                : 'Tap any badge to view details.'}
            </p>
          </div>
          {isOwnProfile && (
            <span className="px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] font-extrabold text-[var(--text-secondary)] tabular-nums">
              {highlightedBadges.length}/3 {language === 'sw' ? 'Zimeangaziwa' : 'Pinned'}
            </span>
          )}
        </div>

        {recentEarned.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center space-y-2.5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center mx-auto">
              <Trophy size={20} />
            </div>
            <p className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
              {language === 'sw'
                ? 'Bado hakuna beji. Shiriki shindano!'
                : 'No badges yet. Join a challenge!'}
            </p>
            {isOwnProfile && (
              <button
                type="button"
                onClick={onGoToChallenges}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-extrabold cursor-pointer transition hover:opacity-95"
              >
                {language === 'sw' ? 'Angalia Mashindano' : 'Explore Challenges'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
            {recentEarned.map((item) => {
              const def = BADGE_BY_ID[item.id];
              if (!def) return null;
              const rarity = RARITY_META[def.rarity];
              const isPinned = highlightedBadges.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectBadge(item.id)}
                  className={`min-w-[116px] max-w-[136px] shrink-0 p-3 rounded-2xl bg-[var(--bg-subtle)] border ${rarity.borderClass} flex flex-col items-center text-center gap-1.5 relative transition hover:-translate-y-0.5 cursor-pointer`}
                >
                  {isPinned && (
                    <span
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center"
                      title={language === 'sw' ? 'Imeangaziwa karibu na jina' : 'Highlighted next to name'}
                    >
                      <Pin size={10} />
                    </span>
                  )}
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${rarity.iconBgClass}`}
                  >
                    <BadgeIconGlyph icon={def.icon} size={19} />
                  </span>
                  <span className="text-xs font-extrabold text-[var(--text-primary)] line-clamp-1">
                    {language === 'sw' ? def.nameSw : def.name}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] tabular-nums">
                    +{def.xpReward} XP
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Streak & Activity Summary */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
        <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
          <Flame size={15} className="text-amber-500" />
          <span>{language === 'sw' ? 'Mfululizo na Shughuli' : 'Streak & Activity Summary'}</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            {
              label: language === 'sw' ? 'Mfululizo Sasa' : 'Current Streak',
              value: `${streak}d`,
              accent: 'text-amber-500'
            },
            {
              label: language === 'sw' ? 'Mfululizo Mrefu' : 'Longest Streak',
              value: `${longestStreak}d`,
              accent: 'text-[var(--accent-primary)]'
            },
            {
              label: language === 'sw' ? 'Siku Hai' : 'Days Active',
              value: daysActive.toLocaleString(),
              accent: 'text-[var(--text-primary)]'
            },
            {
              label: language === 'sw' ? 'Machapisho' : 'Total Posts',
              value: totalPosts.toLocaleString(),
              accent: 'text-[var(--text-primary)]'
            },
            {
              label: language === 'sw' ? 'Likes Zote' : 'Likes Received',
              value: totalLikesReceived.toLocaleString(),
              accent: 'text-rose-500'
            }
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center"
            >
              <span className={`text-base sm:text-lg font-black block tabular-nums ${stat.accent}`}>
                {stat.value}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-secondary)] block mt-0.5">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Best Achievements Grid */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
            <Award size={16} className="text-[var(--accent-primary)]" />
            <span>{language === 'sw' ? 'Mafanikio Bora' : 'Best Achievements'}</span>
          </h3>
          <span className="text-xs font-extrabold text-[var(--text-secondary)] tabular-nums">
            {earnedBadges.length} / {ACHIEVEMENT_BADGES.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedCatalog.map((badge) => {
            const isUnlocked = earnedBadgeIds.has(badge.id);
            const awardedAt = earnedDateMap.get(badge.id);
            const rarity = RARITY_META[badge.rarity];
            const isPinned = highlightedBadges.includes(badge.id);

            return (
              <button
                key={badge.id}
                type="button"
                onClick={() => onSelectBadge(badge.id)}
                className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-2.5 min-h-[126px] cursor-pointer ${
                  isUnlocked
                    ? `bg-[var(--bg-subtle)] ${rarity.borderClass} hover:-translate-y-0.5`
                    : 'bg-[var(--bg-subtle)]/50 border-[var(--border-hairline)] opacity-70 hover:opacity-90'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isUnlocked
                          ? rarity.iconBgClass
                          : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                      }`}
                    >
                      {isUnlocked ? (
                        <BadgeIconGlyph icon={badge.icon} size={18} />
                      ) : (
                        <Lock size={16} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] block truncate">
                        {language === 'sw' ? badge.nameSw : badge.name}
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${rarity.pillClass}`}
                      >
                        {language === 'sw' ? rarity.labelSw : rarity.label}
                      </span>
                    </div>
                  </div>
                  {isPinned && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-extrabold shrink-0">
                      {language === 'sw' ? 'Juu' : 'Pinned'}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-snug line-clamp-2">
                  {isUnlocked
                    ? language === 'sw'
                      ? badge.descriptionSw
                      : badge.description
                    : language === 'sw'
                    ? badge.lockedHintSw
                    : badge.lockedHint}
                </p>

                <div className="flex items-center justify-between text-[11px] font-bold pt-1 border-t border-[var(--border-hairline)]/60 tabular-nums">
                  <span className={isUnlocked ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'}>
                    +{badge.xpReward} XP
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {isUnlocked && awardedAt
                      ? new Date(awardedAt).toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-US', {
                          month: 'short',
                          year: 'numeric'
                        })
                      : language === 'sw'
                      ? 'Imefungwa'
                      : 'Locked'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tap-to-see-details Sheet / Modal */}
      {activeSheetBadge && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4"
          onClick={() => onSelectBadge(null)}
          role="dialog"
          aria-modal="true"
          aria-label={activeSheetBadge.name}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    earnedBadgeIds.has(activeSheetBadge.id)
                      ? RARITY_META[activeSheetBadge.rarity].iconBgClass
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  {earnedBadgeIds.has(activeSheetBadge.id) ? (
                    <BadgeIconGlyph icon={activeSheetBadge.icon} size={22} />
                  ) : (
                    <Lock size={20} />
                  )}
                </span>
                <div>
                  <h4 className="text-base font-black text-[var(--text-primary)]">
                    {language === 'sw' ? activeSheetBadge.nameSw : activeSheetBadge.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                        RARITY_META[activeSheetBadge.rarity].pillClass
                      }`}
                    >
                      {language === 'sw'
                        ? RARITY_META[activeSheetBadge.rarity].labelSw
                        : RARITY_META[activeSheetBadge.rarity].label}
                    </span>
                    <span className="text-xs font-extrabold text-[var(--accent-primary)] tabular-nums">
                      +{activeSheetBadge.xpReward} XP
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectBadge(null)}
                aria-label="Close badge details"
                className="min-w-[40px] min-h-[40px] rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
              {earnedBadgeIds.has(activeSheetBadge.id)
                ? language === 'sw'
                  ? activeSheetBadge.descriptionSw
                  : activeSheetBadge.description
                : language === 'sw'
                ? activeSheetBadge.lockedHintSw
                : activeSheetBadge.lockedHint}
            </p>

            {activeSheetEarnedAt && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between text-xs font-bold text-[var(--text-secondary)]">
                <span>{language === 'sw' ? 'Ilipatikana' : 'Earned'}</span>
                <span className="text-[var(--text-primary)]">
                  {new Date(activeSheetEarnedAt).toLocaleDateString(
                    language === 'sw' ? 'sw-TZ' : 'en-US',
                    { month: 'long', day: 'numeric', year: 'numeric' }
                  )}
                </span>
              </div>
            )}

            {isOwnProfile && earnedBadgeIds.has(activeSheetBadge.id) && (
              <button
                type="button"
                disabled={
                  savingHighlightId === activeSheetBadge.id ||
                  (!isSheetHighlighted && highlightedBadges.length >= 3)
                }
                onClick={() => handleToggleHighlight(activeSheetBadge.id)}
                className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                  isSheetHighlighted
                    ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                    : 'bg-[var(--accent-primary)] text-white'
                }`}
              >
                {isSheetHighlighted ? (
                  <>
                    <Check size={15} />
                    <span>
                      {language === 'sw'
                        ? 'Ondoa kwenye Beji 3 za Jina'
                        : 'Remove from Name Highlights'}
                    </span>
                  </>
                ) : highlightedBadges.length >= 3 ? (
                  <span>
                    {language === 'sw'
                      ? 'Umechagua 3/3 — ondoa moja kwanza'
                      : '3/3 highlighted — unpin one first'}
                  </span>
                ) : (
                  <>
                    <Pin size={15} />
                    <span>
                      {language === 'sw'
                        ? `Angaza karibu na jina (${highlightedBadges.length}/3)`
                        : `Highlight next to my name (${highlightedBadges.length}/3)`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   6. CHALLENGES TAB (Stats + Active Challenge Progress + Winners Shelf + Past List)
============================================================================ */
export const ProfileChallengesTab: React.FC<{
  challengeStats: UserChallengeStats;
  recentChallenges: UserRecentChallenge[];
  userPosts: Post[];
  weeklyWinnerChallengeTitle?: string;
  weeklyWinnerHashtag?: string;
  isOwnProfile: boolean;
  language: 'en' | 'sw';
}> = ({
  challengeStats,
  recentChallenges,
  userPosts,
  weeklyWinnerChallengeTitle,
  weeklyWinnerHashtag,
  isOwnProfile,
  language
}) => {
  const [showAllPast, setShowAllPast] = useState(false);

  // Derive active challenge progress from already-loaded posts (0 extra Firestore reads)
  const currentChallengeProgress = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const challengePosts = userPosts.filter((p) => {
      const text = (p.content || '').toLowerCase();
      const hasChallengeTag =
        text.includes('#wavehustle') ||
        text.includes('#challenge') ||
        text.includes('#shindano') ||
        (weeklyWinnerHashtag && text.includes(weeklyWinnerHashtag.toLowerCase()));
      const recent = new Date(p.createdAt || 0).getTime() >= sevenDaysAgo;
      return hasChallengeTag && recent;
    });
    const likesOnEntries = challengePosts.reduce((sum, p) => sum + (p.likesCount || 0), 0);
    // Calculate days left in current week cycle
    const now = new Date();
    const daysLeft = Math.max(1, 7 - now.getDay());
    return {
      title:
        language === 'sw'
          ? 'Shindano la Wiki: Wakati Bora wa Kila Siku'
          : 'Weekly Challenge: Best Campus & Daily Hustle',
      hashtag: '#WaveHustleTZ',
      entriesSubmitted: challengePosts.length,
      likesOnEntries,
      daysLeft
    };
  }, [userPosts, weeklyWinnerHashtag, language]);

  const trophyItems = useMemo(() => {
    const wins = recentChallenges.filter((c) => c.placement === 1);
    if (wins.length === 0 && weeklyWinnerChallengeTitle) {
      return [
        {
          id: 'weekly_trophy',
          title: weeklyWinnerChallengeTitle,
          date: new Date().toISOString(),
          placement: 1 as number | null
        }
      ];
    }
    return wins;
  }, [recentChallenges, weeklyWinnerChallengeTitle]);

  const visiblePast = showAllPast ? recentChallenges : recentChallenges.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Challenge Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          {
            label: language === 'sw' ? 'Mashindano' : 'Joined',
            value: challengeStats.joined.toLocaleString(),
            accent: 'text-[var(--accent-primary)]'
          },
          {
            label: language === 'sw' ? 'Ushindi' : 'Wins',
            value: challengeStats.wins.toLocaleString(),
            accent: 'text-amber-500'
          },
          {
            label: language === 'sw' ? 'Nafasi Bora' : 'Best Place',
            value: challengeStats.bestPlace ? `#${challengeStats.bestPlace}` : '—',
            accent: 'text-emerald-500'
          },
          {
            label: language === 'sw' ? 'Machapisho' : 'Total Entries',
            value: challengeStats.entries.toLocaleString(),
            accent: 'text-[var(--text-primary)]'
          }
        ].map((item) => (
          <div
            key={item.label}
            className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center"
          >
            <span className={`text-lg sm:text-xl font-black block tabular-nums ${item.accent}`}>
              {item.value}
            </span>
            <span className="text-[11px] font-bold text-[var(--text-secondary)] block mt-0.5">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Current Challenge Progress Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]">
              <Sparkles size={11} />
              <span>{language === 'sw' ? 'Shindano la Sasa' : 'Current Challenge'}</span>
            </span>
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
              {currentChallengeProgress.title}
            </h3>
            <span className="text-xs font-mono font-bold text-[var(--accent-secondary)]">
              {currentChallengeProgress.hashtag}
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] tabular-nums shrink-0">
            <Clock size={13} className="text-[var(--accent-primary)]" />
            <span>
              {language === 'sw'
                ? `Siku ${currentChallengeProgress.daysLeft} zimebaki`
                : `${currentChallengeProgress.daysLeft}d left`}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center">
            <span className="text-base font-black text-[var(--text-primary)] block tabular-nums">
              {currentChallengeProgress.entriesSubmitted}
            </span>
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
              {language === 'sw' ? 'Maingizo' : 'Entries'}
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center">
            <span className="text-base font-black text-rose-500 block tabular-nums">
              {currentChallengeProgress.likesOnEntries}
            </span>
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
              {language === 'sw' ? 'Likes' : 'Entry Likes'}
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center">
            <span className="text-base font-black text-amber-500 block tabular-nums">
              +75 XP
            </span>
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
              {language === 'sw' ? 'Zawadi' : 'Per Entry'}
            </span>
          </div>
        </div>

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => {
              window.location.href = '/?tab=trending';
            }}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Trophy size={15} />
            <span>{language === 'sw' ? 'Shiriki Shindano la Wiki' : 'Open Weekly Challenges'}</span>
          </button>
        )}
      </div>

      {/* Winners Trophy Shelf */}
      {trophyItems.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-amber-500/35 rounded-3xl p-4 space-y-3">
          <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
            <Trophy size={16} className="text-amber-500" />
            <span>{language === 'sw' ? 'Rafu ya Ushindi (Trophies)' : 'Winners Trophy Shelf'}</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {trophyItems.map((win) => (
              <div
                key={win.id}
                className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3"
              >
                <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Crown size={18} />
                </span>
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] block truncate">
                    {win.title}
                  </span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    #1 {language === 'sw' ? 'Mshindi' : 'Champion'} •{' '}
                    {new Date(win.date).toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-US', {
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Challenges List */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
            {language === 'sw' ? 'Historia ya Mashindano' : 'Past Challenges'}
          </h3>
          <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
            {recentChallenges.length}
          </span>
        </div>

        {recentChallenges.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center space-y-2">
            <Trophy size={24} className="text-[var(--accent-primary)] mx-auto opacity-80" />
            <p className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
              {language === 'sw'
                ? 'Bado hakuna mashindano yaliyokamilika.'
                : 'No completed challenges yet.'}
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto">
              {language === 'sw'
                ? 'Shiriki shindano lolote la wiki ili kukusanya XP na tuzo!'
                : 'Join any weekly creator challenge to earn XP, trophies, and special badges.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visiblePast.map((ch) => {
              const wonBadge = ch.badgeWonId ? BADGE_BY_ID[ch.badgeWonId] : null;
              return (
                <div
                  key={ch.id}
                  className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center gap-3"
                >
                  {ch.thumbnailUrl ? (
                    <img
                      src={ch.thumbnailUrl}
                      alt={ch.title}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[var(--border-hairline)]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                      <Trophy size={18} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] block truncate">
                      {ch.title}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>
                        {new Date(ch.date).toLocaleDateString(
                          language === 'sw' ? 'sw-TZ' : 'en-US',
                          { month: 'short', day: 'numeric', year: 'numeric' }
                        )}
                      </span>
                      {ch.hashtag && (
                        <span className="text-[var(--accent-primary)] font-mono">{ch.hashtag}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${
                        ch.placement === 1
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/35'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                      }`}
                    >
                      {ch.placement
                        ? `#${ch.placement}`
                        : language === 'sw'
                        ? 'Alishiriki'
                        : 'Participated'}
                    </span>
                    {wonBadge && (
                      <span className="text-[10px] font-extrabold text-[var(--accent-primary)]">
                        🏅 {language === 'sw' ? wonBadge.nameSw : wonBadge.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {recentChallenges.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllPast((prev) => !prev)}
                className="w-full min-h-[44px] py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {showAllPast ? (
                  <>
                    <ChevronUp size={15} />
                    <span>{language === 'sw' ? 'Onyesha Chache' : 'Show Less'}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={15} />
                    <span>
                      {language === 'sw'
                        ? `Onyesha Zaidi (${recentChallenges.length - 4})`
                        : `See more (${recentChallenges.length - 4} more)`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   7. ABOUT TAB
============================================================================ */
export const ProfileAboutTab: React.FC<{
  profile: UserProfile | null;
  displayedName: string;
  displayedUsername: string;
  displayedBio: string;
  countryLabel: string;
  countryFlag: string;
  language: 'en' | 'sw';
  isOwnProfile: boolean;
  onEditProfile?: () => void;
  onOpenPrivacy?: () => void;
}> = ({
  profile,
  displayedName,
  displayedUsername,
  displayedBio,
  countryLabel,
  countryFlag,
  language,
  isOwnProfile,
  onEditProfile,
  onOpenPrivacy
}) => {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
          {language === 'sw' ? `Kuhusu ${displayedName}` : `About ${displayedName}`}
        </h3>
        {isOwnProfile && onEditProfile && (
          <button
            type="button"
            onClick={onEditProfile}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--accent-primary)] cursor-pointer"
          >
            {language === 'sw' ? 'Hariri' : 'Edit'}
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
        {displayedBio}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-hairline)]">
        <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center gap-2.5">
          <Calendar size={16} className="text-[var(--accent-primary)] shrink-0" />
          <div>
            <span className="text-[11px] font-bold text-[var(--text-secondary)] block">
              {language === 'sw' ? 'Mwanachama' : 'Member Since'}
            </span>
            <span className="text-xs font-extrabold text-[var(--text-primary)]">
              {formatJoinedMonthYear(profile?.createdAt, language)}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center gap-2.5">
          <MapPin size={16} className="text-[var(--accent-secondary)] shrink-0" />
          <div>
            <span className="text-[11px] font-bold text-[var(--text-secondary)] block">
              {language === 'sw' ? 'Eneo' : 'Region'}
            </span>
            <span className="text-xs font-extrabold text-[var(--text-primary)]">
              {countryFlag} {profile?.regionName ? `${profile.regionName}, ` : ''}
              {countryLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] pt-1">
        <span className="font-mono font-bold">{displayedUsername}</span>
        {isOwnProfile && onOpenPrivacy && (
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer"
          >
            {language === 'sw' ? 'Mipangilio ya Faragha' : 'Manage Privacy'}
          </button>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   8. LEVEL-UP CELEBRATION BANNER (Respects prefers-reduced-motion & Lite/Simple mode)
============================================================================ */
export const ProfileLevelUpBanner: React.FC<{
  isSimpleMode?: boolean;
  language: 'en' | 'sw';
}> = ({ isSimpleMode = false, language }) => {
  const [eventDetail, setEventDetail] = useState<LevelUpEventDetail | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onLevelUp((detail) => {
      setEventDetail(detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setEventDetail(null), 5500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!eventDetail) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,420px)] rounded-3xl p-4 shadow-2xl border border-amber-400/40 bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-between gap-3 ${
        isSimpleMode ? '' : 'wavelink-levelup-enter'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md">
          <Crown size={22} />
        </span>
        <div className="min-w-0">
          <span className="text-xs font-black uppercase tracking-wider text-amber-500 block">
            {language === 'sw' ? 'Umepanda Ngazi!' : 'Level Up!'}
          </span>
          <span className="text-sm font-black text-[var(--text-primary)] block truncate">
            {language === 'sw'
              ? `Ngazi ${eventDetail.newLevel} • ${eventDetail.tierName}`
              : `Level ${eventDetail.newLevel} • ${eventDetail.tierName}`}
          </span>
          <span className="text-[11px] font-bold text-[var(--text-secondary)] block">
            +{eventDetail.xpAwarded} XP
            {eventDetail.newBadges.length > 0
              ? ` • +${eventDetail.newBadges.length} ${language === 'sw' ? 'beji mpya' : 'new badge'}`
              : ''}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEventDetail(null)}
        aria-label="Dismiss level up"
        className="min-w-[36px] min-h-[36px] rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center cursor-pointer shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
};

/* ============================================================================
   9. SKELETON & QUOTA RETRY STATE
============================================================================ */
export const ProfileQuotaRetryBanner: React.FC<{
  message?: string;
  language: 'en' | 'sw';
  onRetry: () => void;
}> = ({ message, language, onRetry }) => {
  return (
    <div className="bg-[var(--bg-surface)] border border-amber-500/40 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
          <AlertCircle size={20} />
        </span>
        <div>
          <h4 className="text-sm font-extrabold text-[var(--text-primary)]">
            {language === 'sw'
              ? 'Huduma ya data iko na shughuli nyingi kidogo'
              : 'Profile data is temporarily busy'}
          </h4>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {message ||
              (language === 'sw'
                ? 'Ukomo wa maombi umefikiwa kwa muda. Gusa Jaribu Tena kupakia upya.'
                : 'Daily data quota limit was reached temporarily. Tap Retry to refresh.')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
      >
        <RefreshCw size={14} />
        <span>{language === 'sw' ? 'Jaribu Tena' : 'Retry'}</span>
      </button>
    </div>
  );
};
