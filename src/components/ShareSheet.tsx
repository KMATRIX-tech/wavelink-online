import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  limit,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  arrayUnion
} from 'firebase/firestore';
import {
  X,
  Share2,
  Copy,
  Check,
  Download,
  Flag,
  Send,
  MoreHorizontal,
  MessageSquare
} from 'lucide-react';
import {
  db,
  getAuthHeaders,
  batchCacheUserProfiles,
  sanitizeAvatarUrlForFirestore,
  isFirestoreQuotaError,
  notifyQuotaExceeded
} from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { COMMUNITY_REPORT_CATEGORIES } from '../utils/africanCultureConfig';
import { sendNotification } from '../services/notificationService';
import { Avatar } from './Avatar';
import {
  getPostShareUrl,
  sharePostToPlatform,
  downloadPost
} from '../utils/share.js';
import type { Post, UserProfile } from '../types';

interface ShareSheetProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
  onShareCountChange?: (postId: string, newCount: number) => void;
}

type SharePlatformId =
  | 'whatsapp'
  | 'telegram'
  | 'facebook'
  | 'x'
  | 'messenger'
  | 'instagram'
  | 'reddit'
  | 'sms'
  | 'more';

interface SharePlatformOption {
  id: SharePlatformId;
  label: string;
  bgStyle: string;
  renderIcon: () => React.ReactNode;
}

const SHARE_PLATFORMS: SharePlatformOption[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    bgStyle: '#25D366',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    )
  },
  {
    id: 'telegram',
    label: 'Telegram',
    bgStyle: '#229ED9',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2L11 13" />
        <path d="M22 2L15 22L11 13L2 9L22 2Z" />
      </svg>
    )
  },
  {
    id: 'facebook',
    label: 'Facebook',
    bgStyle: '#1877F2',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
        <path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V6.65c0-1.05.29-1.73 1.76-1.73Z" />
      </svg>
    )
  },
  {
    id: 'x',
    label: 'X',
    bgStyle: '#0F172A',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  },
  {
    id: 'messenger',
    label: 'Messenger',
    bgStyle: '#0084FF',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.48 2 2 6.14 2 11.25c0 2.88 1.44 5.45 3.69 7.14V22l3.48-1.91c.91.25 1.86.39 2.83.39 5.52 0 10-4.14 10-9.25S17.52 2 12 2z" />
        <polyline points="7.5 13.5 11 10 13.5 12.5 17 9" />
      </svg>
    )
  },
  {
    id: 'instagram',
    label: 'Instagram',
    bgStyle: 'linear-gradient(135deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    )
  },
  {
    id: 'reddit',
    label: 'Reddit',
    bgStyle: '#FF4500',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="7" />
        <circle cx="9.5" cy="12" r="1" fill="currentColor" />
        <circle cx="14.5" cy="12" r="1" fill="currentColor" />
        <path d="M9.5 15.5c1.2 1 3.8 1 5 0" />
        <path d="M12 6l2-3 3 1" />
      </svg>
    )
  },
  {
    id: 'sms',
    label: 'SMS',
    bgStyle: '#10B981',
    renderIcon: () => <MessageSquare size={20} />
  },
  {
    id: 'more',
    label: 'More',
    bgStyle: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
    renderIcon: () => <MoreHorizontal size={21} />
  }
];

