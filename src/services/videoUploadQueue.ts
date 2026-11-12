import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { savePostDocument } from './postService';
import {
  db,
  cleanFirestoreData,
  handleFirestoreError,
  OperationType,
  formatVideoUploadError,
  sanitizeAvatarUrlForFirestore
} from '../firebase';
import {
  compressVideoBeforeUpload,
  startDirectVideoUploadToCloudinary,
  DirectVideoUploadTaskHandle,
  formatVideoFileSize,
  getMaxVideoDurationSeconds
} from '../utils/mediaStorage';
import type { Post } from '../types';

export interface VideoPostUploadJobInput {
  postId?: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername: string;
  authorPhotoURL: string;
  file: File;
  isProUser?: boolean;
  caption?: string;
  content?: string;
  customThumbnailUrl?: string;
  customThumbnailDataUrl?: string;
  trimStart?: number;
  trimEnd?: number;
  aspectRatio?: '1:1' | '4:5' | '9:16';
  audience?: 'public' | 'followers' | 'close_friends';
  locationTag?: string;
  allowComments?: boolean;
  hashtags?: string[];
  songTitle?: string;
  songArtist?: string;
  songAlbumArt?: string;
  songPreviewUrl?: string;
  songAlbumName?: string;
  songStartTime?: number;
  songVolume?: number;
  songMetadata?: {
    songTitle?: string;
    songArtist?: string;
    songAlbumArt?: string;
    songPreviewUrl?: string;
    songAlbumName?: string;
    songStartTime?: number;
    songVolume?: number;
  };
  onProgress?: (percentage: number, statusText: string) => void;
  onComplete?: (postId: string, createdPost?: Post) => void;
  onError?: (errorMessage: string, jobId: string) => void;
}

export type VideoUploadJobStatus =
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'waiting_network'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface VideoUploadJob {
  id: string;
  postId: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername: string;
  authorPhotoURL: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  formattedFileSize: string;
  thumbnailUrl: string;
  videoPreviewUrl: string;
  videoWidth?: number;
  videoHeight?: number;
  isProUser: boolean;
  phase: 'preparing' | 'uploading' | 'done';
  progress: number;
  status: VideoUploadJobStatus;
  statusText: string;
  durationSeconds: number;
  error?: string;
  createdAt: number;
  createdPost?: Post;
  input: VideoPostUploadJobInput;
}

export type VideoUploadQueueJob = VideoUploadJob;

type VideoQueueListener = (jobs: VideoUploadJob[]) => void;

const STALE_DRAFT_STORAGE_KEYS = [
  'wavelink_creator_studio_draft',
  'wavelink_creator_studio_draft_v1',
  'wavelink_creator_studio_draft_v2',
  'wavelink_failed_post_draft',
  'wavelink_video_upload_drafts',
  'wavelink_pending_posts'
];

export function clearFailedVideoAndStudioDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of STALE_DRAFT_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    // Also remove any legacy localStorage item that accidentally stored base64 data URLs
    const keysToInspect: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('wavelink_') && k.includes('draft')) {
        keysToInspect.push(k);
      }
    }
    for (const k of keysToInspect) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore storage errors
  }
}

function sanitizeOptionalHttpUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('data:audio/')) {
    return 'https://wavelink.app/royalty-free/rf_afrobeat_sun.wav';
  }
  return undefined;
}

class VideoUploadQueueManager {
  private jobs: VideoUploadJob[] = [];
  private listeners: Set<VideoQueueListener> = new Set();
  private activeHandles: Map<string, DirectVideoUploadTaskHandle> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private compressedFilesCache: Map<
    string,
    { file: File; durationSeconds: number; width: number; height: number; thumbnailUrl: string }
  > = new Map();

  constructor() {
    clearFailedVideoAndStudioDrafts();
  }

  public getJobs(): VideoUploadJob[] {
    return [...this.jobs];
  }

