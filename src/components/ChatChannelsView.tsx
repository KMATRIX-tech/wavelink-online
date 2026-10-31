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
  arrayRemove
} from 'firebase/firestore';
import { ChannelMessage, UserProfile, CallRecipient, ChatGroup } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { compressImage } from '../utils/mediaStorage';
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
  Star
} from 'lucide-react';
import { ADMIN_EMAIL, isSuperAdminEmail } from '../firebase';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { sendNotification } from '../services/notificationService';

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

export const ChatChannelsView: React.FC<ChatChannelsViewProps> = ({ onOpenCall, initialTargetUserId }) => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, isSubAdmin, canTalkToAdmin, isProEffective } = useAuth();

  // Active channel identifier: can be a groupId (e.g. `grp_...`) or DM id (`dm_...`)
  const [activeChannel, setActiveChannel] = useState<string>('');
  const [showMobileChannels, setShowMobileChannels] = useState(false);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [channelLastSeen, setChannelLastSeen] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChannelMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Media upload in chat
  const [chatMediaUrl, setChatMediaUrl] = useState<string>('');
  const [chatMediaType, setChatMediaType] = useState<'image' | 'video' | 'none'>('none');
  const chatFileRef = useRef<HTMLInputElement | null>(null);

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

  // 1. Real-time listener for registered users / online members
  useEffect(() => {
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      usersQuery,
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          if (d.id !== currentUser?.uid) {
            list.push({ id: d.id, ...d.data() } as UserProfile);
          }
        });
        setMembers(list);

        // If target user specified from directory, start DM
        if (initialTargetUserId && currentUser?.uid) {
          const dmId =
            currentUser.uid < initialTargetUserId
              ? `dm_${currentUser.uid}_${initialTargetUserId}`
              : `dm_${initialTargetUserId}_${currentUser.uid}`;
          setActiveChannel(dmId);
        } else if (currentUser?.uid && list.length > 0) {
          // Ensure a default conversation is selected if none is active
          setActiveChannel((prev) => {
            if (prev) return prev;
            const firstTarget = list[0];
            return currentUser.uid < firstTarget.id
              ? `dm_${currentUser.uid}_${firstTarget.id}`
              : `dm_${firstTarget.id}_${currentUser.uid}`;
          });
        }
      },
      (e) => {
        console.warn('Chat members listener notice:', e);
      }
    );
    return () => unsub();
  }, [currentUser?.uid, initialTargetUserId]);

  // 2. Real-time listener for user-created groups
  useEffect(() => {
    const groupsQuery = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      groupsQuery,
      (snapshot) => {
        const list: ChatGroup[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ChatGroup);
        });
        setGroups(list);

        // If active channel not set yet, select the first group
        setActiveChannel((prev) => {
          if (prev) return prev;
          if (list.length > 0) return list[0].id;
          return '';
        });
      },
      (err) => {
        console.warn('Groups listener notice:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Determine current active chat item info
  const isDirectMessage = activeChannel.startsWith('dm_');
  const activeGroup = !isDirectMessage ? groups.find((g) => g.id === activeChannel) : null;
  const directRecipient = isDirectMessage
    ? members.find((m) => activeChannel.includes(m.id))
    : null;
  const isChattingWithSuperAdmin = isDirectMessage && Boolean(directRecipient && isSuperAdminEmail(directRecipient.email));
  const isBlockedFromAdminChat = isChattingWithSuperAdmin && !canTalkToAdmin;

  const isCurrentUserGroupAdmin = activeGroup && currentUser
    ? (activeGroup.adminIds?.includes(currentUser.uid) || activeGroup.creatorId === currentUser.uid || isAdmin)
    : false;

  const isCurrentUserMember = activeGroup && currentUser
    ? activeGroup.memberIds?.includes(currentUser.uid)
    : false;

  // 2b. Real-time listener for channel lastSeen metadata (for Direct Messages)
  useEffect(() => {
    if (!activeChannel || !isDirectMessage) {
      setChannelLastSeen({});
      return;
    }

    const channelDocRef = doc(db, 'channels', activeChannel);
    const unsub = onSnapshot(
      channelDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setChannelLastSeen((data?.lastSeen as Record<string, string>) || {});
        } else {
          setChannelLastSeen({});
        }
      },
      (err) => {
        console.warn('Channel lastSeen listener notice:', err);
      }
    );

    return () => unsub();
  }, [activeChannel, isDirectMessage]);

  // 3. Real-time message listener for active channel (Group vs DM)
  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }

    const messagesCol = isDirectMessage
      ? collection(db, 'channels', activeChannel, 'messages')
      : collection(db, 'groups', activeChannel, 'messages');

    const q = query(messagesCol, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ChannelMessage[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as ChannelMessage));
        setMessages(list);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      (err) => {
        console.warn('Chat messages listener notice:', err);
      }
    );

    return () => unsub();
  }, [activeChannel, isDirectMessage, currentUser?.uid]);

  // 4. Track & broadcast lastSeen timestamp and per-message readBy receipts in Firestore
  useEffect(() => {
    if (!activeChannel || !currentUser?.uid) return;

    const markConversationAsSeen = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const nowIso = new Date().toISOString();

      try {
        // Update channel or group lastSeen map for current user
        if (isDirectMessage) {
          await setDoc(
            doc(db, 'channels', activeChannel),
            {
              id: activeChannel,
              lastSeen: { [currentUser.uid]: nowIso },
              updatedAt: nowIso
            },
            { merge: true }
          );
        } else {
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
      } catch (err) {
        console.warn('Read receipt sync notice:', err);
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
  }, [activeChannel, isDirectMessage, currentUser?.uid, messages.length]);

  // Helper to evaluate whether a message sent by currentUser has been viewed by the recipient(s)
  const getReadReceiptInfo = (msg: ChannelMessage): { isSeen: boolean; seenAt?: string; seenCount: number } => {
    const readByOtherIds = (msg.readBy || []).filter((uid) => uid !== msg.senderId);
    const msgTime = new Date(msg.createdAt).getTime();

    if (isDirectMessage) {
      // Extract the recipient UID from directRecipient or dm_<uid1>_<uid2>
      const parts = activeChannel.replace(/^dm_/, '').split('_');
      const recipientId = directRecipient?.id || parts.find((id) => id !== msg.senderId) || '';
      const recipientLastSeen = recipientId ? channelLastSeen[recipientId] : undefined;
      const seenByTimestamp =
        recipientLastSeen && !isNaN(new Date(recipientLastSeen).getTime())
          ? new Date(recipientLastSeen).getTime() >= msgTime
          : false;
      const isSeen = readByOtherIds.includes(recipientId) || readByOtherIds.length > 0 || seenByTimestamp;
      return {
        isSeen,
        seenAt: recipientLastSeen || msg.lastSeenAt,
        seenCount: isSeen ? 1 : 0
      };
    }

    // Group chat: check how many group members have lastSeen >= msg.createdAt or are in readBy
    const groupLastSeen = activeGroup?.lastSeen || {};
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

    return {
      isSeen: seenMemberIds.size > 0,
      seenAt: latestSeenIso,
      seenCount: seenMemberIds.size
    };
  };

  // Handle image or video file upload in chat with client compression
  const handleChatFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      console.warn('Please select an image or video file.');
      return;
    }

    try {
      if (isImage) {
        setChatMediaType('image');
        const compressed = await compressImage(file, 1024, 0.75);
        setChatMediaUrl(compressed);
      } else {
        setChatMediaType('video');
        const reader = new FileReader();
        reader.onload = (event) => {
          const res = event.target?.result as string;
          if (res) setChatMediaUrl(res);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Error reading chat media:', err);
    }
  };

  // Send message
  const handleSendMessage = async (customGifUrl?: string) => {
    if ((!inputText.trim() && !customGifUrl && !chatMediaUrl) || !currentUser || !activeChannel) return;

    try {
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const data: Record<string, any> = {
        id: msgId,
        channelId: activeChannel,
        senderId: currentUser.uid,
        senderEmail: currentUser.email || 'user',
        senderName: userProfile?.displayName || currentUser.displayName || 'Waver',
        senderUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        senderPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        text: inputText.trim(),
        mediaType: chatMediaType,
        isEdited: false,
        isDeleted: false,
        readBy: [currentUser.uid],
        createdAt: nowIso
      };

      if (chatMediaUrl) {
        data.mediaUrl = chatMediaUrl;
      }
      if (customGifUrl) {
        data.gifUrl = customGifUrl;
      }
      if (replyingTo) {
        data.replyToId = replyingTo.id;
        if (replyingTo.text) {
          data.replyToText = replyingTo.text.substring(0, 120);
        }
        if (replyingTo.senderName) {
          data.replyToSenderName = replyingTo.senderName;
        }
      }

      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', msgId)
        : doc(db, 'groups', activeChannel, 'messages', msgId);

      await setDoc(docRef, cleanFirestoreData(data));

      // Update sender's lastSeen timestamp on the conversation document
      if (isDirectMessage) {
        setDoc(
          doc(db, 'channels', activeChannel),
          {
            id: activeChannel,
            lastSeen: { [currentUser.uid]: nowIso },
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {});
      } else {
        setDoc(
          doc(db, 'groups', activeChannel),
          {
            lastSeen: { [currentUser.uid]: nowIso },
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {});
      }

      const messagePreview = (inputText.trim() || (customGifUrl ? '[GIF]' : '[Media]')).substring(0, 100);
      const senderDisplayName = userProfile?.displayName || currentUser.displayName || 'Someone';

      if (isDirectMessage && directRecipient) {
        sendNotification({
          recipientId: directRecipient.id,
          actorId: currentUser.uid,
          actorName: senderDisplayName,
          actorAvatar: userProfile?.photoURL || currentUser.photoURL || undefined,
          type: 'message',
          title: `New message from ${senderDisplayName} 💬`,
          body: messagePreview,
          entityId: activeChannel,
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

      setInputText('');
      setChatMediaUrl('');
      setChatMediaType('none');
      if (chatFileRef.current) chatFileRef.current.value = '';
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowGifPicker(false);
    } catch (err) {
      const path = isDirectMessage
        ? `channels/${activeChannel}/messages`
        : `groups/${activeChannel}/messages`;
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Edit message
  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return;
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
    if (!confirm('Unsend this message?')) return;
    try {
      const docRef = isDirectMessage
        ? doc(db, 'channels', activeChannel, 'messages', messageId)
        : doc(db, 'groups', activeChannel, 'messages', messageId);

      await updateDoc(docRef, {
        isDeleted: true,
        text: 'This message was unsent.',
        mediaUrl: '',
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'groups', groupId), cleanFirestoreData(groupData));

      // Post initial welcome message into group chat
      const welcomeMsgId = `msg_init_${Date.now()}`;
      await setDoc(doc(db, 'groups', groupId, 'messages', welcomeMsgId), {
        id: welcomeMsgId,
        channelId: groupId,
        senderId: currentUser.uid,
        senderEmail: currentUser.email || 'system',
        senderName: userProfile?.displayName || currentUser.displayName || 'Group Admin',
        senderUsername: '@admin',
        senderPhotoURL: userProfile?.photoURL || currentUser.photoURL,
        text: `Welcome to ${newGroupName.trim()}! Wave, chat, and share ideas together. 🎉`,
        mediaType: 'none',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString()
      });

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

  // Upload custom group logo from device
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isForEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 256, 0.8);
      if (isForEdit) {
        setEditGroupLogo(compressed);
      } else {
        setNewGroupLogo(compressed);
      }
    } catch (err) {
      console.error('Logo upload error:', err);
    }
  };

  // Filter conversations
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredMembers = members.filter(
    (m) =>
      m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6">
      <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl shadow-sm overflow-hidden flex flex-col md:flex-row h-[780px] max-h-[82vh]">
        {/* Left Sidebar: Groups & Direct Chats */}
        <div
          className={`w-full md:w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/70 dark:bg-[#0f1422]/70 shrink-0 ${
            showMobileChannels ? 'block' : 'hidden md:flex'
          }`}
        >
          {/* Top Bar with Create Group Button */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-purple-600 dark:text-purple-400" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-gray-900 dark:text-white">
                Conversations
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedMemberIds([]);
                  setNewGroupName('');
                  setNewGroupDesc('');
                  setNewGroupLogo(PRESET_LOGOS[0].url);
                  setIsCreateGroupOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition"
                title="Create a new group"
              >
                <Plus size={14} />
                <span>New Group</span>
              </button>
              {showMobileChannels && (
                <button
                  onClick={() => setShowMobileChannels(false)}
                  className="text-xs text-gray-500 md:hidden font-semibold p-1"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Search bar & Filter Pills */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-800/80 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search groups or people..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'groups', 'dms'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setConvoFilter(filter)}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-lg capitalize transition ${
                    convoFilter === filter
                      ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
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
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    <Users size={12} />
                    <span>User Groups ({filteredGroups.length})</span>
                  </span>
                </div>

                {filteredGroups.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-white/60 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-800 text-center space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No groups made yet.
                    </p>
                    <button
                      onClick={() => setIsCreateGroupOpen(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>Create the first group</span>
                    </button>
                  </div>
                ) : (
                  filteredGroups.map((group) => {
                    const isActive = activeChannel === group.id;
                    const isMember = group.memberIds?.includes(currentUser?.uid || '');
                    const isGrpAdmin = group.adminIds?.includes(currentUser?.uid || '') || group.creatorId === currentUser?.uid;

                    return (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveChannel(group.id);
                          setReplyingTo(null);
                          setShowMobileChannels(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition relative group ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-md shadow-blue-500/20'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800/80 border border-transparent hover:border-gray-200/80 dark:hover:border-gray-800'
                        }`}
                      >
                        {/* Group Custom Logo */}
                        <div className="relative shrink-0">
                          <img
                            src={group.logoUrl || PRESET_LOGOS[0].url}
                            alt={group.name}
                            className={`w-10 h-10 rounded-xl object-cover ring-2 ${
                              isActive ? 'ring-white/40' : 'ring-blue-500/20'
                            }`}
                          />
                          {isGrpAdmin && (
                            <span
                              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-amber-500 text-white shadow-xs"
                              title="You are Group Admin"
                            >
                              <Crown size={10} />
                            </span>
                          )}
                        </div>

                        {/* Group Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs truncate">
                              {group.name}
                            </span>
                            <span
                              className={`text-[10px] ${
                                isActive ? 'text-purple-100' : 'text-gray-400'
                              }`}
                            >
                              {group.memberIds?.length || 1} members
                            </span>
                          </div>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              isActive ? 'text-purple-100/90' : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {group.description || `Created by ${group.creatorName}`}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Direct 1-on-1 Chats Section */}
            {(convoFilter === 'all' || convoFilter === 'dms') && (
              <div className="space-y-1 pt-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 py-1 flex items-center gap-1">
                  <UserIcon size={12} />
                  <span>Direct Chats ({filteredMembers.length})</span>
                </div>
                {filteredMembers.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-2 py-2">
                    No other users registered yet.
                  </p>
                ) : (
                  filteredMembers.map((member) => {
                    if (!currentUser) return null;
                    const dmId =
                      currentUser.uid < member.id
                        ? `dm_${currentUser.uid}_${member.id}`
                        : `dm_${member.id}_${currentUser.uid}`;
                    const isActive = activeChannel === dmId;

                    return (
                      <button
                        key={member.id}
                        onClick={() => {
                          setActiveChannel(dmId);
                          setReplyingTo(null);
                          setShowMobileChannels(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800/80 border border-transparent hover:border-gray-200/80 dark:hover:border-gray-800'
                        }`}
                      >
                        <img
                          src={
                            member.photoURL ||
                            `https://api.dicebear.com/7.x/shapes/svg?seed=${member.id}`
                          }
                          alt={member.displayName}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">
                              <CrystalBadge
                                email={member.email}
                                name={member.displayName}
                                isPro={member.isPro}
                                hasBlueStar={member.hasBlueStar || member.isPro}
                                isSubAdmin={member.isSubAdmin || member.role === 'sub_admin'}
                                size="sm"
                              />
                            </span>
                            {isSuperAdminEmail(member.email) && !canTalkToAdmin ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-bold flex items-center gap-0.5 shrink-0">
                                <Lock size={9} />
                                <span>Locked</span>
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                                  isActive
                                    ? 'bg-blue-700 text-blue-100'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                                }`}
                              >
                                Live
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] block truncate ${
                              isActive ? 'text-purple-100' : 'text-gray-400'
                            }`}
                          >
                            {member.username}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Main Chat Pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#131927]">
          {/* Header Bar */}
          <div className="p-3.5 sm:p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setShowMobileChannels(true)}
                className="md:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <MoreVertical size={18} />
              </button>

              {activeGroup ? (
                // Group Chat Header
                <div
                  onClick={() => setIsGroupInfoOpen(true)}
                  className="flex items-center gap-3 cursor-pointer group/title"
                >
                  <img
                    src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                    alt={activeGroup.name}
                    className="w-10 h-10 rounded-2xl object-cover ring-2 ring-purple-500/30 group-hover/title:scale-105 transition"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                        {activeGroup.name}
                      </h2>
                      {isCurrentUserGroupAdmin && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold flex items-center gap-1">
                          <Crown size={10} />
                          <span>Admin</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate flex items-center gap-1.5">
                      <span>{activeGroup.memberIds?.length || 1} members</span>
                      <span>•</span>
                      <span className="text-purple-600 dark:text-purple-400 group-hover/title:underline">
                        Group Info & Settings
                      </span>
                    </p>
                  </div>
                </div>
              ) : directRecipient ? (
                // Direct Chat Header
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={
                      directRecipient.photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${directRecipient.id}`
                    }
                    alt={directRecipient.displayName}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/30 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CrystalBadge
                        email={directRecipient.email}
                        name={directRecipient.displayName}
                        isPro={directRecipient.isPro}
                        hasBlueStar={directRecipient.hasBlueStar || directRecipient.isPro}
                        isSubAdmin={directRecipient.isSubAdmin || directRecipient.role === 'sub_admin'}
                        size="md"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5 flex items-center gap-1.5">
                      <span>{directRecipient.username}</span>
                      <span>•</span>
                      {channelLastSeen[directRecipient.id] || directRecipient.lastSeen || directRecipient.lastSeenAt ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Last seen {formatLastSeenTimestamp(channelLastSeen[directRecipient.id] || directRecipient.lastSeen || directRecipient.lastSeenAt)}
                        </span>
                      ) : (
                        <span>Direct Message</span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MessageSquare size={20} className="text-purple-600" />
                  <span className="font-bold text-sm text-gray-700 dark:text-gray-300">
                    Select a group or member to chat
                  </span>
                </div>
              )}
            </div>

            {/* Right Action Icons: Video/Voice Calling for DMs, Group Info for Groups */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {isDirectMessage && directRecipient && (
                isBlockedFromAdminChat ? (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="p-2 sm:px-3.5 sm:py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Direct communication with Platform Admin is locked. Verified Blue Star or Admin required."
                  >
                    <Lock size={14} className="text-amber-500" />
                    <span>Call Admin (Locked)</span>
                  </button>
                ) : (
                <>
                  <button
                    onClick={() =>
                      onOpenCall('voice', {
                        id: directRecipient.id,
                        name: directRecipient.displayName,
                        photoURL: directRecipient.photoURL
                      })
                    }
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Start Voice Call"
                  >
                    <PhoneCall size={16} className="text-emerald-500" />
                    <span className="hidden sm:inline">Voice</span>
                  </button>
                  <button
                    onClick={() =>
                      onOpenCall('video', {
                        id: directRecipient.id,
                        name: directRecipient.displayName,
                        photoURL: directRecipient.photoURL
                      })
                    }
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
                    title="Start Video Call"
                  >
                    <Video size={16} />
                    <span className="hidden sm:inline">Video Call</span>
                  </button>
                </>
                )
              )}

              {activeGroup && (
                <>
                  <button
                    onClick={() => setIsGroupInfoOpen(true)}
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Group Settings & Members"
                  >
                    <Info size={16} className="text-purple-600" />
                    <span className="hidden sm:inline">Group Info</span>
                  </button>

                  {isCurrentUserMember && (
                    <button
                      onClick={() => handleExitGroup(activeGroup)}
                      className="p-2 sm:px-2.5 sm:py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1 transition"
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

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/40 dark:bg-[#0B0F19]/40">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                <div className="p-4 rounded-3xl bg-purple-100/80 dark:bg-purple-950/40 text-purple-600 mb-3">
                  <MessageSquare size={32} />
                </div>
                <h4 className="font-bold text-gray-900 dark:text-white text-base">
                  No messages yet
                </h4>
                <p className="text-xs max-w-sm mt-1 leading-relaxed">
                  {activeGroup
                    ? `Be the first to start the conversation in ${activeGroup.name}!`
                    : 'Send a wave or photo to start chatting!'}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.senderId === currentUser?.uid;
                const isEditing = editingMessageId === msg.id;
                const receipt = isOwn && !msg.isDeleted ? getReadReceiptInfo(msg) : null;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 group/msg ${
                      isOwn ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* User Avatar */}
                    <img
                      src={
                        msg.senderPhotoURL ||
                        `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.senderId}`
                      }
                      alt={msg.senderName}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-blue-500/20 shrink-0 mt-1"
                    />

                    {/* Message Bubble Body */}
                    <div className={`max-w-[80%] sm:max-w-[70%] space-y-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                      {/* Name & Time Header */}
                      <div
                        className={`flex items-center gap-2 text-[10px] text-gray-400 ${
                          isOwn ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <CrystalBadge
                          email={msg.senderEmail}
                          name={msg.senderName}
                          size="sm"
                        />
                        <span className="font-mono tabular-numbers">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {msg.isEdited && <span className="italic text-gray-400">(edited)</span>}
                        {isOwn && receipt && (
                          <span
                            className={`inline-flex items-center gap-0.5 font-semibold transition-colors ${
                              receipt.isSeen
                                ? 'text-sky-500 dark:text-sky-400'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}
                            title={
                              receipt.isSeen
                                ? `Viewed${receipt.seenAt ? ` • ${formatLastSeenTimestamp(receipt.seenAt)}` : ''}`
                                : 'Sent • Waiting for recipient to view'
                            }
                          >
                            {receipt.isSeen ? (
                              <CheckCheck size={14} className="text-sky-500 dark:text-sky-400 stroke-[2.5]" />
                            ) : (
                              <Check size={13} className="text-gray-400" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Reply Reference if replying to another message */}
                      {msg.replyToText && (
                        <div
                          className={`text-[11px] p-2 rounded-xl border-l-2 mb-1 ${
                            isOwn
                              ? 'bg-blue-700/30 border-blue-300 text-blue-100'
                              : 'bg-slate-100 dark:bg-gray-800 border-blue-500 text-slate-700 dark:text-gray-300'
                          }`}
                        >
                          <span className="font-bold block text-[10px] text-blue-400">
                            Replying to {msg.replyToSenderName || 'message'}:
                          </span>
                          <span className="truncate block">{msg.replyToText}</span>
                        </div>
                      )}

                      {/* Content Card */}
                      <div
                        className={`rounded-2xl p-3 text-xs leading-relaxed ${
                          msg.isDeleted
                            ? 'italic bg-gray-100 dark:bg-gray-800 text-gray-400'
                            : isOwn
                            ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-tr-none shadow-sm shadow-blue-500/20'
                            : 'bg-white dark:bg-gray-800/90 text-slate-800 dark:text-gray-200 rounded-tl-none border border-slate-200/80 dark:border-gray-700/60 shadow-xs'
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full p-2 rounded-lg bg-black/20 text-white text-xs border border-white/30 focus:outline-none"
                            />
                            <div className="flex justify-end gap-2 text-[10px]">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="px-2 py-1 rounded bg-black/30 hover:bg-black/50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEdit(msg.id)}
                                className="px-2 py-1 rounded bg-white text-blue-700 font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Media Attachment (Image / Video from folders) */}
                            {msg.mediaUrl && !msg.isDeleted && (
                              <div className="mb-2 rounded-xl overflow-hidden max-w-sm">
                                {msg.mediaType === 'video' ? (
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

                            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                            {/* Read Receipt Footer inside own message bubble */}
                            {isOwn && !msg.isDeleted && receipt && (
                              <div
                                className="mt-1.5 pt-1 border-t border-white/15 flex items-center justify-end gap-1 text-[10px] select-none"
                                title={
                                  receipt.isSeen
                                    ? `Seen${receipt.seenAt ? ` (${formatLastSeenTimestamp(receipt.seenAt)})` : ''}`
                                    : 'Sent'
                                }
                              >
                                {receipt.isSeen ? (
                                  <>
                                    <CheckCheck size={13} className="text-sky-200 stroke-[2.5] shrink-0" />
                                    <span className="text-sky-100 font-semibold">
                                      {isDirectMessage
                                        ? 'Seen'
                                        : receipt.seenCount > 1
                                        ? `Seen by ${receipt.seenCount}`
                                        : 'Seen'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Check size={12} className="text-white/75 shrink-0" />
                                    <span className="text-white/75">Sent</span>
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Action buttons on hover */}
                      {!msg.isDeleted && (
                        <div
                          className={`flex items-center gap-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity text-[11px] text-gray-400 ${
                            isOwn ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="p-1 hover:text-purple-600 dark:hover:text-purple-400 rounded"
                            title="Reply"
                          >
                            <Reply size={13} />
                          </button>
                          {isOwn && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditText(msg.text);
                                }}
                                className="p-1 hover:text-purple-600 dark:hover:text-purple-400 rounded"
                                title="Edit"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 hover:text-rose-500 rounded"
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
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Replying banner */}
          {replyingTo && (
            <div className="px-4 py-2 bg-purple-50 dark:bg-purple-950/40 border-t border-purple-200 dark:border-purple-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <Reply size={14} className="text-purple-600 shrink-0" />
                <span className="text-purple-700 dark:text-purple-300 font-semibold truncate">
                  Replying to {replyingTo.senderName}: &quot;{replyingTo.text}&quot;
                </span>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Selected Media Preview Bar */}
          {chatMediaUrl && (
            <div className="p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {chatMediaType === 'video' ? (
                  <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center text-white">
                    <Film size={20} />
                  </div>
                ) : (
                  <img
                    src={chatMediaUrl}
                    alt="Preview"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                )}
                <div>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 block">
                    {chatMediaType === 'video' ? 'Video Attachment' : 'Photo Attachment'}
                  </span>
                  <span className="text-[10px] text-gray-500">Ready to send</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setChatMediaUrl('');
                  setChatMediaType('none');
                }}
                className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-rose-500"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Input & Action Footer Bar */}
          <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#131927] relative">
            {/* Popover Emoji Picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-18 left-4 p-3 bg-white dark:bg-[#1f293d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-30 grid grid-cols-8 gap-2">
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setInputText((prev) => prev + em);
                      setShowEmojiPicker(false);
                    }}
                    className="text-lg p-1 hover:scale-125 transition-transform"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Popover GIF Picker */}
            {showGifPicker && (
              <div className="absolute bottom-18 left-12 p-3 bg-white dark:bg-[#1f293d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-30 w-72 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    Pick a GIF
                  </span>
                  <button
                    onClick={() => setShowGifPicker(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CURATED_GIFS.map((g) => (
                    <button
                      key={g.title}
                      onClick={() => handleSendMessage(g.url)}
                      className="rounded-xl overflow-hidden hover:opacity-80 transition group"
                    >
                      <img
                        src={g.url}
                        alt={g.title}
                        className="h-20 w-full object-cover rounded-xl"
                      />
                      <span className="text-[9px] text-gray-500 truncate block mt-0.5">
                        {g.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isBlockedFromAdminChat ? (
              <div className="p-4 bg-gradient-to-r from-amber-50 to-sky-50 dark:from-amber-950/40 dark:to-sky-950/40 rounded-2xl border border-amber-300 dark:border-amber-900/60 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-xs shrink-0">
                    <Lock size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm text-gray-900 dark:text-white">
                        Direct Messaging with @keylan is Protected
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        Blue Star Required
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                      Direct messaging and calls to the Platform Administrator are restricted to Verified Blue Star members and Administrators.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-extrabold text-xs flex items-center gap-2 shadow-md shadow-sky-600/25 transition active:scale-95 shrink-0"
                >
                  <Star size={14} className="fill-white" />
                  <span>Get Verified Blue Star (Pro)</span>
                </button>
              </div>
            ) : (
            <div className="flex items-center gap-2">
              {/* Media Picker Button (From Phone/Folders) */}
              <input
                type="file"
                ref={chatFileRef}
                onChange={handleChatFileSelect}
                accept="image/*,video/*"
                className="hidden"
              />
              <button
                onClick={() => chatFileRef.current?.click()}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
                title="Attach photo or video from device"
              >
                <UploadCloud size={16} />
              </button>

              {/* Emoji button */}
              <button
                onClick={() => {
                  setShowEmojiPicker((p) => !p);
                  setShowGifPicker(false);
                }}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
                title="Add Emoji"
              >
                <Smile size={16} />
              </button>

              {/* GIF button */}
              <button
                onClick={() => {
                  setShowGifPicker((p) => !p);
                  setShowEmojiPicker(false);
                }}
                className="px-2.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-[11px] font-bold text-gray-600 dark:text-gray-300 transition"
                title="Add GIF"
              >
                GIF
              </button>

              {/* Text Input Field */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
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
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-gray-800/90 border border-slate-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() && !chatMediaUrl}
                className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-bold disabled:opacity-40 hover:from-blue-500 hover:to-emerald-500 shadow-sm shadow-blue-500/20 active:scale-95 transition"
              >
                <Send size={16} />
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-600 text-white shadow-xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                    Create New Group
                  </h3>
                  <p className="text-xs text-gray-500">
                    You will be the group admin with full controls
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateGroupOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Group Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Group Name *
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Photography Club, Tech Innovators..."
                  className="w-full py-2.5 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Group Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  rows={2}
                  placeholder="What is this group all about?"
                  className="w-full py-2 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Group Logo Customization */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Customize Group Logo
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <img
                    src={newGroupLogo}
                    alt="Logo preview"
                    className="w-16 h-16 rounded-2xl object-cover ring-2 ring-purple-500 shadow-md"
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
                      className="px-3 py-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center gap-1.5 hover:bg-purple-200 transition"
                    >
                      <Camera size={14} />
                      <span>Upload from Device</span>
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Pick any photo from phone or computer
                    </p>
                  </div>
                </div>

                {/* Preset Logos */}
                <span className="text-[10px] text-gray-400 font-semibold block mb-1.5">
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
                          ? 'ring-purple-600 scale-105'
                          : 'ring-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={logo.url}
                        alt={logo.label}
                        className="w-full h-11 object-cover"
                      />
                      {newGroupLogo === logo.url && (
                        <div className="absolute inset-0 bg-purple-600/30 flex items-center justify-center text-white">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Members Multi-Select */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Add People ({selectedMemberIds.length} selected)
                </label>
                {members.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">
                    No other users registered yet. You will be the sole founding member.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-2xl p-2 bg-gray-50/50 dark:bg-gray-800/40">
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
                              ? 'bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800'
                              : 'hover:bg-white dark:hover:bg-gray-800'
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
                              <span className="font-bold text-gray-900 dark:text-white block">
                                {member.displayName}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {member.username}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'border-gray-300 dark:border-gray-600'
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
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || isCreatingGroup}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-600 text-white shadow-xs">
                  <Info size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                    Group Details
                  </h3>
                  <p className="text-xs text-gray-400">
                    {isCurrentUserGroupAdmin ? 'Admin settings & member roster' : 'Community group info'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsGroupInfoOpen(false);
                  setIsEditingGroup(false);
                  setIsAddMemberMode(false);
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Group Banner & Identity */}
              {!isEditingGroup ? (
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50/70 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                  <img
                    src={activeGroup.logoUrl || PRESET_LOGOS[0].url}
                    alt={activeGroup.name}
                    className="w-16 h-16 rounded-2xl object-cover ring-2 ring-purple-500/40 shadow-md shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-base text-gray-900 dark:text-white truncate">
                        {activeGroup.name}
                      </h4>
                      {isCurrentUserGroupAdmin && (
                        <button
                          onClick={() => {
                            setEditGroupName(activeGroup.name);
                            setEditGroupDesc(activeGroup.description || '');
                            setEditGroupLogo(activeGroup.logoUrl || PRESET_LOGOS[0].url);
                            setIsEditingGroup(true);
                          }}
                          className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline flex items-center gap-1"
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      {activeGroup.description || 'No description provided.'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2 font-mono">
                      Created by {activeGroup.creatorName} • {new Date(activeGroup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ) : (
                /* Editing Mode (Admin Only) */
                <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-3">
                  <h4 className="text-xs font-bold text-purple-700 dark:text-purple-300">
                    Customize Group Details
                  </h4>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                      Group Name
                    </label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full py-2 px-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                      Description
                    </label>
                    <textarea
                      value={editGroupDesc}
                      onChange={(e) => setEditGroupDesc(e.target.value)}
                      rows={2}
                      className="w-full py-2 px-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                      Change Logo
                    </label>
                    <div className="flex items-center gap-3">
                      <img
                        src={editGroupLogo || activeGroup.logoUrl}
                        alt="Logo"
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-purple-500"
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
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-700 text-xs font-semibold text-purple-700 dark:text-purple-300"
                      >
                        Upload Photo
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setIsEditingGroup(false)}
                      className="px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveGroupEdit}
                      className="px-4 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}

              {/* Members Roster Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Members ({activeGroup.memberIds?.length || 1})
                  </span>
                  {isCurrentUserGroupAdmin && (
                    <button
                      onClick={() => setIsAddMemberMode((p) => !p)}
                      className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                    >
                      <UserPlus size={12} />
                      <span>{isAddMemberMode ? 'Close' : '+ Add Member'}</span>
                    </button>
                  )}
                </div>

                {/* Add Member Dropdown if open */}
                {isAddMemberMode && isCurrentUserGroupAdmin && (
                  <div className="p-3 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
                    <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 block">
                      Add a registered user to {activeGroup.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={addMemberSelectedId}
                        onChange={(e) => setAddMemberSelectedId(e.target.value)}
                        className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white"
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
                        onClick={handleAddMemberToGroup}
                        disabled={!addMemberSelectedId}
                        className="px-4 py-2 rounded-xl bg-purple-600 disabled:opacity-40 text-white text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Member items */}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {/* Creator / Self first */}
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
                        className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={
                              photo ||
                              `https://api.dicebear.com/7.x/shapes/svg?seed=${mId}`
                            }
                            alt={name}
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-purple-500/20"
                          />
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white block">
                              {name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {isGroupCreator ? (
                                <span className="text-amber-500 font-bold flex items-center gap-0.5">
                                  <Crown size={10} />
                                  <span>Creator & Admin</span>
                                </span>
                              ) : isGroupAdmin ? (
                                <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-0.5">
                                  <Shield size={10} />
                                  <span>Admin</span>
                                </span>
                              ) : (
                                <span className="text-gray-400">Member</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin Action Menu for other members */}
                        {isCurrentUserGroupAdmin && !isSelf && !isGroupCreator && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleAdminStatus(mId)}
                              className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-purple-100 text-gray-700 dark:text-gray-200"
                              title={isGroupAdmin ? 'Revoke Admin' : 'Make Admin'}
                            >
                              {isGroupAdmin ? 'Dismiss Admin' : 'Make Admin'}
                            </button>
                            <button
                              onClick={() => handleRemoveMemberFromGroup(mId)}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/40"
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
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                {isCurrentUserMember && (
                  <button
                    onClick={() => handleExitGroup(activeGroup)}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <LogOut size={14} />
                    <span>Exit Group</span>
                  </button>
                )}

                {isCurrentUserGroupAdmin && (
                  <button
                    onClick={handleDeleteGroup}
                    className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-rose-600 hover:text-white dark:bg-gray-800 dark:hover:bg-rose-700 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center justify-center gap-2 transition"
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
            console.log('🎉 Congratulations! You are now a Verified Blue Star member with direct administrator communication and full Pro privileges unlocked!');
          }}
        />
      )}
    </div>
  );
};
