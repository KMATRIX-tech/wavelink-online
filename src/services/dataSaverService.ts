import { useState, useEffect } from 'react';

export const DATA_SAVER_STORAGE_KEY = 'wavelink_data_saver_v1';
export const DATA_SAVED_BYTES_KEY = 'wavelink_data_saved_bytes_v1';

const recordedSessionSavingsKeys = new Set<string>();

/**
 * Checks whether the browser/phone reports cellular mobile data or a slow connection
 */
export function isMobileDataOrSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  if (conn.type === 'cellular' || conn.type === 'wimax') return true;
  const eff = String(conn.effectiveType || '').toLowerCase();
  if (eff === 'slow-2g' || eff === '2g' || eff === '3g') return true;
  return false;
}

/**
 * Reads current Data Saver state from localStorage.
 * Everyday use: Data Saver is ON by default for mobile data users (and slow connections)
 * unless the user has explicitly switched it off.
 */
export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(DATA_SAVER_STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    // Default ON for mobile data / cellular / slow connection users or mobile viewports
    if (isMobileDataOrSlowConnection()) return true;
    if (window.innerWidth <= 768) return true;
  } catch {
    // ignore storage errors
  }
  return false;
}

/**
 * Updates Data Saver preference in localStorage, DOM attributes, and notifies all listeners
 */
export function setDataSaverPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DATA_SAVER_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    if (enabled) {
      document.documentElement.setAttribute('data-saver', 'true');
    } else {
      document.documentElement.removeAttribute('data-saver');
    }
  }
  window.dispatchEvent(
    new CustomEvent('wavelink:data-saver-changed', { detail: { enabled } })
  );
}

/**
 * Returns total estimated bytes saved by Data Saver
 */
