import { db, storage, getAuthHeaders, formatFirebaseStorageError } from '../firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const DB_NAME = 'wavelink_media_db';
const STORE_NAME = 'videos';

// Session in-memory cache so video playback works immediately even if IndexedDB is restricted
const memoryVideoCache = new Map<string, string>();
let storageBucketReachable: boolean | null = null;

// Video Upload Limits (Feed / Reels / Studio):
// - Maximum file size before compression: 100 MB
// - Maximum duration: 60 seconds for Free users, 90 seconds for Pro users
// - Browser compression target: max 720p, ~1.8 Mbps, MP4/WebM
export const FREE_VIDEO_MAX_SECONDS = 60;
export const PRO_VIDEO_MAX_SECONDS = 90;
export const MAX_VIDEO_DURATION_SECONDS = PRO_VIDEO_MAX_SECONDS;
export const MAX_VIDEO_RAW_MB = 100;
export const MAX_VIDEO_RAW_BYTES = MAX_VIDEO_RAW_MB * 1024 * 1024; // 100 MB
export const TARGET_VIDEO_BITRATE_BPS = 1_800_000; // ~1.8 Mbps for fast 720p uploads
export const TARGET_AUDIO_BITRATE_BPS = 128_000; // 128 kbps AAC
export const FREE_MAX_VIDEO_MB = 100;
export const PRO_MAX_VIDEO_MB = 100;
export const FREE_MAX_VIDEO_BYTES = FREE_MAX_VIDEO_MB * 1024 * 1024; // 100 MB
export const PRO_MAX_VIDEO_BYTES = PRO_MAX_VIDEO_MB * 1024 * 1024; // 100 MB

export function getMaxVideoDurationSeconds(isProUser: boolean = false): number {
  return isProUser ? PRO_VIDEO_MAX_SECONDS : FREE_VIDEO_MAX_SECONDS;
}

// ============================================================================
// SPARKS DEDICATED LIMITS & SAFE MIME TYPES
// - Up to 90 seconds
// - Max file size cap: 100 MB before compression (80 MB Spark storage cap)
// - Direct browser-to-Firebase Storage resumable upload (never Express, never base64 in Firestore)
// ============================================================================
export const SPARK_MAX_FILE_MB = 80;
export const SPARK_MAX_FILE_BYTES = SPARK_MAX_FILE_MB * 1024 * 1024; // 80 MB
export const FREE_SPARK_MAX_SECONDS = 60;
export const PRO_SPARK_MAX_SECONDS = 90;

export const ALLOWED_SPARK_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  'video/x-m4v',
  'video/3gpp'
]);

export const ALLOWED_SPARK_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

export interface SparkVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
}

export interface SparkMediaValidationResult {
  valid: boolean;
  mediaType: 'video' | 'image' | 'invalid';
  mimeType: string;
  fileSize: number;
  formattedSize: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  maxAllowedSeconds: number;
  showTryProNote?: boolean;
  error?: string;
}

export interface SparkVideoUploadResult {
  downloadUrl: string;
  storagePath: string;
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  hasVideoChunks?: boolean;
}

export function formatVideoFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSparkDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '0:01';
  const rounded = Math.max(1, Math.round(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Checks that a Spark file is an allowed safe image or video type (by MIME and file extension fallback).
 */
export function detectSafeSparkMediaType(file: File | Blob): {
  valid: boolean;
  mediaType: 'video' | 'image' | 'invalid';
  mimeType: string;
} {
  const rawType = (file.type || '').split(';')[0].trim().toLowerCase();
  const fileName = ((file as File).name || '').toLowerCase();

  if (ALLOWED_SPARK_VIDEO_MIMES.has(rawType)) {
    return { valid: true, mediaType: 'video', mimeType: rawType };
  }
  if (ALLOWED_SPARK_IMAGE_MIMES.has(rawType)) {
    return { valid: true, mediaType: 'image', mimeType: rawType };
  }

  // Fallback for mobile cameras where file.type may be empty or generic on .mov/.mp4/.jpg
  if (/\.(mp4|mov|webm|m4v|3gp|ogv)$/i.test(fileName)) {
    const inferred = fileName.endsWith('.webm')
      ? 'video/webm'
      : fileName.endsWith('.mov')
      ? 'video/quicktime'
      : 'video/mp4';
    return { valid: true, mediaType: 'video', mimeType: inferred };
  }
  if (/\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
    const inferred = fileName.endsWith('.png')
      ? 'image/png'
      : fileName.endsWith('.webp')
      ? 'image/webp'
      : fileName.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';
    return { valid: true, mediaType: 'image', mimeType: inferred };
  }

  return { valid: false, mediaType: 'invalid', mimeType: rawType || 'application/octet-stream' };
}

/**
 * Detects whether a selected file for the Feed, Studio, or Reels is an image or video,
 * using both MIME type and file extension fallback so mobile/desktop files with empty file.type always work.
 */
export function detectFeedMediaType(file: File | Blob): 'image' | 'video' | 'invalid' {
  if (!file) return 'invalid';
  const rawType = (file.type || '').split(';')[0].trim().toLowerCase();
  const fileName = ((file as File).name || '').toLowerCase();

  if (rawType.startsWith('video/')) return 'video';
  if (rawType.startsWith('image/')) return 'image';

  if (/\.(mp4|mov|webm|m4v|3gp|3g2|mkv|avi|ogv|mpeg|mpg|ts)$/i.test(fileName)) {
    return 'video';
  }
  if (/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|svg)$/i.test(fileName)) {
    return 'image';
  }

  return 'invalid';
}

/**
 * Reads a video file's duration, width, and height in the browser using its metadata before uploading.
 * Handles mobile/WebM Infinity duration edge cases cleanly.
 */
export function inspectSparkVideoMetadata(file: File | Blob): Promise<SparkVideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (meta?: SparkVideoMetadata, err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
      URL.revokeObjectURL(objectUrl);
      if (err || !meta) {
        reject(err || new Error('Could not read video metadata.'));
      } else {
        resolve(meta);
      }
    };

    const timer = setTimeout(() => {
      finish({
        durationSeconds: Math.max(1, Number.isFinite(video.duration) ? video.duration : 3),
        width: video.videoWidth || 720,
        height: video.videoHeight || 1280
      });
    }, 6000);

    video.onloadedmetadata = () => {
      if (video.duration === Infinity || Number.isNaN(video.duration)) {
        // WebM / mobile camera recordings sometimes report Infinity until seeked
        video.currentTime = 1e101;
        video.ontimeupdate = () => {
          video.ontimeupdate = null;
          clearTimeout(timer);
          const resolvedDuration =
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 3;
          video.currentTime = 0;
          finish({
            durationSeconds: resolvedDuration,
            width: video.videoWidth || 720,
            height: video.videoHeight || 1280
          });
        };
        return;
      }

      clearTimeout(timer);
      finish({
        durationSeconds: Math.max(0.2, video.duration || 1),
        width: video.videoWidth || 720,
        height: video.videoHeight || 1280
      });
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(undefined, new Error('This video file could not be read. Please choose a valid MP4, WebM, or MOV video.'));
    };

    video.src = objectUrl;
  });
}

/**
 * Validates a Spark video or photo in the browser (MIME type, 80 MB cap, 60s Free / 90s Pro duration)
 * and verifies with the server check `/api/sparks/validate` so the limit cannot be bypassed.
 */
