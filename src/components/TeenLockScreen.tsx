import React from 'react';
import { Moon, Clock, PauseCircle, ShieldCheck, LogOut } from 'lucide-react';
import type { TeenRestrictionState } from '../services/parentalService';

interface TeenLockScreenProps {
  restriction: TeenRestrictionState;
  parentEmailMasked?: string | null;
  onSignOut: () => void;
}

export const TeenLockScreen: React.FC<TeenLockScreenProps> = ({
  restriction,
  parentEmailMasked,
  onSignOut
}) => {
  if (!restriction.lockReason) return null;

  const isPaused = restriction.lockReason === 'paused';
  const isBedtime = restriction.lockReason === 'bedtime';

  const title = isPaused
    ? 'Account Paused by Parent'
    : isBedtime
    ? 'Bedtime Quiet Hours'
    : 'Daily Time Limit Reached';

  const subtitle = isPaused
    ? 'Your parent or guardian has temporarily paused access to this WaveLink account.'
    : isBedtime
    ? `WaveLink is resting during bedtime hours (${restriction.controls?.bedtimeStart || '22:00'} – ${restriction.controls?.bedtimeEnd || '06:30'}). See you in the morning!`
    : `You have reached today's ${restriction.dailyLimitMinutes}-minute daily screen-time limit (${restriction.todayMinutes} min used). Your timer resets tomorrow.`;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-[var(--bg-canvas)]/95 backdrop-blur-xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teen-lock-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center">
          {isPaused ? (
            <PauseCircle size={32} />
          ) : isBedtime ? (
            <Moon size={32} />
          ) : (
            <Clock size={32} />
          )}
        </div>

        <div className="space-y-2">
          <h1
            id="teen-lock-title"
            className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight"
          >
            {title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {subtitle}
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 text-left text-xs text-[var(--text-secondary)] space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <ShieldCheck size={14} className="text-[var(--accent-primary)] shrink-0" />
            <span>WaveLink Parental Controls</span>
          </div>
          <p className="leading-relaxed">
            {parentEmailMasked
              ? `Managed by ${parentEmailMasked}. Only your parent or guardian can resume your account or adjust today's limit from their Parent Dashboard.`
              : 'Only your parent or guardian can adjust these limits from their Parent Dashboard.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)]/60 text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
};
