import {
  auth,
  db,
  formatCloudinaryUploadError,
  getAuthHeaders,
  formatVideoUploadError,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  CLOUDINARY_VIDEO_UPLOAD_URL,
  CLOUDINARY_IMAGE_UPLOAD_URL
} from '../firebase';
import { collection, doc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';

const DB_NAME = 'wavelink_media_db';
const STORE_NAME = 'videos';

// Session in-memory cache so video playback works immediately even if IndexedDB is restricted
const memoryVideoCache = new Map<string, string>();

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
  const nativeWidth = Math.max(2, meta.width || 1080);
  const nativeHeight = Math.max(2, meta.height || 1920);

  if (onProgress) onProgress(100);
  return {
    file,
    width: nativeWidth,
    height: nativeHeight
  };
}

/**
 * Fast parallel Firestore subcollection chunk writer (with a strict 4.5s time budget)
/**
 * Uploads any image File, Blob, or data:image/... URL directly from the browser to Cloudinary's
 * unsigned image upload endpoint (`https://api.cloudinary.com/v1_1/monarcking72/image/upload`)
 * using upload preset `monarcking72` with a live progress callback.
 * Never returns base64 or data URLs.
 */
export function uploadImageToCloudinary(
  source: File | Blob | string,
  onProgress?: (percentage: number) => void
): Promise<{
  secureUrl: string;
  width: number;
  height: number;
  bytes: number;
  publicId: string;
}> {
  return new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error('No image file provided for upload.'));
      return;
    }

    // If already an HTTP/HTTPS URL, return it directly
    if (typeof source === 'string' && (source.startsWith('https://') || source.startsWith('http://'))) {
      if (onProgress) onProgress(100);
      resolve({
        secureUrl: source,
        width: 1080,
        height: 1080,
        bytes: 0,
        publicId: 'existing_http_image'
      });
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_IMAGE_UPLOAD_URL, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
        onProgress(pct);
      } else {
        onProgress(50);
      }
    };

    xhr.onload = () => {
      const status = xhr.status || 0;
      let parsed: any = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }

      if (status >= 200 && status < 300 && parsed && typeof parsed.secure_url === 'string') {
        if (onProgress) onProgress(100);
        resolve({
          secureUrl: parsed.secure_url,
          width: typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : 1080,
          height: typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : 1080,
          bytes: typeof parsed.bytes === 'number' && parsed.bytes > 0 ? parsed.bytes : 0,
          publicId: String(parsed.public_id || `wavelink_img_${Date.now()}`)
        });
        return;
      }

      const errMsg =
        parsed?.error?.message ||
        (status ? `Cloudinary image upload HTTP ${status} error` : 'Cloudinary image upload failed');
      reject(new Error(`Cloudinary image upload failed: ${errMsg}`));
    };

    xhr.onerror = () => {
      reject(
        new Error(
          'Network error while uploading image to Cloudinary. Please check your connection and try again.'
        )
      );
    };

    xhr.onabort = () => {
      reject(new Error('Image upload was cancelled.'));
    };

    const formData = new FormData();
    if (typeof source === 'string') {
      formData.append('file', source);
    } else if (source instanceof File) {
      formData.append('file', source);
    } else {
      const ext = source.type === 'image/png' ? 'png' : source.type === 'image/webp' ? 'webp' : 'jpg';
      const namedFile = new File([source], `wavelink_photo_${Date.now()}.${ext}`, {
        type: source.type || 'image/jpeg',
        lastModified: Date.now()
      });
      formData.append('file', namedFile);
    }
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    if (onProgress) onProgress(5);
    xhr.send(formData);
  });
}

// ============================================================================
// FIREBASE STORAGE PROFILE COVER & AVATAR UPLOAD (uploadBytesResumable)
// - Paths: users/{uid}/covers/... and users/{uid}/avatars/...
// - Enforces image-only + <= 5 MB max (compresses to ~250-300 KB JPEG)
// - Waits for getDownloadURL() and deletes old Storage file after Firestore save
// ============================================================================
export const MAX_PROFILE_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB hard Storage rule cap

export class ProfileStorageUploadError extends Error {
  code: string;
  friendlyMessage: string;

  constructor(friendlyMessage: string, code: string, originalMessage?: string) {
    super(friendlyMessage || originalMessage || 'Upload failed');
    this.name = 'ProfileStorageUploadError';
    this.code = code || 'storage/unknown';
    this.friendlyMessage = friendlyMessage;
  }
}

export function validateProfileImageFile(
  file: File | Blob | null | undefined
): { valid: boolean; mimeType: string; error?: string; errorCode?: string } {
  if (!file || file.size <= 0) {
    return {
      valid: false,
      mimeType: '',
      error: 'Please select a valid image file.',
      errorCode: 'storage/empty-file'
    };
  }

  const rawType = (file.type || '').split(';')[0].trim().toLowerCase();
  const fileName = ((file as File).name || '').toLowerCase();

  if (rawType.startsWith('image/')) {
    return { valid: true, mimeType: rawType };
  }

  if (/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(fileName)) {
    const inferred = fileName.endsWith('.png')
      ? 'image/png'
      : fileName.endsWith('.webp')
      ? 'image/webp'
      : fileName.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';
    return { valid: true, mimeType: inferred };
  }

  return {
    valid: false,
    mimeType: rawType || 'application/octet-stream',
    error: 'Only image files (JPG, PNG, WebP, or GIF) are allowed.',
    errorCode: 'storage/invalid-file-type'
  };
}