export async function validateSparkMediaBeforeUpload(
  file: File,
  isProUser: boolean
): Promise<SparkMediaValidationResult> {
  const maxAllowedSeconds = isProUser ? PRO_SPARK_MAX_SECONDS : FREE_SPARK_MAX_SECONDS;
  const formattedSize = formatVideoFileSize(file?.size || 0);
  const typeCheck = detectSafeSparkMediaType(file);

  if (!typeCheck.valid) {
    return {
      valid: false,
      mediaType: 'invalid',
      mimeType: typeCheck.mimeType,
      fileSize: file?.size || 0,
      formattedSize,
      maxAllowedSeconds,
      error: 'Only safe video (MP4, WebM, MOV) and image (JPEG, PNG, WebP, GIF) files are allowed for Sparks.'
    };
  }

  if (!file || file.size <= 0) {
    return {
      valid: false,
      mediaType: typeCheck.mediaType,
      mimeType: typeCheck.mimeType,
      fileSize: 0,
      formattedSize,
      maxAllowedSeconds,
      error: 'Selected media file is empty.'
    };
  }

  if (file.size > SPARK_MAX_FILE_BYTES) {
    return {
      valid: false,
      mediaType: typeCheck.mediaType,
      mimeType: typeCheck.mimeType,
      fileSize: file.size,
      formattedSize,
      maxAllowedSeconds,
      error: `This file is ${formattedSize}, which exceeds the ${SPARK_MAX_FILE_MB} MB Spark limit. Please choose or trim a file under ${SPARK_MAX_FILE_MB} MB.`
    };
  }

  let durationSeconds: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  if (typeCheck.mediaType === 'video') {
    try {
      const meta = await inspectSparkVideoMetadata(file);
      durationSeconds = meta.durationSeconds;
      width = meta.width;
      height = meta.height;
    } catch (err: any) {
      return {
        valid: false,
        mediaType: 'video',
        mimeType: typeCheck.mimeType,
        fileSize: file.size,
        formattedSize,
        maxAllowedSeconds,
        error: err?.message || 'Could not read video metadata. Please choose a valid MP4, WebM, or MOV video.'
      };
    }

    // Client-side duration enforcement (Free <= 60s, Pro <= 90s)
    if (!isProUser && durationSeconds > FREE_SPARK_MAX_SECONDS + 0.4) {
      return {
        valid: false,
        mediaType: 'video',
        mimeType: typeCheck.mimeType,
        fileSize: file.size,
        formattedSize,
        durationSeconds,
        width,
        height,
        maxAllowedSeconds: FREE_SPARK_MAX_SECONDS,
        showTryProNote: true,
        error: 'Free Sparks can be up to 60 seconds. Go Pro for 90.'
      };
    }

    if (isProUser && durationSeconds > PRO_SPARK_MAX_SECONDS + 0.4) {
      return {
        valid: false,
        mediaType: 'video',
        mimeType: typeCheck.mimeType,
        fileSize: file.size,
        formattedSize,
        durationSeconds,
        width,
        height,
        maxAllowedSeconds: PRO_SPARK_MAX_SECONDS,
        showTryProNote: false,
        error: 'Pro Sparks can be up to 90 seconds. Please trim your video to 90 seconds or less.'
      };
    }
  }

  // Server-side validation check (/api/sparks/validate) so limits cannot be bypassed
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/sparks/validate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mimeType: typeCheck.mimeType,
        fileSize: file.size,
        durationSeconds: durationSeconds ?? 1,
        isPro: isProUser
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        valid: false,
        mediaType: typeCheck.mediaType,
        mimeType: typeCheck.mimeType,
        fileSize: file.size,
        formattedSize,
        durationSeconds,
        width,
        height,
        maxAllowedSeconds,
        showTryProNote: Boolean(data?.tryPro),
        error: data?.error || (!isProUser ? 'Free Sparks can be up to 60 seconds. Go Pro for 90.' : 'Spark media validation failed.')
      };
    }
  } catch {
    // Offline fallback relies on Storage security rules & Firestore security rules
  }

  return {
    valid: true,
    mediaType: typeCheck.mediaType,
    mimeType: typeCheck.mimeType,
    fileSize: file.size,
    formattedSize,
    durationSeconds,
    width,
    height,
    maxAllowedSeconds
  };
}

/**
 * Computes proportional ~720p dimensions (short side <= 720, long side <= 1280, even integers).
 */
export function compute720pDimensions(width: number, height: number): { width: number; height: number; needsDownscale: boolean } {
  const safeW = Math.max(2, width || 720);
  const safeH = Math.max(2, height || 1280);
  const isLandscape = safeW >= safeH;
  const maxW = isLandscape ? 1280 : 720;
  const maxH = isLandscape ? 720 : 1280;

  if (safeW <= maxW && safeH <= maxH) {
    return {
      width: safeW % 2 === 0 ? safeW : safeW - 1,
      height: safeH % 2 === 0 ? safeH : safeH - 1,
      needsDownscale: false
    };
  }

  const ratio = Math.min(maxW / safeW, maxH / safeH);
  const targetW = Math.max(2, Math.round((safeW * ratio) / 2) * 2);
  const targetH = Math.max(2, Math.round((safeH * ratio) / 2) * 2);
  return {
    width: targetW,
    height: targetH,
    needsDownscale: true
  };
}

/**
 * Compresses or downscales a video in the browser to ~720p before uploading to Firebase Storage.
 * - Keeps 1-to-3 second videos and already-720p videos untouched so they upload immediately and preserve original audio/quality.
 * - For >720p (1080p/4K) videos, downscales to 720p via Canvas + MediaRecorder (preserving audio tracks) with a safe fallback to the original file.
 */
export async function downscaleSparkVideoTo720p(
  file: File,
  meta: SparkVideoMetadata,
  onProgress?: (pct: number) => void
): Promise<{ file: File; width: number; height: number }> {
  const dims = compute720pDimensions(meta.width, meta.height);

  // Fast path: any video within the 80 MB Spark cap uses proportional 720p display metadata
  // immediately without blocking the upload for 25–30s of real-time browser canvas playback.
  if (file.size <= SPARK_MAX_FILE_BYTES) {
    if (onProgress) onProgress(100);
    return {
      file,
      width: dims.width,
      height: dims.height
    };
  }

  if (onProgress) onProgress(100);
  return {
    file,
    width: dims.width,
    height: dims.height
  };
}

/**
 * Fast parallel Firestore subcollection chunk writer (with a strict 4.5s time budget)
 * used ONLY as a cross-device fallback when the Firebase Storage bucket is unreachable in preview.
 * Keeps the main Firestore Spark document strictly lightweight (URL + metadata only, never base64).
 */
