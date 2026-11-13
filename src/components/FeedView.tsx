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
  isFirestoreQuotaError
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
import { SparkTray } from './SparkTray';
import { AdsterraAdBanner } from './AdsterraAdBanner';
import { shouldShowAds } from './AdsterraManager';
import { RichEventCard } from './RichEventCard';
import { ImageLightboxModal, LightboxState } from './ImageLightboxModal';
import { AddToHomeScreenHintCard } from './PWAInstallButton';
import { CommentsSheet } from './CommentsSheet';
import { ShareSheet } from './ShareSheet';
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
  RefreshCw,
  Smile,
  MoreHorizontal
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

interface FeedViewProps {
  onNavigateTab?: (tab: string) => void;
  initialFilterTag?: string | null;
  onClearFilterTag?: () => void;
  initialFocusPostId?: string | null;
  onClearFocusPostId?: () => void;
  onOpenWelink?: (mode?: 'chat' | 'image' | 'voice') => void;
  onStartChat?: (userId: string) => void;
}

export const FeedView: React.FC<FeedViewProps> = ({
  onNavigateTab,
  initialFilterTag,
  onClearFilterTag,
  initialFocusPostId,
  onClearFocusPostId,
  onOpenWelink,
  onStartChat
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

  // Ads Rule: HIDE if user.isPro === true, user has Blue Star, or user is admin. SHOW only to regular free users.
  const showAds = shouldShowAds(userProfile, isAdmin, isProEffective);
  const isProUser = !showAds;
  const isProTier = Boolean(isProEffective || isAdmin);
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

  const [feedMode, setFeedMode] = useState<'all' | 'local' | 'following' | 'saved'>('all');
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
          actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined
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

    clearFailedVideoAndStudioDrafts();
    const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';
    const safeAuthorPhotoURL = sanitizeAvatarUrlForFirestore(
      userProfile?.photoURL || currentUser.photoURL,
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
        content: sanitizeUserText(inlineContent, 2000),
        trimStart: inlineVideoTrimStart,
        trimEnd: inlineVideoTrimEnd,
      });

      setInlineContent('');
      setInlineMediaFile(null);
      setInlineMediaPreview(null);
      setInlineVideoNeedsTrim(false);
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
        avatar:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      });
    }
    posts.forEach((p) => {
      if (p.authorId && p.authorName && !knownProfiles.has(p.authorId)) {
        knownProfiles.set(p.authorId, {
          name: p.authorName.split(' ')[0] || p.authorName,
          avatar:
            p.authorPhotoURL ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${p.authorId}`,
        });
      }
    });
    suggestedMembers.forEach((m) => {
      if (m.id && m.displayName && !knownProfiles.has(m.id)) {
        knownProfiles.set(m.id, {
          name: m.displayName.split(' ')[0] || m.displayName,
          avatar:
            m.photoURL ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${m.id}`,
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
            {primaryHeartCount.toLocaleString()}
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
            <span className="font-mono tabular-nums">{counts.fire}</span>
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
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
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
          actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined
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

  // Priority sorting:
  // - If feedMode === 'local', show posts from the user's selected country first!
  // - Boosted posts first, then Phase 3 interest-matched posts for recent waves, with plain chronological fallback
  const sortedPosts = [...posts]
    .filter((p) => !blockedIds.includes(p.authorId))
    .filter((p) => {
      if (feedMode === 'following') {
        return followedIds.includes(p.authorId) || p.authorId === currentUser?.uid;
      }
      if (feedMode === 'saved') {
        return (userProfile?.savedPostIds || []).includes(p.id);
      }
      return true;
    })
    .sort((a, b) => {
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
        // Prioritize interest-matching posts published within the last 72 hours; plain chronological fallback otherwise
        if (ageHoursA <= 72 && ageHoursB <= 72) {
          const scoreA = scorePostByInterests(a, userInterests);
          const scoreB = scorePostByInterests(b, userInterests);
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const activeFilter = internalFilterTag || initialFilterTag || null;

  // If hashtag or mention filter active (from search or tapped in post body)
  const filteredSortedPosts = activeFilter
    ? sortedPosts.filter((p) => {
        const query = activeFilter.toLowerCase();
        return (
          p.content?.toLowerCase().includes(query) ||
          p.authorUsername?.toLowerCase().includes(query) ||
          p.authorName?.toLowerCase().includes(query)
        );
      })
    : sortedPosts;

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

  // Track window scroll progress, how many feed posts have been viewed, and preload the next 3 upcoming items
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateReadingProgress = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
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

  return (
    <div className="wavelink-feed-container relative">
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
          className="h-full bg-gradient-to-r from-[#2563EB] via-[#0D9488] to-[#10B981] transition-all duration-150 ease-out"
          style={{ width: `${feedReadProgress}%` }}
        />
      </div>

      <div className="wavelink-feed-row">
        {/* Center Main Feed (Mobile < 768px: Full Width Single Column; Desktop >= 1024px: Centered max 660px) */}
        <div className="wavelink-feed-column overflow-hidden">
          {/* Background Video Upload Progress Chip at the Top of the Feed */}
          <VideoUploadProgressChip variant="feed-inline" />

          {/* Friendly Add to Home Screen Hint (Especially for iPhone Users) */}
          <AddToHomeScreenHintCard compact />

          {/* Active Hashtag or Mention Filter Banner */}
          {activeFilter && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white flex items-center justify-between gap-3 shadow-md animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-2xl bg-white/20 text-white shrink-0">
                  {activeFilter.startsWith('@') ? <AtSign size={18} /> : <Hash size={18} />}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-blue-100 font-bold uppercase tracking-wider block">
                    {activeFilter.startsWith('@') ? 'Mention Discovery' : 'Hashtag Discovery'}
                  </span>
                  <h4 className="text-sm font-extrabold truncate">
                    Filtered by <span className="text-emerald-200">{activeFilter}</span> ({filteredSortedPosts.length} waves)
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInternalFilterTag(null);
                  if (onClearFilterTag) onClearFilterTag();
                }}
                className="min-h-[44px] px-3.5 py-1.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer"
              >
                <span>Clear</span>
                <X size={13} />
              </button>
            </div>
          )}

          {/* Clean Segmented Control for All, Local, Following, and Trending */}
          <div className="w-full bg-stone-100 dark:bg-stone-800/80 p-1 rounded-2xl flex items-center justify-between gap-1 shadow-2xs">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setFeedMode('all')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate ${
                  feedMode === 'all'
                    ? 'bg-white dark:bg-stone-700 text-[#1C1917] dark:text-stone-100 shadow-2xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                {t('feed.tabAll')}
              </button>

              <button
                type="button"
                onClick={() => setFeedMode('local')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate flex items-center justify-center gap-1.5 ${
                  feedMode === 'local'
                    ? 'bg-white dark:bg-stone-700 text-[#0D9488] shadow-2xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                }`}
                title={t('feed.localBannerDesc')}
              >
                <span>{activeCountryMeta.flag}</span>
                <span>{t('feed.tabLocal')}</span>
              </button>

              <button
                type="button"
                onClick={() => setFeedMode('following')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-xl font-extrabold text-xs transition cursor-pointer text-center truncate ${
                  feedMode === 'following'
                    ? 'bg-white dark:bg-stone-700 text-[#1C1917] dark:text-stone-100 shadow-2xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                {t('feed.tabFollowing')}
              </button>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('trending')}
                  className="flex-1 py-1.5 px-2.5 sm:px-3 rounded-xl font-extrabold text-xs text-stone-600 dark:text-stone-300 hover:text-[#2563EB] transition cursor-pointer text-center truncate"
                >
                  {t('nav.trending_short')}
                </button>
              )}
            </div>
          </div>

          {/* Slim Greeting Row with Daily Check-In Button inside */}
          <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl px-3.5 py-2 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-[#D97706] border border-amber-200/70 dark:border-amber-800/60 flex items-center justify-center shrink-0">
                <Flame size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs sm:text-sm font-extrabold text-[#1C1917] dark:text-stone-100 truncate">
                    {(() => {
                      const hour = new Date().getHours();
                      const name = userProfile?.displayName?.split(' ')[0] || currentUser?.displayName?.split(' ')[0] || 'Rafiki';
                      const timeGreeting =
                        hour < 12
                          ? t('feed.greetingMorning')
                          : hour < 18
                          ? t('feed.greetingAfternoon')
                          : t('feed.greetingEvening');
                      return `${timeGreeting}, ${name} 👋`;
                    })()}
                  </h2>
                  <span className="text-[10px] font-bold text-[#D97706] bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded-md shrink-0">
                    {Math.max(1, userProfile?.loginStreak ?? 1)}d
                  </span>
                </div>
                <p className="text-[11px] text-[#78716C] dark:text-stone-400 truncate hidden xs:block">
                  {checkInDoneToday
                    ? `${t('feed.checkedInToday')} · ${(userProfile?.wavePoints ?? 15).toLocaleString()} pts`
                    : `${t('feed.tapToCheckIn')} · +15 WavePoints`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDailyCheckIn}
              disabled={checkInDoneToday}
              className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                checkInDoneToday
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0D9488] border border-teal-200/80 dark:border-teal-800'
                  : 'bg-[#0D9488] hover:bg-teal-700 text-white active:scale-95 shadow-2xs'
              }`}
            >
              {checkInDoneToday ? t('feed.checkedInBtn') : t('feed.checkInBtn')}
            </button>
          </div>

          {/* Compact First-Time Welcome Strip if active */}
          {showWelcomeFlow && (
            <div className="bg-gradient-to-r from-teal-50/70 via-blue-50/60 to-amber-50/50 dark:from-stone-900 dark:to-stone-900 border border-teal-200/80 dark:border-stone-800 rounded-2xl p-3 shadow-2xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="min-w-0">
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block truncate">
                  Karibu WaveLink • Welcome! 🌿
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                  Personalize your feed with East African creators and culture.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleDismissWelcome();
                    window.dispatchEvent(new CustomEvent('wavelink:open-interest-picker'));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#2563EB] text-white text-xs font-bold hover:bg-blue-700 transition cursor-pointer"
                >
                  Pick Topics
                </button>
                <button
                  type="button"
                  onClick={handleDismissWelcome}
                  className="p-1 text-stone-400 hover:text-stone-600 transition cursor-pointer"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Slim Sparks Row */}
          <div className="w-full max-w-full overflow-hidden">
            <SparkTray
              externalPostsToShare={postsForSpark}
              onClearExternalPosts={() => setPostsForSpark(null)}
              onStartChat={onStartChat}
            />
          </div>

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

          {/* Large Friendly Composer Box for First-Time & Non-Technical Users */}
          <div className="w-full max-w-full overflow-hidden bg-[#FFFFFF] border-2 border-stone-200/90 rounded-3xl p-4 sm:p-5 shadow-sm transition">
            {/* Friendly Greeting Header */}
            <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-stone-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌿</span>
                <h3 className="text-sm sm:text-base font-black text-stone-900 tracking-tight">
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
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="User"
                fallbackName={userProfile?.displayName || currentUser?.displayName || 'Waver'}
                size={44}
                showStatus={true}
                onlyWhenVisible={false}
                targetProfile={userProfile}
                ringClassName="ring-2 ring-[#2563EB]/20"
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
                  className="w-full max-w-full bg-[#FAF7F2] rounded-2xl p-4 border border-[#EFECE6] resize-none text-base text-[#1C1917] placeholder-stone-500 focus:outline-none focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 break-words leading-relaxed transition font-medium"
                />

                {/* Phase 3: Suggested Hashtags based on picked interests */}
                {suggestedHashtags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider">
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
                        className="px-2 py-0.5 rounded-lg bg-[#FAF7F2] hover:bg-blue-50 text-[#2563EB] border border-[#EFECE6] text-[11px] font-bold transition cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {inlineMediaPreview && (
                  <div className="relative rounded-2xl overflow-hidden my-3 border border-[#EFECE6] bg-[#0C0A09] flex items-center justify-center">
                    {inlineMediaType === 'video' ? (
                      <video src={inlineMediaPreview} controls className="relative z-10 w-full h-auto max-h-72 object-contain" />
                    ) : (
                      <>
                        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
                          <img
                            src={inlineMediaPreview}
                            alt=""
                            className="w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50"
                          />
                          <div className="absolute inset-0 bg-black/30" />
                        </div>
                        <img
                          src={inlineMediaPreview}
                          alt="Preview"
                          className="relative z-10 w-full h-auto max-h-72 object-contain"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInlineMediaFile(null);
                        setInlineMediaPreview(null);
                        setInlineVideoNeedsTrim(false);
                      }}
                      className="absolute top-2.5 right-2.5 min-w-[36px] min-h-[36px] p-2 rounded-full bg-stone-900/80 text-white hover:bg-stone-900 flex items-center justify-center transition"
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
                              className="px-3 py-1 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white font-bold text-xs transition"
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
                      <span>Uploading to Cloudinary & publishing...</span>
                      <span className="font-mono text-[#2563EB]">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] transition-all duration-300"
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

                <div className="flex items-center justify-between pt-3.5 mt-2.5 border-t border-[#EFECE6] flex-wrap gap-2.5">
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

                    {/* Big Photo Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-blue-50/90 hover:bg-blue-100 text-[#2563EB] border border-blue-200/90 text-xs sm:text-sm font-extrabold flex items-center gap-2 transition active:scale-95 cursor-pointer shadow-2xs"
                    >
                      <ImageIcon size={18} className="text-[#2563EB]" />
                      <span>{language === 'sw' ? 'Picha' : 'Photo'}</span>
                    </button>

                    {/* Big Video Button */}
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      title={`Upload video up to ${maxVideoSeconds}s (${MAX_VIDEO_RAW_MB} MB max)`}
                      className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-teal-50/90 hover:bg-teal-100 text-[#0D9488] border border-teal-200/90 text-xs sm:text-sm font-extrabold flex items-center gap-2 transition active:scale-95 cursor-pointer shadow-2xs"
                    >
                      <VideoIcon size={18} className="text-[#0D9488]" />
                      <span>{language === 'sw' ? 'Video' : 'Video'}</span>
                    </button>

                    {/* Big Feeling Button */}
                    <button
                      type="button"
                      onClick={() => setIsFeelingPickerOpen(true)}
                      className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-amber-50/90 hover:bg-amber-100 text-[#D97706] border border-amber-200/90 text-xs sm:text-sm font-extrabold flex items-center gap-2 transition active:scale-95 cursor-pointer shadow-2xs"
                    >
                      <Smile size={18} className="text-[#D97706]" />
                      <span>{language === 'sw' ? 'Hisia' : 'Feeling'}</span>
                    </button>
                  </div>

                  {/* ONE MAIN BUTTON ON SCREEN */}
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={isSubmittingPost || (!inlineContent.trim() && !inlineMediaPreview && !inlineMediaFile)}
                    className="min-h-[48px] px-6 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:pointer-events-none text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition cursor-pointer"
                  >
                    {isSubmittingPost ? (
                      <span>{t('feed.sharing')}</span>
                    ) : (
                      <>
                        <Send size={16} />
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs animate-in fade-in"
            >
              <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-2xl relative space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                  <div className="flex items-center gap-2">
                    <Smile size={20} className="text-[#D97706]" />
                    <h3 className="font-extrabold text-base text-stone-900 dark:text-stone-100">
                      {language === 'sw' ? 'Unajisikiaje sasa hivi?' : 'How are you feeling?'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFeelingPickerOpen(false)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
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
                      className="min-h-[48px] p-3 rounded-2xl bg-stone-50 hover:bg-amber-50 dark:bg-stone-800 dark:hover:bg-amber-950/40 border border-stone-200/80 dark:border-stone-700 text-left flex items-center gap-2.5 transition active:scale-95 cursor-pointer"
                    >
                      <span className="text-2xl">{f.emoji}</span>
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                        {language === 'sw' ? f.labelSw : f.labelEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Feed Reading Progress Strip above Posts Stream */}
          {!isLoading && combinedFeed.length > 0 && (
            <div className="sticky top-2 md:top-18 z-10 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-hairline)] rounded-2xl px-4 py-2.5 shadow-2xs transition-all">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye size={14} className="text-[#0D9488] shrink-0" />
                  <span className="font-bold text-[#1C1917] truncate">
                    {feedReadProgress >= 95
                      ? 'All caught up on this feed!'
                      : `Reading progress • ${Math.max(1, consumedPostsCount)} of ${combinedFeed.length} waves`}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-mono font-bold text-[11px] text-[#2563EB] tabular-nums">
                    {feedReadProgress}%
                  </span>
                  {feedReadProgress > 20 && (
                    <button
                      type="button"
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-[11px] font-semibold text-[#78716C] hover:text-[#1C1917] underline cursor-pointer"
                    >
                      Top ↑
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full h-1.5 bg-[#FAF7F2] rounded-full overflow-hidden mt-1.5 border border-[#EFECE6]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#0D9488] transition-all duration-200 ease-out"
                  style={{
                    width: `${Math.max(
                      feedReadProgress,
                      combinedFeed.length > 0
                        ? Math.round((Math.max(1, consumedPostsCount) / combinedFeed.length) * 100)
                        : 0
                    )}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Posts Stream: Show active/failed uploading video post cards at the top of the feed */}
          <div className="space-y-5">
            {/* Friendly Quota Exceeded Notice (Graceful cached offline mode) */}
            <QuotaExceededBanner onRetry={() => loadInitialPosts(true)} />

            {/* Quick Refresh bar */}
            <div className="flex items-center justify-between pb-1 px-1">
              <span className="text-xs font-bold text-stone-600">
                {language === 'sw' ? 'Machapisho ya Hivi Karibuni' : 'Recent Waves'}
              </span>
              <button
                type="button"
                onClick={() => loadInitialPosts(true)}
                disabled={isRefreshing || isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
                title={language === 'sw' ? 'Onyesha upya mlisho' : 'Refresh feed'}
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-teal-600' : ''} />
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
              <div className="text-center py-16 px-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white mx-auto flex items-center justify-center mb-4 shadow-md shadow-blue-500/20">
                  <Waves size={32} />
                </div>
                <h3 className="text-xl font-extrabold text-[#0F172A] mb-1">
                  Feed Is Clear & Ready!
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
                  WaveLink operates with strict zero mock data. Share a photo or video above or open the Media Studio to post the first wave!
                </p>
                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('studio')}
                    className="px-6 py-3 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs sm:text-sm shadow-sm shadow-blue-500/20 active:scale-95 transition inline-flex items-center gap-2"
                  >
                    <Wand2 size={16} />
                    <span>Open Media Studio</span>
                  </button>
                )}
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
                const authorAvatarUrl =
                  post.authorPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`;

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
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wavelink-share-sheet w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 space-y-4 border border-white/25 shadow-2xl"
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

