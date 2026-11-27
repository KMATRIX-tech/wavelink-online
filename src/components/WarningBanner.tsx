import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserRestrictionStatus } from '../utils/contentModeration';
import { submitUserAppeal } from '../services/moderationService';
import { AlertTriangle, Clock, Scale, Send, X, CheckCircle2 } from 'lucide-react';

export const WarningBanner: React.FC = () => {
  const { currentUser, userProfile, dismissWarning } = useAuth();
  const [showAppealBox, setShowAppealBox] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!userProfile) return null;

  const restriction = getUserRestrictionStatus(userProfile);
  const hasWarning = userProfile.status === 'warned' && Boolean(userProfile.warningMessage);
  const isMuted = restriction.isMuted;

  if (!hasWarning && !isMuted) {
    return null;
  }

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !appealText.trim() || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await submitUserAppeal({
        targetType: isMuted ? 'account_mute' : 'strike',
        targetId: currentUser.uid,
        reason: appealText.trim(),
      });
      setAppealText('');
      setFeedback(res.message);
    } catch (err: any) {
      setFeedback(err?.message || 'Could not send appeal right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`border-b px-4 py-3 ${
        isMuted
          ? 'bg-orange-50 border-orange-200 text-orange-950'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-1.5 rounded-lg text-white shrink-0 ${
                isMuted ? 'bg-orange-600' : 'bg-amber-500'
              }`}
            >
              {isMuted ? <Clock size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#1C1917]">
                {isMuted
                  ? `Temporarily Muted (${restriction.remainingText} remaining)`
                  : `Account Warning${userProfile.strikesCount ? ` (Strike ${userProfile.strikesCount})` : ''}`}
              </p>
              <p className="text-xs sm:text-sm text-amber-900 font-medium">
                {userProfile.warningMessage
                  ? `"${userProfile.warningMessage}"`
                  : 'Posting, commenting, and messaging are paused during this cooldown.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAppealBox((v) => !v)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition flex items-center gap-1"
            >
              <Scale size={13} />
              <span>Appeal</span>
            </button>
            {hasWarning && !isMuted && (
              <button
                type="button"
                onClick={dismissWarning}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1"
              >
                <span>Acknowledge</span>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {showAppealBox && (
          <form
            onSubmit={handleSubmitAppeal}
            className="rounded-xl bg-white/90 border border-amber-200 p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
          >
            <input
              type="text"
              value={appealText}
              onChange={(e) => setAppealText(e.target.value)}
              maxLength={400}
              placeholder="Explain why you believe this warning or mute was a mistake..."
              className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={submitting || !appealText.trim()}
              className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Send size={13} />
              <span>{submitting ? 'Sending...' : 'Submit Appeal'}</span>
            </button>
          </form>
        )}

        {feedback && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
            <CheckCircle2 size={14} />
            <span>{feedback}</span>
          </div>
        )}
      </div>
    </div>
  );
};