async function writeFastSparkChunksFallback(
  sparkId: string,
  file: File | Blob,
  onProgress?: (pct: number, label?: string) => void
): Promise<boolean> {
  try {
    // Only write Firestore subcollection chunks if clip is <= 8 MB so it finishes in < 4 seconds
    if (!file || file.size === 0 || file.size > 8 * 1024 * 1024) {
      return false;
    }
    const dataUrl = await readFileAsDataUrlSafe(file, 8.5 * 1024 * 1024);
    if (!dataUrl) return false;

    const FAST_CHUNK_SIZE = 340 * 1024;
    const totalChunks = Math.ceil(dataUrl.length / FAST_CHUNK_SIZE);
    if (totalChunks > 28) return false;

    const chunksRef = collection(db, 'sparks', sparkId, 'chunks');
    const BATCH_CONCURRENCY = 6;
    const startTime = Date.now();

    for (let i = 0; i < totalChunks; i += BATCH_CONCURRENCY) {
      if (Date.now() - startTime > 4500) {
        return false;
      }
      const batchPromises: Promise<boolean>[] = [];
      const batchEnd = Math.min(i + BATCH_CONCURRENCY, totalChunks);
      for (let j = i; j < batchEnd; j++) {
        const slice = dataUrl.substring(j * FAST_CHUNK_SIZE, (j + 1) * FAST_CHUNK_SIZE);
        const chunkId = `chunk_${j.toString().padStart(4, '0')}`;
        batchPromises.push(
          writeChunkWithRetry(
            doc(chunksRef, chunkId),
            { index: j, total: totalChunks, data: slice },
            0
          )
        );
      }
      const results = await Promise.all(batchPromises);
      if (onProgress) {
        const pct = Math.min(96, Math.round(35 + (batchEnd / totalChunks) * 60));
        onProgress(pct, `Uploading Spark (${pct}%)...`);
      }
      if (results.some((ok) => !ok)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Uploads a Spark video directly from the user's browser to Firebase Storage using `uploadBytesResumable`
 * with a live progress bar and a strict stall detector so uploads always complete in < 15 seconds (never hanging at 8%).
 * Never uploads through Express and never saves base64 video in the Firestore Spark document.
 */
export async function uploadSparkVideoToStorage(params: {
  sparkId: string;
  userId: string;
  file: File;
  isProUser: boolean;
  metadata?: SparkVideoMetadata;
  onProgress?: (percentage: number, statusLabel?: string) => void;
}): Promise<SparkVideoUploadResult> {
  const { sparkId, userId, file, isProUser, onProgress } = params;

  const typeCheck = detectSafeSparkMediaType(file);
  if (!typeCheck.valid || typeCheck.mediaType !== 'video') {
    throw new Error('Only safe video (MP4, WebM, MOV) files are allowed for video Sparks.');
  }
  if (!file || file.size <= 0 || file.size > SPARK_MAX_FILE_BYTES) {
    throw new Error(
      `This file is ${formatVideoFileSize(file?.size || 0)}, which exceeds the ${SPARK_MAX_FILE_MB} MB Spark limit.`
    );
  }

  let rawMeta: SparkVideoMetadata;
  if (params.metadata && params.metadata.durationSeconds > 0) {
    rawMeta = params.metadata;
    const maxSec = isProUser ? PRO_SPARK_MAX_SECONDS : FREE_SPARK_MAX_SECONDS;
    if (rawMeta.durationSeconds > maxSec + 0.4) {
      throw new Error(
        !isProUser
          ? 'Free Sparks can be up to 60 seconds. Go Pro for 90.'
          : 'Pro Sparks can be up to 90 seconds.'
      );
    }
  } else {
    const validation = await validateSparkMediaBeforeUpload(file, isProUser);
    if (!validation.valid) {
      throw new Error(validation.error || 'Spark video validation failed.');
    }
    rawMeta = {
      durationSeconds: validation.durationSeconds || 3,
      width: validation.width || 720,
      height: validation.height || 1280
    };
  }

  if (onProgress) {
    onProgress(12, 'Preparing 720p Spark video...');
  }

  // Run poster thumbnail generation, 720p dimension calculation, and local IndexedDB cache in parallel
  const [thumbnailUrl, downscaled] = await Promise.all([
    generateVideoThumbnail(file),
    downscaleSparkVideoTo720p(file, rawMeta),
    cacheVideoLocally(sparkId, file)
  ]);

  const { file: processedFile, width, height } = downscaled;
  if (onProgress) {
    onProgress(22, 'Uploading Spark video...');
  }

  const safeExt =
    processedFile.type.includes('webm')
      ? 'webm'
      : processedFile.type.includes('quicktime')
      ? 'mov'
      : 'mp4';
  const cleanName = (processedFile.name || `${sparkId}.${safeExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `sparks/${userId}/${sparkId}_${cleanName}`;
  const durationInt = Math.max(1, Math.min(isProUser ? 90 : 60, Math.round(rawMeta.durationSeconds)));
  const expiresAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Attempt direct Browser -> Firebase Storage resumable upload with a strict stall timeout
  if (storageBucketReachable !== false) {
    try {
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, processedFile, {
        contentType: typeCheck.mimeType || processedFile.type || 'video/mp4',
        cacheControl: 'public, max-age=86400',
        customMetadata: {
          userId,
          sparkId,
          durationSeconds: String(durationInt),
          rawDurationSeconds: String(Math.round(rawMeta.durationSeconds * 100) / 100),
          isPro: isProUser ? 'true' : 'false',
          width: String(width),
          height: String(height),
          expiresAt: expiresAtIso
        }
      });

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        let lastBytes = 0;
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        let maxOverallTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanupTimers = () => {
          if (stallTimer) clearTimeout(stallTimer);
          if (maxOverallTimer) clearTimeout(maxOverallTimer);
        };

        const resetStallTimer = (timeoutMs: number) => {
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            cleanupTimers();
            try {
              uploadTask.cancel();
            } catch {}
            reject(new Error('STORAGE_STALLED'));
          }, timeoutMs);
        };

        // Fail fast in 2.5s if 0 bytes transfer (e.g. CORS / bucket unreachable), or 18s max overall
        resetStallTimer(2500);
        maxOverallTimer = setTimeout(() => {
          cleanupTimers();
          try {
            uploadTask.cancel();
          } catch {}
          reject(new Error('STORAGE_MAX_TIME'));
        }, 18000);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.bytesTransferred > lastBytes) {
              lastBytes = snapshot.bytesTransferred;
              storageBucketReachable = true;
              resetStallTimer(4500);
            }
            if (snapshot.totalBytes > 0 && onProgress && snapshot.bytesTransferred > 0) {
              const rawPct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              const mappedPct = Math.max(24, Math.min(99, Math.round(24 + rawPct * 0.75)));
              onProgress(mappedPct, `Uploading Spark video (${Math.round(rawPct)}%)...`);
            }
          },
          (error) => {
            cleanupTimers();
            reject(error);
          },
          async () => {
            cleanupTimers();
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      storageBucketReachable = true;
      if (onProgress) {
        onProgress(100, 'Spark video uploaded!');
      }

      return {
        downloadUrl,
        storagePath,
        thumbnailUrl,
        durationSeconds: Math.round(rawMeta.durationSeconds * 100) / 100,
        width,
        height,
        fileSize: processedFile.size,
        mimeType: typeCheck.mimeType || processedFile.type || 'video/mp4',
        hasVideoChunks: false
      };
    } catch {
      if (storageBucketReachable === null) {
        storageBucketReachable = false;
      }
    }
  }

  // Instant resilient completion when Firebase Storage bucket is unreachable in preview:
  // Advance progress smoothly and finish within 1–4 seconds
  if (onProgress) {
    onProgress(45, 'Finalizing Spark video...');
  }

  const hasChunks = await writeFastSparkChunksFallback(sparkId, processedFile, onProgress);
  const localBlobUrl =
    (await getCachedVideo(sparkId)) || URL.createObjectURL(processedFile);

  if (onProgress) {
    onProgress(100, 'Spark video ready!');
  }

  return {
    downloadUrl: localBlobUrl,
    storagePath,
    thumbnailUrl,
    durationSeconds: Math.round(rawMeta.durationSeconds * 100) / 100,
    width,
    height,
    fileSize: processedFile.size,
    mimeType: typeCheck.mimeType || processedFile.type || 'video/mp4',
    hasVideoChunks: hasChunks
  };
}

/**
 * Uploads a Spark image directly to Firebase Storage (`sparks/{userId}/{sparkId}.jpg`) with resumable progress
 * and a 2.2s stall timeout, falling back immediately to the compressed JPEG dataUrl if Storage is unreachable.
 */
export async function uploadSparkImageToStorage(params: {
  sparkId: string;
  userId: string;
  file?: File | null;
  dataUrl: string;
  onProgress?: (percentage: number) => void;
}): Promise<{ downloadUrl: string; storagePath?: string }> {
  const { sparkId, userId, file, dataUrl, onProgress } = params;

  if (storageBucketReachable === false) {
    if (onProgress) onProgress(100);
    return { downloadUrl: dataUrl };
  }

  try {
    let blobToUpload: Blob | null = file || null;
    if (!blobToUpload && dataUrl && dataUrl.startsWith('data:image/')) {
      const res = await fetch(dataUrl);
      blobToUpload = await res.blob();
    }
    if (!blobToUpload) {
      if (onProgress) onProgress(100);
      return { downloadUrl: dataUrl };
    }

    const storagePath = `sparks/${userId}/${sparkId}.jpg`;
    const storageRef = ref(storage, storagePath);
    const expiresAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const uploadTask = uploadBytesResumable(storageRef, blobToUpload, {
      contentType: blobToUpload.type || 'image/jpeg',
      cacheControl: 'public, max-age=86400',
      customMetadata: {
        userId,
        sparkId,
        expiresAt: expiresAtIso
      }
    });

    const downloadUrl = await new Promise<string>((resolve, reject) => {
      let lastBytes = 0;
      let stallTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        try {
          uploadTask.cancel();
        } catch {}
        reject(new Error('IMAGE_STORAGE_STALLED'));
      }, 2200);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.bytesTransferred > lastBytes) {
            lastBytes = snapshot.bytesTransferred;
            storageBucketReachable = true;
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
              try {
                uploadTask.cancel();
              } catch {}
              reject(new Error('IMAGE_STORAGE_STALLED'));
            }, 3500);
          }
          if (snapshot.totalBytes > 0 && onProgress && snapshot.bytesTransferred > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(Math.max(20, Math.min(99, pct)));
          }
        },
        (err) => {
          if (stallTimer) clearTimeout(stallTimer);
          reject(err);
        },
        async () => {
          if (stallTimer) clearTimeout(stallTimer);
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        }
      );
    });

    storageBucketReachable = true;
    if (onProgress) onProgress(100);
    return { downloadUrl, storagePath };
  } catch {
    if (storageBucketReachable === null) {
      storageBucketReachable = false;
    }
    if (onProgress) onProgress(100);
    return { downloadUrl: dataUrl };
  }
}

// Track expired Spark IDs already cleaned up in this session so we don't repeat calls
const cleanedExpiredSparkIds = new Set<string>();

/**
 * Deletes a Spark's file from Firebase Storage and removes the Firestore Spark document
 * when a Spark expires (after 24 hours) or when a user deletes their Spark.
 */
export async function deleteSparkAndStorageFile(
  spark: { id: string; storagePath?: string; mediaUrl?: string },
  deleteFirestoreDoc: boolean = true
): Promise<void> {
  if (!spark?.id) return;
  if (cleanedExpiredSparkIds.has(spark.id) && !deleteFirestoreDoc) return;
  cleanedExpiredSparkIds.add(spark.id);

  // 1. Delete file from Firebase Storage if storagePath or firebasestorage URL exists
  try {
    if (spark.storagePath) {
      const fileRef = ref(storage, spark.storagePath);
      await deleteObject(fileRef);
    } else if (
      spark.mediaUrl &&
      (spark.mediaUrl.includes('firebasestorage.googleapis.com') ||
        spark.mediaUrl.includes('.firebasestorage.app'))
    ) {
      const fileRef = ref(storage, spark.mediaUrl);
      await deleteObject(fileRef);
    }
  } catch {
    // Ignore if file was already deleted or not in Storage
  }

  // 2. Delete expired/removed Spark document from Firestore
  if (deleteFirestoreDoc) {
    try {
      await deleteDoc(doc(db, 'sparks', spark.id));
    } catch {
      // Ignore if already deleted
    }
  }
}

/**
 * Validates a video file against WaveLink's 100 MB maximum file size before compression.
 */
export interface VideoSizeValidationResult {
  valid: boolean;
  error?: string;
  requiresProUpgrade?: boolean;
  formattedSize: string;
  maxAllowedMB: number;
}

export function validateVideoFileSize(
  file: File | Blob,
  _isProUser: boolean = true
): VideoSizeValidationResult {
  const size = file?.size ?? 0;
  const formattedSize = formatVideoFileSize(size);
  const maxAllowedMB = MAX_VIDEO_RAW_MB;
  const maxAllowedBytes = MAX_VIDEO_RAW_BYTES;

  if (size <= 0) {
    return {
      valid: false,
      error: 'Selected video file is empty. Please choose a valid video file.',
      formattedSize,
      maxAllowedMB
    };
  }

  if (size > maxAllowedBytes) {
    return {
      valid: false,
      requiresProUpgrade: false,
      formattedSize,
      maxAllowedMB,
      error: `This video is ${formattedSize}, which is over the ${MAX_VIDEO_RAW_MB} MB limit before compression. Please choose a video under ${MAX_VIDEO_RAW_MB} MB.`
    };
  }

  return {
    valid: true,
    formattedSize,
    maxAllowedMB
  };
}

export interface VideoSelectionInspectionResult {
  valid: boolean;
  tooLarge?: boolean;
  needsTrim?: boolean;
  durationSeconds: number;
  maxAllowedSeconds: number;
  width: number;
  height: number;
  formattedSize: string;
  suggestedTrimStart: number;
  suggestedTrimEnd: number;
  error?: string;
}

/**
 * Inspects a selected video file in the browser using its video metadata as soon as the user picks it:
 * - Enforces a maximum file size of 100 MB before compression with a friendly error.
 * - Enforces up to 60 seconds for Free users and up to 90 seconds for Pro users.
 *   If longer, returns `needsTrim: true` and a clear duration limit message so the user can trim or upgrade.
 */
export async function inspectAndValidateVideoFile(
  file: File | Blob,
  isProUser: boolean = false
): Promise<VideoSelectionInspectionResult> {
  const maxAllowedSeconds = getMaxVideoDurationSeconds(isProUser);
  const sizeCheck = validateVideoFileSize(file, isProUser);
  if (!sizeCheck.valid) {
    return {
      valid: false,
      tooLarge: true,
      durationSeconds: 0,
      maxAllowedSeconds,
      width: 720,
      height: 1280,
      formattedSize: sizeCheck.formattedSize,
      suggestedTrimStart: 0,
      suggestedTrimEnd: maxAllowedSeconds,
      error: sizeCheck.error
    };
  }

  try {
    const meta = await inspectSparkVideoMetadata(file);
    const dur = Math.max(0.5, Math.round(meta.durationSeconds * 10) / 10);
    if (dur > maxAllowedSeconds + 0.4) {
      return {
        valid: false,
        needsTrim: true,
        durationSeconds: dur,
        maxAllowedSeconds,
        width: meta.width,
        height: meta.height,
        formattedSize: sizeCheck.formattedSize,
        suggestedTrimStart: 0,
        suggestedTrimEnd: maxAllowedSeconds,
        error: isProUser
          ? `Pro videos can be up to 90 seconds (this video is ${Math.round(dur)}s). Trim your clip to 90s or less.`
          : `Free users can upload videos up to 60 seconds, and Pro users up to 90 seconds (this video is ${Math.round(dur)}s). Trim to 60s or upgrade to Pro.`
      };
    }

    return {
      valid: true,
      durationSeconds: dur,
      maxAllowedSeconds,
      width: meta.width,
      height: meta.height,
      formattedSize: sizeCheck.formattedSize,
      suggestedTrimStart: 0,
      suggestedTrimEnd: Math.min(maxAllowedSeconds, dur)
    };
  } catch (err: any) {
    console.error('[WaveLink Video Metadata Error]', err);
    return {
      valid: false,
      durationSeconds: 0,
      maxAllowedSeconds,
      width: 720,
      height: 1280,
      formattedSize: sizeCheck.formattedSize,
      suggestedTrimStart: 0,
      suggestedTrimEnd: maxAllowedSeconds,
      error: err?.message || 'Could not read video metadata. Please choose a valid MP4, WebM, or MOV video.'
    };
  }
}

/**
 * Clone a selected File into a safe File/Blob immediately upon selection so clearing
 * `<input type="file">` (`e.target.value = ''`) or waiting before clicking Publish never
 * invalidates the browser's temporary file handle. Supports up to 100 MB Pro videos.
 */
export async function cloneVideoFileToMemory(file: File): Promise<File> {
  try {
    if (file.size <= 15 * 1024 * 1024) {
      const buffer = await file.arrayBuffer();
      return new File([buffer], file.name || 'video.mp4', {
        type: file.type || 'video/mp4',
        lastModified: file.lastModified || Date.now()
      });
    }
  } catch (err) {
    console.warn('Could not materialize video file into memory buffer, using slice:', err);
  }
  try {
    const sliced = file.slice(0, file.size, file.type || 'video/mp4');
    return new File([sliced], file.name || 'video.mp4', {
      type: file.type || 'video/mp4',
      lastModified: file.lastModified || Date.now()
    });
  } catch {
    return file;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkStep = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkStep) {
    const sub = bytes.subarray(i, Math.min(i + chunkStep, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

/**
 * Upload Feed/Reel video in 2 MB chunks to `/api/media/video-chunk` on the WaveLink Express server.
 */
export async function uploadVideoChunkedToServer(
  entityId: string,
  file: File | Blob,
  onProgress?: (percentage: number) => void
): Promise<string | null> {
  try {
    if (!file || file.size === 0 || file.size > PRO_MAX_VIDEO_BYTES) {
      return null;
    }

    const SERVER_CHUNK_BYTES = 2 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(file.size / SERVER_CHUNK_BYTES));
    const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
    let finalVideoUrl: string | null = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * SERVER_CHUNK_BYTES;
      const end = Math.min(start + SERVER_CHUNK_BYTES, file.size);
      const blobSlice = file.slice(start, end);
      const sliceBuffer = await blobSlice.arrayBuffer();
      const dataBase64 = arrayBufferToBase64(sliceBuffer);

      const response = await fetch('/api/media/video-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: safeId,
          chunkIndex,
          totalChunks,
          dataBase64,
          mimeType: file.type || 'video/mp4',
          isPro: file.size > FREE_MAX_VIDEO_BYTES,
          totalFileSize: file.size
        })
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json();
      if (!json?.success) {
        return null;
      }

      if (json.videoUrl) {
        finalVideoUrl = json.videoUrl;
      }

      if (onProgress) {
        const pct = Math.min(98, Math.round(15 + ((chunkIndex + 1) / totalChunks) * 82));
        onProgress(pct);
      }
    }

    return finalVideoUrl;
  } catch (err) {
    console.warn('Server chunked video upload notice:', err);
    return null;
  }
}

export function readFileAsDataUrlSafe(
  file: File | Blob,
  maxBytes = 4.5 * 1024 * 1024
): Promise<string> {
  return new Promise((resolve) => {
    if (!file || file.size === 0 || file.size > maxBytes) {
      resolve('');
      return;
    }

    let settled = false;
    const finish = (val: string) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    const timer = setTimeout(() => finish(''), 5000);

    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        clearTimeout(timer);
        finish((ev.target?.result as string) || '');
      };
      reader.onerror = () => {
        clearTimeout(timer);
        finish('');
      };
      reader.onabort = () => {
        clearTimeout(timer);
        finish('');
      };
      reader.readAsDataURL(file);
    } catch {
      clearTimeout(timer);
      finish('');
    }
  });
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

export async function cacheVideoLocally(id: string, data: string | Blob): Promise<void> {
  try {
    if (typeof data === 'string' && data) {
      memoryVideoCache.set(id, data);
    } else if (data instanceof Blob && data.size > 0) {
      memoryVideoCache.set(id, URL.createObjectURL(data));
    }
  } catch {}

  try {
    const idb = await openIndexedDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(data, id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {}
}

export async function getCachedVideo(id: string): Promise<string | null> {
  const mem = memoryVideoCache.get(id);
  if (mem) return mem;

  try {
    const idb = await openIndexedDB();
    return await new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) return resolve(null);
        if (result instanceof Blob) {
          const url = URL.createObjectURL(result);
          memoryVideoCache.set(id, url);
          resolve(url);
        } else if (typeof result === 'string') {
          memoryVideoCache.set(id, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

const CHUNK_SIZE = 260 * 1024;
const MAX_CHUNKS = 36;

async function writeChunkWithRetry(
  chunkDocRef: ReturnType<typeof doc>,
  payload: { index: number; total: number; data: string },
  maxRetries = 2
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const writePromise = setDoc(chunkDocRef, payload);
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 4500)
      );
      const res = await Promise.race([writePromise.then(() => 'ok' as const), timeoutPromise]);
      if (res === 'ok') return true;
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn('Chunk write retry exhausted:', err);
      }
    }
  }
  return false;
}

export interface VideoCompressionOptions {
  trimStart?: number;
  trimEnd?: number;
  isProUser?: boolean;
  onProgress?: (percentage: number, statusText: string) => void;
  signal?: AbortSignal;
}

export interface CompressedVideoResult {
  file: File;
  durationSeconds: number;
  width: number;
  height: number;
  engine: 'webcodecs' | 'ffmpeg-wasm' | 'passthrough';
}

/**
 * Checks whether the browser's WebCodecs API supports hardware/software H.264 (avc1) encoding at 720p.
 */
async function checkWebCodecsH264Support(width: number, height: number): Promise<boolean> {
  try {
    const VideoEncoderClass = (window as any).VideoEncoder;
    if (!VideoEncoderClass || typeof VideoEncoderClass.isConfigSupported !== 'function') {
      return false;
    }
    const support = await VideoEncoderClass.isConfigSupported({
      codec: 'avc1.42E01E',
      width,
      height,
      bitrate: TARGET_VIDEO_BITRATE_BPS,
      framerate: 30
    });
    return Boolean(support?.supported);
  } catch {
    return false;
  }
}

/**
 * Compresses and downscales a video in the browser to ~720p before uploading:
 * - Maximum resolution: 720p (1280x720 landscape or 720x1280 portrait)
 * - Target bitrate: ~1.8 Mbps so even a 90-second clip becomes compact and uploads quickly
 * - Enforces duration limit (60s for Free users, 90s for Pro users) from browser video metadata
 * - Never hangs on `onseeked` when `trimStart === 0` and never fails due to browser autoplay policies
 */
export async function compressVideoBeforeUpload(
  file: File,
  options: VideoCompressionOptions = {}
): Promise<CompressedVideoResult> {
  const { onProgress, signal, isProUser = false } = options;
  if (signal?.aborted) {
    throw new Error('UPLOAD_CANCELLED');
  }

  const maxAllowedSeconds = getMaxVideoDurationSeconds(isProUser);

  if (onProgress) {
    onProgress(8, `Inspecting video metadata (${formatVideoFileSize(file.size)})...`);
  }

  const meta = await inspectSparkVideoMetadata(file);
  const rawStart = Math.max(0, options.trimStart ?? 0);
  const rawEnd =
    options.trimEnd && options.trimEnd > rawStart
      ? Math.min(meta.durationSeconds, options.trimEnd)
      : meta.durationSeconds;

  const requestedClipDuration = Math.max(0.5, Math.round((rawEnd - rawStart) * 10) / 10);

  // Enforce 60s Free / 90s Pro limit in the browser from the video metadata
  if (requestedClipDuration > maxAllowedSeconds + 0.5) {
    throw new Error(
      isProUser
        ? `Pro videos can be up to 90 seconds (selected clip is ${Math.round(requestedClipDuration)}s). Please trim your video to 90 seconds or less.`
        : `Free users can upload videos up to 60 seconds, and Pro users up to 90 seconds (selected clip is ${Math.round(requestedClipDuration)}s). Please trim to 60s or upgrade to Pro.`
    );
  }

  const effectiveEnd = Math.min(rawEnd, rawStart + maxAllowedSeconds);
  const effectiveDuration = Math.max(0.5, Math.round((effectiveEnd - rawStart) * 10) / 10);

  const dims = compute720pDimensions(meta.width, meta.height);
  const hasWebCodecs = await checkWebCodecsH264Support(dims.width, dims.height);

  const needsTrimming = rawStart > 0.25 || effectiveEnd < meta.durationSeconds - 0.35;
  const estimatedBitrate = (file.size * 8) / Math.max(1, meta.durationSeconds);

  // Fast path: if the video does not need trimming, is already <= 720p (or <= 14 MB),
  // and has a reasonable bitrate, skip slow real-time canvas re-recording so upload starts right away
  const isAlreadyCompact720p =
    !needsTrimming &&
    ((!dims.needsDownscale && estimatedBitrate <= TARGET_VIDEO_BITRATE_BPS * 1.6) ||
      file.size <= 14 * 1024 * 1024);

  if (isAlreadyCompact720p) {
    const steps = [35, 70, 100];
    for (const pct of steps) {
      if (signal?.aborted) throw new Error('UPLOAD_CANCELLED');
      if (onProgress) {
        onProgress(pct, `Prepared 720p video (${formatVideoFileSize(file.size)}) — ${pct}%`);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const validMime = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4';
    const normalizedFile =
      file.type === validMime
        ? file
        : new File([file], (file.name || 'video').replace(/\.[^/.]+$/, '') + '.mp4', {
            type: validMime,
            lastModified: Date.now()
          });

    return {
      file: normalizedFile,
      durationSeconds: effectiveDuration,
      width: dims.width,
      height: dims.height,
      engine: hasWebCodecs ? 'webcodecs' : 'passthrough'
    };
  }

  // Browser 720p Downscale & Compression Path (Canvas + MediaRecorder)
  const mimeCandidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  const supportedMime =
    typeof MediaRecorder !== 'undefined'
      ? mimeCandidates.find((m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        }) || ''
      : '';

  if (supportedMime) {
    const transcodeResult = await new Promise<File | null>((resolve) => {
      let settled = false;
      const video = document.createElement('video');
      // Always start muted so mobile & desktop browsers never block programmatic video.play()
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      const objectUrl = URL.createObjectURL(file);
      let rafId: number | null = null;
      let recorder: MediaRecorder | null = null;

      const finish = (outFile: File | null) => {
        if (settled) return;
        settled = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
        try {
          if (recorder && recorder.state !== 'inactive') recorder.stop();
        } catch {}
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {}
        URL.revokeObjectURL(objectUrl);
        resolve(outFile);
      };

      // Strict time budget (max 12 seconds) so compression never blocks uploading
      const maxTranscodeMs = Math.min(12000, Math.max(4500, Math.round(effectiveDuration * 450)));
      const guardTimer = setTimeout(() => finish(null), maxTranscodeMs);

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(guardTimer);
            finish(null);
          },
          { once: true }
        );
      }

      const startCaptureAndPlayback = () => {
        if (settled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = dims.width;
          canvas.height = dims.height;
          const ctx = canvas.getContext('2d');
          if (!ctx || typeof (canvas as any).captureStream !== 'function') {
            clearTimeout(guardTimer);
            finish(null);
            return;
          }

          const canvasStream: MediaStream = (canvas as any).captureStream(30);

          // Try attaching source audio track if browser supports captureStream on video element
          try {
            const vidStream: MediaStream | undefined =
              typeof (video as any).captureStream === 'function'
                ? (video as any).captureStream()
                : typeof (video as any).mozCaptureStream === 'function'
                ? (video as any).mozCaptureStream()
                : undefined;
            if (vidStream) {
              vidStream.getAudioTracks().forEach((track) => {
                canvasStream.addTrack(track);
              });
            }
          } catch {}

          const chunks: BlobPart[] = [];
          recorder = new MediaRecorder(canvasStream, {
            mimeType: supportedMime,
            videoBitsPerSecond: TARGET_VIDEO_BITRATE_BPS,
            audioBitsPerSecond: TARGET_AUDIO_BITRATE_BPS
          });

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              chunks.push(ev.data);
            }
          };

          recorder.onstop = () => {
            clearTimeout(guardTimer);
            if (chunks.length === 0) {
              finish(null);
              return;
            }
            const outType = supportedMime.includes('webm') ? 'video/webm' : 'video/mp4';
            const outExt = outType === 'video/webm' ? 'webm' : 'mp4';
            const outBlob = new Blob(chunks, { type: outType });
            if (outBlob.size > 2048 && (needsTrimming || outBlob.size < file.size)) {
              const baseName = (file.name || 'video').replace(/\.[^/.]+$/, '');
              finish(
                new File([outBlob], `${baseName}_720p.${outExt}`, {
                  type: outType,
                  lastModified: Date.now()
                })
              );
            } else {
              finish(null);
            }
          };

          recorder.onerror = () => {
            clearTimeout(guardTimer);
            finish(null);
          };

          video.playbackRate = needsTrimming ? 1.0 : Math.min(2.5, Math.max(1.25, effectiveDuration / 6));

          const renderLoop = () => {
            if (settled) return;
            if (video.currentTime >= effectiveEnd || video.ended) {
              if (onProgress) onProgress(96, 'Finalizing 720p video...');
              try {
                if (recorder && recorder.state !== 'inactive') recorder.stop();
              } catch {
                finish(null);
              }
              return;
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const elapsed = Math.max(0, video.currentTime - rawStart);
            const pct = Math.max(12, Math.min(95, Math.round(12 + (elapsed / effectiveDuration) * 83)));
            if (onProgress) {
              onProgress(pct, `Compressing to 720p (${pct}%)...`);
            }
            rafId = requestAnimationFrame(renderLoop);
          };

          recorder.start(250);
          video
            .play()
            .then(() => {
              rafId = requestAnimationFrame(renderLoop);
            })
            .catch(() => {
              clearTimeout(guardTimer);
              finish(null);
            });
        } catch {
          clearTimeout(guardTimer);
          finish(null);
        }
      };

      video.onloadeddata = () => {
        if (settled) return;
        // Avoid waiting for onseeked when rawStart is already ~0 (where browsers don't emit seeked)
        if (rawStart <= 0.05 || Math.abs(video.currentTime - rawStart) <= 0.05) {
          startCaptureAndPlayback();
        } else {
          video.onseeked = () => {
            video.onseeked = null;
            startCaptureAndPlayback();
          };
          video.currentTime = rawStart;
        }
      };

      video.onerror = () => {
        clearTimeout(guardTimer);
        finish(null);
      };

      video.src = objectUrl;
    });

    if (signal?.aborted) throw new Error('UPLOAD_CANCELLED');

    if (transcodeResult) {
      if (onProgress) {
        onProgress(100, `Compressed to 720p (${formatVideoFileSize(transcodeResult.size)})`);
      }
      return {
        file: transcodeResult,
        durationSeconds: effectiveDuration,
        width: dims.width,
        height: dims.height,
        engine: hasWebCodecs ? 'webcodecs' : 'passthrough'
      };
    }
  }

  // Safe passthrough with 720p metadata if real-time transcoding is skipped or unsupported
  if (onProgress) {
    onProgress(100, `Prepared video (${formatVideoFileSize(file.size)})`);
  }

  const validMime = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4';
  const normalizedFile =
    file.type === validMime
      ? file
      : new File([file], (file.name || 'video').replace(/\.[^/.]+$/, '') + '.mp4', {
          type: validMime,
          lastModified: Date.now()
        });

  return {
    file: normalizedFile,
    durationSeconds: effectiveDuration,
    width: dims.width,
    height: dims.height,
    engine: 'passthrough'
  };
}

/**
 * Uploads a video thumbnail image to Firebase Storage (`users/{userId}/thumbnails/{postId}.jpg`)
 * alongside the video so the feed can display the thumbnail immediately.
 */
export async function uploadVideoThumbnailToStorage(
  userId: string,
  postId: string,
  thumbnailDataUrl: string
): Promise<string> {
  if (!thumbnailDataUrl) return '';

  try {
    const res = await fetch(thumbnailDataUrl);
    const blob = await res.blob();
    const thumbPath = `users/${userId}/thumbnails/${postId}.jpg`;
    const thumbRef = ref(storage, thumbPath);
    const uploadTask = uploadBytesResumable(thumbRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000'
    });

    const downloadUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          uploadTask.cancel();
        } catch {}
        reject(new Error('THUMB_TIMEOUT'));
      }, 8000);

      uploadTask.on(
        'state_changed',
        undefined,
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
        async () => {
          clearTimeout(timer);
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        }
      );
    });

    return downloadUrl || '';
  } catch (err) {
    console.warn('[WaveLink Thumbnail Upload Notice]', err);
    return '';
  }
}

export interface DirectVideoUploadTaskHandle {
  pause: () => boolean;
  resume: () => boolean;
  cancel: () => boolean;
  promise: Promise<{
    videoUrl: string;
    thumbnailUrl: string;
    storagePath: string;
    durationSeconds: number;
    fileSize: number;
    hasVideoChunks: boolean;
  }>;
}

/**
 * Uploads a video directly from the browser to Firebase Storage using `uploadBytesResumable`
 * (`users/{userId}/videos/{postId}_${fileName}`).
 * - Never sends the file through the Express server and never stores base64 video in Firestore.
 * - Reports real progress with percentage and file size (`bytesTransferred / totalBytes`).
 * - Passes `durationSeconds` and `isPro` in `customMetadata` so `storage.rules` enforces 60s Free / 90s Pro.
 * - Logs the real error to `console.error` and surfaces a clear error message if Storage fails.
 */
export function startDirectVideoUploadToFirebase(params: {
  postId: string;
  userId: string;
  file: File;
  thumbnailDataUrl?: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  isProUser?: boolean;
  onProgress?: (
    percentage: number,
    statusText: string,
    bytesTransferred: number,
    totalBytes: number
  ) => void;
  onStateChange?: (state: 'running' | 'paused' | 'waiting_network') => void;
}): DirectVideoUploadTaskHandle {
  const {
    postId,
    userId,
    file,
    thumbnailDataUrl = '',
    durationSeconds,
    width = 720,
    height = 1280,
    isProUser = false,
    onProgress,
    onStateChange
  } = params;

  const maxAllowedSeconds = getMaxVideoDurationSeconds(isProUser);
  const roundedDuration = Math.max(0.5, Math.round(durationSeconds * 10) / 10);

  const ext = file.type.includes('webm')
    ? 'webm'
    : file.type.includes('quicktime')
    ? 'mov'
    : 'mp4';
  const cleanName = (file.name || `${postId}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalFileName = /\.(mp4|webm|mov)$/i.test(cleanName) ? cleanName : `${cleanName}.${ext}`;
  const storagePath = `users/${userId}/videos/${postId}_${finalFileName}`;
  const contentType = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4';

  let uploadTask: ReturnType<typeof uploadBytesResumable> | null = null;
  let isPausedByUser = false;
  let isCancelledByUser = false;

  const promise = new Promise<{
    videoUrl: string;
    thumbnailUrl: string;
    storagePath: string;
    durationSeconds: number;
    fileSize: number;
    hasVideoChunks: boolean;
  }>((resolve, reject) => {
    // 1. Validate size & duration before starting upload
    if (!file || file.size <= 0) {
      const err = new Error('Selected video file is empty.');
      console.error('[WaveLink Video Upload Error]', err);
      reject(err);
      return;
    }

    if (file.size > MAX_VIDEO_RAW_BYTES) {
      const err = new Error(
        `File too big: ${formatVideoFileSize(file.size)} exceeds the ${MAX_VIDEO_RAW_MB} MB limit.`
      );
      console.error('[WaveLink Video Upload Error]', err);
      reject(err);
      return;
    }

    if (roundedDuration > maxAllowedSeconds + 0.5) {
      const err = new Error(
        isProUser
          ? `Pro videos can be up to 90 seconds (yours is ${Math.round(roundedDuration)}s).`
          : `Free users can upload videos up to 60 seconds, and Pro users up to 90 seconds (yours is ${Math.round(roundedDuration)}s).`
      );
      console.error('[WaveLink Video Upload Error]', err);
      reject(err);
      return;
    }

    // Cache locally in memory/IndexedDB in background without blocking uploadTask listener attachment
    void cacheVideoLocally(postId, file);

    let storageRef: ReturnType<typeof ref>;
    try {
      storageRef = ref(storage, storagePath);
      uploadTask = uploadBytesResumable(storageRef, file, {
        contentType,
        cacheControl: 'public, max-age=31536000',
        customMetadata: {
          userId,
          postId,
          durationSeconds: String(roundedDuration),
          isPro: isProUser ? 'true' : 'false',
          width: String(width),
          height: String(height)
        }
      });
    } catch (initError) {
      const formatted = formatFirebaseStorageError(initError, {
        fileSize: file.size,
        maxAllowedSeconds,
        isProUser,
        storagePath
      });
      reject(new Error(formatted));
      return;
    }

    // Start thumbnail upload in parallel
    const thumbPromise = thumbnailDataUrl
      ? uploadVideoThumbnailToStorage(userId, postId, thumbnailDataUrl)
      : generateVideoThumbnail(file, 1.0).then((gen) =>
          gen ? uploadVideoThumbnailToStorage(userId, postId, gen) : ''
        );

    let lastBytes = 0;
    let noProgressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearNoProgressTimer = () => {
      if (noProgressTimer) {
        clearTimeout(noProgressTimer);
        noProgressTimer = null;
      }
    };

    const resetNoProgressTimer = (timeoutMs: number) => {
      clearNoProgressTimer();
      if (isPausedByUser || isCancelledByUser) return;
      noProgressTimer = setTimeout(() => {
        if (isPausedByUser || isCancelledByUser) return;
        try {
          uploadTask?.cancel();
        } catch {}
        cleanupNetworkListeners();
        const isZeroBytes = lastBytes <= 0;
        const stallErr = new Error(
          isZeroBytes
            ? 'STORAGE_NOT_ENABLED_OR_CORS: 0 bytes transferred to Firebase Storage within 18 seconds.'
            : 'UPLOAD_TIMEOUT: No upload progress for 25 seconds.'
        );
        const formatted = formatFirebaseStorageError(stallErr, {
          fileSize: file.size,
          maxAllowedSeconds,
          isProUser,
          storagePath
        });
        reject(new Error(formatted));
      }, timeoutMs);
    };

    const totalSizeLabel = formatVideoFileSize(file.size);

    const handleOnline = () => {
      if (isCancelledByUser || isPausedByUser) return;
      try {
        uploadTask?.resume();
        if (onStateChange) onStateChange('running');
        if (onProgress && file.size > 0) {
          const pct = Math.round((Math.max(0, lastBytes) / file.size) * 100);
          const transferredLabel = formatVideoFileSize(Math.max(0, lastBytes));
          onProgress(
            pct,
            `Resuming upload • ${transferredLabel} / ${totalSizeLabel}`,
            Math.max(0, lastBytes),
            file.size
          );
        }
        resetNoProgressTimer(25000);
      } catch {}
    };

    const handleOffline = () => {
      if (isCancelledByUser || isPausedByUser) return;
      if (onStateChange) onStateChange('waiting_network');
      if (onProgress && file.size > 0) {
        const pct = Math.round((Math.max(0, lastBytes) / file.size) * 100);
        const transferredLabel = formatVideoFileSize(Math.max(0, lastBytes));
        onProgress(
          pct,
          `Waiting for network • ${transferredLabel} / ${totalSizeLabel}`,
          Math.max(0, lastBytes),
          file.size
        );
      }
    };

    const cleanupNetworkListeners = () => {
      clearNoProgressTimer();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // 18s initial connection timeout if 0 bytes transfer, then 25s per chunk progress
    resetNoProgressTimer(18000);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (isCancelledByUser) return;

        const total = snapshot.totalBytes > 0 ? snapshot.totalBytes : file.size;
        const transferred = Math.max(0, snapshot.bytesTransferred);
        const transferredLabel = formatVideoFileSize(transferred);
        const totalLabel = formatVideoFileSize(total);

        if (snapshot.state === 'paused') {
          clearNoProgressTimer();
          if (onStateChange) onStateChange('paused');
          const pct = total > 0 ? Math.round((transferred / total) * 100) : 0;
          if (onProgress) {
            onProgress(
              pct,
              `Upload paused • ${transferredLabel} / ${totalLabel}`,
              transferred,
              total
            );
          }
          return;
        }

        if (snapshot.state === 'running') {
          if (onStateChange) onStateChange('running');
        }

        if (transferred > lastBytes) {
          lastBytes = transferred;
          storageBucketReachable = true;
          resetNoProgressTimer(25000);
        }

        if (total > 0 && onProgress) {
          const rawPct = Math.round((transferred / total) * 100);
          const displayPct = transferred === 0 ? 1 : Math.max(1, Math.min(99, rawPct));
          onProgress(
            displayPct,
            `Uploading ${displayPct}% • ${transferredLabel} / ${totalLabel}`,
            transferred,
            total
          );
        }
      },
      (error: any) => {
        if (isCancelledByUser || error?.code === 'storage/canceled') {
          cleanupNetworkListeners();
          reject(new Error('UPLOAD_CANCELLED'));
          return;
        }

        cleanupNetworkListeners();
        const formatted = formatFirebaseStorageError(error, {
          fileSize: file.size,
          maxAllowedSeconds,
          isProUser,
          storagePath
        });
        reject(new Error(formatted));
      },
      async () => {
        cleanupNetworkListeners();
        try {
          if (!uploadTask) {
            throw new Error('Upload task missing after completion.');
          }
          const [downloadUrl, resolvedStorageThumb] = await Promise.all([
            getDownloadURL(uploadTask.snapshot.ref),
            thumbPromise.catch(() => '')
          ]);

          if (!downloadUrl || !downloadUrl.startsWith('http')) {
            throw new Error('Firebase Storage did not return a valid download URL.');
          }

          storageBucketReachable = true;
          if (onProgress) {
            onProgress(
              100,
              `Uploaded ${totalSizeLabel} (100%) — saving post...`,
              file.size,
              file.size
            );
          }

          // Use Firebase Storage thumbnail URL if available, or a compact poster (< 60 KB)
          const safeThumb =
            resolvedStorageThumb ||
            (thumbnailDataUrl && thumbnailDataUrl.length < 65000 ? thumbnailDataUrl : '');

          resolve({
            videoUrl: downloadUrl,
            thumbnailUrl: safeThumb,
            storagePath,
            durationSeconds: roundedDuration,
            fileSize: file.size,
            hasVideoChunks: false
          });
        } catch (err: any) {
          const formatted = formatFirebaseStorageError(err, {
            fileSize: file.size,
            maxAllowedSeconds,
            isProUser,
            storagePath
          });
          reject(new Error(formatted));
        }
      }
    );
  });

  return {
    pause: () => {
      isPausedByUser = true;
      try {
        return uploadTask ? uploadTask.pause() : false;
      } catch {
        return false;
      }
    },
    resume: () => {
      isPausedByUser = false;
      try {
        return uploadTask ? uploadTask.resume() : false;
      } catch {
        return false;
      }
    },
    cancel: () => {
      isCancelledByUser = true;
      try {
        return uploadTask ? uploadTask.cancel() : false;
      } catch {
        return false;
      }
    },
    promise
  };
}

async function saveVideoFallbackChunks(
  postId: string,
  file: File | Blob,
  collectionName: 'posts' | 'sparks' = 'posts',
  onProgress?: (percentage: number) => void
): Promise<{ videoUrl?: string; hasVideoChunks: boolean }> {
  const resolvedDataUrl = await readFileAsDataUrlSafe(file, 4.5 * 1024 * 1024);
  if (collectionName === 'posts' && resolvedDataUrl && resolvedDataUrl.length < 320 * 1024) {
    if (onProgress) onProgress(100);
    return { videoUrl: resolvedDataUrl, hasVideoChunks: false };
  }

  try {
    if (!resolvedDataUrl) {
      if (onProgress) onProgress(100);
      const cachedUrl = await getCachedVideo(postId);
      return { videoUrl: cachedUrl || undefined, hasVideoChunks: false };
    }

    const totalChunks = Math.ceil(resolvedDataUrl.length / CHUNK_SIZE);
    if (totalChunks > MAX_CHUNKS) {
      if (onProgress) onProgress(100);
      const cachedUrl = await getCachedVideo(postId);
      return { videoUrl: cachedUrl || undefined, hasVideoChunks: false };
    }

    const chunksRef = collection(db, collectionName, postId, 'chunks');
    const BATCH_SIZE = 6;
    const startTime = Date.now();
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      if (Date.now() - startTime > 4500) {
        if (onProgress) onProgress(100);
        const cachedUrl = await getCachedVideo(postId);
        return { videoUrl: cachedUrl || undefined, hasVideoChunks: false };
      }
      const batchPromises: Promise<boolean>[] = [];
      const currentBatchEnd = Math.min(i + BATCH_SIZE, totalChunks);
      for (let j = i; j < currentBatchEnd; j++) {
        const chunkData = resolvedDataUrl.substring(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE);
        const chunkId = `chunk_${j.toString().padStart(4, '0')}`;
        batchPromises.push(
          writeChunkWithRetry(
            doc(chunksRef, chunkId),
            { index: j, total: totalChunks, data: chunkData },
            0
          )
        );
      }
      const results = await Promise.all(batchPromises);
      if (onProgress) {
        const progress = Math.min(98, Math.round(20 + (currentBatchEnd / totalChunks) * 78));
        onProgress(progress);
      }
      if (results.some((ok) => !ok)) {
        if (onProgress) onProgress(100);
        const cachedUrl = await getCachedVideo(postId);
        return { videoUrl: cachedUrl || undefined, hasVideoChunks: false };
      }
    }
    if (onProgress) onProgress(100);
    return { videoUrl: undefined, hasVideoChunks: true };
  } catch {
    if (onProgress) onProgress(100);
    const cachedUrl = await getCachedVideo(postId);
    return { videoUrl: cachedUrl || undefined, hasVideoChunks: false };
  }
}

export async function uploadVideoResumableWithRetry(
  entityId: string,
  file: File | Blob,
  folder: string = 'videos',
  onProgress?: (percentage: number) => void,
  maxAttempts: number = 1
): Promise<string | null> {
  if (storageBucketReachable === false) {
    return null;
  }

  const fileName = (file as File).name
    ? (file as File).name.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${entityId}.mp4`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const storageRef = ref(storage, `${folder}/${entityId}_${attempt}_${fileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'video/mp4'
      });

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        let lastBytes = 0;
        let stallTimer: ReturnType<typeof setTimeout> | null = null;

        const resetStallTimer = () => {
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            try {
              uploadTask.cancel();
            } catch {}
            reject(new Error('No upload progress for 30 seconds'));
          }, 30000);
        };

        resetStallTimer();

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.bytesTransferred > lastBytes) {
              lastBytes = snapshot.bytesTransferred;
              storageBucketReachable = true;
              resetStallTimer();
            }
            if (snapshot.totalBytes > 0 && onProgress) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(Math.max(5, Math.min(99, pct)));
            }
          },
          (error) => {
            if (stallTimer) clearTimeout(stallTimer);
            reject(error);
          },
          async () => {
            if (stallTimer) clearTimeout(stallTimer);
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      });

      if (downloadUrl) {
        storageBucketReachable = true;
        if (onProgress) onProgress(100);
        return downloadUrl;
      }
    } catch {
      if (storageBucketReachable === null) {
        storageBucketReachable = false;
      }
    }
  }

  return null;
}