export function getEstimatedDataSavedBytes(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(DATA_SAVED_BYTES_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Records estimated bytes saved (deduplicated per media item per session)
 */
export function recordDataSavedBytes(bytes: number, mediaKey?: string): number {
  if (typeof window === 'undefined' || !Number.isFinite(bytes) || bytes <= 0) {
    return getEstimatedDataSavedBytes();
  }
  if (mediaKey) {
    if (recordedSessionSavingsKeys.has(mediaKey)) {
      return getEstimatedDataSavedBytes();
    }
    recordedSessionSavingsKeys.add(mediaKey);
  }
  const current = getEstimatedDataSavedBytes();
  const next = current + Math.round(bytes);
  try {
    localStorage.setItem(DATA_SAVED_BYTES_KEY, String(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent('wavelink:data-saved-updated', { detail: { bytes: next } })
  );
  return next;
}

/**
 * Formats bytes into a friendly human-readable string (e.g., "420 KB" or "12.4 MB")
 */
export function formatDataSaved(bytes: number, lang: 'en' | 'sw' = 'en'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return lang === 'sw' ? '0 KB zimeokolewa' : '0 KB saved';
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.max(1, Math.round(kb))} KB ${lang === 'sw' ? 'zimeokolewa' : 'saved'}`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB ${lang === 'sw' ? 'zimeokolewa' : 'saved'}`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB ${lang === 'sw' ? 'zimeokolewa' : 'saved'}`;
}

/**
 * Determines whether video autoplay should be blocked:
 * - Never autoplay on mobile data when Data Saver is on (or when Data Saver is active)
 */
export function shouldBlockVideoAutoplay(dataSaverOn: boolean = isDataSaverEnabled()): boolean {
  if (dataSaverOn) return true;
  if (isMobileDataOrSlowConnection()) return true;
  return false;
}

/**
 * Transforms a video URL to play at lower quality (360p / ~400kbps) when Data Saver is ON
 */
export function getOptimizedVideoUrl(
  rawUrl?: string | null,
  dataSaverOn: boolean = isDataSaverEnabled(),
  postId?: string
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (!dataSaverOn) return trimmed;

  // Record estimated video bandwidth savings (~1.8 MB per low-quality video stream vs HD)
  if (postId || trimmed) {
    recordDataSavedBytes(1850 * 1024, `vid_low_${postId || trimmed.slice(-32)}`);
  }

  // Transform Cloudinary video URLs to 360p low bitrate
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/video/upload/')) {
    if (!trimmed.includes('q_auto:low') && !trimmed.includes('w_480')) {
      return trimmed.replace(
        '/video/upload/',
        '/video/upload/q_auto:low,w_480,c_limit,br_400k,f_mp4/'
      );
    }
  }
  return trimmed;
}

/**
 * Transforms an image URL into a small lightweight preview until the user taps to load the full image
 */
export function getOptimizedImagePreviewUrl(
  rawUrl?: string | null,
  dataSaverOn: boolean = isDataSaverEnabled(),
  isFullQualityRequested: boolean = false
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || !dataSaverOn || isFullQualityRequested) return trimmed;

  // Record estimated image preview savings (~420 KB saved per small preview vs full photo)
  recordDataSavedBytes(420 * 1024, `img_prev_${trimmed.slice(-40)}`);

  // Cloudinary image URL transformation
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/image/upload/')) {
    if (!trimmed.includes('w_360') && !trimmed.includes('q_auto:low')) {
      return trimmed.replace(
        '/image/upload/',
        '/image/upload/w_360,c_limit,q_auto:low,f_auto/'
      );
    }
  }

  // Unsplash image URL transformation
  if (trimmed.includes('images.unsplash.com')) {
    try {
      const u = new URL(trimmed);
      u.searchParams.set('w', '360');
      u.searchParams.set('q', '45');
      u.searchParams.set('auto', 'format');
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * React hook for reading and toggling Data Saver + live estimated bytes saved
 */
export function useDataSaver() {
  const [dataSaver, setDataSaverState] = useState<boolean>(() => isDataSaverEnabled());
  const [savedBytes, setSavedBytes] = useState<number>(() => getEstimatedDataSavedBytes());
  const [isMobileData, setIsMobileData] = useState<boolean>(() => isMobileDataOrSlowConnection());

  useEffect(() => {
    const handleSaverChange = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setDataSaverState(detail.enabled);
      } else {
        setDataSaverState(isDataSaverEnabled());
      }
    };

    const handleBytesChange = (e: Event) => {
      const detail = (e as CustomEvent<{ bytes: number }>).detail;
      if (detail && typeof detail.bytes === 'number') {
        setSavedBytes(detail.bytes);
      } else {
        setSavedBytes(getEstimatedDataSavedBytes());
      }
    };

    const handleConnChange = () => {
      setIsMobileData(isMobileDataOrSlowConnection());
    };

    window.addEventListener('wavelink:data-saver-changed', handleSaverChange);
    window.addEventListener('wavelink:data-saved-updated', handleBytesChange);
    const conn = (navigator as any)?.connection;
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', handleConnChange);
    }

    return () => {
      window.removeEventListener('wavelink:data-saver-changed', handleSaverChange);
      window.removeEventListener('wavelink:data-saved-updated', handleBytesChange);
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', handleConnChange);
      }
    };
  }, []);

  const toggleDataSaver = (next?: boolean) => {
    const target = typeof next === 'boolean' ? next : !dataSaver;
    setDataSaverPreference(target);
    setDataSaverState(target);
  };

  const currentLang: 'en' | 'sw' =
    typeof window !== 'undefined' && localStorage.getItem('wavelink_language_pref') === 'sw'
      ? 'sw'
      : 'en';

  return {
    enabled: dataSaver,
    isDataSaver: dataSaver,
    setEnabled: toggleDataSaver,
    setDataSaver: toggleDataSaver,
    estimatedSavedBytes: savedBytes,
    formattedSaved: formatDataSaved(savedBytes, currentLang),
    isMobileData,
    blockAutoplay: shouldBlockVideoAutoplay(dataSaver)
  };
}
