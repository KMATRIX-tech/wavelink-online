import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
} from 'firebase/firestore';
import {
  db,
  cleanFirestoreData,
  getAuthHeaders,
} from '../firebase';
import { useAuth } from '../context/AuthContext';

function sanitizeUserText(raw: string, maxLen: number): string {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}
import {
  AdminUpdateItem,
  AdminUpdateType,
  AdminRoleDoc,
  UserProfile,
} from '../types';
import {
  getUpdateTypeMeta,
  formatAdminUpdateDateTime,
  upsertCachedAdminUpdate,
  removeCachedAdminUpdate,
} from '../services/adminUpdatesService';
import { migrateDataUrlImageToCloudinary } from '../utils/mediaStorage';
import { Avatar } from './Avatar';
import {
  Sparkles,
  Send,
  RefreshCw,
  Edit3,
  Trash2,
  Bookmark,
  Upload,
  X,
  Pin,
  Bell,
  ShieldCheck,
  UserPlus,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Globe,
  FileText,
  Users,
} from 'lucide-react';

interface AdminUpdateDraft {
  id: string;
  type: AdminUpdateType;
  roughNotes: string;
  title: string;
  message: string;
  messageSw: string;
  imageUrl?: string;
  pinned?: boolean;
  alsoSendPush?: boolean;
  savedAt: string;
}

const UPDATE_TYPES: { id: AdminUpdateType; label: string; emoji: string }[] = [
  { id: 'new_feature', label: 'New feature', emoji: '✨' },
  { id: 'improvement', label: 'Improvement', emoji: '⚡' },
  { id: 'bug_fix', label: 'Bug fix', emoji: '🛠️' },
  { id: 'maintenance', label: 'Maintenance', emoji: '🔧' },
  { id: 'announcement', label: 'Announcement', emoji: '📢' },
];

const DRAFTS_STORAGE_KEY_PREFIX = 'wavelink_admin_update_drafts_';