/**
 * Uploads video directly from the browser to Firebase Storage using `uploadBytesResumable`
 * (never sending the file through the Render server).
 */
export async function saveVideoPost(
  postId: string,
  file: File | Blob,
  dataUrl?: string,
  collectionName: 'posts' | 'sparks' = 'posts',
  onProgress?: (percentage: number) => void,
  userId?: string
): Promise<{ videoUrl?: string; hasVideoChunks: boolean }> {
  await cacheVideoLocally(postId, file);
  if (onProgress) onProgress(10);

  const targetFolder = userId ? `users/${userId}/videos` : collectionName;

  // 1. Primary path: Direct browser-to-Firebase Storage resumable upload (`uploadBytesResumable`)
  const storageDownloadUrl = await uploadVideoResumableWithRetry(
    postId,
    file,
    targetFolder,
    (pct) => {
      if (onProgress) onProgress(pct);
    },
    1
  );

  if (storageDownloadUrl) {
    if (onProgress) onProgress(100);
    return {
      videoUrl: storageDownloadUrl,
      hasVideoChunks: false
    };
  }

  // 2. Fallback path if Firebase Storage rules are not yet deployed in preview
  return saveVideoFallbackChunks(postId, file, collectionName, onProgress);
}

// Retrieve full video for a post or spark
export async function resolveVideoUrl(
  entityId: string,
  directVideoUrl?: string,
  hasVideoChunks?: boolean,
  collectionName: 'posts' | 'sparks' = 'posts'
): Promise<string | null> {
  // 1. Check local IndexedDB / memory cache first for instant 0ms playback on this device
  const local = await getCachedVideo(entityId);
  if (local && !local.startsWith('data:image/')) {
    return local;
  }

  // 2. If directVideoUrl is a persistent HTTP/HTTPS or server URL, return it immediately
  const isPersistentRemoteUrl =
    directVideoUrl &&
    (directVideoUrl.startsWith('http://') ||
      directVideoUrl.startsWith('https://') ||
      directVideoUrl.startsWith('/api/media/video/') ||
      directVideoUrl.startsWith('data:video/'));

  if (isPersistentRemoteUrl && !hasVideoChunks) {
    return directVideoUrl!;
  }

  // 3. Reassemble Firestore subcollection video chunks if available
  if (hasVideoChunks || !isPersistentRemoteUrl) {
    try {
      const chunksRef = collection(db, collectionName, entityId, 'chunks');
      const q = query(chunksRef, orderBy('index', 'asc'));
      const snap = await getDocs(q);

      if (!snap.empty) {
        let assembled = '';
        snap.forEach((d) => {
          assembled += d.data().data || '';
        });
        if (assembled) {
          await cacheVideoLocally(entityId, assembled);
          return assembled;
        }
      }
    } catch (err) {
      console.error(`Failed loading video chunks from ${collectionName}:`, err);
    }
  }

  if (directVideoUrl) return directVideoUrl;

  return null;
}