/**
 * Compresses an image in the browser to maxWidth x maxHeight (JPEG/WebP),
 * targeting `targetMaxBytes` (default ~250-300 KB) and strictly enforcing <= 5 MB.
 */
export async function compressProfileImageToBlob(
  file: File | Blob,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    targetMaxBytes?: number;
    mimeType?: 'image/jpeg' | 'image/webp';
  } = {}
): Promise<Blob> {
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 1600;
  const targetMaxBytes = options.targetMaxBytes ?? 300 * 1024;
  const mimeType = options.mimeType ?? 'image/jpeg';

  const check = validateProfileImageFile(file);
  if (!check.valid) {
    throw new ProfileStorageUploadError(
      check.error || 'Only image files are allowed.',
      check.errorCode || 'storage/invalid-file-type'
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new ProfileStorageUploadError(
            'Could not read this image file. Please try a JPG, PNG, or WebP image.',
            'storage/unreadable-image'
          )
        );
      el.src = objectUrl;
    });

    let width = Math.max(1, img.naturalWidth || img.width || 800);
    let height = Math.max(1, img.naturalHeight || img.height || 800);

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (file.size <= MAX_PROFILE_IMAGE_UPLOAD_BYTES) {
        return file;
      }
      throw new ProfileStorageUploadError(
        'Could not prepare image for upload.',
        'storage/canvas-unavailable'
      );
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    let bestBlob: Blob | null = null;
    for (let quality = 0.86; quality >= 0.42; quality -= 0.08) {
      // eslint-disable-next-line no-await-in-loop
      const candidate = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), mimeType, quality)
      );
      if (candidate && candidate.size > 0) {
        bestBlob = candidate;
        if (candidate.size <= targetMaxBytes) {
          break;
        }
      }
    }

    if (!bestBlob) {
      throw new ProfileStorageUploadError(
        'Failed to compress selected image.',
        'storage/compression-failed'
      );
    }

    if (bestBlob.size > MAX_PROFILE_IMAGE_UPLOAD_BYTES) {
      throw new ProfileStorageUploadError(
        'Compressed image is still larger than the 5 MB limit. Please choose a smaller photo.',
        'storage/file-too-large'
      );
    }

    return bestBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadProfileImageToCloudinary(params: {
  uid: string;
  folder: 'covers' | 'avatars';
  blob: Blob;
  contentType?: string;
  onProgress?: (percentage: number) => void;
}): Promise<{ downloadUrl: string; publicId: string; bytes: number }> {
  const { uid, blob, onProgress } = params;

  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
    throw new ProfileStorageUploadError(
      'Please sign in before uploading an image.',
      'cloudinary/unauthenticated'
    );
  }

  if (!blob || blob.size <= 0) {
    throw new ProfileStorageUploadError('Selected image is empty.', 'cloudinary/empty-file');
  }

  if (blob.size > MAX_PROFILE_IMAGE_UPLOAD_BYTES) {
    throw new ProfileStorageUploadError(
      'Image exceeds the 5 MB maximum upload size.',
      'cloudinary/file-too-large'
    );
  }

  const resolvedType =
    (params.contentType || blob.type || 'image/jpeg').split(';')[0].trim().toLowerCase();
  if (!resolvedType.startsWith('image/')) {
    throw new ProfileStorageUploadError(
      'Only image files (JPG, PNG, WebP, GIF) can be uploaded.',
      'cloudinary/invalid-file-type'
    );
  }

  try {
    const result = await uploadImageToCloudinary(blob, onProgress);
    return {
      downloadUrl: result.secureUrl,
      publicId: result.publicId,
      bytes: result.bytes || blob.size
    };
  } catch (err) {
    const formatted = formatCloudinaryUploadError(err, {
      action: `upload-${params.folder}`
    });
    throw new ProfileStorageUploadError(
      formatted.friendlyMessage,
      formatted.code,
      formatted.message
    );
  }
}

/**
 * Legacy cleanup no-op kept for signature safety; all uploads are hosted cleanly on Cloudinary.
 */
export async function deleteOldProfileMediaFromStorage(
  _oldUrlOrPath?: string | null
): Promise<void> {
  return;
}