export const ShareSheet: React.FC<ShareSheetProps> = ({
  post,
  isOpen,
  onClose,
  onShareCountChange
}) => {
  const { currentUser, userProfile, reportContent } = useAuth();
  const { language } = useLanguage();

  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [recentContacts, setRecentContacts] = useState<UserProfile[]>([]);
  const [sentToUserIds, setSentToUserIds] = useState<Record<string, boolean>>({});
  const [sendingToUserId, setSendingToUserId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [sheetToast, setSheetToast] = useState<string | null>(null);

  // UGC Video / Post Report view state
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [selectedReportCategory, setSelectedReportCategory] = useState<string>(
    COMMUNITY_REPORT_CATEGORIES[0]?.id || 'spam_misleading'
  );
  const [reportNote, setReportNote] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // Mobile swipe-down drag state
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setSheetToast(msg);
    setTimeout(() => {
      setSheetToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // Reset state when opening for a post
  useEffect(() => {
    if (!isOpen || !post) {
      setCopiedLink(false);
      setSentToUserIds({});
      setShowReportModal(false);
      setDragOffsetY(0);
      setIsDragging(false);
      return;
    }
  }, [isOpen, post?.id]);

  // Lock body scroll and trap Tab focus + Escape key
  useEffect(() => {
    if (!isOpen || !post) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showReportModal) {
          setShowReportModal(false);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    document.documentElement.setAttribute('data-bottom-sheet-open', 'true');
    window.dispatchEvent(
      new CustomEvent('wavelink:bottom-sheet-state', { detail: { open: true } })
    );
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.removeAttribute('data-bottom-sheet-open');
      window.dispatchEvent(
        new CustomEvent('wavelink:bottom-sheet-state', { detail: { open: false } })
      );
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, post, showReportModal, onClose]);

  // Load recent chat contacts for "Send to a friend" row (read once per session/open)
  useEffect(() => {
    if (!isOpen || !currentUser?.uid || recentContacts.length > 0) return;
    let mounted = true;
    const fetchFriends = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), limit(12)));
        if (!mounted) return;
        const list: UserProfile[] = [];
        snap.forEach((docSnap) => {
          const u = { ...(docSnap.data() as UserProfile), id: docSnap.id };
          if (u.id !== currentUser.uid && !u.isBanned) {
            list.push(u);
          }
        });
        batchCacheUserProfiles(list);
        setRecentContacts(list.slice(0, 8));
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          notifyQuotaExceeded(err);
        }
      }
    };
    fetchFriends();
    return () => {
      mounted = false;
    };
  }, [isOpen, currentUser?.uid, recentContacts.length]);

  // Increment post share count immediately (optimistic + Firestore)
  const recordPostShare = useCallback(async () => {
    if (!post || post.isSponsored || !post.id) return;
    const nextCount = (post.sharesCount || 0) + 1;
    if (onShareCountChange) {
      onShareCountChange(post.id, nextCount);
    }

    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        sharedBy: arrayUnion(currentUser.uid),
        sharesCount: nextCount
      });
      getAuthHeaders()
        .then((headers) =>
          fetch('/api/challenges/record-share', {
            method: 'POST',
            headers,
            body: JSON.stringify({ postId: post.id })
          })
        )
        .catch(() => {});
    } catch {
      // non-fatal if offline
    }
  }, [post, currentUser, onShareCountChange]);

  const handlePlatformClick = async (platform: SharePlatformId) => {
    if (!post) return;
    try {
      const res = await sharePostToPlatform(platform, post);
      if (res?.method !== 'cancelled') {
        await recordPostShare();
        if (res?.copiedFallback) {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
          triggerToast(
            language === 'sw'
              ? 'Kiungo kimenakiliwa! Bandika kwenye programu.'
              : 'Link copied! Paste in app to share.'
          );
        } else {
          triggerToast(language === 'sw' ? 'Imeshirikiwa!' : 'Shared!');
        }
      }
    } catch (err: any) {
      triggerToast(err?.message || (language === 'sw' ? 'Imeshindwa kushiriki' : 'Could not share'));
    }
  };

  const handleCopyLink = async () => {
    if (!post) return;
    const shareUrl = getPostShareUrl(post);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      await recordPostShare();
    } catch {
      triggerToast(language === 'sw' ? 'Imeshindwa kunakili kiungo' : 'Could not copy link');
    }
  };

  // Send post link directly to a friend's DM conversation
  const handleSendToFriend = async (friend: UserProfile) => {
    if (!currentUser || !post || sendingToUserId || sentToUserIds[friend.id]) return;
    setSendingToUserId(friend.id);
    try {
      const sortedIds = [currentUser.uid, friend.id].sort();
      const dmChannelId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
      const shareUrl = getPostShareUrl(post);
      const senderName = userProfile?.displayName || currentUser.displayName || 'Waver';
      const senderPhotoURL = sanitizeAvatarUrlForFirestore(
        userProfile?.photoURL || currentUser.photoURL,
        currentUser.uid
      );
      const snippet = post.content ? post.content.trim().slice(0, 80) : 'Check out this wave!';
      const messageText = `🌊 Shared a wave by @${post.authorName}:\n"${snippet}"\n${shareUrl}`;
      const nowIso = new Date().toISOString();

      await addDoc(collection(db, 'channels', dmChannelId, 'messages'), {
        channelId: dmChannelId,
        conversationId: dmChannelId,
        senderId: currentUser.uid,
        receiverId: friend.id,
        participants: sortedIds,
        senderEmail: currentUser.email || '',
        senderName,
        senderPhotoURL,
        text: messageText,
        mediaType: 'none',
        readBy: [currentUser.uid],
        createdAt: nowIso
      });

      await setDoc(
        doc(db, 'channels', dmChannelId),
        {
          id: dmChannelId,
          conversationId: dmChannelId,
          participants: sortedIds,
          lastMessageText: `Shared a wave: ${snippet}`,
          lastMessageSenderId: currentUser.uid,
          lastMessageSenderName: senderName,
          lastMessageAt: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});

      sendNotification({
        recipientId: friend.id,
        type: 'message',
        title: `${senderName} shared a wave with you 🌊`,
        body: snippet,
        entityId: dmChannelId,
        actorId: currentUser.uid,
        actorName: senderName,
        actorPhotoURL: senderPhotoURL
      });

      setSentToUserIds((prev) => ({ ...prev, [friend.id]: true }));
      await recordPostShare();
    } catch {
      triggerToast(language === 'sw' ? 'Imeshindwa kutuma' : 'Could not send to friend');
    } finally {
      setSendingToUserId(null);
    }
  };

  const handleSaveVideoOrMedia = async () => {
    if (!post || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await downloadPost(post);
      triggerToast(res?.message || (language === 'sw' ? 'Imehifadhiwa!' : 'Saved to device!'));
    } catch (err: any) {
      triggerToast(err?.message || (language === 'sw' ? 'Imeshindwa kuhifadhi' : 'Could not save'));
    } finally {
      setIsDownloading(false);
    }
  };

  // Mobile swipe-down drag handlers
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

  const postShareUrl = getPostShareUrl(post);
  const isVideoPost = Boolean(
    post.videoUrl || post.hasVideoChunks || post.mediaType === 'video'
  );

  return (
    <div
      className="wavelink-share-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={language === 'sw' ? 'Sambaza chapisho' : 'Share post'}
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
        className="wavelink-share-sheet"
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
              <Share2 size={18} className="text-[var(--accent-primary)]" />
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Sambaza' : 'Share'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'sw' ? 'Funga' : 'Close share sheet'}
              className="w-8 h-8 rounded-full bg-[var(--bg-subtle)] hover:opacity-85 text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition cursor-pointer border border-[var(--border-hairline)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toast Notice inside Sheet */}
        {sheetToast && (
          <div className="mx-4 mt-2.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-bold flex items-center gap-2 shrink-0">
            <Check size={14} />
            <span>{sheetToast}</span>
          </div>
        )}

        {/* Scrollable Sheet Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-4">
          {/* 1. Grid of round brand-colored icons with short single-line labels */}
          <div className="wavelink-share-grid">
            {SHARE_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => handlePlatformClick(platform.id)}
                className="flex flex-col items-center justify-start gap-1.5 group cursor-pointer select-none py-1"
              >
                <span
                  style={{ background: platform.bgStyle }}
                  className="w-12 h-12 rounded-full text-white flex items-center justify-center shadow-md transition-transform duration-150 group-hover:scale-105 group-active:scale-95"
                >
                  {platform.renderIcon()}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-primary)] truncate max-w-[68px] leading-tight">
                  {platform.id === 'more' && language === 'sw' ? 'Zaidi' : platform.label}
                </span>
              </button>
            ))}
          </div>

          {/* 2. "Page link" box and Copy button that shows "Copied!" for 2 seconds */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] block">
              {language === 'sw' ? 'Kiungo cha ukurasa' : 'Page link'}
            </span>
            <div className="flex items-center gap-2 p-1.5 pl-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
              <input
                type="text"
                readOnly
                value={postShareUrl}
                aria-label="Page link"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent text-xs font-mono text-[var(--text-secondary)] focus:outline-none truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                style={
                  !copiedLink
                    ? {
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }
                    : undefined
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-white shadow-xs hover:opacity-95'
                }`}
              >
                {copiedLink ? (
                  <>
                    <Check size={14} />
                    <span>{language === 'sw' ? 'Imenakiliwa!' : 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>{language === 'sw' ? 'Nakili' : 'Copy'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. "Send to a friend" horizontal row of recent chats */}
          {currentUser && recentContacts.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] block">
                {language === 'sw' ? 'Tuma kwa rafiki' : 'Send to a friend'}
              </span>
              <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
                {recentContacts.map((friend) => {
                  const isSent = Boolean(sentToUserIds[friend.id]);
                  const isSending = sendingToUserId === friend.id;
                  const firstName = (friend.displayName || 'Waver').split(' ')[0];
                  const avatarUrl =
                    friend.photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${friend.id}`;

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      disabled={isSent || isSending}
                      onClick={() => handleSendToFriend(friend)}
                      className="flex flex-col items-center gap-1 shrink-0 group cursor-pointer min-w-[60px]"
                    >
                      <div className="relative">
                        <Avatar
                          uid={friend.id}
                          src={avatarUrl}
                          alt={friend.displayName}
                          fallbackName={friend.displayName}
                          size={48}
                          showStatus={true}
                          targetProfile={friend}
                          className={`ring-2 rounded-full transition ${
                            isSent
                              ? 'ring-emerald-500 opacity-90'
                              : 'ring-[var(--border-hairline)] group-hover:ring-[var(--accent-primary)]'
                          }`}
                        />
                        <span
                          className={`absolute -top-1 -right-1 z-20 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-xs ${
                            isSent ? 'bg-emerald-500' : 'bg-[var(--accent-primary)]'
                          }`}
                        >
                          {isSent ? <Check size={11} /> : <Send size={10} />}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-[var(--text-primary)] truncate max-w-[64px]">
                        {isSent
                          ? language === 'sw'
                            ? 'Imetumwa!'
                            : 'Sent!'
                          : firstName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Bottom Action Row: "Save video" & "Report" */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleSaveVideoOrMedia}
              className="min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[var(--bg-subtle)] hover:opacity-90 border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <Download size={15} className="text-[var(--accent-primary)]" />
              <span>
                {isDownloading
                  ? language === 'sw'
                    ? 'Inapakua...'
                    : 'Saving...'
                  : isVideoPost
                  ? language === 'sw'
                    ? 'Hifadhi video'
                    : 'Save video'
                  : language === 'sw'
                  ? 'Pakua chapisho'
                  : 'Save post'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowReportModal(true);
                setReportNote('');
              }}
              className="min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-extrabold text-rose-500 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <Flag size={15} />
              <span>{language === 'sw' ? 'Ripoti' : 'Report'}</span>
            </button>
          </div>
        </div>

        {/* Google Play UGC Video / Post Report Reason Sub-Modal */}
        {showReportModal && (
          <div
            className="absolute inset-0 z-30 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <Flag size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
                      {isVideoPost
                        ? language === 'sw'
                          ? 'Ripoti Video'
                          : 'Report Video'
                        : language === 'sw'
                        ? 'Ripoti Chapisho'
                        : 'Report Post'}
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate max-w-[200px]">
                      @{post.authorName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {COMMUNITY_REPORT_CATEGORIES.map((cat) => {
                  const selected = selectedReportCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedReportCategory(cat.id)}
                      className={`w-full p-2.5 rounded-2xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? 'bg-rose-500/15 border-rose-500 text-[var(--text-primary)]'
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
                      {selected && <Check size={14} className="text-rose-500 shrink-0" />}
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
                  onClick={() => setShowReportModal(false)}
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
                        targetType: isVideoPost ? 'video' : 'post',
                        targetId: post.id,
                        targetAuthorId: post.authorId,
                        targetSummary: `${post.authorName}: ${(post.content || '').slice(0, 80)}`,
                        reason: `${chosen.labelEn}${reportNote.trim() ? `: ${reportNote.trim()}` : ''}`
                      });
                      setShowReportModal(false);
                      triggerToast(
                        language === 'sw'
                          ? 'Ripoti imetumwa kwa timu ya usalama!'
                          : 'Report submitted to our safety team!'
                      );
                    } finally {
                      setIsSubmittingReport(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-extrabold cursor-pointer"
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