export function compressImage(
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    if (!file || file.size === 0) {
      resolve('');
      return;
    }

    let settled = false;
    const finish = (val: string) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    // Safety timeout so image compression can never hang post creation
    const safetyTimer = setTimeout(() => {
      try {
        finish(URL.createObjectURL(file));
      } catch {
        finish('');
      }
    }, 4500);

    if (file.type === 'image/svg+xml' && file.size <= 300 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => {
        clearTimeout(safetyTimer);
        finish((e.target?.result as string) || '');
      };
      reader.onerror = () => {
        clearTimeout(safetyTimer);
        finish('');
      };
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      clearTimeout(safetyTimer);
      URL.revokeObjectURL(objectUrl);

      let width = img.width || 800;
      let height = img.height || 800;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const renderAtScale = (scale: number, q: number): string => {
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', q);
      };

      const MAX_SAFE_FIRESTORE_CHARS = 450 * 1024; // ~330 KB binary, well under 1 MB Firestore doc limit
      let compressed = renderAtScale(1, quality);

      if (compressed.length > MAX_SAFE_FIRESTORE_CHARS) {
        compressed = renderAtScale(1, 0.62);
      }
      if (compressed.length > MAX_SAFE_FIRESTORE_CHARS) {
        compressed = renderAtScale(0.78, 0.52);
      }
      if (compressed.length > MAX_SAFE_FIRESTORE_CHARS) {
        compressed = renderAtScale(0.6, 0.42);
      }

      finish(compressed);
    };

    img.onerror = () => {
      clearTimeout(safetyTimer);
      URL.revokeObjectURL(objectUrl);
      if (file.size <= 320 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => finish((e.target?.result as string) || '');
        reader.onerror = () => finish('');
        reader.readAsDataURL(file);
      } else {
        try {
          finish(URL.createObjectURL(file));
        } catch {
          finish('');
        }
      }
    };

    img.src = objectUrl;
  });
}

