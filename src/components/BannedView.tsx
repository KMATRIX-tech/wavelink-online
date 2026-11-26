import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../firebase';
import { ContentAppeal } from '../types';
import { sanitizeUserFacingError } from '../utils/safetyFilters';
import { ShieldAlert, LogOut, Mail, HelpCircle, Scale, CheckCircle2, Send } from 'lucide-react';

interface BannedViewProps {
  onOpenSupport: () => void;
}

export const BannedView: React.FC<BannedViewProps> = ({ onOpenSupport }) => {
  const { currentUser, userProfile, signOut } = useAuth();
  const [appealReason, setAppealReason] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [appealFeedback, setAppealFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [appeals, setAppeals] = useState<ContentAppeal[]>([]);

  const loadAppeals = useCallback(async () => {
    if (!currentUser) return;
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/safety/appeals', {
        method: 'GET',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && Array.isArray(data.appeals)) {
        setAppeals(data.appeals);
      }
    } catch {
      // ignore offline
    }
  }, [currentUser]);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  const handleSubmitBanAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !appealReason.trim()) return;
    setIsSubmittingAppeal(true);
    setAppealFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/safety/appeal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appealType: 'account_ban',
          targetId: currentUser.uid,
          reason: appealReason.trim()
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not submit appeal right now.');
      }
      setAppealReason('');
      await loadAppeals();
      setAppealFeedback({
        type: 'success',
        text:
          data.message ||
          'Your account appeal has been submitted! Moderators will review your request shortly.'
      });
    } catch (err) {
      setAppealFeedback({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not submit your appeal right now.')
      });
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF7F2] text-[#1C1917]">
      <div className="w-full max-w-lg bg-white border border-rose-200 rounded-3xl p-6 sm:p-8 text-center shadow-xl space-y-5">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center ring-8 ring-rose-50">
          <ShieldAlert size={36} />
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-[#1C1917] mb-2">
            Account Suspended
          </h2>
          <p className="text-sm text-[#57534E] leading-relaxed">
            Your WaveLink account (<span className="font-bold text-rose-600">{currentUser?.email}</span>) has been restricted due to community safety guidelines.
          </p>
        </div>

        {userProfile?.warningMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left">
            <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">
              Moderation Reason:
            </p>
            <p className="text-xs sm:text-sm text-rose-950 italic">
              &quot;{userProfile.warningMessage}&quot;
            </p>
          </div>
        )}

        {/* Self-Service Appeal Form */}
        <form
          onSubmit={handleSubmitBanAppeal}
          className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-left space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#1C1917]">
            <Scale size={15} className="text-[#2563EB]" />
            <span>Submit an Official Account Appeal</span>
          </div>

          {appealFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                appealFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {appealFeedback.type === 'success' && (
                <CheckCircle2 size={15} className="text-[#0D9488] shrink-0" />
              )}
              <span>{appealFeedback.text}</span>
            </div>
          )}

          <textarea
            rows={3}
            required
            value={appealReason}
            onChange={(e) => setAppealReason(e.target.value)}
            placeholder="Explain why your account should be restored..."
            className="w-full p-3 rounded-xl bg-white border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />

          <button
            type="submit"
            disabled={isSubmittingAppeal || !appealReason.trim()}
            className="w-full min-h-[42px] py-2.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <Send size={14} />
            <span>{isSubmittingAppeal ? 'Submitting Appeal...' : 'Send Appeal for Review'}</span>
          </button>
        </form>

        {/* Submitted Appeals Tracker */}
        {appeals.length > 0 && (
          <div className="text-left space-y-2">
            <span className="text-xs font-extrabold text-[#57534E] uppercase tracking-wider block">
              Your Appeal Status:
            </span>
            {appeals.slice(0, 3).map((app) => (
              <div
                key={app.id}
                className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate text-[#1C1917] font-semibold">{app.reason}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                    app.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : app.status === 'rejected'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenSupport}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-xs"
          >
            <HelpCircle size={16} />
            <span>Open Support Desk &amp; Help Center</span>
          </button>

          <button
            type="button"
            onClick={signOut}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl border border-[#D6D3CD] bg-[#FAF7F2] hover:bg-[#EFECE6] text-[#1C1917] font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#EFECE6] text-xs text-[#57534E] flex items-center justify-center gap-1.5">
          <Mail size={13} />
          <span>Contact Platform Administration via Support Desk</span>
        </div>
      </div>
    </div>
  );
};