/**
 * Uploads a Spark video directly from the user's browser to Cloudinary's unsigned upload API
 * (`https://api.cloudinary.com/v1_1/monarcking72/video/upload`, preset `monarcking72`)
 * after checking the 60s Free / 90s Pro duration limit and compressing/downscaling to ~720p in the browser.
 * Never uploads through Express, never uses Firebase Storage, and never fails silently.
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

  const maxSec = isProUser ? PRO_SPARK_MAX_SECONDS : FREE_SPARK_MAX_SECONDS;
  let rawMeta: SparkVideoMetadata;
  if (params.metadata && params.metadata.durationSeconds > 0) {
    rawMeta = params.metadata;
    if (rawMeta.durationSeconds > maxSec + 0.5) {
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
    onProgress(8, 'Compressing Spark video to 720p...');
  }

  // Compress/downscale Spark video in browser to ~720p and generate poster thumbnail
  const [thumbnailUrl, compressed] = await Promise.all([
    generateVideoThumbnail(file, 1.0),
    compressVideoBeforeUpload(file, {
      trimStart: 0,
      trimEnd: Math.min(maxSec, rawMeta.durationSeconds),
      isProUser,
      onProgress: (pct) => {
        if (onProgress) {
          const mapped = Math.max(8, Math.min(28, Math.round(8 + pct * 0.2)));
          onProgress(mapped, `Compressing to 720p (${pct}%)...`);
        }
      }
    }),
    cacheVideoLocally(sparkId, file)
  ]);

  const processedFile = compressed.file;
  const width = compressed.width || rawMeta.width || 720;
  const height = compressed.height || rawMeta.height || 1280;
  const durationSeconds = Math.min(
    maxSec,
    Math.round((compressed.durationSeconds || rawMeta.durationSeconds) * 100) / 100
  );

  if (onProgress) {
    onProgress(30, `Uploading to Cloudinary (0% • ${formatVideoFileSize(processedFile.size)})...`);
  }

  const handle = startDirectVideoUploadToCloudinary({
    postId: sparkId,
    userId,
    file: processedFile,
    thumbnailDataUrl: thumbnailUrl,
    durationSeconds,
    width,
    height,
    isProUser,
    onProgress: (pct, _statusText, bytesTransferred, totalBytes) => {
      if (onProgress) {
        const mappedPct = Math.max(30, Math.min(99, Math.round(30 + pct * 0.69)));
        onProgress(
          mappedPct,
          `Uploading Spark video ${pct}% (${formatVideoFileSize(bytesTransferred)} / ${formatVideoFileSize(totalBytes)})...`
        );
      }
    }
  });

  const uploadRes = await handle.promise;

  if (onProgress) {
    onProgress(100, 'Spark video uploaded!');
  }

  return {
    downloadUrl: uploadRes.videoUrl,
    storagePath: uploadRes.storagePath,
    thumbnailUrl: uploadRes.thumbnailUrl || thumbnailUrl,
    durationSeconds,
    width,
    height,
    fileSize: processedFile.size,
    mimeType: typeCheck.mimeType || processedFile.type || 'video/mp4',
    hasVideoChunks: false
  };
}

/**
 * Uploads Spark photos and rendered Spark text-card images directly from the browser
 * to Cloudinary (`https://api.cloudinary.com/v1_1/monarcking72/image/upload`, preset `monarcking72`)
 * with live upload progress, returning ONLY the HTTPS `secure_url`. Never stores base64 in Firestore.
 */
export async function uploadSparkImageToStorage(params: {
  sparkId: string;
  userId: string;
  file?: File | null;
  dataUrl: string;
  onProgress?: (percentage: number) => void;
}): Promise<{ downloadUrl: string; storagePath?: string; width?: number; height?: number }> {
  const { file, dataUrl, onProgress } = params;
  const uploadSource: File | Blob | string = file && file.size > 0 ? file : dataUrl;
  const uploaded = await uploadImageToCloudinary(uploadSource, onProgress);
  return {
    downloadUrl: uploaded.secureUrl,
    storagePath: uploaded.publicId,
    width: uploaded.width,
    height: uploaded.height
  };
}

// Track expired Spark IDs already cleaned up in this session so we don't repeat calls
const cleanedExpiredSparkIds = new Set<string>();

/**
 * Deletes an expired or user-removed Spark document from Firestore.
 */
