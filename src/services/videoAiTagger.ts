import { auth } from '../firebase';
import { cleanCaption } from '../utils/cleanCaption';

export { cleanCaption };

export const EXPLORE_CATEGORIES = [
  'Art',
  'Fashion',
  'Travel',
  'Music',
  'Sports',
  'Food',
  'Comedy',
  'Tech',
  'Gaming',
  'Education',
  'Lifestyle',
  'Other'
] as const;

export type ExploreCategoryName = (typeof EXPLORE_CATEGORIES)[number];

export interface VideoAiTagResult {
  category: ExploreCategoryName;
  keywords: string[];
  language: string;
  aiGenerated: boolean;
  aiConfidence: number;
  taggedAt?: string;
  usedGemini?: boolean;
  fallbackUsed?: boolean;
}

/**
 * Delegates to the single shared cleanCaption helper so auto-generated prefixes,
 * filenames, hex IDs, and camera filenames are stripped consistently everywhere.
 */
export function sanitizeVideoCaptionText(raw?: string | null): string {
  return cleanCaption(raw);
}

/**
 * Extracts 3-5 lightweight compressed JPEG frames (max 320px wide) from a video File or URL
 * so Gemini can analyze visual content at upload time in a single fast call.
 */
export async function extractVideoKeyFramesBase64(
  source: File | string,
  frameCount = 4
): Promise<string[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];

  return new Promise<string[]>((resolve) => {
    const video = document.createElement('video');
    let objectUrl: string | null = null;
    let settled = false;

    const finish = (frames: string[]) => {
      if (settled) return;
      settled = true;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
      resolve(frames);
    };

    const timeoutId = window.setTimeout(() => finish([]), 7500);

    try {
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      if (typeof source === 'string') {
        video.crossOrigin = 'anonymous';
        video.src = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        video.src = objectUrl;
      }

      video.onloadedmetadata = async () => {
        try {
          const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 8;
          const ratios = frameCount === 3 ? [0.2, 0.5, 0.8] : [0.15, 0.4, 0.65, 0.85];
          const timestamps = ratios
            .slice(0, Math.max(3, Math.min(5, frameCount)))
            .map((r) => Math.max(0.1, Math.min(duration - 0.1, duration * r)));

          const rawW = video.videoWidth || 320;
          const rawH = video.videoHeight || 568;
          const maxDim = 320;
          const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
          const targetW = Math.max(120, Math.round(rawW * scale));
          const targetH = Math.max(120, Math.round(rawH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            window.clearTimeout(timeoutId);
            finish([]);
            return;
          }

          const frames: string[] = [];
          for (const t of timestamps) {
            if (settled) break;
            await new Promise<void>((resSeek) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resSeek();
              };
              video.addEventListener('seeked', onSeeked, { once: true });
              try {
                video.currentTime = t;
              } catch {
                video.removeEventListener('seeked', onSeeked);
                resSeek();
              }
            });

            try {
              ctx.drawImage(video, 0, 0, targetW, targetH);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.64);
              if (dataUrl && dataUrl.startsWith('data:image/jpeg;base64,')) {
                frames.push(dataUrl);
              }
            } catch {
              // Cross-origin taint on remote video without CORS headers; stop frame capture gracefully
              break;
            }
          }

          window.clearTimeout(timeoutId);
          finish(frames);
        } catch {
          window.clearTimeout(timeoutId);
          finish([]);
        }
      };

      video.onerror = () => {
        window.clearTimeout(timeoutId);
        finish([]);
      };
    } catch {
      window.clearTimeout(timeoutId);
      finish([]);
    }
  });
}

/**
 * Local fallback tagger used only when offline or if the server request cannot complete,
 * so uploads never block.
 */
