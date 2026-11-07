import React, { useState, useEffect } from 'react';
import { useAuth, DAILY_REWARD_SCHEDULE, getLocalDateKey } from '../context/AuthContext';
import { useTheme, APPEARANCE_THEMES } from '../context/ThemeContext';
import {
  AppearanceTheme,
  ProBorderEffect,
  ProAccentColor,
  UserPrivacySettings,
  UserTermsAgreement
} from '../types';
import { CrystalBadge } from './CrystalBadge';
import { SupportDeskView } from './SupportDeskView';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { DailyRewardModal } from './DailyRewardModal';
import {
  Check,
  User,
  Shield,
  ShieldCheck,
  Save,
  CheckCircle2,
  Upload,
  HelpCircle,
  AtSign,
  Crown,
  Sparkles,
  Palette,
  Flame,
  Coins,
  ChevronRight,
  X,
  Lock,
  KeyRound,
  LogOut,
  FileText,
  Eye,
  EyeOff,
  Mail,
  AlertCircle,
  Globe,
  Users,
  MessageSquare,
  PhoneCall,
  BookOpen,
  Trash2,
  Ban,
  BatteryCharging,
  Zap,
  Lightbulb,
  UserPlus,
  Bell
} from 'lucide-react';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

import { inviteFriends } from '../utils/share.js';
import { LegalModal, LegalDocType } from './LegalModals';
import { compressImage } from '../utils/mediaStorage';
import { validateStrongPassword } from '../utils/security';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { UpgradeFeedbackItem, UpgradeCategory } from '../types';
import { recordUpgradeFeedback } from '../services/upgradeFeedbackService';

interface SettingsViewProps {
  onOpenAdminPanel?: () => void;
}

type SettingsSection =
  | 'profile'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'terms'
  | 'pro'
  | 'support'
  | 'upgrades';

const DEFAULT_PRIVACY_SETTINGS: UserPrivacySettings = {
  profileVisibility: 'public',
  showOnlineStatus: true,
  showLastSeen: true,
  allowDirectMessages: 'everyone',
  allowCalls: 'everyone',
  sparkVisibility: 'everyone',
  showReadReceipts: true,
  allowSearchByEmail: true,
  dataSharingConsent: false
};

const DEFAULT_TERMS_AGREEMENT: UserTermsAgreement = {
  accepted: true,
  communityCodeAccepted: true,
  acceptedVersion: '2026.1',
  selectedSection: 'terms',
  acceptedAt: new Date().toISOString()
};

