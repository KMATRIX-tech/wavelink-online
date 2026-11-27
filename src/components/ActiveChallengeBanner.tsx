import React, { useEffect, useState } from 'react';
import {
  Camera,
  Clock,
  FileText,
  Flame,
  Plus,
  Sparkles,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import { CreatorChallenge } from '../types';
import {
  formatCountdownParts,
  isChallengeExpired,
  resolveUnifiedBadge,
} from '../services/challengesService';
import { BadgeIconGlyph } from './BadgeIconGlyph';

interface ActiveChallengeBannerProps {
  challenge: CreatorChallenge | null;
  onJoinWithPost: (challenge: CreatorChallenge) => void;
  onOpenWinnersWall?: (challenge: CreatorChallenge) => void;
  onExploreAllChallenges?: () => void;
  compact?: boolean;
  className?: string;
}

export const ActiveChallengeBanner: React.FC<ActiveChallengeBannerProps> = ({
  challenge,
  onJoinWithPost,
  onOpenWinnersWall,
  onExploreAllChallenges,
  compact = false,
  className = '',
}) => {
  const endIso = challenge?.endDate || challenge?.deadline;
  const [countdown, setCountdown] = useState(() => formatCountdownParts(endIso));

  useEffect(() => {
    setCountdown(formatCountdownParts(endIso));
    if (!endIso) return;
    const timer = window.setInterval(() => {
      setCountdown(formatCountdownParts(endIso));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [endIso]);

  if (!challenge) return null;

  const title = challenge.title || challenge.theme || 'Weekly Challenge';
  const expired = isChallengeExpired(challenge) || countdown.expired;
  const linkedBadge = resolveUnifiedBadge(challenge.badgeId);
  const entryType = challenge.type || 'any';

  const typeMeta = {
    photo: { label: 'Photo', Icon: Camera },
    video: { label: 'Video', Icon: Video },
    text: { label: 'Text', Icon: FileText },
    any: { label: 'Any post', Icon: Sparkles },
  }[entryType] || { label: 'Any post', Icon: Sparkles };
  const TypeIcon = typeMeta.Icon;

  return (
    <section
      aria-label="Active Weekly Challenge"
      className={`relative overflow-hidden rounded-2xl border shadow-lg transition-all ${className}`}
      style={{
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
        backgroundColor: 'var(--bg-surface, rgba(18, 22, 34, 0.92))',
        color: 'var(--text-primary, #ffffff)',
      }}
    >
      {/* Optional cover image with dark legibility scrim */}
      {challenge.coverImageUrl ? (
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={challenge.coverImageUrl}
            alt=""
            className="w-full h-full object-cover opacity-35"
            loading="lazy"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(125deg, rgba(12,14,24,0.92) 0%, rgba(12,14,24,0.78) 55%, rgba(12,14,24,0.88) 100%)',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            background:
              'linear-gradient(135deg, var(--accent-primary, #8b5cf6) 0%, var(--accent-secondary, #ec4899) 55%, #f59e0b 100%)',
          }}
        />
      )}

      <div className={`relative z-10 ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left copy & metadata */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg uppercase tracking-wider text-[11px]"
                style={{
                  backgroundColor: 'var(--accent-primary, #8b5cf6)',
                  color: '#ffffff',
                }}
              >
                <Flame className="w-3.5 h-3.5 shrink-0" />
                Weekly Challenge
              </span>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.08))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              >
                <TypeIcon className="w-3 h-3 shrink-0" />
                {typeMeta.label}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold tabular-nums border"
                style={{
                  backgroundColor: expired ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)',
                  borderColor: expired ? 'rgba(239,68,68,0.38)' : 'rgba(245,158,11,0.4)',
                  color: expired ? '#fca5a5' : '#fcd34d',
                }}
              >
                <Clock className="w-3 h-3 shrink-0" />
                {countdown.compact}
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight leading-snug break-words">
                  {title}
                </h2>
                <p
                  className="text-xs sm:text-sm mt-1 line-clamp-2"
                  style={{ color: 'var(--text-secondary, rgba(255,255,255,0.78))' }}
                >
                  {challenge.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pt-0.5">
              <span
                className="font-bold"
                style={{ color: 'var(--accent-primary, #a78bfa)' }}
              >
                {challenge.hashtag}
              </span>
              <span
                className="inline-flex items-center gap-1 tabular-nums"
                style={{ color: 'var(--text-secondary, rgba(255,255,255,0.72))' }}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                {challenge.participantsCount || 0} joined · {challenge.entriesCount || 0} entries
              </span>
              {challenge.maxEntriesPerUser ? (
                <span style={{ color: 'var(--text-secondary, rgba(255,255,255,0.72))' }}>
                  Max {challenge.maxEntriesPerUser}/creator
                </span>
              ) : null}
              {linkedBadge ? (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <BadgeIconGlyph badge={linkedBadge} size="xs" />
                  <span>Prize: {linkedBadge.name}</span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Right actions — >= 44px touch targets */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={expired}
              onClick={() => onJoinWithPost(challenge)}
              className="min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              style={{
                background: expired
                  ? 'rgba(148,163,184,0.3)'
                  : 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #ec4899))',
                color: '#ffffff',
              }}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{expired ? 'Entries Closed' : 'Join with a post'}</span>
            </button>

            {onOpenWinnersWall && (challenge.winners?.length || challenge.winnerUserId) ? (
              <button
                type="button"
                onClick={() => onOpenWinnersWall(challenge)}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 border transition-colors"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.08))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.16))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              >
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Winners</span>
              </button>
            ) : null}

            {onExploreAllChallenges ? (
              <button
                type="button"
                onClick={onExploreAllChallenges}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center justify-center border transition-colors"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.08))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.16))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              >
                All challenges
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};
