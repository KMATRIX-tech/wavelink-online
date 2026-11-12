import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  doc
} from 'firebase/firestore';
import {
  X,
  Send,
  UserPlus,
  UserCheck,
  MessageCircle,
  Film,
  Image as ImageIcon,
  Sparkles,
  ChevronRight,
  Smile
} from 'lucide-react';
import {
  db,
  sanitizeAvatarUrlForFirestore,
  isFirestoreQuotaError,
  notifyQuotaExceeded
} from '../firebase';
import { Post, PostComment, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { sanitizeUserText } from '../utils/security';
import { sendNotification } from '../services/notificationService';
import { CrystalBadge } from './CrystalBadge';

interface ReelDesktopRightPanelProps {
  post: Post | null;
  creatorProfile: UserProfile | null;
  moreCreatorPosts: Post[];
  latestComments: PostComment[];
  isFollowing: boolean;
  onToggleFollow: () => void;
  onSelectCreatorProfile: () => void;
  onSelectPost: (postId: string) => void;
  onCommentAdded: (postId: string, comment: PostComment, newCount: number) => void;
  isOpenDrawer: boolean;
  isCollapsedWide: boolean;
  onCloseDrawer: () => void;
  onToggleCollapseWide: () => void;
}

const PANEL_EMOJIS = ['❤️', '🔥', '👏', '😂', '🙌', '✨'];

function formatShortRelativeTime(iso?: string, isSw?: boolean): string {
  if (!iso) return '';
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return isSw ? 'sasa' : 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

export const ReelDesktopRightPanel: React.FC<ReelDesktopRightPanelProps> = ({
  post,
  creatorProfile,
  moreCreatorPosts,
  latestComments,
  isFollowing,
  onToggleFollow,
  onSelectCreatorProfile,
  onSelectPost,
  onCommentAdded,
  isOpenDrawer,
  isCollapsedWide,
  onCloseDrawer,
  onToggleCollapseWide
}) => {
  const { currentUser, userProfile } = useAuth();
  const { language } = useLanguage();
  const isSw = language === 'sw';

  const [paginatedComments, setPaginatedComments] = useState<PostComment[]>([]);
  const [pageLimit, setPageLimit] = useState<number>(20);
  const [hasLoadedFullPage, setHasLoadedFullPage] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMoreComments, setHasMoreComments] = useState<boolean>(false);
  const [commentInput, setCommentInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showEmojiRow, setShowEmojiRow] = useState<boolean>(false);

  // Reset when active post changes (re-uses the 3 comments from the single active listener by default)
  useEffect(() => {
    setPaginatedComments([]);
    setPageLimit(20);
    setHasLoadedFullPage(false);
    setHasMoreComments((post?.commentsCount || 0) > 3);
    setCommentInput('');
  }, [post?.id, post?.commentsCount]);

  const loadCommentsPage = async (nextLimit: number) => {
    if (!post?.id || post.isSponsored || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const q = query(
        collection(db, 'posts', post.id, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(nextLimit)
      );
      const snap = await getDocs(q);
      const list: PostComment[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PostComment));
      setPaginatedComments(list);
      setPageLimit(nextLimit);
      setHasLoadedFullPage(true);
      setHasMoreComments(snap.docs.length >= nextLimit);
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        notifyQuotaExceeded(err);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Merge latest 3 real-time comments with any loaded paginated comments
  const displayedComments = React.useMemo(() => {
    const map = new Map<string, PostComment>();
    latestComments.forEach((c) => map.set(c.id, c));
    paginatedComments.forEach((c) => {
      if (!map.has(c.id)) map.set(c.id, c);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [latestComments, paginatedComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !post || isSending) return;
    const clean = sanitizeUserText(commentInput, 800);
    if (!clean) return;

    setIsSending(true);
    setCommentInput('');
    const nowIso = new Date().toISOString();
    const authorName = userProfile?.displayName || currentUser.displayName || 'Waver';
    const authorAvatar = sanitizeAvatarUrlForFirestore(
      userProfile?.photoURL || currentUser.photoURL,
      currentUser.uid
    );

    const optimisticComment: PostComment = {
      id: `opt_${Date.now()}`,
      postId: post.id,
      authorId: currentUser.uid,
      authorEmail: currentUser.email || '',
      authorName,
      authorPhotoURL: authorAvatar,
      content: clean,
      createdAt: nowIso
    };

    const nextCount = (post.commentsCount || displayedComments.length) + 1;
    setPaginatedComments((prev) => [optimisticComment, ...prev]);
    onCommentAdded(post.id, optimisticComment, nextCount);

    if (post.isSponsored) {
      setIsSending(false);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'posts', post.id, 'comments'), {
        postId: post.id,
        authorId: currentUser.uid,
        authorName,
        authorPhotoURL: authorAvatar,
        content: clean,
        createdAt: nowIso
      });
      await updateDoc(doc(db, 'posts', post.id), {
        commentsCount: nextCount
      }).catch(() => {});

      setPaginatedComments((prev) =>
        prev.map((c) => (c.id === optimisticComment.id ? { ...c, id: docRef.id } : c))
      );

      if (post.authorId && post.authorId !== currentUser.uid) {
        sendNotification({
          recipientId: post.authorId,
          actorId: currentUser.uid,
          actorName: authorName,
          actorPhotoURL: authorAvatar,
          type: 'post_comment',
          title: 'New Comment on Your Wave 💬',
          body: `${authorName}: "${clean.slice(0, 80)}"`,
          entityId: post.id,
          actionUrl: 'feed'
        }).catch(() => {});
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        notifyQuotaExceeded(err);
      }
    } finally {
      setIsSending(false);
    }
  };

  if (!post) return null;

  const avatarUrl =
    creatorProfile?.photoURL ||
    post.authorPhotoURL ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(post.authorId || 'waver')}`;
  const creatorBio =
    creatorProfile?.bio ||
    (isSw
      ? 'Mbunifu wa WaveLink · Tazama na shiriki mawimbi mapya.'
      : 'WaveLink Creator · Sharing authentic moments and stories.');
  const isSelf = Boolean(currentUser?.uid && post.authorId === currentUser.uid);

  const renderPanelContent = (isSlideOver: boolean) => (
    <div className="flex flex-col h-full w-full bg-slate-950/92 text-white border-l border-white/15 select-none">
      {/* Top Panel Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-white/12 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle size={17} className="text-teal-400 shrink-0" />
          <h3 className="text-sm font-extrabold tracking-tight truncate">
            {isSw ? 'Maelezo na Maoni' : 'Creator & Comments'}
          </h3>
          <span className="text-xs font-mono tabular-nums text-white/60">
            · {(post.commentsCount ?? displayedComments.length).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSlideOver && (
            <button
              type="button"
              onClick={onToggleCollapseWide}
              title={isSw ? 'Ficha paneli' : 'Collapse panel'}
              aria-label="Collapse right panel"
              className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
            >
              <ChevronRight size={17} />
            </button>
          )}
          {isSlideOver && (
            <button
              type="button"
              onClick={onCloseDrawer}
              title={isSw ? 'Funga' : 'Close (Esc)'}
              aria-label="Close comments panel"
              className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Body: Creator Card + More from Creator + Comments List */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
        {/* 1. Creator Profile Card */}
        <div className="p-3.5 rounded-2xl bg-white/7 border border-white/14 space-y-3">
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onSelectCreatorProfile}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
            >
              <Avatar
                uid={post.authorId}
                src={avatarUrl}
                alt={post.authorName}
                fallbackName={post.authorName}
                size={44}
                showStatus={true}
                onlyWhenVisible={false}
                targetProfile={creatorProfile}
                className="ring-2 ring-teal-400/70 rounded-full group-hover:scale-105 transition-transform"
              />
              <div className="min-w-0">
                <div className="truncate">
                  <CrystalBadge
                    userId={post.authorId}
                    email={post.authorEmail}
                    name={post.authorName}
                    isPro={Boolean(creatorProfile?.isPro || creatorProfile?.hasBlueStar)}
                    hasBlueStar={Boolean(creatorProfile?.isPro || creatorProfile?.hasBlueStar)}
                    size="sm"
                  />
                </div>
                <p className="text-[11px] text-white/65 truncate">
                  {post.authorUsername || `@${(post.authorName || 'waver').toLowerCase().replace(/\s+/g, '')}`}
                </p>
              </div>
            </button>

            {!isSelf && (
              <button
                type="button"
                onClick={onToggleFollow}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 cursor-pointer ${
                  isFollowing
                    ? 'bg-white/14 text-white border border-white/25'
                    : 'bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white shadow-md'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck size={14} />
                    <span>{isSw ? 'Unafuata' : 'Following'}</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={14} />
                    <span>{isSw ? '+ Fuata' : '+ Follow'}</span>
                  </>
                )}
              </button>
            )}
          </div>

          <p className="text-xs text-white/80 leading-relaxed line-clamp-2">
            {creatorBio}
          </p>

          {/* More from this creator */}
          {moreCreatorPosts.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-white/70">
                <span>
                  {isSw ? `Zaidi kutoka kwa ${post.authorName}` : `More from ${post.authorName}`}
                </span>
                <span className="font-mono tabular-nums">{moreCreatorPosts.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {moreCreatorPosts.slice(0, 3).map((item) => {
                  const thumb =
                    item.thumbnailUrl ||
                    item.imageUrl ||
                    (item.imageUrls && item.imageUrls[0]) ||
                    '';
                  const isVid = Boolean(
                    item.videoUrl || item.hasVideoChunks || item.mediaType === 'video'
                  );
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectPost(item.id)}
                      className="relative aspect-[9/12] rounded-xl overflow-hidden bg-slate-900 border border-white/15 group cursor-pointer"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={item.content?.slice(0, 30) || 'Creator wave'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1.5 bg-gradient-to-br from-blue-900/60 to-teal-900/60 text-[10px] font-bold text-white/90 line-clamp-3">
                          {item.content?.slice(0, 40) || 'Wave'}
                        </div>
                      )}
                      <span className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-950/65 text-white">
                        {isVid ? <Film size={11} /> : <ImageIcon size={11} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. Comments Section for CURRENT Video */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-white/65">
              {isSw ? 'Maoni ya Wimbi Hili' : 'Comments on this Wave'}
            </span>
            {!hasLoadedFullPage && (post.commentsCount || 0) > displayedComments.length && (
              <button
                type="button"
                onClick={() => loadCommentsPage(20)}
                disabled={isLoadingMore}
                className="text-xs font-bold text-teal-300 hover:text-teal-200 cursor-pointer"
              >
                {isLoadingMore
                  ? isSw
                    ? 'Inapakia...'
                    : 'Loading...'
                  : isSw
                  ? 'Onyesha yote (20)'
                  : 'Load 20 comments'}
              </button>
            )}
          </div>

          {displayedComments.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <Sparkles size={22} className="mx-auto text-teal-400/80" />
              <p className="text-xs font-bold text-white/85">
                {isSw ? 'Kuwa wa kwanza kutoa maoni!' : 'Be the first to comment!'}
              </p>
              <p className="text-[11px] text-white/55">
                {isSw
                  ? 'Andika ujumbe mfupi hapa chini ili kuungana na mbunifu.'
                  : 'Share a kind thought below to start the conversation.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedComments.map((c) => {
                const cAvatar =
                  c.authorPhotoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
                    c.authorId || 'waver'
                  )}`;
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/7 border border-white/10"
                  >
                    <Avatar
                      uid={c.authorId}
                      src={cAvatar}
                      alt={c.authorName}
                      fallbackName={c.authorName}
                      size={32}
                      showStatus={true}
                      className="mt-0.5 ring-1 ring-white/25 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-white truncate">{c.authorName}</span>
                        <span aria-hidden="true" className="text-white/40">
                          ·
                        </span>
                        <span className="text-[11px] text-white/55 shrink-0 font-mono tabular-nums">
                          {formatShortRelativeTime(c.createdAt, isSw)}
                        </span>
                      </div>
                      <p className="text-xs text-white/90 leading-relaxed mt-0.5 break-words">
                        {c.content}
                      </p>
                    </div>
                  </div>
                );
              })}

              {(hasMoreComments || (!hasLoadedFullPage && (post.commentsCount || 0) > 3)) && (
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={() => loadCommentsPage(hasLoadedFullPage ? pageLimit + 20 : 20)}
                  className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-bold text-teal-300 transition cursor-pointer"
                >
                  {isLoadingMore
                    ? isSw
                      ? 'Inapakia maoni zaidi...'
                      : 'Loading more comments...'
                    : isSw
                    ? 'Pakia maoni 20 zaidi'
                    : 'Load more comments (20)'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Comment Input Bar */}
      <form
        onSubmit={handleSubmitComment}
        className="wavelink-reel-comment-bar p-3 border-t border-white/15 bg-slate-950/90 shrink-0 space-y-2"
      >
        {showEmojiRow && (
          <div className="flex items-center justify-between gap-1 px-1">
            {PANEL_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setCommentInput((prev) => `${prev}${em}`)}
                className="w-8 h-8 rounded-lg hover:bg-white/12 text-base flex items-center justify-center cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEmojiRow((v) => !v)}
            aria-label="Toggle emojis"
            className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full bg-white/10 hover:bg-white/18 text-white/80 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Smile size={18} />
          </button>
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder={isSw ? 'Ongeza maoni...' : 'Add a comment...'}
            className="flex-1 min-h-[40px] px-3.5 py-2 rounded-full bg-white/10 border border-white/20 text-xs text-white placeholder-white/55 focus:outline-none focus:border-teal-400"
          />
          <button
            type="submit"
            disabled={!commentInput.trim() || isSending}
            aria-label="Send comment"
            className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-transform active:scale-95 cursor-pointer"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {/* 1. Wide Desktop Inline Column (1440px+ shown by default unless user collapsed it) */}
      {!isCollapsedWide && (
        <aside
          aria-label="Creator and comments panel"
          className="wavelink-reel-desktop-panel-wide hidden min-[1440px]:flex w-[360px] shrink-0 h-full overflow-hidden"
        >
          {renderPanelContent(false)}
        </aside>
      )}

      {/* 2. Slide-over Drawer for Tablet (768-1023px), Desktop (1024-1439px), or Wide when collapsed */}
      {isOpenDrawer && (
        <div
          className="fixed inset-0 z-50 hidden md:flex justify-end bg-slate-950/55 animate-fade-in"
          onClick={onCloseDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] max-w-[90vw] h-[100dvh] shadow-2xl overflow-hidden"
          >
            {renderPanelContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
