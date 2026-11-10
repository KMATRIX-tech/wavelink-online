import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import {
  Copy,
  Check,
  Hash,
  AtSign,
  ExternalLink,
  Volume2,
  VolumeX,
  AudioLines,
  Bookmark,
  Pencil,
  X,
  Loader2,
  AlertCircle,
  User,
  MessageSquare,
  Sparkles,
  UserPlus,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { CrystalBadge } from './CrystalBadge';
import { UserProfile } from '../types';
import { toggleFollowUser } from '../services/notificationService';

export interface PostBodyProps {
  postId?: string;
  authorId?: string;
  content?: string | null;
  authorName?: string;
  createdAt?: string | number | Date | null;
  showTimestamp?: boolean;
  isEdited?: boolean;
  className?: string;
  textClassName?: string;
  showCopyButton?: boolean;
  showTtsButton?: boolean;
  showBookmarkButton?: boolean;
  showEditButton?: boolean;
  canEdit?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveContent?: (newContent: string) => Promise<void> | void;
  isSaved?: boolean;
  onToggleSave?: (postId: string) => Promise<boolean | void> | void;
  onCopySuccess?: (copiedText: string) => void;
  onHashtagClick?: (hashtag: string) => void;
  onMentionClick?: (username: string) => void;
  onProfileClick?: (username: string) => void;
  onUrlClick?: (url: string) => void;
  onStartChat?: (userId: string) => void;
}

export type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'url'; value: string; href: string; display: string };

/**
 * Calculates a friendly, compact relative time string (e.g., 'just now', '45s ago', '2m ago', '3h ago', '2d ago').
 */
export function formatRelativeTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return 'just now';

  const date =
    typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;

  const timestamp = date.getTime();
  if (isNaN(timestamp)) return 'just now';

  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 15) {
    return 'just now';
  }
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

/**
 * Formats post content specifically for clear text-to-speech listening.
 * Cleans markdown, expands hashtags and mentions, and simplifies URLs for pleasant listening.
 */
export function prepareSpeechText(raw: string, author?: string): string {
  if (!raw) return '';
  let text = raw;

  // Simplify URLs into a clean spoken phrase (e.g. "link to wavelink.tz")
  text = text.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (match) => {
    try {
      const url = match.startsWith('http') ? match : `https://${match}`;
      const host = new URL(url).hostname.replace(/^www\./, '');
      return ` link to ${host} `;
    } catch {
      return ' link ';
    }
  });

  // Expand hashtags into spoken form
  text = text.replace(/#([a-zA-Z0-9_]+)/g, ' hashtag $1 ');

  // Expand mentions into spoken form
  text = text.replace(/@([a-zA-Z0-9_]+)/g, ' at $1 ');

  // Clean extra whitespace
  text = text.replace(/\s+/g, ' ').trim();

  if (author && author.trim()) {
    return `${author.trim()} writes: ${text}`;
  }
  return text;
}

/**
 * Trims trailing punctuation like '.', '!', ')' from URL matches while preserving
 * balanced parentheses in URLs (e.g. Wikipedia articles).
 */
