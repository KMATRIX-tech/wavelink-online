import { doc, setDoc } from 'firebase/firestore';
import { db, cleanFirestoreData, getAuthHeaders } from '../firebase';
import type { Post } from '../types';

/**
 * Saves a post document to Firestore with a client race timeout and server-side fallback.
 * Prevents the application from hanging at 95% when browser IndexedDB tab manager or WebChannel stalls.
 */
export async function savePostDocument(postPayload: Post): Promise<Post> {
  const postId = postPayload.id;
  const cleanedPost = cleanFirestoreData(postPayload);

  let savedSuccessfully = false;

  // Attempt 1: Fast client-side write with a 4.5-second timeout
  try {
    const clientWritePromise = setDoc(doc(db, 'posts', postId), cleanedPost);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CLIENT_WRITE_TIMEOUT')), 4500)
    );
    await Promise.race([clientWritePromise, timeoutPromise]);
    savedSuccessfully = true;
  } catch (clientErr: any) {
    console.warn(
      '[WaveLink Post Save] Client setDoc delayed or timed out (4.5s), triggering server-side fallback:',
      clientErr?.message || clientErr
    );
  }

  // Attempt 2: High-speed server-side write via Firebase Admin SDK fallback
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
      // If server route failed, check if client write was successful
      if (!savedSuccessfully) {
        throw new Error(`Failed to save post to feed: ${serverErr?.message || 'Connection timeout'}`);
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
