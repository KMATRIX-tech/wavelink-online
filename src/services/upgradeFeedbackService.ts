import { db, cleanFirestoreData, ADMIN_EMAIL } from '../firebase';
import { collection, addDoc, updateDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { UpgradeFeedbackItem, UpgradeCategory, UpgradeSource, UpgradeStatus } from '../types';
import { sendNotification } from './notificationService';

/**
 * Intelligent client-side heuristic analyzer to detect when a conversation
 * turn in Welink AI, Live Talk, or Support Bot contains a platform upgrade suggestion or feature request.
 */
export function detectUpgradeIdea(text: string): {
  isUpgrade: boolean;
  title: string;
  category: UpgradeCategory;
  impactScore: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  summary: string;
} | null {
  if (!text || text.trim().length < 10) return null;
  const lower = text.toLowerCase();

  // Words that indicate an upgrade, suggestion, request, or constructive feedback
  const upgradeKeywords = [
    'upgrade', 'improve', 'feature', 'suggest', 'suggestion', 'idea',
    'would be cool', 'should add', 'can you add', 'please add', 'why not add',
    'we need', 'better if', 'make it so', 'ongeza', 'rekebisha', 'boresha',
    'wazo', 'pendekezo', 'mpya', 'update', 'fix this', 'bug', 'glitch',
    'dark mode', 'voice message', 'group video', 'filter', 'analytics'
  ];

  const hasUpgradeIntent = upgradeKeywords.some((kw) => lower.includes(kw));
  if (!hasUpgradeIntent) return null;

  // Determine category
  let category: UpgradeCategory = 'social_features';
  let impactScore: 'high' | 'medium' | 'low' = 'medium';

  if (lower.includes('reel') || lower.includes('video') || lower.includes('clip') || lower.includes('camera') || lower.includes('record')) {
    category = 'video_reels';
    impactScore = 'high';
  } else if (lower.includes('spark') || lower.includes('story') || lower.includes('24h') || lower.includes('stories')) {
    category = 'sparks';
    impactScore = 'high';
  } else if (lower.includes('call') || lower.includes('calling') || lower.includes('webrtc') || lower.includes('p2p') || lower.includes('screen share')) {
    category = 'calling';
    impactScore = 'high';
  } else if (lower.includes('chat') || lower.includes('message') || lower.includes('dm') || lower.includes('voice note') || lower.includes('typing')) {
    category = 'chat_messaging';
    impactScore = 'high';
  } else if (lower.includes('pro') || lower.includes('pay') || lower.includes('money') || lower.includes('coin') || lower.includes('points') || lower.includes('azampay') || lower.includes('tip')) {
    category = 'monetization_pro';
    impactScore = 'high';
  } else if (lower.includes('theme') || lower.includes('color') || lower.includes('ui') || lower.includes('layout') || lower.includes('button') || lower.includes('design') || lower.includes('dark mode')) {
    category = 'ui_ux_design';
    impactScore = 'medium';
  } else if (lower.includes('slow') || lower.includes('lag') || lower.includes('speed') || lower.includes('fast') || lower.includes('battery') || lower.includes('loading')) {
    category = 'performance_speed';
    impactScore = 'high';
  }

  // Derive a succinct title
  const cleanSnippet = text.trim().replace(/\n+/g, ' ');
  let title = cleanSnippet.length > 55 ? `${cleanSnippet.slice(0, 52)}...` : cleanSnippet;
  if (title.length < 12) {
    title = `Platform Upgrade: ${category.replace('_', ' ').toUpperCase()}`;
  }

  return {
    isUpgrade: true,
    title,
    category,
    impactScore,
    impact: impactScore,
    summary: cleanSnippet
  };
}

/**
 * Persist an AI-collected or user-submitted upgrade feedback item in Firestore
 */
export async function recordUpgradeFeedback(item: {
  title: string;
  summary: string;
  userQuote?: string;
  category: UpgradeCategory;
  source: UpgradeSource;
  submittedByUserId?: string;
  userId?: string;
  submittedByUserName?: string;
  userName?: string;
  submittedByUserEmail?: string;
  userEmail?: string;
  impactScore?: 'high' | 'medium' | 'low';
  impact?: 'high' | 'medium' | 'low';
}): Promise<string> {
  const now = new Date().toISOString();

  const authorId = item.userId || item.submittedByUserId || 'anonymous_waver';
  const authorName = item.userName || item.submittedByUserName || 'WaveLink Member';
  const authorEmail = item.userEmail || item.submittedByUserEmail || undefined;
  const rating = item.impact || item.impactScore || 'medium';

  const feedbackData: Omit<UpgradeFeedbackItem, 'id'> = {
    title: item.title.trim().slice(0, 140),
    summary: item.summary.trim(),
    userQuote: item.userQuote ? item.userQuote.trim() : item.summary.trim(),
    category: item.category,
    source: item.source,
    submittedByUserId: authorId,
    userId: authorId,
    submittedByUserName: authorName,
    userName: authorName,
    submittedByUserEmail: authorEmail,
    userEmail: authorEmail,
    status: 'new',
    impactScore: rating,
    impact: rating,
    createdAt: now,
    updatedAt: now
  };

  const docRef = await addDoc(collection(db, 'upgrade_feedback'), cleanFirestoreData(feedbackData));

  // Find Platform Owner / Super Admin user ID to dispatch in-app notification
  try {
    const adminUserQuery = query(collection(db, 'users'), where('role', '==', 'super_admin'));
    const adminSnap = await getDocs(adminUserQuery);
    if (!adminSnap.empty) {
      const ownerId = adminSnap.docs[0].id;
      sendNotification({
        recipientId: ownerId,
        actorId: authorId,
        actorName: authorName,
        type: 'system',
        title: `💡 New Platform Upgrade Idea Collected`,
        body: `From ${item.source.replace('_', ' ')}: "${item.title}"`,
        entityId: docRef.id
      }).catch(() => {});
    }
  } catch (err) {
    // Non-blocking notification delivery
    console.warn('Admin notification for upgrade notice:', err);
  }

  return docRef.id;
}

/**
 * Update the status or admin notes on an upgrade feedback document
 */
export async function updateUpgradeFeedbackStatus(
  feedbackId: string,
  statusOrUpdates?: UpgradeStatus | Partial<UpgradeFeedbackItem>,
  notes?: string
): Promise<void> {
  const docRef = doc(db, 'upgrade_feedback', feedbackId);
  const now = new Date().toISOString();

  let patch: Record<string, any> = { updatedAt: now };

  if (typeof statusOrUpdates === 'string') {
    patch.status = statusOrUpdates;
    if (notes !== undefined) {
      patch.notes = notes;
      patch.adminNotes = notes;
    }
  } else if (statusOrUpdates && typeof statusOrUpdates === 'object') {
    patch = { ...patch, ...statusOrUpdates };
  } else if (notes !== undefined) {
    patch.notes = notes;
    patch.adminNotes = notes;
  }

  await updateDoc(docRef, cleanFirestoreData(patch));
}
