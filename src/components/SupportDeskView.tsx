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
  where
} from 'firebase/firestore';
import { SupportTicket, TicketStatus } from '../types';
import { CrystalBadge } from './CrystalBadge';
import {
  HelpCircle,
  Inbox,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Shield,
  Trash2
} from 'lucide-react';

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
    if (!subject.trim() || !message.trim() || !currentUser) return;
    setIsSubmitting(true);

    try {
      const ticketId = `ticket_${Date.now()}`;
      const ticketData: SupportTicket = {
        id: ticketId,
        userId: currentUser.uid,
        userEmail: currentUser.email || 'user',
        userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
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

  const handleAdminReply = async (ticketId: string) => {
    if (!replyText.trim() || !isAdmin) return;
    setIsReplying(true);

    try {
      await updateDoc(doc(db, 'supportTickets', ticketId), {
        adminReply: replyText.trim(),
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setReplyText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${ticketId}`);
    } finally {
      setIsReplying(false);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!isAdmin) return;
    if (!confirm('Permanently delete this ticket?')) return;
    try {
      await deleteDoc(doc(db, 'supportTickets', ticketId));
      if (selectedTicket?.id === ticketId) setSelectedTicket(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `supportTickets/${ticketId}`);
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock size={12} />
            Open
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <AlertCircle size={12} />
            In Progress
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 size={12} />
            Resolved
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs font-bold uppercase tracking-wider mb-2">
            <HelpCircle size={13} />
            <span>Community Desk</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Support & Complaint Box
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Submit private feedback, report issues, or communicate confidential inquiries directly with platform administration.
          </p>
        </div>

        {isAdmin && (
          <div className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-purple-600/25">
            <Shield size={16} />
            <span>Admin Inbox ({tickets.length} total tickets)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form (for users) or Ticket List */}
        <div className="lg:col-span-5 space-y-6">
          {/* Ticket Submission Form for regular members */}
          <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-xs">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-purple-600" />
              <span>Submit New Ticket to Admin</span>
            </h3>

            {submissionSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>Ticket submitted successfully! Admin has been notified.</span>
              </div>
            )}

            <form onSubmit={handleSubmitTicket} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Subject / Summary
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Account question, feature request, report"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Message Details
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or feedback in detail..."
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !message.trim()}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition disabled:opacity-50"
              >
                <Send size={14} />
                <span>Submit to Admin Inbox</span>
              </button>
            </form>
          </div>

          {/* Ticket list summary for left side */}
          <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-xs">
            <h4 className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-wider text-gray-400 mb-3">
              {isAdmin ? 'All User Inquiries' : 'Your Submitted Tickets'} ({tickets.length})
            </h4>

            {isLoading ? (
              <div className="py-6 text-center text-xs text-gray-400">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">
                <Inbox size={24} className="mx-auto mb-1 opacity-50" />
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
                        ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/40'
                        : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-gray-900 dark:text-white truncate max-w-[170px]">
                        {t.subject}
                      </span>
                      {getStatusBadge(t.status)}
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-1 mb-1.5">
                      {t.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{t.userEmail}</span>
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
            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {getStatusBadge(selectedTicket.status)}
                    <span className="text-xs text-gray-400">
                      ID: #{selectedTicket.id.substring(7, 13)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedTicket.subject}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Submitted by: <span className="font-semibold">{selectedTicket.userName}</span> ({selectedTicket.userEmail}) on{' '}
                    {new Date(selectedTicket.createdAt).toLocaleString()}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="p-2 text-gray-400 hover:text-rose-600 rounded-lg transition"
                    title="Delete Ticket"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* User Original Message */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  User Inquiry:
                </span>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.message}
                </p>
              </div>

              {/* Admin Reply (if exists) */}
              {selectedTicket.adminReply && (
                <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      Official Admin Response:
                    </span>
                    <CrystalBadge email="keylanmbilinyi5@gmail.com" name="Platform Administration" size="sm" />
                  </div>
                  <p className="text-sm text-purple-950 dark:text-purple-200 whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.adminReply}
                  </p>
                </div>
              )}

              {/* Admin Response Composer (Available exclusively for keylanmbilinyi5@gmail.com) */}
              {isAdmin ? (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <Shield size={14} className="text-purple-600" />
                    <span>Admin Reply Desk:</span>
                  </h4>

                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type official response to this member..."
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-semibold">Update Status:</span>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
                        className="py-1 px-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-900 dark:text-white"
                      >
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="open">Open</option>
                      </select>
                    </div>

                    <button
                      onClick={() => handleAdminReply(selectedTicket.id)}
                      disabled={isReplying || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 transition disabled:opacity-40"
                    >
                      <Send size={13} />
                      <span>Send Admin Reply</span>
                    </button>
                  </div>
                </div>
              ) : !selectedTicket.adminReply ? (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                  <Clock size={16} className="shrink-0" />
                  <span>Your ticket has been placed into the admin triage queue. An administrator will reply shortly.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl text-center text-gray-400">
              <Inbox size={40} className="mb-2 text-purple-400/60" />
              <p className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                Select a ticket to view conversation
              </p>
              <p className="text-xs text-gray-500 max-w-xs mt-1">
                Click on any ticket in the left list or submit a new inquiry above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