  public subscribe(listener: VideoQueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getJobs());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getJobs();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('VideoUploadQueue listener error:', err);
      }
    });
  }

  private updateJob(jobId: string, patch: Partial<VideoUploadJob>): void {
    this.jobs = this.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job));
    this.emit();
  }

  public clearFailedJobs(): void {
    clearFailedVideoAndStudioDrafts();
    this.jobs.forEach((j) => {
      if (j.status === 'failed' || j.status === 'cancelled') {
        if (j.videoPreviewUrl) {
          try {
            URL.revokeObjectURL(j.videoPreviewUrl);
          } catch {}
        }
        this.compressedFilesCache.delete(j.id);
      }
    });
    this.jobs = this.jobs.filter((j) => j.status !== 'failed' && j.status !== 'cancelled');
    this.emit();
  }

  public enqueue(input: VideoPostUploadJobInput): string {
    // Clear any old failed drafts before starting a new upload
    this.clearFailedJobs();

    const now = Date.now();
    const postId = input.postId || `post_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const jobId = `vidjob_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const isProUser = Boolean(input.isProUser);
    const maxSec = getMaxVideoDurationSeconds(isProUser);
    const initialDuration = Math.min(
      maxSec,
      Math.max(1, (input.trimEnd ?? maxSec) - (input.trimStart ?? 0))
    );

    const normalizedCaption = input.caption ?? input.content ?? '';
    const normalizedThumb = input.customThumbnailUrl || input.customThumbnailDataUrl || '';
    const safeAuthorAvatar = sanitizeAvatarUrlForFirestore(input.authorPhotoURL, input.authorId);
    const rawFileSize = input.file?.size || 0;
    const initialSizeLabel = formatVideoFileSize(rawFileSize);
    let previewUrl = '';
    try {
      previewUrl = URL.createObjectURL(input.file);
    } catch {}

    const newJob: VideoUploadJob = {
      id: jobId,
      postId,
      authorId: input.authorId,
      authorEmail: input.authorEmail || '',
      authorName: input.authorName || 'Creator',
      authorUsername: input.authorUsername || '@waver',
      authorPhotoURL: safeAuthorAvatar,
      fileName: input.file.name || 'video.mp4',
      fileSize: rawFileSize,
      bytesTransferred: 0,
      formattedFileSize: initialSizeLabel,
      thumbnailUrl: normalizedThumb.startsWith('http') ? normalizedThumb : '',
      videoPreviewUrl: previewUrl,
      isProUser,
      phase: 'preparing',
      progress: 5,
      status: 'preparing',
      statusText: `Preparing video (${initialSizeLabel})...`,
      durationSeconds: initialDuration,
      createdAt: now,
      input: {
        ...input,
        postId,
        authorPhotoURL: safeAuthorAvatar,
        isProUser,
        caption: normalizedCaption,
        customThumbnailUrl: normalizedThumb || undefined,
        songTitle: input.songTitle ?? input.songMetadata?.songTitle,
        songArtist: input.songArtist ?? input.songMetadata?.songArtist,
        songAlbumArt: sanitizeOptionalHttpUrl(input.songAlbumArt ?? input.songMetadata?.songAlbumArt),
        songPreviewUrl: sanitizeOptionalHttpUrl(input.songPreviewUrl ?? input.songMetadata?.songPreviewUrl),
        songAlbumName: input.songAlbumName ?? input.songMetadata?.songAlbumName,
        songStartTime: input.songStartTime ?? input.songMetadata?.songStartTime,
        songVolume: input.songVolume ?? input.songMetadata?.songVolume
      }
    };

    this.jobs = [newJob, ...this.jobs.filter((j) => j.status !== 'cancelled' && j.status !== 'failed')];
    this.emit();

    void this.runJob(jobId);
    return jobId;
  }

  public pauseJob(jobId: string): void {
    const handle = this.activeHandles.get(jobId);
    if (handle) {
      handle.pause();
      this.updateJob(jobId, {
        status: 'paused',
        statusText: 'Upload paused'
      });
    }
  }

  public resumeJob(jobId: string): void {
    const handle = this.activeHandles.get(jobId);
    if (handle) {
      handle.resume();
      this.updateJob(jobId, {
        status: 'uploading',
        statusText: 'Resuming upload...'
      });
    }
  }

  public cancelJob(jobId: string): void {
    const target = this.jobs.find((j) => j.id === jobId);
    if (target?.videoPreviewUrl) {
      try {
        URL.revokeObjectURL(target.videoPreviewUrl);
      } catch {}
    }
    const abortCtrl = this.abortControllers.get(jobId);
    if (abortCtrl) {
      abortCtrl.abort();
      this.abortControllers.delete(jobId);
    }
    const handle = this.activeHandles.get(jobId);
    if (handle) {
      handle.cancel();
      this.activeHandles.delete(jobId);
    }
    this.compressedFilesCache.delete(jobId);
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.emit();
  }

  /**
   * Re-uploads the video file from the browser to Cloudinary from scratch
   * instead of resending a failed Firestore document, and clears any stale cache/drafts.
   */
  public retryJob(jobId: string): void {
    const target = this.jobs.find((j) => j.id === jobId);
    if (!target) return;

    clearFailedVideoAndStudioDrafts();
    this.compressedFilesCache.delete(jobId);

    const freshPostId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sizeLabel = formatVideoFileSize(target.input.file?.size || target.fileSize);

    this.updateJob(jobId, {
      postId: freshPostId,
      input: {
        ...target.input,
        postId: freshPostId
      },
      status: 'preparing',
      phase: 'preparing',
      progress: 5,
      bytesTransferred: 0,
      formattedFileSize: sizeLabel,
      error: undefined,
      statusText: `Re-uploading video from browser (${sizeLabel})...`
    });

    void this.runJob(jobId);
  }

  public dismissJob(jobId: string): void {
    const target = this.jobs.find((j) => j.id === jobId);
    if (target?.videoPreviewUrl) {
      try {
        URL.revokeObjectURL(target.videoPreviewUrl);
      } catch {}
    }
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.compressedFilesCache.delete(jobId);
    this.emit();
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;

    const { input, postId, isProUser } = job;
    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);
    const maxAllowedSeconds = getMaxVideoDurationSeconds(isProUser);

    try {
      let prepared = this.compressedFilesCache.get(jobId);

      // Step 1: Inspect/trim video in browser (preserving original quality & enforcing 60s Free / 90s Pro limit)
      if (!prepared) {
        const rawSizeLabel = formatVideoFileSize(input.file.size);
        this.updateJob(jobId, {
          phase: 'preparing',
          status: 'preparing',
          progress: 6,
          formattedFileSize: rawSizeLabel,
          statusText: `Preparing video (${rawSizeLabel})...`
        });
        if (input.onProgress) {
          input.onProgress(6, `Preparing video (${rawSizeLabel})...`);
        }

        const compressed = await compressVideoBeforeUpload(input.file, {
          trimStart: input.trimStart,
          trimEnd: input.trimEnd,
          isProUser,
          signal: abortController.signal,
          onProgress: (pct, label) => {
            const mapped = Math.max(5, Math.min(20, Math.round(pct * 0.2)));
            const text = label || `Preparing video (${pct}%)...`;
            this.updateJob(jobId, {
              phase: 'preparing',
              status: 'preparing',
              progress: pct,
              statusText: text
            });
            if (input.onProgress) {
              input.onProgress(mapped, text);
            }
          }
        });

        if (abortController.signal.aborted) return;

        prepared = {
          file: compressed.file,
          durationSeconds: compressed.durationSeconds,
          width: compressed.width,
          height: compressed.height,
          thumbnailUrl: input.customThumbnailUrl || input.customThumbnailDataUrl || ''
        };
        this.compressedFilesCache.set(jobId, prepared);

        const compressedSizeLabel = formatVideoFileSize(prepared.file.size);
        this.updateJob(jobId, {
          fileSize: prepared.file.size,
          formattedFileSize: compressedSizeLabel,
          durationSeconds: prepared.durationSeconds,
          videoWidth: prepared.width,
          videoHeight: prepared.height,
          progress: 100,
          statusText: `Video ready (${compressedSizeLabel}) — uploading to Cloudinary...`
        });
      }

      const uploadSizeLabel = formatVideoFileSize(prepared.file.size);

      // Step 2: Direct browser -> Cloudinary unsigned upload API (Cloud name monarcking72, preset monarcking72)
      this.updateJob(jobId, {
        phase: 'uploading',
        status: 'uploading',
        progress: 1,
        bytesTransferred: 0,
        fileSize: prepared.file.size,
        formattedFileSize: `0 KB / ${uploadSizeLabel}`,
        statusText: `Uploading 1% • 0 KB / ${uploadSizeLabel}`
      });
      if (input.onProgress) {
        input.onProgress(20, `Uploading to Cloudinary (1% • ${uploadSizeLabel})...`);
      }

      const handle = startDirectVideoUploadToCloudinary({
        postId,
        userId: input.authorId,
        file: prepared.file,
        thumbnailDataUrl: prepared.thumbnailUrl,
        durationSeconds: prepared.durationSeconds,
        width: prepared.width,
        height: prepared.height,
        isProUser,
        onProgress: (pct, statusText, bytesTransferred, totalBytes) => {
          const current = this.jobs.find((j) => j.id === jobId);
          if (!current || current.status === 'cancelled') return;
          const total = totalBytes > 0 ? totalBytes : prepared!.file.size;
          const transferred = Math.max(0, bytesTransferred);
          this.updateJob(jobId, {
            phase: 'uploading',
            progress: pct,
            bytesTransferred: transferred,
            fileSize: total,
            formattedFileSize: `${formatVideoFileSize(transferred)} / ${formatVideoFileSize(total)}`,
            statusText
          });
          if (input.onProgress) {
            const overallPct = Math.max(20, Math.min(98, Math.round(20 + pct * 0.78)));
            input.onProgress(overallPct, statusText);
          }
        },
        onStateChange: (state) => {
          const current = this.jobs.find((j) => j.id === jobId);
          if (!current || current.status === 'cancelled') return;
          if (state === 'paused') {
            this.updateJob(jobId, { status: 'paused' });
          } else if (state === 'waiting_network') {
            this.updateJob(jobId, { status: 'waiting_network' });
          } else {
            this.updateJob(jobId, { status: 'uploading' });
          }
        }
      });

      this.activeHandles.set(jobId, handle);
      const uploadResult = await handle.promise;
      this.activeHandles.delete(jobId);

      if (
        !uploadResult.videoUrl ||
        uploadResult.videoUrl.startsWith('data:') ||
        uploadResult.videoUrl.startsWith('blob:') ||
        !uploadResult.videoUrl.startsWith('http')
      ) {
        throw new Error(
          'Cloudinary upload did not return a valid secure_url. Never saving base64 or raw video data in Firestore.'
        );
      }

      // Step 3: Create the post in Firestore ONLY after the Cloudinary upload has finished,
      // saving only the returned secure_url, small HTTP thumbnail URL, duration, width, and height.
      const extractedHashtags =
        input.hashtags && input.hashtags.length > 0
          ? input.hashtags
          : Array.from(
              new Set(
                ((input.caption || '').match(/#[a-zA-Z0-9_]+/g) || []).map((tag) =>
                  tag.replace(/^#/, '')
                )
              )
            );

      const roundedDuration = Math.max(
        1,
        Math.min(maxAllowedSeconds, Math.round(uploadResult.durationSeconds * 10) / 10)
      );

      const finalWidth = uploadResult.width || prepared.width || 720;
      const finalHeight = uploadResult.height || prepared.height || 1280;

      // Strictly use an HTTPS thumbnail URL (either uploaded custom cover URL or Cloudinary derived .jpg URL)
      const derivedFallbackThumb = uploadResult.videoUrl
        .replace('/video/upload/', '/video/upload/so_1.0,w_640,c_limit,q_auto:good/')
        .replace(/\.[a-zA-Z0-9]+(\?.*)?$/, '.jpg');
      const cloudPosterUrl =
        uploadResult.thumbnailUrl && uploadResult.thumbnailUrl.startsWith('http')
          ? uploadResult.thumbnailUrl
          : derivedFallbackThumb.startsWith('http')
          ? derivedFallbackThumb
          : undefined;

      const safeAuthorPhotoUrl = sanitizeAvatarUrlForFirestore(input.authorPhotoURL, input.authorId);

      const postPayload: Post = {
        id: postId,
        authorId: input.authorId,
        authorEmail: input.authorEmail || '',
        authorName: input.authorName || 'Creator',
        authorUsername: input.authorUsername || '@waver',
        authorPhotoURL: safeAuthorPhotoUrl,
        content: (input.caption || '').trim(),
        mediaType: 'video',
        videoUrl: uploadResult.videoUrl,
        thumbnailUrl: cloudPosterUrl,
        storagePath: uploadResult.storagePath,
        duration: roundedDuration,
        videoDurationSeconds: roundedDuration,
        videoWidth: finalWidth,
        videoHeight: finalHeight,
        videoFileName: prepared.file.name,
        videoTrimStart: input.trimStart ?? 0,
        videoTrimEnd: input.trimEnd ?? roundedDuration,
        hasVideoChunks: false,
        aspectRatio: input.aspectRatio || '9:16',
        audience: input.audience || 'public',
        locationTag: input.locationTag?.trim() || undefined,
        allowComments: input.allowComments !== undefined ? input.allowComments : true,
        hashtags: extractedHashtags.length > 0 ? extractedHashtags : undefined,
        songTitle: input.songTitle,
        songArtist: input.songArtist,
        songAlbumArt: sanitizeOptionalHttpUrl(input.songAlbumArt),
        songPreviewUrl: sanitizeOptionalHttpUrl(input.songPreviewUrl),
        songAlbumName: input.songAlbumName,
        songStartTime: input.songStartTime,
        songVolume: input.songVolume,
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        savesCount: 0,
        createdAt: new Date().toISOString()
      };

      try {
        await savePostDocument(postPayload);
      } catch (firestoreErr) {
        console.error('[WaveLink Video Post Firestore Error]', firestoreErr);
        try {
          handleFirestoreError(firestoreErr, OperationType.CREATE, `posts/${postId}`);
        } catch {}
        throw firestoreErr;
      }

      clearFailedVideoAndStudioDrafts();

      this.compressedFilesCache.delete(jobId);
      this.updateJob(jobId, {
        phase: 'done',
        status: 'completed',
        progress: 100,
        thumbnailUrl: cloudPosterUrl || '',
        bytesTransferred: prepared.file.size,
        formattedFileSize: uploadSizeLabel,
        createdPost: postPayload,
        statusText: `Published (${uploadSizeLabel})!`
      });

      if (input.onProgress) {
        input.onProgress(100, `Published (${uploadSizeLabel})!`);
      }

      if (input.onComplete) {
        try {
          input.onComplete(postId, postPayload);
        } catch {}
      }

      // Dismiss completed banner after 4 seconds (the post is already live at the top of the feed)
      setTimeout(() => {
        this.dismissJob(jobId);
      }, 4000);
    } catch (error: any) {
      this.activeHandles.delete(jobId);
      this.compressedFilesCache.delete(jobId);
      const rawMsg = error instanceof Error ? error.message : String(error || '');
      if (rawMsg === 'UPLOAD_CANCELLED') {
        this.jobs = this.jobs.filter((j) => j.id !== jobId);
        this.emit();
        return;
      }

      const formattedError = formatVideoUploadError(error, {
        fileSize: job.fileSize,
        maxAllowedSeconds,
        isProUser,
        storagePath: `wavelink/${input.authorId}/${postId}`
      });

      this.updateJob(jobId, {
        status: 'failed',
        error: formattedError,
        statusText: 'Video upload failed — tap Retry to upload file again'
      });

      if (input.onError) {
        try {
          input.onError(formattedError, jobId);
        } catch {}
      }
    }
  }
}

export const videoUploadQueue = new VideoUploadQueueManager();

export function enqueueVideoUploadJob(input: VideoPostUploadJobInput): string {
  return videoUploadQueue.enqueue(input);
}

export function useVideoUploadQueue() {
  const [jobs, setJobs] = useState<VideoUploadJob[]>(() => videoUploadQueue.getJobs());

  useEffect(() => {
    return videoUploadQueue.subscribe(setJobs);
  }, []);

  return {
    jobs,
    pauseJob: (id: string) => videoUploadQueue.pauseJob(id),
    resumeJob: (id: string) => videoUploadQueue.resumeJob(id),
    cancelJob: (id: string) => videoUploadQueue.cancelJob(id),
    retryJob: (id: string) => videoUploadQueue.retryJob(id),
    dismissJob: (id: string) => videoUploadQueue.dismissJob(id),
    clearFailedJobs: () => videoUploadQueue.clearFailedJobs()
  };
}
