import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  where
} from 'firebase/firestore';
import { SupportTicket, TicketStatus } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { sanitizeUserText } from '../utils/security';
import {
  HelpCircle,
  Inbox,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Shield,
  Trash2,
  Bot,
  Zap
} from 'lucide-react';

const ONE_TAP_ADMIN_REPLIES: { label: string; text: string }[] = [
  {
    label: '✅ Resolved & Checked',
    text: 'Hello! A human administrator has reviewed your request and resolved this issue for your account. Thank you for being part of WaveLink!'
  },
  {
    label: '💳 Payment / Pro Verified',
    text: 'Habari / Hello! We have verified your Mobile Money transaction reference and updated your WaveLink Pro status. Enjoy your Pro perks!'
  },
  {
    label: '💰 Refund In Progress',
    text: 'Hello! Our billing team has verified your refund inquiry and initiated processing back to your Mobile Money wallet within 24–48 hours.'
  },
  {
    label: '🛡️ Moderation Action Taken',
    text: 'Thank you for your safety report. Our human moderation team has reviewed the account/content and taken protective action.'
  }
];

export const SupportDeskView: React.FC = () => {
  const { currentUser, userProfile, isAdmin } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Ticket Form (for users)
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Selected Ticket for details & admin reply
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus>('in_progress');
  const [isReplying, setIsReplying] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Listen to tickets: If admin, load all tickets. If user, load only their tickets.
  useEffect(() => {
    if (!currentUser) return;

    const ticketsRef = collection(db, 'supportTickets');
    const q = isAdmin
      ? query(ticketsRef, orderBy('createdAt', 'desc'))
      : query(ticketsRef, where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SupportTicket[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as SupportTicket));
        setTickets(list);
        setIsLoading(false);

        // Keep selected ticket updated if open
        if (selectedTicket) {
          const updated = list.find((t) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'supportTickets');
      }
    );

    return () => unsub();
  }, [currentUser, isAdmin, selectedTicket?.id]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeSubject = sanitizeUserText(subject, 160);
    const safeMessage = sanitizeUserText(message, 1500);
    if (!safeSubject || !safeMessage || !currentUser) return;
    setIsSubmitting(true);

    try {
      const ticketId = `ticket_${Date.now()}`;
      const ticketData: SupportTicket = {
        id: ticketId,
        userId: currentUser.uid,
        userEmail: currentUser.email || 'user',
        userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        topic: 'general_support',
        summary: safeSubject,
        subject: safeSubject,
        message: safeMessage,
        status: 'open',
        source: 'user',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'supportTickets', ticketId), ticketData);
      setSubject('');
      setMessage('');
      setSubmissionSuccess(true);
      setTimeout(() => setSubmissionSuccess(false), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'supportTickets');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendAdminReplyToTicket = async (
    ticket: SupportTicket,
    rawReply: string,
    targetStatus: TicketStatus
  ) => {
    const safeReply = sanitizeUserText(rawReply, 1500);
    if (!safeReply || !isAdmin) return;
    setIsReplying(true);

    try {
      await updateDoc(doc(db, 'supportTickets', ticket.id), {
        adminReply: safeReply,
        status: targetStatus,
        updatedAt: new Date().toISOString()
      });

      // If this ticket came from a WaveLink Support Bot DM conversation, also post the human follow-up into their DM thread
      if (ticket.botConversationId) {
        await addDoc(collection(db, 'channels', ticket.botConversationId, 'messages'), {
          channelId: ticket.botConversationId,
          senderId: currentUser?.uid || 'admin',
          senderEmail: currentUser?.email || '',
          senderName: userProfile?.displayName || 'WaveLink Admin Support',
          senderPhotoURL: userProfile?.photoURL || '',
          text: `🛡️ [Admin Follow-Up on Ticket #${ticket.id.substring(7, 13)}]: ${safeReply}`,
          createdAt: new Date().toISOString()
        }).catch(() => {});
      }

      setReplyText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${ticket.id}`);
    } finally {
      setIsReplying(false);
    }
  };

  const handleAdminReply = async (ticketId: string) => {
    const target = tickets.find((t) => t.id === ticketId) || selectedTicket;
    if (!target) return;
    await sendAdminReplyToTicket(target, replyText, newStatus);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'supportTickets', ticketId));
      setConfirmDeleteId(null);
      if (selectedTicket?.id === ticketId) setSelectedTicket(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `supportTickets/${ticketId}`);
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
            <Clock size={12} />
            Open
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2563EB] border border-blue-200">
            <AlertCircle size={12} />
            In Progress
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
            <CheckCircle2 size={12} />
            Resolved
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* Header */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-2">
            <HelpCircle size={13} />
            <span>Community Desk</span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#1C1917]">
            Support &amp; Complaint Box
          </h2>
          <p className="text-xs sm:text-sm text-[#57534E] mt-1">
            Submit private feedback, report issues, or communicate confidential inquiries directly with platform administration.
          </p>
        </div>

        {isAdmin && (
          <div className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white text-xs font-bold flex items-center gap-2 shadow-xs">
            <Shield size={16} />
            <span>Admin Inbox ({tickets.length} total tickets)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form (for users) or Ticket List */}
        <div className="lg:col-span-5 space-y-6">
          {/* Ticket Submission Form for regular members */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs">
            <h3 className="font-bold text-[#1C1917] text-sm mb-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-[#2563EB]" />
              <span>Submit New Ticket to Admin</span>
            </h3>

            {submissionSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />
                <span>Ticket submitted successfully! Admin has been notified.</span>
              </div>
            )}

            <form onSubmit={handleSubmitTicket} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  Subject / Summary
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Account question, feature request, report"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  Message Details
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or feedback in detail..."
                  className="w-full p-3.5 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !message.trim()}
                className="w-full min-h-[46px] py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50"
              >
                <Send size={14} />
                <span>Submit to Admin Inbox</span>
              </button>
            </form>
          </div>

          {/* Ticket list summary for left side */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs">
            <h4 className="font-extrabold text-xs uppercase tracking-wider text-[#57534E] mb-3">
              {isAdmin ? 'All User Inquiries' : 'Your Submitted Tickets'} ({tickets.length})
            </h4>

            {isLoading ? (
              <div className="py-6 text-center text-xs font-medium text-[#57534E]">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-6 text-[#57534E] text-xs">
                <Inbox size={24} className="mx-auto mb-1 text-[#2563EB]/60" />
                No support tickets found.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`p-3 rounded-2xl cursor-pointer border transition text-left ${
                      selectedTicket?.id === t.id
                        ? 'border-[#2563EB] bg-blue-50/80'
                        : 'border-[#EFECE6] bg-[#FAF7F2]/60 hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 gap-1.5">
                      <span className="font-bold text-xs text-[#1C1917] truncate max-w-[165px]">
                        {t.subject}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.source === 'support_bot' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
                            <Bot size={10} />
                            <span>Bot</span>
                          </span>
                        )}
                        {getStatusBadge(t.status)}
                      </div>
                    </div>
                    {t.topic && (
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#0D9488] mb-0.5">
                        Topic: {t.topic.replace(/_/g, ' ')}
                      </div>
                    )}
                    <p className="text-xs text-[#57534E] line-clamp-1 mb-1.5">
                      {t.summary || t.message}
                    </p>
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#57534E]">
                      <span className="truncate max-w-[140px]">{t.userName || t.userEmail}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Conversation / Inspector */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between border-b border-[#EFECE6] pb-4 gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {getStatusBadge(selectedTicket.status)}
                    {selectedTicket.source === 'support_bot' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
                        <Bot size={12} />
                        <span>Escalated by WaveLink Support Bot</span>
                      </span>
                    )}
                    {selectedTicket.topic && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-blue-50 text-[#2563EB] border border-blue-200">
                        {selectedTicket.topic.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className="text-xs font-mono text-[#57534E]">
                      ID: #{selectedTicket.id.substring(7, 13)}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-[#1C1917]">
                    {selectedTicket.subject}
                  </h3>
                  <p className="text-xs text-[#57534E] mt-1">
                    User: <span className="font-bold text-[#1C1917]">{selectedTicket.userName}</span> ({selectedTicket.userEmail}) •{' '}
                    {new Date(selectedTicket.createdAt).toLocaleString()}
                  </p>
                </div>

                {isAdmin && (
                  confirmDeleteId === selectedTicket.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteTicket(selectedTicket.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedTicket.id)}
                      className="p-2 text-[#57534E] hover:text-rose-600 rounded-lg transition"
                      title="Delete Ticket"
                    >
                      <Trash2 size={16} />
                    </button>
                  )
                )}
              </div>

              {/* Ticket Summary Box (if present) */}
              {selectedTicket.summary && (
                <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs text-[#1C1917]">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0D9488] block mb-0.5">
                    Ticket Summary ({selectedTicket.topic || 'General'})
                  </span>
                  <p className="font-semibold">{selectedTicket.summary}</p>
                </div>
              )}

              {/* User Original Message */}
              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#57534E] block mb-1">
                  User Inquiry:
                </span>
                <p className="text-sm text-[#1C1917] whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.message}
                </p>
              </div>

              {/* Admin Reply (if exists) */}
              {selectedTicket.adminReply && (
                <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                      Official Admin Response:
                    </span>
                    <CrystalBadge role="super_admin" name="Platform Administration" size="sm" />
                  </div>
                  <p className="text-sm text-[#1C1917] whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.adminReply}
                  </p>
                </div>
              )}

              {/* Admin Response Composer + One-Tap Quick Replies */}
              {isAdmin ? (
                <div className="pt-4 border-t border-[#EFECE6] space-y-3.5">
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                      <Zap size={14} className="text-[#0D9488]" />
                      <span>One-Tap Reply &amp; Resolve:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ONE_TAP_ADMIN_REPLIES.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isReplying}
                          onClick={() => sendAdminReplyToTicket(selectedTicket, preset.text, 'resolved')}
                          className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0D9488] border border-teal-200 text-xs font-bold transition active:scale-95 disabled:opacity-50"
                          title={preset.text}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-[#1C1917] flex items-center gap-1.5 pt-1">
                    <Shield size={14} className="text-[#2563EB]" />
                    <span>Custom Admin Reply:</span>
                  </h4>

                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type official response to this member..."
                    className="w-full p-3 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
                  />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#57534E] font-bold">Update Status:</span>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
                        className="py-1.5 px-3 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs font-bold text-[#1C1917]"
                      >
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="open">Open</option>
                      </select>
                    </div>

                    <button
                      onClick={() => handleAdminReply(selectedTicket.id)}
                      disabled={isReplying || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs flex items-center gap-2 transition disabled:opacity-40"
                    >
                      <Send size={13} />
                      <span>Send Admin Reply</span>
                    </button>
                  </div>
                </div>
              ) : !selectedTicket.adminReply ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                  <Clock size={16} className="shrink-0 text-amber-600" />
                  <span>Your ticket has been placed into the admin triage queue. An administrator will reply shortly.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl text-center">
              <Inbox size={40} className="mb-2 text-[#2563EB]/60" />
              <p className="font-bold text-sm text-[#1C1917]">
                Select a ticket to view conversation
              </p>
              <p className="text-xs text-[#57534E] max-w-xs mt-1">
                Click on any ticket in the left list or submit a new inquiry above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
