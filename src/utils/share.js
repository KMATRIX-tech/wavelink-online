/**
 * WaveLink Social Sharing & Download Utilities
 * Change APP_URL here in one place to update your website link everywhere.
 */
export const APP_URL =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://ais-dev-3q3vlonjbk6epnc53geyhc-713336902783.europe-west2.run.app';

/**
 * Downloads a file directly via browser anchor tag
 * @param {string} url - Blob URL or direct URL
 * @param {string} filename - Desired filename
 */
function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads the post's image or saves the post content as a .txt file if there is no image.
 * @param {object} post - The post object containing id, content, imageUrl, authorName, etc.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function downloadPost(post) {
  if (!post) {
    throw new Error('Post data is missing');
  }

  const postId = post.id || `post_${Date.now()}`;
  const author = post.authorName || 'waver';

  // 0. If post has a video URL, download the video file
  if (post.videoUrl && typeof post.videoUrl === 'string' && !post.videoUrl.startsWith('idb://')) {
    try {
      if (post.videoUrl.startsWith('data:video/') || post.videoUrl.startsWith('blob:')) {
        triggerDownload(post.videoUrl, post.videoFileName || `wavelink-${postId}.mp4`);
        return { success: true, message: 'Video downloaded!' };
      }
      const res = await fetch(post.videoUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, post.videoFileName || `wavelink-${postId}.mp4`);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
        return { success: true, message: 'Video downloaded!' };
      }
    } catch {
      try {
        triggerDownload(post.videoUrl, post.videoFileName || `wavelink-${postId}.mp4`);
        return { success: true, message: 'Video download started!' };
      } catch {
        // Fall through to thumbnail/text download
      }
    }
  }

  // 1. If post has an image, download the image
  if (post.imageUrl) {
    try {
      // If it's a data URL, download directly
      if (post.imageUrl.startsWith('data:')) {
        const extension = post.imageUrl.includes('image/png') ? 'png' : 'jpg';
        triggerDownload(post.imageUrl, `wavelink-${postId}.${extension}`);
        return { success: true, message: 'Downloaded!' };
      }

      // Try fetching as Blob for cross-origin or storage URLs
      const res = await fetch(post.imageUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const mime = blob.type || '';
        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
        triggerDownload(blobUrl, `wavelink-${postId}.${ext}`);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return { success: true, message: 'Downloaded!' };
      }
    } catch {
      // If fetch fails (e.g. CORS), attempt direct href download fallback
      try {
        triggerDownload(post.imageUrl, `wavelink-${postId}.jpg`);
        return { success: true, message: 'Downloaded!' };
      } catch {
        // Fall back to saving text below if image download was blocked
      }
    }
  }

  // 2. If no image (or image fetch failed), save the post text as a .txt file
  try {
    const textContent = [
      `WaveLink Post by ${author}`,
      `Date: ${post.createdAt ? new Date(post.createdAt).toLocaleString() : new Date().toLocaleString()}`,
      `Link: ${APP_URL}/?post=${postId}`,
      '----------------------------------------',
      post.content || '(No text content)',
      '----------------------------------------',
      `Shared from WaveLink: ${APP_URL}`
    ].join('\n\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const textBlobUrl = URL.createObjectURL(blob);
    triggerDownload(textBlobUrl, `wavelink-post-${postId}.txt`);
    setTimeout(() => URL.revokeObjectURL(textBlobUrl), 2000);
    return { success: true, message: 'Downloaded!' };
  } catch (err) {
    throw new Error(err?.message || "Couldn't download");
  }
}

/**
 * Shares a post via Web Share API first, falling back to WhatsApp (wa.me)
 * @param {object} post - The post to share
 * @returns {Promise<{ success: boolean, method: string }>}
 */
