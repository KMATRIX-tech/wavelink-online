import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { awardProgressionAction } from '../services/progressionService';
import {
  useDataSaver,
  getOptimizedImagePreviewUrl,
  recordDataSavedBytes
} from '../services/dataSaverService';
import {
  getSuggestedHashtagsForInterests,
  scorePostByInterests,
  scoreCreatorByInterests
} from './InterestPickerModal';
import {
  AFRICAN_COUNTRIES,
  PAN_AFRICAN_LANGUAGES,
  getAfricanCountryMeta,
  getKangaFrameClass,
  doesPostMatchCountry,
  formatLocalPrice,
  useAfricanRegion
} from '../utils/africanCultureConfig';
import {
  db,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData,
  sanitizeAvatarUrlForFirestore,
  formatVideoUploadError,
  getAuthHeaders,
  batchCacheUserProfiles,
  notifyQuotaExceeded,
  isFirestoreQuotaError,
  resolveUserAvatarUrl,
  getBestAuthUserPhotoUrl,
  getCachedUserProfile
} from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  getDoc,
  startAfter,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  limit,
  arrayUnion,
  arrayRemove,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { Post, PostComment, Announcement, ReactionType, UserProfile } from '../types';
import { savePostDocument } from '../services/postService';
import {
  enterPostIntoChallenge,
  formatCountdownParts,
  isChallengeExpired,
  syncChallengePostLike,
} from '../services/challengesService';
import type { CreatorChallenge } from '../types';
import { QuotaExceededBanner } from './QuotaExceededBanner';
import { CrystalBadge } from './CrystalBadge';
import { VideoPlayer } from './VideoPlayer';
import { PostBody } from './PostBody';
import { Avatar } from './Avatar';
import { SongPlayerCard } from './SongPlayerCard';
import { SparkTray, WEEKLY_SPARK_THEMES } from './SparkTray';
import { NotificationsPopover } from './NotificationsPopover';
import { RichEventCard } from './RichEventCard';
import { ImageLightboxModal, LightboxState } from './ImageLightboxModal';
import { useBottomSheetLock } from '../utils/sheetLock';
import { AddToHomeScreenHintCard } from './PWAInstallButton';
import { CommentsSheet } from './CommentsSheet';
import { ShareSheet } from './ShareSheet';
import { checkClientSpam, checkWordFilter, formatCompactNumber } from '../utils/safetyFilters';
import { validateAndModerateText } from '../services/moderationService';
import { ReportContentModal } from './ReportContentModal';
import {
  ThumbsUp,
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Send,
  Image as ImageIcon,
  Video as VideoIcon,
  Waves,
  Check,
  ShieldCheck,
  Megaphone,
  HelpCircle,
  X,
  Sparkles,
  Flame,
  Bookmark,
  Play,
  UploadCloud,
  Film,
  Clapperboard,
  Music,
  Camera,
  Zap,
  Disc,
  Wand2,
  Edit2,
  Crown,
  Eye,
  HandCoins,
  Rocket,
  ShoppingBag,
  ExternalLink,
  Tag,
  Coins,
  PlusCircle,
  Hash,
  AtSign,
  CalendarDays,
  CheckCircle2,
  Mic,
  Flag,
  Ban,
  Download,
  RotateCcw,
  Trophy,
  Globe,
  Users,
  Lock,
  RefreshCw,
  Smile,
  MoreHorizontal,
  Search,
  ArrowUpRight,
  Layers,
  ChevronDown,
  ChevronUp,
  EyeOff
} from 'lucide-react';
import { sendWelinkChatMessage } from '../services/geminiService';
import { getCachedWelinkResponse, setCachedWelinkResponse } from '../services/welinkCache';
import { triggerCelebration } from './CelebrationBanner';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { CreatorTipModal } from './CreatorTipModal';
import { PostBoostModal } from './PostBoostModal';
import { RightSidebar } from './RightSidebar';
import {
  PostSkeleton,
  AnnouncementSkeleton,
  SuggestedMembersSkeleton,
  CommentSkeleton
} from './PostSkeleton';
import { LegalFooter } from './LegalModals';
import { sendNotification } from '../services/notificationService';
import {
  preloadUpcomingFeedPosts,
  getPreloadedMediaInfo,
  PreloadedMediaInfo
} from '../services/preloadService';
import { sanitizeUserText, SUPPORT_BOT_ID } from '../utils/security';
import {
  compressImage,
  uploadImageToCloudinary,
  generateVideoThumbnail,
  cloneVideoFileToMemory,
  inspectAndValidateVideoFile,
  detectFeedMediaType,
  getMaxVideoDurationSeconds,
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_RAW_MB,
} from '../utils/mediaStorage';
import {
  enqueueVideoUploadJob,
  useVideoUploadQueue,
  clearFailedVideoAndStudioDrafts,
} from '../services/videoUploadQueue';
import { VideoUploadProgressChip, VideoUploadingFeedPostList } from './VideoUploadProgressChip';
import { UnifiedPostCard } from './UnifiedPostCard';
import { cleanCaption } from '../utils/cleanCaption';
import { downloadPost, sharePost } from '../utils/share.js';

const SPONSORED_ADS: Post[] = [
  {
    id: 'ad_starlink_1',
    authorId: 'brand_starlink',
    authorEmail: 'partner@starlink.com',
    authorName: 'Starlink Tanzania',
    authorUsername: '@starlink_tz',
    authorPhotoURL: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=120&auto=format&fit=crop&q=80',
    content: 'Experience revolutionary high-speed, low-latency satellite internet anywhere in Tanzania. Stream 4K video reels and enjoy crystal-clear WebRTC calling with WaveLink! 🛰️⚡',
    imageUrl: 'https://images.unsplash.com/photo-1517976487502-5f60639e3650?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    likes: [],
    likesCount: 342,
    reactions: { like: [], heart: [], fire: [] },
    reactionCounts: { like: 128, heart: 342, fire: 94 },
    commentsCount: 28,
    isSponsored: true,
    sponsorBrand: 'Starlink Official',
    affiliateProductTitle: 'Starlink Standard Satellite Dish & Router Kit',
    affiliateProductPrice: 'TZS 990,000',
    affiliateProductUrl: 'https://www.starlink.com',
    affiliateButtonText: 'Order Kit • Free Delivery',
    affiliateRating: 5.0,
    createdAt: new Date().toISOString()
  },
  {
    id: 'ad_sony_2',
    authorId: 'brand_sony',
    authorEmail: 'creators@sony.com',
    authorName: 'Sony Audio East Africa',
    authorUsername: '@sony_audio',
    authorPhotoURL: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=120&auto=format&fit=crop&q=80',
    content: 'Studio-grade acoustic precision with world-class noise cancellation. Edit your WaveLink sound mixes and video reels in pristine audio fidelity. 🎧✨',
    imageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    likes: [],
    likesCount: 519,
    reactions: { like: [], heart: [], fire: [] },
    reactionCounts: { like: 215, heart: 519, fire: 164 },
    commentsCount: 44,
    isSponsored: true,
    sponsorBrand: 'Sony Partner',
    affiliateProductTitle: 'Sony WH-1000XM5 Wireless Headphones (Midnight Silver)',
    affiliateProductPrice: 'TZS 850,000',
    affiliateProductUrl: 'https://www.sony.com',
    affiliateButtonText: 'Shop Now • 15% Off',
    affiliateRating: 4.9,
    createdAt: new Date().toISOString()
  },
  {
    id: 'ad_dji_3',
    authorId: 'brand_dji',
    authorEmail: 'creatorgear@dji.com',
    authorName: 'DJI Creator Studio',
    authorUsername: '@dji_creators',
    authorPhotoURL: 'https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=120&auto=format&fit=crop&q=80',
    content: 'Capture ultra-smooth cinematic Wave Reels with 3-axis stabilization, ActiveTrack 6.0, and magnetic phone clamp. Transform your smartphone into a movie camera. 🎬📱',
    imageUrl: 'https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    likes: [],
    likesCount: 412,
    reactions: { like: [], heart: [], fire: [] },
    reactionCounts: { like: 176, heart: 412, fire: 138 },
    commentsCount: 19,
    isSponsored: true,
    sponsorBrand: 'DJI Tanzania',
    affiliateProductTitle: 'DJI Osmo Mobile 6 Smart Gimbal Stabilizer',
    affiliateProductPrice: 'TZS 420,000',
    affiliateProductUrl: 'https://www.dji.com',
    affiliateButtonText: 'Shop with Mobile Money',
    affiliateRating: 4.8,
    createdAt: new Date().toISOString()
  }
];

const FEED_CATEGORIES = [
  { id: 'All', labelEn: 'All', labelSw: 'Zote', keywords: [] as string[] },
  { id: 'Art', labelEn: 'Art', labelSw: 'Sanaa', keywords: ['art', 'design', 'paint', 'draw', 'creative', 'photo', 'craft', 'sanaa', 'gallery'] },
  { id: 'Fashion', labelEn: 'Fashion', labelSw: 'Mitindo', keywords: ['fashion', 'style', 'outfit', 'kitenge', 'kanga', 'dress', 'wear', 'look', 'mitindo'] },
  { id: 'Travel', labelEn: 'Travel', labelSw: 'Safari', keywords: ['travel', 'safari', 'zanzibar', 'beach', 'kilimanjaro', 'arusha', 'nairobi', 'trip', 'explore', 'sunset'] },
  { id: 'Music', labelEn: 'Music', labelSw: 'Muziki', keywords: ['music', 'bongo', 'afrobeats', 'amapiano', 'song', 'beat', 'dance', 'muziki', 'audio', 'track'] },
  { id: 'Sports', labelEn: 'Sports', labelSw: 'Michezo', keywords: ['sport', 'football', 'soccer', 'simba', 'yanga', 'run', 'fitness', 'gym', 'game', 'match', 'michezo', 'soka'] },
  { id: 'Food', labelEn: 'Food', labelSw: 'Chakula', keywords: ['food', 'cook', 'pilau', 'nyama', 'cafe', 'coffee', 'chai', 'taste', 'recipe', 'chakula', 'dinner', 'mapishi'] },
  { id: 'Comedy', labelEn: 'Comedy', labelSw: 'Vichekesho', keywords: ['comedy', 'funny', 'laugh', 'joke', 'meme', 'skit', 'vichekesho', 'lol', 'humor', 'cheka'] },
  { id: 'Tech', labelEn: 'Tech', labelSw: 'Teknolojia', keywords: ['tech', 'ai', 'code', 'app', 'startup', 'mobile', 'gadget', 'crypto', 'digital', 'web', 'teknolojia'] },
  { id: 'Gaming', labelEn: 'Gaming', labelSw: 'Michezo ya Video', keywords: ['gaming', 'game', 'ps5', 'fifa', 'eafc', 'pubg', 'cod', 'esports', 'gamer'] },
  { id: 'Education', labelEn: 'Education', labelSw: 'Elimu', keywords: ['education', 'elimu', 'school', 'shule', 'chuo', 'campus', 'learn', 'study', 'tutorial'] },
  { id: 'Lifestyle', labelEn: 'Lifestyle', labelSw: 'Maisha', keywords: ['lifestyle', 'maisha', 'vlog', 'family', 'motivation', 'faith', 'baraka', 'biashara'] },
  { id: 'Local', labelEn: 'Local', labelSw: 'Karibu', keywords: ['tanzania', 'kenya', 'uganda', 'rwanda', 'dar', 'nairobi', 'kampala', 'kigali', 'local', 'eastafrica', 'nyumbani'] },
] as const;

type FeedCategoryId = (typeof FEED_CATEGORIES)[number]['id'];

interface FeedViewProps {
  onNavigateTab?: (tab: string) => void;
  initialFilterTag?: string | null;
  onClearFilterTag?: () => void;
  initialFocusPostId?: string | null;
  onClearFocusPostId?: () => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
  onStartChat?: (userId: string) => void;
  hasNewPosts?: boolean;
  onLoadNewPosts?: () => void;
  hasUnreadNotifications?: boolean;
  unreadNotificationCount?: number;
  joiningChallenge?: CreatorChallenge | null;
  onClearJoiningChallenge?: () => void;
}

