import React, { useState } from 'react';
import { X, Flag, ShieldAlert, Ban, VolumeX, CheckCircle2, Loader2 } from 'lucide-react';
import {
  submitContentReport,
  toggleBlockUser,
  toggleMuteUser,
} from '../services/moderationService';
import type { ReportReasonCategory } from '../types';

export interface ReportModalTarget {
  targetType: 'post' | 'reel' | 'comment' | 'message' | 'user' | 'spark';
  targetId: string;
  targetAuthorId?: string;
  targetAuthorName?: string;
  postId?: string;
  channelId?: string;
  groupId?: string;
  targetSummary?: string;
}

interface ReportContentModalProps {
  isOpen: boolean;
  target: ReportModalTarget | null;
  currentUid?: string;
  isAuthorBlocked?: boolean;
  isAuthorMuted?: boolean;
  onClose: () => void;
  onReportSubmitted?: (result: { autoHidden?: boolean; message: string }) => void;
  onBlockChanged?: (targetUid: string, blocked: boolean) => void;
  onMuteChanged?: (targetUid: string, muted: boolean) => void;
}

const REPORT_REASONS: Array<{
  id: ReportReasonCategory;
  label: string;
  description: string;
}> = [
  { id: 'abuse', label: 'Abuse or harassment', description: 'Insults, bullying, threats, or targeted harassment' },
  { id: 'sexual', label: 'Sexual or explicit content', description: 'Nudity, adult content, or unwanted sexual remarks' },
  { id: 'hate', label: 'Hate speech or slurs', description: 'Attacks based on race, religion, gender, or identity' },
  { id: 'spam', label: 'Spam or scam', description: 'Fake giveaways, phishing links, or repetitive spam' },
  { id: 'other', label: 'Other guideline issue', description: 'Something else that feels unsafe on WaveLink' },
];

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  target,
  currentUid,
  isAuthorBlocked = false,
  isAuthorMuted = false,
  onClose,
  onReportSubmitted,
  onBlockChanged,
  onMuteChanged,
}) => {
  const [selectedReason, setSelectedReason] = useState<ReportReasonCategory>('abuse');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'block' | 'mute' | null>(null);
  const [localBlocked, setLocalBlocked] = useState(isAuthorBlocked);
  const [localMuted, setLocalMuted] = useState(isAuthorMuted);

  React.useEffect(() => {
    setLocalBlocked(isAuthorBlocked);
    setLocalMuted(isAuthorMuted);
    if (isOpen) {
      setSelectedReason('abuse');
      setDetails('');
      setSubmittedMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen, target?.targetId, isAuthorBlocked, isAuthorMuted]);

  if (!isOpen || !target) return null;

  const canProtectAgainstAuthor =
    Boolean(currentUid) &&
    Boolean(target.targetAuthorId) &&
    target.targetAuthorId !== currentUid &&
    target.targetAuthorId !== 'wavelink_support_bot';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await submitContentReport({
        targetType: target.targetType,
        targetId: target.targetId,
        targetAuthorId: target.targetAuthorId,
        targetAuthorName: target.targetAuthorName,
        postId: target.postId,
        channelId: target.channelId,
        groupId: target.groupId,
        targetSummary: target.targetSummary,
        reasonCategory: selectedReason,
        details: details.trim(),
      });
      setSubmittedMsg(
        res.autoHidden
          ? 'Report received. This content has been automatically hidden while moderators review it.'
          : res.message
      );
      if (target.targetAuthorId) {
        import('../services/parentalService')
          .then(({ triggerParentalAlert }) =>
            triggerParentalAlert(target.targetAuthorId!, 'teen_reported', 'Community report')
          )
          .catch(() => {});
      }
      onReportSubmitted?.({ autoHidden: res.autoHidden, message: res.message });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not submit report right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!currentUid || !target.targetAuthorId || actionBusy) return;
    setActionBusy('block');
    try {
      const next = !localBlocked;
      await toggleBlockUser(currentUid, target.targetAuthorId, next);
      setLocalBlocked(next);
      onBlockChanged?.(target.targetAuthorId, next);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update block setting.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleToggleMute = async () => {
    if (!currentUid || !target.targetAuthorId || actionBusy) return;
    setActionBusy('mute');
    try {
      const next = !localMuted;
      await toggleMuteUser(currentUid, target.targetAuthorId, next);
      setLocalMuted(next);
      onMuteChanged?.(target.targetAuthorId, next);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update mute setting.');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <Flag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Report {target.targetType === 'user' ? 'Profile' : target.targetType}
              </h3>
              <p className="text-xs text-slate-400">
                Help keep WaveLink respectful and safe for everyone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20"
            aria-label="Close report modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {submittedMsg ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
              <CheckCircle2 className="h-9 w-9 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-white">Thank you for reporting</p>
              <p className="text-xs text-slate-300 leading-relaxed">{submittedMsg}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {target.targetSummary && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 line-clamp-2">
                  “{target.targetSummary}”
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Why are you reporting this?
                </label>
                <div className="space-y-2">
                  {REPORT_REASONS.map((r) => {
                    const active = selectedReason === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedReason(r.id)}
                        className={`w-full text-left rounded-2xl border px-3.5 py-2.5 transition ${
                          active
                            ? 'border-rose-400/70 bg-rose-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="text-sm font-semibold">{r.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{r.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Additional details (optional)
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Add helpful context for our moderation team..."
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none"
                />
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 py-3 text-sm font-bold text-white shadow-lg transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending report...
                  </>
                ) : (
                  <>
                    <Flag className="h-4 w-4" />
                    Submit Report
                  </>
                )}
              </button>
            </form>
          )}

          {canProtectAgainstAuthor && (
            <div className="pt-3 border-t border-white/10 space-y-2">
              <p className="text-xs font-semibold text-slate-400">
                Quick safety controls for {target.targetAuthorName || 'this user'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={handleToggleMute}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    localMuted
                      ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                      : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  {localMuted ? 'Unmute User' : 'Mute User'}
                </button>
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={handleToggleBlock}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    localBlocked
                      ? 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                      : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Ban className="h-3.5 w-3.5" />
                  {localBlocked ? 'Unblock User' : 'Block User'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Mute hides their posts and comments from you quietly. Block also stops messages and profile interactions.
              </p>
            </div>
          )}

          {submittedMsg && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-white/10 hover:bg-white/15 py-2.5 text-sm font-semibold text-white transition"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
