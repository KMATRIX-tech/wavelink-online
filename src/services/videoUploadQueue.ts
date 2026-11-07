import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  db,
  cleanFirestoreData,
  handleFirestoreError,
  OperationType,
  formatVideoUploadError
} from '../firebase';
import {
  compressVideoBeforeUpload,
  generateVideoThumbnail,
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
  onComplete?: (postId: string, createdPost?: Post) => void;
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

class VideoUploadQueueManager {
  private jobs: VideoUploadJob[] = [];
  private listeners: Set<VideoQueueListener> = new Set();
  private activeHandles: Map<string, DirectVideoUploadTaskHandle> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private compressedFilesCache: Map<
    string,
    { file: File; durationSeconds: number; width: number; height: number; thumbnailUrl: string }
  > = new Map();

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

  public enqueue(input: VideoPostUploadJobInput): string {
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
      authorPhotoURL: input.authorPhotoURL,
      fileName: input.file.name || 'video.mp4',
      fileSize: rawFileSize,
      bytesTransferred: 0,
      formattedFileSize: initialSizeLabel,
      thumbnailUrl: normalizedThumb,
      videoPreviewUrl: previewUrl,
      isProUser,
      phase: 'preparing',
      progress: 5,
      status: 'preparing',
      statusText: `Preparing 720p video (${initialSizeLabel})...`,
      durationSeconds: initialDuration,
      createdAt: now,
      input: {
        ...input,
        postId,
        isProUser,
        caption: normalizedCaption,
        customThumbnailUrl: normalizedThumb || undefined,
        songTitle: input.songTitle ?? input.songMetadata?.songTitle,
        songArtist: input.songArtist ?? input.songMetadata?.songArtist,
        songAlbumArt: input.songAlbumArt ?? input.songMetadata?.songAlbumArt,
        songPreviewUrl: input.songPreviewUrl ?? input.songMetadata?.songPreviewUrl,
        songAlbumName: input.songAlbumName ?? input.songMetadata?.songAlbumName,
        songStartTime: input.songStartTime ?? input.songMetadata?.songStartTime,
        songVolume: input.songVolume ?? input.songMetadata?.songVolume
      }
    };

    this.jobs = [newJob, ...this.jobs.filter((j) => j.status !== 'cancelled')];
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

  public retryJob(jobId: string): void {
    const target = this.jobs.find((j) => j.id === jobId);
    if (!target) return;

    const cached = this.compressedFilesCache.get(jobId);
    const sizeLabel = formatVideoFileSize(cached?.file.size || target.fileSize);

    this.updateJob(jobId, {
      status: cached ? 'uploading' : 'preparing',
      phase: cached ? 'uploading' : 'preparing',
      progress: 5,
      bytesTransferred: 0,
      formattedFileSize: sizeLabel,
      error: undefined,
      statusText: cached
        ? `Retrying upload (${sizeLabel})...`
        : `Preparing 720p video (${sizeLabel})...`
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

      // Step 1: Compress / downscale video to ~720p in browser & generate thumbnail
      if (!prepared) {
        const rawSizeLabel = formatVideoFileSize(input.file.size);
        this.updateJob(jobId, {
          phase: 'preparing',
          status: 'preparing',
          progress: 6,
          formattedFileSize: rawSizeLabel,
          statusText: `Preparing 720p video (${rawSizeLabel})...`
        });

        const [firstSecThumb, compressed] = await Promise.all([
          input.customThumbnailUrl
            ? Promise.resolve(input.customThumbnailUrl)
            : generateVideoThumbnail(input.file, 1.0),
          compressVideoBeforeUpload(input.file, {
            trimStart: input.trimStart,
            trimEnd: input.trimEnd,
            isProUser,
            signal: abortController.signal,
            onProgress: (pct, label) => {
              this.updateJob(jobId, {
                phase: 'preparing',
                status: 'preparing',
                progress: Math.max(5, Math.min(100, pct)),
                statusText: label || `Compressing to 720p (${pct}%)...`
              });
            }
          })
        ]);

        if (abortController.signal.aborted) return;

        prepared = {
          file: compressed.file,
          durationSeconds: compressed.durationSeconds,
          width: compressed.width,
          height: compressed.height,
          thumbnailUrl: firstSecThumb || job.thumbnailUrl
        };
        this.compressedFilesCache.set(jobId, prepared);

        const compressedSizeLabel = formatVideoFileSize(prepared.file.size);
        this.updateJob(jobId, {
          fileSize: prepared.file.size,
          formattedFileSize: compressedSizeLabel,
          thumbnailUrl: prepared.thumbnailUrl,
          durationSeconds: prepared.durationSeconds,
          videoWidth: prepared.width,
          videoHeight: prepared.height,
          progress: 100,
          statusText: `720p video ready (${compressedSizeLabel}) — starting upload...`
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
        uploadResult.videoUrl.startsWith('data:video/') ||
        !uploadResult.videoUrl.startsWith('http')
      ) {
        throw new Error(
          'Cloudinary upload did not return a valid secure_url. Never saving base64 video in Firestore.'
        );
      }

      // Step 3: Create the post in Firestore ONLY after the Cloudinary upload has finished,
      // saving only the returned secure_url and basic metadata.
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

      // Prefer the lightweight Cloudinary .jpg poster URL over large base64 data URLs
      const cloudPosterUrl =
        uploadResult.thumbnailUrl && uploadResult.thumbnailUrl.startsWith('http')
          ? uploadResult.thumbnailUrl
          : uploadResult.videoUrl.replace(/\.[a-zA-Z0-9]+(\?.*)?$/, '.jpg');

      const postPayload: Post = {
        id: postId,
        authorId: input.authorId,
        authorEmail: input.authorEmail || '',
        authorName: input.authorName || 'Creator',
        authorUsername: input.authorUsername || '@waver',
        authorPhotoURL: input.authorPhotoURL,
        content: (input.caption || '').trim(),
        mediaType: 'video',
        videoUrl: uploadResult.videoUrl,
        thumbnailUrl: cloudPosterUrl || undefined,
        storagePath: uploadResult.storagePath,
        duration: roundedDuration,
        videoDurationSeconds: roundedDuration,
        videoWidth: prepared.width || undefined,
        videoHeight: prepared.height || undefined,
        videoFileName: prepared.file.name,
        videoTrimStart: input.trimStart ?? 0,
        videoTrimEnd: input.trimEnd ?? roundedDuration,
        hasVideoChunks: false,
        aspectRatio: input.aspectRatio || '4:5',
        audience: input.audience || 'public',
        locationTag: input.locationTag?.trim() || undefined,
        allowComments: input.allowComments !== undefined ? input.allowComments : true,
        hashtags: extractedHashtags.length > 0 ? extractedHashtags : undefined,
        songTitle: input.songTitle,
        songArtist: input.songArtist,
        songAlbumArt: input.songAlbumArt,
        songPreviewUrl: input.songPreviewUrl,
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
        await setDoc(doc(db, 'posts', postId), cleanFirestoreData(postPayload));
      } catch (firestoreErr) {
        console.error('[WaveLink Video Post Firestore Error]', firestoreErr);
        try {
          handleFirestoreError(firestoreErr, OperationType.CREATE, `posts/${postId}`);
        } catch {}
        throw firestoreErr;
      }

      // Immediately notify FeedView / VideosHubView so the saved post appears at the top of the feed right away
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wavelink:video-post-created', { detail: postPayload })
        );
      }

      this.compressedFilesCache.delete(jobId);
      this.updateJob(jobId, {
        phase: 'done',
        status: 'completed',
        progress: 100,
        bytesTransferred: prepared.file.size,
        formattedFileSize: uploadSizeLabel,
        createdPost: postPayload,
        statusText: `Published (${uploadSizeLabel})!`
      });

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
        statusText: 'Video upload failed — tap Retry'
      });
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
    dismissJob: (id: string) => videoUploadQueue.dismissJob(id)
  };
}
