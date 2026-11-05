// Change your website link in one place here:
export const APP_URL = 'https://ais-dev-3q3vlonjbk6epnc53geyhc-713336902783.europe-west2.run.app';

/**
 * Builds a direct link to a specific post using APP_URL.
 * @param {string} [postId]
 * @returns {string}
 */
export function getPostUrl(postId) {
  const baseUrl = (APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return postId ? `${baseUrl}/#post-${postId}` : baseUrl;
}

/**
 * Downloads the post image if present, or saves the post text as a .txt file if there is no image.
 * @param {Object} post
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function downloadPost(post) {
  try {
    if (!post) {
      throw new Error('Invalid post');
    }

    const postId = post.id || Date.now();
    const hasImage = Boolean(post.imageUrl && post.mediaType !== 'video' && !post.videoUrl && !post.hasVideoChunks);

    if (hasImage && post.imageUrl) {
      const response = await fetch(post.imageUrl);
      if (!response.ok) {
        throw new Error(`Image fetch failed (${response.status})`);
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'image/jpeg';
      let ext = 'jpg';
      if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('gif')) ext = 'gif';

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `wavelink-post-${postId}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      return { success: true, message: 'Downloaded!' };
    }

    // Fallback when there is no image: save the post text as a .txt file
    const authorHeader = post.authorName
      ? `${post.authorName}${post.authorUsername ? ` (${post.authorUsername})` : ''}\n`
      : '';
    const dateLine = post.createdAt ? `${new Date(post.createdAt).toLocaleString()}\n\n` : '\n';
    const bodyText = (post.content || 'WaveLink Post').trim();
    const footerLink = `\n\n---\nShared from WaveLink: ${getPostUrl(postId)}`;

    const fullText = `${authorHeader}${dateLine}${bodyText}${footerLink}`;
    const textBlob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const textUrl = URL.createObjectURL(textBlob);

    const link = document.createElement('a');
    link.href = textUrl;
    link.download = `wavelink-post-${postId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(textUrl), 2000);

    return { success: true, message: 'Downloaded!' };
  } catch (error) {
    console.error('Download post error:', error);
    throw new Error("Couldn't download");
  }
}

/**
 * Shares a post using the Web Share API first, with WhatsApp (wa.me) as a fallback.
 * @param {Object} post
 * @returns {Promise<{ success: boolean, method?: string, message: string }>}
 */
export async function sharePost(post) {
  try {
    if (!post) {
      throw new Error('Invalid post');
    }

    const postUrl = getPostUrl(post.id);
    const cleanText = (post.content || '').trim();
    const snippet = cleanText
      ? cleanText.length > 100
        ? `${cleanText.slice(0, 97)}...`
        : cleanText
      : 'Check out this post on WaveLink!';
    const authorPart = post.authorName ? `by ${post.authorName} ` : '';
    const shareMessage = `🌊 Check out this post ${authorPart}on WaveLink: "${snippet}"`;
    const whatsappText = `${shareMessage}\n${postUrl}`;

    // 1. Try Web Share API first
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `WaveLink Post ${authorPart}`.trim(),
          text: shareMessage,
          url: postUrl
        });
        return { success: true, method: 'web-share', message: 'Shared!' };
      } catch (shareError) {
        if (shareError && shareError.name === 'AbortError') {
          return { success: false, method: 'cancelled', message: '' };
        }
        // If Web Share API fails (e.g. desktop or iframe restriction), fall back to WhatsApp
      }
    }

    // 2. Fallback to WhatsApp (wa.me)
    const waUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
    const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = waUrl;
    }

    return { success: true, method: 'whatsapp', message: 'Shared to WhatsApp!' };
  } catch (error) {
    console.error('Share post error:', error);
    throw new Error("Couldn't share");
  }
}

/**
 * Opens WhatsApp with a pre-written invite message and APP_URL.
 * @param {string} [customMessage]
 * @returns {{ success: boolean, message: string }}
 */
export function inviteFriends(customMessage) {
  try {
    const inviteText =
      customMessage ||
      `Hey! 👋 Come join me on WaveLink to share photos, 24h Sparks, Video Reels, and chat live! Join here: ${APP_URL}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
    const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = waUrl;
    }
    return { success: true, message: 'Invite link opened in WhatsApp!' };
  } catch (error) {
    console.error('Invite friends error:', error);
    throw new Error("Couldn't open invite");
  }
}
