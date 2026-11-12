import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { UserProfile, Post, ActiveTab } from '../types';
import { useAuth } from '../context/AuthContext';
import { toggleFollowUser } from '../services/notificationService';
import { CrystalBadge } from './CrystalBadge';
import { PostBody } from './PostBody';
import { triggerHaptic } from '../utils/haptics';
import { Avatar } from './Avatar';
import {
  X,
  User,
  Film,
  Hash,
  MessageSquare,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Heart,
  Crown,
  ExternalLink,
  UserPlus,
  UserCheck,
  Share2,
  Calendar,
  Flame,
  Check,
  Copy,
  Layers,
  ChevronRight
} from 'lucide-react';

export type QuickPreviewItem =
  | { type: 'user'; user: UserProfile }
  | { type: 'post'; post: Post }
  | { type: 'tag'; tag: string; postCount?: number };

interface QuickSearchPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: QuickPreviewItem | null;
  onNavigateTab: (tab: ActiveTab) => void;
  onStartChat?: (userId: string) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onSelectPreviewItem?: (item: QuickPreviewItem) => void;
}

export const QuickSearchPreviewDrawer: React.FC<QuickSearchPreviewDrawerProps> = ({
  isOpen,
  onClose,
  item,
  onNavigateTab,
  onStartChat,
  onSelectHashtag,
  onSelectPreviewItem
}) => {
  const { currentUser } = useAuth();
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowLoading, setIsFollowLoading] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Additional context for person preview: recent waves by this user
  const [userRecentPosts, setUserRecentPosts] = useState<Post[]>([]);
  const [isLoadingUserPosts, setIsLoadingUserPosts] = useState<boolean>(false);

  // Additional context for tag preview: recent waves matching this tag
  const [tagRecentPosts, setTagRecentPosts] = useState<Post[]>([]);
  const [isLoadingTagPosts, setIsLoadingTagPosts] = useState<boolean>(false);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background body scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Load user follow status and recent posts when previewing a user
  useEffect(() => {
    if (!isOpen || !item || item.type !== 'user') {
      setUserRecentPosts([]);
      return;
    }

    const targetUser = item.user;

    // Check if current user is following this user
    if (currentUser && currentUser.uid !== targetUser.id) {
      const checkFollow = async () => {
        try {
          const followQ = query(
            collection(db, 'follows'),
            where('followerId', '==', currentUser.uid),
            where('targetUserId', '==', targetUser.id),
            limit(1)
          );
          const snap = await getDocs(followQ);
          setIsFollowing(!snap.empty);
        } catch {
          setIsFollowing(false);
        }
      };
      checkFollow();
    } else {
      setIsFollowing(false);
    }

    // Fetch up to 4 recent waves by this user
    const fetchUserPosts = async () => {
      setIsLoadingUserPosts(true);
      try {
        const postsQ = query(
          collection(db, 'posts'),
          where('authorId', '==', targetUser.id),
          orderBy('createdAt', 'desc'),
          limit(4)
        );
        const snap = await getDocs(postsQ);
        const list: Post[] = [];
        snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() } as Post));
        setUserRecentPosts(list);
      } catch {
        // Fallback: search by authorName
        try {
          const fallbackQ = query(
            collection(db, 'posts'),
            where('authorName', '==', targetUser.displayName || targetUser.username),
            limit(4)
          );
          const snap = await getDocs(fallbackQ);
          const list: Post[] = [];
          snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() } as Post));
          setUserRecentPosts(list);
        } catch {
          setUserRecentPosts([]);
        }
      } finally {
        setIsLoadingUserPosts(false);
      }
    };

    fetchUserPosts();
  }, [isOpen, item, currentUser]);

  // Load matching waves when previewing a hashtag
  useEffect(() => {
    if (!isOpen || !item || item.type !== 'tag') {
      setTagRecentPosts([]);
      return;
    }

    const cleanTag = item.tag.replace(/^#/, '');
    const fetchTagPosts = async () => {
      setIsLoadingTagPosts(true);
      try {
        // Fetch recent posts to match hashtag in memory (bounded to 15)
        const recentQ = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(15));
        const snap = await getDocs(recentQ);
        const matching: Post[] = [];
        const regex = new RegExp(`#${cleanTag}\\b`, 'i');
        snap.forEach((doc) => {
          const post = { id: doc.id, ...doc.data() } as Post;
          if (post.content && regex.test(post.content)) {
            matching.push(post);
          }
        });
        setTagRecentPosts(matching.slice(0, 6));
      } catch {
        setTagRecentPosts([]);
      } finally {
        setIsLoadingTagPosts(false);
      }
    };

    fetchTagPosts();
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleToggleFollow = async () => {
    if (!currentUser || item.type !== 'user') return;
    const target = item.user;
    setIsFollowLoading(true);
    triggerHaptic('medium');
    try {
      const nowFollowing = await toggleFollowUser(
        currentUser.uid,
        currentUser.displayName || 'A waver',
        target.id,
        target.displayName
      );
      setIsFollowing(nowFollowing);
    } catch (err) {
      console.warn('Failed to toggle follow:', err);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleStartChatWithUser = () => {
    if (item.type !== 'user') return;
    triggerHaptic('tab');
    if (onStartChat) {
      onStartChat(item.user.id);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:start-chat', { detail: { userId: item.user.id } }));
    }
    onClose();
  };

  const handleViewUserWaves = () => {
    if (item.type !== 'user') return;
    const handle = item.user.username || item.user.displayName;
    triggerHaptic('tab');
    if (onSelectHashtag) {
      onSelectHashtag(`@${handle.replace(/^@/, '')}`);
    }
    onNavigateTab('feed');
    onClose();
  };

  const handleJumpToFeedWithTag = (tagStr: string) => {
    const formattedTag = tagStr.startsWith('#') ? tagStr : `#${tagStr}`;
    triggerHaptic('tab');
    if (onSelectHashtag) {
      onSelectHashtag(formattedTag);
    }
    onNavigateTab('feed');
    onClose();
  };

  const handleCopyLink = () => {
    triggerHaptic('light');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const shareUrl = `${window.location.origin}/#${
        item.type === 'user'
          ? `profile/${item.user.username || item.user.id}`
          : item.type === 'post'
          ? `wave/${item.post.id}`
          : `tag=${encodeURIComponent(item.tag)}`
      }`;
      navigator.clipboard.writeText(shareUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200/90 animate-in slide-in-from-right duration-250 ease-out">
          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  item.type === 'user'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200/80'
                    : item.type === 'post'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                }`}
              >
                {item.type === 'user' && (
                  <>
                    <User size={12} className="text-teal-600" />
                    <span>Person Profile</span>
                  </>
                )}
                {item.type === 'post' && (
                  <>
                    <Film size={12} className="text-blue-600" />
                    <span>Wave Preview</span>
                  </>
                )}
                {item.type === 'tag' && (
                  <>
                    <Hash size={12} className="text-emerald-600" />
                    <span>Hashtag Topic</span>
                  </>
                )}
              </span>

              <span className="text-[11px] text-slate-400 font-medium">Quick Preview</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyLink}
                title="Copy link"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                {copiedLink ? <Check size={16} className="text-emerald-600 stroke-[2.5]" /> : <Share2 size={16} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview drawer"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* 1. PERSON PREVIEW */}
            {item.type === 'user' && (
              <div className="space-y-5">
                {/* Profile Identity Card */}
                <div className="flex items-start gap-4">
                  <Avatar
                    uid={item.user.id}
                    src={
                      item.user.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${item.user.id}`
                    }
                    alt={item.user.displayName || item.user.username}
                    fallbackName={item.user.displayName || item.user.username}
                    size={64}
                    showStatus={true}
                    onlyWhenVisible={false}
                    targetProfile={item.user}
                    ringClassName="ring-2 ring-teal-500/20 shadow-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-lg font-extrabold text-[#0F172A] truncate">
                        {item.user.displayName || item.user.username}
                      </h2>
                      <CrystalBadge
                        email={item.user.email}
                        name={item.user.displayName}
                        size="sm"
                      />
                    </div>
                    <p className="text-xs font-mono text-[#0D9488] font-bold mt-0.5">
                      {item.user.username?.startsWith('@')
                        ? item.user.username
                        : `@${item.user.username || item.user.email?.split('@')[0] || 'waver'}`}
                    </p>

                    {item.user.isPro && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-2xs">
                        <Sparkles size={9} />
                        WaveLink Pro
                      </span>
                    )}
                  </div>
                </div>

                {/* Bio & Details */}
                {item.user.bio ? (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    {item.user.bio}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50/70 p-3 rounded-2xl border border-dashed border-slate-200">
                    No bio provided yet.
                  </p>
                )}

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50/80 border border-slate-100 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                      Wave Points
                    </span>
                    <span className="text-lg font-black text-slate-800">
                      {(item.user.wavePoints ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 border border-slate-100 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                      Member Status
                    </span>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active Waver
                    </span>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {currentUser && currentUser.uid !== item.user.id && (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleFollow}
                        disabled={isFollowLoading}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                          isFollowing
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                            : 'bg-teal-600 hover:bg-teal-700 text-white'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck size={14} className="text-emerald-600" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={14} />
                            <span>Follow</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleStartChatWithUser}
                        className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare size={14} />
                        <span>Chat</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleViewUserWaves}
                    className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>View Waves</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Recent Waves by this User */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Film size={13} className="text-teal-600" />
                      <span>Recent Waves ({userRecentPosts.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={handleViewUserWaves}
                      className="text-xs text-[#2563EB] hover:underline font-semibold"
                    >
                      Browse All
                    </button>
                  </div>

                  {isLoadingUserPosts ? (
                    <div className="py-6 text-center text-xs text-slate-400">Loading recent waves...</div>
                  ) : userRecentPosts.length > 0 ? (
                    <div className="space-y-2.5">
                      {userRecentPosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => {
                            if (onSelectPreviewItem) {
                              onSelectPreviewItem({ type: 'post', post });
                            }
                          }}
                          className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 transition cursor-pointer group"
                        >
                          <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed font-medium">
                            {post.content}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                            <span className="flex items-center gap-1">
                              <Heart size={11} className="text-rose-400" />
                              {post.likesCount || 0} sparks
                            </span>
                            <span className="text-[#2563EB] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                              Preview Wave <ChevronRight size={12} />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-2">
                      No recent waves found for this creator.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 2. POST PREVIEW */}
            {item.type === 'post' && (
              <div className="space-y-5">
                {/* Author Info Header */}
                <div className="flex items-center justify-between">
                  <div
                    onClick={() => {
                      if (onSelectPreviewItem && item.post.authorId) {
                        onSelectPreviewItem({
                          type: 'user',
                          user: {
                            id: item.post.authorId,
                            displayName: item.post.authorName || 'Waver',
                            email: `${item.post.authorName?.toLowerCase().replace(/\s+/g, '') || 'waver'}@wavelink.tz`,
                            username: `@${item.post.authorName?.toLowerCase().replace(/\s+/g, '') || 'waver'}`
                          } as UserProfile
                        });
                      }
                    }}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <Avatar
                      uid={item.post.authorId}
                      src={
                        item.post.authorPhotoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${item.post.authorId || item.post.id}`
                      }
                      alt={item.post.authorName}
                      fallbackName={item.post.authorName}
                      size={44}
                      showStatus={true}
                      onlyWhenVisible={false}
                      ringClassName="ring-2 ring-blue-500/20 shadow-xs"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-[#0F172A] group-hover:text-blue-600 transition-colors">
                          {item.post.authorName || 'Waver'}
                        </span>
                        <CrystalBadge name={item.post.authorName} size="sm" />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.post.authorUsername || 'Wave Author'}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 font-mono">
                    {item.post.mediaType === 'video' ? 'Reel' : item.post.imageUrl ? 'Photo' : 'Wave'}
                  </span>
                </div>

                {/* Formatted Post Body with Interactive Links & Web Speech API */}
                <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                  <PostBody
                    postId={item.post.id}
                    authorId={item.post.authorId}
                    content={item.post.content}
                    authorName={item.post.authorName}
                    createdAt={item.post.createdAt}
                    showCopyButton={true}
                    showTtsButton={true}
                    showBookmarkButton={true}
                    showEditButton={false}
                    className="text-sm sm:text-base leading-relaxed"
                  />
                </div>

                {/* Media Preview */}
                {item.post.imageUrl && (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs max-h-72 bg-[#0C0A09] flex items-center justify-center">
                    <img
                      src={item.post.imageUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 brightness-50 pointer-events-none"
                    />
                    <img
                      src={item.post.imageUrl}
                      alt="Post visual"
                      className="relative z-10 w-full h-auto max-h-72 object-contain"
                    />
                  </div>
                )}

                {item.post.videoUrl && item.post.mediaType === 'video' && (
                  <div className="rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs max-h-72 bg-black">
                    <video
                      src={item.post.videoUrl}
                      controls
                      playsInline
                      className="w-full max-h-72 object-contain"
                    />
                  </div>
                )}

                {/* Engagement Metrics */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Heart size={14} className="text-rose-500 fill-rose-50" />
                    <strong>{item.post.likesCount || 0}</strong> Sparks
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-blue-500" />
                    <strong>{item.post.commentsCount || 0}</strong> Comments
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Flame size={14} className="text-amber-500" />
                    Trending
                  </span>
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tab');
                      onNavigateTab('feed');
                      onClose();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#2563EB] hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Open in Full Feed</span>
                    <ExternalLink size={13} />
                  </button>

                  {item.post.authorId && currentUser && currentUser.uid !== item.post.authorId && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tab');
                        if (onStartChat) onStartChat(item.post.authorId!);
                        onClose();
                      }}
                      className="py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare size={13} />
                      <span>Chat Author</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 3. HASHTAG PREVIEW */}
            {item.type === 'tag' && (
              <div className="space-y-5">
                {/* Hashtag Header */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 to-emerald-50/50 border border-blue-100">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Hash size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold text-[#0F172A]">
                        {item.tag.startsWith('#') ? item.tag : `#${item.tag}`}
                      </h2>
                      <span className="text-xs text-slate-500">
                        Trending topic on WaveLink
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-blue-200/50">
                    <button
                      type="button"
                      onClick={() => handleJumpToFeedWithTag(item.tag)}
                      className="flex-1 py-2.5 px-3.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>Filter Main Feed by this Tag</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Matching Waves List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={13} className="text-blue-600" />
                      <span>Matching Waves ({tagRecentPosts.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleJumpToFeedWithTag(item.tag)}
                      className="text-xs text-[#2563EB] hover:underline font-semibold"
                    >
                      Explore All
                    </button>
                  </div>

                  {isLoadingTagPosts ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Searching waves tagged with {item.tag}...
                    </div>
                  ) : tagRecentPosts.length > 0 ? (
                    <div className="space-y-3">
                      {tagRecentPosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => {
                            if (onSelectPreviewItem) {
                              onSelectPreviewItem({ type: 'post', post });
                            }
                          }}
                          className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 transition cursor-pointer group"
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                            <span className="truncate">{post.authorName || 'Waver'}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {post.mediaType === 'video' ? 'Reel' : 'Wave'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                            {post.content}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                            <span className="flex items-center gap-1">
                              <Heart size={11} className="text-rose-400" />
                              {post.likesCount || 0}
                            </span>
                            <span className="text-[#2563EB] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                              Preview Wave <ChevronRight size={12} />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      No waves found specifically with this tag yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">Esc</kbd> to close</span>
            <span>WaveLink Quick Preview</span>
          </div>
        </div>
      </div>
    </div>
  );
};