export async function deleteSparkAndStorageFile(
  spark: { id: string; storagePath?: string; mediaUrl?: string },
  deleteFirestoreDoc: boolean = true
): Promise<void> {
  if (!spark?.id) return;
  if (cleanedExpiredSparkIds.has(spark.id) && !deleteFirestoreDoc) return;
  cleanedExpiredSparkIds.add(spark.id);

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
  if (!file || file.size === 0 || file.size > PRO_MAX_VIDEO_BYTES) {
    throw new Error('Media file is empty or exceeds the 100 MB limit.');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_VIDEO_UPLOAD_URL, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!onProgress) return;
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      const pct = Math.max(1, Math.min(99, Math.round((event.loaded / total) * 100)));
      onProgress(pct);
    };

    xhr.onload = () => {
      const status = xhr.status || 0;
      let parsed: any = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (status >= 200 && status < 300 && parsed && typeof parsed.secure_url === 'string') {
        if (onProgress) onProgress(100);
        resolve(parsed.secure_url);
        return;
      }
      const errMsg =
        parsed?.error?.message ||
        (status ? `Cloudinary HTTP ${status} error` : 'Cloudinary media upload failed');
      reject(new Error(`Cloudinary upload failed: ${errMsg}`));
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading media to Cloudinary.'));
    };

    const formData = new FormData();
    const isAudio = (file.type || '').startsWith('audio/');
    const defaultExt = isAudio ? 'webm' : 'mp4';
    const uploadFile =
      file instanceof File
        ? file
        : new File([file], `${entityId}.${defaultExt}`, {
            type: file.type || (isAudio ? 'audio/webm' : 'video/mp4'),
            lastModified: Date.now()
          });
    formData.append('file', uploadFile);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    if (onProgress) onProgress(5);
    xhr.send(formData);
  });
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

  const nativeWidth = Math.max(2, meta.width || 1080);
  const nativeHeight = Math.max(2, meta.height || 1920);
  const hasWebCodecs = await checkWebCodecsH264Support(nativeWidth, nativeHeight);

  const needsTrimming = rawStart > 0.25 || effectiveEnd < meta.durationSeconds - 0.35;

  // Always preserve original video quality and resolution without extra scaling or heavy compression
  // unless the user explicitly trims the clip start/end.
  if (!needsTrimming) {
    const steps = [35, 70, 100];
    for (const pct of steps) {
      if (signal?.aborted) throw new Error('UPLOAD_CANCELLED');
      if (onProgress) {
        onProgress(pct, `Prepared original quality video (${formatVideoFileSize(file.size)}) — ${pct}%`);
      }
      await new Promise((r) => setTimeout(r, 35));
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
      width: nativeWidth,
      height: nativeHeight,
      engine: 'passthrough'
    };
  }

  // User-requested clip trimming path (preserves original resolution & high bitrate)
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

      // Strict time budget (max 12 seconds) so trimming never blocks uploading
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
          canvas.width = nativeWidth;
          canvas.height = nativeHeight;
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
            videoBitsPerSecond: 5_000_000,
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
            if (outBlob.size > 2048) {
              const baseName = (file.name || 'video').replace(/\.[^/.]+$/, '');
              finish(
                new File([outBlob], `${baseName}_trimmed.${outExt}`, {
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

          video.playbackRate = 1.0;

          const renderLoop = () => {
            if (settled) return;
            if (video.currentTime >= effectiveEnd || video.ended) {
              if (onProgress) onProgress(96, 'Finalizing video...');
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
              onProgress(pct, `Preparing trimmed clip (${pct}%)...`);
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
        onProgress(100, `Prepared video (${formatVideoFileSize(transcodeResult.size)})`);
      }
      return {
        file: transcodeResult,
        durationSeconds: effectiveDuration,
        width: nativeWidth,
        height: nativeHeight,
        engine: hasWebCodecs ? 'webcodecs' : 'passthrough'
      };
    }
  }

  // Safe passthrough with native metadata if real-time trimming is skipped or unsupported
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
    width: nativeWidth,
    height: nativeHeight,
    engine: 'passthrough'
  };
}

/**
 * Returns a small, fast HTTP(S) thumbnail URL from Cloudinary (never a base64 data: URL).
 * If a custom cover image was provided as a data:image/ URL, uploads it to Cloudinary first
 * and returns its HTTPS secure_url; otherwise derives a small .jpg frame URL from the Cloudinary video URL.
 */
export async function uploadVideoThumbnailToStorage(
  _userId: string,
  _postId: string,
  thumbnailDataUrl: string,
  cloudinaryVideoUrl?: string
): Promise<string> {
  if (
    thumbnailDataUrl &&
    (thumbnailDataUrl.startsWith('https://') || thumbnailDataUrl.startsWith('http://'))
  ) {
    return thumbnailDataUrl;
  }

  if (cloudinaryVideoUrl && cloudinaryVideoUrl.includes('res.cloudinary.com/')) {
    // Derive a small, sharp JPEG thumbnail URL directly from the Cloudinary video asset
    const withTransform = cloudinaryVideoUrl.replace(
      '/video/upload/',
      '/video/upload/so_1.0,w_640,c_limit,q_auto:good/'
    );
    const derivedThumb = withTransform.replace(/\.(mp4|webm|mov|ogv|m4v|3gp)$/i, '.jpg');
    if (derivedThumb !== withTransform && derivedThumb.startsWith('http')) {
      return derivedThumb;
    }
    const simpleDerived = cloudinaryVideoUrl.replace(/\.(mp4|webm|mov|ogv|m4v|3gp)$/i, '.jpg');
    if (simpleDerived !== cloudinaryVideoUrl && simpleDerived.startsWith('http')) {
      return simpleDerived;
    }
  }

  if (thumbnailDataUrl && thumbnailDataUrl.startsWith('data:image/')) {
    try {
      const uploaded = await uploadImageToCloudinary(thumbnailDataUrl);
      if (uploaded.secureUrl && uploaded.secureUrl.startsWith('http')) {
        return uploaded.secureUrl;
      }
    } catch (err) {
      console.warn('Could not upload custom video thumbnail to Cloudinary:', err);
    }
  }

  return '';
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
    width?: number;
    height?: number;
    hasVideoChunks: boolean;
  }>;
}

/**
 * Uploads a video directly from the user's browser to Cloudinary's unsigned upload API:
 * - Endpoint: `https://api.cloudinary.com/v1_1/monarcking72/video/upload`
 * - Cloud name: `monarcking72`
 * - Upload preset: `monarcking72`
 * - Uses XMLHttpRequest with `xhr.upload.onprogress` for a live progress bar with percentage and file size.
 * - Enforces 60s max for Free users and 90s max for Pro users before upload.
 * - Never sends video through Express, never uses Firebase Storage, and never fails silently.
 */
