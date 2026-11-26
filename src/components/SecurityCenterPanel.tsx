import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Laptop,
  LogOut,
  KeyRound,
  Mail,
  Download,
  Trash2,
  Lock,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  BellRing,
  UserCheck,
  QrCode,
  ShieldOff
} from 'lucide-react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  TotpSecret,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type MultiFactorInfo
} from 'firebase/auth';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import {
  auth,
  getAuthHeaders,
  detectClientDeviceMetadata,
  getClientDeviceId,
  formatFirebaseMfaError
} from '../firebase';
import { ActiveSessionDoc, UserPrivacySettings } from '../types';
import { sanitizeUserFacingError } from '../utils/safetyFilters';

interface SecurityCenterPanelProps {
  onOpenPasswordSection?: () => void;
  onOpenDeleteAccountSection?: () => void;
}

export const SecurityCenterPanel: React.FC<SecurityCenterPanelProps> = ({
  onOpenPasswordSection,
  onOpenDeleteAccountSection
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    updateUserProfile,
    sendVerificationEmail,
    deleteMyAccount,
    showGlobalToast
  } = useAuth();

  const language = userProfile?.language === 'sw' ? 'sw' : 'en';
  const currentDeviceId = getClientDeviceId();

  // Active Sessions state
  const [sessions, setSessions] = useState<ActiveSessionDoc[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [isTriggeringNotMe, setIsTriggeringNotMe] = useState(false);
  const [isSimulatingNewDevice, setIsSimulatingNewDevice] = useState(false);

  // Firebase Built-In TOTP Multi-Factor Authentication (read strictly from Firebase Auth enrolledFactors)
  const [enrolledFactors, setEnrolledFactors] = useState<MultiFactorInfo[]>(() =>
    auth.currentUser ? [...multiFactor(auth.currentUser).enrolledFactors] : []
  );
  const [mfaStep, setMfaStep] = useState<
    'idle' | 'verify_email' | 'reauth_enable' | 'scan_qr' | 'confirm_disable'
  >('idle');
  const [reauthPassword, setReauthPassword] = useState('');
  const [showReauthPassword, setShowReauthPassword] = useState(false);
  const [isProcessingMfa, setIsProcessingMfa] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  const [copiedSecretKey, setCopiedSecretKey] = useState(false);
  const [mfaDigits, setMfaDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmDisableChecked, setConfirmDisableChecked] = useState(false);
  const otpInputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  // Data Export & Account Deletion state
  const [isExportingData, setIsExportingData] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Status banner inside Security Center
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  const syncEnrolledFactors = useCallback(() => {
    const active = auth.currentUser;
    if (!active) {
      setEnrolledFactors([]);
      return [];
    }
    const factors = [...multiFactor(active).enrolledFactors];
    setEnrolledFactors(factors);
    return factors;
  }, []);

  useEffect(() => {
    syncEnrolledFactors();
  }, [currentUser?.uid, currentUser?.emailVerified, syncEnrolledFactors]);

  const loadActiveSessions = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingSessions(true);
    try {
      const headers = await getAuthHeaders();
      const meta = detectClientDeviceMetadata();
      // Ensure current session is registered first
      await fetch('/api/security/sessions/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...meta,
          username: userProfile?.username || undefined
        })
      }).catch(() => {});

      const resp = await fetch('/api/security/sessions', {
        method: 'GET',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      } else {
        setSessions([
          {
            id: meta.deviceId,
            deviceId: meta.deviceId,
            deviceName: meta.deviceName,
            platform: meta.platform,
            browser: meta.browser,
            ipHint: 'Current Network',
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            isCurrent: true
          }
        ]);
      }
    } catch {
      const meta = detectClientDeviceMetadata();
      setSessions([
        {
          id: meta.deviceId,
          deviceId: meta.deviceId,
          deviceName: meta.deviceName,
          platform: meta.platform,
          browser: meta.browser,
          ipHint: 'Current Network',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          isCurrent: true
        }
      ]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadActiveSessions();
  }, [loadActiveSessions]);

  // Privacy quick settings state synced with userProfile
  const currentPrivacy: UserPrivacySettings = {
    profileVisibility: userProfile?.privacySettings?.profileVisibility || 'public',
    showOnlineStatus: userProfile?.privacySettings?.showOnlineStatus ?? true,
    showLastSeen: userProfile?.privacySettings?.showLastSeen ?? true,
    onlineStatusAudience: userProfile?.privacySettings?.onlineStatusAudience || 'everyone',
    allowDirectMessages: userProfile?.privacySettings?.allowDirectMessages || 'everyone',
    allowCalls: userProfile?.privacySettings?.allowCalls || 'everyone',
    whoCanFollow: userProfile?.privacySettings?.whoCanFollow || 'everyone',
    showReadReceipts: userProfile?.privacySettings?.showReadReceipts ?? true,
    allowSearchByEmail: userProfile?.privacySettings?.allowSearchByEmail ?? true,
    sparkVisibility: userProfile?.privacySettings?.sparkVisibility || 'everyone',
    updatedAt: userProfile?.privacySettings?.updatedAt || new Date().toISOString()
  };

  const handleQuickPrivacyChange = async (patch: Partial<UserPrivacySettings>) => {
    const updated: UserPrivacySettings = {
      ...currentPrivacy,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    try {
      await updateUserProfile({ privacySettings: updated });
      showGlobalToast(
        language === 'sw' ? 'Mipangilio ya faragha imehifadhiwa!' : 'Privacy preference updated!'
      );
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not update privacy preference.')
      });
    }
  };

  // Security Health Checks Calculation (MFA status read strictly from Firebase Auth enrolledFactors)
  const isEmailVerified = Boolean(currentUser?.emailVerified);
  const hasPasswordProvider = Boolean(
    currentUser?.providerData.some((p) => p.providerId === 'password')
  );
  const hasGoogleProvider = Boolean(
    currentUser?.providerData.some((p) => p.providerId === 'google.com')
  );
  const hasPasswordSet = hasPasswordProvider || hasGoogleProvider;
  const activeTotpFactor =
    enrolledFactors.find((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID) ||
    enrolledFactors[0] ||
    null;
  const has2FA = enrolledFactors.length > 0;
  const hasActiveSessionMonitored = sessions.length > 0;
  const hasPrivacyConfigured = Boolean(userProfile?.privacySettings);

  const healthChecks = [
    {
      id: 'email_verified',
      passed: isEmailVerified,
      weight: 25,
      title: language === 'sw' ? 'Barua pepe Imethibitishwa' : 'Verified Email Address',
      desc: isEmailVerified
        ? language === 'sw'
          ? `Imethibitishwa (${currentUser?.email || 'akaunti yako'})`
          : `Verified (${currentUser?.email || 'your account'})`
        : language === 'sw'
        ? 'Thibitisha barua pepe yako ili kuwasha 2FA na kulinda akaunti'
        : 'Verify your email address first to protect account recovery and enable 2-step verification',
      actionLabel: !isEmailVerified
        ? language === 'sw'
          ? 'Thibitisha Sasa'
          : 'Verify Email'
        : undefined,
      onAction: !isEmailVerified
        ? async () => {
            try {
              await sendVerificationEmail();
              setStatusNotice({
                type: 'success',
                text: 'Verification email sent! Check your inbox and click the link.'
              });
            } catch (err) {
              setStatusNotice({
                type: 'error',
                text: formatFirebaseMfaError(err)
              });
            }
          }
        : undefined
    },
    {
      id: 'strong_password',
      passed: hasPasswordSet && !userProfile?.forcePasswordReset,
      weight: 20,
      title:
        language === 'sw'
          ? 'Ulinzi wa Nenosiri Imara'
          : 'Strong Password & Credential Protection',
      desc: userProfile?.forcePasswordReset
        ? language === 'sw'
          ? 'Hatua Inahitajika: Badilisha nenosiri lako sasa'
          : 'Action Required: Password reset requested after security alert'
        : language === 'sw'
        ? 'Nenosiri linakidhi vigezo vya usalama vya WaveLink (herufi 8–24)'
        : 'Protected with strong 8–24 character alphanumeric credentials',
      actionLabel: onOpenPasswordSection
        ? language === 'sw'
          ? 'Badili Nenosiri'
          : 'Change Password'
        : undefined,
      onAction: onOpenPasswordSection
    },
    {
      id: 'two_factor',
      passed: has2FA,
      weight: 25,
      title:
        language === 'sw'
          ? 'Uthibitishaji wa Hatua 2 (Programu ya Authenticator)'
          : '2-Step Verification (Authenticator App)',
      desc: has2FA
        ? language === 'sw'
          ? 'Imewashwa — On (authenticator app)'
          : 'On (authenticator app) — Firebase TOTP required on sign-in'
        : language === 'sw'
        ? 'Imezimwa (Off) — Washa kwa Google Authenticator hapa chini'
        : 'Off — Turn on with Google Authenticator or any TOTP app below'
    },
    {
      id: 'active_sessions',
      passed: hasActiveSessionMonitored,
      weight: 15,
      title:
        language === 'sw'
          ? 'Ukaguzi wa Vifaa Vinavyotumika (Active Sessions)'
          : 'Active Device Sessions & Login Alerts',
      desc:
        language === 'sw'
          ? `Vifaa ${sessions.length} vinafuatiliwa na arifa za kuingia ziko hai`
          : `${sessions.length} active session(s) monitored with new-device email & push alerts`
    },
    {
      id: 'privacy_configured',
      passed: hasPrivacyConfigured,
      weight: 15,
      title:
        language === 'sw'
          ? 'Udhibiti wa Faragha (Ujumbe, Simu na Wafuasi)'
          : 'Privacy & Contact Controls Configured',
      desc:
        language === 'sw'
          ? `Ujumbe: ${currentPrivacy.allowDirectMessages} • Simu: ${currentPrivacy.allowCalls} • Wafuasi: ${currentPrivacy.whoCanFollow || 'everyone'}`
          : `Messages: ${currentPrivacy.allowDirectMessages} • Calls: ${currentPrivacy.allowCalls} • Follow: ${currentPrivacy.whoCanFollow || 'everyone'}`
    }
  ];

  const securityScore = healthChecks.reduce(
    (sum, item) => sum + (item.passed ? item.weight : 0),
    0
  );

  // Firebase Built-In TOTP MFA Wizard Helpers
  const resetMfaWizard = () => {
    setMfaStep('idle');
    setReauthPassword('');
    setShowReauthPassword(false);
    setConfirmDisableChecked(false);
    setTotpSecret(null);
    setTotpQrDataUrl(null);
    setCopiedSecretKey(false);
    setMfaDigits(['', '', '', '', '', '']);
    setMfaError(null);
  };

  const reauthenticateActiveUser = async (method: 'password' | 'google') => {
    const active = auth.currentUser;
    if (!active) {
      throw new Error('You must be signed in to manage 2-step verification.');
    }
    if (method === 'google') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(active, provider);
      return;
    }
    const email = active.email;
    if (!email) {
      throw new Error('No email address is attached to this account.');
    }
    if (!reauthPassword.trim()) {
      throw new Error('Please enter your current password to continue.');
    }
    const credential = EmailAuthProvider.credential(email, reauthPassword);
    await reauthenticateWithCredential(active, credential);
  };

  const handleStartEnableMfa = async () => {
    const active = auth.currentUser;
    if (!active) return;
    setMfaError(null);
    setStatusNotice(null);
    setIsProcessingMfa(true);
    try {
      await active.reload();
      const refreshedFactors = syncEnrolledFactors();
      if (refreshedFactors.length > 0) {
        setMfaStep('idle');
        return;
      }
      if (!active.emailVerified) {
        setMfaStep('verify_email');
        return;
      }
      setReauthPassword('');
      setMfaStep('reauth_enable');
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  const handleSendEmailVerifyForMfa = async () => {
    setMfaError(null);
    setIsProcessingMfa(true);
    try {
      await sendVerificationEmail();
      setStatusNotice({
        type: 'success',
        text: `Verification email sent to ${auth.currentUser?.email || 'your email'}. Open the link in your inbox, then tap "I've verified, re-check".`
      });
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  const handleRecheckEmailVerifiedForMfa = async () => {
    const active = auth.currentUser;
    if (!active) return;
    setMfaError(null);
    setIsProcessingMfa(true);
    try {
      await active.reload();
      await active.getIdToken(true).catch(() => {});
      if (active.emailVerified) {
        setReauthPassword('');
        setMfaStep('reauth_enable');
      } else {
        setMfaError('Your email is not verified yet. Please click the verification link in your inbox (check spam too) and try again.');
      }
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  const handleReauthAndGenerateTotp = async (method: 'password' | 'google') => {
    const active = auth.currentUser;
    if (!active) return;
    setMfaError(null);
    setIsProcessingMfa(true);
    try {
      await reauthenticateActiveUser(method);
      await active.reload();
      const session = await multiFactor(active).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const accountLabel = active.email || userProfile?.email || userProfile?.username || active.uid;
      const qrCodeUrl = secret.generateQrCodeUrl(accountLabel, 'WaveLink');
      const dataUrl = await QRCode.toDataURL(qrCodeUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF'
        }
      });
      setTotpSecret(secret);
      setTotpQrDataUrl(dataUrl);
      setMfaDigits(['', '', '', '', '', '']);
      setReauthPassword('');
      setMfaStep('scan_qr');
      setTimeout(() => otpInputRefs.current[0]?.focus(), 60);
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  const handleOtpDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const next = [...mfaDigits];
      for (let i = 0; i < 6; i++) {
        next[i] = cleaned[i] || '';
      }
      setMfaDigits(next);
      const focusIdx = Math.min(5, cleaned.length - 1);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...mfaDigits];
    next[index] = cleaned;
    setMfaDigits(next);
    if (cleaned && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !mfaDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setMfaDigits(next);
    const focusIdx = Math.min(5, Math.max(0, pasted.length - 1));
    otpInputRefs.current[focusIdx]?.focus();
  };

  const handleCopyTotpSecret = async () => {
    if (!totpSecret?.secretKey) return;
    try {
      await navigator.clipboard.writeText(totpSecret.secretKey);
      setCopiedSecretKey(true);
      setTimeout(() => setCopiedSecretKey(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleVerifyAndEnrollTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    const active = auth.currentUser;
    if (!active || !totpSecret) return;
    const code = mfaDigits.join('').trim();
    if (!/^\d{6}$/.test(code)) {
      setMfaError('Please enter all six digits from your authenticator app.');
      return;
    }

    setMfaError(null);
    setIsProcessingMfa(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, code);
      await multiFactor(active).enroll(assertion, 'Authenticator app');
      await active.reload();
      syncEnrolledFactors();
      resetMfaWizard();
      setStatusNotice({
        type: 'success',
        text:
          language === 'sw'
            ? 'Uthibitishaji wa Hatua 2 umewashwa — On (authenticator app)!'
            : '2-Step Verification is now On (authenticator app)!'
      });
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  const handleStartDisableMfa = () => {
    setMfaError(null);
    setStatusNotice(null);
    setReauthPassword('');
    setConfirmDisableChecked(false);
    setMfaStep('confirm_disable');
  };

  const handleReauthAndUnenrollTotp = async (method: 'password' | 'google') => {
    const active = auth.currentUser;
    if (!active) return;
    if (!confirmDisableChecked) {
      setMfaError('Please confirm that you want to turn off your authenticator app protection.');
      return;
    }
    setMfaError(null);
    setIsProcessingMfa(true);
    try {
      await reauthenticateActiveUser(method);
      await active.reload();
      const currentFactors = [...multiFactor(active).enrolledFactors];
      const targetFactor =
        currentFactors.find((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID) ||
        currentFactors[0];
      if (!targetFactor) {
        syncEnrolledFactors();
        resetMfaWizard();
        return;
      }
      await multiFactor(active).unenroll(targetFactor);
      await active.reload();
      syncEnrolledFactors();
      resetMfaWizard();
      setStatusNotice({
        type: 'success',
        text:
          language === 'sw'
            ? 'Uthibitishaji wa Hatua 2 umezimwa (Off).'
            : '2-Step Verification has been turned Off.'
      });
    } catch (err) {
      setMfaError(formatFirebaseMfaError(err));
    } finally {
      setIsProcessingMfa(false);
    }
  };

  // Handlers for Active Sessions & Login Alerts
  const handleRevokeAllSessions = async () => {
    if (!currentUser) return;
    setIsRevokingAll(true);
    setStatusNotice(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/security/sessions/revoke-all', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keepDeviceId: currentDeviceId })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not log out of other devices.');
      }
      await loadActiveSessions();
      setStatusNotice({
        type: 'success',
        text:
          language === 'sw'
            ? 'Vifaa vingine vyote vimetolewa kwenye akaunti yako mara moja!'
            : 'Logged out of all other devices immediately!'
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not revoke sessions.')
      });
    } finally {
      setIsRevokingAll(false);
    }
  };

  const handleThisWasntMe = async () => {
    if (!currentUser) return;
    setIsTriggeringNotMe(true);
    setStatusNotice(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/security/not-me', {
        method: 'POST',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not execute emergency lock.');
      }
      await loadActiveSessions();
      setStatusNotice({
        type: 'warning',
        text:
          data.message ||
          'Emergency Protection Activated: All sessions have been logged out and a password reset is now required.'
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not trigger emergency lock.')
      });
    } finally {
      setIsTriggeringNotMe(false);
    }
  };

  const handleTestNewDeviceAlert = async () => {
    if (!currentUser) return;
    setIsSimulatingNewDevice(true);
    setStatusNotice(null);
    try {
      const headers = await getAuthHeaders();
      const simulatedDeviceId = `sim_dev_${Date.now().toString(36)}`;
      const resp = await fetch('/api/security/sessions/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: simulatedDeviceId,
          deviceName: 'Chrome on New Device (Login Alert Test)',
          platform: 'Windows / Android',
          browser: 'Chrome'
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not trigger login alert test.');
      }
      await loadActiveSessions();
      setStatusNotice({
        type: 'warning',
        text:
          language === 'sw'
            ? 'Arifa ya Kifaa Kipya imetumwa kwenye barua pepe na taarifa zako! Unaweza kubonyeza "Huyu hakuwa mimi" hapa chini.'
            : 'New-device login alert sent via email & push notification! If you ever see an unfamiliar device, click "This wasn\'t me" below.'
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not simulate new-device alert.')
      });
    } finally {
      setIsSimulatingNewDevice(false);
    }
  };

  // Download My Data handler
  const handleDownloadMyData = async () => {
    if (!currentUser) return;
    setIsExportingData(true);
    setStatusNotice(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/security/export-data', {
        method: 'GET',
        headers
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Could not prepare data export.');
      }
      const exportPayload = data.exportBundle || data.data;
      if (!exportPayload) {
        throw new Error(data.error || 'Data export payload was empty.');
      }
      const jsonString = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wavelink-my-data-${currentUser.uid.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusNotice({
        type: 'success',
        text:
          language === 'sw'
            ? 'Data yako yote ya WaveLink imepakuliwa kikamilifu (JSON)!'
            : 'Your complete WaveLink data archive (JSON) has been downloaded!'
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(err, 'Could not export your data right now.')
      });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeleting(true);
    try {
      await deleteMyAccount(deletePassword || undefined);
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: sanitizeUserFacingError(
          err,
          'Could not delete account. Please enter your current password and try again.'
        )
      });
      setIsDeleting(false);
    }
  };

  return (
    <div className="wavelink-security-center-panel space-y-6">
      {/* 1. SECURITY HEALTH SCORE & CHECKLIST CARD */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                securityScore >= 80
                  ? 'bg-emerald-50 text-[#0D9488] border-emerald-200'
                  : securityScore >= 50
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-rose-50 text-rose-600 border-rose-200'
              }`}
            >
              {securityScore >= 80 ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-lg text-[#1C1917]">
                  {language === 'sw' ? 'Kituo cha Usalama (Security Center)' : 'WaveLink Security Center'}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                    securityScore >= 80
                      ? 'bg-emerald-50 text-[#0D9488] border-emerald-200'
                      : securityScore >= 50
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {language === 'sw' ? `Alama ya Usalama: ${securityScore}/100` : `Security Health: ${securityScore}/100`}
                </span>
              </div>
              <p className="text-xs text-[#78716C] mt-0.5">
                {language === 'sw'
                  ? 'Kagua ulinzi wa akaunti yako, vifaa vilivyo hai, uthibitishaji wa hatua 2 kwa authenticator na faragha.'
                  : 'Monitor your Security Health score, active devices, authenticator 2-step verification, and data privacy.'}
              </p>
            </div>
          </div>

          {/* Visual progress bar */}
          <div className="w-full sm:w-48 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-extrabold">
              <span className="text-[#57534E]">
                {securityScore >= 80
                  ? language === 'sw'
                    ? 'Ulinzi Imara'
                    : 'Strong Protection'
                  : language === 'sw'
                  ? 'Inahitaji Maboresho'
                  : 'Needs Attention'}
              </span>
              <span className="font-mono text-[#1C1917]">{securityScore}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-stone-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  securityScore >= 80
                    ? 'bg-[#0D9488]'
                    : securityScore >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
                }`}
                style={{ width: `${Math.max(10, securityScore)}%` }}
              />
            </div>
          </div>
        </div>

        {statusNotice && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 flex-wrap ${
              statusNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusNotice.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {statusNotice.type === 'success' ? (
                <CheckCircle2 size={16} className="text-[#0D9488] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle
                  size={16}
                  className={
                    statusNotice.type === 'warning'
                      ? 'text-amber-600 shrink-0 mt-0.5'
                      : 'text-rose-600 shrink-0 mt-0.5'
                  }
                />
              )}
              <span>{statusNotice.text}</span>
            </div>
            {statusNotice.type === 'error' ? (
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>{language === 'sw' ? 'Jaribu tena' : 'Try again'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="min-w-[2.75rem] min-h-[2.75rem] rounded-xl text-xs font-extrabold opacity-70 hover:opacity-100 flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Green and Red Checks Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {healthChecks.map((check) => (
            <div
              key={check.id}
              className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${
                check.passed
                  ? 'bg-emerald-50/40 border-emerald-200/80'
                  : 'bg-rose-50/40 border-rose-200/80'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {check.passed ? (
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-extrabold text-[#1C1917]">{check.title}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        check.passed
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {check.passed
                        ? language === 'sw'
                          ? 'Salama ✓'
                          : 'Pass ✓'
                        : language === 'sw'
                        ? 'Angalia ✕'
                        : 'Action Needed'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#57534E] mt-0.5 leading-snug">{check.desc}</p>
                </div>
              </div>

              {check.actionLabel && check.onAction && (
                <button
                  type="button"
                  onClick={check.onAction}
                  className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-extrabold shrink-0 transition cursor-pointer flex items-center"
                >
                  {check.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2. ACTIVE SESSIONS & NEW-DEVICE LOGIN ALERT ("THIS WASN'T ME") */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-200/70 flex items-center justify-center shrink-0">
              <Smartphone size={19} />
            </div>
            <div>
              <h4 className="font-extrabold text-base text-[#1C1917]">
                {language === 'sw'
                  ? 'Vifaa Nilivyoingia na Arifa'
                  : 'Devices Where I Am Signed In'}
              </h4>
              <p className="text-xs text-[#78716C]">
                {language === 'sw'
                  ? 'Orodha ya vifaa vyako na arifa kila kifaa kipya kinapoingia.'
                  : 'See every device signed into your account. We alert you when a new device signs in.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadActiveSessions}
              disabled={isLoadingSessions}
              className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-stone-200/60 text-[#1C1917] border border-[var(--border-hairline)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={isLoadingSessions ? 'animate-spin' : ''} />
              <span>{language === 'sw' ? 'Onyesha upya' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={handleRevokeAllSessions}
              disabled={isRevokingAll}
              className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <LogOut size={13} />
              <span>
                {isRevokingAll
                  ? language === 'sw'
                    ? 'Inatoa...'
                    : 'Logging out...'
                  : language === 'sw'
                  ? 'Ondoka kwenye vifaa vyote'
                  : 'Log out of all devices'}
              </span>
            </button>
          </div>
        </div>

        {/* Device List */}
        <div className="space-y-2.5">
          {sessions.map((sess) => {
            const isThisDevice = sess.deviceId === currentDeviceId || sess.isCurrent;
            const isMobile = /android|iphone|ipad|ios/i.test(
              `${sess.platform || ''} ${sess.deviceName || ''}`
            );
            return (
              <div
                key={sess.id || sess.deviceId}
                className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white border border-[var(--border-hairline)] text-[#2563EB] flex items-center justify-center shrink-0">
                    {isMobile ? <Smartphone size={17} /> : <Laptop size={17} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-extrabold text-[#1C1917] truncate">
                        {sess.deviceName || 'WaveLink Device'}
                      </span>
                      {isThisDevice && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                          {language === 'sw' ? 'Kifaa Hiki' : 'This Device'}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#78716C] block">
                      {sess.platform || 'Web'} •{' '}
                      {language === 'sw' ? 'Imetumika mwisho: ' : 'Last used: '}
                      {sess.lastUsedAt
                        ? new Date(sess.lastUsedAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Just now'}
                      {sess.ipHint ? ` • IP: ${sess.ipHint}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* New-Device Login Alert & "This wasn't me" Emergency Protection */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellRing size={15} className="text-amber-700 shrink-0" />
              <span className="text-xs font-extrabold text-amber-950">
                {language === 'sw'
                  ? 'Je, umeona kifaa usichokijua?'
                  : 'Unrecognized login alert or unfamiliar device?'}
              </span>
            </div>
            <p className="text-[11px] text-amber-900/90 leading-relaxed">
              {language === 'sw'
                ? 'Kubonyeza "Huyu hakuwa mimi" kutatoa vifaa vyote mara moja na kulazimisha kubadilisha nenosiri.'
                : 'Clicking "This wasn\'t me" immediately revokes all active sessions and forces a password reset.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleTestNewDeviceAlert}
              disabled={isSimulatingNewDevice}
              className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 text-xs font-bold transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <BellRing size={13} />
              <span>
                {isSimulatingNewDevice
                  ? 'Sending...'
                  : language === 'sw'
                  ? 'Jaribu arifa'
                  : 'Test alert'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleThisWasntMe}
              disabled={isTriggeringNotMe}
              className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <ShieldOff size={13} />
              <span>
                {isTriggeringNotMe
                  ? 'Locking...'
                  : language === 'sw'
                  ? 'Hakuwa mimi'
                  : "This wasn't me"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. FIREBASE BUILT-IN 2-STEP VERIFICATION (TOTP AUTHENTICATOR APP) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200/70 flex items-center justify-center shrink-0">
              <KeyRound size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-extrabold text-base text-[#1C1917]">
                  {language === 'sw'
                    ? 'Uthibitishaji wa Hatua 2 (Authenticator App)'
                    : '2-Step Verification'}
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                    has2FA
                      ? 'bg-emerald-50 text-[#0D9488] border-emerald-200'
                      : 'bg-stone-100 text-[#57534E] border-stone-200'
                  }`}
                >
                  {has2FA ? 'On (authenticator app)' : 'Off'}
                </span>
              </div>
              <p className="text-xs text-[#78716C] mt-0.5">
                {has2FA
                  ? language === 'sw'
                    ? `Imewashwa kupitia ${activeTotpFactor?.displayName || 'Authenticator app'}. Utahitaji msimbo wa tarakimu 6 unapoingia.`
                    : `Protected with ${activeTotpFactor?.displayName || 'Authenticator app'}. A 6-digit code is required when signing in.`
                  : language === 'sw'
                  ? 'Ongeza ulinzi wa ziada kwa kutumia programu ya Google Authenticator au TOTP yoyote.'
                  : 'Add an extra layer of security with Google Authenticator or any TOTP authenticator app.'}
              </p>
            </div>
          </div>

          {mfaStep === 'idle' && (
            has2FA ? (
              <button
                type="button"
                onClick={handleStartDisableMfa}
                disabled={isProcessingMfa}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <ShieldOff size={15} />
                <span>
                  {language === 'sw'
                    ? 'Zima Uthibitishaji wa Hatua 2'
                    : 'Turn off 2-step verification'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartEnableMfa}
                disabled={isProcessingMfa}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <QrCode size={15} />
                <span>
                  {isProcessingMfa
                    ? 'Checking...'
                    : language === 'sw'
                    ? 'Washa Uthibitishaji wa Hatua 2'
                    : 'Turn on 2-step verification'}
                </span>
              </button>
            )
          )}
        </div>

        {/* Real Firebase Error Display */}
        {mfaError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between gap-2.5 flex-wrap break-words">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span className="flex-1">{mfaError}</span>
            </div>
            <button
              type="button"
              onClick={() => setMfaError(null)}
              className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>{language === 'sw' ? 'Jaribu tena' : 'Try again'}</span>
            </button>
          </div>
        )}

        {/* Step A: Verify Email First */}
        {mfaStep === 'verify_email' && (
          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-[#1C1917] block">
                Step 1 of 3 — Verify your email address first
              </span>
              <p className="text-xs text-[#57534E] leading-relaxed">
                Firebase requires a verified email address ({currentUser?.email || 'your account'}) before turning on 2-step verification.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSendEmailVerifyForMfa}
                disabled={isProcessingMfa}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail size={14} />
                <span>{isProcessingMfa ? 'Sending...' : 'Send verification email'}</span>
              </button>
              <button
                type="button"
                onClick={handleRecheckEmailVerifiedForMfa}
                disabled={isProcessingMfa}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-stone-50 text-[#1C1917] border border-[var(--border-hairline)] text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {isProcessingMfa ? 'Checking...' : "I've verified, re-check"}
              </button>
              <button
                type="button"
                onClick={resetMfaWizard}
                disabled={isProcessingMfa}
                className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step B: Re-authenticate Before Generating TOTP Secret */}
        {mfaStep === 'reauth_enable' && (
          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-[#1C1917] block">
                Step 2 of 3 — Confirm your identity
              </span>
              <p className="text-xs text-[#57534E] leading-relaxed">
                Re-authenticate your account ({currentUser?.email}) to generate a private authenticator setup key.
              </p>
            </div>

            {hasPasswordProvider && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReauthAndGenerateTotp('password');
                }}
                className="space-y-2.5"
              >
                <div className="relative">
                  <input
                    type={showReauthPassword ? 'text' : 'password'}
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs sm:text-sm text-[#1C1917]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReauthPassword((prev) => !prev)}
                    aria-label={showReauthPassword ? 'Hide password' : 'Show password'}
                    className="min-w-[44px] min-h-[44px] absolute right-0 top-0 flex items-center justify-center text-[#78716C] hover:text-[#1C1917]"
                  >
                    {showReauthPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={isProcessingMfa || !reauthPassword.trim()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingMfa ? 'Confirming...' : 'Continue with password'}
                  </button>
                  <button
                    type="button"
                    onClick={resetMfaWizard}
                    disabled={isProcessingMfa}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#57534E] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {hasGoogleProvider && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => handleReauthAndGenerateTotp('google')}
                  disabled={isProcessingMfa}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-stone-50 text-[#1C1917] border border-[var(--border-hairline)] text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{isProcessingMfa ? 'Confirming...' : 'Re-authenticate with Google'}</span>
                </button>
                {!hasPasswordProvider && (
                  <button
                    type="button"
                    onClick={resetMfaWizard}
                    disabled={isProcessingMfa}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#78716C] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step C: Scan QR Code + Manual Secret + 6-Digit Enrollment Code */}
        {mfaStep === 'scan_qr' && totpSecret && (
          <form
            onSubmit={handleVerifyAndEnrollTotp}
            className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-4"
          >
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-[#1C1917] block">
                Set up your authenticator app in three simple steps
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]">
                  1 Open your authenticator app
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]">
                  2 Scan this
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]">
                  3 Type the 6 numbers
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {totpQrDataUrl && (
                <div className="p-2.5 rounded-2xl bg-white border border-[var(--border-hairline)] shrink-0">
                  <img
                    src={totpQrDataUrl}
                    alt="QR code for WaveLink authenticator setup"
                    className="w-40 h-40 sm:w-44 sm:h-44 block"
                  />
                </div>
              )}

              <div className="w-full min-w-0 space-y-2.5">
                <span className="text-[11px] font-bold text-[#78716C] block">
                  Setup key (if you cannot scan the QR code):
                </span>
                <div className="p-2.5 rounded-xl bg-white border border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <code className="text-xs font-mono font-extrabold text-[#1C1917] break-all select-all">
                    {totpSecret.secretKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyTotpSecret}
                    className="min-h-[44px] min-w-[44px] px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-[#1C1917] text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedSecretKey ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedSecretKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-extrabold text-[#1C1917] block">
                    3 Type the 6 numbers
                  </label>
                  <div className="grid grid-cols-6 gap-1.5 max-w-[18.75rem]">
                    {mfaDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        onPaste={handleOtpPaste}
                        aria-label={`Digit ${idx + 1} of 6`}
                        className="w-full min-h-[44px] h-11 text-center rounded-xl bg-white border border-[var(--border-hairline)] focus:border-[#0D9488] focus:outline-none font-mono text-base font-extrabold text-[#1C1917]"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="submit"
                disabled={isProcessingMfa || mfaDigits.join('').length !== 6}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {isProcessingMfa ? 'Verifying...' : 'Verify & Turn On'}
              </button>
              <button
                type="button"
                onClick={resetMfaWizard}
                disabled={isProcessingMfa}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#57534E] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Turn Off Confirmation + Re-authentication */}
        {mfaStep === 'confirm_disable' && (
          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-rose-900 block">
                Confirm turning off 2-step verification
              </span>
              <p className="text-xs text-rose-800 leading-relaxed">
                Turning this off removes your authenticator app code when signing in. Confirm below and enter your password.
              </p>
            </div>

            <label className="min-h-[44px] p-3 rounded-xl bg-white border border-rose-200 flex items-center gap-2.5 text-xs font-bold text-rose-900 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmDisableChecked}
                onChange={(e) => setConfirmDisableChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-rose-600 shrink-0"
              />
              <span>Yes, I want to turn off 2-step verification on my account</span>
            </label>

            {hasPasswordProvider && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReauthAndUnenrollTotp('password');
                }}
                className="space-y-2.5"
              >
                <div className="relative">
                  <input
                    type={showReauthPassword ? 'text' : 'password'}
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="Enter your current password to confirm"
                    autoComplete="current-password"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl bg-white border border-rose-200 text-xs sm:text-sm text-[#1C1917]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReauthPassword((prev) => !prev)}
                    aria-label={showReauthPassword ? 'Hide password' : 'Show password'}
                    className="min-w-[44px] min-h-[44px] absolute right-0 top-0 flex items-center justify-center text-[#78716C] hover:text-[#1C1917]"
                  >
                    {showReauthPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={isProcessingMfa || !reauthPassword.trim() || !confirmDisableChecked}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingMfa ? 'Turning off...' : 'Confirm & Turn Off'}
                  </button>
                  <button
                    type="button"
                    onClick={resetMfaWizard}
                    disabled={isProcessingMfa}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-rose-200 text-xs font-bold text-[#57534E] cursor-pointer"
                  >
                    Keep 2-Step Verification On
                  </button>
                </div>
              </form>
            )}

            {hasGoogleProvider && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => handleReauthAndUnenrollTotp('google')}
                  disabled={isProcessingMfa || !confirmDisableChecked}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {isProcessingMfa ? 'Confirming...' : 'Re-authenticate with Google & Turn Off'}
                </button>
                {!hasPasswordProvider && (
                  <button
                    type="button"
                    onClick={resetMfaWizard}
                    disabled={isProcessingMfa}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-rose-200 text-xs font-bold text-[#57534E] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. QUICK PRIVACY CONTROLS (ONLINE STATUS, MESSAGE, CALL, FOLLOW) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0D9488] border border-emerald-200/70 flex items-center justify-center shrink-0">
            <Lock size={19} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-[#1C1917]">
              {language === 'sw'
                ? 'Mipangilio ya Faragha ya Haraka'
                : 'Privacy Controls (Online Status, Messages, Calls & Follows)'}
            </h4>
            <p className="text-xs text-[#78716C]">
              {language === 'sw'
                ? 'Ficha hali ya mtandaoni na uchague nani anaweza kukutumia ujumbe, kukupigia simu au kukufuata.'
                : 'Hide your online status and choose who can message, call, or follow you.'}
            </p>
          </div>
        </div>

        {/* Hide Online Status Toggle */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-4">
          <div>
            <span className="text-xs sm:text-sm font-extrabold text-[#1C1917] block">
              {language === 'sw' ? 'Onyesha ninapokuwa mtandaoni (Online Status)' : "Show when I'm online"}
            </span>
            <span className="text-[11px] text-[#78716C] block">
              {language === 'sw'
                ? 'Ukizima, nukta ya kijani na muda ulioonekana mwisho vitafichwa.'
                : 'Turn off to hide your green online dot and last seen time.'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={currentPrivacy.showOnlineStatus}
            onClick={() =>
              handleQuickPrivacyChange({
                showOnlineStatus: !currentPrivacy.showOnlineStatus,
                showLastSeen: !currentPrivacy.showOnlineStatus
              })
            }
            className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 cursor-pointer ${
              currentPrivacy.showOnlineStatus ? 'bg-[#0D9488]' : 'bg-stone-300'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                currentPrivacy.showOnlineStatus ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Who can Message, Call, or Follow selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1.5">
            <label className="text-xs font-extrabold text-[#1C1917] block">
              {language === 'sw' ? 'Ujumbe' : 'Messages'}
            </label>
            <select
              value={currentPrivacy.allowDirectMessages}
              onChange={(e) =>
                handleQuickPrivacyChange({
                  allowDirectMessages: e.target.value as UserPrivacySettings['allowDirectMessages']
                })
              }
              className="w-full min-h-[2.75rem] px-2.5 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers</option>
              <option value="none">No one</option>
            </select>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1.5">
            <label className="text-xs font-extrabold text-[#1C1917] block">
              {language === 'sw' ? 'Simu' : 'Calls'}
            </label>
            <select
              value={currentPrivacy.allowCalls}
              onChange={(e) =>
                handleQuickPrivacyChange({
                  allowCalls: e.target.value as UserPrivacySettings['allowCalls']
                })
              }
              className="w-full min-h-[2.75rem] px-2.5 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers</option>
              <option value="none">No one</option>
            </select>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1.5">
            <label className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1">
              <UserCheck size={13} className="text-[#2563EB]" />
              <span>{language === 'sw' ? 'Wafuasi' : 'Follows'}</span>
            </label>
            <select
              value={currentPrivacy.whoCanFollow || 'everyone'}
              onChange={(e) =>
                handleQuickPrivacyChange({
                  whoCanFollow: e.target.value as 'everyone' | 'followers' | 'none'
                })
              }
              className="w-full min-h-[2.75rem] px-2.5 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Friends</option>
              <option value="none">No one</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. DOWNLOAD MY DATA & DELETE MY ACCOUNT */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <h4 className="font-extrabold text-base text-[#1C1917] flex items-center gap-2">
              <Download size={17} className="text-[#2563EB]" />
              <span>
                {language === 'sw'
                  ? 'Pakua Data au Futa Akaunti'
                  : 'My Data & Account'}
              </span>
            </h4>
            <p className="text-xs text-[#78716C]">
              {language === 'sw'
                ? 'Pakua nakala ya data yako au futa akaunti yako.'
                : 'Download a copy of your data or delete your account.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadMyData}
              disabled={isExportingData}
              className="min-h-[2.75rem] px-4 py-2 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold inline-flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Download size={15} />
              <span>
                {isExportingData
                  ? language === 'sw'
                    ? 'Inaandaa...'
                    : 'Downloading...'
                  : language === 'sw'
                  ? 'Pakua data'
                  : 'Get data'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenDeleteAccountSection) {
                  onOpenDeleteAccountSection();
                } else {
                  setShowDeleteModal((prev) => !prev);
                }
              }}
              className="min-h-[2.75rem] px-4 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 size={15} />
              <span>{language === 'sw' ? 'Futa akaunti' : 'Delete account'}</span>
            </button>
          </div>
        </div>

        {showDeleteModal && (
          <form
            onSubmit={handleConfirmDelete}
            className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 space-y-3"
          >
            <p className="text-xs font-extrabold text-rose-900">
              {language === 'sw'
                ? 'Je, una uhakika unataka kufuta akaunti yako na data zote kabisa?'
                : 'Are you sure you want to permanently delete your account and all data?'}
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter your current password to confirm (optional for Google sign-in)"
              className="w-full min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-white border border-rose-200 text-xs text-[#1C1917]"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="submit"
                disabled={isDeleting}
                className="min-h-[2.75rem] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>{isDeleting ? 'Deleting...' : 'Delete account'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-xs font-bold text-[#57534E] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
