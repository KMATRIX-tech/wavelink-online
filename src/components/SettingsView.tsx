import React, { useState, useEffect } from 'react';
import { useAuth, DAILY_REWARD_SCHEDULE, getLocalDateKey } from '../context/AuthContext';
import { useTheme, APPEARANCE_THEMES } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useSimpleMode } from '../context/SimpleModeContext';
import { useDataSaver } from '../services/dataSaverService';
import { INTEREST_CATALOG } from './InterestPickerModal';
import {
  AFRICAN_COUNTRIES,
  PAN_AFRICAN_LANGUAGES,
  KANGA_PATTERN_FRAMES,
  getAfricanCountryMeta,
  getKangaFrameClass,
  formatLocalPrice,
  useAfricanRegion
} from '../utils/africanCultureConfig';
import { CreatorAnalyticsView } from './CreatorAnalyticsView';
import { AddToHomeScreenHintCard } from './PWAInstallButton';
import {
  AppearanceTheme,
  ProBorderEffect,
  ProAccentColor,
  UserPrivacySettings,
  UserTermsAgreement,
  AfricanCountryCode,
  EastAfricanCurrency,
  PanAfricanLanguageCode,
  KangaPatternFrame,
  Post,
  Spark,
  UserProfile,
  CallRecipient,
  StoryHighlightItem
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
  Bell,
  BarChart3,
  Compass,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Camera,
  Flag,
  Grid,
  Heart,
  Layers,
  MessageCircle,
  MoreVertical,
  Pin,
  Play,
  RotateCcw,
  Settings,
  Share2,
  Tag,
  UserCheck,
  Video
} from 'lucide-react';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

import { inviteFriends, sharePost } from '../utils/share.js';
import { LegalModal, LegalDocType } from './LegalModals';
import {
  compressProfileImageToBlob,
  ProfileStorageUploadError,
  uploadProfileImageToCloudinary,
  validateProfileImageFile
} from '../utils/mediaStorage';
import { validateStrongPassword } from '../utils/security';
import {
  db,
  formatCloudinaryUploadError,
  formatEmailVerificationError,
  extractSafeFirebaseAuthCode,
  fetchUserProfileCached,
  getCachedUserProfile,
  setCachedUserProfile,
  sanitizeShortHttpsUrl
} from '../firebase';
import {
  collection,
  doc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  setDoc,
  where
} from 'firebase/firestore';
import { UpgradeFeedbackItem, UpgradeCategory } from '../types';
import { recordUpgradeFeedback } from '../services/upgradeFeedbackService';

import { ThemePickerPanel } from './ThemePickerPanel';
import { ProfileCoverBanner, ProfileCoverModal } from './ProfileCoverModal';
import { Avatar } from './Avatar';
import { usePresence } from '../context/PresenceContext';
import { formatPresenceSubtitle } from '../utils/presenceFormat';
import {
  FollowersListModal,
  ProfileBadgesRow,
  ProfilePostViewerModal,
  StoryHighlightsBar
} from './ProfileSocialModals';

interface SettingsViewProps {
  onOpenAdminPanel?: () => void;
  viewedUserId?: string | null;
  onSelectUserProfile?: (userId: string | null) => void;
  onStartChatWithUser?: (userId: string) => void;
  onStartCallWithUser?: (recipient: CallRecipient, callType: 'voice' | 'video') => void;
}

type SettingsSection =
  | 'profile'
  | 'edit_profile'
  | 'settings_hub'
  | 'appearance'
  | 'stats'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'terms'
  | 'pro'
  | 'support'
  | 'upgrades';

type ProfileContentTab = 'posts' | 'reels' | 'saved' | 'tagged';

