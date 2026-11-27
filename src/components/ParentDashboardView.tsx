import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Clock,
  Moon,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Lock,
  PauseCircle,
  PlayCircle,
  Bell,
  Users,
  Trophy,
  FileText,
  Check,
  X,
  AlertTriangle,
  Trash2,
  Unlink,
  RefreshCw,
  ArrowLeft,
  KeyRound,
  EyeOff,
  CheckCircle2,
  MapPinOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PARENTAL_PRIVACY_NOTICE } from '../config/ageConfig';
import {
  fetchParentDashboard,
  verifyParentLink,
  updateTeenControlsByParent,
  decideTeenFollowerByParent,
  markParentAlertsRead,
  unlinkTeenByParent,
  requestTeenDeletionByParent
} from '../services/parentalService';
import type { ParentalControlsConfig, ParentalLinkedTeenSummary } from '../types';

interface ParentDashboardViewProps {
  initialVerifyToken?: string | null;
  initialVerifyTeenUid?: string | null;
  onClearVerifyParams?: () => void;
  onBack?: () => void;
}

const DAILY_LIMIT_PRESETS = [30, 60, 90, 120, 180];

export const ParentDashboardView: React.FC<ParentDashboardViewProps> = ({
  initialVerifyToken,
  initialVerifyTeenUid,
  onClearVerifyParams,
  onBack
}) => {
  const { currentUser } = useAuth();
  const [teens, setTeens] = useState<ParentalLinkedTeenSummary[]>([]);
  const [selectedTeenUid, setSelectedTeenUid] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'activity' | 'controls' | 'alerts'>('activity');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Parent verification state (link token OR 6-digit OTP code)
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Destructive modals (Unlink / Delete teen account)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isProcessingDanger, setIsProcessingDanger] = useState(false);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchParentDashboard();
      if (res.success && Array.isArray(res.teens)) {
        setTeens(res.teens);
        setSelectedTeenUid((prev) => {
          if (prev && res.teens?.some((t) => t.teenUid === prev)) return prev;
          return res.teens?.[0]?.teenUid || '';
        });
      } else if (res.error) {
        setNotice({ type: 'error', text: res.error });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-confirm if parent arrived from email confirmation link (?parentVerify=...&teen=...)
  const handleConfirmViaLink = async () => {
    if (!initialVerifyToken || isVerifying) return;
    setIsVerifying(true);
    setNotice(null);
    try {
      const res = await verifyParentLink({
        token: initialVerifyToken,
        teenUid: initialVerifyTeenUid || undefined
      });
      if (res.success) {
        setNotice({
          type: 'success',
          text: `Confirmed! ${res.teenDisplayName || 'Your teen'} is now linked to your Parent Dashboard.`
        });
        onClearVerifyParams?.();
        await loadDashboard();
      } else {
        setNotice({ type: 'error', text: res.error || 'Could not confirm parent link.' });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setNotice({ type: 'error', text: 'Please enter the 6-digit one-time code from your email.' });
      return;
    }
    setIsVerifying(true);
    setNotice(null);
    try {
      const res = await verifyParentLink({ code: cleanCode });
      if (res.success) {
        setOtpCode('');
        setNotice({
          type: 'success',
          text: `Confirmed! ${res.teenDisplayName || 'Your teen'} is now linked to your Parent Dashboard.`
        });
        await loadDashboard();
      } else {
        setNotice({ type: 'error', text: res.error || 'Invalid or expired code.' });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const selectedTeen = teens.find((t) => t.teenUid === selectedTeenUid) || teens[0] || null;
  const unreadAlertsCount = selectedTeen
    ? selectedTeen.alerts.filter((a) => !a.read).length
    : 0;

  const handleUpdateControl = async (patch: Partial<ParentalControlsConfig>) => {
    if (!selectedTeen || isSaving) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const res = await updateTeenControlsByParent(selectedTeen.teenUid, {
        ...selectedTeen.controls,
        ...patch
      });
      if (res.success && res.controls) {
        setTeens((prev) =>
          prev.map((t) =>
            t.teenUid === selectedTeen.teenUid ? { ...t, controls: res.controls! } : t
          )
        );
        setNotice({ type: 'success', text: 'Parental control settings saved.' });
      } else {
        setNotice({ type: 'error', text: res.error || 'Could not save controls.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleFollowerDecision = async (requestId: string, decision: 'approve' | 'decline') => {
    if (!selectedTeen) return;
    setNotice(null);
    const res = await decideTeenFollowerByParent(requestId, decision);
    if (res.success) {
      setNotice({
        type: 'success',
        text: decision === 'approve' ? 'Follower approved.' : 'Follow request declined.'
      });
      await loadDashboard();
    } else {
      setNotice({ type: 'error', text: res.error || 'Could not update request.' });
    }
  };

  const handleMarkAllAlertsRead = async () => {
    if (!selectedTeen) return;
    const res = await markParentAlertsRead(selectedTeen.teenUid);
    if (res.success) {
      setTeens((prev) =>
        prev.map((t) =>
          t.teenUid === selectedTeen.teenUid
            ? { ...t, alerts: t.alerts.map((a) => ({ ...a, read: true })) }
            : t
        )
      );
    }
  };

  const handleConfirmUnlink = async () => {
    if (!selectedTeen || isProcessingDanger) return;
    setIsProcessingDanger(true);
    try {
      const res = await unlinkTeenByParent(selectedTeen.teenUid);
      if (res.success) {
        setShowUnlinkConfirm(false);
        setNotice({ type: 'success', text: res.message || 'Parental link removed.' });
        await loadDashboard();
      } else {
        setNotice({ type: 'error', text: res.error || 'Could not unlink.' });
      }
    } finally {
      setIsProcessingDanger(false);
    }
  };

  const handleConfirmDeletionRequest = async () => {
    if (!selectedTeen || isProcessingDanger) return;
    setIsProcessingDanger(true);
    try {
      const res = await requestTeenDeletionByParent(selectedTeen.teenUid, deleteReason.trim() || undefined);
      if (res.success) {
        setShowDeleteModal(false);
        setDeleteReason('');
        setNotice({
          type: 'success',
          text:
            res.message ||
            'Deletion request recorded. Your teen account has been paused immediately.'
        });
        await loadDashboard();
      } else {
        setNotice({ type: 'error', text: res.error || 'Could not submit deletion request.' });
      }
    } finally {
      setIsProcessingDanger(false);
    }
  };

  const maxDayMinutes = selectedTeen
    ? Math.max(
        selectedTeen.controls.dailyLimitMinutes || 60,
        ...selectedTeen.activity.dailyScreenTime.map((d) => d.minutes),
        10
      )
    : 60;

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 overflow-x-hidden">
      {/* Header */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] min-w-[44px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-center hover:opacity-90 cursor-pointer shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-[var(--accent-primary)] shrink-0" />
              <h1 className="text-lg sm:text-2xl font-extrabold text-[var(--text-primary)] truncate">
                Parent Dashboard
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] truncate mt-0.5">
              Signed in as {currentUser?.email || 'Parent account'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={isLoading}
          className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 hover:opacity-90 cursor-pointer"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Email Confirmation Link Banner */}
      {initialVerifyToken && (
        <div className="rounded-3xl border-2 border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/8 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-[var(--accent-primary)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Confirm Parent Link Request
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {PARENTAL_PRIVACY_NOTICE.parentConsentEn}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleConfirmViaLink}
              disabled={isVerifying}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {isVerifying ? 'Confirming...' : 'Confirm & Link Teen Account'}
            </button>
            {onClearVerifyParams && (
              <button
                type="button"
                onClick={onClearVerifyParams}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium text-[var(--text-secondary)] cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* One-Time Code Verification Card (always accessible so parents can confirm another teen) */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-[var(--accent-primary)]" />
          <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
            Confirm a Teen Link with 6-Digit Code
          </h2>
        </div>
        <form onSubmit={handleVerifyWithCode} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6-digit code from email"
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-sm font-mono tracking-widest text-[var(--text-primary)] placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          />
          <button
            type="submit"
            disabled={isVerifying || otpCode.length !== 6}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isVerifying ? 'Verifying...' : 'Confirm Link'}
          </button>
        </form>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Make sure you are signed in with the exact email address your teen entered in Settings &rarr; Parental Control.
        </p>
      </div>

      {/* Linked Teens Switcher */}
      {isLoading ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-secondary)]">
          Loading Parent Dashboard...
        </div>
      ) : !selectedTeen ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-2">
          <ShieldCheck size={32} className="mx-auto text-[var(--text-secondary)]" />
          <h3 className="text-base font-bold text-[var(--text-primary)]">
            No Linked Teen Accounts Yet
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
            Ask your teen to open <strong>Settings &rarr; Parental Control</strong> on their WaveLink account and enter your email ({currentUser?.email || 'your email'}). Then enter the 6-digit code above or tap the confirmation link in your inbox.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {teens.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {teens.map((teen) => (
                <button
                  key={teen.teenUid}
                  type="button"
                  onClick={() => setSelectedTeenUid(teen.teenUid)}
                  className={`min-h-[44px] px-4 py-2 rounded-2xl text-sm font-semibold border transition shrink-0 cursor-pointer ${
                    teen.teenUid === selectedTeen.teenUid
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                  }`}
                >
                  {teen.teenDisplayName}
                </button>
              ))}
            </div>
          )}

          {/* Selected Teen Profile Header + Quick Pause */}
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {selectedTeen.teenPhotoURL ? (
                <img
                  src={selectedTeen.teenPhotoURL}
                  alt={selectedTeen.teenDisplayName}
                  className="w-12 h-12 rounded-2xl object-cover border border-[var(--border-subtle)] shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-bold text-lg flex items-center justify-center shrink-0">
                  {selectedTeen.teenDisplayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate">
                    {selectedTeen.teenDisplayName}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      selectedTeen.controls.isPaused
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                        : selectedTeen.status === 'verified'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {selectedTeen.controls.isPaused
                      ? 'Paused'
                      : selectedTeen.status === 'verified'
                      ? 'Verified Link'
                      : 'Pending Verification'}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {selectedTeen.teenUsername}
                  {selectedTeen.turns18At ? ` · Teen protections until ${selectedTeen.turns18At}` : ''}
                </p>
              </div>
            </div>

            {selectedTeen.status === 'verified' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleUpdateControl({ isPaused: !selectedTeen.controls.isPaused })}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer shrink-0 ${
                  selectedTeen.controls.isPaused
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
              >
                {selectedTeen.controls.isPaused ? (
                  <>
                    <PlayCircle size={17} />
                    <span>Resume Account</span>
                  </>
                ) : (
                  <>
                    <PauseCircle size={17} />
                    <span>Pause Account</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Pending verification notice if teen link is not yet confirmed */}
          {selectedTeen.status !== 'verified' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
              This link is waiting for confirmation. Enter the 6-digit code from your email above to unlock full Parent Dashboard controls.
            </div>
          )}

          {/* Sub-Navigation Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            {(
              [
                { id: 'activity', label: 'Activity', icon: Clock },
                { id: 'controls', label: 'Controls', icon: Lock },
                { id: 'alerts', label: `Alerts${unreadAlertsCount ? ` (${unreadAlertsCount})` : ''}`, icon: Bell }
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isActive
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon size={15} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: ACTIVITY SUMMARY (NO PRIVATE MESSAGE CONTENTS) */}
          {activeSubTab === 'activity' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                <EyeOff size={15} className="text-[var(--accent-primary)] shrink-0" />
                <span>
                  Activity summary only — private chat message contents are <strong>never</strong> shown here.
                </span>
              </div>

              {/* 4 Key KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Clock size={14} className="text-[var(--accent-primary)]" />
                    <span>Time Today</span>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                    {selectedTeen.activity.todayMinutes}m
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 tabular-nums">
                    Limit: {selectedTeen.controls.dailyLimitMinutes} min/day
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <FileText size={14} className="text-[var(--accent-primary)]" />
                    <span>Posts</span>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                    {selectedTeen.activity.postsCount}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Total shared posts
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Users size={14} className="text-[var(--accent-primary)]" />
                    <span>Connections</span>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                    {selectedTeen.activity.followers.length} / {selectedTeen.activity.following.length}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Followers / Following
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Trophy size={14} className="text-[var(--accent-primary)]" />
                    <span>Challenges</span>
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                    {selectedTeen.activity.challengesJoined.length}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Challenges joined
                  </div>
                </div>
              </div>

              {/* 7-Day Screen Time Breakdown */}
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                    Time Spent Per Day (Last 7 Days)
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                    Daily limit: {selectedTeen.controls.dailyLimitMinutes} min
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2 items-end h-36 pt-4">
                  {selectedTeen.activity.dailyScreenTime.map((entry) => {
                    const heightPct = Math.max(8, Math.round((entry.minutes / maxDayMinutes) * 100));
                    const label = entry.date.slice(5);
                    return (
                      <div key={entry.date} className="flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[10px] font-mono text-[var(--text-secondary)] tabular-nums">
                          {entry.minutes}m
                        </span>
                        <div className="w-full max-w-[36px] flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-lg transition-all ${
                              entry.minutes >= selectedTeen.controls.dailyLimitMinutes
                                ? 'bg-rose-500'
                                : 'bg-[var(--accent-primary)]'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Following & Followers Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Following ({selectedTeen.activity.following.length})
                  </h3>
                  {selectedTeen.activity.following.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]">Not following anyone yet.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-subtle)] max-h-56 overflow-y-auto">
                      {selectedTeen.activity.following.map((person) => (
                        <li key={person.uid} className="py-2 text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{person.displayName}</span>
                          {person.username && (
                            <span className="text-xs text-[var(--text-secondary)] truncate">{person.username}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Followers ({selectedTeen.activity.followers.length})
                  </h3>
                  {selectedTeen.activity.followers.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]">No followers yet.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-subtle)] max-h-56 overflow-y-auto">
                      {selectedTeen.activity.followers.map((person) => (
                        <li key={person.uid} className="py-2 text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{person.displayName}</span>
                          {person.username && (
                            <span className="text-xs text-[var(--text-secondary)] truncate">{person.username}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Challenges Joined */}
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Challenges Joined ({selectedTeen.activity.challengesJoined.length})
                </h3>
                {selectedTeen.activity.challengesJoined.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">No challenges joined yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedTeen.activity.challengesJoined.map((ch) => (
                      <div
                        key={ch.id}
                        className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                            {ch.title}
                          </div>
                          {ch.hashtag && (
                            <div className="text-[11px] text-[var(--accent-primary)] truncate">
                              {ch.hashtag}
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                          {ch.date ? ch.date.slice(0, 10) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONTROLS */}
          {activeSubTab === 'controls' && (
            <div className="space-y-4">
              {/* Pending Follower Approvals Queue */}
              {selectedTeen.pendingFollowers.length > 0 && (
                <div className="rounded-3xl border-2 border-[var(--accent-primary)]/35 bg-[var(--bg-surface)] p-5 space-y-3">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Users size={17} className="text-[var(--accent-primary)]" />
                    <span>Pending Follower Approvals ({selectedTeen.pendingFollowers.length})</span>
                  </h3>
                  <div className="space-y-2.5">
                    {selectedTeen.pendingFollowers.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {req.requesterName}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] truncate">
                            {req.requesterUsername || 'WaveLink member'} · Requested{' '}
                            {req.requestedAt ? req.requestedAt.slice(0, 10) : 'recently'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleFollowerDecision(req.id, 'approve')}
                            className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-700 cursor-pointer"
                          >
                            <Check size={14} />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFollowerDecision(req.id, 'decline')}
                            className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer"
                          >
                            <X size={14} />
                            <span>Decline</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Time Limit & Bedtime */}
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Clock size={16} className="text-[var(--accent-primary)]" />
                      <span>Daily Time Limit</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-[var(--accent-primary)] tabular-nums">
                      {selectedTeen.controls.dailyLimitMinutes} min / day
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {DAILY_LIMIT_PRESETS.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        disabled={isSaving || selectedTeen.status !== 'verified'}
                        onClick={() => handleUpdateControl({ dailyLimitMinutes: mins })}
                        className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer disabled:opacity-50 ${
                          selectedTeen.controls.dailyLimitMinutes === mins
                            ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bedtime Hours */}
                <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Moon size={16} className="text-[var(--accent-primary)]" />
                        <span>Bedtime Hours</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Locks WaveLink automatically during sleep hours.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving || selectedTeen.status !== 'verified'}
                      onClick={() =>
                        handleUpdateControl({ bedtimeEnabled: !selectedTeen.controls.bedtimeEnabled })
                      }
                      className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 ${
                        selectedTeen.controls.bedtimeEnabled
                          ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {selectedTeen.controls.bedtimeEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {selectedTeen.controls.bedtimeEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                        <span>Start (Lock)</span>
                        <input
                          type="time"
                          value={selectedTeen.controls.bedtimeStart}
                          disabled={isSaving || selectedTeen.status !== 'verified'}
                          onChange={(e) => handleUpdateControl({ bedtimeStart: e.target.value })}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                        <span>End (Unlock)</span>
                        <input
                          type="time"
                          value={selectedTeen.controls.bedtimeEnd}
                          disabled={isSaving || selectedTeen.status !== 'verified'}
                          onChange={(e) => handleUpdateControl({ bedtimeEnd: e.target.value })}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Communication, Visibility & Safety Controls */}
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  Communication &amp; Safety Permissions
                </h3>

                {/* Who can message */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <MessageSquare size={15} className="text-[var(--accent-primary)]" />
                      <span>Who Can Message Your Teen</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Strangers and non-friends are always blocked.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    {(
                      [
                        { id: 'approved_friends', label: 'Approved Friends' },
                        { id: 'nobody', label: 'Nobody' }
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isSaving || selectedTeen.status !== 'verified'}
                        onClick={() => handleUpdateControl({ messagingPolicy: opt.id })}
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                          selectedTeen.controls.messagingPolicy === opt.id
                            ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Account Privacy */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Profile &amp; Post Visibility
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Private keeps posts visible only to approved followers.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    {(
                      [
                        { id: 'private', label: 'Private' },
                        { id: 'public', label: 'Public' }
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isSaving || selectedTeen.status !== 'verified'}
                        onClick={() => handleUpdateControl({ profileVisibility: opt.id })}
                        className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                          selectedTeen.controls.profileVisibility === opt.id
                            ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice & Video Calls */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      {selectedTeen.controls.allowCalls ? (
                        <PhoneCall size={15} className="text-emerald-500" />
                      ) : (
                        <PhoneOff size={15} className="text-rose-500" />
                      )}
                      <span>Voice &amp; Video Calls</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Block or allow voice and video calls with approved friends.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving || selectedTeen.status !== 'verified'}
                    onClick={() => handleUpdateControl({ allowCalls: !selectedTeen.controls.allowCalls })}
                    className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 shrink-0 ${
                      selectedTeen.controls.allowCalls
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {selectedTeen.controls.allowCalls ? 'Allowed' : 'Blocked'}
                  </button>
                </div>

                {/* Approve new followers */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Require Approval for New Followers
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      You review and approve new follow requests before they connect.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving || selectedTeen.status !== 'verified'}
                    onClick={() =>
                      handleUpdateControl({
                        requireFollowerApproval: !selectedTeen.controls.requireFollowerApproval
                      })
                    }
                    className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 shrink-0 ${
                      selectedTeen.controls.requireFollowerApproval
                        ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {selectedTeen.controls.requireFollowerApproval ? 'Required' : 'Off'}
                  </button>
                </div>

                {/* Email Alerts */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Email Safety Alerts
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Receive email alerts if your teen is reported, gets a flagged message, or receives a new request.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving || selectedTeen.status !== 'verified'}
                    onClick={() =>
                      handleUpdateControl({
                        emailAlertsEnabled: !selectedTeen.controls.emailAlertsEnabled
                      })
                    }
                    className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 shrink-0 ${
                      selectedTeen.controls.emailAlertsEnabled
                        ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {selectedTeen.controls.emailAlertsEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Always-Locked Teen Safety Guarantees */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center gap-2.5 text-xs">
                    <Lock size={15} className="text-teal-600 dark:text-teal-400 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">Strict Sensitive Content Filter</div>
                      <div className="text-[var(--text-secondary)]">Always ON (Locked for Teen Safety)</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2.5 text-xs">
                    <MapPinOff size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">Location Sharing &amp; Adult Search</div>
                      <div className="text-[var(--text-secondary)]">Location OFF · Hidden from adult strangers</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parent-Only Account Actions: Unlink or Request Deletion */}
              {selectedTeen.status === 'verified' && (
                <div className="rounded-3xl border border-rose-500/25 bg-[var(--bg-surface)] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle size={16} />
                    <span>Parent Account Actions</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Only you (the verified parent) can approve removing Parental Controls or request complete deletion of your teen&apos;s data and account.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowUnlinkConfirm(true)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 hover:opacity-90 cursor-pointer"
                    >
                      <Unlink size={15} />
                      <span>Approve Turn Off / Unlink</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      disabled={selectedTeen.deletionRequested}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                    >
                      <Trash2 size={15} />
                      <span>
                        {selectedTeen.deletionRequested
                          ? 'Deletion Request Submitted'
                          : "Request Deletion of Teen's Data & Account"}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAFETY ALERTS */}
          {activeSubTab === 'alerts' && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                    Parent Safety Alerts
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Notifies you if your teen is reported, receives a flagged message, or gets a new chat/follow request.
                  </p>
                </div>
                {unreadAlertsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAlertsRead}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {selectedTeen.alerts.length === 0 ? (
                <div className="py-10 text-center text-xs sm:text-sm text-[var(--text-secondary)]">
                  No safety alerts yet. Everything looks calm.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedTeen.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-2xl border space-y-1 ${
                        alert.read
                          ? 'bg-[var(--bg-subtle)]/60 border-[var(--border-subtle)]'
                          : 'bg-[var(--accent-primary)]/8 border-[var(--accent-primary)]/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                          {alert.title}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                          {alert.createdAt ? alert.createdAt.slice(0, 10) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {alert.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm Unlink Modal */}
      {showUnlinkConfirm && selectedTeen && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Unlink Parental Controls?
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              This removes your Parent Dashboard link from <strong>{selectedTeen.teenDisplayName}</strong>. Under-18 safety filters remain ON, and the account returns to limited mode until another parent links.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingDanger}
                onClick={handleConfirmUnlink}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {isProcessingDanger ? 'Removing...' : 'Confirm Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Deletion of Teen Data & Account Modal */}
      {showDeleteModal && selectedTeen && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 size={20} />
              <h3 className="text-base font-bold">Request Teen Data &amp; Account Deletion</h3>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              Submitting this request immediately pauses <strong>{selectedTeen.teenDisplayName}</strong>&apos;s account and queues complete removal of their profile, posts, and activity data. You will receive an email confirmation.
            </p>
            <textarea
              rows={3}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Optional note or reason..."
              className="w-full p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingDanger}
                onClick={handleConfirmDeletionRequest}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {isProcessingDanger ? 'Submitting...' : 'Pause & Request Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
