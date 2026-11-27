import React, { useMemo, useState } from 'react';
import { Award, Calendar, Check, Sparkles, X } from 'lucide-react';
import { UserProfile } from '../types';
import {
  getCachedCustomBadgesSync,
  resolveUnifiedBadge,
  UnifiedBadgeMeta,
} from '../services/challengesService';
import { BadgeIconGlyph } from './BadgeIconGlyph';

interface ProfileBadgesRowProps {
  profile: UserProfile | null;
  isOwnProfile: boolean;
  onSelectHighlightedBadge?: (badgeId: string | null) => Promise<void> | void;
  language?: 'en' | 'sw';
}

interface ResolvedUserBadge {
  meta: UnifiedBadgeMeta;
  awardedAt?: string;
}

export const ProfileBadgesRow: React.FC<ProfileBadgesRowProps> = ({
  profile,
  isOwnProfile,
  onSelectHighlightedBadge,
  language = 'en',
}) => {
  const [selectedBadge, setSelectedBadge] = useState<ResolvedUserBadge | null>(null);
  const [savingHighlight, setSavingHighlight] = useState(false);

  const earnedBadges = useMemo<ResolvedUserBadge[]>(() => {
    const customList = getCachedCustomBadgesSync();
    const raw = Array.isArray(profile?.badges) ? profile.badges : [];
    const seen = new Set<string>();
    const list: ResolvedUserBadge[] = [];

    for (const entry of raw) {
      if (!entry?.id || seen.has(entry.id)) continue;
      const meta = resolveUnifiedBadge(entry.id, customList);
      if (meta) {
        seen.add(entry.id);
        list.push({ meta, awardedAt: entry.awardedAt });
      }
    }

    // Also include highlightedBadgeId if somehow not in raw badges array
    if (profile?.highlightedBadgeId && !seen.has(profile.highlightedBadgeId)) {
      const meta = resolveUnifiedBadge(profile.highlightedBadgeId, customList);
      if (meta) {
        seen.add(meta.id);
        list.push({ meta });
      }
    }

    return list;
  }, [profile?.badges, profile?.highlightedBadgeId]);

  if (earnedBadges.length === 0 && !isOwnProfile) return null;

  const currentHighlightedId = profile?.highlightedBadgeId || null;

  const handleToggleHighlight = async (badgeId: string) => {
    if (!onSelectHighlightedBadge || savingHighlight) return;
    setSavingHighlight(true);
    try {
      const next = currentHighlightedId === badgeId ? null : badgeId;
      await onSelectHighlightedBadge(next);
    } finally {
      setSavingHighlight(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-hairline)] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-primary)]">
          <Award size={14} className="text-amber-500 shrink-0" />
          <span>{language === 'sw' ? 'Beji Zilizopatikana' : 'Badges'}</span>
          {earnedBadges.length > 0 && (
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
              ({earnedBadges.length})
            </span>
          )}
        </div>
        {isOwnProfile && earnedBadges.length > 0 && (
          <span className="text-[11px] text-[var(--text-secondary)]">
            {language === 'sw'
              ? 'Gusa beji kuonyesha pembeni ya jina'
              : 'Tap any badge for details or to pin next to your name'}
          </span>
        )}
      </div>

      {earnedBadges.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {language === 'sw'
            ? 'Shiriki Mashindano ya Wiki ili kushinda beji maalum!'
            : 'Join Weekly Challenges to earn custom badges you can showcase next to your name.'}
        </p>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {earnedBadges.map((item) => {
            const isHighlighted = currentHighlightedId === item.meta.id;
            return (
              <button
                key={item.meta.id}
                type="button"
                onClick={() => setSelectedBadge(item)}
                className="min-h-[44px] px-2.5 py-1.5 rounded-xl border flex items-center gap-2 shrink-0 transition active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: isHighlighted
                    ? `${item.meta.color}22`
                    : 'var(--bg-subtle, rgba(255,255,255,0.05))',
                  borderColor: isHighlighted
                    ? item.meta.color
                    : 'var(--border-hairline, rgba(255,255,255,0.12))',
                }}
                title={item.meta.name}
              >
                <BadgeIconGlyph badge={item.meta} size="sm" />
                <span className="text-xs font-bold text-[var(--text-primary)] max-w-[130px] truncate">
                  {item.meta.name}
                </span>
                {isHighlighted && (
                  <Sparkles size={12} style={{ color: item.meta.color }} className="shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Badge Details Modal */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-6 text-center space-y-4 shadow-2xl relative"
            style={{
              backgroundColor: 'var(--bg-surface, #131826)',
              borderColor: `${selectedBadge.meta.color}66`,
              color: 'var(--text-primary, #ffffff)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedBadge(null)}
              aria-label="Close badge details"
              className="absolute top-3.5 right-3.5 min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                borderColor: 'var(--border-hairline, rgba(255,255,255,0.12))',
              }}
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center gap-3 pt-2">
              <BadgeIconGlyph badge={selectedBadge.meta} size="lg" />
              <h3 className="text-lg font-extrabold">{selectedBadge.meta.name}</h3>
              <p className="text-sm opacity-80 leading-relaxed">{selectedBadge.meta.description}</p>
              {selectedBadge.meta.challengeTitle && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Sparkles size={12} />
                  {selectedBadge.meta.challengeTitle}
                </span>
              )}
              {selectedBadge.awardedAt && (
                <p className="text-xs opacity-65 inline-flex items-center gap-1">
                  <Calendar size={12} />
                  Earned {new Date(selectedBadge.awardedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {isOwnProfile && onSelectHighlightedBadge && (
              <button
                type="button"
                disabled={savingHighlight}
                onClick={() => handleToggleHighlight(selectedBadge.meta.id)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition"
                style={{
                  backgroundColor:
                    currentHighlightedId === selectedBadge.meta.id
                      ? 'rgba(16,185,129,0.2)'
                      : selectedBadge.meta.color,
                  color:
                    currentHighlightedId === selectedBadge.meta.id ? '#6ee7b7' : '#ffffff',
                  border:
                    currentHighlightedId === selectedBadge.meta.id
                      ? '1px solid rgba(16,185,129,0.45)'
                      : 'none',
                }}
              >
                {currentHighlightedId === selectedBadge.meta.id ? (
                  <>
                    <Check size={16} />
                    <span>Shown next to your name (Tap to hide)</span>
                  </>
                ) : (
                  <>
                    <Award size={16} />
                    <span>Show next to my name on posts &amp; comments</span>
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
