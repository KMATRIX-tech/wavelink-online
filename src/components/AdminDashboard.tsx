import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, ADMIN_EMAIL, cleanFirestoreData, firebaseConfig, getAuthHeaders } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import {
  UserProfile,
  Post,
  SupportTicket,
  AppSettings,
  PaymentGatewayConfig,
  PendingVerification,
  PaymentRequest,
  SystemDomain,
  SupportBotConfig,
  SupportBotLog,
  ScheduledBotDraft,
  ContentReport,
  AdminAuditLog,
  UpgradeFeedbackItem,
  UpgradeStatus,
  UpgradeSource,
  UpgradeCategory
} from '../types';
import {
  updateUpgradeFeedbackStatus,
  recordUpgradeFeedback
} from '../services/upgradeFeedbackService';
import { approveVerification, rejectVerification, approvePaymentRequest, rejectPaymentRequest } from '../services/verificationService';
import { CrystalBadge } from './CrystalBadge';
import { SupportDeskView } from './SupportDeskView';
import { AnnouncementsView } from './AnnouncementsView';
import {
  SUPPORT_BOT_ID,
  SUPPORT_BOT_EMAIL,
  SUPPORT_BOT_PROFILE,
  sanitizeUserText
} from '../utils/security';
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
  Check,
  Bot,
  Flame,
  Flag,
  FileText,
  Power,
  Lightbulb,
  Sparkles,
  Filter,
  Tag,
  Trash2
} from 'lucide-react';