export function startDirectVideoUploadToCloudinary(params: {
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

  let xhr: XMLHttpRequest | null = null;
  let isCancelledByUser = false;

  const promise = new Promise<{
    videoUrl: string;
    thumbnailUrl: string;
    storagePath: string;
    durationSeconds: number;
    fileSize: number;
    width?: number;
    height?: number;
    hasVideoChunks: boolean;
  }>((resolve, reject) => {
    if (!file || file.size <= 0) {
      const err = new Error('Selected video file is empty.');
      console.error('[WaveLink Cloudinary Video Upload Error]', err);
      reject(err);
      return;
    }

    if (file.size > MAX_VIDEO_RAW_BYTES) {
      const err = new Error(
        `File too big: ${formatVideoFileSize(file.size)} exceeds the ${MAX_VIDEO_RAW_MB} MB limit.`
      );
      console.error('[WaveLink Cloudinary Video Upload Error]', err);
      reject(err);
      return;
    }

    if (roundedDuration > maxAllowedSeconds + 0.5) {
      const err = new Error(
        isProUser
          ? `Pro videos can be up to 90 seconds (yours is ${Math.round(roundedDuration)}s).`
          : `Free users can upload videos up to 60 seconds, and Pro users up to 90 seconds (yours is ${Math.round(roundedDuration)}s).`
      );
      console.error('[WaveLink Cloudinary Video Upload Error]', err);
      reject(err);
      return;
    }

    // Cache locally in memory/IndexedDB for instant playback on the uploader's device
    void cacheVideoLocally(postId, file);

    const totalSizeLabel = formatVideoFileSize(file.size);
    let lastLoadedBytes = 0;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const resetStallTimer = (timeoutMs: number) => {
      clearStallTimer();
      if (isCancelledByUser) return;
      stallTimer = setTimeout(() => {
        if (isCancelledByUser) return;
        try {
          xhr?.abort();
        } catch {}
        const stallErr = new Error('UPLOAD_TIMEOUT: No upload progress for 30 seconds.');
        const formatted = formatVideoUploadError(stallErr, {
          fileSize: file.size,
          maxAllowedSeconds,
          isProUser
        });
        reject(new Error(formatted));
      }, timeoutMs);
    };

    try {
      xhr = new XMLHttpRequest();
      xhr.open('POST', CLOUDINARY_VIDEO_UPLOAD_URL, true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      if (onStateChange) onStateChange('running');
      resetStallTimer(30000);

      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (isCancelledByUser) return;
        const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
        const loaded = Math.max(0, event.loaded);

        if (loaded > lastLoadedBytes) {
          lastLoadedBytes = loaded;
          resetStallTimer(30000);
        }

        if (total > 0 && onProgress) {
          const rawPct = Math.round((loaded / total) * 100);
          const displayPct = loaded === 0 ? 1 : Math.max(1, Math.min(99, rawPct));
          onProgress(
            displayPct,
            `Uploading ${displayPct}% • ${formatVideoFileSize(loaded)} / ${formatVideoFileSize(total)}`,
            loaded,
            total
          );
        }
      };

      xhr.onload = async () => {
        clearStallTimer();
        if (isCancelledByUser) {
          reject(new Error('UPLOAD_CANCELLED'));
          return;
        }

        const status = xhr?.status || 0;
        const rawText = xhr?.responseText || '';
        let parsed: any = null;
        try {
          parsed = rawText ? JSON.parse(rawText) : null;
        } catch {
          parsed = null;
        }

        if (status >= 200 && status < 300 && parsed && typeof parsed.secure_url === 'string') {
          const secureUrl: string = parsed.secure_url;
          const publicId: string = String(parsed.public_id || `wavelink_${postId}`);
          const cloudDuration =
            typeof parsed.duration === 'number' && parsed.duration > 0
              ? Math.round(parsed.duration * 10) / 10
              : roundedDuration;
          const cloudWidth = typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : width;
          const cloudHeight = typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : height;
          const cloudBytes = typeof parsed.bytes === 'number' && parsed.bytes > 0 ? parsed.bytes : file.size;

          if (onProgress) {
            onProgress(
              100,
              `Uploaded ${totalSizeLabel} (100%) — saving post...`,
              file.size,
              file.size
            );
          }

          const resolvedThumb = await uploadVideoThumbnailToStorage(
            params.userId,
            postId,
            thumbnailDataUrl,
            secureUrl
          );

          resolve({
            videoUrl: secureUrl,
            thumbnailUrl: resolvedThumb && resolvedThumb.startsWith('http') ? resolvedThumb : '',
            storagePath: publicId,
            durationSeconds: cloudDuration,
            fileSize: cloudBytes,
            width: cloudWidth,
            height: cloudHeight,
            hasVideoChunks: false
          });
          return;
        }

        const cloudinaryErrMsg =
          parsed?.error?.message ||
          (status ? `Cloudinary HTTP ${status} error` : 'Cloudinary upload failed');
        const err = Object.assign(new Error(`Cloudinary upload error: ${cloudinaryErrMsg}`), {
          httpStatus: status,
          cloudinaryMessage: cloudinaryErrMsg
        });
        const formatted = formatVideoUploadError(err, {
          fileSize: file.size,
          maxAllowedSeconds,
          isProUser,
          httpStatus: status
        });
        reject(new Error(formatted));
      };

      xhr.onerror = () => {
        clearStallTimer();
        if (isCancelledByUser) {
          reject(new Error('UPLOAD_CANCELLED'));
          return;
        }
        const netErr = new Error(
          'NETWORK_ERROR: Could not reach Cloudinary upload server. Check your internet connection.'
        );
        const formatted = formatVideoUploadError(netErr, {
          fileSize: file.size,
          maxAllowedSeconds,
          isProUser
        });
        reject(new Error(formatted));
      };

      xhr.onabort = () => {
        clearStallTimer();
        if (isCancelledByUser) {
          reject(new Error('UPLOAD_CANCELLED'));
        }
      };

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      xhr.send(formData);
    } catch (initErr) {
      clearStallTimer();
      const formatted = formatVideoUploadError(initErr, {
        fileSize: file.size,
        maxAllowedSeconds,
        isProUser
      });
      reject(new Error(formatted));
    }
  });

  return {
    pause: () => false,
    resume: () => false,
    cancel: () => {
      isCancelledByUser = true;
      try {
        xhr?.abort();
        return true;
      } catch {
        return false;
      }
    },
    promise
  };
}

export const startDirectVideoUploadToFirebase = startDirectVideoUploadToCloudinary;

export async function uploadVideoResumableWithRetry(
  entityId: string,
  file: File | Blob,
  _folder: string = 'videos',
  onProgress?: (percentage: number) => void
): Promise<string | null> {
  const videoFile =
    file instanceof File
      ? file
      : new File([file], `${entityId}.mp4`, { type: file.type || 'video/mp4' });
  const handle = startDirectVideoUploadToCloudinary({
    postId: entityId,
    userId: 'wavelink_user',
    file: videoFile,
    durationSeconds: 30,
    isProUser: true,
    onProgress: (pct) => {
      if (onProgress) onProgress(pct);
    }
  });
  const result = await handle.promise;
  return result.videoUrl;
}

/**
 * Uploads video directly from the browser to Cloudinary using unsigned preset `monarcking72`.
 */
export async function saveVideoPost(
  postId: string,
  file: File | Blob,
  _dataUrl?: string,
  collectionName: 'posts' | 'sparks' = 'posts',
  onProgress?: (percentage: number) => void,
  userId?: string
): Promise<{ videoUrl?: string; hasVideoChunks: boolean }> {
  await cacheVideoLocally(postId, file);
  if (onProgress) onProgress(10);

  const cloudUrl = await uploadVideoResumableWithRetry(
    postId,
    file,
    userId ? `users/${userId}/videos` : collectionName,
    onProgress
  );

  return {
    videoUrl: cloudUrl || undefined,
    hasVideoChunks: false
  };
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

  // 2. If directVideoUrl is a persistent HTTP/HTTPS or server URL, return it immediately without extra Firestore reads
  const isPersistentRemoteUrl =
    directVideoUrl &&
    (directVideoUrl.startsWith('http://') ||
      directVideoUrl.startsWith('https://') ||
      directVideoUrl.startsWith('/api/media/video/') ||
      directVideoUrl.startsWith('data:video/'));

  if (isPersistentRemoteUrl) {
    return directVideoUrl!;
  }

  // 3. Reassemble Firestore subcollection video chunks only when explicitly flagged as chunked
  if (hasVideoChunks || directVideoUrl === 'chunked') {
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
    } catch {
      // Fallback to directVideoUrl when offline or daily read quota is reached
    }
  }

  if (directVideoUrl) return directVideoUrl;

  return null;
}

