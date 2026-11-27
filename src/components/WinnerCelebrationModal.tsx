import React, { useEffect, useMemo, useState } from 'react';
import { Award, Check, Sparkles, Trophy, X } from 'lucide-react';
import { PendingWinnerCelebration } from '../types';
import { resolveUnifiedBadge } from '../services/challengesService';
import { BadgeIconGlyph } from './BadgeIconGlyph';

interface WinnerCelebrationModalProps {
  celebration: PendingWinnerCelebration | null | undefined;
  isSimpleMode?: boolean;
  onDismiss: () => Promise<void> | void;
  onEquipBadge?: (badgeId: string) => Promise<void> | void;
  onOpenChallenges?: () => void;
}

export const WinnerCelebrationModal: React.FC<WinnerCelebrationModalProps> = ({
  celebration,
  isSimpleMode = false,
  onDismiss,
  onEquipBadge,
  onOpenChallenges,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const confettiPieces = useMemo(() => {
    const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#38bdf8', '#fb7185'];
    return Array.from({ length: 28 }).map((_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 7) * 0.22}s`,
      duration: `${2.4 + (i % 5) * 0.45}s`,
      color: colors[i % colors.length],
      size: 6 + (i % 4) * 2,
      rotate: (i * 43) % 360,
    }));
  }, []);

  if (!celebration) return null;

  const badge = resolveUnifiedBadge(celebration.badgeId);
  const showConfetti = !prefersReducedMotion && !isSimpleMode;
  const placeText =
    celebration.placement === 1
      ? '1st Place Champion'
      : celebration.placement === 2
      ? '2nd Place Winner'
      : celebration.placement === 3
      ? '3rd Place Winner'
      : `#${celebration.placement} Winner`;

  const handleEquip = async () => {
    if (!celebration.badgeId || !onEquipBadge || equipping) return;
    setEquipping(true);
    try {
      await onEquipBadge(celebration.badgeId);
      setEquipped(true);
    } finally {
      setEquipping(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Challenge Winner Celebration"
    >
      {/* Confetti overlay — disabled automatically when prefers-reduced-motion or isSimpleMode is active */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
          <style>{`
            @keyframes wlConfettiFall {
              0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(540deg); opacity: 0.2; }
            }
          `}</style>
          {confettiPieces.map((p) => (
            <span
              key={p.id}
              style={{
                position: 'absolute',
                top: '-16px',
                left: p.left,
                width: `${p.size}px`,
                height: `${Math.round(p.size * 1.4)}px`,
                backgroundColor: p.color,
                borderRadius: '2px',
                transform: `rotate(${p.rotate}deg)`,
                animation: `wlConfettiFall ${p.duration} linear ${p.delay} infinite`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="relative z-10 w-full max-w-md rounded-3xl border p-6 sm:p-7 text-center shadow-2xl space-y-5"
        style={{
          backgroundColor: 'var(--bg-surface, #131826)',
          borderColor: 'rgba(245,158,11,0.45)',
          color: 'var(--text-primary, #ffffff)',
        }}
      >
        <button
          type="button"
          onClick={() => onDismiss()}
          aria-label="Close celebration"
          className="absolute top-3.5 right-3.5 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border"
          style={{
            backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
            borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
          }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center gap-3 pt-2">
          {badge ? (
            <BadgeIconGlyph badge={badge} size="lg" />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)', color: '#ffffff' }}
            >
              <Trophy className="w-8 h-8" />
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
            <Sparkles className="w-3.5 h-3.5" />
            {placeText}
          </div>

          <h2 className="text-2xl font-black tracking-tight">Congratulations!</h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary, rgba(255,255,255,0.78))' }}
          >
            You won <strong className="text-white">{celebration.challengeTitle}</strong>
            {celebration.hashtag ? ` (${celebration.hashtag})` : ''}!
            {celebration.badgeName || badge?.name ? (
              <>
                {' '}The <strong className="text-amber-300">{badge?.name || celebration.badgeName}</strong> badge has been added to your profile.
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          {celebration.badgeId && onEquipBadge ? (
            <button
              type="button"
              onClick={handleEquip}
              disabled={equipping || equipped}
              className="min-h-[44px] w-full px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-all"
              style={{
                background: equipped
                  ? 'rgba(16,185,129,0.22)'
                  : 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #ec4899))',
                color: equipped ? '#6ee7b7' : '#ffffff',
                border: equipped ? '1px solid rgba(16,185,129,0.4)' : 'none',
              }}
            >
              {equipped ? <Check className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              <span>
                {equipped
                  ? 'Shown next to your name!'
                  : equipping
                  ? 'Equipping badge...'
                  : 'Display badge next to my name'}
              </span>
            </button>
          ) : null}

          <div className="flex items-center gap-2.5">
            {onOpenChallenges ? (
              <button
                type="button"
                onClick={async () => {
                  await onDismiss();
                  onOpenChallenges();
                }}
                className="min-h-[44px] flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm border"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.08))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                }}
              >
                Winners Wall
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDismiss()}
              className="min-h-[44px] flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm border"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.08))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
              }}
            >
              Awesome!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