export function buildClientFallbackVideoTags(rawCaption?: string): VideoAiTagResult {
  const cleaned = sanitizeVideoCaptionText(rawCaption).toLowerCase();

  const rules: Array<{ category: ExploreCategoryName; words: string[] }> = [
    { category: 'Music', words: ['music', 'muziki', 'bongo', 'flava', 'amapiano', 'afrobeats', 'singeli', 'song', 'wimbo', 'dance', 'ngoma', 'beat'] },
    { category: 'Comedy', words: ['comedy', 'vichekesho', 'funny', 'skit', 'joke', 'laugh', 'cheka', 'meme'] },
    { category: 'Sports', words: ['sports', 'football', 'soccer', 'soka', 'mpira', 'simba', 'yanga', 'goal', 'gym', 'fitness', 'afcon'] },
    { category: 'Fashion', words: ['fashion', 'mitindo', 'style', 'outfit', 'kitenge', 'kanga', 'dress', 'urembo', 'makeup'] },
    { category: 'Food', words: ['food', 'chakula', 'mapishi', 'cook', 'recipe', 'pilau', 'biryani', 'nyama', 'choma', 'ugali', 'chapati'] },
    { category: 'Travel', words: ['travel', 'safari', 'zanzibar', 'serengeti', 'kilimanjaro', 'beach', 'dar', 'arusha', 'nairobi'] },
    { category: 'Tech', words: ['tech', 'coding', 'code', 'software', 'phone', 'app', 'ai', 'laptop', 'gadget', 'teknolojia'] },
    { category: 'Gaming', words: ['gaming', 'game', 'ps5', 'fifa', 'eafc', 'pubg', 'cod', 'esports', 'gamer'] },
    { category: 'Art', words: ['art', 'sanaa', 'painting', 'drawing', 'design', 'sketch', 'photography', 'portrait'] },
    { category: 'Education', words: ['education', 'elimu', 'school', 'shule', 'chuo', 'learn', 'study', 'tutorial', 'lesson'] },
    { category: 'Lifestyle', words: ['lifestyle', 'maisha', 'vlog', 'family', 'motivation', 'faith', 'baraka', 'biashara'] }
  ];

  let category: ExploreCategoryName = 'Other';
  let maxScore = 0;
  for (const r of rules) {
    const score = r.words.filter((w) => cleaned.includes(w)).length;
    if (score > maxScore) {
      maxScore = score;
      category = r.category;
    }
  }

  const tokens = cleaned
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 24);
  const keywords = Array.from(new Set([category.toLowerCase(), ...tokens])).slice(0, 10);

  return {
    category,
    keywords,
    language: 'en',
    aiGenerated: false,
    aiConfidence: 0.1,
    taggedAt: new Date().toISOString(),
    usedGemini: false,
    fallbackUsed: true
  };
}

/**
 * Calls the server function POST /api/ai/tag-video ONCE with 3-5 key frames, caption, and optional transcript.
 */
export async function requestUploadTimeVideoTagging(params: {
  file?: File;
  videoUrl?: string;
  thumbnailDataUrl?: string;
  caption?: string;
  transcript?: string;
  postId?: string;
  persistToPost?: boolean;
}): Promise<VideoAiTagResult> {
  const cleanCaption = sanitizeVideoCaptionText(params.caption);

  try {
    let framesBase64: string[] = [];
    if (params.file) {
      framesBase64 = await extractVideoKeyFramesBase64(params.file, 4);
    } else if (params.videoUrl) {
      framesBase64 = await extractVideoKeyFramesBase64(params.videoUrl, 3);
    }
    if (
      framesBase64.length === 0 &&
      params.thumbnailDataUrl &&
      params.thumbnailDataUrl.startsWith('data:image/')
    ) {
      framesBase64 = [params.thumbnailDataUrl];
    }

    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (!token) {
      return buildClientFallbackVideoTags(cleanCaption);
    }

    const response = await fetch('/api/ai/tag-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        postId: params.postId,
        persistToPost: Boolean(params.persistToPost),
        caption: cleanCaption,
        transcript: params.transcript || '',
        framesBase64
      })
    });

    if (!response.ok) {
      return {
        ...buildClientFallbackVideoTags(cleanCaption),
        taggedAt: undefined // Allow background retry
      };
    }

    const data = await response.json();
    const matchedCat =
      EXPLORE_CATEGORIES.find(
        (c) => c.toLowerCase() === String(data.category || '').trim().toLowerCase()
      ) || 'Other';

    const keywords = Array.isArray(data.keywords)
      ? data.keywords
          .map((k: unknown) => String(k || '').toLowerCase().trim())
          .filter((k: string) => k.length >= 2)
          .slice(0, 10)
      : [matchedCat.toLowerCase()];

    return {
      category: matchedCat,
      keywords,
      language: typeof data.language === 'string' && data.language ? data.language : 'en',
      aiGenerated: Boolean(data.aiGenerated),
      aiConfidence: typeof data.aiConfidence === 'number' ? data.aiConfidence : 0.15,
      taggedAt: data.taggedAt || new Date().toISOString(),
      usedGemini: Boolean(data.usedGemini),
      fallbackUsed: Boolean(data.fallbackUsed)
    };
  } catch {
    return {
      ...buildClientFallbackVideoTags(cleanCaption),
      taggedAt: undefined // Allow background retry
    };
  }
}

/**
 * Schedules a single non-blocking background retry if upload-time AI tagging failed
 * due to a transient connection drop.
 */
export function scheduleBackgroundVideoTagRetry(params: {
  postId: string;
  caption?: string;
  videoUrl?: string;
}): void {
  if (typeof window === 'undefined' || !params.postId) return;
  window.setTimeout(async () => {
    try {
      await requestUploadTimeVideoTagging({
        postId: params.postId,
        caption: params.caption,
        videoUrl: params.videoUrl,
        persistToPost: true
      });
    } catch {
      // silent background retry
    }
  }, 6000);
}
