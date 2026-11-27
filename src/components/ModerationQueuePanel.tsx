import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Clock,
  Ban,
  Gavel,
  ScrollText,
  Scale,
  Loader2,
} from 'lucide-react';
import {
  fetchModerationQueue,
  executeModerationQueueAction,
  reviewModerationAppeal,
} from '../services/moderationService';
import type { ContentReport, AdminAuditLog } from '../types';

interface ModerationQueuePanelProps {
  isAdmin: boolean;
  onToast?: (msg: string) => void;
}

type QueueTab = 'reports' | 'appeals' | 'logs';

/**
 * Layer 4 Admin & Sub-Admin Moderation Queue.
 * Loads on-demand via REST (`/api/moderation/queue`) — zero real-time Firestore listeners.
 */
export const ModerationQueuePanel: React.FC<ModerationQueuePanelProps> = ({
  isAdmin,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<QueueTab>('reports');
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'open' | 'all'>('open');

  const loadQueue = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchModerationQueue();
      setReports(data.reports || []);
      setAppeals(data.appeals || []);
      setLogs(data.recentLogs || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not load moderation queue.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadQueue();
    }
  }, [isAdmin, loadQueue]);

  if (!isAdmin) return null;

  const handleReportAction = async (
    report: ContentReport,
    action: 'approve' | 'remove' | 'warn' | 'mute_24h' | 'suspend_7d' | 'ban' | 'strike_auto'
  ) => {
    setBusyId(`${report.id}_${action}`);
    try {
      const targetType =
        report.targetType === 'bot_reply' ? 'message' : report.targetType || 'post';
      const res = await executeModerationQueueAction({
        action,
        reportId: report.id,
        targetType,
        targetId: report.targetId,
        targetUserId: report.targetAuthorId,
        postId: report.postId,
        channelId: report.channelId,
        groupId: report.groupId,
        reason: report.reason || report.reasonCategory || 'Community Guidelines review',
      });
      onToast?.(res.message);
      await loadQueue();
    } catch (err: any) {
      onToast?.(err?.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAppealDecision = async (appealId: string, status: 'approved' | 'rejected') => {
    setBusyId(`${appealId}_${status}`);
    try {
      const res = await reviewModerationAppeal({
        appealId,
        status,
        resolutionNote:
          status === 'approved'
            ? 'Reviewed and restored by WaveLink Moderation.'
            : 'Reviewed and upheld under WaveLink Community Guidelines.',
      });
      onToast?.(res.message);
      await loadQueue();
    } catch (err: any) {
      onToast?.(err?.message || 'Could not update appeal.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleReports =
    filterStatus === 'open'
      ? reports.filter((r) => r.status === 'open' || r.status === 'auto_hidden')
      : reports;

  const pendingAppealsCount = appeals.filter((a) => a.status === 'pending').length;
  const openReportsCount = reports.filter(
    (r) => r.status === 'open' || r.status === 'auto_hidden'
  ).length;

  return (
    <div className="rounded-3xl border border-white/15 bg-slate-950/75 p-4 sm:p-5 text-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-300">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Moderation Queue</h3>
            <p className="text-xs text-slate-400">
              Review flagged posts, comments, messages, strikes, and user appeals on demand.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            activeTab === 'reports'
              ? 'bg-rose-500/25 text-rose-200 border border-rose-400/40'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Gavel className="h-3.5 w-3.5" />
          Flagged & Reports ({openReportsCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('appeals')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            activeTab === 'appeals'
              ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          Appeals ({pendingAppealsCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            activeTab === 'logs'
              ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Action Log ({logs.length})
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {loading && reports.length === 0 && appeals.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <Loader2 className="h-5 w-5 animate-spin text-rose-400" />
          Loading moderation queue...
        </div>
      ) : activeTab === 'reports' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterStatus('open')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                filterStatus === 'open' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Needs Review ({openReportsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                filterStatus === 'all' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Reports ({reports.length})
            </button>
          </div>

          {visibleReports.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-slate-400">
              No flagged items waiting for review.
            </div>
          ) : (
            visibleReports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 font-bold uppercase text-white">
                      {rep.targetType}
                    </span>
                    {rep.reasonCategory && (
                      <span className="rounded-md bg-rose-500/20 px-2 py-0.5 font-bold text-rose-200">
                        {rep.reasonCategory}
                      </span>
                    )}
                    {rep.status === 'auto_hidden' && (
                      <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-200">
                        Auto-Hidden
                      </span>
                    )}
                    {rep.source && rep.source !== 'user_report' && (
                      <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-bold text-indigo-200">
                        {rep.source}
                      </span>
                    )}
                    {typeof rep.reportCount === 'number' && rep.reportCount > 1 && (
                      <span className="rounded-md bg-rose-600/30 px-2 py-0.5 font-bold text-rose-100">
                        {rep.reportCount} reports
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {rep.createdAt ? new Date(rep.createdAt).toLocaleString() : ''}
                  </span>
                </div>

                {rep.targetSummary && (
                  <p className="rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
                    {rep.targetSummary}
                  </p>
                )}

                <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Reason: <strong className="text-slate-200">{rep.reason}</strong></span>
                  {rep.targetAuthorId && (
                    <span>Author UID: <code className="text-slate-300">{rep.targetAuthorId.slice(0, 14)}</code></span>
                  )}
                  <span>Status: <strong className="text-slate-200">{rep.status}</strong></span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void handleReportAction(rep, 'approve')}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/30 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void handleReportAction(rep, 'remove')}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-400/30 px-2.5 py-1.5 text-[11px] font-bold text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                  {rep.targetAuthorId && rep.targetAuthorId !== 'wavelink_support_bot' && (
                    <>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleReportAction(rep, 'strike_auto')}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/30 px-2.5 py-1.5 text-[11px] font-bold text-amber-200"
                        title="Applies next strike on the ladder: Warn -> 24h Mute -> 7d Suspend -> Ban"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Auto Strike
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleReportAction(rep, 'warn')}
                        className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200"
                      >
                        Warn
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleReportAction(rep, 'mute_24h')}
                        className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200"
                      >
                        <Clock className="h-3 w-3" />
                        24h Mute
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleReportAction(rep, 'suspend_7d')}
                        className="inline-flex items-center gap-1 rounded-xl bg-orange-500/20 hover:bg-orange-500/35 px-2.5 py-1.5 text-[11px] font-semibold text-orange-200"
                      >
                        7d Suspend
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleReportAction(rep, 'ban')}
                        className="inline-flex items-center gap-1 rounded-xl bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 px-2.5 py-1.5 text-[11px] font-bold text-red-200"
                      >
                        <Ban className="h-3 w-3" />
                        Ban
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'appeals' ? (
        <div className="space-y-3">
          {appeals.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-slate-400">
              No appeals submitted yet.
            </div>
          ) : (
            appeals.map((appeal) => (
              <div
                key={appeal.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {appeal.userName || appeal.userEmail || appeal.userId}
                    </span>
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-200">
                      {appeal.targetType}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        appeal.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : appeal.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-200'
                      }`}
                    >
                      {appeal.status || 'pending'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {appeal.createdAt ? new Date(appeal.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                <p className="rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-xs text-slate-200">
                  {appeal.reason}
                </p>
                {appeal.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void handleAppealDecision(appeal.id, 'approved')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/30 px-3 py-1.5 text-xs font-bold text-emerald-200"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve & Restore
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void handleAppealDecision(appeal.id, 'rejected')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-200"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Reject Appeal
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-slate-400">
              No moderation actions logged yet.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white">
                    {log.actorName || log.actorEmail} •{' '}
                    <span className="text-sky-300">{log.action}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{log.details}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
