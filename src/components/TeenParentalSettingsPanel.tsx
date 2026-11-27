import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Clock,
  Moon,
  PhoneOff,
  PhoneCall,
  MessageSquare,
  MapPinOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  MIN_SIGNUP_AGE,
  ADULT_AGE_THRESHOLD,
  PARENTAL_PRIVACY_NOTICE,
  isTeenAccountActive
} from '../config/ageConfig';
import {
  fetchTeenParentalStatus,
  getTeenRestrictionState,
  requestParentLink,
  setLocalTodayMinutesAtLeast
} from '../services/parentalService';
import type { ParentalControlsConfig } from '../types';

interface TeenParentalSettingsPanelProps {
  onOpenParentDashboard: () => void;
}

export const TeenParentalSettingsPanel: React.FC<TeenParentalSettingsPanelProps> = ({
  onOpenParentDashboard
}) => {
  const { userProfile, currentUser } = useAuth();
  const isTeen = isTeenAccountActive(userProfile);

  const [parentEmail, setParentEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [serverStatus, setServerStatus] = useState<{
    parentalStatus: 'none' | 'unverified_teen' | 'pending_parent' | 'linked';
    parentEmailMasked: string | null;
    verifiedAt: string | null;
    controls: ParentalControlsConfig | null;
    todayMinutes: number;
    deletionRequested: boolean;
  } | null>(null);

  const restriction = getTeenRestrictionState(
    userProfile,
    serverStatus?.todayMinutes
  );

  const loadStatus = async () => {
    if (!currentUser) return;
    setIsLoadingStatus(true);
    try {
      const res = await fetchTeenParentalStatus();
      if (res.success) {
        if (typeof res.todayMinutes === 'number' && userProfile?.id) {
          setLocalTodayMinutesAtLeast(userProfile.id, res.todayMinutes);
        }
        setServerStatus({
          parentalStatus: res.parentalStatus || (isTeen ? 'unverified_teen' : 'none'),
          parentEmailMasked: res.parentEmailMasked || userProfile?.parentEmailMasked || null,
          verifiedAt: res.verifiedAt || null,
          controls: res.controls || userProfile?.parentalSettings || null,
          todayMinutes: res.todayMinutes || 0,
          deletionRequested: Boolean(res.deletionRequested)
        });
      }
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isTeen) {
      loadStatus();
    }
  }, [isTeen, currentUser?.uid]);

  const effectiveStatus = serverStatus?.parentalStatus || restriction.parentalStatus;
  const effectiveMaskedEmail = serverStatus?.parentEmailMasked || userProfile?.parentEmailMasked || null;
  const effectiveControls = serverStatus?.controls || restriction.controls;

  const handleSendParentInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const clean = parentEmail.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setFeedback({ type: 'error', text: 'Please enter a valid parent or guardian email address.' });
      return;
    }
    if (currentUser?.email && clean === currentUser.email.toLowerCase()) {
      setFeedback({ type: 'error', text: 'Parent email must be different from your own email address.' });
      return;
    }

    setIsSending(true);
    try {
      const res = await requestParentLink(clean);
      if (res.success) {
        setFeedback({
          type: 'success',
          text:
            res.message ||
            `We emailed a confirmation link and 6-digit one-time code to ${res.maskedEmail || clean}.`
        });
        setParentEmail('');
        await loadStatus();
      } else {
        setFeedback({ type: 'error', text: res.error || 'Could not send parent verification email.' });
      }
    } finally {
      setIsSending(false);
    }
  };

  // Adult view: quick access to Parent Dashboard & code verification
  if (!isTeen) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                WaveLink Parental Controls &amp; Parent Dashboard
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                Are you a parent or guardian of a teen on WaveLink (ages {MIN_SIGNUP_AGE}–{ADULT_AGE_THRESHOLD - 1})?
                Open your separate Parent Dashboard to confirm a teen link with your email link or 6-digit code, view daily activity summaries, set screen-time &amp; bedtime limits, and manage safety approvals.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">Privacy Guarantee:</strong>{' '}
            {PARENTAL_PRIVACY_NOTICE.parentConsentEn}
          </div>

          <button
            type="button"
            onClick={onOpenParentDashboard}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition cursor-pointer"
          >
            <span>Open Parent Dashboard</span>
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    );
  }

  const todayMins = serverStatus?.todayMinutes ?? restriction.todayMinutes;
  const dailyLimit = effectiveControls?.dailyLimitMinutes ?? restriction.dailyLimitMinutes;
  const pctUsed = Math.min(100, Math.round((todayMins / Math.max(1, dailyLimit)) * 100));

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Status Banner */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Parental Control is Active
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    effectiveStatus === 'linked'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : effectiveStatus === 'pending_parent'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <Lock size={11} />
                  {effectiveStatus === 'linked'
                    ? 'Verified by Parent'
                    : effectiveStatus === 'pending_parent'
                    ? 'Waiting for Parent Confirmation'
                    : 'Parent Confirmation Required'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                {effectiveStatus === 'linked'
                  ? `Linked with ${effectiveMaskedEmail || 'your parent or guardian'}. Only your parent can adjust or turn off Parental Controls.`
                  : effectiveStatus === 'pending_parent'
                  ? `We sent a confirmation link and 6-digit code to ${effectiveMaskedEmail || 'your parent'}. Your account remains in limited safe mode until they confirm.`
                  : 'Because this is a Teen Account (under 18), your profile is currently in limited safe mode (private profile, no stranger messages, no calls, no public posting) until a parent or guardian confirms.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadStatus}
            disabled={isLoadingStatus}
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer"
            aria-label="Refresh parental control status"
          >
            <RefreshCw size={14} className={isLoadingStatus ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Parent Email Linking Form (ONLY shown while NOT yet verified by parent) */}
        {effectiveStatus !== 'linked' ? (
          <form onSubmit={handleSendParentInvite} className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            <label
              htmlFor="teen-parent-email-input"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              {effectiveStatus === 'pending_parent'
                ? 'Resend or update parent / guardian email'
                : 'Enter your parent or guardian email'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
                <input
                  id="teen-parent-email-input"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                />
              </div>
              <button
                type="submit"
                disabled={isSending}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isSending
                  ? 'Sending...'
                  : effectiveStatus === 'pending_parent'
                  ? 'Resend Link & Code'
                  : 'Send Confirmation'}
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Your parent will receive an email with a confirmation link and a one-time 6-digit code. They sign in with their own email to confirm and access their separate Parent Dashboard.
            </p>
          </form>
        ) : (
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
            <Lock size={15} className="shrink-0 mt-0.5 text-[var(--accent-primary)]" />
            <span>
              Parental Control cannot be turned off from this account without your parent&apos;s approval in their Parent Dashboard.
            </span>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Transparency Card: What Parent Can and Cannot See */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-[var(--accent-primary)]" />
          <h4 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
            Transparency: What Your Parent Can &amp; Cannot See
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Eye size={13} />
              <span>Visible in Parent Dashboard</span>
            </p>
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <li>• Daily time spent on WaveLink</li>
              <li>• Number of posts you have shared</li>
              <li>• Who you follow and who follows you</li>
              <li>• Weekly challenges you joined</li>
              <li>• Safety alerts (reports, flagged messages, new chat/follow requests)</li>
            </ul>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] flex items-center gap-1.5">
              <EyeOff size={13} />
              <span>Private — Never Shown to Parents</span>
            </p>
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <li>• Contents of your private chat messages</li>
              <li>• Your password or private draft notes</li>
              <li>• Your raw birthday is never shown publicly on your profile</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Active Limits & Safety Locks Overview */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <h4 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
          Your Active Safety Protections
        </h4>

        {/* Today's Screen Time Meter */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Clock size={14} className="text-[var(--accent-primary)]" />
              <span>Today&apos;s Screen Time</span>
            </span>
            <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
              {todayMins} / {dailyLimit} min
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pctUsed >= 90 ? 'bg-rose-500' : 'bg-[var(--accent-primary)]'
              }`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <Moon size={16} className="text-[var(--accent-primary)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">Bedtime Hours</div>
              <div className="text-[var(--text-secondary)] truncate">
                {effectiveControls?.bedtimeEnabled
                  ? `${effectiveControls.bedtimeStart} – ${effectiveControls.bedtimeEnd}`
                  : 'Off'}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <MessageSquare size={16} className="text-[var(--accent-primary)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">Who Can Message You</div>
              <div className="text-[var(--text-secondary)] truncate">
                {restriction.messagingPolicy === 'nobody' ? 'Nobody' : 'Approved friends only'}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            {restriction.canUseCalls ? (
              <PhoneCall size={16} className="text-emerald-500 shrink-0" />
            ) : (
              <PhoneOff size={16} className="text-rose-500 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">Voice &amp; Video Calls</div>
              <div className="text-[var(--text-secondary)] truncate">
                {restriction.canUseCalls ? 'Allowed by parent' : 'Blocked for safety'}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-teal-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">Sensitive Content Filter</div>
              <div className="text-[var(--text-secondary)] truncate">Always ON (Locked)</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5 sm:col-span-2">
            <MapPinOff size={16} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">Location Sharing &amp; Adult Search Protection</div>
              <div className="text-[var(--text-secondary)]">
                Location tags are disabled on Teen Accounts, and your profile is hidden from adult stranger search results.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
