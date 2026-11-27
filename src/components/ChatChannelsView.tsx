import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData,
  batchCacheUserProfiles,
  notifyQuotaExceeded,
  isFirestoreQuotaError,
  normalizeUserProfileData,
  recordDiscoveredUserAvatar,
  isPlaceholderAvatarUrl,
  isRealUserPhotoUrl,
  getBestAuthUserPhotoUrl,
  fetchUserProfileCached,
  resolveUserAvatarUrl
} from '../firebase';
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
  limit,
  limitToLast,
  where,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import {
  ChannelMessage,
  UserProfile,
  CallRecipient,
  ChatGroup,
  TypingStatusEntry,
  ChatChannelMeta,
  ChatThemePreference,
  SharedChatThemeSuggestion
} from '../types';
import { QuotaExceededBanner } from './QuotaExceededBanner';
import { CrystalBadge } from './CrystalBadge';
import {
  compressImage,
  validateVideoFileSize,
  cloneVideoFileToMemory,
  uploadVideoChunkedToServer,
  uploadChatFileToCloudinary,
  compressAndUploadChatThemePhoto,
  formatVideoFileSize
} from '../utils/mediaStorage';
import {
  checkClientSpam,
  checkWordFilter,
  sanitizeUserFacingError,
  checkActionRateLimit
} from '../utils/safetyFilters';
import { validateAndModerateText } from '../services/moderationService';
import { ReportContentModal, type ReportModalTarget } from './ReportContentModal';
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
  History,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  PanelRight,
  Bell,
  BellOff,
  FileText,
  Pencil,
  Paperclip,
  Palette,
  Clock,
  Pin,
  Archive,
  MailOpen,
  MoreHorizontal,
  Share2,
  SlidersHorizontal
} from 'lucide-react';
import { ADMIN_EMAIL, isSuperAdminEmail, getAuthHeaders } from '../firebase';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { ChatThemePickerModal } from './ChatThemePickerModal';
import {
  ChatThemeBadgeIcon,
  computeChatThemeVars,
  getChatThemeDisplayName
} from '../utils/chatThemes';
import { sendNotification, toggleFollowUser } from '../services/notificationService';
import { getTeenRestrictionState, triggerParentalAlert } from '../services/parentalService';
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
import { Avatar } from './Avatar';
import { usePresence, usePresenceManager } from '../context/PresenceContext';
import { formatPresenceSubtitle } from '../utils/presenceFormat';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

// Module-level in-memory caches so user profiles, avatars, and groups are read once and reused across tab switches
const chatProfileMemoryCache = new Map<string, UserProfile>();
const checkedDmAvatarChannels = new Set<string>();
const serverResolvedAvatarUids = new Set<string>();
let chatGroupsMemoryCache: ChatGroup[] = [];

const QUICK_REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '🙌', '😮'];
const WAVEFORM_BAR_HEIGHTS = [35, 62, 48, 82, 55, 92, 44, 74, 88, 50, 68, 95, 60, 78, 42, 84, 58, 72, 46, 64];

interface VoiceNoteBubblePlayerProps {
  src: string;
  duration?: number;
  isOwn: boolean;
}

const VoiceNoteBubblePlayer: React.FC<VoiceNoteBubblePlayerProps> = ({ src, duration, isOwn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number>(duration && duration > 0 ? duration : 0);

  useEffect(() => {
    if (duration && duration > 0 && !resolvedDuration) {
      setResolvedDuration(duration);
    }
  }, [duration, resolvedDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (barIndex: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const total = resolvedDuration || audio.duration || 1;
    const ratio = (barIndex + 0.5) / WAVEFORM_BAR_HEIGHTS.length;
    audio.currentTime = ratio * total;
    setProgress(ratio * 100);
    setCurrentTime(audio.currentTime);
  };

  const displaySeconds = isPlaying || currentTime > 0 ? currentTime : resolvedDuration || duration || 1;

  return (
    <div
      className={`wavelink-convo-voice-bar px-3 py-2.5 rounded-2xl flex items-center gap-2.5 w-full min-w-[200px] max-w-[300px] transition ${
        isOwn
          ? 'bg-black/15 border border-white/25 text-white'
          : 'bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)]'
      }`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (d && isFinite(d) && d > 0) setResolvedDuration(Math.round(d));
        }}
        onTimeUpdate={(e) => {
          const cur = e.currentTarget.currentTime;
          const tot = resolvedDuration || e.currentTarget.duration || 1;
          setCurrentTime(cur);
          setProgress(Math.min(100, Math.max(0, (cur / tot) * 100)));
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        style={
          isOwn
            ? {
                backgroundColor: 'var(--chat-sent-text, #FFFFFF)',
                color: 'var(--chat-accent-primary, var(--accent-primary))'
              }
            : {
                backgroundColor: 'var(--chat-accent-primary, var(--accent-primary))',
                color: '#FFFFFF'
              }
        }
        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center shrink-0 shadow-xs transition active:scale-95 cursor-pointer hover:opacity-90"
      >
        {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-[3px] h-7 w-full" role="slider" aria-valuenow={Math.round(progress)}>
          {WAVEFORM_BAR_HEIGHTS.map((h, idx) => {
            const barPct = ((idx + 1) / WAVEFORM_BAR_HEIGHTS.length) * 100;
            const isPlayed = progress >= barPct;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSeek(idx)}
                style={{
                  height: `${h}%`,
                  animationDelay: `${(idx % 5) * 110}ms`
                }}
                className={`flex-1 min-w-[3px] rounded-full transition-all cursor-pointer ${
                  isPlaying ? 'wavelink-waveform-bar--playing' : ''
                } ${
                  isOwn
                    ? isPlayed
                      ? 'bg-current'
                      : 'bg-current opacity-40 hover:opacity-75'
                    : isPlayed
                    ? 'bg-[var(--accent-primary)]'
                    : 'bg-slate-400/45 hover:bg-[var(--accent-primary)]/60'
                }`}
                title="Seek voice note"
              />
            );
          })}
        </div>
        <div className="hidden md:flex items-center justify-between text-[11px] font-mono font-bold leading-none">
          <span className={isOwn ? 'opacity-90' : 'opacity-75'}>
            {isPlaying ? 'Playing...' : 'Voice note'}
          </span>
          <span className="tabular-nums">
            {formatVoiceDuration(displaySeconds)}
          </span>
        </div>
      </div>

      <span className="flex md:hidden items-center text-[11px] font-mono font-bold tabular-nums shrink-0 pr-0.5 opacity-90">
        {formatVoiceDuration(displaySeconds)}
      </span>
    </div>
  );
};

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
  initialTargetChannelId?: string;
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

const formatCompactConvoTime = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return '1m';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((todayStart - msgDayStart) / 86400000);
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatVoiceDuration = (totalSeconds?: number): string => {
  const safeSecs = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const getCalendarDayKey = (ms: number): string => {
  if (!ms) return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const formatChatDateLabel = (ms: number): string => {
  if (!ms) return 'Today';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return 'Today';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - msgDayStart) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'long' });
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  });
};

interface ChatPersonGridCardProps {
  person: UserProfile;
  language: 'en' | 'sw';
  compact?: boolean;
  isFollowed?: boolean;
  onToggleFollow?: (person: UserProfile) => void;
  onSelect: (uid: string) => void;
  onStartCall?: (person: UserProfile, type: 'voice' | 'video') => void;
}