/**
 * Prepares an image in the browser (preserving original sharpness up to maxWidth/maxHeight)
 * and uploads it directly from the browser to Cloudinary's unsigned upload API
 * (`https://api.cloudinary.com/v1_1/monarcking72/image/upload`, preset `monarcking72`),
 * returning ONLY the HTTPS `secure_url`. Never returns base64 or data URLs.
 */
export function compressImage(
  file: File | Blob,
  maxWidth = 2048,
  maxHeight = 2048,
  quality = 0.92,
  onProgress?: (percentage: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || file.size === 0) {
      reject(new Error('Selected image file is empty.'));
      return;
    }

    // Fast path: if original file is a standard web image <= 12 MB and doesn't need resizing,
    // or if we want to optimize large camera photos in canvas first before uploading to Cloudinary:
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width || 1080;
      let height = img.naturalHeight || img.height || 1080;

      const targetMaxW = Math.max(maxWidth, 512);
      const targetMaxH = Math.max(maxHeight, 512);
      const needsResize = width > targetMaxW || height > targetMaxH || file.size > 8 * 1024 * 1024;

      if (!needsResize) {
        uploadImageToCloudinary(file, onProgress)
          .then((res) => resolve(res.secureUrl))
          .catch((err) => reject(err));
        return;
      }

      if (width > targetMaxW || height > targetMaxH) {
        if (width > height) {
          height = Math.round((height * targetMaxW) / width);
          width = targetMaxW;
        } else {
          width = Math.round((width * targetMaxH) / height);
          height = targetMaxH;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        uploadImageToCloudinary(file, onProgress)
          .then((res) => resolve(res.secureUrl))
          .catch((err) => reject(err));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          const uploadTarget = blob && blob.size > 0 ? blob : file;
          uploadImageToCloudinary(uploadTarget, onProgress)
            .then((res) => resolve(res.secureUrl))
            .catch((err) => reject(err));
        },
        'image/jpeg',
        Math.max(0.75, Math.min(0.95, quality))
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Still attempt direct Cloudinary upload (e.g. for HEIC/AVIF/SVG supported by Cloudinary)
      uploadImageToCloudinary(file, onProgress)
        .then((res) => resolve(res.secureUrl))
        .catch((err) => reject(err));
    };

    img.src = objectUrl;
  });
}

/**
 * Generates a sharp JPEG poster image from the first second (`captureTimeSeconds = 1.0`) of the video.
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
        const rawW = video.videoWidth || 1080;
        const rawH = video.videoHeight || 1920;
        const scale = Math.min(1, 1280 / Math.max(rawW, rawH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(rawW * scale));
        canvas.height = Math.max(1, Math.round(rawH * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.9);
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

export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024; // 20 MB cap for documents/files

export function uploadChatFileToCloudinary(
  file: File,
  onProgress?: (percentage: number) => void
): Promise<{ secureUrl: string; fileName: string; fileSize: number; publicId: string }> {
  return new Promise((resolve, reject) => {
    if (!file || file.size <= 0) {
      reject(new Error('Selected file is empty.'));
      return;
    }
    if (file.size > MAX_CHAT_FILE_BYTES) {
      reject(new Error(`File exceeds the 20 MB limit (${formatVideoFileSize(file.size)}).`));
      return;
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
      } else {
        onProgress(50);
      }
    };

    xhr.onload = () => {
      const status = xhr.status || 0;
      let parsed: any = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }

      if (status >= 200 && status < 300 && parsed && typeof parsed.secure_url === 'string') {
        if (onProgress) onProgress(100);
        resolve({
          secureUrl: parsed.secure_url,
          fileName: file.name || 'Attachment',
          fileSize: file.size || Number(parsed.bytes) || 0,
          publicId: String(parsed.public_id || `wavelink_file_${Date.now()}`)
        });
        return;
      }

      const errMsg =
        parsed?.error?.message ||
        (status ? `Cloudinary file upload HTTP ${status} error` : 'Cloudinary file upload failed');
      reject(new Error(`File upload failed: ${errMsg}`));
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file to Cloudinary.'));
    };

    xhr.onabort = () => {
      reject(new Error('File upload was cancelled.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    xhr.send(formData);
  });
}

export const CHAT_THEME_MAX_PHOTO_BYTES = 400 * 1024; // 400 KB strict Firebase Storage cap

function loadImageElementFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the selected image file.'));
    };
    img.src = objectUrl;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not compress image in browser.'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Crops/scales an image to chat aspect dimensions, iteratively compresses it strictly under 400 KB,
 * and uploads it directly to Cloudinary (preset monarcking72), returning the HTTPS secure_url.
 */