const DEFAULT_PRIVACY_SETTINGS: UserPrivacySettings = {
  profileVisibility: 'public',
  showOnlineStatus: true,
  showLastSeen: true,
  onlineStatusAudience: 'everyone',
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
        body: 'WaveLink Pro unlocks 25 daily AI image creations, all light appearance themes, Blue Star verification eligibility, and ad-free browsing. Payments are explained in TZS, KES, and UGX via M-Pesa, Mixx by Yas (Tigo Pesa), and Airtel Money.'
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
        heading: 'Private Messaging, Calls & Presence',
        body: 'Direct messages and WebRTC voice/video calls are protected by strict access rules. Online presence (online/offline + lastChanged) and ephemeral typing indicators use Firebase Realtime Database with zero GPS, IP, or device tracking. You can turn off your online status, hide last seen, or restrict it to Close Friends Only at any time in Privacy Settings.'
      },
      {
        heading: 'Your Data Control Rights',
        body: 'You can update your profile, export or modify your privacy preferences, change your password, or permanently delete your account and data at any time in Settings → Password & Security.'
      }
    ]
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenAdminPanel,
  viewedUserId,
  onSelectUserProfile,
  onStartChatWithUser,
  onStartCallWithUser
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isSubAdmin,
    adminCheckFailedReason,
    isProEffective,
    isVerified,
    updateUserProfile,
    toggleSavePost,
    reportContent,
    changeUserPassword,
    sendPasswordReset,
    sendVerificationEmail,
    toggleBlockUser,
    deleteMyAccount,
    signOut
  } = useAuth();
  const { appearanceTheme, setAppearanceTheme, saveAppearanceTheme, isBatterySaver, setBatterySaver } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isSimpleMode, toggleSimpleMode } = useSimpleMode();
  const { enabled: isDataSaverOn, setEnabled: setDataSaverOn, formattedSaved } = useDataSaver();
  const {
    countryCode,
    currency,
    panAfricanLang,
    setCountryCode,
    setCurrency,
    setPanAfricanLang
  } = useAfricanRegion(
    userProfile?.countryCode,
    userProfile?.preferredCurrency,
    userProfile?.panAfricanLanguage
  );
  const activeCountryCode = userProfile?.countryCode || countryCode;
  const activeCountryMeta = getAfricanCountryMeta(activeCountryCode);
  const activeCurrency = userProfile?.preferredCurrency || currency;
  const activePanLang = userProfile?.panAfricanLanguage || panAfricanLang;
  const activePatternFrame: KangaPatternFrame = userProfile?.patternFrame || 'none';
  const isKangaBgEnabled = Boolean(userProfile?.kangaBackgroundEnabled);

  // Viewed user profile support (own profile vs viewing another person's profile)
  const [internalViewedUserId, setInternalViewedUserId] = useState<string | null>(
    viewedUserId || null
  );
  useEffect(() => {
    setInternalViewedUserId(viewedUserId || null);
  }, [viewedUserId]);

  const effectiveTargetUid =
    internalViewedUserId && internalViewedUserId !== currentUser?.uid
      ? internalViewedUserId
      : currentUser?.uid || '';
  const isOwnProfile = !internalViewedUserId || internalViewedUserId === currentUser?.uid;

  const [viewedOtherProfile, setViewedOtherProfile] = useState<UserProfile | null>(null);
  const [isLoadingOtherProfile, setIsLoadingOtherProfile] = useState<boolean>(false);

  // Read target profile once and cache in memory
  useEffect(() => {
    if (isOwnProfile || !effectiveTargetUid) {
      setViewedOtherProfile(null);
      return;
    }
    let cancelled = false;
    const cached = getCachedUserProfile(effectiveTargetUid);
    if (cached) {
      setViewedOtherProfile(cached);
    } else {
      setIsLoadingOtherProfile(true);
    }

    fetchUserProfileCached(effectiveTargetUid)
      .then((fetched) => {
        if (!cancelled && fetched) {
          setViewedOtherProfile(fetched);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOtherProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, effectiveTargetUid]);

  const activeProfile: UserProfile | null = isOwnProfile ? userProfile : viewedOtherProfile;

  // Profile redesign interactive states
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileContentTab>('posts');
  const [isBioExpanded, setIsBioExpanded] = useState<boolean>(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState<boolean>(false);
  const [followersModalTab, setFollowersModalTab] = useState<'followers' | 'following' | null>(null);
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState<boolean>(false);
  const [selectedViewerPostId, setSelectedViewerPostId] = useState<string | null>(null);

  // Person's Posts, Saved Posts, Tagged Posts, Active 24h Sparks, and Follower IDs
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [savedPostsList, setSavedPostsList] = useState<Post[]>([]);
  const [taggedPostsList, setTaggedPostsList] = useState<Post[]>([]);
  const [activeUserSparks, setActiveUserSparks] = useState<Spark[]>([]);
  const [followerUserIds, setFollowerUserIds] = useState<string[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(true);
  const [visiblePostsCount, setVisiblePostsCount] = useState<number>(12);
  const postsGridSectionRef = React.useRef<HTMLDivElement | null>(null);

  // Load person's posts, followers, and active 24h Sparks with cleanup
  useEffect(() => {
    if (!effectiveTargetUid) {
      setUserPosts([]);
      setIsLoadingPosts(false);
      return;
    }
    let cancelled = false;
    setIsLoadingPosts(true);
    setVisiblePostsCount(12);

    const loadProfileContent = async () => {
      try {
        // 1. Fetch user's posts
        const postsQ = query(
          collection(db, 'posts'),
          where('authorId', '==', effectiveTargetUid),
          limit(48)
        );
        const postsSnap = await getDocs(postsQ);
        if (!cancelled) {
          const list = postsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Post))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setUserPosts(list);
        }

        // 2. Fetch followers for this user
        const followsQ = query(
          collection(db, 'follows'),
          where('targetUserId', '==', effectiveTargetUid),
          limit(100)
        );
        const followsSnap = await getDocs(followsQ);
        if (!cancelled) {
          const fIds = followsSnap.docs
            .map((d) => String(d.data().followerId || ''))
            .filter(Boolean);
          setFollowerUserIds(Array.from(new Set(fIds)));
        }

        // 3. Fetch active 24h Sparks for this user
        const sparksQ = query(
          collection(db, 'sparks'),
          where('authorId', '==', effectiveTargetUid),
          limit(12)
        );
        const sparksSnap = await getDocs(sparksQ);
        if (!cancelled) {
          const nowMs = Date.now();
          const sparks = sparksSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Spark))
            .filter((sp) => !sp.expiresAt || new Date(sp.expiresAt).getTime() > nowMs)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setActiveUserSparks(sparks);
        }

        // 4. Fetch recent community posts where @username is mentioned/tagged
        const targetHandle = (
          (isOwnProfile ? userProfile?.username : viewedOtherProfile?.username) || ''
        )
          .trim()
          .toLowerCase();
        if (targetHandle) {
          const recentQ = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40));
          const recentSnap = await getDocs(recentQ);
          if (!cancelled) {
            const cleanHandle = targetHandle.startsWith('@') ? targetHandle : `@${targetHandle}`;
            const tagged = recentSnap.docs
              .map((d) => ({ id: d.id, ...d.data() } as Post))
              .filter(
                (p) =>
                  p.authorId !== effectiveTargetUid &&
                  typeof p.content === 'string' &&
                  p.content.toLowerCase().includes(cleanHandle)
              );
            setTaggedPostsList(tagged);
          }
        } else if (!cancelled) {
          setTaggedPostsList([]);
        }
      } catch {
        // Offline or cached fallback
      } finally {
        if (!cancelled) setIsLoadingPosts(false);
      }
    };

    loadProfileContent();
    return () => {
      cancelled = true;
    };
  }, [effectiveTargetUid, isOwnProfile, userProfile?.username, viewedOtherProfile?.username]);

  // Load saved posts when on own profile and Saved tab is selected
  useEffect(() => {
    if (!isOwnProfile || activeProfileTab !== 'saved') return;
    const savedIds = userProfile?.savedPostIds || [];
    if (savedIds.length === 0) {
      setSavedPostsList([]);
      return;
    }
    let cancelled = false;
    const loadSaved = async () => {
      try {
        const recentSnap = await getDocs(
          query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(60))
        );
        if (cancelled) return;
        const matched = recentSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Post))
          .filter((p) => savedIds.includes(p.id));
        setSavedPostsList(matched);
      } catch {
        // ignore
      }
    };
    loadSaved();
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, activeProfileTab, userProfile?.savedPostIds]);

  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>(() => {
    if (typeof window !== 'undefined') {
      const requested = localStorage.getItem('wavelink_settings_initial_section');
      if (
        requested === 'notifications' ||
        requested === 'stats' ||
        requested === 'appearance'
      ) {
        localStorage.removeItem('wavelink_settings_initial_section');
        return requested;
      }
    }
    return 'profile';
  });

  useEffect(() => {
    const openNotificationsSection = () => {
      try {
        localStorage.removeItem('wavelink_settings_initial_section');
      } catch {
        // ignore
      }
      setActiveSettingsSection('notifications');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    try {
      const requested = localStorage.getItem('wavelink_settings_initial_section');
      if (requested === 'notifications') {
        openNotificationsSection();
      }
    } catch {
      // ignore
    }

    window.addEventListener('wavelink:open-notification-settings', openNotificationsSection);
    return () => {
      window.removeEventListener('wavelink:open-notification-settings', openNotificationsSection);
    };
  }, []);
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
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarUploadError, setAvatarUploadError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [lastFailedAvatarFile, setLastFailedAvatarFile] = useState<File | null>(null);
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
  const [verifyLinkSent, setVerifyLinkSent] = useState(false);
  const [verifyCooldownSeconds, setVerifyCooldownSeconds] = useState(0);
  const [verifyErrorCode, setVerifyErrorCode] = useState<string | null>(null);
  const [reloadedEmailVerified, setReloadedEmailVerified] = useState(false);

  useEffect(() => {
    if (verifyCooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setVerifyCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verifyCooldownSeconds]);

  useEffect(() => {
    const checkReloadVerified = async () => {
      if (!currentUser || currentUser.emailVerified || reloadedEmailVerified) return;
      try {
        await currentUser.reload();
        if (currentUser.emailVerified) {
          await currentUser.getIdToken(true).catch(() => {});
          setReloadedEmailVerified(true);
          setVerifyLinkSent(false);
          setPasswordStatus({
            type: 'success',
            message: 'Email verified'
          });
        }
      } catch {
        // ignore transient reload error
      }
    };
    const onFocus = () => {
      checkReloadVerified().catch(() => {});
    };
    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        checkReloadVerified().catch(() => {});
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [currentUser, reloadedEmailVerified]);

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

  const handleSelectAppearanceTheme = async (themeId: AppearanceTheme, _isProOnly: boolean) => {
    setGentleProNote(null);
    const result = await saveAppearanceTheme(themeId);
    if (!result.success && result.error) {
      setGentleProNote(`Could not save theme (${result.error}).`);
    }
  };

  // File upload for profile picture directly to Cloudinary (monarcking72)
  const uploadAvatarFileToFirebase = async (file: File) => {
    setAvatarUploadError(null);
    setAvatarUploadProgress(0);

    const validation = validateProfileImageFile(file);
    if (!validation.valid) {
      const msg =
        validation.error || 'Only image files (JPG, PNG, WebP, or GIF) are allowed.';
      setAvatarUploadError({
        message: msg,
        code: validation.errorCode || 'cloudinary/invalid-file-type'
      });
      setLastFailedAvatarFile(null);
      return;
    }

    if (!currentUser?.uid) {
      setAvatarUploadError({
        message: 'Please sign in before uploading a profile photo.',
        code: 'cloudinary/unauthenticated'
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const compressedBlob = await compressProfileImageToBlob(file, {
        maxWidth: 512,
        maxHeight: 512,
        targetMaxBytes: 220 * 1024,
        mimeType: 'image/jpeg'
      });
      const uploaded = await uploadProfileImageToCloudinary({
        uid: currentUser.uid,
        folder: 'avatars',
        blob: compressedBlob,
        contentType: 'image/jpeg',
        onProgress: (pct) => setAvatarUploadProgress(pct)
      });

      setPhotoURL(uploaded.downloadUrl);
      await updateUserProfile({ photoURL: uploaded.downloadUrl });
      setLastFailedAvatarFile(null);
    } catch (err: any) {
      if (err instanceof ProfileStorageUploadError) {
        console.error('[WaveLink Avatar Upload Failed]', {
          code: err.code,
          message: err.message,
          rawError: err
        });
        setAvatarUploadError({ message: err.friendlyMessage, code: err.code });
      } else {
        const formatted = formatCloudinaryUploadError(err, { action: 'upload-avatar' });
        setAvatarUploadError({ message: formatted.friendlyMessage, code: formatted.code });
      }
      setLastFailedAvatarFile(file);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadAvatarFileToFirebase(file);
  };

  const saveProfileChanges = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setProfileSaveError(null);

    try {
      const safeAvatar = sanitizeShortHttpsUrl(photoURL.trim(), 500) || undefined;

      await updateUserProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        photoURL: safeAvatar,
        proBorderEffect,
        proAccentColor,
        appearanceTheme
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      const code = err?.code ? ` (${err.code})` : '';
      setProfileSaveError(
        `${err?.message || 'Could not save profile changes to Firestore.'}${code}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfileChanges();
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
        message:
          strength.message ||
          'Password must be between 8 and 24 characters and contain at least one letter and one number.'
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
    setVerifyErrorCode(null);
    if (!currentUser?.email) {
      setPasswordStatus({
        type: 'error',
        message: 'No email address is linked to this account.'
      });
      return;
    }
    if (verifyCooldownSeconds > 0) {
      setPasswordStatus({
        type: 'error',
        message: `Please wait ${verifyCooldownSeconds} seconds before resending the verification email.`
      });
      return;
    }

    setIsSendingVerifyEmail(true);
    try {
      await sendVerificationEmail();
      setVerifyLinkSent(true);
      setVerifyErrorCode(null);
      setVerifyCooldownSeconds(60);
      setPasswordStatus({
        type: 'success',
        message: 'Verification link sent. Check your inbox and spam folder.'
      });
    } catch (err: any) {
      const formatted = formatEmailVerificationError(err);
      const code = formatted.code || extractSafeFirebaseAuthCode(err);
      setVerifyErrorCode(code);
      setPasswordStatus({
        type: 'error',
        message: formatted.message || 'Could not send verification email right now.'
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

  // Derived profile display values (supports both Own Profile and Viewed Other User Profile)
  const displayedName = isOwnProfile
    ? userProfile?.displayName || displayName || currentUser?.displayName || 'Waver'
    : activeProfile?.displayName || 'WaveLink Member';
  const rawHandle = isOwnProfile
    ? userProfile?.username || username || '@waver'
    : activeProfile?.username || '@waver';
  const displayedUsername = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
  const displayedBio = isOwnProfile
    ? userProfile?.bio || bio || 'Connecting on WaveLink 🌊'
    : activeProfile?.bio || 'Connecting on WaveLink 🌊';
  const displayedAvatar = isOwnProfile
    ? photoURL ||
      userProfile?.photoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
    : activeProfile?.photoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${effectiveTargetUid || 'user'}`;

  const isDisplayedUserPro = isOwnProfile
    ? isProUser
    : Boolean(
        activeProfile?.isPro ||
          activeProfile?.hasBlueStar ||
          activeProfile?.isVerifiedByAdmin ||
          activeProfile?.role === 'admin' ||
          activeProfile?.role === 'super_admin' ||
          activeProfile?.role === 'sub_admin' ||
          activeProfile?.isSubAdmin
      );

  const isDisplayedUserVerified = isOwnProfile
    ? Boolean(isVerified || isProUser)
    : Boolean(
        activeProfile?.hasBlueStar ||
          activeProfile?.isVerifiedByAdmin ||
          activeProfile?.proBadge === 'verified' ||
          activeProfile?.role === 'admin' ||
          activeProfile?.role === 'super_admin'
      );

  const viewedPresence = usePresence(effectiveTargetUid || undefined, activeProfile);
  const isDisplayedUserOnline = viewedPresence.status === 'online';
  const profilePresenceSubtitle =
    viewedPresence.status === 'online' || viewedPresence.status === 'offline'
      ? formatPresenceSubtitle({
          isOnline: viewedPresence.status === 'online',
          lastChanged: viewedPresence.lastChanged,
          lastSeenIso: activeProfile?.lastSeenAt || activeProfile?.lastSeen,
          language: language === 'sw' ? 'sw' : 'en',
          showLastSeen: viewedPresence.canShowLastSeen
        })
      : '';

  const hasActiveStoryRing = activeUserSparks.length > 0;
  const displayedWavePoints = isOwnProfile
    ? totalWavePoints
    : activeProfile?.wavePoints ?? activeProfile?.points ?? 0;
  const displayedFollowingIds = isOwnProfile
    ? userProfile?.followingIds || []
    : activeProfile?.followingIds || [];
  const myFollowingIds = userProfile?.followingIds || [];
  const isFollowingViewedUser = Boolean(
    !isOwnProfile && effectiveTargetUid && myFollowingIds.includes(effectiveTargetUid)
  );
  const myCloseFriendIds = userProfile?.closeFriendIds || [];
  const isViewedUserCloseFriend = Boolean(
    !isOwnProfile && effectiveTargetUid && myCloseFriendIds.includes(effectiveTargetUid)
  );
  const handleToggleCloseFriend = async (targetUid: string) => {
    if (!currentUser || !targetUid || targetUid === currentUser.uid) return;
    const currentCloseFriends = userProfile?.closeFriendIds || [];
    const exists = currentCloseFriends.includes(targetUid);
    const nextCloseFriends = exists
      ? currentCloseFriends.filter((id) => id !== targetUid)
      : [...currentCloseFriends, targetUid];
    try {
      await updateUserProfile({ closeFriendIds: nextCloseFriends });
      setInviteToast({
        message: !exists
          ? language === 'sw'
            ? 'Ameongezwa kwenye Marafiki wa Karibu!'
            : 'Added to Close Friends!'
          : language === 'sw'
          ? 'Ameondolewa kwenye Marafiki wa Karibu.'
          : 'Removed from Close Friends.',
        type: 'success'
      });
      setTimeout(() => setInviteToast(null), 2600);
    } catch {
      // ignore offline
    }
  };
  const isViewedUserBlocked = Boolean(
    !isOwnProfile &&
      effectiveTargetUid &&
      (userProfile?.blockedUserIds || []).includes(effectiveTargetUid)
  );

  // Private account check when viewing another user's profile
  const isViewedAccountPrivateAndLocked = Boolean(
    !isOwnProfile &&
      !isAdmin &&
      activeProfile?.privacySettings?.profileVisibility === 'private' &&
      !isFollowingViewedUser
  );

  // Follow / Unfollow handler
  const handleToggleFollowUser = async (targetUid: string, targetDisplayName?: string) => {
    if (!currentUser || !targetUid || targetUid === currentUser.uid) return;
    const currentList = userProfile?.followingIds || [];
    const alreadyFollowing = currentList.includes(targetUid);
    const nextFollowing = alreadyFollowing
      ? currentList.filter((id) => id !== targetUid)
      : [...currentList, targetUid];

    try {
      await updateUserProfile({ followingIds: nextFollowing });
      const followDocId = `${currentUser.uid}_${targetUid}`;
      if (alreadyFollowing) {
        await deleteDoc(doc(db, 'follows', followDocId)).catch(() => {});
        if (targetUid === effectiveTargetUid) {
          setFollowerUserIds((prev) => prev.filter((id) => id !== currentUser.uid));
        }
      } else {
        await setDoc(
          doc(db, 'follows', followDocId),
          {
            id: followDocId,
            followerId: currentUser.uid,
            followerName: userProfile?.displayName || currentUser.displayName || 'Waver',
            targetUserId: targetUid,
            targetUserName: targetDisplayName || displayedName,
            createdAt: new Date().toISOString()
          },
          { merge: true }
        ).catch(() => {});
        if (targetUid === effectiveTargetUid) {
          setFollowerUserIds((prev) => Array.from(new Set([...prev, currentUser.uid])));
        }
      }
    } catch {
      // ignore offline
    }
  };

  // Share Profile handler
  const handleShareProfile = async () => {
    const profileUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?user=${encodeURIComponent(displayedUsername)}`
        : 'https://wavelink.app';
    try {
      const res = await sharePost({
        title: `${displayedName} (${displayedUsername}) on WaveLink`,
        text: `${displayedName} (${displayedUsername}) — ${displayedBio}`,
        url: profileUrl
      });
      if (res?.method === 'clipboard') {
        setInviteToast({
          message:
            language === 'sw'
              ? 'Kiungo cha wasifu kimenakiliwa!'
              : 'Profile link copied to clipboard!',
          type: 'success'
        });
        setTimeout(() => setInviteToast(null), 3000);
      }
    } catch {
      // ignore
    }
  };

  // Pin / Unpin Post handler
  const handleTogglePinPost = async (postId: string) => {
    if (!isOwnProfile) return;
    const nextPinned = userProfile?.pinnedPostId === postId ? '' : postId;
    await updateUserProfile({ pinnedPostId: nextPinned });
    setInviteToast({
      message: nextPinned
        ? language === 'sw'
          ? 'Chapisho limebandikwa juu ya wasifu wako!'
          : 'Post pinned to top of your profile!'
        : language === 'sw'
        ? 'Chapisho limeondolewa juu.'
        : 'Post unpinned.',
      type: 'success'
    });
    setTimeout(() => setInviteToast(null), 2600);
  };

  // Save custom cover handler
  const handleSaveCustomCover = async (coverData: {
    coverType: UserProfile['coverType'];
    coverPresetId?: UserProfile['coverPresetId'];
    coverImageUrl?: string;
  }) => {
    await updateUserProfile({
      coverType: coverData.coverType,
      coverPresetId: coverData.coverPresetId,
      coverImageUrl: coverData.coverImageUrl
    });
    setInviteToast({
      message:
        language === 'sw' ? 'Jalada la wasifu limehifadhiwa!' : 'Profile cover updated!',
      type: 'success'
    });
    setTimeout(() => setInviteToast(null), 2600);
  };

  // Compute sorted posts for active tab (Pinned post always first on Posts tab)
  const pinnedPostId = activeProfile?.pinnedPostId || '';
  const sortedUserPosts = [...userPosts].sort((a, b) => {
    if (pinnedPostId) {
      if (a.id === pinnedPostId && b.id !== pinnedPostId) return -1;
      if (b.id === pinnedPostId && a.id !== pinnedPostId) return 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const userReelsList = sortedUserPosts.filter(
    (p) => Boolean(p.videoUrl) || p.mediaType === 'video'
  );

  const currentTabPosts: Post[] =
    activeProfileTab === 'posts'
      ? sortedUserPosts
      : activeProfileTab === 'reels'
      ? userReelsList
      : activeProfileTab === 'saved'
      ? savedPostsList
      : taggedPostsList;

  const paginatedTabPosts = currentTabPosts.slice(0, visiblePostsCount);

  // Reusable Reference Menu Cards (shown below header on mobile, and in right side panel on desktop >= 1280px)
  const renderReferenceMenuCards = () => {
    if (!isOwnProfile) {
      return (
        <div className="space-y-3">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              {language === 'sw' ? 'Tuzo na Beji' : 'Badges & Achievements'}
            </h3>
            <ProfileBadgesRow
              profile={activeProfile}
              isProEffective={isDisplayedUserPro}
              isVerifiedEffective={isDisplayedUserVerified}
              language={language === 'sw' ? 'sw' : 'en'}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setInternalViewedUserId(null);
              onSelectUserProfile?.(null);
            }}
            className="wavelink-profile-menu-row"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                <ArrowLeft size={18} />
              </div>
              <div>
                <span className="text-sm font-extrabold text-[var(--text-primary)] block">
                  {language === 'sw' ? 'Rudi kwenye Wasifu Wangu' : 'Back to My Profile'}
                </span>
                <span className="text-xs text-[var(--text-secondary)] block">
                  {language === 'sw' ? 'Fungua mipangilio na machapisho yako' : 'Manage your own profile & settings'}
                </span>
              </div>
            </div>
            <span className="wavelink-profile-menu-arrow">
              <ChevronRight size={16} />
            </span>
          </button>
        </div>
      );
    }

    const menuItems = [
      {
        id: 'edit_profile',
        icon: <User size={18} className="text-[#2563EB]" />,
        iconBg: 'bg-blue-500/15 border-blue-500/25',
        label: language === 'sw' ? 'Hariri wasifu' : 'Edit profile',
        onClick: () => setActiveSettingsSection('edit_profile')
      },
      {
        id: 'wavepoints',
        icon: <Coins size={18} className="text-amber-500" />,
        iconBg: 'bg-amber-500/15 border-amber-500/25',
        label:
          language === 'sw'
            ? `WavePoints zangu na mfululizo (${ currentStreak }d)`
            : `My WavePoints & check-in streak`,
        onClick: () => setIsDailyRewardModalOpen(true)
      },
      {
        id: 'saved_posts',
        icon: <Bookmark size={18} className="text-[#0D9488]" />,
        iconBg: 'bg-teal-500/15 border-teal-500/25',
        label: language === 'sw' ? 'Machapisho yaliyohifadhiwa' : 'Saved posts',
        onClick: () => {
          setActiveSettingsSection('profile');
          setActiveProfileTab('saved');
          postsGridSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      {
        id: 'themes',
        icon: <Palette size={18} className="text-purple-500" />,
        iconBg: 'bg-purple-500/15 border-purple-500/25',
        label: language === 'sw' ? 'Mandhari na muonekano' : 'Themes and backgrounds',
        onClick: () => setActiveSettingsSection('appearance')
      },
      {
        id: 'notifications',
        icon: <Bell size={18} className="text-blue-500" />,
        iconBg: 'bg-blue-500/15 border-blue-500/25',
        label: language === 'sw' ? 'Arifa (Notifications)' : 'Notifications',
        onClick: () => setActiveSettingsSection('notifications')
      },
      {
        id: 'privacy',
        icon: <Lock size={18} className="text-emerald-500" />,
        iconBg: 'bg-emerald-500/15 border-emerald-500/25',
        label: language === 'sw' ? 'Faragha na usalama' : 'Privacy and security',
        onClick: () => setActiveSettingsSection('privacy')
      },
      {
        id: 'settings',
        icon: <Settings size={18} className="text-sky-500" />,
        iconBg: 'bg-sky-500/15 border-sky-500/25',
        label: language === 'sw' ? 'Mipangilio' : 'Settings',
        onClick: () => setActiveSettingsSection('settings_hub')
      },
      {
        id: 'help',
        icon: <HelpCircle size={18} className="text-rose-500" />,
        iconBg: 'bg-rose-500/15 border-rose-500/25',
        label: language === 'sw' ? 'Msaada' : 'Help',
        onClick: () => setActiveSettingsSection('support')
      }
    ];

    return (
      <div className="space-y-3">
        {/* 1. Highlight Card in Brand Accent Gradient */}
        <button
          type="button"
          onClick={() => setActiveSettingsSection('pro')}
          className="wavelink-profile-pro-highlight"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center shrink-0">
              <Crown size={21} className="text-amber-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base text-white truncate">
                  {isProUser
                    ? language === 'sw'
                      ? 'Manufaa Yako ya WaveLink Pro'
                      : 'Explore WaveLink Pro Perks'
                    : language === 'sw'
                    ? 'Chunguza WaveLink Pro'
                    : 'Explore WaveLink Pro'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider text-white">
                  {isProUser ? 'Active' : 'Go Pro'}
                </span>
              </div>
              <span className="text-xs text-white/90 block truncate mt-0.5">
                {isProUser
                  ? language === 'sw'
                    ? 'Majalada maalum, video za sekunde 90 na beji ya Pro'
                    : 'Custom covers, 90s HD video reels & Pro badge active'
                  : language === 'sw'
                  ? 'Fungua majalada maalum, beji ya Pro na picha za AI'
                  : 'Unlock custom covers, Pro badge & 90s HD video reels'}
              </span>
            </div>
          </div>
          <span className="w-9 h-9 rounded-full bg-white text-[var(--accent-primary)] flex items-center justify-center shrink-0 shadow-sm">
            <ArrowUpRight size={18} />
          </span>
        </button>

        {/* 2. Stack of Rounded Menu Rows (min-height 56px, short labels, icon + label + small arrow) */}
        <div className="wavelink-profile-menu-stack">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="wavelink-profile-menu-row"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${item.iconBg}`}
                >
                  {item.icon}
                </div>
                <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                  {item.label}
                </span>
              </div>
              <span className="wavelink-profile-menu-arrow">
                <ChevronRight size={16} />
              </span>
            </button>
          ))}

          {/* Admin Panel quick row if admin */}
          {(isAdmin ||
            adminCheckFailedReason === 'owner sign-in not used' ||
            adminCheckFailedReason === 'session needs refresh') &&
            onOpenAdminPanel && (
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="wavelink-profile-menu-row"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} />
                  </div>
                  <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                    {language === 'sw' ? 'Dashibodi ya Admin' : 'Admin Panel'}
                  </span>
                </div>
                <span className="wavelink-profile-menu-arrow">
                  <ChevronRight size={16} />
                </span>
              </button>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="wavelink-profile-shell">
      {/* =====================================================================
          1. REDESIGNED PROFILE HEADER (Mobile < 1024px & Desktop >= 1024px)
      ===================================================================== */}
      <section
        className={`wavelink-profile-header-card ${
          isKangaBgEnabled ? 'kanga-pattern-subtle' : ''
        }`}
      >
        {/* Top Cover Image (180px on mobile, 232px on desktop) with soft gradient fade */}
        <ProfileCoverBanner
          profile={activeProfile}
          activeTheme={appearanceTheme}
          isOwnProfile={isOwnProfile}
          isProUser={isProUser}
          language={language === 'sw' ? 'sw' : 'en'}
          onOpenCoverPicker={() => setIsCoverModalOpen(true)}
          onOpenUpgradePro={() => setActiveSettingsSection('pro')}
        />

        {/* Back to My Profile banner when viewing another person's profile */}
        {!isOwnProfile && (
          <div className="px-4 pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setInternalViewedUserId(null);
                onSelectUserProfile?.(null);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>{language === 'sw' ? 'Wasifu Wangu' : 'My Profile'}</span>
            </button>
          </div>
        )}

        <div className="wavelink-profile-header-inner">
          {/* Avatar overlapping bottom of cover with story ring & realtime RTDB presence dot */}
          <div className="wavelink-profile-top-bar">
            <div className="relative">
              <div
                className={`wavelink-profile-avatar-ring ${
                  hasActiveStoryRing ? 'wavelink-profile-avatar-ring--story' : ''
                } ${
                  activePatternFrame !== 'none' && isOwnProfile
                    ? getKangaFrameClass(activePatternFrame)
                    : ''
                }`}
              >
                <Avatar
                  uid={effectiveTargetUid || undefined}
                  src={displayedAvatar}
                  alt={displayedName}
                  fallbackName={displayedName}
                  size="2xl"
                  showStatus={true}
                  onlyWhenVisible={false}
                  targetProfile={activeProfile}
                  priority={true}
                  className="!w-full !h-full"
                  imageClassName="border-[3px] border-[var(--bg-surface)]"
                />
              </div>

              {/* Country flag badge */}
              <span
                className="absolute -bottom-1 -left-1 z-20 text-xs leading-none bg-[var(--bg-surface)] rounded-full px-1.5 py-0.5 shadow-xs border border-[var(--border-hairline)]"
                title={activeCountryMeta.nameEn}
              >
                {getAfricanCountryMeta(activeProfile?.countryCode || activeCountryCode).flag}
              </span>
            </div>
          </div>

          {/* Identity, Bio (3 lines max + "more"), Stats Row, Badges, and Action Buttons */}
          <div className="wavelink-profile-identity-col">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight truncate">
                    {displayedName}
                  </h1>

                  {/* Verified Tick */}
                  {isDisplayedUserVerified && (
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2563EB] text-white shrink-0 shadow-2xs"
                      title={language === 'sw' ? 'Akaunti Imethibitishwa' : 'Verified Account'}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}

                  {/* Pro Badge */}
                  {isDisplayedUserPro && (
                    <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs">
                      <Crown size={11} />
                      <span>Pro</span>
                    </span>
                  )}

                  {isOwnProfile && isAdmin && (
                    <CrystalBadge
                      userId={currentUser?.uid}
                      email={currentUser?.email}
                      name={displayedName}
                      isPro={isProUser}
                      hasBlueStar={isProUser}
                      isSubAdmin={isSubAdmin}
                      weeklyWinnerUntil={userProfile?.weeklyWinnerUntil}
                      size="sm"
                      showAdminTag={true}
                    />
                  )}
                </div>

                {/* @username + Realtime Online / Last seen status */}
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-xs sm:text-sm font-mono font-bold text-[var(--accent-primary)]">
                    {displayedUsername}
                  </span>
                  {profilePresenceSubtitle && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isDisplayedUserOnline
                          ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isDisplayedUserOnline ? 'bg-[#22c55e]' : 'bg-[#ef4444]'
                        }`}
                      />
                      <span>{profilePresenceSubtitle}</span>
                    </span>
                  )}
                  {hasActiveStoryRing && (
                    <span className="text-[11px] font-bold text-[#0D9488] bg-teal-500/10 px-2 py-0.5 rounded-full">
                      ● {activeUserSparks.length} {language === 'sw' ? 'Spark Mpya' : 'Active Spark'}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Own Profile vs Other Person's Profile */}
              <div className="wavelink-profile-actions-row lg:w-auto">
                {isOwnProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSettingsSection(
                          activeSettingsSection === 'edit_profile' ? 'profile' : 'edit_profile'
                        )
                      }
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <User size={15} />
                      <span>{language === 'sw' ? 'Hariri wasifu' : 'Edit profile'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                    >
                      <Share2 size={15} className="text-[var(--accent-primary)]" />
                      <span>{language === 'sw' ? 'Shiriki wasifu' : 'Share profile'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCoverModalOpen(true)}
                      title={language === 'sw' ? 'Badili Jalada' : 'Change Cover'}
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera size={15} className="text-[var(--accent-primary)]" />
                      <span className="hidden sm:inline">
                        {language === 'sw' ? 'Jalada' : 'Cover'}
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleFollowUser(effectiveTargetUid, displayedName)}
                      className={`flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                        isFollowingViewedUser
                          ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                          : 'bg-[var(--accent-primary)] text-white shadow-xs'
                      }`}
                    >
                      {isFollowingViewedUser ? (
                        <>
                          <UserCheck size={16} />
                          <span>{language === 'sw' ? 'Unafuata' : 'Following'}</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          <span>{language === 'sw' ? 'Fuata' : 'Follow'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onStartChatWithUser && effectiveTargetUid) {
                          onStartChatWithUser(effectiveTargetUid);
                        } else if (effectiveTargetUid) {
                          window.dispatchEvent(
                            new CustomEvent('wavelink:start-chat', {
                              detail: { userId: effectiveTargetUid }
                            })
                          );
                        }
                      }}
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <MessageCircle size={16} className="text-[var(--accent-primary)]" />
                      <span>{language === 'sw' ? 'Ujumbe' : 'Message'}</span>
                    </button>

                    {/* Call Icon Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onStartCallWithUser && effectiveTargetUid) {
                          onStartCallWithUser(
                            {
                              id: effectiveTargetUid,
                              name: displayedName,
                              username: displayedUsername,
                              photoURL: displayedAvatar
                            },
                            'voice'
                          );
                        } else if (onStartChatWithUser && effectiveTargetUid) {
                          onStartChatWithUser(effectiveTargetUid);
                        }
                      }}
                      aria-label={`Call ${displayedName}`}
                      title={language === 'sw' ? 'Piga Simu' : 'Voice / Video Call'}
                      className="min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] flex items-center justify-center transition active:scale-95 cursor-pointer"
                    >
                      <PhoneCall size={16} className="text-[#0D9488]" />
                    </button>

                    {/* More Menu: Block & Report */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                        aria-label="More profile actions"
                        className="min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] flex items-center justify-center transition cursor-pointer"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {isOtherMenuOpen && (
                        <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xl p-1.5 z-30 space-y-1">
                          <button
                            type="button"
                            onClick={async () => {
                              setIsOtherMenuOpen(false);
                              if (effectiveTargetUid) {
                                await handleToggleCloseFriend(effectiveTargetUid);
                              }
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-emerald-500/10 text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-2 text-left cursor-pointer"
                          >
                            <Heart
                              size={14}
                              className={
                                isViewedUserCloseFriend
                                  ? 'text-emerald-500 fill-emerald-500'
                                  : 'text-emerald-600'
                              }
                            />
                            <span>
                              {isViewedUserCloseFriend
                                ? language === 'sw'
                                  ? 'Ondoa Rafiki wa Karibu'
                                  : 'Close Friend ✓'
                                : language === 'sw'
                                ? 'Ongeza Rafiki wa Karibu'
                                : 'Add to Close Friends'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              setIsOtherMenuOpen(false);
                              if (effectiveTargetUid) {
                                await toggleBlockUser(effectiveTargetUid);
                              }
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-rose-500/10 text-rose-600 text-xs font-extrabold flex items-center gap-2 text-left cursor-pointer"
                          >
                            <Ban size={14} />
                            <span>
                              {isViewedUserBlocked
                                ? language === 'sw'
                                  ? 'Ondoa Kizuizi (Unblock)'
                                  : 'Unblock User'
                                : language === 'sw'
                                ? 'Zuia Akaunti (Block)'
                                : 'Block User'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              setIsOtherMenuOpen(false);
                              if (effectiveTargetUid) {
                                await reportContent({
                                  targetType: 'user',
                                  targetId: effectiveTargetUid,
                                  targetAuthorId: effectiveTargetUid,
                                  targetSummary: `${displayedName} (${displayedUsername})`,
                                  reason: 'Reported profile from user profile menu'
                                });
                              }
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-xl hover:bg-amber-500/10 text-amber-600 text-xs font-extrabold flex items-center gap-2 text-left cursor-pointer"
                          >
                            <Flag size={14} />
                            <span>
                              {language === 'sw' ? 'Ripoti Akaunti' : 'Report Account'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bio (3 lines max with "more" toggle) */}
            <div className="max-w-2xl">
              <p
                className={`text-sm text-[var(--text-primary)] leading-relaxed break-words ${
                  !isBioExpanded ? 'line-clamp-3' : ''
                }`}
              >
                {displayedBio}
              </p>
              {(displayedBio.length > 120 || displayedBio.split('\n').length > 3) && (
                <button
                  type="button"
                  onClick={() => setIsBioExpanded((prev) => !prev)}
                  className="text-xs font-extrabold text-[var(--accent-primary)] mt-0.5 hover:underline cursor-pointer"
                >
                  {isBioExpanded
                    ? language === 'sw'
                      ? 'ficha'
                      : 'less'
                    : language === 'sw'
                    ? '...zaidi'
                    : '...more'}
                </button>
              )}
            </div>

            {/* Row of Stats: Posts, Followers, Following, WavePoints */}
            <div className="wavelink-profile-stats-row">
              <button
                type="button"
                onClick={() => {
                  setActiveSettingsSection('profile');
                  setActiveProfileTab('posts');
                  postsGridSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="wavelink-profile-stat-item cursor-pointer"
              >
                <span className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                  {userPosts.length.toLocaleString()}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  {language === 'sw' ? 'Machapisho' : 'Posts'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFollowersModalTab('followers')}
                className="wavelink-profile-stat-item cursor-pointer"
              >
                <span className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                  {followerUserIds.length.toLocaleString()}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  {language === 'sw' ? 'Wafuasi' : 'Followers'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFollowersModalTab('following')}
                className="wavelink-profile-stat-item cursor-pointer"
              >
                <span className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                  {displayedFollowingIds.length.toLocaleString()}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  {language === 'sw' ? 'Anaowafuata' : 'Following'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isOwnProfile) setIsDailyRewardModalOpen(true);
                }}
                className="wavelink-profile-stat-item cursor-pointer"
              >
                <span className="text-base sm:text-lg font-extrabold text-amber-500 flex items-center gap-1">
                  <Coins size={14} className="shrink-0" />
                  {displayedWavePoints.toLocaleString()}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  WavePoints
                </span>
              </button>
            </div>

            {/* Badges & Achievements Row (with tap tooltips explaining how each was earned) */}
            <ProfileBadgesRow
              profile={activeProfile}
              isProEffective={isDisplayedUserPro}
              isVerifiedEffective={isDisplayedUserVerified}
              language={language === 'sw' ? 'sw' : 'en'}
            />
          </div>
        </div>
      </section>

      {/* Sub-Section Back Navigation Bar when inside a specific Settings view */}
      {activeSettingsSection !== 'profile' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSettingsSection('profile')}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={15} />
            <span>{language === 'sw' ? 'Rudi kwenye Wasifu' : 'Back to Profile'}</span>
          </button>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'edit_profile', label: language === 'sw' ? 'Hariri' : 'Edit Profile' },
                { id: 'appearance', label: language === 'sw' ? 'Mandhari' : 'Themes' },
                { id: 'privacy', label: language === 'sw' ? 'Faragha' : 'Privacy' },
                { id: 'security', label: language === 'sw' ? 'Nenosiri' : 'Password' },
                { id: 'notifications', label: language === 'sw' ? 'Arifa' : 'Notifications' },
                { id: 'stats', label: language === 'sw' ? 'Takwimu' : 'Stats' },
                { id: 'pro', label: 'Pro' },
                { id: 'settings_hub', label: language === 'sw' ? 'Mipangilio' : 'All Settings' },
                { id: 'support', label: language === 'sw' ? 'Msaada' : 'Help' }
              ] as { id: SettingsSection; label: string }[]
            ).map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSettingsSection(sec.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                  activeSettingsSection === sec.id
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <DailyRewardModal
        isOpen={isDailyRewardModalOpen}
        onClose={() => setIsDailyRewardModalOpen(false)}
      />

      <ProfileCoverModal
        isOpen={isCoverModalOpen}
        onClose={() => setIsCoverModalOpen(false)}
        uid={currentUser?.uid}
        isProUser={isProUser}
        currentCoverType={userProfile?.coverType}
        currentPresetId={userProfile?.coverPresetId}
        currentCoverImageUrl={userProfile?.coverImageUrl}
        language={language === 'sw' ? 'sw' : 'en'}
        onSaveCover={handleSaveCustomCover}
        onOpenUpgradePro={() => setActiveSettingsSection('pro')}
      />

      <FollowersListModal
        isOpen={Boolean(followersModalTab)}
        initialTab={followersModalTab || 'followers'}
        onClose={() => setFollowersModalTab(null)}
        followerIds={followerUserIds}
        followingIds={displayedFollowingIds}
        myFollowingIds={myFollowingIds}
        currentUserId={currentUser?.uid}
        language={language === 'sw' ? 'sw' : 'en'}
        onToggleFollow={handleToggleFollowUser}
        onSelectUserProfile={(uid) => {
          setInternalViewedUserId(uid);
          onSelectUserProfile?.(uid);
          setActiveSettingsSection('profile');
        }}
        onStartChatWithUser={onStartChatWithUser}
      />

      <ProfilePostViewerModal
        isOpen={Boolean(selectedViewerPostId)}
        posts={currentTabPosts}
        initialPostId={selectedViewerPostId}
        onClose={() => setSelectedViewerPostId(null)}
        currentUserId={currentUser?.uid}
        pinnedPostId={pinnedPostId}
        savedPostIds={userProfile?.savedPostIds || []}
        isOwnProfile={isOwnProfile}
        language={language === 'sw' ? 'sw' : 'en'}
        onTogglePinPost={handleTogglePinPost}
        onToggleSavePost={toggleSavePost}
        onPostUpdated={(updated) => {
          setUserPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }}
      />

      {/* =====================================================================
          SECTION: APPEARANCE (THEMES & BACKGROUNDS)
      ===================================================================== */}
      {activeSettingsSection === 'appearance' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-[#2563EB] border border-blue-500/25 flex items-center justify-center shrink-0">
                <Palette size={20} />
              </div>
              <div>
                <h2 className="font-extrabold text-[var(--text-primary)] text-base sm:text-lg">
                  {language === 'sw'
                    ? 'Muonekano na Mandhari (Themes & Backgrounds)'
                    : 'Appearance • Themes & Backgrounds'}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {language === 'sw'
                    ? 'Chagua muonekano wowote bure. Hakikisha moja kwa moja kabla ya kuhifadhi.'
                    : 'Anyone can pick any theme for free. Tap to live-preview across the app before saving.'}
                </p>
              </div>
            </div>
          </div>

          <ThemePickerPanel onOpenUpgradePro={() => setActiveSettingsSection('pro')} />
        </div>
      )}

      {/* =====================================================================
          SECTION: PHASE 5 PRIVATE CREATOR STATS (7 & 30 DAYS)
      ===================================================================== */}
      {activeSettingsSection === 'stats' && (
        <CreatorAnalyticsView
          embeddedInProfile
          onOpenUpgradeModal={() => setActiveSettingsSection('pro')}
        />
      )}

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
                  title: 'Show my online status',
                  desc: 'Let friends see a green dot when you are online (default ON). Like WhatsApp, turning this off also hides other users’ online status and last seen from you.'
                },
                {
                  key: 'showLastSeen' as const,
                  title: 'Show last seen timestamp',
                  desc: 'Display when you were last active (e.g. "Last seen 5 min ago") in chat headers and your profile.'
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

              {/* Online Status Audience Selector (Everyone / Close Friends Only / Nobody) */}
              {privacySettings.showOnlineStatus && (
                <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-3">
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-[#1C1917] block">
                      Who can see my online status &amp; last seen
                    </span>
                    <span className="text-[11px] text-[#78716C] block mt-0.5">
                      Choose between everyone, only your Close Friends list, or nobody. Blocked users never see your status.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'everyone', label: 'Everyone' },
                        { id: 'close_friends', label: 'Close Friends Only' },
                        { id: 'nobody', label: 'Nobody' }
                      ] as const
                    ).map((opt) => {
                      const activeAud =
                        (privacySettings.onlineStatusAudience || 'everyone') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setPrivacySettings((prev) => ({
                              ...prev,
                              onlineStatusAudience: opt.id
                            }))
                          }
                          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                            activeAud
                              ? 'bg-[#2563EB] text-white border-[#2563EB]'
                              : 'bg-white text-[#57534E] border-[var(--border-hairline)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Close Friends picker from cached followed accounts (0 extra Firestore reads) */}
                  {(privacySettings.onlineStatusAudience || 'everyone') === 'close_friends' && (
                    <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
                      <span className="text-[11px] font-extrabold text-[#1C1917] block">
                        Close Friends ({myCloseFriendIds.length}) — tap to toggle
                      </span>
                      {myFollowingIds.length === 0 ? (
                        <p className="text-[11px] text-[#78716C]">
                          Follow friends first or open their profile menu → Add to Close Friends.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {myFollowingIds.slice(0, 24).map((fUid) => {
                            const cached = getCachedUserProfile(fUid);
                            const isSelected = myCloseFriendIds.includes(fUid);
                            const label =
                              cached?.displayName || cached?.username || `Friend (${fUid.slice(0, 6)})`;
                            return (
                              <button
                                key={fUid}
                                type="button"
                                onClick={() => handleToggleCloseFriend(fUid)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40'
                                    : 'bg-white text-[#57534E] border-[var(--border-hairline)]'
                                }`}
                              >
                                {isSelected ? '✓ ' : '+ '}
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                  You have not blocked any accounts. Blocked users never see your online status or last seen.
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
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-200/70 flex items-center justify-center shrink-0">
                  <Mail size={19} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-base text-[#1C1917]">Email Verification</h4>
                    {currentUser?.emailVerified || reloadedEmailVerified || isAdmin ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-[#0D9488] border border-emerald-200">
                        Email verified ✓
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                        Unverified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    {currentUser?.emailVerified || reloadedEmailVerified || isAdmin
                      ? `Your email (${currentUser?.email}) is verified for posting and messaging.`
                      : `Verify ${currentUser?.email || 'your email'} via Firebase Authentication email verification link.`}
                  </p>
                </div>
              </div>

              {!currentUser?.emailVerified && !reloadedEmailVerified && !isAdmin && (
                <button
                  type="button"
                  onClick={handleSendVerifyEmail}
                  disabled={isSendingVerifyEmail || verifyCooldownSeconds > 0}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Mail size={14} />
                  <span>
                    {isSendingVerifyEmail
                      ? 'Sending...'
                      : verifyCooldownSeconds > 0
                      ? `Resend (${verifyCooldownSeconds}s)`
                      : verifyLinkSent
                      ? 'Resend'
                      : 'Verify'}
                  </span>
                </button>
              )}
            </div>

            {verifyErrorCode && !currentUser?.emailVerified && !reloadedEmailVerified && !isAdmin && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                {passwordStatus?.type === 'error' && (
                  <p className="text-xs font-bold">{passwordStatus.message}</p>
                )}
                <p className="text-[11px] font-mono text-rose-600">{verifyErrorCode}</p>
              </div>
            )}

            {verifyLinkSent && !currentUser?.emailVerified && !reloadedEmailVerified && !isAdmin && (
              <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2">
                <p className="text-xs font-extrabold text-[#0D9488]">
                  Verification link sent. Check your inbox and spam folder.
                </p>
                <p className="text-[11px] text-[#78716C]">
                  Click the verification link sent to <span className="font-bold text-[#1C1917]">{currentUser?.email}</span>, then return here.
                </p>
              </div>
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
                    Minimum 8 and maximum 24 characters, requiring at least one letter and one number.
                  </p>
                </div>
              </div>
            </div>

            {passwordStatus && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
                  passwordStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {passwordStatus.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-[#0D9488] shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <span className="block">{passwordStatus.message}</span>
                  {passwordStatus.type === 'error' && verifyErrorCode && (
                    <span className="block text-[11px] font-mono text-rose-700">
                      {verifyErrorCode}
                    </span>
                  )}
                </div>
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
                    New Password (8–24 chars, letter &amp; number)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={24}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8–24 chars with letter & number"
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
                    maxLength={24}
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

      {/* =====================================================================
          MAIN REDESIGNED PROFILE BODY (when activeSettingsSection === 'profile'):
          - Mobile (< 1024px): Reference Menu Cards + Story Highlights + Tabs + 3-Col Posts Grid
          - Desktop (>= 1024px): Two-column layout (Posts grid on left max 720px, Side panel on right at >= 1280px)
      ===================================================================== */}
      {activeSettingsSection === 'profile' && (
        <div className="wavelink-profile-desktop-body">
          {/* Mobile & Tablet (< 1280px) Menu Cards above the posts grid so they are immediately accessible */}
          <div className="xl:hidden">{renderReferenceMenuCards()}</div>

          {/* Left Column on Desktop (Main Posts Column, max-width 720px) */}
          <div ref={postsGridSectionRef} className="wavelink-profile-main-col">
            {/* Story Highlights Row */}
            <StoryHighlightsBar
              profile={activeProfile}
              activeSparks={activeUserSparks}
              isOwnProfile={isOwnProfile}
              language={language === 'sw' ? 'sw' : 'en'}
              onSaveHighlights={async (nextHighlights: StoryHighlightItem[]) => {
                await updateUserProfile({ storyHighlights: nextHighlights });
              }}
            />

            {/* Profile Content Tabs: Posts, Reels, Saved (own profile only), Tagged */}
            <div
              role="tablist"
              aria-label="Profile posts tabs"
              className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeProfileTab === 'posts'}
                onClick={() => {
                  setActiveProfileTab('posts');
                  setVisiblePostsCount(12);
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeProfileTab === 'posts'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Grid size={15} />
                <span>{language === 'sw' ? 'Machapisho' : 'Posts'}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeProfileTab === 'reels'}
                onClick={() => {
                  setActiveProfileTab('reels');
                  setVisiblePostsCount(12);
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeProfileTab === 'reels'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Video size={15} />
                <span>Reels</span>
              </button>

              {isOwnProfile && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeProfileTab === 'saved'}
                  onClick={() => {
                    setActiveProfileTab('saved');
                    setVisiblePostsCount(12);
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeProfileTab === 'saved'
                      ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Bookmark size={15} />
                  <span>{language === 'sw' ? 'Zilizohifadhiwa' : 'Saved'}</span>
                </button>
              )}

              <button
                type="button"
                role="tab"
                aria-selected={activeProfileTab === 'tagged'}
                onClick={() => {
                  setActiveProfileTab('tagged');
                  setVisiblePostsCount(12);
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeProfileTab === 'tagged'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Tag size={15} />
                <span>{language === 'sw' ? 'Zilizotajwa' : 'Tagged'}</span>
              </button>
            </div>

            {/* Posts Grid / Private Lock / Loading Skeleton / Empty State */}
            {isViewedAccountPrivateAndLocked ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-10 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
                  <Lock size={24} />
                </div>
                <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                  {language === 'sw' ? 'Akaunti Hii ni ya Faragha' : 'This Account is Private'}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
                  {language === 'sw'
                    ? `Mfuateni ${displayedName} ili kuona picha, video na machapisho yake.`
                    : `Follow ${displayedName} to see their photos, reels, and community posts.`}
                </p>
              </div>
            ) : isLoadingPosts || isLoadingOtherProfile ? (
              <div className="wavelink-profile-posts-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => (
                  <div
                    key={item}
                    className="wavelink-profile-post-tile animate-pulse bg-[var(--bg-subtle)]"
                  />
                ))}
              </div>
            ) : paginatedTabPosts.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-10 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] flex items-center justify-center mx-auto">
                  {activeProfileTab === 'reels' ? (
                    <Video size={24} />
                  ) : activeProfileTab === 'saved' ? (
                    <Bookmark size={24} />
                  ) : activeProfileTab === 'tagged' ? (
                    <Tag size={24} />
                  ) : (
                    <Grid size={24} />
                  )}
                </div>
                <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                  {activeProfileTab === 'reels'
                    ? language === 'sw'
                      ? 'Bado hakuna Reels'
                      : 'No reels yet'
                    : activeProfileTab === 'saved'
                    ? language === 'sw'
                      ? 'Bado hakuna machapisho yaliyohifadhiwa'
                      : 'No saved posts yet'
                    : activeProfileTab === 'tagged'
                    ? language === 'sw'
                      ? 'Bado hakuna machapisho uliyotajwa'
                      : 'No tagged posts yet'
                    : language === 'sw'
                    ? 'Bado hakuna machapisho'
                    : 'No posts yet'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  {isOwnProfile
                    ? language === 'sw'
                      ? 'Machapisho, picha na video unazoshiriki zitaonekana hapa.'
                      : 'Photos, videos, and moments you share will appear here in your profile grid.'
                    : language === 'sw'
                    ? `${displayedName} bado hajachapisha chochote hapa.`
                    : `${displayedName} hasn't shared any posts in this tab yet.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="wavelink-profile-posts-grid">
                  {paginatedTabPosts.map((post) => {
                    const isPinned = pinnedPostId === post.id && activeProfileTab === 'posts';
                    const isVideo = Boolean(post.videoUrl) || post.mediaType === 'video';
                    const images =
                      Array.isArray(post.imageUrls) && post.imageUrls.length > 0
                        ? post.imageUrls
                        : post.imageUrl
                        ? [post.imageUrl]
                        : [];
                    const isMultiPhoto = images.length > 1;
                    const thumbSrc = post.thumbnailUrl || images[0] || '';
                    const viewOrLikeCount = post.viewsCount || post.likesCount || 0;

                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setSelectedViewerPostId(post.id)}
                        className="wavelink-profile-post-tile group text-left"
                      >
                        {thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt={post.content?.slice(0, 40) || 'Post thumbnail'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : isVideo && post.videoUrl ? (
                          <video
                            src={post.videoUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full p-2.5 sm:p-3.5 bg-gradient-to-br from-[var(--bg-subtle)] to-[var(--bg-surface)] flex flex-col justify-between">
                            <p className="text-[11px] sm:text-xs font-bold text-[var(--text-primary)] line-clamp-4 leading-snug">
                              {post.content || 'WaveLink Post'}
                            </p>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                              {new Date(post.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                        )}

                        {/* Top-Left Pinned Badge */}
                        {isPinned && (
                          <span
                            className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold inline-flex items-center gap-1 shadow-md"
                            title={language === 'sw' ? 'Chapisho Lililobandikwa' : 'Pinned post'}
                          >
                            <Pin size={10} />
                            <span className="hidden sm:inline">Pinned</span>
                          </span>
                        )}

                        {/* Top-Right Multi-Photo Stack Icon */}
                        {isMultiPhoto && (
                          <span
                            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-lg bg-black/60 text-white backdrop-blur-xs flex items-center justify-center"
                            title={`${images.length} photos`}
                          >
                            <Layers size={13} />
                          </span>
                        )}

                        {/* Bottom-Left Video Play Icon + View/Like Count */}
                        {isVideo && (
                          <span className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/65 text-white text-[10px] font-extrabold inline-flex items-center gap-1 backdrop-blur-xs">
                            <Play size={10} className="fill-white" />
                            <span>{viewOrLikeCount.toLocaleString()}</span>
                          </span>
                        )}

                        {/* Hover Stats Overlay */}
                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs font-extrabold">
                          <span className="inline-flex items-center gap-1">
                            <Heart size={14} className="fill-white" />
                            {(post.likesCount || 0).toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle size={14} className="fill-white" />
                            {(post.commentsCount || 0).toLocaleString()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Pagination: Load 12 tiles at first, and more on tap */}
                {currentTabPosts.length > visiblePostsCount && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setVisiblePostsCount((prev) => prev + 12)}
                      className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-xs font-extrabold transition cursor-pointer"
                    >
                      {language === 'sw'
                        ? `Onyesha Machapisho Zaidi (${currentTabPosts.length - visiblePostsCount} yaliyosalia)`
                        : `Load More Posts (${currentTabPosts.length - visiblePostsCount} more)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column on Wide Desktop (>= 1280px): Side Panel with Pro Highlight Card, Menu Cards, Badges & WavePoints */}
          <aside className="hidden xl:flex wavelink-profile-side-col">
            {renderReferenceMenuCards()}
          </aside>
        </div>
      )}

      {(activeSettingsSection === 'settings_hub' || activeSettingsSection === 'edit_profile') && (
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
                onClick={() => setActiveSettingsSection('notifications')}
                className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] hover:bg-blue-50/60 border border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] border border-blue-200 flex items-center justify-center shrink-0">
                    <Bell size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-[#1C1917] block">
                      {language === 'sw' ? 'Arifa (Notifications)' : 'Notifications'}
                    </span>
                    <span className="text-[11px] text-[#78716C] block">
                      Push status, test alerts &amp; toggles
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

          {/* Simple Mode (Hali Rahisi) Switch Card */}
          <div className="bg-[var(--bg-surface)] border-2 border-blue-200/90 dark:border-blue-900/60 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-[#1C1917] dark:text-stone-100 text-base sm:text-lg">
                      {language === 'sw' ? 'Hali Rahisi (Simple Mode)' : 'Simple Mode'}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-[#2563EB]">
                      {isSimpleMode ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mt-1 leading-relaxed">
                    {language === 'sw'
                      ? 'Inafanya maandishi na vitufe kuwa vikubwa zaidi, inaficha vipengele ngumu kama Pro na changamoto, na inaweka Mwanzo, Ujumbe, Taarifa na Wasifu tu. Inafaa sana kwa wazazi na matumizi mepesi bila usumbufu.'
                      : 'Makes text and buttons larger, hides advanced items (Pro, points, and challenges), and keeps only Home, Messages, Notifications, and Profile. Perfect for parents and easy everyday browsing.'}
                  </p>
                </div>
              </div>

              {/* Large iOS-style Toggle Button */}
              <button
                type="button"
                role="switch"
                aria-checked={isSimpleMode}
                onClick={toggleSimpleMode}
                className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isSimpleMode ? 'bg-[#2563EB]' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span className="sr-only">Toggle Simple Mode</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isSimpleMode ? 'translate-x-8' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Friendly Help & Tour Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-[#0D9488] flex items-center justify-center shrink-0">
                <HelpCircle size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-[#1C1917] dark:text-stone-100 text-base">
                  {language === 'sw' ? 'Msaada na Mwongozo' : 'Help & Beginner Guides'}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {language === 'sw' ? 'Jifunze kutumia WaveLink kwa urahisi au muulize msaidizi wetu.' : 'Friendly guidance, short answers, and our 3-step tour.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('wavelink:open-tour'))}
                className="min-h-[48px] p-3.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100 text-[#2563EB] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer border border-blue-200/80"
              >
                <Compass size={18} />
                <span>{language === 'sw' ? 'Nionyeshe Jinsi ya Kutumia (Tour)' : 'Show me around (Quick Tour)'}</span>
              </button>

              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('wavelink:open-help'))}
                className="min-h-[48px] p-3.5 rounded-2xl bg-teal-50/80 hover:bg-teal-100 text-[#0D9488] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer border border-teal-200/80"
              >
                <HelpCircle size={18} />
                <span>{language === 'sw' ? 'Msaada na Maswali (Help & FAQs)' : 'Help & Friendly Answers'}</span>
              </button>
            </div>
          </div>

          {/* Appearance Section on Profile: 9 Selectable Themes with Live Preview saved to Firestore */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-[#2563EB] border border-blue-500/25 flex items-center justify-center">
                  <Palette size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[var(--text-primary)] text-base">
                    {language === 'sw' ? 'Muonekano na Mandhari' : 'Appearance & Themes'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {language === 'sw'
                      ? 'Chagua muonekano wowote bure na uhakiki kabla ya kuhifadhi.'
                      : 'Choose any theme for free with live preview. Saved across all your devices.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSettingsSection('appearance')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-bold text-[#2563EB] hover:opacity-90 transition cursor-pointer"
              >
                {language === 'sw' ? 'Fungua Muonekano Kamili' : 'Open Full Appearance'}
              </button>
            </div>

            <ThemePickerPanel />
          </div>

          {/* Phase 1: Data Saver Mode Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    isDataSaverOn
                      ? 'bg-teal-50 text-[#0D9488] border-teal-200'
                      : 'bg-[var(--bg-subtle)] text-[#78716C] border-[var(--border-hairline)]'
                  }`}
                >
                  <Zap size={19} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-[#1C1917] text-base">
                      {t('datasaver.title')}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isDataSaverOn
                          ? 'bg-teal-50 text-[#0D9488] border border-teal-200'
                          : 'bg-stone-100 text-[#78716C]'
                      }`}
                    >
                      {isDataSaverOn ? t('datasaver.on') : t('datasaver.off')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold">
                      {t('datasaver.savedEstimate')}: {formattedSaved}
                    </span>
                  </div>
                  <p className="text-xs text-[#78716C] mt-0.5 max-w-xl leading-relaxed">
                    {t('datasaver.subtitle')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isDataSaverOn}
                onClick={() => {
                  const next = !isDataSaverOn;
                  setDataSaverOn(next);
                  updateUserProfile({ dataSaverEnabled: next }).catch(() => {});
                }}
                className={`min-h-[42px] px-4 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  isDataSaverOn
                    ? 'bg-[#0D9488] text-white shadow-2xs'
                    : 'bg-[var(--bg-subtle)] hover:bg-stone-200/70 text-[#1C1917] border border-[var(--border-hairline)]'
                }`}
              >
                <Zap size={14} className={isDataSaverOn ? 'text-white' : 'text-[#0D9488]'} />
                <span>{isDataSaverOn ? `${t('datasaver.title')}: ${t('datasaver.on')}` : `${t('datasaver.title')}: ${t('datasaver.off')}`}</span>
              </button>
            </div>
          </div>

          {/* Phase 2, Pan-African Languages, Country & Region Picker, Local Money, and Kanga/Kitenge Culture Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0D9488] border border-teal-200/80 flex items-center justify-center shrink-0">
                  <Globe size={19} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#1C1917] text-base">
                    {language === 'sw'
                      ? 'Lugha za Afrika, Nchi na Utamaduni wa Kanga/Kitenge'
                      : 'African Languages, Country & Kanga/Kitenge Design'}
                  </h3>
                  <p className="text-xs text-[#78716C]">
                    {language === 'sw'
                      ? 'Badili kati ya Kiswahili na Kiingereza, chagua nchi yako, sarafu ya TZS/KES/UGX na fremu ya Kanga/Kitenge'
                      : 'Switch between Swahili & English, pick your country flag, local currency (TZS/KES/UGX) & Kanga/Kitenge frames'}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-xs font-extrabold">
                {activeCountryMeta.flag} {language === 'sw' ? activeCountryMeta.greetingSw : activeCountryMeta.greetingEn}
              </span>
            </div>

            {/* 1. Primary UI Translation Switch (Swahili & English) + Pan-African Language Option List */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold text-[#1C1917] block">
                {language === 'sw'
                  ? '1. Lugha ya Programu (Kiswahili & Kiingereza + Orodha ya Lugha za Afrika)'
                  : '1. App Language (Swahili & English + Pan-African Language List)'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PAN_AFRICAN_LANGUAGES.map((langItem) => {
                  const isSelected = activePanLang === langItem.code || (langItem.code === language && activePanLang === language);
                  return (
                    <button
                      key={langItem.code}
                      type="button"
                      onClick={() => {
                        setPanAfricanLang(langItem.code);
                        if (langItem.code === 'sw' || langItem.code === 'en') {
                          setLanguage(langItem.code);
                          updateUserProfile({
                            language: langItem.code,
                            panAfricanLanguage: langItem.code
                          }).catch(() => {});
                        } else {
                          updateUserProfile({
                            panAfricanLanguage: langItem.code
                          }).catch(() => {});
                        }
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-2xs'
                          : 'bg-[var(--bg-subtle)] text-[#1C1917] border-[var(--border-hairline)] hover:border-teal-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-extrabold">
                          {langItem.flag} {langItem.nativeName}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : langItem.fullUiSupport
                              ? 'bg-emerald-50 text-[#0D9488]'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {langItem.fullUiSupport
                            ? language === 'sw'
                              ? 'Kamili'
                              : 'Full UI'
                            : language === 'sw'
                            ? 'Salamu Tayari'
                            : 'Regional Ready'}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-medium ${
                          isSelected ? 'text-teal-50' : 'text-[#78716C]'
                        }`}
                      >
                        “{langItem.greeting}”
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Country & Region Picker with Flags (10 African Countries) */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-extrabold text-[#1C1917]">
                  {language === 'sw'
                    ? '2. Chagua Nchi na Kanda Yako (Inaonyesha Machapisho ya Nchi Yako Kwanza kwenye Kichupo cha Nyumbani)'
                    : '2. Country & Region Picker (Prioritizes your country in the Local Feed tab)'}
                </label>
                <span className="text-[11px] font-bold text-[#2563EB]">
                  {activeCountryMeta.flag} {activeCountryMeta.regionLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {AFRICAN_COUNTRIES.map((country) => {
                  const selected = country.code === activeCountryCode;
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => {
                        setCountryCode(country.code);
                        updateUserProfile({
                          countryCode: country.code,
                          preferredCurrency: country.defaultCurrency
                        }).catch(() => {});
                      }}
                      className={`p-2.5 rounded-2xl border text-left transition flex items-center gap-2 cursor-pointer ${
                        selected
                          ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-2xs'
                          : 'bg-[var(--bg-subtle)] text-[#1C1917] border-[var(--border-hairline)] hover:border-blue-300'
                      }`}
                    >
                      <span className="text-base leading-none shrink-0">{country.flag}</span>
                      <div className="min-w-0">
                        <span className="text-xs font-extrabold block truncate">
                          {language === 'sw' ? country.nameSw : country.nameEn}
                        </span>
                        <span
                          className={`text-[10px] block truncate ${
                            selected ? 'text-blue-100' : 'text-[#78716C]'
                          }`}
                        >
                          {country.defaultCurrency}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Local Currency (TZS, KES, UGX) + Mobile Money Mention */}
            <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-[#1C1917] block">
                  {language === 'sw'
                    ? '3. Sarafu ya Kienyeji (Inachaguliwa Moja kwa Moja kulingana na Nchi)'
                    : '3. Local Currency (Auto-chosen by Country: TZS, KES & UGX)'}
                </span>
                <span className="text-[11px] text-[#57534E] block">
                  {language === 'sw'
                    ? `WaveLink Pro: ${formatLocalPrice(18000, activeCurrency)}/mwezi • Malipo kupitia M-Pesa, Mixx by Yas na Airtel Money`
                    : `WaveLink Pro: ${formatLocalPrice(18000, activeCurrency)}/mo • Explained for M-Pesa, Mixx by Yas & Airtel Money`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(['TZS', 'KES', 'UGX'] as EastAfricanCurrency[]).map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => {
                      setCurrency(curr);
                      updateUserProfile({ preferredCurrency: curr }).catch(() => {});
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                      activeCurrency === curr
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-white text-[#1C1917] border-stone-200 hover:border-teal-300'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Subtle Kanga & Kitenge Profile Frames & Background Accent */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-[#1C1917]">
                  {language === 'sw'
                    ? '4. Fremu ya Wasifu na Mandhari ya Kanga na Kitenge (Hiari)'
                    : '4. Optional Kanga & Kitenge Profile Frames & Subtle Background'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isKangaBgEnabled;
                    updateUserProfile({ kangaBackgroundEnabled: next }).catch(() => {});
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition cursor-pointer ${
                    isKangaBgEnabled
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-[var(--bg-subtle)] text-[#1C1917] border-[var(--border-hairline)]'
                  }`}
                >
                  {isKangaBgEnabled
                    ? language === 'sw'
                      ? 'Mandhari ya Kanga: IMEWASHWA ✓'
                      : 'Subtle Kanga Card Pattern: ON ✓'
                    : language === 'sw'
                    ? 'Washa Mandhari ya Kanga'
                    : 'Enable Subtle Kanga Pattern'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {KANGA_PATTERN_FRAMES.map((frame) => {
                  const selected = activePatternFrame === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => {
                        updateUserProfile({ patternFrame: frame.id }).catch(() => {});
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex items-center justify-between gap-3 cursor-pointer ${
                        selected
                          ? 'border-[#0D9488] bg-teal-50/50 ring-2 ring-[#0D9488]/15'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-teal-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-extrabold text-[#1C1917] block">
                          {language === 'sw' ? frame.nameSw : frame.nameEn}
                        </span>
                        <span className="text-[11px] text-[#78716C] block">
                          {language === 'sw' ? frame.descSw : frame.descEn}
                        </span>
                      </div>
                      {selected && <CheckCircle2 size={16} className="text-[#0D9488] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Personal Content Interests */}
            <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-[#0D9488]" />
                  <span className="font-extrabold text-[#1C1917] text-xs">
                    {t('interests.editButton')} ({(userProfile?.interests || []).length}{' '}
                    {t('interests.selectedCount')})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {(userProfile?.interests || []).length === 0 ? (
                    <span className="text-[11px] text-[#78716C]">
                      {t('interests.pickAtLeastThree')}
                    </span>
                  ) : (
                    (userProfile?.interests || []).map((id) => {
                      const item = INTEREST_CATALOG.find((c) => c.id === id);
                      if (!item) return null;
                      return (
                        <span
                          key={id}
                          className="px-2 py-0.5 rounded-lg bg-white border border-[var(--border-hairline)] text-[11px] font-bold text-[#1C1917]"
                        >
                          {item.emoji} {language === 'sw' ? item.labelSw : item.labelEn}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('wavelink:open-interest-picker'))}
                className="py-2 px-4 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold transition shrink-0 cursor-pointer"
              >
                {t('interests.editButton')}
              </button>
            </div>
          </div>

          {/* Phase 6: Friendly Add to Home Screen Hint Card (Especially for iPhone) */}
          <AddToHomeScreenHintCard />

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

            {profileSaveError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 flex-wrap">
                <span className="font-semibold">{profileSaveError}</span>
                <button
                  type="button"
                  onClick={() => saveProfileChanges()}
                  disabled={isSaving}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <Avatar
                  uid={currentUser?.uid}
                  src={
                    photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                  }
                  alt="Avatar"
                  fallbackName={displayName}
                  size={64}
                  showStatus={true}
                  onlyWhenVisible={false}
                  targetProfile={userProfile}
                  className="ring-2 ring-[#2563EB]/20 rounded-full"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-xs font-bold text-[#1C1917] block">
                    Profile Photo
                  </span>
                  <label
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-[#2563EB] border border-[var(--border-hairline)] text-xs font-bold transition ${
                      isUploadingAvatar ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                    }`}
                  >
                    <Upload size={14} />
                    <span>
                      {isUploadingAvatar ? `Uploading (${avatarUploadProgress}%)` : 'Upload Photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingAvatar}
                      onChange={handleAvatarFileSelect}
                      className="hidden"
                    />
                  </label>

                  {isUploadingAvatar && (
                    <div className="w-full max-w-xs space-y-1 pt-1">
                      <div className="w-full h-2 rounded-full bg-black/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#2563EB] transition-all duration-200"
                          style={{ width: `${Math.max(4, avatarUploadProgress)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {avatarUploadError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/12 border border-rose-500/30 text-rose-700 text-xs space-y-1.5">
                      <p className="font-semibold">{avatarUploadError.message}</p>
                      {avatarUploadError.code && (
                        <p className="text-[11px] font-mono opacity-80">
                          Error code: {avatarUploadError.code}
                        </p>
                      )}
                      {lastFailedAvatarFile && !isUploadingAvatar && (
                        <button
                          type="button"
                          onClick={() => uploadAvatarFileToFirebase(lastFailedAvatarFile)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold transition cursor-pointer"
                        >
                          <RotateCcw size={12} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  )}
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

      {/* Footer: Empowering African Creators */}
      <div className="pt-4 pb-2 text-center text-xs font-bold text-[#57534E]">
        WaveLink • {t('footer.tagline')}
      </div>
    </div>
  );
};
