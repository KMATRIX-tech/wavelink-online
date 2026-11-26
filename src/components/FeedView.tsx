import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
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
  COMMUNITY_REPORT_CATEGORIES,
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
  { id: 'Sports', labelEn: 'Sports', labelSw: 'Michezo', keywords: ['sport', 'football', 'soccer', 'simba', 'yanga', 'run', 'fitness', 'gym', 'game', 'match', 'michezo'] },
  { id: 'Food', labelEn: 'Food', labelSw: 'Chakula', keywords: ['food', 'cook', 'pilau', 'nyama', 'cafe', 'coffee', 'chai', 'taste', 'recipe', 'chakula', 'dinner'] },
  { id: 'Comedy', labelEn: 'Comedy', labelSw: 'Vichekesho', keywords: ['comedy', 'funny', 'laugh', 'joke', 'meme', 'skit', 'vichekesho', 'lol', 'humor'] },
  { id: 'Tech', labelEn: 'Tech', labelSw: 'Teknolojia', keywords: ['tech', 'ai', 'code', 'app', 'startup', 'mobile', 'gadget', 'crypto', 'digital', 'web', 'teknolojia'] },
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
  unreadNotificationCount = 0
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
  const [gridPosts, setGridPosts] = useState<Post[]>([]);
  const [lastGridDoc, setLastGridDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreGridPosts, setHasMoreGridPosts] = useState(true);
  const [isLoadingGrid, setIsLoadingGrid] = useState(true);
  const [isLoadingMoreGrid, setIsLoadingMoreGrid] = useState(false);
  const [activeGridActionPostId, setActiveGridActionPostId] = useState<string | null>(null);
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
  const [selectedReportCategory, setSelectedReportCategory] = useState<string>('stolen_content');
  const [reportExtraNote, setReportExtraNote] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

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

    const extractedTags = Array.from(
      new Set((post.content || '').match(/#[a-zA-Z0-9_]+/g) || ['#WaveLink', '#EastAfrica'])
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
    const rawCaption = (post.content || '').trim();
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

  // Made For You Masonry Grid Loader: 12 cards at a time with pagination
  const loadInitialGridPosts = async () => {
    setIsLoadingGrid(true);
    try {
      const gridQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(12));
      const snapshot = await getDocs(gridQuery);
      const docs: Post[] = [];
      snapshot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Post);
      });
      setGridPosts(docs);
      setLastGridDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMoreGridPosts(snapshot.docs.length === 12);
    } catch (error) {
      if (isFirestoreQuotaError(error)) notifyQuotaExceeded(error);
    } finally {
      setIsLoadingGrid(false);
    }
  };

  const loadMoreGridPosts = async () => {
    if (isLoadingMoreGrid || !hasMoreGridPosts || !lastGridDoc) return;
    setIsLoadingMoreGrid(true);
    try {
      const nextGridQuery = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastGridDoc),
        limit(12)
      );
      const snapshot = await getDocs(nextGridQuery);
      if (!snapshot.empty) {
        const newDocs: Post[] = [];
        snapshot.forEach((docSnap) => {
          newDocs.push({ id: docSnap.id, ...docSnap.data() } as Post);
        });
        setGridPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          return [...prev, ...newDocs.filter((p) => !existingIds.has(p.id))];
        });
        setLastGridDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMoreGridPosts(snapshot.docs.length === 12);
      } else {
        setHasMoreGridPosts(false);
      }
    } catch (error) {
      if (isFirestoreQuotaError(error)) notifyQuotaExceeded(error);
    } finally {
      setIsLoadingMoreGrid(false);
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

  // Primary Feed Loader: 10 posts at a time using getDocs (loaded once on mount/refresh)
  const loadInitialPosts = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(10));
      const snapshot = await getDocs(postsQuery);
      const docs: Post[] = [];
      snapshot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Post);
      });
      setPosts(docs);
      setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMorePosts(snapshot.docs.length === 10);
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

  // Load more posts: fetches next 10 posts using startAfter(lastVisibleDoc)
  const loadMorePosts = async () => {
    if (isLoadingMore || !hasMorePosts || !lastVisibleDoc) return;
    setIsLoadingMore(true);
    try {
      const nextQuery = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        limit(10)
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
        setHasMorePosts(snapshot.docs.length === 10);
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
    loadInitialGridPosts();

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
        setGridPosts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
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

    if (inlineContent.trim()) {
      const spamRes = checkClientSpam('post', inlineContent.trim());
      if (spamRes.isSpam) {
        setPostNotice({ type: 'error', text: spamRes.reason || 'Please slow down before posting again.' });
        return;
      }
      const wordRes = checkWordFilter(inlineContent.trim());
      if (wordRes.flagged) {
        setPostNotice({
          type: 'error',
          text:
            language === 'sw'
              ? 'Ujumbe wako una maneno yasiyoruhusiwa na Mwongozo wa Usalama wa WaveLink.'
              : 'Your post contains words blocked by WaveLink Safety Filters. Please revise and try again.',
        });
        return;
      }
    }

    clearFailedVideoAndStudioDrafts();
    const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';
    const safeAuthorPhotoURL = sanitizeAvatarUrlForFirestore(
      getBestAuthUserPhotoUrl(currentUser, userProfile),
      currentUser.uid
    );

    // Video posts: upload directly from the browser to Cloudinary with live progress bar,
    // create the Firestore post only after the upload succeeds, then show it at the top of the feed.
    if (inlineMediaType === 'video' && inlineMediaFile) {
      const clipDuration = Math.max(1, inlineVideoTrimEnd - inlineVideoTrimStart);
      if (clipDuration > maxVideoSeconds + 0.5) {
        setPostNotice({
          type: 'error',
          text: isProTier
            ? 'Pro videos can be up to 90 seconds. Please trim your clip to 90s or less.'
            : 'Free users can upload videos up to 60 seconds (Pro up to 90 seconds). Please trim to 60s.',
        });
        setInlineVideoTrimEnd(Math.min(inlineVideoDuration, inlineVideoTrimStart + maxVideoSeconds));
        return;
      }

      enqueueVideoUploadJob({
        file: inlineMediaFile,
        isProUser: isProTier,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL: safeAuthorPhotoURL,
        audience: postAudience,
        content: sanitizeUserText(inlineContent, 2000),
        trimStart: inlineVideoTrimStart,
        trimEnd: inlineVideoTrimEnd,
      });

      setInlineContent('');
      setInlineMediaFile(null);
      setInlineMediaPreview(null);
      setInlineVideoNeedsTrim(false);
      setPostAudience('public');
      setPostNotice(null);
      return;
    }

    setIsSubmittingPost(true);
    setUploadProgress(5);
    setPostNotice(null);

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      let finalImageUrl: string | undefined = undefined;
      let finalWidth: number | undefined = undefined;
      let finalHeight: number | undefined = undefined;
      let finalMediaType: 'image' | 'video' | undefined = undefined;

      if (inlineMediaType === 'image' && (inlineMediaFile || inlineMediaPreview)) {
        if (inlineMediaFile) {
          const uploaded = await uploadImageToCloudinary(inlineMediaFile, (pct) => {
            setUploadProgress(Math.max(8, Math.min(92, pct)));
          });
          if (!uploaded.secureUrl || !uploaded.secureUrl.startsWith('http')) {
            throw new Error('Cloudinary photo upload did not return a valid secure_url.');
          }
          finalImageUrl = uploaded.secureUrl;
          finalWidth = uploaded.width;
          finalHeight = uploaded.height;
        } else if (
          inlineMediaPreview &&
          (inlineMediaPreview.startsWith('https://') || inlineMediaPreview.startsWith('http://'))
        ) {
          finalImageUrl = inlineMediaPreview;
        } else {
          throw new Error('Please select a valid photo file to upload to Cloudinary.');
        }
        finalMediaType = 'image';
        setUploadProgress(94);
      }

      const feelingTag = selectedFeeling
        ? ` — ${language === 'sw' ? 'anajihisi ' + selectedFeeling.labelSw : 'feeling ' + selectedFeeling.labelEn} ${selectedFeeling.emoji}`
        : '';

      const newPost: Post = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL: safeAuthorPhotoURL,
        content: sanitizeUserText(`${inlineContent.trim()}${feelingTag}`, 2000),
        imageUrl: finalImageUrl,
        mediaType: finalMediaType,
        videoWidth: finalWidth,
        videoHeight: finalHeight,
        countryCode: activeCountryCode,
        locationTag: `${activeCountryMeta.flag} ${activeCountryMeta.nameEn}`,
        audience: postAudience,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        createdAt: new Date().toISOString()
      };

      // Validate < 900 KB & zero base64/data URLs, and create the Firestore document with timeout and server fallback
      await savePostDocument(newPost);
      setUploadProgress(100);

      // Trigger first-time celebration animation for new post
      triggerCelebration('post');

      // Show the newly created post at the top of the feed after upload + Firestore creation succeed
      setPosts((prev) => [newPost, ...prev.filter((p) => p.id !== postId)]);

      // Reset form
      setInlineContent('');
      setInlineMediaFile(null);
      setInlineMediaPreview(null);
      setSelectedFeeling(null);
      setPostAudience('public');
      setPostNotice({
        type: 'success',
        text:
          finalMediaType === 'image'
            ? (language === 'sw' ? 'Picha yako imechapishwa kwenye ukurasa!' : 'Your photo wave is live on the feed!')
            : (language === 'sw' ? 'Ujumbe wako umechapishwa!' : 'Your wave is live on the community feed!')
      });
      setTimeout(() => setPostNotice(null), 4000);
    } catch (err) {
      console.error('Post creation error:', err);
      setPostNotice({
        type: 'error',
        text:
          language === 'sw'
            ? 'Kuna hitilafu imetokea, hebu jaribu tena.'
            : "Something went wrong, let's try again."
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
    const cat = FEED_CATEGORIES.find((c) => c.id === catId);
    if (!cat || cat.keywords.length === 0) return true;
    const text = `${p.content || ''} ${p.songTitle || ''} ${p.songArtist || ''} ${p.locationTag || ''}`.toLowerCase();
    if (catId === 'Music' && (p.songPreviewUrl || p.songTitle)) return true;
    return cat.keywords.some((kw) => text.includes(kw));
  };

  const isPostVisibleToViewer = (p: Post): boolean => {
    if (hiddenPostIds.includes(p.id)) return false;
    if (blockedIds.includes(p.authorId)) return false;
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

  // If hashtag, mention, or search filter is active
  const filteredSortedPosts = activeFilter
    ? sortedPosts.filter((p) => {
        const q = activeFilter.toLowerCase();
        return (
          p.content?.toLowerCase().includes(q) ||
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
      ...gridPosts,
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

  // Made For You masonry grid items (filtered by active category, switcher tab, and search query)
  const filteredGridPosts = (gridPosts.length > 0 ? gridPosts : posts)
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
    .filter((p) => {
      if (!activeFilter) return true;
      const q = activeFilter.toLowerCase();
      return (
        p.content?.toLowerCase().includes(q) ||
        p.authorUsername?.toLowerCase().includes(q) ||
        p.authorName?.toLowerCase().includes(q)
      );
    });

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
    [...posts, ...gridPosts].forEach((p) => {
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
                  void loadInitialGridPosts();
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

          {/* 5. TRENDING CREATOR & 6. MADE FOR YOU MASONRY GRID */}
          <section aria-label="Creator Spotlight and Made For You" className="space-y-4">
            {/* Section 5: TRENDING CREATOR Featured Card */}
            {isLoadingTrendingCreator && !bestTrendingCreatorPost ? (
              <div className="w-full h-60 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] animate-pulse p-5 flex flex-col justify-end">
                <div className="w-28 h-4 rounded-full bg-slate-300/60 dark:bg-slate-700 mb-2" />
                <div className="w-3/4 h-6 rounded-xl bg-slate-300/60 dark:bg-slate-700 mb-2" />
                <div className="w-40 h-4 rounded-full bg-slate-300/60 dark:bg-slate-700" />
              </div>
            ) : bestTrendingCreatorPost ? (
              (() => {
                const featuredThumb = getPostPrimaryThumbnail(bestTrendingCreatorPost);
                const featuredReactions = getReactionData(bestTrendingCreatorPost);
                const featuredLikes = Math.max(
                  featuredReactions.counts.heart,
                  featuredReactions.counts.total,
                  bestTrendingCreatorPost.likesCount || 0
                );
                const rawTitle = (bestTrendingCreatorPost.content || '').replace(/#[a-zA-Z0-9_]+/g, '').trim();
                const cleanTitle =
                  rawTitle.length > 0
                    ? rawTitle.slice(0, 88) + (rawTitle.length > 88 ? '…' : '')
                    : language === 'sw'
                    ? `Wimbi maarufu kutoka kwa ${bestTrendingCreatorPost.authorName}`
                    : `Featured wave by ${bestTrendingCreatorPost.authorName}`;
                const creatorHandle =
                  bestTrendingCreatorPost.authorUsername?.startsWith('@')
                    ? bestTrendingCreatorPost.authorUsername
                    : `@${bestTrendingCreatorPost.authorUsername || bestTrendingCreatorPost.authorName.toLowerCase().replace(/\s+/g, '')}`;

                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenPostDetail(bestTrendingCreatorPost)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenPostDetail(bestTrendingCreatorPost);
                      }
                    }}
                    className="wavelink-trending-creator-card group relative w-full rounded-[28px] overflow-hidden border border-[var(--border-hairline)] shadow-md cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  >
                    {/* Media Thumbnail or Vibrant Creator Gradient Fallback */}
                    <div className="relative w-full h-64 sm:h-72 bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#F97316] overflow-hidden">
                      {featuredThumb ? (
                        <img
                          src={featuredThumb}
                          alt={cleanTitle}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-6 text-white/25">
                          <Waves size={88} />
                        </div>
                      )}
                      {/* Soft dark gradient overlay for crisp text legibility */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

                      {/* Top row: TRENDING CREATOR pill + Media badge */}
                      <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-widest border border-white/30">
                          <Sparkles size={11} className="text-amber-300" />
                          <span>TRENDING CREATOR</span>
                        </span>
                        {(bestTrendingCreatorPost.videoUrl || bestTrendingCreatorPost.hasVideoChunks || bestTrendingCreatorPost.mediaType === 'video') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
                            <Play size={11} className="fill-white" />
                            <span>
                              {bestTrendingCreatorPost.videoDurationSeconds
                                ? `${Math.round(bestTrendingCreatorPost.videoDurationSeconds)}s`
                                : 'Video'}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Bottom content: Bold title from caption, creator @handle + like count, and round arrow button */}
                      <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <h2 className="text-lg sm:text-xl font-black text-white leading-snug line-clamp-2 drop-shadow-xs">
                            {cleanTitle}
                          </h2>
                          <div className="flex items-center gap-2.5 text-xs font-bold text-white/90 flex-wrap">
                            <div className="inline-flex items-center gap-1.5 min-w-0">
                              <Avatar
                                uid={bestTrendingCreatorPost.authorId}
                                src={resolveUserAvatarUrl(
                                  bestTrendingCreatorPost.authorId,
                                  bestTrendingCreatorPost.authorPhotoURL
                                )}
                                alt={bestTrendingCreatorPost.authorName}
                                fallbackName={bestTrendingCreatorPost.authorName}
                                size={22}
                                showStatus={false}
                              />
                              <span className="truncate font-mono">{creatorHandle}</span>
                            </div>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-rose-300 font-mono">
                              <Heart size={13} className="fill-rose-400 text-rose-400" />
                              <span>{formatCompactNumber(featuredLikes)}</span>
                            </span>
                          </div>
                        </div>

                        {/* Round Arrow Button that opens the post */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPostDetail(bestTrendingCreatorPost);
                          }}
                          aria-label="Open trending creator post"
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white text-[#0F172A] hover:bg-[var(--accent-primary)] hover:text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 shrink-0 cursor-pointer"
                        >
                          <ArrowUpRight size={20} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}

            {/* Section 6: MADE FOR YOU Masonry Grid (2-col on mobile <= 767px, 3-col on desktop >= 1024px) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                    {language === 'sw' ? 'Imeundwa Kwa Ajili Yako' : 'Made for you'}
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {language === 'sw'
                      ? 'Gusa mara mbili kupenda • Shikilia kwa chaguo za haraka'
                      : 'Double tap to like • Long press for quick actions'}
                  </p>
                </div>
                {selectedCategory !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('All')}
                    className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    {language === 'sw' ? 'Onyesha zote' : 'Reset filter'}
                  </button>
                )}
              </div>

              {isLoadingGrid && filteredGridPosts.length === 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className={`rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] animate-pulse ${
                        n % 2 === 0 ? 'h-56' : 'h-44'
                      }`}
                    />
                  ))}
                </div>
              ) : filteredGridPosts.length > 0 ? (
                <>
                  <div className="wavelink-masonry-grid">
                    {filteredGridPosts.map((gridPost, idx) => {
                      const thumbUrl = getPostPrimaryThumbnail(gridPost);
                      const isVideoPost = Boolean(
                        gridPost.videoUrl || gridPost.hasVideoChunks || gridPost.mediaType === 'video'
                      );
                      const multiPhotoCount = gridPost.imageUrls?.length || 0;
                      const reactionInfo = getReactionData(gridPost);
                      const isHearted = reactionInfo.active.heart || reactionInfo.active.like;
                      const heartCount = Math.max(
                        reactionInfo.counts.heart,
                        reactionInfo.counts.total,
                        gridPost.likesCount || 0
                      );
                      const handle =
                        gridPost.authorUsername?.startsWith('@')
                          ? gridPost.authorUsername
                          : `@${gridPost.authorUsername || gridPost.authorName.toLowerCase().replace(/\s+/g, '')}`;
                      const shortCaption =
                        (gridPost.content || '').trim() ||
                        (gridPost.songTitle ? `🎵 ${gridPost.songTitle}` : gridPost.authorName);
                      const isTallCard = idx % 3 === 0 || idx % 5 === 0;
                      const isSaved = (userProfile?.savedPostIds || []).includes(gridPost.id);
                      const isQuickMenuOpen = activeGridActionPostId === gridPost.id;

                      return (
                        <div
                          key={gridPost.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleGridCardClick(gridPost)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenPostDetail(gridPost);
                            }
                          }}
                          onTouchStart={() => handleGridCardTouchStart(gridPost.id)}
                          onTouchEnd={handleGridCardTouchEnd}
                          onTouchCancel={handleGridCardTouchEnd}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setActiveGridActionPostId(gridPost.id);
                          }}
                          className={`wavelink-masonry-card group relative rounded-[24px] overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xs cursor-pointer select-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                            isTallCard ? 'wavelink-masonry-card--tall' : 'wavelink-masonry-card--medium'
                          }`}
                        >
                          {/* Media or Rich Themed Gradient */}
                          <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#EC4899]">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={shortCaption.slice(0, 60)}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full p-4 flex flex-col justify-center items-center text-center text-white">
                                <p className="text-xs sm:text-sm font-extrabold line-clamp-4 leading-snug">
                                  {shortCaption}
                                </p>
                              </div>
                            )}

                            {/* Soft dark gradient at the bottom */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />

                            {/* Top-left badge: Small play icon + duration for videos, or stack icon for multi-photo posts */}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                              {isVideoPost ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">
                                  <Play size={10} className="fill-white" />
                                  <span>
                                    {gridPost.videoDurationSeconds
                                      ? `${Math.floor(gridPost.videoDurationSeconds / 60)}:${String(
                                          Math.round(gridPost.videoDurationSeconds % 60)
                                        ).padStart(2, '0')}`
                                      : '0:15'}
                                  </span>
                                </span>
                              ) : multiPhotoCount > 1 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">
                                  <Layers size={11} />
                                  <span>{multiPhotoCount}</span>
                                </span>
                              ) : null}
                            </div>

                            {/* Top-right Heart button in the corner (>= 44px touch target) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleToggleReaction(gridPost, 'heart');
                              }}
                              aria-label={`Like post by ${handle}`}
                              className="absolute top-1.5 right-1.5 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white transition active:scale-90 cursor-pointer"
                            >
                              <span className="w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center">
                                <Heart
                                  size={15}
                                  className={
                                    isHearted
                                      ? 'fill-[#F43F5E] text-[#F43F5E]'
                                      : 'text-white'
                                  }
                                />
                              </span>
                            </button>

                            {/* Bottom overlay: Short caption + @handle + like count + quick action trigger */}
                            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-extrabold text-white line-clamp-2 leading-tight drop-shadow-xs">
                                  {shortCaption}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold text-white/85">
                                  <span className="truncate font-mono">{handle}</span>
                                  {heartCount > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="font-mono">{formatCompactNumber(heartCount)}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveGridActionPostId(
                                    isQuickMenuOpen ? null : gridPost.id
                                  );
                                }}
                                aria-label="Quick actions"
                                className="w-7 h-7 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </div>

                            {/* Long-Press Quick Actions Overlay (Save, Share, Hide, Report) */}
                            {isQuickMenuOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute inset-0 bg-slate-950/85 p-3 flex flex-col justify-center gap-1.5 z-20 animate-in fade-in"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-white/70">
                                    {language === 'sw' ? 'Chaguo za Haraka' : 'Quick Actions'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveGridActionPostId(null)}
                                    aria-label="Close quick actions"
                                    className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleToggleSave(gridPost.id);
                                    setActiveGridActionPostId(null);
                                  }}
                                  className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                                >
                                  <Bookmark size={14} className={isSaved ? 'fill-amber-400 text-amber-400' : ''} />
                                  <span>{isSaved ? (language === 'sw' ? 'Imeondolewa' : 'Unsave') : (language === 'sw' ? 'Hifadhi' : 'Save')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveGridActionPostId(null);
                                    handleSharePost(gridPost);
                                  }}
                                  className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                                >
                                  <Share2 size={14} />
                                  <span>{language === 'sw' ? 'Shiriki' : 'Share'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleHidePost(gridPost.id)}
                                  className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                                >
                                  <EyeOff size={14} />
                                  <span>{language === 'sw' ? 'Ficha' : 'Hide'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveGridActionPostId(null);
                                    setReportingPost(gridPost);
                                  }}
                                  className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                                >
                                  <Flag size={14} />
                                  <span>{language === 'sw' ? 'Ripoti' : 'Report'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination button for Made for you grid (loads 12 cards at a time) */}
                  {hasMoreGridPosts && (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => void loadMoreGridPosts()}
                        disabled={isLoadingMoreGrid}
                        className="min-h-[44px] px-5 py-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-extrabold text-[var(--text-primary)] shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isLoadingMoreGrid
                          ? language === 'sw'
                            ? 'Inapakia...'
                            : 'Loading more...'
                          : language === 'sw'
                          ? 'Onyesha zaidi (12)'
                          : 'Explore more waves'}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </section>

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
                <textarea
                  value={inlineContent}
                  onChange={(e) => setInlineContent(e.target.value)}
                  placeholder={
                    language === 'sw'
                      ? 'Shiriki kitu na marafiki zako... unafikiria nini?'
                      : 'Share something with your friends... what is on your mind?'
                  }
                  rows={inlineContent || inlineMediaPreview ? 3 : 2}
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

          {/* Full Posts Feed Below the Masonry Grid (10 posts at a time with infinite scroll) */}
          <div className="space-y-5">
            {/* Friendly Quota Exceeded Notice */}
            <QuotaExceededBanner onRetry={() => loadInitialPosts(true)} />

            {/* Full Feed Section Header & Quick Refresh button */}
            <div className="flex items-center justify-between pb-1 px-1">
              <span className="text-sm font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Mlisho Kamili wa Machapisho' : 'Latest Full Posts'}
              </span>
              <button
                type="button"
                onClick={() => {
                  void loadInitialPosts(true);
                  void loadInitialGridPosts();
                  void loadTrendingCreatorPost();
                }}
                disabled={isRefreshing || isLoading}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50"
                title={language === 'sw' ? 'Onyesha upya mlisho' : 'Refresh feed'}
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-[var(--accent-secondary)]' : ''} />
                <span>
                  {isRefreshing
                    ? language === 'sw'
                      ? 'Inaonyesha...'
                      : 'Refreshing...'
                    : language === 'sw'
                    ? 'Onyesha Upya'
                    : 'Refresh'}
                </span>
              </button>
            </div>

            <VideoUploadingFeedPostList />
            {isLoading ? (
              <PostSkeleton count={4} />
            ) : combinedFeed.length === 0 && activeOrFailedVideoJobs.length === 0 ? (
              <div className="wavelink-glass-post-card text-center py-14 px-6 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-xs">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white mx-auto flex items-center justify-center mb-4 shadow-md">
                  <Waves size={32} />
                </div>
                <p className="text-base font-extrabold text-[var(--text-primary)] max-w-sm mx-auto mb-5 leading-snug">
                  {language === 'sw'
                    ? 'Hakuna kitu hapa bado, kuwa wa kwanza kuchapisha'
                    : 'Nothing here yet, be the first to post'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateTab) {
                      onNavigateTab('studio');
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className="min-h-[48px] px-7 py-3 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white font-extrabold text-base shadow-md active:scale-95 transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <Wand2 size={18} />
                  <span>{language === 'sw' ? '+ Chapisha Sasa' : '+ Create Post'}</span>
                </button>
              </div>
            ) : (
              combinedFeed.map((post) => {
                const isSaved = (userProfile?.savedPostIds || []).includes(post.id);
                const isAuthor = post.authorId === currentUser?.uid;
                const canDelete = isAuthor || isAdmin;
                const canEdit = isAuthor && isProEffective;
                const comments = commentsMap[post.id] || [];
                const isExpanded = !!expandedComments[post.id];

                // Case A: Designated Native In-Feed Sponsored Ad Unit with Smart Affiliate Tagging
                if (post.isSponsored) {
                  return (
                    <div
                      key={post.id}
                      data-wave-feed-item="true"
                      className="w-full my-4 rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 overflow-hidden text-[#0F172A] shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] transition hover:border-blue-300"
                    >
                      {/* Sponsored Header */}
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={post.authorPhotoURL}
                            alt={post.authorName}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-500/20 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-sm sm:text-base text-[#0F172A] truncate">
                                {post.authorName}
                              </span>
                              <span className="text-xs font-mono text-[#3B82F6] font-semibold truncate">
                                {post.authorUsername}
                              </span>
                              {/* Subtle tiny sponsored tag */}
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200/70">
                                <Tag size={10} className="text-amber-500" />
                                <span>Sponsored</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                              <span>Recommended Partner Wave</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <PostBody
                        postId={post.id}
                        authorId={post.authorId}
                        content={post.content}
                        authorName={post.authorName}
                        createdAt={post.createdAt}
                        isSaved={isSaved}
                        onToggleSave={handleToggleSave}
                        className="mb-3.5"
                        textClassName="text-slate-700"
                      />

                      {/* Image (with true aspect ratio, object-fit contain, and blurred darkened background copy) */}
                      {post.imageUrl && (() => {
                        const sponsoredDims =
                          preloadedDimensions[post.imageUrl] || getPreloadedMediaInfo(post.imageUrl);
                        return (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxState({
                                images: [post.imageUrl!],
                                initialIndex: 0,
                                caption: post.content,
                                authorName: post.authorName,
                                authorUsername: post.authorUsername,
                                authorPhotoURL: post.authorPhotoURL
                              });
                            }}
                            className="rounded-2xl overflow-hidden mb-3.5 border border-slate-200/80 max-h-96 min-h-[180px] bg-[#0C0A09] flex items-center justify-center cursor-zoom-in group relative"
                            style={
                              sponsoredDims
                                ? {
                                    aspectRatio: String(sponsoredDims.aspectRatio),
                                  }
                                : undefined
                            }
                          >
                            <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
                              <img
                                src={post.imageUrl}
                                alt=""
                                className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
                              />
                              <div className="absolute inset-0 bg-black/30" />
                            </div>
                            <img
                              src={post.imageUrl}
                              alt="Sponsored item"
                              decoding="async"
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth > 0 && img.naturalHeight > 0 && post.imageUrl) {
                                  handleMediaDimensionsReady(post.imageUrl, {
                                    width: img.naturalWidth,
                                    height: img.naturalHeight,
                                    aspectRatio: img.naturalWidth / img.naturalHeight,
                                    loadedAt: Date.now()
                                  });
                                }
                              }}
                              style={
                                sponsoredDims && sponsoredDims.width > 0 && sponsoredDims.height > 0
                                  ? {
                                      maxWidth: `min(100%, ${sponsoredDims.width}px)`,
                                      maxHeight: `min(24rem, ${sponsoredDims.height}px)`
                                    }
                                  : undefined
                              }
                              className="relative z-10 w-full h-full max-h-96 object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                            />
                          </div>
                        );
                      })()}

                      {/* Smart Contextual Affiliate Shop Box */}
                      {post.affiliateProductTitle && (
                        <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 mb-3.5 flex items-center justify-between flex-wrap gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase text-[#3B82F6] tracking-wider">
                                Featured Product
                              </span>
                              <span className="text-[10px] font-bold text-amber-500">
                                ★ {post.affiliateRating || 4.9}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-[#0F172A] truncate mt-0.5">
                              {post.affiliateProductTitle}
                            </h4>
                            <span className="text-xs font-black font-mono text-emerald-600">
                              {post.affiliateProductPrice}
                            </span>
                          </div>

                          <a
                            href={post.affiliateProductUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-600/20 active:scale-95 transition shrink-0"
                          >
                            <ShoppingBag size={14} />
                            <span>{post.affiliateButtonText || 'Shop Now'}</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-semibold text-slate-500 flex-wrap gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          {renderReactionBar(post)}
                          <button
                            onClick={() => toggleComments(post.id)}
                            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 transition"
                          >
                            <MessageCircle size={16} />
                            <span className="font-mono tabular-numbers">{post.commentsCount || 0}</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadPost(post)}
                            className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
                            title="Download post"
                          >
                            <Download size={14} />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSharePost(post)}
                            className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
                            title="Share on WhatsApp or via Web Share"
                          >
                            <Share2 size={14} />
                            <span>Share</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Case B: Standard Community Wave Post (Glassmorphism Video/Photo Post Card)
                const hasVideoMedia = Boolean(
                  post.videoUrl || post.hasVideoChunks || post.mediaType === 'video'
                );
                const hasImageMedia = Boolean(
                  (post.imageUrl || (post.imageUrls && post.imageUrls.length > 0)) && !hasVideoMedia
                );
                const hasAnyMedia = hasVideoMedia || hasImageMedia;
                const likedByInfo = getLikedByInfo(post);
                const isMenuOpen = openPostMenuId === post.id;
                const authorAvatarUrl = resolveUserAvatarUrl(
                  post.authorId,
                  post.authorPhotoURL
                );

                const handleSelectAuthorProfile = () => {
                  window.dispatchEvent(
                    new CustomEvent('wavelink:open-profile', {
                      detail: { userId: post.authorId, username: post.authorUsername },
                    })
                  );
                };

                const isAuthorInViewport = visibleFeedPostIds.includes(post.id);

                return (
                  <article
                    key={post.id}
                    data-wave-feed-item="true"
                    data-post-id={post.id}
                    className={`wavelink-glass-post-card wavelink-card-enter relative w-full max-w-full overflow-visible break-words rounded-[28px] sm:rounded-[32px] p-3.5 sm:p-5 transition ${
                      post.isBoosted ? 'ring-2 ring-amber-400/50' : ''
                    } ${highlightedPostId === post.id ? 'ring-2 ring-blue-500 shadow-lg' : ''}`}
                  >
                    {/* Compact Context Menu Dropdown triggered by the "..." round glass button */}
                    {isMenuOpen && (
                      <div
                        role="menu"
                        aria-label="Post options"
                        className="wavelink-glass-overlay-pill absolute top-14 right-5 z-40 w-56 rounded-3xl p-2 shadow-2xl border border-white/25 text-white space-y-1 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            handleOpenAiInfo(post);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <Sparkles size={14} className="text-teal-300 shrink-0" />
                          <span>{language === 'sw' ? 'Muhtasari wa WELINK AI' : 'AI Info & Summary'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            handleOpenPostDetail(post);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <Eye size={14} className="text-sky-300 shrink-0" />
                          <span>{language === 'sw' ? 'Soma kwa Ukubwa' : 'Read View'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            setPostsForSpark([post]);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <Flame size={14} className="text-amber-300 shrink-0" />
                          <span>{t('feed.addToSpark')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            setTippingPost(post);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <HandCoins size={14} className="text-emerald-300 shrink-0" />
                          <span>
                            {t('feed.tip')} {post.tipsCount ? `(${post.tipsCount})` : ''}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            handleDownloadPost(post);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <Download size={14} className="text-white/80 shrink-0" />
                          <span>{language === 'sw' ? 'Pakua' : 'Download Wave'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenPostMenuId(null);
                            copyPostLink(post.id);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                        >
                          <Share2 size={14} className="text-white/80 shrink-0" />
                          <span>{copiedId === post.id ? 'Copied Link!' : 'Copy Wave Link'}</span>
                        </button>

                        {isAuthor && !post.isBoosted && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenPostMenuId(null);
                              setBoostingPost(post);
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-amber-500/25 flex items-center gap-2.5 text-xs font-bold text-amber-300 text-left transition cursor-pointer"
                          >
                            <Rocket size={14} className="shrink-0" />
                            <span>Boost Wave (2k TZS)</span>
                          </button>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenPostMenuId(null);
                              handleStartEditPost(post);
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-white/15 flex items-center gap-2.5 text-xs font-bold text-left transition cursor-pointer"
                          >
                            <Edit2 size={14} className="text-sky-300 shrink-0" />
                            <span>Edit Wave</span>
                          </button>
                        )}

                        {!isAuthor && post.authorId !== SUPPORT_BOT_ID && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenPostMenuId(null);
                                setReportingPost(post);
                                setSelectedReportCategory('stolen_content');
                                setReportExtraNote('');
                              }}
                              className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-amber-500/20 flex items-center gap-2.5 text-xs font-bold text-amber-200 text-left transition cursor-pointer"
                            >
                              <Flag size={14} className="shrink-0" />
                              <span>{language === 'sw' ? 'Ripoti Chapisho' : 'Report Post'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenPostMenuId(null);
                                await toggleBlockUser(post.authorId);
                                setPostNotice({
                                  type: 'success',
                                  text:
                                    language === 'sw'
                                      ? `Umemzuia ${post.authorName}.`
                                      : `Blocked ${post.authorName}.`,
                                });
                                setTimeout(() => setPostNotice(null), 3500);
                              }}
                              className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-rose-500/25 flex items-center gap-2.5 text-xs font-bold text-rose-300 text-left transition cursor-pointer"
                            >
                              <Ban size={14} className="shrink-0" />
                              <span>Block {post.authorName}</span>
                            </button>
                          </>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenPostMenuId(null);
                              handleDeletePost(post.id);
                            }}
                            className="w-full min-h-[40px] px-3 py-2 rounded-2xl hover:bg-rose-500/25 flex items-center gap-2.5 text-xs font-bold text-rose-300 text-left transition cursor-pointer"
                          >
                            <Trash2 size={14} className="shrink-0" />
                            <span>Delete Wave</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* If the post has NO media (text-only wave), show the glass Author Pill + "..." + AI Info Pill at the top */}
                    {!hasAnyMedia && (
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <button
                            type="button"
                            onClick={handleSelectAuthorProfile}
                            className="wavelink-glass-action-pill inline-flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full max-w-[75%] transition-transform active:scale-95 cursor-pointer"
                          >
                            <Avatar
                              uid={post.authorId}
                              src={authorAvatarUrl}
                              alt={post.authorName}
                              fallbackName={post.authorName}
                              size={32}
                              showStatus={isAuthorInViewport}
                              onlyWhenVisible={false}
                              className="shrink-0"
                            />
                            <div className="min-w-0 text-left">
                              <CrystalBadge
                                userId={post.authorId}
                                email={post.authorEmail}
                                name={post.authorName}
                                isBot={post.authorId === SUPPORT_BOT_ID}
                                size="sm"
                              />
                            </div>
                          </button>

                          {post.isBoosted && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-xs">
                              <Rocket size={10} className="fill-white" />
                              <span>Boosted</span>
                            </span>
                          )}
                          {post.audience && post.audience !== 'public' && (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-900/10 dark:bg-white/10 text-[var(--text-secondary)]"
                              title={post.audience === 'close_friends' ? 'Visible to Close Friends' : 'Visible to Followers'}
                            >
                              {post.audience === 'close_friends' ? <Lock size={10} /> : <Users size={10} />}
                              <span>{post.audience === 'close_friends' ? 'Close Friends' : 'Followers'}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenAiInfo(post)}
                            className="wavelink-glass-action-pill wavelink-float-gentle inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer transition-transform active:scale-95"
                            title="Open WELINK AI caption & summary"
                          >
                            <Sparkles size={13} className="text-[#0D9488]" />
                            <span>AI info</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenPostMenuId((prev) => (prev === post.id ? null : post.id))
                            }
                            aria-label="More options"
                            className="wavelink-glass-action-pill w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 1. FLOATING ROUNDED MEDIA FRAME (28px+ radius) FOR VIDEO OR PHOTO */}
                    {hasVideoMedia && (
                      <div className="mb-3.5">
                        <VideoPlayer
                          postId={post.id}
                          videoUrl={post.videoUrl}
                          hasVideoChunks={post.hasVideoChunks}
                          thumbnailUrl={post.imageUrl || post.thumbnailUrl}
                          duration={post.duration ?? post.videoDurationSeconds}
                          videoWidth={post.videoWidth}
                          videoHeight={post.videoHeight}
                          aspectRatio={post.aspectRatio}
                          showGlassOverlays={true}
                          authorName={post.authorName}
                          authorPhotoURL={authorAvatarUrl}
                          authorId={post.authorId}
                          showStatus={isAuthorInViewport}
                          onAuthorClick={handleSelectAuthorProfile}
                          onOpenMoreMenu={() =>
                            setOpenPostMenuId((prev) => (prev === post.id ? null : post.id))
                          }
                          onOpenAiInfo={() => handleOpenAiInfo(post)}
                        />
                      </div>
                    )}

                    {hasImageMedia && (() => {
                      const slides =
                        post.imageUrls && post.imageUrls.length > 0
                          ? post.imageUrls
                          : post.imageUrl
                          ? [post.imageUrl]
                          : [];
                      const activeSlideIdx = Math.min(
                        slides.length - 1,
                        Math.max(0, carouselIndices[post.id] || 0)
                      );
                      const currentImgUrl = slides[activeSlideIdx] || post.imageUrl!;
                      const isFullImageUnlocked = Boolean(unlockedFullImages[post.id]);
                      const displayImgUrl = getOptimizedImagePreviewUrl(
                        currentImgUrl,
                        isDataSaverOn,
                        isFullImageUnlocked
                      );
                      const imgDims =
                        preloadedDimensions[currentImgUrl] || getPreloadedMediaInfo(currentImgUrl);

                      return (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isDataSaverOn && !isFullImageUnlocked) {
                              setUnlockedFullImages((prev) => ({ ...prev, [post.id]: true }));
                              return;
                            }
                            setLightboxState({
                              images: slides.length > 0 ? slides : [currentImgUrl],
                              initialIndex: activeSlideIdx,
                              caption: post.content,
                              authorName: post.authorName,
                              authorUsername: post.authorUsername,
                              authorPhotoURL: post.authorPhotoURL
                            });
                          }}
                          className="wavelink-glass-media-frame relative rounded-[28px] overflow-hidden mb-3.5 max-h-[540px] min-h-[240px] bg-[#0C0A09] flex items-center justify-center group cursor-zoom-in"
                          style={
                            post.aspectRatio === '1:1'
                              ? { aspectRatio: '1 / 1' }
                              : post.aspectRatio === '4:5'
                              ? { aspectRatio: '4 / 5' }
                              : post.aspectRatio === '9:16'
                              ? { aspectRatio: '9 / 16' }
                              : imgDims
                              ? {
                                  aspectRatio: String(imgDims.aspectRatio),
                                }
                              : undefined
                          }
                        >
                          {/* Soft blurred, darkened copy of the same photo filling empty side space */}
                          <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img
                              src={displayImgUrl}
                              alt=""
                              className="w-full h-full object-cover scale-110 blur-2xl opacity-65 brightness-50"
                            />
                            <div className="absolute inset-0 bg-black/25" />
                          </div>

                          <img
                            src={displayImgUrl}
                            alt="Wave attachment"
                            decoding="async"
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              if (isDataSaverOn && !isFullImageUnlocked) {
                                recordDataSavedBytes(320 * 1024);
                              }
                              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                                handleMediaDimensionsReady(currentImgUrl, {
                                  width: img.naturalWidth,
                                  height: img.naturalHeight,
                                  aspectRatio: img.naturalWidth / img.naturalHeight,
                                  loadedAt: Date.now()
                                });
                              }
                            }}
                            style={
                              imgDims && imgDims.width > 0 && imgDims.height > 0
                                ? {
                                    maxWidth: `min(100%, ${imgDims.width}px)`,
                                    maxHeight: `min(540px, ${imgDims.height}px)`
                                  }
                                : undefined
                            }
                            className="relative z-10 w-full h-full max-h-[540px] object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />

                          {/* Top-Left Author Glass Pill + Top-Right "..." Round Glass Button */}
                          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAuthorProfile();
                              }}
                              className="wavelink-glass-overlay-pill pointer-events-auto inline-flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full text-white text-xs sm:text-sm font-bold max-w-[74%] transition-transform active:scale-95 cursor-pointer"
                            >
                              <Avatar
                                uid={post.authorId}
                                src={authorAvatarUrl}
                                alt={post.authorName}
                                fallbackName={post.authorName}
                                size={28}
                                showStatus={isAuthorInViewport}
                                onlyWhenVisible={false}
                                className="shrink-0"
                              />
                              <span className="truncate drop-shadow-xs">{post.authorName}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenPostMenuId((prev) => (prev === post.id ? null : post.id));
                              }}
                              aria-label="Post options"
                              title="Post options"
                              className="wavelink-glass-overlay-pill pointer-events-auto w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          </div>

                          {/* Bottom-Left "AI info" Glass Pill with Sparkle Icon */}
                          <div className="absolute bottom-3.5 left-3.5 z-20 pointer-events-none">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAiInfo(post);
                              }}
                              aria-label="Open WELINK AI post summary"
                              title="AI info — WELINK AI summary"
                              className="wavelink-glass-overlay-pill wavelink-float-gentle pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white text-xs font-extrabold tracking-wide transition-transform active:scale-95 cursor-pointer"
                            >
                              <Sparkles size={13} className="text-teal-300 shrink-0" />
                              <span>AI info</span>
                            </button>
                          </div>

                          {/* Phase 1 Data Saver Small Preview Pill (Tap to load full image) */}
                          {isDataSaverOn && !isFullImageUnlocked && (
                            <div className="absolute bottom-3.5 right-3.5 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold border border-white/20 shadow-md pointer-events-none">
                              <Zap size={12} className="text-teal-300" />
                              <span>{t('datasaver.tapToLoadFullImage')}</span>
                            </div>
                          )}

                          {slides.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCarouselIndices((prev) => ({
                                    ...prev,
                                    [post.id]:
                                      activeSlideIdx > 0
                                        ? activeSlideIdx - 1
                                        : slides.length - 1,
                                  }));
                                }}
                                aria-label="Previous photo"
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center font-bold text-sm transition cursor-pointer"
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCarouselIndices((prev) => ({
                                    ...prev,
                                    [post.id]:
                                      activeSlideIdx < slides.length - 1
                                        ? activeSlideIdx + 1
                                        : 0,
                                  }));
                                }}
                                aria-label="Next photo"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center font-bold text-sm transition cursor-pointer"
                              >
                                ›
                              </button>

                              <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45">
                                {slides.map((_, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCarouselIndices((prev) => ({
                                        ...prev,
                                        [post.id]: idx,
                                      }));
                                    }}
                                    aria-label={`Slide ${idx + 1}`}
                                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                      idx === activeSlideIdx
                                        ? 'w-4 bg-white'
                                        : 'w-1.5 bg-white/50'
                                    }`}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Post Body with glass hashtag & mention chips */}
                    {post.content && (
                      <PostBody
                        postId={post.id}
                        authorId={post.authorId}
                        content={post.content}
                        authorName={post.authorName}
                        createdAt={post.createdAt}
                        isEdited={post.isEdited}
                        isSaved={isSaved}
                        onToggleSave={handleToggleSave}
                        isEditing={editingPostId === post.id}
                        onStartEdit={() => setEditingPostId(post.id)}
                        onCancelEdit={() => setEditingPostId(null)}
                        onSaveContent={() => setEditingPostId(null)}
                        className="mb-3 px-1"
                      />
                    )}

                    {/* In-Post Glass Music Pill INSIDE each post card (only one post plays audio at a time) */}
                    {post.songPreviewUrl && post.songTitle && (
                      <div className="mb-3.5">
                        <SongPlayerCard
                          title={post.songTitle}
                          artist={post.songArtist || ''}
                          albumArt={post.songAlbumArt}
                          previewUrl={post.songPreviewUrl}
                          albumName={post.songAlbumName}
                          defaultMuted={hasVideoMedia}
                          startTime={post.songStartTime}
                          volume={post.songVolume}
                        />
                      </div>
                    )}

                    {/* BELOW THE MEDIA: Overlapping small avatars with "Liked by Name & others" in short text */}
                    <div className="flex items-center justify-between gap-2 px-1 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {likedByInfo.avatars.length > 0 ? (
                          <div className="flex items-center -space-x-2 shrink-0">
                            {likedByInfo.avatars.map((avatarUrl, idx) => (
                              <img
                                key={idx}
                                src={avatarUrl}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover ring-2 ring-white/80 dark:ring-slate-900 shadow-2xs"
                              />
                            ))}
                          </div>
                        ) : (
                          <img
                            src={authorAvatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover ring-1 ring-white/60 shrink-0 opacity-85"
                          />
                        )}
                        <p className="text-xs italic font-medium text-[var(--text-secondary)] truncate">
                          {likedByInfo.totalReactions > 1 && likedByInfo.firstLikerName ? (
                            <>
                              {language === 'sw' ? 'Imependwa na ' : 'Liked by '}
                              <span className="font-bold not-italic text-[var(--text-primary)]">
                                {likedByInfo.firstLikerName}
                              </span>
                              {language === 'sw' ? ' na wengine' : ' & others'}
                            </>
                          ) : likedByInfo.totalReactions === 1 && likedByInfo.firstLikerName ? (
                            <>
                              {language === 'sw' ? 'Imependwa na ' : 'Liked by '}
                              <span className="font-bold not-italic text-[var(--text-primary)]">
                                {likedByInfo.firstLikerName}
                              </span>
                            </>
                          ) : (
                            <span>
                              {post.authorName}
                              {post.locationTag ? ` · ${post.locationTag}` : ''}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Subtle Boosted / Tips pill if present */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {post.isBoosted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-2xs">
                            <Rocket size={10} className="fill-white" />
                            <span>Boosted</span>
                          </span>
                        )}
                        {Boolean(post.tipsTotalTZS && post.tipsTotalTZS > 0) && (
                          <span className="wavelink-glass-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <HandCoins size={10} className="text-amber-500" />
                            <span>TZS {post.tipsTotalTZS?.toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ROW OF GLASS PILL BUTTONS: Heart + count, Comment + count, Share + count, and Bookmark on the right */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 1. Heart + Count Glass Pill (with spring animation & glow on press) */}
                        {renderReactionBar(post)}

                        {/* 2. Comment + Count Glass Pill (Opens Frosted Comments Sheet) */}
                        <button
                          type="button"
                          onClick={() => setActiveCommentsPost(post)}
                          className={`wavelink-glass-action-pill min-h-[40px] px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-extrabold transition-transform active:scale-95 cursor-pointer select-none ${
                            activeCommentsPost?.id === post.id || isExpanded
                              ? 'ring-1 ring-[#2563EB]/60 text-[#2563EB]'
                              : ''
                          }`}
                          aria-label={`Comments (${post.commentsCount || 0})`}
                        >
                          <MessageCircle size={15} className="shrink-0 opacity-85" />
                          <span className="font-mono tabular-nums">
                            {(post.commentsCount || 0).toLocaleString()}
                          </span>
                        </button>

                        {/* 3. Share + Count Glass Pill (Opens Frosted Share Sheet) */}
                        <button
                          type="button"
                          onClick={() => handleSharePost(post)}
                          className="wavelink-glass-action-pill min-h-[40px] px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-extrabold transition-transform active:scale-95 cursor-pointer select-none"
                          title="Share wave"
                          aria-label="Share post"
                        >
                          <Send size={14} className="shrink-0 opacity-85 -rotate-12" />
                          <span className="font-mono tabular-nums">
                            {(post.sharesCount || 0).toLocaleString()}
                          </span>
                        </button>

                        {/* Compact Tip Glass Pill */}
                        <button
                          type="button"
                          onClick={() => setTippingPost(post)}
                          className="wavelink-glass-action-pill min-h-[40px] px-3 py-1.5 rounded-full hidden sm:inline-flex items-center gap-1 text-xs font-bold transition-transform active:scale-95 cursor-pointer"
                          title="Tip creator directly via Mobile Money"
                        >
                          <HandCoins size={14} className="text-amber-500" />
                          <span>{t('feed.tip')}</span>
                        </button>
                      </div>

                      {/* Right: Bookmark Glass Button */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button
                          type="button"
                          onClick={() => handleToggleSave(post.id)}
                          className={`wavelink-glass-action-pill w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer ${
                            isSaved ? 'ring-1 ring-[#2563EB]/60 text-[#2563EB]' : ''
                          }`}
                          title={isSaved ? 'Saved to bookmarks' : 'Save post'}
                          aria-label="Bookmark post"
                        >
                          <Bookmark
                            size={15}
                            className={isSaved ? 'fill-current text-[#2563EB]' : ''}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Comments Section */}
                    {isExpanded && (
                      <div className="mt-4 pt-3.5 border-t border-[#EFECE6] space-y-3">
                        {post.allowComments === false ? (
                          <p className="text-xs text-[#78716C] italic py-1">
                            Comments are turned off for this post.
                          </p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={commentInput[post.id] || ''}
                              onChange={(e) =>
                                setCommentInput((prev) => ({ ...prev, [post.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddComment(post.id);
                              }}
                              placeholder="Write a reply..."
                              className="flex-1 min-h-[44px] py-2 px-3.5 rounded-xl bg-[#FAF7F2] border border-[#EFECE6] text-base sm:text-xs text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                            />
                            <button
                              onClick={() => handleAddComment(post.id)}
                              disabled={!commentInput[post.id]?.trim()}
                              className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-[#2563EB] text-white disabled:opacity-40 hover:bg-[#1D4ED8] flex items-center justify-center transition shadow-xs"
                            >
                              <Send size={15} />
                            </button>
                          </div>
                        )}

                        {loadingCommentsMap[post.id] || commentsMap[post.id] === undefined ? (
                          <CommentSkeleton count={2} />
                        ) : comments.length === 0 ? (
                          <p className="text-[11px] text-[#78716C] italic py-1">
                            No replies yet. Be the first to chime in!
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {comments.map((comment) => (
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
                                  ringClassName="ring-1 ring-blue-500/20"
                                  className="mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <CrystalBadge
                                      email={comment.authorEmail}
                                      name={comment.authorName}
                                      size="sm"
                                    />
                                    <span className="text-[10px] text-[#78716C] font-mono tabular-numbers">
                                      {new Date(comment.createdAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[#1C1917] leading-relaxed">
                                    {comment.content}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}

            {/* Pagination Load More trigger & status */}
            <div ref={loadMoreTriggerRef} className="py-6 flex flex-col items-center justify-center gap-2">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                  <RefreshCw size={14} className="animate-spin text-teal-600" />
                  <span>
                    {language === 'sw'
                      ? 'Inapakia machapisho 10 zaidi...'
                      : 'Loading 10 more waves...'}
                  </span>
                </div>
              )}
              {!hasMorePosts && posts.length > 0 && (
                <div className="text-center py-2 text-xs text-stone-400 font-medium">
                  {language === 'sw'
                    ? 'Umeona machapisho yote ya hivi karibuni ✨'
                    : 'You are all caught up ✨'}
                </div>
              )}
              {hasMorePosts && !isLoadingMore && (
                <button
                  type="button"
                  onClick={loadMorePosts}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  {language === 'sw' ? 'Pakia Zaidi (10 Zaidi)' : 'Load More (10 more)'}
                </button>
              )}
            </div>
          </div>

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

      {/* Community-Fitted Safety Report Modal (Stolen Content, Bullying, Scams, Adult Content, Spam) in Swahili & English */}
      {reportingPost && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setReportingPost(null)}
        >
          <div
            className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Flag size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">
                    {language === 'sw' ? 'Ripoti Maudhui kwa Usalama wa Jamii' : 'Report Content for Community Safety'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {language === 'sw'
                      ? `Chapisho la ${reportingPost.authorName} litakaguliwa kwa Kiswahili na Kiingereza.`
                      : `Post by ${reportingPost.authorName} will be reviewed by our moderation team.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReportingPost(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {COMMUNITY_REPORT_CATEGORIES.map((cat) => {
                const isSelected = selectedReportCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedReportCategory(cat.id)}
                    className={`w-full p-3 rounded-2xl border text-left transition flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-400 text-stone-900 shadow-2xs'
                        : 'bg-stone-50/70 border-stone-200 hover:border-stone-300 text-stone-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold">
                        {language === 'sw' ? cat.labelSw : cat.labelEn}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {language === 'sw' ? cat.descSw : cat.descEn}
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check size={12} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {language === 'sw' ? 'Maelezo ya ziada (Hiari)' : 'Additional details (Optional)'}
              </label>
              <textarea
                rows={2}
                value={reportExtraNote}
                onChange={(e) => setReportExtraNote(e.target.value)}
                placeholder={
                  language === 'sw'
                    ? 'Eleza kwa ufupi tatizo uliloliona...'
                    : 'Briefly describe the issue...'
                }
                className="w-full p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReportingPost(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
              >
                {language === 'sw' ? 'Ghairi' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isSubmittingReport}
                onClick={async () => {
                  const chosen =
                    COMMUNITY_REPORT_CATEGORIES.find((c) => c.id === selectedReportCategory) ||
                    COMMUNITY_REPORT_CATEGORIES[0];
                  setIsSubmittingReport(true);
                  try {
                    await reportContent({
                      targetType: 'post',
                      targetId: reportingPost.id,
                      targetAuthorId: reportingPost.authorId,
                      targetSummary: reportingPost.authorName,
                      reason: `${chosen.labelEn} / ${chosen.labelSw}${
                        reportExtraNote.trim() ? `: ${reportExtraNote.trim()}` : ''
                      }`
                    });
                    setPostNotice({
                      type: 'success',
                      text: language === 'sw' ? chosen.moderationNoticeSw : chosen.moderationNoticeEn
                    });
                    setTimeout(() => setPostNotice(null), 5000);
                    setReportingPost(null);
                  } finally {
                    setIsSubmittingReport(false);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold cursor-pointer"
              >
                {isSubmittingReport
                  ? language === 'sw'
                    ? 'Inatuma...'
                    : 'Submitting...'
                  : language === 'sw'
                  ? 'Tuma Ripoti'
                  : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    email={focusedPost.authorEmail}
                    name={focusedPost.authorName}
                    isBot={focusedPost.authorId === SUPPORT_BOT_ID}
                    size="md"
                  />
                  <div className="text-xs text-stone-400 font-mono mt-0.5">
                    {new Date(focusedPost.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {focusedPost.content && (
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
                        caption: focusedPost.content,
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

              {/* Action bar inside detail modal */}
              <div className="flex items-center justify-between py-2 border-y border-stone-100 text-xs font-semibold text-slate-500">
                <span className="text-xs text-stone-400 font-mono">
                  {focusedPost.createdAt ? new Date(focusedPost.createdAt).toLocaleDateString() : ''}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadPost(focusedPost)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 text-slate-700 transition active:scale-95"
                    title="Download post image or text"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSharePost(focusedPost)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 text-[#2563EB] font-bold transition active:scale-95"
                    title="Share on WhatsApp or via Web Share"
                  >
                    <Share2 size={14} />
                    <span>Share on WhatsApp</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                  Replies ({(commentsMap[focusedPost.id] || []).length})
                </h4>
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
                              email={comment.authorEmail}
                              name={comment.authorName}
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

