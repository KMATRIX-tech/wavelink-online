import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, getAuthHeaders } from '../firebase';
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
import { SupportTicket, TicketStatus, ContentAppeal } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { sanitizeUserText } from '../utils/security';
import {
  HELP_CENTER_TOPICS,
  HELP_CENTER_ARTICLES,
  HelpTopicId,
  searchHelpCenterArticles
} from '../utils/helpCenterData';
import { redactEmailIfSupportHelper, sanitizeUserFacingError } from '../utils/safetyFilters';
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
  Zap,
  Search,
  KeyRound,
  Mail,
  Unlock,
  CreditCard,
  Scale,
  BookOpen,
  Wrench,
  Sparkles,
  RefreshCw
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

type SupportHubTab = 'help_center' | 'support_bot' | 'self_service' | 'tickets';

interface BotChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  createdAt: string;
  escalatedTicketId?: string | null;
}

export const SupportDeskView: React.FC = () => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isSupportHelper,
    isStaff,
    sendPasswordReset,
    sendVerificationEmail,
    recordAdminAuditLog
  } = useAuth();

  const [activeTab, setActiveTab] = useState<SupportHubTab>('help_center');
  const [helpLang, setHelpLang] = useState<'en' | 'sw'>(
    userProfile?.language === 'sw' ? 'sw' : 'en'
  );

  // Help Center Search & Topic filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<HelpTopicId | 'all'>('all');

  // Support Bot State
  const [botMessages, setBotMessages] = useState<BotChatMessage[]>([
    {
      id: 'welcome_bot',
      sender: 'bot',
      text:
        userProfile?.language === 'sw'
          ? 'Habari! 🤖 Mimi ni WaveLink Support Bot (Msaidizi wa AI). Ninaweza kujibu maswali kuhusu usajili, nenosiri, uthibitisho, machapisho, Sparks, Reels, simu, arifa, malipo ya Pro, usalama na faragha, kukagua hali ya malipo yako, au kukufungulia tiketi ya msaada. Kumbuka: Sitauliza kamwe nenosiri lako, PIN au msimbo wa siri.'
          : 'Hello! 🤖 I am the official WaveLink Support Bot (AI Assistant). I can answer questions from the WaveLink Knowledge Base, check your own payment status, or open a support ticket for human review. Reminder: I will NEVER ask for your password, Mobile Money PIN, or verification codes.',
      createdAt: new Date().toISOString()
    }
  ]);
  const [botInput, setBotInput] = useState('');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [botQuotaRemaining, setBotQuotaRemaining] = useState<number | null>(null);

  // Self-Service Tools State
  const [selfServiceNotice, setSelfServiceNotice] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [resetEmailInput, setResetEmailInput] = useState(currentUser?.email || '');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isSendingVerify, setIsSendingVerify] = useState(false);

  // Unlock Account Tool
  const [unlockEmailInput, setUnlockEmailInput] = useState(currentUser?.email || '');
  const [unlockCodeInput, setUnlockCodeInput] = useState('');
  const [unlockDemoHint, setUnlockDemoHint] = useState<string | null>(null);
  const [unlockStep, setUnlockStep] = useState<'request' | 'verify' | 'unlocked'>('request');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Check Payment Status Tool
  const [paymentStatusResult, setPaymentStatusResult] = useState<{
    isPro: boolean;
    proPlan: string;
    proExpiresAt: string | null;
    isVerifiedByAdmin: boolean;
    hasBlueStar: boolean;
    recentTransactions: any[];
  } | null>(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  // Appeal Ban / Hidden Content Tool
  const [appealType, setAppealType] = useState<'account_ban' | 'hidden_post' | 'hidden_comment' | 'hidden_reel'>('hidden_post');
  const [appealTargetId, setAppealTargetId] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [myAppeals, setMyAppeals] = useState<ContentAppeal[]>([]);
  const [isLoadingAppeals, setIsLoadingAppeals] = useState(false);

  // Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [subject, setSubject] = useState('');
  const [ticketTopic, setTicketTopic] = useState<string>('general_support');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionConfirmation, setSubmissionConfirmation] = useState<{
    reference: string;
    message: string;
  } | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus>('in_progress');
  const [isReplying, setIsReplying] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManageTickets = isAdmin || isSupportHelper || isStaff;

  // Listen to tickets: If staff (Owner, Moderator, or Support Helper), load all tickets. If regular user, load only their own tickets.
  useEffect(() => {
    if (!currentUser) return;

    const ticketsRef = collection(db, 'supportTickets');
    const q = canManageTickets
      ? query(ticketsRef, orderBy('createdAt', 'desc'))
      : query(ticketsRef, where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SupportTicket[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as SupportTicket));
        setTickets(list);
        setIsLoadingTickets(false);

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
  }, [currentUser, canManageTickets, selectedTicket?.id]);

  const loadMyAppeals = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingAppeals(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/safety/appeals', {
        method: 'GET',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && Array.isArray(data.appeals)) {
        setMyAppeals(data.appeals);
      }
    } catch {
      // ignore offline
    } finally {
      setIsLoadingAppeals(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'self_service') {
      loadMyAppeals();
    }
  }, [activeTab, loadMyAppeals]);

  // Filtered Help Center Articles
  const filteredArticles = searchHelpCenterArticles(searchQuery).filter((art) =>
    selectedTopic === 'all' ? true : art.topic === selectedTopic
  );

  // Support Bot Send Handler
  const handleSendBotMessage = async (customPrompt?: string) => {
    const rawText = (customPrompt ?? botInput).trim();
    if (!rawText || !currentUser || isBotThinking) return;

    const userMsg: BotChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: rawText,
      createdAt: new Date().toISOString()
    };
    setBotMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setBotInput('');
    setIsBotThinking(true);

    try {
      const headers = await getAuthHeaders();
      const historyPayload = botMessages.slice(-8).map((m) => ({
        senderId: m.sender === 'bot' ? 'wavelink_support_bot' : currentUser.uid,
        text: m.text
      }));

      const resp = await fetch('/api/support-bot/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: currentUser.uid,
          userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
          userEmail: currentUser.email || '',
          userText: rawText,
          recentMessages: historyPayload
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (typeof data?.quota?.remaining === 'number') {
        setBotQuotaRemaining(data.quota.remaining);
      }

      if (!resp.ok) {
        const fallbackReply: BotChatMessage = {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text:
            data?.error ||
            'I am the WaveLink Support Bot. Your daily AI bot limit is reached or the service is busy — you can open a support ticket in the Tickets tab anytime!',
          createdAt: new Date().toISOString()
        };
        setBotMessages((prev) => [...prev, fallbackReply]);
        return;
      }

      let escalatedTicketId: string | null = null;
      if (data.escalateToAdmin) {
        const ticketId = `ticket_${Date.now()}`;
        const refCode = `WL-TCK-${ticketId.slice(-6).toUpperCase()}`;
        const newTicket: SupportTicket = {
          id: ticketId,
          userId: currentUser.uid,
          userEmail: currentUser.email || 'user',
          userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
          topic: data.ticketTopic || 'general_support',
          summary: data.ticketSummary || rawText.slice(0, 120),
          subject: data.ticketSummary || rawText.slice(0, 100),
          message: rawText,
          status: 'open',
          source: 'support_bot',
          confirmationSent: true,
          confirmationReference: refCode,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'supportTickets', ticketId), newTicket).catch(() => {});
        fetch('/api/support/tickets/confirm', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticketId,
            subject: newTicket.subject,
            topic: newTicket.topic
          })
        }).catch(() => {});
        escalatedTicketId = refCode;
      }

      const botReply: BotChatMessage = {
        id: `b_${Date.now()}`,
        sender: 'bot',
        text:
          data.replyText ||
          '🤖 WaveLink Support Bot: I have logged your question. Please let me know if you would like me to open a human support ticket.',
        createdAt: new Date().toISOString(),
        escalatedTicketId
      };
      setBotMessages((prev) => [...prev, botReply]);
    } catch (err) {
      setBotMessages((prev) => [
        ...prev,
        {
          id: `b_err_${Date.now()}`,
          sender: 'bot',
          text: sanitizeUserFacingError(
            err,
            '🤖 WaveLink Support Bot: Connection interrupted. You can use our Self-Service Tools or submit a Support Ticket.'
          ),
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsBotThinking(false);
    }
  };

  // Self-Service Handlers
  const handleSelfServiceResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    setSelfServiceNotice(null);
    try {
      await sendPasswordReset(resetEmailInput.trim() || currentUser?.email || undefined);
      setSelfServiceNotice({
        type: 'success',
        text:
          helpLang === 'sw'
            ? `Kiungo cha kuweka upya nenosiri kimetumwa kwenda ${resetEmailInput || currentUser?.email}!`
            : `Password reset link sent to ${resetEmailInput || currentUser?.email}! Check your inbox and spam folder.`
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not send password reset email.')
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleSelfServiceResendVerification = async () => {
    setIsSendingVerify(true);
    setSelfServiceNotice(null);
    try {
      await sendVerificationEmail();
      setSelfServiceNotice({
        type: 'success',
        text:
          helpLang === 'sw'
            ? 'Barua pepe ya uthibitisho imetumwa! Angalia inbox na spam.'
            : 'Verification email sent! Please check your inbox and spam folder.'
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not resend verification email right now.')
      });
    } finally {
      setIsSendingVerify(false);
    }
  };

  const handleRequestUnlockCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockEmailInput.trim()) return;
    setIsUnlocking(true);
    setSelfServiceNotice(null);
    try {
      const resp = await fetch('/api/auth/request-unlock-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unlockEmailInput.trim() })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not send unlock code.');
      }
      setUnlockStep('verify');
      if (data.demoCodeHint) {
        setUnlockDemoHint(String(data.demoCodeHint));
      }
      setSelfServiceNotice({
        type: 'info',
        text:
          data.message ||
          `6-digit unlock verification code sent to ${unlockEmailInput.trim()}!`
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not request unlock code.')
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleVerifyUnlockCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockEmailInput.trim() || !unlockCodeInput.trim()) return;
    setIsUnlocking(true);
    setSelfServiceNotice(null);
    try {
      const resp = await fetch('/api/auth/verify-unlock-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: unlockEmailInput.trim(),
          code: unlockCodeInput.trim()
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Invalid or expired unlock code.');
      }
      setUnlockStep('unlocked');
      setUnlockCodeInput('');
      setUnlockDemoHint(null);
      setSelfServiceNotice({
        type: 'success',
        text:
          helpLang === 'sw'
            ? 'Akaunti yako imefunguliwa! Unaweza kuingia sasa.'
            : 'Account unlocked! Login lockout has been cleared.'
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Invalid unlock code.')
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCheckMyPaymentStatus = async () => {
    if (!currentUser) return;
    setIsCheckingPayment(true);
    setSelfServiceNotice(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/support/my-payment-status', {
        method: 'GET',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not retrieve payment status.');
      }
      setPaymentStatusResult({
        isPro: Boolean(data.isPro),
        proPlan: data.proPlan || 'free',
        proExpiresAt: data.proExpiresAt || null,
        isVerifiedByAdmin: Boolean(data.isVerifiedByAdmin),
        hasBlueStar: Boolean(data.hasBlueStar),
        recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : []
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not check payment status.')
      });
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !appealReason.trim()) return;
    setIsSubmittingAppeal(true);
    setSelfServiceNotice(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/safety/appeal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appealType,
          targetId: appealTargetId.trim() || currentUser.uid,
          reason: appealReason.trim()
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not submit appeal.');
      }
      setAppealReason('');
      setAppealTargetId('');
      await loadMyAppeals();
      setSelfServiceNotice({
        type: 'success',
        text:
          data.message ||
          (helpLang === 'sw'
            ? 'Rufaa yako imepokelewa na inaangaliwa na wasimamizi!'
            : 'Your appeal has been submitted for moderator review!')
      });
    } catch (err) {
      setSelfServiceNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not submit appeal.')
      });
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  // Submit Support Ticket with Automatic Confirmation
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeSubject = sanitizeUserText(subject, 160);
    const safeMessage = sanitizeUserText(message, 1500);
    if (!safeSubject || !safeMessage || !currentUser) return;
    setIsSubmitting(true);
    setSubmissionConfirmation(null);

    try {
      const ticketId = `ticket_${Date.now()}`;
      const referenceCode = `WL-TCK-${ticketId.slice(-6).toUpperCase()}`;
      const ticketData: SupportTicket = {
        id: ticketId,
        userId: currentUser.uid,
        userEmail: currentUser.email || 'user',
        userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Member',
        topic: ticketTopic || 'general_support',
        summary: safeSubject,
        subject: safeSubject,
        message: safeMessage,
        status: 'open',
        source: 'user',
        confirmationSent: true,
        confirmationReference: referenceCode,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'supportTickets', ticketId), ticketData);

      // Trigger server-side automatic confirmation (email + push notification + reference receipt)
      try {
        const headers = await getAuthHeaders();
        const confResp = await fetch('/api/support/tickets/confirm', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticketId,
            subject: safeSubject,
            topic: ticketTopic
          })
        });
        const confData = await confResp.json().catch(() => ({}));
        setSubmissionConfirmation({
          reference: confData.confirmationReference || referenceCode,
          message:
            confData.message ||
            `Ticket #${referenceCode} received! An automatic confirmation has been sent to your notifications and email.`
        });
      } catch {
        setSubmissionConfirmation({
          reference: referenceCode,
          message: `Ticket #${referenceCode} received! You can follow its status (Open → In Progress → Resolved) right here.`
        });
      }

      setSubject('');
      setMessage('');
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
    if (!safeReply || !canManageTickets) return;
    setIsReplying(true);

    try {
      const responderRole = isSupportHelper ? 'support_helper' : isAdmin ? 'admin' : 'moderator';
      const responderName =
        userProfile?.displayName ||
        (isSupportHelper ? 'WaveLink Support Helper' : 'WaveLink Administration');

      await updateDoc(doc(db, 'supportTickets', ticket.id), {
        adminReply: safeReply,
        status: targetStatus,
        repliedByRole: responderRole,
        repliedByName: responderName,
        updatedAt: new Date().toISOString()
      });

      await recordAdminAuditLog({
        action: 'ticket_replied',
        targetId: ticket.id,
        targetLabel: ticket.subject,
        details: `${responderName} (${responderRole}) replied to ticket and set status to ${targetStatus}`
      }).catch(() => {});

      if (ticket.botConversationId) {
        await addDoc(collection(db, 'channels', ticket.botConversationId, 'messages'), {
          channelId: ticket.botConversationId,
          senderId: currentUser?.uid || 'admin',
          senderEmail: '',
          senderName: responderName,
          senderPhotoURL: userProfile?.photoURL || '',
          text: `🛡️ [Support Follow-Up on Ticket #${ticket.id.substring(7, 13)}]: ${safeReply}`,
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
    if (!isAdmin) return; // Support Helpers cannot delete tickets, only Owner/Moderator
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

  const formatTicketUserEmail = (rawEmail?: string) => {
    if (isSupportHelper) {
      return redactEmailIfSupportHelper(rawEmail, 'support_helper');
    }
    return rawEmail || 'user';
  };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-6">
      {/* Header & Language Switcher */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-2">
              <HelpCircle size={13} />
              <span>
                {helpLang === 'sw'
                  ? 'Kituo cha Msaada cha WaveLink'
                  : 'WaveLink Support & Help Center'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#1C1917]">
              {helpLang === 'sw'
                ? 'Msaada wa Haraka, Msaidizi wa AI na Tiketi'
                : 'Self-Service Help Center, Support Bot & Tickets'}
            </h2>
            <p className="text-xs sm:text-sm text-[#57534E] mt-1">
              {helpLang === 'sw'
                ? 'Tafuta mwongozo kwa Kiswahili au Kiingereza, uliza WaveLink Support Bot, tumia zana za kujihudumia au tuma tiketi.'
                : 'Search guides in Swahili & English, chat with the WaveLink Support Bot, run self-service account tools, or track support tickets.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bilingual Help Center Toggle */}
            <div className="inline-flex rounded-2xl bg-[var(--bg-subtle)] p-1 border border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setHelpLang('en')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  helpLang === 'en' ? 'bg-[#2563EB] text-white' : 'text-[#57534E]'
                }`}
              >
                🇬🇧 English
              </button>
              <button
                type="button"
                onClick={() => setHelpLang('sw')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  helpLang === 'sw' ? 'bg-[#0D9488] text-white' : 'text-[#57534E]'
                }`}
              >
                🇹🇿 Kiswahili
              </button>
            </div>

            {canManageTickets && (
              <div className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white text-xs font-bold flex items-center gap-2 shadow-xs">
                <Shield size={15} />
                <span>
                  {isSupportHelper ? 'Support Helper Desk' : 'Admin Support Inbox'} ({tickets.length})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {[
            {
              id: 'help_center' as const,
              icon: <BookOpen size={15} />,
              label: helpLang === 'sw' ? 'Mwongozo (Mada 11)' : 'Help Center (11 Topics)'
            },
            {
              id: 'support_bot' as const,
              icon: <Bot size={15} />,
              label: helpLang === 'sw' ? 'Support Bot (AI)' : 'WaveLink Support Bot'
            },
            {
              id: 'self_service' as const,
              icon: <Wrench size={15} />,
              label: helpLang === 'sw' ? 'Zana za Kujihudumia' : 'Self-Service Tools'
            },
            {
              id: 'tickets' as const,
              icon: <Inbox size={15} />,
              label:
                helpLang === 'sw'
                  ? `Tiketi za Msaada (${tickets.length})`
                  : `Support Tickets (${tickets.length})`
            }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 border transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-2xs'
                  : 'bg-[var(--bg-subtle)] text-[#1C1917] border-[var(--border-hairline)] hover:bg-stone-200/60'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: SEARCHABLE HELP CENTER IN SWAHILI & ENGLISH (11 TOPICS)
      ===================================================================== */}
      {activeTab === 'help_center' && (
        <div className="space-y-5">
          {/* Search Input & Topic Filter Bar */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs space-y-4">
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-3 text-[#78716C]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  helpLang === 'sw'
                    ? 'Tafuta msaada: usajili, nenosiri, uthibitisho, machapisho, Sparks, Reels, simu, arifa, malipo, usalama, faragha...'
                    : 'Search Help Center: sign-up, passwords, verification, posting, Sparks, Reels, calls, notifications, payments, safety, privacy...'
                }
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {/* 11 Topic Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedTopic('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap border transition cursor-pointer ${
                  selectedTopic === 'all'
                    ? 'bg-[#0D9488] text-white border-[#0D9488]'
                    : 'bg-[var(--bg-subtle)] text-[#57534E] border-[var(--border-hairline)]'
                }`}
              >
                {helpLang === 'sw' ? 'Mada Zote (11)' : 'All 11 Topics'}
              </button>
              {HELP_CENTER_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setSelectedTopic(topic.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap border transition cursor-pointer ${
                    selectedTopic === topic.id
                      ? 'bg-[#0D9488] text-white border-[#0D9488]'
                      : 'bg-[var(--bg-subtle)] text-[#1C1917] border-[var(--border-hairline)]'
                  }`}
                >
                  <span>{topic.emoji} </span>
                  <span>{helpLang === 'sw' ? topic.labelSw : topic.labelEn}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Articles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArticles.map((art) => {
              const topicMeta = HELP_CENTER_TOPICS.find((t) => t.id === art.topic);
              return (
                <div
                  key={art.id}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-[11px] font-extrabold">
                        {topicMeta?.emoji}{' '}
                        {helpLang === 'sw' ? topicMeta?.labelSw : topicMeta?.labelEn}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-base text-[#1C1917]">
                      {helpLang === 'sw' ? art.titleSw : art.titleEn}
                    </h3>
                    <p className="text-xs text-[#57534E] leading-relaxed">
                      {helpLang === 'sw' ? art.summarySw : art.summaryEn}
                    </p>
                    <ol className="space-y-1.5 pt-1">
                      {(helpLang === 'sw' ? art.stepsSw : art.stepsEn).map((step, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-[#1C1917] flex items-start gap-2 leading-snug"
                        >
                          <span className="w-5 h-5 rounded-full bg-blue-50 text-[#2563EB] font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2 flex-wrap">
                    {art.selfServiceAction ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('self_service')}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Wrench size={13} />
                        <span>
                          {helpLang === 'sw'
                            ? 'Fungua Zana ya Kujihudumia'
                            : 'Open Self-Service Tool'}
                        </span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('support_bot');
                        handleSendBotMessage(helpLang === 'sw' ? art.titleSw : art.titleEn);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-stone-200/70 text-[#1C1917] border border-[var(--border-hairline)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bot size={13} className="text-[#0D9488]" />
                      <span>{helpLang === 'sw' ? 'Uliza Support Bot' : 'Ask Support Bot'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: WAVELINK SUPPORT BOT (KNOWLEDGE BASE + PAYMENT CHECK + TICKET ESCALATION)
      ===================================================================== */}
      {activeTab === 'support_bot' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          {/* Mandatory Bot Safety Banner */}
          <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0D9488] text-white flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-extrabold text-[#1C1917]">
                    WaveLink Support Bot (Official AI Assistant)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-[#0D9488] border border-teal-300 text-[10px] font-extrabold">
                    Automated Bot
                  </span>
                </div>
                <p className="text-[11px] text-teal-950 mt-0.5">
                  {helpLang === 'sw'
                    ? 'Mimi ni Boti ya AI ya WaveLink. Sitauliza kamwe nenosiri lako, PIN ya Mobile Money au misimbo ya uthibitisho, na kamwe sionyeshi data za watumiaji wengine.'
                    : 'I am an automated AI bot. I will NEVER ask for your password, Mobile Money PIN, or verification codes, and I never reveal other users’ private data.'}
                </p>
              </div>
            </div>

            {botQuotaRemaining !== null && (
              <span className="px-2.5 py-1 rounded-xl bg-white border border-teal-200 text-[11px] font-mono font-bold text-[#0D9488]">
                Daily Bot Quota: {botQuotaRemaining} left
              </span>
            )}
          </div>

          {/* Quick Prompt Starters */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              helpLang === 'sw'
                ? 'Kagua hali ya malipo yangu ya WaveLink Pro'
                : 'Check my WaveLink Pro payment status',
              helpLang === 'sw'
                ? 'Ninawezaje kuwasha uthibitishaji wa hatua 2 kwa Authenticator App?'
                : 'How do I enable Authenticator App 2-Step Verification?',
              helpLang === 'sw'
                ? 'Kwa nini simu yangu ya video inakwama kwenye Connecting?'
                : 'How do voice & video calls work on mobile data?',
              helpLang === 'sw'
                ? 'Nifungulie tiketi ya msaada kwa msimamizi'
                : 'Please open a support ticket for human admin review'
            ].map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendBotMessage(promptText)}
                disabled={isBotThinking}
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-blue-50 text-[#1C1917] border border-[var(--border-hairline)] text-xs font-bold transition cursor-pointer"
              >
                {promptText}
              </button>
            ))}
          </div>

          {/* Conversation Feed */}
          <div className="h-[340px] overflow-y-auto p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-3">
            {botMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-[#2563EB] text-white rounded-br-xs font-medium'
                      : 'bg-white text-[#1C1917] border border-[var(--border-hairline)] rounded-bl-xs'
                  }`}
                >
                  {msg.text}
                  {msg.escalatedTicketId && (
                    <div className="mt-2 pt-2 border-t border-teal-200 flex items-center justify-between gap-2 text-xs font-extrabold text-[#0D9488]">
                      <span>✅ Support Ticket Created: #{msg.escalatedTicketId}</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tickets')}
                        className="underline"
                      >
                        View Ticket
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isBotThinking && (
              <div className="text-xs font-bold text-[#0D9488] flex items-center gap-2">
                <Sparkles size={14} className="animate-spin" />
                <span>WaveLink Support Bot is checking the Knowledge Base...</span>
              </div>
            )}
          </div>

          {/* Bot Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendBotMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={botInput}
              onChange={(e) => setBotInput(e.target.value)}
              placeholder={
                helpLang === 'sw'
                  ? 'Uliza swali lolote kuhusu WaveLink au malipo yako...'
                  : 'Ask the WaveLink Support Bot a question...'
              }
              className="flex-1 px-4 py-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <button
              type="submit"
              disabled={isBotThinking || !botInput.trim()}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Send size={15} />
              <span>{helpLang === 'sw' ? 'Uliza' : 'Send'}</span>
            </button>
          </form>
        </div>
      )}

      {/* =====================================================================
          TAB 3: SELF-SERVICE TOOLS (RESET PASSWORD, RESEND VERIFICATION, UNLOCK ACCOUNT, CHECK PAYMENT, APPEAL BAN/HIDDEN CONTENT)
      ===================================================================== */}
      {activeTab === 'self_service' && (
        <div className="space-y-5">
          {selfServiceNotice && (
            <div
              className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
                selfServiceNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : selfServiceNotice.type === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{selfServiceNotice.text}</span>
              <button
                type="button"
                onClick={() => setSelfServiceNotice(null)}
                className="text-xs font-extrabold"
              >
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tool 1: Reset Password */}
            <form
              onSubmit={handleSelfServiceResetPassword}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1C1917]">
                    {helpLang === 'sw' ? '1. Weka Upya Nenosiri (Reset Password)' : '1. Reset Password'}
                  </h3>
                  <p className="text-[11px] text-[#78716C]">
                    {helpLang === 'sw'
                      ? 'Pokea kiungo cha kuweka nenosiri jipya kwenye barua pepe yako.'
                      : 'Send an official password reset link to your email address.'}
                  </p>
                </div>
              </div>
              <input
                type="email"
                required
                value={resetEmailInput}
                onChange={(e) => setResetEmailInput(e.target.value)}
                placeholder="Enter your account email"
                className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917]"
              />
              <button
                type="submit"
                disabled={isSendingReset}
                className="w-full min-h-[40px] py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
              >
                {isSendingReset
                  ? 'Sending Reset Link...'
                  : helpLang === 'sw'
                  ? 'Tuma Kiungo cha Nenosiri'
                  : 'Send Password Reset Email'}
              </button>
            </form>

            {/* Tool 2: Resend Verification Email */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0D9488] flex items-center justify-center">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-[#1C1917]">
                      {helpLang === 'sw'
                        ? '2. Tuma Tena Barua Pepe ya Uthibitisho'
                        : '2. Resend Email Verification'}
                    </h3>
                    <p className="text-[11px] text-[#78716C]">
                      {currentUser?.emailVerified
                        ? `Your email (${currentUser.email}) is already verified ✓`
                        : `Send a fresh verification link to ${currentUser?.email || 'your email'}`}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSelfServiceResendVerification}
                disabled={isSendingVerify || Boolean(currentUser?.emailVerified)}
                className="w-full min-h-[40px] py-2 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
              >
                {currentUser?.emailVerified
                  ? 'Email Already Verified ✓'
                  : isSendingVerify
                  ? 'Sending...'
                  : helpLang === 'sw'
                  ? 'Tuma Tena Kiungo cha Uthibitisho'
                  : 'Resend Verification Email'}
              </button>
            </div>

            {/* Tool 3: Unlock Temporarily Locked Account */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Unlock size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1C1917]">
                    {helpLang === 'sw'
                      ? '3. Fungua Akaunti Iliyofungwa (Unlock Account)'
                      : '3. Unlock Temporarily Locked Account'}
                  </h3>
                  <p className="text-[11px] text-[#78716C]">
                    {helpLang === 'sw'
                      ? 'Fungua akaunti mara moja baada ya majaribio ya kuingia kufeli.'
                      : 'Clear a temporary login lockout immediately using a 6-digit email code.'}
                  </p>
                </div>
              </div>

              {unlockStep === 'request' ? (
                <form onSubmit={handleRequestUnlockCode} className="space-y-2.5">
                  <input
                    type="email"
                    required
                    value={unlockEmailInput}
                    onChange={(e) => setUnlockEmailInput(e.target.value)}
                    placeholder="Enter locked account email"
                    className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917]"
                  />
                  <button
                    type="submit"
                    disabled={isUnlocking}
                    className="w-full min-h-[40px] py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
                  >
                    {isUnlocking ? 'Sending Code...' : 'Send 6-Digit Unlock Code'}
                  </button>
                </form>
              ) : unlockStep === 'verify' ? (
                <form onSubmit={handleVerifyUnlockCode} className="space-y-2.5">
                  {unlockDemoHint && (
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                      Verification code sent (Preview code:{' '}
                      <span className="font-mono underline">{unlockDemoHint}</span>)
                    </div>
                  )}
                  <input
                    type="text"
                    required
                    value={unlockCodeInput}
                    onChange={(e) => setUnlockCodeInput(e.target.value)}
                    placeholder="Enter 6-digit unlock code"
                    className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-mono font-bold text-[#1C1917]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isUnlocking}
                      className="flex-1 min-h-[38px] py-2 rounded-xl bg-[#0D9488] text-white text-xs font-extrabold"
                    >
                      {isUnlocking ? 'Verifying...' : 'Verify & Unlock'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnlockStep('request')}
                      className="px-3 py-2 rounded-xl bg-stone-100 text-xs font-bold text-[#57534E]"
                    >
                      Back
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-extrabold text-emerald-900">
                  ✅ Account unlocked! You can sign in normally.
                </div>
              )}
            </div>

            {/* Tool 4: Check My Payment Status */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#0D9488] flex items-center justify-center">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-[#1C1917]">
                      {helpLang === 'sw'
                        ? '4. Kagua Hali ya Malipo Yangu ya Pro'
                        : '4. Check My Payment & Pro Status'}
                    </h3>
                    <p className="text-[11px] text-[#78716C]">
                      {helpLang === 'sw'
                        ? 'Angalia hali ya uanachama wako wa WaveLink Pro na miamala yako.'
                        : 'Verify your own WaveLink Pro subscription status and recent payments.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCheckMyPaymentStatus}
                  disabled={isCheckingPayment}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isCheckingPayment ? 'animate-spin' : ''} />
                  <span>{isCheckingPayment ? 'Checking...' : 'Check Now'}</span>
                </button>
              </div>

              {paymentStatusResult && (
                <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#57534E]">WaveLink Pro Status:</span>
                    <span
                      className={`font-extrabold ${
                        paymentStatusResult.isPro ? 'text-[#0D9488]' : 'text-[#1C1917]'
                      }`}
                    >
                      {paymentStatusResult.isPro
                        ? `ACTIVE (${paymentStatusResult.proPlan.toUpperCase()}) ✓`
                        : 'Free Tier'}
                    </span>
                  </div>
                  {paymentStatusResult.proExpiresAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#57534E]">Renews / Expires:</span>
                      <span className="font-mono font-bold text-[#1C1917]">
                        {new Date(paymentStatusResult.proExpiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[#57534E]">Blue Star Verification:</span>
                    <span className="font-bold text-[#1C1917]">
                      {paymentStatusResult.hasBlueStar || paymentStatusResult.isVerifiedByAdmin
                        ? 'Verified ✓'
                        : 'Standard'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tool 5: Appeal a Ban or Hidden Content */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                <Scale size={19} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-[#1C1917]">
                  {helpLang === 'sw'
                    ? '5. Kata Rufaa kwa Chapisho Lililofichwa au Akaunti Iliyofungiwa'
                    : '5. Appeal Hidden Content or Account Suspension'}
                </h3>
                <p className="text-xs text-[#78716C]">
                  {helpLang === 'sw'
                    ? 'Ikiwa chapisho lako limefichwa kiotomatiki baada ya ripoti au akaunti yako imezuiwa, tuma rufaa hapa.'
                    : 'If your post, comment, or reel was auto-hidden for review or your account was restricted, submit an appeal for Moderator/Owner review.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitAppeal} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  {helpLang === 'sw' ? 'Aina ya Rufaa' : 'Appeal Type'}
                </label>
                <select
                  value={appealType}
                  onChange={(e) => setAppealType(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]"
                >
                  <option value="hidden_post">Hidden Post</option>
                  <option value="hidden_comment">Hidden Comment</option>
                  <option value="hidden_reel">Hidden Video / Reel</option>
                  <option value="account_ban">Account Restriction / Ban</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  {helpLang === 'sw'
                    ? 'Kitambulisho cha Chapisho (Hiari)'
                    : 'Post / Content ID (Optional)'}
                </label>
                <input
                  type="text"
                  value={appealTargetId}
                  onChange={(e) => setAppealTargetId(e.target.value)}
                  placeholder="Leave blank if appealing your account status"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  {helpLang === 'sw' ? 'Maelezo ya Rufaa Yako' : 'Why should this be restored?'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder={
                    helpLang === 'sw'
                      ? 'Eleza kwa ufupi kwa nini maudhui haya au akaunti yako inapaswa kurejeshwa...'
                      : 'Explain briefly why your content follows WaveLink Community Guidelines...'
                  }
                  className="w-full p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917] resize-none"
                />
              </div>

              <div className="sm:col-span-3 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingAppeal || !appealReason.trim()}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAppeal
                    ? 'Submitting Appeal...'
                    : helpLang === 'sw'
                    ? 'Wasilisha Rufaa'
                    : 'Submit Appeal'}
                </button>
              </div>
            </form>

            {/* Existing Appeals Status */}
            {myAppeals.length > 0 && (
              <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2">
                <span className="text-xs font-extrabold text-[#1C1917] block">
                  {helpLang === 'sw' ? 'Hali ya Rufaa Zako:' : 'Your Submitted Appeals:'}
                </span>
                {myAppeals.slice(0, 5).map((app) => (
                  <div
                    key={app.id}
                    className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-extrabold text-[#1C1917]">
                        {(app.appealType || app.targetType || 'appeal').replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <p className="text-[11px] text-[#57534E] line-clamp-1">{app.reason}</p>
                      {(app.reviewNote || app.resolutionNote) && (
                        <p className="text-[11px] font-bold text-[#2563EB] mt-0.5">
                          Moderator Note: {app.reviewNote || app.resolutionNote}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
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
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SUPPORT TICKETS (WITH AUTOMATIC CONFIRMATION & FOLLOWABLE STATUS)
      ===================================================================== */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Ticket Submission Form & Ticket List */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs">
              <h3 className="font-bold text-[#1C1917] text-sm mb-3 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#2563EB]" />
                <span>
                  {helpLang === 'sw'
                    ? 'Tuma Tiketi Mpya ya Msaada'
                    : 'Submit Support Ticket (Auto-Confirmed)'}
                </span>
              </h3>

              {submissionConfirmation && (
                <div className="mb-4 p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-950 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-[#0D9488]">
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>Automatic Confirmation: #{submissionConfirmation.reference}</span>
                  </div>
                  <p className="text-[11px]">{submissionConfirmation.message}</p>
                </div>
              )}

              <form onSubmit={handleSubmitTicket} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    {helpLang === 'sw' ? 'Mada' : 'Topic'}
                  </label>
                  <select
                    value={ticketTopic}
                    onChange={(e) => setTicketTopic(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs font-bold text-[#1C1917]"
                  >
                    <option value="general_support">General Support</option>
                    <option value="payments">WaveLink Pro &amp; Mobile Money</option>
                    <option value="passwords">Sign-Up, Password &amp; Verification</option>
                    <option value="calls">Voice &amp; Video Calls</option>
                    <option value="safety">Safety Report &amp; Moderation</option>
                    <option value="privacy">Account Privacy &amp; Data</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    Subject / Summary
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Account question, Pro verification, technical help"
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
                  <span>{isSubmitting ? 'Submitting...' : 'Submit Ticket & Get Confirmation'}</span>
                </button>
              </form>
            </div>

            {/* Ticket list summary */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-[#57534E] mb-3">
                {canManageTickets ? 'All Member Support Tickets' : 'Your Submitted Tickets'} ({tickets.length})
              </h4>

              {isLoadingTickets ? (
                <div className="py-6 text-center text-xs font-medium text-[#57534E]">
                  Loading tickets...
                </div>
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
                      {t.confirmationReference && (
                        <div className="text-[10px] font-mono font-bold text-[#2563EB] mb-0.5">
                          Ref: #{t.confirmationReference}
                        </div>
                      )}
                      <p className="text-xs text-[#57534E] line-clamp-1 mb-1.5">
                        {t.summary || t.message}
                      </p>
                      <div className="flex items-center justify-between text-[11px] font-medium text-[#57534E]">
                        <span className="truncate max-w-[140px]">
                          {t.userName || formatTicketUserEmail(t.userEmail)}
                        </span>
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
                      {selectedTicket.confirmationReference && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#0D9488] border border-emerald-200 text-[10px] font-mono font-extrabold">
                          Confirmed #{selectedTicket.confirmationReference}
                        </span>
                      )}
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
                    </div>
                    <h3 className="text-lg font-extrabold text-[#1C1917]">
                      {selectedTicket.subject}
                    </h3>
                    <p className="text-xs text-[#57534E] mt-1">
                      Member: <span className="font-bold text-[#1C1917]">{selectedTicket.userName}</span>{' '}
                      {!isSupportHelper && `(${formatTicketUserEmail(selectedTicket.userEmail)})`} •{' '}
                      {new Date(selectedTicket.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {isAdmin &&
                    (confirmDeleteId === selectedTicket.id ? (
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
                    ))}
                </div>

                {/* User Original Message */}
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#57534E] block mb-1">
                    Member Inquiry:
                  </span>
                  <p className="text-sm text-[#1C1917] whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.message}
                  </p>
                </div>

                {/* Staff Reply (if exists) */}
                {selectedTicket.adminReply && (
                  <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                        Official Support Response ({selectedTicket.repliedByName || 'WaveLink Support'}):
                      </span>
                      <CrystalBadge
                        role={
                          selectedTicket.repliedByRole === 'support_helper'
                            ? 'sub_admin'
                            : 'super_admin'
                        }
                        name={selectedTicket.repliedByName || 'WaveLink Support'}
                        size="sm"
                      />
                    </div>
                    <p className="text-sm text-[#1C1917] whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.adminReply}
                    </p>
                  </div>
                )}

                {/* Staff Response Composer (Owner, Moderator, or Support Helper) */}
                {canManageTickets ? (
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
                            onClick={() =>
                              sendAdminReplyToTicket(selectedTicket, preset.text, 'resolved')
                            }
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
                      <span>
                        {isSupportHelper ? 'Support Helper Reply:' : 'Official Admin Reply:'}
                      </span>
                    </h4>

                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type helpful response to this member..."
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
                        type="button"
                        onClick={() => handleAdminReply(selectedTicket.id)}
                        disabled={isReplying || !replyText.trim()}
                        className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs flex items-center gap-2 transition disabled:opacity-40"
                      >
                        <Send size={13} />
                        <span>Send Support Reply</span>
                      </button>
                    </div>
                  </div>
                ) : !selectedTicket.adminReply ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                    <Clock size={16} className="shrink-0 text-amber-600" />
                    <span>
                      Automatic confirmation sent! Your ticket is in the support queue and its status will update live here.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl text-center">
                <Inbox size={40} className="mb-2 text-[#2563EB]/60" />
                <p className="font-bold text-sm text-[#1C1917]">
                  Select a ticket to view status &amp; conversation
                </p>
                <p className="text-xs text-[#57534E] max-w-xs mt-1">
                  Click on any ticket on the left to track its live status (Open → In Progress → Resolved).
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