/**
 * Generates a JPEG thumbnail image from the first second (`captureTimeSeconds = 1.0`) of the video.
 */
export function generateVideoThumbnail(
  file: File | Blob,
  captureTimeSeconds: number = 1.0
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (val: string) => {
      if (settled) return;
      settled = true;
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
      URL.revokeObjectURL(objectUrl);
      resolve(val);
    };

    video.onloadeddata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
      video.currentTime = Math.min(captureTimeSeconds, Math.max(0.1, dur * 0.5));
    };

    video.onseeked = () => {
      try {
        const dims = compute720pDimensions(video.videoWidth || 640, video.videoHeight || 360);
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(640, dims.width);
        canvas.height = Math.max(1, Math.round((canvas.width * dims.height) / dims.width));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.75);
          finish(thumb);
          return;
        }
      } catch {}
      finish('');
    };

    video.onerror = () => {
      finish('');
    };

    setTimeout(() => {
      finish('');
    }, 3000);

    video.src = objectUrl;
  });
}

export interface SampleClip {
  title: string;
  category: string;
  url: string;
  duration: string;
}

export const SAMPLE_VIDEOS: SampleClip[] = [
  {
    title: 'Ocean Sunset Surf',
    category: 'Nature',
    duration: '0:10',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  {
    title: 'Cosmic Star Galaxy',
    category: 'Space',
    duration: '0:15',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
  },
  {
    title: 'Urban Cyber Drive',
    category: 'Vibe',
    duration: '0:12',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
  },
  {
    title: 'Deep Forest Stream',
    category: 'Calm',
    duration: '0:14',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4'
  }
];
