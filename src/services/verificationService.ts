import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, cleanFirestoreData, handleFirestoreError, OperationType, ADMIN_EMAIL } from '../firebase';
import { PendingVerification, PaymentRequest, SystemDomain } from '../types';
import { sendNotification } from './notificationService';

export interface SubmitVerificationParams {
  userId: string;
  userEmail: string;
  userName: string;
  userPhotoURL?: string;
  tierId: 'weekly' | 'monthly' | 'annual';
  tierName: string;
  amountTZS: number;
  carrier: string;
  transactionId: string;
  phoneNumber?: string;
}

/**
 * Submit SMS Transaction ID for manual verification
 */
export async function submitManualVerification(
  params: SubmitVerificationParams
): Promise<PendingVerification> {
  const id = `pv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: PendingVerification = {
    id,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    userPhotoURL: params.userPhotoURL || '',
    tierId: params.tierId,
    tierName: params.tierName,
    amountTZS: params.amountTZS,
    carrier: params.carrier,
    transactionId: params.transactionId.trim(),
    phoneNumber: params.phoneNumber?.trim() || '',
    status: 'pending',
    submittedAt: now
  };

  try {
    await setDoc(doc(db, 'pending_verifications', id), cleanFirestoreData(record));

    // Also notify platform owner / admin about this pending transaction
    // Send a system alert notification
    sendNotification({
      recipientId: 'keylan_admin', // generic admin identifier or will be picked up by admin query
      actorId: params.userId,
      actorName: params.userName,
      actorAvatar: params.userPhotoURL,
      type: 'system',
      title: 'New Manual Pro Verification 📋',
      body: `${params.userName} submitted ${params.carrier.toUpperCase()} Txn: ${params.transactionId} (TZS ${params.amountTZS.toLocaleString()})`,
      entityId: id,
      actionUrl: 'admin'
    }).catch(() => {
      // Notification is non-blocking
    });

    return record;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `pending_verifications/${id}`);
    throw err;
  }
}

/**
 * Admin approves a pending verification:
 * 1. Marks verification as approved
 * 2. Sets user.isPro = true, awards Verified Blue Star badge, sets expiry
 * 3. Sends notification to the user
 */
export async function approveVerification(
  verification: PendingVerification,
  approvedByEmail: string
): Promise<void> {
  const now = new Date();
  let daysToAdd = 30;
  if (verification.tierId === 'weekly') daysToAdd = 7;
  if (verification.tierId === 'annual') daysToAdd = 365;

  const expiresAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Mark verification document as approved
    await updateDoc(doc(db, 'pending_verifications', verification.id), {
      status: 'approved',
      approvedAt: now.toISOString(),
      approvedBy: approvedByEmail
    });

    // 2. Set user.isPro = true and grant full perks
    await updateDoc(doc(db, 'users', verification.userId), {
      isPro: true,
      hasBlueStar: true,
      proPlan: verification.tierId,
      proExpiresAt: expiresAt,
      proBadge: 'verified',
      proBorderEffect: 'neon-pulse',
      proAccentColor: 'purple',
      updatedAt: now.toISOString()
    });

    // 3. Dispatch celebration notification to the user
    sendNotification({
      recipientId: verification.userId,
      actorId: 'admin',
      actorName: 'WaveLink Team',
      type: 'system',
      title: '🌟 WaveLink Pro Activated!',
      body: `Your payment (${verification.carrier.toUpperCase()} ${verification.transactionId}) has been approved! Enjoy your Verified Blue Star, 500MB uploads, and Pro privileges!`,
      entityId: verification.id,
      actionUrl: 'feed'
    }).catch(console.error);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pending_verifications/${verification.id}`);
    throw err;
  }
}

/**
 * Admin rejects a verification
 */
