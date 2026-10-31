import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, ADMIN_EMAIL, cleanFirestoreData, firebaseConfig } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { UserProfile, Post, SupportTicket, AppSettings, PaymentGatewayConfig, PendingVerification, PaymentRequest, SystemDomain } from '../types';
import { approveVerification, rejectVerification, approvePaymentRequest, rejectPaymentRequest } from '../services/verificationService';
import { CrystalBadge } from './CrystalBadge';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  AlertTriangle,
  UserX,
  UserCheck,
  Video,
  Phone,
  PhoneCall,
  Lock,
  Unlock,
  Rss,
  HelpCircle,
  ArrowLeft,
  Mail,
  Send,
  CheckCircle,
  X,
  CreditCard,
  Key,
  Smartphone,
  Save,
  CheckCircle2,
  Eye,
  EyeOff,
  Server,
  Zap,
  Crown,
  UserPlus,
  UserMinus,
  Loader2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  FileCheck,
  Check
} from 'lucide-react';

interface AdminDashboardProps {
  onReturnToFeed: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onReturnToFeed }) => {
  const { currentUser, isSuperAdmin, isSubAdmin, isAdmin, toggleSubAdmin, toggleVerifyUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'verifications' | 'members' | 'calls' | 'payments'>('overview');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Manual Pro Verifications & Payment Requests & Domains state
  const [verifications, setVerifications] = useState<PendingVerification[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [systemDomains, setSystemDomains] = useState<SystemDomain[]>([]);
  const [verifFilter, setVerifFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copiedTxnId, setCopiedTxnId] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  // Payment Gateway Config State
  const [paymentConfig, setPaymentConfig] = useState<PaymentGatewayConfig>({
    id: 'global',
    environment: 'sandbox',
    airtelClientId: '',
    airtelClientSecret: '',
    airtelMerchantCode: 'WAVELINK_TZ_AIRTEL',
    mpesaConsumerKey: '',
    mpesaConsumerSecret: '',
    mpesaPasskey: '',
    mpesaShortCode: '174379',
    azampayClientId: '25191bc1-e9af-4513-bf7b-f80ebf143141',
    azampaySecret: '',
    azampayAppName: 'WaveLink',
    azampayApiKey: '36d2031d-9f67-40bc-9767-8e778b81b8c1',
    azampayEnv: 'sandbox',
    clickpesaApiKey: '',
    webhookSecret: 'whsec_wavelink_super_secret_key_2026'
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // AzamPay Test Connection State
  const [isTestingAzampay, setIsTestingAzampay] = useState(false);
  const [azampayTestResult, setAzampayTestResult] = useState<string | null>(null);

  const handleTestAzamPayAuth = async () => {
    setIsTestingAzampay(true);
    setAzampayTestResult(null);
    try {
      const res = await fetch('/api/azampay/token', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAzampayTestResult(`Token Active: ${data.tokenPreview} (expires in ${data.expiresIn}s)`);
      } else {
        setAzampayTestResult(`Error: ${data.error || 'Authentication failed'}`);
      }
    } catch (e: any) {
      setAzampayTestResult(`Network Error: ${e.message}`);
    } finally {
      setIsTestingAzampay(false);
    }
  };

  // Warning Modal State
  const [warningUser, setWarningUser] = useState<UserProfile | null>(null);
  const [warningReason, setWarningReason] = useState('');
  const [isSubmittingWarning, setIsSubmittingWarning] = useState(false);

  // Listen to platform statistics & real data
  useEffect(() => {
    if (!isAdmin) return;

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as UserProfile));
      setUsers(list);
    });

    const unsubPosts = onSnapshot(collection(db, 'posts'), (snap) => {
      const list: Post[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Post));
      setPosts(list);
    });

    const unsubTickets = onSnapshot(collection(db, 'supportTickets'), (snap) => {
      const list: SupportTicket[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SupportTicket));
      setTickets(list);
    });

    const unsubSettings = onSnapshot(doc(db, 'appSettings', 'global'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data() as AppSettings);
      } else {
        setAppSettings({
          id: 'global',
          videoCallsUnlocked: false,
          voiceCallsUnlocked: false
        });
      }
    });

    const unsubPaymentConfig = onSnapshot(doc(db, 'paymentConfig', 'global'), (snap) => {
      if (snap.exists()) {
        setPaymentConfig(snap.data() as PaymentGatewayConfig);
      }
    });

    const unsubVerifications = onSnapshot(collection(db, 'pending_verifications'), (snap) => {
      const list: PendingVerification[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PendingVerification));
      list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setVerifications(list);
    });

    const unsubPaymentRequests = onSnapshot(collection(db, 'payment_requests'), (snap) => {
      const list: PaymentRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PaymentRequest));
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setPaymentRequests(list);
    });

    const unsubDomains = onSnapshot(collection(db, 'system_domains'), (snap) => {
      const list: SystemDomain[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SystemDomain));
      list.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
      setSystemDomains(list);
    });

    return () => {
      unsubUsers();
      unsubPosts();
      unsubTickets();
      unsubSettings();
      unsubPaymentConfig();
      unsubVerifications();
      unsubPaymentRequests();
      unsubDomains();
    };
  }, [isAdmin]);

  // Strict Admin Check: If not Super Admin or Sub-Admin, show 403 Forbidden
  if (!isAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#131927] border border-rose-200 dark:border-rose-900/60 rounded-3xl p-8 text-center shadow-xl shadow-rose-950/5">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-5 ring-8 ring-rose-50 dark:ring-rose-950/20">
            <ShieldAlert size={34} />
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            HTTP 403 Forbidden
          </span>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-3 mb-2">
            Administrator Clearance Required
          </h2>

          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            The WaveLink Admin Desk is restricted strictly to Platform Owner{' '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">{ADMIN_EMAIL}</span>{' '}
            and authorized Sub-Administrators.
          </p>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-left text-xs space-y-1 mb-6">
            <span className="text-[10px] uppercase font-bold text-gray-400 block">
              Current Session:
            </span>
            <div className="font-semibold text-gray-900 dark:text-gray-200 truncate">
              {currentUser?.email || 'Unauthenticated Guest'}
            </div>
            <div className="text-[11px] text-rose-500 font-medium">
              Insufficient administrative privileges.
            </div>
          </div>

          <button
            onClick={onReturnToFeed}
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-purple-600/30"
          >
            <ArrowLeft size={16} />
            <span>Return to Wave Feed</span>
          </button>
        </div>
      </div>
    );
  }

  // Toggle media call unlocks
  const handleToggleMedia = async (type: 'video' | 'voice') => {
    try {
      const field = type === 'video' ? 'videoCallsUnlocked' : 'voiceCallsUnlocked';
      const current = !!appSettings?.[field];
      await setDoc(
        doc(db, 'appSettings', 'global'),
        {
          id: 'global',
          [field]: !current,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.email || 'admin'
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'appSettings/global');
    }
  };

  // Issue Warning to user
  const handleConfirmWarning = async () => {
    if (!warningUser || !warningReason.trim()) return;
    setIsSubmittingWarning(true);
    try {
      await updateDoc(doc(db, 'users', warningUser.id), {
        status: 'warned',
        warningMessage: warningReason.trim(),
        updatedAt: new Date().toISOString()
      });
      setWarningUser(null);
      setWarningReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${warningUser.id}`);
    } finally {
      setIsSubmittingWarning(false);
    }
  };

  // Clear Warning
  const handleClearWarning = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'active',
        warningMessage: '',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  // Ban user
  const handleBanUser = async (user: UserProfile) => {
    if (user.email === ADMIN_EMAIL) {
      console.warn('The primary platform administrator cannot be banned.');
      return;
    }
    const reason = prompt(`Enter suspension reason for ${user.displayName}:`, 'Violation of community policies');
    if (!reason) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        isBanned: true,
        status: 'banned',
        warningMessage: reason,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  // Unban user
  const handleUnbanUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: false,
        status: 'active',
        warningMessage: '',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  // Save Payment Gateway Config
  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigSaveSuccess(false);

    try {
      const payload = cleanFirestoreData({
        ...paymentConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin'
      });
      await setDoc(doc(db, 'paymentConfig', 'global'), payload, { merge: true });
      setConfigSaveSuccess(true);
      setTimeout(() => setConfigSaveSuccess(false), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'paymentConfig/global');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Approve Manual Pro Verification
  const handleApproveVerification = async (verif: PendingVerification) => {
    setApprovingId(verif.id);
    setActionFeedback(null);
    try {
      await approveVerification(verif, currentUser?.email || ADMIN_EMAIL);
      setActionFeedback(`🎉 Approved! ${verif.userName} (${verif.userEmail}) is now WaveLink Pro with Verified Blue Star!`);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      console.error('Failed to approve verification:', err);
      setActionFeedback(`Error approving: ${err.message || String(err)}`);
    } finally {
      setApprovingId(null);
    }
  };

  // Reject Manual Pro Verification
  const handleRejectVerification = async (verif: PendingVerification) => {
    const reason = prompt(
      `Enter reason for rejecting Txn ID ${verif.transactionId} (${verif.userName}):`,
      'SMS Transaction ID could not be matched with statement'
    );
    if (!reason) return;

    setRejectingId(verif.id);
    setActionFeedback(null);
    try {
      await rejectVerification(verif.id, verif.userId, reason);
      setActionFeedback(`Transaction ${verif.transactionId} rejected.`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      console.error('Failed to reject verification:', err);
      setActionFeedback(`Error rejecting: ${err.message || String(err)}`);
    } finally {
      setRejectingId(null);
    }
  };

  // 1-Click Approve Payment Request
  const handleApprovePaymentRequest = async (req: PaymentRequest) => {
    setApprovingId(req.id);
    setActionFeedback(null);
    try {
      await approvePaymentRequest(req, currentUser?.email || ADMIN_EMAIL);
      setActionFeedback(`🎉 1-Click Approved! ${req.userName || 'Subscriber'} is now WaveLink Pro! All ads removed & Verified badge activated.`);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      console.error('Failed to approve payment request:', err);
      setActionFeedback(`Error approving: ${err.message || String(err)}`);
    } finally {
      setApprovingId(null);
    }
  };

  // Reject Payment Request
  const handleRejectPaymentRequest = async (req: PaymentRequest) => {
    const reason = prompt(
      `Enter reason for rejecting Txn ID ${req.transactionId} (${req.userName || req.userPhone}):`,
      'SMS Transaction ID could not be matched with mobile money statement'
    );
    if (!reason) return;

    setRejectingId(req.id);
    setActionFeedback(null);
    try {
      await rejectPaymentRequest(req.id, req.userId, reason);
      setActionFeedback(`Payment notification ${req.transactionId} rejected.`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      console.error('Failed to reject payment request:', err);
      setActionFeedback(`Error rejecting: ${err.message || String(err)}`);
    } finally {
      setRejectingId(null);
    }
  };

  const copyTxn = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedTxnId(id);
      setTimeout(() => setCopiedTxnId(null), 2000);
    }
  };

  const copyDomain = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedDomain(id);
      setTimeout(() => setCopiedDomain(null), 2000);
    }
  };

  const totalUsers = users.length;
  const pendingPaymentRequestsCount = paymentRequests.filter((p) => p.status === 'pending').length;
  const pendingLegacyVerificationsCount = verifications.filter((v) => v.status === 'pending').length;
  const pendingVerificationsCount = pendingPaymentRequestsCount + pendingLegacyVerificationsCount;
  const activeUsers = users.filter((u) => u.status === 'active' && !u.isBanned).length;
  const warnedUsers = users.filter((u) => u.status === 'warned' && !u.isBanned).length;
  const bannedUsers = users.filter((u) => u.isBanned).length;
  const proSubscribers = users.filter((u) => u.isPro).length;
  const openTickets = tickets.filter((t) => t.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* Admin Title Card */}
      <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/20 flex items-center justify-between flex-wrap gap-4 border border-purple-500/20">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {isSuperAdmin ? (
              <span className="p-1 rounded-lg bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/40 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 px-2.5">
                <ShieldCheck size={13} />
                Platform Owner Clearance
              </span>
            ) : (
              <span className="p-1 rounded-lg bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400/40 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 px-2.5">
                <ShieldCheck size={13} />
                Sub-Admin Moderator Clearance
              </span>
            )}
            <span className="text-xs text-purple-200">
              Authenticated as <span className="font-mono text-white font-bold">{currentUser?.email}</span>
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isSuperAdmin
              ? 'WaveLink Administration & Developer Console'
              : 'WaveLink Community Moderator Desk'}
          </h2>
          <p className="text-xs sm:text-sm text-purple-200/80 mt-1 max-w-2xl">
            {isSuperAdmin
              ? 'Strict governance desk for member moderation, administrative appointments, payment gateway credentials, and WebRTC system authorization.'
              : 'Sub-administrative desk for member moderation, user warnings, and community oversight (with restricted credential access).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Custom .crystal-sparkle badge exclusively for keylanmbilinyi5@gmail.com */}
          <CrystalBadge
            email={currentUser?.email}
            name={isSuperAdmin ? 'Keylan (Platform Owner)' : (currentUser?.displayName || 'Moderator')}
            size="lg"
            showAdminTag={true}
            isSubAdmin={isSubAdmin}
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex rounded-2xl bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 p-1.5 text-xs font-semibold overflow-x-auto shadow-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
          }`}
        >
          <Users size={15} />
          <span>Overview & Statistics</span>
        </button>

        <button
          onClick={() => setActiveTab('verifications')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'verifications'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
          }`}
        >
          <FileCheck size={15} />
          <span>Manual Pro Verifications</span>
          {pendingVerificationsCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse">
              {pendingVerificationsCount} PENDING
            </span>
          ) : (
            <span className="text-[10px] font-mono text-gray-400">({verifications.length})</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'members'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
          }`}
        >
          <UserCheck size={15} />
          <span>Member Moderation ({totalUsers})</span>
        </button>

        <button
          onClick={() => setActiveTab('calls')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'calls'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
          }`}
        >
          <Video size={15} />
          <span>WebRTC Calling Controls</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'payments'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
          }`}
        >
          <Key size={15} />
          <span>Payment API Keys & Gateways</span>
        </button>
      </div>

      {actionFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-emerald-300 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-emerald-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {pendingVerificationsCount > 0 && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-indigo-500/15 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 font-bold">
                  <FileCheck size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">
                    {pendingVerificationsCount} Manual Mobile Money Txn{pendingVerificationsCount > 1 ? 's' : ''} Awaiting Approval
                  </h4>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    Users have sent Airtel Money / Tigo Pesa funds and submitted their SMS Transaction IDs.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('verifications')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition shadow-md"
              >
                Review &amp; Approve Now
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div
              onClick={() => setActiveTab('verifications')}
              className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs cursor-pointer hover:border-amber-400 dark:hover:border-amber-500/60 transition"
            >
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Txn Approvals</span>
                <FileCheck size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-amber-500">
                {pendingVerificationsCount}
              </div>
              <span className="text-[10px] text-gray-400">
                {pendingVerificationsCount > 0 ? 'Action required' : 'All clear'}
              </span>
            </div>
            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Users</span>
                <Users size={16} className="text-purple-600" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-gray-900 dark:text-white">{totalUsers}</div>
              <span className="text-[10px] text-gray-400">Authenticated accounts</span>
            </div>

            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Pro VIPs</span>
                <Crown size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-amber-600 dark:text-amber-400">{proSubscribers}</div>
              <span className="text-[10px] text-gray-400">Paid subscribers</span>
            </div>

            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Active</span>
                <UserCheck size={16} className="text-emerald-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-emerald-600 dark:text-emerald-400">{activeUsers}</div>
              <span className="text-[10px] text-gray-400">Good standing</span>
            </div>

            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Warned</span>
                <AlertTriangle size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-amber-600 dark:text-amber-400">{warnedUsers}</div>
              <span className="text-[10px] text-gray-400">Active notices</span>
            </div>

            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Banned</span>
                <UserX size={16} className="text-rose-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-rose-600 dark:text-rose-400">{bannedUsers}</div>
              <span className="text-[10px] text-gray-400">Suspended</span>
            </div>

            <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Waves</span>
                <Rss size={16} className="text-indigo-500" />
              </div>
              <div className="text-2xl font-black font-mono tabular-numbers text-gray-900 dark:text-white">{posts.length}</div>
              <span className="text-[10px] text-gray-400">Public posts</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Manual Pro Verifications & Domain Whitelist Hub */}
      {activeTab === 'verifications' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <FileCheck size={14} />
                  <span>Manual Mobile Money Approvals</span>
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
                  Payment Requests &amp; Transaction Verifications
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  1-Click approval queue for user payments sent to <strong>0787473334</strong>. Approving instantly grants <strong>user.isPro = true</strong>, adds the Verified Blue Star Pro badge, and strips all ads across their account.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setVerifFilter('pending')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    verifFilter === 'pending'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Pending ({pendingVerificationsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setVerifFilter('approved')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    verifFilter === 'approved'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Approved ({paymentRequests.filter((p) => p.status === 'approved').length + verifications.filter((v) => v.status === 'approved').length})
                </button>
                <button
                  type="button"
                  onClick={() => setVerifFilter('rejected')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    verifFilter === 'rejected'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Rejected ({paymentRequests.filter((p) => p.status === 'rejected').length + verifications.filter((v) => v.status === 'rejected').length})
                </button>
                <button
                  type="button"
                  onClick={() => setVerifFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    verifFilter === 'all'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  All ({paymentRequests.length + verifications.length})
                </button>
              </div>
            </div>

            {/* List of Unified Payment Requests */}
            {(() => {
              interface UnifiedItem {
                id: string;
                sourceType: 'payment_request' | 'verification';
                userId: string;
                userName: string;
                userEmail: string;
                userPhotoURL?: string;
                phoneNumber: string;
                plan: string;
                planName: string;
                amountTZS: number;
                transactionId: string;
                status: 'pending' | 'approved' | 'rejected';
                submittedAt: string;
                approvedAt?: string | null;
                notes?: string;
                rawRequest?: PaymentRequest;
                rawVerification?: PendingVerification;
              }

              const unifiedList: UnifiedItem[] = [
                ...paymentRequests.map((pr) => ({
                  id: pr.id,
                  sourceType: 'payment_request' as const,
                  userId: pr.userId,
                  userName: pr.userName || 'Subscriber',
                  userEmail: pr.userEmail || '',
                  userPhotoURL: pr.userPhotoURL,
                  phoneNumber: pr.userPhone,
                  plan: pr.plan,
                  planName: pr.plan === 'harvest' ? 'Harvest 1-Year Pass' : 'Monthly Pro',
                  amountTZS: pr.amountTZS || (pr.plan === 'harvest' ? 50000 : 18000),
                  transactionId: pr.transactionId,
                  status: pr.status,
                  submittedAt: pr.createdAt || new Date().toISOString(),
                  approvedAt: pr.approvedAt,
                  rawRequest: pr
                })),
                ...verifications.map((v) => ({
                  id: v.id,
                  sourceType: 'verification' as const,
                  userId: v.userId,
                  userName: v.userName,
                  userEmail: v.userEmail,
                  userPhotoURL: v.userPhotoURL,
                  phoneNumber: v.phoneNumber || '',
                  plan: v.tierId,
                  planName: v.tierName,
                  amountTZS: v.amountTZS,
                  transactionId: v.transactionId,
                  status: v.status,
                  submittedAt: v.submittedAt,
                  approvedAt: v.approvedAt,
                  notes: v.notes,
                  rawVerification: v
                }))
              ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

              const filtered = unifiedList.filter((item) => {
                if (verifFilter === 'all') return true;
                return item.status === verifFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-400 space-y-2">
                    <FileCheck size={36} className="mx-auto text-gray-500 opacity-40" />
                    <p className="text-sm font-semibold">No payment notifications found in this category.</p>
                    <p className="text-xs text-gray-500">
                      When users submit payment notifications for Monthly Pro or Harvest Pass, they appear here in real-time.
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map((item) => {
                    const isPending = item.status === 'pending';
                    const isApproved = item.status === 'approved';
                    const isRejected = item.status === 'rejected';

                    return (
                      <div
                        key={item.id}
                        className={`p-5 rounded-2xl border transition-all ${
                          isPending
                            ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30'
                            : isApproved
                            ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
                            : 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between flex-wrap gap-4">
                          {/* User Details */}
                          <div className="flex items-center gap-3">
                            <img
                              src={item.userPhotoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${item.userId}`}
                              alt={item.userName}
                              className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-500/30 shrink-0"
                            />
                            <div>
                              <div className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                                <span>{item.userName}</span>
                                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                  ID: {item.userId.substring(0, 8)}...
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {item.userEmail}
                              </div>
                              {item.phoneNumber && (
                                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mt-0.5">
                                  <Phone size={12} className="text-emerald-500" />
                                  <span>Paid From Phone: <strong className="font-mono text-emerald-600">{item.phoneNumber}</strong></span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Plan & Status Badges */}
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              {item.planName}
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                              TZS {item.amountTZS.toLocaleString()}
                            </span>
                            {isPending && (
                              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/40 animate-pulse">
                                Pending Approval
                              </span>
                            )}
                            {isApproved && (
                              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                                <CheckCircle2 size={13} />
                                Pro Active
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                Rejected
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transaction ID Highlight Box */}
                        <div className="mt-4 p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              SMS Transaction ID / Reference Code:
                            </div>
                            <div className="text-base sm:text-lg font-mono font-black text-amber-400 tracking-wider select-all mt-0.5">
                              {item.transactionId}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-[10px] uppercase text-slate-400 font-semibold">Subscription Plan</div>
                              <div className="text-sm font-black text-white font-mono">
                                {item.planName}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => copyTxn(item.transactionId, item.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                              {copiedTxnId === item.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                              <span>{copiedTxnId === item.id ? 'Copied' : 'Copy Txn ID'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Footer Details & 1-Click Action Buttons */}
                        <div className="mt-4 flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-200/60 dark:border-gray-800/60 text-xs">
                          <div className="text-gray-500 dark:text-gray-400 text-[11px] flex items-center gap-2">
                            <Clock size={12} />
                            <span>Submitted: {new Date(item.submittedAt).toLocaleString()}</span>
                            {item.approvedAt && (
                              <span>• Approved: {new Date(item.approvedAt).toLocaleString()}</span>
                            )}
                            {item.notes && (
                              <span className="text-rose-400">• Note: {item.notes}</span>
                            )}
                          </div>

                          {/* 1-Click Approval Actions */}
                          {isPending && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.sourceType === 'payment_request' && item.rawRequest) {
                                    handleRejectPaymentRequest(item.rawRequest);
                                  } else if (item.rawVerification) {
                                    handleRejectVerification(item.rawVerification);
                                  }
                                }}
                                disabled={rejectingId === item.id || approvingId === item.id}
                                className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold transition disabled:opacity-50"
                              >
                                {rejectingId === item.id ? 'Rejecting...' : 'Reject'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (item.sourceType === 'payment_request' && item.rawRequest) {
                                    handleApprovePaymentRequest(item.rawRequest);
                                  } else if (item.rawVerification) {
                                    handleApproveVerification(item.rawVerification);
                                  }
                                }}
                                disabled={approvingId === item.id || rejectingId === item.id}
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white font-extrabold flex items-center gap-2 shadow-md shadow-emerald-600/30 transition disabled:opacity-50 active:scale-95"
                              >
                                {approvingId === item.id ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Activating Pro...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle size={14} />
                                    <span>Approve &amp; Activate Pro</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Google OAuth & System Domains Whitelist Console */}
          <div className="bg-white dark:bg-[#131927] border border-teal-500/30 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                  <Globe size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white">
                    Google OAuth Authorized Domains Whitelist
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Host domains registered in Firebase Authentication for Google Sign-In popups
                  </p>
                </div>
              </div>

              <a
                href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs flex items-center gap-1.5 transition shadow-sm"
              >
                <span>Open Firebase Authorized Domains</span>
                <ExternalLink size={13} />
              </a>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              When Google Sign-In is executed on a new preview or custom domain, Firebase requires that host in the Authorized Domains list. Below are the domains automatically detected and logged by WaveLink:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Current Host Domain */}
              <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between gap-3">
                <div className="truncate">
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 block">
                    Current Active Host
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-900 dark:text-white truncate">
                    {typeof window !== 'undefined' ? window.location.hostname : 'loading...'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyDomain(
                      typeof window !== 'undefined' ? window.location.hostname : '',
                      'current'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  {copiedDomain === 'current' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedDomain === 'current' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Development Host Domain */}
              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-between gap-3">
                <div className="truncate">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block">
                    Dev Cloud Run Host
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-900 dark:text-white truncate">
                    ais-dev-3q3vlonjbk6epnc53geyhc-713336902783.europe-west2.run.app
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyDomain(
                      'ais-dev-3q3vlonjbk6epnc53geyhc-713336902783.europe-west2.run.app',
                      'dev'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  {copiedDomain === 'dev' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedDomain === 'dev' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Other Logged Domains */}
            {systemDomains.length > 0 && (
              <div className="pt-2">
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-2">
                  All Registered System Domains ({systemDomains.length}):
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {systemDomains.map((d) => (
                    <div
                      key={d.id}
                      className="px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs font-mono flex items-center justify-between gap-3"
                    >
                      <span className="truncate text-gray-800 dark:text-gray-200">{d.domain}</span>
                      <button
                        type="button"
                        onClick={() => copyDomain(d.domain, d.id)}
                        className="text-[10px] text-teal-500 hover:text-teal-400 flex items-center gap-1"
                      >
                        {copiedDomain === d.id ? <Check size={10} /> : <Copy size={10} />}
                        <span>{copiedDomain === d.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Member Moderation Directory */}
      {activeTab === 'members' && (
        <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="text-purple-600" size={18} />
              <span>Registered User Accounts & Compliance</span>
            </h3>
            <span className="text-xs text-gray-400">{users.length} members</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-[11px] uppercase tracking-wider font-semibold rounded-xl">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">User</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role & Clearance</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Standing</th>
                  <th className="py-3 px-4">Warning Message</th>
                  <th className="py-3 px-4 rounded-r-xl text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((user) => {
                  const isTargetSuperAdmin = user.email === ADMIN_EMAIL;
                  const isTargetSubAdmin = !isTargetSuperAdmin && (user.isSubAdmin || user.role === 'sub_admin');

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.id}`}
                            alt={user.displayName}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-purple-500/20 shrink-0"
                          />
                          <CrystalBadge
                            email={user.email}
                            name={user.displayName}
                            isPro={user.isPro}
                            isSubAdmin={isTargetSubAdmin}
                            size="sm"
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {user.email}
                      </td>

                      <td className="py-3.5 px-4">
                        {isTargetSuperAdmin ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 ring-1 ring-purple-400/40">
                            👑 Platform Owner
                          </span>
                        ) : isTargetSubAdmin ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 ring-1 ring-indigo-400/40 flex items-center gap-1 w-fit">
                            <ShieldCheck size={11} />
                            Sub-Admin
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            Community Member
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {user.isVerifiedByAdmin ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-1 ring-emerald-500/30 flex items-center gap-1 w-fit">
                            <Crown size={11} className="text-emerald-600" />
                            Admin Verified (Pro)
                          </span>
                        ) : user.isPro ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Pro {user.proPlan || 'Monthly'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Free Tier</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {user.isBanned ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            Banned
                          </span>
                        ) : user.status === 'warned' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            Warned
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-500 italic max-w-xs truncate">
                        {user.warningMessage || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isTargetSuperAdmin ? (
                          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-bold italic">
                            Platform Owner (Protected)
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Super Admin exclusive: Appoint / Demote Sub-Admin */}
                            {isSuperAdmin && (
                              isTargetSubAdmin ? (
                                <button
                                  onClick={() => toggleSubAdmin(user.id, false)}
                                  className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center gap-1 transition"
                                  title="Revoke Sub-Admin status"
                                >
                                  <UserMinus size={12} />
                                  <span>Revoke Mod</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => toggleSubAdmin(user.id, true)}
                                  className="px-2 py-1 text-xs rounded-lg bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-semibold flex items-center gap-1 transition"
                                  title="Appoint as Sub-Admin with limited moderation privileges"
                                >
                                  <UserPlus size={12} />
                                  <span>Make Sub-Admin</span>
                                </button>
                              )
                            )}

                            {/* Admin & Super Admin: Verify Member / Grant Complimentary Pro Access */}
                            {user.isVerifiedByAdmin || user.isPro ? (
                              <button
                                onClick={() => toggleVerifyUser(user.id, false)}
                                className="px-2 py-1 text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1 transition"
                                title="Revoke Admin Verified and Pro status"
                              >
                                <Crown size={12} className="text-amber-600" />
                                <span>Revoke Pro</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => toggleVerifyUser(user.id, true)}
                                className="px-2 py-1 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 transition"
                                title="Verify user & grant complimentary WaveLink Pro perks"
                              >
                                <Crown size={12} className="text-emerald-600" />
                                <span>Verify (Grant Pro)</span>
                              </button>
                            )}

                            {user.status === 'warned' ? (
                              <button
                                onClick={() => handleClearWarning(user.id)}
                                className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 transition"
                                title="Clear Warning"
                              >
                                Clear Warn
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setWarningUser(user);
                                  setWarningReason('');
                                }}
                                className="px-2 py-1 text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 transition font-medium"
                                title="Issue warning notice"
                              >
                                Warn User
                              </button>
                            )}

                            {user.isBanned ? (
                              <button
                                onClick={() => handleUnbanUser(user.id)}
                                className="px-2 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition"
                              >
                                Unban
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBanUser(user)}
                                className="px-2 py-1 text-xs rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition"
                              >
                                Ban Account
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Calling Controls */}
      {activeTab === 'calls' && (
        <div className="bg-white dark:bg-[#131927] border border-purple-200 dark:border-purple-900/60 rounded-3xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <Video className="text-purple-600" size={18} />
              <span>WebRTC Calling Authorization Controls</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Control platform-wide streaming permissions for direct video and audio calls.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    appSettings?.videoCallsUnlocked
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {appSettings?.videoCallsUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                    Video Calling Lock
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Status: {appSettings?.videoCallsUnlocked ? 'Unlocked & Active' : 'Locked by Admin'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleMedia('video')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
                  appSettings?.videoCallsUnlocked
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {appSettings?.videoCallsUnlocked ? 'Lock Video Calls' : 'Unlock Video Calls'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    appSettings?.voiceCallsUnlocked
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {appSettings?.voiceCallsUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                    Voice Calling Lock
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Status: {appSettings?.voiceCallsUnlocked ? 'Unlocked & Active' : 'Locked by Admin'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleMedia('voice')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
                  appSettings?.voiceCallsUnlocked
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {appSettings?.voiceCallsUnlocked ? 'Lock Voice Calls' : 'Unlock Voice Calls'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Payment Developer Settings */}
      {activeTab === 'payments' && (
        !isSuperAdmin ? (
          <div className="bg-white dark:bg-[#131927] border border-amber-200 dark:border-amber-900/60 rounded-3xl p-8 shadow-xs text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center ring-8 ring-amber-50 dark:ring-amber-950/20">
              <Lock size={30} />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              Platform Owner Clearance Required
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
              Managing payment gateway credentials (Airtel Money, Vodacom M-Pesa, Tigo Pesa, ClickPesa, and AzamPay Client IDs, API Secrets, and Webhook Secret) is strictly reserved for the Platform Owner (<span className="font-semibold text-purple-600 dark:text-purple-400">{ADMIN_EMAIL}</span>).
            </p>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Sub-Admin clearance does not grant access to financial API secrets
            </div>
          </div>
        ) : (
        <div className="bg-white dark:bg-[#131927] border border-purple-200 dark:border-purple-900/60 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs font-bold uppercase tracking-wider mb-2">
                <Key size={13} />
                <span>Developer Settings</span>
              </div>
              <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
                Mobile Money Payment API Keys & Gateway Config
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Configure credentials for Airtel Money, Vodacom M-Pesa, Tigo Pesa, ClickPesa, and AzamPay integrations. Securely preserved in Firestore.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center gap-1.5"
              >
                {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showSecrets ? 'Mask Secrets' : 'Reveal Keys'}</span>
              </button>
            </div>
          </div>

          {configSaveSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              <span>Payment Gateway API configuration successfully stored and synced!</span>
            </div>
          )}

          <form onSubmit={handleSavePaymentConfig} className="space-y-6">
            {/* Environment Toggle */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                  Gateway Processing Environment
                </h4>
                <p className="text-[11px] text-gray-500">
                  Select Sandbox for developer simulation and testing, or Live for real billing.
                </p>
              </div>

              <div className="flex rounded-xl bg-white dark:bg-gray-900 p-1 border border-gray-200 dark:border-gray-700 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPaymentConfig({ ...paymentConfig, environment: 'sandbox' })}
                  className={`px-4 py-1.5 rounded-lg transition ${
                    paymentConfig.environment === 'sandbox'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Sandbox (Simulation)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentConfig({ ...paymentConfig, environment: 'live' })}
                  className={`px-4 py-1.5 rounded-lg transition ${
                    paymentConfig.environment === 'live'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Live Production
                </button>
              </div>
            </div>

            {/* Airtel Money API Box */}
            <div className="p-5 rounded-2xl bg-red-50/40 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 space-y-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <Smartphone size={18} />
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                  Airtel Money Tanzania (API / USSD Push *150*60#)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Client ID / Merchant Code
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.airtelClientId || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, airtelClientId: e.target.value })}
                    placeholder="e.g. AIRTEL_CLIENT_ID_XXXX"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Client Secret
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={paymentConfig.airtelClientSecret || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, airtelClientSecret: e.target.value })}
                    placeholder="e.g. sec_airtel_99x..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Merchant Code
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.airtelMerchantCode || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, airtelMerchantCode: e.target.value })}
                    placeholder="e.g. WAVELINK_AIRTEL"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>

            {/* Vodacom M-Pesa API Box */}
            <div className="p-5 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 space-y-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <CreditCard size={18} />
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                  Vodacom M-Pesa (Daraja / Lipa kwa M-Pesa STK Push)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Consumer Key
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.mpesaConsumerKey || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, mpesaConsumerKey: e.target.value })}
                    placeholder="MPESA_CONSUMER_KEY"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Consumer Secret
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={paymentConfig.mpesaConsumerSecret || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, mpesaConsumerSecret: e.target.value })}
                    placeholder="sec_mpesa_consumer_..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Lipa Passkey
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={paymentConfig.mpesaPasskey || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, mpesaPasskey: e.target.value })}
                    placeholder="bfb279f9aa9bdbcf158e..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Short Code / Paybill
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.mpesaShortCode || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, mpesaShortCode: e.target.value })}
                    placeholder="174379"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* AzamPay Payment Gateway Box */}
            <div className="p-5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <Zap size={18} />
                  <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                    AzamPay Payment Gateway (Airtel Money & Multi-Carrier USSD Push)
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    {paymentConfig.azampayEnv || 'sandbox'}
                  </span>
                  <button
                    type="button"
                    onClick={handleTestAzamPayAuth}
                    disabled={isTestingAzampay}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-xs"
                  >
                    {isTestingAzampay ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} />
                        <span>Test AzamPay Auth</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {azampayTestResult && (
                <div className="p-2.5 rounded-xl bg-purple-100/70 dark:bg-purple-950/50 border border-purple-300 dark:border-purple-800 text-[11px] font-mono text-purple-800 dark:text-purple-200">
                  {azampayTestResult}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    App Name
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.azampayAppName || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, azampayAppName: e.target.value })}
                    placeholder="WaveLink"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={paymentConfig.azampayClientId || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, azampayClientId: e.target.value })}
                    placeholder="25191bc1-e9af-4513-bf7b-f80ebf143141"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Client Secret
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={paymentConfig.azampaySecret || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, azampaySecret: e.target.value })}
                    placeholder="aoTnllvDU7eBwuKj..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    API Key
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={paymentConfig.azampayApiKey || ''}
                    onChange={(e) => setPaymentConfig({ ...paymentConfig, azampayApiKey: e.target.value })}
                    placeholder="36d2031d-9f67-40bc-9767-8e778b81b8c1"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Webhook Signing Secret (For instant callback verification)
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={paymentConfig.webhookSecret || ''}
                onChange={(e) => setPaymentConfig({ ...paymentConfig, webhookSecret: e.target.value })}
                placeholder="whsec_..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-gray-400">
                Only {ADMIN_EMAIL} has Firestore read/write clearance for this vault.
              </span>

              <button
                type="submit"
                disabled={isSavingConfig}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-purple-600/30 transition disabled:opacity-50"
              >
                <Save size={15} />
                <span>{isSavingConfig ? 'Saving API Vault...' : 'Save Payment API Keys'}</span>
              </button>
            </div>
          </form>
        </div>
        )
      )}

      {/* Warning Modal */}
      {warningUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Issue Warning to User
                </h3>
              </div>
              <button
                onClick={() => setWarningUser(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400">
              The user will see an in-app warning notice banner upon accessing WaveLink.
            </p>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs">
              <span className="font-bold text-gray-700 dark:text-gray-300">Target User:</span>{' '}
              {warningUser.displayName} ({warningUser.email})
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Warning Notice Message:
              </label>
              <textarea
                rows={3}
                required
                value={warningReason}
                onChange={(e) => setWarningReason(e.target.value)}
                placeholder="e.g. Please refrain from harassing members in public channels. Continued violations will result in account suspension."
                className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setWarningUser(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWarning}
                disabled={isSubmittingWarning || !warningReason.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50"
              >
                Issue Warning Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
