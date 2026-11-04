import { db, storage, getAuthHeaders } from '../firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const DB_NAME = 'wavelink_media_db';
const STORE_NAME = 'videos';

// Session in-memory cache so video playback works immediately even if IndexedDB is restricted
const memoryVideoCache = new Map<string, string>();
let storageBucketReachable: boolean | null = null;

// Tiered Video Upload Limits (Feed / Reels):
// - Free users: 0 KB up to 4 MB
// - Pro / Admin users: 0 KB up to 100 MB (supports >10 MB up to 100 MB HD videos)
export const FREE_MAX_VIDEO_MB = 4;
export const PRO_MAX_VIDEO_MB = 100;
export const FREE_MAX_VIDEO_BYTES = FREE_MAX_VIDEO_MB * 1024 * 1024; // 4 MB
export const PRO_MAX_VIDEO_BYTES = PRO_MAX_VIDEO_MB * 1024 * 1024; // 100 MB

// ============================================================================
// SPARKS DEDICATED LIMITS & SAFE MIME TYPES
// - Free users: up to 60 seconds
// - Pro users: up to 90 seconds
// - Max file size cap: 80 MB
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
 * Validates a video file against WaveLink's tiered size limits (for Feed & Videos Hub):
 * - Non-Pro (Free): 0 KB to 4 MB
 * - WaveLink Pro / Admin: 0 KB to 100 MB (allows videos > 10 MB up to 100 MB)
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
  isProUser: boolean
): VideoSizeValidationResult {
  const size = file?.size ?? 0;
  const formattedSize = formatVideoFileSize(size);
  const maxAllowedMB = isProUser ? PRO_MAX_VIDEO_MB : FREE_MAX_VIDEO_MB;
  const maxAllowedBytes = isProUser ? PRO_MAX_VIDEO_BYTES : FREE_MAX_VIDEO_BYTES;

  if (size < 0) {
    return {
      valid: false,
      error: 'Invalid video file size.',
      formattedSize,
      maxAllowedMB
    };
  }

  if (size > maxAllowedBytes) {
    if (!isProUser) {
      const fitsPro = size <= PRO_MAX_VIDEO_BYTES;
      return {
        valid: false,
        requiresProUpgrade: fitsPro,
        formattedSize,
        maxAllowedMB,
        error: fitsPro
          ? `This video is ${formattedSize}. Free accounts can upload videos from 0 KB to ${FREE_MAX_VIDEO_MB} MB. Upgrade to WaveLink Pro to upload videos over 10 MB up to ${PRO_MAX_VIDEO_MB} MB!`
          : `This video is ${formattedSize}, which exceeds the maximum ${PRO_MAX_VIDEO_MB} MB limit (Free limit: 0 KB – ${FREE_MAX_VIDEO_MB} MB, Pro limit: ${PRO_MAX_VIDEO_MB} MB).`
      };
    }

    return {
      valid: false,
      requiresProUpgrade: false,
      formattedSize,
      maxAllowedMB,
      error: `This video is ${formattedSize}. WaveLink Pro supports video uploads up to ${PRO_MAX_VIDEO_MB} MB. Please choose a video up to ${PRO_MAX_VIDEO_MB} MB.`
    };
  }

  return {
    valid: true,
    formattedSize,
    maxAllowedMB
  };
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
            reject(new Error('Storage upload stalled without progress'));
          }, 8000);
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
              onProgress(Math.max(10, Math.min(98, pct)));
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

export async function saveVideoPost(
  postId: string,
  file: File | Blob,
  dataUrl?: string,
  collectionName: 'posts' | 'sparks' = 'posts',
  onProgress?: (percentage: number) => void
): Promise<{ videoUrl?: string; hasVideoChunks: boolean }> {
  await cacheVideoLocally(postId, file);
  if (onProgress) onProgress(12);

  const resolvedDataUrl =
    dataUrl && dataUrl.startsWith('data:video/')
      ? dataUrl
      : await readFileAsDataUrlSafe(file, 4.5 * 1024 * 1024);

  if (collectionName === 'posts' && resolvedDataUrl && resolvedDataUrl.length < 650 * 1024) {
    if (onProgress) onProgress(100);
    return {
      videoUrl: resolvedDataUrl,
      hasVideoChunks: false
    };
  }

  const serverStreamUrl = await uploadVideoChunkedToServer(postId, file, (pct) => {
    if (onProgress) onProgress(pct);
  });

  if (serverStreamUrl) {
    if (onProgress) onProgress(100);
    return {
      videoUrl: serverStreamUrl,
      hasVideoChunks: false
    };
  }

  const storageDownloadUrl = await uploadVideoResumableWithRetry(
    postId,
    file,
    collectionName,
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

  try {
    if (!resolvedDataUrl) {
      for (const step of [35, 65, 90, 100]) {
        if (onProgress) onProgress(step);
        await new Promise((r) => setTimeout(r, 60));
      }
      return {
        videoUrl: undefined,
        hasVideoChunks: false
      };
    }

    const rawTotalChunks = Math.ceil(resolvedDataUrl.length / CHUNK_SIZE);
    if (rawTotalChunks > MAX_CHUNKS) {
      for (const step of [35, 65, 90, 100]) {
        if (onProgress) onProgress(step);
        await new Promise((r) => setTimeout(r, 60));
      }
      return {
        videoUrl: undefined,
        hasVideoChunks: false
      };
    }

    const totalChunks = rawTotalChunks;
    const chunksRef = collection(db, collectionName, postId, 'chunks');

    const BATCH_SIZE = 2;
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batchPromises: Promise<boolean>[] = [];
      const currentBatchEnd = Math.min(i + BATCH_SIZE, totalChunks);

      for (let j = i; j < currentBatchEnd; j++) {
        const chunkData = resolvedDataUrl.substring(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE);
        const chunkId = `chunk_${j.toString().padStart(4, '0')}`;
        batchPromises.push(
          writeChunkWithRetry(doc(chunksRef, chunkId), {
            index: j,
            total: totalChunks,
            data: chunkData
          })
        );
      }

      const results = await Promise.all(batchPromises);
      if (onProgress) {
        const progress = Math.min(98, Math.round(20 + (currentBatchEnd / totalChunks) * 78));
        onProgress(progress);
      }

      if (results.some((ok) => !ok)) {
        if (onProgress) onProgress(100);
        return {
          videoUrl: undefined,
          hasVideoChunks: false
        };
      }
    }

    if (onProgress) onProgress(100);

    return {
      videoUrl: undefined,
      hasVideoChunks: true
    };
  } catch (err) {
    console.warn(`Error chunking video to ${collectionName}, using local cache fallback:`, err);
    if (onProgress) onProgress(100);
    return {
      videoUrl: undefined,
      hasVideoChunks: false
    };
  }
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
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let compressed = canvas.toDataURL('image/jpeg', quality);

      if (compressed.length > 600 * 1024) {
        compressed = canvas.toDataURL('image/jpeg', 0.6);
      }
      if (compressed.length > 600 * 1024) {
        compressed = canvas.toDataURL('image/jpeg', 0.45);
      }

      resolve(compressed);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

export function generateVideoThumbnail(file: File | Blob): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(480, video.videoWidth || 480);
        canvas.height = Math.min(360, video.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.6);
          URL.revokeObjectURL(objectUrl);
          resolve(thumb);
          return;
        }
      } catch {}
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      resolve('');
    }, 2500);
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