export const FeedView: React.FC<FeedViewProps> = ({
  onNavigateTab,
  initialFilterTag,
  onClearFilterTag,
  initialFocusPostId,
  onClearFocusPostId,
  onOpenWelink,
  onStartChat,
  hasNewPosts = false,
  onLoadNewPosts,
  hasUnreadNotifications = false,
  unreadNotificationCount = 0,
  joiningChallenge = null,
  onClearJoiningChallenge
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isProEffective,
    toggleSavePost,
    updateUserProfile,
    recordPointTransaction,
    toggleBlockUser,
    reportContent,
    recordAdminAuditLog
  } = useAuth();

  const isProTier = Boolean(isProEffective || isAdmin);
  const isProUser = Boolean(isProTier || userProfile?.hasBlueStar || userProfile?.isVerifiedByAdmin);
  const maxVideoSeconds = getMaxVideoDurationSeconds(isProTier);
  const { jobs: videoUploadJobs } = useVideoUploadQueue();
  const activeOrFailedVideoJobs = videoUploadJobs.filter(
    (j) => j.status !== 'completed' && j.status !== 'cancelled'
  );
  const { t, language, setLanguage } = useLanguage();
  const {
    countryCode,
    countryMeta,
    currency,
    panAfricanLang,
    setCountryCode
  } = useAfricanRegion(
    userProfile?.countryCode,
    userProfile?.preferredCurrency,
    userProfile?.panAfricanLanguage
  );
  const activeCountryCode = userProfile?.countryCode || countryCode;
  const activeCountryMeta = getAfricanCountryMeta(activeCountryCode);
  const activeCurrency = userProfile?.preferredCurrency || currency;
  const activePanLangMeta =
    PAN_AFRICAN_LANGUAGES.find((l) => l.code === (userProfile?.panAfricanLanguage || panAfricanLang)) ||
    PAN_AFRICAN_LANGUAGES[0];

  const [feedMode, setFeedMode] = useState<'all' | 'local' | 'following' | 'trending' | 'saved'>('all');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategoryId>('All');
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isCheckInExpanded, setIsCheckInExpanded] = useState(false);
  const [isSparkPromptExpanded, setIsSparkPromptExpanded] = useState(false);
  const [trendingCreatorPost, setTrendingCreatorPost] = useState<Post | null>(null);
  const [isLoadingTrendingCreator, setIsLoadingTrendingCreator] = useState(true);
  const [activeGridActionPostId, setActiveGridActionPostId] = useState<string | null>(null);
  const [activeHoverGridPostId, setActiveHoverGridPostId] = useState<string | null>(null);
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`wavelink_hidden_posts_${currentUser?.uid || 'guest'}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const lastScrollYRef = useRef<number>(0);

  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [showCountryPickerBar, setShowCountryPickerBar] = useState(false);

  // Scroll to and highlight a deep-linked post when opened from a push notification
  useEffect(() => {
    if (!initialFocusPostId) return;
    let active = true;
    const focusPost = async () => {
      try {
        const el = document.querySelector(`[data-post-id="${CSS.escape(initialFocusPostId)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedPostId(initialFocusPostId);
          setTimeout(() => {
            if (active) setHighlightedPostId(null);
          }, 3500);
          onClearFocusPostId?.();
          return;
        }
        // Fetch the post directly if not yet in the loaded window
        const snap = await getDoc(doc(db, 'posts', initialFocusPostId));
        if (active && snap.exists()) {
          const loaded = { id: snap.id, ...snap.data() } as Post;
          setPosts((prev) => (prev.some((p) => p.id === loaded.id) ? prev : [loaded, ...prev]));
          setTimeout(() => {
            const target = document.querySelector(`[data-post-id="${CSS.escape(initialFocusPostId)}"]`);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setHighlightedPostId(initialFocusPostId);
            setTimeout(() => setHighlightedPostId(null), 3500);
            onClearFocusPostId?.();
          }, 180);
        } else {
          onClearFocusPostId?.();
        }
      } catch {
        onClearFocusPostId?.();
      }
    };
    const timer = setTimeout(focusPost, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [initialFocusPostId, onClearFocusPostId]);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);

  const { enabled: isDataSaverOn, setEnabled: setDataSaverOn, formattedSaved } = useDataSaver();
  const [unlockedFullImages, setUnlockedFullImages] = useState<Record<string, boolean>>({});
  const userInterests = userProfile?.interests || [];
  const suggestedHashtags = getSuggestedHashtagsForInterests(userInterests);

  const [posts, setPosts] = useState<Post[]>([]);
  // Interactive discovery filter from hashtags, mentions, or search
  const [internalFilterTag, setInternalFilterTag] = useState<string | null>(null);

  useEffect(() => {
    setInternalFilterTag(initialFilterTag || null);
  }, [initialFilterTag]);

  useEffect(() => {
    const handleHashtagEvent = (e: Event) => {
      const tag = (e as CustomEvent<string>).detail;
      if (tag) {
        setInternalFilterTag(tag);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    const handleMentionEvent = (e: Event) => {
      const mention = (e as CustomEvent<string>).detail;
      if (mention) {
        const query = mention.startsWith('@') ? mention : `@${mention}`;
        setInternalFilterTag(query);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('wavelink:hashtag', handleHashtagEvent);
    window.addEventListener('wavelink:mention', handleMentionEvent);
    return () => {
      window.removeEventListener('wavelink:hashtag', handleHashtagEvent);
      window.removeEventListener('wavelink:mention', handleMentionEvent);
    };
  }, []);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isLoadingSuggested, setIsLoadingSuggested] = useState(true);
  const [loadingCommentsMap, setLoadingCommentsMap] = useState<Record<string, boolean>>({});

  // Post editing state (WaveLink Pro / Admin privilege)
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [isSavingPostEdit, setIsSavingPostEdit] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Post creation state for center feed creation box
  const [inlineContent, setInlineContent] = useState('');
  const [inlineMediaFile, setInlineMediaFile] = useState<File | null>(null);
  const [inlineMediaPreview, setInlineMediaPreview] = useState<string | null>(null);
  const [inlineMediaType, setInlineMediaType] = useState<'image' | 'video'>('image');
  const [inlineVideoDuration, setInlineVideoDuration] = useState<number>(0);
  const [inlineVideoTrimStart, setInlineVideoTrimStart] = useState<number>(0);
  const [inlineVideoTrimEnd, setInlineVideoTrimEnd] = useState<number>(90);
  const [inlineVideoNeedsTrim, setInlineVideoNeedsTrim] = useState<boolean>(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [postNotice, setPostNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isFeelingPickerOpen, setIsFeelingPickerOpen] = useState(false);
  const [selectedFeeling, setSelectedFeeling] = useState<{ labelEn: string; labelSw: string; emoji: string } | null>(null);
  const [postAudience, setPostAudience] = useState<'public' | 'followers' | 'close_friends'>('public');

  const FEELING_OPTIONS = [
    { labelEn: 'Blessed', labelSw: 'Mwenye Baraka', emoji: '🙏' },
    { labelEn: 'Happy', labelSw: 'Mwenye Furaha', emoji: '😊' },
    { labelEn: 'Loved', labelSw: 'Mwenye Kupendwa', emoji: '❤️' },
    { labelEn: 'Grateful', labelSw: 'Mwenye Shukrani', emoji: '🤲' },
    { labelEn: 'Celebrating', labelSw: 'Kusherehekea', emoji: '🎉' },
    { labelEn: 'Excited', labelSw: 'Mwenye Shauku', emoji: '🌟' },
    { labelEn: 'Relaxed', labelSw: 'Kutulia', emoji: '🌴' },
    { labelEn: 'Motivated', labelSw: 'Mwenye Nguvu', emoji: '💪' },
  ];

  // Monetization modals, Post Detail reader & Multi-Spark post sharing
  const [tippingPost, setTippingPost] = useState<Post | null>(null);
  const [boostingPost, setBoostingPost] = useState<Post | null>(null);
  const [postsForSpark, setPostsForSpark] = useState<Post[] | null>(null);
  const [focusedPost, setFocusedPost] = useState<Post | null>(null);
  const [lightboxState, setLightboxState] = useState<LightboxState | null>(null);
  const [detailReadProgress, setDetailReadProgress] = useState<number>(0);

  // Feed Reading Progress state (0–100% and count of waves consumed)
  const [feedReadProgress, setFeedReadProgress] = useState<number>(0);
  const [consumedPostsCount, setConsumedPostsCount] = useState<number>(0);
  const [preloadedDimensions, setPreloadedDimensions] = useState<Record<string, PreloadedMediaInfo>>({});
  const [visibleFeedPostIds, setVisibleFeedPostIds] = useState<string[]>([]);

  // Comments & Share Sheet state
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, PostComment[]>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [activeAiInfoPost, setActiveAiInfoPost] = useState<Post | null>(null);
  const [aiInfoSummaryMap, setAiInfoSummaryMap] = useState<
    Record<string, { loading: boolean; text: string; tags: string[] }>
  >({});
  const [carouselIndices, setCarouselIndices] = useState<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  useBottomSheetLock(Boolean(focusedPost || activeAiInfoPost), 'feed-detail-sheet');

  // Open AI Info glass sheet & load WELINK AI summary ONLY on tap (zero Firestore reads)
  const handleOpenAiInfo = async (post: Post) => {
    setActiveAiInfoPost(post);
    if (aiInfoSummaryMap[post.id]?.text || aiInfoSummaryMap[post.id]?.loading) {
      return;
    }

    const rawCaption = cleanCaption(post.content);
    const extractedTags = Array.from(
      new Set(rawCaption.match(/#[a-zA-Z0-9_]+/g) || ['#WaveLink', '#EastAfrica'])
    ).slice(0, 5);

    const cacheKey = `ai_post_summary_${post.id}_${language}`;
    const cached = await getCachedWelinkResponse(cacheKey);
    if (cached?.reply) {
      setAiInfoSummaryMap((prev) => ({
        ...prev,
        [post.id]: { loading: false, text: cached.reply, tags: extractedTags },
      }));
      return;
    }

    setAiInfoSummaryMap((prev) => ({
      ...prev,
      [post.id]: { loading: true, text: '', tags: extractedTags },
    }));

    const mediaKind =
      post.videoUrl || post.hasVideoChunks || post.mediaType === 'video'
        ? 'video wave'
        : post.imageUrl || post.imageUrls?.length
        ? 'photo wave'
        : 'community wave';
    const prompt =
      language === 'sw'
        ? `Fupisha kwa sentensi 2 fupi na za kirafiki kuhusu ${mediaKind} hii iliyochapishwa na ${post.authorName}${post.locationTag ? ` (${post.locationTag})` : ''}: "${rawCaption || 'Chapisho la video/picha kwenye WaveLink'}".`
        : `Give a warm, concise 2-sentence summary and cultural context for this ${mediaKind} by ${post.authorName}${post.locationTag ? ` (${post.locationTag})` : ''}: "${rawCaption || 'Visual wave shared on WaveLink'}".`;

    try {
      const res = await sendWelinkChatMessage({
        messages: [{ role: 'user', text: prompt }],
      });
      const cleanText =
        res?.reply?.trim() ||
        (language === 'sw'
          ? `${post.authorName} ameshiriki ${mediaKind} kwenye WaveLink${rawCaption ? `: "${rawCaption.slice(0, 140)}"` : '.'}`
          : `${post.authorName} shared a ${mediaKind} on WaveLink${rawCaption ? `: "${rawCaption.slice(0, 140)}"` : '.'}`);
      await setCachedWelinkResponse({
        key: cacheKey,
        userScope: currentUser?.uid || userProfile?.id || 'guest',
        prompt,
        reply: cleanText,
        model: res?.model || 'gemini-3.8-flash',
      });
      setAiInfoSummaryMap((prev) => ({
        ...prev,
        [post.id]: { loading: false, text: cleanText, tags: extractedTags },
      }));
    } catch {
      const fallbackText =
        language === 'sw'
          ? `${post.authorName} ameshiriki ${mediaKind} kwenye WaveLink${rawCaption ? `: "${rawCaption.slice(0, 140)}"` : '.'}`
          : `${post.authorName} shared a ${mediaKind} on WaveLink${rawCaption ? `: "${rawCaption.slice(0, 140)}"` : '.'}`;
      setAiInfoSummaryMap((prev) => ({
        ...prev,
        [post.id]: { loading: false, text: fallbackText, tags: extractedTags },
      }));
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastNotice({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastNotice(null);
    }, 2800);
  };

  const handleDownloadPost = async (post: Post) => {
    try {
      const res = await downloadPost(post);
      showToast(res?.message || 'Downloaded!', 'success');
    } catch (err: any) {
      showToast(err?.message || "Couldn't download", 'error');
    }
  };

  const handleSharePost = (post: Post) => {
    setActiveSharePost(post);
  };

  const handleCommentCountChange = (postId: string, newCount: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, commentsCount: newCount } : p))
    );
    setActiveCommentsPost((prev) =>
      prev && prev.id === postId ? { ...prev, commentsCount: newCount } : prev
    );
    setFocusedPost((prev) =>
      prev && prev.id === postId ? { ...prev, commentsCount: newCount } : prev
    );
  };

  const handleShareCountChange = (postId: string, newCount: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, sharesCount: newCount } : p))
    );
    setActiveSharePost((prev) =>
      prev && prev.id === postId ? { ...prev, sharesCount: newCount } : prev
    );
    setFocusedPost((prev) =>
      prev && prev.id === postId ? { ...prev, sharesCount: newCount } : prev
    );
  };

  // Reaction animation & optimistic state
  const [animatingReactions, setAnimatingReactions] = useState<Record<string, boolean>>({});
  const [floatingBursts, setFloatingBursts] = useState<Record<string, number>>({});
  const [sponsoredReactions, setSponsoredReactions] = useState<Record<string, Post>>({});

  // Kind Engagement: Skippable first-time welcome card & Suggested community members
  const [showWelcomeFlow, setShowWelcomeFlow] = useState<boolean>(() => {
    if (!currentUser?.uid) return false;
    return !localStorage.getItem(`wavelink_welcome_skipped_${currentUser.uid}`);
  });
  const [suggestedMembers, setSuggestedMembers] = useState<UserProfile[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>(userProfile?.followingIds || []);
  const [checkInDoneToday, setCheckInDoneToday] = useState<boolean>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(`wavelink_checkin_${currentUser?.uid}_${today}`) === '1';
  });

  // Feed Pagination & Refresh State (10 posts at a time + startAfter)
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (userProfile?.followingIds) {
      setFollowedIds(userProfile.followingIds);
    }
  }, [userProfile?.followingIds]);

  // Suggested community members: load once with limit(8) and batch cache profiles
  useEffect(() => {
    if (!currentUser?.uid || !showWelcomeFlow) {
      setIsLoadingSuggested(false);
      return;
    }
    let isMounted = true;
    const fetchSuggested = async () => {
      setIsLoadingSuggested(true);
      try {
        const q = query(collection(db, 'users'), limit(8));
        const snap = await getDocs(q);
        if (!isMounted) return;
        const candidates: UserProfile[] = [];
        snap.forEach((d) => {
          const u = { ...(d.data() as UserProfile), id: d.id };
          if (u.id !== currentUser.uid) {
            candidates.push(u);
          }
        });
        batchCacheUserProfiles(candidates);
        const ranked = [...candidates].sort((a, b) => {
          const scoreB = scoreCreatorByInterests(b, userProfile?.interests || []);
          const scoreA = scoreCreatorByInterests(a, userProfile?.interests || []);
          return scoreB - scoreA;
        });
        setSuggestedMembers(ranked.slice(0, 3));
      } catch (err) {
        if (isFirestoreQuotaError(err)) notifyQuotaExceeded(err);
      } finally {
        if (isMounted) setIsLoadingSuggested(false);
      }
    };
    fetchSuggested();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid, showWelcomeFlow, userProfile?.interests]);

  const handleDismissWelcome = () => {
    if (currentUser?.uid) {
      localStorage.setItem(`wavelink_welcome_skipped_${currentUser.uid}`, '1');
    }
    setShowWelcomeFlow(false);
  };

  const handleFollowMember = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    const isAlreadyFollowing = followedIds.includes(targetUser.id);
    if (!isAlreadyFollowing) {
      const { getTeenRestrictionState, submitTeenFollowRequest } = await import(
        '../services/parentalService'
      );
      const targetTeen = getTeenRestrictionState(targetUser);
      if (targetTeen.isTeen && targetTeen.requireFollowerApproval) {
        await submitTeenFollowRequest(targetUser.id);
        return;
      }
    }
    const nextFollowing = isAlreadyFollowing
      ? followedIds.filter((id) => id !== targetUser.id)
      : [...followedIds, targetUser.id];
    setFollowedIds(nextFollowing);
    try {
      await updateUserProfile({ followingIds: nextFollowing });
      if (!isAlreadyFollowing) {
        triggerCelebration('follow');
        await setDoc(doc(db, 'follows', `${currentUser.uid}_${targetUser.id}`), {
          followerId: currentUser.uid,
          followingId: targetUser.id,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Follow update notice:', err);
    }
  };

  const handleDailyCheckIn = async () => {
    if (!currentUser || checkInDoneToday) return;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`wavelink_checkin_${currentUser.uid}_${today}`, '1');
    setCheckInDoneToday(true);
    try {
      await recordPointTransaction({
        type: 'earned',
        category: 'daily_reward',
        title: 'Daily Community Check-In',
        description: 'Friendly daily check-in bonus',
        amount: 15
      });
    } catch (err) {
      console.warn('Check-in points notice:', err);
    }
  };

  // Trending Creator Loader: single limited query (limit(1)) ordered by likesCount desc
  const loadTrendingCreatorPost = async () => {
    setIsLoadingTrendingCreator(true);
    try {
      const trendingQuery = query(collection(db, 'posts'), orderBy('likesCount', 'desc'), limit(1));
      const snap = await getDocs(trendingQuery);
      if (!snap.empty) {
        const d = snap.docs[0];
        setTrendingCreatorPost({ id: d.id, ...d.data() } as Post);
      }
    } catch (error) {
      if (isFirestoreQuotaError(error)) notifyQuotaExceeded(error);
    } finally {
      setIsLoadingTrendingCreator(false);
    }
  };

  const handleHidePost = (postId: string) => {
    const nextHidden = Array.from(new Set([...hiddenPostIds, postId]));
    setHiddenPostIds(nextHidden);
    try {
      localStorage.setItem(
        `wavelink_hidden_posts_${currentUser?.uid || 'guest'}`,
        JSON.stringify(nextHidden)
      );
    } catch {
      // ignore storage errors
    }
    setActiveGridActionPostId(null);
    showToast(language === 'sw' ? 'Chapisho limefichwa' : 'Post hidden from your feed', 'success');
  };

  // Single Unified Feed Loader: 12 posts at a time using getDocs (eliminates duplicate grid query & cuts reads in half)
  const loadInitialPosts = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(12));
      const snapshot = await getDocs(postsQuery);
      const docs: Post[] = [];
      snapshot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Post);
      });
      setPosts(docs);
      setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMorePosts(snapshot.docs.length === 12);
    } catch (error) {
      console.warn('Feed posts fetch notice:', error);
      if (isFirestoreQuotaError(error)) {
        notifyQuotaExceeded(error);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Load more posts: fetches next 12 posts using startAfter(lastVisibleDoc) into the same unified grid
  const loadMorePosts = async () => {
    if (isLoadingMore || !hasMorePosts || !lastVisibleDoc) return;
    setIsLoadingMore(true);
    try {
      const nextQuery = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        limit(12)
      );
      const snapshot = await getDocs(nextQuery);
      if (!snapshot.empty) {
        const newDocs: Post[] = [];
        snapshot.forEach((docSnap) => {
          newDocs.push({ id: docSnap.id, ...docSnap.data() } as Post);
        });
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const uniqueNew = newDocs.filter((p) => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMorePosts(snapshot.docs.length === 12);
      } else {
        setHasMorePosts(false);
      }
    } catch (error) {
      console.warn('Load more posts notice:', error);
      if (isFirestoreQuotaError(error)) {
        notifyQuotaExceeded(error);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Initial load on mount + deep-link support for shared ?post=ID URLs
  useEffect(() => {
    loadInitialPosts();
    loadTrendingCreatorPost();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sharedPostId = params.get('post');
      if (sharedPostId) {
        getDoc(doc(db, 'posts', sharedPostId))
          .then((snap) => {
            if (snap.exists()) {
              const sharedPost = { id: snap.id, ...snap.data() } as Post;
              setPosts((prev) => [sharedPost, ...prev.filter((p) => p.id !== sharedPost.id)]);
              setFocusedPost(sharedPost);
            }
          })
          .catch(() => {});
      }
    }

    const handleVideoPostCreated = (ev: Event) => {
      const created = (ev as CustomEvent<Post>)?.detail;
      if (created && created.id) {
        setPosts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      }
    };
    window.addEventListener('wavelink:video-post-created', handleVideoPostCreated);

    return () => {
      window.removeEventListener('wavelink:video-post-created', handleVideoPostCreated);
    };
  }, [currentUser?.uid]);

  // Infinite scroll observer: trigger loadMorePosts when user scrolls near the end
  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePosts && !isLoadingMore && !isLoading) {
          loadMorePosts();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMorePosts, isLoadingMore, isLoading, lastVisibleDoc]);

  // Subscribe to RTDB presence ONLY for the 1–3 feed posts currently visible on screen
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setVisibleFeedPostIds(posts.slice(0, 3).map((p) => p.id));
      return;
    }

    const ratioByPostId = new Map<string, number>();
    let rafId: number | null = null;

    const flushVisibleTopThree = () => {
      rafId = null;
      const topIds = Array.from(ratioByPostId.entries())
        .filter(([, ratio]) => ratio > 0.05)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      setVisibleFeedPostIds((prev) => {
        if (prev.length === topIds.length && prev.every((id, idx) => id === topIds[idx])) {
          return prev;
        }
        return topIds;
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const postId = (entry.target as HTMLElement).getAttribute('data-post-id');
          if (!postId) return;
          if (entry.isIntersecting) {
            ratioByPostId.set(postId, entry.intersectionRatio || 0.1);
          } else {
            ratioByPostId.delete(postId);
          }
        });
        if (!rafId) {
          rafId = window.requestAnimationFrame(flushVisibleTopThree);
        }
      },
      { threshold: [0, 0.15, 0.4, 0.7] }
    );

    const observeTimer = window.setTimeout(() => {
      const elements = document.querySelectorAll<HTMLElement>(
        'article[data-wave-feed-item="true"][data-post-id]'
      );
      elements.forEach((el) => observer.observe(el));
    }, 60);

    return () => {
      window.clearTimeout(observeTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [posts, feedMode, internalFilterTag]);

  // Fetch announcements for pinned banner and right sidebar: load once with limit(5)
  useEffect(() => {
    let isMounted = true;
    setIsLoadingAnnouncements(true);
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        if (!isMounted) return;
        let latest: Announcement | null = null;
        let pinned: Announcement | null = null;
        snap.forEach((d) => {
          const item = { id: d.id, ...d.data() } as Announcement;
          if (!latest) latest = item;
          if (!pinned && item.isPinned) pinned = item;
        });
        setLatestAnnouncement(latest);
        setPinnedAnnouncement(pinned);
      } catch (err) {
        console.warn('Announcements fetch notice:', err);
        if (isFirestoreQuotaError(err)) notifyQuotaExceeded(err);
      } finally {
        if (isMounted) setIsLoadingAnnouncements(false);
      }
    };
    fetchAnnouncements();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  // RSVP toggle for announcement card
  const handleToggleAnnouncementRsvp = async (id: string) => {
    if (!currentUser) return;
    const target = pinnedAnnouncement?.id === id ? pinnedAnnouncement : latestAnnouncement;
    if (!target) return;
    const isGoing = target.rsvpUserIds?.includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'announcements', id), {
        rsvpUserIds: isGoing ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (err) {
      console.error('Failed to update RSVP:', err);
    }
  };

  // Toggle comments expander: loads comments once on demand with limit(30)
  const toggleComments = async (postId: string) => {
    const willOpen = !expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: willOpen }));

    if (willOpen && commentsMap[postId] === undefined) {
      setLoadingCommentsMap((lm) => ({ ...lm, [postId]: true }));
      try {
        const commentsRef = collection(db, 'posts', postId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'), limit(30));
        const snap = await getDocs(q);
        const list: PostComment[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PostComment));
        setCommentsMap((prev) => ({ ...prev, [postId]: list }));
      } catch (err) {
        console.warn('Comments fetch notice:', err);
        if (isFirestoreQuotaError(err)) notifyQuotaExceeded(err);
      } finally {
        setLoadingCommentsMap((lm) => ({ ...lm, [postId]: false }));
      }
    }
  };

  // Helper to resolve current reaction arrays & counts (with backwards-compatibility for existing post.likes)
  const getReactionData = (rawPost: Post) => {
    const post = rawPost.isSponsored && sponsoredReactions[rawPost.id] ? sponsoredReactions[rawPost.id] : rawPost;
    const likeUsers = post.reactions?.like || [];
    const heartUsers =
      post.reactions?.heart !== undefined ? post.reactions.heart : post.likes || [];
    const fireUsers = post.reactions?.fire || [];

    const likeCount =
      post.reactionCounts?.like !== undefined ? post.reactionCounts.like : likeUsers.length;
    const heartCount =
      post.reactionCounts?.heart !== undefined
        ? post.reactionCounts.heart
        : post.reactions?.heart !== undefined
        ? heartUsers.length
        : Math.max(post.likesCount || 0, heartUsers.length);
    const fireCount =
      post.reactionCounts?.fire !== undefined ? post.reactionCounts.fire : fireUsers.length;

    const uid = currentUser?.uid || '';
    return {
      likeUsers,
      heartUsers,
      fireUsers,
      counts: {
        like: likeCount,
        heart: heartCount,
        fire: fireCount,
        total: likeCount + heartCount + fireCount
      },
      active: {
        like: Boolean(uid && likeUsers.includes(uid)),
        heart: Boolean(uid && heartUsers.includes(uid)),
        fire: Boolean(uid && fireUsers.includes(uid))
      }
    };
  };

  // Toggle Reaction (like, heart, fire) in Firestore with click animation
  const handleToggleReaction = async (rawPost: Post, type: ReactionType) => {
    if (!currentUser) return;

    const animKey = `${rawPost.id}_${type}`;
    setAnimatingReactions((prev) => ({ ...prev, [animKey]: true }));
    setTimeout(() => {
      setAnimatingReactions((prev) => ({ ...prev, [animKey]: false }));
    }, 650);

    const { likeUsers, heartUsers, fireUsers, counts, active } = getReactionData(rawPost);
    const isCurrentlyActive = active[type];

    if (!isCurrentlyActive) {
      triggerCelebration('like');
      setFloatingBursts((prev) => ({ ...prev, [animKey]: Date.now() }));
      setTimeout(() => {
        setFloatingBursts((prev) => {
          const next = { ...prev };
          delete next[animKey];
          return next;
        });
      }, 720);
    }

    const uid = currentUser.uid;
    const nextLikes =
      type === 'like'
        ? isCurrentlyActive
          ? likeUsers.filter((id) => id !== uid)
          : [...likeUsers, uid]
        : likeUsers;

    const nextHearts =
      type === 'heart'
        ? isCurrentlyActive
          ? heartUsers.filter((id) => id !== uid)
          : [...heartUsers, uid]
        : heartUsers;

    const nextFires =
      type === 'fire'
        ? isCurrentlyActive
          ? fireUsers.filter((id) => id !== uid)
          : [...fireUsers, uid]
        : fireUsers;

    // Sponsored posts are client-side curated units; update local interactive state
    if (rawPost.isSponsored) {
      const basePost = sponsoredReactions[rawPost.id] || rawPost;
      const delta = isCurrentlyActive ? -1 : 1;
      setSponsoredReactions((prev) => ({
        ...prev,
        [rawPost.id]: {
          ...basePost,
          likes: nextHearts,
          likesCount: Math.max(0, counts.heart + (type === 'heart' ? delta : 0)),
          reactions: {
            like: nextLikes,
            heart: nextHearts,
            fire: nextFires
          },
          reactionCounts: {
            like: Math.max(0, counts.like + (type === 'like' ? delta : 0)),
            heart: Math.max(0, counts.heart + (type === 'heart' ? delta : 0)),
            fire: Math.max(0, counts.fire + (type === 'fire' ? delta : 0))
          }
        }
      }));
      return;
    }

    const updatedReactions = {
      like: nextLikes,
      heart: nextHearts,
      fire: nextFires
    };
    const updatedReactionCounts = {
      like: nextLikes.length,
      heart: nextHearts.length,
      fire: nextFires.length
    };

    // Instant optimistic update on feed posts
    setPosts((prev) =>
      prev.map((p) =>
        p.id === rawPost.id
          ? {
              ...p,
              reactions: updatedReactions,
              reactionCounts: updatedReactionCounts,
              likes: nextHearts,
              likesCount: nextHearts.length
            }
          : p
      )
    );

    try {
      await updateDoc(doc(db, 'posts', rawPost.id), {
        reactions: updatedReactions,
        reactionCounts: updatedReactionCounts,
        likes: nextHearts,
        likesCount: nextHearts.length
      });

      // Dispatch notification to post author when adding a reaction
      if (!isCurrentlyActive && rawPost.authorId && rawPost.authorId !== currentUser.uid) {
        const reactionLabels: Record<ReactionType, { emoji: string; verb: string; title: string }> = {
          like: { emoji: '👍', verb: 'liked', title: 'New Like on Your Wave! 👍' },
          heart: { emoji: '❤️', verb: 'loved', title: 'Wave Loved! ❤️' },
          fire: { emoji: '🔥', verb: 'hyped', title: 'Your Wave Is On Fire! 🔥' }
        };
        const meta = reactionLabels[type];
        sendNotification({
          recipientId: rawPost.authorId,
          type: 'post_like',
          title: meta.title,
          body: `${userProfile?.displayName || currentUser.displayName || 'A waver'} ${meta.verb} your wave ${meta.emoji}`,
          entityId: rawPost.id,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName || currentUser.displayName || 'A waver',
          actorPhotoURL: getBestAuthUserPhotoUrl(currentUser, userProfile) || undefined
        });
      }

      // Anti-cheat verified challenge like counter sync (distinct accounts, no author self-likes, spike detection)
      if (rawPost.challengeId && (type === 'heart' || type === 'like')) {
        void syncChallengePostLike(
          rawPost.challengeId,
          rawPost.id,
          isCurrentlyActive ? 'unlike' : 'like'
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${rawPost.id}`);
    }
  };

  // Save / Bookmark post
  const handleToggleSave = async (postId: string) => {
    await toggleSavePost(postId);
  };

  // Start editing post (Pro or Admin privilege)
  const handleStartEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditPostContent(post.content || '');
  };

  // Save edited post
  const handleSavePostEdit = async (postId: string) => {
    const cleanContent = sanitizeUserText(editPostContent, 2000);
    if (!cleanContent) return;
    setIsSavingPostEdit(true);
    try {
      await updateDoc(doc(db, 'posts', postId), {
        content: cleanContent,
        isEdited: true,
        updatedAt: new Date().toISOString()
      });
      setEditingPostId(null);
      setEditPostContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`);
    } finally {
      setIsSavingPostEdit(false);
    }
  };

  // Delete post
  const handleDeletePost = async (postId: string) => {
    const targetPost = posts.find((p) => p.id === postId);
    try {
      await deleteDoc(doc(db, 'posts', postId));
      if (isAdmin && targetPost && targetPost.authorId !== currentUser?.uid) {
        await recordAdminAuditLog({
          action: 'delete_post',
          targetId: targetPost.authorId,
          targetLabel: targetPost.authorEmail,
          details: `Admin deleted post ${postId}`
        });
      }
      setPostNotice({ type: 'success', text: 'Wave removed.' });
      setTimeout(() => setPostNotice(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
    }
  };

  // Handle media selection for inline post creator (checks 90s duration & 100MB limit immediately)
  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const detectedType = detectFeedMediaType(file);
    if (detectedType === 'invalid') {
      e.target.value = '';
      setPostNotice({ type: 'error', text: 'Please select a valid photo or video file.' });
      return;
    }

    if (detectedType === 'video') {
      const inspection = await inspectAndValidateVideoFile(file, isProTier);
      if (inspection.tooLarge || (!inspection.valid && !inspection.needsTrim)) {
        e.target.value = '';
        setPostNotice({
          type: 'error',
          text:
            inspection.error ||
            `This video is larger than the ${MAX_VIDEO_RAW_MB} MB maximum size limit. Please choose a smaller video.`,
        });
        return;
      }

      // Clone video file into memory before clearing input so browser never invalidates the file handle
      const safeVideoFile = await cloneVideoFileToMemory(file);
      e.target.value = '';
      const rawDur = Math.max(1, Math.round(inspection.durationSeconds || 30));
      setInlineMediaType('video');
      setInlineMediaFile(safeVideoFile);
      setInlineVideoDuration(rawDur);
      setInlineVideoTrimStart(0);
      setInlineVideoTrimEnd(Math.min(maxVideoSeconds, rawDur));
      setInlineVideoNeedsTrim(Boolean(inspection.needsTrim || rawDur > maxVideoSeconds));

      if (inspection.needsTrim || rawDur > maxVideoSeconds) {
        setPostNotice({
          type: 'error',
          text:
            inspection.error ||
            (isProTier
              ? `Pro videos can be up to 90 seconds (this video is ${rawDur}s). Trim to 90s below.`
              : `Free users can upload videos up to 60 seconds, and Pro users up to 90 seconds (this video is ${rawDur}s). Trim to 60s below.`),
        });
      } else {
        setPostNotice(null);
      }

      const videoObjectUrl = URL.createObjectURL(safeVideoFile);
      setInlineMediaPreview(videoObjectUrl);
      return;
    }

    setPostNotice(null);
    setInlineMediaType('image');
    setInlineVideoNeedsTrim(false);
    // Clone image file into memory BEFORE clearing e.target.value so the browser never invalidates the file handle
    const safeImageFile = await cloneVideoFileToMemory(file);
    e.target.value = '';
    setInlineMediaFile(safeImageFile);
    // Show instant objectURL preview locally; actual upload to Cloudinary runs when publishing
    const instantPreviewUrl = URL.createObjectURL(safeImageFile);
    setInlineMediaPreview(instantPreviewUrl);
  };

  // Submit inline post with direct browser-to-Cloudinary unsigned upload (monarcking72 / monarcking72)
  const handleCreatePost = async () => {
    if (!currentUser || (!inlineContent.trim() && !inlineMediaPreview && !inlineMediaFile)) return;

    let postModCheckedAt = new Date().toISOString();
    if (inlineContent.trim()) {
      const spamRes = checkClientSpam('post', inlineContent.trim());
      if (spamRes.isSpam) {
        setPostNotice({ type: 'error', text: spamRes.reason || 'Please slow down before posting again.' });
        return;
      }
      const modVerdict = await validateAndModerateText(inlineContent.trim(), 'post', userProfile);
      if (!modVerdict.allowed) {
        setPostNotice({
          type: 'error',
          text: modVerdict.friendlyMessage,
        });
        return;
      }
      if (modVerdict.moderationCheckedAt) {
        postModCheckedAt = modVerdict.moderationCheckedAt;
      }
    }

    // Enforce Weekly Challenge rules before upload/publish (deadline + entry media type)
    if (joiningChallenge) {
      if (isChallengeExpired(joiningChallenge)) {
        setPostNotice({
          type: 'error',
          text: 'This weekly challenge has ended. Detach it to publish a regular post.',
        });
        return;
      }
      const reqType = joiningChallenge.type || 'any';
      const actualType: 'image' | 'video' | 'none' =
        inlineMediaType === 'video' && inlineMediaFile
          ? 'video'
          : inlineMediaType === 'image' && (inlineMediaFile || inlineMediaPreview)
          ? 'image'
          : 'none';
      if (reqType === 'photo' && actualType !== 'image') {
        setPostNotice({ type: 'error', text: 'This challenge requires a photo post. Attach a photo to enter.' });
        return;
      }
      if (reqType === 'video' && actualType !== 'video') {
        setPostNotice({ type: 'error', text: 'This challenge requires a video post. Attach a video to enter.' });
        return;
      }
      if (reqType === 'text' && actualType !== 'none') {
        setPostNotice({ type: 'error', text: 'This challenge accepts text-only posts. Remove attached media to enter.' });
        return;
      }
    }

    const challengeHashPrefix =
      joiningChallenge?.hashtag && !inlineContent.toLowerCase().includes(joiningChallenge.hashtag.toLowerCase())
        ? `${joiningChallenge.hashtag} `
        : '';

    clearFailedVideoAndStudioDrafts();
    const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';
    const safeAuthorPhotoURL = sanitizeAvatarUrlForFirestore(
      getBestAuthUserPhotoUrl(currentUser, userProfile),
      currentUser.uid
    );

    // Video posts: upload directly from the browser via Cloudflare with live progress bar,
    // create the Firestore post only after the upload succeeds, then show it at the top of the feed.
    if (inlineMediaType === 'video' && inlineMediaFile) {
      const clipDuration = Math.max(1, inlineVideoTrimEnd - inlineVideoTrimStart);
      if (clipDuration > maxVideoSeconds + 0.5) {
        setPostNotice({
          type: 'error',
          text: `Videos can be up to ${maxVideoSeconds} seconds. Please trim your clip to ${maxVideoSeconds}s or less.`,
        });
        setInlineVideoTrimEnd(Math.min(inlineVideoDuration, inlineVideoTrimStart + maxVideoSeconds));
        return;
      }

      setIsSubmittingPost(true);
      setUploadProgress(5);
      setPostNotice(null);

      try {
        let uploadedVideoPost: Post | undefined;
        let uploadedVideoPostId = '';
        await new Promise<void>((resolve, reject) => {
          enqueueVideoUploadJob({
            file: inlineMediaFile,
            isProUser: isProTier,
            authorId: currentUser.uid,
            authorEmail: currentUser.email || '',
            authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
            authorUsername: userProfile?.username || `@${emailPrefix}`,
            authorPhotoURL: safeAuthorPhotoURL,
            audience: postAudience,
            content: cleanCaption(sanitizeUserText(`${challengeHashPrefix}${inlineContent}`, 2000)),
            challengeId: joiningChallenge?.id,
            challengeHashtag: joiningChallenge?.hashtag,
            authorHighlightedBadgeId: userProfile?.highlightedBadgeId || null,
            trimStart: inlineVideoTrimStart,
            trimEnd: inlineVideoTrimEnd,
            onProgress: (pct) => {
              setUploadProgress(Math.max(5, Math.min(99, pct)));
            },
            onComplete: (createdPostId, createdPost) => {
              uploadedVideoPostId = createdPostId;
              uploadedVideoPost = createdPost;
              resolve();
            },
            onError: (errMsg) => {
              reject(new Error(errMsg));
            },
          });
        });

        let challengeEntryErr: string | null = null;
        if (joiningChallenge && uploadedVideoPostId) {
          try {
            await enterPostIntoChallenge({
              challengeId: joiningChallenge.id,
              postId: uploadedVideoPostId,
              content: uploadedVideoPost?.content || `${challengeHashPrefix}${inlineContent.trim()}`,
              mediaType: 'video',
              thumbnailUrl: uploadedVideoPost?.thumbnailUrl,
              authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
              authorUsername: userProfile?.username || `@${emailPrefix}`,
              authorPhotoURL: safeAuthorPhotoURL,
            });
            onClearJoiningChallenge?.();
          } catch (chErr: any) {
            challengeEntryErr = chErr?.message || null;
          }
        }

        setUploadProgress(100);
        triggerCelebration('post');
        setInlineContent('');
        setInlineMediaFile(null);
        setInlineMediaPreview(null);
        setInlineVideoNeedsTrim(false);
        setSelectedFeeling(null);
        setPostAudience('public');
        setPostNotice({
          type: challengeEntryErr ? 'error' : 'success',
          text:
            challengeEntryErr ||
            (joiningChallenge
              ? `Your video entered ${joiningChallenge.title || joiningChallenge.theme}!`
              : language === 'sw'
              ? 'Video yako imechapishwa kupitia Cloudflare!'
              : 'Your video wave is live on the feed via Cloudflare!'),
        });
        setTimeout(() => setPostNotice(null), 5000);
      } catch (videoErr: any) {
        console.error('Video post creation error:', videoErr);
        setPostNotice({
          type: 'error',
          text:
            videoErr?.message ||
            (language === 'sw'
              ? 'Upakiaji wa video umeshindikana. Gusa Jaribu Tena.'
              : 'Video upload failed. Please tap Retry.'),
        });
      } finally {
        setIsSubmittingPost(false);
        setUploadProgress(0);
      }
      return;
    }

    setIsSubmittingPost(true);
    setUploadProgress(5);
    setPostNotice(null);

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      let finalImageUrl: string | undefined = undefined;
      let finalThumbnailUrl: string | undefined = undefined;
      let finalWidth: number | undefined = undefined;
      let finalHeight: number | undefined = undefined;
      let finalMediaType: 'image' | 'video' | undefined = undefined;
      let finalMediaSafety: 'safe' | 'borderline' | undefined = undefined;

      if (inlineMediaType === 'image' && (inlineMediaFile || inlineMediaPreview)) {
        if (inlineMediaFile) {
          const uploaded = await uploadImageToCloudinary(inlineMediaFile, (pct) => {
            setUploadProgress(Math.max(8, Math.min(92, pct)));
          });
          if (!uploaded.secureUrl || !uploaded.secureUrl.startsWith('http')) {
            throw new Error('Cloudflare photo upload did not return a valid HTTPS URL.');
          }
          finalImageUrl = uploaded.secureUrl;
          finalThumbnailUrl = uploaded.thumbnailUrl || uploaded.secureUrl;
          finalWidth = uploaded.width;
          finalHeight = uploaded.height;
          if (uploaded.mediaSafety === 'borderline' || uploaded.mediaSafety === 'safe') {
            finalMediaSafety = uploaded.mediaSafety;
          }
        } else if (
          inlineMediaPreview &&
          (inlineMediaPreview.startsWith('https://') || inlineMediaPreview.startsWith('http://'))
        ) {
          finalImageUrl = inlineMediaPreview;
          finalThumbnailUrl = inlineMediaPreview;
        } else {
          throw new Error('Please select a valid photo file to upload via Cloudflare.');
        }
        finalMediaType = 'image';
        setUploadProgress(94);
      }

      const feelingTag = selectedFeeling
        ? ` — ${language === 'sw' ? 'anajihisi ' + selectedFeeling.labelSw : 'feeling ' + selectedFeeling.labelEn} ${selectedFeeling.emoji}`
        : '';

      const { getTeenRestrictionState } = await import('../services/parentalService');
      const teenPostGuard = getTeenRestrictionState(userProfile);
      const effectivePostAudience: 'public' | 'followers' | 'close_friends' =
        teenPostGuard.isTeen && !teenPostGuard.canPostPublicly
          ? postAudience === 'close_friends'
            ? 'close_friends'
            : 'followers'
          : postAudience;

      const newPost: Post = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL: safeAuthorPhotoURL,
        authorHighlightedBadgeId: userProfile?.highlightedBadgeId || null,
        challengeId: joiningChallenge?.id || undefined,
        challengeHashtag: joiningChallenge?.hashtag || undefined,
        content: cleanCaption(sanitizeUserText(`${challengeHashPrefix}${inlineContent.trim()}${feelingTag}`, 2000)),
        imageUrl: finalImageUrl,
        thumbnailUrl: finalThumbnailUrl,
        mediaType: finalMediaType,
        mediaSafety: finalMediaSafety || 'safe',
        moderationChecked: true,
        moderationCheckedAt: postModCheckedAt,
        videoWidth: finalWidth,
        videoHeight: finalHeight,
        countryCode: activeCountryCode,
        // Teen Safety: location sharing is strictly disabled for teen accounts
        locationTag: teenPostGuard.canShareLocation
          ? `${activeCountryMeta.flag} ${activeCountryMeta.nameEn}`
          : undefined,
        audience: effectivePostAudience,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        createdAt: new Date().toISOString()
      };

      // Validate < 900 KB & zero base64/data URLs, and create the Firestore document with timeout and server fallback
      await savePostDocument(newPost);

      // Register entry & atomic participant counter if joining a Weekly Challenge
      let challengeEntryErr: string | null = null;
      if (joiningChallenge) {
        try {
          await enterPostIntoChallenge({
            challengeId: joiningChallenge.id,
            postId,
            content: newPost.content,
            mediaType: finalMediaType === 'image' ? 'image' : 'none',
            thumbnailUrl: finalThumbnailUrl,
            imageUrl: finalImageUrl,
            authorName: newPost.authorName,
            authorUsername: newPost.authorUsername,
            authorPhotoURL: newPost.authorPhotoURL,
          });
          onClearJoiningChallenge?.();
        } catch (chErr: any) {
          challengeEntryErr = chErr?.message || null;
        }
      }

      setUploadProgress(100);

      // Trigger first-time celebration animation for new post
      triggerCelebration('post');

      // Show the newly created post at the top of the unified feed after upload + Firestore creation succeed
      setPosts((prev) => [newPost, ...prev.filter((p) => p.id !== postId)]);

      // Server-verified XP & badge progression (enforced daily caps, 0 extra client Firestore reads)
      const lowerPostText = (newPost.content || '').toLowerCase();
      awardProgressionAction('post_created').catch(() => {});
      const matchedChallengeTag = lowerPostText.match(/#(wavehustle\w*|challenge\w*|shindano\w*)/i);
      if (joiningChallenge || matchedChallengeTag) {
        awardProgressionAction('challenge_joined', {
          challengeId: joiningChallenge?.id || `weekly_${matchedChallengeTag?.[0].toLowerCase()}`,
          challengeTitle: joiningChallenge?.title || joiningChallenge?.theme || `Weekly Challenge (${matchedChallengeTag?.[0]})`,
          challengeHashtag: joiningChallenge?.hashtag || matchedChallengeTag?.[0] || '',
          thumbnailUrl: newPost.thumbnailUrl || newPost.imageUrl
        }).catch(() => {});
      }

      // Reset form
      setInlineContent('');
      setInlineMediaFile(null);
      setInlineMediaPreview(null);
      setSelectedFeeling(null);
      setPostAudience('public');
      setPostNotice({
        type: challengeEntryErr ? 'error' : 'success',
        text:
          challengeEntryErr ||
          (joiningChallenge
            ? `Your post entered ${joiningChallenge.title || joiningChallenge.theme}!`
            : finalMediaType === 'image'
            ? (language === 'sw' ? 'Picha yako imechapishwa kupitia Cloudflare!' : 'Your photo wave is live on the feed via Cloudflare!')
            : (language === 'sw' ? 'Ujumbe wako umechapishwa!' : 'Your wave is live on the community feed!'))
      });
      setTimeout(() => setPostNotice(null), 5000);
    } catch (err: any) {
      console.error('Post creation error:', err);
      setPostNotice({
        type: 'error',
        text:
          err?.message ||
          (language === 'sw'
            ? 'Kuna hitilafu imetokea, hebu jaribu tena.'
            : "Something went wrong, let's try again.")
      });
    } finally {
      setIsSubmittingPost(false);
      setUploadProgress(0);
    }
  };

  // Compute overlapping avatars & "Liked by Name & others" from in-memory feed/reaction data (zero extra Firestore reads)
  const getLikedByInfo = (post: Post) => {
    const { likeUsers, heartUsers, fireUsers, counts } = getReactionData(post);
    const allReactors = Array.from(new Set([...heartUsers, ...likeUsers, ...fireUsers]));
    const totalReactions = Math.max(counts.total, allReactors.length);

    // Build a quick lookup from already-loaded posts & suggestedMembers in memory
    const knownProfiles = new Map<string, { name: string; avatar: string }>();
    if (currentUser?.uid) {
      knownProfiles.set(currentUser.uid, {
        name: userProfile?.displayName || currentUser.displayName || 'You',
        avatar: resolveUserAvatarUrl(
          currentUser.uid,
          getBestAuthUserPhotoUrl(currentUser, userProfile),
          userProfile
        ),
      });
    }
    posts.forEach((p) => {
      if (p.authorId && p.authorName && !knownProfiles.has(p.authorId)) {
        knownProfiles.set(p.authorId, {
          name: p.authorName.split(' ')[0] || p.authorName,
          avatar: resolveUserAvatarUrl(p.authorId, p.authorPhotoURL),
        });
      }
    });
    suggestedMembers.forEach((m) => {
      if (m.id && m.displayName && !knownProfiles.has(m.id)) {
        knownProfiles.set(m.id, {
          name: m.displayName.split(' ')[0] || m.displayName,
          avatar: resolveUserAvatarUrl(m.id, m.photoURL, m),
        });
      }
    });

    const matchedUsers = allReactors
      .map((uid) => knownProfiles.get(uid))
      .filter((u): u is { name: string; avatar: string } => Boolean(u));

    const firstLikerName =
      matchedUsers[0]?.name ||
      (totalReactions > 0
        ? suggestedMembers[0]?.displayName?.split(' ')[0] ||
          post.authorName.split(' ')[0] ||
          'Waver'
        : null);

    const avatarList: string[] = [];
    matchedUsers.slice(0, 2).forEach((u) => avatarList.push(u.avatar));
    if (avatarList.length < 2 && totalReactions > 0) {
      const fallbackSeeds = [
        allReactors[0] || `${post.id}_a`,
        allReactors[1] || `${post.id}_b`,
      ];
      while (avatarList.length < Math.min(2, Math.max(1, totalReactions))) {
        const seed = fallbackSeeds[avatarList.length] || `${post.id}_${avatarList.length}`;
        avatarList.push(`https://api.dicebear.com/7.x/shapes/svg?seed=${seed}`);
      }
    }

    return {
      totalReactions,
      firstLikerName,
      avatars: avatarList.slice(0, 2),
    };
  };

  // Reusable Glass Pill Reaction Bar Group (Heart ❤️ primary + Like 👍 + Fire 🔥) with spring animation & glow
  const renderReactionBar = (post: Post) => {
    const { counts, active } = getReactionData(post);
    const likeAnim = animatingReactions[`${post.id}_like`];
    const heartAnim = animatingReactions[`${post.id}_heart`];
    const fireAnim = animatingReactions[`${post.id}_fire`];

    const likeBurst = floatingBursts[`${post.id}_like`];
    const heartBurst = floatingBursts[`${post.id}_heart`];
    const fireBurst = floatingBursts[`${post.id}_fire`];

    const primaryHeartCount = Math.max(counts.heart, counts.total);
    const isHeartOrLikeActive = active.heart || active.like;

    return (
      <div className="inline-flex items-center gap-2 flex-wrap">
        {/* PRIMARY HEART GLASS PILL (Heart + Count with spring animation and rose glow on press) */}
        <button
          type="button"
          onClick={() => handleToggleReaction(post, 'heart')}
          title={language === 'sw' ? 'Penda chapisho' : 'Love wave'}
          aria-label={`Like post (${primaryHeartCount})`}
          className={`wavelink-glass-action-pill relative min-h-[40px] px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-extrabold select-none cursor-pointer transition-transform active:scale-95 ${
            isHeartOrLikeActive ? 'wavelink-glass-action-pill--heart-active' : ''
          }`}
        >
          {(heartBurst || likeBurst) && (
            <span
              key={heartBurst || likeBurst}
              className="pointer-events-none absolute -top-1 left-1/2 text-sm animate-reaction-float z-20"
            >
              ❤️
            </span>
          )}
          <Heart
            size={15}
            className={`transition-transform ${
              heartAnim || likeAnim ? 'animate-reaction-heart' : ''
            } ${
              isHeartOrLikeActive
                ? 'fill-[#F43F5E] text-[#F43F5E] drop-shadow-[0_0_8px_rgba(244,63,94,0.65)]'
                : 'text-[#F43F5E]'
            }`}
          />
          <span className="font-mono tabular-nums">
            {formatCompactNumber(primaryHeartCount)}
          </span>
        </button>

        {/* FIRE (Hype) Glass Pill */}
        {counts.fire > 0 || active.fire ? (
          <button
            type="button"
            onClick={() => handleToggleReaction(post, 'fire')}
            title="Fire Wave"
            aria-label={`Fire post (${counts.fire})`}
            className={`wavelink-glass-action-pill relative min-h-[40px] px-3 py-1.5 rounded-full inline-flex items-center gap-1 text-xs font-extrabold select-none cursor-pointer transition-transform active:scale-95 ${
              active.fire ? 'ring-1 ring-orange-400/60 text-orange-500' : ''
            }`}
          >
            {fireBurst && (
              <span
                key={fireBurst}
                className="pointer-events-none absolute -top-1 left-1/2 text-sm animate-reaction-float z-20"
              >
                🔥
              </span>
            )}
            <Flame
              size={14}
              className={`transition-transform ${fireAnim ? 'animate-reaction-fire' : ''} ${
                active.fire ? 'fill-orange-500 text-orange-500' : 'text-orange-500'
              }`}
            />
            <span className="font-mono tabular-nums">{formatCompactNumber(counts.fire)}</span>
          </button>
        ) : null}
      </div>
    );
  };


  // Add Comment
  const handleAddComment = async (postId: string) => {
    const text = sanitizeUserText(commentInput[postId] || '', 800);
    if (!text || !currentUser) return;

    const modVerdict = await validateAndModerateText(text, 'comment', userProfile);
    if (!modVerdict.allowed) {
      setPostNotice({ type: 'error', text: modVerdict.friendlyMessage });
      return;
    }

    try {
      const commentData = {
        postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        authorPhotoURL: resolveUserAvatarUrl(
          currentUser.uid,
          getBestAuthUserPhotoUrl(currentUser, userProfile),
          userProfile
        ),
        content: text,
        moderationChecked: true,
        moderationCheckedAt: modVerdict.moderationCheckedAt || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'posts', postId, 'comments'), commentData);

      const post = posts.find((p) => p.id === postId);
      const newCount = (post?.commentsCount || 0) + 1;
      await updateDoc(doc(db, 'posts', postId), {
        commentsCount: newCount
      });

      // Dispatch post_comment notification to author
      if (post && post.authorId && post.authorId !== currentUser.uid) {
        sendNotification({
          recipientId: post.authorId,
          type: 'post_comment',
          title: 'New Comment on Wave 💬',
          body: `${userProfile?.displayName || currentUser.displayName || 'A waver'} commented: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
          entityId: postId,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName || currentUser.displayName || 'A waver',
          actorPhotoURL: getBestAuthUserPhotoUrl(currentUser, userProfile) || undefined
        });
      }

      setCommentInput((prev) => ({ ...prev, [postId]: '' }));
      awardProgressionAction('comment_created').catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `posts/${postId}/comments`);
    }
  };

  const copyPostLink = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/#post-${postId}`);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const blockedIds = userProfile?.blockedUserIds || [];
  const mutedIds = userProfile?.mutedUserIds || [];

  const matchesCategory = (p: Post, catId: FeedCategoryId): boolean => {
    if (catId === 'All') return true;
    if (catId === 'Local') {
      return (
        doesPostMatchCountry(p, activeCountryCode) ||
        Boolean(p.locationTag) ||
        FEED_CATEGORIES.find((c) => c.id === 'Local')!.keywords.some((kw) =>
          (p.content || '').toLowerCase().includes(kw)
        )
      );
    }
    if (p.category && p.category.toLowerCase() === catId.toLowerCase()) {
      return true;
    }
    const cat = FEED_CATEGORIES.find((c) => c.id === catId);
    if (!cat || cat.keywords.length === 0) return true;
    const text = `${p.content || ''} ${(p.keywords || []).join(' ')} ${(p.hashtags || []).join(' ')} ${p.songTitle || ''} ${p.songArtist || ''} ${p.locationTag || ''}`.toLowerCase();
    if (catId === 'Music' && (p.songPreviewUrl || p.songTitle)) return true;
    return cat.keywords.some((kw) => text.includes(kw));
  };

  const isPostVisibleToViewer = (p: Post): boolean => {
    if (hiddenPostIds.includes(p.id)) return false;
    if (userProfile?.hideAiGenerated && p.aiGenerated) return false;
    if (blockedIds.includes(p.authorId)) return false;
    if (mutedIds.includes(p.authorId)) return false;
    const authorCached = p.authorId ? getCachedUserProfile(p.authorId) : null;
    if (currentUser?.uid && (authorCached?.blockedUserIds || []).includes(currentUser.uid)) {
      return false;
    }
    if (p.authorId !== currentUser?.uid && !isAdmin) {
      const audience = p.audience || 'public';
      if (audience === 'followers') {
        const viewerFollowsAuthor =
          followedIds.includes(p.authorId) ||
          (userProfile?.followingIds || []).includes(p.authorId);
        if (!viewerFollowsAuthor) return false;
      } else if (audience === 'close_friends') {
        const isCloseFriend =
          Boolean(currentUser?.uid) &&
          (authorCached?.closeFriendIds || []).includes(currentUser!.uid);
        if (!isCloseFriend) return false;
      }
    }
    if (p.isHidden && p.authorId !== currentUser?.uid && !isAdmin) {
      return false;
    }
    return true;
  };

  // Priority sorting:
  // - If feedMode === 'local', show posts from the user's selected country first
  // - If feedMode === 'trending', sort by highest weekly engagement
  // - Boosted posts first, then interest-matched posts for recent waves, with chronological fallback
  const sortedPosts = [...posts]
    .filter(isPostVisibleToViewer)
    .filter((p) => {
      if (feedMode === 'following') {
        return followedIds.includes(p.authorId) || p.authorId === currentUser?.uid;
      }
      if (feedMode === 'saved') {
        return (userProfile?.savedPostIds || []).includes(p.id);
      }
      return true;
    })
    .filter((p) => matchesCategory(p, selectedCategory))
    .sort((a, b) => {
      if (feedMode === 'trending') {
        const scoreA = (a.likesCount || 0) + (a.commentsCount || 0) * 2 + (a.sharesCount || 0) * 2;
        const scoreB = (b.likesCount || 0) + (b.commentsCount || 0) * 2 + (b.sharesCount || 0) * 2;
        if (scoreB !== scoreA) return scoreB - scoreA;
      }
      if (feedMode === 'local') {
        const aLocal = doesPostMatchCountry(a, activeCountryCode);
        const bLocal = doesPostMatchCountry(b, activeCountryCode);
        if (aLocal && !bLocal) return -1;
        if (!aLocal && bLocal) return 1;
      }
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      if (userInterests.length > 0) {
        const ageHoursA = (Date.now() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60);
        const ageHoursB = (Date.now() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60);
        if (ageHoursA <= 72 && ageHoursB <= 72) {
          const scoreA = scorePostByInterests(a, userInterests);
          const scoreB = scorePostByInterests(b, userInterests);
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const activeFilter = (feedSearchQuery.trim() || internalFilterTag || initialFilterTag || null);

  // If hashtag, mention, or search filter is active (matches AI keywords, category, cleaned caption, and creator)
  const filteredSortedPosts = activeFilter
    ? sortedPosts.filter((p) => {
        const q = activeFilter.toLowerCase().replace(/^[@#]/, '');
        return (
          cleanCaption(p.content).toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          (p.keywords || []).some((kw) => kw.toLowerCase().includes(q)) ||
          (p.hashtags || []).some((ht) => ht.toLowerCase().includes(q)) ||
          p.authorUsername?.toLowerCase().includes(q) ||
          p.authorName?.toLowerCase().includes(q) ||
          p.locationTag?.toLowerCase().includes(q)
        );
      })
    : sortedPosts;

  // Choose Trending Creator by highest engagement this week (from the single limit(1) query + loaded posts)
  const bestTrendingCreatorPost: Post | null = (() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pool = [
      ...(trendingCreatorPost ? [trendingCreatorPost] : []),
      ...posts,
    ].filter((p) => p && !p.isSponsored && isPostVisibleToViewer(p));
    if (pool.length === 0) return null;
    const uniqueById = Array.from(new Map(pool.map((p) => [p.id, p])).values());
    const weeklyPool = uniqueById.filter((p) => {
      const ts = new Date(p.createdAt || 0).getTime();
      return Number.isFinite(ts) && ts >= weekAgo;
    });
    const candidates = weeklyPool.length > 0 ? weeklyPool : uniqueById;
    return [...candidates].sort((a, b) => {
      const hasMediaA = Boolean(a.imageUrl || a.imageUrls?.length || a.videoUrl || a.thumbnailUrl) ? 1 : 0;
      const hasMediaB = Boolean(b.imageUrl || b.imageUrls?.length || b.videoUrl || b.thumbnailUrl) ? 1 : 0;
      if (hasMediaB !== hasMediaA) return hasMediaB - hasMediaA;
      const engA = (a.likesCount || 0) + (a.commentsCount || 0) * 2 + (a.sharesCount || 0) * 2;
      const engB = (b.likesCount || 0) + (b.commentsCount || 0) * 2 + (b.sharesCount || 0) * 2;
      return engB - engA;
    })[0] || null;
  })();

  // Unified Home masonry items (excluding the featured hero card when unfiltered so it isn't duplicated at the top)
  const unifiedFeedPosts = filteredSortedPosts.filter((p) =>
    !activeFilter && bestTrendingCreatorPost ? p.id !== bestTrendingCreatorPost.id : true
  );

  // Open full-screen Reels starting at tapped video with all loaded Home videos as swipe queue
  const handleOpenHomeVideoInReels = (videoPost: Post) => {
    const allVideos = [
      ...(bestTrendingCreatorPost ? [bestTrendingCreatorPost] : []),
      ...filteredSortedPosts,
    ].filter((p) => Boolean(p.videoUrl || p.hasVideoChunks || p.mediaType === 'video'));
    const uniqueQueue = Array.from(new Map(allVideos.map((v) => [v.id, v])).values());
    onNavigateTab?.('videos');
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('wavelink:open-reels-queue', {
          detail: {
            startPost: videoPost,
            queue: uniqueQueue.length > 0 ? uniqueQueue : [videoPost],
          },
        })
      );
    }, 40);
  };

  // Interleave subtle, non-intrusive sponsored posts every 8 scrolls/items
  // (Exempt: Admins, Verified members, and Pro users have an ad-free experience!)
  const combinedFeed: Post[] = [];
  let adIdx = 0;
  filteredSortedPosts.forEach((p, idx) => {
    combinedFeed.push(p);
    if (!isProUser && (idx + 1) % 8 === 0 && SPONSORED_ADS[adIdx % SPONSORED_ADS.length]) {
      combinedFeed.push(SPONSORED_ADS[adIdx % SPONSORED_ADS.length]);
      adIdx++;
    }
  });

  // For standard free accounts with small feed, append a sponsored post so the feature is visible
  if (!isProUser && filteredSortedPosts.length < 8 && SPONSORED_ADS.length > 0 && !combinedFeed.some((p) => p.isSponsored) && !activeFilter) {
    combinedFeed.push(SPONSORED_ADS[0]);
  }

  const handleMediaDimensionsReady = (url: string, info: PreloadedMediaInfo) => {
    setPreloadedDimensions((prev) => {
      if (prev[url]) return prev;
      return { ...prev, [url]: info };
    });
  };

  // Preload initial feed items and next 3 upcoming posts as soon as feed data arrives
  useEffect(() => {
    if (isLoading || combinedFeed.length === 0) return;
    preloadUpcomingFeedPosts(combinedFeed, 0, 3, handleMediaDimensionsReady);
  }, [combinedFeed.length, isLoading]);

  // Track window scroll progress, dispatch scroll direction for bottom bar auto-hide, and preload next 3 posts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateReadingProgress = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const delta = scrollTop - lastScrollYRef.current;
      if (Math.abs(delta) > 10) {
        const direction = scrollTop > 72 && delta > 0 ? 'down' : 'up';
        window.dispatchEvent(
          new CustomEvent('wavelink:feed-scroll-direction', { detail: { direction } })
        );
        lastScrollYRef.current = scrollTop;
      } else if (scrollTop <= 16) {
        window.dispatchEvent(
          new CustomEvent('wavelink:feed-scroll-direction', { detail: { direction: 'up' } })
        );
      }

      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const winHeight = window.innerHeight || 1;
      const maxScrollable = Math.max(1, docHeight - winHeight);
      const rawPercent = Math.min(100, Math.max(0, Math.round((scrollTop / maxScrollable) * 100)));
      setFeedReadProgress(scrollTop <= 8 ? 0 : rawPercent);

      const postElements = document.querySelectorAll('[data-wave-feed-item="true"]');
      if (postElements.length === 0) {
        setConsumedPostsCount(0);
        return;
      }
      const viewportThreshold = winHeight * 0.65;
      let viewed = 0;
      let lastVisibleIdx = 0;
      postElements.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportThreshold) {
          viewed += 1;
          lastVisibleIdx = idx;
        }
      });
      setConsumedPostsCount(Math.min(postElements.length, viewed));

      // Smart lookahead: preload the next 3 upcoming posts after the current visible item
      preloadUpcomingFeedPosts(combinedFeed, lastVisibleIdx + 1, 3, handleMediaDimensionsReady);
    };

    updateReadingProgress();
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateReadingProgress);
      window.removeEventListener('resize', updateReadingProgress);
    };
  }, [combinedFeed.length, isLoading]);

  const handleOpenPostDetail = (post: Post) => {
    setFocusedPost(post);
    setDetailReadProgress(15);
    if (!expandedComments[post.id]) {
      toggleComments(post.id);
    }
  };

  // Current weekly Spark of the Day prompt
  const todaySparkPrompt = WEEKLY_SPARK_THEMES[new Date().getDay()] || WEEKLY_SPARK_THEMES[0] || '🔥 What is making you smile today?';

  // Quick search suggestions for the header search pill
  const searchMatchingCreators = (() => {
    const q = feedSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const map = new Map<string, { id: string; name: string; username: string; photoURL?: string }>();
    posts.forEach((p) => {
      if (!p.authorId || p.isSponsored) return;
      if (
        p.authorName?.toLowerCase().includes(q) ||
        p.authorUsername?.toLowerCase().includes(q)
      ) {
        if (!map.has(p.authorId)) {
          map.set(p.authorId, {
            id: p.authorId,
            name: p.authorName,
            username: p.authorUsername || `@${p.authorName.toLowerCase().replace(/\s+/g, '')}`,
            photoURL: p.authorPhotoURL
          });
        }
      }
    });
    return Array.from(map.values()).slice(0, 4);
  })();

  const handleGridCardTouchStart = (postId: string) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setActiveGridActionPostId(postId);
    }, 480);
  };

  const handleGridCardTouchEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleGridCardClick = (post: Post) => {
    if (activeGridActionPostId === post.id) return;
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[post.id] || 0;
    if (now - lastTap < 300) {
      // Double tap to like!
      lastTapTimeRef.current[post.id] = 0;
      void handleToggleReaction(post, 'heart');
      return;
    }
    lastTapTimeRef.current[post.id] = now;
    handleOpenPostDetail(post);
  };

  const getPostPrimaryThumbnail = (p: Post): string | null => {
    if (p.thumbnailUrl && p.thumbnailUrl.startsWith('https://')) {
      return getOptimizedImagePreviewUrl(p.thumbnailUrl, isDataSaverOn);
    }
    const rawImg =
      (p.imageUrls && p.imageUrls.length > 0 ? p.imageUrls[0] : p.imageUrl) || null;
    if (rawImg && rawImg.startsWith('https://')) {
      return getOptimizedImagePreviewUrl(rawImg, isDataSaverOn);
    }
    return null;
  };

  return (
    <div className="wavelink-feed-container relative">
      {/* 1. Single-Layer Fixed Vivid Theme Gradient Backdrop (No stacked blur layers) */}
      <div className="wavelink-feed-vivid-bg" aria-hidden="true" />

      {/* Top Viewport Visual Reading Progress Bar */}
      <div
        role="progressbar"
        aria-label="Feed reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={feedReadProgress}
        className="fixed top-0 left-0 right-0 z-40 h-1 bg-stone-200/40 pointer-events-none overflow-hidden"
      >
        <div
          className="h-full bg-gradient-to-r from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-highlight)] transition-all duration-150 ease-out"
          style={{ width: `${feedReadProgress}%` }}
        />
      </div>

      <div className="wavelink-feed-row relative z-10">
        {/* Center Main Feed (Mobile <= 767px: Full Width Single Column; Desktop >= 1024px: Centered max 680px) */}
        <div className="wavelink-feed-column overflow-hidden">
          {/* Floating "New posts" Pill (Tapping scrolls up and loads new posts without auto-inserting while reading) */}
          {hasNewPosts && (
            <div className="sticky top-3 z-30 flex justify-center pointer-events-none my-1 animate-in fade-in">
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  onLoadNewPosts?.();
                  void loadInitialPosts(true);
                  void loadTrendingCreatorPost();
                }}
                className="pointer-events-auto min-h-[44px] px-4 py-2 rounded-full bg-[#F43F5E] hover:bg-rose-600 text-white text-xs font-extrabold shadow-lg flex items-center gap-2 ring-2 ring-white/80 dark:ring-slate-900 transition active:scale-95 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>{language === 'sw' ? 'Machapisho mapya ↑' : 'New posts ↑'}</span>
              </button>
            </div>
          )}

          {/* 2. HEADER: Large friendly heading + Glassy rounded search pill + Bell icon with red unread dot */}
          <header className="wavelink-feed-hero-header pt-1 pb-1.5">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div>
                <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-[var(--text-primary)] leading-tight">
                  {language === 'sw' ? 'Gundua wimbi lako jipya.' : 'Find your next wave.'}
                </h1>
              </div>
              {/* Bell icon with red dot when there are unread alerts */}
              <div className="shrink-0">
                <NotificationsPopover
                  onNavigateTab={onNavigateTab}
                  onStartChat={onStartChat}
                  hasUnreadNotifications={hasUnreadNotifications}
                  unreadNotificationCount={unreadNotificationCount}
                />
              </div>
            </div>

            {/* Glassy rounded search pill with magnifier */}
            <div className="relative">
              <div className="wavelink-feed-search-pill flex items-center gap-2.5 min-h-[46px] px-4 py-2 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xs transition focus-within:ring-2 focus-within:ring-[var(--accent-primary)]">
                <Search size={18} className="text-[var(--text-secondary)] shrink-0" />
                <input
                  type="search"
                  value={feedSearchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 180)}
                  onChange={(e) => setFeedSearchQuery(e.target.value)}
                  placeholder={
                    language === 'sw'
                      ? 'Tafuta watu, mitindo na mawazo'
                      : 'Search people, trends and ideas'
                  }
                  aria-label="Search people, trends and ideas"
                  className="w-full bg-transparent text-sm sm:text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/75 focus:outline-none"
                />
                {feedSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setFeedSearchQuery('')}
                    aria-label="Clear search"
                    className="min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Quick dropdown suggestions when typing in the search pill */}
              {isSearchFocused && feedSearchQuery.trim().length > 0 && (
                <div className="mt-1.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5 shadow-xl space-y-2 z-30 relative">
                  {searchMatchingCreators.length > 0 && (
                    <div>
                      <span className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                        {language === 'sw' ? 'Wabunifu' : 'Creators'}
                      </span>
                      <div className="mt-1 space-y-1">
                        {searchMatchingCreators.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFeedSearchQuery(c.username);
                              setIsSearchFocused(false);
                            }}
                            className="w-full min-h-[44px] px-2.5 py-1.5 rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-between gap-2 text-left transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar
                                uid={c.id}
                                src={resolveUserAvatarUrl(c.id, c.photoURL)}
                                alt={c.name}
                                fallbackName={c.name}
                                size={32}
                                showStatus={true}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                                  {c.name}
                                </p>
                                <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                                  {c.username}
                                </p>
                              </div>
                            </div>
                            <span className="text-[11px] font-bold text-[var(--accent-primary)]">
                              {language === 'sw' ? 'Tazama' : 'Filter'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-2 pt-1 border-t border-[var(--border-hairline)] text-xs text-[var(--text-secondary)]">
                    <span>
                      {language === 'sw'
                        ? `Inachuja machapisho kwa "${feedSearchQuery.trim()}"`
                        : `Filtering feed for "${feedSearchQuery.trim()}"`}
                    </span>
                    <span className="font-mono font-bold text-[var(--accent-primary)]">
                      {filteredSortedPosts.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Compact Collapsed Cards for Check-In & Spark of the Day (Collapsed by default so stories stay high) */}
          <div className="grid grid-cols-2 gap-2">
            {/* Compact Collapsed Daily Check-In Card */}
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 shadow-2xs">
              <div className="flex items-center justify-between gap-1.5 min-h-[36px]">
                <button
                  type="button"
                  onClick={() => setIsCheckInExpanded((prev) => !prev)}
                  className="flex items-center gap-2 min-w-0 text-left flex-1 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-[#D97706] flex items-center justify-center shrink-0">
                    <Flame size={15} />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                      {checkInDoneToday
                        ? language === 'sw'
                          ? 'Umeingia Leo'
                          : 'Checked In'
                        : language === 'sw'
                        ? 'Ingia Leo'
                        : 'Daily Check-In'}
                    </span>
                    <span className="text-[10px] font-bold text-[#D97706] block truncate">
                      🔥 {Math.max(1, userProfile?.loginStreak ?? 1)}d · +15 pts
                    </span>
                  </div>
                </button>
                {!checkInDoneToday ? (
                  <button
                    type="button"
                    onClick={handleDailyCheckIn}
                    className="min-h-[32px] px-2.5 py-1 rounded-xl bg-[var(--accent-secondary)] text-white text-[11px] font-extrabold shrink-0 active:scale-95 transition cursor-pointer"
                  >
                    +15
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCheckInExpanded((prev) => !prev)}
                    aria-label="Toggle check-in details"
                    className="p-1 text-[var(--text-secondary)] cursor-pointer"
                  >
                    {isCheckInExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                )}
              </div>
              {isCheckInExpanded && (
                <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] flex items-center justify-between gap-2">
                  <span>
                    {checkInDoneToday
                      ? `${t('feed.checkedInToday')} (${(userProfile?.wavePoints ?? 15).toLocaleString()} pts)`
                      : t('feed.tapToCheckIn')}
                  </span>
                  {!checkInDoneToday && (
                    <button
                      type="button"
                      onClick={handleDailyCheckIn}
                      className="px-2.5 py-1 rounded-lg bg-[var(--accent-primary)] text-white font-bold text-[11px] cursor-pointer"
                    >
                      {t('feed.checkInBtn')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Compact Collapsed Spark of the Day Card */}
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 shadow-2xs">
              <div className="flex items-center justify-between gap-1.5 min-h-[36px]">
                <button
                  type="button"
                  onClick={() => setIsSparkPromptExpanded((prev) => !prev)}
                  className="flex items-center gap-2 min-w-0 text-left flex-1 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-xl bg-pink-500/15 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
                    <Sparkles size={15} />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                      {language === 'sw' ? 'Cheche ya Leo' : 'Spark of the Day'}
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)] block truncate">
                      {todaySparkPrompt}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSparkPromptExpanded((prev) => !prev)}
                  aria-label="Toggle Spark of the Day prompt"
                  className="p-1 text-[var(--text-secondary)] shrink-0 cursor-pointer"
                >
                  {isSparkPromptExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
              {isSparkPromptExpanded && (
                <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] space-y-2">
                  <p className="font-semibold text-[var(--text-primary)] leading-snug">
                    {todaySparkPrompt}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('wavelink:open-spark-poster'));
                    }}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#A855F7] via-[#EC4899] to-[#F97316] text-white font-extrabold text-xs cursor-pointer"
                  >
                    {language === 'sw' ? '+ Shiriki Hadithi' : '+ Join Spark Story'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Background Video Upload Progress Chip at the Top of the Feed */}
          <VideoUploadProgressChip variant="feed-inline" />

          {/* Friendly Add to Home Screen Hint */}
          <AddToHomeScreenHintCard compact />

          {/* 3. FRESH STORIES: Horizontal scroll of round story avatars with gradient/grey ring & "+" first */}
          <div className="w-full max-w-full overflow-hidden">
            <SparkTray
              externalPostsToShare={postsForSpark}
              onClearExternalPosts={() => setPostsForSpark(null)}
              onStartChat={onStartChat}
            />
          </div>

          {/* Active Hashtag or Mention Filter Banner */}
          {activeFilter && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white flex items-center justify-between gap-3 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-white/20 text-white shrink-0">
                  {activeFilter.startsWith('@') ? <AtSign size={16} /> : <Hash size={16} />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-extrabold truncate">
                    {language === 'sw' ? 'Inachuja:' : 'Filtered by'}{' '}
                    <span className="underline">{activeFilter}</span> ({filteredSortedPosts.length})
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInternalFilterTag(null);
                  setFeedSearchQuery('');
                  if (onClearFilterTag) onClearFilterTag();
                }}
                className="min-h-[38px] px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1 transition active:scale-95 shrink-0 cursor-pointer"
              >
                <span>{language === 'sw' ? 'Futa' : 'Clear'}</span>
                <X size={13} />
              </button>
            </div>
          )}

          {/* 4. SMALL SWITCHER (Following, Local, Trending) + HORIZONTAL CATEGORY CHIPS */}
          <div className="space-y-2.5">
            {/* Small switcher above the chips for All, Following, Local and Trending */}
            <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-1 rounded-2xl flex items-center justify-between gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setFeedMode('all')}
                className={`flex-1 min-h-[38px] py-1.5 px-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate ${
                  feedMode === 'all'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t('feed.tabAll')}
              </button>

              <button
                type="button"
                onClick={() => setFeedMode('following')}
                className={`flex-1 min-h-[38px] py-1.5 px-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate ${
                  feedMode === 'following'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t('feed.tabFollowing')}
              </button>

              <button
                type="button"
                onClick={() => setFeedMode('local')}
                className={`flex-1 min-h-[38px] py-1.5 px-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate flex items-center justify-center gap-1 ${
                  feedMode === 'local'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{activeCountryMeta.flag}</span>
                <span>{t('feed.tabLocal')}</span>
              </button>

              <button
                type="button"
                onClick={() => setFeedMode('trending')}
                className={`flex-1 min-h-[38px] py-1.5 px-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate flex items-center justify-center gap-1 ${
                  feedMode === 'trending'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Flame size={13} className={feedMode === 'trending' ? 'text-amber-200' : 'text-orange-500'} />
                <span>{t('nav.trending_short')}</span>
              </button>
            </div>

            {/* Category chips: All, Art, Fashion, Travel, Music, Sports, Food, Comedy, Tech, Local */}
            <div
              role="tablist"
              aria-label="Feed categories"
              className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-0.5"
            >
              {FEED_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      if (cat.id === 'Local') {
                        setFeedMode('local');
                      } else if (feedMode === 'local' && cat.id === 'All') {
                        setFeedMode('all');
                      }
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                        : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/50'
                    }`}
                  >
                    {language === 'sw' ? cat.labelSw : cat.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. BIG TOP FEATURED CARD (UnifiedPostCard — Visual Media Only, Tap Video -> Reels) */}
          {!activeFilter && (
            <section aria-label="Featured Wave" className="space-y-4">
              {isLoadingTrendingCreator && !bestTrendingCreatorPost ? (
                <div className="w-full h-60 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] animate-pulse" />
              ) : bestTrendingCreatorPost ? (
                <UnifiedPostCard
                  post={bestTrendingCreatorPost}
                  isLiked={Boolean(
                    getReactionData(bestTrendingCreatorPost).active.heart ||
                      getReactionData(bestTrendingCreatorPost).active.like
                  )}
                  isFeatured={true}
                  activeHoverPostId={activeHoverGridPostId}
                  onRequestHoverPlay={setActiveHoverGridPostId}
                  onOpenVideoInReels={handleOpenHomeVideoInReels}
                  onOpenPostDetail={(targetPost) => handleOpenPostDetail(targetPost)}
                  onToggleLike={(targetPost) => void handleToggleReaction(targetPost, 'heart')}
                  onDoubleTapLike={(targetPost) => void handleToggleReaction(targetPost, 'heart')}
                  onLongPressQuickActions={(targetPost) => setActiveGridActionPostId(targetPost.id)}
                />
              ) : null}
            </section>
          )}

          {/* Compact First-Time Welcome Strip if active */}
          {showWelcomeFlow && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-3 shadow-2xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="min-w-0">
                <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
                  Karibu WaveLink • Welcome! 🌿
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                  Personalize your feed with creators and categories you love.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleDismissWelcome();
                    window.dispatchEvent(new CustomEvent('wavelink:open-interest-picker'));
                  }}
                  className="min-h-[38px] px-3 py-1 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold hover:opacity-95 transition cursor-pointer"
                >
                  Pick Topics
                </button>
                <button
                  type="button"
                  onClick={handleDismissWelcome}
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* One Compact Pinned Notice Card with a single small badge */}
          {isLoadingAnnouncements ? (
            <AnnouncementSkeleton />
          ) : (
            (pinnedAnnouncement || latestAnnouncement) && (
              <div className="w-full max-w-full">
                <RichEventCard
                  announcement={(pinnedAnnouncement || latestAnnouncement)!}
                  isFeedBanner={true}
                  onRsvp={handleToggleAnnouncementRsvp}
                />
              </div>
            )
          )}

          {/* Quick Inline Composer Box */}
          <div className="wavelink-glass-post-card w-full max-w-full overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-5 shadow-xs transition">
            {/* Friendly Greeting Header */}
            <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-[var(--border-hairline)] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌿</span>
                <h3 className="text-sm sm:text-base font-black text-[var(--text-primary)] tracking-tight">
                  {language === 'sw'
                    ? 'Shiriki kitu na marafiki zako'
                    : 'Share something with your friends'}
                </h3>
              </div>
              {selectedFeeling && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold shadow-2xs">
                  <span>{selectedFeeling.emoji}</span>
                  <span>{language === 'sw' ? `anajihisi ${selectedFeeling.labelSw}` : `feeling ${selectedFeeling.labelEn}`}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFeeling(null)}
                    className="ml-1 text-amber-600 hover:text-amber-900 cursor-pointer"
                    aria-label="Remove feeling"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-start gap-3">
              <Avatar
                uid={currentUser?.uid}
                src={resolveUserAvatarUrl(
                  currentUser?.uid,
                  getBestAuthUserPhotoUrl(currentUser, userProfile),
                  userProfile
                )}
                alt="User"
                fallbackName={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                size={44}
                showStatus={true}
                onlyWhenVisible={false}
                targetProfile={userProfile}
                ringClassName="ring-2 ring-[var(--accent-primary)]/20"
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                {joiningChallenge && (
                  <div
                    className="mb-2.5 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                    style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.14)',
                      borderColor: 'rgba(139, 92, 246, 0.42)',
                      color: 'var(--text-primary, #1c1917)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-purple-400">
                        Joining Weekly Challenge • {formatCountdownParts(joiningChallenge.endDate || joiningChallenge.deadline).compact}
                      </p>
                      <p className="text-xs sm:text-sm font-bold truncate">
                        {joiningChallenge.title || joiningChallenge.theme}{' '}
                        <span className="opacity-80">{joiningChallenge.hashtag}</span>
                      </p>
                      <p className="text-[11px] opacity-75">
                        Type: {(joiningChallenge.type || 'any').toUpperCase()}
                        {joiningChallenge.maxEntriesPerUser ? ` • Max ${joiningChallenge.maxEntriesPerUser}/creator` : ''} • One challenge per post
                      </p>
                    </div>
                    {onClearJoiningChallenge && (
                      <button
                        type="button"
                        onClick={onClearJoiningChallenge}
                        aria-label="Detach challenge"
                        className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center border border-purple-400/30 hover:bg-purple-500/20 shrink-0"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}

                <textarea
                  value={inlineContent}
                  onChange={(e) => setInlineContent(e.target.value)}
                  placeholder={
                    joiningChallenge
                      ? `Write your entry for ${joiningChallenge.title || joiningChallenge.theme} (${joiningChallenge.hashtag})...`
                      : language === 'sw'
                      ? 'Shiriki kitu na marafiki zako... unafikiria nini?'
                      : 'Share something with your friends... what is on your mind?'
                  }
                  rows={inlineContent || inlineMediaPreview || joiningChallenge ? 3 : 2}
                  className="w-full max-w-full bg-[var(--bg-subtle)]/70 rounded-2xl p-4 border border-[var(--border-hairline)] resize-none text-base text-[var(--text-primary)] placeholder-[var(--text-secondary)]/70 focus:outline-none focus:bg-[var(--bg-surface)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/15 break-words leading-relaxed transition font-medium"
                />

                {/* Suggested Hashtags based on picked interests */}
                {suggestedHashtags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      {t('interests.suggestedHashtags')}:
                    </span>
                    {suggestedHashtags.slice(0, 6).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setInlineContent((prev) =>
                            prev.includes(tag) ? prev : `${prev.trim() ? `${prev.trim()} ` : ''}${tag} `
                          );
                        }}
                        className="px-2 py-0.5 rounded-lg bg-[var(--bg-subtle)] hover:opacity-90 text-[var(--accent-primary)] border border-[var(--border-hairline)] text-[11px] font-bold transition cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {inlineMediaPreview && (
                  <div className="relative rounded-2xl overflow-hidden my-3 border border-[var(--border-hairline)] bg-[#0C0A09] flex items-center justify-center">
                    {inlineMediaType === 'video' ? (
                      <video src={inlineMediaPreview} controls className="relative z-10 w-full h-auto max-h-72 object-contain" />
                    ) : (
                      <img
                        src={inlineMediaPreview}
                        alt="Preview"
                        className="relative z-10 w-full h-auto max-h-72 object-contain"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInlineMediaFile(null);
                        setInlineMediaPreview(null);
                        setInlineVideoNeedsTrim(false);
                      }}
                      className="absolute top-2.5 right-2.5 min-w-[44px] min-h-[44px] p-2 rounded-full bg-stone-900/80 text-white hover:bg-stone-900 flex items-center justify-center transition"
                      title="Remove attachment"
                    >
                      <X size={16} />
                    </button>

                    {inlineMediaType === 'video' && inlineVideoDuration > 0 && (
                      <div className="p-3 bg-stone-900/95 border-t border-white/10 text-white space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <span className="font-bold">
                            {inlineVideoDuration > maxVideoSeconds
                              ? `Videos can be up to ${maxVideoSeconds}s for ${isProTier ? 'Pro' : 'Free'} users (yours is ${inlineVideoDuration}s)`
                              : `Clip length: ${Math.max(1, Math.round(inlineVideoTrimEnd - inlineVideoTrimStart))}s (up to ${maxVideoSeconds}s ${isProTier ? 'Pro' : 'Free'})`}
                          </span>
                          {inlineVideoDuration > maxVideoSeconds && (
                            <button
                              type="button"
                              onClick={() => {
                                setInlineVideoTrimStart(0);
                                setInlineVideoTrimEnd(maxVideoSeconds);
                                setInlineVideoNeedsTrim(false);
                                setPostNotice({
                                  type: 'success',
                                  text: `Trimmed to first ${maxVideoSeconds} seconds — ready to upload!`,
                                });
                              }}
                              className="px-3 py-1 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xs transition"
                            >
                              Trim to {maxVideoSeconds}s
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="flex justify-between text-stone-300 mb-0.5">
                              <span>Start</span>
                              <span className="font-mono">{inlineVideoTrimStart}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, inlineVideoDuration - 1)}
                              step={1}
                              value={inlineVideoTrimStart}
                              onChange={(e) => {
                                const nextStart = Number(e.target.value);
                                setInlineVideoTrimStart(nextStart);
                                if (inlineVideoTrimEnd <= nextStart) {
                                  setInlineVideoTrimEnd(Math.min(inlineVideoDuration, nextStart + 1));
                                } else if (inlineVideoTrimEnd - nextStart > maxVideoSeconds) {
                                  setInlineVideoTrimEnd(Math.min(inlineVideoDuration, nextStart + maxVideoSeconds));
                                }
                                setInlineVideoNeedsTrim(false);
                              }}
                              className="w-full accent-[#2563EB]"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-stone-300 mb-0.5">
                              <span>End</span>
                              <span className="font-mono">{inlineVideoTrimEnd}s</span>
                            </div>
                            <input
                              type="range"
                              min={Math.min(inlineVideoDuration, inlineVideoTrimStart + 1)}
                              max={Math.min(inlineVideoDuration, inlineVideoTrimStart + maxVideoSeconds)}
                              step={1}
                              value={inlineVideoTrimEnd}
                              onChange={(e) => {
                                setInlineVideoTrimEnd(Number(e.target.value));
                                setInlineVideoNeedsTrim(false);
                              }}
                              className="w-full accent-[#10B981]"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Cloudinary Upload Progress Bar */}
                {isSubmittingPost && uploadProgress > 0 && (
                  <div className="my-3 p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-[#1C1917] mb-1.5">
                      <span>Uploading & publishing...</span>
                      <span className="font-mono text-[var(--accent-primary)]">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Status Notice Toast */}
                {postNotice && (
                  <div
                    className={`my-2.5 p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border ${
                      postNotice.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CheckCircle2
                        size={15}
                        className={`shrink-0 ${
                          postNotice.type === 'success' ? 'text-[#0D9488]' : 'text-rose-600'
                        }`}
                      />
                      <span className="break-words">{postNotice.text}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {postNotice.type === 'error' &&
                        !isSubmittingPost &&
                        (inlineMediaFile || inlineContent.trim()) && (
                          <button
                            type="button"
                            onClick={handleCreatePost}
                            className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw size={12} />
                            <span>Retry</span>
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => setPostNotice(null)}
                        className="text-stone-400 hover:text-stone-700 p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3.5 mt-2.5 border-t border-[var(--border-hairline)] flex-wrap gap-2.5">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic"
                      onChange={handleMediaSelect}
                    />
                    <input
                      type="file"
                      ref={videoInputRef}
                      className="hidden"
                      accept="video/*,.mp4,.mov,.webm,.m4v,.3gp,.mkv"
                      onChange={handleMediaSelect}
                    />

                    {/* Photo Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 text-[var(--accent-primary)] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <ImageIcon size={17} />
                      <span>{language === 'sw' ? 'Picha' : 'Photo'}</span>
                    </button>

                    {/* Video Button */}
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      title={`Upload video up to ${maxVideoSeconds}s (${MAX_VIDEO_RAW_MB} MB max)`}
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 text-[var(--accent-secondary)] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <VideoIcon size={17} />
                      <span>{language === 'sw' ? 'Video' : 'Video'}</span>
                    </button>

                    {/* Feeling Button */}
                    <button
                      type="button"
                      onClick={() => setIsFeelingPickerOpen(true)}
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 text-[#D97706] border border-[var(--border-hairline)] text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <Smile size={17} />
                      <span>{language === 'sw' ? 'Hisia' : 'Feeling'}</span>
                    </button>

                    {/* Audience Selector */}
                    <div className="min-h-[44px] px-3 py-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center gap-1.5">
                      {postAudience === 'public' ? (
                        <Globe size={14} className="text-[var(--accent-primary)] shrink-0" />
                      ) : postAudience === 'followers' ? (
                        <Users size={14} className="text-[var(--accent-secondary)] shrink-0" />
                      ) : (
                        <Lock size={14} className="text-amber-600 shrink-0" />
                      )}
                      <select
                        aria-label="Post audience"
                        value={postAudience}
                        onChange={(e) =>
                          setPostAudience(e.target.value as 'public' | 'followers' | 'close_friends')
                        }
                        className="bg-transparent text-xs font-extrabold text-[var(--text-primary)] focus:outline-none cursor-pointer pr-1"
                      >
                        <option value="public">{language === 'sw' ? 'Kila mtu' : 'Public'}</option>
                        <option value="followers">{language === 'sw' ? 'Wafuasi tu' : 'Followers'}</option>
                        <option value="close_friends">{language === 'sw' ? 'Marafiki wa karibu' : 'Close Friends'}</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={isSubmittingPost || (!inlineContent.trim() && !inlineMediaPreview && !inlineMediaFile)}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition cursor-pointer"
                  >
                    {isSubmittingPost ? (
                      <span>{t('feed.sharing')}</span>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>{language === 'sw' ? 'Chapisha' : 'Post Wave'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Friendly Feeling Picker Modal */}
          {isFeelingPickerOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="How are you feeling?"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 animate-in fade-in"
            >
              <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-5 shadow-2xl relative space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                  <div className="flex items-center gap-2">
                    <Smile size={20} className="text-[#D97706]" />
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                      {language === 'sw' ? 'Unajisikiaje sasa hivi?' : 'How are you feeling?'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFeelingPickerOpen(false)}
                    className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {FEELING_OPTIONS.map((f) => (
                    <button
                      key={f.labelEn}
                      type="button"
                      onClick={() => {
                        setSelectedFeeling(f);
                        setIsFeelingPickerOpen(false);
                      }}
                      className="min-h-[48px] p-3 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 border border-[var(--border-hairline)] text-left flex items-center gap-2.5 transition active:scale-95 cursor-pointer"
                    >
                      <span className="text-2xl">{f.emoji}</span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {language === 'sw' ? f.labelSw : f.labelEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. UNIFIED HOME FEED MASONRY GRID (Single UnifiedPostCard for first page AND every infinite-scroll batch) */}
          <section aria-label="Made for you feed" className="space-y-4">
            {/* Friendly Quota Exceeded Notice */}
            <QuotaExceededBanner onRetry={() => loadInitialPosts(true)} />

            {/* Section Header, Filter Reset & Quick Refresh button */}
            <div className="flex items-center justify-between gap-2 pb-1 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight truncate">
                  {activeFilter
                    ? `${language === "sw" ? "Matokeo ya" : "Results for"} ${activeFilter}`
                    : feedMode === "following"
                    ? language === "sw"
                      ? "Unaowafuata"
                      : "Following"
                    : feedMode === "local"
                    ? `${activeCountryMeta.flag} ${language === "sw" ? "Hapa Karibu" : "Local Waves"}`
                    : feedMode === "trending"
                    ? language === "sw"
                      ? "Vinavyovuma"
                      : "Trending"
                    : feedMode === "saved"
                    ? language === "sw"
                      ? "Zilizohifadhiwa"
                      : "Saved Waves"
                    : language === "sw"
                    ? "Imeundwa Kwa Ajili Yako"
                    : "Made for you"}
                </h2>
                {(selectedCategory !== "All" || activeFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("All");
                      setInternalFilterTag(null);
                      setFeedSearchQuery("");
                    }}
                    className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer shrink-0"
                  >
                    {language === "sw" ? "Onyesha zote" : "Reset"}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  void loadInitialPosts(true);
                  void loadTrendingCreatorPost();
                }}
                disabled={isRefreshing || isLoading}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                title={language === "sw" ? "Onyesha upya mlisho" : "Refresh feed"}
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin text-[var(--accent-secondary)]" : ""} />
                <span>
                  {isRefreshing
                    ? language === "sw"
                      ? "Inaonyesha..."
                      : "Refreshing..."
                    : language === "sw"
                    ? "Onyesha Upya"
                    : "Refresh"}
                </span>
              </button>
            </div>

            <VideoUploadingFeedPostList />

            {isLoading && unifiedFeedPosts.length === 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] animate-pulse ${
                      n % 2 === 0 ? "h-56" : "h-44"
                    }`}
                  />
                ))}
              </div>
            ) : unifiedFeedPosts.length === 0 && !bestTrendingCreatorPost && activeOrFailedVideoJobs.length === 0 ? (
              <div className="wavelink-glass-post-card text-center py-14 px-6 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-xs">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white mx-auto flex items-center justify-center mb-4 shadow-md">
                  <Waves size={32} />
                </div>
                <p className="text-base font-extrabold text-[var(--text-primary)] max-w-sm mx-auto mb-5 leading-snug">
                  {language === "sw"
                    ? "Hakuna kitu hapa bado, kuwa wa kwanza kuchapisha"
                    : "Nothing here yet, be the first to post"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateTab) {
                      onNavigateTab("studio");
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className="min-h-[48px] px-7 py-3 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white font-extrabold text-base shadow-md active:scale-95 transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <Wand2 size={18} />
                  <span>{language === "sw" ? "+ Chapisha Sasa" : "+ Create Post"}</span>
                </button>
              </div>
            ) : (
              <div className="wavelink-masonry-grid">
                {unifiedFeedPosts.map((post) => {
                  const reactionInfo = getReactionData(post);
                  const isHearted = Boolean(
                    reactionInfo.active.heart || reactionInfo.active.like
                  );
                  return (
                    <UnifiedPostCard
                      key={post.id}
                      post={post}
                      isLiked={isHearted}
                      activeHoverPostId={activeHoverGridPostId}
                      onRequestHoverPlay={setActiveHoverGridPostId}
                      onOpenVideoInReels={handleOpenHomeVideoInReels}
                      onOpenPostDetail={(targetPost) => handleOpenPostDetail(targetPost)}
                      onToggleLike={(targetPost) => void handleToggleReaction(targetPost, "heart")}
                      onDoubleTapLike={(targetPost) => void handleToggleReaction(targetPost, "heart")}
                      onLongPressQuickActions={(targetPost) => setActiveGridActionPostId(targetPost.id)}
                    />
                  );
                })}
              </div>
            )}

            {/* Long-Press Quick Actions Sheet (Preserves AI Info, Tip, Comments, Save, Share, Boost, Hide, Delete, Report) */}
            {activeGridActionPostId &&
              (() => {
                const actionPost =
                  posts.find((p) => p.id === activeGridActionPostId) ||
                  (bestTrendingCreatorPost?.id === activeGridActionPostId
                    ? bestTrendingCreatorPost
                    : null);
                if (!actionPost) return null;
                const isSaved = (userProfile?.savedPostIds || []).includes(actionPost.id);
                const isAuthor = actionPost.authorId === currentUser?.uid;
                const canDelete = isAuthor || isAdmin;
                return (
                  <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setActiveGridActionPostId(null)}
                    className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3 animate-in fade-in"
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-4 space-y-1.5 shadow-2xl"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                        <span className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
                          {language === "sw" ? "Chaguo za Haraka" : "Quick Actions"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveGridActionPostId(null)}
                          className="p-1.5 rounded-full hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveGridActionPostId(null);
                          void handleOpenAiInfo(actionPost);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                      >
                        <Sparkles size={16} className="text-[#0D9488]" />
                        <span>{language === "sw" ? "Maelezo ya AI" : "AI info"}</span>
                      </button>

                      {!isAuthor && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveGridActionPostId(null);
                            setTippingPost(actionPost);
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                        >
                          <HandCoins size={16} className="text-amber-500" />
                          <span>{language === "sw" ? "Tuma Bakshishi" : "Tip Creator"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveGridActionPostId(null);
                          setActiveCommentsPost(actionPost);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                      >
                        <MessageCircle size={16} className="text-[#2563EB]" />
                        <span>{language === "sw" ? "Maoni" : "Comments"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleSave(actionPost.id);
                          setActiveGridActionPostId(null);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                      >
                        <Bookmark
                          size={16}
                          className={isSaved ? "fill-amber-400 text-amber-400" : ""}
                        />
                        <span>
                          {isSaved
                            ? language === "sw"
                              ? "Ondoa kwenye Hifadhi"
                              : "Unsave"
                            : language === "sw"
                            ? "Hifadhi"
                            : "Save"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveGridActionPostId(null);
                          handleSharePost(actionPost);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                      >
                        <Share2 size={16} />
                        <span>{language === "sw" ? "Shiriki" : "Share"}</span>
                      </button>

                      {isAuthor && !actionPost.isBoosted && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveGridActionPostId(null);
                            setBoostingPost(actionPost);
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                        >
                          <Rocket size={16} className="text-amber-500" />
                          <span>{language === "sw" ? "Kuza Chapisho" : "Boost Post"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleHidePost(actionPost.id)}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
                      >
                        <EyeOff size={16} />
                        <span>{language === "sw" ? "Ficha" : "Hide"}</span>
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveGridActionPostId(null);
                            void handleDeletePost(actionPost.id);
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-rose-500/10 flex items-center gap-3 text-sm font-bold text-rose-500 cursor-pointer"
                        >
                          <Trash2 size={16} />
                          <span>{language === "sw" ? "Futa Chapisho" : "Delete Post"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveGridActionPostId(null);
                          setReportingPost(actionPost);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl hover:bg-rose-500/10 flex items-center gap-3 text-sm font-bold text-rose-500 cursor-pointer"
                      >
                        <Flag size={16} />
                        <span>{language === "sw" ? "Ripoti" : "Report"}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

            {/* Unified Infinite Scroll Trigger & Load More Button (appends to the SAME UnifiedPostCard grid) */}
            <div ref={loadMoreTriggerRef} className="py-6 flex flex-col items-center justify-center gap-2">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                  <RefreshCw size={14} className="animate-spin text-[var(--accent-secondary)]" />
                  <span>
                    {language === "sw"
                      ? "Inapakia machapisho 12 zaidi..."
                      : "Loading 12 more waves..."}
                  </span>
                </div>
              )}
              {!hasMorePosts && posts.length > 0 && (
                <div className="text-center py-2 text-xs text-[var(--text-secondary)] font-medium">
                  {language === "sw"
                    ? "Umeona machapisho yote ya hivi karibuni ✨"
                    : "You are all caught up ✨"}
                </div>
              )}
              {hasMorePosts && !isLoadingMore && (
                <button
                  type="button"
                  onClick={loadMorePosts}
                  className="min-h-[44px] px-5 py-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] text-xs font-extrabold shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  {language === "sw" ? "Pakia Zaidi (12 Zaidi)" : "Load More Waves"}
                </button>
              )}
            </div>
          </section>

          {/* Legal Footer for Privacy, Terms & Refund policies */}
          <LegalFooter className="mt-6" />
        </div>

        {/* Right Sidebar: 3rd Column on Desktop (Trending, Weekly Challenge, Suggested Creators) */}
        <RightSidebar
          onNavigateTab={(tab) => onNavigateTab && onNavigateTab(tab as any)}
          onSelectHashtag={(tag) => setInternalFilterTag(tag)}
          onJoinChallenge={(tag) => {
            setInlineContent((prev) =>
              prev.includes(tag) ? prev : `${prev.trim() ? `${prev.trim()} ` : ''}${tag} `
            );
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>

      {/* Mobile Money Payment Modal */}
      {isPaymentModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => setIsPaymentModalOpen(false)}
        />
      )}

      {/* Creator Tipping Modal */}
      {tippingPost && (
        <CreatorTipModal
          post={tippingPost}
          isOpen={true}
          onClose={() => setTippingPost(null)}
          onSuccess={() => {
            // refresh or keep
          }}
        />
      )}

      {/* Post Boost Modal */}
      {boostingPost && (
        <PostBoostModal
          post={boostingPost}
          isOpen={true}
          onClose={() => setBoostingPost(null)}
          onSuccess={() => {
            // refresh or keep
          }}
        />
      )}

      {/* Layer 4 Report, Mute & Block Modal */}
      <ReportContentModal
        isOpen={Boolean(reportingPost)}
        target={
          reportingPost
            ? {
                targetType: reportingPost.mediaType === 'video' ? 'reel' : 'post',
                targetId: reportingPost.id,
                targetAuthorId: reportingPost.authorId,
                targetAuthorName: reportingPost.authorName,
                postId: reportingPost.id,
                targetSummary: reportingPost.content || reportingPost.authorName
              }
            : null
        }
        currentUid={currentUser?.uid}
        isAuthorBlocked={Boolean(reportingPost && blockedIds.includes(reportingPost.authorId))}
        isAuthorMuted={Boolean(reportingPost && mutedIds.includes(reportingPost.authorId))}
        onClose={() => setReportingPost(null)}
        onReportSubmitted={(res) => {
          setPostNotice({ type: 'success', text: res.message });
          setTimeout(() => setPostNotice(null), 5000);
        }}
        onMuteChanged={(_, muted) => {
          setPostNotice({
            type: 'success',
            text: muted ? 'User muted. Their posts will no longer appear in your feed.' : 'User unmuted.'
          });
          setTimeout(() => setPostNotice(null), 4000);
        }}
        onBlockChanged={(_, blocked) => {
          setPostNotice({
            type: 'success',
            text: blocked ? 'User blocked.' : 'User unblocked.'
          });
          setTimeout(() => setPostNotice(null), 4000);
        }}
      />

      {/* Post Detail Reader Modal with Top Visual Reading Progress Bar */}
      {focusedPost && (
        <div
          className="fixed inset-0 z-[80] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setFocusedPost(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[88dvh] bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Visual Reading Progress Bar for Post Detail View */}
            <div className="w-full h-1.5 bg-stone-100 overflow-hidden shrink-0">
              <div
                className="h-full bg-gradient-to-r from-[#2563EB] via-[#0D9488] to-[#10B981] transition-all duration-150"
                style={{ width: `${detailReadProgress}%` }}
              />
            </div>

            {/* Reader Modal Header */}
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between gap-3 shrink-0 bg-stone-50/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <Eye size={16} className="text-[#2563EB] shrink-0" />
                <span className="text-xs font-extrabold text-[#1C1917] truncate">
                  Wave Reader • {focusedPost.authorName}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] font-mono font-bold text-[11px]">
                  {detailReadProgress}% read
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFocusedPost(null)}
                className="p-1.5 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition"
                title="Close Reader"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Post Detail & Thread Content */}
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                const maxScroll = el.scrollHeight - el.clientHeight;
                if (maxScroll <= 4) {
                  setDetailReadProgress(100);
                } else {
                  const pct = Math.min(100, Math.max(10, Math.round((el.scrollTop / maxScroll) * 100)));
                  setDetailReadProgress(pct);
                }
              }}
              className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  uid={focusedPost.authorId}
                  src={
                    focusedPost.authorPhotoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${focusedPost.authorId}`
                  }
                  alt={focusedPost.authorName}
                  fallbackName={focusedPost.authorName}
                  size={44}
                  showStatus={true}
                  onlyWhenVisible={false}
                  ringClassName="ring-2 ring-[#2563EB]/20"
                />
                <div>
                  <CrystalBadge
                    userId={focusedPost.authorId}
                    email={focusedPost.authorEmail}
                    name={focusedPost.authorName}
                    highlightedBadgeId={focusedPost.authorHighlightedBadgeId}
                    isBot={focusedPost.authorId === SUPPORT_BOT_ID}
                    size="md"
                  />
                  <div className="text-xs text-stone-400 font-mono mt-0.5">
                    {new Date(focusedPost.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {cleanCaption(focusedPost.content) && (
                <PostBody
                  postId={focusedPost.id}
                  authorId={focusedPost.authorId}
                  content={focusedPost.content}
                  authorName={focusedPost.authorName}
                  createdAt={focusedPost.createdAt}
                  isEdited={focusedPost.isEdited}
                  isSaved={(userProfile?.savedPostIds || []).includes(focusedPost.id)}
                  onToggleSave={handleToggleSave}
                  onSaveContent={(newContent) => {
                    setFocusedPost((prev) => (prev ? { ...prev, content: newContent, isEdited: true } : null));
                    setPosts((prev) =>
                      prev.map((p) => (p.id === focusedPost.id ? { ...p, content: newContent, isEdited: true } : p))
                    );
                  }}
                  className="mb-4"
                  textClassName="text-[#1C1917]"
                />
              )}

              {(focusedPost.videoUrl || focusedPost.hasVideoChunks || focusedPost.mediaType === 'video') && (
                <VideoPlayer
                  postId={focusedPost.id}
                  videoUrl={focusedPost.videoUrl}
                  hasVideoChunks={focusedPost.hasVideoChunks}
                  thumbnailUrl={focusedPost.thumbnailUrl || focusedPost.imageUrl}
                  duration={focusedPost.duration ?? focusedPost.videoDurationSeconds}
                  videoWidth={focusedPost.videoWidth}
                  videoHeight={focusedPost.videoHeight}
                  aspectRatio={focusedPost.aspectRatio}
                />
              )}

              {(focusedPost.imageUrl || (focusedPost.imageUrls && focusedPost.imageUrls.length > 0)) && !focusedPost.videoUrl && !focusedPost.hasVideoChunks && focusedPost.mediaType !== 'video' && (
                <div
                  onClick={() => {
                    const imgs =
                      focusedPost.imageUrls && focusedPost.imageUrls.length > 0
                        ? focusedPost.imageUrls
                        : focusedPost.imageUrl
                        ? [focusedPost.imageUrl]
                        : [];
                    if (imgs.length > 0) {
                      setLightboxState({
                        images: imgs,
                        initialIndex: 0,
                        caption: cleanCaption(focusedPost.content),
                        authorName: focusedPost.authorName,
                        authorUsername: focusedPost.authorUsername,
                        authorPhotoURL: focusedPost.authorPhotoURL
                      });
                    }
                  }}
                  className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 cursor-zoom-in group"
                >
                  <img
                    src={focusedPost.imageUrls?.[0] || focusedPost.imageUrl}
                    alt="Post media"
                    className="w-full h-auto max-h-[480px] object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                </div>
              )}

              {focusedPost.songPreviewUrl && focusedPost.songTitle && (
                <SongPlayerCard
                  title={focusedPost.songTitle}
                  artist={focusedPost.songArtist || ''}
                  albumArt={focusedPost.songAlbumArt}
                  previewUrl={focusedPost.songPreviewUrl}
                  albumName={focusedPost.songAlbumName}
                  defaultMuted={Boolean(
                    focusedPost.videoUrl ||
                      focusedPost.hasVideoChunks ||
                      focusedPost.mediaType === 'video'
                  )}
                  startTime={focusedPost.songStartTime}
                  volume={focusedPost.songVolume}
                />
              )}

              {/* Full Interactive Action Bar inside Detail Modal (Like, Comment, AI Info, Tip, Save, Share, Download) */}
              {(() => {
                const liveFocused = posts.find((p) => p.id === focusedPost.id) || focusedPost;
                const rData = getReactionData(liveFocused);
                const isLikedAny = rData.active.heart || rData.active.like || rData.active.fire;
                const totalLikes = rData.counts.heart + rData.counts.like + rData.counts.fire;
                const isSaved = (userProfile?.savedPostIds || []).includes(liveFocused.id);
                const isAuthor = liveFocused.authorId === currentUser?.uid;
                return (
                  <div className="flex items-center justify-between py-2.5 border-y border-stone-100 text-xs font-semibold text-slate-600 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void handleToggleReaction(liveFocused, 'heart')}
                        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl font-bold transition active:scale-95 cursor-pointer ${
                          isLikedAny
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Heart size={14} className={isLikedAny ? 'fill-current' : ''} />
                        <span className="font-mono">{totalLikes}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleSave(liveFocused.id)}
                        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl font-bold transition active:scale-95 cursor-pointer ${
                          isSaved
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Bookmark size={14} className={isSaved ? 'fill-current' : ''} />
                        <span>{isSaved ? 'Saved' : 'Save'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleOpenAiInfo(liveFocused)}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-bold transition active:scale-95 cursor-pointer"
                      >
                        <Sparkles size={14} className="text-[#0D9488]" />
                        <span>AI info</span>
                      </button>

                      {!isAuthor && (
                        <button
                          type="button"
                          onClick={() => setTippingPost(liveFocused)}
                          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold transition active:scale-95 cursor-pointer"
                        >
                          <HandCoins size={14} />
                          <span>Tip</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadPost(liveFocused)}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 text-slate-700 transition active:scale-95 cursor-pointer"
                        title="Download post image or text"
                      >
                        <Download size={14} />
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSharePost(liveFocused)}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 text-[#2563EB] font-bold transition active:scale-95 cursor-pointer"
                        title="Share wave"
                      >
                        <Share2 size={14} />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-4 border-t border-stone-100 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                  Replies ({(commentsMap[focusedPost.id] || []).length})
                </h4>
                {/* Reply input directly inside Post Detail Modal */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={commentInput[focusedPost.id] || ''}
                    onChange={(e) =>
                      setCommentInput((prev) => ({ ...prev, [focusedPost.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAddComment(focusedPost.id);
                    }}
                    placeholder={language === 'sw' ? 'Andika maoni mazuri...' : 'Write a warm comment...'}
                    className="flex-1 px-3.5 py-2 rounded-2xl bg-[#FAF7F2] border border-stone-200 text-xs text-[#1C1917] placeholder-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddComment(focusedPost.id)}
                    disabled={!commentInput[focusedPost.id]?.trim()}
                    className="p-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-40 text-white transition cursor-pointer"
                  >
                    <Send size={14} />
                  </button>
                </div>
                {(commentsMap[focusedPost.id] || []).length === 0 ? (
                  <p className="text-xs text-stone-400 italic">No replies yet on this wave.</p>
                ) : (
                  <div className="space-y-2.5">
                    {(commentsMap[focusedPost.id] || []).map((comment) => (
                      <div
                        key={comment.id}
                        className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FAF7F2] text-xs"
                      >
                        <Avatar
                          uid={comment.authorId}
                          src={
                            comment.authorPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${comment.authorId}`
                          }
                          alt={comment.authorName}
                          fallbackName={comment.authorName}
                          size={28}
                          showStatus={true}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <CrystalBadge
                              userId={comment.authorId}
                              email={comment.authorEmail}
                              name={comment.authorName}
                              highlightedBadgeId={comment.authorHighlightedBadgeId}
                              size="sm"
                            />
                            <span className="text-[10px] text-[#78716C] font-mono">
                              {new Date(comment.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="mt-1 text-[#1C1917] leading-relaxed">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notice for Download & Share actions */}
      {toastNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold transition-all transform animate-in fade-in slide-in-from-bottom-2 ${
            toastNotice.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-900/20'
              : 'bg-slate-900 text-white shadow-slate-900/30'
          }`}
        >
          {toastNotice.type === 'error' ? (
            <X size={15} className="shrink-0 text-rose-200" />
          ) : (
            <Check size={15} className="shrink-0 text-emerald-400" />
          )}
          <span>{toastNotice.message}</span>
        </div>
      )}
      {/* Frosted-Glass WELINK AI Info Sheet (Loaded ONLY on tap, zero Firestore reads) */}
      {activeAiInfoPost && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="WELINK AI Wave Summary"
          onClick={() => setActiveAiInfoPost(null)}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wavelink-share-sheet w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 space-y-4 border border-white/25 shadow-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="wavelink-sheet-drag-handle sm:hidden" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0D9488] block">
                    WELINK AI · Wave Insight
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                    {activeAiInfoPost.authorName}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveAiInfoPost(null)}
                aria-label="Close AI info"
                className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-slate-200/70 dark:bg-white/10 text-[var(--text-primary)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* AI Summary Card */}
            <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-white/10 border border-white/40 dark:border-white/15 space-y-2.5">
              {aiInfoSummaryMap[activeAiInfoPost.id]?.loading ? (
                <div className="flex items-center gap-2.5 py-3 text-xs font-bold text-[var(--text-secondary)]">
                  <RefreshCw size={15} className="animate-spin text-[#2563EB]" />
                  <span>
                    {language === 'sw'
                      ? 'WELINK AI inatayarisha muhtasari wa chapisho...'
                      : 'WELINK AI is summarizing this wave...'}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-primary)] leading-relaxed font-medium">
                  {aiInfoSummaryMap[activeAiInfoPost.id]?.text ||
                    activeAiInfoPost.content ||
                    (language === 'sw'
                      ? `Chapisho la ${activeAiInfoPost.authorName} kwenye WaveLink.`
                      : `Wave shared by ${activeAiInfoPost.authorName} on WaveLink.`)}
                </p>
              )}

              {/* Hashtag Glass Chips */}
              {(aiInfoSummaryMap[activeAiInfoPost.id]?.tags || []).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {(aiInfoSummaryMap[activeAiInfoPost.id]?.tags || []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveAiInfoPost(null);
                        setInternalFilterTag(tag);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="wavelink-glass-chip px-2.5 py-0.5 rounded-full text-xs font-bold text-[#2563EB] dark:text-sky-300 transition-transform active:scale-95 cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats Pill Row matching the reference right-hand card */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="wavelink-glass-action-pill px-3 py-1 rounded-full text-xs font-extrabold">
                  ❤️ {getReactionData(activeAiInfoPost).counts.total.toLocaleString()} Likes
                </span>
                <span className="wavelink-glass-action-pill px-3 py-1 rounded-full text-xs font-extrabold">
                  💬 {(activeAiInfoPost.commentsCount || 0).toLocaleString()} Comments
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const target = activeAiInfoPost;
                  setActiveAiInfoPost(null);
                  window.dispatchEvent(
                    new CustomEvent('wavelink:open-profile', {
                      detail: { userId: target.authorId, username: target.authorUsername },
                    })
                  );
                }}
                className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white text-xs font-extrabold shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                {language === 'sw' ? 'Tazama Wasifu' : 'View Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Frosted-Glass Comments Sheet (Mobile Bottom Sheet / Desktop Right-Side Panel) */}
      <CommentsSheet
        post={activeCommentsPost}
        isOpen={Boolean(activeCommentsPost)}
        onClose={() => setActiveCommentsPost(null)}
        onCommentCountChange={handleCommentCountChange}
      />

      {/* Frosted-Glass Share Sheet (Mobile Bottom Sheet / Desktop Centered Modal) */}
      <ShareSheet
        post={activeSharePost}
        isOpen={Boolean(activeSharePost)}
        onClose={() => setActiveSharePost(null)}
        onShareCountChange={handleShareCountChange}
      />

      {/* Full-Screen Pinch-to-Zoom Image Lightbox Viewer */}
      <ImageLightboxModal
        lightbox={lightboxState}
        onClose={() => setLightboxState(null)}
      />
    </div>
  );
};