export async function sharePost(post) {
  if (!post) {
    throw new Error('Post data is missing');
  }

  const postId = post.id || '';
  const postUrl = `${APP_URL}/?post=${encodeURIComponent(postId)}`;
  const author = post.authorName || 'a creator';
  const snippet = post.content ? post.content.trim().slice(0, 100) : 'Check out this wave on WaveLink';
  const shareTitle = `WaveLink Post by ${author}`;
  const shareText = `Check out this post by ${author} on WaveLink:\n"${snippet}"`;

  // 1. Try Web Share API first
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: postUrl
      });
      return { success: true, method: 'web_share' };
    } catch (err) {
      // If user deliberately cancelled the native share sheet, do not force-open WhatsApp
      if (err && err.name === 'AbortError') {
        return { success: true, method: 'cancelled' };
      }
      // Otherwise fall through to WhatsApp fallback
    }
  }

  // 2. WhatsApp fallback (wa.me)
  try {
    const whatsappMessage = `${shareText}\n\n👉 View post: ${postUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    return { success: true, method: 'whatsapp' };
  } catch (err) {
    throw new Error(err?.message || "Couldn't share to WhatsApp");
  }
}

/**
 * Invites friends to WaveLink via Web Share API first, falling back to WhatsApp (wa.me)
 * @param {string} [customMessage] - Optional custom invitation message
 * @returns {Promise<{ success: boolean, method: string }>}
 */
export async function inviteFriends(customMessage) {
  const defaultMessage =
    customMessage ||
    `Hey! 🌊 Join me on WaveLink — the modern social platform with Video Reels, 24-hour Sparks, live AI voice talks, and creator tipping. Check it out here: ${APP_URL}`;

  // 1. Try Web Share API first
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'Join me on WaveLink 🌊',
        text: defaultMessage,
        url: APP_URL
      });
      return { success: true, method: 'web_share' };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { success: true, method: 'cancelled' };
      }
      // Fall through to WhatsApp fallback
    }
  }

  // 2. WhatsApp fallback
  try {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(defaultMessage)}`;
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true, method: 'whatsapp' };
  } catch (err) {
    throw new Error(err?.message || "Couldn't open WhatsApp");
  }
}

/**
 * Returns the canonical share URL for a post (?post=ID)
 * @param {object|string} postOrId - Post object or post ID
 * @returns {string}
 */
export function getPostShareUrl(postOrId) {
  const postId = typeof postOrId === 'string' ? postOrId : postOrId?.id || '';
  return `${APP_URL}/?post=${encodeURIComponent(postId)}`;
}

/**
 * Opens an external share URL safely via a temporary anchor element
 * @param {string} url
 */
function openExternalShareLink(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Shares a post to a specific platform (WhatsApp, Telegram, Facebook, X, Messenger, Instagram, Reddit, SMS, or More via Web Share API)
 * @param {'whatsapp'|'telegram'|'facebook'|'x'|'messenger'|'instagram'|'reddit'|'sms'|'more'} platform
 * @param {object} post
 * @returns {Promise<{ success: boolean, method: string, copiedFallback?: boolean }>}
 */
export async function sharePostToPlatform(platform, post) {
  if (!post) {
    throw new Error('Post data is missing');
  }
  const postUrl = getPostShareUrl(post);
  const author = post.authorName || 'a creator';
  const snippet = post.content ? post.content.trim().slice(0, 100) : 'Check out this wave on WaveLink';
  const shareTitle = `WaveLink Post by ${author}`;
  const shareText = `Check out this wave by ${author} on WaveLink: "${snippet}"`;
  const combinedText = `${shareText}\n${postUrl}`;

  if (platform === 'more') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: postUrl
        });
        return { success: true, method: 'web_share' };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { success: false, method: 'cancelled' };
        }
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(postUrl);
      return { success: true, method: 'clipboard', copiedFallback: true };
    }
  }

  switch (platform) {
    case 'whatsapp': {
      openExternalShareLink(`https://wa.me/?text=${encodeURIComponent(combinedText)}`);
      return { success: true, method: 'whatsapp' };
    }
    case 'telegram': {
      openExternalShareLink(
        `https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(shareText)}`
      );
      return { success: true, method: 'telegram' };
    }
    case 'facebook': {
      openExternalShareLink(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}&quote=${encodeURIComponent(shareText)}`
      );
      return { success: true, method: 'facebook' };
    }
    case 'x': {
      openExternalShareLink(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postUrl)}`
      );
      return { success: true, method: 'x' };
    }
    case 'messenger': {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(postUrl);
        } catch {
          // ignore clipboard error
        }
      }
      openExternalShareLink(`https://www.messenger.com/`);
      return { success: true, method: 'messenger', copiedFallback: true };
    }
    case 'instagram': {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(postUrl);
        } catch {
          // ignore clipboard error
        }
      }
      openExternalShareLink(`https://www.instagram.com/`);
      return { success: true, method: 'instagram', copiedFallback: true };
    }
    case 'reddit': {
      openExternalShareLink(
        `https://www.reddit.com/submit?url=${encodeURIComponent(postUrl)}&title=${encodeURIComponent(shareTitle)}`
      );
      return { success: true, method: 'reddit' };
    }
    case 'sms': {
      openExternalShareLink(`sms:?&body=${encodeURIComponent(combinedText)}`);
      return { success: true, method: 'sms' };
    }
    default: {
      return sharePost(post);
    }
  }
}