const AGREEMENT_SECTIONS: {
  id: UserTermsAgreement['selectedSection'];
  title: string;
  badge: string;
  summary: string;
  clauses: { heading: string; body: string }[];
}[] = [
  {
    id: 'terms',
    title: '1. Standard Terms of Service Agreement',
    badge: 'Core Platform Agreement',
    summary: 'Governs your WaveLink account, content ownership, and use of social features.',
    clauses: [
      {
        heading: 'Account Eligibility & Responsibility',
        body: 'By creating and using a WaveLink account, you confirm that the profile details you provide are accurate and that you are responsible for safeguarding your account password and session security.'
      },
      {
        heading: 'Content Ownership & License',
        body: 'You retain full ownership of all photos, Video Reels, 24-hour Sparks, audio mixes, and posts you publish on WaveLink. By posting publicly, you grant WaveLink a non-exclusive license to display and distribute your content within the platform.'
      },
      {
        heading: 'Service Availability & Updates',
        body: 'WaveLink continually improves features including WELINK AI Guide, Live Voice talking, and real-time messaging. Features may be updated or refined to maintain community safety and performance.'
      }
    ]
  },
  {
    id: 'community',
    title: '2. Community Safety & Code of Conduct',
    badge: 'Community Rules',
    summary: 'Standards for respectful interaction across Feed posts, Sparks, Reels, and Direct Messages.',
    clauses: [
      {
        heading: 'Respectful & Welcoming Environment',
        body: 'WaveLink is built for positive creative expression. Harassment, hate speech, threats, impersonation of other members, or non-consensual sharing of private media is strictly prohibited.'
      },
      {
        heading: 'Authentic Engagement',
        body: 'Do not use automated scripts to artificially inflate reactions, WavePoints, or follower counts. Authentic engagement keeps the community fair for every creator.'
      },
      {
        heading: 'Moderation & Appeals',
        body: 'Administrators may issue warnings or restrict accounts that violate community standards. You may submit an appeal at any time through the Support tab.'
      }
    ]
  },
  {
    id: 'creator_monetization',
    title: '3. Creator Monetization, Tipping & AzamPay Terms',
    badge: 'Payments & Pro',
    summary: 'Rules for WaveLink Pro memberships (18,000 TZS/mo), Post Boosting, and Creator Tipping.',
    clauses: [
      {
        heading: 'WaveLink Pro Membership',
        body: 'WaveLink Pro unlocks 25 daily AI image creations, all light appearance themes, Blue Star verification eligibility, and ad-free browsing. Payments are processed securely via AzamPay Mobile Money (Airtel Money, M-Pesa, Tigo Pesa, HaloPesa).'
      },
      {
        heading: 'Creator Tipping & Transparent Fees',
        body: 'When supporters send tips to creators, 90% goes to the creator and a transparent 10% platform maintenance fee covers mobile money gateway and hosting costs.'
      },
      {
        heading: 'Refund Protection',
        body: 'Duplicate mobile money charges or failed Pro activations caused by network interruptions qualify for a 100% refund or immediate credit upon verification of your transaction ID.'
      }
    ]
  },
  {
    id: 'data_protection',
    title: '4. Data Protection & Privacy Agreement',
    badge: 'Privacy & Security',
    summary: 'How WaveLink protects your personal data, private chats, and privacy choices.',
    clauses: [
      {
        heading: 'Zero Sale of Personal Data',
        body: 'WaveLink never sells or rents your personal information, email address, or phone number to third-party data brokers or external advertisers.'
      },
      {
        heading: 'Private Messaging & Calls',
        body: 'Direct messages and WebRTC voice/video calls are protected by strict access rules. You can customize who can message you, call you, or see your online status at any time in Privacy Settings.'
      },
      {
        heading: 'Your Data Control Rights',
        body: 'You can update your profile, export or modify your privacy preferences, change your password, or permanently delete your account and data at any time in Settings → Password & Security.'
      }
    ]
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenAdminPanel }) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isSubAdmin,
    isProEffective,
    updateUserProfile,
    changeUserPassword,
    sendPasswordReset,
    sendVerificationEmail,
    toggleBlockUser,
    deleteMyAccount,
    signOut
  } = useAuth();
  const { appearanceTheme, setAppearanceTheme, isBatterySaver, setBatterySaver } = useTheme();

  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>(() => {
    if (typeof window !== 'undefined') {
      const requested = localStorage.getItem('wavelink_settings_initial_section');
      if (requested === 'notifications') {
        localStorage.removeItem('wavelink_settings_initial_section');
        return 'notifications';
      }
    }
    return 'profile';
  });
  const [selectedLegalDoc, setSelectedLegalDoc] = useState<LegalDocType | null>(null);
  const [isDailyRewardModalOpen, setIsDailyRewardModalOpen] = useState(false);
  const [gentleProNote, setGentleProNote] = useState<string | null>(null);
  const [deviceBatteryInfo, setDeviceBatteryInfo] = useState<{ level: number; charging: boolean } | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof (navigator as any).getBattery !== 'function') return;
    let batteryObj: any = null;
    const syncBattery = () => {
      if (!batteryObj) return;
      setDeviceBatteryInfo({
        level: Math.round((batteryObj.level ?? 1) * 100),
        charging: Boolean(batteryObj.charging),
      });
    };
    (navigator as any)
      .getBattery()
      .then((bat: any) => {
        batteryObj = bat;
        syncBattery();
        bat.addEventListener?.('levelchange', syncBattery);
        bat.addEventListener?.('chargingchange', syncBattery);
      })
      .catch(() => {});
    return () => {
      if (batteryObj) {
        batteryObj.removeEventListener?.('levelchange', syncBattery);
        batteryObj.removeEventListener?.('chargingchange', syncBattery);
      }
    };
  }, []);

  // Profile form state
  const [displayName, setDisplayName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [username, setUsername] = useState(
    userProfile?.username || (currentUser?.email ? `@${currentUser.email.split('@')[0]}` : '@waver')
  );
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || currentUser?.photoURL || '');

  // Pro customization state
  const [proBorderEffect] = useState<ProBorderEffect>(userProfile?.proBorderEffect || 'aura-gold');
  const [proAccentColor] = useState<ProAccentColor>(userProfile?.proAccentColor || 'purple');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [inviteToast, setInviteToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleInviteFriends = async () => {
    try {
      const res = await inviteFriends();
      if (res?.method !== 'cancelled') {
        setInviteToast({ message: 'WhatsApp Invite opened!', type: 'success' });
        setTimeout(() => setInviteToast(null), 3000);
      }
    } catch (err: any) {
      setInviteToast({ message: err?.message || "Couldn't open WhatsApp", type: 'error' });
      setTimeout(() => setInviteToast(null), 3000);
    }
  };

  // Privacy Settings state
  const [privacySettings, setPrivacySettings] = useState<UserPrivacySettings>(() => {
    if (userProfile?.privacySettings) {
      return { ...DEFAULT_PRIVACY_SETTINGS, ...userProfile.privacySettings };
    }
    try {
      const saved = localStorage.getItem(`wavelink_privacy_${currentUser?.uid || 'guest'}`);
      if (saved) return { ...DEFAULT_PRIVACY_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_PRIVACY_SETTINGS;
  });
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [privacySavedBanner, setPrivacySavedBanner] = useState(false);

  // Terms of Agreement state
  const [termsAgreement, setTermsAgreement] = useState<UserTermsAgreement>(() => {
    if (userProfile?.termsAgreement) {
      return { ...DEFAULT_TERMS_AGREEMENT, ...userProfile.termsAgreement };
    }
    try {
      const saved = localStorage.getItem(`wavelink_terms_${currentUser?.uid || 'guest'}`);
      if (saved) return { ...DEFAULT_TERMS_AGREEMENT, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_TERMS_AGREEMENT;
  });
  const [isSavingTerms, setIsSavingTerms] = useState(false);
  const [termsSavedBanner, setTermsSavedBanner] = useState<string | null>(null);

  // Change Password & Verification state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isSendingVerifyEmail, setIsSendingVerifyEmail] = useState(false);

  // Delete My Account state
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // Log Out confirmation state
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Upgrade Ideas & Feedback from AI & Community
  const [upgradesList, setUpgradesList] = useState<UpgradeFeedbackItem[]>([]);
  const [newUpgradeTitle, setNewUpgradeTitle] = useState('');
  const [newUpgradeCategory, setNewUpgradeCategory] = useState<UpgradeCategory>('features');
  const [newUpgradeDetails, setNewUpgradeDetails] = useState('');
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [upgradeSubmittedNotice, setUpgradeSubmittedNotice] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'upgrade_feedback'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const items: UpgradeFeedbackItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as UpgradeFeedbackItem));
      setUpgradesList(items);
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userProfile?.privacySettings) {
      setPrivacySettings((prev) => ({ ...prev, ...userProfile.privacySettings }));
    }
    if (userProfile?.termsAgreement) {
      setTermsAgreement((prev) => ({ ...prev, ...userProfile.termsAgreement }));
    }
  }, [userProfile?.privacySettings, userProfile?.termsAgreement]);

  const isProUser = isProEffective;

  // Daily Login Reward & Habitual Engagement metrics
  const currentStreak = Math.max(1, userProfile?.loginStreak ?? 1);
  const totalWavePoints = userProfile?.wavePoints ?? DAILY_REWARD_SCHEDULE[0];
  const todayBonus =
    userProfile?.lastDailyRewardAmount ??
    DAILY_REWARD_SCHEDULE[(currentStreak - 1) % DAILY_REWARD_SCHEDULE.length];

  const handleSelectAppearanceTheme = async (themeId: AppearanceTheme, isProOnly: boolean) => {
    if (isProOnly && !isProUser && !isAdmin) {
      setGentleProNote('Try Pro to unlock the Sunset and River appearance themes.');
      return;
    }
    setGentleProNote(null);
    setAppearanceTheme(themeId);
    try {
      await updateUserProfile({ appearanceTheme: themeId });
    } catch (err) {
      console.error('Failed to save appearance theme to profile:', err);
    }
  };

  // File upload for profile picture from local folders (compressed for Firestore)
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 400, 400, 0.85);
      if (compressed) {
        setPhotoURL(compressed);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setPhotoURL(result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim() || undefined,
        proBorderEffect,
        proAccentColor,
        appearanceTheme
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePrivacySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrivacy(true);
    setPrivacySavedBanner(false);

    const updated: UserPrivacySettings = {
      ...privacySettings,
      updatedAt: new Date().toISOString()
    };

    try {
      if (currentUser?.uid) {
        localStorage.setItem(`wavelink_privacy_${currentUser.uid}`, JSON.stringify(updated));
      }
      await updateUserProfile({ privacySettings: updated });
      setPrivacySavedBanner(true);
      setTimeout(() => setPrivacySavedBanner(false), 3500);
    } catch (err) {
      console.error('Error saving privacy settings:', err);
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  const handleSaveTermsAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreement.accepted || !termsAgreement.communityCodeAccepted) {
      setTermsSavedBanner('Please check both agreement boxes to confirm your acceptance.');
      return;
    }

    setIsSavingTerms(true);
    setTermsSavedBanner(null);

    const updated: UserTermsAgreement = {
      ...termsAgreement,
      acceptedAt: new Date().toISOString()
    };

    try {
      if (currentUser?.uid) {
        localStorage.setItem(`wavelink_terms_${currentUser.uid}`, JSON.stringify(updated));
      }
      await updateUserProfile({ termsAgreement: updated });
      setTermsAgreement(updated);
      setTermsSavedBanner('Your Terms of Agreement preferences have been saved!');
      setTimeout(() => setTermsSavedBanner(null), 4000);
    } catch (err) {
      console.error('Error saving terms agreement:', err);
    } finally {
      setIsSavingTerms(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    const strength = validateStrongPassword(newPassword);
    if (!strength.valid) {
      setPasswordStatus({
        type: 'error',
        message: strength.message || 'Password must be at least 8 characters with letters and numbers.'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: 'error',
        message: 'New password and confirmation password do not match.'
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({
        type: 'success',
        message: 'Your password has been changed successfully!'
      });
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        message: err.message || 'Could not update password. Please try again.'
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSendResetLink = async () => {
    setPasswordStatus(null);
    setIsSendingResetEmail(true);
    try {
      await sendPasswordReset();
      setPasswordStatus({
        type: 'success',
        message: `Password reset link sent to ${currentUser?.email || 'your email'}!`
      });
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        message: err.message || 'Could not send password reset email right now.'
      });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleSendVerifyEmail = async () => {
    setPasswordStatus(null);
    setIsSendingVerifyEmail(true);
    try {
      await sendVerificationEmail();
      setPasswordStatus({
        type: 'success',
        message: `Verification email sent to ${currentUser?.email || 'your email'}. Please check your inbox!`
      });
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        message: err.message || 'Could not send verification email right now.'
      });
    } finally {
      setIsSendingVerifyEmail(false);
    }
  };

  const handleSubmitUserUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpgradeTitle.trim()) return;
    setIsSubmittingUpgrade(true);
    try {
      await recordUpgradeFeedback({
        source: 'user_manual',
        title: newUpgradeTitle.trim(),
        summary: newUpgradeDetails.trim() || newUpgradeTitle.trim(),
        userQuote: newUpgradeDetails.trim() || newUpgradeTitle.trim(),
        category: newUpgradeCategory,
        impact: 'high',
        userId: currentUser?.uid,
        userName: userProfile?.displayName || currentUser?.displayName || 'WaveLink Member',
        userEmail: currentUser?.email || undefined
      });
      setNewUpgradeTitle('');
      setNewUpgradeDetails('');
      setUpgradeSubmittedNotice('🎉 Thank you! Your upgrade suggestion has been sent directly to Platform Founder Keylan Mbilinyi.');
      setTimeout(() => setUpgradeSubmittedNotice(null), 5000);
    } catch {
      setUpgradeSubmittedNotice('Failed to submit suggestion. Please try again.');
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAccountError(null);
    setIsDeletingAccount(true);
    try {
      await deleteMyAccount(deleteAccountPassword || undefined);
    } catch (err: any) {
      setDeleteAccountError(
        err.message || 'Could not delete account right now. Please enter your current password and try again.'
      );
      setIsDeletingAccount(false);
    }
  };

  const handleLogOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const borderOptions: { id: ProBorderEffect; name: string; ringClass: string }[] = [
    { id: 'aura-gold', name: 'Golden Aura ✨', ringClass: 'pro-aura-gold ring-4 ring-amber-400' },
    { id: 'neon-pulse', name: 'Teal Breeze 🌊', ringClass: 'pro-aura-neon ring-4 ring-teal-400' },
    { id: 'emerald-ring', name: 'Emerald Wave 🌿', ringClass: 'pro-aura-emerald ring-4 ring-emerald-400' },
    { id: 'cosmic-glow', name: 'Sky Glow 💎', ringClass: 'pro-aura-cosmic ring-4 ring-[#2563EB]' },
    { id: 'none', name: 'Classic Clean', ringClass: 'ring-2 ring-blue-500/20' }
  ];

  const activeAgreementDoc =
    AGREEMENT_SECTIONS.find((s) => s.id === termsAgreement.selectedSection) || AGREEMENT_SECTIONS[0];

  return (
    <div className="w-full max-w-3xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-5 sm:space-y-6 overflow-x-hidden">
      {/* User Profile Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="relative shrink-0">
              <img
                src={
                  photoURL ||
                  userProfile?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Profile Avatar"
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ${
                  isProUser && proBorderEffect !== 'none'
                    ? borderOptions.find((b) => b.id === proBorderEffect)?.ringClass
                    : 'ring-2 ring-[#2563EB]/20'
                }`}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CrystalBadge
                  email={currentUser?.email}
                  name={userProfile?.displayName || displayName || 'Waver'}
                  isPro={isProUser}
                  hasBlueStar={isProUser}
                  isSubAdmin={isSubAdmin}
                  size="md"
                  showAdminTag={isAdmin}
                />
                <span className="text-xs font-mono font-bold text-[#2563EB] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/70">
                  {userProfile?.username || username}
                </span>
              </div>
              <p className="text-base sm:text-sm text-[#78716C] mt-1 max-w-xl break-words">
                {userProfile?.bio || bio || 'Connecting on WaveLink 🌊'}
              </p>
              {currentUser?.email && (
                <p className="text-[11px] text-[#78716C] mt-0.5 font-medium truncate">{currentUser.email}</p>
              )}
            </div>
          </div>

          {/* WavePoints, Streak & Quick Log Out Button */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsDailyRewardModalOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center gap-2 text-xs font-bold text-[#1C1917] hover:border-amber-300 transition"
            >
              <Coins size={15} className="text-[#D97706]" />
              <span>{totalWavePoints.toLocaleString()} pts</span>
              <span className="text-[#0D9488]">(+{todayBonus})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDailyRewardModalOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center gap-1.5 text-xs font-bold text-[#1C1917] hover:border-blue-300 transition"
            >
              <Flame size={15} className="text-[#D97706]" />
              <span>{currentStreak}d streak</span>
            </button>

            <button
              type="button"
              onClick={handleInviteFriends}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 text-xs font-bold transition active:scale-95"
              title="Invite Friends to WaveLink via WhatsApp"
            >
              <UserPlus size={14} className="text-emerald-600" />
              <span>Invite Friends</span>
            </button>

            <button
              type="button"
              onClick={handleLogOut}
              disabled={isLoggingOut}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 text-xs font-extrabold transition active:scale-95 disabled:opacity-50"
              title="Log Out of WaveLink"
            >
              <LogOut size={14} />
              <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
            </button>
          </div>
        </div>

        {/* Quiet Navigation Rows: WaveLink Pro & Admin Panel (only for admins) */}
        <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
          {/* Invite Friends on WhatsApp Row */}
          <button
            type="button"
            onClick={handleInviteFriends}
            className="w-full min-h-[54px] px-4 py-3 rounded-2xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/80 flex items-center justify-between gap-3 transition text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <UserPlus size={17} />
              </div>
              <div>
                <span className="text-sm font-bold text-[#1C1917] block">Invite Friends to WaveLink</span>
                <span className="text-xs text-emerald-800 block">
                  Share your link directly on WhatsApp or social apps to grow your circle
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="text-emerald-700 shrink-0" />
          </button>
          {/* Quiet WaveLink Pro Row */}
          <button
            type="button"
            onClick={() => setActiveSettingsSection(activeSettingsSection === 'pro' ? 'profile' : 'pro')}
            className="w-full min-h-[54px] px-4 py-3 rounded-2xl bg-[var(--bg-subtle)] hover:bg-teal-50/50 border border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0D9488] border border-teal-200/70 flex items-center justify-center shrink-0">
                <Crown size={17} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1C1917]">WaveLink Pro</span>
                  {isProUser && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#78716C] block">
                  {isProUser
                    ? 'All themes, Pro badge, and extra daily AI images unlocked'
                    : 'All light themes, Pro profile badge, and more daily AI images'}
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#78716C] shrink-0" />
          </button>

          {/* Admin Panel Row — Visible ONLY to Admin accounts */}
          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="w-full min-h-[54px] px-4 py-3 rounded-2xl bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 flex items-center justify-between gap-3 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                  <ShieldCheck size={17} />
                </div>
                <div>
                  <span className="text-sm font-bold text-[#1C1917] block">Admin Panel</span>
                  <span className="text-xs text-[#78716C] block">
                    Activity dashboard, complaints, banning users, and admin-only updates group
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#2563EB] shrink-0" />
            </button>
          )}
        </div>

        {/* Section Switcher Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSettingsSection('profile')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'profile'
                ? 'bg-[#2563EB] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <User size={14} />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('notifications')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'notifications'
                ? 'bg-[#2563EB] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Bell size={14} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('upgrades')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'upgrades'
                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Lightbulb size={14} />
            <span>AI Ideas ({upgradesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('privacy')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'privacy'
                ? 'bg-[#2563EB] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Lock size={14} />
            <span>Privacy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('security')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'security'
                ? 'bg-[#2563EB] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <KeyRound size={14} />
            <span>Password</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('terms')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'terms'
                ? 'bg-[#0D9488] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <FileText size={14} />
            <span>Terms</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('pro')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'pro'
                ? 'bg-[#0D9488] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Crown size={14} />
            <span>Pro</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSettingsSection('support')}
            className={`min-h-[42px] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeSettingsSection === 'support'
                ? 'bg-[#2563EB] text-white shadow-2xs font-bold'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <HelpCircle size={14} />
            <span>Support</span>
          </button>
        </div>
      </div>

      <DailyRewardModal
        isOpen={isDailyRewardModalOpen}
        onClose={() => setIsDailyRewardModalOpen(false)}
      />

      {/* =====================================================================
          SECTION: PUSH NOTIFICATIONS & ALERT SETTINGS
      ===================================================================== */}
      {activeSettingsSection === 'notifications' && <NotificationSettingsPanel />}

      {/* =====================================================================
          SECTION: AI UPGRADES & FEEDBACK INBOX
      ===================================================================== */}
      {activeSettingsSection === 'upgrades' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 rounded-3xl p-6 sm:p-7 text-white shadow-xl shadow-amber-950/20 border border-amber-300/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1 rounded-lg bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-2.5">
                <Lightbulb size={13} />
                WaveLink Upgrade Feedback
              </span>
              <span className="text-xs text-amber-100 font-medium">
                Autonomous AI Idea Collector
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Platform Upgrades &amp; Feature Feedback
            </h2>
            <p className="text-xs sm:text-sm text-amber-100/90 mt-1 max-w-2xl">
              Ideas, requests, and platform improvements collected across WELINK AI Chat, Live Talk voice sessions, and WaveLink Support Bot.
              {isAdmin && " You can also access full roadmap controls in the Admin Panel!"}
            </p>
          </div>

          {/* Submission Notice Banner */}
          {upgradeSubmittedNotice && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
              <span>{upgradeSubmittedNotice}</span>
              <button
                type="button"
                onClick={() => setUpgradeSubmittedNotice(null)}
                className="text-emerald-700 hover:text-emerald-950 text-xs px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>
          )}

          {/* User Suggestion Submission Form */}
          <form
            onSubmit={handleSubmitUserUpgrade}
            className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700">
                <Sparkles size={18} />
                <h3 className="font-extrabold text-sm text-[var(--text-primary)]">
                  Have an Idea to Improve WaveLink?
                </h3>
              </div>
              <span className="text-[11px] text-[#78716C]">
                Goes directly to Founder's Feedback
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-[#57534E] mb-1">
                  Feature or Upgrade Title:
                </label>
                <input
                  type="text"
                  required
                  value={newUpgradeTitle}
                  onChange={(e) => setNewUpgradeTitle(e.target.value)}
                  placeholder="e.g. Dark mode toggle, faster video reel scrubbing, live group audio..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#57534E] mb-1">
                  Category:
                </label>
                <select
                  value={newUpgradeCategory}
                  onChange={(e) => setNewUpgradeCategory(e.target.value as UpgradeCategory)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-semibold text-[#1C1917]"
                >
                  <option value="features">New Features</option>
                  <option value="ui_ux">UI &amp; Design</option>
                  <option value="media_sparks">Sparks &amp; Media</option>
                  <option value="video_calls">Video &amp; Voice Calls</option>
                  <option value="performance">Speed &amp; Performance</option>
                  <option value="monetization">Pro &amp; Creator Tipping</option>
                  <option value="other">General Idea</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#57534E] mb-1">
                Details &amp; Suggestions (Optional):
              </label>
              <textarea
                rows={2}
                value={newUpgradeDetails}
                onChange={(e) => setNewUpgradeDetails(e.target.value)}
                placeholder="Share how this upgrade would help you or other creators..."
                className="w-full p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={isSubmittingUpgrade || !newUpgradeTitle.trim()}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center gap-2 transition disabled:opacity-50"
              >
                <Lightbulb size={14} />
                <span>{isSubmittingUpgrade ? 'Submitting...' : 'Submit Upgrade Suggestion'}</span>
              </button>
            </div>
          </form>

          {/* Recent Collected Upgrades Feed */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-600" />
              <span>Collected Community Upgrade Ideas ({upgradesList.length})</span>
            </h3>

            {upgradesList.map((item) => (
              <div
                key={item.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 shadow-xs space-y-2 hover:border-amber-300 transition"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        item.status === 'new'
                          ? 'bg-blue-100 text-blue-800'
                          : item.status === 'planned'
                          ? 'bg-purple-100 text-purple-800'
                          : item.status === 'implemented'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      ● {item.status}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[var(--bg-subtle)] text-[#57534E]">
                      {item.source === 'live_talk' && '🎙️ Live Voice'}
                      {item.source === 'welink_ai' && '🤖 WELINK AI'}
                      {item.source === 'support_bot' && '💬 Support Bot'}
                      {item.source === 'user_manual' && '✍️ Direct'}
                    </span>
                    <span className="text-[10px] font-semibold text-[#0D9488] bg-teal-50 px-2 py-0.5 rounded-lg">
                      {item.category}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#78716C]">
                    {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold text-[var(--text-primary)]">
                  {item.title}
                </h4>
                <p className="text-xs text-[#57534E] leading-relaxed">
                  {item.summary}
                </p>

                {item.notes && (
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 font-medium">
                    <span className="font-bold text-amber-800">📌 Founder Note:</span> {item.notes}
                  </div>
                )}
              </div>
            ))}

            {upgradesList.length === 0 && (
              <div className="p-8 text-center bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl">
                <Lightbulb size={24} className="text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-[#57534E]">
                  No ideas submitted yet. Talk to WELINK AI, speak in Live Talk, or submit an idea above!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 1: PRIVACY SETTINGS (Choose the privacy settings)
      ===================================================================== */}
      {activeSettingsSection === 'privacy' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-200/70 flex items-center justify-center shrink-0">
                <Lock size={19} />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-[#1C1917]">
                  Choose Your Privacy Settings
                </h3>
                <p className="text-xs text-[#78716C]">
                  Control who can view your profile, see your online activity, message you, or call you.
                </p>
              </div>
            </div>
          </div>

          {privacySavedBanner && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />
              <span>Your privacy settings have been saved to your WaveLink profile!</span>
            </div>
          )}

          <form onSubmit={handleSavePrivacySettings} className="space-y-5">
            {/* 1. Profile Visibility */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                <Globe size={14} className="text-[#2563EB]" />
                <span>Profile &amp; Posts Visibility</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      id: 'public',
                      label: 'Public Community',
                      desc: 'Everyone on WaveLink can view your posts'
                    },
                    {
                      id: 'followers',
                      label: 'Followers Only',
                      desc: 'Only people you follow/approve'
                    },
                    {
                      id: 'private',
                      label: 'Private Mode',
                      desc: 'Hide profile from public directory'
                    }
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setPrivacySettings((prev) => ({ ...prev, profileVisibility: opt.id }))
                    }
                    className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-1 ${
                      privacySettings.profileVisibility === opt.id
                        ? 'border-[#2563EB] bg-blue-50/50 ring-2 ring-[#2563EB]/15'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-stone-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#1C1917]">{opt.label}</span>
                      {privacySettings.profileVisibility === opt.id && (
                        <CheckCircle2 size={15} className="text-[#2563EB]" />
                      )}
                    </div>
                    <span className="text-[11px] text-[#78716C]">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Who Can Message & Call You */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2">
                <label className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-[#0D9488]" />
                  <span>Who Can Send Direct Messages</span>
                </label>
                <select
                  value={privacySettings.allowDirectMessages}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      allowDirectMessages: e.target.value as UserPrivacySettings['allowDirectMessages']
                    }))
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="everyone">Everyone on WaveLink</option>
                  <option value="followers">Followers Only</option>
                  <option value="none">No One (Pause New Chats)</option>
                </select>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2">
                <label className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                  <PhoneCall size={14} className="text-[#2563EB]" />
                  <span>Who Can Call You (Voice &amp; Video)</span>
                </label>
                <select
                  value={privacySettings.allowCalls}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      allowCalls: e.target.value as UserPrivacySettings['allowCalls']
                    }))
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white border border-[var(--border-hairline)] text-xs font-bold text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="everyone">Everyone on WaveLink</option>
                  <option value="followers">Followers Only</option>
                  <option value="none">No One (Calls Off)</option>
                </select>
              </div>
            </div>

            {/* 3. 24-Hour Spark Story Audience */}
            <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                  <Users size={14} className="text-[#D97706]" />
                  <span>24-Hour Spark Audience</span>
                </span>
                <span className="text-[11px] text-[#78716C] block">
                  Choose who can view your multi-post daily Sparks at the top of the feed.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['everyone', 'followers'] as const).map((aud) => (
                  <button
                    key={aud}
                    type="button"
                    onClick={() =>
                      setPrivacySettings((prev) => ({ ...prev, sparkVisibility: aud }))
                    }
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                      privacySettings.sparkVisibility === aud
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-white text-[#78716C] border border-[var(--border-hairline)]'
                    }`}
                  >
                    {aud === 'everyone' ? 'Everyone' : 'Followers Only'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Activity & Presence Toggles */}
            <div className="space-y-2.5">
              {[
                {
                  key: 'showOnlineStatus' as const,
                  title: 'Show Online Status Indicator',
                  desc: 'Let community members see a green dot when you are active on WaveLink.'
                },
                {
                  key: 'showLastSeen' as const,
                  title: 'Show Last Seen Timestamp in Messages',
                  desc: 'Display when you were last active in Direct Message headers.'
                },
                {
                  key: 'showReadReceipts' as const,
                  title: 'Message Read Receipts',
                  desc: 'Show blue double-check ticks when you have read a message.'
                },
                {
                  key: 'allowSearchByEmail' as const,
                  title: 'Allow Members to Find Me by Email',
                  desc: 'Let friends find your profile using your registered email address.'
                }
              ].map((item) => {
                const isChecked = Boolean(privacySettings[item.key]);
                return (
                  <div
                    key={item.key}
                    onClick={() =>
                      setPrivacySettings((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                    className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-4 cursor-pointer hover:bg-stone-100/60 transition"
                  >
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-[#1C1917] block">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-[#78716C] block mt-0.5">{item.desc}</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChecked}
                      className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 ${
                        isChecked ? 'bg-[#0D9488]' : 'bg-stone-300'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          isChecked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Blocked Users Management */}
            <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1C1917] flex items-center gap-1.5">
                  <Ban size={14} className="text-rose-600" />
                  <span>Blocked Accounts ({(userProfile?.blockedUserIds || []).length})</span>
                </span>
              </div>
              {(userProfile?.blockedUserIds || []).length === 0 ? (
                <p className="text-[11px] text-[#78716C]">
                  You have not blocked any accounts. You can block or report users from any post or direct message.
                </p>
              ) : (
                <div className="space-y-2">
                  {(userProfile?.blockedUserIds || []).map((blockedId) => (
                    <div
                      key={blockedId}
                      className="px-3.5 py-2 rounded-xl bg-white border border-[var(--border-hairline)] flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-[#1C1917]">User ID: {blockedId.substring(0, 14)}...</span>
                      <button
                        type="button"
                        onClick={() => toggleBlockUser(blockedId)}
                        className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-[#1C1917] font-bold text-[11px] transition"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSavingPrivacy}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
              >
                <Save size={16} />
                <span>{isSavingPrivacy ? 'Saving Privacy Settings...' : 'Save Privacy Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          SECTION 2: CHANGE PASSWORD, EMAIL VERIFICATION, LOG OUT & DELETE ACCOUNT
      ===================================================================== */}
      {activeSettingsSection === 'security' && (
        <div className="space-y-6">
          {/* Email Verification Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-200/70 flex items-center justify-center shrink-0">
                <Mail size={19} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-base text-[#1C1917]">Email Verification</h4>
                  {currentUser?.emailVerified || isAdmin ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-[#0D9488] border border-emerald-200">
                      Verified ✓
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                      Unverified
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#78716C] mt-0.5">
                  {currentUser?.emailVerified || isAdmin
                    ? `Your email (${currentUser?.email}) is verified for posting and messaging.`
                    : `Verify ${currentUser?.email || 'your email'} to keep your account protected before posting or messaging.`}
                </p>
              </div>
            </div>

            {!currentUser?.emailVerified && !isAdmin && (
              <button
                type="button"
                onClick={handleSendVerifyEmail}
                disabled={isSendingVerifyEmail}
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-2 transition disabled:opacity-50"
              >
                <Mail size={14} />
                <span>{isSendingVerifyEmail ? 'Sending...' : 'Send Verification Email'}</span>
              </button>
            )}
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200/70 flex items-center justify-center shrink-0">
                  <KeyRound size={19} />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-[#1C1917]">
                    Change Your Password
                  </h3>
                  <p className="text-xs text-[#78716C]">
                    Minimum 8 characters with both letters and numbers, or request a password reset email.
                  </p>
                </div>
              </div>
            </div>

            {passwordStatus && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                  passwordStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {passwordStatus.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-amber-600 shrink-0" />
                )}
                <span>{passwordStatus.message}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  Current Password <span className="text-[#78716C] font-normal">(recommended for security verification)</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-2.5 text-[#78716C] hover:text-[#1C1917]"
                    aria-label="Toggle current password visibility"
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    New Password (8+ chars, letters &amp; numbers)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 chars with letters & numbers"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-[#78716C] hover:text-[#1C1917]"
                      aria-label="Toggle new password visibility"
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword || !newPassword.trim()}
                  className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  <KeyRound size={16} />
                  <span>{isChangingPassword ? 'Updating Password...' : 'Update Password'}</span>
                </button>

                {currentUser?.email && (
                  <button
                    type="button"
                    onClick={handleSendResetLink}
                    disabled={isSendingResetEmail}
                    className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition"
                  >
                    <Mail size={14} />
                    <span>
                      {isSendingResetEmail ? 'Sending Reset Email...' : 'Send Password Reset Email'}
                    </span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Dedicated Log Out Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h4 className="font-extrabold text-base text-[#1C1917]">Sign Out of WaveLink</h4>
              <p className="text-xs text-[#78716C] mt-0.5">
                Safely log out of your account ({currentUser?.email || userProfile?.username || 'current session'}) on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogOut}
              disabled={isLoggingOut}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              <LogOut size={16} />
              <span>{isLoggingOut ? 'Logging Out...' : 'Log Out'}</span>
            </button>
          </div>

          {/* Delete My Account Card */}
          <div className="bg-[var(--bg-surface)] border border-rose-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h4 className="font-extrabold text-base text-rose-900 flex items-center gap-2">
                  <Trash2 size={17} className="text-rose-600" />
                  <span>Delete My Account &amp; Data</span>
                </h4>
                <p className="text-xs text-[#78716C] mt-0.5 max-w-xl">
                  Permanently delete your WaveLink profile, published waves, 24-hour Sparks, and account credentials. This action cannot be undone.
                </p>
              </div>
              {!showDeleteAccountConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountConfirm(true)}
                  className="px-4 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs transition"
                >
                  Delete My Account
                </button>
              )}
            </div>

            {showDeleteAccountConfirm && (
              <form
                onSubmit={handleConfirmDeleteAccount}
                className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-3"
              >
                <p className="text-xs font-bold text-rose-900">
                  Are you sure you want to permanently erase your WaveLink account and data?
                </p>
                {deleteAccountError && (
                  <div className="p-2.5 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-semibold">
                    {deleteAccountError}
                  </div>
                )}
                <input
                  type="password"
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  placeholder="Enter your password to confirm deletion (optional for Google sign-in)"
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-rose-200 text-xs text-[#1C1917]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isDeletingAccount}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition disabled:opacity-50"
                  >
                    {isDeletingAccount ? 'Deleting Account & Data...' : 'Permanently Delete My Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteAccountConfirm(false);
                      setDeleteAccountPassword('');
                      setDeleteAccountError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-[#57534E] font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 3: CHOOSE & READ THE TERMS OF AGREEMENT
      ===================================================================== */}
      {activeSettingsSection === 'terms' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200/70 flex items-center justify-center shrink-0">
                <BookOpen size={19} />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-[#1C1917]">
                  Choose &amp; Read the Terms of Agreement
                </h3>
                <p className="text-xs text-[#78716C]">
                  Select any agreement section below to read the full policy and manage your agreement status.
                </p>
              </div>
            </div>

            {termsAgreement.accepted && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#0D9488] border border-emerald-200 text-xs font-extrabold">
                <CheckCircle2 size={13} />
                <span>Agreement Active (v{termsAgreement.acceptedVersion})</span>
              </span>
            )}
          </div>

          {/* Step 1: Choose which Agreement Document to Read */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-[#1C1917] block">
              Choose Agreement Section to Read:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {AGREEMENT_SECTIONS.map((sec) => {
                const isSelected = termsAgreement.selectedSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() =>
                      setTermsAgreement((prev) => ({ ...prev, selectedSection: sec.id }))
                    }
                    className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-1 ${
                      isSelected
                        ? 'border-[#0D9488] bg-teal-50/50 ring-2 ring-[#0D9488]/15'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-stone-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#1C1917]">{sec.title}</span>
                      {isSelected && <Check size={14} className="text-[#0D9488] shrink-0" />}
                    </div>
                    <span className="text-[11px] text-[#78716C]">{sec.summary}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Full Interactive Reader Box */}
          <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--border-hairline)] pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0D9488] bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  {activeAgreementDoc.badge}
                </span>
                <h4 className="font-extrabold text-sm sm:text-base text-[#1C1917] mt-1">
                  {activeAgreementDoc.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedLegalDoc(
                    termsAgreement.selectedSection === 'data_protection'
                      ? 'privacy'
                      : termsAgreement.selectedSection === 'creator_monetization'
                      ? 'refund'
                      : 'terms'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-bold transition"
              >
                Open in Full Legal Modal
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {activeAgreementDoc.clauses.map((clause, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white border border-[var(--border-hairline)] space-y-1"
                >
                  <h5 className="text-xs sm:text-sm font-extrabold text-[#1C1917] flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-[#0D9488] shrink-0" />
                    <span>{clause.heading}</span>
                  </h5>
                  <p className="text-xs text-[#57534E] leading-relaxed pl-5">{clause.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Step 3: Agreement Checkboxes & Save Button */}
          <form onSubmit={handleSaveTermsAgreement} className="space-y-3 pt-1">
            {termsSavedBanner && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />
                <span>{termsSavedBanner}</span>
              </div>
            )}

            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] cursor-pointer">
              <input
                type="checkbox"
                checked={termsAgreement.accepted}
                onChange={(e) =>
                  setTermsAgreement((prev) => ({ ...prev, accepted: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 rounded text-[#0D9488] focus:ring-[#0D9488]"
              />
              <span className="text-xs text-[#1C1917] font-semibold leading-relaxed">
                I have read and agree to the <strong>WaveLink Terms of Service Agreement</strong> and{' '}
                <strong>Data Protection Policy</strong>.
              </span>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] cursor-pointer">
              <input
                type="checkbox"
                checked={termsAgreement.communityCodeAccepted}
                onChange={(e) =>
                  setTermsAgreement((prev) => ({
                    ...prev,
                    communityCodeAccepted: e.target.checked
                  }))
                }
                className="mt-0.5 w-4 h-4 rounded text-[#0D9488] focus:ring-[#0D9488]"
              />
              <span className="text-xs text-[#1C1917] font-semibold leading-relaxed">
                I agree to follow the <strong>WaveLink Community Code of Conduct</strong> and keep interactions welcoming and respectful.
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <button
                type="submit"
                disabled={isSavingTerms}
                className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
              >
                <Shield size={16} />
                <span>{isSavingTerms ? 'Saving Agreement...' : 'Confirm & Save Terms Agreement'}</span>
              </button>

              {termsAgreement.acceptedAt && (
                <span className="text-[11px] text-[#78716C] font-medium">
                  Last confirmed: {new Date(termsAgreement.acceptedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Simple WaveLink Pro Screen */}
      {activeSettingsSection === 'pro' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-xs font-bold">
                <Crown size={13} />
                <span>{isProUser ? 'WaveLink Pro Active' : 'WaveLink Pro Membership'}</span>
              </span>
              <h3 className="text-2xl font-extrabold text-[#1C1917] mt-2">
                Calm, creative upgrades for your community space
              </h3>
              <p className="text-sm text-[#78716C] mt-1">
                Everything you need to personalize your profile and create more every day.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-2xl sm:text-3xl font-black text-[#1C1917] block">
                TZS 18,000
              </span>
              <span className="text-xs text-[#78716C] font-medium">per month</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              'All 4 light appearance themes (Classic, Sunrise, Sunset & River)',
              'More daily AI image creations in WELINK Guide',
              'Small Pro badge next to your name on your profile and posts',
              'Pro avatar aura rings and profile post editing',
              '100MB HD video uploads (Free tier: 0 KB – 4 MB) and HD calling',
              'Clean, ad-free community feed experience'
            ].map((benefit, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs sm:text-sm text-[#1C1917]"
              >
                <CheckCircle2 size={16} className="text-[#0D9488] shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            {isAdmin ? (
              <div className="w-full py-3.5 px-5 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200 text-sm font-bold text-center">
                Included with your Admin account
              </div>
            ) : (
              /* ONE MAIN BUTTON ON PRO SCREEN */
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
              >
                <Sparkles size={18} />
                <span>{isProUser ? 'Renew WaveLink Pro' : 'Pay TZS 18,000 with Mobile Money'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {activeSettingsSection === 'support' && <SupportDeskView />}

      {selectedLegalDoc && (
        <LegalModal
          isOpen={true}
          initialDoc={selectedLegalDoc}
          onClose={() => setSelectedLegalDoc(null)}
        />
      )}

      {activeSettingsSection === 'profile' && (
        <div className="space-y-6">
          {/* Quick Settings Shortcuts Card (Terms, Privacy, Password, Log Out) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-5 shadow-xs space-y-3">
            <h3 className="font-extrabold text-[#1C1917] text-sm px-1">
              Account, Privacy &amp; Legal Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveSettingsSection('terms')}
                className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] hover:bg-teal-50/60 border border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0D9488] border border-teal-200 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-[#1C1917] block">
                      Terms of Agreement
                    </span>
                    <span className="text-[11px] text-[#78716C] block">
                      Choose &amp; read platform terms
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#78716C]" />
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsSection('privacy')}
                className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] hover:bg-blue-50/60 border border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] border border-blue-200 flex items-center justify-center shrink-0">
                    <Lock size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-[#1C1917] block">
                      Privacy Settings
                    </span>
                    <span className="text-[11px] text-[#78716C] block">
                      Visibility, calls &amp; online status
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#78716C]" />
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsSection('security')}
                className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] hover:bg-blue-50/60 border border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#D97706] border border-amber-200 flex items-center justify-center shrink-0">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-[#1C1917] block">
                      Change Password
                    </span>
                    <span className="text-[11px] text-[#78716C] block">
                      Update password or reset link
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#78716C]" />
              </button>

              <button
                type="button"
                onClick={handleLogOut}
                disabled={isLoggingOut}
                className="p-3.5 rounded-2xl bg-rose-50/70 hover:bg-rose-100/80 border border-rose-200 flex items-center justify-between gap-3 transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <LogOut size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-rose-900 block">
                      {isLoggingOut ? 'Logging Out...' : 'Log Out'}
                    </span>
                    <span className="text-[11px] text-rose-700 block">
                      Sign out of your WaveLink session
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-rose-700" />
              </button>
            </div>
          </div>

          {/* Appearance Section: 4 Light Themes saved to Firestore */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#D97706] border border-amber-200/80 flex items-center justify-center">
                  <Palette size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#1C1917] text-base">
                    Appearance
                  </h3>
                  <p className="text-xs text-[#78716C]">
                    Choose a warm, light theme. Saved to your profile across all your devices.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APPEARANCE_THEMES.map((item) => {
                const isSelected = appearanceTheme === item.id;
                const isLocked = item.proOnly && !isProUser && !isAdmin;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectAppearanceTheme(item.id, item.proOnly)}
                    className={`min-h-[68px] p-4 rounded-2xl border text-left transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-[#2563EB] bg-[var(--bg-subtle)] ring-2 ring-[#2563EB]/15'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        <span
                          className="w-6 h-6 rounded-full border border-stone-300 shadow-2xs"
                          style={{ backgroundColor: item.previewBg }}
                        />
                        <span
                          className="w-6 h-6 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: item.previewAccent }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-[#1C1917]">{item.name}</span>
                          {item.proOnly ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
                              Pro
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-[#78716C]">
                              Free
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#78716C] block truncate">
                          {item.description}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <span className="w-6 h-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center">
                          <Check size={13} />
                        </span>
                      ) : isLocked ? (
                        <span className="text-[11px] font-bold text-[#0D9488]">Try Pro</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Gentle inline Try Pro note (never a blocking popup) */}
            {gentleProNote && (
              <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200 text-xs text-[#1C1917] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-[#0D9488] shrink-0" />
                  <span>{gentleProNote}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSettingsSection('pro')}
                    className="px-3 py-1.5 rounded-xl bg-[#0D9488] text-white font-bold text-xs hover:bg-teal-700 transition"
                  >
                    Try Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setGentleProNote(null)}
                    className="p-1 text-[#78716C] hover:text-[#1C1917]"
                    aria-label="Close note"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Battery Saver Mode Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    isBatterySaver
                      ? 'bg-emerald-50 text-[#0D9488] border-emerald-200'
                      : 'bg-[var(--bg-subtle)] text-[#78716C] border-[var(--border-hairline)]'
                  }`}
                >
                  <BatteryCharging size={19} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-[#1C1917] text-base">
                      Battery Saver Mode
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isBatterySaver
                          ? 'bg-emerald-50 text-[#0D9488] border border-emerald-200'
                          : 'bg-stone-100 text-[#78716C]'
                      }`}
                    >
                      {isBatterySaver ? 'Active' : 'Standard'}
                    </span>
                    {deviceBatteryInfo && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] font-mono text-[10px] font-bold">
                        Device: {deviceBatteryInfo.level}%{deviceBatteryInfo.charging ? ' ⚡' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#78716C] mt-0.5 max-w-xl leading-relaxed">
                    Reduces UI animations, backdrop blur filters, vibration haptics, and background media preloading while increasing active network status checks (every 6s when open) to prevent wasted background retries.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isBatterySaver}
                onClick={() => setBatterySaver(!isBatterySaver)}
                className={`min-h-[42px] px-4 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  isBatterySaver
                    ? 'bg-[#0D9488] text-white shadow-2xs'
                    : 'bg-[var(--bg-subtle)] hover:bg-stone-200/70 text-[#1C1917] border border-[var(--border-hairline)]'
                }`}
              >
                <Zap size={14} className={isBatterySaver ? 'text-white' : 'text-[#0D9488]'} />
                <span>{isBatterySaver ? 'Battery Saver On' : 'Turn On Battery Saver'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <span className="font-bold text-[#1C1917] block">Reduced Motion &amp; GPU</span>
                <span className="text-[11px] text-[#78716C]">
                  Disables decorative animations, transitions &amp; backdrop blurs
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <span className="font-bold text-[#1C1917] block">Smart Network Checks</span>
                <span className="text-[11px] text-[#78716C]">
                  6s foreground connectivity checks &amp; zero background tab polling
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <span className="font-bold text-[#1C1917] block">Essential Tasks Ready</span>
                <span className="text-[11px] text-[#78716C]">
                  Feed, Sparks, Reels, Chat &amp; Calls stay 100% responsive
                </span>
              </div>
            </div>
          </div>

          {/* Profile Form with ONE main button */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-[#1C1917] text-base">
                Edit Profile
              </h3>
              <p className="text-xs text-[#78716C] mt-0.5">
                Update your name, username, bio, and profile photo.
              </p>
            </div>

            {saveSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />
                <span>Profile saved!</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <img
                  src={
                    photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                  }
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-[#2563EB]/20"
                />
                <div className="flex-1 space-y-1.5">
                  <span className="text-xs font-bold text-[#1C1917] block">
                    Profile Photo
                  </span>
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-bold cursor-pointer transition">
                    <Upload size={14} />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-3 text-[#2563EB]" size={15} />
                    <input
                      type="text"
                      required
                      value={username.startsWith('@') ? username.substring(1) : username}
                      onChange={(e) => setUsername(`@${e.target.value.replace(/[^a-zA-Z0-9_]/g, '')}`)}
                      maxLength={35}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  placeholder="Share a short greeting with the community..."
                  className="w-full p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
                />
              </div>

              {/* ONE MAIN BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  <Save size={16} />
                  <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3-Step Mobile Money Payment Modal */}
      {isPaymentModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => setIsPaymentModalOpen(false)}
        />
      )}

      {/* Small Toast for Invite Friends action */}
      {inviteToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold transition-all transform animate-in fade-in slide-in-from-bottom-2 ${
            inviteToast.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-900/20'
              : 'bg-emerald-800 text-white shadow-emerald-950/30'
          }`}
        >
          {inviteToast.type === 'error' ? (
            <X size={15} className="shrink-0 text-rose-200" />
          ) : (
            <Check size={15} className="shrink-0 text-emerald-300" />
          )}
          <span>{inviteToast.message}</span>
        </div>
      )}
    </div>
  );
};