interface AdminDashboardProps {
  onReturnToFeed: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onReturnToFeed }) => {
  const {
    currentUser,
    isSuperAdmin,
    isSubAdmin,
    isAdmin,
    toggleSubAdmin,
    toggleVerifyUser,
    recordAdminAuditLog,
    refreshAdminVerification,
    reverifyOwnerAccess,
    adminCheckFailedReason
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'complaints' | 'members' | 'updates_group' | 'verifications' | 'calls' | 'payments' | 'audit' | 'upgrades' | 'duplicates'>('overview');
  const [serverAdminVerified, setServerAdminVerified] = useState<boolean>(false);
  const [isCheckingServerAdmin, setIsCheckingServerAdmin] = useState<boolean>(true);
  const [failedCheckReason, setFailedCheckReason] = useState<string | null>(null);

  // Re-verify owner access state on the 403 screen
  const [showReverifyForm, setShowReverifyForm] = useState<boolean>(false);
  const [reverifyCode, setReverifyCode] = useState<string>('');
  const [showReverifyCodeText, setShowReverifyCodeText] = useState<boolean>(false);
  const [isReverifyingOwner, setIsReverifyingOwner] = useState<boolean>(false);
  const [reverifyError, setReverifyError] = useState<string | null>(null);

  const verifyAdminSessionWithServer = async (forceTokenRefresh = false) => {
    if (!currentUser) {
      setServerAdminVerified(false);
      setFailedCheckReason('session needs refresh');
      setIsCheckingServerAdmin(false);
      return;
    }
    setIsCheckingServerAdmin(true);
    try {
      if (forceTokenRefresh) {
        await currentUser.getIdToken(true).catch(() => {});
      }
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/admin/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: currentUser.email, isSubAdmin })
      });
      const d = await resp.json().catch(() => ({}));
      if (d && d.authorized === true) {
        setServerAdminVerified(true);
        setFailedCheckReason(null);
        if (d.needsTokenRefresh || !isAdmin) {
          await currentUser.getIdToken(true).catch(() => {});
          await refreshAdminVerification().catch(() => {});
        }
      } else {
        setServerAdminVerified(false);
        setFailedCheckReason(
          typeof d?.failedCheck === 'string' && d.failedCheck.trim()
            ? d.failedCheck.trim()
            : adminCheckFailedReason || 'owner sign-in not used'
        );
      }
    } catch {
      const ok = Boolean(isAdmin);
      setServerAdminVerified(ok);
      if (!ok) {
        setFailedCheckReason(adminCheckFailedReason || 'session needs refresh');
      }
    } finally {
      setIsCheckingServerAdmin(false);
    }
  };

  useEffect(() => {
    verifyAdminSessionWithServer(false);
  }, [currentUser, isSubAdmin, isAdmin]);

  const handleReverifyOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReverifyError(null);
    if (!reverifyCode.trim()) {
      setReverifyError('Please enter your owner access code.');
      return;
    }
    setIsReverifyingOwner(true);
    try {
      const res = await reverifyOwnerAccess(reverifyCode.trim());
      if (res.authorized) {
        setReverifyCode('');
        setShowReverifyForm(false);
        setFailedCheckReason(null);
        setServerAdminVerified(true);
        await verifyAdminSessionWithServer(true);
      } else {
        if (res.failedCheck) {
          setFailedCheckReason(res.failedCheck);
        }
        setReverifyError(res.error || 'Owner verification failed. Please check your code and try again.');
      }
    } finally {
      setIsReverifyingOwner(false);
    }
  };

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Support Bot Config, Logs, Scheduled Drafts, Content Reports & Audit Logs
  const [botConfig, setBotConfig] = useState<SupportBotConfig>({
    id: 'global',
    enabled: true,
    dailyGeminiCap: 250,
    dailyGeminiUsed: 0,
    usageDate: new Date().toISOString().slice(0, 10),
    userRateLimitPerMinute: 8,
    maxMessageLength: 600,
    updatedAt: new Date().toISOString()
  });
  const [botLogs, setBotLogs] = useState<SupportBotLog[]>([]);
  const [scheduledDrafts, setScheduledDrafts] = useState<ScheduledBotDraft[]>([]);
  const [contentReports, setContentReports] = useState<ContentReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // Scheduled Bot Draft Form State
  const [draftType, setDraftType] = useState<'weekly_update' | 'spark_of_the_day'>('weekly_update');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftScheduleTime, setDraftScheduleTime] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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

  // Upgrade Ideas & Feedback from AI's Live Talks, WELINK AI & WaveLink Support Bot
  const [upgradeFeedbacks, setUpgradeFeedbacks] = useState<UpgradeFeedbackItem[]>([]);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'all' | 'new' | 'planned' | 'implemented' | 'archived'>('all');
  const [feedbackSourceFilter, setFeedbackSourceFilter] = useState<'all' | UpgradeSource>('all');
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState<'all' | UpgradeCategory>('all');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [editingFeedbackNoteId, setEditingFeedbackNoteId] = useState<string | null>(null);
  const [feedbackNoteText, setFeedbackNoteText] = useState('');
  const [isUpdatingFeedback, setIsUpdatingFeedback] = useState(false);
  const [showManualUpgradeModal, setShowManualUpgradeModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualCategory, setManualCategory] = useState<UpgradeCategory>('features');
  const [manualImpact, setManualImpact] = useState<'high' | 'medium' | 'low'>('high');

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
        setAzampayTestResult(`Gateway Connected (${data.payee || 'WaveLink'} - ${data.environment || 'sandbox'})`);
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

  // Duplicate Accounts Manager State & Logic
  const [mergeModalGroup, setMergeModalGroup] = useState<{
    email: string;
    mainProfile: UserProfile;
    duplicateProfile: UserProfile;
  } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSuccessMsg, setMergeSuccessMsg] = useState<string | null>(null);
  const [duplicateSearchTerm, setDuplicateSearchTerm] = useState('');

  // Group user profiles sharing the same email (excluding system bots)
  const duplicateEmailGroups = useMemo(() => {
    const map = new Map<string, UserProfile[]>();
    for (const u of users) {
      if (!u.email) continue;
      const em = u.email.trim().toLowerCase();
      if (!em || em === 'support-bot@wavelink.system' || em === 'support@wavelink.app') continue;
      const existing = map.get(em) || [];
      existing.push(u);
      map.set(em, existing);
    }

    const groups: { email: string; profiles: UserProfile[]; isOwnerGroup: boolean }[] = [];
    map.forEach((profiles, email) => {
      if (profiles.length >= 2) {
        const isOwner = email === 'keylanmbilinyi5@gmail.com' || profiles.some((p) => p.username === '@keylan' || p.username === 'keylan');
        // Sort so @keylan or active primary is first
        profiles.sort((a, b) => {
          if (isOwner) {
            if (a.username === '@keylan' || a.username === 'keylan') return -1;
            if (b.username === '@keylan' || b.username === 'keylan') return 1;
          }
          if (a.isDuplicateDisabled && !b.isDuplicateDisabled) return 1;
          if (!a.isDuplicateDisabled && b.isDuplicateDisabled) return -1;
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        groups.push({ email, profiles, isOwnerGroup: isOwner });
      }
    });

    return groups;
  }, [users]);

  const handleExecuteMerge = async () => {
    if (!mergeModalGroup || isMerging) return;
    const { mainProfile, duplicateProfile } = mergeModalGroup;
    setIsMerging(true);
    setMergeSuccessMsg(null);

    try {
      const idToken = currentUser ? await currentUser.getIdToken(true) : '';
      await fetch('/api/admin/merge-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          mainUid: mainProfile.id,
          duplicateUid: duplicateProfile.id
        })
      });

      const nowIso = new Date().toISOString();
      const thirtyDaysLaterIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Migrate posts from duplicate profile to main profile in Firestore
      const dupPosts = posts.filter((p) => p.authorId === duplicateProfile.id);
      for (const p of dupPosts) {
        await setDoc(
          doc(db, 'posts', p.id),
          {
            authorId: mainProfile.id,
            authorEmail: mainProfile.email,
            authorName: mainProfile.displayName,
            authorUsername: mainProfile.username,
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {});
      }

      // Combine points & Pro status into main profile
      const combinedPoints =
        (Number(mainProfile.points) || Number(mainProfile.wavePoints) || 0) +
        (Number(duplicateProfile.points) || Number(duplicateProfile.wavePoints) || 0);

      await setDoc(
        doc(db, 'users', mainProfile.id),
        cleanFirestoreData({
          points: combinedPoints,
          wavePoints: combinedPoints,
          isPro: Boolean(mainProfile.isPro || duplicateProfile.isPro),
          hasBlueStar: Boolean(mainProfile.hasBlueStar || duplicateProfile.hasBlueStar),
          proBadge: mainProfile.proBadge || duplicateProfile.proBadge,
          appearanceTheme: mainProfile.appearanceTheme || duplicateProfile.appearanceTheme,
          linkedAuthUids: Array.from(new Set([...(mainProfile.linkedAuthUids || []), duplicateProfile.id])),
          updatedAt: nowIso
        }),
        { merge: true }
      ).catch(() => {});

      // Disable duplicate profile — PRESERVE DATA FOR 30 DAYS (NEVER DELETE)
      await setDoc(
        doc(db, 'users', duplicateProfile.id),
        cleanFirestoreData({
          status: 'banned',
          isBanned: true,
          isDuplicateDisabled: true,
          mergedIntoUid: mainProfile.id,
          disabledAt: nowIso,
          disabledReason: `Merged into ${mainProfile.username || mainProfile.id}`,
          keptUntil: thirtyDaysLaterIso,
          updatedAt: nowIso
        }),
        { merge: true }
      ).catch(() => {});

      await recordAdminAuditLog({
        action: 'merge_duplicate_accounts',
        targetId: duplicateProfile.id,
        targetLabel: duplicateProfile.username || duplicateProfile.id,
        details: `Merged duplicate profile ${duplicateProfile.username || duplicateProfile.id} (${duplicateProfile.email}) into ${mainProfile.username || mainProfile.id}. Moved ${dupPosts.length} posts and +${Number(duplicateProfile.points) || 0} points. Duplicate disabled and preserved for 30 days until ${thirtyDaysLaterIso}.`
      }).catch(() => {});

      setMergeSuccessMsg(
        `Successfully merged ${duplicateProfile.username || duplicateProfile.id} into ${mainProfile.username}! Moved ${dupPosts.length} posts, combined points, and preserved theme/Pro. The duplicate profile is disabled and its data is safely retained for 30 days.`
      );
      setMergeModalGroup(null);
    } catch (err: any) {
      alert(`Merge error: ${err?.message || 'Failed to merge duplicate accounts'}`);
    } finally {
      setIsMerging(false);
    }
  };

  // Fetch initial Support Bot config from server
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/support-bot/config')
      .then((r) => r.json())
      .then((d) => {
        if (d?.config) {
          setBotConfig((prev) => ({ ...prev, ...d.config }));
        }
      })
      .catch(() => {});
  }, [isAdmin]);

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

    const unsubBotConfig = onSnapshot(doc(db, 'supportBotConfig', 'global'), (snap) => {
      if (snap.exists()) {
        setBotConfig((prev) => ({ ...prev, ...(snap.data() as SupportBotConfig) }));
      }
    });

    const unsubBotLogs = onSnapshot(collection(db, 'supportBotLogs'), (snap) => {
      const list: SupportBotLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SupportBotLog));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBotLogs(list);
    });

    const unsubScheduledDrafts = onSnapshot(collection(db, 'scheduledBotDrafts'), (snap) => {
      const list: ScheduledBotDraft[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ScheduledBotDraft));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setScheduledDrafts(list);
    });

    const unsubReports = onSnapshot(collection(db, 'contentReports'), (snap) => {
      const list: ContentReport[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ContentReport));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setContentReports(list);
    });

    const unsubAuditLogs = onSnapshot(collection(db, 'adminAuditLogs'), (snap) => {
      const list: AdminAuditLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AdminAuditLog));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAuditLogs(list);
    });

    const unsubUpgrades = onSnapshot(collection(db, 'upgrade_feedback'), (snap) => {
      const list: UpgradeFeedbackItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as UpgradeFeedbackItem));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUpgradeFeedbacks(list);
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
      unsubBotConfig();
      unsubBotLogs();
      unsubScheduledDrafts();
      unsubReports();
      unsubAuditLogs();
      unsubUpgrades();
    };
  }, [isAdmin]);

  if (isCheckingServerAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-8 text-center shadow-lg">
          <Loader2 size={32} className="animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Verifying Admin Desk clearance...
          </p>
        </div>
      </div>
    );
  }

  // Strict Admin Check: Enforced across Admin Desk, Server Routes, and Firestore Rules
  if (!isAdmin || !serverAdminVerified) {
    const diagnosticFailedCheck =
      failedCheckReason ||
      adminCheckFailedReason ||
      (!currentUser
        ? 'session needs refresh'
        : !isAdmin
        ? 'role missing'
        : 'session needs refresh');

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

          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
            The WaveLink Admin Desk is restricted strictly to Platform Owner{' '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">{ADMIN_EMAIL}</span>{' '}
            and authorized Sub-Administrators.
          </p>

          {/* Small non-secret diagnostic line stating which check failed */}
          <div className="mb-5 px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/50 text-xs text-rose-700 dark:text-rose-300 font-medium">
            Check failed: <span className="font-bold">{diagnosticFailedCheck}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-left text-xs space-y-1 mb-5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block">
              Current Session:
            </span>
            <div className="font-semibold text-gray-900 dark:text-gray-200 truncate">
              {currentUser?.email || 'Unauthenticated Guest'}
            </div>
            <div className="text-[11px] text-rose-500 font-medium">
              Insufficient administrative privileges ({diagnosticFailedCheck}).
            </div>
          </div>

          {!showReverifyForm ? (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setReverifyError(null);
                  setShowReverifyForm(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-amber-500/25 cursor-pointer"
              >
                <Key size={16} />
                <span>Re-verify owner access</span>
              </button>

              <button
                type="button"
                onClick={onReturnToFeed}
                className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <ArrowLeft size={16} />
                <span>Return to Wave Feed</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleReverifyOwnerSubmit} className="text-left space-y-3 mb-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Owner Access Code
                </label>
                <div className="relative">
                  <input
                    type={showReverifyCodeText ? 'text' : 'password'}
                    value={reverifyCode}
                    onChange={(e) => setReverifyCode(e.target.value)}
                    placeholder="Enter owner access code"
                    autoFocus
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReverifyCodeText((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showReverifyCodeText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {reverifyError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-300 font-medium">
                  {reverifyError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowReverifyForm(false);
                    setReverifyError(null);
                  }}
                  disabled={isReverifyingOwner}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReverifyingOwner}
                  className="flex-[2] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-amber-500/25 cursor-pointer"
                >
                  {isReverifyingOwner ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Verifying &amp; Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      <span>Verify &amp; Refresh Session</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
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
      const cleanReason = sanitizeUserText(warningReason, 400);
      await updateDoc(doc(db, 'users', warningUser.id), {
        status: 'warned',
        warningMessage: cleanReason,
        updatedAt: new Date().toISOString()
      });
      await recordAdminAuditLog({
        action: 'warn_user',
        targetId: warningUser.id,
        targetLabel: warningUser.email,
        details: `Issued warning: ${cleanReason}`
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

  // Ban user (no window.prompt required)
  const handleBanUser = async (user: UserProfile) => {
    if (user.role === 'super_admin') {
      console.warn('The primary platform administrator cannot be banned.');
      return;
    }
    const reason = 'Violation of WaveLink community safety policies';

    try {
      await updateDoc(doc(db, 'users', user.id), {
        isBanned: true,
        status: 'banned',
        warningMessage: reason,
        updatedAt: new Date().toISOString()
      });
      await recordAdminAuditLog({
        action: 'ban_user',
        targetId: user.id,
        targetLabel: user.email,
        details: `Suspended account (${user.displayName}): ${reason}`
      });
      setActionFeedback(`Account ${user.displayName} (${user.email}) has been suspended and logged in the Audit Log.`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  // Unban user
  const handleUnbanUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: false,
        status: 'active',
        warningMessage: '',
        updatedAt: new Date().toISOString()
      });
      await recordAdminAuditLog({
        action: 'unban_user',
        targetId: userId,
        targetLabel: target?.email,
        details: `Restored account access for ${target?.displayName || userId}`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  // Toggle WaveLink Support Bot ON / OFF
  const handleToggleSupportBot = async () => {
    const nextEnabled = !botConfig.enabled;
    const updated: SupportBotConfig = {
      ...botConfig,
      id: 'global',
      enabled: nextEnabled,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email || ADMIN_EMAIL
    };
    setBotConfig(updated);

    try {
      const headers = await getAuthHeaders();
      await fetch('/api/support-bot/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          adminEmail: currentUser?.email,
          isSubAdmin,
          enabled: nextEnabled,
          dailyGeminiCap: updated.dailyGeminiCap,
          maxMessageLength: updated.maxMessageLength
        })
      }).catch(() => {});

      await setDoc(doc(db, 'supportBotConfig', 'global'), cleanFirestoreData(updated), { merge: true });
      await recordAdminAuditLog({
        action: 'bot_toggle',
        targetId: SUPPORT_BOT_ID,
        targetLabel: SUPPORT_BOT_EMAIL,
        details: `Switched WaveLink Support Bot ${nextEnabled ? 'ON' : 'OFF'}`
      });
      setActionFeedback(`WaveLink Support Bot is now ${nextEnabled ? 'ENABLED (Active)' : 'DISABLED (Paused)'}.`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'supportBotConfig/global');
    }
  };

  // Create a Scheduled Bot Draft (Weekly Community Update or Spark of the Day)
  const handleCreateBotDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeTitle = sanitizeUserText(draftTitle, 140);
    const safeContent = sanitizeUserText(draftContent, 1500);
    if (!safeTitle || !safeContent) return;

    setIsSavingDraft(true);
    try {
      const draftId = `draft_${Date.now()}`;
      const scheduledIso = draftScheduleTime
        ? new Date(draftScheduleTime).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();

      const newDraft: ScheduledBotDraft = {
        id: draftId,
        type: draftType,
        title: safeTitle,
        content: safeContent,
        status: 'draft',
        scheduledFor: scheduledIso,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'scheduledBotDrafts', draftId), cleanFirestoreData(newDraft));
      setDraftTitle('');
      setDraftContent('');
      setDraftScheduleTime('');
      setActionFeedback('Bot draft saved! Click "Approve Schedule" or "Publish Now" to let WaveLink Support post it.');
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'scheduledBotDrafts');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Approve a Scheduled Bot Draft so it runs automatically on schedule
  const handleApproveBotDraft = async (draft: ScheduledBotDraft) => {
    try {
      await updateDoc(doc(db, 'scheduledBotDrafts', draft.id), {
        status: 'approved',
        approvedBy: currentUser?.email || ADMIN_EMAIL,
        approvedAt: new Date().toISOString()
      });
      setActionFeedback(`Approved "${draft.title}" for scheduled posting by WaveLink Support Bot.`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scheduledBotDrafts/${draft.id}`);
    }
  };

  // Upgrade Feedback Handlers
  const handleUpdateFeedbackStatus = async (id: string, status: UpgradeStatus) => {
    setIsUpdatingFeedback(true);
    try {
      await updateUpgradeFeedbackStatus(id, status);
      await recordAdminAuditLog({
        action: 'upgrade_status_change',
        targetId: id,
        targetLabel: `Upgrade Idea Status -> ${status}`,
        details: `Updated upgrade feedback item status to ${status}`
      });
      setActionFeedback(`Upgrade feedback status updated to "${status}".`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `upgrade_feedback/${id}`);
    } finally {
      setIsUpdatingFeedback(false);
    }
  };

  const handleSaveFeedbackNote = async (id: string) => {
    try {
      await updateUpgradeFeedbackStatus(id, undefined, feedbackNoteText);
      setEditingFeedbackNoteId(null);
      setFeedbackNoteText('');
      setActionFeedback('Implementation note saved to upgrade card.');
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `upgrade_feedback/${id}`);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this upgrade idea?')) return;
    try {
      await deleteDoc(doc(db, 'upgrade_feedback', id));
      setActionFeedback('Upgrade idea removed.');
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `upgrade_feedback/${id}`);
    }
  };

  const handleCreateManualUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    try {
      await recordUpgradeFeedback({
        source: 'user_manual',
        title: manualTitle.trim(),
        summary: manualSummary.trim() || manualTitle.trim(),
        userQuote: manualSummary.trim() || manualTitle.trim(),
        category: manualCategory,
        impact: manualImpact,
        userId: currentUser?.uid,
        userName: currentUser?.displayName || 'Platform Founder',
        userEmail: currentUser?.email || undefined
      });
      setManualTitle('');
      setManualSummary('');
      setShowManualUpgradeModal(false);
      setActionFeedback('💡 New platform upgrade idea recorded into Feedback Inbox!');
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'upgrade_feedback');
    }
  };

  // Publish an Approved/Draft Bot item as WaveLink Support (never using personal admin Gmail)
  const handlePublishBotDraftNow = async (draft: ScheduledBotDraft) => {
    try {
      const nowIso = new Date().toISOString();
      if (draft.type === 'weekly_update') {
        const postId = `bot_weekly_${Date.now()}`;
        await setDoc(doc(db, 'posts', postId), {
          id: postId,
          authorId: SUPPORT_BOT_ID,
          authorEmail: SUPPORT_BOT_EMAIL,
          authorName: SUPPORT_BOT_PROFILE.displayName,
          authorUsername: SUPPORT_BOT_PROFILE.username,
          authorPhotoURL: SUPPORT_BOT_PROFILE.photoURL,
          content: `📢 [Weekly Community Update — ${draft.title}]\n\n${draft.content}\n\n— Automated post by WaveLink Support 🤖`,
          likes: [],
          likesCount: 0,
          reactions: { like: [], heart: [], fire: [] },
          reactionCounts: { like: 0, heart: 0, fire: 0 },
          commentsCount: 0,
          createdAt: nowIso
        });
      } else {
        const sparkId = `bot_spark_${Date.now()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await setDoc(doc(db, 'sparks', sparkId), {
          id: sparkId,
          userId: SUPPORT_BOT_ID,
          userEmail: SUPPORT_BOT_EMAIL,
          userName: SUPPORT_BOT_PROFILE.displayName,
          userPhotoURL: SUPPORT_BOT_PROFILE.photoURL,
          mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=80',
          mediaType: 'image',
          caption: `✨ Spark of the Day: ${draft.title} — ${draft.content}`,
          items: [
            {
              id: `item_${Date.now()}`,
              mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=80',
              mediaType: 'image',
              caption: `✨ Spark of the Day: ${draft.title} — ${draft.content}`,
              createdAt: nowIso
            }
          ],
          createdAt: nowIso,
          expiresAt,
          viewerIds: []
        });
      }

      await updateDoc(doc(db, 'scheduledBotDrafts', draft.id), {
        status: 'posted',
        approvedBy: draft.approvedBy || currentUser?.email || ADMIN_EMAIL,
        postedAt: nowIso
      });
      setActionFeedback(
        `WaveLink Support Bot published ${draft.type === 'weekly_update' ? 'Weekly Community Update' : 'Spark of the Day'}: "${draft.title}"!`
      );
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `scheduledBotDrafts/${draft.id}`);
    }
  };

  // Automatic scheduler: check every 30s if any approved bot draft is due to be published
  useEffect(() => {
    if (!isAdmin || !botConfig.enabled) return;
    const dueDrafts = scheduledDrafts.filter(
      (d) =>
        d.status === 'approved' &&
        d.scheduledFor &&
        new Date(d.scheduledFor).getTime() <= Date.now()
    );
    if (dueDrafts.length > 0) {
      dueDrafts.forEach((d) => {
        handlePublishBotDraftNow(d);
      });
    }
  }, [isAdmin, botConfig.enabled, scheduledDrafts]);

  // Resolve a user/content safety report
  const handleResolveReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'contentReports', reportId), {
        status: 'reviewed'
      });
      setActionFeedback('Safety report marked as resolved.');
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `contentReports/${reportId}`);
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
      await recordAdminAuditLog({
        action: 'verify_user',
        targetId: verif.userId,
        targetLabel: verif.userEmail,
        details: `Approved Mobile Money Txn ${verif.transactionId} (${verif.tierName})`
      });
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
    const reason = 'SMS Transaction ID could not be matched with statement';

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
      await recordAdminAuditLog({
        action: 'verify_user',
        targetId: req.userId,
        targetLabel: req.userEmail,
        details: `Approved Payment Request Txn ${req.transactionId} (${req.plan})`
      });
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
    const reason = 'SMS Transaction ID could not be matched with mobile money statement';

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
  const openReportsCount = contentReports.filter((r) => r.status === 'open').length;
  const newUpgradesCount = upgradeFeedbacks.filter((u) => u.status === 'new').length;

  if (isCheckingServerAdmin) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="bg-white border border-[#EFECE6] rounded-3xl p-8 shadow-sm space-y-3">
          <Loader2 size={28} className="mx-auto text-[#2563EB] animate-spin" />
          <h3 className="text-base font-extrabold text-[#1C1917]">Verifying Admin Clearance...</h3>
          <p className="text-xs text-[#57534E]">Checking server-side administrator credentials.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin || !serverAdminVerified) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="bg-white border border-rose-200 rounded-3xl p-8 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <ShieldAlert size={24} />
          </div>
          <h3 className="text-lg font-extrabold text-[#1C1917]">Administrator Access Required</h3>
          <p className="text-xs sm:text-sm text-[#57534E]">
            This page requires server-verified administrator privileges.
          </p>
          <button
            type="button"
            onClick={onReturnToFeed}
            className="px-5 py-2.5 rounded-2xl bg-[#2563EB] text-white font-bold text-xs hover:bg-[#1D4ED8] transition"
          >
            Return to Feed
          </button>
        </div>
      </div>
    );
  }

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
              ? 'Strict governance desk for member moderation, WaveLink Support Bot automation, audit logs, payment gateway credentials, and WebRTC authorization.'
              : 'Sub-administrative desk for member moderation, user warnings, support tickets, and community oversight.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CrystalBadge
            email={currentUser?.email}
            name={isSuperAdmin ? 'Platform Owner' : (currentUser?.displayName || 'Moderator')}
            role={isSuperAdmin ? 'super_admin' : isSubAdmin ? 'sub_admin' : 'user'}
            size="lg"
            showAdminTag={true}
            isSubAdmin={isSubAdmin}
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex rounded-2xl bg-white border border-[#EFECE6] p-1.5 text-xs font-bold overflow-x-auto shadow-xs gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Users size={15} />
          <span>Activity Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('upgrades')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'upgrades'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Lightbulb size={15} className={newUpgradesCount > 0 ? 'text-amber-300' : ''} />
          <span>AI Upgrades &amp; Ideas {newUpgradesCount > 0 ? `(${newUpgradesCount} new)` : `(${upgradeFeedbacks.length})`}</span>
        </button>

        <button
          onClick={() => setActiveTab('complaints')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'complaints'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Bot size={15} />
          <span>Support &amp; Bot ({openTickets})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'members'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <UserCheck size={15} />
          <span>Banning &amp; Members ({totalUsers})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <ShieldAlert size={15} />
          <span>Audit Log &amp; Reports ({auditLogs.length + openReportsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('updates_group')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'updates_group'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Rss size={15} />
          <span>Admin-Only Updates Group</span>
        </button>

        <button
          onClick={() => setActiveTab('verifications')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'verifications'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <FileCheck size={15} />
          <span>Pro Approvals ({pendingVerificationsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('calls')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'calls'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Video size={15} />
          <span>Calling Controls</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'payments'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Key size={15} />
          <span>Payment Gateways</span>
        </button>

        <button
          onClick={() => setActiveTab('duplicates')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'duplicates'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#57534E] hover:text-[#1C1917]'
          }`}
        >
          <Copy size={15} />
          <span>
            Duplicate Accounts
            {duplicateEmailGroups.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white">
                {duplicateEmailGroups.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {actionFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs px-2 py-1 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab: AI Upgrades & Founder Feedback Inbox */}
      {activeTab === 'upgrades' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-amber-950/20 flex items-center justify-between flex-wrap gap-4 border border-amber-300/30">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-lg bg-white/20 text-white ring-1 ring-white/30 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-2.5">
                  <Lightbulb size={13} />
                  AI Upgrade Intelligence Hub
                </span>
                <span className="text-xs text-amber-100">
                  Direct Line for <span className="font-bold">{ADMIN_EMAIL}</span>
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                AI Upgrades &amp; Feature Feedback
              </h2>
              <p className="text-xs sm:text-sm text-amber-100/90 mt-1">
                Real suggestions, requests, and ideas collected autonomously by AI's Live Talks, WELINK AI Assistant, and WaveLink Support Bot. Review ideas, update their status, and add implementation notes as you ship upgrades!
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowManualUpgradeModal(true)}
                className="px-4 py-2.5 rounded-2xl bg-white text-stone-900 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:bg-amber-50 transition active:scale-95"
              >
                <Sparkles size={16} className="text-amber-600" />
                <span>+ Add Upgrade Idea</span>
              </button>
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                Total Ideas Collected
              </span>
              <div className="text-2xl font-black font-mono text-[#1C1917] mt-1">
                {upgradeFeedbacks.length}
              </div>
              <span className="text-[11px] text-[#2563EB] font-semibold">
                Across all AI sources
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block">
                New / Unreviewed
              </span>
              <div className="text-2xl font-black font-mono text-amber-900 mt-1">
                {upgradeFeedbacks.filter((u) => u.status === 'new').length}
              </div>
              <span className="text-[11px] text-amber-700 font-semibold">
                Awaiting review
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200/80 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800 block">
                Planned Updates
              </span>
              <div className="text-2xl font-black font-mono text-purple-900 mt-1">
                {upgradeFeedbacks.filter((u) => u.status === 'planned').length}
              </div>
              <span className="text-[11px] text-purple-700 font-semibold">
                In founder roadmap
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                Shipped &amp; Implemented
              </span>
              <div className="text-2xl font-black font-mono text-emerald-900 mt-1">
                {upgradeFeedbacks.filter((u) => u.status === 'implemented').length}
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold">
                Active in WaveLink
              </span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {(['all', 'new', 'planned', 'implemented', 'archived'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFeedbackStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition whitespace-nowrap ${
                      feedbackStatusFilter === st
                        ? 'bg-[#1C1917] text-white'
                        : 'bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {st === 'all'
                      ? `All (${upgradeFeedbacks.length})`
                      : st === 'new'
                      ? `New (${upgradeFeedbacks.filter((u) => u.status === 'new').length})`
                      : st === 'planned'
                      ? `Planned (${upgradeFeedbacks.filter((u) => u.status === 'planned').length})`
                      : st === 'implemented'
                      ? `Implemented (${upgradeFeedbacks.filter((u) => u.status === 'implemented').length})`
                      : `Archived (${upgradeFeedbacks.filter((u) => u.status === 'archived').length})`}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  value={feedbackSearch}
                  onChange={(e) => setFeedbackSearch(e.target.value)}
                  placeholder="Search upgrades..."
                  className="w-full px-3 py-1.5 rounded-xl bg-[#FAF7F2] border border-[#EFECE6] text-xs text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {feedbackSearch && (
                  <button
                    type="button"
                    onClick={() => setFeedbackSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Source Filter */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#EFECE6] text-xs">
              <span className="text-[#57534E] font-semibold flex items-center gap-1">
                <Filter size={13} />
                Source:
              </span>
              {(['all', 'welink_ai', 'live_talk', 'support_bot', 'user_manual'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setFeedbackSourceFilter(src)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    feedbackSourceFilter === src
                      ? 'bg-amber-100 text-amber-900 font-bold'
                      : 'text-[#57534E] hover:bg-stone-100'
                  }`}
                >
                  {src === 'all'
                    ? 'All Sources'
                    : src === 'welink_ai'
                    ? '🤖 WELINK AI'
                    : src === 'live_talk'
                    ? '🎙️ Live Talk'
                    : src === 'support_bot'
                    ? '💬 Support Bot'
                    : '✍️ Founder Note'}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Cards List */}
          <div className="space-y-3">
            {upgradeFeedbacks
              .filter((item) => {
                if (feedbackStatusFilter !== 'all' && item.status !== feedbackStatusFilter) return false;
                if (feedbackSourceFilter !== 'all' && item.source !== feedbackSourceFilter) return false;
                if (feedbackCategoryFilter !== 'all' && item.category !== feedbackCategoryFilter) return false;
                if (feedbackSearch.trim()) {
                  const q = feedbackSearch.toLowerCase();
                  const matchTitle = item.title.toLowerCase().includes(q);
                  const matchSummary = item.summary.toLowerCase().includes(q);
                  const matchQuote = item.userQuote?.toLowerCase().includes(q);
                  const matchUser = item.userName?.toLowerCase().includes(q);
                  if (!matchTitle && !matchSummary && !matchQuote && !matchUser) return false;
                }
                return true;
              })
              .map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-[#EFECE6] rounded-3xl p-5 shadow-xs space-y-4 hover:border-amber-300 transition"
                >
                  {/* Card Top: Badges and Source */}
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                          item.status === 'new'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : item.status === 'planned'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : item.status === 'implemented'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-100 text-stone-700 border border-stone-200'
                        }`}
                      >
                        ● {item.status}
                      </span>

                      {/* Source Tag */}
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#FAF7F2] border border-[#EFECE6] text-[#57534E] flex items-center gap-1">
                        {item.source === 'live_talk' && '🎙️ Live Voice / Talk'}
                        {item.source === 'welink_ai' && '🤖 WELINK AI Chat'}
                        {item.source === 'support_bot' && '💬 Support Bot DM'}
                        {item.source === 'user_manual' && '✍️ Founder Idea'}
                      </span>

                      {/* Category Tag */}
                      <span className="text-[11px] font-semibold text-[#0D9488] bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200">
                        {item.category}
                      </span>

                      {/* Impact Tag */}
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                          item.impact === 'high'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : item.impact === 'medium'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-stone-50 text-stone-700'
                        }`}
                      >
                        {item.impact === 'high' ? '🔥 High Impact' : item.impact === 'medium' ? '⚡ Medium' : '💡 Polish'}
                      </span>
                    </div>

                    <div className="text-right text-[11px] text-[#78716C]">
                      {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Title & Summary */}
                  <div>
                    <h3 className="text-base font-extrabold text-[#1C1917] tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#57534E] mt-1 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>

                  {/* Original User Quote / Prompt */}
                  {item.userQuote && (
                    <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-xs text-[#57534E] italic">
                      <div className="text-[10px] font-bold uppercase text-[#78716C] not-italic mb-1">
                        User Prompt / Voice Transcript from {item.userName || 'Member'}:
                      </div>
                      &ldquo;{item.userQuote}&rdquo;
                    </div>
                  )}

                  {/* Implementation Notes by Founder */}
                  {item.notes && editingFeedbackNoteId !== item.id && (
                    <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
                      <div className="text-[10px] font-extrabold uppercase text-amber-800 mb-0.5">
                        📌 Founder Implementation Notes:
                      </div>
                      {item.notes}
                    </div>
                  )}

                  {/* Inline Note Editor */}
                  {editingFeedbackNoteId === item.id && (
                    <div className="space-y-2 p-3 bg-amber-50/70 rounded-2xl border border-amber-200">
                      <label className="text-[11px] font-bold text-amber-900 block">
                        Implementation Notes &amp; Action Plan:
                      </label>
                      <textarea
                        rows={2}
                        value={feedbackNoteText}
                        onChange={(e) => setFeedbackNoteText(e.target.value)}
                        placeholder="e.g. Added background video upload queue with progress bar; shipped in v2.4"
                        className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFeedbackNoteId(null);
                            setFeedbackNoteText('');
                          }}
                          className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveFeedbackNote(item.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#EFECE6] text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-[#78716C] font-semibold">
                        Change Status:
                      </span>
                      {item.status !== 'new' && (
                        <button
                          type="button"
                          disabled={isUpdatingFeedback}
                          onClick={() => handleUpdateFeedbackStatus(item.id, 'new')}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition"
                        >
                          Mark New
                        </button>
                      )}
                      {item.status !== 'planned' && (
                        <button
                          type="button"
                          disabled={isUpdatingFeedback}
                          onClick={() => handleUpdateFeedbackStatus(item.id, 'planned')}
                          className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold transition"
                        >
                          📌 Plan for Release
                        </button>
                      )}
                      {item.status !== 'implemented' && (
                        <button
                          type="button"
                          disabled={isUpdatingFeedback}
                          onClick={() => handleUpdateFeedbackStatus(item.id, 'implemented')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold transition"
                        >
                          ✅ Mark Implemented
                        </button>
                      )}
                      {item.status !== 'archived' && (
                        <button
                          type="button"
                          disabled={isUpdatingFeedback}
                          onClick={() => handleUpdateFeedbackStatus(item.id, 'archived')}
                          className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold transition"
                        >
                          Archive
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFeedbackNoteId(item.id);
                          setFeedbackNoteText(item.notes || '');
                        }}
                        className="text-xs font-bold text-[#2563EB] hover:underline"
                      >
                        {item.notes ? 'Edit Note' : '+ Add Note'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFeedback(item.id)}
                        className="text-stone-400 hover:text-rose-600 transition p-1"
                        title="Delete this idea"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

            {upgradeFeedbacks.length === 0 && (
              <div className="p-12 text-center bg-white border border-[#EFECE6] rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
                  <Lightbulb size={24} />
                </div>
                <h3 className="font-extrabold text-base text-[#1C1917]">
                  No Upgrade Ideas in Feedback Inbox Yet
                </h3>
                <p className="text-xs text-[#57534E] max-w-md mx-auto">
                  When members talk to WELINK AI, speak in Live Talks voice mode, or ask questions to WaveLink Support Bot, platform upgrade ideas and feature suggestions will appear here automatically!
                </p>
                <button
                  type="button"
                  onClick={() => setShowManualUpgradeModal(true)}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition"
                >
                  + Add Your First Upgrade Idea
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Support Section (Tickets, WaveLink Support Bot Switch, Scheduled Bot Posts, Bot Conversation Logs) */}
      {activeTab === 'complaints' && (
        <div className="space-y-6">
          {/* 1. WaveLink Support Bot Master Control & Daily Gemini Quota Card */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[#EFECE6] pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200 flex items-center justify-center shrink-0">
                  <Bot size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CrystalBadge
                      email={SUPPORT_BOT_EMAIL}
                      name={SUPPORT_BOT_PROFILE.displayName}
                      isBot={true}
                      size="md"
                    />
                    <span className="text-xs font-mono text-[#57534E]">
                      ({SUPPORT_BOT_EMAIL} • Zero Admin Powers)
                    </span>
                  </div>
                  <p className="text-xs text-[#57534E] mt-1 max-w-2xl">
                    Dedicated automated support assistant in English &amp; Swahili. Answers questions about Sparks, Reels, chats, Pro, themes, payments &amp; safety, and automatically creates escalated tickets for human follow-up.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                    Bot Status
                  </span>
                  <span
                    className={`text-xs font-extrabold ${
                      botConfig.enabled ? 'text-[#0D9488]' : 'text-rose-600'
                    }`}
                  >
                    {botConfig.enabled ? 'ACTIVE (Answering DMs)' : 'PAUSED (Human Queue Only)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSupportBot}
                  className={`px-4 py-2.5 rounded-2xl font-extrabold text-xs flex items-center gap-2 transition shadow-xs ${
                    botConfig.enabled
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-[#0D9488] hover:bg-teal-700 text-white'
                  }`}
                >
                  <Power size={15} />
                  <span>{botConfig.enabled ? 'Turn Bot OFF' : 'Turn Bot ON'}</span>
                </button>
              </div>
            </div>

            {/* Credit Protection & Rate Limit Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                  Daily Gemini Credit Cap
                </span>
                <div className="text-lg font-black font-mono text-[#1C1917] mt-1">
                  {botConfig.dailyGeminiUsed || 0} / {botConfig.dailyGeminiCap || 250} replies
                </div>
                <span className="text-[11px] text-[#0D9488] font-semibold">
                  Credits protected • Auto-falls back to KB when full
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                  Per-User Rate &amp; Length Limits
                </span>
                <div className="text-lg font-black font-mono text-[#1C1917] mt-1">
                  {botConfig.userRateLimitPerMinute || 8} msgs / min • Max {botConfig.maxMessageLength || 600} chars
                </div>
                <span className="text-[11px] text-[#57534E]">
                  Strict anti-abuse &amp; prompt-injection guard
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                  Logged Bot Replies &amp; Reports
                </span>
                <div className="text-lg font-black font-mono text-[#1C1917] mt-1">
                  {botLogs.length} logged • {botLogs.filter((l) => l.reportedBadReply).length} reported
                </div>
                <span className="text-[11px] text-[#57534E]">
                  Every bot reply is audited below
                </span>
              </div>
            </div>
          </div>

          {/* 2. Scheduled Bot Posts (Weekly Community Update & Spark of the Day) */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-6 shadow-xs space-y-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Flame size={13} />
                <span>Scheduled Bot Publishing</span>
              </span>
              <h3 className="text-lg font-extrabold text-[#1C1917]">
                Weekly Community Update &amp; Spark of the Day Drafts
              </h3>
              <p className="text-xs text-[#57534E] mt-0.5">
                Create and approve drafts for <strong>WaveLink Support</strong> to post on a schedule. Never uses your personal admin account.
              </p>
            </div>

            <form onSubmit={handleCreateBotDraft} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-[#1C1917] mb-1">Post Type</label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as 'weekly_update' | 'spark_of_the_day')}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#D6D3CD] text-xs font-bold text-[#1C1917]"
                >
                  <option value="weekly_update">📢 Weekly Community Update</option>
                  <option value="spark_of_the_day">✨ Spark of the Day (24h)</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] font-bold text-[#1C1917] mb-1">Headline / Title</label>
                <input
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Friday Creator Spotlight & Tips"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                />
              </div>

              <div className="md:col-span-5">
                <label className="block text-[11px] font-bold text-[#1C1917] mb-1">Schedule Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={draftScheduleTime}
                  onChange={(e) => setDraftScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                />
              </div>

              <div className="md:col-span-9">
                <input
                  type="text"
                  required
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Write the community update or Spark of the Day message (English / Swahili)..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={isSavingDraft || !draftTitle.trim() || !draftContent.trim()}
                  className="w-full h-full min-h-[38px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>Save Draft</span>
                </button>
              </div>
            </form>

            {scheduledDrafts.length > 0 && (
              <div className="space-y-2.5">
                {scheduledDrafts.slice(0, 8).map((draft) => (
                  <div
                    key={draft.id}
                    className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-50 text-[#0D9488] border border-teal-200">
                          {draft.type === 'weekly_update' ? 'Weekly Update' : 'Spark of the Day'}
                        </span>
                        <span className="font-extrabold text-xs text-[#1C1917]">{draft.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            draft.status === 'posted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : draft.status === 'approved'
                              ? 'bg-blue-100 text-[#2563EB]'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {draft.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#57534E] mt-1 line-clamp-2">{draft.content}</p>
                      <span className="text-[10px] text-[#78716C] block mt-0.5">
                        Scheduled: {new Date(draft.scheduledFor).toLocaleString()}
                        {draft.approvedBy ? ` • Approved by ${draft.approvedBy}` : ''}
                      </span>
                    </div>

                    {draft.status !== 'posted' && (
                      <div className="flex items-center gap-2 shrink-0">
                        {draft.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleApproveBotDraft(draft)}
                            className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 text-xs font-bold transition"
                          >
                            Approve Schedule
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePublishBotDraftNow(draft)}
                          className="px-3 py-1.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1"
                        >
                          <Send size={12} />
                          <span>Publish Now</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Support Tickets & One-Tap Reply Inbox */}
          <SupportDeskView />

          {/* 4. Logged Bot Conversations & Reported Bad Replies */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-extrabold text-[#1C1917] flex items-center gap-2">
                  <Bot size={18} className="text-[#0D9488]" />
                  <span>WaveLink Support Bot Conversation Audit Log ({botLogs.length})</span>
                </h3>
                <p className="text-xs text-[#57534E]">
                  Every automated bot answer is logged here for quality review. User-reported bad replies are highlighted in rose.
                </p>
              </div>
            </div>

            {botLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#57534E]">
                No bot conversations recorded yet. Send a message to WaveLink Support in Direct Messages to test!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {botLogs.slice(0, 30).map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                      log.reportedBadReply
                        ? 'bg-rose-50/70 border-rose-300'
                        : log.escalatedToTicketId
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-[#FAF7F2] border-[#EFECE6]'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1C1917]">{log.userName || log.userEmail}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white border border-[#EFECE6] text-[#57534E]">
                          {log.language === 'sw' ? 'Swahili' : 'English'}
                        </span>
                        {log.escalatedToTicketId && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Escalated to Ticket ({log.escalatedToTicketId})
                          </span>
                        )}
                        {log.reportedBadReply && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                            ⚠️ Reported Bad Reply {log.reportReason ? `(${log.reportReason})` : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-[#78716C]">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[#57534E]">
                      <strong className="text-[#1C1917]">User:</strong> {log.userMessage}
                    </div>
                    <div className="text-[#0D9488] font-medium">
                      <strong className="text-[#1C1917]">Bot Reply:</strong> {log.botReply}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Admin Audit Log & Content Safety Reports */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Content & User Safety Reports */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-extrabold text-[#1C1917] flex items-center gap-2">
                  <Flag size={18} className="text-rose-600" />
                  <span>User, Post &amp; Bot Safety Reports ({contentReports.length})</span>
                </h3>
                <p className="text-xs text-[#57534E]">
                  Reports submitted by community members on posts, user profiles, or bot replies.
                </p>
              </div>
            </div>

            {contentReports.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#57534E]">
                No safety reports pending.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {contentReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between gap-4 flex-wrap text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800">
                          {rep.targetType}
                        </span>
                        <span className="font-bold text-[#1C1917]">
                          Target: {rep.targetSummary || rep.targetId}
                        </span>
                        <span className="text-[11px] text-[#78716C]">
                          • Reported by {rep.reporterEmail || rep.reporterId}
                        </span>
                      </div>
                      <p className="text-[#57534E]">Reason: {rep.reason}</p>
                      <span className="text-[10px] font-mono text-[#78716C] block">
                        {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {rep.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => handleResolveReport(rep.id)}
                        className="px-3 py-1.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-bold text-xs transition"
                      >
                        Mark Resolved
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Resolved
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Immutable Admin Audit Log */}
          <div className="bg-white border border-[#EFECE6] rounded-3xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-[#1C1917] flex items-center gap-2">
                <FileText size={18} className="text-[#2563EB]" />
                <span>Security &amp; Admin Audit Log ({auditLogs.length})</span>
              </h3>
              <p className="text-xs text-[#57534E]">
                Permanent security record of bans, unbans, role changes, verifications, account deletions, and bot state changes.
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#57534E]">
                No administrative audit events recorded yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {auditLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] flex items-center justify-between gap-3 flex-wrap text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-50 text-[#2563EB] border border-blue-200">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        <span className="font-bold text-[#1C1917]">{entry.details}</span>
                      </div>
                      <span className="text-[11px] text-[#78716C] block">
                        Actor: <strong className="font-mono">{entry.actorEmail}</strong>
                        {entry.targetLabel ? ` → Target: ${entry.targetLabel}` : ''}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#78716C]">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Admin-Only Updates Group */}
      {activeTab === 'updates_group' && <AnnouncementsView />}

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
                  1-Click approval queue for user payments sent to <strong>WaveLink</strong>. Approving instantly grants <strong>user.isPro = true</strong>, adds the Verified Blue Star Pro badge, and strips all ads across their account.
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
                  const isTargetSuperAdmin = user.role === 'super_admin';
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

      {/* Tab: Duplicate Accounts Manager */}
      {activeTab === 'duplicates' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-950/20 flex items-center justify-between flex-wrap gap-4 border border-blue-400/30">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-lg bg-white/20 text-white ring-1 ring-white/30 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-2.5">
                  <Copy size={13} />
                  Duplicate Accounts Tool
                </span>
                <span className="text-xs text-blue-100">
                  Target: Single profile per user • Main Owner: <span className="font-bold font-mono">@keylan</span>
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Duplicate Accounts &amp; Profile Merger
              </h2>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1">
                Lists profiles sharing the same email address. Merging moves all posts, followers, points, appearance themes, and Pro status into the main profile (<span className="font-bold underline">@keylan</span> is always prioritized as the main owner profile). The duplicate is disabled and its data is safely preserved for 30 days in case restoration is needed. No data is ever deleted automatically.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 text-white text-xs font-bold flex items-center gap-2">
                <Clock size={16} className="text-emerald-300" />
                <span>30-Day Safe Retention Policy</span>
              </div>
            </div>
          </div>

          {/* Success Message Banner */}
          {mergeSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>{mergeSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setMergeSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-950 text-xs px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>
          )}

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                Duplicate Email Groups
              </span>
              <div className="text-2xl font-black font-mono text-[#1C1917] mt-1">
                {duplicateEmailGroups.length}
              </div>
              <span className="text-[11px] text-[#78716C] mt-0.5 block">
                Emails with 2+ profiles
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                Total Duplicate Profiles
              </span>
              <div className="text-2xl font-black font-mono text-[#1C1917] mt-1">
                {duplicateEmailGroups.reduce((acc: number, g: { profiles: UserProfile[] }) => acc + g.profiles.length, 0)}
              </div>
              <span className="text-[11px] text-[#78716C] mt-0.5 block">
                Across all detected groups
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                Main Owner Profile
              </span>
              <div className="text-lg font-black font-mono text-emerald-600 mt-1 flex items-center gap-1.5">
                <Crown size={16} />
                <span>@keylan</span>
              </div>
              <span className="text-[11px] text-[#78716C] mt-0.5 block">
                Owner role set by server only
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#57534E] block">
                Data Preservation
              </span>
              <div className="text-lg font-black text-indigo-600 mt-1 flex items-center gap-1.5">
                <ShieldAlert size={16} />
                <span>Zero Data Deletion</span>
              </div>
              <span className="text-[11px] text-[#78716C] mt-0.5 block">
                30-day retention on merge
              </span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="p-4 rounded-2xl bg-white border border-[#EFECE6] shadow-xs flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Filter size={16} className="text-gray-400" />
              <input
                type="text"
                value={duplicateSearchTerm}
                onChange={(e) => setDuplicateSearchTerm(e.target.value)}
                placeholder="Search duplicate email address or username..."
                className="w-full text-xs sm:text-sm bg-transparent border-none focus:outline-none text-[#1C1917] placeholder:text-gray-400"
              />
            </div>
            {duplicateSearchTerm && (
              <button
                type="button"
                onClick={() => setDuplicateSearchTerm('')}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Clear
              </button>
            )}
          </div>

          {/* Groups List */}
          {duplicateEmailGroups.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white border border-[#EFECE6] shadow-xs space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-[#1C1917]">
                No Duplicate Accounts Found
              </h3>
              <p className="text-xs sm:text-sm text-[#78716C] max-w-md mx-auto">
                Every registered email in WaveLink currently belongs to a single canonical profile. Server-side unique username and unique email enforcement is active.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {duplicateEmailGroups
                .filter(
                  (group: { email: string; profiles: UserProfile[]; isOwnerGroup: boolean }) =>
                    !duplicateSearchTerm ||
                    group.email.toLowerCase().includes(duplicateSearchTerm.toLowerCase()) ||
                    group.profiles.some(
                      (p: UserProfile) =>
                        p.username?.toLowerCase().includes(duplicateSearchTerm.toLowerCase()) ||
                        p.displayName?.toLowerCase().includes(duplicateSearchTerm.toLowerCase())
                    )
                )
                .map((group: { email: string; profiles: UserProfile[]; isOwnerGroup: boolean }) => {
                  const mainProfile = group.profiles[0];
                  const duplicateProfiles = group.profiles.slice(1);

                  return (
                    <div
                      key={group.email}
                      className="p-5 sm:p-6 rounded-3xl bg-white border border-[#EFECE6] shadow-sm space-y-4"
                    >
                      {/* Group Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                            <Mail size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm sm:text-base text-[#1C1917]">
                                {group.email}
                              </span>
                              {group.isOwnerGroup && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                  <Crown size={11} className="text-amber-600" />
                                  Platform Owner
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-[#78716C]">
                              {group.profiles.length} profiles linked to this email address
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-stone-100 text-stone-700">
                          {group.profiles.filter((p: UserProfile) => p.isDuplicateDisabled).length > 0
                            ? 'Partially Merged'
                            : 'Requires Merge'}
                        </span>
                      </div>

                      {/* Side-by-side or stacked account list */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Main Profile Card */}
                        <div className="p-4 rounded-2xl bg-emerald-50/60 border-2 border-emerald-400 space-y-3 relative overflow-hidden">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                              <CheckCircle2 size={12} />
                              Main Profile {group.isOwnerGroup && '(Main Owner @keylan)'}
                            </span>
                            <span className="text-[11px] font-mono text-emerald-800 font-bold">
                              UID: {mainProfile.id.slice(0, 12)}...
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <img
                              src={
                                mainProfile.photoURL ||
                                `https://api.dicebear.com/7.x/shapes/svg?seed=${mainProfile.id}`
                              }
                              alt={mainProfile.displayName}
                              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-emerald-300"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-extrabold text-sm text-[#1C1917] truncate">
                                  {mainProfile.displayName}
                                </h4>
                                <span className="font-mono text-xs font-bold text-emerald-700">
                                  {mainProfile.username || '@waver'}
                                </span>
                                {mainProfile.role === 'admin' && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-white">
                                    Admin
                                  </span>
                                )}
                                {mainProfile.isPro && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-600 text-white">
                                    PRO
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-stone-600 truncate mt-0.5">
                                {mainProfile.bio || 'Connecting on WaveLink 🌊'}
                              </p>
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/60 text-center">
                            <div className="p-2 rounded-xl bg-white/70">
                              <span className="text-[10px] font-bold text-stone-500 block">Posts</span>
                              <span className="text-xs font-black font-mono text-stone-900">
                                {posts.filter((p) => p.authorId === mainProfile.id).length}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/70">
                              <span className="text-[10px] font-bold text-stone-500 block">Points</span>
                              <span className="text-xs font-black font-mono text-emerald-700">
                                {mainProfile.points ?? mainProfile.wavePoints ?? 0}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/70">
                              <span className="text-[10px] font-bold text-stone-500 block">Theme</span>
                              <span className="text-[11px] font-bold text-stone-800 capitalize truncate block">
                                {mainProfile.appearanceTheme || 'Default'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Duplicate Profile(s) Card */}
                        <div className="space-y-3">
                          {duplicateProfiles.map((dup: UserProfile) => {
                            const dupPostsCount = posts.filter((p) => p.authorId === dup.id).length;
                            const isAlreadyMerged = Boolean(dup.isDuplicateDisabled || dup.mergedIntoUid);

                            return (
                              <div
                                key={dup.id}
                                className={`p-4 rounded-2xl border space-y-3 relative ${
                                  isAlreadyMerged
                                    ? 'bg-stone-50 border-stone-200 opacity-80'
                                    : 'bg-rose-50/50 border-rose-200'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${
                                      isAlreadyMerged
                                        ? 'bg-stone-200 text-stone-700'
                                        : 'bg-rose-600 text-white'
                                    }`}
                                  >
                                    {isAlreadyMerged
                                      ? 'Disabled & Preserved (30 Days)'
                                      : 'Duplicate Profile'}
                                  </span>
                                  <span className="text-[11px] font-mono text-stone-500">
                                    UID: {dup.id.slice(0, 12)}...
                                  </span>
                                </div>

                                <div className="flex items-center gap-3">
                                  <img
                                    src={
                                      dup.photoURL ||
                                      `https://api.dicebear.com/7.x/shapes/svg?seed=${dup.id}`
                                    }
                                    alt={dup.displayName}
                                    className="w-10 h-10 rounded-2xl object-cover ring-1 ring-stone-300"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h4 className="font-bold text-xs sm:text-sm text-[#1C1917] truncate">
                                        {dup.displayName}
                                      </h4>
                                      <span className="font-mono text-xs font-semibold text-stone-600">
                                        {dup.username || '@waver'}
                                      </span>
                                      {dup.isPro && (
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-600 text-white">
                                          PRO
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-stone-500 truncate">
                                      {dup.bio || 'Connecting on WaveLink 🌊'}
                                    </p>
                                  </div>
                                </div>

                                {/* Stats & Action */}
                                <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-xs">
                                  <div className="flex items-center gap-3 text-stone-600 font-mono text-[11px]">
                                    <span>
                                      <strong className="text-stone-900">{dupPostsCount}</strong> posts
                                    </span>
                                    <span>•</span>
                                    <span>
                                      <strong className="text-stone-900">
                                        {dup.points ?? dup.wavePoints ?? 0}
                                      </strong>{' '}
                                      pts
                                    </span>
                                  </div>

                                  {isAlreadyMerged ? (
                                    <span className="text-[11px] font-semibold text-stone-500 flex items-center gap-1">
                                      <CheckCircle2 size={13} className="text-emerald-600" />
                                      Merged into main profile
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMergeModalGroup({
                                          email: group.email,
                                          mainProfile,
                                          duplicateProfile: dup
                                        })
                                      }
                                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                    >
                                      <Copy size={13} />
                                      <span>Merge into Main</span>
                                    </button>
                                  )}
                                </div>

                                {dup.keptUntil && (
                                  <div className="text-[10px] text-stone-400 font-mono mt-1">
                                    Preserved until: {new Date(dup.keptUntil).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Step Modal for Merge */}
      {mergeModalGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-stone-200 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Copy size={20} />
                <h3 className="font-extrabold text-stone-900 text-base">
                  Confirm Account Merge
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMergeModalGroup(null)}
                disabled={isMerging}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <ShieldAlert size={14} />
                Safety Guarantee: Zero Automatic Data Deletion
              </div>
              <p>
                When merged, all posts, followers, points, themes, and Pro status will be copied into the main profile. The duplicate profile will be safely disabled and its data retained for 30 days in case restoration is needed.
              </p>
            </div>

            {/* Comparison Details */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                <span className="font-bold text-emerald-800 block text-[11px] uppercase tracking-wider mb-1">
                  1. Target Main Profile (Will Receive Data):
                </span>
                <div className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
                  <span>{mergeModalGroup.mainProfile.displayName}</span>
                  <span className="font-mono text-emerald-700">
                    {mergeModalGroup.mainProfile.username}
                  </span>
                  {mergeModalGroup.mainProfile.username === '@keylan' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
                      Platform Owner
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-stone-500 block mt-0.5">
                  UID: {mergeModalGroup.mainProfile.id}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200">
                <span className="font-bold text-rose-800 block text-[11px] uppercase tracking-wider mb-1">
                  2. Duplicate Profile (To Be Merged &amp; Disabled):
                </span>
                <div className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
                  <span>{mergeModalGroup.duplicateProfile.displayName}</span>
                  <span className="font-mono text-rose-700">
                    {mergeModalGroup.duplicateProfile.username}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-stone-500 block mt-0.5">
                  UID: {mergeModalGroup.duplicateProfile.id}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5 text-[11px]">
                <span className="font-bold text-stone-700 block">Actions to be performed:</span>
                <ul className="space-y-1 list-disc list-inside text-stone-600">
                  <li>
                    <strong>
                      {posts.filter((p) => p.authorId === mergeModalGroup.duplicateProfile.id).length} posts
                    </strong>{' '}
                    will be reassigned to {mergeModalGroup.mainProfile.username}
                  </li>
                  <li>
                    <strong>
                      +{Number(mergeModalGroup.duplicateProfile.points) || Number(mergeModalGroup.duplicateProfile.wavePoints) || 0} points
                    </strong>{' '}
                    transferred into {mergeModalGroup.mainProfile.username}'s point balance
                  </li>
                  <li>
                    Pro subscription status &amp; badge preserved on main profile
                  </li>
                  <li>
                    Duplicate account disabled and preserved for <strong>30 days</strong>
                  </li>
                  <li>
                    <strong>No data will be deleted automatically</strong>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setMergeModalGroup(null)}
                disabled={isMerging}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMerge}
                disabled={isMerging}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isMerging ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Merging Accounts...</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Confirm &amp; Merge Accounts</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
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

      {/* Modal: Add Manual Upgrade Idea */}
      {showManualUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <form
            onSubmit={handleCreateManualUpgrade}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-[#EFECE6]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700">
                <Lightbulb size={20} />
                <h3 className="font-extrabold text-base text-stone-900">
                  Record Platform Upgrade Idea
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualUpgradeModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Upgrade Title:
              </label>
              <input
                type="text"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Group Video Calling with Screen Share"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Category:
                </label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value as UpgradeCategory)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-900"
                >
                  <option value="features">Features</option>
                  <option value="ui_ux">UI / UX Design</option>
                  <option value="media_sparks">Media &amp; Sparks</option>
                  <option value="video_calls">Video Calls &amp; Audio</option>
                  <option value="performance">Speed &amp; Performance</option>
                  <option value="monetization">Pro &amp; Monetization</option>
                  <option value="other">General Idea</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Impact Rating:
                </label>
                <select
                  value={manualImpact}
                  onChange={(e) => setManualImpact(e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-900"
                >
                  <option value="high">High Impact 🔥</option>
                  <option value="medium">Medium Impact ⚡</option>
                  <option value="low">Polish / Nice to have 💡</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Idea Summary &amp; Implementation Plan:
              </label>
              <textarea
                rows={3}
                value={manualSummary}
                onChange={(e) => setManualSummary(e.target.value)}
                placeholder="Describe how this feature should work and what value it brings to WaveLink creators..."
                className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowManualUpgradeModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!manualTitle.trim()}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50"
              >
                Save to Feedback Inbox
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
