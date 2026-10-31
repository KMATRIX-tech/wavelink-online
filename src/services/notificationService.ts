import { db, auth, cleanFirestoreData } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import { AppNotification, NotificationType, UserFollow } from '../types';

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
 * Dispatch an in-app notification to a user (messages, calls, posts, follows)
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const currentAuthUser = auth.currentUser;
  const actorId = params.actorId || currentAuthUser?.uid || 'system';

  // Do not send notifications to oneself
  if (params.recipientId === actorId) {
    return;
  }

  try {
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notification: AppNotification = {
      id: notifId,
      recipientId: params.recipientId,
      actorId,
      actorName: params.actorName || currentAuthUser?.displayName || 'A Waver',
      actorUsername: params.actorUsername || (currentAuthUser?.email ? `@${currentAuthUser.email.split('@')[0]}` : undefined),
      actorPhotoURL: params.actorPhotoURL || params.actorAvatar || currentAuthUser?.photoURL || undefined,
      type: params.type,
      title: params.title,
      body: params.body,
      entityId: params.entityId,
      read: false,
      createdAt: new Date().toISOString()
    };

    const sanitized = cleanFirestoreData(notification);
    await setDoc(doc(db, 'notifications', notifId), sanitized);
  } catch (err) {
    console.warn('Notification dispatch error (non-fatal):', err);
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
