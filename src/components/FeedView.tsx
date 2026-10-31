import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  limit,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { Post, PostComment, Announcement, ReactionType } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { VideoPlayer } from './VideoPlayer';
import { SongPlayerCard } from './SongPlayerCard';
import { SparkTray } from './SparkTray';
import { AdsterraAdBanner } from './AdsterraAdBanner';
import { shouldShowAds } from './AdsterraManager';
import { RichEventCard } from './RichEventCard';
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
  CalendarDays,
  CheckCircle2
} from 'lucide-react';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { CreatorTipModal } from './CreatorTipModal';
import { PostBoostModal } from './PostBoostModal';
import { RightSidebar } from './RightSidebar';
import { PostSkeleton } from './PostSkeleton';
import { LegalFooter } from './LegalModals';
import { sendNotification } from '../services/notificationService';
import { compressImage, generateVideoThumbnail, saveVideoPost } from '../utils/mediaStorage';

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
}

export const FeedView: React.FC<FeedViewProps> = ({
  onNavigateTab,
  initialFilterTag,
  onClearFilterTag
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective, toggleSavePost } = useAuth();

  // Ads Rule: HIDE if user.isPro === true, user has Blue Star, or user is admin. SHOW only to regular free users.
  const showAds = shouldShowAds(userProfile, isAdmin, isProEffective);
  const isProUser = !showAds;

  const [posts, setPosts] = useState<Post[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [postNotice, setPostNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monetization modals
  const [tippingPost, setTippingPost] = useState<Post | null>(null);
  const [boostingPost, setBoostingPost] = useState<Post | null>(null);

  // Comments state: map of postId -> PostComment[]
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, PostComment[]>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Reaction animation & optimistic state
  const [animatingReactions, setAnimatingReactions] = useState<Record<string, boolean>>({});
  const [floatingBursts, setFloatingBursts] = useState<Record<string, number>>({});
  const [sponsoredReactions, setSponsoredReactions] = useState<Record<string, Post>>({});

  // Real-time listener for posts
  useEffect(() => {
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      postsQuery,
      (snapshot) => {
        const docs: Post[] = [];
        snapshot.forEach((docSnap) => {
          docs.push({ id: docSnap.id, ...docSnap.data() } as Post);
        });
        setPosts(docs);
        setIsLoading(false);
      },
      (error) => {
        console.warn('Feed posts listener notice:', error);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Fetch announcements for pinned banner and right sidebar
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        let latest: Announcement | null = null;
        let pinned: Announcement | null = null;
        snap.forEach((d) => {
          const item = { id: d.id, ...d.data() } as Announcement;
          if (!latest) latest = item;
          if (!pinned && item.isPinned) pinned = item;
        });
        setLatestAnnouncement(latest);
        setPinnedAnnouncement(pinned);
      },
      (err) => {
        console.warn('Announcements listener notice:', err);
      }
    );
    return () => unsub();
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

  // Toggle comments expander
  const toggleComments = (postId: string) => {
    setExpandedComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    Object.keys(expandedComments).forEach((postId) => {
      if (expandedComments[postId]) {
        const commentsRef = collection(db, 'posts', postId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));
        const unsub = onSnapshot(
          q,
          (snap) => {
            const list: PostComment[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PostComment));
            setCommentsMap((prev) => ({ ...prev, [postId]: list }));
          },
          (err) => {
            console.error('Comments error:', err);
          }
        );
        unsubscribers.push(unsub);
      }
    });

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [expandedComments]);

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
    if (!editPostContent.trim()) return;
    setIsSavingPostEdit(true);
    try {
      await updateDoc(doc(db, 'posts', postId), {
        content: editPostContent.trim(),
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
    if (!confirm('Are you sure you want to delete this wave?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
    }
  };

  // Handle media selection for inline post creator (compresses images & prepares videos for Firestore)
  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setPostNotice({ type: 'error', text: 'Please select a valid photo or video file.' });
      return;
    }

    setPostNotice(null);
    setInlineMediaFile(file);
    setInlineMediaType(isVideo ? 'video' : 'image');

    if (isImage) {
      try {
        const compressedDataUrl = await compressImage(file, 1280, 1280, 0.82);
        setInlineMediaPreview(compressedDataUrl);
      } catch (err) {
        console.error('Error compressing image:', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          setInlineMediaPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    } else {
      // Video preview via object URL while keeping the File ready for chunked Firestore upload
      const videoObjectUrl = URL.createObjectURL(file);
      setInlineMediaPreview(videoObjectUrl);
    }

    e.target.value = '';
  };

  // Submit inline post with Firestore picture & chunked video storage
  const handleCreatePost = async () => {
    if (!currentUser || (!inlineContent.trim() && !inlineMediaPreview && !inlineMediaFile)) return;
    setIsSubmittingPost(true);
    setUploadProgress(5);
    setPostNotice(null);

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';

      let finalImageUrl: string | undefined = undefined;
      let finalVideoUrl: string | undefined = undefined;
      let finalHasVideoChunks: boolean | undefined = undefined;
      let finalThumbnailUrl: string | undefined = undefined;
      let finalVideoFileName: string | undefined = undefined;
      let finalMediaType: 'image' | 'video' | undefined = undefined;

      if (inlineMediaType === 'image' && (inlineMediaPreview || inlineMediaFile)) {
        setUploadProgress(40);
        if (inlineMediaFile && (!inlineMediaPreview || inlineMediaPreview.length > 600 * 1024)) {
          finalImageUrl = await compressImage(inlineMediaFile, 1280, 1280, 0.8);
        } else {
          finalImageUrl = inlineMediaPreview || undefined;
        }
        finalMediaType = 'image';
        setUploadProgress(90);
      } else if (inlineMediaType === 'video' && inlineMediaFile) {
        setUploadProgress(10);
        // 1. Generate lightweight video poster thumbnail (<30KB) for Firestore document
        const thumb = await generateVideoThumbnail(inlineMediaFile);
        finalThumbnailUrl = thumb || undefined;
        finalImageUrl = thumb || undefined;

        // 2. Read video file as base64 dataURL and store in Firestore via saveVideoPost (chunked in posts/{postId}/chunks)
        const videoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(inlineMediaFile);
        });

        const savedVideo = await saveVideoPost(
          postId,
          inlineMediaFile,
          videoDataUrl,
          'posts',
          (pct) => setUploadProgress(pct)
        );

        finalVideoUrl = savedVideo.videoUrl;
        finalHasVideoChunks = savedVideo.hasVideoChunks;
        finalVideoFileName = inlineMediaFile.name;
        finalMediaType = 'video';
      }

      const newPost: Partial<Post> = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        content: inlineContent.trim(),
        imageUrl: finalImageUrl,
        thumbnailUrl: finalThumbnailUrl,
        videoUrl: finalVideoUrl,
        hasVideoChunks: finalHasVideoChunks,
        videoFileName: finalVideoFileName,
        mediaType: finalMediaType,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'posts', postId), cleanFirestoreData(newPost));
      setUploadProgress(100);

      // Reset form
      setInlineContent('');
      setInlineMediaFile(null);
      setInlineMediaPreview(null);
      setPostNotice({
        type: 'success',
        text:
          finalMediaType === 'video'
            ? 'Video reel uploaded and saved to Firestore!'
            : finalMediaType === 'image'
            ? 'Photo wave published to Firestore!'
            : 'Wave published to the community feed!'
      });
      setTimeout(() => setPostNotice(null), 4000);
    } catch (err) {
      console.error('Post creation error:', err);
      setPostNotice({
        type: 'error',
        text: 'Could not publish wave. Please try a smaller clip or check your connection.'
      });
    } finally {
      setIsSubmittingPost(false);
      setUploadProgress(0);
    }
  };

  // Reusable Reaction Bar Group (Like 👍, Heart ❤️, Fire 🔥) with real-time counters & click animations
  const renderReactionBar = (post: Post) => {
    const { counts, active } = getReactionData(post);
    const likeAnim = animatingReactions[`${post.id}_like`];
    const heartAnim = animatingReactions[`${post.id}_heart`];
    const fireAnim = animatingReactions[`${post.id}_fire`];

    const likeBurst = floatingBursts[`${post.id}_like`];
    const heartBurst = floatingBursts[`${post.id}_heart`];
    const fireBurst = floatingBursts[`${post.id}_fire`];

    return (
      <div className="inline-flex items-center gap-1.5 bg-[#F8FAFC] p-1 rounded-2xl border border-slate-200/80">
        {/* LIKE (ThumbsUp) */}
        <button
          type="button"
          onClick={() => handleToggleReaction(post, 'like')}
          title="Like Wave"
          aria-label={`Like post (${counts.like})`}
          className={`relative flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl transition-all duration-200 select-none active:scale-90 ${
            active.like
              ? 'bg-[#3B82F6]/12 text-[#3B82F6] font-extrabold ring-1 ring-[#3B82F6]/30 shadow-2xs'
              : 'text-slate-600 hover:bg-white hover:text-[#3B82F6]'
          }`}
        >
          {likeBurst && (
            <span
              key={likeBurst}
              className="pointer-events-none absolute -top-1 left-1/2 text-sm animate-reaction-float z-20"
            >
              👍
            </span>
          )}
          <ThumbsUp
            size={15}
            className={`transition-transform ${likeAnim ? 'animate-reaction-like' : ''} ${
              active.like ? 'fill-[#3B82F6] text-[#3B82F6]' : ''
            }`}
          />
          <span className="font-mono tabular-numbers text-xs">{counts.like}</span>
        </button>

        {/* HEART (Love) */}
        <button
          type="button"
          onClick={() => handleToggleReaction(post, 'heart')}
          title="Love Wave"
          aria-label={`Love post (${counts.heart})`}
          className={`relative flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl transition-all duration-200 select-none active:scale-90 ${
            active.heart
              ? 'bg-rose-500/12 text-rose-600 font-extrabold ring-1 ring-rose-500/30 shadow-2xs'
              : 'text-slate-600 hover:bg-white hover:text-rose-600'
          }`}
        >
          {heartBurst && (
            <span
              key={heartBurst}
              className="pointer-events-none absolute -top-1 left-1/2 text-sm animate-reaction-float z-20"
            >
              ❤️
            </span>
          )}
          <Heart
            size={15}
            className={`transition-transform ${heartAnim ? 'animate-reaction-heart' : ''} ${
              active.heart ? 'fill-rose-600 text-rose-600' : ''
            }`}
          />
          <span className="font-mono tabular-numbers text-xs">{counts.heart}</span>
        </button>

        {/* FIRE (Hype) */}
        <button
          type="button"
          onClick={() => handleToggleReaction(post, 'fire')}
          title="Fire Wave"
          aria-label={`Fire post (${counts.fire})`}
          className={`relative flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl transition-all duration-200 select-none active:scale-90 ${
            active.fire
              ? 'bg-orange-500/12 text-orange-600 font-extrabold ring-1 ring-orange-500/30 shadow-2xs'
              : 'text-slate-600 hover:bg-white hover:text-orange-500'
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
            size={15}
            className={`transition-transform ${fireAnim ? 'animate-reaction-fire' : ''} ${
              active.fire ? 'fill-orange-500 text-orange-600' : ''
            }`}
          />
          <span className="font-mono tabular-numbers text-xs">{counts.fire}</span>
        </button>
      </div>
    );
  };


  // Add Comment
  const handleAddComment = async (postId: string) => {
    const text = commentInput[postId]?.trim();
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

  // Priority sorting: Boosted posts first, then newest
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.isBoosted && !b.isBoosted) return -1;
    if (!a.isBoosted && b.isBoosted) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // If hashtag filter active from global search
  const filteredSortedPosts = initialFilterTag
    ? sortedPosts.filter((p) => p.content?.toLowerCase().includes(initialFilterTag.toLowerCase()))
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
  if (!isProUser && filteredSortedPosts.length < 8 && SPONSORED_ADS.length > 0 && !combinedFeed.some((p) => p.isSponsored) && !initialFilterTag) {
    combinedFeed.push(SPONSORED_ADS[0]);
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-5 md:px-8 py-5 sm:py-7">
      <div className="flex flex-row gap-7 items-start justify-center">
        {/* Center Main Feed (Width < 768px: Full Width, Width >= 768px: max-w-2xl) */}
        <div className="flex-1 min-w-0 max-w-full md:max-w-2xl w-full space-y-6 overflow-hidden">
          {/* Active Hashtag Filter Banner from Global Search */}
          {initialFilterTag && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white flex items-center justify-between gap-3 shadow-md animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-2xl bg-white/20 text-white shrink-0">
                  <Hash size={18} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-blue-100 font-bold uppercase tracking-wider block">Hashtag Filter</span>
                  <h4 className="text-xs sm:text-sm font-extrabold truncate">
                    Filtered by <span className="text-emerald-200">{initialFilterTag}</span> ({filteredSortedPosts.length} waves)
                  </h4>
                </div>
              </div>
              {onClearFilterTag && (
                <button
                  onClick={onClearFilterTag}
                  className="px-3.5 py-1.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shrink-0"
                >
                  <span>Clear</span>
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* Crisp Pure White Welcome Hero & Profile Header Card */}
          <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-[#FFFFFF] border border-slate-200/90 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] text-[#0F172A]">
            <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#3B82F6] text-[11px] font-extrabold uppercase tracking-wider border border-blue-200/80">
                    <Sparkles size={12} className="text-[#10B981]" />
                    <span>WaveLink Community Feed</span>
                  </div>

                  {/* Daily Login Bonus & Streak Header Pill */}
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('settings')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 hover:bg-amber-100/80 text-amber-800 border border-amber-200/90 text-[11px] font-extrabold transition"
                    title="View your Daily Login Reward & Streak in Profile"
                  >
                    <Coins size={12} className="text-amber-500" />
                    <span>{(userProfile?.wavePoints ?? 10).toLocaleString()} WavePoints</span>
                    <span className="text-slate-300">•</span>
                    <Flame size={12} className="fill-orange-500 text-orange-500" />
                    <span>{Math.max(1, userProfile?.loginStreak ?? 1)}-Day Streak</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-[#10B981] text-[10px]">
                      +{userProfile?.lastDailyRewardAmount ?? 10} Today ✓
                    </span>
                  </button>
                </div>

                <h2 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-[#0F172A]">
                  Welcome back, {userProfile?.displayName?.split(' ')[0] || 'Friend'}!
                </h2>
                <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-xl font-medium leading-relaxed">
                  Share high-resolution photos, upload video reels directly to Firestore, and post official events on the community notice board.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onNavigateTab && (
                  <>
                    <button
                      onClick={() => onNavigateTab('announcements')}
                      className="px-4 py-2.5 rounded-2xl bg-[#F8FAFC] hover:bg-slate-100 text-[#0F172A] border border-slate-200/90 font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition"
                    >
                      <CalendarDays size={14} className="text-[#3B82F6]" />
                      <span>Notice Board &amp; Events</span>
                    </button>
                    <button
                      onClick={() => onNavigateTab('videos')}
                      className="px-4 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-2 transition shadow-sm shadow-blue-500/20 active:scale-95"
                    >
                      <VideoIcon size={14} />
                      <span>Explore Reels</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 24-Hour Moments Spark Tray */}
          <div className="w-full max-w-full overflow-hidden">
            <SparkTray />
          </div>

          {/* Pinned Community Announcement Banner for Admins & Verified Organizations */}
          {pinnedAnnouncement && (
            <div className="w-full max-w-full">
              <RichEventCard
                announcement={pinnedAnnouncement}
                isFeedBanner={true}
                onRsvp={handleToggleAnnouncementRsvp}
              />
            </div>
          )}

          {/* Center Main Feed: Pure White Post Creation Card with Firestore Photo & Video Upload */}
          <div className="w-full max-w-full overflow-hidden bg-[#FFFFFF] border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] transition">
            <div className="flex items-start gap-3.5">
              <img
                src={
                  userProfile?.photoURL ||
                  currentUser?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="User"
                className="w-11 h-11 rounded-full object-cover ring-2 ring-[#3B82F6]/20 shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <textarea
                  value={inlineContent}
                  onChange={(e) => setInlineContent(e.target.value)}
                  placeholder={`What's making waves today, ${userProfile?.displayName?.split(' ')[0] || 'Friend'}? Share a photo, video clip, or update...`}
                  rows={3}
                  className="w-full max-w-full bg-[#F8FAFC] rounded-2xl p-3.5 border border-slate-200/90 resize-none text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/15 break-words leading-relaxed transition"
                />

                {inlineMediaPreview && (
                  <div className="relative rounded-2xl overflow-hidden my-3 border border-slate-200 max-h-72 bg-slate-950">
                    {inlineMediaType === 'video' ? (
                      <video src={inlineMediaPreview} controls className="w-full h-auto max-h-72 object-contain" />
                    ) : (
                      <img src={inlineMediaPreview} alt="Preview" className="w-full h-auto max-h-72 object-cover" />
                    )}
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[#0F172A] text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      {inlineMediaType === 'video' ? (
                        <>
                          <VideoIcon size={12} className="text-[#10B981]" />
                          <span>Ready for Firestore Video Storage</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon size={12} className="text-[#3B82F6]" />
                          <span>Compressed HD Photo Ready</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInlineMediaFile(null);
                        setInlineMediaPreview(null);
                      }}
                      className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-slate-900 transition"
                      title="Remove attachment"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Live Firestore Upload Progress Bar */}
                {isSubmittingPost && uploadProgress > 0 && (
                  <div className="my-3 p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-[#0F172A] mb-1.5">
                      <span>
                        {inlineMediaType === 'video' && inlineMediaFile
                          ? 'Uploading video chunks to Firestore...'
                          : 'Saving wave to Firestore...'}
                      </span>
                      <span className="font-mono text-[#3B82F6]">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] transition-all duration-300"
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
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={15}
                        className={postNotice.type === 'success' ? 'text-[#10B981]' : 'text-rose-600'}
                      />
                      <span>{postNotice.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPostNotice(null)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3.5 mt-2 border-t border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*,video/*"
                      onChange={handleMediaSelect}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = 'image/*';
                          fileInputRef.current.click();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100/80 text-[#3B82F6] border border-blue-200/60 text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <ImageIcon size={15} />
                      <span>Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = 'video/*';
                          fileInputRef.current.click();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-[#10B981] border border-emerald-200/60 text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <VideoIcon size={15} />
                      <span>Video / Reel</span>
                    </button>

                    {onNavigateTab && (
                      <>
                        <button
                          type="button"
                          onClick={() => onNavigateTab('studio')}
                          className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] hover:bg-slate-100 text-[#0F172A] border border-slate-200/80 text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <Wand2 size={15} className="text-[#3B82F6]" />
                          <span>Studio</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigateTab('announcements')}
                          className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] hover:bg-slate-100 text-[#0F172A] border border-slate-200/80 text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <CalendarDays size={15} className="text-[#10B981]" />
                          <span>Post Event</span>
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={isSubmittingPost || (!inlineContent.trim() && !inlineMediaPreview && !inlineMediaFile)}
                    className="px-6 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95 transition"
                  >
                    {isSubmittingPost ? (
                      <span>Uploading...</span>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Share Wave</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Wave Studio Quick Action */}
          <div className="bg-[#FFFFFF] border border-slate-200/90 rounded-3xl p-5 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white shadow-sm shadow-blue-500/20">
                <Wand2 size={22} className="text-white" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-[#0F172A] flex items-center gap-1.5">
                  <span>Wave Media Studio</span>
                  <Sparkles size={14} className="text-[#10B981]" />
                </h3>
                <p className="text-xs text-slate-600 max-w-md">
                  Edit photos &amp; videos, add text overlays, vibe stickers, and soundtracks before publishing to Firestore.
                </p>
              </div>
            </div>

            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('studio')}
                className="px-5 py-2.5 rounded-2xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs active:scale-95 transition"
              >
                <Wand2 size={15} />
                <span>Open Media Studio</span>
              </button>
            )}
          </div>

          {/* Posts Stream */}
          <div className="space-y-5">
            {isLoading ? (
              <PostSkeleton count={3} />
            ) : combinedFeed.length === 0 ? (
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
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-3.5">
                        {post.content}
                      </p>

                      {/* Image */}
                      {post.imageUrl && (
                        <div className="rounded-2xl overflow-hidden mb-3.5 border border-slate-200/80 max-h-96 bg-slate-50 flex items-center justify-center">
                          <img
                            src={post.imageUrl}
                            alt="Sponsored item"
                            className="w-full h-auto max-h-96 object-cover"
                          />
                        </div>
                      )}

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
                        <button
                          onClick={() => copyPostLink(post.id)}
                          className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl hover:bg-slate-100 transition"
                        >
                          <Share2 size={14} />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // Case B: Standard Community Wave Post (with Boosting & Tipping)
                return (
                  <article
                    key={post.id}
                    className={`w-full max-w-full overflow-hidden break-words bg-[#FFFFFF] border rounded-3xl p-5 sm:p-6 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] transition ${
                      post.isBoosted
                        ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-md shadow-amber-500/10'
                        : 'border-slate-200/90 hover:border-blue-300/80 hover:shadow-[0_8px_28px_-4px_rgba(15,23,42,0.08)]'
                    }`}
                  >
                    {/* Author Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            post.authorPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`
                          }
                          alt={post.authorName}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-[#3B82F6]/20"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <CrystalBadge
                              email={post.authorEmail}
                              name={post.authorName}
                              size="md"
                            />
                            {post.authorUsername && (
                              <span className="text-xs font-mono text-[#3B82F6] font-semibold">
                                {post.authorUsername}
                              </span>
                            )}
                            {/* Golden Boosted Badge */}
                            {post.isBoosted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-xs">
                                <Rocket size={10} className="fill-white" />
                                <span>Boosted</span>
                              </span>
                            )}
                            {/* Tips received count */}
                            {Boolean(post.tipsTotalTZS && post.tipsTotalTZS > 0) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300/50">
                                <HandCoins size={10} />
                                <span>TZS {post.tipsTotalTZS?.toLocaleString()} tips</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <span className="font-mono tabular-numbers">
                              {new Date(post.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Wave</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Boost Button for Author if not yet boosted */}
                        {isAuthor && !post.isBoosted && (
                          <button
                            onClick={() => setBoostingPost(post)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300/60 transition active:scale-95 shadow-2xs"
                            title="Boost Post Reach for 2,000 TZS micro-payment"
                          >
                            <Rocket size={12} className="text-amber-500" />
                            <span>Boost (2k)</span>
                          </button>
                        )}

                        {canEdit && (
                          <button
                            onClick={() => handleStartEditPost(post)}
                            className="p-1.5 text-slate-400 hover:text-[#3B82F6] rounded-xl transition"
                            title="Edit Wave Content (Pro Privilege)"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl transition"
                            title={isAdmin && !isAuthor ? 'Admin Moderation: Delete' : 'Delete Post'}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content or Inline Editor */}
                    {editingPostId === post.id ? (
                      <div className="mb-4 p-3.5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-2.5">
                        <textarea
                          rows={3}
                          value={editPostContent}
                          onChange={(e) => setEditPostContent(e.target.value)}
                          className="w-full p-3 rounded-xl bg-white border border-blue-300 text-xs sm:text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] resize-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingPostId(null)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSavingPostEdit}
                            onClick={() => handleSavePostEdit(post.id)}
                            className="px-4 py-1.5 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                          >
                            {isSavingPostEdit ? 'Saving...' : 'Save Wave'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      post.content && (
                        <p className="text-sm sm:text-[15px] text-[#0F172A] whitespace-pre-wrap leading-relaxed mb-4">
                          {post.content}
                          {post.isEdited && (
                            <span className="text-[10px] text-slate-400 italic ml-2">
                              (edited)
                            </span>
                          )}
                        </p>
                      )
                    )}

                    {/* Attached Online Song Soundtrack */}
                    {post.songPreviewUrl && post.songTitle && (
                      <div className="mb-3.5">
                        <SongPlayerCard
                          title={post.songTitle}
                          artist={post.songArtist || ''}
                          albumArt={post.songAlbumArt}
                          previewUrl={post.songPreviewUrl}
                          albumName={post.songAlbumName}
                        />
                      </div>
                    )}

                    {/* Attached Video from Firestore (Chunked or Direct) */}
                    {(post.videoUrl || post.hasVideoChunks || post.mediaType === 'video') && (
                      <div className="mb-3.5">
                        <VideoPlayer
                          postId={post.id}
                          videoUrl={post.videoUrl}
                          hasVideoChunks={post.hasVideoChunks}
                          thumbnailUrl={post.thumbnailUrl || post.imageUrl}
                        />
                      </div>
                    )}

                    {/* Attached Image from Firestore */}
                    {post.imageUrl && !post.videoUrl && !post.hasVideoChunks && post.mediaType !== 'video' && (
                      <div className="rounded-2xl overflow-hidden mb-3.5 border border-slate-200/80 max-h-[460px] bg-[#F8FAFC] flex items-center justify-center">
                        <img
                          src={post.imageUrl}
                          alt="Wave attachment"
                          className="w-full h-auto max-h-[460px] object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-semibold text-slate-500 flex-wrap gap-2">
                      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                        {/* Reactions: Like 👍, Heart ❤️, Fire 🔥 */}
                        {renderReactionBar(post)}

                        {/* Comments */}
                        <button
                          onClick={() => toggleComments(post.id)}
                          className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition ${
                            isExpanded
                              ? 'text-[#3B82F6] bg-blue-50 font-semibold'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <MessageCircle size={16} />
                          <span className="font-mono tabular-numbers">{post.commentsCount || 0} Replies</span>
                        </button>

                        {/* Creator Tip Button */}
                        <button
                          onClick={() => setTippingPost(post)}
                          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition hover:bg-amber-50 text-amber-700 font-bold active:scale-95 border border-amber-300/50"
                          title="Tip creator directly via Mobile Money"
                        >
                          <HandCoins size={15} className="text-amber-500" />
                          <span>Tip {post.tipsCount ? `(${post.tipsCount})` : ''}</span>
                        </button>

                        {/* Save / Bookmark */}
                        <button
                          onClick={() => handleToggleSave(post.id)}
                          className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition active:scale-95 ${
                            isSaved
                              ? 'text-[#3B82F6] bg-blue-50 font-bold'
                              : 'hover:bg-slate-100'
                          }`}
                          title={isSaved ? 'Saved to bookmarks' : 'Save post'}
                        >
                          <Bookmark size={16} className={isSaved ? 'fill-[#3B82F6] text-[#3B82F6]' : ''} />
                          <span className="font-mono tabular-numbers">{post.savesCount || 0}</span>
                        </button>
                      </div>

                      <button
                        onClick={() => copyPostLink(post.id)}
                        className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl hover:bg-slate-100 transition"
                      >
                        {copiedId === post.id ? (
                          <Check size={14} className="text-[#10B981]" />
                        ) : (
                          <Share2 size={14} />
                        )}
                        <span>{copiedId === post.id ? 'Copied' : 'Share'}</span>
                      </button>
                    </div>

                    {/* Collapsible Comments Section */}
                    {isExpanded && (
                      <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-gray-800 space-y-3">
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
                            className="flex-1 py-2 px-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            disabled={!commentInput[post.id]?.trim()}
                            className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white disabled:opacity-40 hover:from-blue-500 hover:to-emerald-500 transition shadow-xs"
                          >
                            <Send size={14} />
                          </button>
                        </div>

                        {comments.length === 0 ? (
                          <p className="text-[11px] text-gray-400 italic py-1">
                            No replies yet. Be the first to chime in!
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="flex items-start gap-2.5 p-3 rounded-2xl bg-gray-50/70 dark:bg-gray-800/40 text-xs"
                              >
                                <img
                                  src={
                                    comment.authorPhotoURL ||
                                    `https://api.dicebear.com/7.x/shapes/svg?seed=${comment.authorId}`
                                  }
                                  alt={comment.authorName}
                                  className="w-7 h-7 rounded-full object-cover ring-1 ring-blue-500/20 shrink-0 mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <CrystalBadge
                                      email={comment.authorEmail}
                                      name={comment.authorName}
                                      size="sm"
                                    />
                                    <span className="text-[10px] text-gray-400 font-mono tabular-numbers">
                                      {new Date(comment.createdAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-gray-700 dark:text-gray-300 leading-relaxed">
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

            {/* Adsterra Native In-Feed Banner (Visible only for free users, instant auto-hide when upgrading to Pro) */}
            <AdsterraAdBanner
              variant="feed"
              slotId="feed_bottom"
              onOpenUpgradeModal={() => setIsPaymentModalOpen(true)}
            />
          </div>

          {/* Legal Footer for Privacy, Terms & Refund policies */}
          <LegalFooter className="mt-6" />
        </div>

        {/* Right Sidebar (Desktop Width >= 768px: 3rd Column, Width < 768px: hidden md:block) */}
        <RightSidebar onNavigateTab={(tab) => onNavigateTab && onNavigateTab(tab as any)} />
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
    </div>
  );
};

