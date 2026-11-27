import React from 'react';
import { Award, Crown, Heart, Sparkles, Trophy, X } from 'lucide-react';
import { ChallengeWinner, CreatorChallenge } from '../types';
import { resolveUnifiedBadge } from '../services/challengesService';
import { BadgeIconGlyph } from './BadgeIconGlyph';

interface WinnersWallViewProps {
  challenge: CreatorChallenge | null;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
}

export const WinnersWallView: React.FC<WinnersWallViewProps> = ({
  challenge,
  onClose,
  onViewProfile,
}) => {
  if (!challenge) return null;

  const title = challenge.title || challenge.theme || 'Weekly Challenge';
  const winners: ChallengeWinner[] =
    Array.isArray(challenge.winners) && challenge.winners.length > 0
      ? [...challenge.winners].sort((a, b) => a.placement - b.placement)
      : challenge.winnerUserId
      ? [
          {
            uid: challenge.winnerUserId,
            displayName: challenge.winnerName || 'WaveLink Creator',
            username: challenge.winnerUsername,
            photoURL: challenge.winnerPhotoURL,
            placement: 1,
            badgeId: challenge.badgeId || 'weekly_winner',
            awardedAt: challenge.winnerAwardedAt || challenge.updatedAt || challenge.createdAt,
          },
        ]
      : [];

  const placeStyle = (placement: number) => {
    if (placement === 1) {
      return {
        label: '1st Place',
        ring: '#f59e0b',
        bg: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(234,179,8,0.06))',
      };
    }
    if (placement === 2) {
      return {
        label: '2nd Place',
        ring: '#94a3b8',
        bg: 'linear-gradient(135deg, rgba(148,163,184,0.22), rgba(148,163,184,0.06))',
      };
    }
    if (placement === 3) {
      return {
        label: '3rd Place',
        ring: '#d97706',
        bg: 'linear-gradient(135deg, rgba(217,119,6,0.22), rgba(217,119,6,0.06))',
      };
    }
    return {
      label: `#${placement} Winner`,
      ring: '#8b5cf6',
      bg: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.06))',
    };
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface, #121622)',
          borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
          color: 'var(--text-primary, #ffffff)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
        >
          <div className="min-w-0 flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
                color: '#ffffff',
              }}
            >
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Winners Wall
              </p>
              <h2 className="text-base sm:text-lg font-extrabold truncate">{title}</h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary, rgba(255,255,255,0.7))' }}>
                {challenge.hashtag}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Winners Wall"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition-colors shrink-0"
            style={{
              backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
              borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {winners.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center space-y-3"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.04))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))',
              }}
            >
              <Sparkles className="w-10 h-10 mx-auto text-amber-400 opacity-80" />
              <h3 className="text-base font-bold">Winners Not Announced Yet</h3>
              <p
                className="text-sm max-w-sm mx-auto"
                style={{ color: 'var(--text-secondary, rgba(255,255,255,0.7))' }}
              >
                Creators are still competing in {challenge.hashtag}. Check back once the challenge closes and winners are crowned.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {winners.map((winner, idx) => {
                const st = placeStyle(winner.placement);
                const badge = resolveUnifiedBadge(winner.badgeId || challenge.badgeId || 'weekly_winner');
                const isFirst = winner.placement === 1 && idx === 0;
                return (
                  <div
                    key={`${winner.uid}_${winner.placement}`}
                    className={`rounded-2xl border p-4 flex flex-col gap-3 ${
                      isFirst && winners.length > 1 ? 'sm:col-span-2' : ''
                    }`}
                    style={{
                      background: st.bg,
                      borderColor: `${st.ring}55`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: `${st.ring}2b`, color: st.ring }}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        {st.label}
                      </span>
                      {typeof winner.likesTotal === 'number' ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
                          style={{ color: 'var(--text-secondary, rgba(255,255,255,0.78))' }}
                        >
                          <Heart className="w-3.5 h-3.5 text-rose-400" />
                          {winner.likesTotal} verified likes
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (onViewProfile) {
                            onViewProfile(winner.uid);
                            onClose();
                          }
                        }}
                        className="w-12 h-12 rounded-full overflow-hidden border-2 shrink-0 flex items-center justify-center font-bold text-sm"
                        style={{
                          borderColor: st.ring,
                          backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.1))',
                        }}
                      >
                        {winner.photoURL ? (
                          <img
                            src={winner.photoURL}
                            alt={winner.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{(winner.displayName || 'W').slice(0, 1).toUpperCase()}</span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewProfile) {
                              onViewProfile(winner.uid);
                              onClose();
                            }
                          }}
                          className="font-bold text-sm sm:text-base truncate block text-left hover:underline"
                        >
                          {winner.displayName}
                        </button>
                        {winner.username ? (
                          <p
                            className="text-xs truncate"
                            style={{ color: 'var(--text-secondary, rgba(255,255,255,0.68))' }}
                          >
                            @{winner.username}
                          </p>
                        ) : null}
                      </div>

                      {badge ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <BadgeIconGlyph badge={badge} size="sm" />
                          <span className="text-xs font-semibold hidden sm:inline max-w-[120px] truncate">
                            {badge.name}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {winner.postThumbnailUrl || winner.postExcerpt ? (
                      <div
                        className="rounded-xl overflow-hidden border flex items-center gap-3 p-2.5"
                        style={{
                          backgroundColor: 'var(--bg-surface, rgba(15,18,30,0.6))',
                          borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))',
                        }}
                      >
                        {winner.postThumbnailUrl ? (
                          <img
                            src={winner.postThumbnailUrl}
                            alt="Winning entry"
                            className="w-16 h-16 rounded-lg object-cover shrink-0"
                            loading="lazy"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-0.5">
                            Winning Entry
                          </p>
                          <p className="text-xs line-clamp-2 opacity-90">
                            {winner.postExcerpt || `Entered ${challenge.hashtag}`}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {badge ? (
                      <div className="flex items-center gap-1.5 text-[11px] opacity-80">
                        <Award className="w-3.5 h-3.5 shrink-0" style={{ color: badge.color }} />
                        <span className="truncate">Awarded: {badge.name}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
