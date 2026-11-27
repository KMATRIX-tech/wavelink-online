import { doc, setDoc } from 'firebase/firestore';
import { db, cleanFirestoreData, getAuthHeaders } from '../firebase';
import type { Post } from '../types';
import { checkActionRateLimit } from '../utils/safetyFilters';
import { buildClientFallbackVideoTags, sanitizeVideoCaptionText } from './videoAiTagger';
import { validateAndModerateText } from './moderationService';

/**
 * Saves a post document to Firestore with per-user posting rate limits, 4-layer safety moderation,
 * client race timeout, and server-side fallback.
 */
export async function savePostDocument(postPayload: Post): Promise<Post> {
  const postId = postPayload.id;
  const rateCheck = checkActionRateLimit(postPayload.authorId || 'user', 'post');
  if (!rateCheck.allowed) {
    throw new Error(rateCheck.message || 'You are posting too fast. Please wait a moment and try again.');
  }

  // Layer 1 + Layer 2 moderation on post caption, hashtags, and challenge hashtag
  const combinedModText = [
    postPayload.content || '',
    Array.isArray(postPayload.hashtags) ? postPayload.hashtags.join(' ') : '',
    postPayload.challengeHashtag || '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  let moderationCheckedAt = postPayload.moderationCheckedAt || new Date().toISOString();
  if (!postPayload.moderationChecked && combinedModText) {
    const modVerdict = await validateAndModerateText(combinedModText, 'post');
    if (!modVerdict.allowed) {
      throw new Error(modVerdict.friendlyMessage);
    }
    if (modVerdict.moderationCheckedAt) {
      moderationCheckedAt = modVerdict.moderationCheckedAt;
    }
  }

  try {
    const headers = await getAuthHeaders();
    const rateResp = await fetch('/api/security/rate-limit-action', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'post' })
    });
    if (rateResp.status === 429) {
      const rateJson = await rateResp.json().catch(() => ({}));
      throw new Error(rateJson.error || 'You are posting too fast. Please wait a moment and try again.');
    }
  } catch (rateErr: any) {
    if (rateErr?.message && rateErr.message.includes('too fast')) {
      throw rateErr;
    }
  }

  const sanitizedContent = sanitizeVideoCaptionText(postPayload.content);
  const autoTags = !postPayload.category || !postPayload.keywords?.length
    ? buildClientFallbackVideoTags(sanitizedContent)
    : null;

  const enrichedPayload: Post = {
    ...postPayload,
    content: sanitizedContent,
    videoFileName: undefined,
    moderationChecked: true,
    moderationCheckedAt,
    mediaSafety: postPayload.mediaSafety || 'safe',
    category: postPayload.category || autoTags?.category || 'Other',
    keywords:
      postPayload.keywords && postPayload.keywords.length > 0
        ? postPayload.keywords
        : autoTags?.keywords || ['other'],
    language: postPayload.language || autoTags?.language || 'en',
    aiGenerated: postPayload.aiGenerated ?? false,
    aiConfidence: postPayload.aiConfidence ?? 0.1,
    taggedAt: postPayload.taggedAt || new Date().toISOString()
  };

  const cleanedPost = cleanFirestoreData(enrichedPayload);

  let savedSuccessfully = false;
  let lastClientError: any = null;

  // Attempt 1: Client-side Firestore write with a 12-second timeout
  const clientWritePromise = setDoc(doc(db, 'posts', postId), cleanedPost)
    .then(() => {
      savedSuccessfully = true;
    })
    .catch((err) => {
      lastClientError = err;
      throw err;
    });

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CLIENT_WRITE_TIMEOUT')), 12000)
    );
    await Promise.race([clientWritePromise, timeoutPromise]);
    savedSuccessfully = true;
  } catch (clientErr: any) {
    console.warn(
      '[WaveLink Post Save] Client setDoc delayed or failed, triggering server-side fallback:',
      clientErr?.message || clientErr
    );
  }

  // Attempt 2: High-speed server-side write via Admin SDK / Firestore REST fallback
  if (!savedSuccessfully) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(cleanedPost)
      });
      if (res.ok) {
        savedSuccessfully = true;
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
    } catch (serverErr: any) {
      // Wait up to 3 more seconds in case the in-flight client write finishes
      if (!savedSuccessfully && !lastClientError) {
        try {
          await Promise.race([
            clientWritePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
          ]);
        } catch {
          // ignore
        }
      }
      if (!savedSuccessfully) {
        const errMsg = lastClientError?.message || serverErr?.message || 'Connection timeout';
        throw new Error(`Failed to save post to feed: ${errMsg}`);
      }
    }
  }

  // Immediately broadcast to FeedView and VideosHubView so new post shows right away
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('wavelink:video-post-created', { detail: postPayload })
    );
  }

  return postPayload;
}
