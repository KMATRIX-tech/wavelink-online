import React, { useState } from 'react';
import { Eye, EyeOff, ShieldAlert, Lock } from 'lucide-react';
import { getMediaSafetyVisibility } from '../utils/contentModeration';
import type { MediaSafetyLevel, UserProfile } from '../types';

interface SensitiveMediaGateProps {
  mediaSafety?: MediaSafetyLevel | null;
  userProfile?: Partial<UserProfile> | null;
  className?: string;
  compact?: boolean;
  children: React.ReactNode;
}

/**
 * Layer 3 Media Safety Overlay:
 * - Safe media: renders directly.
 * - Borderline media for Under-18 / Teen accounts: completely hidden (cannot be revealed).
 * - Borderline media for 18+ accounts with Sensitive Content Filter ON (default): blurred with
 *   a clear "Sensitive content — tap to view" overlay.
 * - Borderline media for 18+ accounts with Sensitive Content Filter OFF: renders directly.
 */
export const SensitiveMediaGate: React.FC<SensitiveMediaGateProps> = ({
  mediaSafety,
  userProfile,
  className = '',
  compact = false,
  children,
}) => {
  const [revealed, setRevealed] = useState(false);
  const visibility = getMediaSafetyVisibility(mediaSafety, userProfile);

  if (visibility === 'show') {
    return <>{children}</>;
  }

  if (visibility === 'hide') {
    return (
      <div
        className={`relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/90 text-center text-white ${
          compact ? 'min-h-[140px] p-4' : 'min-h-[240px] p-6'
        } ${className}`}
      >
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
          <Lock className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-white">Sensitive media hidden</p>
        <p className="mt-1 max-w-xs text-xs text-slate-300">
          This media is hidden automatically for under-18 safety protection.
        </p>
      </div>
    );
  }

  // visibility === 'blur' (18+ user with Sensitive Content Filter ON)
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className={`transition-all duration-300 ${
          revealed ? 'blur-0 scale-100' : 'blur-2xl scale-105 brightness-50 pointer-events-none select-none'
        }`}
      >
        {children}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 text-center text-white transition hover:bg-slate-950/50"
          aria-label="Sensitive content — tap to view"
        >
          <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 border border-white/25 text-white shadow-lg">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            Sensitive content — tap to view
          </span>
          {!compact && (
            <span className="mt-1 max-w-[240px] text-[11px] text-white/75">
              Flagged by WaveLink safety filter. Tap to reveal or adjust in Settings.
            </span>
          )}
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white border border-white/20">
            <Eye className="h-3.5 w-3.5" />
            View media
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(false);
          }}
          className="absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md border border-white/15 hover:bg-black/80"
          title="Hide sensitive media again"
        >
          <EyeOff className="h-3 w-3" />
          Hide
        </button>
      )}
    </div>
  );
};