function trimTrailingPunctuation(rawUrl: string): { url: string; trailing: string } {
  let url = rawUrl;
  let trailing = '';
  while (url.length > 0) {
    const lastChar = url[url.length - 1];
    if (['.', ',', '!', '?', ';', ':', ']', '"', "'"].includes(lastChar)) {
      trailing = lastChar + trailing;
      url = url.slice(0, -1);
    } else if (lastChar === ')') {
      const openCount = (url.match(/\(/g) || []).length;
      const closeCount = (url.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        trailing = lastChar + trailing;
        url = url.slice(0, -1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return { url, trailing };
}

/**
 * Strips protocol and truncates long URLs for a clean in-line preview.
 */
function formatUrlDisplay(url: string): string {
  let clean = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (clean.length > 36) {
    clean = clean.slice(0, 33) + '...';
  }
  return clean;
}

/**
 * Regular expressions for the PostBody Regex Parser:
 * 1. POST_URL_REGEX: Detects standard URLs (http://, https://, www., and common domain TLDs)
 * 2. POST_TAG_MENTION_REGEX: Detects hashtags (#tag) and user mentions (@user) with boundary delimiters
 */
export const POST_URL_REGEX =
  /(?:(?:https?:\/\/|www\.)[^\s<]+)|(?:(^|[\s([{"'<\`])([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|edu|gov|io|app|dev|ai|me|tz|cc|co|info|biz|tv|xyz)(?:\/[^\s<]*)?))/gi;

export const POST_TAG_MENTION_REGEX =
  /(?:(^|[\s([{"'.,!?:;~`*+\-\/#@])(#[a-zA-Z0-9_]{1,60}))|(?:(^|[\s([{"'.,!?:;~`*+\-\/#])(@[a-zA-Z0-9_.]{1,50}))/g;

/**
 * Parses raw post text into lossless tokens for text, hashtags (#tag), user mentions (@user), and standard URLs.
 */
export function tokenizePostBodyContent(raw: string): ContentToken[] {
  if (!raw) return [];

  // 1. Extract URLs first so internal '#' or '@' in queries/paths aren't split
  const urlRegex = new RegExp(POST_URL_REGEX.source, 'gi');
  const intermediate: { type: 'text' | 'url'; value: string; href?: string; display?: string }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(raw)) !== null) {
    if (match.index > lastIdx) {
      intermediate.push({ type: 'text', value: raw.slice(lastIdx, match.index) });
    }

    // Check if there was a preceding delimiter in group 1
    const delimiter = match[1] || '';
    if (delimiter) {
      intermediate.push({ type: 'text', value: delimiter });
    }

    const matchedUrl = match[2] || match[0];
    const { url, trailing } = trimTrailingPunctuation(matchedUrl);
    const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const display = formatUrlDisplay(url);

    intermediate.push({ type: 'url', value: url, href, display });
    if (trailing) {
      intermediate.push({ type: 'text', value: trailing });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < raw.length) {
    intermediate.push({ type: 'text', value: raw.slice(lastIdx) });
  }

  // 2. Tokenize text blocks for hashtags (#tag) and mentions (@user)
  const tokens: ContentToken[] = [];
  const tagMentionRegex = new RegExp(POST_TAG_MENTION_REGEX.source, 'g');

  for (const part of intermediate) {
    if (part.type === 'url') {
      tokens.push({
        type: 'url',
        value: part.value,
        href: part.href!,
        display: part.display!
      });
      continue;
    }

    let textIdx = 0;
    let tmMatch: RegExpExecArray | null;
    tagMentionRegex.lastIndex = 0;

    while ((tmMatch = tagMentionRegex.exec(part.value)) !== null) {
      if (tmMatch.index > textIdx) {
        tokens.push({
          type: 'text',
          value: part.value.slice(textIdx, tmMatch.index)
        });
      }

      if (tmMatch[2]) {
        // Delimiter preceding hashtag
        if (tmMatch[1]) {
          tokens.push({ type: 'text', value: tmMatch[1] });
        }
        const fullTag = tmMatch[2];
        tokens.push({
          type: 'hashtag',
          value: fullTag,
          tag: fullTag.replace(/^#/, '')
        });
        textIdx = tmMatch.index + tmMatch[0].length;
      } else if (tmMatch[4]) {
        // Delimiter preceding mention
        if (tmMatch[3]) {
          tokens.push({ type: 'text', value: tmMatch[3] });
        }
        // Trim any trailing period from username (e.g. "Thanks @alex.")
        const rawMention = tmMatch[4];
        const cleanMention = rawMention.replace(/\.+$/, '');
        const trailingDots = rawMention.slice(cleanMention.length);
        tokens.push({
          type: 'mention',
          value: cleanMention,
          username: cleanMention.replace(/^@/, '')
        });
        if (trailingDots) {
          tokens.push({ type: 'text', value: trailingDots });
        }
        textIdx = tmMatch.index + tmMatch[0].length;
      }
    }

    if (textIdx < part.value.length) {
      tokens.push({
        type: 'text',
        value: part.value.slice(textIdx)
      });
    }
  }

  return tokens;
}

/**
 * PostBody Component
 * - Automatically detects and highlights hashtags, mentions, and URLs.
 * - Displays a relative timestamp (e.g. '2m ago') appended to post content.
 * - Features an accessible Text-To-Speech (TTS) listener to read posts aloud.
 * - Includes a Bookmark icon button to save posts to a private 'Saved Posts' collection in Firestore.
 * - Includes a quick-action clipboard copy button and fluid typography.
 */
export const PostBody: React.FC<PostBodyProps> = ({
  postId,
  authorId,
  content,
  authorName,
  createdAt,
  showTimestamp = true,
  isEdited = false,
  className = '',
  textClassName = '',
  showCopyButton = true,
  showTtsButton = true,
  showBookmarkButton = true,
  showEditButton = true,
  canEdit: canEditProp,
  isEditing: isEditingProp,
  onStartEdit,
  onCancelEdit,
  onSaveContent,
  isSaved: isSavedProp,
  onToggleSave,
  onCopySuccess,
  onHashtagClick,
  onMentionClick,
  onProfileClick,
  onUrlClick,
  onStartChat
}) => {
  const { currentUser, userProfile, toggleSavePost } = useAuth();
  const [currentContent, setCurrentContent] = useState<string>(content || '');
  const [isEditedState, setIsEditedState] = useState<boolean>(Boolean(isEdited));
  const [isInternalEditing, setIsInternalEditing] = useState<boolean>(false);
  const isEditing = isEditingProp !== undefined ? isEditingProp : isInternalEditing;

  const [editDraft, setEditDraft] = useState<string>(content || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  // Profile modal preview state for interactive mentions
  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    loading: boolean;
    user: UserProfile | null;
    username: string;
    isFollowing: boolean;
    isActionLoading?: boolean;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isBookmarkSaving, setIsBookmarkSaving] = useState(false);
  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = isSpeaking;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const instanceId = useId();

  // Sync external content prop updates
  useEffect(() => {
    setCurrentContent(content || '');
    if (!isEditing) {
      setEditDraft(content || '');
    }
  }, [content, isEditing]);

  // Sync external isEdited prop updates
  useEffect(() => {
    setIsEditedState(Boolean(isEdited));
  }, [isEdited]);

  // Determine if the current user has permission to edit this post
  const canUserEdit = useMemo(() => {
    if (canEditProp !== undefined) return canEditProp;
    if (!currentUser) return false;
    // Direct author match by Firebase Auth UID
    if (authorId && currentUser.uid === authorId) return true;
    // Support/Admin roles
    if (userProfile?.role === 'super_admin' || userProfile?.role === 'admin' || userProfile?.isSubAdmin) {
      return true;
    }
    // Fallback match by author username/displayName if authorId wasn't explicitly supplied
    if (!authorId && authorName && (userProfile?.username === authorName || userProfile?.displayName === authorName)) {
      return true;
    }
    return false;
  }, [canEditProp, currentUser, authorId, userProfile?.role, userProfile?.isSubAdmin, authorName, userProfile?.username, userProfile?.displayName]);

  // Determine saved state: prioritize explicit prop, fallback to userProfile saved array
  const isPostSaved = useMemo(() => {
    if (isSavedProp !== undefined) return isSavedProp;
    if (postId && userProfile?.savedPostIds) {
      return userProfile.savedPostIds.includes(postId);
    }
    return false;
  }, [isSavedProp, postId, userProfile?.savedPostIds]);

  const [savedState, setSavedState] = useState(isPostSaved);

  useEffect(() => {
    setSavedState(isPostSaved);
  }, [isPostSaved]);

  // Check if browser supports Web Speech API
  const isTtsSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;

  // Safe stop helper for Web Speech API
  const stopSpeaking = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setIsSpeaking(false);
  };

  // Pre-load / warm-up browser speech synthesis voices (asynchronously loaded in Chromium/Safari)
  useEffect(() => {
    if (!isTtsSupported) return;
    const preloadVoices = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch {
        // ignore
      }
    };
    preloadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', preloadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', preloadVoices);
    };
  }, [isTtsSupported]);

  // Auto-updating relative timestamp state (ticks every 30 seconds)
  const [relativeTime, setRelativeTime] = useState<string>(() => formatRelativeTime(createdAt));

  useEffect(() => {
    setRelativeTime(formatRelativeTime(createdAt));
    const timer = setInterval(() => {
      setRelativeTime(formatRelativeTime(createdAt));
    }, 30000);
    return () => clearInterval(timer);
  }, [createdAt]);

  const fullDateTooltip = useMemo(() => {
    if (!createdAt) return undefined;
    try {
      const d =
        typeof createdAt === 'string' || typeof createdAt === 'number'
          ? new Date(createdAt)
          : createdAt;
      return !isNaN(d.getTime()) ? d.toLocaleString() : undefined;
    } catch {
      return undefined;
    }
  }, [createdAt]);

  // Listen for speech triggered on any other post to prevent overlapping audio
  useEffect(() => {
    const handleOtherTts = (e: Event) => {
      const custom = e as CustomEvent<{ id?: string }>;
      if (custom.detail?.id !== instanceId) {
        stopSpeaking();
      }
    };
    window.addEventListener('wavelink:tts-start', handleOtherTts);
    return () => {
      window.removeEventListener('wavelink:tts-start', handleOtherTts);
    };
  }, [instanceId]);

  // Clean up active speech and keepalive timers when component unmounts
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Auto-focus and adjust height when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditDraft(currentContent);
      setErrorMessage(null);
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.max(90, textareaRef.current.scrollHeight)}px`;
        }
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isEditing, currentContent]);

  // Tokenize text into structured segments (memoized on currentContent)
  const tokens = useMemo(() => {
    return currentContent ? tokenizePostBodyContent(currentContent) : [];
  }, [currentContent]);

  // Start editing handler
  const handleStartEdit = () => {
    if (!canUserEdit) return;
    if (isSpeaking) {
      stopSpeaking();
    }
    setEditDraft(currentContent);
    setErrorMessage(null);
    setIsInternalEditing(true);
    onStartEdit?.();
  };

  // Cancel editing handler
  const handleCancelEdit = () => {
    setEditDraft(currentContent);
    setErrorMessage(null);
    setIsInternalEditing(false);
    onCancelEdit?.();
  };

  // Save edited content back to Firestore
  const handleSaveEdit = async () => {
    const clean = editDraft.trim();
    if (!clean) {
      setErrorMessage('Post content cannot be empty.');
      return;
    }
    if (clean.length > 4000) {
      setErrorMessage('Post exceeds maximum length of 4,000 characters.');
      return;
    }

    if (clean === currentContent) {
      handleCancelEdit();
      return;
    }

    if (!postId) {
      setCurrentContent(clean);
      setIsInternalEditing(false);
      onCancelEdit?.();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: clean,
        isEdited: true,
        updatedAt: new Date().toISOString()
      });

      setCurrentContent(clean);
      setIsEditedState(true);
      setIsInternalEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);

      if (onSaveContent) {
        await onSaveContent(clean);
      }
      onCancelEdit?.();
    } catch (err: any) {
      console.error('Failed to update post in Firestore:', err);
      setErrorMessage(err?.message || 'Could not save post changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditDraft(e.target.value);
    if (errorMessage) setErrorMessage(null);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.max(90, e.target.scrollHeight)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isSubmitting && editDraft.trim().length > 0) {
        handleSaveEdit();
      }
    }
  };

  // Click-to-edit handler when clicking directly on the post text
  const handlePostTextClick = (e: React.MouseEvent) => {
    if (!canUserEdit || isEditing) return;
    const target = e.target as HTMLElement;
    // Don't trigger edit mode if the click landed on interactive items
    if (target.closest('button, a, input, select, textarea, [role="button"], .wavelink-post-actions')) {
      return;
    }
    // Don't trigger edit mode if the user is selecting / copying text
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    handleStartEdit();
  };

  if (!currentContent && !isEditing) return null;

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    let copySucceeded = false;
    const textToCopy = currentContent || '';

    // 1. Modern Navigator Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        copySucceeded = true;
      } catch (err) {
        console.warn('Navigator clipboard write failed, trying fallback:', err);
      }
    }

    // 2. Hidden Textarea execCommand fallback (for restricted iframe permissions)
    if (!copySucceeded) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copySucceeded = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Copy fallback execution error:', err);
      }
    }

    if (copySucceeded) {
      // Gentle haptic feedback on mobile touch devices
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(25);
        } catch {
          // Ignore vibration permission errors
        }
      }

      setCopied(true);
      onCopySuccess?.(textToCopy);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleBookmark = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (!currentUser) {
      console.warn('Authentication required: sign in to save posts to your private collection.');
      return;
    }

    const targetPostId = postId;
    if (!targetPostId) return;

    const nextSavedState = !savedState;
    setSavedState(nextSavedState); // Optimistic UI
    setIsBookmarkSaving(true);

    try {
      // Gentle haptic feedback on mobile touch devices
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(35);
        } catch {
          // ignore
        }
      }

      // 1. Invoke callback or AuthContext helper
      if (onToggleSave) {
        await onToggleSave(targetPostId);
      } else {
        await toggleSavePost(targetPostId);
      }

      // 2. Directly ensure private subcollection write in Firestore: /users/{userId}/savedPosts/{postId}
      const userSavedRef = doc(db, 'users', currentUser.uid, 'savedPosts', targetPostId);
      if (nextSavedState) {
        await setDoc(userSavedRef, {
          id: targetPostId,
          postId: targetPostId,
          userId: currentUser.uid,
          authorName: authorName || 'Waver',
          contentSnippet: (currentContent || '').slice(0, 480),
          savedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } else {
        await deleteDoc(userSavedRef).catch(() => {});
      }

      // 3. Directly ensure top-level private collection write in Firestore: /savedPosts/{userId_postId}
      const topLevelSavedRef = doc(db, 'savedPosts', `${currentUser.uid}_${targetPostId}`);
      if (nextSavedState) {
        await setDoc(topLevelSavedRef, {
          id: `${currentUser.uid}_${targetPostId}`,
          postId: targetPostId,
          userId: currentUser.uid,
          authorName: authorName || 'Waver',
          contentSnippet: (currentContent || '').slice(0, 480),
          savedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } else {
        await deleteDoc(topLevelSavedRef).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to toggle saved post in Firestore:', err);
      setSavedState(!nextSavedState); // Revert on failure
    } finally {
      setIsBookmarkSaving(false);
    }
  };

  const handleToggleTts = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isTtsSupported) return;

    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    // Stop any existing speech across the app
    stopSpeaking();
    window.dispatchEvent(new CustomEvent('wavelink:tts-start', { detail: { id: instanceId } }));

    // Prepare speech text with natural spoken tags and mentions
    const cleanSpeech = prepareSpeechText(currentContent, authorName);
    if (!cleanSpeech) return;

    try {
      // Resume audio context if browser speech synthesis was paused
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utteranceRef.current = utterance;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Daniel') ||
              v.name.includes('Karen'))
        ) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        (voices.length > 0 ? voices[0] : null);

      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        stopSpeaking();
      };

      utterance.onerror = (err) => {
        if (err.error !== 'interrupted' && err.error !== 'canceled') {
          console.warn('Speech synthesis error:', err);
        }
        stopSpeaking();
      };

      // Chromium keepalive workaround for long posts
      keepAliveIntervalRef.current = setInterval(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          } else {
            stopSpeaking();
          }
        }
      }, 10000);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('TTS speech synthesis failed:', err);
      stopSpeaking();
    }
  };

  const handleHashtag = (e: React.MouseEvent, tagString: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cleanTag = tagString.replace(/^#/, '');
    const formattedTag = `#${cleanTag}`;

    if (onHashtagClick) {
      onHashtagClick(formattedTag);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:hashtag', { detail: formattedTag }));
      window.dispatchEvent(
        new CustomEvent('wavelink:navigate-tag', {
          detail: { tag: cleanTag, hashtag: formattedTag, postId }
        })
      );
      window.dispatchEvent(new CustomEvent('wavelink:filter-tag', { detail: formattedTag }));
      window.dispatchEvent(new CustomEvent('wavelink:navigate-tab', { detail: 'feed' }));
    }
  };

  const handleUrl = (e: React.MouseEvent<HTMLAnchorElement>, href: string, rawValue: string) => {
    e.stopPropagation();
    if (onUrlClick) {
      onUrlClick(href);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wavelink:url', {
          detail: { url: href, raw: rawValue, postId }
        })
      );
      window.dispatchEvent(
        new CustomEvent('wavelink:navigate-url', {
          detail: { url: href, raw: rawValue, postId }
        })
      );
    }
  };

  const handleMention = async (e: React.MouseEvent, mentionString: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cleanUser = mentionString.replace(/^@/, '');

    if (onMentionClick) {
      onMentionClick(cleanUser);
    }
    if (onProfileClick) {
      onProfileClick(cleanUser);
    }

    // 1. Dispatch global navigation events for feed filtering and profile routing
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:mention', { detail: cleanUser }));
      window.dispatchEvent(
        new CustomEvent('wavelink:navigate-profile', {
          detail: { username: cleanUser, handle: `@${cleanUser}`, postId }
        })
      );
      window.dispatchEvent(new CustomEvent('wavelink:filter-tag', { detail: `@${cleanUser}` }));
      window.dispatchEvent(new CustomEvent('wavelink:open-profile', { detail: { username: cleanUser } }));
    }

    // 2. Open interactive Profile Preview Card modal
    setProfileModal({
      isOpen: true,
      loading: true,
      user: null,
      username: cleanUser,
      isFollowing: false
    });

    try {
      // Find user by @username or plain username or displayName
      const qWithAt = query(collection(db, 'users'), where('username', '==', `@${cleanUser}`), limit(1));
      let snap = await getDocs(qWithAt);
      if (snap.empty) {
        const qWithoutAt = query(collection(db, 'users'), where('username', '==', cleanUser), limit(1));
        snap = await getDocs(qWithoutAt);
      }
      if (snap.empty) {
        const qDisplayName = query(collection(db, 'users'), where('displayName', '==', cleanUser), limit(1));
        snap = await getDocs(qDisplayName);
      }

      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const userData = { id: docSnap.id, ...docSnap.data() } as UserProfile;

        let following = false;
        if (currentUser && currentUser.uid !== userData.id) {
          const followQ = query(
            collection(db, 'follows'),
            where('followerId', '==', currentUser.uid),
            where('targetUserId', '==', userData.id),
            limit(1)
          );
          const followSnap = await getDocs(followQ);
          following = !followSnap.empty;
        }

        setProfileModal((prev) =>
          prev && prev.username === cleanUser
            ? { ...prev, loading: false, user: userData, isFollowing: following }
            : prev
        );
      } else {
        setProfileModal((prev) =>
          prev && prev.username === cleanUser ? { ...prev, loading: false, user: null } : prev
        );
      }
    } catch (err) {
      console.warn('Profile fetch error:', err);
      setProfileModal((prev) =>
        prev && prev.username === cleanUser ? { ...prev, loading: false, user: null } : prev
      );
    }
  };

  const handleToggleFollowInModal = async () => {
    if (!currentUser || !profileModal?.user) return;
    const target = profileModal.user;
    setProfileModal((prev) => (prev ? { ...prev, isActionLoading: true } : null));
    try {
      const nowFollowing = await toggleFollowUser(
        currentUser.uid,
        currentUser.displayName || 'A waver',
        target.id,
        target.displayName
      );
      setProfileModal((prev) =>
        prev ? { ...prev, isFollowing: nowFollowing, isActionLoading: false } : null
      );
    } catch {
      setProfileModal((prev) => (prev ? { ...prev, isActionLoading: false } : null));
    }
  };

  const handleStartChatInModal = () => {
    if (!profileModal?.user) return;
    const userId = profileModal.user.id;
    if (onStartChat) {
      onStartChat(userId);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:start-chat', { detail: { userId } }));
    }
    setProfileModal(null);
  };

  const handleViewWavesInModal = () => {
    const userHandle = profileModal?.username;
    if (userHandle && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:mention', { detail: userHandle }));
      window.dispatchEvent(new CustomEvent('wavelink:filter-tag', { detail: `@${userHandle}` }));
      window.dispatchEvent(new CustomEvent('wavelink:navigate-tab', { detail: 'feed' }));
    }
    setProfileModal(null);
  };

  const handleOpenDirectoryInModal = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:navigate-tab', { detail: 'directory' }));
    }
    setProfileModal(null);
  };

  // If in edit mode, render the temporary input field
  if (isEditing) {
    return (
      <div className={`wavelink-post-body wavelink-post-body--editing relative ${className}`}>
        <div className="rounded-2xl border-2 border-blue-500/80 bg-blue-50/30 p-3 sm:p-3.5 shadow-sm space-y-2.5 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="inline-flex items-center gap-1.5 text-blue-700 font-bold">
              <Pencil size={12} className="text-blue-600" />
              Editing Wave
            </span>
            <span
              className={`font-mono text-[11px] ${
                editDraft.length > 3900 ? 'text-rose-600 font-bold' : 'text-slate-400'
              }`}
            >
              {editDraft.length}/4000
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={editDraft}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            maxLength={4000}
            placeholder="Edit your wave content..."
            aria-label="Edit post content"
            className="w-full min-h-[96px] p-3 rounded-xl bg-white border border-slate-200 text-sm sm:text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed resize-none transition shadow-2xs disabled:bg-slate-50 disabled:text-slate-500"
          />

          {errorMessage && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle size={13} className="shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px] text-slate-600">
                Esc
              </kbd>
              <span>to cancel</span>
              <span className="mx-1">·</span>
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px] text-slate-600">
                Ctrl+Enter
              </kbd>
              <span>to save</span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <X size={12} />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSubmitting || editDraft.trim().length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin stroke-[2.5]" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} className="stroke-[2.5]" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`wavelink-post-body relative group/postbody ${
        canUserEdit ? 'wavelink-post-body--can-edit' : ''
      } ${isSpeaking ? 'wavelink-post-body--speaking' : ''} ${className}`}
    >
      <p
        onClick={handlePostTextClick}
        title={canUserEdit ? 'Click to edit your wave' : undefined}
        className={`wavelink-post-body text-base text-[#0F172A] whitespace-pre-wrap leading-relaxed select-text cursor-text ${
          canUserEdit
            ? 'hover:bg-slate-50/70 p-1 -m-1 rounded-xl transition-colors cursor-pointer'
            : ''
        } ${
          showCopyButton ||
          showTtsButton ||
          (showBookmarkButton && (postId || onToggleSave)) ||
          (canUserEdit && showEditButton)
            ? 'pr-32 sm:pr-44'
            : ''
        } ${textClassName}`}
      >
        {tokens.map((token, idx) => {
          if (token.type === 'hashtag') {
            return (
              <a
                key={idx}
                href={`#tag=${encodeURIComponent(token.tag)}`}
                data-entity="hashtag"
                data-hashtag={`#${token.tag}`}
                onClick={(e) => handleHashtag(e, token.tag)}
                title={`Explore waves tagged with #${token.tag}`}
                aria-label={`Explore hashtag #${token.tag}`}
                className="wavelink-tag-link inline-flex items-center gap-0.5 font-bold text-[#2563EB] hover:text-[#1D4ED8] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/70 hover:border-blue-300 px-1.5 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer align-baseline select-text underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400 group/tag"
              >
                <Hash aria-hidden="true" size={11} className="text-[#3B82F6] group-hover/tag:text-[#1D4ED8] shrink-0 transition-colors" />
                <span>#{token.tag}</span>
              </a>
            );
          }

          if (token.type === 'mention') {
            return (
              <a
                key={idx}
                href={`#profile/${encodeURIComponent(token.username)}`}
                data-entity="mention"
                data-mention={`@${token.username}`}
                onClick={(e) => handleMention(e, token.username)}
                title={`View @${token.username}'s profile & waves`}
                aria-label={`View @${token.username} profile and waves`}
                className="wavelink-mention-link inline-flex items-center gap-0.5 font-bold text-[#0F766E] hover:text-[#0D9488] bg-teal-50/90 hover:bg-teal-100 border border-teal-200/60 hover:border-teal-300 px-1.5 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer align-baseline select-text underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-teal-400 group/mention"
              >
                <AtSign aria-hidden="true" size={11} className="text-[#0D9488] group-hover/mention:text-[#0F766E] shrink-0 transition-colors" />
                <span>@{token.username}</span>
              </a>
            );
          }

          if (token.type === 'url') {
            return (
              <a
                key={idx}
                href={token.href}
                data-entity="url"
                data-url={token.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleUrl(e, token.href, token.value)}
                title={`Open external link: ${token.href}`}
                aria-label={`Open web address ${token.href}`}
                className="wavelink-url-link inline-flex items-center gap-1 font-medium text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-2 break-all bg-sky-50/70 hover:bg-sky-100/90 border border-sky-200/50 hover:border-sky-300 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer align-baseline select-text group/url"
              >
                <span>{token.display}</span>
                <ExternalLink aria-hidden="true" size={11} className="text-sky-600 group-hover/url:text-[#1D4ED8] shrink-0 transition-colors" />
              </a>
            );
          }

          return <span key={idx}>{token.value}</span>;
        })}

        {isEditedState && (
          <span className="text-[10px] text-slate-400 italic ml-2 select-none" title="This wave was edited">
            (edited)
          </span>
        )}

        {justSaved && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md font-semibold ml-2 select-none">
            <Check size={10} className="stroke-[2.5]" />
            <span>Saved</span>
          </span>
        )}

        {/* Relative timestamp display (e.g., '2m ago') appended to the end of the post content */}
        {showTimestamp && (
          <span
            className="wavelink-post-timestamp text-xs text-slate-400 font-mono ml-2 select-none whitespace-nowrap inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
            title={fullDateTooltip}
          >
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{relativeTime}</span>
          </span>
        )}
      </p>

      {/* Quick Action Tray: Edit (for author), Text-to-Speech Listener, Bookmark, and Copy */}
      <div className="wavelink-post-actions absolute top-0 right-0 inline-flex items-center gap-1 z-10">
        {canUserEdit && showEditButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleStartEdit();
            }}
            aria-label="Edit your wave"
            title="Edit your wave (Click to edit)"
            className="wavelink-post-edit-btn inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-slate-100/95 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200/80 opacity-80 sm:opacity-0 sm:group-hover/postbody:opacity-100 focus:opacity-100 shadow-2xs"
          >
            <Pencil size={11} className="text-slate-500 hover:text-blue-600" />
            <span className="text-[10px] font-semibold">Edit</span>
          </button>
        )}

        {showTtsButton && isTtsSupported && (
          <button
            type="button"
            onClick={handleToggleTts}
            aria-label={isSpeaking ? 'Stop reading post aloud' : 'Read post aloud'}
            aria-pressed={isSpeaking}
            title={isSpeaking ? 'Stop reading post aloud' : 'Read post text aloud (Web Speech API)'}
            className={`wavelink-post-tts-btn wavelink-speaker-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              isSpeaking
                ? 'bg-blue-600 text-white shadow-xs scale-105 ring-1 ring-blue-500 opacity-100'
                : 'bg-slate-100/95 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200/80 opacity-90 sm:opacity-75 sm:group-hover/postbody:opacity-100 focus:opacity-100 shadow-2xs'
            }`}
          >
            {isSpeaking ? (
              <>
                <VolumeX size={13} className="wavelink-speaker-icon stroke-[2.5]" />
                <span className="text-[10px] font-bold">Stop</span>
                <span className="inline-flex items-center gap-0.5 ml-0.5" aria-hidden="true">
                  <span className="w-0.5 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-0.5 h-3 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-0.5 h-2 bg-white rounded-full animate-bounce" />
                </span>
              </>
            ) : (
              <>
                <Volume2 size={13} className="wavelink-speaker-icon text-slate-500 hover:text-blue-600 transition-colors" />
                <span className="text-[10px]">Listen</span>
              </>
            )}
          </button>
        )}

        {showBookmarkButton && (postId || onToggleSave) && (
          <button
            type="button"
            onClick={handleToggleBookmark}
            disabled={isBookmarkSaving}
            aria-label={savedState ? 'Remove from private saved posts' : 'Save post to private collection'}
            aria-pressed={savedState}
            title={savedState ? 'Saved in private collection (Click to remove)' : 'Save post to private Saved Posts in Firestore'}
            className={`wavelink-post-bookmark-btn inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              savedState
                ? 'bg-amber-500 text-white shadow-xs scale-105 ring-1 ring-amber-400 opacity-100'
                : 'bg-slate-100/95 hover:bg-slate-200 text-slate-600 hover:text-amber-600 border border-slate-200/80 opacity-80 sm:opacity-0 sm:group-hover/postbody:opacity-100 focus:opacity-100 shadow-2xs'
            }`}
          >
            <Bookmark
              size={12}
              className={savedState ? 'fill-white stroke-white' : 'text-slate-500 hover:text-amber-600'}
            />
            <span className="text-[10px] font-semibold hidden xs:inline sm:inline">
              {savedState ? 'Saved' : 'Save'}
            </span>
          </button>
        )}

        {showCopyButton && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Post text copied to clipboard' : 'Copy post text'}
            title={copied ? 'Copied to clipboard!' : 'Copy post to clipboard'}
            className={`wavelink-post-copy-btn inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              copied
                ? 'bg-emerald-600 text-white shadow-xs scale-105 ring-1 ring-emerald-500'
                : 'bg-slate-100/95 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/80 opacity-80 sm:opacity-0 sm:group-hover/postbody:opacity-100 focus:opacity-100 shadow-2xs'
            }`}
          >
            {copied ? (
              <>
                <Check size={12} className="stroke-[2.5]" />
                <span className="text-[10px] font-bold">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} className="text-slate-500" />
                <span className="text-[10px]">Copy</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Interactive Profile Preview Modal when clicking an @mention */}
      {profileModal?.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`profile-modal-title-${instanceId}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setProfileModal(null);
          }}
        >
          <div
            className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4 relative animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setProfileModal(null)}
              aria-label="Close profile card"
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={16} />
            </button>

            {profileModal.loading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 size={28} className="animate-spin text-teal-600" />
                <span className="text-xs text-slate-500 font-medium">
                  Loading @{profileModal.username}&apos;s profile...
                </span>
              </div>
            ) : profileModal.user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={
                      profileModal.user.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${profileModal.user.id}`
                    }
                    alt={profileModal.user.displayName || profileModal.username}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-teal-500/30 shadow-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3
                        id={`profile-modal-title-${instanceId}`}
                        className="font-extrabold text-base text-[#0F172A] truncate"
                      >
                        {profileModal.user.displayName || profileModal.username}
                      </h3>
                      <CrystalBadge
                        email={profileModal.user.email}
                        name={profileModal.user.displayName}
                        size="sm"
                      />
                    </div>
                    <p className="text-xs font-mono text-[#0D9488] font-bold">
                      {profileModal.user.username?.startsWith('@')
                        ? profileModal.user.username
                        : `@${profileModal.user.username || profileModal.username}`}
                    </p>
                    {profileModal.user.isPro && (
                      <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-2xs">
                        <Sparkles size={9} />
                        WaveLink Pro
                      </span>
                    )}
                  </div>
                </div>

                {profileModal.user.bio && (
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    {profileModal.user.bio}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 px-1 py-1">
                  <span>
                    Wave Points:{' '}
                    <strong className="text-slate-800 font-bold">
                      {(profileModal.user.wavePoints ?? 0).toLocaleString()}
                    </strong>
                  </span>
                  {profileModal.user.status && (
                    <span className="capitalize text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      ● Active
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {currentUser && currentUser.uid !== profileModal.user.id && (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleFollowInModal}
                        disabled={profileModal.isActionLoading}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                          profileModal.isFollowing
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                            : 'bg-teal-600 hover:bg-teal-700 text-white'
                        }`}
                      >
                        {profileModal.isFollowing ? (
                          <>
                            <UserCheck size={13} className="text-emerald-600" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={13} />
                            <span>Follow</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleStartChatInModal}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Send direct message"
                      >
                        <MessageSquare size={13} />
                        <span>Chat</span>
                      </button>
                    </>
                  )}

                  {currentUser && currentUser.uid === profileModal.user.id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('wavelink:navigate-tab', { detail: 'settings' }));
                        }
                        setProfileModal(null);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil size={12} />
                      <span>Edit Profile</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleViewWavesInModal}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>View Waves</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleOpenDirectoryInModal}
                  className="w-full py-1.5 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition font-medium flex items-center justify-center gap-1 cursor-pointer"
                >
                  <User size={12} className="text-slate-400" />
                  <span>View Member in Directory</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 text-center py-2">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                  <User size={24} />
                </div>
                <div>
                  <h3
                    id={`profile-modal-title-${instanceId}`}
                    className="font-extrabold text-sm text-[#0F172A]"
                  >
                    @{profileModal.username}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Discover waves and activity from @{profileModal.username} on WaveLink.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleViewWavesInModal}
                    className="w-full py-2 px-3.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition cursor-pointer shadow-xs"
                  >
                    Explore Waves by @{profileModal.username}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenDirectoryInModal}
                    className="w-full py-1.5 px-3 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Find in Member Directory
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