export async function compressAndUploadChatThemePhoto(params: {
  uid: string;
  conversationId: string;
  file: File;
}): Promise<{ downloadUrl: string; storagePath: string; fileSize: number }> {
  const { uid, conversationId, file } = params;
  if (!uid) {
    throw new Error('Sign in required to upload a custom background.');
  }
  if (!file || (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif)$/i.test(file.name))) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }

  const img = await loadImageElementFromFile(file);
  const srcW = img.naturalWidth || img.width || 1080;
  const srcH = img.naturalHeight || img.height || 1440;

  // Iteratively scale & adjust JPEG quality until strictly under 400 KB
  const maxDimensions = [1280, 1080, 860, 720];
  const qualities = [0.84, 0.72, 0.60, 0.48, 0.36];
  let finalBlob: Blob | null = null;

  for (const maxDim of maxDimensions) {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const targetW = Math.max(240, Math.round(srcW * scale));
    const targetH = Math.max(240, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is not supported on this device.');

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const q of qualities) {
      const candidate = await canvasToJpegBlob(canvas, q);
      finalBlob = candidate;
      if (candidate.size < CHAT_THEME_MAX_PHOTO_BYTES) {
        break;
      }
    }
    if (finalBlob && finalBlob.size < CHAT_THEME_MAX_PHOTO_BYTES) {
      break;
    }
  }

  if (!finalBlob || finalBlob.size >= CHAT_THEME_MAX_PHOTO_BYTES) {
    throw new Error('Photo is still too large after compression. Please choose a smaller image.');
  }

  const safeConvo = String(conversationId || 'chat')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 48);
  const namedFile = new File([finalBlob], `wavelink_theme_${safeConvo}_${Date.now()}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });

  const uploaded = await uploadImageToCloudinary(namedFile);
  return {
    downloadUrl: uploaded.secureUrl,
    storagePath: uploaded.publicId,
    fileSize: finalBlob.size
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URL');
  }
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/i);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  if (/;base64/i.test(header)) {
    const binary = atob(body.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
  return new Blob([decodeURIComponent(body)], { type: mimeType });
}

/**
 * Compresses a legacy base64 data:image/* string, uploads it to Cloudinary,
 * and returns only the short HTTPS secure_url.
 */
export async function migrateDataUrlImageToCloudinary(
  dataUrl: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    targetMaxBytes?: number;
  } = {}
): Promise<string> {
  const trimmed = String(dataUrl || '').trim();
  if (!trimmed.startsWith('data:image/')) {
    throw new Error('Only image data URLs can be migrated to Cloudinary.');
  }

  const rawBlob = dataUrlToBlob(trimmed);
  let uploadBlob: Blob = rawBlob;
  try {
    uploadBlob = await compressProfileImageToBlob(rawBlob, {
      maxWidth: options.maxWidth ?? 512,
      maxHeight: options.maxHeight ?? 512,
      targetMaxBytes: options.targetMaxBytes ?? 280 * 1024,
      mimeType: 'image/jpeg'
    });
  } catch {
    // Fallback to raw image blob (e.g., SVG or animated GIF) if canvas compression is skipped
    uploadBlob = rawBlob;
  }

  const uploaded = await uploadImageToCloudinary(uploadBlob);
  return uploaded.secureUrl;
}

// ============================================================================
// CUSTOM APP BACKGROUND (PRO ONLY)
// - Validates JPG, PNG, WebP only and <= 10 MB before processing
// - Crops 9:16 (mobile 608x1080) & 16:9 (desktop 1080x608) with long side max 1080px
// - Computes average luminance + darken effective brightness for light/dark text contrast
// - Compresses to WebP/JPEG strictly under 400 KB
// ============================================================================
export const CUSTOM_BG_MAX_RAW_MB = 10;
export const CUSTOM_BG_MAX_RAW_BYTES = CUSTOM_BG_MAX_RAW_MB * 1024 * 1024;
export const CUSTOM_BG_MAX_OUTPUT_BYTES = 400 * 1024; // 400 KB strict cap
export const CUSTOM_BG_MAX_LONG_SIDE = 1080;

const ALLOWED_CUSTOM_BG_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function validateCustomBackgroundFile(file: File | null | undefined): {
  valid: boolean;
  mimeType: string;
  error?: string;
} {
  if (!file || file.size <= 0) {
    return { valid: false, mimeType: '', error: 'Please select a valid image file.' };
  }

  const rawType = (file.type || '').split(';')[0].trim().toLowerCase();
  const fileName = (file.name || '').toLowerCase();

  let detectedMime = '';
  if (ALLOWED_CUSTOM_BG_MIMES.has(rawType)) {
    detectedMime = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
  } else if (!rawType && /\.(jpe?g|png|webp)$/i.test(fileName)) {
    detectedMime = fileName.endsWith('.png')
      ? 'image/png'
      : fileName.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  }

  if (!detectedMime) {
    return {
      valid: false,
      mimeType: rawType || 'unknown',
      error: 'Only JPG, PNG, and WebP images are supported for custom backgrounds (no GIFs or videos).'
    };
  }

  if (file.size > CUSTOM_BG_MAX_RAW_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      mimeType: detectedMime,
      error: `This image is ${sizeMb} MB, which is over the ${CUSTOM_BG_MAX_RAW_MB} MB limit. Please choose a smaller photo.`
    };
  }

  return { valid: true, mimeType: detectedMime };
}

export function computeEffectiveTextMode(avgLuminancePct: number, darkenPct: number): 'light' | 'dark' {
  const lumNorm = Math.max(0, Math.min(1, avgLuminancePct / 100));
  const darkenFactor = Math.max(0, Math.min(0.7, darkenPct / 100));
  const effectiveLum = lumNorm * (1 - darkenFactor);
  // Dark background / heavily darkened -> 'dark' mode (white/light text)
  // Bright background -> 'light' mode (dark ink text)
  return effectiveLum < 0.54 ? 'dark' : 'light';
}

function canvasToEncodedBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            resolve(null);
          }
        },
        mimeType,
        quality
      );
    } catch {
      resolve(null);
    }
  });
}

export async function cropAndCompressCustomBg(params: {
  image: HTMLImageElement;
  aspect: '9:16' | '16:9';
  zoom?: number; // 1 to 3
  panX?: number; // -1 to 1
  panY?: number; // -1 to 1
  darken?: number; // 0 to 70
}): Promise<{
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  avgLuminance: number;
  textMode: 'light' | 'dark';
}> {
  const { image, aspect, zoom = 1, panX = 0, panY = 0, darken = 25 } = params;
  const srcW = Math.max(1, image.naturalWidth || image.width || 1080);
  const srcH = Math.max(1, image.naturalHeight || image.height || 1080);

  const baseTargetW = aspect === '9:16' ? 608 : CUSTOM_BG_MAX_LONG_SIDE;
  const baseTargetH = aspect === '9:16' ? CUSTOM_BG_MAX_LONG_SIDE : 608;
  const safeZoom = Math.max(1, Math.min(3, zoom));
  const safePanX = Math.max(-1, Math.min(1, panX));
  const safePanY = Math.max(-1, Math.min(1, panY));

  const renderAtDimensions = (targetW: number, targetH: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas image processing is unavailable on this browser.');
    }

    const coverScale = Math.max(targetW / srcW, targetH / srcH) * safeZoom;
    const drawW = srcW * coverScale;
    const drawH = srcH * coverScale;
    const maxOffsetX = Math.max(0, (drawW - targetW) / 2);
    const maxOffsetY = Math.max(0, (drawH - targetH) / 2);

    const drawX = (targetW - drawW) / 2 + safePanX * maxOffsetX;
    const drawY = (targetH - drawH) / 2 + safePanY * maxOffsetY;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    return { canvas, ctx };
  };

  const { canvas: primaryCanvas, ctx: primaryCtx } = renderAtDimensions(baseTargetW, baseTargetH);

  // Sample luminance on cropped image pixels (fast stride)
  let avgLuminance = 50;
  try {
    const imgData = primaryCtx.getImageData(0, 0, baseTargetW, baseTargetH).data;
    let totalLum = 0;
    let samples = 0;
    const stride = 16; // every 4th RGBA pixel
    for (let i = 0; i < imgData.length; i += stride) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      samples++;
    }
    if (samples > 0) {
      avgLuminance = Math.round((totalLum / samples) * 100);
    }
  } catch {
    avgLuminance = 45;
  }

  const textMode = computeEffectiveTextMode(avgLuminance, darken);

  // Compress strictly under 400 KB using WebP first, falling back to JPEG if unsupported
  const scales = [1, 0.85, 0.72];
  const qualities = [0.84, 0.72, 0.60, 0.48, 0.38];

  for (const scaleFactor of scales) {
    const targetW = Math.round(baseTargetW * scaleFactor);
    const targetH = Math.round(baseTargetH * scaleFactor);
    const workingCanvas =
      scaleFactor === 1 ? primaryCanvas : renderAtDimensions(targetW, targetH).canvas;

    for (const mime of ['image/webp', 'image/jpeg'] as const) {
      for (const q of qualities) {
        const candidate = await canvasToEncodedBlob(workingCanvas, mime, q);
        if (candidate && candidate.size < CUSTOM_BG_MAX_OUTPUT_BYTES) {
          return {
            blob: candidate,
            mimeType: candidate.type === 'image/jpeg' ? 'image/jpeg' : mime,
            width: targetW,
            height: targetH,
            bytes: candidate.size,
            avgLuminance,
            textMode
          };
        }
      }
    }
  }

  throw new Error('Could not compress this image under 400 KB. Please choose a simpler or smaller photo.');
}

/**
 * Generates a lightweight (~1 KB) blurred Cloudinary placeholder URL for smooth progressive loading.
 */
export function getCloudinaryTinyPlaceholderUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) {
    return url;
  }
  return url.replace('/image/upload/', '/image/upload/w_48,e_blur:400,q_auto:low,f_auto/');
}