const ChatPersonGridCard: React.FC<ChatPersonGridCardProps> = ({
  person,
  language,
  compact = false,
  isFollowed = false,
  onToggleFollow,
  onSelect,
  onStartCall
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const isBot = person.id === SUPPORT_BOT_ID;

  useEffect(() => {
    const el = cardRef.current;
    if (!el || isBot || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) setInView(entries[0].isIntersecting);
      },
      { rootMargin: '60px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isBot]);

  const presence = usePresence(!isBot && inView ? person.id : undefined, person);
  const isOnline = presence.status === 'online';
  const showPresenceText =
    !isBot && (presence.status === 'online' || presence.status === 'offline');
  const subtitle = isBot
    ? '24/7 Assistant'
    : showPresenceText
    ? formatPresenceSubtitle({
        isOnline,
        lastChanged: presence.lastChanged,
        lastSeenIso: person.lastSeenAt || person.lastSeen,
        language,
        showLastSeen: presence.canShowLastSeen
      })
    : person.username || 'WaveLink';

  if (compact) {
    return (
      <div
        ref={cardRef}
        onClick={() => onSelect(person.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(person.id);
        }}
        className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] flex flex-col items-center text-center gap-1.5 transition hover:-translate-y-0.5 cursor-pointer"
      >
        <div className="relative shrink-0">
          <Avatar
            uid={person.id}
            src={
              person.photoURL ||
              `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
            }
            alt={person.displayName}
            fallbackName={person.displayName}
            size={44}
            showStatus={!isBot}
            targetProfile={person}
            className="ring-2 ring-[var(--accent-primary)]/35 rounded-full"
          />
          {isBot && (
            <span
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
              title="24/7 Assistant"
            />
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="text-xs font-extrabold text-[var(--text-primary)] truncate">
            {person.displayName}
          </p>
          <p
            className={`text-[10px] font-semibold truncate ${
              isBot || isOnline
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {subtitle}
          </p>
        </div>
        <span
          className="w-full py-1 px-2 rounded-xl text-[10px] font-extrabold text-white"
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
          }}
        >
          Message
        </span>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      onClick={() => onSelect(person.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(person.id);
      }}
      className="p-3 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] shadow-2xs flex flex-col items-center text-center gap-2 transition hover:-translate-y-0.5 cursor-pointer"
    >
      <div
        className="relative p-[2px] rounded-full"
        style={{
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
        }}
      >
        <Avatar
          uid={person.id}
          src={
            person.photoURL ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
          }
          alt={person.displayName}
          fallbackName={person.displayName}
          size={56}
          showStatus={!isBot}
          targetProfile={person}
          imageClassName="border-2 border-[var(--bg-surface)]"
        />
        {isBot && (
          <span
            className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
            title="24/7 Assistant"
          />
        )}
      </div>

      <div className="w-full min-w-0">
        <p className="text-xs font-extrabold text-[var(--text-primary)] truncate">
          {person.displayName}
        </p>
        <p
          className={`text-[11px] font-semibold truncate mt-0.5 ${
            isBot || isOnline
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          {subtitle}
        </p>
      </div>

      <div className="w-full flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(person.id);
          }}
          className="flex-1 min-h-[40px] py-1.5 px-2.5 rounded-2xl text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
          }}
        >
          <MessageSquare size={13} />
          <span>Chat</span>
        </button>

        {!isBot && onToggleFollow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow(person);
            }}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-2xl border text-[11px] font-extrabold flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer ${
              isFollowed
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-hairline)] hover:border-[var(--accent-primary)]'
            }`}
            title={isFollowed ? `Unfollow ${person.displayName}` : `Follow ${person.displayName}`}
          >
            {isFollowed ? <Check size={13} /> : <UserPlus size={13} />}
            <span>{isFollowed ? 'Following' : 'Follow'}</span>
          </button>
        )}

        {!isBot && onStartCall && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartCall(person, 'voice');
              }}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-2xl bg-[var(--bg-subtle)] hover:border-emerald-500/50 border border-[var(--border-hairline)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition active:scale-95 cursor-pointer"
              title={`Voice call ${person.displayName}`}
              aria-label={`Voice call ${person.displayName}`}
            >
              <PhoneCall size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartCall(person, 'video');
              }}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--accent-primary)] flex items-center justify-center transition active:scale-95 cursor-pointer"
              title={`Video call ${person.displayName}`}
              aria-label={`Video call ${person.displayName}`}
            >
              <Video size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatChannelsView: React.FC<ChatChannelsViewProps> = ({
  onOpenCall,
  initialTargetUserId,
  initialTargetChannelId
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isSuperAdmin,
    isSubAdmin,
    canTalkToAdmin,
    isProEffective,
    updateUserProfile,
    toggleBlockUser,
    reportContent,
    showGlobalToast
  } = useAuth();
  const { language } = useLanguage();
  const { activeTheme, isDarkTheme } = useTheme();
  const { getCachedIsOnline, setTyping: setRtdbTyping, subscribeTyping: subscribeRtdbTyping } =
    usePresenceManager();
  const [isBotReplying, setIsBotReplying] = useState(false);

  // Active channel identifier: can be a groupId (e.g. `grp_...`) or DM id (`dm_...`)
  const [activeChannel, setActiveChannel] = useState<string>(() => initialTargetChannelId || '');
  // On mobile/tablet (< 1024px), start on the Chat List screen unless a specific target user or channel was requested
  const [showMobileChannels, setShowMobileChannels] = useState<boolean>(() => {
    if (initialTargetUserId || initialTargetChannelId) return false;
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
  const [chatReportTarget, setChatReportTarget] = useState<ReportModalTarget | null>(null);

  // Real-time typing indicator state: channelId -> Record<userId, TypingStatusEntry>
  const [firestoreChannelTyping, setFirestoreChannelTyping] = useState<
    Record<string, Record<string, TypingStatusEntry>>
  >({});
  const [wsChannelTyping, setWsChannelTyping] = useState<
    Record<string, Record<string, TypingStatusEntry>>
  >({});
  const [rtdbChannelTyping, setRtdbChannelTyping] = useState<
    Record<string, Record<string, number>>
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

  // Optional "Online first" sorting toggle in Chat Home
  const [onlineFirstSort, setOnlineFirstSort] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_chat_online_first') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleOnlineFirstSort = () => {
    setOnlineFirstSort((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wavelink_chat_online_first', String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  // Media upload & voice note recording in chat
  const [chatMediaUrl, setChatMediaUrl] = useState<string>('');
  const [chatMediaUrls, setChatMediaUrls] = useState<string[]>([]);
  const [chatMediaType, setChatMediaType] = useState<'image' | 'video' | 'audio' | 'file' | 'none'>('none');
  const [chatFileName, setChatFileName] = useState<string>('');
  const [chatFileSize, setChatFileSize] = useState<number>(0);
  const [chatMediaNotice, setChatMediaNotice] = useState<string | null>(null);
  const [chatUploadProgress, setChatUploadProgress] = useState<number | null>(null);
  const chatFileRef = useRef<HTMLInputElement | null>(null);
  const chatAnyFileRef = useRef<HTMLInputElement | null>(null);

  // Mobile (< 768px) two-state bottom bar + hold-to-record refs
  const [isMobileComposerOpen, setIsMobileComposerOpen] = useState<boolean>(false);
  const micHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasMicHeldRef = useRef<boolean>(false);

  // Mobile (< 768px) Chat Home collapsible header on scroll down / up
  const [isMobileChatHeaderHidden, setIsMobileChatHeaderHidden] = useState<boolean>(false);
  const chatHomeHeaderRef = useRef<HTMLDivElement | null>(null);
  const chatHomeScrollRef = useRef<HTMLDivElement | null>(null);
  const lastChatListScrollTopRef = useRef<number>(0);
  const chatListScrollRafRef = useRef<number | null>(null);

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

  // Popups, pickers, reactions, lightbox & desktop right panel
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showMobileAttachTray, setShowMobileAttachTray] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [previewChatTheme, setPreviewChatTheme] = useState<ChatThemePreference | null>(null);
  const [showDesktopRightPanel, setShowDesktopRightPanel] = useState(true);
  const [reactionMenuMsgId, setReactionMenuMsgId] = useState<string | null>(null);
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTouchStartRef = useRef<{ x: number; y: number; msgId: string } | null>(null);

  // Per-chat theme preferences cached locally + synced from already-subscribed userProfile
  const [localChatThemes, setLocalChatThemes] = useState<Record<string, ChatThemePreference>>(() => {
    try {
      if (typeof window !== 'undefined' && currentUser?.uid) {
        const raw = localStorage.getItem(`wavelink_chat_themes_${currentUser.uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch {
      // ignore localStorage read errors
    }
    return userProfile?.chatThemes || {};
  });

  useEffect(() => {
    if (!currentUser?.uid) return;
    if (userProfile?.chatThemes && typeof userProfile.chatThemes === 'object') {
      setLocalChatThemes(userProfile.chatThemes);
      try {
        localStorage.setItem(
          `wavelink_chat_themes_${currentUser.uid}`,
          JSON.stringify(userProfile.chatThemes)
        );
      } catch {
        // ignore storage quota errors
      }
    } else {
      try {
        const raw = localStorage.getItem(`wavelink_chat_themes_${currentUser.uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') setLocalChatThemes(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, [currentUser?.uid, userProfile?.chatThemes]);

  useEffect(() => {
    setPreviewChatTheme(null);
    setIsThemePickerOpen(false);
  }, [activeChannel]);

  const [groups, setGroups] = useState<ChatGroup[]>(() =>
    chatGroupsMemoryCache.length > 0 ? chatGroupsMemoryCache : []
  );
  const [members, setMembers] = useState<UserProfile[]>(() => {
    if (chatProfileMemoryCache.size > 0) {
      const cached = Array.from(chatProfileMemoryCache.values()).filter(
        (u) => u.id !== currentUser?.uid && u.id !== SUPPORT_BOT_ID
      );
      return [SUPPORT_BOT_PROFILE, ...cached];
    }
    return [SUPPORT_BOT_PROFILE];
  });
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(
    () => chatProfileMemoryCache.size === 0
  );
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [convoFilter, setConvoFilter] = useState<'chats' | 'people' | 'groups'>('chats');
  const [inboxTab, setInboxTab] = useState<'inbox' | 'unread' | 'requests' | 'groups' | 'archived'>('inbox');
  const [messageLimit, setMessageLimit] = useState<number>(30);
  const [convoDisplayLimit, setConvoDisplayLimit] = useState<number>(20);
  const [convoFetchLimit, setConvoFetchLimit] = useState<number>(20);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [searchedAllowedUserIds, setSearchedAllowedUserIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_searched_chat_uids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Derive followingMap directly from already-loaded userProfile.followingIds (0 extra Firestore reads)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const baseMap: Record<string, boolean> = {};
    (userProfile?.followingIds || []).forEach((fId) => {
      if (fId) baseMap[fId] = true;
    });
    setFollowingMap((prev) => ({ ...prev, ...baseMap }));
  }, [currentUser?.uid, userProfile?.followingIds]);

  useEffect(() => {
    if (initialTargetUserId) {
      setSearchedAllowedUserIds((prev) => {
        if (prev.includes(initialTargetUserId)) return prev;
        const next = [initialTargetUserId, ...prev].slice(0, 100);
        try {
          localStorage.setItem('wavelink_searched_chat_uids', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [initialTargetUserId]);

  const handleToggleFollowInChat = async (targetPerson: UserProfile) => {
    if (!currentUser) return;
    const currentlyFollowed = Boolean(
      followingMap[targetPerson.id] || (userProfile?.followingIds || []).includes(targetPerson.id)
    );
    const nextState = !currentlyFollowed;
    setFollowingMap((prev) => ({ ...prev, [targetPerson.id]: nextState }));

    const currentIds = Array.from(
      new Set([
        ...(userProfile?.followingIds || []),
        ...Object.keys(followingMap).filter((k) => followingMap[k])
      ])
    );
    const nextIds = nextState
      ? Array.from(new Set([...currentIds, targetPerson.id]))
      : currentIds.filter((id) => id !== targetPerson.id);

    updateUserProfile({ followingIds: nextIds }).catch(() => {});
    try {
      const serverResult = await toggleFollowUser(
        currentUser.uid,
        userProfile?.displayName || currentUser.displayName || 'A waver',
        targetPerson.id,
        targetPerson.displayName
      );
      setFollowingMap((prev) => ({ ...prev, [targetPerson.id]: serverResult }));
      showGlobalToast(
        serverResult
          ? `You are now following ${targetPerson.displayName}! You can text them anytime.`
          : `Unfollowed ${targetPerson.displayName}.`
      );
    } catch {
      // keep optimistic update
    }
  };

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
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const newChatInputRef = useRef<HTMLInputElement | null>(null);
  const isInputFocusedRef = useRef<boolean>(false);
  const wasKeyboardOpenRef = useRef<boolean>(false);
  const isLoadingOlderRef = useRef<boolean>(false);
  const prevScrollHeightRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);
  const lastScrolledChannelRef = useRef<string>('');

  // Per-channel mute preference persisted locally & synced to Firestore users/{uid}.mutedChannelIds
  const [mutedChannelIds, setMutedChannelIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_muted_channels');
      const parsed = raw ? JSON.parse(raw) : [];
      const fromProfile = Array.isArray(userProfile?.mutedChannelIds) ? userProfile!.mutedChannelIds : [];
      return Array.from(new Set([...parsed, ...fromProfile]));
    } catch {
      return Array.isArray(userProfile?.mutedChannelIds) ? userProfile!.mutedChannelIds : [];
    }
  });

  useEffect(() => {
    if (Array.isArray(userProfile?.mutedChannelIds)) {
      setMutedChannelIds((prev) => {
        const merged = Array.from(new Set([...userProfile!.mutedChannelIds!, ...prev])).slice(0, 200);
        try {
          localStorage.setItem('wavelink_muted_channels', JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      });
    }
  }, [userProfile?.mutedChannelIds]);

  const toggleMuteChannel = (channelId: string) => {
    if (!channelId) return;
    setMutedChannelIds((prev) => {
      const isMutedNow = prev.includes(channelId);
      const next = isMutedNow
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId].slice(0, 200);
      try {
        localStorage.setItem('wavelink_muted_channels', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      updateUserProfile({ mutedChannelIds: next }).catch(() => {});
      showGlobalToast(isMutedNow ? 'Notifications unmuted for this chat.' : 'Chat notifications muted.');
      return next;
    });
  };

  // Per-channel pin preference persisted locally & synced to users/{uid}.pinnedChannelIds
  const [pinnedChannelIds, setPinnedChannelIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_pinned_channels');
      const parsed = raw ? JSON.parse(raw) : [];
      const fromProfile = Array.isArray(userProfile?.pinnedChannelIds) ? userProfile!.pinnedChannelIds : [];
      return Array.from(new Set([...parsed, ...fromProfile]));
    } catch {
      return Array.isArray(userProfile?.pinnedChannelIds) ? userProfile!.pinnedChannelIds : [];
    }
  });

  useEffect(() => {
    if (Array.isArray(userProfile?.pinnedChannelIds)) {
      setPinnedChannelIds((prev) => {
        const merged = Array.from(new Set([...userProfile!.pinnedChannelIds!, ...prev])).slice(0, 100);
        try {
          localStorage.setItem('wavelink_pinned_channels', JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      });
    }
  }, [userProfile?.pinnedChannelIds]);

  const togglePinChannel = (channelId: string) => {
    if (!channelId) return;
    setPinnedChannelIds((prev) => {
      const isPinnedNow = prev.includes(channelId);
      const next = isPinnedNow
        ? prev.filter((id) => id !== channelId)
        : [channelId, ...prev].slice(0, 100);
      try {
        localStorage.setItem('wavelink_pinned_channels', JSON.stringify(next));
      } catch {
        // ignore
      }
      updateUserProfile({ pinnedChannelIds: next }).catch(() => {});
      showGlobalToast(isPinnedNow ? 'Conversation unpinned.' : 'Conversation pinned to top.');
      return next;
    });
  };

  // Per-channel archive preference persisted locally & synced to users/{uid}.archivedChannelIds
  const [archivedChannelIds, setArchivedChannelIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_archived_channels');
      const parsed = raw ? JSON.parse(raw) : [];
      const fromProfile = Array.isArray(userProfile?.archivedChannelIds) ? userProfile!.archivedChannelIds : [];
      return Array.from(new Set([...parsed, ...fromProfile]));
    } catch {
      return Array.isArray(userProfile?.archivedChannelIds) ? userProfile!.archivedChannelIds : [];
    }
  });

  useEffect(() => {
    if (Array.isArray(userProfile?.archivedChannelIds)) {
      setArchivedChannelIds((prev) => {
        const merged = Array.from(new Set([...userProfile!.archivedChannelIds!, ...prev])).slice(0, 200);
        try {
          localStorage.setItem('wavelink_archived_channels', JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      });
    }
  }, [userProfile?.archivedChannelIds]);

  const toggleArchiveChannel = (channelId: string) => {
    if (!channelId) return;
    setArchivedChannelIds((prev) => {
      const isArchivedNow = prev.includes(channelId);
      const next = isArchivedNow
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId].slice(0, 200);
      try {
        localStorage.setItem('wavelink_archived_channels', JSON.stringify(next));
      } catch {
        // ignore
      }
      updateUserProfile({ archivedChannelIds: next }).catch(() => {});
      showGlobalToast(isArchivedNow ? 'Moved back to Inbox.' : 'Conversation archived.');
      return next;
    });
  };

  // Per-channel delete-for-me & clear-for-me timestamps
  const [localDeletedAtByChannel, setLocalDeletedAtByChannel] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('wavelink_deleted_at_channels');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [localAcceptedChannels, setLocalAcceptedChannels] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_accepted_channels');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // "Unread first" sorting toggle (defaults to ON as required)
  const [unreadFirstSort, setUnreadFirstSort] = useState<boolean>(() => {
    if (typeof userProfile?.chatUnreadFirst === 'boolean') return userProfile.chatUnreadFirst;
    try {
      const raw = localStorage.getItem('wavelink_chat_unread_first');
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });

  const handleToggleUnreadFirstSort = () => {
    setUnreadFirstSort((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wavelink_chat_unread_first', String(next));
      } catch {
        // ignore
      }
      updateUserProfile({ chatUnreadFirst: next }).catch(() => {});
      return next;
    });
  };

  // New Chat Search Sheet state (debounced prefix search >= 2 chars, limit 10)
  const [isNewChatSheetOpen, setIsNewChatSheetOpen] = useState<boolean>(false);
  const [newChatSearchQuery, setNewChatSearchQuery] = useState<string>('');
  const [newChatSearchResults, setNewChatSearchResults] = useState<UserProfile[]>([]);
  const [isSearchingNewChat, setIsSearchingNewChat] = useState<boolean>(false);

  // 24-Hour Note modal state (60 chars max)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState<boolean>(false);
  const [noteDraftText, setNoteDraftText] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Top "..." menu, Chat Settings modal, swipe-left row tray, long-press action sheet & delete confirmation modal
  const [showInboxMoreMenu, setShowInboxMoreMenu] = useState<boolean>(false);
  const [isChatSettingsModalOpen, setIsChatSettingsModalOpen] = useState<boolean>(false);
  const [swipedRowId, setSwipedRowId] = useState<string | null>(null);
  const rowSwipeTouchRef = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
  const rowLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmDeleteChannelId, setConfirmDeleteChannelId] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  useEffect(() => {
    if (initialTargetChannelId) {
      setActiveChannel(initialTargetChannelId);
      setShowMobileChannels(false);
    }
  }, [initialTargetChannelId]);

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
        if (window.innerWidth < 768) {
          // On mobile (< 768px), use flex column + dvh + safe-area insets instead of fixed pixel heights
          chatShellRef.current.style.removeProperty('--chat-visual-height');
        } else if (isConvoScreenOpenOnMobile) {
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

  // Smoothly slide the mobile Chat/People/Groups header out on scroll down and back in on scroll up (< 768px only)
  useEffect(() => {
    setIsMobileChatHeaderHidden(false);
  }, [convoFilter, searchQuery]);

  useEffect(() => {
    const scrollEl = chatHomeScrollRef.current;
    if (!scrollEl) return;

    const updateHeaderHeightVar = () => {
      const headerEl = chatHomeHeaderRef.current;
      const leftColEl = scrollEl.parentElement;
      if (headerEl && leftColEl) {
        const h = headerEl.offsetHeight;
        if (h > 0) {
          leftColEl.style.setProperty('--chat-home-header-h', `${h}px`);
        }
      }
    };

    updateHeaderHeightVar();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateHeaderHeightVar())
        : null;
    if (ro && chatHomeHeaderRef.current) {
      ro.observe(chatHomeHeaderRef.current);
    }

    const handleChatListScroll = () => {
      if (chatListScrollRafRef.current !== null) return;
      chatListScrollRafRef.current = window.requestAnimationFrame(() => {
        chatListScrollRafRef.current = null;
        if (window.innerWidth >= 768) {
          setIsMobileChatHeaderHidden(false);
          return;
        }
        const currentTop = Math.max(0, scrollEl.scrollTop);
        const prevTop = lastChatListScrollTopRef.current;
        const delta = currentTop - prevTop;

        // At the very top of the list or while typing in the search box, always show the header
        if (currentTop <= 12 || document.activeElement === searchInputRef.current) {
          setIsMobileChatHeaderHidden(false);
          lastChatListScrollTopRef.current = currentTop;
          return;
        }

        // Ignore tiny scroll movements (< 8px threshold)
        if (Math.abs(delta) < 8) {
          return;
        }

        if (delta > 0 && currentTop > 20) {
          setIsMobileChatHeaderHidden(true);
        } else if (delta < 0) {
          setIsMobileChatHeaderHidden(false);
        }

        lastChatListScrollTopRef.current = currentTop;
      });
    };

    scrollEl.addEventListener('scroll', handleChatListScroll, { passive: true });
    window.addEventListener('resize', updateHeaderHeightVar);

    return () => {
      scrollEl.removeEventListener('scroll', handleChatListScroll);
      window.removeEventListener('resize', updateHeaderHeightVar);
      if (ro) ro.disconnect();
      if (chatListScrollRafRef.current !== null) {
        window.cancelAnimationFrame(chatListScrollRafRef.current);
        chatListScrollRafRef.current = null;
      }
    };
  }, [showMobileChannels, activeChannel]);

  // 1. Load ONLY the current user's followed contacts, invite-link contacts, and initialTargetUserId via in-memory cache (NEVER load the full users collection)
  useEffect(() => {
    let isMounted = true;
    const loadKnownContacts = async () => {
      try {
        const contactUidSet = new Set<string>();
        (userProfile?.followingIds || []).forEach((id) => {
          if (id && id !== currentUser?.uid && id !== SUPPORT_BOT_ID) contactUidSet.add(id);
        });
        (userProfile?.contactIds || []).forEach((id) => {
          if (id && id !== currentUser?.uid && id !== SUPPORT_BOT_ID) contactUidSet.add(id);
        });
        if (initialTargetUserId && initialTargetUserId !== currentUser?.uid && initialTargetUserId !== SUPPORT_BOT_ID) {
          contactUidSet.add(initialTargetUserId);
        }

        const uidsToFetch = Array.from(contactUidSet).filter((uid) => !chatProfileMemoryCache.has(uid));
        if (uidsToFetch.length > 0) {
          const fetchedProfiles = await Promise.all(
            uidsToFetch.slice(0, 30).map((uid) => fetchUserProfileCached(uid).catch(() => null))
          );
          if (!isMounted) return;
          const validProfiles: UserProfile[] = [];
          fetchedProfiles.forEach((p) => {
            if (p && p.id) {
              chatProfileMemoryCache.set(p.id, p);
              validProfiles.push(p);
            }
          });
          if (validProfiles.length > 0) {
            batchCacheUserProfiles(validProfiles);
          }
        }

        if (!isMounted) return;
        const cachedUsers = Array.from(chatProfileMemoryCache.values()).filter(
          (u) => u.id !== currentUser?.uid && u.id !== SUPPORT_BOT_ID
        );
        setMembers([SUPPORT_BOT_PROFILE, ...cachedUsers]);
        setIsLoadingConversations(false);

        if (initialTargetChannelId) {
          setActiveChannel(initialTargetChannelId);
          setShowMobileChannels(false);
        } else if (initialTargetUserId && currentUser?.uid) {
          const dmId = computeDmConversationId(currentUser.uid, initialTargetUserId);
          setActiveChannel(dmId);
          setShowMobileChannels(false);
        }
      } catch {
        if (isMounted) {
          setMembers([SUPPORT_BOT_PROFILE]);
          setIsLoadingConversations(false);
        }
      }
    };
    loadKnownContacts();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid, initialTargetUserId, initialTargetChannelId, userProfile?.followingIds, userProfile?.contactIds]);

  // 1b. Debounced (400ms) New Chat user search ONLY after typing at least 2 characters (limit 10, no listing of everyone)
  useEffect(() => {
    const rawQuery = (isNewChatSheetOpen ? newChatSearchQuery : searchQuery).trim();
    if (rawQuery.length < 2) {
      setNewChatSearchResults([]);
      setIsSearchingNewChat(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingNewChat(true);

    const timer = setTimeout(async () => {
      try {
        const cleanQ = rawQuery.replace(/^@/, '').trim();
        const lowerQ = cleanQ.toLowerCase();
        const capQ = cleanQ.charAt(0).toUpperCase() + cleanQ.slice(1);
        const resultsMap = new Map<string, UserProfile>();

        // First match any already-cached profiles in memory (0 reads)
        chatProfileMemoryCache.forEach((prof) => {
          if (prof.id === currentUser?.uid || prof.id === SUPPORT_BOT_ID) return;
          if (
            (prof.displayName || '').toLowerCase().includes(lowerQ) ||
            (prof.username || '').toLowerCase().includes(lowerQ) ||
            (prof.email || '').toLowerCase().includes(lowerQ)
          ) {
            resultsMap.set(prof.id, prof);
          }
        });

        // Query Firestore by displayName prefix and username prefix (limit 10)
        const queries = [
          query(
            collection(db, 'users'),
            where('displayName', '>=', cleanQ),
            where('displayName', '<=', cleanQ + '\uf8ff'),
            limit(10)
          ),
          query(
            collection(db, 'users'),
            where('username', '>=', lowerQ),
            where('username', '<=', lowerQ + '\uf8ff'),
            limit(10)
          ),
          query(
            collection(db, 'users'),
            where('username', '>=', '@' + lowerQ),
            where('username', '<=', '@' + lowerQ + '\uf8ff'),
            limit(10)
          )
        ];
        if (capQ !== cleanQ) {
          queries.push(
            query(
              collection(db, 'users'),
              where('displayName', '>=', capQ),
              where('displayName', '<=', capQ + '\uf8ff'),
              limit(10)
            )
          );
        }

        const snaps = await Promise.all(queries.map((q) => getDocs(q).catch(() => null)));
        if (isCancelled) return;

        const newlyFetched: UserProfile[] = [];
        snaps.forEach((snap) => {
          if (!snap) return;
          snap.forEach((d) => {
            if (d.id === currentUser?.uid || d.id === SUPPORT_BOT_ID) return;
            const prof = normalizeUserProfileData(d.id, d.data() as Record<string, any>);
            chatProfileMemoryCache.set(d.id, prof);
            newlyFetched.push(prof);
            resultsMap.set(d.id, prof);
          });
        });

        if (newlyFetched.length > 0) {
          batchCacheUserProfiles(newlyFetched);
          setMembers((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const additions = newlyFetched.filter((p) => !existingIds.has(p.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }

        if (!isCancelled) {
          setNewChatSearchResults(Array.from(resultsMap.values()).slice(0, 10));
          setIsSearchingNewChat(false);
        }
      } catch {
        if (!isCancelled) {
          setIsSearchingNewChat(false);
        }
      }
    }, 400);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [newChatSearchQuery, searchQuery, isNewChatSheetOpen, currentUser?.uid]);

  // 2. Load user-created groups once with limit(20) scoped to memberIds and in-memory caching
  useEffect(() => {
    if (!currentUser?.uid) return;
    let isMounted = true;
    const fetchGroups = async () => {
      try {
        const groupsCol = query(
          collection(db, 'groups'),
          where('memberIds', 'array-contains', currentUser.uid),
          limit(20)
        );
        const snapshot = await getDocs(groupsCol);
        if (!isMounted) return;
        const list: ChatGroup[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ChatGroup);
        });
        list.sort((a, b) => {
          const timeA = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
          const timeB = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
          return timeB - timeA;
        });
        chatGroupsMemoryCache = list;
        setGroups(list);

        // Populate group lastMessage previews from metadata without opening extra message listeners
        const groupLatest: Record<
          string,
          { text: string; senderId: string; senderName: string; createdAt: string }
        > = {};
        list.forEach((grp: any) => {
          if (grp.lastMessageText) {
            groupLatest[grp.id] = {
              text: grp.lastMessageText,
              senderId: grp.lastMessageSenderId || grp.creatorId || '',
              senderName: grp.lastMessageSenderName || grp.creatorName || 'Member',
              createdAt: grp.lastMessageAt || grp.updatedAt || grp.createdAt || ''
            };
          }
        });
        if (Object.keys(groupLatest).length > 0) {
          setLatestMessageByChannel((prev) => ({ ...groupLatest, ...prev }));
        }
      } catch (err) {
        console.warn('[WaveLink Chat] Groups fetch notice:', err);
      }
    };
    fetchGroups();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  // Listen for live resolved user avatars so members & active chat header update immediately
  useEffect(() => {
    const handleAvatarResolved = (e: Event) => {
      const detail = (e as CustomEvent<{ uid?: string; photoURL?: string }>).detail;
      const targetUid = detail?.uid;
      const nextUrl = detail?.photoURL;
      if (!targetUid || !nextUrl) return;

      const existingCached = chatProfileMemoryCache.get(targetUid);
      if (existingCached) {
        chatProfileMemoryCache.set(targetUid, { ...existingCached, photoURL: nextUrl });
      }
      setMembers((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (m.id === targetUid && m.photoURL !== nextUrl) {
            changed = true;
            return { ...m, photoURL: nextUrl };
          }
          return m;
        });
        return changed ? next : prev;
      });
    };
    window.addEventListener('wavelink:user-avatar-resolved', handleAvatarResolved as EventListener);
    return () => {
      window.removeEventListener('wavelink:user-avatar-resolved', handleAvatarResolved as EventListener);
    };
  }, []);

  // Synthesize any DM participants discovered in non-empty `channels` who might not be in `members` yet
  const allMembers = React.useMemo(() => {
    if (!currentUser?.uid) return members;
    const knownIds = new Set(members.map((m) => m.id));
    const extraMembers: UserProfile[] = [];

    Object.values(channelMetaMap).forEach((meta) => {
      if (!meta?.id?.startsWith('dm_')) return;
      // Hide empty conversation documents that have zero messages
      if (!meta.lastMessageText && !meta.lastMessageAt && meta.id !== activeChannel) return;
      const otherUid = getOtherDmParticipantId(meta.id, currentUser.uid);
      if (otherUid && otherUid !== currentUser.uid && !knownIds.has(otherUid)) {
        knownIds.add(otherUid);
        const cached = chatProfileMemoryCache.get(otherUid);
        if (cached) {
          extraMembers.push({
            ...cached,
            photoURL: resolveUserAvatarUrl(otherUid, cached.photoURL, cached as Record<string, any>)
          });
        } else {
          const synth: UserProfile = {
            id: otherUid,
            email: `${otherUid.slice(0, 8)}@wavelink.user`,
            username: `@waver_${otherUid.slice(0, 6)}`,
            displayName:
              meta.lastMessageSenderId === otherUid && meta.lastMessageSenderName
                ? meta.lastMessageSenderName
                : `Waver (${otherUid.slice(0, 6)})`,
            photoURL: resolveUserAvatarUrl(otherUid, undefined, meta as Record<string, any>),
            status: 'active',
            isBanned: false,
            createdAt: meta.updatedAt || new Date().toISOString()
          };
          chatProfileMemoryCache.set(otherUid, synth);
          extraMembers.push(synth);
        }
      }
    });

    return extraMembers.length > 0 ? [...members, ...extraMembers] : members;
  }, [members, channelMetaMap, currentUser?.uid, activeChannel]);

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
  const isBlockedByRecipient = Boolean(
    directRecipient &&
      !isChattingWithSupportBot &&
      currentUser?.uid &&
      (directRecipient.blockedUserIds || []).includes(currentUser.uid)
  );
  const isFollowingRecipient = Boolean(
    directRecipient &&
      (followingMap[directRecipient.id] ||
        (userProfile?.followingIds || []).includes(directRecipient.id) ||
        (userProfile?.contactIds || []).includes(directRecipient.id))
  );
  const hasExistingDmHistoryWithRecipient = Boolean(
    isDirectMessage &&
      directRecipient &&
      currentUser?.uid &&
      (() => {
        const dmId = computeDmConversationId(currentUser.uid, directRecipient.id);
        return Boolean(
          latestMessageByChannel[dmId]?.text ||
            channelMetaMap[dmId]?.lastMessageText ||
            channelMetaMap[dmId]?.lastMessageAt ||
            messages.length > 0
        );
      })()
  );
  const isRecipientSearchedOrFollowed = Boolean(
    directRecipient &&
      (isChattingWithSupportBot ||
        isFollowingRecipient ||
        hasExistingDmHistoryWithRecipient ||
        searchedAllowedUserIds.includes(directRecipient.id))
  );
  const dmPrivacyBlockReason = (() => {
    if (!isDirectMessage || !directRecipient || isChattingWithSupportBot) return null;
    if (isRecipientBlocked) {
      return 'You have blocked this user. Unblock them first to send a message.';
    }
    if (isBlockedByRecipient && !isAdmin) {
      return 'You cannot message this user.';
    }
    const selfTeen = getTeenRestrictionState(userProfile);
    const targetTeen = getTeenRestrictionState(directRecipient);
    const recipientFollowsOrContactsMe =
      (directRecipient.followingIds || []).includes(currentUser?.uid || '') ||
      (directRecipient.contactIds || []).includes(currentUser?.uid || '');
    const areMutualFriends = recipientFollowsOrContactsMe && isFollowingRecipient;

    if (selfTeen.isTeen) {
      if (selfTeen.messagingPolicy === 'nobody') {
        return 'Direct messages are currently disabled by Parental Control.';
      }
      if (!areMutualFriends && !isAdmin) {
        return 'Teen Account Safety: You can only message approved mutual friends.';
      }
    }

    if (targetTeen.isTeen && !isAdmin) {
      if (targetTeen.messagingPolicy === 'nobody') {
        return 'This teen account does not accept direct messages right now.';
      }
      if (!areMutualFriends) {
        return 'Teen Account Safety: This person only accepts messages from approved friends.';
      }
    }

    if (!isAdmin) {
      const dmPref = directRecipient.privacySettings?.allowDirectMessages || 'everyone';
      if (dmPref === 'none') {
        return 'This person only accepts messages from friends';
      }
      if (dmPref === 'followers' && !recipientFollowsOrContactsMe && !isFollowingRecipient) {
        return 'This person only accepts messages from friends';
      }
      const activeMeta = channelMetaMap[activeChannel];
      if (
        activeMeta &&
        activeMeta.requestStatus === 'pending' &&
        activeMeta.initiatedBy === currentUser?.uid &&
        !(activeMeta.acceptedBy || []).includes(directRecipient.id) &&
        (activeMeta.senderMessageCount || 0) >= 2
      ) {
        return `You have sent 2 messages. Wait for ${directRecipient.displayName} to accept your request.`;
      }
    }
    if (!isAdmin && !isRecipientSearchedOrFollowed) {
      return `Follow ${directRecipient.displayName} or search for them in New Chat to start texting.`;
    }
    return null;
  })();
  const callPrivacyBlockReason = (() => {
    if (!isDirectMessage || !directRecipient || isChattingWithSupportBot) return null;
    if (isRecipientBlocked) {
      return 'You have blocked this user. Unblock them first to place a call.';
    }
    if (isBlockedByRecipient && !isAdmin) {
      return 'You cannot call this user.';
    }
    const selfTeen = getTeenRestrictionState(userProfile);
    if (selfTeen.isTeen && !selfTeen.canUseCalls) {
      return selfTeen.isParentVerified
        ? 'Voice and video calls are blocked by Parental Control.'
        : 'Voice and video calls are disabled until a parent confirms your Teen Account.';
    }
    const targetTeen = getTeenRestrictionState(directRecipient);
    if (targetTeen.isTeen && !targetTeen.canUseCalls) {
      return 'This teen account cannot receive voice or video calls.';
    }
    if (!isAdmin) {
      const callPref = directRecipient.privacySettings?.allowCalls || 'everyone';
      if (callPref === 'none') {
        return `${directRecipient.displayName} has disabled incoming calls.`;
      }
      if (
        callPref === 'followers' &&
        !(userProfile?.followingIds || []).includes(directRecipient.id) &&
        !(directRecipient.followingIds || []).includes(currentUser?.uid || '')
      ) {
        return `Only followers can call ${directRecipient.displayName}.`;
      }
    }
    return null;
  })();
  const directRecipientPresence = usePresence(
    directRecipient && !isChattingWithSupportBot ? directRecipient.id : undefined,
    directRecipient
  );
  const directRecipientStatusText = isChattingWithSupportBot
    ? '24/7 Assistant'
    : directRecipientPresence.status === 'online' || directRecipientPresence.status === 'offline'
    ? formatPresenceSubtitle({
        isOnline: directRecipientPresence.status === 'online',
        lastChanged: directRecipientPresence.lastChanged,
        lastSeenIso: directRecipient?.lastSeenAt || directRecipient?.lastSeen,
        language: language === 'sw' ? 'sw' : 'en',
        showLastSeen: directRecipientPresence.canShowLastSeen
      })
    : '';

  const isCurrentUserGroupOwner = Boolean(
    activeGroup && currentUser && activeGroup.creatorId === currentUser.uid
  );
  const isCurrentUserGroupAdmin = activeGroup && currentUser
    ? (activeGroup.adminIds?.includes(currentUser.uid) || activeGroup.creatorId === currentUser.uid || isAdmin)
    : false;

  const isCurrentUserMember = activeGroup && currentUser
    ? activeGroup.memberIds?.includes(currentUser.uid)
    : false;

  const activeDisappearingHours = Number(
    activeGroup?.disappearingHours ??
      (activeChannel ? channelMetaMap[activeChannel]?.disappearingHours : 0) ??
      0
  );

  // 2b. Single real-time listener for DM channels metadata (where participants array-contains myUid, limit(convoFetchLimit), default 20)
  // NOTE: Real-time message subcollection listener is strictly scoped ONLY to the open `activeChannel`.
  useEffect(() => {
    if (!currentUser?.uid) return;

    const channelsQuery = query(
      collection(db, 'channels'),
      where('participants', 'array-contains', currentUser.uid),
      limit(convoFetchLimit)
    );
    const unsub = onSnapshot(
      channelsQuery,
      (snapshot) => {
        const nextTypingMap: Record<string, Record<string, TypingStatusEntry>> = {};
        const nextMetaMap: Record<string, ChatChannelMeta> = {};
        const nextLatestMap: Record<
          string,
          { text: string; senderId: string; senderName: string; createdAt: string }
        > = {};
        const nextBaselineUnread: Record<string, number> = {};

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ChatChannelMeta & {
            lastMessageSenderPhotoURL?: string;
            participantPhotos?: Record<string, string>;
          };
          const chanId = docSnap.id;

          // Hide any empty conversation document that has zero messages (without deleting data)
          if (!data?.lastMessageText && !data?.lastMessageAt) {
            return;
          }

          nextMetaMap[chanId] = { ...data, id: chanId };
          if (data?.typing && typeof data.typing === 'object') {
            nextTypingMap[chanId] = data.typing as Record<string, TypingStatusEntry>;
            Object.entries(data.typing).forEach(([tUid, tEntry]) => {
              if (tUid && tEntry?.photoURL && isRealUserPhotoUrl(tEntry.photoURL)) {
                recordDiscoveredUserAvatar(tUid, tEntry.photoURL, true);
              }
            });
          }
          if (data?.participantPhotos && typeof data.participantPhotos === 'object') {
            Object.entries(data.participantPhotos).forEach(([pUid, pUrl]) => {
              if (pUid && isRealUserPhotoUrl(pUrl)) {
                recordDiscoveredUserAvatar(pUid, pUrl, true);
              }
            });
          }
          if (data?.lastMessageSenderId && isRealUserPhotoUrl(data.lastMessageSenderPhotoURL)) {
            recordDiscoveredUserAvatar(data.lastMessageSenderId, data.lastMessageSenderPhotoURL, true);
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
            const isConvoCurrentlyOpen =
              chanId === activeChannel &&
              (!showMobileChannels || (typeof window !== 'undefined' && window.innerWidth >= 1024));
            const explicitUnread =
              typeof data?.unread?.[currentUser.uid] === 'number'
                ? data.unread[currentUser.uid]
                : typeof data?.unreadCounts?.[currentUser.uid] === 'number'
                ? data.unreadCounts[currentUser.uid]
                : undefined;
            const mySeenIso = data?.lastSeen?.[currentUser.uid] || '';
            const mySeenMs = mySeenIso ? Date.parse(mySeenIso) || 0 : 0;
            const msgMs = msgAt ? Date.parse(msgAt) || 0 : 0;

            if (isConvoCurrentlyOpen) {
              nextBaselineUnread[chanId] = 0;
            } else if (typeof explicitUnread === 'number') {
              nextBaselineUnread[chanId] = Math.max(0, explicitUnread);
            } else if (data.lastMessageSenderId !== currentUser.uid && msgMs > mySeenMs) {
              nextBaselineUnread[chanId] = 1;
            } else {
              nextBaselineUnread[chanId] = 0;
            }
          }
        });
        setChannelMetaMap(nextMetaMap);
        setFirestoreChannelTyping(nextTypingMap);
        setIsLoadingConversations(false);
        if (Object.keys(nextLatestMap).length > 0) {
          setLatestMessageByChannel((prev) => ({ ...prev, ...nextLatestMap }));
        }
        if (Object.keys(nextBaselineUnread).length > 0) {
          setUnreadCountsByChannel((prev) => ({ ...prev, ...nextBaselineUnread }));
        }
      },
      (err) => {
        console.warn('[WaveLink Chat] Channels metadata listener notice:', err?.message || err);
        setIsLoadingConversations(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid, activeChannel, convoFetchLimit]);

  // Cache participant user profiles in memory so each profile is read at most once (0 extra collection scans)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const channelEntries = Object.values(channelMetaMap);
    if (channelEntries.length === 0) return;

    const uidsNeedingServerLookup: string[] = [];

    channelEntries.forEach((meta) => {
      if (!meta?.id?.startsWith('dm_')) return;
      if (!meta.lastMessageText && !meta.lastMessageAt) return;
      const otherUid = getOtherDmParticipantId(meta.id, currentUser.uid);
      if (!otherUid || otherUid === currentUser.uid || otherUid === SUPPORT_BOT_ID) return;

      const knownMember = members.find((m) => m.id === otherUid) || chatProfileMemoryCache.get(otherUid);
      if (!knownMember) {
        fetchUserProfileCached(otherUid).then((fetched) => {
          if (fetched) {
            chatProfileMemoryCache.set(otherUid, fetched);
            setMembers((prev) => (prev.some((p) => p.id === otherUid) ? prev : [...prev, fetched]));
          }
        });
      }

      const currentPhoto = knownMember?.photoURL;
      if (!isRealUserPhotoUrl(currentPhoto) && !serverResolvedAvatarUids.has(otherUid)) {
        serverResolvedAvatarUids.add(otherUid);
        uidsNeedingServerLookup.push(otherUid);
      }
    });

    if (uidsNeedingServerLookup.length > 0) {
      getAuthHeaders()
        .then((headers) =>
          fetch('/api/users/resolve-avatars', {
            method: 'POST',
            headers,
            body: JSON.stringify({ uids: uidsNeedingServerLookup })
          })
        )
        .then((r) => r.json())
        .then((data) => {
          if (data?.avatars && typeof data.avatars === 'object') {
            Object.entries(data.avatars).forEach(([uId, url]) => {
              if (uId && isRealUserPhotoUrl(url)) {
                recordDiscoveredUserAvatar(uId, url, true);
              }
            });
          }
        })
        .catch(() => {});
    }
  }, [channelMetaMap, members, currentUser?.uid]);

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

    const connectChatWs = async () => {
      if (isUnmounted) return;
      try {
        const idToken = (await auth.currentUser?.getIdToken().catch(() => '')) || '';
        if (isUnmounted || !idToken) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${encodeURIComponent(idToken)}`;
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
              photoURL: getBestAuthUserPhotoUrl(currentUser, userProfile)
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
    const senderPhotoURL = getBestAuthUserPhotoUrl(currentUser, userProfile);

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

    // 2. Real-time RTDB ephemeral typing indicator (/typing/{conversationId}/{uid})
    setRtdbTyping(channelId, isTyping).catch(() => {});

    // 3. Real-time Firestore channel/group typing map sync
    const typingEntry: TypingStatusEntry = {
      userId: currentUser.uid,
      name: senderName,
      photoURL: senderPhotoURL,
      isTyping,
      updatedAt: nowIso
    };

    const isDm = channelId.startsWith('dm_');
    const dmExistsWithMessage =
      !isDm ||
      Boolean(channelMetaMap[channelId]?.lastMessageText || channelMetaMap[channelId]?.lastMessageAt);

    if (dmExistsWithMessage) {
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
    }
  };

  // Clear typing status on previous channel when switching conversations & subscribe to active channel RTDB typing
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
            photoURL: getBestAuthUserPhotoUrl(currentUser, userProfile)
          })
        );
      } catch {
        // ignore
      }
    }

    if (!activeChannel) return;
    const unsubRtdbTyping = subscribeRtdbTyping(activeChannel, (typers) => {
      setRtdbChannelTyping((prev) => ({
        ...prev,
        [activeChannel]: typers
      }));
    });

    return () => {
      unsubRtdbTyping();
    };
  }, [activeChannel, subscribeRtdbTyping]);

  const autoGrowChatInput = (el?: HTMLTextAreaElement | null) => {
    const targets = el ? [el] : [chatInputRef.current, mobileChatInputRef.current];
    targets.forEach((target) => {
      if (!target) return;
      target.style.height = 'auto';
      target.style.height = `${Math.min(120, Math.max(44, target.scrollHeight))}px`;
    });
  };

  // Handle input text change with automatic typing start/stop lifecycle
  const handleInputTextChange = (nextText: string, el?: HTMLTextAreaElement | null) => {
    setInputText(nextText);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => autoGrowChatInput(el));
    }
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

    // 4. Merge Realtime Database ephemeral typing entries (/typing/{conversationId}/{uid})
    const rtdbTyping = rtdbChannelTyping[channelId];
    if (rtdbTyping) {
      Object.entries(rtdbTyping).forEach(([uId, lastChangedMs]) => {
        if (!uId || uId === currentUser?.uid) return;
        const existing = mergedByUser.get(uId);
        const existingMs = existing ? new Date(existing.updatedAt).getTime() : 0;
        if (!existing || lastChangedMs >= existingMs) {
          const memberProfile = allMembers.find((m) => m.id === uId);
          mergedByUser.set(uId, {
            userId: uId,
            name: memberProfile?.displayName || 'Waver',
            photoURL: memberProfile?.photoURL,
            isTyping: true,
            updatedAt: new Date(lastChangedMs).toISOString()
          });
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

  // Auto-scroll chat gently when someone starts typing (only if already near bottom)
  useEffect(() => {
    if (activeChannelTypingUsers.length > 0 && isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChannelTypingUsers.length]);

  // Reset message limit to 30 and scroll/composer state whenever active channel changes
  useEffect(() => {
    setMessageLimit(30);
    isLoadingOlderRef.current = false;
    prevScrollHeightRef.current = 0;
    isNearBottomRef.current = true;
    lastScrolledChannelRef.current = '';
    setIsMobileComposerOpen(false);
    setShowMobileAttachTray(false);
  }, [activeChannel]);

  // 3. Real-time onSnapshot message listener ONLY while the conversation screen is actually open
  // Loads strictly only the latest 30 messages (auto-loads +30 on scroll to top)
  useEffect(() => {
    setMessages([]);
    setChatLoadError(null);
    setReactionMenuMsgId(null);
    const isMobileConvoHidden =
      typeof window !== 'undefined' && window.innerWidth < 1024 && showMobileChannels;
    if (!activeChannel || isMobileConvoHidden) {
      setIsLoadingMessages(false);
      return;
    }
    setIsLoadingMessages(true);

    const isBotChannel = activeChannel.includes(SUPPORT_BOT_ID);
    const messagesCol = isDirectMessage
      ? collection(db, 'channels', activeChannel, 'messages')
      : collection(db, 'groups', activeChannel, 'messages');

    // Query strictly limited to the latest 30 messages (or messageLimit when expanded)
    const limitedMessagesQuery = query(
      messagesCol,
      orderBy('createdAt', 'asc'),
      limitToLast(messageLimit)
    );

    const mergedDocsMap = new Map<string, ChannelMessage>();

    const publishMergedMessages = () => {
      const combined: ChannelMessage[] = [];
      const nowMs = Date.now();
      const myUid = currentUser?.uid || '';
      const activeMeta = channelMetaMap[activeChannel];
      const myDeletedIso =
        (myUid && (activeMeta?.deletedAt?.[myUid] || activeMeta?.clearedAt?.[myUid])) ||
        localDeletedAtByChannel[activeChannel] ||
        '';
      const myDeletedMs = myDeletedIso ? Date.parse(myDeletedIso) || 0 : 0;

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
        // Only show messages sent AFTER the user's delete-for-me / clear-for-me timestamp
        if (myDeletedMs > 0) {
          const msgMs = getMessageTimestampMs(msgData);
          if (msgMs > 0 && msgMs <= myDeletedMs) {
            return;
          }
        }
        // Hide expired disappearing messages
        if (msgData.expiresAt) {
          const expMs = Date.parse(msgData.expiresAt);
          if (Number.isFinite(expMs) && expMs <= nowMs) {
            return;
          }
        }
        combined.push(msgData);
      });

      // Deterministic chronological sort by server timestamp (with createdAt fallback)
      combined.sort((a, b) => getMessageTimestampMs(a) - getMessageTimestampMs(b));

      setChatLoadError(null);
      setMessages(combined);
      setIsLoadingMessages(false);

      const isChannelInitialLoad = lastScrolledChannelRef.current !== activeChannel;
      if (isLoadingOlderRef.current) {
        isLoadingOlderRef.current = false;
        window.requestAnimationFrame(() => {
          const el = messagesListRef.current;
          if (el && prevScrollHeightRef.current > 0) {
            const delta = el.scrollHeight - prevScrollHeightRef.current;
            el.scrollTop = Math.max(0, delta);
            prevScrollHeightRef.current = 0;
          }
        });
      } else if (isChannelInitialLoad || isNearBottomRef.current) {
        lastScrolledChannelRef.current = activeChannel;
        window.requestAnimationFrame(() => {
          const el = messagesListRef.current;
          if (el) {
            el.scrollTo({
              top: el.scrollHeight,
              behavior: isChannelInitialLoad ? 'auto' : 'smooth'
            });
          } else {
            messagesEndRef.current?.scrollIntoView({
              behavior: isChannelInitialLoad ? 'auto' : 'smooth'
            });
          }
        });
      }
    };

    const handleListenerError = (err: any) => {
      console.error(
        `[WaveLink Chat] Listener error on conversation "${activeChannel}":`,
        err?.message || err
      );
      if (isFirestoreQuotaError(err)) {
        notifyQuotaExceeded(err);
      }
      const friendlyMsg =
        err?.code === 'permission-denied'
          ? `Permission denied while loading messages for conversation "${activeChannel}". Please verify you are a participant in this conversation.`
          : `Could not load messages (${err?.message || 'connection error'}). Please tap Retry.`;
      setChatLoadError(friendlyMsg);
      setIsLoadingMessages(false);
    };

    const unsub = onSnapshot(
      limitedMessagesQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            mergedDocsMap.delete(change.doc.id);
          } else {
            const rawMsg = change.doc.data() as ChannelMessage & { senderAvatar?: string };
            if (rawMsg?.senderId) {
              const candidateAvatar = rawMsg.senderPhotoURL || rawMsg.senderAvatar;
              if (isRealUserPhotoUrl(candidateAvatar)) {
                recordDiscoveredUserAvatar(rawMsg.senderId, candidateAvatar, true);
              }
            }
            mergedDocsMap.set(change.doc.id, {
              ...rawMsg,
              id: change.doc.id
            } as ChannelMessage);
          }
        });
        publishMergedMessages();
      },
      (err) => {
        handleListenerError(err);
      }
    );

    return () => {
      unsub();
    };
  }, [activeChannel, isDirectMessage, showMobileChannels, currentUser?.uid, messageLimit, retryTrigger, localDeletedAtByChannel]);

  // Automatically load 30 older messages when scrolled near top & track stick-to-bottom state
  const handleMessagesScroll = () => {
    const el = messagesListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;

    if (
      el.scrollTop <= 28 &&
      messages.length >= messageLimit &&
      !isLoadingMessages &&
      !isLoadingOlderRef.current
    ) {
      isLoadingOlderRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      setMessageLimit((prev) => prev + 30);
    }
  };

  // 4. Track & broadcast lastSeen timestamp and per-message readBy receipts in Firestore
  useEffect(() => {
    if (!activeChannel || !currentUser?.uid) return;
    // On mobile, only mark as seen when the conversation screen is actually open (not when on the Chat List screen)
    if (showMobileChannels && typeof window !== 'undefined' && window.innerWidth < 1024) return;

    const markConversationAsSeen = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const nowIso = new Date().toISOString();

      // Clear local unread badge immediately when the receiver opens the chat
      setUnreadCountsByChannel((prev) =>
        prev[activeChannel] === 0 ? prev : { ...prev, [activeChannel]: 0 }
      );

      try {
        // Update channel or group lastSeen and reset unread count for current user to 0
        // CRITICAL: For DMs, ONLY update the channel document if a conversation already exists with at least one message!
        // Never create an empty conversation document when merely opening a draft chat from search.
        if (isDirectMessage) {
          const existingMeta = channelMetaMap[activeChannel];
          const hasAtLeastOneMessage = Boolean(
            existingMeta?.lastMessageText || existingMeta?.lastMessageAt || messages.length > 0
          );
          if (hasAtLeastOneMessage) {
            const otherUid = getOtherDmParticipantId(activeChannel, currentUser.uid);
            const participants = Array.from(new Set([currentUser.uid, otherUid].filter(Boolean))).sort();
            await setDoc(
              doc(db, 'channels', activeChannel),
              {
                id: activeChannel,
                conversationId: activeChannel,
                participants,
                lastSeen: { [currentUser.uid]: nowIso },
                unread: { [currentUser.uid]: 0 },
                unreadCounts: { [currentUser.uid]: 0 },
                updatedAt: nowIso
              },
              { merge: true }
            );
          }
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

  // Handle single or multiple image / video file upload in chat directly from browser to Cloudinary
  const handleChatFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (fileList.length === 0) return;

    const firstFile = fileList[0];
    const isVideo = firstFile.type.startsWith('video/');
    const imageFiles = fileList.filter((f) => f.type.startsWith('image/')).slice(0, 4);

    if (!isVideo && imageFiles.length === 0) {
      setChatMediaNotice('Please select a valid image or video file.');
      return;
    }

    try {
      setChatMediaNotice(null);
      setChatUploadProgress(0);
      if (imageFiles.length > 0 && !isVideo) {
        e.target.value = '';
        const uploadedUrls: string[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const imgFile = imageFiles[i];
          setChatMediaNotice(
            imageFiles.length > 1
              ? `Uploading photo ${i + 1} of ${imageFiles.length} to Cloudinary...`
              : 'Uploading photo to Cloudinary...'
          );
          const uploadedUrl = await compressImage(imgFile, 1280, 1280, 0.85, (pct) => {
            setChatUploadProgress(pct);
            setChatMediaNotice(
              imageFiles.length > 1
                ? `Uploading photo ${i + 1}/${imageFiles.length} (${pct}%)...`
                : `Uploading photo (${pct}%)...`
            );
          });
          if (uploadedUrl && uploadedUrl.startsWith('http')) {
            uploadedUrls.push(uploadedUrl);
          }
        }
        setChatUploadProgress(null);
        if (uploadedUrls.length > 0) {
          setChatMediaType('image');
          setChatMediaUrl(uploadedUrls[0]);
          setChatMediaUrls(uploadedUrls);
          setChatFileName('');
          setChatFileSize(0);
          setChatMediaNotice(null);
          setIsMobileComposerOpen(true);
        } else {
          setChatMediaNotice('Could not upload photo to Cloudinary. Please try again.');
        }
      } else {
        const canUploadLarge = Boolean(isProEffective || isAdmin);
        const validation = validateVideoFileSize(firstFile, canUploadLarge);
        if (!validation.valid) {
          e.target.value = '';
          setChatUploadProgress(null);
          setChatMediaNotice(validation.error || 'Video exceeds your plan upload limit.');
          return;
        }

        const safeVideo = await cloneVideoFileToMemory(firstFile);
        e.target.value = '';
        setChatMediaNotice('Uploading video (0%)...');
        const chatVidId = `chatvid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const cloudUrl = await uploadVideoChunkedToServer(chatVidId, safeVideo, (pct) => {
          setChatUploadProgress(pct);
          setChatMediaNotice(`Uploading video (${pct}%)...`);
        });
        setChatUploadProgress(null);
        if (cloudUrl && cloudUrl.startsWith('http')) {
          setChatMediaType('video');
          setChatMediaUrl(cloudUrl);
          setChatMediaUrls([cloudUrl]);
          setChatFileName('');
          setChatFileSize(0);
          setChatMediaNotice(null);
          setIsMobileComposerOpen(true);
        } else {
          setChatMediaNotice('Could not upload video to Cloudinary. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('Error uploading chat media:', err);
      setChatUploadProgress(null);
      setChatMediaNotice(
        sanitizeUserFacingError(
          err,
          'Could not upload your photo or video. Check your internet and try again.'
        )
      );
    }
  };

  // Handle general file/document attachment upload to Cloudinary
  const handleChatAnyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setChatMediaNotice('Use Photo / Video for images and videos, or pick a document/file.');
      return;
    }

    try {
      setChatMediaNotice(`Uploading ${file.name}...`);
      setChatUploadProgress(5);
      const uploaded = await uploadChatFileToCloudinary(file, (pct) => {
        setChatUploadProgress(pct);
        setChatMediaNotice(`Uploading ${file.name} (${pct}%)...`);
      });
      setChatUploadProgress(null);
      setChatMediaType('file');
      setChatMediaUrl(uploaded.secureUrl);
      setChatMediaUrls([]);
      setChatFileName(uploaded.fileName);
      setChatFileSize(uploaded.fileSize);
      setChatMediaNotice(null);
      setIsMobileComposerOpen(true);
    } catch (err: any) {
      console.error('Error uploading chat file:', err);
      setChatUploadProgress(null);
      setChatMediaNotice(
        sanitizeUserFacingError(
          err,
          'Could not upload your file. Check your internet and try again.'
        )
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
        setChatMediaNotice('Uploading voice note...');
        uploadVideoChunkedToServer(voiceNoteId, audioBlob, (pct) => {
          setChatMediaNotice(`Uploading voice note (${pct}%)...`);
        })
          .then((cloudAudioUrl) => {
            if (cloudAudioUrl && cloudAudioUrl.startsWith('http')) {
              setChatMediaType('audio');
              setChatMediaUrl(cloudAudioUrl);
              setChatMediaUrls([cloudAudioUrl]);
              setChatFileName('');
              setChatFileSize(0);
              setVoiceNoteDuration(finalSecs);
              setChatMediaNotice(null);
              setIsMobileComposerOpen(true);
            } else {
              setChatMediaNotice('Could not upload recorded voice note.');
            }
          })
          .catch((err) => {
            console.error('Voice note upload error:', err);
            setChatMediaNotice('Could not upload recorded voice note. Please try again.');
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

  // Toggle emoji reaction on a message (long-press or tap reaction button)
  const handleToggleMessageReaction = async (msg: ChannelMessage, emoji: string) => {
    if (!currentUser?.uid || !activeChannel) return;
    setReactionMenuMsgId(null);
    const currentList = msg.reactions?.[emoji] || [];
    const hasReacted = currentList.includes(currentUser.uid);

    // Optimistic local state update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m;
        const nextReactions = { ...(m.reactions || {}) };
        nextReactions[emoji] = hasReacted
          ? currentList.filter((id) => id !== currentUser.uid)
          : [...currentList, currentUser.uid];
        return { ...m, reactions: nextReactions };
      })
    );

    try {
      const msgRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', msg.id)
        : doc(db, 'groups', activeChannel, 'messages', msg.id);
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: hasReacted
          ? arrayRemove(currentUser.uid)
          : arrayUnion(currentUser.uid)
      });
    } catch {
      // ignore if rules restrict reaction update on non-owned doc
    }
  };

  // Send message (with XSS sanitization + deterministic conversationId + serverTimestamp + Support Bot response)
  const handleSendMessage = async (customGifUrl?: string) => {
    if ((!inputText.trim() && !customGifUrl && !chatMediaUrl) || !currentUser || !activeChannel) return;
    if (dmPrivacyBlockReason) {
      setChatMediaNotice(dmPrivacyBlockReason);
      if (isDirectMessage && directRecipient && getTeenRestrictionState(directRecipient).isTeen) {
        triggerParentalAlert(
          directRecipient.id,
          'new_chat_request',
          userProfile?.displayName || currentUser.displayName || 'A WaveLink user'
        ).catch(() => {});
      }
      return;
    }

    const msgRateCheck = checkActionRateLimit(currentUser.uid, 'message');
    if (!msgRateCheck.allowed) {
      setChatMediaNotice(
        msgRateCheck.message || 'You are sending messages too fast. Please wait a moment and try again.'
      );
      setTimeout(() => setChatMediaNotice(null), 4000);
      return;
    }

    let messageModCheckedAt = new Date().toISOString();
    if (inputText.trim()) {
      const spamCheck = checkClientSpam('message', inputText.trim());
      if (spamCheck.isSpam) {
        setChatMediaNotice(spamCheck.reason || 'Please slow down before sending duplicate messages or links.');
        setTimeout(() => setChatMediaNotice(null), 4000);
        return;
      }
      const modVerdict = await validateAndModerateText(inputText.trim(), 'chat', userProfile);
      if (!modVerdict.allowed) {
        setChatMediaNotice(modVerdict.friendlyMessage);
        setTimeout(() => setChatMediaNotice(null), 5000);
        if (isDirectMessage && directRecipient && getTeenRestrictionState(directRecipient).isTeen) {
          triggerParentalAlert(
            directRecipient.id,
            'flagged_message',
            userProfile?.displayName || currentUser.displayName || 'A WaveLink user'
          ).catch(() => {});
        }
        return;
      }
      if (modVerdict.moderationCheckedAt) {
        messageModCheckedAt = modVerdict.moderationCheckedAt;
      }
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
        : chatMediaType === 'file'
        ? `📎 ${chatFileName || 'Attachment'}`
        : chatMediaUrls.length > 1
        ? `📷 ${chatMediaUrls.length} Photos`
        : chatMediaUrl
        ? '📷 Photo'
        : '';
      const rawSnippet = (sanitizedText || defaultAttachmentLabel).replace(/\s+/g, ' ').trim();
      const messagePreview =
        rawSnippet.length > 45 ? `${rawSnippet.substring(0, 45).trim()}…` : rawSnippet;

      const resolvedSenderPhotoURL = getBestAuthUserPhotoUrl(currentUser, userProfile);

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
        senderPhotoURL: resolvedSenderPhotoURL,
        text: sanitizedText,
        mediaType: chatMediaType,
        moderationChecked: true,
        moderationCheckedAt: messageModCheckedAt,
        isEdited: false,
        isDeleted: false,
        readBy: [currentUser.uid],
        timestamp: serverTimestamp(),
        createdAt: nowIso,
        ...(activeDisappearingHours > 0
          ? { expiresAt: new Date(Date.now() + activeDisappearingHours * 3600 * 1000).toISOString() }
          : {})
      };

      if (chatMediaUrl) {
        data.mediaUrl = chatMediaUrl;
        if (chatMediaUrls.length > 0 && chatMediaType === 'image') {
          data.mediaUrls = chatMediaUrls;
        }
        if (chatMediaType === 'audio') {
          data.audioUrl = chatMediaUrl;
          data.audioDuration = voiceNoteDuration || 1;
        }
        if (chatMediaType === 'file') {
          data.fileName = chatFileName || 'Attachment';
          data.fileSize = chatFileSize || 0;
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

      // Update conversation metadata document (participants, lastMessage, lastSeen, unread count per participant, request status)
      if (isDirectMessage) {
        const existingMeta = channelMetaMap[targetChannel];
        const unreadPatch: Record<string, any> = {
          [currentUser.uid]: 0
        };
        if (rawOtherId && rawOtherId !== currentUser.uid && !isBotConvo) {
          unreadPatch[rawOtherId] = increment(1);
        }

        const recipientFollowsOrContactsMe =
          isBotConvo ||
          Boolean(
            directRecipient &&
              ((directRecipient.followingIds || []).includes(currentUser.uid) ||
                (directRecipient.contactIds || []).includes(currentUser.uid))
          );
        const isReplyingToOther =
          Boolean(
            existingMeta &&
              ((existingMeta.initiatedBy && existingMeta.initiatedBy === rawOtherId) ||
                existingMeta.lastMessageSenderId === rawOtherId)
          );
        const isAlreadyAccepted =
          isBotConvo ||
          recipientFollowsOrContactsMe ||
          isReplyingToOther ||
          existingMeta?.requestStatus === 'accepted' ||
          (existingMeta?.acceptedBy || []).includes(rawOtherId);

        const nextAcceptedBy = isAlreadyAccepted
          ? Array.from(
              new Set([
                ...(existingMeta?.acceptedBy || []),
                currentUser.uid,
                ...(rawOtherId ? [rawOtherId] : [])
              ])
            )
          : [currentUser.uid];

        const nextRequestStatus: 'accepted' | 'pending' = isAlreadyAccepted
          ? 'accepted'
          : 'pending';
        const nextSenderMessageCount = isAlreadyAccepted
          ? (existingMeta?.senderMessageCount || 1)
          : Math.min(2, (existingMeta?.senderMessageCount || 0) + 1);

        if (isReplyingToOther && !localAcceptedChannels.includes(targetChannel)) {
          setLocalAcceptedChannels((prev) => {
            const next = Array.from(new Set([...prev, targetChannel]));
            try {
              localStorage.setItem('wavelink_accepted_channels', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }

        setDoc(
          doc(db, 'channels', targetChannel),
          {
            id: targetChannel,
            conversationId: targetChannel,
            participants,
            initiatedBy: existingMeta?.initiatedBy || currentUser.uid,
            acceptedBy: nextAcceptedBy,
            requestStatus: nextRequestStatus,
            senderMessageCount: nextSenderMessageCount,
            lastMessageText: messagePreview,
            lastMessageMediaType: customGifUrl ? 'image' : chatMediaType,
            lastMessageSenderId: currentUser.uid,
            lastMessageSenderName: senderDisplayName,
            lastMessageSenderPhotoURL: resolvedSenderPhotoURL,
            participantPhotos: {
              [currentUser.uid]: resolvedSenderPhotoURL
            },
            lastMessageAt: nowIso,
            createdAt: existingMeta?.createdAt || nowIso,
            lastSeen: { [currentUser.uid]: nowIso },
            unread: unreadPatch,
            unreadCounts: unreadPatch,
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
      if (chatInputRef.current) {
        chatInputRef.current.style.height = '44px';
      }
      if (mobileChatInputRef.current) {
        mobileChatInputRef.current.style.height = '44px';
      }
      setChatMediaUrl('');
      setChatMediaUrls([]);
      setChatMediaType('none');
      setChatFileName('');
      setChatFileSize(0);
      setVoiceNoteDuration(0);
      voiceTranscriptRef.current = '';
      if (chatFileRef.current) chatFileRef.current.value = '';
      if (chatAnyFileRef.current) chatAnyFileRef.current.value = '';
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowGifPicker(false);
      setShowMobileAttachTray(false);
      setIsMobileComposerOpen(false);

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
                moderationChecked: true,
                moderationCheckedAt: replyIso,
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
    const modVerdict = await validateAndModerateText(cleanEdit, 'chat', userProfile);
    if (!modVerdict.allowed) {
      setChatMediaNotice(modVerdict.friendlyMessage);
      setTimeout(() => setChatMediaNotice(null), 5000);
      return;
    }
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);

      await updateDoc(docRef, {
        text: cleanEdit,
        moderationChecked: true,
        moderationCheckedAt: modVerdict.moderationCheckedAt || new Date().toISOString(),
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

  // Local + Firestore "Delete for me" state
  const [deletedForMeIds, setDeletedForMeIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wavelink_chat_deleted_for_me_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handleDeleteMessageForMe = async (messageId: string) => {
    setDeletedForMeIds((prev) => {
      const next = prev.includes(messageId) ? prev : [...prev, messageId];
      try {
        localStorage.setItem('wavelink_chat_deleted_for_me_v1', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
    if (!currentUser?.uid) return;
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);
      await updateDoc(docRef, {
        deletedFor: arrayUnion(currentUser.uid)
      });
    } catch {
      // Local hide already applied even if rules restrict editing another user's message doc
    }
  };

  // Delete message for everyone / Unsend
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);

      await updateDoc(docRef, {
        isDeleted: true,
        text: 'This message was deleted for everyone.',
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
    const groupTextToCheck = `${newGroupName.trim()} ${newGroupDesc.trim()}`.trim();
    const modVerdict = await validateAndModerateText(groupTextToCheck, 'group', userProfile);
    if (!modVerdict.allowed) {
      setChatMediaNotice(modVerdict.friendlyMessage);
      showGlobalToast(modVerdict.friendlyMessage);
      return;
    }
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
          moderationChecked: true,
          moderationCheckedAt: nowIso,
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

  const handleUpdateDisappearingTimer = async (hours: number) => {
    if (!currentUser?.uid || !activeChannel) return;
    const validHours = [0, 24, 168, 720].includes(hours) ? hours : 0;
    const nowIso = new Date().toISOString();
    try {
      if (activeGroup) {
        if (!isCurrentUserGroupAdmin) return;
        await updateDoc(doc(db, 'groups', activeChannel), {
          disappearingHours: validHours,
          updatedAt: nowIso
        });
        setGroups((prev) =>
          prev.map((g) => (g.id === activeChannel ? { ...g, disappearingHours: validHours } : g))
        );
      } else if (isDirectMessage) {
        const rawOtherId = directRecipient?.id || getOtherDmParticipantId(activeChannel, currentUser.uid);
        const participants = Array.from(new Set([currentUser.uid, rawOtherId].filter(Boolean))).sort();
        await setDoc(
          doc(db, 'channels', activeChannel),
          {
            id: activeChannel,
            conversationId: activeChannel,
            participants,
            disappearingHours: validHours,
            updatedAt: nowIso
          },
          { merge: true }
        );
        setChannelMetaMap((prev) => ({
          ...prev,
          [activeChannel]: {
            ...(prev[activeChannel] || { id: activeChannel, participants }),
            disappearingHours: validHours
          }
        }));
      }
      const label =
        validHours === 0
          ? 'Off'
          : validHours === 24
          ? '24 hours'
          : validHours === 168
          ? '7 days'
          : '30 days';
      showGlobalToast(`⏱️ Disappearing messages set to ${label}`);
      writeChatThemeSystemLine(
        activeChannel,
        validHours === 0
          ? 'turned off disappearing messages.'
          : `set disappearing messages to ${label}.`
      ).catch(() => {});
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        activeGroup ? `groups/${activeChannel}` : `channels/${activeChannel}`
      );
    }
  };

  // Delete entire group (Owner or Platform Admin only)
  const handleDeleteGroup = async () => {
    if (!activeGroup || (!isCurrentUserGroupOwner && !isAdmin)) return;
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

  // Resolve active conversation theme + any pending shared suggestion from partner/admin
  const savedActiveChatTheme: ChatThemePreference | null = activeChannel
    ? localChatThemes[activeChannel] || null
    : null;
  const effectiveActiveChatTheme: ChatThemePreference | null = isThemePickerOpen
    ? previewChatTheme
    : savedActiveChatTheme;
  const computedChatTheme = computeChatThemeVars(
    effectiveActiveChatTheme,
    activeTheme,
    isDarkTheme
  );

  const activeSuggestedTheme: SharedChatThemeSuggestion | null = activeChannel
    ? isDirectMessage
      ? channelMetaMap[activeChannel]?.suggestedTheme || null
      : activeGroup?.suggestedTheme || null
    : null;

  const showSuggestedThemeBanner = Boolean(
    activeSuggestedTheme &&
      currentUser?.uid &&
      activeSuggestedTheme.suggestedBy !== currentUser.uid &&
      !(activeSuggestedTheme.acceptedBy || []).includes(currentUser.uid) &&
      !(activeSuggestedTheme.declinedBy || []).includes(currentUser.uid)
  );

  // Subtle system line when theme changes
  async function writeChatThemeSystemLine(
    targetChannelId: string,
    text: string,
    visibleToUid?: string
  ) {
    if (!currentUser || !targetChannelId) return;
    try {
      const msgId = `sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const rawOtherId = isDirectMessage
        ? directRecipient?.id || getOtherDmParticipantId(targetChannelId, currentUser.uid)
        : '';
      const participants = isDirectMessage
        ? Array.from(new Set([currentUser.uid, rawOtherId].filter(Boolean))).sort()
        : Array.from(new Set(activeGroup?.memberIds || [currentUser.uid]));
      const senderDisplayName = userProfile?.displayName || currentUser.displayName || 'Waver';

      const sysData: Record<string, any> = {
        id: msgId,
        conversationId: targetChannelId,
        channelId: targetChannelId,
        senderId: currentUser.uid,
        receiverId: isDirectMessage ? rawOtherId : targetChannelId,
        participants,
        senderEmail: currentUser.email || 'user',
        senderName: senderDisplayName,
        text,
        mediaType: 'none',
        isEdited: false,
        isDeleted: false,
        isSystem: true,
        moderationChecked: true,
        readBy: [currentUser.uid],
        timestamp: serverTimestamp(),
        createdAt: nowIso
      };
      if (visibleToUid) {
        sysData.visibleTo = visibleToUid;
      }
      const docRef = isDirectMessage
        ? doc(db, 'channels', targetChannelId, 'messages', msgId)
        : doc(db, 'groups', targetChannelId, 'messages', msgId);
      await setDoc(docRef, cleanFirestoreData(sysData));
    } catch (err) {
      console.warn('[WaveLink Chat] System theme line notice:', err);
    }
  };

  const persistUserChatThemesMap = async (nextMap: Record<string, ChatThemePreference>) => {
    if (!currentUser?.uid) return;
    setLocalChatThemes(nextMap);
    try {
      localStorage.setItem(
        `wavelink_chat_themes_${currentUser.uid}`,
        JSON.stringify(nextMap)
      );
    } catch {
      // ignore storage quota errors
    }
    await updateUserProfile({ chatThemes: nextMap });
  };

  const handleSaveChatTheme = async (params: {
    preference: ChatThemePreference;
    shareWithOthers: boolean;
    customPhotoFile: File | null;
  }) => {
    if (!currentUser?.uid || !activeChannel) return;
    const { preference, shareWithOthers, customPhotoFile } = params;

    let finalPhotoUrl = preference.customBgUrl;
    if (customPhotoFile) {
      const uploaded = await compressAndUploadChatThemePhoto({
        uid: currentUser.uid,
        conversationId: activeChannel,
        file: customPhotoFile
      });
      finalPhotoUrl = uploaded.downloadUrl;
    }

    const nowIso = new Date().toISOString();
    const isEffectivelyDefault =
      preference.themeId === 'default' && !preference.accentColor && !finalPhotoUrl;

    const nextMap = { ...localChatThemes };
    let cleanPref: ChatThemePreference | null = null;
    if (isEffectivelyDefault) {
      delete nextMap[activeChannel];
    } else {
      cleanPref = {
        themeId: preference.themeId || 'default',
        ...(preference.accentColor ? { accentColor: preference.accentColor } : {}),
        ...(finalPhotoUrl ? { customBgUrl: finalPhotoUrl } : {}),
        ...(finalPhotoUrl
          ? { bgDarkness: Math.max(0, Math.min(85, Number(preference.bgDarkness ?? 35))) }
          : {}),
        updatedAt: nowIso
      };
      nextMap[activeChannel] = cleanPref;
    }

    await persistUserChatThemesMap(nextMap);

    if (shareWithOthers && !isChattingWithSupportBot) {
      const sharerName = userProfile?.displayName || currentUser.displayName || 'Someone';
      const suggestion: SharedChatThemeSuggestion = {
        themeId: cleanPref?.themeId || 'default',
        ...(cleanPref?.accentColor ? { accentColor: cleanPref.accentColor } : {}),
        ...(cleanPref?.customBgUrl ? { customBgUrl: cleanPref.customBgUrl } : {}),
        ...(typeof cleanPref?.bgDarkness === 'number'
          ? { bgDarkness: cleanPref.bgDarkness }
          : {}),
        suggestedBy: currentUser.uid,
        suggestedByName: sharerName,
        suggestedAt: nowIso,
        acceptedBy: [currentUser.uid],
        declinedBy: []
      };

      if (isDirectMessage) {
        const otherUid =
          directRecipient?.id || getOtherDmParticipantId(activeChannel, currentUser.uid);
        const participants = Array.from(
          new Set([currentUser.uid, otherUid].filter(Boolean))
        ).sort();
        await setDoc(
          doc(db, 'channels', activeChannel),
          cleanFirestoreData({
            id: activeChannel,
            conversationId: activeChannel,
            participants,
            suggestedTheme: suggestion,
            updatedAt: nowIso
          }),
          { merge: true }
        );
      } else if (activeGroup && isCurrentUserGroupAdmin) {
        await updateDoc(doc(db, 'groups', activeChannel), cleanFirestoreData({
          suggestedTheme: suggestion,
          updatedAt: nowIso
        }));
      }
    }

    const themeLabel = getChatThemeDisplayName(cleanPref?.themeId || 'default');
    const systemText = isEffectivelyDefault
      ? 'You reset the theme to Default'
      : `You changed the theme to ${themeLabel}`;

    await writeChatThemeSystemLine(
      activeChannel,
      shareWithOthers && !isChattingWithSupportBot
        ? `${userProfile?.displayName?.split(' ')[0] || 'Someone'} suggested the ${themeLabel} theme`
        : systemText,
      shareWithOthers && !isChattingWithSupportBot ? undefined : currentUser.uid
    );

    showGlobalToast(
      shareWithOthers
        ? `Saved ${themeLabel} theme and shared suggestion.`
        : `Chat theme set to ${themeLabel}.`
    );
  };

  const handleResetChatTheme = async () => {
    if (!currentUser?.uid || !activeChannel) return;
    const nextMap = { ...localChatThemes };
    delete nextMap[activeChannel];
    await persistUserChatThemesMap(nextMap);
    await writeChatThemeSystemLine(
      activeChannel,
      'You reset the theme to Default',
      currentUser.uid
    );
    showGlobalToast('Chat theme reset to default.');
  };

  const handleAcceptSuggestedTheme = async () => {
    if (!currentUser?.uid || !activeChannel || !activeSuggestedTheme) return;
    const nowIso = new Date().toISOString();
    const isEffectivelyDefault =
      activeSuggestedTheme.themeId === 'default' &&
      !activeSuggestedTheme.accentColor &&
      !activeSuggestedTheme.customBgUrl;

    const nextMap = { ...localChatThemes };
    if (isEffectivelyDefault) {
      delete nextMap[activeChannel];
    } else {
      nextMap[activeChannel] = {
        themeId: activeSuggestedTheme.themeId || 'default',
        ...(activeSuggestedTheme.accentColor
          ? { accentColor: activeSuggestedTheme.accentColor }
          : {}),
        ...(activeSuggestedTheme.customBgUrl
          ? { customBgUrl: activeSuggestedTheme.customBgUrl }
          : {}),
        ...(typeof activeSuggestedTheme.bgDarkness === 'number'
          ? { bgDarkness: activeSuggestedTheme.bgDarkness }
          : {}),
        updatedAt: nowIso
      };
    }
    await persistUserChatThemesMap(nextMap);

    const updatedSuggestion: SharedChatThemeSuggestion = {
      ...activeSuggestedTheme,
      acceptedBy: Array.from(
        new Set([...(activeSuggestedTheme.acceptedBy || []), currentUser.uid])
      ),
      declinedBy: (activeSuggestedTheme.declinedBy || []).filter(
        (id) => id !== currentUser.uid
      )
    };

    if (isDirectMessage) {
      await setDoc(
        doc(db, 'channels', activeChannel),
        cleanFirestoreData({ suggestedTheme: updatedSuggestion, updatedAt: nowIso }),
        { merge: true }
      );
    } else if (activeGroup) {
      await updateDoc(
        doc(db, 'groups', activeChannel),
        cleanFirestoreData({ suggestedTheme: updatedSuggestion, updatedAt: nowIso })
      );
    }

    const themeLabel = getChatThemeDisplayName(activeSuggestedTheme.themeId);
    await writeChatThemeSystemLine(
      activeChannel,
      `You changed the theme to ${themeLabel}`,
      currentUser.uid
    );
    showGlobalToast(`Applied ${themeLabel} chat theme.`);
  };

  const handleDeclineSuggestedTheme = async () => {
    if (!currentUser?.uid || !activeChannel || !activeSuggestedTheme) return;
    const nowIso = new Date().toISOString();
    const updatedSuggestion: SharedChatThemeSuggestion = {
      ...activeSuggestedTheme,
      declinedBy: Array.from(
        new Set([...(activeSuggestedTheme.declinedBy || []), currentUser.uid])
      )
    };

    if (isDirectMessage) {
      await setDoc(
        doc(db, 'channels', activeChannel),
        cleanFirestoreData({ suggestedTheme: updatedSuggestion, updatedAt: nowIso }),
        { merge: true }
      );
    } else if (activeGroup) {
      await updateDoc(
        doc(db, 'groups', activeChannel),
        cleanFirestoreData({ suggestedTheme: updatedSuggestion, updatedAt: nowIso })
      );
    }
  };

  const isSearchingUsers = searchQuery.trim().length > 0;
  const cleanSearch = searchQuery.trim().toLowerCase();

  const isMemberFollowed = (memberId: string): boolean => {
    if (memberId === SUPPORT_BOT_ID) return true;
    return Boolean(
      followingMap[memberId] || (userProfile?.followingIds || []).includes(memberId)
    );
  };

  const isMemberInMyContacts = (memberId: string): boolean => {
    if (memberId === SUPPORT_BOT_ID) return true;
    return Boolean(
      isMemberFollowed(memberId) || (userProfile?.contactIds || []).includes(memberId)
    );
  };

  const isChannelDeletedForMe = (channelId: string, latestMsgIso?: string): boolean => {
    if (!channelId || !currentUser?.uid) return false;
    const meta = channelMetaMap[channelId];
    const delIso = meta?.deletedAt?.[currentUser.uid] || localDeletedAtByChannel[channelId] || '';
    if (!delIso) return false;
    const delMs = Date.parse(delIso) || 0;
    if (!delMs) return false;
    const msgIso =
      latestMsgIso ||
      latestMessageByChannel[channelId]?.createdAt ||
      meta?.lastMessageAt ||
      meta?.updatedAt ||
      '';
    const msgMs = msgIso ? Date.parse(msgIso) || 0 : 0;
    // Disappears from my inbox and comes back ONLY if a new message arrives after deletion time
    return msgMs <= delMs;
  };

  // A DM conversation exists ONLY when someone has sent at least one message (hide empty conversation docs)
  const hasTextedMember = (memberId: string): boolean => {
    if (!currentUser?.uid) return false;
    const dmId = computeDmConversationId(currentUser.uid, memberId);
    const meta = channelMetaMap[dmId];
    const latest = latestMessageByChannel[dmId];
    const hasMessage = Boolean(
      (latest && latest.text) || (meta && (meta.lastMessageText || meta.lastMessageAt))
    );
    if (!hasMessage) return false;
    if (isChannelDeletedForMe(dmId, latest?.createdAt || meta?.lastMessageAt)) return false;
    return true;
  };

  // Determine whether a non-empty DM conversation belongs in the "Requests" tab (stranger who messaged me and I haven't accepted/replied)
  const isPendingRequestMember = (memberId: string): boolean => {
    if (!currentUser?.uid || memberId === SUPPORT_BOT_ID) return false;
    if (!hasTextedMember(memberId)) return false;
    const dmId = computeDmConversationId(currentUser.uid, memberId);
    const meta = channelMetaMap[dmId];
    if (!meta) return false;
    // If I follow them or they are in my contacts, they go straight to Inbox
    if (isMemberInMyContacts(memberId)) return false;
    // If I accepted locally or in Firestore, they are in Inbox
    if (
      localAcceptedChannels.includes(dmId) ||
      meta.requestStatus === 'accepted' ||
      (meta.acceptedBy || []).includes(currentUser.uid)
    ) {
      return false;
    }
    // If I initiated the conversation or sent the last message, it's in my Inbox
    if (meta.initiatedBy === currentUser.uid || meta.lastMessageSenderId === currentUser.uid) {
      return false;
    }
    // If explicitly marked pending or sent by a non-followed stranger with no acceptance from me
    return true;
  };

  const matchesMemberSearch = (m: UserProfile): boolean => {
    if (!isSearchingUsers) return true;
    return (
      (m.displayName || '').toLowerCase().includes(cleanSearch) ||
      (m.email || '').toLowerCase().includes(cleanSearch) ||
      (m.username || '').toLowerCase().includes(cleanSearch) ||
      (m.bio || '').toLowerCase().includes(cleanSearch)
    );
  };

  // Helper to check if a user's 24-hour chatNote is currently active (not expired)
  const getActiveChatNoteText = (note?: { text?: string; expiresAt?: string } | null): string | null => {
    if (!note || !note.text || !note.text.trim()) return null;
    if (note.expiresAt) {
      const expMs = Date.parse(note.expiresAt);
      if (Number.isFinite(expMs) && expMs <= Date.now()) return null;
    }
    return note.text.trim().slice(0, 60);
  };

  const myActiveNoteText = getActiveChatNoteText(userProfile?.chatNote);
  const showNotesInInbox = userProfile?.showChatNotes !== false;

  const sortMembersByRecentActivity = (a: UserProfile, b: UserProfile): number => {
    if (!currentUser?.uid) return 0;
    const dmA = computeDmConversationId(currentUser.uid, a.id);
    const dmB = computeDmConversationId(currentUser.uid, b.id);

    // 1. Pinned first
    const pinA = pinnedChannelIds.includes(dmA) ? 1 : 0;
    const pinB = pinnedChannelIds.includes(dmB) ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;

    // 2. Unread above read within the same group when "Unread first" is enabled (default ON)
    if (unreadFirstSort) {
      const unreadA = (unreadCountsByChannel[dmA] || 0) > 0 ? 1 : 0;
      const unreadB = (unreadCountsByChannel[dmB] || 0) > 0 ? 1 : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
    }

    // 3. Optional "Online first" sort
    if (onlineFirstSort) {
      const onlineA = a.id === SUPPORT_BOT_ID || getCachedIsOnline(a.id) ? 1 : 0;
      const onlineB = b.id === SUPPORT_BOT_ID || getCachedIsOnline(b.id) ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;
    }

    // 4. Newest message on top (lastMessageAt desc)
    const latestA =
      latestMessageByChannel[dmA]?.createdAt ||
      channelMetaMap[dmA]?.lastMessageAt ||
      channelMetaMap[dmA]?.updatedAt ||
      '';
    const latestB =
      latestMessageByChannel[dmB]?.createdAt ||
      channelMetaMap[dmB]?.lastMessageAt ||
      channelMetaMap[dmB]?.updatedAt ||
      '';
    return (Date.parse(latestB) || 0) - (Date.parse(latestA) || 0);
  };

  // Filter & sort groups
  const filteredGroups = groups
    .filter(
      (g) =>
        !isChannelDeletedForMe(g.id, latestMessageByChannel[g.id]?.createdAt || g.lastMessageAt) &&
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const pinA = pinnedChannelIds.includes(a.id) ? 1 : 0;
      const pinB = pinnedChannelIds.includes(b.id) ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      if (unreadFirstSort) {
        const uA = (unreadCountsByChannel[a.id] || 0) > 0 ? 1 : 0;
        const uB = (unreadCountsByChannel[b.id] || 0) > 0 ? 1 : 0;
        if (uA !== uB) return uB - uA;
      }
      const latestA =
        latestMessageByChannel[a.id]?.createdAt || a.lastMessageAt || a.updatedAt || a.createdAt || '';
      const latestB =
        latestMessageByChannel[b.id]?.createdAt || b.lastMessageAt || b.updatedAt || b.createdAt || '';
      return (Date.parse(latestB) || 0) - (Date.parse(latestA) || 0);
    });

  // 1) Inbox DM members: strictly conversations I started/accepted or contacts I have exchanged a message with (excluding pending stranger requests & blocked users)
  const recentChatMembers = allMembers
    .filter(
      (m) =>
        m.id !== currentUser?.uid &&
        !(userProfile?.blockedUserIds || []).includes(m.id) &&
        hasTextedMember(m.id) &&
        !isPendingRequestMember(m.id) &&
        matchesMemberSearch(m)
    )
    .sort(sortMembersByRecentActivity);

  // 2) Pending Message Requests (from strangers not yet accepted)
  const requestChatMembers = allMembers
    .filter(
      (m) =>
        m.id !== currentUser?.uid &&
        !(userProfile?.blockedUserIds || []).includes(m.id) &&
        isPendingRequestMember(m.id) &&
        matchesMemberSearch(m)
    )
    .sort(sortMembersByRecentActivity);

  // 3) My Contacts (for the top floating bubble cluster & New Chat sheet — 0 new reads: people I follow, invite-link contacts, and people I've chatted with)
  const connectedMembers = allMembers
    .filter(
      (m) =>
        m.id !== currentUser?.uid &&
        !(userProfile?.blockedUserIds || []).includes(m.id) &&
        (m.id === SUPPORT_BOT_ID || isMemberInMyContacts(m.id) || (hasTextedMember(m.id) && !isPendingRequestMember(m.id)))
    )
    .sort((a, b) => {
      const onlineA = a.id === SUPPORT_BOT_ID || getCachedIsOnline(a.id) ? 1 : 0;
      const onlineB = b.id === SUPPORT_BOT_ID || getCachedIsOnline(b.id) ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;
      return sortMembersByRecentActivity(a, b);
    });

  // Top cluster bubbles: max 8 contacts/online friends arranged loosely around my center bubble
  const clusterContacts = connectedMembers.slice(0, 8);
  const leftClusterContacts = clusterContacts.slice(0, Math.ceil(clusterContacts.length / 2));
  const rightClusterContacts = clusterContacts.slice(Math.ceil(clusterContacts.length / 2));

  // Build unified Inbox rows (combining DMs and Groups I am in)
  type UnifiedInboxRow =
    | {
        kind: 'dm';
        channelId: string;
        member: UserProfile;
        unreadCount: number;
        isPinned: boolean;
        isMuted: boolean;
        isArchived: boolean;
        lastMessageAt: string;
      }
    | {
        kind: 'group';
        channelId: string;
        group: ChatGroup;
        unreadCount: number;
        isPinned: boolean;
        isMuted: boolean;
        isArchived: boolean;
        lastMessageAt: string;
      };

  const allUnifiedInboxRows: UnifiedInboxRow[] = React.useMemo(() => {
    if (!currentUser?.uid) return [];
    const rows: UnifiedInboxRow[] = [];

    recentChatMembers.forEach((member) => {
      const dmId = computeDmConversationId(currentUser.uid, member.id);
      const isActive = activeChannel === dmId && !showMobileChannels;
      const unreadCount = isActive ? 0 : unreadCountsByChannel[dmId] || 0;
      const lastMessageAt =
        latestMessageByChannel[dmId]?.createdAt ||
        channelMetaMap[dmId]?.lastMessageAt ||
        channelMetaMap[dmId]?.updatedAt ||
        '';
      rows.push({
        kind: 'dm',
        channelId: dmId,
        member,
        unreadCount,
        isPinned: pinnedChannelIds.includes(dmId),
        isMuted: mutedChannelIds.includes(dmId),
        isArchived: archivedChannelIds.includes(dmId),
        lastMessageAt
      });
    });

    filteredGroups.forEach((group) => {
      const isActive = activeChannel === group.id && !showMobileChannels;
      const unreadCount = isActive ? 0 : unreadCountsByChannel[group.id] || 0;
      const lastMessageAt =
        latestMessageByChannel[group.id]?.createdAt ||
        group.lastMessageAt ||
        group.updatedAt ||
        group.createdAt ||
        '';
      rows.push({
        kind: 'group',
        channelId: group.id,
        group,
        unreadCount,
        isPinned: pinnedChannelIds.includes(group.id),
        isMuted: mutedChannelIds.includes(group.id),
        isArchived: archivedChannelIds.includes(group.id),
        lastMessageAt
      });
    });

    rows.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (unreadFirstSort) {
        const uA = a.unreadCount > 0 ? 1 : 0;
        const uB = b.unreadCount > 0 ? 1 : 0;
        if (uA !== uB) return uB - uA;
      }
      if (onlineFirstSort && a.kind === 'dm' && b.kind === 'dm') {
        const oA = a.member.id === SUPPORT_BOT_ID || getCachedIsOnline(a.member.id) ? 1 : 0;
        const oB = b.member.id === SUPPORT_BOT_ID || getCachedIsOnline(b.member.id) ? 1 : 0;
        if (oA !== oB) return oB - oA;
      }
      return (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0);
    });

    return rows;
  }, [
    currentUser?.uid,
    recentChatMembers,
    filteredGroups,
    activeChannel,
    showMobileChannels,
    unreadCountsByChannel,
    latestMessageByChannel,
    channelMetaMap,
    pinnedChannelIds,
    mutedChannelIds,
    archivedChannelIds,
    unreadFirstSort,
    onlineFirstSort
  ]);

  const unarchivedInboxRows = allUnifiedInboxRows.filter((r) => !r.isArchived);
  const archivedInboxRows = allUnifiedInboxRows.filter((r) => r.isArchived);
  const unreadInboxRows = unarchivedInboxRows.filter((r) => r.unreadCount > 0);
  const groupInboxRows = allUnifiedInboxRows.filter((r) => r.kind === 'group');

  // Requests never create notification badges on the Inbox tab — only on the Requests tab
  const pendingRequestsCount = requestChatMembers.length;
  const unreadConversationsCount = unreadInboxRows.length;
  const inboxTabBadgeNumber =
    unreadConversationsCount > 0 ? unreadConversationsCount : unarchivedInboxRows.length;

  // Total unread messages across non-request, non-muted inbox conversations for global nav badge
  const totalUnreadMessages = unarchivedInboxRows.reduce(
    (sum, r) => (r.channelId === activeChannel && !showMobileChannels ? sum : sum + (r.unreadCount || 0)),
    0
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('wavelink:unread-chat-count', {
        detail: { count: totalUnreadMessages }
      })
    );
  }, [totalUnreadMessages]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('wavelink:chat-input-focus', {
          detail: { focused: false }
        })
      );
    };
  }, []);

  // Visible rows for the currently active tab
  const displayedInboxRows =
    inboxTab === 'unread'
      ? unreadInboxRows
      : inboxTab === 'groups'
      ? groupInboxRows
      : inboxTab === 'archived'
      ? archivedInboxRows
      : unarchivedInboxRows;
  const visibleInboxRows = displayedInboxRows.slice(0, convoDisplayLimit);

  // On mobile/tablet (< 1024px), show the Chat List screen when showMobileChannels is true or no conversation is active
  const isMobileListScreenVisible = showMobileChannels || !activeChannel;
  const isActiveChannelMuted = Boolean(activeChannel && mutedChannelIds.includes(activeChannel));

  const sharedPhotosInChat = messages.flatMap((m) => {
    if (m.isDeleted || m.mediaType === 'audio' || m.mediaType === 'video' || m.mediaType === 'file') return [];
    if (m.mediaUrls && m.mediaUrls.length > 0) return m.mediaUrls;
    if (m.mediaUrl) return [m.mediaUrl];
    return [];
  });
  const sharedFilesInChat = messages.flatMap(
    (
      m
    ): {
      id: string;
      url: string;
      type: string;
      senderName: string;
      createdAt: string;
    }[] => {
      if (m.isDeleted) return [];
      if (m.mediaType === 'file' && m.mediaUrl) {
        return [
          {
            id: m.id,
            url: m.mediaUrl,
            type: m.fileName || 'Attachment',
            senderName: m.senderName,
            createdAt: m.createdAt
          }
        ];
      }
      if (m.mediaType === 'video' && m.mediaUrl) {
        return [
          {
            id: m.id,
            url: m.mediaUrl,
            type: 'Video clip',
            senderName: m.senderName,
            createdAt: m.createdAt
          }
        ];
      }
      if ((m.mediaType === 'audio' || m.audioUrl) && (m.audioUrl || m.mediaUrl)) {
        return [
          {
            id: m.id,
            url: (m.audioUrl || m.mediaUrl)!,
            type: 'Voice note',
            senderName: m.senderName,
            createdAt: m.createdAt
          }
        ];
      }
      return [];
    }
  );

  const handleOpenMemberChat = (memberId: string, fromSearch = false) => {
    if (!currentUser?.uid) return;
    if (fromSearch || isSearchingUsers || isNewChatSheetOpen) {
      setSearchedAllowedUserIds((prev) => {
        if (prev.includes(memberId)) return prev;
        const next = [memberId, ...prev].slice(0, 100);
        try {
          localStorage.setItem('wavelink_searched_chat_uids', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
    const dmId = computeDmConversationId(currentUser.uid, memberId);
    setUnreadCountsByChannel((prev) => (prev[dmId] === 0 ? prev : { ...prev, [dmId]: 0 }));
    setActiveChannel(dmId);
    setReplyingTo(null);
    setReactionMenuMsgId(null);
    setShowHeaderMenu(false);
    setShowMobileAttachTray(false);
    setIsMobileComposerOpen(false);
    setIsNewChatSheetOpen(false);
    setSwipedRowId(null);
    setShowMobileChannels(false);
  };

  const handleOpenGroupChat = (groupId: string) => {
    setUnreadCountsByChannel((prev) => (prev[groupId] === 0 ? prev : { ...prev, [groupId]: 0 }));
    setActiveChannel(groupId);
    setReplyingTo(null);
    setReactionMenuMsgId(null);
    setShowHeaderMenu(false);
    setShowMobileAttachTray(false);
    setIsMobileComposerOpen(false);
    setSwipedRowId(null);
    setShowMobileChannels(false);
  };

  // Mark a single conversation as unread
  const handleMarkChannelUnread = async (channelId: string) => {
    if (!channelId || !currentUser?.uid) return;
    setUnreadCountsByChannel((prev) => ({ ...prev, [channelId]: Math.max(1, prev[channelId] || 1) }));
    if (channelId.startsWith('dm_') && channelMetaMap[channelId]?.lastMessageText) {
      await setDoc(
        doc(db, 'channels', channelId),
        {
          unread: { [currentUser.uid]: 1 },
          unreadCounts: { [currentUser.uid]: 1 }
        },
        { merge: true }
      ).catch(() => {});
    }
    showGlobalToast('Marked conversation as unread.');
  };

  // Mark all unread inbox conversations as read
  const handleMarkAllAsRead = async () => {
    if (!currentUser?.uid) return;
    const nowIso = new Date().toISOString();
    const unreadChIds = unreadInboxRows.map((r) => r.channelId);
    setUnreadCountsByChannel((prev) => {
      const next = { ...prev };
      unreadChIds.forEach((id) => {
        next[id] = 0;
      });
      return next;
    });
    await Promise.all(
      unreadChIds.map((chId) => {
        if (chId.startsWith('dm_')) {
          return setDoc(
            doc(db, 'channels', chId),
            {
              lastSeen: { [currentUser.uid]: nowIso },
              unread: { [currentUser.uid]: 0 },
              unreadCounts: { [currentUser.uid]: 0 }
            },
            { merge: true }
          ).catch(() => {});
        }
        return setDoc(
          doc(db, 'groups', chId),
          {
            lastSeen: { [currentUser.uid]: nowIso }
          },
          { merge: true }
        ).catch(() => {});
      })
    );
    showGlobalToast('All inbox messages marked as read.');
  };

  // Accept a pending message request -> moves conversation to Inbox and adds sender to contacts
  const handleAcceptChatRequest = async (member: UserProfile) => {
    if (!currentUser?.uid) return;
    const dmId = computeDmConversationId(currentUser.uid, member.id);
    const nowIso = new Date().toISOString();
    setLocalAcceptedChannels((prev) => {
      const next = Array.from(new Set([...prev, dmId]));
      try {
        localStorage.setItem('wavelink_accepted_channels', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    const nextContactIds = Array.from(
      new Set([...(userProfile?.contactIds || []), member.id])
    );
    updateUserProfile({ contactIds: nextContactIds }).catch(() => {});

    const existingMeta = channelMetaMap[dmId];
    const nextAcceptedBy = Array.from(
      new Set([...(existingMeta?.acceptedBy || []), currentUser.uid, member.id])
    );
    await setDoc(
      doc(db, 'channels', dmId),
      {
        requestStatus: 'accepted',
        acceptedBy: nextAcceptedBy,
        updatedAt: nowIso
      },
      { merge: true }
    ).catch(() => {});

    showGlobalToast(`Accepted chat request from ${member.displayName}. Moved to Inbox!`);
    setInboxTab('inbox');
    handleOpenMemberChat(member.id, true);
  };

  // Delete conversation for ME only (stores deletedAt.{myUid} so the other person keeps theirs; returns only if a new message arrives later)
  const handleDeleteConversationForMe = async (channelId: string) => {
    if (!channelId || !currentUser?.uid) return;
    const nowIso = new Date().toISOString();

    setLocalDeletedAtByChannel((prev) => {
      const next = { ...prev, [channelId]: nowIso };
      try {
        localStorage.setItem('wavelink_deleted_at_channels', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setUnreadCountsByChannel((prev) => ({ ...prev, [channelId]: 0 }));

    if (activeChannel === channelId) {
      setActiveChannel('');
      setMessages([]);
      setShowMobileChannels(true);
    }

    if (channelId.startsWith('dm_') && channelMetaMap[channelId]) {
      await setDoc(
        doc(db, 'channels', channelId),
        {
          deletedAt: { [currentUser.uid]: nowIso },
          clearedAt: { [currentUser.uid]: nowIso },
          unread: { [currentUser.uid]: 0 },
          unreadCounts: { [currentUser.uid]: 0 }
        },
        { merge: true }
      ).catch(() => {});
    }

    setConfirmDeleteChannelId(null);
    setActionMenuRowId(null);
    setSwipedRowId(null);
    showGlobalToast('Conversation deleted for you.');
  };

  // Clear chat history for ME only (keeps conversation in inbox or clears messages up to now)
  const handleClearConversationForMe = async (channelId: string) => {
    if (!channelId || !currentUser?.uid) return;
    const nowIso = new Date().toISOString();
    if (channelId.startsWith('dm_') && channelMetaMap[channelId]) {
      await setDoc(
        doc(db, 'channels', channelId),
        {
          clearedAt: { [currentUser.uid]: nowIso },
          unread: { [currentUser.uid]: 0 },
          unreadCounts: { [currentUser.uid]: 0 }
        },
        { merge: true }
      ).catch(() => {});
    }
    if (activeChannel === channelId) {
      setMessages([]);
    }
    setActionMenuRowId(null);
    showGlobalToast('Chat history cleared for you.');
  };

  // Save or clear 24-hour 60-character note on users/{myUid}.chatNote
  const handleSaveMyChatNote = async (clearNote = false) => {
    if (!currentUser?.uid) return;
    const trimmed = clearNote ? '' : noteDraftText.trim().slice(0, 60);
    if (trimmed) {
      const modVerdict = await validateAndModerateText(trimmed, 'chat', userProfile);
      if (!modVerdict.allowed) {
        showGlobalToast(modVerdict.friendlyMessage);
        return;
      }
    }
    setIsSavingNote(true);
    try {
      if (!trimmed) {
        await updateUserProfile({ chatNote: null });
        showGlobalToast('Removed your note.');
      } else {
        const now = Date.now();
        const noteObj = {
          text: trimmed,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 24 * 3600 * 1000).toISOString()
        };
        await updateUserProfile({ chatNote: noteObj });
        showGlobalToast('Your 24-hour note is live!');
      }
      setIsNoteModalOpen(false);
    } catch {
      showGlobalToast('Could not save note. Please try again.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Desktop keyboard shortcuts (Up/Down to move, Enter to open, Delete to delete with confirmation, Ctrl+K to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsNewChatSheetOpen(true);
        setTimeout(() => newChatInputRef.current?.focus(), 60);
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable ||
        isNewChatSheetOpen ||
        isNoteModalOpen ||
        Boolean(confirmDeleteChannelId) ||
        Boolean(actionMenuRowId)
      ) {
        return;
      }

      if (visibleInboxRows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex((prev) =>
          prev < visibleInboxRows.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex((prev) =>
          prev > 0 ? prev - 1 : visibleInboxRows.length - 1
        );
      } else if (e.key === 'Enter' && focusedRowIndex >= 0 && focusedRowIndex < visibleInboxRows.length) {
        e.preventDefault();
        const targetRow = visibleInboxRows[focusedRowIndex];
        if (targetRow.kind === 'dm') {
          handleOpenMemberChat(targetRow.member.id);
        } else {
          handleOpenGroupChat(targetRow.group.id);
        }
      } else if (e.key === 'Delete') {
        const targetRow =
          focusedRowIndex >= 0 && focusedRowIndex < visibleInboxRows.length
            ? visibleInboxRows[focusedRowIndex]
            : visibleInboxRows.find((r) => r.channelId === activeChannel);
        if (targetRow) {
          e.preventDefault();
          setConfirmDeleteChannelId(targetRow.channelId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visibleInboxRows,
    focusedRowIndex,
    activeChannel,
    isNewChatSheetOpen,
    isNoteModalOpen,
    confirmDeleteChannelId,
    actionMenuRowId
  ]);

  // Format a clean one-line message preview with media icons instead of raw text/filenames
  const renderLastMessagePreviewContent = (params: {
    previewText: string;
    senderPrefix: string;
    mediaType?: string;
    isUnread: boolean;
  }) => {
    const { previewText, senderPrefix, mediaType, isUnread } = params;
    const lower = (previewText || '').toLowerCase();
    const isPhoto =
      mediaType === 'image' ||
      lower.startsWith('📷') ||
      lower.includes('sent a photo') ||
      lower.includes('shared a photo');
    const isVideo =
      mediaType === 'video' ||
      lower.startsWith('🎬') ||
      lower.includes('sent a video') ||
      lower.includes('video clip');
    const isAudio =
      mediaType === 'audio' ||
      lower.startsWith('🎤') ||
      lower.includes('voice note') ||
      lower.includes('sent an audio');
    const isFile =
      mediaType === 'file' ||
      lower.startsWith('📎') ||
      lower.includes('sent a file') ||
      lower.includes('attachment');

    const textWeightClass = isUnread
      ? 'font-extrabold text-[var(--text-primary)]'
      : 'font-medium text-[var(--text-secondary)]';

    if (isPhoto) {
      return (
        <span className={`text-xs flex items-center gap-1.5 truncate mt-1 ${textWeightClass}`}>
          <ImageIcon size={13} className="text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">{senderPrefix}Photo</span>
        </span>
      );
    }
    if (isVideo) {
      return (
        <span className={`text-xs flex items-center gap-1.5 truncate mt-1 ${textWeightClass}`}>
          <Film size={13} className="text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">{senderPrefix}Video</span>
        </span>
      );
    }
    if (isAudio) {
      return (
        <span className={`text-xs flex items-center gap-1.5 truncate mt-1 ${textWeightClass}`}>
          <Mic size={13} className="text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">{senderPrefix}Voice note</span>
        </span>
      );
    }
    if (isFile) {
      return (
        <span className={`text-xs flex items-center gap-1.5 truncate mt-1 ${textWeightClass}`}>
          <Paperclip size={13} className="text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">{senderPrefix}Attachment</span>
        </span>
      );
    }
    return (
      <span className={`text-xs block truncate mt-1 ${textWeightClass}`}>
        {senderPrefix}
        {previewText || 'Message'}
      </span>
    );
  };

  return (
    <div className="wavelink-chat-wrapper w-full max-w-full overflow-x-hidden">
      <div
        ref={chatShellRef}
        className="wavelink-chat-shell bg-[var(--bg-surface)] text-[var(--text-primary)] border-y lg:border border-[var(--border-hairline)] shadow-sm w-full max-w-full overflow-hidden"
      >
        {/* =====================================================================
            SCREEN 1: DARK GLASSY "MESSAGE" INBOX (Mobile Full Screen; Desktop ~380px Left Pane >= 1024px)
           ===================================================================== */}
        <div
          className={`wavelink-chat-left-col wavelink-msg-inbox-col relative w-full h-full lg:border-r border-[var(--border-hairline)] flex-col shrink-0 ${
            isMobileListScreenVisible ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* 1. TOP BAR: Round glass back button on left, centered title "Message", round glass "..." menu on right */}
          <div
            ref={chatHomeHeaderRef}
            data-header-hidden={isMobileChatHeaderHidden ? 'true' : 'false'}
            className="wavelink-chat-home-header wavelink-msg-glass-header px-3.5 py-3 shrink-0"
          >
            <div className="flex items-center justify-between gap-2 relative">
              {/* Left: Round Glass Back Button */}
              <button
                type="button"
                onClick={() => {
                  if (inboxTab === 'archived' || inboxTab === 'groups') {
                    setInboxTab('inbox');
                    return;
                  }
                  window.dispatchEvent(
                    new CustomEvent('wavelink:navigate', { detail: { tab: 'feed' } })
                  );
                }}
                className="wavelink-msg-glass-circle-btn"
                title={inboxTab === 'archived' || inboxTab === 'groups' ? 'Back to Inbox' : 'Back to Home'}
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>

              {/* Center: Title "Message" */}
              <div className="flex flex-col items-center justify-center min-w-0 pointer-events-none">
                <h2 className="font-extrabold text-[17px] tracking-tight text-[var(--text-primary)] leading-tight">
                  {inboxTab === 'archived'
                    ? 'Archived'
                    : inboxTab === 'groups'
                    ? 'Groups'
                    : 'Message'}
                </h2>
              </div>

              {/* Right: Round Glass "..." Menu Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowInboxMoreMenu((prev) => !prev)}
                  className="wavelink-msg-glass-circle-btn"
                  title="More options"
                  aria-label="Message menu"
                  aria-expanded={showInboxMoreMenu}
                >
                  <MoreHorizontal size={19} />
                </button>

                {showInboxMoreMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowInboxMoreMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-hairline)] shadow-2xl py-1.5 z-50 text-xs font-bold text-[var(--text-primary)]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowInboxMoreMenu(false);
                          setSelectedMemberIds([]);
                          setNewGroupName('');
                          setNewGroupDesc('');
                          setNewGroupLogo(PRESET_LOGOS[0].url);
                          setIsCreateGroupOpen(true);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[var(--bg-subtle)] transition text-left cursor-pointer"
                      >
                        <Users size={15} className="text-[var(--accent-primary)]" />
                        <span>New group</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInboxMoreMenu(false);
                          handleMarkAllAsRead();
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[var(--bg-subtle)] transition text-left cursor-pointer"
                      >
                        <CheckCheck size={15} className="text-emerald-500" />
                        <span>Mark all as read</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInboxMoreMenu(false);
                          setInboxTab((prev) => (prev === 'groups' ? 'inbox' : 'groups'));
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[var(--bg-subtle)] transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Hash size={15} className="text-[var(--accent-secondary)]" />
                          <span>Groups</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[10px] font-extrabold text-[var(--text-secondary)]">
                          {filteredGroups.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInboxMoreMenu(false);
                          setInboxTab((prev) => (prev === 'archived' ? 'inbox' : 'archived'));
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[var(--bg-subtle)] transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Archive size={15} className="text-amber-500" />
                          <span>Archived</span>
                        </span>
                        {archivedInboxRows.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[10px] font-extrabold text-[var(--text-secondary)]">
                            {archivedInboxRows.length}
                          </span>
                        )}
                      </button>

                      <div className="my-1 border-t border-[var(--border-hairline)]" />

                      <button
                        type="button"
                        onClick={() => {
                          setShowInboxMoreMenu(false);
                          setIsChatSettingsModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[var(--bg-subtle)] transition text-left cursor-pointer"
                      >
                        <SlidersHorizontal size={15} className="text-[var(--accent-primary)]" />
                        <span>Chat settings</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable Message Inbox Body */}
          <div
            ref={chatHomeScrollRef}
            onClick={() => {
              if (swipedRowId) setSwipedRowId(null);
            }}
            className="wavelink-chat-home-scroll flex-1 overflow-y-auto px-3.5 pt-2 space-y-3.5 pb-36"
          >
            {/* 2. FLOATING PROFILE BUBBLE CLUSTER ROW (my bigger center bubble with "+" & "Add note", surrounded by max 8 contacts/online friends) */}
            <div className="wavelink-msg-bubble-cluster">
              {/* Left cluster contacts (max 4) */}
              {leftClusterContacts.map((person, idx) => {
                const firstName = (person.displayName || 'Waver').split(' ')[0];
                const isBot = person.id === SUPPORT_BOT_ID;
                const contactNote = showNotesInInbox ? getActiveChatNoteText(person.chatNote) : null;
                const offsetClass =
                  idx % 2 === 0
                    ? 'wavelink-msg-bubble-node--offset-up'
                    : 'wavelink-msg-bubble-node--offset-down';

                return (
                  <button
                    key={`cluster_left_${person.id}`}
                    type="button"
                    onClick={() => handleOpenMemberChat(person.id)}
                    className={`wavelink-msg-bubble-node ${offsetClass} group`}
                    title={`Chat with ${person.displayName}`}
                  >
                    {contactNote && (
                      <span className="wavelink-msg-note-bubble" title={contactNote}>
                        {contactNote}
                      </span>
                    )}
                    <div className="wavelink-msg-bubble-ring transition-transform group-hover:scale-105 group-active:scale-95">
                      <Avatar
                        uid={person.id}
                        src={
                          person.photoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
                        }
                        alt={person.displayName}
                        fallbackName={person.displayName}
                        size={48}
                        showStatus={!isBot}
                        targetProfile={person}
                        imageClassName="border-2 border-[var(--bg-surface)]"
                      />
                      {isBot && (
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                          title="Online"
                        />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-[var(--text-primary)] max-w-[62px] truncate">
                      {firstName}
                    </span>
                  </button>
                );
              })}

              {/* Center: My Own Bigger Bubble with Gradient Ring, Presence Dot, "+" Badge, and Floating "Add note" Speech Bubble */}
              {currentUser && (
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraftText(myActiveNoteText || '');
                    setIsNoteModalOpen(true);
                  }}
                  className="wavelink-msg-bubble-node wavelink-msg-bubble-node--center group"
                  title={myActiveNoteText ? `Edit your note: "${myActiveNoteText}"` : 'Add a 24-hour note'}
                >
                  {showNotesInInbox && (
                    <span className="wavelink-msg-note-bubble">
                      {myActiveNoteText || 'Add note'}
                    </span>
                  )}
                  <div className="wavelink-msg-bubble-ring transition-transform group-hover:scale-105 group-active:scale-95">
                    <Avatar
                      uid={currentUser.uid}
                      src={getBestAuthUserPhotoUrl(currentUser, userProfile)}
                      alt={userProfile?.displayName || currentUser.displayName || 'You'}
                      fallbackName={userProfile?.displayName || currentUser.displayName || 'You'}
                      size={62}
                      showStatus={true}
                      targetProfile={userProfile || undefined}
                      imageClassName="border-2 border-[var(--bg-surface)]"
                    />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full text-white flex items-center justify-center ring-2 ring-[var(--bg-surface)] shadow-md"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                    >
                      <Plus size={12} strokeWidth={3} />
                    </span>
                  </div>
                  <span className="text-[11px] font-extrabold text-[var(--text-primary)] max-w-[68px] truncate">
                    You
                  </span>
                </button>
              )}

              {/* Right cluster contacts (max 4) */}
              {rightClusterContacts.map((person, idx) => {
                const firstName = (person.displayName || 'Waver').split(' ')[0];
                const isBot = person.id === SUPPORT_BOT_ID;
                const contactNote = showNotesInInbox ? getActiveChatNoteText(person.chatNote) : null;
                const offsetClass =
                  idx % 2 === 0
                    ? 'wavelink-msg-bubble-node--offset-down'
                    : 'wavelink-msg-bubble-node--offset-up';

                return (
                  <button
                    key={`cluster_right_${person.id}`}
                    type="button"
                    onClick={() => handleOpenMemberChat(person.id)}
                    className={`wavelink-msg-bubble-node ${offsetClass} group`}
                    title={`Chat with ${person.displayName}`}
                  >
                    {contactNote && (
                      <span className="wavelink-msg-note-bubble" title={contactNote}>
                        {contactNote}
                      </span>
                    )}
                    <div className="wavelink-msg-bubble-ring transition-transform group-hover:scale-105 group-active:scale-95">
                      <Avatar
                        uid={person.id}
                        src={
                          person.photoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
                        }
                        alt={person.displayName}
                        fallbackName={person.displayName}
                        size={48}
                        showStatus={!isBot}
                        targetProfile={person}
                        imageClassName="border-2 border-[var(--bg-surface)]"
                      />
                      {isBot && (
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                          title="Online"
                        />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-[var(--text-primary)] max-w-[62px] truncate">
                      {firstName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 3. GLASS SEGMENTED PILL WITH 3 TABS: "Inbox <count>", "Unread", and "Requests" */}
            <div className="space-y-2">
              <div className="wavelink-msg-segmented-pill" role="tablist" aria-label="Message tabs">
                {/* Tab 1: Inbox <count> (count of conversations with unread messages, or total if zero unread) */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={inboxTab === 'inbox'}
                  onClick={() => setInboxTab('inbox')}
                  className="wavelink-msg-segmented-tab"
                >
                  <span>Inbox</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[11px] font-black leading-none ${
                      inboxTab === 'inbox'
                        ? 'bg-white/25 text-white'
                        : unreadConversationsCount > 0
                        ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]'
                        : 'bg-white/10 text-[var(--text-secondary)]'
                    }`}
                  >
                    {inboxTabBadgeNumber}
                  </span>
                </button>

                {/* Tab 2: Unread */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={inboxTab === 'unread'}
                  onClick={() => setInboxTab('unread')}
                  className="wavelink-msg-segmented-tab"
                >
                  <span>Unread</span>
                  {unreadConversationsCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                        inboxTab === 'unread'
                          ? 'bg-white/25 text-white'
                          : 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]'
                      }`}
                    >
                      {unreadConversationsCount}
                    </span>
                  )}
                </button>

                {/* Tab 3: Requests (with small count badge + dot when new; never adds to Inbox badge) */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={inboxTab === 'requests'}
                  onClick={() => setInboxTab('requests')}
                  className="wavelink-msg-segmented-tab relative"
                >
                  <span>Requests</span>
                  {pendingRequestsCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                          inboxTab === 'requests'
                            ? 'bg-white/25 text-white'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {pendingRequestsCount}
                      </span>
                    </span>
                  )}
                </button>
              </div>

              {/* Filter chip strip for Groups, New Group, Archived, and quick search filter */}
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setInboxTab((prev) => (prev === 'groups' ? 'inbox' : 'groups'))}
                    className={`min-h-[32px] px-3 py-1 rounded-full text-[11px] font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
                      inboxTab === 'groups'
                        ? 'bg-[var(--accent-primary)] text-white border-transparent shadow-2xs'
                        : 'bg-[var(--bg-subtle)]/80 text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Users size={12} />
                    <span>Groups ({filteredGroups.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberIds([]);
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupLogo(PRESET_LOGOS[0].url);
                      setIsCreateGroupOpen(true);
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-[var(--bg-subtle)]/80 text-[var(--accent-primary)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>New Group</span>
                  </button>

                  {archivedInboxRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setInboxTab((prev) => (prev === 'archived' ? 'inbox' : 'archived'))
                      }
                      className={`min-h-[32px] px-2.5 py-1 rounded-full text-[11px] font-extrabold border transition flex items-center gap-1 cursor-pointer ${
                        inboxTab === 'archived'
                          ? 'bg-amber-500 text-white border-transparent'
                          : 'bg-[var(--bg-subtle)]/80 text-[var(--text-secondary)] border-[var(--border-hairline)]'
                      }`}
                    >
                      <Archive size={11} />
                      <span>Archived ({archivedInboxRows.length})</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsNewChatSheetOpen(true);
                    setTimeout(() => newChatInputRef.current?.focus(), 60);
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--bg-subtle)]/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  title="Search chats or people (Ctrl+K)"
                >
                  <Search size={12} />
                  <span>Search</span>
                </button>
              </div>
            </div>

            {/* 4. THE LIST: REQUESTS TAB vs INBOX / UNREAD / GROUPS / ARCHIVED ROWS */}
            {inboxTab === 'requests' ? (
              <div className="space-y-2.5">
                <div className="px-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-[var(--text-secondary)]">
                    Messages from people you don&apos;t follow appear here (max 2 messages until you accept).
                  </p>
                </div>

                {requestChatMembers.length === 0 ? (
                  <div className="p-7 rounded-3xl bg-[var(--bg-surface)]/60 border border-[var(--border-hairline)] text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center mx-auto text-[var(--text-secondary)]">
                      <MailOpen size={22} />
                    </div>
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">
                      No message requests
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      When someone outside your contacts sends you a message, you can preview, accept, or delete it here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {requestChatMembers.map((member) => {
                      if (!currentUser) return null;
                      const dmId = computeDmConversationId(currentUser.uid, member.id);
                      const meta = channelMetaMap[dmId];
                      const latest = latestMessageByChannel[dmId];
                      const previewText = latest?.text || meta?.lastMessageText || 'Sent you a message request';
                      const timeLabel = formatCompactConvoTime(
                        latest?.createdAt || meta?.lastMessageAt || meta?.updatedAt
                      );

                      return (
                        <div
                          key={`req_${dmId}`}
                          className="p-3.5 rounded-3xl bg-[var(--bg-surface)]/85 border border-[var(--border-hairline)] space-y-3 shadow-xs"
                        >
                          <div
                            onClick={() => handleOpenMemberChat(member.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleOpenMemberChat(member.id);
                            }}
                            className="flex items-center gap-3.5 cursor-pointer"
                          >
                            <div className="wavelink-msg-bubble-ring shrink-0">
                              <Avatar
                                uid={member.id}
                                src={
                                  member.photoURL ||
                                  `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                                }
                                alt={member.displayName}
                                fallbackName={member.displayName}
                                size={56}
                                showStatus={true}
                                targetProfile={member}
                                imageClassName="border-2 border-[var(--bg-surface)]"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                                  {member.displayName}
                                </span>
                                {timeLabel && (
                                  <span className="text-[11px] font-bold text-[var(--text-secondary)] shrink-0">
                                    {timeLabel}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-semibold text-[var(--text-secondary)] truncate">
                                {member.username || '@waver'}
                              </p>
                              <p className="text-xs font-extrabold text-[var(--text-primary)] truncate mt-1">
                                {previewText}
                              </p>
                            </div>
                          </div>

                          {/* Request Action Buttons: Accept, Delete, Block / Report */}
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleAcceptChatRequest(member)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                              style={{
                                background:
                                  'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                              }}
                            >
                              <Check size={14} />
                              <span>Accept</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteChannelId(dmId)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-rose-500/15 text-[var(--text-primary)] hover:text-rose-500 border border-[var(--border-hairline)] text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                await toggleBlockUser(member.id);
                                await reportContent({
                                  targetType: 'user',
                                  targetId: member.id,
                                  reason: 'Unwanted message request / spam'
                                }).catch(() => {});
                                await handleDeleteConversationForMe(dmId);
                              }}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 text-xs font-extrabold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                            >
                              <Ban size={13} />
                              <span>Block</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* INBOX / UNREAD / GROUPS / ARCHIVED LIST */
              <div className="space-y-2">
                {isLoadingConversations ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="w-full min-h-[78px] p-3 rounded-[22px] bg-[var(--bg-surface)]/60 border border-[var(--border-hairline)] flex items-center gap-3.5 animate-pulse"
                      >
                        <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-32 rounded-full bg-[var(--bg-subtle)]" />
                          <div className="h-3 w-48 rounded-full bg-[var(--bg-subtle)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : visibleInboxRows.length === 0 ? (
                  <div className="p-7 rounded-3xl bg-[var(--bg-surface)]/60 border border-[var(--border-hairline)] text-center space-y-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-white shadow-sm"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                    >
                      <MessageSquare size={22} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-extrabold text-[var(--text-primary)]">
                        {inboxTab === 'unread'
                          ? 'All caught up!'
                          : inboxTab === 'archived'
                          ? 'No archived chats'
                          : inboxTab === 'groups'
                          ? 'No groups yet'
                          : 'Your inbox is clean'}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {inboxTab === 'unread'
                          ? 'You have zero unread messages right now.'
                          : inboxTab === 'groups'
                          ? 'Create a group to chat with your circle together.'
                          : 'Conversations appear here once you exchange a message. Tap New chat to message a contact or find someone.'}
                      </p>
                    </div>
                    {inboxTab === 'inbox' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewChatSheetOpen(true);
                          setTimeout(() => newChatInputRef.current?.focus(), 60);
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-2xl text-white text-xs font-extrabold inline-flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                        }}
                      >
                        <Plus size={15} />
                        <span>Start a New Chat</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleInboxRows.map((row, rowIdx) => {
                      if (!currentUser) return null;
                      const { channelId, unreadCount, isPinned, isMuted } = row;
                      const isActive = activeChannel === channelId && !showMobileChannels;
                      const isKeyboardFocused = focusedRowIndex === rowIdx;
                      const isSwipedOpen = swipedRowId === channelId;
                      const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

                      const handleRowTouchStart = (e: React.TouchEvent) => {
                        const t = e.touches[0];
                        if (!t) return;
                        rowSwipeTouchRef.current = {
                          id: channelId,
                          startX: t.clientX,
                          startY: t.clientY
                        };
                        if (rowLongPressTimerRef.current) clearTimeout(rowLongPressTimerRef.current);
                        rowLongPressTimerRef.current = setTimeout(() => {
                          setActionMenuRowId(channelId);
                        }, 520);
                      };

                      const handleRowTouchMove = (e: React.TouchEvent) => {
                        const start = rowSwipeTouchRef.current;
                        const t = e.touches[0];
                        if (!start || start.id !== channelId || !t) return;
                        const dx = t.clientX - start.startX;
                        const dy = t.clientY - start.startY;
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                          if (rowLongPressTimerRef.current) {
                            clearTimeout(rowLongPressTimerRef.current);
                            rowLongPressTimerRef.current = null;
                          }
                        }
                        if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                          if (dx < 0) {
                            setSwipedRowId(channelId);
                          } else if (dx > 0 && swipedRowId === channelId) {
                            setSwipedRowId(null);
                          }
                        }
                      };

                      const handleRowTouchEnd = () => {
                        if (rowLongPressTimerRef.current) {
                          clearTimeout(rowLongPressTimerRef.current);
                          rowLongPressTimerRef.current = null;
                        }
                        rowSwipeTouchRef.current = null;
                      };

                      if (row.kind === 'group') {
                        const group = row.group;
                        const grpLatest = latestMessageByChannel[group.id];
                        const grpTypers = getActiveTypingUsersForChannel(group.id);
                        const timeLabel = formatCompactConvoTime(row.lastMessageAt);
                        const senderPrefix = grpLatest?.text
                          ? grpLatest.senderId === currentUser.uid
                            ? 'You: '
                            : `${(grpLatest.senderName || 'Member').split(' ')[0]}: `
                          : '';

                        return (
                          <div
                            key={group.id}
                            className="wavelink-msg-row-wrap"
                            onTouchStart={handleRowTouchStart}
                            onTouchMove={handleRowTouchMove}
                            onTouchEnd={handleRowTouchEnd}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setActionMenuRowId(group.id);
                            }}
                          >
                            {/* Swipe-left Action Tray: Mute & Delete */}
                            <div className="wavelink-msg-row-actions-tray">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMuteChannel(group.id);
                                  setSwipedRowId(null);
                                }}
                                className="w-16 h-full bg-slate-700 text-white text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer"
                              >
                                {isMuted ? <Bell size={15} /> : <BellOff size={15} />}
                                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteChannelId(group.id);
                                  setSwipedRowId(null);
                                }}
                                className="w-16 h-full bg-rose-600 text-white text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={15} />
                                <span>Delete</span>
                              </button>
                            </div>

                            {/* Foreground Row Card */}
                            <div
                              role="button"
                              tabIndex={0}
                              data-active={isActive ? 'true' : 'false'}
                              data-unread={unreadCount > 0 ? 'true' : 'false'}
                              style={{
                                transform: isSwipedOpen ? 'translateX(-128px)' : 'translateX(0)'
                              }}
                              onClick={() => {
                                if (isSwipedOpen) {
                                  setSwipedRowId(null);
                                  return;
                                }
                                setFocusedRowIndex(rowIdx);
                                handleOpenGroupChat(group.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleOpenGroupChat(group.id);
                              }}
                              className={`wavelink-msg-row-card w-full flex items-center gap-3.5 text-left cursor-pointer ${
                                isKeyboardFocused ? 'ring-2 ring-[var(--accent-primary)]' : ''
                              }`}
                            >
                              {/* 56px Avatar with Gradient Ring + Presence Dot */}
                              <div className="relative shrink-0">
                                <div className="wavelink-msg-bubble-ring">
                                  <img
                                    src={group.logoUrl || PRESET_LOGOS[0].url}
                                    alt={group.name}
                                    className="w-[56px] h-[56px] rounded-full object-cover border-2 border-[var(--bg-surface)] bg-[var(--bg-surface)]"
                                  />
                                </div>
                                <span
                                  className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                                  title="Active group"
                                />
                              </div>

                              {/* Name & 1-line Last Message Preview */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className={`text-sm text-[var(--text-primary)] truncate ${
                                        unreadCount > 0 ? 'font-black' : 'font-extrabold'
                                      }`}
                                    >
                                      {group.name}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] shrink-0">
                                      Group
                                    </span>
                                    {isPinned && (
                                      <span title="Pinned" className="inline-flex shrink-0">
                                        <Pin
                                          size={12}
                                          className="text-[var(--accent-primary)] shrink-0 rotate-45"
                                        />
                                      </span>
                                    )}
                                  </div>

                                  {/* Right side: Time + Mute Bell + Unread Badge */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {timeLabel && (
                                      <span
                                        className={`text-[11px] ${
                                          unreadCount > 0
                                            ? 'font-extrabold text-[var(--accent-primary)]'
                                            : 'font-semibold text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {timeLabel}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMuteChannel(group.id);
                                      }}
                                      className={`p-1 rounded-full transition cursor-pointer ${
                                        isMuted
                                          ? 'text-amber-500 bg-amber-500/10'
                                          : 'text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)]'
                                      }`}
                                      title={isMuted ? 'Unmute group' : 'Mute group'}
                                      aria-label={isMuted ? 'Unmute group' : 'Mute group'}
                                    >
                                      {isMuted ? <BellOff size={13} /> : <Bell size={13} />}
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {grpTypers.length > 0 ? (
                                      <span className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5 truncate mt-1">
                                        <span className="inline-flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                                        </span>
                                        <span className="truncate">
                                          {grpTypers[0].name.split(' ')[0]} is typing...
                                        </span>
                                      </span>
                                    ) : (
                                      renderLastMessagePreviewContent({
                                        previewText:
                                          grpLatest?.text ||
                                          group.description ||
                                          `${group.memberIds?.length || 1} members`,
                                        senderPrefix,
                                        isUnread: unreadCount > 0
                                      })
                                    )}
                                  </div>

                                  {unreadCount > 0 && (
                                    <span
                                      className={`wavelink-msg-unread-badge shrink-0 mt-1 ${
                                        isMuted ? 'wavelink-msg-unread-badge--muted' : ''
                                      }`}
                                    >
                                      {badgeText}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      /* DM Row */
                      const member = row.member;
                      const dmId = row.channelId;
                      const dmTypers = getActiveTypingUsersForChannel(dmId);
                      const isMemberTyping =
                        dmTypers.length > 0 || (member.id === SUPPORT_BOT_ID && isBotReplying);
                      const latestMsg = latestMessageByChannel[dmId];
                      const meta = channelMetaMap[dmId];
                      const previewText = latestMsg?.text || meta?.lastMessageText || '';
                      const previewSenderId =
                        latestMsg?.senderId || meta?.lastMessageSenderId || '';
                      const senderPrefix =
                        previewSenderId === currentUser.uid ? 'You: ' : '';
                      const compactTime = formatCompactConvoTime(row.lastMessageAt);

                      return (
                        <div
                          key={dmId}
                          className="wavelink-msg-row-wrap"
                          onTouchStart={handleRowTouchStart}
                          onTouchMove={handleRowTouchMove}
                          onTouchEnd={handleRowTouchEnd}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setActionMenuRowId(dmId);
                          }}
                        >
                          {/* Swipe-left Action Tray: Mute & Delete */}
                          <div className="wavelink-msg-row-actions-tray">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMuteChannel(dmId);
                                setSwipedRowId(null);
                              }}
                              className="w-16 h-full bg-slate-700 text-white text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer"
                            >
                              {isMuted ? <Bell size={15} /> : <BellOff size={15} />}
                              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteChannelId(dmId);
                                setSwipedRowId(null);
                              }}
                              className="w-16 h-full bg-rose-600 text-white text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={15} />
                              <span>Delete</span>
                            </button>
                          </div>

                          {/* Foreground Glassy Row Card */}
                          <div
                            role="button"
                            tabIndex={0}
                            data-active={isActive ? 'true' : 'false'}
                            data-unread={unreadCount > 0 ? 'true' : 'false'}
                            style={{
                              transform: isSwipedOpen ? 'translateX(-128px)' : 'translateX(0)'
                            }}
                            onClick={() => {
                              if (isSwipedOpen) {
                                setSwipedRowId(null);
                                return;
                              }
                              setFocusedRowIndex(rowIdx);
                              handleOpenMemberChat(member.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleOpenMemberChat(member.id);
                            }}
                            className={`wavelink-msg-row-card w-full flex items-center gap-3.5 text-left cursor-pointer ${
                              isKeyboardFocused ? 'ring-2 ring-[var(--accent-primary)]' : ''
                            }`}
                          >
                            {/* 56px Avatar with Gradient Ring + Live Green/Red Presence Dot */}
                            <div className="relative shrink-0">
                              <div className="wavelink-msg-bubble-ring">
                                <Avatar
                                  uid={member.id}
                                  src={
                                    member.photoURL ||
                                    `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                                  }
                                  alt={member.displayName}
                                  fallbackName={member.displayName}
                                  size={56}
                                  showStatus={member.id !== SUPPORT_BOT_ID}
                                  targetProfile={member}
                                  imageClassName="border-2 border-[var(--bg-surface)]"
                                />
                              </div>
                              {member.id === SUPPORT_BOT_ID && (
                                <span
                                  className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                                  title="24/7 Assistant"
                                />
                              )}
                            </div>

                            {/* Conversation Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`truncate ${
                                      unreadCount > 0 ? 'font-black' : 'font-extrabold'
                                    }`}
                                  >
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
                                  {isPinned && (
                                    <span title="Pinned chat" className="inline-flex shrink-0">
                                      <Pin
                                        size={12}
                                        className="text-[var(--accent-primary)] shrink-0 rotate-45"
                                      />
                                    </span>
                                  )}
                                  {(localChatThemes[dmId]?.themeId &&
                                    localChatThemes[dmId]?.themeId !== 'default') ||
                                  localChatThemes[dmId]?.customBgUrl ||
                                  localChatThemes[dmId]?.accentColor ? (
                                    <span
                                      className="w-4 h-4 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] inline-flex items-center justify-center shrink-0"
                                      title={`Chat theme: ${getChatThemeDisplayName(
                                        localChatThemes[dmId]?.themeId
                                      )}`}
                                    >
                                      <ChatThemeBadgeIcon
                                        themeId={localChatThemes[dmId]?.themeId}
                                        size={10}
                                      />
                                    </span>
                                  ) : null}
                                </div>

                                {/* Right side: Time ("2m", "08:24", "Yesterday") + Small Bell Icon to Mute/Unmute */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {compactTime && (
                                    <span
                                      className={`text-[11px] ${
                                        unreadCount > 0
                                          ? 'text-[var(--accent-primary)] font-extrabold'
                                          : 'text-[var(--text-secondary)] font-semibold'
                                      }`}
                                    >
                                      {compactTime}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleMuteChannel(dmId);
                                    }}
                                    className={`p-1 rounded-full transition cursor-pointer ${
                                      isMuted
                                        ? 'text-amber-500 bg-amber-500/10'
                                        : 'text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)]'
                                    }`}
                                    title={isMuted ? 'Unmute chat' : 'Mute chat'}
                                    aria-label={isMuted ? 'Unmute chat' : 'Mute chat'}
                                  >
                                    {isMuted ? <BellOff size={13} /> : <Bell size={13} />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  {isMemberTyping ? (
                                    <span className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5 truncate mt-1">
                                      <span className="inline-flex items-center gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                                      </span>
                                      <span>typing...</span>
                                    </span>
                                  ) : (
                                    renderLastMessagePreviewContent({
                                      previewText,
                                      senderPrefix,
                                      mediaType: meta?.lastMessageMediaType,
                                      isUnread: unreadCount > 0
                                    })
                                  )}
                                </div>

                                {unreadCount > 0 && (
                                  <span
                                    className={`wavelink-msg-unread-badge shrink-0 mt-1 ${
                                      isMuted ? 'wavelink-msg-unread-badge--muted' : ''
                                    }`}
                                  >
                                    {badgeText}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Load More Conversations Button (20 at first) */}
                {(displayedInboxRows.length > convoDisplayLimit ||
                  Object.keys(channelMetaMap).length >= convoFetchLimit) && (
                  <div className="pt-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setConvoDisplayLimit((prev) => prev + 20);
                        setConvoFetchLimit((prev) => prev + 20);
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-2xl bg-[var(--bg-surface)]/80 border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <History size={14} className="text-[var(--accent-primary)]" />
                      <span>Load more</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. FLOATING GLASS "NEW CHAT" BUTTON (bottom-right, above floating nav) */}
          <button
            type="button"
            onClick={() => {
              setIsNewChatSheetOpen(true);
              setTimeout(() => newChatInputRef.current?.focus(), 60);
            }}
            className="wavelink-floating-new-chat-btn absolute bottom-5 right-4 z-20 min-h-[48px] px-4.5 py-2.5 rounded-full text-white font-extrabold text-xs flex items-center gap-2 shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border border-white/25 backdrop-blur-xl"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
            }}
            title="Start a new chat (Ctrl+K)"
          >
            <MessageSquare size={16} />
            <span>New chat</span>
          </button>

          {/* =====================================================================
              MODAL A: NEW CHAT SEARCH SHEET (My Contacts first + >=2 char prefix search)
             ===================================================================== */}
          {isNewChatSheetOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4">
              <div className="w-full sm:max-w-md max-h-[86dvh] rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl flex flex-col overflow-hidden">
                <div className="px-4 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                      New chat
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Select a contact or search by name / @handle
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChatSheetOpen(false);
                      setNewChatSearchQuery('');
                    }}
                    className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                    aria-label="Close new chat"
                  >
                    <X size={17} />
                  </button>
                </div>

                {/* Search Input (queries Firestore ONLY after >= 2 characters, limit 10, debounced 400ms) */}
                <div className="p-3.5 border-b border-[var(--border-hairline)] space-y-2.5">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                    />
                    <input
                      ref={newChatInputRef}
                      type="text"
                      value={newChatSearchQuery}
                      onChange={(e) => setNewChatSearchQuery(e.target.value)}
                      placeholder="Type at least 2 letters to search @username or name..."
                      className="w-full min-h-[44px] pl-10 pr-9 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:bg-[var(--bg-surface)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                    {newChatSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setNewChatSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Quick Actions: New Group & Invite Link */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewChatSheetOpen(false);
                        setSelectedMemberIds([]);
                        setNewGroupName('');
                        setNewGroupDesc('');
                        setNewGroupLogo(PRESET_LOGOS[0].url);
                        setIsCreateGroupOpen(true);
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Users size={14} className="text-[var(--accent-primary)]" />
                      <span>New Group</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const inviteUrl = `${window.location.origin}/?invite=${encodeURIComponent(
                          currentUser?.uid || ''
                        )}`;
                        try {
                          if (navigator.share) {
                            await navigator.share({
                              title: 'Join me on WaveLink',
                              text: 'Join me on WaveLink and chat with me directly!',
                              url: inviteUrl
                            });
                          } else {
                            await navigator.clipboard.writeText(inviteUrl);
                            showGlobalToast('Invite link copied! Friends who join are added to your contacts.');
                          }
                        } catch {
                          // ignore share cancel
                        }
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Share2 size={14} className="text-[var(--accent-secondary)]" />
                      <span>Invite Friend Link</span>
                    </button>
                  </div>
                </div>

                {/* Contacts & Search Results List */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                  {newChatSearchQuery.trim().length >= 2 ? (
                    <>
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] px-1">
                        {isSearchingNewChat
                          ? 'Searching...'
                          : `Search Results (${newChatSearchResults.length})`}
                      </p>
                      {!isSearchingNewChat && newChatSearchResults.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                          No users found matching &ldquo;{newChatSearchQuery.trim()}&rdquo;.
                        </div>
                      ) : (
                        newChatSearchResults.map((person) => (
                          <button
                            key={`search_res_${person.id}`}
                            type="button"
                            onClick={() => handleOpenMemberChat(person.id, true)}
                            className="w-full p-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="wavelink-msg-bubble-ring shrink-0">
                                <Avatar
                                  uid={person.id}
                                  src={
                                    person.photoURL ||
                                    `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
                                  }
                                  alt={person.displayName}
                                  fallbackName={person.displayName}
                                  size={44}
                                  showStatus={true}
                                  targetProfile={person}
                                  imageClassName="border-2 border-[var(--bg-surface)]"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                                  {person.displayName}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] truncate">
                                  {person.username || '@waver'}
                                </p>
                              </div>
                            </div>
                            <span
                              className="px-3 py-1.5 rounded-xl text-white text-xs font-extrabold shrink-0"
                              style={{
                                background:
                                  'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                              }}
                            >
                              Message
                            </span>
                          </button>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] px-1">
                        My Contacts ({connectedMembers.length})
                      </p>
                      {connectedMembers.map((person) => {
                        const isInviteContact = (userProfile?.contactIds || []).includes(person.id);
                        return (
                          <button
                            key={`contact_${person.id}`}
                            type="button"
                            onClick={() => handleOpenMemberChat(person.id, true)}
                            className="w-full p-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-hairline)] flex items-center justify-between gap-3 transition text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="wavelink-msg-bubble-ring shrink-0">
                                <Avatar
                                  uid={person.id}
                                  src={
                                    person.photoURL ||
                                    `https://api.dicebear.com/7.x/shapes/svg?seed=${person.id}`
                                  }
                                  alt={person.displayName}
                                  fallbackName={person.displayName}
                                  size={44}
                                  showStatus={person.id !== SUPPORT_BOT_ID}
                                  targetProfile={person}
                                  imageClassName="border-2 border-[var(--bg-surface)]"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                                    {person.displayName}
                                  </p>
                                  {isInviteContact && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[9px] font-extrabold">
                                      Invite Contact
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] truncate">
                                  {person.id === SUPPORT_BOT_ID
                                    ? '24/7 WaveLink Assistant'
                                    : person.username || '@waver'}
                                </p>
                              </div>
                            </div>
                            <span className="px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-extrabold shrink-0">
                              Chat
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODAL B: LONG-PRESS / RIGHT-CLICK ROW QUICK ACTIONS SHEET
             ===================================================================== */}
          {actionMenuRowId && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
              onClick={() => setActionMenuRowId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl p-4 space-y-1.5"
              >
                <div className="pb-2 mb-1 border-b border-[var(--border-hairline)] flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    Conversation options
                  </span>
                  <button
                    type="button"
                    onClick={() => setActionMenuRowId(null)}
                    className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    togglePinChannel(actionMenuRowId);
                    setActionMenuRowId(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  <Pin size={16} className="text-[var(--accent-primary)]" />
                  <span>
                    {pinnedChannelIds.includes(actionMenuRowId) ? 'Unpin conversation' : 'Pin to top'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleMuteChannel(actionMenuRowId);
                    setActionMenuRowId(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  {mutedChannelIds.includes(actionMenuRowId) ? (
                    <Bell size={16} className="text-emerald-500" />
                  ) : (
                    <BellOff size={16} className="text-amber-500" />
                  )}
                  <span>
                    {mutedChannelIds.includes(actionMenuRowId)
                      ? 'Unmute notifications'
                      : 'Mute notifications'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleMarkChannelUnread(actionMenuRowId);
                    setActionMenuRowId(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  <MailOpen size={16} className="text-[var(--accent-secondary)]" />
                  <span>Mark as unread</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleArchiveChannel(actionMenuRowId);
                    setActionMenuRowId(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  <Archive size={16} className="text-amber-500" />
                  <span>
                    {archivedChannelIds.includes(actionMenuRowId)
                      ? 'Unarchive conversation'
                      : 'Archive conversation'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleClearConversationForMe(actionMenuRowId)}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  <RefreshCw size={16} className="text-[var(--text-secondary)]" />
                  <span>Clear chat history (for me)</span>
                </button>

                {actionMenuRowId.startsWith('dm_') &&
                  currentUser &&
                  getOtherDmParticipantId(actionMenuRowId, currentUser.uid) !== SUPPORT_BOT_ID && (
                    <button
                      type="button"
                      onClick={async () => {
                        const targetUid = getOtherDmParticipantId(actionMenuRowId, currentUser.uid);
                        setActionMenuRowId(null);
                        if (targetUid) {
                          await toggleBlockUser(targetUid);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-rose-500/10 flex items-center gap-3 text-sm font-bold text-rose-500 transition cursor-pointer"
                    >
                      <Ban size={16} />
                      <span>Block user</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    const targetId = actionMenuRowId;
                    setActionMenuRowId(null);
                    setConfirmDeleteChannelId(targetId);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-rose-500/10 flex items-center gap-3 text-sm font-extrabold text-rose-500 transition cursor-pointer"
                >
                  <Trash2 size={16} />
                  <span>Delete conversation</span>
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODAL C: DELETE CONVERSATION CONFIRMATION MODAL
             ===================================================================== */}
          {confirmDeleteChannelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                      Delete conversation?
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      This removes the conversation from your inbox only. The other person keeps their copy.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChannelId(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--bg-subtle)] text-xs font-extrabold text-[var(--text-primary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversationForMe(confirmDeleteChannelId)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-sm cursor-pointer"
                  >
                    Delete for me
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODAL D: 24-HOUR NOTE EDITOR MODAL (60-character speech bubble note)
             ===================================================================== */}
          {isNoteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                      Share a 24-hour note
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Visible above your avatar in the Message inbox for 24 hours.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNoteModalOpen(false)}
                    className="p-1.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    maxLength={60}
                    value={noteDraftText}
                    onChange={(e) => setNoteDraftText(e.target.value.slice(0, 60))}
                    placeholder="What's on your mind? (max 60 chars)"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-1">
                    <span>Expires automatically after 24h</span>
                    <span className="font-bold">{noteDraftText.length}/60</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {myActiveNoteText ? (
                    <button
                      type="button"
                      disabled={isSavingNote}
                      onClick={() => handleSaveMyChatNote(true)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-extrabold cursor-pointer"
                    >
                      Clear note
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsNoteModalOpen(false)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--bg-subtle)] text-xs font-extrabold text-[var(--text-primary)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingNote}
                      onClick={() => handleSaveMyChatNote(false)}
                      className="min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-extrabold shadow-sm cursor-pointer"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                    >
                      {isSavingNote ? 'Saving...' : 'Share note'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODAL E: CHAT SETTINGS SHEET ("Who can message me", "Unread first", "24h Notes")
             ===================================================================== */}
          {isChatSettingsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                      Chat settings
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Control who can message you and how your inbox is sorted
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChatSettingsModalOpen(false)}
                    className="p-1.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Who can message me */}
                <div className="space-y-2">
                  <label className="block text-xs font-extrabold text-[var(--text-primary)]">
                    Who can message me
                  </label>
                  <select
                    value={userProfile?.privacySettings?.allowDirectMessages || 'everyone'}
                    onChange={(e) => {
                      const val = e.target.value as 'everyone' | 'followers' | 'none';
                      updateUserProfile({
                        privacySettings: {
                          ...(userProfile?.privacySettings || {
                            profileVisibility: 'public',
                            showOnlineStatus: true,
                            showLastSeen: true,
                            allowCalls: 'everyone',
                            showReadReceipts: true,
                            allowTagging: true,
                            sparkVisibility: 'everyone',
                            allowSearchByEmail: true
                          }),
                          allowDirectMessages: val
                        }
                      }).catch(() => {});
                      showGlobalToast('Updated message privacy setting.');
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-bold text-[var(--text-primary)]"
                  >
                    <option value="everyone">Everyone (strangers go to Requests)</option>
                    <option value="followers">Only people I follow / friends</option>
                    <option value="none">No one (pause new chats)</option>
                  </select>
                </div>

                {/* Unread first toggle */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                  <div>
                    <p className="text-xs font-extrabold text-[var(--text-primary)]">
                      Unread chats first
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Keep unread conversations above read ones
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleUnreadFirstSort}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                      unreadFirstSort
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    {unreadFirstSort ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Online first toggle */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                  <div>
                    <p className="text-xs font-extrabold text-[var(--text-primary)]">
                      Online contacts first
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Prioritize online friends within the same group
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleOnlineFirstSort}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                      onlineFirstSort
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    {onlineFirstSort ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Show 24-hour notes toggle */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                  <div>
                    <p className="text-xs font-extrabold text-[var(--text-primary)]">
                      Show 24-hour Notes
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Display floating speech-bubble notes above avatars
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = userProfile?.showChatNotes === false;
                      updateUserProfile({ showChatNotes: next }).catch(() => {});
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                      showNotesInInbox
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                    }`}
                  >
                    {showNotesInInbox ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setIsChatSettingsModalOpen(false)}
                    className="min-h-[40px] px-5 py-2 rounded-xl text-white text-xs font-extrabold cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* =====================================================================
            SCREEN 2: CONVERSATION SCREEN (Mobile Full-Screen; Desktop Right Pane >= 1024px)
           ===================================================================== */}
        <div
          style={activeChannel ? computedChatTheme.styleVars : undefined}
          data-chat-themed={activeChannel && computedChatTheme.hasCustomTheme ? 'true' : undefined}
          data-chat-animated={activeChannel && computedChatTheme.isAnimatedPattern ? 'true' : undefined}
          data-chat-photo={activeChannel && computedChatTheme.hasCustomPhoto ? 'true' : undefined}
          className={`wavelink-mobile-conversation-screen wavelink-chat-center-col flex-1 flex-col min-w-0 h-full bg-[var(--bg-canvas)] ${
            isMobileListScreenVisible ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {!activeChannel ? (
            /* Right Pane Empty State when no chat is selected (Desktop >= 1024px) */
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-canvas)] select-none">
              <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--bg-surface)]/80 backdrop-blur-xl border border-[var(--border-hairline)] shadow-sm flex flex-col items-center gap-4">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center text-white shadow-md"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <MessageSquare size={38} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-extrabold text-xl text-[var(--text-primary)] tracking-tight">
                    Select a chat to start talking
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Choose a conversation or active friend on the left, or press{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-mono">
                      Ctrl+K
                    </kbd>{' '}
                    to start a new chat.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChatSheetOpen(true);
                      setTimeout(() => newChatInputRef.current?.focus(), 60);
                    }}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl text-white font-extrabold text-sm flex items-center gap-2 shadow-sm hover:opacity-95 active:scale-95 transition cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                  >
                    <Plus size={16} />
                    <span>New Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberIds([]);
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupLogo(PRESET_LOGOS[0].url);
                      setIsCreateGroupOpen(true);
                    }}
                    className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-extrabold text-sm flex items-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <Users size={16} className="text-[var(--accent-primary)]" />
                    <span>New Group</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
          {/* Dedicated fixed theme background layer on mobile (< 768px): sits behind everything (z-index: -1, pointer-events: none) */}
          <div className="wavelink-mobile-chat-theme-bg md:hidden" aria-hidden="true" />

          {/* Mobile (< 768px) Chat Header — always visible in flex column right below TopHeader */}
          <div className="flex md:hidden wavelink-mobile-convo-header items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  setShowMobileChannels(true);
                  setActiveChannel('');
                  setShowHeaderMenu(false);
                  setShowMobileAttachTray(false);
                  setIsMobileComposerOpen(false);
                }}
                className="wavelink-mobile-convo-header-btn bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] cursor-pointer"
                title="Back to Conversations"
                aria-label="Back to Conversations"
              >
                <ArrowLeft size={19} className="text-[var(--accent-primary)]" />
              </button>

              {activeGroup ? (
                <button
                  type="button"
                  onClick={() => setIsGroupInfoOpen(true)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div className="wavelink-mobile-convo-avatar-ring">
                    <img
                      src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                      alt={activeGroup.name}
                      className="w-9 h-9 rounded-full object-cover bg-[var(--bg-surface)] border border-[var(--bg-surface)]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="wavelink-convo-header-title font-extrabold text-sm text-[var(--text-primary)] truncate leading-tight">
                      {activeGroup.name}
                    </h2>
                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold truncate flex items-center gap-1 mt-0.5 leading-tight">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" />
                        </span>
                        <span>typing...</span>
                      </p>
                    ) : (
                      <p className="wavelink-convo-header-subtitle text-[11px] text-[var(--text-secondary)] font-semibold truncate flex items-center gap-1 mt-0.5 leading-tight">
                        <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />
                        <span className="truncate">
                          {(() => {
                            const onlineMembers = (activeGroup.memberIds || []).filter((id) =>
                              getCachedIsOnline(id)
                            ).length;
                            const totalMembers = activeGroup.memberIds?.length || 1;
                            return onlineMembers > 0
                              ? `${onlineMembers} online • ${totalMembers}`
                              : `${totalMembers} members`;
                          })()}
                        </span>
                      </p>
                    )}
                  </div>
                </button>
              ) : directRecipient ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="wavelink-mobile-convo-avatar-ring relative">
                    <Avatar
                      uid={directRecipient.id}
                      src={
                        directRecipient.photoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`
                      }
                      alt={directRecipient.displayName}
                      fallbackName={directRecipient.displayName}
                      size={36}
                      showStatus={false}
                      onlyWhenVisible={false}
                      targetProfile={directRecipient}
                      priority={true}
                      imageClassName="border border-[var(--bg-surface)]"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="wavelink-convo-header-title min-w-0 truncate">
                      <CrystalBadge
                        email={directRecipient.email}
                        name={directRecipient.displayName}
                        isPro={directRecipient.isPro}
                        hasBlueStar={directRecipient.hasBlueStar || directRecipient.isPro}
                        isSubAdmin={
                          directRecipient.isSubAdmin || directRecipient.role === 'sub_admin'
                        }
                        size="sm"
                      />
                    </div>
                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold truncate flex items-center gap-1 mt-0.5 leading-tight">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" />
                        </span>
                        <span>typing...</span>
                      </p>
                    ) : (
                      <p
                        className={`text-[11px] font-bold truncate flex items-center gap-1.5 mt-0.5 leading-tight ${
                          isChattingWithSupportBot || directRecipientPresence.status === 'online'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'wavelink-convo-header-subtitle text-[var(--text-secondary)]'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isChattingWithSupportBot || directRecipientPresence.status === 'online'
                              ? 'bg-[#22c55e]'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span className="truncate">
                          {isChattingWithSupportBot
                            ? 'Online'
                            : directRecipientStatusText || 'Offline'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 relative">
              {isDirectMessage && directRecipient && !isChattingWithSupportBot && (
                isBlockedFromAdminChat ? (
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="min-w-[44px] min-h-[44px] px-2.5 rounded-full bg-amber-500/15 border border-amber-400/50 text-amber-600 dark:text-amber-300 text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Try Pro to message or call Admin"
                  >
                    <Lock size={13} />
                    <span>Pro</span>
                  </button>
                ) : (
                  <div
                    className="wavelink-mobile-convo-call-group inline-flex items-center rounded-full p-0.5 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] shadow-2xs"
                    role="group"
                    aria-label="Call options"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (callPrivacyBlockReason) {
                          setChatMediaNotice(callPrivacyBlockReason);
                          return;
                        }
                        onOpenCall('voice', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        });
                      }}
                      className={`wavelink-mobile-convo-header-btn wavelink-mobile-convo-call-voice text-[var(--text-primary)] cursor-pointer ${
                        callPrivacyBlockReason ? 'opacity-45' : ''
                      }`}
                      title={callPrivacyBlockReason || 'Voice Call'}
                      aria-label="Voice Call"
                    >
                      <PhoneCall size={17} className="text-emerald-500" />
                    </button>

                    <span
                      className="w-[1px] h-5 bg-[var(--border-hairline)] shrink-0"
                      aria-hidden="true"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        if (callPrivacyBlockReason) {
                          setChatMediaNotice(callPrivacyBlockReason);
                          return;
                        }
                        onOpenCall('video', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        });
                      }}
                      className={`wavelink-mobile-convo-header-btn wavelink-mobile-convo-call-video text-white shadow-xs cursor-pointer ${
                        callPrivacyBlockReason ? 'opacity-45' : ''
                      }`}
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                      title={callPrivacyBlockReason || 'Video Call'}
                      aria-label="Video Call"
                    >
                      <Video size={17} />
                    </button>
                  </div>
                )
              )}

              <button
                type="button"
                onClick={() => setShowHeaderMenu((prev) => !prev)}
                className="wavelink-mobile-convo-header-btn bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] cursor-pointer"
                title="Conversation menu"
                aria-label="Conversation menu"
              >
                <MoreVertical size={18} />
              </button>

              {showHeaderMenu && (
                <div className="wavelink-mobile-convo-menu absolute right-0 top-13 w-60 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xl p-2 z-50 space-y-1.5">
                  {isDirectMessage && directRecipient && !isChattingWithSupportBot && !isBlockedFromAdminChat && (
                    <div className="grid grid-cols-2 gap-1.5 pb-1.5 border-b border-[var(--border-hairline)]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          if (callPrivacyBlockReason) {
                            setChatMediaNotice(callPrivacyBlockReason);
                            return;
                          }
                          onOpenCall('voice', {
                            id: directRecipient.id,
                            name: directRecipient.displayName,
                            photoURL: directRecipient.photoURL
                          });
                        }}
                        className="min-h-[44px] px-2.5 py-2 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <PhoneCall size={15} className="text-emerald-500 shrink-0" />
                        <span>Voice Call</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          if (callPrivacyBlockReason) {
                            setChatMediaNotice(callPrivacyBlockReason);
                            return;
                          }
                          onOpenCall('video', {
                            id: directRecipient.id,
                            name: directRecipient.displayName,
                            photoURL: directRecipient.photoURL
                          });
                        }}
                        className="min-h-[44px] px-2.5 py-2 rounded-xl text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                        }}
                      >
                        <Video size={15} className="shrink-0" />
                        <span>Video Call</span>
                      </button>
                    </div>
                  )}
                  {activeChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setPreviewChatTheme(savedActiveChatTheme);
                        setIsThemePickerOpen(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <Palette size={15} className="text-[var(--accent-primary)]" />
                      <span>Chat theme</span>
                    </button>
                  )}

                  {activeChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        toggleMuteChannel(activeChannel);
                        setShowHeaderMenu(false);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                    >
                      {isActiveChannelMuted ? (
                        <Bell size={15} className="text-[var(--accent-primary)]" />
                      ) : (
                        <BellOff size={15} className="text-[var(--accent-primary)]" />
                      )}
                      <span>
                        {isActiveChannelMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                      </span>
                    </button>
                  )}

                  {activeChannel &&
                    !isChattingWithSupportBot &&
                    (isDirectMessage || isCurrentUserGroupAdmin) && (
                      <button
                        type="button"
                        onClick={() => {
                          const cycle = [0, 24, 168, 720];
                          const idx = cycle.indexOf(activeDisappearingHours);
                          const next = cycle[(idx + 1) % cycle.length];
                          handleUpdateDisappearingTimer(next);
                          setShowHeaderMenu(false);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Clock size={15} className="text-[var(--accent-primary)]" />
                          <span>Disappearing msgs</span>
                        </span>
                        <span className="text-[11px] font-extrabold text-[var(--accent-primary)]">
                          {activeDisappearingHours === 0
                            ? 'Off'
                            : activeDisappearingHours === 24
                            ? '24h'
                            : activeDisappearingHours === 168
                            ? '7d'
                            : '30d'}
                        </span>
                      </button>
                    )}

                  {activeGroup && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsGroupInfoOpen(true);
                          setShowHeaderMenu(false);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                      >
                        <Info size={15} className="text-[var(--accent-primary)]" />
                        <span>Group Info &amp; Members</span>
                      </button>
                      {isCurrentUserMember && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            handleExitGroup(activeGroup);
                          }}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-500/10 flex items-center gap-2.5 cursor-pointer"
                        >
                          <LogOut size={15} />
                          <span>Exit Group</span>
                        </button>
                      )}
                    </>
                  )}

                  {isDirectMessage &&
                    directRecipient &&
                    !isChattingWithSupportBot &&
                    !isSuperAdminEmail(directRecipient.email, directRecipient.role) && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            toggleBlockUser(directRecipient.id);
                            setShowHeaderMenu(false);
                          }}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-rose-500/10 hover:text-rose-600 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Ban size={15} className="text-rose-500" />
                          <span>{isRecipientBlocked ? 'Unblock User' : 'Block User'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            setChatReportTarget({
                              targetType: 'user',
                              targetId: directRecipient.id,
                              targetAuthorId: directRecipient.id,
                              targetAuthorName: directRecipient.displayName,
                              channelId: activeChannel,
                              targetSummary: `${directRecipient.displayName} (${directRecipient.username || directRecipient.email})`
                            });
                          }}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-amber-600 hover:bg-amber-500/10 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Flag size={15} />
                          <span>Report User</span>
                        </button>
                      </>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Conversation Header (>= 768px Tablet & Desktop) */}
          <div className="hidden md:flex wavelink-desktop-convo-header min-h-[60px] px-2.5 py-2 sm:px-4 sm:py-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] items-center justify-between gap-1.5 sm:gap-2 shrink-0 relative z-20">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  setShowMobileChannels(true);
                  setActiveChannel('');
                }}
                className="lg:hidden min-w-[44px] min-h-[44px] px-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] flex items-center justify-center shrink-0 cursor-pointer"
                title="Back to Conversations"
                aria-label="Back to Conversations"
              >
                <ArrowLeft size={18} className="text-[var(--accent-primary)]" />
              </button>

              {activeGroup ? (
                <div
                  onClick={() => setIsGroupInfoOpen(true)}
                  className="flex items-center gap-2 sm:gap-3 cursor-pointer group/title min-w-0 flex-1"
                >
                  <div
                    className="relative p-[2px] rounded-2xl shrink-0"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                  >
                    <img
                      src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                      alt={activeGroup.name}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-[14px] object-cover bg-[var(--bg-surface)]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
                      <h2 className="font-extrabold text-sm sm:text-base text-[var(--text-primary)] truncate">
                        {activeGroup.name}
                      </h2>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-secondary)] shrink-0">
                        <Users size={11} className="text-[var(--accent-primary)]" />
                        <span>
                          {(() => {
                            const onlineMembers = (activeGroup.memberIds || []).filter((id) =>
                              getCachedIsOnline(id)
                            ).length;
                            const totalMembers = activeGroup.memberIds?.length || 1;
                            return onlineMembers > 0
                              ? `${onlineMembers} online • ${totalMembers} members`
                              : `${totalMembers} members`;
                          })()}
                        </span>
                      </span>
                    </div>
                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1.5 font-extrabold">
                        <span>
                          {activeChannelTypingUsers.length === 1
                            ? `${activeChannelTypingUsers[0].name} is typing...`
                            : `${activeChannelTypingUsers.map((u) => u.name.split(' ')[0]).join(', ')} are typing...`}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] truncate">
                        {activeGroup.description || `${activeGroup.memberIds?.length || 1} members`}
                      </p>
                    )}
                  </div>
                </div>
              ) : directRecipient ? (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <div
                      className="p-[2px] rounded-full"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                    >
                      <Avatar
                        uid={directRecipient.id}
                        src={
                          directRecipient.photoURL ||
                          `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`
                        }
                        alt={directRecipient.displayName}
                        fallbackName={directRecipient.displayName}
                        size={38}
                        showStatus={!isChattingWithSupportBot}
                        onlyWhenVisible={false}
                        targetProfile={directRecipient}
                        priority={true}
                        imageClassName="border-2 border-[var(--bg-surface)]"
                      />
                    </div>
                    {isChattingWithSupportBot && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                        title="24/7 Assistant"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
                      <div className="wavelink-convo-header-title min-w-0 truncate">
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
                      {directRecipientStatusText && (
                        <span
                          className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-extrabold shrink-0 ${
                            isChattingWithSupportBot || directRecipientPresence.status === 'online'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isChattingWithSupportBot || directRecipientPresence.status === 'online'
                                ? 'bg-[#22c55e] animate-pulse'
                                : 'bg-[#ef4444]'
                            }`}
                          />
                          <span>{directRecipientStatusText}</span>
                        </span>
                      )}
                    </div>

                    {activeChannelTypingUsers.length > 0 ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate mt-0.5 flex items-center gap-1.5 font-extrabold">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                        </span>
                        <span>{directRecipient.displayName.split(' ')[0]} is typing...</span>
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5 font-medium">
                        {directRecipient.interests && directRecipient.interests.length > 0
                          ? directRecipient.interests.slice(0, 3).join(' • ')
                          : directRecipient.bio
                          ? directRecipient.bio
                          : directRecipient.username || 'WaveLink Member'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MessageSquare size={20} className="text-[var(--accent-primary)]" />
                  <span className="font-bold text-sm text-[var(--text-primary)]">
                    Select a conversation to start chatting
                  </span>
                </div>
              )}
            </div>

            {/* Header Action Buttons: Voice Call, Video Call, and Menu (all >= 44px tap targets) */}
            <div className="flex items-center gap-1.5 shrink-0 relative">
              {isDirectMessage && directRecipient && !isChattingWithSupportBot && (
                isBlockedFromAdminChat ? (
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-600 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
                    title="Try Pro to message or call Admin directly"
                  >
                    <Lock size={14} />
                    <span>Try Pro</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (callPrivacyBlockReason) {
                          setChatMediaNotice(callPrivacyBlockReason);
                          return;
                        }
                        onOpenCall('voice', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        });
                      }}
                      className={`min-w-[44px] min-h-[44px] px-2.5 sm:px-3 py-2 rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer ${
                        callPrivacyBlockReason ? 'opacity-45' : ''
                      }`}
                      title={callPrivacyBlockReason || 'Start Voice Call'}
                      aria-label="Start Voice Call"
                    >
                      <PhoneCall size={17} className="text-emerald-500" />
                      <span className="hidden sm:inline">Voice</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (callPrivacyBlockReason) {
                          setChatMediaNotice(callPrivacyBlockReason);
                          return;
                        }
                        onOpenCall('video', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        });
                      }}
                      className={`min-w-[44px] min-h-[44px] px-2.5 sm:px-3 py-2 rounded-2xl text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition shrink-0 cursor-pointer ${
                        callPrivacyBlockReason ? 'opacity-45' : ''
                      }`}
                      style={{
                        background:
                          'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      }}
                      title={callPrivacyBlockReason || 'Start Video Call'}
                      aria-label="Start Video Call"
                    >
                      <Video size={17} />
                      <span className="hidden sm:inline">Video</span>
                    </button>
                  </>
                )
              )}

              {/* Header Menu Button (MoreVertical) */}
              <button
                type="button"
                onClick={() => setShowHeaderMenu((prev) => !prev)}
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] flex items-center justify-center transition shrink-0 cursor-pointer"
                title="Conversation menu"
                aria-label="Conversation menu"
              >
                <MoreVertical size={18} />
              </button>

              {showHeaderMenu && (
                <div className="absolute right-0 top-13 w-56 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xl p-1.5 z-40 space-y-1">
                  {activeChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setPreviewChatTheme(savedActiveChatTheme);
                        setIsThemePickerOpen(true);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <Palette size={15} className="text-[var(--accent-primary)]" />
                      <span>Chat theme</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowDesktopRightPanel((prev) => !prev);
                      setShowHeaderMenu(false);
                    }}
                    className="hidden xl:flex w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] items-center gap-2.5 cursor-pointer"
                  >
                    <PanelRight size={15} className="text-[var(--accent-primary)]" />
                    <span>{showDesktopRightPanel ? 'Hide Details Panel' : 'Show Details Panel'}</span>
                  </button>

                  {activeChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        toggleMuteChannel(activeChannel);
                        setShowHeaderMenu(false);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                    >
                      {isActiveChannelMuted ? (
                        <Bell size={15} className="text-[var(--accent-primary)]" />
                      ) : (
                        <BellOff size={15} className="text-[var(--accent-primary)]" />
                      )}
                      <span>
                        {isActiveChannelMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                      </span>
                    </button>
                  )}

                  {activeChannel &&
                    !isChattingWithSupportBot &&
                    (isDirectMessage || isCurrentUserGroupAdmin) && (
                      <button
                        type="button"
                        onClick={() => {
                          const cycle = [0, 24, 168, 720];
                          const idx = cycle.indexOf(activeDisappearingHours);
                          const next = cycle[(idx + 1) % cycle.length];
                          handleUpdateDisappearingTimer(next);
                          setShowHeaderMenu(false);
                        }}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Clock size={15} className="text-[var(--accent-primary)]" />
                          <span>Disappearing msgs</span>
                        </span>
                        <span className="text-[11px] font-extrabold text-[var(--accent-primary)]">
                          {activeDisappearingHours === 0
                            ? 'Off'
                            : activeDisappearingHours === 24
                            ? '24h'
                            : activeDisappearingHours === 168
                            ? '7d'
                            : '30d'}
                        </span>
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel('');
                      setShowMobileChannels(true);
                      setShowHeaderMenu(false);
                    }}
                    className="hidden lg:flex w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] items-center gap-2.5 cursor-pointer"
                  >
                    <X size={15} />
                    <span>Close Conversation</span>
                  </button>

                  {activeGroup && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsGroupInfoOpen(true);
                          setShowHeaderMenu(false);
                        }}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                      >
                        <Info size={15} className="text-[var(--accent-primary)]" />
                        <span>Group Info &amp; Members</span>
                      </button>
                      {isCurrentUserMember && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            handleExitGroup(activeGroup);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-500/10 flex items-center gap-2.5 cursor-pointer"
                        >
                          <LogOut size={15} />
                          <span>Exit Group</span>
                        </button>
                      )}
                    </>
                  )}

                  {isDirectMessage &&
                    directRecipient &&
                    !isChattingWithSupportBot &&
                    !isSuperAdminEmail(directRecipient.email, directRecipient.role) && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            toggleBlockUser(directRecipient.id);
                            setShowHeaderMenu(false);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-rose-500/10 hover:text-rose-600 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Ban size={15} className="text-rose-500" />
                          <span>{isRecipientBlocked ? 'Unblock User' : 'Block User'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            setChatReportTarget({
                              targetType: 'user',
                              targetId: directRecipient.id,
                              targetAuthorId: directRecipient.id,
                              targetAuthorName: directRecipient.displayName,
                              channelId: activeChannel,
                              targetSummary: `${directRecipient.displayName} (${directRecipient.username || directRecipient.email})`
                            });
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold text-amber-600 hover:bg-amber-500/10 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Flag size={15} />
                          <span>Report User</span>
                        </button>
                      </>
                    )}
                </div>
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
                    Connection Notice
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

          {/* Subtle Shared/Suggested Theme Prompt Banner */}
          {showSuggestedThemeBanner && activeSuggestedTheme && (
            <div className="mx-3 mt-2 px-3.5 py-2.5 rounded-2xl bg-[var(--bg-surface)]/95 border border-[var(--border-hairline)] shadow-sm flex flex-wrap items-center justify-between gap-2 shrink-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ChatThemeBadgeIcon themeId={activeSuggestedTheme.themeId} size={15} className="shrink-0" />
                <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {activeSuggestedTheme.suggestedByName.split(' ')[0]} suggested the{' '}
                  <strong className="text-[var(--accent-primary)]">
                    {getChatThemeDisplayName(activeSuggestedTheme.themeId)}
                  </strong>{' '}
                  theme for this chat. Use it?
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDeclineSuggestedTheme}
                  className="min-h-[36px] px-3 py-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  No thanks
                </button>
                <button
                  type="button"
                  onClick={handleAcceptSuggestedTheme}
                  className="min-h-[36px] px-3.5 py-1 rounded-xl text-white text-[11px] font-extrabold shadow-2xs cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          )}

          {/* Messages Stream — Theme-aware spacious canvas */}
          <div
            ref={messagesListRef}
            onScroll={handleMessagesScroll}
            onClick={() => {
              if (reactionMenuMsgId) setReactionMenuMsgId(null);
              if (showHeaderMenu) setShowHeaderMenu(false);
              if (showMobileAttachTray) setShowMobileAttachTray(false);
              if (
                isMobileComposerOpen &&
                !inputText.trim() &&
                !chatMediaUrl &&
                !showEmojiPicker &&
                !showGifPicker
              ) {
                setIsMobileComposerOpen(false);
              }
            }}
            className="wavelink-chat-messages-list wavelink-mobile-convo-messages flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-[var(--bg-canvas)]"
          >
            <QuotaExceededBanner compact={true} className="mb-2" />

            {messages.length >= messageLimit && (
              <div className="w-full flex justify-center py-1">
                <button
                  type="button"
                  onClick={() => {
                    isLoadingOlderRef.current = true;
                    prevScrollHeightRef.current = messagesListRef.current?.scrollHeight || 0;
                    setMessageLimit((prev) => prev + 30);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold transition active:scale-95 shadow-2xs cursor-pointer"
                >
                  <History size={14} className="text-[var(--accent-primary)]" />
                  <span>Load older messages (30 more)</span>
                </button>
              </div>
            )}

            {isLoadingMessages && messages.length === 0 ? (
              <div className="space-y-4 py-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex items-end gap-2.5 animate-pulse ${
                      i % 2 === 0 ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {i % 2 !== 0 && (
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-subtle)] shrink-0" />
                    )}
                    <div className="w-56 h-16 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)]" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
                <div
                  className="w-16 h-16 rounded-3xl flex items-center justify-center text-white mb-3 shadow-md"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <MessageSquare size={30} />
                </div>
                <h4 className="font-extrabold text-[var(--text-primary)] text-base">
                  Say hello! 👋
                </h4>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-xs mt-1 leading-relaxed">
                  {activeGroup
                    ? `Be the first to start the conversation in ${activeGroup.name}!`
                    : `Send a message, voice note or photo to start chatting with ${
                        directRecipient?.displayName || 'your friend'
                      }.`}
                </p>
              </div>
            ) : (
              (() => {
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

                return messages.map((msg, idx) => {
                  const visibleToUid = (msg as any).visibleTo as string | undefined;
                  if (visibleToUid && visibleToUid !== currentUser?.uid) {
                    return null;
                  }
                  const deletedForArr = (msg as any).deletedFor as string[] | undefined;
                  if (
                    deletedForMeIds.includes(msg.id) ||
                    (Array.isArray(deletedForArr) && currentUser?.uid && deletedForArr.includes(currentUser.uid))
                  ) {
                    return null;
                  }
                  if (msg.expiresAt) {
                    const expMs = Date.parse(msg.expiresAt);
                    if (Number.isFinite(expMs) && expMs <= Date.now()) {
                      return null;
                    }
                  }

                  const isOwn = msg.senderId === currentUser?.uid;
                  const msgMs = getMessageTimestampMs(msg) || Date.parse(msg.createdAt || '') || 0;
                  const dayKey = getCalendarDayKey(msgMs);
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const prevMs = prevMsg
                    ? getMessageTimestampMs(prevMsg) || Date.parse(prevMsg.createdAt || '') || 0
                    : 0;
                  const prevDayKey = prevMsg ? getCalendarDayKey(prevMs) : '';
                  const showDateSeparator = Boolean(dayKey && (idx === 0 || dayKey !== prevDayKey));

                  if (msg.isSystem) {
                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex md:hidden justify-center py-1">
                            <span className="wavelink-mobile-convo-date-pill">
                              {formatChatDateLabel(msgMs)}
                            </span>
                          </div>
                        )}
                        <div className="w-full flex justify-center py-0.5 px-2">
                          <span className="wavelink-convo-system-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--bg-surface)]/85 border border-[var(--border-hairline)] text-[var(--text-secondary)] shadow-2xs text-center">
                            <Palette size={11} className="shrink-0 opacity-80" />
                            <span>{msg.text}</span>
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  }

                  const isEditing = editingMessageId === msg.id;
                  const receipt = isOwn && !msg.isDeleted ? getReadReceiptInfo(msg) : null;
                  const isLatestSeenOwn = isOwn && msg.id === latestSeenOwnMessageId;
                  const timeString = (msgMs ? new Date(msgMs) : new Date(msg.createdAt)).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const photoList =
                    msg.mediaUrls && msg.mediaUrls.length > 0
                      ? msg.mediaUrls
                      : msg.mediaUrl &&
                        msg.mediaType !== 'audio' &&
                        msg.mediaType !== 'video' &&
                        msg.mediaType !== 'file'
                      ? [msg.mediaUrl]
                      : [];
                  const reactionEntries = (
                    Object.entries(msg.reactions || {}) as [string, string[]][]
                  ).filter(([, uids]) => Array.isArray(uids) && uids.length > 0);

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex md:hidden justify-center py-1">
                          <span className="wavelink-mobile-convo-date-pill">
                            {formatChatDateLabel(msgMs)}
                          </span>
                        </div>
                      )}
                      <div
                        onTouchStart={(e) => {
                        const touch = e.touches[0];
                        if (!touch) return;
                        swipeTouchStartRef.current = {
                          x: touch.clientX,
                          y: touch.clientY,
                          msgId: msg.id
                        };
                        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = setTimeout(() => {
                          setReactionMenuMsgId(msg.id);
                        }, 430);
                      }}
                      onTouchMove={(e) => {
                        const touch = e.touches[0];
                        const start = swipeTouchStartRef.current;
                        if (!touch || !start || start.msgId !== msg.id) return;
                        const dx = touch.clientX - start.x;
                        const dy = Math.abs(touch.clientY - start.y);
                        if (Math.abs(dx) > 12 || dy > 12) {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                        }
                        if (dx > 52 && dy < 30 && !msg.isDeleted) {
                          swipeTouchStartRef.current = null;
                          setReplyingTo(msg);
                        }
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                        swipeTouchStartRef.current = null;
                      }}
                      className={`w-full flex items-end gap-2.5 group/msg relative ${
                        isOwn ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
                      }`}
                    >
                      {/* Small Avatar beside received messages */}
                      {!isOwn && (
                        <Avatar
                          uid={msg.senderId}
                          src={
                            msg.senderPhotoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.senderId}`
                          }
                          alt={msg.senderName}
                          fallbackName={msg.senderName}
                          size={32}
                          showStatus={!isSupportBotUser(msg.senderId)}
                          className="ring-2 ring-[var(--accent-primary)]/30 rounded-full mb-5"
                        />
                      )}

                      {/* Message Bubble Wrapper (Max 78% width on phones; Max 60% width on desktop via CSS) */}
                      <div
                        className={`wavelink-chat-bubble-wrap min-w-0 flex flex-col relative ${
                          isOwn ? 'items-end self-end' : 'items-start self-start'
                        }`}
                      >
                        {/* Sender Name on group or received messages (hidden in mobile DM via .wavelink-mobile-convo-dm-sender) */}
                        {(!isOwn || !isDirectMessage) && (
                          <div
                            className={`flex items-center gap-1.5 mb-1 px-1 ${
                              isOwn ? 'justify-end' : 'justify-start'
                            } ${isDirectMessage && !isOwn ? 'wavelink-mobile-convo-dm-sender' : ''}`}
                          >
                            <CrystalBadge
                              email={msg.senderEmail}
                              name={msg.senderName}
                              size="sm"
                            />
                          </div>
                        )}

                        {/* Long-press / Tap Emoji Reaction Bar */}
                        {reactionMenuMsgId === msg.id && !msg.isDeleted && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute -top-12 z-30 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xl animate-in fade-in zoom-in-95 duration-150 ${
                              isOwn ? 'right-0' : 'left-0'
                            }`}
                          >
                            {QUICK_REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleToggleMessageReaction(msg, emoji)}
                                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-base transition hover:scale-125 active:scale-95 cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reply Reference Banner */}
                        {msg.replyToText && (
                          <div
                            className={`text-xs p-2.5 rounded-2xl border-l-4 mb-1.5 w-full bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--accent-primary)]`}
                          >
                            <span className="font-extrabold block text-[11px] text-[var(--accent-primary)]">
                              Replying to {msg.replyToSenderName || 'message'}
                            </span>
                            <span className="truncate block text-[var(--text-secondary)]">
                              {msg.replyToText}
                            </span>
                          </div>
                        )}

                        {/* Message Bubble Card: Bold Accent Gradient for Sent, Soft Theme Card for Received */}
                        <div
                          onDoubleClick={() => {
                            if (!msg.isDeleted) handleToggleMessageReaction(msg, '❤️');
                          }}
                          style={
                            !msg.isDeleted && isOwn
                              ? {
                                  background:
                                    'var(--chat-sent-bg, linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)))',
                                  color: 'var(--chat-sent-text, #FFFFFF)'
                                }
                              : undefined
                          }
                          className={`w-full max-w-full rounded-3xl px-4 py-3 text-base sm:text-[15px] leading-relaxed relative break-words [overflow-wrap:break-word] transition ${
                            msg.isDeleted
                              ? 'italic bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)]'
                              : isOwn
                              ? 'wavelink-convo-bubble--sent text-white rounded-br-md shadow-sm'
                              : 'wavelink-convo-bubble--received bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border-hairline)] shadow-xs'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-2 w-full min-w-[180px] max-w-full">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full p-2 rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] text-base sm:text-sm border border-[var(--border-hairline)] focus:outline-none"
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
                              {/* Voice Note Attachment with Play Button, Animated Waveform & Duration */}
                              {(msg.mediaType === 'audio' || msg.audioUrl) &&
                                !msg.isDeleted &&
                                (msg.audioUrl || msg.mediaUrl) && (
                                  <div className="mb-2">
                                    <VoiceNoteBubblePlayer
                                      src={(msg.audioUrl || msg.mediaUrl)!}
                                      duration={msg.audioDuration}
                                      isOwn={isOwn}
                                    />
                                  </div>
                                )}

                              {/* Video Attachment */}
                              {msg.mediaType === 'video' && msg.mediaUrl && !msg.isDeleted && (
                                <div className="wavelink-convo-media mb-2 rounded-2xl overflow-hidden w-full max-w-sm">
                                  <video
                                    src={msg.mediaUrl}
                                    controls
                                    className="max-h-64 w-full object-cover rounded-2xl"
                                  />
                                </div>
                              )}

                              {/* File / Document Attachment */}
                              {msg.mediaType === 'file' && msg.mediaUrl && !msg.isDeleted && (
                                <a
                                  href={msg.mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`wavelink-convo-file-card mb-2 flex items-center gap-2.5 p-2.5 rounded-2xl border transition ${
                                    isOwn
                                      ? 'bg-black/15 border-white/25 text-white hover:bg-black/25'
                                      : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
                                  }`}
                                >
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                      isOwn
                                        ? 'bg-white/20 text-white'
                                        : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                                    }`}
                                  >
                                    <FileText size={18} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-extrabold truncate">
                                      {msg.fileName || 'Attachment'}
                                    </p>
                                    {msg.fileSize ? (
                                      <p className="text-[10px] opacity-75">
                                        {formatVideoFileSize(msg.fileSize)} • Tap to open
                                      </p>
                                    ) : (
                                      <p className="text-[10px] opacity-75">Tap to open</p>
                                    )}
                                  </div>
                                </a>
                              )}

                              {/* Shared Photos: Stacked / Grid Group inside the Bubble */}
                              {photoList.length > 0 && !msg.isDeleted && (
                                <div
                                  className={`wavelink-convo-media mb-2 overflow-hidden rounded-2xl ${
                                    photoList.length === 1
                                      ? 'w-full max-w-xs'
                                      : 'grid grid-cols-2 gap-1.5 w-full max-w-xs'
                                  }`}
                                >
                                  {photoList.map((url, idx) => (
                                    <button
                                      key={`${msg.id}_img_${idx}`}
                                      type="button"
                                      onClick={() => setLightboxPhotoUrl(url)}
                                      className={`relative overflow-hidden rounded-xl group/photo block w-full cursor-pointer ${
                                        photoList.length === 3 && idx === 0 ? 'col-span-2' : ''
                                      }`}
                                    >
                                      <img
                                        src={url}
                                        alt={`Shared photo ${idx + 1}`}
                                        loading="lazy"
                                        className={`${
                                          photoList.length === 1 ? 'max-h-64' : 'h-32'
                                        } w-full object-cover rounded-xl group-hover/photo:scale-105 transition-transform duration-200`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* GIF Attachment */}
                              {msg.gifUrl && !msg.isDeleted && (
                                <div className="wavelink-convo-media mb-2 rounded-2xl overflow-hidden max-w-xs">
                                  <img
                                    src={msg.gifUrl}
                                    alt="GIF reaction"
                                    loading="lazy"
                                    className="w-full rounded-2xl object-cover"
                                  />
                                </div>
                              )}

                              {/* Message Text */}
                              {msg.text && (
                                <p
                                  className={`wavelink-convo-bubble-text whitespace-pre-wrap break-words ${
                                    msg.isDeleted
                                      ? 'text-[var(--text-secondary)]'
                                      : isOwn
                                      ? 'text-[color:var(--chat-sent-text,#FFFFFF)]'
                                      : 'text-[color:var(--chat-received-text,var(--text-primary))]'
                                  }`}
                                >
                                  {msg.text}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Emoji Reactions Pill Row */}
                        {reactionEntries.length > 0 && !msg.isDeleted && (
                          <div
                            className={`flex items-center flex-wrap gap-1 -mt-2 z-10 px-2 ${
                              isOwn ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {reactionEntries.map(([emoji, uids]) => {
                              const mine = currentUser?.uid ? uids.includes(currentUser.uid) : false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleToggleMessageReaction(msg, emoji)}
                                  className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border shadow-2xs transition cursor-pointer ${
                                    mine
                                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                                      : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline)]'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px]">{uids.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Time & Double-Tick Read Status Under Each Bubble + Quick Actions */}
                        <div
                          className={`wavelink-convo-msg-meta mt-1 flex items-center gap-2 px-1 text-[11px] text-[var(--text-secondary)] select-none ${
                            isOwn ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {msg.isEdited && !msg.isDeleted && (
                            <span className="italic">(edited)</span>
                          )}
                          <span className="font-mono tabular-nums font-semibold">
                            {timeString}
                          </span>

                          {isOwn && !msg.isDeleted && (
                            <span
                              className="inline-flex items-center gap-0.5 font-bold"
                              title={receipt?.isSeen ? 'Read' : 'Sent'}
                            >
                              {receipt?.isSeen ? (
                                <CheckCheck
                                  size={14}
                                  className="text-[var(--accent-primary)] stroke-[2.5] shrink-0"
                                />
                              ) : (
                                <Check
                                  size={13}
                                  className="text-[var(--text-secondary)] stroke-[2.25] shrink-0"
                                />
                              )}
                            </span>
                          )}

                          {/* Quick Reaction, Reply, Edit & Unsend controls */}
                          {!msg.isDeleted && (
                            <div className="inline-flex items-center gap-1 opacity-85 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReactionMenuMsgId((prev) =>
                                    prev === msg.id ? null : msg.id
                                  );
                                }}
                                className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)] cursor-pointer"
                                title="React"
                              >
                                <Smile size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplyingTo(msg)}
                                className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)] cursor-pointer"
                                title="Reply"
                              >
                                <Reply size={13} />
                              </button>
                              {!isOwn && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChatReportTarget({
                                      targetType: 'message',
                                      targetId: msg.id,
                                      targetAuthorId: msg.senderId,
                                      targetAuthorName: msg.senderName,
                                      channelId: activeGroup ? undefined : activeChannel,
                                      groupId: activeGroup ? activeGroup.id : undefined,
                                      targetSummary: sanitizeUserText(msg.text || '[Attachment]', 160)
                                    })
                                  }
                                  className="p-1 rounded-lg hover:bg-amber-500/15 hover:text-amber-500 cursor-pointer"
                                  title="Report message"
                                >
                                  <Flag size={12} />
                                </button>
                              )}
                              {/* Delete for me (available on any message) */}
                              <button
                                type="button"
                                onClick={() => handleDeleteMessageForMe(msg.id)}
                                className="px-1.5 py-0.5 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                                title="Delete for me"
                              >
                                <Trash2 size={11} />
                                <span>For me</span>
                              </button>
                              {isOwn && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMessageId(msg.id);
                                      setEditText(msg.text);
                                    }}
                                    className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)] cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="px-1.5 py-0.5 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                                    title="Delete for everyone"
                                  >
                                    <Trash2 size={11} />
                                    <span>Everyone</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Seen by indicator under latest seen own message */}
                        {isLatestSeenOwn && receipt?.isSeen && !msg.isDeleted && (
                          <div className="mt-0.5 flex items-center justify-end gap-1.5 px-1 text-[10px] text-[var(--accent-primary)] font-bold select-none">
                            <span>
                              {isDirectMessage
                                ? 'Seen'
                                : receipt.seenByUsers.length === 1
                                ? `Seen by ${receipt.seenByUsers[0].name.split(' ')[0]}`
                                : `Seen by ${receipt.seenCount} members`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                  );
                });
              })()
            )}

            {/* Support Bot Live Thinking / Replying Indicator */}
            {isBotReplying && isChattingWithSupportBot && activeChannel === supportBotChannelId && (
              <div className="flex items-end gap-2.5 animate-in fade-in duration-150 pt-1">
                <Avatar
                  uid={SUPPORT_BOT_ID}
                  src={SUPPORT_BOT_AVATAR}
                  alt={SUPPORT_BOT_NAME}
                  fallbackName={SUPPORT_BOT_NAME}
                  size={28}
                  showStatus={false}
                  className="ring-2 ring-[var(--accent-primary)]/40 rounded-full"
                />
                <div className="px-4 py-2.5 rounded-3xl rounded-bl-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[var(--accent-primary)]">
                    WaveLink Assistant is typing...
                  </span>
                  <span className="inline-flex items-center gap-1 pt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" />
                  </span>
                </div>
              </div>
            )}

            {/* Real-Time "Name is typing..." Bubble in the Chat Stream */}
            {activeChannelTypingUsers.length > 0 && (
              <div className="flex items-end gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 pt-1">
                <div className="flex -space-x-2 shrink-0">
                  {activeChannelTypingUsers.slice(0, 3).map((typer) => (
                    <Avatar
                      key={typer.userId}
                      uid={typer.userId}
                      src={
                        typer.photoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${typer.userId}`
                      }
                      alt={typer.name}
                      fallbackName={typer.name}
                      size={28}
                      showStatus={false}
                      className="ring-2 ring-[var(--bg-surface)] rounded-full shadow-2xs"
                    />
                  ))}
                </div>
                <div className="px-4 py-2.5 rounded-3xl rounded-bl-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {activeChannelTypingUsers.length === 1
                      ? `${activeChannelTypingUsers[0].name} is typing...`
                      : `${activeChannelTypingUsers.map((u) => u.name.split(' ')[0]).join(', ')} are typing...`}
                  </span>
                  <span className="inline-flex items-center gap-1 pt-0.5" aria-label="Typing">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-2" />
          </div>

          {/* Replying Banner */}
          {replyingTo && (
            <div className="px-4 py-2 bg-[var(--bg-subtle)] border-t border-[var(--border-hairline)] flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2 truncate">
                <Reply size={14} className="text-[var(--accent-primary)] shrink-0" />
                <span className="text-[var(--text-primary)] font-bold truncate">
                  Replying to {replyingTo.senderName}: &quot;{replyingTo.text || 'Media'}&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Media Upload Progress / Notice */}
          {chatMediaNotice && (
            <div className="px-4 py-2 bg-amber-500/15 border-t border-amber-400/40 space-y-1.5 text-xs text-[var(--text-primary)] font-bold shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words">{chatMediaNotice}</span>
                <button
                  type="button"
                  onClick={() => {
                    setChatMediaNotice(null);
                    setChatUploadProgress(null);
                  }}
                  className="p-1 shrink-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              {chatUploadProgress !== null && (
                <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-200"
                    style={{ width: `${Math.max(5, chatUploadProgress)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Selected Photo Grid / Video / File / Voice Note Preview Bar */}
          {chatMediaUrl && (
            <div className="p-3 bg-[var(--bg-subtle)] border-t border-[var(--border-hairline)] flex items-center justify-between gap-3 shrink-0">
              {chatMediaType === 'audio' ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <VoiceNoteBubblePlayer
                    src={chatMediaUrl}
                    duration={voiceNoteDuration}
                    isOwn={false}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  {chatMediaType === 'file' ? (
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                      <FileText size={20} />
                    </div>
                  ) : chatMediaType === 'video' ? (
                    <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white shrink-0">
                      <Film size={20} />
                    </div>
                  ) : (
                    <div className="flex items-center -space-x-2 shrink-0">
                      {(chatMediaUrls.length > 0 ? chatMediaUrls : [chatMediaUrl]).map((u, i) => (
                        <img
                          key={i}
                          src={u}
                          alt="Preview"
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-[var(--bg-surface)] shadow-xs"
                        />
                      ))}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                      {chatMediaType === 'file'
                        ? chatFileName || 'File Ready'
                        : chatMediaType === 'video'
                        ? 'Video Ready'
                        : chatMediaUrls.length > 1
                        ? `${chatMediaUrls.length} Photos Ready`
                        : 'Photo Ready'}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {chatMediaType === 'file' && chatFileSize > 0
                        ? `${formatVideoFileSize(chatFileSize)} • Tap Send to share`
                        : 'Tap Send to share'}
                    </span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setChatMediaUrl('');
                  setChatMediaUrls([]);
                  setChatMediaType('none');
                  setChatFileName('');
                  setChatFileSize(0);
                  setVoiceNoteDuration(0);
                }}
                className="min-w-[40px] min-h-[40px] p-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-rose-500 flex items-center justify-center shrink-0 cursor-pointer"
                title="Discard attachment"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

          {/* Shared hidden file inputs for mobile & desktop pickers */}
          <input
            type="file"
            ref={chatFileRef}
            onChange={handleChatFileSelect}
            accept="image/*,video/*"
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={chatAnyFileRef}
            onChange={handleChatAnyFileSelect}
            className="hidden"
          />

          {/* MOBILE (< 768px) TWO-STATE BOTTOM BAR */}
          <div className="md:hidden wavelink-mobile-convo-bottom-bar">
            {showEmojiPicker && (
              <div className="absolute bottom-18 left-3 right-3 p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xl z-40 grid grid-cols-6 gap-2">
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      handleInputTextChange(inputText + em, mobileChatInputRef.current);
                      setShowEmojiPicker(false);
                    }}
                    className="min-h-[44px] text-lg p-1.5 hover:scale-125 transition-transform rounded-xl hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {showGifPicker && (
              <div className="absolute bottom-18 left-3 right-3 p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xl z-40 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-hairline)]">
                  <span className="text-xs font-extrabold text-[var(--text-primary)]">
                    Pick a GIF
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(false)}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CURATED_GIFS.map((g) => (
                    <button
                      key={g.title}
                      type="button"
                      onClick={() => handleSendMessage(g.url)}
                      className="rounded-2xl overflow-hidden hover:opacity-90 transition border border-[var(--border-hairline)] cursor-pointer"
                    >
                      <img
                        src={g.url}
                        alt={g.title}
                        className="h-20 w-full object-cover"
                      />
                      <span className="text-[10px] font-semibold text-[var(--text-secondary)] truncate block py-1 px-1.5 bg-[var(--bg-subtle)]">
                        {g.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showMobileAttachTray && (
              <div className="absolute bottom-18 left-3 right-3 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xl z-40 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileAttachTray(false);
                    chatFileRef.current?.click();
                  }}
                  className="min-h-[48px] px-3 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <ImageIcon size={18} className="text-[var(--accent-primary)]" />
                  <span>Photo / Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileAttachTray(false);
                    chatAnyFileRef.current?.click();
                  }}
                  className="min-h-[48px] px-3 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <Paperclip size={18} className="text-[var(--accent-secondary)]" />
                  <span>File / Document</span>
                </button>
              </div>
            )}

            {dmPrivacyBlockReason ? (
              <div className="p-3 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-hairline)] shadow-lg flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-stone-500 text-white flex items-center justify-center shrink-0">
                    <Lock size={16} />
                  </div>
                  <p className="text-xs font-bold text-[var(--text-secondary)] truncate">
                    {dmPrivacyBlockReason}
                  </p>
                </div>
                {isRecipientBlocked && directRecipient ? (
                  <button
                    type="button"
                    onClick={() => toggleBlockUser(directRecipient.id)}
                    className="min-h-[40px] px-3 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-extrabold text-xs shrink-0 cursor-pointer"
                  >
                    Unblock
                  </button>
                ) : directRecipient && !isFollowingRecipient ? (
                  <button
                    type="button"
                    onClick={() => handleToggleFollowInChat(directRecipient)}
                    className="min-h-[40px] px-3.5 rounded-full text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                  >
                    <UserPlus size={13} />
                    <span>Follow</span>
                  </button>
                ) : null}
              </div>
            ) : isBlockedFromAdminChat ? (
              <div className="p-3 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-hairline)] shadow-lg flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Lock size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-extrabold text-xs text-[var(--text-primary)] block truncate">
                      Pro Feature
                    </span>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      Try Pro to message Admin
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="min-h-[44px] px-4 rounded-full text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <Star size={13} className="fill-white" />
                  <span>Try Pro</span>
                </button>
              </div>
            ) : isRecordingVoice ? (
              <div className="flex items-center justify-between gap-2 p-2 rounded-full bg-[var(--bg-surface)] border border-rose-400/50 shadow-lg animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0 pl-2">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                  </span>
                  <span className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                    Recording
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 tabular-nums shrink-0">
                    {formatVoiceDuration(recordingSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-bold text-rose-500 flex items-center justify-center gap-1 cursor-pointer"
                    aria-label="Cancel voice recording"
                  >
                    <Trash2 size={15} />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="min-w-[44px] min-h-[44px] px-4 rounded-full text-xs font-extrabold text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                    aria-label="Finish voice recording"
                  >
                    <Square size={12} className="fill-white" />
                    <span>Done</span>
                  </button>
                </div>
              </div>
            ) : !isMobileComposerOpen && !chatMediaUrl ? (
              /* DEFAULT STATE: Rounded bottom bar with 3 round buttons: +, Pencil, Mic */
              <div className="wavelink-mobile-convo-dock">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileAttachTray((p) => !p);
                    setShowEmojiPicker(false);
                    setShowGifPicker(false);
                  }}
                  className={`wavelink-mobile-convo-dock-btn cursor-pointer ${
                    showMobileAttachTray
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                  }`}
                  title="Attach photo, video or file"
                  aria-label="Attach photo, video or file"
                >
                  <Plus
                    size={21}
                    className={
                      showMobileAttachTray
                        ? 'rotate-45 transition-transform duration-200'
                        : 'transition-transform duration-200'
                    }
                  />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileAttachTray(false);
                    flushSync(() => {
                      setIsMobileComposerOpen(true);
                    });
                    mobileChatInputRef.current?.focus();
                  }}
                  className="wavelink-mobile-convo-dock-btn text-white shadow-md cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                  title="Write a message"
                  aria-label="Write a message"
                >
                  <Pencil size={20} />
                </button>

                <button
                  type="button"
                  onPointerDown={() => {
                    setShowMobileAttachTray(false);
                    wasMicHeldRef.current = false;
                    if (micHoldTimerRef.current) clearTimeout(micHoldTimerRef.current);
                    micHoldTimerRef.current = setTimeout(() => {
                      wasMicHeldRef.current = true;
                      startVoiceRecording();
                    }, 180);
                  }}
                  onPointerUp={() => {
                    if (micHoldTimerRef.current) {
                      clearTimeout(micHoldTimerRef.current);
                      micHoldTimerRef.current = null;
                    }
                    if (wasMicHeldRef.current) {
                      wasMicHeldRef.current = false;
                      stopVoiceRecording();
                    } else if (!isRecordingVoice) {
                      startVoiceRecording();
                    }
                  }}
                  onPointerCancel={() => {
                    if (micHoldTimerRef.current) {
                      clearTimeout(micHoldTimerRef.current);
                      micHoldTimerRef.current = null;
                    }
                  }}
                  className="wavelink-mobile-convo-dock-btn bg-[var(--bg-subtle)] text-rose-500 border border-[var(--border-hairline)] cursor-pointer select-none"
                  title="Hold to record a voice note"
                  aria-label="Hold to record a voice note"
                >
                  <Mic size={21} />
                </button>
              </div>
            ) : (
              /* EXPANDED TEXT FIELD STATE: Rounded text field (with Emoji + GIF inside) + circular Send button */
              <div className="wavelink-mobile-convo-composer animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="wavelink-mobile-convo-field">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker((p) => !p);
                      setShowGifPicker(false);
                      setShowMobileAttachTray(false);
                    }}
                    className="w-10 h-11 min-w-[40px] min-h-[44px] rounded-full flex items-center justify-center text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] shrink-0 cursor-pointer"
                    title="Emoji"
                    aria-label="Add Emoji"
                  >
                    <Smile size={20} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowGifPicker((p) => !p);
                      setShowEmojiPicker(false);
                      setShowMobileAttachTray(false);
                    }}
                    className="w-10 h-11 min-w-[40px] min-h-[44px] rounded-full flex items-center justify-center text-[11px] font-black text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] shrink-0 cursor-pointer"
                    title="GIF"
                    aria-label="Add GIF"
                  >
                    GIF
                  </button>

                  <textarea
                    ref={mobileChatInputRef}
                    rows={1}
                    data-chat-input="true"
                    value={inputText}
                    onChange={(e) => handleInputTextChange(e.target.value, e.currentTarget)}
                    onFocus={() => {
                      isInputFocusedRef.current = true;
                      setShowMobileAttachTray(false);
                      window.dispatchEvent(
                        new CustomEvent('wavelink:chat-input-focus', {
                          detail: { focused: true }
                        })
                      );
                      window.setTimeout(() => {
                        window.visualViewport?.dispatchEvent(new Event('resize'));
                        if (messagesListRef.current) {
                          messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
                        }
                      }, 120);
                    }}
                    onBlur={() => {
                      isInputFocusedRef.current = false;
                      window.dispatchEvent(
                        new CustomEvent('wavelink:chat-input-focus', {
                          detail: { focused: false }
                        })
                      );
                      if (isCurrentlyTypingRef.current) {
                        broadcastTypingStatus(false);
                      }
                      window.setTimeout(() => {
                        window.visualViewport?.dispatchEvent(new Event('resize'));
                      }, 120);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      activeGroup
                        ? `Message ${activeGroup.name}...`
                        : directRecipient
                        ? `Message ${directRecipient.displayName.split(' ')[0]}...`
                        : 'Message...'
                    }
                    className="flex-1 min-w-0 resize-none overflow-y-auto"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() && !chatMediaUrl}
                  className={`wavelink-mobile-convo-send cursor-pointer ${
                    inputText.trim() || chatMediaUrl
                      ? 'wavelink-mobile-convo-send--active active:scale-95'
                      : 'wavelink-mobile-convo-send--idle'
                  }`}
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send size={19} />
                </button>
              </div>
            )}
          </div>

          {/* TABLET & DESKTOP (>= 768px) Fixed Bottom Input Bar — completely untouched */}
          <div className="hidden md:block wavelink-chat-input-bar p-2 sm:p-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] shrink-0">
            {/* Popover Emoji Picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-20 left-2 right-2 sm:right-auto sm:w-80 p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xl z-30 grid grid-cols-6 sm:grid-cols-8 gap-2">
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      handleInputTextChange(inputText + em);
                      setShowEmojiPicker(false);
                    }}
                    className="min-h-[40px] text-lg p-1.5 hover:scale-125 transition-transform rounded-xl hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Popover GIF Picker */}
            {showGifPicker && (
              <div className="absolute bottom-20 left-2 right-2 sm:left-12 sm:right-auto sm:w-72 p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl shadow-2xl z-30 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-hairline)]">
                  <span className="text-xs font-extrabold text-[var(--text-primary)]">
                    Pick a GIF
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(false)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
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
                      className="rounded-2xl overflow-hidden hover:opacity-90 transition border border-[var(--border-hairline)] cursor-pointer"
                    >
                      <img
                        src={g.url}
                        alt={g.title}
                        className="h-20 w-full object-cover"
                      />
                      <span className="text-[10px] font-semibold text-[var(--text-secondary)] truncate block py-1 px-1.5 bg-[var(--bg-subtle)]">
                        {g.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dmPrivacyBlockReason ? (
              <div className="p-3.5 bg-[var(--bg-subtle)] rounded-2xl border border-[var(--border-hairline)] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-stone-500 text-white shadow-2xs shrink-0">
                    <Lock size={18} />
                  </div>
                  <p className="text-xs font-bold text-[var(--text-secondary)]">
                    {dmPrivacyBlockReason}
                  </p>
                </div>
                {isRecipientBlocked && directRecipient ? (
                  <button
                    type="button"
                    onClick={() => toggleBlockUser(directRecipient.id)}
                    className="min-h-[40px] py-2 px-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-extrabold text-xs cursor-pointer"
                  >
                    Unblock User
                  </button>
                ) : directRecipient && !isFollowingRecipient ? (
                  <button
                    type="button"
                    onClick={() => handleToggleFollowInChat(directRecipient)}
                    className="min-h-[40px] py-2 px-4 rounded-2xl text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                  >
                    <UserPlus size={14} />
                    <span>Follow to Text</span>
                  </button>
                ) : null}
              </div>
            ) : isBlockedFromAdminChat ? (
              <div className="p-3.5 bg-[var(--bg-subtle)] rounded-2xl border border-[var(--border-hairline)] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-2xs shrink-0">
                    <Lock size={18} />
                  </div>
                  <div>
                    <span className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)] block">
                      Direct Messaging with Admin is a Pro Feature
                    </span>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Try WaveLink Pro to message or call the Platform Administrator directly.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="min-h-[44px] py-2.5 px-4 rounded-2xl text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition active:scale-95 shrink-0 cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <Star size={14} className="fill-white" />
                  <span>Try Pro</span>
                </button>
              </div>
            ) : isRecordingVoice ? (
              <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 rounded-3xl bg-[var(--bg-subtle)] border border-rose-400/50 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0 ml-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] truncate">
                    Recording...
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-rose-500 tabular-nums shrink-0">
                    {formatVoiceDuration(recordingSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="min-h-[42px] px-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-bold text-rose-500 flex items-center gap-1 transition cursor-pointer"
                    title="Cancel recording"
                  >
                    <Trash2 size={14} />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="min-h-[42px] px-3.5 rounded-2xl text-xs font-extrabold text-white flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    }}
                    title="Finish recording"
                  >
                    <Square size={13} className="fill-white" />
                    <span>Done</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full">
                {/* Expandable Mobile Media Tray (< 640px) so the typing box stays roomy at 360px */}
                {showMobileAttachTray && (
                  <div className="sm:hidden mb-2 flex items-center gap-2 px-2 py-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker((p) => !p);
                        setShowGifPicker(false);
                        setShowMobileAttachTray(false);
                      }}
                      className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Smile size={17} className="text-[var(--accent-primary)]" />
                      <span>Emoji</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGifPicker((p) => !p);
                        setShowEmojiPicker(false);
                        setShowMobileAttachTray(false);
                      }}
                      className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-black flex items-center justify-center cursor-pointer"
                    >
                      GIF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileAttachTray(false);
                        chatFileRef.current?.click();
                      }}
                      className="flex-1 min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ImageIcon size={17} className="text-[var(--accent-secondary)]" />
                      <span>Photo/Video</span>
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-1.5 w-full min-w-0">
                {/* Mobile-only compact '+' toggle (44x44) keeping 360px input box spacious */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileAttachTray((p) => !p);
                    setShowEmojiPicker(false);
                    setShowGifPicker(false);
                  }}
                  className={`sm:hidden w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl border flex items-center justify-center transition shrink-0 cursor-pointer ${
                    showMobileAttachTray
                      ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] text-[var(--text-primary)]'
                  }`}
                  title="Media, GIF & Emoji"
                  aria-label="Open media and emoji tools"
                >
                  <Plus size={20} className={showMobileAttachTray ? 'rotate-45 transition-transform' : 'transition-transform'} />
                </button>

                {/* Tablet & Desktop inline Emoji / GIF / Attach buttons (>= 44px touch targets) */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker((p) => !p);
                      setShowGifPicker(false);
                    }}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] flex items-center justify-center transition shrink-0 cursor-pointer"
                    title="Emoji"
                    aria-label="Add Emoji"
                  >
                    <Smile size={18} className="text-[var(--accent-primary)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowGifPicker((p) => !p);
                      setShowEmojiPicker(false);
                    }}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[11px] font-black text-[var(--text-primary)] flex items-center justify-center transition shrink-0 cursor-pointer"
                    title="GIF"
                    aria-label="Add GIF"
                  >
                    GIF
                  </button>

                  <button
                    type="button"
                    onClick={() => chatFileRef.current?.click()}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)] border border-[var(--border-hairline)] text-[var(--text-primary)] flex items-center justify-center transition shrink-0 cursor-pointer"
                    title="Attach photos or video"
                    aria-label="Attach photos or video"
                  >
                    <ImageIcon size={18} className="text-[var(--accent-secondary)]" />
                  </button>
                </div>

                {/* Auto-growing Rounded Message Input Field */}
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  data-chat-input="true"
                  value={inputText}
                  onChange={(e) => handleInputTextChange(e.target.value, e.currentTarget)}
                  onFocus={() => {
                    isInputFocusedRef.current = true;
                    setShowMobileAttachTray(false);
                    window.dispatchEvent(
                      new CustomEvent('wavelink:chat-input-focus', {
                        detail: { focused: true }
                      })
                    );
                    window.setTimeout(() => {
                      window.visualViewport?.dispatchEvent(new Event('resize'));
                      if (messagesListRef.current) {
                        messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
                      }
                    }, 120);
                  }}
                  onBlur={() => {
                    isInputFocusedRef.current = false;
                    window.dispatchEvent(
                      new CustomEvent('wavelink:chat-input-focus', {
                        detail: { focused: false }
                      })
                    );
                    if (isCurrentlyTypingRef.current) {
                      broadcastTypingStatus(false);
                    }
                    window.setTimeout(() => {
                      window.visualViewport?.dispatchEvent(new Event('resize'));
                    }, 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    activeGroup
                      ? `Message ${activeGroup.name}...`
                      : directRecipient
                      ? `Message ${directRecipient.displayName.split(' ')[0]}...`
                      : 'Message...'
                  }
                  className="flex-1 min-w-0 min-h-[44px] max-h-[120px] py-2.5 px-3.5 rounded-3xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:bg-[var(--bg-surface)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 resize-none overflow-y-auto leading-snug transition"
                />

                {/* Voice Note Mic Button (>= 44x44) */}
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-[var(--bg-subtle)] hover:border-rose-400 border border-[var(--border-hairline)] text-rose-500 flex items-center justify-center transition shrink-0 cursor-pointer"
                  title="Record voice note"
                  aria-label="Record voice note"
                >
                  <Mic size={18} />
                </button>

                {/* Colorful Gradient Send Button (>= 44x44) */}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() && !chatMediaUrl}
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl text-white font-bold disabled:opacity-40 hover:opacity-95 shadow-sm active:scale-95 transition flex items-center justify-center shrink-0 cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {/* =====================================================================
            SCREEN 3: DESKTOP RIGHT COLUMN (300-340px, shown ONLY at >= 1280px)
            Profile card with large avatar, bio, Mute & Block buttons,
            Shared Photos & Files, and People Grid of suggested/online users
           ===================================================================== */}
        {showDesktopRightPanel && (
          <aside className="wavelink-chat-right-panel border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 space-y-5">
            {/* 1. Active Recipient or Group Profile Card */}
            {directRecipient ? (
              <div className="p-4 rounded-3xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex flex-col items-center text-center gap-3">
                <div
                  className="relative p-[2.5px] rounded-full shadow-xs"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <Avatar
                    uid={directRecipient.id}
                    src={
                      directRecipient.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`
                    }
                    alt={directRecipient.displayName}
                    fallbackName={directRecipient.displayName}
                    size={80}
                    showStatus={!isChattingWithSupportBot}
                    onlyWhenVisible={false}
                    targetProfile={directRecipient}
                    imageClassName="border-2 border-[var(--bg-surface)]"
                  />
                  {isChattingWithSupportBot && (
                    <span
                      className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-[#22c55e] ring-2 ring-[var(--bg-surface)]"
                      title="24/7 Assistant"
                    />
                  )}
                </div>

                <div className="min-w-0 w-full space-y-1">
                  <div className="flex items-center justify-center">
                    <CrystalBadge
                      email={directRecipient.email}
                      name={directRecipient.displayName}
                      isPro={directRecipient.isPro}
                      hasBlueStar={directRecipient.hasBlueStar || directRecipient.isPro}
                      isSubAdmin={directRecipient.isSubAdmin || directRecipient.role === 'sub_admin'}
                      size="md"
                    />
                  </div>
                  {directRecipientStatusText && (
                    <p
                      className={`text-xs font-extrabold inline-flex items-center gap-1.5 ${
                        isChattingWithSupportBot || directRecipientPresence.status === 'online'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isChattingWithSupportBot || directRecipientPresence.status === 'online'
                            ? 'bg-[#22c55e] animate-pulse'
                            : 'bg-[#ef4444]'
                        }`}
                      />
                      <span>{directRecipientStatusText}</span>
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                    {directRecipient.bio ||
                      (directRecipient.interests && directRecipient.interests.length > 0
                        ? directRecipient.interests.join(' • ')
                        : 'WaveLink Community Member')}
                  </p>
                </div>

                {directRecipient.interests && directRecipient.interests.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {directRecipient.interests.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[10px] font-bold text-[var(--text-secondary)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Mute & Block Quick Actions */}
                <div className="grid grid-cols-2 gap-2 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => activeChannel && toggleMuteChannel(activeChannel)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      isActiveChannelMuted
                        ? 'bg-amber-500/15 border-amber-400/50 text-amber-600 dark:text-amber-300'
                        : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-[var(--text-primary)]'
                    }`}
                  >
                    {isActiveChannelMuted ? <BellOff size={14} /> : <Bell size={14} />}
                    <span>{isActiveChannelMuted ? 'Muted' : 'Mute'}</span>
                  </button>

                  {!isChattingWithSupportBot &&
                  !isSuperAdminEmail(directRecipient.email, directRecipient.role) ? (
                    <button
                      type="button"
                      onClick={() => toggleBlockUser(directRecipient.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        isRecipientBlocked
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-rose-400 hover:text-rose-600 text-[var(--text-primary)]'
                      }`}
                    >
                      <Ban size={14} />
                      <span>{isRecipientBlocked ? 'Unblock' : 'Block'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCall('voice', {
                          id: directRecipient.id,
                          name: directRecipient.displayName,
                          photoURL: directRecipient.photoURL
                        })
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <PhoneCall size={14} className="text-emerald-500" />
                      <span>Call</span>
                    </button>
                  )}
                </div>
              </div>
            ) : activeGroup ? (
              <div className="p-4 rounded-3xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex flex-col items-center text-center gap-2.5">
                <div
                  className="p-[2.5px] rounded-2xl"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  }}
                >
                  <img
                    src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                    alt={activeGroup.name}
                    className="w-18 h-18 rounded-[14px] object-cover bg-[var(--bg-surface)]"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm text-[var(--text-primary)]">
                    {activeGroup.name}
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {activeGroup.description || `${activeGroup.memberIds?.length || 1} members`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => activeChannel && toggleMuteChannel(activeChannel)}
                    className="min-h-[38px] px-3 py-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {isActiveChannelMuted ? <BellOff size={14} /> : <Bell size={14} />}
                    <span>{isActiveChannelMuted ? 'Muted' : 'Mute'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsGroupInfoOpen(true)}
                    className="min-h-[38px] px-3 py-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Info size={14} className="text-[var(--accent-primary)]" />
                    <span>Members</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-3xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center space-y-1.5">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  Conversation Details
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Select a person or group to view their profile, shared photos, and files.
                </p>
              </div>
            )}

            {/* 2. Shared Photos & Files in Current Chat */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Shared Photos &amp; Files ({sharedPhotosInChat.length + sharedFilesInChat.length})
                </span>
              </div>

              {sharedPhotosInChat.length === 0 && sharedFilesInChat.length === 0 ? (
                <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-center">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Photos, videos and voice notes shared in this chat will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sharedPhotosInChat.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {sharedPhotosInChat.slice(0, 6).map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxPhotoUrl(url)}
                          className="aspect-square rounded-xl overflow-hidden border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] transition cursor-pointer"
                        >
                          <img src={url} alt="Shared" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {sharedFilesInChat.length > 0 && (
                    <div className="space-y-1.5">
                      {sharedFilesInChat.slice(0, 4).map((file) => (
                        <a
                          key={file.id}
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] flex items-center gap-2.5 text-xs transition"
                        >
                          <div className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                            <FileText size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[var(--text-primary)] truncate">
                              {file.type}
                            </p>
                            <p className="text-[10px] text-[var(--text-secondary)] truncate">
                              By {file.senderName}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. People Grid of Followed / Texted Contacts */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Following ({Math.min(connectedMembers.length, 6)})
                </span>
                <button
                  type="button"
                  onClick={() => setConvoFilter('people')}
                  className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  See all
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {connectedMembers.slice(0, 6).map((person) => (
                  <ChatPersonGridCard
                    key={`desk_person_${person.id}`}
                    person={person}
                    language={language === 'sw' ? 'sw' : 'en'}
                    compact={true}
                    isFollowed={isMemberFollowed(person.id)}
                    onToggleFollow={handleToggleFollowInChat}
                    onSelect={handleOpenMemberChat}
                  />
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Lightbox Modal for Shared Chat Photos */}
      {lightboxPhotoUrl && (
        <div
          onClick={() => setLightboxPhotoUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxPhotoUrl(null)}
            className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
            aria-label="Close photo preview"
          >
            <X size={20} />
          </button>
          <img
            src={lightboxPhotoUrl}
            alt="Full size shared photo"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85dvh] rounded-3xl object-contain shadow-2xl"
          />
        </div>
      )}

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
                            <Avatar
                              uid={member.id}
                              src={
                                member.photoURL ||
                                `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                              }
                              alt={member.displayName}
                              fallbackName={member.displayName}
                              size={28}
                              showStatus={member.id !== SUPPORT_BOT_ID}
                              targetProfile={member}
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
                          <Avatar
                            uid={mId}
                            src={
                              photo ||
                              `https://api.dicebear.com/7.x/shapes/svg?seed=${mId}`
                            }
                            alt={name}
                            fallbackName={name}
                            size={32}
                            showStatus={mId !== SUPPORT_BOT_ID}
                            targetProfile={userObj}
                            className="ring-1 ring-[#2563EB]/20 rounded-full"
                          />
                          <div>
                            <span className="font-bold text-[#1C1917] block">
                              {name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {isGroupCreator ? (
                                <span className="text-amber-600 font-bold flex items-center gap-0.5">
                                  <Crown size={10} />
                                  <span>Owner</span>
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

              {/* Disappearing Messages Timer */}
              {isCurrentUserGroupAdmin && (
                <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1C1917]">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-[#2563EB]" />
                      <span>Disappearing Messages</span>
                    </span>
                    <select
                      aria-label="Disappearing messages timer"
                      value={activeDisappearingHours}
                      onChange={(e) => handleUpdateDisappearingTimer(Number(e.target.value))}
                      className="px-2.5 py-1 rounded-xl bg-white border border-[#D6D3CD] text-xs font-bold text-[#1C1917]"
                    >
                      <option value={0}>Off</option>
                      <option value={24}>24 Hours</option>
                      <option value={168}>7 Days</option>
                      <option value={720}>30 Days</option>
                    </select>
                  </div>
                </div>
              )}

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

                {(isCurrentUserGroupOwner || isAdmin) && (
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

      {/* Per-Chat Theme Picker Bottom Sheet (mobile) / Popup Modal (desktop) */}
      {isThemePickerOpen && activeChannel && (
        <ChatThemePickerModal
          isOpen={isThemePickerOpen}
          conversationId={activeChannel}
          conversationTitle={
            activeGroup
              ? activeGroup.name
              : directRecipient
              ? directRecipient.displayName
              : 'Conversation'
          }
          isGroup={Boolean(activeGroup)}
          isGroupAdmin={Boolean(isCurrentUserGroupAdmin)}
          canShare={!isChattingWithSupportBot}
          isPro={Boolean(isProEffective)}
          initialPreference={savedActiveChatTheme}
          appActiveTheme={activeTheme}
          onPreviewChange={setPreviewChatTheme}
          onSave={handleSaveChatTheme}
          onResetToDefault={handleResetChatTheme}
          onOpenProUpgrade={() => {
            setIsThemePickerOpen(false);
            setPreviewChatTheme(null);
            setShowPaymentModal(true);
          }}
          onClose={() => {
            setPreviewChatTheme(null);
            setIsThemePickerOpen(false);
          }}
        />
      )}

      {/* Layer 4 Report & Block/Mute Modal */}
      <ReportContentModal
        isOpen={Boolean(chatReportTarget)}
        target={chatReportTarget}
        currentUid={currentUser?.uid}
        isAuthorBlocked={Boolean(
          chatReportTarget?.targetAuthorId &&
            (userProfile?.blockedUserIds || []).includes(chatReportTarget.targetAuthorId)
        )}
        isAuthorMuted={Boolean(
          chatReportTarget?.targetAuthorId &&
            (userProfile?.mutedUserIds || []).includes(chatReportTarget.targetAuthorId)
        )}
        onClose={() => setChatReportTarget(null)}
        onReportSubmitted={(res) => {
          showGlobalToast?.(res.message);
        }}
        onBlockChanged={(_, blocked) => {
          showGlobalToast?.(blocked ? 'User blocked.' : 'User unblocked.');
        }}
        onMuteChanged={(_, muted) => {
          showGlobalToast?.(muted ? 'User muted.' : 'User unmuted.');
        }}
      />

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
