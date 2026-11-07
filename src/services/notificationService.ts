import { db, auth, cleanFirestoreData, getAuthHeaders } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import {
  AppNotification,
  NotificationType,
  UserFollow,
  UserNotificationSettings
} from '../types';
import { DEFAULT_NOTIFICATION_SETTINGS } from './fcmService';

export interface SendNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string;
  actorId?: string;
  actorName?: string;
  actorUsername?: string;
  actorPhotoURL?: string;
  actorAvatar?: string;
  actionUrl?: string;
}

/**
 * Formats a short, privacy-safe preview for message notifications so full private message
 * content is never exposed in notifications, and hides the preview completely if the
 * recipient disabled `showMessagePreviews`.
 */
export function buildShortMessagePreview(
  rawBody: string,
  showMessagePreviews: boolean = true
): string {
  if (!showMessagePreviews) {
    return 'Sent you a new message';
  }
  const cleaned = (rawBody || '')
    .replace(/\s+/g, ' ')
    .replace(/^.*sent you a (private )?message:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!cleaned) return 'Sent you a new message';
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}…` : cleaned;
}

/**
 * Dispatches an in-app notification to Firestore AND triggers a server-only FCM push
 * notification via `/api/notifications/send-push` (which uses the Firebase Admin SDK
 * and enforces the recipient's master switch, per-category toggles, quiet hours, and
 * message preview privacy settings).
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const currentAuthUser = auth.currentUser;
  const actorId = params.actorId || currentAuthUser?.uid || 'system';

  // Do not send notifications to oneself
  if (!params.recipientId || params.recipientId === actorId) {
    return;
  }

  try {
    // Load recipient's notification settings from their public user profile if available
    let recipientSettings: UserNotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
    try {
      const recipSnap = await getDoc(doc(db, 'users', params.recipientId));
      if (recipSnap.exists()) {
        const data = recipSnap.data();
        if (data?.notificationSettings) {
          recipientSettings = {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...data.notificationSettings
          };
        }
      }
    } catch {
      // fallback to default settings if offline
    }

    const actorName = params.actorName || currentAuthUser?.displayName || 'A Waver';
    const isMessageNotif = params.type === 'message';
    const safeBody = isMessageNotif
      ? buildShortMessagePreview(params.body, recipientSettings.showMessagePreviews !== false)
      : params.body;
    const safeTitle =
      isMessageNotif && recipientSettings.showMessagePreviews === false
        ? `New message from ${actorName}`
        : params.title;

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notification: AppNotification = {
      id: notifId,
      recipientId: params.recipientId,
      actorId,
      actorName,
      actorUsername:
        params.actorUsername ||
        (currentAuthUser?.email ? `@${currentAuthUser.email.split('@')[0]}` : undefined),
      actorPhotoURL:
        params.actorPhotoURL || params.actorAvatar || currentAuthUser?.photoURL || undefined,
      type: params.type,
      title: safeTitle,
      body: safeBody,
      entityId: params.entityId,
      read: false,
      createdAt: new Date().toISOString()
    };

    const sanitized = cleanFirestoreData(notification);
    await setDoc(doc(db, 'notifications', notifId), sanitized);

    // Trigger server-only push notification via Firebase Admin SDK
    const headers = await getAuthHeaders();
    fetch('/api/notifications/send-push', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        recipientId: params.recipientId,
        actorId,
        actorName,
        type: params.type,
        title: safeTitle,
        body: safeBody,
        entityId: params.entityId || '',
        recipientSettings
      })
    }).catch((pushErr) => {
      console.warn('Server push dispatch notice (non-fatal):', pushErr);
    });
  } catch (err) {
    console.warn('Notification dispatch error (non-fatal):', err);
  }
}

/**
 * Broadcasts an announcement notification to recent community members via server push & in-app feed
 */
export async function broadcastAnnouncementNotification(params: {
  announcementId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  title: string;
}): Promise<void> {
  try {
    const usersSnap = await getDocs(query(collection(db, 'users'), limit(25)));
    const tasks: Promise<void>[] = [];
    usersSnap.forEach((uDoc) => {
      if (uDoc.id && uDoc.id !== params.authorId) {
        tasks.push(
          sendNotification({
            recipientId: uDoc.id,
            actorId: params.authorId,
            actorName: params.authorName,
            actorPhotoURL: params.authorPhotoURL,
            type: 'announcement',
            title: `Notice Board: ${params.title.slice(0, 48)}`,
            body: `${params.authorName} posted a new community announcement.`,
            entityId: params.announcementId
          })
        );
      }
    });
    await Promise.allSettled(tasks);
  } catch (err) {
    console.warn('Announcement notification broadcast notice:', err);
  }
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const notifRef = doc(db, 'notifications', notificationId);
    await updateDoc(notifRef, { read: true });
  } catch (err) {
    console.warn('Failed to mark notification as read:', err);
  }
}

/**
 * Mark all notifications for user as read
 */
export async function markAllNotificationsAsRead(recipientId: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', recipientId),
      where('read', '==', false),
      limit(50)
    );
    const snap = await getDocs(q);
    const promises = snap.docs.map((d) => updateDoc(d.ref, { read: true }));
    await Promise.all(promises);
  } catch (err) {
    console.warn('Failed to mark all notifications as read:', err);
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    console.warn('Failed to delete notification:', err);
  }
}

/**
 * Toggle follow user + send notification
 */
export async function toggleFollowUser(
  followerId: string,
  followerName: string,
  targetUserId: string,
  targetUserName?: string
): Promise<boolean> {
  if (followerId === targetUserId) return false;

  const followId = `follow_${followerId}_${targetUserId}`;
  const followRef = doc(db, 'follows', followId);

  try {
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', followerId),
      where('targetUserId', '==', targetUserId),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      // Unfollow
      await deleteDoc(snap.docs[0].ref);
      return false; // Not following anymore
    } else {
      // Follow
      const followData: UserFollow = {
        id: followId,
        followerId,
        followerName,
        targetUserId,
        targetUserName,
        createdAt: new Date().toISOString()
      };
      await setDoc(followRef, followData);

      // Send follow notification to target user!
      await sendNotification({
        recipientId: targetUserId,
        type: 'follow',
        title: 'New Follower! 🌟',
        body: `${followerName} started following your waves.`,
        entityId: followerId,
        actorId: followerId,
        actorName: followerName
      });

      return true; // Now following
    }
  } catch (err) {
    console.warn('Toggle follow error:', err);
    return false;
  }
}
