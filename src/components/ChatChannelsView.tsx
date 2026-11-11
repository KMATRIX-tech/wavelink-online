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
  updateDoc,
  deleteDoc,
  getDocs,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { ChannelMessage, UserProfile, CallRecipient, ChatGroup, TypingStatusEntry, ChatChannelMeta } from '../types';
import { CrystalBadge } from './CrystalBadge';
import {
  compressImage,
  validateVideoFileSize,
  cloneVideoFileToMemory,
  uploadVideoChunkedToServer
} from '../utils/mediaStorage';
import {
  Send,
  Smile,
  Image as ImageIcon,
  Reply,
  Edit2,
  Trash2,
  X,
  Search,
  Hash,
  User as UserIcon,
  Video,
  PhoneCall,
  UploadCloud,
  Film,
  Plus,
  Users,
  Shield,
  LogOut,
  Settings,
  Camera,
  Check,
  CheckCheck,
  Crown,
  Info,
  MoreVertical,
  UserPlus,
  UserMinus,
  Sparkles,
  MessageSquare,
  Lock,
  Star,
  Mic,
  Square,
  Volume2,
  Flag,
  Ban,
  Bot,
  ArrowLeft,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { ADMIN_EMAIL, isSuperAdminEmail, getAuthHeaders } from '../firebase';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { sendNotification } from '../services/notificationService';
import {
  detectUpgradeIdea,
  recordUpgradeFeedback,
} from '../services/upgradeFeedbackService';
import {
  SUPPORT_BOT_ID,
  SUPPORT_BOT_EMAIL,
  SUPPORT_BOT_NAME,
  SUPPORT_BOT_USERNAME,
  SUPPORT_BOT_AVATAR,
  SUPPORT_BOT_PROFILE,
  isSupportBotUser,
  sanitizeUserText
} from '../utils/security';

/**
 * Deterministic conversationId generator:
 * Always sorts both UIDs alphabetically and joins them as `dm_<uid1>_<uid2>`
 * so both participants compute the exact same conversationId.
 */
export const computeDmConversationId = (uidA: string, uidB: string): string => {
  const cleanA = String(uidA || '').trim();
  const cleanB = String(uidB || '').trim();
  const sorted = [cleanA, cleanB].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
};

/**
 * Safely extracts the other participant's UID from a `dm_<uid1>_<uid2>` conversationId,
 * even if one of the UIDs contains underscores (e.g. `wavelink_support_bot`).
 */
export const getOtherDmParticipantId = (conversationId: string, myUid: string): string => {
  if (!conversationId || !conversationId.startsWith('dm_') || !myUid) return '';
  const body = conversationId.slice(3);
  if (body.startsWith(`${myUid}_`)) {
    return body.slice(myUid.length + 1);
  }
  if (body.endsWith(`_${myUid}`)) {
    return body.slice(0, body.length - (myUid.length + 1));
  }
  const parts = body.split('_');
  return parts.find((p) => p !== myUid) || '';
};

/**
 * Normalizes a message's timestamp (Firestore Timestamp, number, or ISO string) into milliseconds
 * for deterministic chronological ordering.
 */
const getMessageTimestampMs = (msg: Partial<ChannelMessage> & { timestamp?: any }): number => {
  const ts = msg.timestamp;
  if (ts) {
    if (typeof ts.toMillis === 'function') {
      return ts.toMillis();
    }
    if (typeof ts.seconds === 'number') {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (typeof ts === 'number') {
      return ts;
    }
    if (typeof ts === 'string') {
      const parsed = Date.parse(ts);
      if (!isNaN(parsed)) return parsed;
    }
  }
  if (msg.createdAt) {
    const parsed = Date.parse(msg.createdAt);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

interface ChatChannelsViewProps {
  onOpenCall: (type: 'video' | 'voice', recipient?: CallRecipient) => void;
  initialTargetUserId?: string;
}

const EMOJI_LIST = [
  '👋', '🌊', '✨', '🔥', '💖', '🚀', '🎉', '💯',
  '😀', '😂', '😎', '🥳', '🙌', '👏', '❤️', '💡',
  '🏆', '⚡', '🤝', '🌈', '🤩', '🎯', '☕', '🌟'
];

const CURATED_GIFS = [
  { title: 'Excited Wave', url: 'https://media.giphy.com/media/ASd0Ukj0BC5roG5Lmp/giphy.gif' },
  { title: 'Friendly Hello', url: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif' },
  { title: 'Celebration Confetti', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { title: 'Applause Cheers', url: 'https://media.giphy.com/media/ely3apij36BJhoZ234/giphy.gif' },
  { title: 'Mind Blown', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { title: 'Cool Vibes', url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif' },
  { title: 'High Five', url: 'https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif' },
  { title: 'Party Time', url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' },
];

const PRESET_LOGOS = [
  { label: 'Wave Pulse', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&auto=format&fit=crop&q=80' },
  { label: 'Neon Cyber', url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=200&auto=format&fit=crop&q=80' },
  { label: 'Golden Hour', url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=200&auto=format&fit=crop&q=80' },
  { label: 'Deep Ocean', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&auto=format&fit=crop&q=80' },
  { label: 'Cosmic Star', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&auto=format&fit=crop&q=80' },
  { label: 'City Lights', url: 'https://images.unsplash.com/photo-1477959858617-67f30bc75b82?w=200&auto=format&fit=crop&q=80' }
];

const formatLastSeenTimestamp = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatVoiceDuration = (totalSeconds?: number): string => {
  const safeSecs = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const ChatChannelsView: React.FC<ChatChannelsViewProps> = ({ onOpenCall, initialTargetUserId }) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isSuperAdmin,
    isSubAdmin,
    canTalkToAdmin,
    isProEffective,
    toggleBlockUser,
    reportContent,
    showGlobalToast
  } = useAuth();
  const [isBotReplying, setIsBotReplying] = useState(false);

  // Active channel identifier: can be a groupId (e.g. `grp_...`) or DM id (`dm_...`)
  const [activeChannel, setActiveChannel] = useState<string>('');
  // On mobile/tablet (< 1024px), start on the Chat List screen unless a specific target user was requested
  const [showMobileChannels, setShowMobileChannels] = useState<boolean>(() => {
    if (initialTargetUserId) return false;
    return typeof window !== 'undefined' ? window.innerWidth < 1024 : true;
  });
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const [channelLastSeen, setChannelLastSeen] = useState<Record<string, string>>({});
  const [channelMetaMap, setChannelMetaMap] = useState<Record<string, ChatChannelMeta>>({});
  const [unreadCountsByChannel, setUnreadCountsByChannel] = useState<Record<string, number>>({});
  const [latestMessageByChannel, setLatestMessageByChannel] = useState<
    Record<string, { text: string; senderId: string; senderName: string; createdAt: string }>
  >({});
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChannelMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Real-time typing indicator state: channelId -> Record<userId, TypingStatusEntry>
  const [firestoreChannelTyping, setFirestoreChannelTyping] = useState<
    Record<string, Record<string, TypingStatusEntry>>
  >({});
  const [wsChannelTyping, setWsChannelTyping] = useState<
    Record<string, Record<string, TypingStatusEntry>>
  >({});
  const [wsChannelLastSeen, setWsChannelLastSeen] = useState<
    Record<string, Record<string, string>>
  >({});
  const [typingClockTick, setTypingClockTick] = useState<number>(() => Date.now());
  const chatWsRef = useRef<WebSocket | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcastAtRef = useRef<number>(0);
  const isCurrentlyTypingRef = useRef<boolean>(false);
  const prevActiveChannelRef = useRef<string>('');

  // Media upload & voice note recording in chat
  const [chatMediaUrl, setChatMediaUrl] = useState<string>('');
  const [chatMediaType, setChatMediaType] = useState<'image' | 'video' | 'audio' | 'none'>('none');
  const [chatMediaNotice, setChatMediaNotice] = useState<string | null>(null);
  const chatFileRef = useRef<HTMLInputElement | null>(null);

  // Voice Note MediaRecorder & Speech-to-Text state & refs
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [voiceNoteDuration, setVoiceNoteDuration] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef<number>(0);
  const discardRecordingRef = useRef<boolean>(false);
  const voiceSpeechRecRef = useRef<any>(null);
  const voiceTranscriptRef = useRef<string>('');

  // Popups & pickers
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);

  // Real data: Groups & Registered Members
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [convoFilter, setConvoFilter] = useState<'all' | 'groups' | 'dms'>('all');

  // Group creation modal state
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupLogo, setNewGroupLogo] = useState(PRESET_LOGOS[0].url);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Group Details & Management modal state
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isAddMemberMode, setIsAddMemberMode] = useState(false);
  const [addMemberSelectedId, setAddMemberSelectedId] = useState<string>('');
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [editGroupLogo, setEditGroupLogo] = useState('');
  const editLogoInputRef = useRef<HTMLInputElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatShellRef = useRef<HTMLDivElement | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const isInputFocusedRef = useRef<boolean>(false);
  const wasKeyboardOpenRef = useRef<boolean>(false);

  // Detect virtual keyboard open/close on mobile via window.visualViewport and adjust chat bounds without clipping
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateVisualViewportBounds = () => {
      const isCompactViewport = window.innerWidth < 1024;
      const isConvoScreenOpenOnMobile =
        isCompactViewport && !showMobileChannels && Boolean(activeChannel);

      document.documentElement.setAttribute(
        'data-mobile-chat-convo',
        isConvoScreenOpenOnMobile ? 'open' : 'list'
      );

      const vv = window.visualViewport;
      const vvHeight = vv ? vv.height : window.innerHeight;
      const vvOffsetTop = vv ? vv.offsetTop : 0;
      const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
      const keyboardHeight = Math.max(0, Math.round(layoutHeight - vvHeight - vvOffsetTop));

      const isKeyboardOpen =
        isCompactViewport &&
        (keyboardHeight > 85 || (isInputFocusedRef.current && keyboardHeight > 25));

      document.documentElement.setAttribute(
        'data-keyboard-open',
        isKeyboardOpen ? 'true' : 'false'
      );
      document.documentElement.style.setProperty('--vv-height', `${Math.round(vvHeight)}px`);
      document.documentElement.style.setProperty(
        '--vv-offset-top',
        `${Math.round(vvOffsetTop)}px`
      );
      document.documentElement.style.setProperty('--kb-offset', `${keyboardHeight}px`);

      if (!isCompactViewport) {
        if (chatShellRef.current) {
          chatShellRef.current.style.removeProperty('--chat-visual-height');
        }
        wasKeyboardOpenRef.current = false;
        return;
      }

      // Prevent iOS Safari from scrolling the top header out of the visual viewport when the keyboard opens
      if (isKeyboardOpen && vvOffsetTop > 0) {
        window.scrollTo(0, 0);
      }

      if (chatShellRef.current) {
        if (isConvoScreenOpenOnMobile) {
          chatShellRef.current.style.setProperty('--chat-visual-height', `${Math.round(vvHeight)}px`);
        } else {
          const rect = chatShellRef.current.getBoundingClientRect();
          const topWithinVisual = Math.max(0, Math.round(rect.top));
          const bottomNavReserve = isKeyboardOpen ? 0 : 68;
          const availableHeight = Math.max(
            240,
            Math.floor(vvHeight - topWithinVisual - bottomNavReserve)
          );
          chatShellRef.current.style.setProperty('--chat-visual-height', `${availableHeight}px`);
        }
      }

      // Keep active message area scrolled to the bottom when the virtual keyboard opens or resizes
      if (isKeyboardOpen && (!wasKeyboardOpenRef.current || isInputFocusedRef.current)) {
        window.requestAnimationFrame(() => {
          if (messagesListRef.current) {
            messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
          } else {
            messagesEndRef.current?.scrollIntoView({ block: 'end' });
          }
        });
      }

      wasKeyboardOpenRef.current = isKeyboardOpen;
    };

    updateVisualViewportBounds();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateVisualViewportBounds);
    vv?.addEventListener('scroll', updateVisualViewportBounds);
    window.addEventListener('resize', updateVisualViewportBounds);

    return () => {
      vv?.removeEventListener('resize', updateVisualViewportBounds);
      vv?.removeEventListener('scroll', updateVisualViewportBounds);
      window.removeEventListener('resize', updateVisualViewportBounds);
      document.documentElement.removeAttribute('data-keyboard-open');
      document.documentElement.removeAttribute('data-mobile-chat-convo');
      document.documentElement.style.removeProperty('--vv-height');
      document.documentElement.style.removeProperty('--vv-offset-top');
      document.documentElement.style.removeProperty('--kb-offset');
    };
  }, [activeChannel, showMobileChannels]);

  // 1. Real-time listener for registered users / online members (with dedicated WaveLink Support Bot pinned first)
  useEffect(() => {
    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(
      usersCol,
      (snap) => {
        const otherUsers: UserProfile[] = [];
        snap.forEach((d) => {
          if (d.id !== currentUser?.uid && d.id !== SUPPORT_BOT_ID) {
            otherUsers.push({ id: d.id, ...d.data() } as UserProfile);
          }
        });
        // Sort client-side by createdAt descending so users without createdAt are never excluded
        otherUsers.sort((a, b) => {
          const timeA = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
          const timeB = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
          return timeB - timeA;
        });

        const list: UserProfile[] = [SUPPORT_BOT_PROFILE, ...otherUsers];
        setMembers(list);

        // If target user specified from directory/feed, open that DM immediately
        if (initialTargetUserId && currentUser?.uid) {
          const dmId = computeDmConversationId(currentUser.uid, initialTargetUserId);
          setActiveChannel(dmId);
          setShowMobileChannels(false);
        } else if (
          currentUser?.uid &&
          list.length > 0 &&
          typeof window !== 'undefined' &&
          window.innerWidth >= 1024
        ) {
          // On desktop (>= 1024px), ensure a default conversation is selected if none is active
          setActiveChannel((prev) => {
            if (prev) return prev;
            const firstTarget = list[0];
            return computeDmConversationId(currentUser.uid, firstTarget.id);
          });
        }
      },
      (e) => {
        console.error('[WaveLink Chat] Error loading users directory for chat:', e);
        setMembers([SUPPORT_BOT_PROFILE]);
      }
    );
    return () => unsub();
  }, [currentUser?.uid, initialTargetUserId]);

  // 2. Real-time listener for user-created groups
  useEffect(() => {
    const groupsCol = collection(db, 'groups');
    const unsub = onSnapshot(
      groupsCol,
      (snapshot) => {
        const list: ChatGroup[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ChatGroup);
        });
        list.sort((a, b) => {
          const timeA = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
          const timeB = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
          return timeB - timeA;
        });
        setGroups(list);

        // On desktop, only fallback to a group if the user is a member and no channel is selected
        if (typeof window !== 'undefined' && window.innerWidth >= 1024 && currentUser?.uid) {
          setActiveChannel((prev) => {
            if (prev) return prev;
            const joinedGroup = list.find((g) => g.memberIds?.includes(currentUser.uid));
            return joinedGroup ? joinedGroup.id : '';
          });
        }
      },
      (err) => {
        console.error('[WaveLink Chat] Error loading groups list:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Synthesize any DM participants discovered in `channels` who might not have a document in `users` yet
  const allMembers = React.useMemo(() => {
    if (!currentUser?.uid) return members;
    const knownIds = new Set(members.map((m) => m.id));
    const extraMembers: UserProfile[] = [];

    Object.values(channelMetaMap).forEach((meta) => {
      if (!meta?.id?.startsWith('dm_')) return;
      const otherUid = getOtherDmParticipantId(meta.id, currentUser.uid);
      if (otherUid && otherUid !== currentUser.uid && !knownIds.has(otherUid)) {
        knownIds.add(otherUid);
        extraMembers.push({
          id: otherUid,
          email: `${otherUid.slice(0, 8)}@wavelink.user`,
          username: `@waver_${otherUid.slice(0, 6)}`,
          displayName:
            meta.lastMessageSenderId === otherUid && meta.lastMessageSenderName
              ? meta.lastMessageSenderName
              : `Waver (${otherUid.slice(0, 6)})`,
          photoURL: `https://api.dicebear.com/7.x/shapes/svg?seed=${otherUid}`,
          status: 'active',
          isBanned: false,
          createdAt: meta.updatedAt || new Date().toISOString()
        });
      }
    });

    return extraMembers.length > 0 ? [...members, ...extraMembers] : members;
  }, [members, channelMetaMap, currentUser?.uid]);

  // Determine current active chat item info using deterministic conversationId helpers
  const supportBotChannelId = currentUser?.uid
    ? computeDmConversationId(currentUser.uid, SUPPORT_BOT_ID)
    : '';
  const isDirectMessage = activeChannel.startsWith('dm_');
  const activeGroup = !isDirectMessage ? groups.find((g) => g.id === activeChannel) : null;
  const activeOtherParticipantId =
    isDirectMessage && currentUser?.uid
      ? getOtherDmParticipantId(activeChannel, currentUser.uid)
      : '';
  const directRecipient = isDirectMessage
    ? allMembers.find((m) => m.id === activeOtherParticipantId) ||
      allMembers.find((m) => activeChannel.includes(m.id)) ||
      (activeChannel.includes(SUPPORT_BOT_ID) ? SUPPORT_BOT_PROFILE : null)
    : null;
  const isChattingWithSupportBot =
    isDirectMessage &&
    Boolean(
      (supportBotChannelId && activeChannel === supportBotChannelId) ||
        directRecipient?.id === SUPPORT_BOT_ID ||
        activeChannel.includes(SUPPORT_BOT_ID)
    );
  const isChattingWithSuperAdmin =
    isDirectMessage &&
    !isChattingWithSupportBot &&
    Boolean(directRecipient && isSuperAdminEmail(directRecipient.email, directRecipient.role));
  const isBlockedFromAdminChat = isChattingWithSuperAdmin && !canTalkToAdmin;
  const isRecipientBlocked = Boolean(
    directRecipient &&
      !isChattingWithSupportBot &&
      (userProfile?.blockedUserIds || []).includes(directRecipient.id)
  );

  const isCurrentUserGroupAdmin = activeGroup && currentUser
    ? (activeGroup.adminIds?.includes(currentUser.uid) || activeGroup.creatorId === currentUser.uid || isAdmin)
    : false;

  const isCurrentUserMember = activeGroup && currentUser
    ? activeGroup.memberIds?.includes(currentUser.uid)
    : false;

  // 2b. Real-time listener for all DM channels metadata (lastSeen + typing indicators + lastMessage)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const channelsColRef = collection(db, 'channels');
    const unsub = onSnapshot(
      channelsColRef,
      (snapshot) => {
        const nextTypingMap: Record<string, Record<string, TypingStatusEntry>> = {};
        const nextMetaMap: Record<string, ChatChannelMeta> = {};
        const nextLatestMap: Record<
          string,
          { text: string; senderId: string; senderName: string; createdAt: string }
        > = {};
        const nextBaselineUnread: Record<string, number> = {};

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ChatChannelMeta;
          const chanId = docSnap.id;
          nextMetaMap[chanId] = { ...data, id: chanId };
          if (data?.typing && typeof data.typing === 'object') {
            nextTypingMap[chanId] = data.typing as Record<string, TypingStatusEntry>;
          }
          if (chanId === activeChannel) {
            setChannelLastSeen((data?.lastSeen as Record<string, string>) || {});
          }
          if (data?.lastMessageText && data?.lastMessageSenderId) {
            const msgAt = data.lastMessageAt || data.updatedAt || '';
            nextLatestMap[chanId] = {
              text: data.lastMessageText,
              senderId: data.lastMessageSenderId,
              senderName: data.lastMessageSenderName || 'Waver',
              createdAt: msgAt
            };
            const mySeenIso = data?.lastSeen?.[currentUser.uid] || '';
            const mySeenMs = mySeenIso ? Date.parse(mySeenIso) || 0 : 0;
            const msgMs = msgAt ? Date.parse(msgAt) || 0 : 0;
            if (
              data.lastMessageSenderId !== currentUser.uid &&
              msgMs > mySeenMs &&
              chanId !== activeChannel
            ) {
              nextBaselineUnread[chanId] = Math.max(
                1,
                Number(data?.unreadCounts?.[currentUser.uid] || 1)
              );
            }
          }
        });
        setChannelMetaMap(nextMetaMap);
        setFirestoreChannelTyping(nextTypingMap);
        if (Object.keys(nextLatestMap).length > 0) {
          setLatestMessageByChannel((prev) => ({ ... nextLatestMap, ...prev }));
        }
        if (Object.keys(nextBaselineUnread).length > 0) {
          setUnreadCountsByChannel((prev) => ({ ...nextBaselineUnread, ...prev }));
        }
      },
      (err) => {
        console.warn('[WaveLink Chat] Channels metadata listener notice:', err?.message || err);
      }
    );

    return () => unsub();
  }, [currentUser?.uid, activeChannel]);

  // 2b-ii. Real-time listeners for unread message counts & latest message across active conversations
  const activeDmChannelIdsKey = React.useMemo(() => {
    if (!currentUser?.uid) return '';
    const existingIds = Object.keys(channelMetaMap).filter(
      (id) =>
        id.startsWith('dm_') &&
        (id.startsWith(`dm_${currentUser.uid}_`) || id.endsWith(`_${currentUser.uid}`))
    );
    const botConvId = computeDmConversationId(currentUser.uid, SUPPORT_BOT_ID);
    const combined = Array.from(new Set([botConvId, ...existingIds].filter(Boolean))).slice(0, 10);
    return combined.join(',');
  }, [channelMetaMap, currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubs: Array<() => void> = [];
    const dmConversationIds = activeDmChannelIdsKey
      ? activeDmChannelIdsKey.split(',').filter(Boolean)
      : [];
    const joinedGroupIds = groups
      .filter((g) => g.memberIds?.includes(currentUser.uid))
      .slice(0, 8)
      .map((g) => g.id);

    dmConversationIds.forEach((convId) => {
      const colRef = collection(db, 'channels', convId, 'messages');
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          let unread = 0;
          let latestMsg: ChannelMessage | null = null;
          let latestTimeMs = -1;

          snap.forEach((d) => {
            const msg = { id: d.id, ...d.data() } as ChannelMessage;
            if (msg.isDeleted) return;
            const msgMs = getMessageTimestampMs(msg);
            if (msgMs >= latestTimeMs) {
              latestTimeMs = msgMs;
              latestMsg = msg;
            }
            if (
              msg.senderId !== currentUser.uid &&
              !(msg.readBy || []).includes(currentUser.uid)
            ) {
              unread += 1;
            }
          });

          setUnreadCountsByChannel((prev) => {
            if (prev[convId] === unread) return prev;
            return { ...prev, [convId]: unread };
          });

          if (latestMsg) {
            const finalLatest = latestMsg as ChannelMessage;
            const previewText =
              finalLatest.text ||
              (finalLatest.gifUrl
                ? '[GIF]'
                : finalLatest.mediaType === 'audio' || finalLatest.audioUrl
                ? '🎤 Voice note'
                : finalLatest.mediaUrl
                ? '📷 Media'
                : '');
            setLatestMessageByChannel((prev) => ({
              ...prev,
              [convId]: {
                text: previewText,
                senderId: finalLatest.senderId,
                senderName: finalLatest.senderName || 'Waver',
                createdAt: finalLatest.createdAt || new Date(latestTimeMs || Date.now()).toISOString()
              }
            }));
          }
        },
        () => {}
      );
      unsubs.push(unsub);
    });

    joinedGroupIds.forEach((grpId) => {
      const colRef = collection(db, 'groups', grpId, 'messages');
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          let unread = 0;
          let latestMsg: ChannelMessage | null = null;
          let latestTimeMs = -1;

          snap.forEach((d) => {
            const msg = { id: d.id, ...d.data() } as ChannelMessage;
            if (msg.isDeleted) return;
            const msgMs = getMessageTimestampMs(msg);
            if (msgMs >= latestTimeMs) {
              latestTimeMs = msgMs;
              latestMsg = msg;
            }
            if (
              msg.senderId !== currentUser.uid &&
              !(msg.readBy || []).includes(currentUser.uid)
            ) {
              unread += 1;
            }
          });

          setUnreadCountsByChannel((prev) => {
            if (prev[grpId] === unread) return prev;
            return { ...prev, [grpId]: unread };
          });

          if (latestMsg) {
            const finalLatest = latestMsg as ChannelMessage;
            const previewText =
              finalLatest.text ||
              (finalLatest.gifUrl
                ? '[GIF]'
                : finalLatest.mediaType === 'audio' || finalLatest.audioUrl
                ? '🎤 Voice note'
                : finalLatest.mediaUrl
                ? '📷 Media'
                : '');
            setLatestMessageByChannel((prev) => ({
              ...prev,
              [grpId]: {
                text: previewText,
                senderId: finalLatest.senderId,
                senderName: finalLatest.senderName || 'Member',
                createdAt: finalLatest.createdAt || new Date(latestTimeMs || Date.now()).toISOString()
              }
            }));
          }
        },
        () => {}
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser?.uid, activeDmChannelIdsKey, groups.length]);

  // 2c. Real-time WebSocket connection for instant (<20ms) typing indicators + 1s expiry clock
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setTypingClockTick(Date.now());
    }, 1000);
    return () => clearInterval(tickInterval);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectChatWs = () => {
      if (isUnmounted) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
        const ws = new WebSocket(wsUrl);
        chatWsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          ws.send(
            JSON.stringify({
              type: 'chat:join',
              channelId: activeChannel,
              userId: currentUser.uid,
              name: userProfile?.displayName || currentUser.displayName || 'Waver',
              photoURL:
                userProfile?.photoURL ||
                currentUser.photoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'chat:typing:init' && Array.isArray(payload.entries)) {
              const initMap: Record<string, Record<string, TypingStatusEntry>> = {};
              payload.entries.forEach((entry: any) => {
                if (!entry?.channelId || !entry?.userId) return;
                if (!initMap[entry.channelId]) initMap[entry.channelId] = {};
                initMap[entry.channelId][entry.userId] = {
                  userId: entry.userId,
                  name: entry.name || 'Waver',
                  photoURL: entry.photoURL,
                  isTyping: Boolean(entry.isTyping),
                  updatedAt: entry.updatedAt || new Date().toISOString()
                };
              });
              setWsChannelTyping(initMap);
            } else if (payload.type === 'chat:typing' && payload.channelId && payload.userId) {
              setWsChannelTyping((prev) => {
                const chMap = { ...(prev[payload.channelId] || {}) };
                if (payload.isTyping) {
                  chMap[payload.userId] = {
                    userId: payload.userId,
                    name: payload.name || 'Waver',
                    photoURL: payload.photoURL,
                    isTyping: true,
                    updatedAt: payload.updatedAt || new Date().toISOString()
                  };
                } else {
                  delete chMap[payload.userId];
                }
                return {
                  ...prev,
                  [payload.channelId]: chMap
                };
              });
            } else if (payload.type === 'chat:seen' && payload.channelId && payload.userId) {
              setWsChannelLastSeen((prev) => ({
                ...prev,
                [payload.channelId]: {
                  ...(prev[payload.channelId] || {}),
                  [payload.userId]: payload.seenAt || new Date().toISOString(),
                },
              }));
            }
          } catch {
            // ignore malformed message
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimer = setTimeout(connectChatWs, 3000);
          }
        };
      } catch {
        // Fallback relies on Firestore real-time listener
      }
    };

    connectChatWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (chatWsRef.current) {
        try {
          chatWsRef.current.close();
        } catch {
          // ignore
        }
        chatWsRef.current = null;
      }
    };
  }, [currentUser?.uid]);

  // Broadcast typing state to both WebSocket and Firestore
  const broadcastTypingStatus = (isTyping: boolean, targetChannel?: string) => {
    const channelId = targetChannel || activeChannel;
    if (!channelId || !currentUser?.uid) return;

    const now = Date.now();
    // Throttle repeated `true` broadcasts to once every 1.8s; always send `false` or initial `true` immediately
    if (
      isTyping &&
      isCurrentlyTypingRef.current &&
      now - lastTypingBroadcastAtRef.current < 1800
    ) {
      return;
    }

    isCurrentlyTypingRef.current = isTyping;
    lastTypingBroadcastAtRef.current = isTyping ? now : 0;

    const nowIso = new Date(now).toISOString();
    const senderName = userProfile?.displayName || currentUser.displayName || 'Waver';
    const senderPhotoURL =
      userProfile?.photoURL ||
      currentUser.photoURL ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`;

    // 1. Instant WebSocket broadcast
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
      try {
        chatWsRef.current.send(
          JSON.stringify({
            type: 'chat:typing',
            channelId,
            userId: currentUser.uid,
            name: senderName,
            photoURL: senderPhotoURL,
            isTyping
          })
        );
      } catch {
        // ignore ws send error
      }
    }

    // 2. Real-time Firestore channel/group typing map sync
    const typingEntry: TypingStatusEntry = {
      userId: currentUser.uid,
      name: senderName,
      photoURL: senderPhotoURL,
      isTyping,
      updatedAt: nowIso
    };

    const isDm = channelId.startsWith('dm_');
    const targetDocRef = isDm
      ? doc(db, 'channels', channelId)
      : doc(db, 'groups', channelId);

    setDoc(
      targetDocRef,
      {
        ...(isDm ? { id: channelId, conversationId: channelId } : {}),
        typing: {
          [currentUser.uid]: typingEntry
        }
      },
      { merge: true }
    ).catch(() => {});
  };

  // Clear typing status on previous channel when switching conversations
  useEffect(() => {
    const prevChannel = prevActiveChannelRef.current;
    if (prevChannel && prevChannel !== activeChannel && isCurrentlyTypingRef.current) {
      broadcastTypingStatus(false, prevChannel);
    }
    prevActiveChannelRef.current = activeChannel;

    if (activeChannel && chatWsRef.current?.readyState === WebSocket.OPEN && currentUser?.uid) {
      try {
        chatWsRef.current.send(
          JSON.stringify({
            type: 'chat:join',
            channelId: activeChannel,
            userId: currentUser.uid,
            name: userProfile?.displayName || currentUser.displayName || 'Waver',
            photoURL:
              userProfile?.photoURL ||
              currentUser.photoURL ||
              `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`
          })
        );
      } catch {
        // ignore
      }
    }
  }, [activeChannel]);

  // Handle input text change with automatic typing start/stop lifecycle
  const handleInputTextChange = (nextText: string) => {
    setInputText(nextText);
    if (!activeChannel || !currentUser?.uid) return;

    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    if (nextText.trim().length > 0) {
      broadcastTypingStatus(true);
      typingStopTimeoutRef.current = setTimeout(() => {
        broadcastTypingStatus(false);
      }, 3200);
    } else if (isCurrentlyTypingRef.current) {
      broadcastTypingStatus(false);
    }
  };

  // Helper to get active typing users (excluding currentUser) for any channelId
  const getActiveTypingUsersForChannel = (channelId: string): TypingStatusEntry[] => {
    if (!channelId) return [];
    const mergedByUser = new Map<string, TypingStatusEntry>();
    const TYPING_TTL_MS = 6000;

    // 1. Check group typing map if channelId is a group
    if (!channelId.startsWith('dm_')) {
      const grp = groups.find((g) => g.id === channelId);
      if (grp?.typing) {
        Object.values(grp.typing).forEach((entry) => {
          if (entry && entry.userId !== currentUser?.uid) {
            mergedByUser.set(entry.userId, entry);
          }
        });
      }
    } else {
      // 2. Check DM channel typing map from Firestore
      const dmTyping = firestoreChannelTyping[channelId];
      if (dmTyping) {
        Object.values(dmTyping).forEach((entry) => {
          if (entry && entry.userId !== currentUser?.uid) {
            mergedByUser.set(entry.userId, entry);
          }
        });
      }
    }

    // 3. Merge WebSocket real-time typing entries (takes precedence if newer)
    const wsTyping = wsChannelTyping[channelId];
    if (wsTyping) {
      Object.values(wsTyping).forEach((entry) => {
        if (!entry || entry.userId === currentUser?.uid) return;
        const existing = mergedByUser.get(entry.userId);
        if (
          !existing ||
          new Date(entry.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()
        ) {
          mergedByUser.set(entry.userId, entry);
        }
      });
    }

    // Filter to entries where isTyping === true and updatedAt is within the last 6 seconds
    const activeList: TypingStatusEntry[] = [];
    mergedByUser.forEach((entry) => {
      const updatedMs = new Date(entry.updatedAt).getTime();
      if (entry.isTyping && !isNaN(updatedMs) && typingClockTick - updatedMs < TYPING_TTL_MS) {
        // Enrich name/photo from members list if available
        const memberProfile = allMembers.find((m) => m.id === entry.userId);
        activeList.push({
          ...entry,
          name: memberProfile?.displayName || entry.name || 'Waver',
          photoURL:
            memberProfile?.photoURL ||
            entry.photoURL ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${entry.userId}`
        });
      }
    });

    return activeList;
  };

  const activeChannelTypingUsers = getActiveTypingUsersForChannel(activeChannel);

  // Auto-scroll chat gently when someone starts typing
  useEffect(() => {
    if (activeChannelTypingUsers.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChannelTypingUsers.length]);

  // 3. Real-time onSnapshot message listener for active conversation, ordered by timestamp
  // Loads messages from BOTH participants instantly without filtering by senderId
  useEffect(() => {
    setMessages([]);
    setChatLoadError(null);
    if (!activeChannel) {
      return;
    }

    const isBotChannel = activeChannel.includes(SUPPORT_BOT_ID);
    const messagesCol = isDirectMessage
      ? collection(db, 'channels', activeChannel, 'messages')
      : collection(db, 'groups', activeChannel, 'messages');

    // Primary real-time query ordered by server timestamp; companion query captures any legacy messages that only had createdAt
    const timestampOrderedQuery = query(messagesCol, orderBy('timestamp', 'asc'));
    const legacyOrderedQuery = query(messagesCol, orderBy('createdAt', 'asc'));

    const mergedDocsMap = new Map<string, ChannelMessage>();

    const publishMergedMessages = (sourceLabel: string) => {
      const combined: ChannelMessage[] = [];
      mergedDocsMap.forEach((msgData) => {
        // Ensure Support Bot messages stay strictly inside the WaveLink Support DM channel
        if (
          !isBotChannel &&
          (msgData.senderId === SUPPORT_BOT_ID ||
            msgData.isBotReply ||
            isSupportBotUser(msgData.senderEmail))
        ) {
          return;
        }
        // IMPORTANT: Never filter by currentUser.uid / senderId — include messages from BOTH participants
        combined.push(msgData);
      });

      // Deterministic chronological sort by server timestamp (with createdAt fallback)
      combined.sort((a, b) => getMessageTimestampMs(a) - getMessageTimestampMs(b));

      const myCount = combined.filter((m) => m.senderId === currentUser?.uid).length;
      const otherCount = combined.length - myCount;
      console.log(
        `[WaveLink Chat] Loaded ${combined.length} messages in conversation "${activeChannel}" (${sourceLabel}) — sent by me: ${myCount}, received from other participant(s): ${otherCount}`
      );

      setChatLoadError(null);
      setMessages(combined);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    };

    const handleListenerError = (err: any, queryType: string) => {
      console.error(
        `[WaveLink Chat] Permission or listener error (${queryType}) on conversation "${activeChannel}":`,
        {
          code: err?.code,
          message: err?.message,
          conversationId: activeChannel,
          currentUserId: currentUser?.uid
        }
      );
      const friendlyMsg =
        err?.code === 'permission-denied'
          ? `Permission denied while loading messages for conversation "${activeChannel}". Please verify you are a participant in this conversation.`
          : `Could not load messages (${err?.message || 'connection error'}). Please tap Retry.`;
      setChatLoadError(friendlyMsg);
    };

    const unsubTimestamp = onSnapshot(
      timestampOrderedQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            mergedDocsMap.delete(change.doc.id);
          } else {
            mergedDocsMap.set(change.doc.id, {
              id: change.doc.id,
              ...change.doc.data()
            } as ChannelMessage);
          }
        });
        publishMergedMessages('timestamp-query');
      },
      (err) => {
        handleListenerError(err, 'orderBy-timestamp');
      }
    );

    const unsubLegacy = onSnapshot(
      legacyOrderedQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            mergedDocsMap.delete(change.doc.id);
          } else {
            mergedDocsMap.set(change.doc.id, {
              id: change.doc.id,
              ...change.doc.data()
            } as ChannelMessage);
          }
        });
        publishMergedMessages('createdAt-sync');
      },
      (err) => {
        handleListenerError(err, 'orderBy-createdAt');
      }
    );

    return () => {
      unsubTimestamp();
      unsubLegacy();
    };
  }, [activeChannel, isDirectMessage, currentUser?.uid, retryTrigger]);

  // 4. Track & broadcast lastSeen timestamp and per-message readBy receipts in Firestore
  useEffect(() => {
    if (!activeChannel || !currentUser?.uid) return;
    // On mobile, only mark as seen when the conversation screen is actually open (not when on the Chat List screen)
    if (showMobileChannels && typeof window !== 'undefined' && window.innerWidth < 1024) return;

    const markConversationAsSeen = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const nowIso = new Date().toISOString();

      try {
        // Update channel or group lastSeen map for current user
        if (isDirectMessage) {
          const otherUid = getOtherDmParticipantId(activeChannel, currentUser.uid);
          const participants = Array.from(new Set([currentUser.uid, otherUid].filter(Boolean))).sort();
          await setDoc(
            doc(db, 'channels', activeChannel),
            {
              id: activeChannel,
              conversationId: activeChannel,
              participants,
              lastSeen: { [currentUser.uid]: nowIso },
              unreadCounts: { [currentUser.uid]: 0 },
              updatedAt: nowIso
            },
            { merge: true }
          );
        } else if (isCurrentUserMember) {
          await setDoc(
            doc(db, 'groups', activeChannel),
            {
              lastSeen: { [currentUser.uid]: nowIso }
            },
            { merge: true }
          );
        }

        // Update current user's global lastSeen timestamp
        await setDoc(
          doc(db, 'users', currentUser.uid),
          {
            lastSeen: nowIso,
            lastSeenAt: nowIso,
            isOnline: true
          },
          { merge: true }
        );

        // Respect user privacy preference for sending read receipts (defaults to true)
        const allowSendingReadReceipts = userProfile?.privacySettings?.showReadReceipts !== false;

        if (allowSendingReadReceipts) {
          // Broadcast instant WebSocket read receipt to active participants
          if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
            try {
              chatWsRef.current.send(
                JSON.stringify({
                  type: 'chat:seen',
                  channelId: activeChannel,
                  userId: currentUser.uid,
                  seenAt: nowIso
                })
              );
            } catch {
              // ignore ws send error
            }
          }

          // Also stamp unread incoming messages with currentUser.uid in readBy
          const unreadIncoming = messages.filter(
            (m) =>
              m.senderId !== currentUser.uid &&
              !m.isDeleted &&
              !(m.readBy || []).includes(currentUser.uid)
          );

          for (const msg of unreadIncoming) {
            const msgRef = isDirectMessage
              ? doc(db, 'channels', activeChannel, 'messages', msg.id)
              : doc(db, 'groups', activeChannel, 'messages', msg.id);
            updateDoc(msgRef, {
              readBy: arrayUnion(currentUser.uid),
              lastSeenAt: nowIso
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[WaveLink Chat] Read receipt sync notice:', err);
      }
    };

    markConversationAsSeen();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markConversationAsSeen();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    activeChannel,
    isDirectMessage,
    isCurrentUserMember,
    showMobileChannels,
    currentUser?.uid,
    messages.length,
    userProfile?.privacySettings?.showReadReceipts
  ]);

  // Helper to evaluate whether a message sent by currentUser has been viewed by the recipient(s)
  const getReadReceiptInfo = (
    msg: ChannelMessage
  ): {
    isSeen: boolean;
    seenAt?: string;
    seenCount: number;
    seenByUsers: { id: string; name: string; photoURL: string }[];
  } => {
    const readByOtherIds = (msg.readBy || []).filter((uid) => uid !== msg.senderId);
    const msgTime = getMessageTimestampMs(msg);
    const wsSeenForChannel = wsChannelLastSeen[activeChannel] || {};

    if (isDirectMessage) {
      // Safely extract the recipient UID from directRecipient or dm_<uid1>_<uid2>
      const recipientId =
        directRecipient?.id ||
        msg.receiverId ||
        getOtherDmParticipantId(activeChannel, msg.senderId) ||
        '';
      const recipientLastSeen =
        (recipientId && wsSeenForChannel[recipientId]) ||
        (recipientId ? channelLastSeen[recipientId] : undefined);
      const seenByTimestamp =
        recipientLastSeen && !isNaN(new Date(recipientLastSeen).getTime())
          ? new Date(recipientLastSeen).getTime() >= msgTime
          : false;
      const isBotSeen =
        recipientId === SUPPORT_BOT_ID &&
        messages.some((m) => m.senderId === SUPPORT_BOT_ID && getMessageTimestampMs(m) >= msgTime);
      const isSeen =
        readByOtherIds.includes(recipientId) ||
        readByOtherIds.length > 0 ||
        seenByTimestamp ||
        isBotSeen;

      const seenByUsers =
        isSeen && directRecipient
          ? [
              {
                id: directRecipient.id,
                name: directRecipient.displayName || 'Recipient',
                photoURL:
                  directRecipient.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`,
              },
            ]
          : [];

      return {
        isSeen,
        seenAt: recipientLastSeen || msg.lastSeenAt,
        seenCount: isSeen ? 1 : 0,
        seenByUsers,
      };
    }

    // Group chat: check how many group members have lastSeen >= msg.createdAt or are in readBy
    const groupLastSeen = {
      ...(activeGroup?.lastSeen || {}),
      ...wsSeenForChannel,
    };
    const otherMemberIds = (activeGroup?.memberIds || []).filter((uid) => uid !== msg.senderId);
    const seenMemberIds = new Set<string>(readByOtherIds);
    let latestSeenIso: string | undefined = msg.lastSeenAt;

    otherMemberIds.forEach((memberId) => {
      const memberSeenIso = groupLastSeen[memberId];
      if (memberSeenIso && new Date(memberSeenIso).getTime() >= msgTime) {
        seenMemberIds.add(memberId);
        if (!latestSeenIso || new Date(memberSeenIso).getTime() > new Date(latestSeenIso).getTime()) {
          latestSeenIso = memberSeenIso;
        }
      }
    });

    const seenByUsers = Array.from(seenMemberIds).map((uid) => {
      const profile = members.find((m) => m.id === uid);
      return {
        id: uid,
        name: profile?.displayName || 'Member',
        photoURL: profile?.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${uid}`,
      };
    });

    return {
      isSeen: seenMemberIds.size > 0,
      seenAt: latestSeenIso,
      seenCount: seenMemberIds.size,
      seenByUsers,
    };
  };

  // Handle image or video file upload in chat directly from browser to Cloudinary (monarcking72)
  const handleChatFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      setChatMediaNotice('Please select a valid image or video file.');
      return;
    }

    try {
      setChatMediaNotice(null);
      if (isImage) {
        e.target.value = '';
        setChatMediaNotice('Uploading photo to Cloudinary...');
        const uploadedUrl = await compressImage(file, 1280, 1280, 0.85, (pct) => {
          setChatMediaNotice(`Uploading photo to Cloudinary (${pct}%)...`);
        });
        if (uploadedUrl && uploadedUrl.startsWith('http')) {
          setChatMediaType('image');
          setChatMediaUrl(uploadedUrl);
          setChatMediaNotice(null);
        } else {
          setChatMediaNotice('Could not upload photo to Cloudinary. Please try again.');
        }
      } else {
        const canUploadLarge = Boolean(isProEffective || isAdmin);
        const validation = validateVideoFileSize(file, canUploadLarge);
        if (!validation.valid) {
          e.target.value = '';
          setChatMediaNotice(validation.error || 'Video exceeds your plan upload limit.');
          return;
        }

        const safeVideo = await cloneVideoFileToMemory(file);
        e.target.value = '';
        setChatMediaNotice('Uploading video to Cloudinary (0%)...');
        const chatVidId = `chatvid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const cloudUrl = await uploadVideoChunkedToServer(chatVidId, safeVideo, (pct) => {
          setChatMediaNotice(`Uploading video to Cloudinary (${pct}%)...`);
        });
        if (cloudUrl && cloudUrl.startsWith('http')) {
          setChatMediaType('video');
          setChatMediaUrl(cloudUrl);
          setChatMediaNotice(null);
        } else {
          setChatMediaNotice('Could not upload video to Cloudinary. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('Error uploading chat media to Cloudinary:', err);
      setChatMediaNotice(
        err instanceof Error ? err.message : 'Could not upload media to Cloudinary. Please try again.'
      );
    }
  };

  // Clean up any active voice recording tracks/timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (voiceSpeechRecRef.current) {
        try {
          voiceSpeechRecRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Start recording a voice note via browser MediaRecorder API (+ live speech transcription)
  const startVoiceRecording = async () => {
    if (isRecordingVoice) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setChatMediaNotice('Voice note recording is not supported in this browser.');
      return;
    }

    try {
      setChatMediaNotice(null);
      setShowEmojiPicker(false);
      setShowGifPicker(false);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingSecondsRef.current = 0;
      voiceTranscriptRef.current = '';
      setRecordingSeconds(0);

      // Start optional Web Speech API recognition in parallel so spoken words can be read by AI or previewed
      try {
        const SpeechRec =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += (event.results[i][0]?.transcript || '') + ' ';
            }
            if (transcript.trim()) {
              voiceTranscriptRef.current = transcript.trim();
            }
          };
          rec.onerror = () => {};
          rec.start();
          voiceSpeechRecRef.current = rec;
        }
      } catch {
        // Optional speech recognition
      }

      const candidateMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ];
      const supportedMimeType =
        candidateMimeTypes.find((type) => {
          try {
            return MediaRecorder.isTypeSupported(type);
          } catch {
            return false;
          }
        }) || '';

      const recorderOptions: MediaRecorderOptions = supportedMimeType
        ? { mimeType: supportedMimeType, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 };

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (voiceSpeechRecRef.current) {
          try {
            voiceSpeechRecRef.current.stop();
          } catch {
            // ignore
          }
          voiceSpeechRecRef.current = null;
        }
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }
        setIsRecordingVoice(false);

        if (discardRecordingRef.current || recordingChunksRef.current.length === 0) {
          recordingChunksRef.current = [];
          voiceTranscriptRef.current = '';
          return;
        }

        const finalMimeType = recorder.mimeType || supportedMimeType || 'audio/webm';
        const audioBlob = new Blob(recordingChunksRef.current, { type: finalMimeType });
        recordingChunksRef.current = [];

        const finalSecs = Math.max(1, recordingSecondsRef.current);
        const capturedTranscript = voiceTranscriptRef.current.trim();
        if (capturedTranscript) {
          setInputText((prev) => (prev.trim() ? prev : capturedTranscript));
        }

        const voiceNoteId = `voicenote_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        setChatMediaNotice('Uploading voice note to Cloudinary...');
        uploadVideoChunkedToServer(voiceNoteId, audioBlob, (pct) => {
          setChatMediaNotice(`Uploading voice note to Cloudinary (${pct}%)...`);
        })
          .then((cloudAudioUrl) => {
            if (cloudAudioUrl && cloudAudioUrl.startsWith('http')) {
              setChatMediaType('audio');
              setChatMediaUrl(cloudAudioUrl);
              setVoiceNoteDuration(finalSecs);
              setChatMediaNotice(null);
            } else {
              setChatMediaNotice('Could not upload recorded voice note to Cloudinary.');
            }
          })
          .catch((err) => {
            console.error('Voice note Cloudinary upload error:', err);
            setChatMediaNotice('Could not upload recorded voice note to Cloudinary. Please try again.');
          });
      };

      recorder.start(250);
      setIsRecordingVoice(true);

      // Update timer every second; auto-stop at 90s so the audio clip stays compact
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 90) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      setChatMediaNotice('Microphone access was denied or unavailable. Please allow microphone permissions in your browser to record audio.');
    }
  };

  // Stop recording and load voice note into preview bar
  const stopVoiceRecording = () => {
    discardRecordingRef.current = false;
    if (voiceSpeechRecRef.current) {
      try {
        voiceSpeechRecRef.current.stop();
      } catch {
        // ignore
      }
      voiceSpeechRecRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecordingVoice(false);
    }
  };

  // Cancel and discard current recording
  const cancelVoiceRecording = () => {
    discardRecordingRef.current = true;
    voiceTranscriptRef.current = '';
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (voiceSpeechRecRef.current) {
      try {
        voiceSpeechRecRef.current.stop();
      } catch {
        // ignore
      }
      voiceSpeechRecRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
    recordingChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  // Send message (with XSS sanitization + deterministic conversationId + serverTimestamp + Support Bot response)
  const handleSendMessage = async (customGifUrl?: string) => {
    if ((!inputText.trim() && !customGifUrl && !chatMediaUrl) || !currentUser || !activeChannel) return;
    if (isRecipientBlocked) {
      setChatMediaNotice('You have blocked this user. Unblock them first to send a message.');
      return;
    }

    const sanitizedText = sanitizeUserText(inputText.trim(), 2000);
    const spokenTranscript = sanitizeUserText(voiceTranscriptRef.current.trim(), 2000);
    const wasAudioMessage = chatMediaType === 'audio';
    const isBotConvo = isChattingWithSupportBot;

    // Ensure both users always compute the exact same conversationId (sorted UIDs joined with dm_)
    const rawOtherId = isDirectMessage
      ? directRecipient?.id || getOtherDmParticipantId(activeChannel, currentUser.uid)
      : '';
    const targetChannel =
      isDirectMessage && rawOtherId
        ? computeDmConversationId(currentUser.uid, rawOtherId)
        : activeChannel;
    const receiverId = isDirectMessage ? rawOtherId : targetChannel;
    const participants = isDirectMessage
      ? Array.from(new Set([currentUser.uid, rawOtherId].filter(Boolean))).sort()
      : Array.from(new Set(activeGroup?.memberIds || [currentUser.uid]));

    try {
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const senderDisplayName = userProfile?.displayName || currentUser.displayName || 'Waver';
      const defaultAttachmentLabel = customGifUrl
        ? '[GIF]'
        : chatMediaType === 'audio'
        ? `🎤 Voice note (${formatVoiceDuration(voiceNoteDuration)})`
        : chatMediaUrl
        ? '[Media]'
        : '';
      const rawSnippet = (sanitizedText || defaultAttachmentLabel).replace(/\s+/g, ' ').trim();
      const messagePreview =
        rawSnippet.length > 45 ? `${rawSnippet.substring(0, 45).trim()}…` : rawSnippet;

      const data: Record<string, any> = {
        id: msgId,
        conversationId: targetChannel,
        channelId: targetChannel,
        senderId: currentUser.uid,
        receiverId,
        participants,
        senderEmail: currentUser.email || 'user',
        senderName: senderDisplayName,
        senderUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        senderPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        text: sanitizedText,
        mediaType: chatMediaType,
        isEdited: false,
        isDeleted: false,
        readBy: [currentUser.uid],
        timestamp: serverTimestamp(),
        createdAt: nowIso
      };

      if (chatMediaUrl) {
        data.mediaUrl = chatMediaUrl;
        if (chatMediaType === 'audio') {
          data.audioUrl = chatMediaUrl;
          data.audioDuration = voiceNoteDuration || 1;
        }
      }
      if (customGifUrl) {
        data.gifUrl = customGifUrl;
      }
      if (replyingTo) {
        data.replyToId = replyingTo.id;
        if (replyingTo.text) {
          data.replyToText = sanitizeUserText(replyingTo.text, 120);
        }
        if (replyingTo.senderName) {
          data.replyToSenderName = replyingTo.senderName;
        }
      }

      const docRef = isDirectMessage
        ? doc(db, 'channels', targetChannel, 'messages', msgId)
        : doc(db, 'groups', targetChannel, 'messages', msgId);

      await setDoc(docRef, cleanFirestoreData(data));
      console.log(
        `[WaveLink Chat] Sent message "${msgId}" in conversation "${targetChannel}"`,
        {
          conversationId: targetChannel,
          senderId: currentUser.uid,
          receiverId,
          participants
        }
      );

      // Update conversation metadata document (participants, lastMessage, lastSeen)
      if (isDirectMessage) {
        setDoc(
          doc(db, 'channels', targetChannel),
          {
            id: targetChannel,
            conversationId: targetChannel,
            participants,
            lastMessageText: messagePreview,
            lastMessageSenderId: currentUser.uid,
            lastMessageSenderName: senderDisplayName,
            lastMessageAt: nowIso,
            lastSeen: { [currentUser.uid]: nowIso },
            timestamp: serverTimestamp(),
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {});
      } else {
        setDoc(
          doc(db, 'groups', targetChannel),
          {
            lastMessageText: messagePreview,
            lastMessageSenderId: currentUser.uid,
            lastMessageSenderName: senderDisplayName,
            lastMessageAt: nowIso,
            lastSeen: { [currentUser.uid]: nowIso },
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {});
      }

      if (isDirectMessage && directRecipient && !isBotConvo) {
        sendNotification({
          recipientId: directRecipient.id,
          actorId: currentUser.uid,
          actorName: senderDisplayName,
          actorAvatar: userProfile?.photoURL || currentUser.photoURL || undefined,
          type: 'message',
          title: `New message from ${senderDisplayName} 💬`,
          body: messagePreview,
          entityId: targetChannel,
          actionUrl: 'chat'
        }).catch(console.error);
      } else if (activeGroup && activeGroup.memberIds) {
        const otherMembers = activeGroup.memberIds.filter((mId) => mId !== currentUser.uid).slice(0, 10);
        otherMembers.forEach((memberId) => {
          sendNotification({
            recipientId: memberId,
            actorId: currentUser.uid,
            actorName: senderDisplayName,
            actorAvatar: userProfile?.photoURL || currentUser.photoURL || undefined,
            type: 'message',
            title: `New message in ${activeGroup.name}`,
            body: `${senderDisplayName}: ${messagePreview}`,
            entityId: activeGroup.id,
            actionUrl: 'chat'
          }).catch(console.error);
        });
      }

      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current);
        typingStopTimeoutRef.current = null;
      }
      broadcastTypingStatus(false);

      setInputText('');
      setChatMediaUrl('');
      setChatMediaType('none');
      setVoiceNoteDuration(0);
      voiceTranscriptRef.current = '';
      if (chatFileRef.current) chatFileRef.current.value = '';
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowGifPicker(false);

      // If messaging the dedicated WaveLink Support Bot, invoke server Gemini responder
      const botPromptText =
        sanitizedText ||
        spokenTranscript ||
        (wasAudioMessage ? 'Hello! I just sent you a voice note.' : '');
      if (isBotConvo && botPromptText) {
        const pinnedBotChannel =
          supportBotChannelId || computeDmConversationId(currentUser.uid, SUPPORT_BOT_ID);
        const botParticipants = [currentUser.uid, SUPPORT_BOT_ID].sort();
        setIsBotReplying(true);
        try {
          const historyForBot = messages
            .slice(-12)
            .filter((m) => Boolean(m.text && m.text.trim()))
            .map((m) => ({
              role: m.senderId === SUPPORT_BOT_ID ? 'model' : 'user',
              text: m.text || ''
            }));
          const headers = await getAuthHeaders();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          let botJson: any = null;
          const activeLang: 'en' | 'sw' =
            localStorage.getItem('wavelink_language_pref') === 'sw' ? 'sw' : 'en';
          try {
            const resp = await fetch('/api/support-bot/message', {
              method: 'POST',
              headers,
              signal: controller.signal,
              body: JSON.stringify({
                message: botPromptText,
                channelId: pinnedBotChannel,
                language: activeLang,
                history: historyForBot,
                userPaymentStatus: {
                  isPro: Boolean(isProEffective),
                  proPlan: userProfile?.proPlan || (isProEffective ? 'Pro' : 'Free')
                }
              })
            });
            botJson = await resp.json().catch(() => null);
          } catch {
            // Smart conversational fallback if offline or request timed out
            const lowerQ = botPromptText.toLowerCase().trim();
            let smartFallback =
              activeLang === 'sw'
                ? `Hujambo ${senderDisplayName}! Hapa kuna jibu fupi kuhusu **"${botPromptText.slice(0, 120)}"**:\n\nNaweza kukusaidia kwa maswali yoyote ya kawaida, masomo, kuandika maelezo (captions), au jinsi ya kutumia WaveLink (kama Sparks za saa 24, ujumbe wa sauti, na WaveLink Pro). Niambie ungependa nini!`
                : `Hey ${senderDisplayName}! Here is a helpful answer for **"${botPromptText.slice(0, 120)}"**:\n\nI can help you with any general knowledge question, coding, math, writing captions, or WaveLink features (like 24-hour Sparks, Voice Notes, and WaveLink Pro). Could you share a bit more detail or let me know what you'd like to explore?`;
            if (/^(yo+|hi+|hey+|hello+|sup|mambo|habari|niaje|vipi)[!?. ]*$/i.test(lowerQ)) {
              smartFallback =
                activeLang === 'sw'
                  ? `Mambo vipi ${senderDisplayName}! 👋 Nafurahi kukusikia! Niulize swali lolote—maswali ya kawaida, masomo, uandishi, au vidokezo vya WaveLink. Nikusaidie na nini leo?`
                  : `Hey ${senderDisplayName}! 👋 Great to hear from you! Ask me anything—general questions, coding, math, creative writing, or WaveLink tips. What's on your mind?`;
            } else if (lowerQ.includes('how are you') || lowerQ.includes('how r u') || lowerQ.includes('hali yako')) {
              smartFallback =
                activeLang === 'sw'
                  ? `Niko salama kabisa, ${senderDisplayName}! 😊 Niko tayari kujibu swali lolote ulilo nalo. Nikusaidie vipi leo?`
                  : `I'm doing great, ${senderDisplayName}! 😊 Ready to answer any question you have. How can I help you today?`;
            }
            botJson = {
              success: true,
              reply: smartFallback,
              language: activeLang,
              escalate: false
            };
          } finally {
            clearTimeout(timeoutId);
          }

          if (!botJson || !botJson.success) {
            setChatMediaNotice(
              botJson?.error ||
                (activeLang === 'sw'
                  ? 'WaveLink Support Bot anapumzika kidogo. Tafadhali jaribu tena baada ya muda mfupi.'
                  : 'WaveLink Support Bot is resting right now. Please try again in a moment.')
            );
          } else {
            const botReplyText = String(botJson.reply || '').trim();
            const botLogId = `botlog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const botMsgId = `msg_${Date.now() + 1}_bot`;
            const replyIso = new Date().toISOString();
            const escalatedTicketId = botJson.escalate ? `ticket_${Date.now()}` : undefined;

            // 1. Write the bot's reply message IMMEDIATELY to the pinned WaveLink Support DM channel
            await setDoc(
              doc(db, 'channels', pinnedBotChannel, 'messages', botMsgId),
              cleanFirestoreData({
                id: botMsgId,
                conversationId: pinnedBotChannel,
                channelId: pinnedBotChannel,
                senderId: SUPPORT_BOT_ID,
                receiverId: currentUser.uid,
                participants: botParticipants,
                senderEmail: SUPPORT_BOT_EMAIL,
                senderName: SUPPORT_BOT_NAME,
                senderUsername: SUPPORT_BOT_USERNAME,
                senderPhotoURL: SUPPORT_BOT_AVATAR,
                text: botReplyText,
                mediaType: 'none',
                isEdited: false,
                isDeleted: false,
                isBotReply: true,
                botLogId,
                readBy: [SUPPORT_BOT_ID, currentUser.uid],
                timestamp: serverTimestamp(),
                createdAt: replyIso
              })
            );

            // Clear the bot thinking indicator immediately once the message is in the chat
            setIsBotReplying(false);

            // 2. Run Admin Panel Support Ticket & Bot Log writes in the background without blocking UI
            if (botJson.escalate && escalatedTicketId) {
              const topic = String(botJson.ticketTopic || 'Support Escalation');
              const summary = String(botJson.ticketSummary || sanitizedText).slice(0, 240);
              void setDoc(
                doc(db, 'supportTickets', escalatedTicketId),
                cleanFirestoreData({
                  id: escalatedTicketId,
                  userId: currentUser.uid,
                  userEmail: currentUser.email || 'user',
                  userName: senderDisplayName,
                  subject: `[Support Bot] ${topic}`,
                  topic,
                  summary,
                  message: `User asked WaveLink Support Bot: "${sanitizedText}"\n\nBot Summary: ${summary}`,
                  source: 'support_bot',
                  botConversationId: pinnedBotChannel,
                  status: 'open',
                  createdAt: replyIso
                })
              ).catch(() => {});
            }

            void setDoc(
              doc(db, 'supportBotLogs', botLogId),
              cleanFirestoreData({
                id: botLogId,
                userId: currentUser.uid,
                userEmail: currentUser.email || 'user',
                userName: senderDisplayName,
                channelId: pinnedBotChannel,
                userMessage: sanitizedText,
                botReply: botReplyText,
                language: botJson.language || 'en',
                escalatedToTicketId: escalatedTicketId,
                reportedBadReply: false,
                createdAt: replyIso
              })
            ).catch(() => {});

            // 3. Automatically detect platform upgrade ideas & feature suggestions and save into Founder Feedback
            const upgradeIdea = detectUpgradeIdea(sanitizedText);
            if (upgradeIdea) {
              void recordUpgradeFeedback({
                source: 'support_bot',
                title: upgradeIdea.title,
                summary: upgradeIdea.summary,
                userQuote: sanitizedText,
                category: upgradeIdea.category,
                impact: upgradeIdea.impact,
                userId: currentUser.uid,
                userName: senderDisplayName,
                userEmail: currentUser.email || undefined,
              }).catch(() => {});
            }
          }
        } catch (botErr) {
          console.warn('WaveLink Support Bot notice:', botErr);
        } finally {
          setIsBotReplying(false);
        }
      }
    } catch (err: any) {
      console.error('[WaveLink Chat] Error sending message:', err);
      setChatLoadError(
        err?.code === 'permission-denied'
          ? 'Permission error: Unable to send message in this conversation.'
          : `Failed to send message: ${err?.message || 'Unknown error'}`
      );
      const path = isDirectMessage
        ? `channels/${activeChannel}/messages`
        : `groups/${activeChannel}/messages`;
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Report a bad Support Bot reply for Admin review
  const handleReportBadBotReply = async (msg: ChannelMessage) => {
    if (!currentUser) return;
    try {
      const docRef = doc(db, 'channels', activeChannel, 'messages', msg.id);
      await updateDoc(docRef, { reportedBadReply: true }).catch(() => {});
      if (msg.botLogId) {
        await updateDoc(doc(db, 'supportBotLogs', msg.botLogId), {
          reportedBadReply: true,
          reportReason: 'User flagged this automated bot reply as unhelpful or inaccurate.'
        }).catch(() => {});
      }
      await reportContent({
        targetType: 'bot_reply',
        targetId: msg.botLogId || msg.id,
        targetAuthorId: SUPPORT_BOT_ID,
        targetSummary: msg.text.slice(0, 280),
        reason: 'Reported bad automated Support Bot reply'
      });
    } catch (err) {
      console.warn('Report bot reply notice:', err);
    }
  };

  // Edit message
  const handleSaveEdit = async (messageId: string) => {
    const cleanEdit = sanitizeUserText(editText.trim(), 2000);
    if (!cleanEdit) return;
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);

      await updateDoc(docRef, {
        text: editText.trim(),
        isEdited: true,
        updatedAt: new Date().toISOString()
      });
      setEditingMessageId(null);
      setEditText('');
    } catch (err) {
      const path = isDirectMessage
        ? `channels/${activeChannel}/messages/${messageId}`
        : `groups/${activeChannel}/messages/${messageId}`;
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Delete message / Unsend
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);

      await updateDoc(docRef, {
        isDeleted: true,
        text: 'This message was unsent.',
        mediaUrl: '',
        audioUrl: '',
        gifUrl: '',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      const path = isDirectMessage
        ? `channels/${activeChannel}/messages/${messageId}`
        : `groups/${activeChannel}/messages/${messageId}`;
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Create new user group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !currentUser) return;
    setIsCreatingGroup(true);

    try {
      const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const memberIds = Array.from(new Set([currentUser.uid, ...selectedMemberIds]));
      const nowIso = new Date().toISOString();

      const groupData: ChatGroup = {
        id: groupId,
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
        logoUrl: newGroupLogo || PRESET_LOGOS[0].url,
        creatorId: currentUser.uid,
        creatorName: userProfile?.displayName || currentUser.displayName || 'Wave Creator',
        creatorEmail: currentUser.email || 'user',
        adminIds: [currentUser.uid],
        memberIds: memberIds,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await setDoc(doc(db, 'groups', groupId), cleanFirestoreData(groupData));

      // Post initial welcome message into group chat
      const welcomeMsgId = `msg_init_${Date.now()}`;
      await setDoc(
        doc(db, 'groups', groupId, 'messages', welcomeMsgId),
        cleanFirestoreData({
          id: welcomeMsgId,
          conversationId: groupId,
          channelId: groupId,
          senderId: currentUser.uid,
          receiverId: groupId,
          participants: memberIds,
          senderEmail: currentUser.email || 'system',
          senderName: userProfile?.displayName || currentUser.displayName || 'Group Admin',
          senderUsername: '@admin',
          senderPhotoURL:
            userProfile?.photoURL ||
            currentUser.photoURL ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
          text: `Welcome to ${newGroupName.trim()}! Wave, chat, and share ideas together. 🎉`,
          mediaType: 'none',
          isEdited: false,
          isDeleted: false,
          readBy: [currentUser.uid],
          timestamp: serverTimestamp(),
          createdAt: nowIso
        })
      );

      // Reset modal and select newly created group
      setIsCreateGroupOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setSelectedMemberIds([]);
      setActiveChannel(groupId);
      setShowMobileChannels(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'groups');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Exit / Leave group
  const handleExitGroup = async (group: ChatGroup) => {
    if (!currentUser) return;
    const confirmText = group.creatorId === currentUser.uid
      ? 'You created this group. Are you sure you want to leave it?'
      : `Are you sure you want to exit "${group.name}"?`;

    if (!confirm(confirmText)) return;

    try {
      const newMembers = group.memberIds.filter((id) => id !== currentUser.uid);
      const newAdmins = (group.adminIds || []).filter((id) => id !== currentUser.uid);

      if (newMembers.length === 0) {
        // If last member left, delete group
        await deleteDoc(doc(db, 'groups', group.id));
      } else {
        // If creator left, promote another admin or member
        let newCreatorId = group.creatorId;
        if (group.creatorId === currentUser.uid) {
          newCreatorId = newAdmins[0] || newMembers[0];
          if (!newAdmins.includes(newCreatorId)) {
            newAdmins.push(newCreatorId);
          }
        }

        await updateDoc(doc(db, 'groups', group.id), {
          memberIds: newMembers,
          adminIds: newAdmins,
          creatorId: newCreatorId,
          updatedAt: new Date().toISOString()
        });
      }

      setIsGroupInfoOpen(false);
      // Fallback active channel to next available
      const remaining = groups.filter((g) => g.id !== group.id);
      setActiveChannel(remaining[0]?.id || '');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}`);
    }
  };

  // Add member to group (Admin only)
  const handleAddMemberToGroup = async () => {
    if (!activeGroup || !addMemberSelectedId) return;
    try {
      await updateDoc(doc(db, 'groups', activeGroup.id), {
        memberIds: arrayUnion(addMemberSelectedId),
        updatedAt: new Date().toISOString()
      });
      setAddMemberSelectedId('');
      setIsAddMemberMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${activeGroup.id}`);
    }
  };

  // Remove member from group (Admin only)
  const handleRemoveMemberFromGroup = async (userId: string) => {
    if (!activeGroup || !isCurrentUserGroupAdmin) return;
    if (!confirm('Remove this member from the group?')) return;
    try {
      await updateDoc(doc(db, 'groups', activeGroup.id), {
        memberIds: arrayRemove(userId),
        adminIds: arrayRemove(userId),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${activeGroup.id}`);
    }
  };

  // Toggle Admin status for a member
  const handleToggleAdminStatus = async (userId: string) => {
    if (!activeGroup || !isCurrentUserGroupAdmin) return;
    const isAlreadyAdmin = activeGroup.adminIds?.includes(userId);
    try {
      await updateDoc(doc(db, 'groups', activeGroup.id), {
        adminIds: isAlreadyAdmin ? arrayRemove(userId) : arrayUnion(userId),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${activeGroup.id}`);
    }
  };

  // Save edited group details (Name, Desc, Logo)
  const handleSaveGroupEdit = async () => {
    if (!activeGroup || !editGroupName.trim()) return;
    try {
      await updateDoc(doc(db, 'groups', activeGroup.id), {
        name: editGroupName.trim(),
        description: editGroupDesc.trim() || '',
        logoUrl: editGroupLogo || activeGroup.logoUrl,
        updatedAt: new Date().toISOString()
      });
      setIsEditingGroup(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${activeGroup.id}`);
    }
  };

  // Delete entire group (Admin only)
  const handleDeleteGroup = async () => {
    if (!activeGroup || !isCurrentUserGroupAdmin) return;
    if (!confirm(`Are you sure you want to permanently delete "${activeGroup.name}"? All chat history will be deleted.`)) return;
    try {
      await deleteDoc(doc(db, 'groups', activeGroup.id));
      setIsGroupInfoOpen(false);
      const remaining = groups.filter((g) => g.id !== activeGroup.id);
      setActiveChannel(remaining[0]?.id || '');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${activeGroup.id}`);
    }
  };

  // Upload custom group logo from device directly to Cloudinary
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isForEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const uploadedUrl = await compressImage(file, 512, 512, 0.85);
      if (uploadedUrl && uploadedUrl.startsWith('http')) {
        if (isForEdit) {
          setEditGroupLogo(uploadedUrl);
        } else {
          setNewGroupLogo(uploadedUrl);
        }
      }
    } catch (err) {
      console.error('Logo upload error:', err);
    }
  };

  // Filter & sort conversations so unread or recent conversations surface cleanly
  const filteredGroups = groups
    .filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const unreadA = unreadCountsByChannel[a.id] || 0;
      const unreadB = unreadCountsByChannel[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      const latestA = latestMessageByChannel[a.id]?.createdAt || a.lastMessageAt || a.updatedAt || a.createdAt || '';
      const latestB = latestMessageByChannel[b.id]?.createdAt || b.lastMessageAt || b.updatedAt || b.createdAt || '';
      return (Date.parse(latestB) || 0) - (Date.parse(latestA) || 0);
    });

  const filteredMembers = allMembers
    .filter(
      (m) =>
        (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.username || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (a.id === SUPPORT_BOT_ID) return -1;
      if (b.id === SUPPORT_BOT_ID) return 1;
      if (!currentUser?.uid) return 0;
      const dmA = computeDmConversationId(currentUser.uid, a.id);
      const dmB = computeDmConversationId(currentUser.uid, b.id);
      const unreadA = unreadCountsByChannel[dmA] || 0;
      const unreadB = unreadCountsByChannel[dmB] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      const latestA =
        latestMessageByChannel[dmA]?.createdAt ||
        channelMetaMap[dmA]?.lastMessageAt ||
        channelMetaMap[dmA]?.updatedAt ||
        a.createdAt ||
        '';
      const latestB =
        latestMessageByChannel[dmB]?.createdAt ||
        channelMetaMap[dmB]?.lastMessageAt ||
        channelMetaMap[dmB]?.updatedAt ||
        b.createdAt ||
        '';
      return (Date.parse(latestB) || 0) - (Date.parse(latestA) || 0);
    });

  // Total unread conversations count for header badge
  const totalUnreadMessages = Object.entries(unreadCountsByChannel).reduce(
    (sum, [chId, count]) => (chId === activeChannel && !showMobileChannels ? sum : sum + (count || 0)),
    0
  );

  // On mobile/tablet (< 1024px), show the Chat List screen when showMobileChannels is true or no conversation is active
  const isMobileListScreenVisible = showMobileChannels || !activeChannel;

  return (
    <div className="wavelink-chat-wrapper w-full max-w-full overflow-x-hidden">
      <div
        ref={chatShellRef}
        className="wavelink-chat-shell bg-[var(--bg-surface)] border-y lg:border border-[var(--border-subtle)] shadow-xs w-full max-w-full"
      >
        {/* SCREEN 1 (Mobile Full-Width Chat List Screen; Desktop Left Sidebar >= 1024px) */}
        <div
          className={`w-full lg:w-80 xl:w-96 h-full lg:border-r border-[#EFECE6] flex-col bg-[#FAF7F2] shrink-0 ${
            isMobileListScreenVisible ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Top Bar with Create Group Button */}
          <div className="p-3.5 sm:p-4 border-b border-[#EFECE6] bg-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare size={18} className="text-[#2563EB] shrink-0" />
              <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-[#1C1917] truncate">
                Conversations
              </h3>
              {totalUnreadMessages > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#2563EB] text-white text-[11px] font-extrabold shrink-0">
                  {totalUnreadMessages} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedMemberIds([]);
                  setNewGroupName('');
                  setNewGroupDesc('');
                  setNewGroupLogo(PRESET_LOGOS[0].url);
                  setIsCreateGroupOpen(true);
                }}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs shadow-2xs transition"
                title="Create a new group"
              >
                <Plus size={14} />
                <span>New Group</span>
              </button>
            </div>
          </div>

          {/* Search bar & Filter Tabs */}
          <div className="p-3 border-b border-[#EFECE6] bg-white/80 space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-3.5 text-[#57534E]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search groups or people..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-base sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'groups', 'dms'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setConvoFilter(filter)}
                  className={`flex-1 min-h-[44px] py-2 text-xs font-bold rounded-xl capitalize transition ${
                    convoFilter === filter
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-[#57534E] hover:text-[#1C1917] hover:bg-white'
                  }`}
                >
                  {filter === 'dms' ? 'Direct Chats' : filter}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* User-Created Groups Section */}
            {(convoFilter === 'all' || convoFilter === 'groups') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#57534E] flex items-center gap-1.5">
                    <Users size={13} className="text-[#0D9488]" />
                    <span>User Groups ({filteredGroups.length})</span>
                  </span>
                </div>

                {filteredGroups.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-white border border-dashed border-[#D6D3CD] text-center space-y-2">
                    <p className="text-xs font-medium text-[#57534E]">
                      No groups made yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCreateGroupOpen(true)}
                      className="min-h-[44px] px-3 text-xs text-[#2563EB] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>Create the first group</span>
                    </button>
                  </div>
                ) : (
                  filteredGroups.map((group) => {
                    const isActive = activeChannel === group.id && !showMobileChannels;
                    const isGrpAdmin =
                      group.adminIds?.includes(currentUser?.uid || '') ||
                      group.creatorId === currentUser?.uid;
                    const grpUnread =
                      isActive ? 0 : unreadCountsByChannel[group.id] || 0;
                    const grpLatest = latestMessageByChannel[group.id];

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setActiveChannel(group.id);
                          setReplyingTo(null);
                          setShowMobileChannels(false);
                        }}
                        className={`w-full min-h-[60px] flex items-center gap-3 p-3 rounded-2xl text-left transition relative group border ${
                          isActive
                            ? 'bg-blue-50/95 border-[#2563EB] text-[#1C1917] shadow-2xs'
                            : grpUnread > 0
                            ? 'bg-blue-50/50 border-[#2563EB]/50 text-[#1C1917] shadow-2xs'
                            : 'bg-white/80 text-[#1C1917] border-[#EFECE6] hover:bg-white hover:border-[#D6D3CD]'
                        }`}
                      >
                        {/* Group Custom Logo */}
                        <div className="relative shrink-0">
                          <img
                            src={group.logoUrl || PRESET_LOGOS[0].url}
                            alt={group.name}
                            className={`w-11 h-11 rounded-xl object-cover ring-2 ${
                              isActive ? 'ring-[#2563EB]/40' : 'ring-[#EFECE6]'
                            }`}
                          />
                          {isGrpAdmin && (
                            <span
                              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-amber-500 text-white shadow-2xs"
                              title="You are Group Admin"
                            >
                              <Crown size={10} />
                            </span>
                          )}
                        </div>

                        {/* Group Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-sm text-[#1C1917] truncate">
                              {group.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {grpUnread > 0 && (
                                <>
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wide">
                                    New message
                                  </span>
                                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#2563EB] text-white text-[11px] font-extrabold inline-flex items-center justify-center">
                                    {grpUnread}
                                  </span>
                                </>
                              )}
                              <span className="text-[11px] font-semibold text-[#57534E]">
                                {group.memberIds?.length || 1}m
                              </span>
                            </div>
                          </div>
                          {(() => {
                            const grpTypers = getActiveTypingUsersForChannel(group.id);
                            if (grpTypers.length > 0) {
                              return (
                                <p className="text-xs text-[#0D9488] font-bold truncate mt-0.5 flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.3s]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.15s]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" />
                                  </span>
                                  <span className="truncate">
                                    {grpTypers.length === 1
                                      ? `${grpTypers[0].name.split(' ')[0]} is typing...`
                                      : `${grpTypers.length} people typing...`}
                                  </span>
                                </p>
                              );
                            }
                            if (grpLatest?.text) {
                              return (
                                <p
                                  className={`text-xs truncate mt-0.5 ${
                                    grpUnread > 0
                                      ? 'font-extrabold text-[#1C1917]'
                                      : 'text-[#57534E]'
                                  }`}
                                >
                                  {grpLatest.senderId === currentUser?.uid
                                    ? `You: ${grpLatest.text}`
                                    : `${grpLatest.senderName.split(' ')[0]}: ${grpLatest.text}`}
                                </p>
                              );
                            }
                            return (
                              <p className="text-xs text-[#57534E] truncate mt-0.5">
                                {group.description || `Created by ${group.creatorName}`}
                              </p>
                            );
                          })()}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Direct 1-on-1 Chats Section */}
            {(convoFilter === 'all' || convoFilter === 'dms') && (
              <div className="space-y-1.5 pt-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#57534E] px-2 py-1 flex items-center gap-1.5">
                  <UserIcon size={13} className="text-[#2563EB]" />
                  <span>Direct Chats ({filteredMembers.length})</span>
                </div>
                {filteredMembers.length === 0 ? (
                  <p className="text-xs text-[#57534E] italic px-2 py-2">
                    No other users registered yet.
                  </p>
                ) : (
                  filteredMembers.map((member) => {
                    if (!currentUser) return null;
                    const dmId = computeDmConversationId(currentUser.uid, member.id);
                    const isActive = activeChannel === dmId && !showMobileChannels;
                    const dmTypers = getActiveTypingUsersForChannel(dmId);
                    const isMemberTyping =
                      dmTypers.length > 0 || (member.id === SUPPORT_BOT_ID && isBotReplying);
                    const unreadCount = isActive ? 0 : unreadCountsByChannel[dmId] || 0;
                    const latestMsg = latestMessageByChannel[dmId];
                    const metaLastText = channelMetaMap[dmId]?.lastMessageText;
                    const metaLastSenderId = channelMetaMap[dmId]?.lastMessageSenderId;
                    const previewText = latestMsg?.text || metaLastText || '';
                    const previewSenderId = latestMsg?.senderId || metaLastSenderId || '';

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setActiveChannel(dmId);
                          setReplyingTo(null);
                          setShowMobileChannels(false);
                        }}
                        className={`w-full min-h-[64px] flex items-center gap-3 p-3 rounded-2xl text-left transition border ${
                          isActive
                            ? 'bg-blue-50/95 border-[#2563EB] text-[#1C1917] shadow-2xs'
                            : unreadCount > 0
                            ? 'bg-blue-50/60 border-[#2563EB]/60 text-[#1C1917] shadow-2xs'
                            : 'bg-white/80 text-[#1C1917] border-[#EFECE6] hover:bg-white hover:border-[#D6D3CD]'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={
                              member.photoURL ||
                              `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                            }
                            alt={member.displayName}
                            className="w-11 h-11 rounded-full object-cover ring-2 ring-[#2563EB]/20 shrink-0"
                          />
                          {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-[#2563EB] text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white shadow-xs">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">
                              <CrystalBadge
                                email={member.email}
                                name={member.displayName}
                                isPro={member.isPro}
                                hasBlueStar={member.hasBlueStar || member.isPro}
                                isSubAdmin={member.isSubAdmin || member.role === 'sub_admin'}
                                role={member.role}
                                size="sm"
                              />
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-2xs">
                                  New message
                                </span>
                              )}
                              {isSuperAdminEmail(member.email, member.role) && !canTalkToAdmin ? (
                                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
                                  <Lock size={9} />
                                  <span>Pro</span>
                                </span>
                              ) : isMemberTyping ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 bg-teal-100 text-[#0D9488] border border-teal-300 font-extrabold animate-pulse">
                                  Typing...
                                </span>
                              ) : unreadCount === 0 ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-teal-50 text-[#0D9488] border border-teal-200/70 font-bold">
                                  Live
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {isMemberTyping ? (
                            <span className="text-xs font-bold text-[#0D9488] flex items-center gap-1.5 truncate mt-0.5">
                              <span className="inline-flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" />
                              </span>
                              <span>typing a message...</span>
                            </span>
                          ) : previewText ? (
                            <span
                              className={`text-xs block truncate mt-0.5 ${
                                unreadCount > 0
                                  ? 'font-extrabold text-[#1C1917]'
                                  : 'font-medium text-[#57534E]'
                              }`}
                            >
                              {previewSenderId === currentUser.uid
                                ? `You: ${previewText}`
                                : previewText}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-[#57534E] block truncate mt-0.5">
                              {member.username || `@${(member.email || 'waver').split('@')[0]}`}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* SCREEN 2 (Separate Full-Screen Conversation Screen on Phones < 1024px; Right Pane on Desktop >= 1024px) */}
        <div
          className={`wavelink-mobile-conversation-screen flex-1 flex-col min-w-0 h-full bg-white ${
            isMobileListScreenVisible ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Header Bar with prominent >= 44px Back Button on mobile */}
          <div className="p-2.5 sm:p-4 border-b border-[#EFECE6] bg-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setShowMobileChannels(true)}
                className="lg:hidden min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917] hover:bg-[#EFECE6] flex items-center justify-center gap-1.5 text-xs font-extrabold shrink-0"
                title="Back to Conversations List"
                aria-label="Back to Conversations List"
              >
                <ArrowLeft size={18} className="text-[#2563EB]" />
                <span>Back</span>
              </button>

              {activeGroup ? (
                // Group Chat Header
                <div
                  onClick={() => setIsGroupInfoOpen(true)}
                  className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group/title min-w-0"
                >
                  <img
                    src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                    alt={activeGroup.name}
                    className="w-10 h-10 rounded-2xl object-cover ring-2 ring-[#2563EB]/25 group-hover/title:scale-105 transition shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-extrabold text-sm sm:text-base text-[#1C1917] truncate">
                        {activeGroup.name}
                      </h2>
                      {isCurrentUserGroupAdmin && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80 text-[10px] font-bold flex items-center gap-1">
                          <Crown size={10} />
                          <span>Admin</span>
                        </span>
                      )}
                    </div>
                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-xs text-[#0D9488] truncate flex items-center gap-1.5 font-extrabold mt-0.5">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" />
                        </span>
                        <span className="truncate">
                          {activeChannelTypingUsers.length === 1
                            ? `${activeChannelTypingUsers[0].name} is typing...`
                            : `${activeChannelTypingUsers.map((u) => u.name.split(' ')[0]).join(', ')} are typing...`}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-[#57534E] truncate flex items-center gap-1.5 font-medium">
                        <span>{activeGroup.memberIds?.length || 1} members</span>
                        <span>•</span>
                        <span className="text-[#2563EB] font-semibold group-hover/title:underline">
                          Group Info
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ) : directRecipient ? (
                // Direct Chat Header
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <img
                    src={
                      directRecipient.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`
                    }
                    alt={directRecipient.displayName}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-[#2563EB]/25 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CrystalBadge
                        email={directRecipient.email}
                        name={directRecipient.displayName}
                        isPro={directRecipient.isPro}
                        hasBlueStar={directRecipient.hasBlueStar || directRecipient.isPro}
                        isSubAdmin={
                          directRecipient.isSubAdmin || directRecipient.role === 'sub_admin'
                        }
                        size="md"
                      />
                    </div>
                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-xs text-[#0D9488] truncate mt-0.5 flex items-center gap-1.5 font-extrabold">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" />
                        </span>
                        <span>{directRecipient.displayName.split(' ')[0]} is typing...</span>
                      </p>
                    ) : (
                      <p className="text-xs text-[#57534E] truncate mt-0.5 flex items-center gap-1.5 font-medium">
                        <span className="truncate">{directRecipient.username}</span>
                        <span>•</span>
                        {channelLastSeen[directRecipient.id] ||
                        directRecipient.lastSeen ||
                        directRecipient.lastSeenAt ? (
                          <span className="text-[#0D9488] font-semibold truncate">
                            Last seen{' '}
                            {formatLastSeenTimestamp(
                              channelLastSeen[directRecipient.id] ||
                                directRecipient.lastSeen ||
                                directRecipient.lastSeenAt
                            )}
                          </span>
                        ) : (
                          <span>Direct Message</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MessageSquare size={20} className="text-[#2563EB]" />
                  <span className="font-bold text-sm text-[#1C1917]">
                    Select a group or member to chat
                  </span>
                </div>
              )}
            </div>

            {/* Right Action Icons: Video/Voice Calling, Block & Report for DMs, Group Info for Groups (all >= 44px tap targets) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {isDirectMessage && directRecipient && (
                isChattingWithSupportBot ? (
                  <span className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-[#0D9488] text-xs font-extrabold items-center gap-1.5">
                    <Bot size={14} />
                    <span>Assistant</span>
                  </span>
                ) : isBlockedFromAdminChat ? (
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl bg-amber-50 border border-amber-300/80 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition"
                    title="Try Pro to message or call Admin directly"
                  >
                    <Lock size={14} className="text-amber-600" />
                    <span>Try Pro</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCall('voice', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        })
                      }
                      className="min-w-[44px] min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-[#1C1917] text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0"
                      title="Start Voice Call"
                    >
                      <PhoneCall size={16} className="text-[#0D9488]" />
                      <span className="hidden sm:inline">Voice</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCall('video', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        })
                      }
                      className="min-w-[44px] min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition shrink-0"
                      title="Start Video Call"
                    >
                      <Video size={16} />
                      <span className="hidden sm:inline">Video</span>
                    </button>
                    {!isSuperAdminEmail(directRecipient.email, directRecipient.role) && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleBlockUser(directRecipient.id)}
                          className={`hidden sm:flex min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-bold items-center justify-center gap-1 transition shrink-0 ${
                            isRecipientBlocked
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-[#FAF7F2] hover:bg-rose-50 border-[#EFECE6] text-[#57534E] hover:text-rose-600'
                          }`}
                          title={isRecipientBlocked ? 'Unblock User' : 'Block User'}
                        >
                          <Ban size={14} />
                          <span className="hidden lg:inline">
                            {isRecipientBlocked ? 'Unblocked?' : 'Block'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            reportContent({
                              targetType: 'user',
                              targetId: directRecipient.id,
                              targetAuthorId: directRecipient.id,
                              targetSummary: `${directRecipient.displayName} (${directRecipient.username || directRecipient.email})`,
                              reason: 'Reported user from Direct Messages'
                            })
                          }
                          className="hidden sm:flex min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#EFECE6] text-[#57534E] hover:text-amber-700 text-xs font-bold items-center justify-center gap-1 transition shrink-0"
                          title="Report User"
                        >
                          <Flag size={14} />
                        </button>
                      </>
                    )}
                  </>
                )
              )}

              {activeGroup && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsGroupInfoOpen(true)}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-[#1C1917] text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    title="Group Settings & Members"
                  >
                    <Info size={16} className="text-[#2563EB]" />
                    <span className="hidden sm:inline">Info</span>
                  </button>

                  {isCurrentUserMember && (
                    <button
                      type="button"
                      onClick={() => handleExitGroup(activeGroup)}
                      className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-rose-700 text-xs font-bold flex items-center justify-center gap-1 transition"
                      title="Exit Group"
                    >
                      <LogOut size={15} />
                      <span className="hidden sm:inline">Exit</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Visible Error Banner if loading or syncing conversation messages fails */}
          {chatLoadError && (
            <div
              role="alert"
              className="mx-3 mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center justify-between gap-3 shrink-0 shadow-2xs"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-rose-900">
                    Chat Connection / Permission Notice
                  </p>
                  <p className="text-xs text-rose-800 break-words mt-0.5">
                    {chatLoadError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatLoadError(null);
                  setRetryTrigger((prev) => prev + 1);
                }}
                className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                <RefreshCw size={14} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Messages Feed — Soft Cream Background & Extra Bottom Padding so last message is never hidden */}
          <div
            ref={messagesListRef}
            className="wavelink-chat-messages-list flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-[#FAF7F2]"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#57534E]">
                <div className="p-4 rounded-3xl bg-blue-50 text-[#2563EB] border border-blue-200/60 mb-3">
                  <MessageSquare size={32} />
                </div>
                <h4 className="font-extrabold text-[#1C1917] text-base">
                  No messages yet
                </h4>
                <p className="text-xs sm:text-sm text-[#57534E] max-w-sm mt-1 leading-relaxed">
                  {activeGroup
                    ? `Be the first to start the conversation in ${activeGroup.name}!`
                    : 'Send a wave or photo to start chatting!'}
                </p>
              </div>
            ) : (
              (() => {
                // Identify the most recent outgoing message that has been seen so we can render
                // a rich "Seen by..." indicator with mini avatar(s) directly beneath it.
                let latestSeenOwnMessageId: string | null = null;
                for (let i = messages.length - 1; i >= 0; i--) {
                  const candidate = messages[i];
                  if (candidate.senderId === currentUser?.uid && !candidate.isDeleted) {
                    const info = getReadReceiptInfo(candidate);
                    if (info.isSeen) {
                      latestSeenOwnMessageId = candidate.id;
                      break;
                    }
                  }
                }

                return messages.map((msg) => {
                  const isOwn = msg.senderId === currentUser?.uid;
                  const isEditing = editingMessageId === msg.id;
                  const receipt = isOwn && !msg.isDeleted ? getReadReceiptInfo(msg) : null;
                  const isLatestSeenOwn = isOwn && msg.id === latestSeenOwnMessageId;
                  const msgMs = getMessageTimestampMs(msg);
                  const timeString = (msgMs ? new Date(msgMs) : new Date(msg.createdAt)).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`w-full flex items-start gap-2.5 sm:gap-3 group/msg ${
                        isOwn ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
                      }`}
                    >
                      {/* User Avatar */}
                      <img
                        src={
                          msg.senderPhotoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.senderId}`
                        }
                        alt={msg.senderName}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-[#2563EB]/25 shrink-0 mt-1 bg-white"
                      />

                      {/* Message Bubble Wrapper (Received on LEFT, Mine on RIGHT, up to 80% width on phones) */}
                      <div
                        className={`wavelink-chat-bubble-wrap max-w-[80%] lg:max-w-[70%] min-w-0 flex flex-col ${
                          isOwn ? 'items-end self-end' : 'items-start self-start'
                        }`}
                      >
                        {/* Sender Name & Single Small Admin Badge Header (Strong Contrast) */}
                        <div
                          className={`flex items-center gap-1.5 mb-1 px-1 ${
                            isOwn ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <CrystalBadge
                            email={msg.senderEmail}
                            name={msg.senderName}
                            size="sm"
                          />
                        </div>

                        {/* Reply Reference if replying to another message */}
                        {msg.replyToText && (
                          <div
                            className={`text-xs p-2.5 rounded-xl border-l-3 mb-1.5 w-full ${
                              isOwn
                                ? 'bg-blue-50 border-[#2563EB] text-[#1C1917]'
                                : 'bg-white border-[#0D9488] text-[#1C1917] shadow-2xs'
                            }`}
                          >
                            <span className="font-bold block text-[11px] text-[#2563EB]">
                              Replying to {msg.replyToSenderName || 'message'}:
                            </span>
                            <span className="truncate block text-[#57534E]">
                              {msg.replyToText}
                            </span>
                          </div>
                        )}

                        {/* Message Bubble Card */}
                        <div
                          className={`w-full max-w-full rounded-2xl px-3.5 py-2.5 text-base sm:text-[15px] leading-relaxed relative break-words [overflow-wrap:anywhere] ${
                            msg.isDeleted
                              ? 'italic bg-white/80 border border-[#EFECE6] text-[#57534E]'
                              : isOwn
                              ? 'bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white rounded-tr-xs shadow-xs'
                              : 'bg-white text-[#1C1917] rounded-tl-xs border border-[#EFECE6] shadow-2xs'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-2 w-full min-w-[160px] max-w-full">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full p-2 rounded-xl bg-white text-[#1C1917] text-base sm:text-sm border border-white/40 focus:outline-none"
                              />
                              <div className="flex justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setEditingMessageId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white font-semibold"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(msg.id)}
                                  className="px-3 py-1 rounded-lg bg-white text-[#2563EB] font-bold shadow-2xs"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Media Attachment (Audio Voice Note / Video / Image) */}
                              {(msg.mediaUrl || msg.audioUrl) && !msg.isDeleted && (
                                <div className="mb-2 rounded-xl overflow-hidden w-full max-w-sm">
                                  {msg.mediaType === 'audio' || msg.audioUrl ? (
                                    <div
                                      className={`p-2.5 rounded-xl flex flex-col gap-2 w-full max-w-full ${
                                        isOwn
                                          ? 'bg-white/15 border border-white/25 text-white'
                                          : 'bg-[#FAF7F2] border border-[#E7E2DA] text-[#1C1917]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                              isOwn
                                                ? 'bg-white text-[#2563EB]'
                                                : 'bg-[#2563EB] text-white'
                                            }`}
                                          >
                                            <Volume2 size={14} />
                                          </span>
                                          <span
                                            className={`text-xs font-extrabold ${
                                              isOwn ? 'text-white' : 'text-[#1C1917]'
                                            }`}
                                          >
                                            Voice Note
                                          </span>
                                        </div>
                                        {typeof msg.audioDuration === 'number' && msg.audioDuration > 0 && (
                                          <span
                                            className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                              isOwn
                                                ? 'bg-black/20 text-white'
                                                : 'bg-white border border-[#E7E2DA] text-[#57534E]'
                                            }`}
                                          >
                                            {formatVoiceDuration(msg.audioDuration)}
                                          </span>
                                        )}
                                      </div>
                                      <audio
                                        controls
                                        preload="metadata"
                                        src={msg.audioUrl || msg.mediaUrl}
                                        className="w-full h-9 rounded-lg"
                                      />
                                    </div>
                                  ) : msg.mediaType === 'video' ? (
                                    <video
                                      src={msg.mediaUrl}
                                      controls
                                      className="max-h-60 w-full object-cover rounded-xl"
                                    />
                                  ) : (
                                    <img
                                      src={msg.mediaUrl}
                                      alt="Chat Media"
                                      className="max-h-64 w-full object-cover rounded-xl"
                                    />
                                  )}
                                </div>
                              )}

                              {/* GIF Attachment */}
                              {msg.gifUrl && !msg.isDeleted && (
                                <div className="mb-2 rounded-xl overflow-hidden max-w-xs">
                                  <img
                                    src={msg.gifUrl}
                                    alt="GIF reaction"
                                    className="w-full rounded-xl object-cover"
                                  />
                                </div>
                              )}

                              {msg.text && (
                                <p
                                  className={`whitespace-pre-wrap break-words ${
                                    msg.isDeleted
                                      ? 'text-[#57534E]'
                                      : isOwn
                                      ? 'text-white'
                                      : 'text-[#1C1917]'
                                  }`}
                                >
                                  {msg.text}
                                </p>
                              )}

                              {/* Time & Read Receipt ('Seen' / 'Sent') inside the bubble footer */}
                              <div
                                className={`mt-1.5 flex items-center justify-end gap-1.5 text-[11px] leading-none select-none ${
                                  msg.isDeleted
                                    ? 'text-[#57534E]'
                                    : isOwn
                                    ? 'text-white/95'
                                    : 'text-[#57534E]'
                                }`}
                              >
                                {msg.isEdited && !msg.isDeleted && (
                                  <span className="italic mr-0.5">(edited)</span>
                                )}
                                <span className="font-mono tabular-nums font-medium">
                                  {timeString}
                                </span>
                                {isOwn && !msg.isDeleted && (
                                  <span
                                    className="inline-flex items-center gap-0.5 font-semibold"
                                    title={
                                      receipt?.isSeen
                                        ? `Seen${
                                            receipt.seenByUsers.length > 0
                                              ? ` by ${receipt.seenByUsers.map((u) => u.name).join(', ')}`
                                              : ''
                                          }${
                                            receipt.seenAt
                                              ? ` • ${formatLastSeenTimestamp(receipt.seenAt)}`
                                              : ''
                                          }`
                                        : 'Sent'
                                    }
                                  >
                                    {receipt?.isSeen ? (
                                      <>
                                        <CheckCheck
                                          size={14}
                                          className="text-teal-100 stroke-[2.5] shrink-0"
                                        />
                                        <span className="text-[10px] font-bold text-teal-100">
                                          {!isDirectMessage && receipt.seenCount > 1
                                            ? `Seen (${receipt.seenCount})`
                                            : 'Seen'}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Check
                                          size={13}
                                          className="text-white/85 stroke-[2.25] shrink-0"
                                        />
                                        <span className="text-[10px] text-white/85">Sent</span>
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Dedicated Read Receipt ('Seen') Status Row below the latest seen outgoing message */}
                        {isLatestSeenOwn && receipt?.isSeen && !msg.isDeleted && (
                          <div className="mt-1 flex items-center justify-end gap-1.5 px-1 text-[11px] text-[#0D9488] font-bold select-none">
                            {receipt.seenByUsers.length > 0 && (
                              <div className="flex items-center -space-x-1.5">
                                {receipt.seenByUsers.slice(0, 3).map((u) => (
                                  <img
                                    key={u.id}
                                    src={u.photoURL}
                                    alt={u.name}
                                    className="w-4 h-4 rounded-full object-cover ring-1 ring-white"
                                  />
                                ))}
                              </div>
                            )}
                            <CheckCheck size={13} className="text-[#0D9488] shrink-0" />
                            <span>
                              {isDirectMessage
                                ? 'Seen'
                                : receipt.seenByUsers.length === 1
                                  ? `Seen by ${receipt.seenByUsers[0].name.split(' ')[0]}`
                                  : `Seen by ${receipt.seenCount} members`}
                              {receipt.seenAt ? ` • ${formatLastSeenTimestamp(receipt.seenAt)}` : ''}
                            </span>
                          </div>
                        )}

                        {/* Action buttons on hover */}
                        {!msg.isDeleted && (
                          <div
                            className={`flex items-center gap-1.5 mt-1 opacity-80 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity text-xs text-[#57534E] ${
                              isOwn ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setReplyingTo(msg)}
                              className="p-1 hover:text-[#2563EB] rounded"
                              title="Reply"
                            >
                              <Reply size={13} />
                            </button>
                            {(msg.isBotReply || isSupportBotUser(msg.senderId) || isSupportBotUser(msg.senderEmail)) && (
                              <button
                                type="button"
                                onClick={() => handleReportBadBotReply(msg)}
                                disabled={Boolean(msg.reportedBadReply)}
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition ${
                                  msg.reportedBadReply
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 cursor-default'
                                    : 'bg-white hover:bg-rose-50 text-[#57534E] hover:text-rose-600 border-[#EFECE6]'
                                }`}
                                title="Report a bad or inaccurate bot reply"
                              >
                                <Flag size={11} />
                                <span>{msg.reportedBadReply ? 'Reported for review' : 'Report bad bot reply'}</span>
                              </button>
                            )}
                            {isOwn && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditText(msg.text);
                                  }}
                                  className="p-1 hover:text-[#2563EB] rounded"
                                  title="Edit"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 hover:text-rose-600 rounded"
                                  title="Unsend"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()
            )}

            {/* Support Bot Live Thinking / Replying Indicator — strictly scoped to WaveLink Support DM */}
            {isBotReplying && isChattingWithSupportBot && activeChannel === supportBotChannelId && (
              <div className="flex items-end gap-2.5 animate-in fade-in duration-150 pt-1">
                <img
                  src={SUPPORT_BOT_AVATAR}
                  alt={SUPPORT_BOT_NAME}
                  className="w-7 h-7 rounded-full object-cover ring-2 ring-teal-200 bg-white shadow-2xs"
                />
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white border border-teal-200 shadow-2xs flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#0D9488]">
                    WaveLink Support Bot is answering
                  </span>
                  <span className="inline-flex items-center gap-1 pt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" />
                  </span>
                </div>
              </div>
            )}

            {/* Real-Time Typing Indicator Bubble in the Chat Stream */}
            {activeChannelTypingUsers.length > 0 && (
              <div className="flex items-end gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 pt-1">
                <div className="flex -space-x-2 shrink-0">
                  {activeChannelTypingUsers.slice(0, 3).map((typer) => (
                    <img
                      key={typer.userId}
                      src={
                        typer.photoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${typer.userId}`
                      }
                      alt={typer.name}
                      className="w-7 h-7 rounded-full object-cover ring-2 ring-white bg-white shadow-2xs"
                    />
                  ))}
                </div>
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white border border-[#E7E2DA] shadow-2xs flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#1C1917]">
                    {activeChannelTypingUsers.length === 1
                      ? `${activeChannelTypingUsers[0].name} is typing`
                      : `${activeChannelTypingUsers.map((u) => u.name.split(' ')[0]).join(', ')} are typing`}
                  </span>
                  <span className="inline-flex items-center gap-1 pt-0.5" aria-label="Typing">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-2" />
          </div>

          {/* Replying banner */}
          {replyingTo && (
            <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2 truncate">
                <Reply size={14} className="text-[#2563EB] shrink-0" />
                <span className="text-[#1C1917] font-semibold truncate">
                  Replying to {replyingTo.senderName}: &quot;{replyingTo.text}&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-[#57534E] hover:text-[#1C1917] p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Video / Media Size Limit Notice */}
          {chatMediaNotice && (
            <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-950 font-semibold shrink-0">
              <span>{chatMediaNotice}</span>
              <button
                type="button"
                onClick={() => setChatMediaNotice(null)}
                className="text-amber-700 hover:text-amber-950 p-1 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Selected Media / Voice Note Preview Bar */}
          {chatMediaUrl && (
            <div className="p-3 bg-[#FAF7F2] border-t border-[#EFECE6] flex items-center justify-between gap-3 shrink-0">
              {chatMediaType === 'audio' ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#2563EB] to-[#0D9488] rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs">
                    <Mic size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-extrabold text-[#1C1917]">
                        Voice Note Preview
                      </span>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-[#E7E2DA] text-[#2563EB]">
                        {formatVoiceDuration(voiceNoteDuration)}
                      </span>
                    </div>
                    <audio
                      controls
                      src={chatMediaUrl}
                      className="w-full max-w-xs h-8 rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {chatMediaType === 'video' ? (
                    <div className="w-12 h-12 bg-[#1C1917] rounded-xl flex items-center justify-center text-white">
                      <Film size={20} />
                    </div>
                  ) : (
                    <img
                      src={chatMediaUrl}
                      alt="Preview"
                      className="w-12 h-12 rounded-xl object-cover border border-[#EFECE6]"
                    />
                  )}
                  <div>
                    <span className="text-xs font-bold text-[#1C1917] block">
                      {chatMediaType === 'video' ? 'Video Attachment' : 'Photo Attachment'}
                    </span>
                    <span className="text-[11px] text-[#57534E]">Ready to send</span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setChatMediaUrl('');
                  setChatMediaType('none');
                  setVoiceNoteDuration(0);
                }}
                className="p-2 rounded-xl bg-white border border-[#EFECE6] text-[#57534E] hover:text-rose-600 shrink-0"
                title="Discard attachment"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

          {/* Input & Action Footer Bar — Fixed/pinned at the bottom above the keyboard */}
          <div className="wavelink-chat-input-bar p-2 sm:p-3.5 border-t border-[#EFECE6] bg-white shrink-0">
            {/* Popover Emoji Picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-20 left-2 right-2 sm:right-auto sm:w-80 p-3 bg-white border border-[#EFECE6] rounded-2xl shadow-xl z-30 grid grid-cols-6 sm:grid-cols-8 gap-2">
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      handleInputTextChange(inputText + em);
                      setShowEmojiPicker(false);
                    }}
                    className="min-h-[40px] text-lg p-1.5 hover:scale-125 transition-transform rounded-lg hover:bg-[#FAF7F2]"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Popover GIF Picker */}
            {showGifPicker && (
              <div className="absolute bottom-20 left-2 right-2 sm:left-12 sm:right-auto sm:w-72 p-3 bg-white border border-[#EFECE6] rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EFECE6]">
                  <span className="text-xs font-bold text-[#1C1917]">
                    Pick a GIF
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(false)}
                    className="text-[#57534E] hover:text-[#1C1917] p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CURATED_GIFS.map((g) => (
                    <button
                      key={g.title}
                      type="button"
                      onClick={() => handleSendMessage(g.url)}
                      className="rounded-xl overflow-hidden hover:opacity-90 transition group border border-[#EFECE6]"
                    >
                      <img
                        src={g.url}
                        alt={g.title}
                        className="h-20 w-full object-cover"
                      />
                      <span className="text-[10px] font-medium text-[#57534E] truncate block py-1 px-1.5 bg-[#FAF7F2]">
                        {g.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isBlockedFromAdminChat ? (
              <div className="p-3.5 bg-[#FAF7F2] rounded-2xl border border-[#EFECE6] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-2xs shrink-0">
                    <Lock size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm text-[#1C1917]">
                        Direct Messaging with Admin is a Pro Feature
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] mt-0.5">
                      Try WaveLink Pro to message or call the Platform Administrator directly.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition active:scale-95 shrink-0"
                >
                  <Star size={14} className="fill-white" />
                  <span>Try Pro</span>
                </button>
              </div>
            ) : isRecordingVoice ? (
              <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 rounded-2xl bg-[#FAF7F2] border border-rose-200 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#1C1917] truncate">
                    Recording voice note...
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-white border border-[#E7E2DA] text-rose-600 tabular-nums shrink-0">
                    {formatVoiceDuration(recordingSeconds)}
                  </span>
                  <div className="hidden sm:flex items-center gap-1 px-1" aria-hidden="true">
                    <span className="w-1 h-3 bg-[#2563EB] rounded-full animate-pulse" />
                    <span className="w-1 h-5 bg-[#0D9488] rounded-full animate-pulse [animation-delay:150ms]" />
                    <span className="w-1 h-2.5 bg-[#2563EB] rounded-full animate-pulse [animation-delay:300ms]" />
                    <span className="w-1 h-4 bg-[#0D9488] rounded-full animate-pulse [animation-delay:75ms]" />
                    <span className="w-1 h-3 bg-[#2563EB] rounded-full animate-pulse [animation-delay:225ms]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="min-h-[42px] px-3 rounded-xl bg-white hover:bg-rose-50 border border-[#E7E2DA] text-xs font-bold text-rose-600 flex items-center gap-1.5 transition"
                    title="Cancel recording"
                  >
                    <Trash2 size={15} />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-xs font-extrabold text-white flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                    title="Stop and preview voice note"
                  >
                    <Square size={14} className="fill-white" />
                    <span>Done &amp; Preview</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
                {/* Media Picker Button (From Phone/Folders) */}
                <input
                  type="file"
                  ref={chatFileRef}
                  onChange={handleChatFileSelect}
                  accept="image/*,video/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => chatFileRef.current?.click()}
                  className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center transition shrink-0"
                  title="Attach photo or video from device"
                >
                  <UploadCloud size={18} className="text-[#2563EB]" />
                </button>

                {/* Voice Note Recorder Button (MediaRecorder API) */}
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center transition shrink-0"
                  title="Record a voice note"
                >
                  <Mic size={18} className="text-rose-600" />
                </button>

                {/* Emoji button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmojiPicker((p) => !p);
                    setShowGifPicker(false);
                  }}
                  className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-[#1C1917] flex items-center justify-center transition shrink-0"
                  title="Add Emoji"
                >
                  <Smile size={18} className="text-[#0D9488]" />
                </button>

                {/* GIF button (visible on >= 640px so 360px mobile input box has generous width) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowGifPicker((p) => !p);
                    setShowEmojiPicker(false);
                  }}
                  className="hidden sm:flex min-w-[44px] min-h-[44px] px-2.5 rounded-2xl bg-[#FAF7F2] hover:bg-[#EFECE6] border border-[#EFECE6] text-xs font-extrabold text-[#1C1917] items-center justify-center transition shrink-0"
                  title="Add GIF"
                >
                  GIF
                </button>

                {/* Large, Easy-to-Tap Text Input Field (16px minimum to prevent mobile zoom) */}
                <input
                  ref={chatInputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => handleInputTextChange(e.target.value)}
                  onFocus={() => {
                    isInputFocusedRef.current = true;
                    window.setTimeout(() => {
                      window.visualViewport?.dispatchEvent(new Event('resize'));
                      if (messagesListRef.current) {
                        messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
                      }
                    }, 120);
                  }}
                  onBlur={() => {
                    isInputFocusedRef.current = false;
                    if (isCurrentlyTypingRef.current) {
                      broadcastTypingStatus(false);
                    }
                    window.setTimeout(() => {
                      window.visualViewport?.dispatchEvent(new Event('resize'));
                    }, 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  placeholder={
                    activeGroup
                      ? `Message ${activeGroup.name}...`
                      : directRecipient
                      ? `Message ${directRecipient.displayName}...`
                      : 'Write a message...'
                  }
                  className="flex-1 min-w-0 min-h-[44px] py-2.5 px-3 rounded-2xl bg-[#FAF7F2] border border-[#D6D3CD] text-base text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition"
                />

                {/* Send Button — Primary action in chat thread */}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() && !chatMediaUrl}
                  className="min-w-[44px] min-h-[44px] rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white font-bold disabled:opacity-40 hover:opacity-95 shadow-xs active:scale-95 transition flex items-center justify-center shrink-0"
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          MODAL 1: CREATE NEW GROUP
          ======================================================== */}
      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EFECE6] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFECE6]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#2563EB] text-white shadow-xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#1C1917]">
                    Create New Group
                  </h3>
                  <p className="text-xs text-[#57534E]">
                    You will be the group admin with full controls
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#57534E] hover:text-[#1C1917] hover:bg-[#FAF7F2] transition"
                title="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 max-h-[65dvh] overflow-y-auto pr-1">
              {/* Group Name */}
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                  Group Name *
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Photography Club, Tech Innovators..."
                  className="w-full py-2.5 px-4 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {/* Group Description */}
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  rows={2}
                  placeholder="What is this group all about?"
                  className="w-full py-2 px-4 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {/* Group Logo Customization */}
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-2">
                  Customize Group Logo
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <img
                    src={newGroupLogo}
                    alt="Logo preview"
                    className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#2563EB] shadow-md"
                  />
                  <div>
                    <input
                      type="file"
                      ref={logoInputRef}
                      onChange={(e) => handleLogoUpload(e, false)}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-xs flex items-center gap-1.5 hover:bg-blue-100 transition"
                    >
                      <Camera size={14} />
                      <span>Upload from Device</span>
                    </button>
                    <p className="text-[11px] text-[#57534E] mt-1">
                      Pick any photo from phone or computer
                    </p>
                  </div>
                </div>

                {/* Preset Logos */}
                <span className="text-[11px] text-[#57534E] font-semibold block mb-1.5">
                  Or pick a preset avatar:
                </span>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_LOGOS.map((logo) => (
                    <button
                      key={logo.label}
                      type="button"
                      onClick={() => setNewGroupLogo(logo.url)}
                      className={`relative rounded-xl overflow-hidden ring-2 transition ${
                        newGroupLogo === logo.url
                          ? 'ring-[#2563EB] scale-105'
                          : 'ring-transparent opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={logo.url}
                        alt={logo.label}
                        className="w-full h-11 object-cover"
                      />
                      {newGroupLogo === logo.url && (
                        <div className="absolute inset-0 bg-[#2563EB]/30 flex items-center justify-center text-white">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Members Multi-Select */}
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                  Add People ({selectedMemberIds.length} selected)
                </label>
                {members.length === 0 ? (
                  <p className="text-xs text-[#57534E] italic py-2">
                    No other users registered yet. You will be the sole founding member.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto border border-[#EFECE6] rounded-2xl p-2 bg-[#FAF7F2]">
                    {members.map((member) => {
                      const isSelected = selectedMemberIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                            } else {
                              setSelectedMemberIds((prev) => [...prev, member.id]);
                            }
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition ${
                            isSelected
                              ? 'bg-blue-50 border border-[#2563EB]'
                              : 'hover:bg-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={
                                member.photoURL ||
                                `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                              }
                              alt={member.displayName}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                            <div>
                              <span className="font-bold text-[#1C1917] block">
                                {member.displayName}
                              </span>
                              <span className="text-[11px] text-[#57534E]">
                                {member.username}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                              isSelected
                                ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                : 'border-[#D6D3CD] bg-white'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EFECE6]">
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#57534E] hover:bg-[#FAF7F2] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || isCreatingGroup}
                className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-bold text-xs shadow-xs transition flex items-center gap-2"
              >
                {isCreatingGroup ? (
                  <span>Creating...</span>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Create Group</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: GROUP INFO, ADMIN SETTINGS & MEMBER MANAGEMENT
          ======================================================== */}
      {isGroupInfoOpen && activeGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EFECE6] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#EFECE6]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#2563EB] text-white shadow-xs">
                  <Info size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#1C1917]">
                    Group Details
                  </h3>
                  <p className="text-xs text-[#57534E]">
                    {isCurrentUserGroupAdmin ? 'Admin settings & member roster' : 'Community group info'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsGroupInfoOpen(false);
                  setIsEditingGroup(false);
                  setIsAddMemberMode(false);
                }}
                className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#57534E] hover:text-[#1C1917] hover:bg-[#FAF7F2]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 max-h-[65dvh] overflow-y-auto pr-1">
              {/* Group Banner & Identity */}
              {!isEditingGroup ? (
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                  <img
                    src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                    alt={activeGroup.name}
                    className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#2563EB]/30 shadow-xs shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-base text-[#1C1917] truncate">
                        {activeGroup.name}
                      </h4>
                      {isCurrentUserGroupAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditGroupName(activeGroup.name);
                            setEditGroupDesc(activeGroup.description || '');
                            setEditGroupLogo(activeGroup.logoUrl || PRESET_LOGOS[0].url);
                            setIsEditingGroup(true);
                          }}
                          className="text-xs text-[#2563EB] font-bold hover:underline flex items-center gap-1"
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#57534E] mt-1 leading-relaxed">
                      {activeGroup.description || 'No description provided.'}
                    </p>
                    <p className="text-[11px] text-[#57534E] mt-2 font-mono">
                      Created by {activeGroup.creatorName} •{' '}
                      {new Date(activeGroup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ) : (
                /* Editing Mode (Admin Only) */
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] space-y-3">
                  <h4 className="text-xs font-bold text-[#2563EB]">
                    Customize Group Details
                  </h4>
                  <div>
                    <label className="text-[11px] font-bold text-[#1C1917] block mb-1">
                      Group Name
                    </label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full py-2 px-3 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#1C1917] block mb-1">
                      Description
                    </label>
                    <textarea
                      value={editGroupDesc}
                      onChange={(e) => setEditGroupDesc(e.target.value)}
                      rows={2}
                      className="w-full py-2 px-3 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#1C1917] block mb-1">
                      Change Logo
                    </label>
                    <div className="flex items-center gap-3">
                      <img
                        src={editGroupLogo || activeGroup.logoUrl}
                        alt="Logo"
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-[#2563EB]"
                      />
                      <input
                        type="file"
                        ref={editLogoInputRef}
                        onChange={(e) => handleLogoUpload(e, true)}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => editLogoInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-white border border-[#2563EB]/40 text-xs font-bold text-[#2563EB]"
                      >
                        Upload Photo
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingGroup(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#57534E] hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGroupEdit}
                      className="px-4 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}

              {/* Members Roster Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1C1917]">
                    Members ({activeGroup.memberIds?.length || 1})
                  </span>
                  {isCurrentUserGroupAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAddMemberMode((p) => !p)}
                      className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                    >
                      <UserPlus size={12} />
                      <span>{isAddMemberMode ? 'Close' : '+ Add Member'}</span>
                    </button>
                  )}
                </div>

                {/* Add Member Dropdown if open */}
                {isAddMemberMode && isCurrentUserGroupAdmin && (
                  <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                    <span className="text-[11px] font-bold text-[#2563EB] block">
                      Add a registered user to {activeGroup.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={addMemberSelectedId}
                        onChange={(e) => setAddMemberSelectedId(e.target.value)}
                        className="flex-1 py-2 px-3 rounded-xl bg-white border border-[#D6D3CD] text-xs text-[#1C1917]"
                      >
                        <option value="">Select a member...</option>
                        {members
                          .filter((m) => !activeGroup.memberIds?.includes(m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.displayName} ({m.username})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMemberToGroup}
                        disabled={!addMemberSelectedId}
                        className="px-4 py-2 rounded-xl bg-[#2563EB] disabled:opacity-40 text-white text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Member items */}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {(activeGroup.memberIds || []).map((mId) => {
                    const isSelf = mId === currentUser?.uid;
                    const isGroupCreator = mId === activeGroup.creatorId;
                    const isGroupAdmin = activeGroup.adminIds?.includes(mId) || isGroupCreator;
                    const userObj = members.find((m) => m.id === mId);
                    const name = isSelf
                      ? `${userProfile?.displayName || currentUser?.displayName || 'You'} (You)`
                      : userObj?.displayName || (isGroupCreator ? activeGroup.creatorName : 'Member');
                    const photo = isSelf
                      ? userProfile?.photoURL || currentUser?.photoURL
                      : userObj?.photoURL;

                    return (
                      <div
                        key={mId}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EFECE6] text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={
                              photo ||
                              `https://api.dicebear.com/7.x/shapes/svg?seed=${mId}`
                            }
                            alt={name}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-[#2563EB]/20"
                          />
                          <div>
                            <span className="font-bold text-[#1C1917] block">
                              {name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {isGroupCreator ? (
                                <span className="text-amber-600 font-bold flex items-center gap-0.5">
                                  <Crown size={10} />
                                  <span>Admin</span>
                                </span>
                              ) : isGroupAdmin ? (
                                <span className="text-[#2563EB] font-bold flex items-center gap-0.5">
                                  <Shield size={10} />
                                  <span>Admin</span>
                                </span>
                              ) : (
                                <span className="text-[#57534E]">Member</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin Action Menu for other members */}
                        {isCurrentUserGroupAdmin && !isSelf && !isGroupCreator && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleAdminStatus(mId)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-[#D6D3CD] hover:border-[#2563EB] text-[#1C1917]"
                              title={isGroupAdmin ? 'Revoke Admin' : 'Make Admin'}
                            >
                              {isGroupAdmin ? 'Dismiss Admin' : 'Make Admin'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromGroup(mId)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                              title="Remove from group"
                            >
                              <UserMinus size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Danger Zone: Exit Group or Delete Group */}
              <div className="pt-3 border-t border-[#EFECE6] space-y-2">
                {isCurrentUserMember && (
                  <button
                    type="button"
                    onClick={() => handleExitGroup(activeGroup)}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <LogOut size={14} />
                    <span>Exit Group</span>
                  </button>
                )}

                {isCurrentUserGroupAdmin && (
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#FAF7F2] hover:bg-rose-600 hover:text-white border border-[#EFECE6] text-[#57534E] font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Trash2 size={14} />
                    <span>Delete Group Entirely</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Checkout Modal */}
      {showPaymentModal && (
        <MobileMoneyPaymentModal
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
          }}
        />
      )}
    </div>
  );
};