export const AdminUpdatesManager: React.FC = () => {
  const {
    currentUser,
    userProfile,
    isSuperAdmin,
    isSubAdmin,
    isAdmin,
    showGlobalToast,
    recordAdminAuditLog,
  } = useAuth();

  // Only admin and sub-admins can ever see or use this component
  if (!currentUser || !isAdmin) {
    return null;
  }

  const [activeSectionTab, setActiveSectionTab] = useState<'write' | 'subadmins'>('write');

  // Editor state
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [ editingOriginalCreatedAt, setEditingOriginalCreatedAt ] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AdminUpdateType>('new_feature');
  const [roughNotes, setRoughNotes] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [messageSw, setMessageSw] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pinned, setPinned] = useState(false);
  const [alsoSendPush, setAlsoSendPush] = useState(false);

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRemainingToday, setAiRemainingToday] = useState<number | null>(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<'en' | 'sw'>('en');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  // Drafts state
  const [drafts, setDrafts] = useState<AdminUpdateDraft[]>(() => {
    try {
      const raw = localStorage.getItem(`${DRAFTS_STORAGE_KEY_PREFIX}${currentUser.uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Past updates list (latest 20)
  const [pastUpdates, setPastUpdates] = useState<AdminUpdateItem[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [pastQuotaError, setPastQuotaError] = useState(false);
  const [confirmDeleteUpdate, setConfirmDeleteUpdate] = useState<AdminUpdateItem | null>(null);
  const [isDeletingUpdate, setIsDeletingUpdate] = useState(false);

  // Sub-admins management state (only used when isSuperAdmin is true)
  const [subAdmins, setSubAdmins] = useState<AdminRoleDoc[]>([]);
  const [isLoadingSubAdmins, setIsLoadingSubAdmins] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSavingRoleUid, setIsSavingRoleUid] = useState<string | null>(null);
  const [confirmRemoveSubAdmin, setConfirmRemoveSubAdmin] = useState<AdminRoleDoc | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraftsToStorage = (nextDrafts: AdminUpdateDraft[]) => {
    setDrafts(nextDrafts);
    try {
      localStorage.setItem(
        `${DRAFTS_STORAGE_KEY_PREFIX}${currentUser.uid}`,
        JSON.stringify(nextDrafts.slice(0, 15))
      );
    } catch {
      // ignore storage errors
    }
  };

  // Load past 20 updates once when entering the screen
  const loadPastUpdates = async () => {
    setIsLoadingPast(true);
    setPastQuotaError(false);
    try {
      const q = query(
        collection(db, 'adminUpdates'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const list: AdminUpdateItem[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!data.deleted) {
          list.push({
            id: d.id,
            title: String(data.title || ''),
            message: String(data.message || ''),
            messageSw: data.messageSw ? String(data.messageSw) : undefined,
            type: (data.type as AdminUpdateType) || 'announcement',
            imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
            authorUid: String(data.authorUid || ''),
            authorName: String(data.authorName || 'WaveLink Admin'),
            role: data.role === 'subadmin' ? 'subadmin' : 'admin',
            createdAt: String(data.createdAt || ''),
            updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
            pinned: Boolean(data.pinned),
            deleted: Boolean(data.deleted),
            alsoSendPush: Boolean(data.alsoSendPush),
          });
        }
      });
      setPastUpdates(list);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (String(err?.code || '').includes('resource-exhausted') || msg.includes('quota')) {
        setPastQuotaError(true);
      }
    } finally {
      setIsLoadingPast(false);
    }
  };

  useEffect(() => {
    loadPastUpdates();
  }, []);

  // Load current sub-admins when main admin opens the Sub-admins tab
  const loadSubAdminsList = async () => {
    if (!isSuperAdmin) return;
    setIsLoadingSubAdmins(true);
    try {
      const q = query(
        collection(db, 'roles'),
        where('role', '==', 'subadmin'),
        limit(25)
      );
      const snap = await getDocs(q);
      const items: AdminRoleDoc[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          role: 'subadmin',
          username: data.username ? String(data.username) : undefined,
          displayName: data.displayName ? String(data.displayName) : undefined,
          email: data.email ? String(data.email) : undefined,
          photoURL: data.photoURL ? String(data.photoURL) : undefined,
          assignedBy: data.assignedBy ? String(data.assignedBy) : undefined,
          updatedAt: String(data.updatedAt || ''),
        };
      });
      setSubAdmins(items);
    } catch (err) {
      console.warn('Sub-admins list load notice:', err);
    } finally {
      setIsLoadingSubAdmins(false);
    }
  };

  useEffect(() => {
    if (activeSectionTab === 'subadmins' && isSuperAdmin) {
      loadSubAdminsList();
    }
  }, [activeSectionTab, isSuperAdmin]);

  // Debounced username search for Sub-admins (queries ONLY after 2+ characters, max 10 results)
  useEffect(() => {
    if (!isSuperAdmin || activeSectionTab !== 'subadmins') return;
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const rawTrimmed = userSearchQuery.trim().replace(/^@+/, '').toLowerCase();
    if (rawTrimmed.length < 2) {
      setUserSearchResults([]);
      setIsSearchingUsers(false);
      return;
    }

    setIsSearchingUsers(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const prefixWithAt = `@${rawTrimmed}`;
        const qAt = query(
          collection(db, 'users'),
          where('username', '>=', prefixWithAt),
          where('username', '<=', `${prefixWithAt}\uf8ff`),
          limit(10)
        );
        const snap = await getDocs(qAt);
        const resultsMap = new Map<string, UserProfile>();
        snap.docs.forEach((d) => {
          const data = d.data() as UserProfile;
          if (d.id !== currentUser.uid && !data.isDuplicateDisabled) {
            resultsMap.set(d.id, { ...data, id: d.id });
          }
        });

        // If fewer than 10 matches, also check without leading '@'
        if (resultsMap.size < 5) {
          const qPlain = query(
            collection(db, 'users'),
            where('username', '>=', rawTrimmed),
            where('username', '<=', `${rawTrimmed}\uf8ff`),
            limit(10)
          );
          const snapPlain = await getDocs(qPlain);
          snapPlain.docs.forEach((d) => {
            if (resultsMap.size < 10 && d.id !== currentUser.uid) {
              const data = d.data() as UserProfile;
              if (!data.isDuplicateDisabled) {
                resultsMap.set(d.id, { ...data, id: d.id });
              }
            }
          });
        }

        setUserSearchResults(Array.from(resultsMap.values()).slice(0, 10));
      } catch (err) {
        console.warn('Sub-admin user search notice:', err);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 350);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [userSearchQuery, isSuperAdmin, activeSectionTab, currentUser.uid]);

  // AI Formal Announcement Generator (Server Function with ID Token & Role Check)
  const handleGenerateWithAi = async () => {
    const cleanRough = roughNotes.trim();
    if (!cleanRough) {
      setAiError('Type a few rough words first (for example: "added new chat inbox, fixed call bug").');
      return;
    }

    setIsAiGenerating(true);
    setAiError(null);

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/admin-updates/rewrite', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          roughNotes: cleanRough,
          type: selectedType,
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.success) {
        setAiError(
          data?.error ||
            'AI rewrite is temporarily unavailable. You can type or edit the formal announcement below and post it directly.'
        );
        if (!title.trim()) {
          setTitle(cleanRough.slice(0, 60));
        }
        if (!message.trim()) {
          setMessage(cleanRough);
        }
        setIsEditingPreview(true);
        return;
      }

      setTitle(String(data.title || '').slice(0, 60));
      setMessage(String(data.message || ''));
      setMessageSw(String(data.messageSw || ''));
      if (typeof data.remainingToday === 'number') {
        setAiRemainingToday(data.remainingToday);
      }
      if (data.notice) {
        showGlobalToast(data.notice);
      } else {
        showGlobalToast('Formal announcement ready! Review or edit the preview card below before posting.');
      }
    } catch {
      setAiError(
        'Could not reach the AI service right now. You can type or edit your announcement manually below and post it.'
      );
      if (!title.trim()) {
        setTitle(cleanRough.slice(0, 60));
      }
      if (!message.trim()) {
        setMessage(cleanRough);
      }
      setIsEditingPreview(true);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Optional Image Attachment (compressed to max 1200px)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showGlobalToast('Please select an image file (JPG, PNG, or WebP).');
      return;
    }

    setIsUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });

      const uploadedHttpsUrl = await migrateDataUrlImageToCloudinary(dataUrl, {
        maxWidth: 1200,
        maxHeight: 1200,
        targetMaxBytes: 360 * 1024,
      });

      setImageUrl(uploadedHttpsUrl);
      showGlobalToast('Image compressed (max 1200px) and attached.');
    } catch (err: any) {
      showGlobalToast(err?.message || 'Could not upload image. Please try another photo.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resetEditor = () => {
    setEditingUpdateId(null);
    setEditingOriginalCreatedAt(null);
    setSelectedType('new_feature');
    setRoughNotes('');
    setTitle('');
    setMessage('');
    setMessageSw('');
    setImageUrl('');
    setPinned(false);
    setAlsoSendPush(false);
    setIsEditingPreview(false);
    setAiError(null);
  };

  const handleSaveDraft = () => {
    if (!roughNotes.trim() && !title.trim() && !message.trim()) {
      showGlobalToast('Write a few words or generate a preview before saving a draft.');
      return;
    }
    const draftItem: AdminUpdateDraft = {
      id: `draft_${Date.now()}`,
      type: selectedType,
      roughNotes: roughNotes.trim(),
      title: title.trim().slice(0, 60),
      message: message.trim(),
      messageSw: messageSw.trim(),
      imageUrl: imageUrl || undefined,
      pinned,
      alsoSendPush,
      savedAt: new Date().toISOString(),
    };
    saveDraftsToStorage([draftItem, ...drafts]);
    showGlobalToast('Saved to drafts.');
  };

  const handleLoadDraft = (d: AdminUpdateDraft) => {
    setEditingUpdateId(null);
    setEditingOriginalCreatedAt(null);
    setSelectedType(d.type);
    setRoughNotes(d.roughNotes);
    setTitle(d.title);
    setMessage(d.message);
    setMessageSw(d.messageSw || '');
    setImageUrl(d.imageUrl || '');
    setPinned(Boolean(d.pinned));
    setAlsoSendPush(Boolean(d.alsoSendPush));
    showGlobalToast('Draft loaded into editor.');
  };

  const handleDeleteDraft = (draftId: string) => {
    saveDraftsToStorage(drafts.filter((d) => d.id !== draftId));
  };

  // Post or Update an Admin Update in Firestore /adminUpdates/{updateId}
  const handlePostUpdate = async () => {
    const cleanTitle = sanitizeUserText(title.trim(), 60);
    const cleanMessage = sanitizeUserText(message.trim(), 3000);
    const cleanMessageSw = messageSw.trim()
      ? sanitizeUserText(messageSw.trim(), 3000)
      : undefined;

    if (!cleanTitle) {
      showGlobalToast('Please enter a short title (max 60 characters).');
      setIsEditingPreview(true);
      titleInputRef.current?.focus();
      return;
    }
    if (!cleanMessage) {
      showGlobalToast('Please enter the announcement message before posting.');
      setIsEditingPreview(true);
      return;
    }

    setIsPosting(true);
    try {
      const nowIso = new Date().toISOString();
      const updateId =
        editingUpdateId || `upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const existingItem = editingUpdateId
        ? pastUpdates.find((u) => u.id === editingUpdateId)
        : null;

      const callerRole: 'admin' | 'subadmin' = isSuperAdmin ? 'admin' : 'subadmin';
      const authorUid = existingItem ? existingItem.authorUid : currentUser.uid;
      const authorName = existingItem
        ? existingItem.authorName
        : sanitizeUserText(
            userProfile?.displayName || currentUser.displayName || 'WaveLink Admin',
            100
          );
      const roleToStore: 'admin' | 'subadmin' =
        existingItem && isSuperAdmin && existingItem.authorUid !== currentUser.uid
          ? existingItem.role
          : callerRole;

      const createdAtToStore =
        editingOriginalCreatedAt || existingItem?.createdAt || nowIso;

      const updatePayload: AdminUpdateItem = {
        id: updateId,
        title: cleanTitle,
        message: cleanMessage,
        ...(cleanMessageSw ? { messageSw: cleanMessageSw } : {}),
        type: selectedType,
        ...(imageUrl ? { imageUrl } : {}),
        authorUid,
        authorName,
        role: roleToStore,
        createdAt: createdAtToStore,
        updatedAt: nowIso,
        pinned: Boolean(pinned),
        deleted: false,
        alsoSendPush: Boolean(alsoSendPush),
      };

      await setDoc(
        doc(db, 'adminUpdates', updateId),
        cleanFirestoreData(updatePayload)
      );

      // Update in-memory cache immediately and trigger in-app toast near the blue sparkle button
      upsertCachedAdminUpdate(updatePayload, !editingUpdateId);

      setPastUpdates((prev) => {
        const withoutCurrent = prev.filter((u) => u.id !== updateId);
        return [updatePayload, ...withoutCurrent].slice(0, 20);
      });

      await recordAdminAuditLog({
        action: editingUpdateId ? 'admin_updates_edit' : 'admin_updates_post',
        targetId: updateId,
        targetLabel: cleanTitle,
        details: `${editingUpdateId ? 'Edited' : 'Posted'} Admin Update (${selectedType}): "${cleanTitle}"`,
      });

      resetEditor();
      showGlobalToast(
        editingUpdateId
          ? 'Announcement updated!'
          : 'Announcement posted! Every user can now see it inside the WaveLink Assistant.'
      );
    } catch (err: any) {
      console.error('Failed to post admin update:', err);
      showGlobalToast(
        err?.message || 'Could not post announcement. Please check your connection and permissions.'
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleStartEditPastUpdate = (item: AdminUpdateItem) => {
    const canModify = isSuperAdmin || (isSubAdmin && item.authorUid === currentUser.uid);
    if (!canModify) {
      showGlobalToast('Sub-admins can only edit their own updates.');
      return;
    }
    setEditingUpdateId(item.id);
    setEditingOriginalCreatedAt(item.createdAt);
    setSelectedType(item.type);
    setTitle(item.title);
    setMessage(item.message);
    setMessageSw(item.messageSw || '');
    setImageUrl(item.imageUrl || '');
    setPinned(Boolean(item.pinned));
    setAlsoSendPush(Boolean(item.alsoSendPush));
    setIsEditingPreview(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmDeletePastUpdate = async () => {
    if (!confirmDeleteUpdate) return;
    const item = confirmDeleteUpdate;
    const canDelete = isSuperAdmin || (isSubAdmin && item.authorUid === currentUser.uid);
    if (!canDelete) {
      showGlobalToast('Sub-admins can only delete their own updates.');
      setConfirmDeleteUpdate(null);
      return;
    }

    setIsDeletingUpdate(true);
    try {
      await deleteDoc(doc(db, 'adminUpdates', item.id));
      removeCachedAdminUpdate(item.id);
      setPastUpdates((prev) => prev.filter((u) => u.id !== item.id));

      await recordAdminAuditLog({
        action: 'admin_updates_delete',
        targetId: item.id,
        targetLabel: item.title,
        details: `Deleted Admin Update: "${item.title}"`,
      });

      if (editingUpdateId === item.id) {
        resetEditor();
      }
      setConfirmDeleteUpdate(null);
      showGlobalToast('Update deleted.');
    } catch (err: any) {
      showGlobalToast(err?.message || 'Could not delete update.');
    } finally {
      setIsDeletingUpdate(false);
    }
  };

  // Sub-Admin Add / Remove handlers (strictly main admin only)
  const handleAddSubAdmin = async (targetUser: UserProfile) => {
    if (!isSuperAdmin || !targetUser.id) return;
    setIsSavingRoleUid(targetUser.id);
    try {
      const nowIso = new Date().toISOString();
      const roleDoc: AdminRoleDoc = {
        uid: targetUser.id,
        role: 'subadmin',
        username: targetUser.username || `@user`,
        displayName: targetUser.displayName || 'WaveLink Member',
        email: targetUser.email || '',
        photoURL:
          targetUser.photoURL && targetUser.photoURL.startsWith('https://')
            ? targetUser.photoURL
            : undefined,
        assignedBy: currentUser.uid,
        updatedAt: nowIso,
      };

      // 1. Write protected /roles/{uid} document (enforced by Firestore rules: only main admin can write)
      await setDoc(doc(db, 'roles', targetUser.id), cleanFirestoreData(roleDoc));

      // 2. Sync with server role endpoint so custom claims / server session reflect sub-admin status
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/admin/role', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            targetUserId: targetUser.id,
            targetEmail: targetUser.email,
            role: 'sub_admin',
            makeSubAdmin: true,
          }),
        });
      } catch {
        // non-fatal; /roles/{uid} is authoritative in Firestore rules & server
      }

      await recordAdminAuditLog({
        action: 'subadmin_add',
        targetId: targetUser.id,
        targetLabel: targetUser.username || targetUser.displayName,
        details: `Added ${targetUser.displayName} (${targetUser.username || targetUser.id}) as Sub-admin`,
      });

      setSubAdmins((prev) => [
        roleDoc,
        ...prev.filter((r) => r.uid !== targetUser.id),
      ]);
      showGlobalToast(`${targetUser.displayName} is now a Sub-admin.`);
    } catch (err: any) {
      showGlobalToast(err?.message || 'Failed to add Sub-admin.');
    } finally {
      setIsSavingRoleUid(null);
    }
  };

  const handleConfirmRemoveSubAdmin = async () => {
    if (!isSuperAdmin || !confirmRemoveSubAdmin) return;
    const target = confirmRemoveSubAdmin;
    setIsSavingRoleUid(target.uid);
    try {
      // 1. Delete /roles/{uid} document
      await deleteDoc(doc(db, 'roles', target.uid));

      // 2. Revoke sub-admin on server endpoint
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/admin/role', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            targetUserId: target.uid,
            targetEmail: target.email,
            role: 'user',
            makeSubAdmin: false,
          }),
        });
      } catch {
        // non-fatal
      }

      await recordAdminAuditLog({
        action: 'subadmin_remove',
        targetId: target.uid,
        targetLabel: target.username || target.displayName || target.uid,
        details: `Removed Sub-admin role from ${target.displayName || target.uid}`,
      });

      setSubAdmins((prev) => prev.filter((r) => r.uid !== target.uid));
      setConfirmRemoveSubAdmin(null);
      showGlobalToast(`Removed ${target.displayName || 'user'} from Sub-admins.`);
    } catch (err: any) {
      showGlobalToast(err?.message || 'Failed to remove Sub-admin.');
    } finally {
      setIsSavingRoleUid(null);
    }
  };

  const previewMeta = getUpdateTypeMeta(selectedType);
  const hasPreviewContent = Boolean(title.trim() || message.trim() || isEditingPreview);

  return (
    <div className="space-y-6">
      {/* Top Banner & Internal Switcher (Write Updates vs Sub-admins) */}
      <div
        className="rounded-3xl p-5 sm:p-6 border shadow-xs"
        style={{
          background: 'var(--bg-surface, #FFFFFF)',
          borderColor: 'var(--border-hairline, #EFECE6)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-sm shrink-0">
              <Bell size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-extrabold text-[var(--text-primary,#1C1917)]">
                  Admin Updates
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[var(--accent-primary,#2563EB)]/15 text-[var(--accent-primary,#2563EB)] border border-[var(--accent-primary,#2563EB)]/30">
                  <ShieldCheck size={12} />
                  <span>{isSuperAdmin ? 'Main Admin' : 'Sub-admin'}</span>
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary,#78716C)] mt-1">
                Type a few rough words, let AI polish them into a formal announcement, and publish directly to the WaveLink Assistant for every user.
              </p>
            </div>
          </div>

          {/* Sub-admins tab is ONLY visible to main admin (isSuperAdmin) */}
          {isSuperAdmin && (
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] shrink-0">
              <button
                type="button"
                onClick={() => setActiveSectionTab('write')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeSectionTab === 'write'
                    ? 'bg-[var(--accent-primary,#2563EB)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)]'
                }`}
              >
                <FileText size={14} />
                <span>Write Update</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionTab('subadmins')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeSectionTab === 'subadmins'
                    ? 'bg-[var(--accent-primary,#2563EB)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)]'
                }`}
              >
                <Users size={14} />
                <span>Sub-admins</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* TAB 1: WRITE & MANAGE UPDATES (Admin + Sub-admins)               */}
      {/* ================================================================ */}
      {activeSectionTab === 'write' && (
        <div className="space-y-6">
          {/* Saved Drafts Bar (if any exist) */}
          {drafts.length > 0 && (
            <div
              className="rounded-3xl p-4 border space-y-2.5"
              style={{
                background: 'var(--bg-surface, #FFFFFF)',
                borderColor: 'var(--border-hairline, #EFECE6)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1.5">
                  <Bookmark size={14} className="text-[var(--accent-primary,#2563EB)]" />
                  <span>Saved Drafts ({drafts.length})</span>
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="shrink-0 max-w-[230px] p-2.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadDraft(d)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-xs font-extrabold text-[var(--text-primary,#1C1917)] truncate">
                        {d.title || d.roughNotes || 'Untitled draft'}
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary,#78716C)] truncate">
                        {formatAdminUpdateDateTime(d.savedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      className="p-1 text-[var(--text-secondary,#78716C)] hover:text-rose-500 transition shrink-0"
                      title="Delete draft"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 1: COMPOSER CARD */}
          <div
            className="rounded-3xl p-5 sm:p-6 border shadow-xs space-y-5"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            {editingUpdateId && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-amber-600">
                  Editing existing announcement — save changes below or cancel.
                </span>
                <button
                  type="button"
                  onClick={resetEditor}
                  className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-700 text-xs font-extrabold"
                >
                  Cancel Edit
                </button>
              </div>
            )}

            {/* 1. Type Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary,#78716C)]">
                1. Update Type
              </label>
              <div className="flex flex-wrap gap-2">
                {UPDATE_TYPES.map((t) => {
                  const isSelected = selectedType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.id)}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 border transition ${
                        isSelected
                          ? 'bg-[var(--accent-primary,#2563EB)] text-white border-[var(--accent-primary,#2563EB)] shadow-xs'
                          : 'bg-[var(--bg-canvas,#FAF7F2)] text-[var(--text-primary,#1C1917)] border-[var(--border-hairline,#EFECE6)] hover:opacity-90'
                      }`}
                    >
                      <span>{t.emoji}</span>
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Rough Words Text Box (max 500 characters) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary,#78716C)]">
                  2. Rough Notes (What changed?)
                </label>
                <span
                  className={`text-[11px] font-bold ${
                    roughNotes.length >= 480
                      ? 'text-rose-500'
                      : 'text-[var(--text-secondary,#78716C)]'
                  }`}
                >
                  {roughNotes.length} / 500
                </span>
              </div>
              <textarea
                value={roughNotes}
                onChange={(e) => setRoughNotes(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                placeholder='Example: "added new chat inbox, fixed call bug"'
                className="w-full rounded-2xl p-3.5 text-sm bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-[var(--text-primary,#1C1917)] placeholder:text-[var(--text-secondary,#78716C)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)] resize-none"
              />
            </div>

            {/* Optional Image Attachment + Toggles */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="px-3.5 py-2 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] hover:opacity-90 border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-[var(--accent-primary,#2563EB)]" />
                      <span>Compressing...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} className="text-[var(--accent-primary,#2563EB)]" />
                      <span>{imageUrl ? 'Replace image' : 'Attach image (max 1200px)'}</span>
                    </>
                  )}
                </button>

                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="px-2.5 py-2 rounded-2xl bg-rose-500/10 text-rose-500 text-xs font-extrabold flex items-center gap-1"
                  >
                    <X size={13} />
                    <span>Remove image</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--text-primary,#1C1917)]">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="rounded border-stone-300 text-[var(--accent-primary,#2563EB)] focus:ring-[var(--accent-primary,#2563EB)]"
                  />
                  <span>Pin to top</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--text-primary,#1C1917)]">
                  <input
                    type="checkbox"
                    checked={alsoSendPush}
                    onChange={(e) => setAlsoSendPush(e.target.checked)}
                    className="rounded border-stone-300 text-[var(--accent-primary,#2563EB)] focus:ring-[var(--accent-primary,#2563EB)]"
                  />
                  <span>Also send push notification</span>
                </label>
              </div>
            </div>

            {/* 3. Big "Make it formal with AI" Button */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <button
                type="button"
                onClick={handleGenerateWithAi}
                disabled={isAiGenerating || !roughNotes.trim()}
                className="flex-1 min-h-[48px] py-3 px-5 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 disabled:opacity-45 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-[0.99] cursor-pointer"
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Polishing announcement with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Make it formal with AI</span>
                  </>
                )}
              </button>

              {!hasPreviewContent && (
                <button
                  type="button"
                  onClick={() => {
                    if (!title.trim() && roughNotes.trim()) {
                      setTitle(roughNotes.trim().slice(0, 60));
                    }
                    if (!message.trim() && roughNotes.trim()) {
                      setMessage(roughNotes.trim());
                    }
                    setIsEditingPreview(true);
                  }}
                  className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] hover:opacity-90 transition"
                >
                  Write manually
                </button>
              )}
            </div>

            {aiRemainingToday !== null && (
              <p className="text-[11px] text-[var(--text-secondary,#78716C)]">
                AI formal rewrites remaining today: <strong>{aiRemainingToday}</strong> / 20
              </p>
            )}

            {aiError && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-[var(--text-primary,#1C1917)] flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}
          </div>

          {/* STEP 2: LIVE EDITABLE NOTIFICATION CARD PREVIEW */}
          {hasPreviewContent && (
            <div
              className="rounded-3xl p-5 sm:p-6 border shadow-xs space-y-5"
              style={{
                background: 'var(--bg-surface, #FFFFFF)',
                borderColor: 'var(--border-hairline, #EFECE6)',
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                    Live Notification Card Preview
                  </h4>
                  <p className="text-xs text-[var(--text-secondary,#78716C)]">
                    This is the exact card every user will see inside the WaveLink Assistant. You can edit any field before posting.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewLang((l) => (l === 'en' ? 'sw' : 'en'))}
                    className="px-3 py-1.5 rounded-xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1.5"
                  >
                    <Globe size={13} />
                    <span>Preview: {previewLang === 'en' ? 'English' : 'Kiswahili'}</span>
                  </button>
                </div>
              </div>

              {/* Editable Fields when Edit mode is toggled (or always accessible) */}
              {isEditingPreview && (
                <div className="p-4 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] space-y-3.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-extrabold text-[var(--text-secondary,#78716C)]">
                        Title (max 60 characters)
                      </label>
                      <span className="text-[11px] font-bold text-[var(--text-secondary,#78716C)]">
                        {title.length} / 60
                      </span>
                    </div>
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={title}
                      maxLength={60}
                      onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                      placeholder="Short, clear announcement title"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface,#FFFFFF)] border border-[var(--border-hairline,#EFECE6)] text-sm font-bold text-[var(--text-primary,#1C1917)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-[var(--text-secondary,#78716C)] mb-1">
                      Formal Announcement (English)
                    </label>
                    <textarea
                      value={message}
                      rows={3}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Clear formal announcement (2-4 short sentences)"
                      className="w-full p-3.5 rounded-xl bg-[var(--bg-surface,#FFFFFF)] border border-[var(--border-hairline,#EFECE6)] text-sm text-[var(--text-primary,#1C1917)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)] resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-[var(--text-secondary,#78716C)] mb-1">
                      Swahili Version (Kiswahili — Optional)
                    </label>
                    <textarea
                      value={messageSw}
                      rows={3}
                      onChange={(e) => setMessageSw(e.target.value)}
                      placeholder="Tafsiri ya Kiswahili (hiari)"
                      className="w-full p-3.5 rounded-xl bg-[var(--bg-surface,#FFFFFF)] border border-[var(--border-hairline,#EFECE6)] text-sm text-[var(--text-primary,#1C1917)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)] resize-none"
                    />
                  </div>
                </div>
              )}

              {/* The Real Notification Card Visual Preview */}
              <article
                className="rounded-3xl p-5 border transition-all relative overflow-hidden"
                style={{
                  background: 'var(--bg-surface, rgba(255, 255, 255, 0.94))',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)',
                  borderColor: 'var(--accent-primary, #2563EB)',
                  boxShadow: '0 12px 32px -10px rgba(37, 99, 235, 0.22)',
                }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border"
                      style={{
                        borderColor: previewMeta.borderColor,
                        background: previewMeta.glowColor,
                        color: 'var(--text-primary, #1C1917)',
                      }}
                    >
                      <span>{previewMeta.emoji}</span>
                      <span>
                        {previewLang === 'sw' ? previewMeta.labelSw : previewMeta.label}
                      </span>
                    </span>
                    {pinned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                        <Pin size={10} />
                        <span>Pinned</span>
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--accent-primary,#2563EB)] text-white">
                    New
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-primary,#1C1917)] leading-snug break-words">
                  {title.trim() || 'Untitled Update'}
                </h3>

                <p className="mt-2 text-xs sm:text-sm text-[var(--text-primary,#1C1917)] opacity-90 leading-relaxed whitespace-pre-wrap break-words">
                  {previewLang === 'sw' && messageSw.trim()
                    ? messageSw
                    : message.trim() || 'Your polished announcement message will appear here.'}
                </p>

                {imageUrl && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-[var(--border-hairline,#EFECE6)] bg-black/5">
                    <img
                      src={imageUrl}
                      alt="Update attachment preview"
                      className="w-full max-h-64 object-cover"
                    />
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[var(--text-primary,#1C1917)]">
                      {userProfile?.displayName || currentUser.displayName || 'WaveLink Admin'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isSuperAdmin
                          ? 'bg-[var(--accent-primary,#2563EB)]/15 text-[var(--accent-primary,#2563EB)] border border-[var(--accent-primary,#2563EB)]/30'
                          : 'bg-teal-500/15 text-teal-600 border border-teal-500/30'
                      }`}
                    >
                      <ShieldCheck size={10} />
                      <span>{isSuperAdmin ? 'Admin' : 'Team'}</span>
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary,#78716C)]">
                      • Today, Just now
                    </span>
                  </div>
                </div>
              </article>

              {/* Action Buttons: Regenerate, Edit, Save as draft, Post */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateWithAi}
                    disabled={isAiGenerating || !roughNotes.trim()}
                    className="min-h-[42px] px-4 py-2 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] hover:opacity-90 border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1.5 transition disabled:opacity-45"
                  >
                    <RefreshCw size={14} className={isAiGenerating ? 'animate-spin' : ''} />
                    <span>Regenerate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEditingPreview((prev) => !prev)}
                    className={`min-h-[42px] px-4 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-1.5 transition ${
                      isEditingPreview
                        ? 'bg-[var(--accent-primary,#2563EB)]/15 text-[var(--accent-primary,#2563EB)] border-[var(--accent-primary,#2563EB)]/40'
                        : 'bg-[var(--bg-canvas,#FAF7F2)] text-[var(--text-primary,#1C1917)] border-[var(--border-hairline,#EFECE6)]'
                    }`}
                  >
                    <Edit3 size={14} />
                    <span>{isEditingPreview ? 'Done Editing' : 'Edit'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="min-h-[42px] px-4 py-2 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] hover:opacity-90 border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1.5 transition"
                  >
                    <Bookmark size={14} />
                    <span>Save as draft</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePostUpdate}
                  disabled={isPosting || !title.trim() || !message.trim()}
                  className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 disabled:opacity-45 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  {isPosting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{editingUpdateId ? 'Saving...' : 'Posting...'}</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>{editingUpdateId ? 'Save Changes' : 'Post'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PAST UPDATES LIST (Latest 20 with Edit & Delete) */}
          <div
            className="rounded-3xl p-5 sm:p-6 border shadow-xs space-y-4"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                  Past Updates (Latest 20)
                </h4>
                <p className="text-xs text-[var(--text-secondary,#78716C)]">
                  {isSuperAdmin
                    ? 'As Main Admin, you can edit or delete any update.'
                    : 'As Sub-admin, you can edit or delete updates you posted.'}
                </p>
              </div>
              <button
                type="button"
                onClick={loadPastUpdates}
                disabled={isLoadingPast}
                className="p-2 rounded-xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] transition"
                title="Refresh list"
              >
                <RefreshCw size={14} className={isLoadingPast ? 'animate-spin' : ''} />
              </button>
            </div>

            {pastQuotaError && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--text-primary,#1C1917)]">
                  Firestore read quota temporarily reached.
                </span>
                <button
                  type="button"
                  onClick={loadPastUpdates}
                  className="px-3.5 py-1.5 rounded-xl bg-[var(--accent-primary,#2563EB)] text-white text-xs font-extrabold"
                >
                  Retry
                </button>
              </div>
            )}

            {isLoadingPast && pastUpdates.length === 0 ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs font-bold text-[var(--text-secondary,#78716C)]">
                <Loader2 size={18} className="animate-spin text-[var(--accent-primary,#2563EB)]" />
                <span>Loading past updates...</span>
              </div>
            ) : pastUpdates.length === 0 ? (
              <div className="py-8 text-center text-xs font-bold text-[var(--text-secondary,#78716C)]">
                No updates posted yet.
              </div>
            ) : (
              <div className="space-y-3">
                {pastUpdates.map((item) => {
                  const meta = getUpdateTypeMeta(item.type);
                  const canModify =
                    isSuperAdmin || (isSubAdmin && item.authorUid === currentUser.uid);

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-[var(--bg-surface,#FFFFFF)] border border-[var(--border-hairline,#EFECE6)] text-[var(--text-primary,#1C1917)]">
                            {meta.emoji} {meta.label}
                          </span>
                          {item.pinned && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                              Pinned
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-[var(--text-secondary,#78716C)]">
                            {formatAdminUpdateDateTime(item.createdAt)}
                          </span>
                          <span className="text-[11px] font-bold text-[var(--text-secondary,#78716C)]">
                            • by {item.authorName} ({item.role === 'admin' ? 'Admin' : 'Team'})
                          </span>
                        </div>
                        <p className="text-sm font-extrabold text-[var(--text-primary,#1C1917)] truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-[var(--text-secondary,#78716C)] line-clamp-2">
                          {item.message}
                        </p>
                      </div>

                      {canModify && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditPastUpdate(item)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface,#FFFFFF)] hover:opacity-90 border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)] flex items-center gap-1"
                          >
                            <Edit3 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUpdate(item)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 text-xs font-extrabold flex items-center gap-1"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: SUB-ADMINS MANAGEMENT (Strictly Main Admin Only)          */}
      {/* ================================================================ */}
      {activeSectionTab === 'subadmins' && isSuperAdmin && (
        <div className="space-y-6">
          {/* Search User by Username (2+ characters, max 10 results) */}
          <div
            className="rounded-3xl p-5 sm:p-6 border shadow-xs space-y-4"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            <div>
              <h4 className="text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                Add a Sub-admin
              </h4>
              <p className="text-xs text-[var(--text-secondary,#78716C)] mt-0.5">
                Search by username (minimum 2 characters, max 10 results). Sub-admins can create and delete their own updates, but cannot manage roles.
              </p>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary,#78716C)]"
              />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search username (e.g. @amina)..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-sm text-[var(--text-primary,#1C1917)] placeholder:text-[var(--text-secondary,#78716C)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)]"
              />
            </div>

            {userSearchQuery.trim().replace(/^@+/, '').length === 1 && (
              <p className="text-xs text-[var(--text-secondary,#78716C)]">
                Type at least 2 characters to search users.
              </p>
            )}

            {isSearchingUsers && (
              <div className="py-4 flex items-center gap-2 text-xs font-bold text-[var(--text-secondary,#78716C)]">
                <Loader2 size={15} className="animate-spin text-[var(--accent-primary,#2563EB)]" />
                <span>Searching users...</span>
              </div>
            )}

            {!isSearchingUsers &&
              userSearchQuery.trim().replace(/^@+/, '').length >= 2 &&
              userSearchResults.length === 0 && (
                <p className="text-xs text-[var(--text-secondary,#78716C)] py-2">
                  No matching users found.
                </p>
              )}

            {userSearchResults.length > 0 && (
              <div className="space-y-2">
                {userSearchResults.map((u) => {
                  const alreadySubAdmin = subAdmins.some((s) => s.uid === u.id);
                  const isBusy = isSavingRoleUid === u.id;

                  return (
                    <div
                      key={u.id}
                      className="p-3 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          uid={u.id}
                          src={u.photoURL}
                          alt={u.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[var(--text-primary,#1C1917)] truncate">
                            {u.displayName}
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary,#78716C)] truncate">
                            {u.username}
                          </p>
                        </div>
                      </div>

                      {alreadySubAdmin ? (
                        <span className="px-3 py-1.5 rounded-xl bg-teal-500/15 text-teal-600 text-xs font-extrabold flex items-center gap-1 shrink-0">
                          <CheckCircle2 size={13} />
                          <span>Sub-admin</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddSubAdmin(u)}
                          disabled={isBusy}
                          className="px-3.5 py-1.5 rounded-xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <UserPlus size={13} />
                          )}
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Sub-admins List */}
          <div
            className="rounded-3xl p-5 sm:p-6 border shadow-xs space-y-4"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                  Current Sub-admins ({subAdmins.length})
                </h4>
                <p className="text-xs text-[var(--text-secondary,#78716C)]">
                  Stored securely in /roles/&#123;uid&#125; and enforced by Firestore rules.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSubAdminsList}
                disabled={isLoadingSubAdmins}
                className="p-2 rounded-xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-[var(--text-secondary,#78716C)]"
              >
                <RefreshCw size={14} className={isLoadingSubAdmins ? 'animate-spin' : ''} />
              </button>
            </div>

            {isLoadingSubAdmins && subAdmins.length === 0 ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs font-bold text-[var(--text-secondary,#78716C)]">
                <Loader2 size={16} className="animate-spin text-[var(--accent-primary,#2563EB)]" />
                <span>Loading Sub-admins...</span>
              </div>
            ) : subAdmins.length === 0 ? (
              <div className="py-6 text-center text-xs font-bold text-[var(--text-secondary,#78716C)]">
                No sub-admins added yet. Use the search box above to add trusted team members.
              </div>
            ) : (
              <div className="space-y-2.5">
                {subAdmins.map((sa) => (
                  <div
                    key={sa.uid}
                    className="p-3.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        uid={sa.uid}
                        src={sa.photoURL}
                        alt={sa.displayName || sa.username || 'Sub-admin'}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-extrabold text-[var(--text-primary,#1C1917)] truncate">
                            {sa.displayName || 'WaveLink Sub-admin'}
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-500/15 text-teal-600 border border-teal-500/30">
                            Team
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary,#78716C)] truncate">
                          {sa.username || sa.uid}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmRemoveSubAdmin(sa)}
                      disabled={isSavingRoleUid === sa.uid}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 text-xs font-extrabold shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Update */}
      {confirmDeleteUpdate && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            <h4 className="text-base font-extrabold text-[var(--text-primary,#1C1917)]">
              Delete this announcement?
            </h4>
            <p className="text-xs text-[var(--text-secondary,#78716C)]">
              "{confirmDeleteUpdate.title}" will be permanently removed from Admin Updates for all users.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUpdate(null)}
                disabled={isDeletingUpdate}
                className="px-4 py-2 rounded-xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePastUpdate}
                disabled={isDeletingUpdate}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold flex items-center gap-1.5"
              >
                {isDeletingUpdate && <Loader2 size={13} className="animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Remove Sub-admin */}
      {confirmRemoveSubAdmin && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4"
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              borderColor: 'var(--border-hairline, #EFECE6)',
            }}
          >
            <h4 className="text-base font-extrabold text-[var(--text-primary,#1C1917)]">
              Remove Sub-admin?
            </h4>
            <p className="text-xs text-[var(--text-secondary,#78716C)]">
              Are you sure you want to remove{' '}
              <strong>{confirmRemoveSubAdmin.displayName || confirmRemoveSubAdmin.username}</strong>{' '}
              from Sub-admins? They will no longer be able to post Admin Updates.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveSubAdmin(null)}
                disabled={Boolean(isSavingRoleUid)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-xs font-extrabold text-[var(--text-primary,#1C1917)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveSubAdmin}
                disabled={Boolean(isSavingRoleUid)}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold flex items-center gap-1.5"
              >
                {isSavingRoleUid && <Loader2 size={13} className="animate-spin" />}
                <span>Remove Sub-admin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
