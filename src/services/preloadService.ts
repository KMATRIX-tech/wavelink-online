import { Post } from '../types';

export interface PreloadedMediaInfo {
  width: number;
  height: number;
  aspectRatio: number;
  loadedAt: number;
}

const preloadedUrlCache = new Map<string, PreloadedMediaInfo>();
const inFlightUrls = new Set<string>();
const preloadedVideoUrls = new Set<string>();
const preloadedPostIds = new Set<string>();

/**
 * Checks whether background preloading should run based on network status,
 * Battery Saver mode, and Data Saver preferences.
 */
function shouldPreloadInBackground(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!navigator.onLine) return false;
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-battery-saver') === 'true') {
    return false;
  }
  const conn = (navigator as any).connection;
  if (conn && conn.saveData === true) return false;
  return true;
}

/**
 * Schedules low-priority background work during browser idle frames.
 */
function scheduleIdleTask(task: () => void): void {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window && typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(() => task(), { timeout: 1200 });
  } else {
    setTimeout(task, 60);
  }
}

/**
 * Preloads a single image URL in the background, decodes its bitmap to prevent
 * main-thread jank, and caches its natural dimensions to minimize layout shifts.
 */
export function preloadImageUrl(
  url?: string | null,
  onDimensionsReady?: (url: string, info: PreloadedMediaInfo) => void
): Promise<PreloadedMediaInfo | null> {
  if (!url || typeof url !== 'string' || !shouldPreloadInBackground()) {
    return Promise.resolve(null);
  }

  const trimmed = url.trim();
  if (!trimmed) return Promise.resolve(null);

  if (preloadedUrlCache.has(trimmed)) {
    const cached = preloadedUrlCache.get(trimmed)!;
    if (onDimensionsReady) onDimensionsReady(trimmed, cached);
    return Promise.resolve(cached);
  }

  if (inFlightUrls.has(trimmed)) {
    return Promise.resolve(null);
  }

  inFlightUrls.add(trimmed);

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';

    const finalize = () => {
      inFlightUrls.delete(trimmed);
      const width = img.naturalWidth || 1200;
      const height = img.naturalHeight || 900;
      const aspectRatio = width > 0 && height > 0 ? Number((width / height).toFixed(3)) : 4 / 3;
      const info: PreloadedMediaInfo = {
        width,
        height,
        aspectRatio,
        loadedAt: Date.now(),
      };
      preloadedUrlCache.set(trimmed, info);
      if (onDimensionsReady) {
        onDimensionsReady(trimmed, info);
      }
      resolve(info);
    };

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(finalize).catch(finalize);
      } else {
        finalize();
      }
    };

    img.onerror = () => {
      inFlightUrls.delete(trimmed);
      resolve(null);
    };

    img.src = trimmed;
  });
}

/**
 * Preloads lightweight video metadata in the background for direct video URLs
 * so the player knows dimensions and duration immediately when scrolled into view.
 */
export function preloadVideoMetadata(videoUrl?: string | null): void {
  if (!videoUrl || typeof videoUrl !== 'string' || !shouldPreloadInBackground()) return;
  const trimmed = videoUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || preloadedVideoUrls.has(trimmed)) return;

  preloadedVideoUrls.add(trimmed);

  scheduleIdleTask(() => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = trimmed;
      video.load();
    } catch {
      // ignore video metadata preload errors
    }
  });
}

/**
 * Preloads all visual assets (author avatar, post image, video thumbnail, song art,
 * and video metadata) for a single feed post.
 */
export async function preloadPostAssets(
  post: Post,
  onDimensionsReady?: (url: string, info: PreloadedMediaInfo) => void
): Promise<void> {
  if (!post || !shouldPreloadInBackground()) return;
  preloadedPostIds.add(post.id);

  const imageTargets = [
    post.authorPhotoURL,
    post.imageUrl,
    post.thumbnailUrl,
    post.songAlbumArt,
  ].filter((u): u is string => Boolean(u && typeof u === 'string'));

  await Promise.all(
    imageTargets.map((targetUrl) => preloadImageUrl(targetUrl, onDimensionsReady))
  );
}

/**
 * Detects and preloads the next `lookaheadCount` (default 3) upcoming feed posts
 * starting from `currentVisibleIndex`, warming up images and video thumbnails
 * before the user scrolls to them.
 */
export function preloadUpcomingFeedPosts(
  posts: Post[],
  currentVisibleIndex: number,
  lookaheadCount = 3,
  onDimensionsReady?: (url: string, info: PreloadedMediaInfo) => void
): void {
  if (!Array.isArray(posts) || posts.length === 0 || !shouldPreloadInBackground()) return;

  const startIndex = Math.max(0, currentVisibleIndex);
  const endIndex = Math.min(posts.length, startIndex + lookaheadCount + 1);
  const upcomingSlice = posts.slice(startIndex, endIndex);

  scheduleIdleTask(() => {
    upcomingSlice.forEach((post) => {
      void preloadPostAssets(post, onDimensionsReady);
    });
  });
}

/**
 * Returns cached natural media dimensions/aspect ratio if already preloaded.
 */
export function getPreloadedMediaInfo(url?: string | null): PreloadedMediaInfo | undefined {
  if (!url) return undefined;
  return preloadedUrlCache.get(url.trim());
}

/**
 * Returns whether a given post ID has already had its media preloaded.
 */
export function isPostPreloaded(postId: string): boolean {
  return preloadedPostIds.has(postId);
}