export async function rejectVerification(
  verificationId: string,
  userId: string,
  reason: string = 'Transaction could not be verified'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'pending_verifications', verificationId), {
      status: 'rejected',
      notes: reason,
      updatedAt: new Date().toISOString()
    });

    sendNotification({
      recipientId: userId,
      actorId: 'admin',
      actorName: 'WaveLink Team',
      type: 'system',
      title: 'Pro Verification Update',
      body: `Your manual payment verification could not be approved: ${reason}. Please contact support or re-check your SMS Txn ID.`,
      entityId: verificationId,
      actionUrl: 'support'
    }).catch(console.error);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pending_verifications/${verificationId}`);
    throw err;
  }
}

export interface SubmitPaymentRequestParams {
  userId: string;
  userPhone: string;
  plan: 'monthly' | 'harvest' | string;
  transactionId: string;
  amountTZS?: number;
  userEmail?: string;
  userName?: string;
  userPhotoURL?: string;
}

/**
 * Submit manual payment notification into 'payment_requests' collection
 * Exactly storing { userId, userPhone, plan, transactionId, status: 'pending', timestamp: serverTimestamp() }
 */
export async function submitPaymentRequest(
  params: SubmitPaymentRequestParams
): Promise<PaymentRequest> {
  const id = `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: PaymentRequest = {
    id,
    userId: params.userId,
    userPhone: params.userPhone.trim(),
    plan: params.plan,
    planName: params.plan === 'harvest' ? 'Harvest 1-Year Pass' : 'Monthly Pro',
    amountTZS: params.amountTZS || (params.plan === 'harvest' ? 50000 : 18000),
    transactionId: params.transactionId.trim(),
    status: 'pending',
    timestamp: serverTimestamp(),
    createdAt: now,
    userEmail: params.userEmail || '',
    userName: params.userName || 'Subscriber',
    userPhotoURL: params.userPhotoURL || ''
  };

  try {
    await setDoc(doc(db, 'payment_requests', id), cleanFirestoreData(record));

    // Notify admin
    sendNotification({
      recipientId: 'keylan_admin',
      actorId: params.userId,
      actorName: params.userName || 'Subscriber',
      actorAvatar: params.userPhotoURL,
      type: 'system',
      title: 'New Manual Payment Notification 💳',
      body: `${params.userName || 'Subscriber'} paid for ${params.plan === 'harvest' ? 'Harvest Pass (50k)' : 'Monthly Pro (18k)'} (Txn: ${params.transactionId}) from ${params.userPhone}`,
      entityId: id,
      actionUrl: 'admin'
    }).catch(() => {});

    return record;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payment_requests/${id}`);
    throw err;
  }
}

/**
 * Admin 1-Click Approve for PaymentRequest:
 * 1. Sets status: 'approved' in payment_requests
 * 2. Updates user.isPro = true, removes ads, sets Verified Pro badge
 */
export async function approvePaymentRequest(
  request: PaymentRequest,
  approvedByEmail: string
): Promise<void> {
  const now = new Date();
  const daysToAdd = request.plan === 'harvest' ? 365 : 30;
  const expiresAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Mark request as approved
    await updateDoc(doc(db, 'payment_requests', request.id), {
      status: 'approved',
      approvedAt: now.toISOString(),
      approvedBy: approvedByEmail
    });

    // 2. Set user.isPro = true and grant full perks
    await updateDoc(doc(db, 'users', request.userId), {
      isPro: true,
      hasBlueStar: true,
      proPlan: request.plan === 'harvest' ? 'annual' : 'monthly',
      proExpiresAt: expiresAt,
      proBadge: 'verified',
      proBorderEffect: 'neon-pulse',
      proAccentColor: 'emerald',
      updatedAt: now.toISOString()
    });

    // 3. Dispatch celebration notification to the user
    sendNotification({
      recipientId: request.userId,
      actorId: 'admin',
      actorName: 'WaveLink Team',
      type: 'system',
      title: '🌟 WaveLink Pro Activated!',
      body: `Your payment (Txn ${request.transactionId}) has been approved! Pro privileges are active and all advertisements are removed!`,
      entityId: request.id,
      actionUrl: 'feed'
    }).catch(console.error);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_requests/${request.id}`);
    throw err;
  }
}

/**
 * Admin rejects a payment request
 */
export async function rejectPaymentRequest(
  requestId: string,
  userId: string,
  reason: string = 'Payment could not be verified'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'payment_requests', requestId), {
      status: 'rejected',
      notes: reason,
      updatedAt: new Date().toISOString()
    });

    sendNotification({
      recipientId: userId,
      actorId: 'admin',
      actorName: 'WaveLink Team',
      type: 'system',
      title: 'Payment Request Update',
      body: `Your payment notification could not be approved: ${reason}. Please verify your Transaction ID and paid amount.`,
      entityId: requestId,
      actionUrl: 'support'
    }).catch(console.error);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_requests/${requestId}`);
    throw err;
  }
}

/**
 * Automatically record the current host domain in Firestore
 * This ensures that whenever the app runs on a new preview domain or custom domain,
 * it is stored in Firebase for admin visibility and OAuth whitelisting without errors.
 */
export async function recordSystemDomain(rawDomain?: string): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    const currentHost = rawDomain || window.location.hostname;
    const domainsToRegister = Array.from(
      new Set(
        [
          currentHost,
          'wavelink-online.netlify.app',
          'wavelink-social.netlify.app'
        ].filter((d) => Boolean(d) && d !== 'localhost' && d !== '127.0.0.1')
      )
    );

    const now = new Date().toISOString();

    await Promise.allSettled(
      domainsToRegister.map((domain) => {
        const domainKey = domain.replace(/[^a-zA-Z0-9_-]/g, '_');
        const docRef = doc(db, 'system_domains', domainKey);
        const payload = cleanFirestoreData({
          id: domainKey,
          domain,
          url: domain === currentHost ? window.location.origin : `https://${domain}`,
          status: 'active',
          lastSeenAt: now
        });
        return setDoc(docRef, payload, { merge: true });
      })
    );
  } catch (e) {
    // Non-blocking: Silently handle so app never throws or breaks
    console.debug('System domain check completed');
  }
}
