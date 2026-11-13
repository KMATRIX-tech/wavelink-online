import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
import {
  X,
  Send,
  Smile,
  MessageCircle,
  CornerDownRight,
  Flag,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  db,
  getCachedUserProfile,
  fetchUserProfileCached,
  sanitizeAvatarUrlForFirestore,
  isFirestoreQuotaError,
  notifyQuotaExceeded
} from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { COMMUNITY_REPORT_CATEGORIES } from '../utils/africanCultureConfig';
import { sanitizeUserText } from '../utils/security';
import { sendNotification } from '../services/notificationService';
import { CrystalBadge } from './CrystalBadge';
import { Avatar } from './Avatar';
import type { Post, PostComment, CommentReactionType, UserProfile } from '../types';

interface CommentsSheetProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
  onCommentCountChange?: (postId: string, newCount: number) => void;
}

const QUICK_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🙌', '💯', '✨', '🎉', '🙏'];

function formatCommentRelativeTime(iso: string, language: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  if (diffSec < 60) return language === 'sw' ? 'Sasa hivi' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({
  post,
  isOpen,
  onClose,
  onCommentCountChange
}) => {
  const { currentUser, userProfile, isAdmin, reportContent } = useAuth();
  const { language } = useLanguage();

  const [serverComments, setServerComments] = useState<PostComment[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<PostComment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [visibleLimit, setVisibleLimit] = useState<number>(20);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [commentText, setCommentText] = useState<string>('');
  const [showEmojiStrip, setShowEmojiStrip] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [expandedThreadIds, setExpandedThreadIds] = useState<Record<string, boolean>>({});
  const [expandedTextIds, setExpandedTextIds] = useState<Record<string, boolean>>({});

  // Cached user profiles map for avatars and names
  const [cachedProfiles, setCachedProfiles] = useState<Record<string, UserProfile>>({});

  // UGC Comment Report modal state
  const [reportingComment, setReportingComment] = useState<PostComment | null>(null);
  const [selectedReportCategory, setSelectedReportCategory] = useState<string>(
    COMMUNITY_REPORT_CATEGORIES[0]?.id || 'spam_misleading'
  );
  const [reportNote, setReportNote] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [sheetToast, setSheetToast] = useState<string | null>(null);

  // Mobile swipe-down drag state
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartYRef = useRef<number | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const triggerSheetToast = useCallback((msg: string) => {
    setSheetToast(msg);
    setTimeout(() => {
      setSheetToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // Reset per-post state when post changes or sheet opens
  useEffect(() => {
    if (!isOpen || !post?.id) {
      setDragOffsetY(0);
      setIsDragging(false);
      setShowEmojiStrip(false);
      setReplyingTo(null);
      setReportingComment(null);
      return;
    }
    setVisibleLimit(20);
    setOptimisticComments([]);
  }, [isOpen, post?.id]);

  // Body scroll lock, bottom-nav hide signal, visualViewport keyboard tracking & Escape / Focus trap while sheet is open
  useEffect(() => {
    if (!isOpen || !post) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-bottom-sheet-open', 'true');
    window.dispatchEvent(
      new CustomEvent('wavelink:bottom-sheet-state', { detail: { open: true } })
    );

    const updateSheetViewport = () => {
      if (typeof window === 'undefined') return;
      const vv = window.visualViewport;
      const vvHeight = vv ? vv.height : window.innerHeight;
      const vvOffsetTop = vv ? vv.offsetTop : 0;
      const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
      const kbOffset = Math.max(0, Math.round(layoutHeight - vvHeight - vvOffsetTop));

      document.documentElement.style.setProperty('--vv-height', `${Math.round(vvHeight)}px`);
      document.documentElement.style.setProperty('--vv-offset-top', `${Math.round(vvOffsetTop)}px`);
      document.documentElement.style.setProperty('--kb-offset', `${kbOffset}px`);
      document.documentElement.style.setProperty('--comments-kb-offset', `${kbOffset}px`);

      if (window.innerWidth < 768) {
        const isKbOpen = kbOffset > 65 || (document.activeElement === inputRef.current && kbOffset > 20);
        document.documentElement.setAttribute('data-keyboard-open', isKbOpen ? 'true' : 'false');
      }
    };

    updateSheetViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateSheetViewport);
    vv?.addEventListener('scroll', updateSheetViewport);
    window.addEventListener('resize', updateSheetViewport);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (reportingComment) {
          setReportingComment(null);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.removeAttribute('data-bottom-sheet-open');
      document.documentElement.style.removeProperty('--comments-kb-offset');
      window.dispatchEvent(
        new CustomEvent('wavelink:bottom-sheet-state', { detail: { open: false } })
      );
      vv?.removeEventListener('resize', updateSheetViewport);
      vv?.removeEventListener('scroll', updateSheetViewport);
      window.removeEventListener('resize', updateSheetViewport);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, post, reportingComment, onClose]);

  // Attach Firestore real-time listener ONLY for the currently open comment sheet, detach on close
  useEffect(() => {
    if (!isOpen || !post?.id || post.isSponsored) {
      setServerComments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const commentsRef = collection(db, 'posts', post.id, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(visibleLimit));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: PostComment[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data(), clientStatus: 'sent' } as PostComment);
        });
        // Reverse so chronological threads read naturally while fetching the latest `visibleLimit` first
        setServerComments(list);
        setHasMore(snap.docs.length >= visibleLimit);
        setIsLoading(false);

        // Remove any optimistic comment that now exists on the server
        setOptimisticComments((prev) =>
          prev.filter(
            (opt) =>
              opt.clientStatus === 'failed' ||
              !list.some(
                (srv) =>
                  srv.id === opt.id ||
                  (srv.authorId === opt.authorId &&
                    srv.content === opt.content &&
                    Math.abs(new Date(srv.createdAt).getTime() - new Date(opt.createdAt).getTime()) < 15000)
              )
          )
        );
      },
      (err) => {
        if (isFirestoreQuotaError(err)) {
          notifyQuotaExceeded(err);
        }
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen, post?.id, post?.isSponsored, visibleLimit]);

  // Resolve and cache user profiles in memory so each author profile is fetched at most once
  useEffect(() => {
    if (!isOpen || serverComments.length === 0) return;
    const uniqueAuthorIds = Array.from(
      new Set(serverComments.map((c) => c.authorId).filter(Boolean))
    );

    uniqueAuthorIds.forEach((uid) => {
      const memCached = getCachedUserProfile(uid);
      if (memCached) {
        setCachedProfiles((prev) => (prev[uid] ? prev : { ...prev, [uid]: memCached }));
        return;
      }
      fetchUserProfileCached(uid).then((prof) => {
        if (prof) {
          setCachedProfiles((prev) => (prev[uid] ? prev : { ...prev, [uid]: prof }));
        }
      });
    });
  }, [isOpen, serverComments]);

  // Combine server comments and pending/failed optimistic comments
  const allComments = useMemo(() => {
    const map = new Map<string, PostComment>();
    serverComments.forEach((c) => map.set(c.id, c));
    optimisticComments.forEach((opt) => {
      if (!map.has(opt.id)) {
        map.set(opt.id, opt);
      }
    });
    return Array.from(map.values());
  }, [serverComments, optimisticComments]);

  // Separate top-level comments (newest first) and replies grouped by parentId (oldest first)
  const { rootComments, repliesByParentId } = useMemo(() => {
    const roots: PostComment[] = [];
    const byParent: Record<string, PostComment[]> = {};

    allComments.forEach((c) => {
      if (c.parentId) {
        if (!byParent[c.parentId]) byParent[c.parentId] = [];
        byParent[c.parentId].push(c);
      } else {
        roots.push(c);
      }
    });

    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    Object.values(byParent).forEach((arr) =>
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );

    return { rootComments: roots, repliesByParentId: byParent };
  }, [allComments]);

  const totalDisplayedCount = Math.max(post?.commentsCount || 0, allComments.length);

  // Send or Retry Comment with instant optimistic state
  const submitCommentPayload = async (
    rawContent: string,
    parentComment: PostComment | null,
    existingTempId?: string
  ) => {
    if (!currentUser || !post) return;
    const cleanText = sanitizeUserText(rawContent, 1000);
    if (!cleanText) return;

    const tempId = existingTempId || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authorName = userProfile?.displayName || currentUser.displayName || 'Waver';
    const authorUsername =
      userProfile?.username || `@${currentUser.email ? currentUser.email.split('@')[0] : 'waver'}`;
    const authorPhotoURL = sanitizeAvatarUrlForFirestore(
      userProfile?.photoURL || currentUser.photoURL,
      currentUser.uid
    );
    const nowIso = new Date().toISOString();

    const optimisticItem: PostComment = {
      id: tempId,
      postId: post.id,
      authorId: currentUser.uid,
      authorEmail: currentUser.email || '',
      authorName,
      authorUsername,
      authorPhotoURL,
      content: cleanText,
      createdAt: nowIso,
      parentId: parentComment ? parentComment.parentId || parentComment.id : null,
      replyToName: parentComment ? parentComment.authorName : null,
      reactions: { heart: [], laugh: [], wow: [] },
      reactionCounts: { heart: 0, laugh: 0, wow: 0 },
      clientStatus: 'sending'
    };

    // Show optimistic comment immediately
    setOptimisticComments((prev) => {
      const filtered = prev.filter((item) => item.id !== tempId);
      return [optimisticItem, ...filtered];
    });

    if (parentComment) {
      const threadRootId = parentComment.parentId || parentComment.id;
      setExpandedThreadIds((prev) => ({ ...prev, [threadRootId]: true }));
    }

    const nextCount = Math.max((post.commentsCount || 0) + 1, allComments.length + 1);
    if (onCommentCountChange) {
      onCommentCountChange(post.id, nextCount);
    }

    try {
      const firestorePayload: Record<string, any> = {
        postId: post.id,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName,
        authorUsername,
        authorPhotoURL,
        content: cleanText,
        createdAt: nowIso,
        reactions: { heart: [], laugh: [], wow: [] },
        reactionCounts: { heart: 0, laugh: 0, wow: 0 }
      };
      if (optimisticItem.parentId) {
        firestorePayload.parentId = optimisticItem.parentId;
      }
      if (optimisticItem.replyToName) {
        firestorePayload.replyToName = optimisticItem.replyToName;
      }

      await addDoc(collection(db, 'posts', post.id, 'comments'), firestorePayload);
      await updateDoc(doc(db, 'posts', post.id), {
        commentsCount: nextCount
      }).catch(() => {});

      // Mark optimistic item as sent until snapshot reconciles it
      setOptimisticComments((prev) =>
        prev.map((item) => (item.id === tempId ? { ...item, clientStatus: 'sent' } : item))
      );

      // Notify post author or parent comment author
      const targetRecipientId = parentComment?.authorId || post.authorId;
      if (targetRecipientId && targetRecipientId !== currentUser.uid) {
        sendNotification({
          recipientId: targetRecipientId,
          type: parentComment ? 'post_reply' : 'post_comment',
          title: parentComment ? 'New Reply to Your Comment 💬' : 'New Comment on Your Wave 💬',
          body: `${authorName}: "${cleanText.slice(0, 60)}${cleanText.length > 60 ? '...' : ''}"`,
          entityId: post.id,
          actorId: currentUser.uid,
          actorName: authorName,
          actorPhotoURL: authorPhotoURL
        });
      }
    } catch (err) {
      console.warn('Comment send failed:', err);
      // Roll back count & mark failed with Retry option
      if (onCommentCountChange) {
        onCommentCountChange(post.id, Math.max(0, nextCount - 1));
      }
      setOptimisticComments((prev) =>
        prev.map((item) => (item.id === tempId ? { ...item, clientStatus: 'failed' } : item))
      );
      triggerSheetToast(
        language === 'sw'
          ? 'Imeshindwa kutuma maoni. Gusa Jaribu Tena.'
          : 'Failed to send comment. Tap Retry.'
      );
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !currentUser || !post) return;
    const textToSend = commentText;
    const parentToUse = replyingTo;
    setCommentText('');
    setReplyingTo(null);
    setShowEmojiStrip(false);
    await submitCommentPayload(textToSend, parentToUse);
  };

  const handleDiscardFailedComment = (tempId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
  };

  // Toggle quick reaction chip (heart ❤️, laugh 😂, wow 😮) on a comment
  const handleToggleCommentReaction = async (
    comment: PostComment,
    reactionType: CommentReactionType
  ) => {
    if (!currentUser || !post || comment.id.startsWith('temp_')) return;
    const uid = currentUser.uid;
    const currentHeart = comment.reactions?.heart || [];
    const currentLaugh = comment.reactions?.laugh || [];
    const currentWow = comment.reactions?.wow || [];

    const currentList =
      reactionType === 'heart'
        ? currentHeart
        : reactionType === 'laugh'
        ? currentLaugh
        : currentWow;
    const isActive = currentList.includes(uid);

    const nextHeart =
      reactionType === 'heart'
        ? isActive
          ? currentHeart.filter((id) => id !== uid)
          : [...currentHeart, uid]
        : currentHeart;
    const nextLaugh =
      reactionType === 'laugh'
        ? isActive
          ? currentLaugh.filter((id) => id !== uid)
          : [...currentLaugh, uid]
        : currentLaugh;
    const nextWow =
      reactionType === 'wow'
        ? isActive
          ? currentWow.filter((id) => id !== uid)
          : [...currentWow, uid]
        : currentWow;

    const updatedReactions = {
      heart: nextHeart,
      laugh: nextLaugh,
      wow: nextWow
    };
    const updatedCounts = {
      heart: nextHeart.length,
      laugh: nextLaugh.length,
      wow: nextWow.length
    };

    // Optimistic local state update
    setServerComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? { ...c, reactions: updatedReactions, reactionCounts: updatedCounts }
          : c
      )
    );

    try {
      await updateDoc(doc(db, 'posts', post.id, 'comments', comment.id), {
        reactions: updatedReactions,
        reactionCounts: updatedCounts,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Comment reaction update notice:', err);
    }
  };

  const handleDeleteComment = async (comment: PostComment) => {
    if (!currentUser || !post) return;
    if (comment.id.startsWith('temp_')) {
      handleDiscardFailedComment(comment.id);
      return;
    }
    try {
      await deleteDoc(doc(db, 'posts', post.id, 'comments', comment.id));
      const nextCount = Math.max(0, totalDisplayedCount - 1);
      await updateDoc(doc(db, 'posts', post.id), {
        commentsCount: nextCount
      }).catch(() => {});
      if (onCommentCountChange) {
        onCommentCountChange(post.id, nextCount);
      }
      triggerSheetToast(language === 'sw' ? 'Maoni yamefutwa' : 'Comment deleted');
    } catch (err) {
      console.warn('Failed to delete comment:', err);
    }
  };

  // Scroll pagination handler
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !isLoading && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      setVisibleLimit((prev) => prev + 20);
    }
  };

  // Mobile touch drag-to-close handlers on header/handle
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 1024) return;
    touchStartYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null || window.innerWidth >= 1024) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY > 0) {
      setDragOffsetY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (window.innerWidth >= 1024) return;
    setIsDragging(false);
    touchStartYRef.current = null;
    if (dragOffsetY > 75) {
      setDragOffsetY(0);
      onClose();
    } else {
      setDragOffsetY(0);
    }
  };

  if (!isOpen || !post) return null;

  const renderCommentItem = (comment: PostComment, isReply = false) => {
    const cachedAuthor = cachedProfiles[comment.authorId] || getCachedUserProfile(comment.authorId);
    const displayName = cachedAuthor?.displayName || comment.authorName || 'Waver';
    const avatarUrl =
      cachedAuthor?.photoURL ||
      comment.authorPhotoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${comment.authorId}`;

    const isLongText = (comment.content?.length || 0) > 160;
    const isTextExpanded = Boolean(expandedTextIds[comment.id]);
    const displayedText =
      isLongText && !isTextExpanded ? `${comment.content.slice(0, 160)}…` : comment.content;

    const uid = currentUser?.uid || '';
    const heartUsers = comment.reactions?.heart || [];
    const laughUsers = comment.reactions?.laugh || [];
    const wowUsers = comment.reactions?.wow || [];

    const heartCount = comment.reactionCounts?.heart ?? heartUsers.length;
    const laughCount = comment.reactionCounts?.laugh ?? laughUsers.length;
    const wowCount = comment.reactionCounts?.wow ?? wowUsers.length;

    const isHeartActive = Boolean(uid && heartUsers.includes(uid));
    const isLaughActive = Boolean(uid && laughUsers.includes(uid));
    const isWowActive = Boolean(uid && wowUsers.includes(uid));

    const canDelete = Boolean(
      currentUser && (comment.authorId === currentUser.uid || isAdmin)
    );

    const replies = !isReply ? repliesByParentId[comment.id] || [] : [];
    const isThreadExpanded = Boolean(expandedThreadIds[comment.id]);

    return (
      <div
        key={comment.id}
        className={`${isReply ? 'ml-9 mt-2.5 pl-3 border-l-2 border-[var(--border-hairline)]' : 'py-2'}`}
      >
        <div className="flex items-start gap-2.5">
          <Avatar
            uid={comment.authorId}
            src={avatarUrl}
            alt={displayName}
            fallbackName={displayName}
            size={isReply ? 28 : 32}
            showStatus={true}
            className="shrink-0 mt-0.5"
          />

          <div className="flex-1 min-w-0">
            {/* Soft rounded card for the comment text */}
            <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] px-3.5 py-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CrystalBadge
                    email={comment.authorEmail}
                    name={displayName}
                    size="sm"
                  />
                  {comment.replyToName && (
                    <span className="text-[11px] font-semibold text-[var(--accent-primary)] truncate">
                      → @{comment.replyToName}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono tabular-nums shrink-0">
                  {comment.clientStatus === 'sending'
                    ? language === 'sw'
                      ? 'Inatuma...'
                      : 'Sending...'
                    : formatCommentRelativeTime(comment.createdAt, language)}
                </span>
              </div>

              <p className="text-xs sm:text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                {displayedText}
              </p>

              {isLongText && (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedTextIds((prev) => ({
                      ...prev,
                      [comment.id]: !isTextExpanded
                    }))
                  }
                  className="mt-1 text-[11px] font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  {isTextExpanded
                    ? language === 'sw'
                      ? 'Onyesha kidogo'
                      : 'Show less'
                    : language === 'sw'
                    ? 'Onyesha zaidi'
                    : 'Show more'}
                </button>
              )}
            </div>

            {/* Optimistic Failed Retry Row */}
            {comment.clientStatus === 'failed' && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-rose-500 font-bold">
                <AlertCircle size={13} />
                <span>{language === 'sw' ? 'Imeshindwa kutuma' : 'Could not send'}</span>
                <button
                  type="button"
                  onClick={() =>
                    submitCommentPayload(
                      comment.content,
                      comment.parentId
                        ? ({
                            id: comment.parentId,
                            authorName: comment.replyToName || 'Waver'
                          } as PostComment)
                        : null,
                      comment.id
                    )
                  }
                  className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-extrabold cursor-pointer"
                >
                  {language === 'sw' ? 'Jaribu tena' : 'Retry'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscardFailedComment(comment.id)}
                  className="text-[var(--text-secondary)] hover:underline cursor-pointer"
                >
                  {language === 'sw' ? 'Ondoa' : 'Dismiss'}
                </button>
              </div>
            )}

            {/* Quick Reaction Chips (heart, laugh, wow with counts) + Reply + Report/Delete */}
            <div className="mt-1.5 flex items-center flex-wrap gap-1.5 px-1">
              {/* Heart chip */}
              <button
                type="button"
                onClick={() => handleToggleCommentReaction(comment, 'heart')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition active:scale-95 cursor-pointer border ${
                  isHeartActive
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/35'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
                aria-label="React with heart"
              >
                <span>❤️</span>
                {heartCount > 0 && <span className="tabular-nums">{heartCount}</span>}
              </button>

              {/* Laugh chip */}
              <button
                type="button"
                onClick={() => handleToggleCommentReaction(comment, 'laugh')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition active:scale-95 cursor-pointer border ${
                  isLaughActive
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/35'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
                aria-label="React with laugh"
              >
                <span>😂</span>
                {laughCount > 0 && <span className="tabular-nums">{laughCount}</span>}
              </button>

              {/* Wow chip */}
              <button
                type="button"
                onClick={() => handleToggleCommentReaction(comment, 'wow')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition active:scale-95 cursor-pointer border ${
                  isWowActive
                    ? 'bg-sky-500/15 text-sky-500 border-sky-500/35'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
                aria-label="React with wow"
              >
                <span>😮</span>
                {wowCount > 0 && <span className="tabular-nums">{wowCount}</span>}
              </button>

              {/* Reply button */}
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(comment);
                  setTimeout(() => inputRef.current?.focus(), 40);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition cursor-pointer"
              >
                <CornerDownRight size={12} />
                <span>{language === 'sw' ? 'Jibu' : 'Reply'}</span>
              </button>

              {/* Report comment button (Google Play UGC requirement) */}
              {currentUser && comment.authorId !== currentUser.uid && (
                <button
                  type="button"
                  onClick={() => {
                    setReportingComment(comment);
                    setReportNote('');
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] text-[var(--text-secondary)] hover:text-amber-500 transition cursor-pointer ml-auto"
                  title={language === 'sw' ? 'Ripoti maoni' : 'Report comment'}
                  aria-label="Report comment"
                >
                  <Flag size={11} />
                </button>
              )}

              {/* Delete comment button for author or admin */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteComment(comment)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] text-[var(--text-secondary)] hover:text-rose-500 transition cursor-pointer ml-auto"
                  title={language === 'sw' ? 'Futa maoni' : 'Delete comment'}
                  aria-label="Delete comment"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>

            {/* Expandable Threaded Replies ("View N replies") */}
            {!isReply && replies.length > 0 && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedThreadIds((prev) => ({
                      ...prev,
                      [comment.id]: !isThreadExpanded
                    }))
                  }
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-[11px] font-extrabold text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                >
                  <span className="w-4 h-[1.5px] bg-[var(--accent-primary)]/50 rounded-full" />
                  {isThreadExpanded ? (
                    <>
                      <span>
                        {language === 'sw' ? 'Ficha majibu' : 'Hide replies'}
                      </span>
                      <ChevronUp size={12} />
                    </>
                  ) : (
                    <>
                      <span>
                        {language === 'sw'
                          ? `Tazama majibu ${replies.length}`
                          : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                      </span>
                      <ChevronDown size={12} />
                    </>
                  )}
                </button>

                {isThreadExpanded && (
                  <div className="space-y-1">
                    {replies.map((replyItem) => renderCommentItem(replyItem, true))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="wavelink-comments-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={language === 'sw' ? 'Maoni' : 'Comments'}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={
          dragOffsetY > 0
            ? {
                transform: `translate3d(0, ${dragOffsetY}px, 0)`,
                transition: isDragging ? 'none' : undefined
              }
            : undefined
        }
        className="wavelink-comments-sheet"
      >
        {/* Drag Handle + Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="wavelink-sheet-drag-zone px-4 pt-1 pb-3 border-b border-[var(--border-hairline)] shrink-0"
        >
          <div className="wavelink-sheet-drag-handle" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-[var(--accent-primary)]" />
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Maoni' : 'Comments'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-extrabold font-mono tabular-nums bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                {totalDisplayedCount}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'sw' ? 'Funga maoni' : 'Close comments'}
              className="w-8 h-8 rounded-full bg-[var(--bg-subtle)] hover:opacity-85 text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition cursor-pointer border border-[var(--border-hairline)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toast inside Sheet */}
        {sheetToast && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-bold flex items-center gap-2 shrink-0">
            <Check size={14} />
            <span>{sheetToast}</span>
          </div>
        )}

        {/* Scrollable Comments List */}
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2"
        >
          {isLoading ? (
            <div className="space-y-3 py-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-subtle)] shrink-0" />
                  <div className="flex-1 rounded-2xl bg-[var(--bg-subtle)] p-3 space-y-2">
                    <div className="h-3 w-28 rounded bg-[var(--border-hairline)]" />
                    <div className="h-3 w-full rounded bg-[var(--border-hairline)]" />
                    <div className="h-3 w-2/3 rounded bg-[var(--border-hairline)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : rootComments.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--accent-primary)]">
                <MessageCircle size={22} />
              </div>
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Kuwa wa kwanza kutoa maoni' : 'Be the first to comment'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-xs">
                {language === 'sw'
                  ? 'Anzisha mazungumzo kuhusu chapisho hili hapa chini.'
                  : 'Start the conversation on this wave below.'}
              </p>
            </div>
          ) : (
            <>
              {rootComments.map((comment) => renderCommentItem(comment, false))}

              {hasMore && (
                <div className="pt-2 pb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 20)}
                    className="px-4 py-2 rounded-full bg-[var(--bg-subtle)] hover:opacity-90 border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    <span>{language === 'sw' ? 'Pakia maoni zaidi' : 'Load more comments'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Input Footer at the bottom of the sheet */}
        <div className="wavelink-comments-input-footer shrink-0">
          {post.allowComments === false ? (
            <p className="text-xs text-[var(--text-secondary)] italic text-center py-2">
              {language === 'sw'
                ? 'Maoni yamezimwa kwenye chapisho hili.'
                : 'Comments are turned off for this post.'}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Replying to indicator banner */}
              {replyingTo && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs">
                  <span className="text-[var(--text-secondary)] truncate">
                    {language === 'sw' ? 'Unamjibu ' : 'Replying to '}
                    <strong className="text-[var(--accent-primary)] font-extrabold">
                      @{replyingTo.authorName}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-0.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    aria-label="Cancel reply"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Quick Emoji Picker Strip */}
              {showEmojiStrip && (
                <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] overflow-x-auto">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setCommentText((prev) => `${prev}${emoji}`);
                        inputRef.current?.focus();
                      }}
                      className="w-8 h-8 rounded-xl hover:bg-[var(--bg-surface)] flex items-center justify-center text-base transition active:scale-90 cursor-pointer shrink-0"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Row */}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmojiStrip((prev) => !prev)}
                  aria-label="Toggle emojis"
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition shrink-0 cursor-pointer border ${
                    showEmojiStrip
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Smile size={18} />
                </button>

                <div
                  onClick={() => inputRef.current?.focus()}
                  className="flex-1 min-w-0 cursor-text"
                >
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onFocus={() => {
                      document.documentElement.setAttribute('data-input-focused', 'true');
                      window.dispatchEvent(
                        new CustomEvent('wavelink:chat-input-focus', {
                          detail: { focused: true }
                        })
                      );
                      window.setTimeout(() => {
                        window.visualViewport?.dispatchEvent(new Event('resize'));
                      }, 80);
                    }}
                    onBlur={() => {
                      document.documentElement.removeAttribute('data-input-focused');
                      window.dispatchEvent(
                        new CustomEvent('wavelink:chat-input-focus', {
                          detail: { focused: false }
                        })
                      );
                      window.setTimeout(() => {
                        window.visualViewport?.dispatchEvent(new Event('resize'));
                      }, 80);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendComment();
                      }
                    }}
                    placeholder={
                      replyingTo
                        ? language === 'sw'
                          ? `Andika jibu kwa ${replyingTo.authorName}...`
                          : `Reply to ${replyingTo.authorName}...`
                        : language === 'sw'
                        ? 'Andika maoni...'
                        : 'Add a comment...'
                    }
                    className="wavelink-comments-textarea w-full min-h-[44px] max-h-24 py-2.5 px-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-primary)] resize-none leading-snug block"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendComment}
                  disabled={!commentText.trim()}
                  aria-label={language === 'sw' ? 'Tuma maoni' : 'Send comment'}
                  style={
                    commentText.trim()
                      ? {
                          background:
                            'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                        }
                      : undefined
                  }
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                    commentText.trim()
                      ? 'text-white shadow-md active:scale-95'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] opacity-50 cursor-not-allowed border border-[var(--border-hairline)]'
                  }`}
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Google Play UGC Comment Report Sub-Modal */}
        {reportingComment && (
          <div
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setReportingComment(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
                    <Flag size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
                      {language === 'sw' ? 'Ripoti Maoni' : 'Report Comment'}
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate max-w-[200px]">
                      @{reportingComment.authorName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReportingComment(null)}
                  className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {COMMUNITY_REPORT_CATEGORIES.map((cat) => {
                  const selected = selectedReportCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedReportCategory(cat.id)}
                      className={`w-full p-2.5 rounded-2xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500 text-[var(--text-primary)]'
                          : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold">
                          {language === 'sw' ? cat.labelSw : cat.labelEn}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate">
                          {language === 'sw' ? cat.descSw : cat.descEn}
                        </div>
                      </div>
                      {selected && <Check size={14} className="text-amber-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={2}
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                placeholder={
                  language === 'sw' ? 'Maelezo ya ziada (hiari)...' : 'Additional details (optional)...'
                }
                className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] resize-none"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportingComment(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
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
                        targetType: 'comment',
                        targetId: reportingComment.id,
                        targetAuthorId: reportingComment.authorId,
                        targetSummary: `${reportingComment.authorName}: ${reportingComment.content.slice(0, 80)}`,
                        reason: `${chosen.labelEn}${reportNote.trim() ? `: ${reportNote.trim()}` : ''}`
                      });
                      setReportingComment(null);
                      triggerSheetToast(
                        language === 'sw'
                          ? 'Ripoti imetumwa. Asante kwa kulinda jamii!'
                          : 'Report submitted. Thank you for keeping WaveLink safe!'
                      );
                    } finally {
                      setIsSubmittingReport(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold cursor-pointer"
                >
                  {isSubmittingReport
                    ? language === 'sw'
                      ? 'Inatuma...'
                      : 'Sending...'
                    : language === 'sw'
                    ? 'Tuma Ripoti'
                    : 'Submit Report'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
