import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  db,
  cleanFirestoreData,
  handleFirestoreError,
  OperationType,
  formatVideoUploadError
} from '../firebase';
import { OnlineSong } from '../types';
import {
  compressImage,
  uploadSparkImageToStorage,
  uploadSparkVideoToStorage,
  SparkVideoMetadata,
} from '../utils/mediaStorage';

export interface SparkUploadQueueSlide {
  id: string;
  mediaDataUrl: string;
  mediaType: 'image' | 'video';
  file?: File | null;
  hasVideoChunks?: boolean;
  videoMeta?: SparkVideoMetadata | null;
  caption: string;
  legendaryTag: string;
  sourcePostId?: string;
}

export interface SparkUploadJobInput {
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername: string;
  authorPhotoURL: string;
  isProTier: boolean;
  attachedSong?: OnlineSong | null;
  slides: SparkUploadQueueSlide[];
  onComplete?: () => void;
}

export type SparkUploadJobStatus = 'queued' | 'uploading' | 'completed' | 'failed';

export interface SparkUploadJob {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string;
  previewThumbUrl: string;
  totalCount: number;
  completedCount: number;
  progress: number;
  status: SparkUploadJobStatus;
  statusText: string;
  error?: string;
  createdAt: number;
  input: SparkUploadJobInput;
}

type QueueListener = (jobs: SparkUploadJob[]) => void;

class SparkUploadQueueManager {
  private jobs: SparkUploadJob[] = [];
  private listeners: Set<QueueListener> = new Set();
  private isProcessing = false;

  public getJobs(): SparkUploadJob[] {
    return [...this.jobs];
  }

  public subscribe(listener: QueueListener): () => void {
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
        console.error('SparkUploadQueue listener error:', err);
      }
    });
  }

  private updateJob(jobId: string, patch: Partial<SparkUploadJob>): void {
    this.jobs = this.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job));
    this.emit();
  }

  public enqueue(input: SparkUploadJobInput): string {
    const now = Date.now();
    const jobId = `sparkjob_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const firstSlide = input.slides[0];
    const totalCount = input.slides.length;

    const newJob: SparkUploadJob = {
      id: jobId,
      authorId: input.authorId,
      authorName: input.authorName,
      authorPhotoURL: input.authorPhotoURL,
      previewThumbUrl: firstSlide?.mediaDataUrl || input.authorPhotoURL,
      totalCount,
      completedCount: 0,
      progress: 6,
      status: 'queued',
      statusText:
        totalCount > 1
          ? `Queued ${totalCount} Sparks for background upload...`
          : 'Queued Spark for background upload...',
      createdAt: now,
      input,
    };

    this.jobs = [newJob, ...this.jobs];
    this.emit();

    void this.processQueue();
    return jobId;
  }

  public retryJob(jobId: string): void {
    const target = this.jobs.find((j) => j.id === jobId);
    if (!target || target.status !== 'failed') return;

    this.updateJob(jobId, {
      status: 'queued',
      progress: 8,
      completedCount: 0,
      error: undefined,
      statusText: 'Retrying Spark upload in background...',
    });

    void this.processQueue();
  }

  public dismissJob(jobId: string): void {
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.emit();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const nextJob = this.jobs.find((j) => j.status === 'queued');
        if (!nextJob) break;
        await this.executeJob(nextJob);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(job: SparkUploadJob): Promise<void> {
    const { id: jobId, input } = job;
    const slides = input.slides;
    const total = slides.length;

    if (total === 0) {
      this.dismissJob(jobId);
      return;
    }

    this.updateJob(jobId, {
      status: 'uploading',
      progress: 10,
      statusText:
        total > 1
          ? `Uploading ${total} Sparks in background...`
          : 'Uploading Spark in background...',
    });

    const baseTimeMs = Date.now();
    const batchId = `batch_${baseTimeMs}`;
    const slideProgress = new Array<number>(total).fill(10);
    let completedSlides = 0;

    const updateOverallProgress = (slideIdx: number, pct: number, label?: string) => {
      slideProgress[slideIdx] = Math.max(slideProgress[slideIdx], Math.min(100, pct));
      const avg = Math.round(slideProgress.reduce((a, b) => a + b, 0) / total);
      const nextStatusText = label
        ? total > 1
          ? `Spark ${slideIdx + 1}/${total}: ${label}`
          : label
        : total > 1
        ? `Uploading Spark ${Math.min(completedSlides + 1, total)} of ${total}...`
        : 'Uploading Spark in background...';

      this.updateJob(jobId, {
        progress: Math.max(12, Math.min(99, avg)),
        completedCount: completedSlides,
        statusText: nextStatusText,
      });
    };

    try {
      await Promise.all(
        slides.map(async (slide, i) => {
          const sparkId = `spark_${baseTimeMs + i}_${Math.random().toString(36).substring(2, 7)}`;
          // Offset createdAt by +i seconds so multi-post Sparks strictly preserve slide order
          const createdAtIso = new Date(baseTimeMs + i * 1000).toISOString();
          const expiresAtIso = new Date(baseTimeMs + 24 * 60 * 60 * 1000).toISOString();

          const sparkPayload: Record<string, any> = {
            id: sparkId,
            batchId,
            slideIndex: i,
            totalSlides: total,
            authorId: input.authorId,
            authorEmail: input.authorEmail,
            authorName: input.authorName,
            authorUsername: input.authorUsername,
            authorPhotoURL: input.authorPhotoURL,
            legendaryTag: slide.legendaryTag || '🏆 Legendary Win',
            caption: (slide.caption || '').trim(),
            mediaType: slide.mediaType,
            hasVideoChunks: false,
            likes: [],
            likesCount: 0,
            likedUsers: [],
            viewers: [],
            viewersCount: 0,
            viewerUsers: [],
            createdAt: createdAtIso,
            expiresAt: expiresAtIso,
          };

          if (slide.sourcePostId) {
            sparkPayload.sourcePostId = slide.sourcePostId;
          }

          if (input.attachedSong) {
            sparkPayload.songTitle = input.attachedSong.trackName;
            sparkPayload.songArtist = input.attachedSong.artistName;
            sparkPayload.songAlbumArt = input.attachedSong.artworkUrl100;
            sparkPayload.songPreviewUrl = input.attachedSong.previewUrl;
          }

          if (slide.mediaType === 'image') {
            let finalImageUrl = slide.mediaDataUrl;
            if (slide.file && (!finalImageUrl || finalImageUrl.length > 600 * 1024)) {
              finalImageUrl = await compressImage(slide.file, 1280, 1280, 0.75);
            }
            const imgUpload = await uploadSparkImageToStorage({
              sparkId,
              userId: input.authorId,
              file: slide.file,
              dataUrl: finalImageUrl,
              onProgress: (pct) => {
                updateOverallProgress(i, pct, 'Uploading photo...');
              },
            });
            sparkPayload.mediaUrl = imgUpload.downloadUrl;
            if (imgUpload.storagePath) {
              sparkPayload.storagePath = imgUpload.storagePath;
            }
          } else if (slide.mediaType === 'video') {
            if (!slide.file) {
              throw new Error('Video file is missing for Spark upload. Please select the video again.');
            }
            const videoRes = await uploadSparkVideoToStorage({
              sparkId,
              userId: input.authorId,
              file: slide.file,
              isProUser: input.isProTier,
              metadata: slide.videoMeta || undefined,
              onProgress: (pct, statusLabel) => {
                updateOverallProgress(i, pct, statusLabel);
              },
            });

            if (
              !videoRes.downloadUrl ||
              videoRes.downloadUrl.startsWith('data:video/') ||
              !videoRes.downloadUrl.startsWith('http')
            ) {
              throw new Error(
                'Cloudinary upload did not return a valid secure_url for Spark video.'
              );
            }

            const cloudThumbUrl =
              videoRes.thumbnailUrl && videoRes.thumbnailUrl.startsWith('http')
                ? videoRes.thumbnailUrl
                : videoRes.downloadUrl.replace(/\.[a-zA-Z0-9]+(\?.*)?$/, '.jpg');

            sparkPayload.mediaUrl = videoRes.downloadUrl;
            sparkPayload.storagePath = videoRes.storagePath;
            sparkPayload.thumbnailUrl = cloudThumbUrl;
            sparkPayload.videoFileName = slide.file.name;
            sparkPayload.videoDurationSeconds = videoRes.durationSeconds;
            sparkPayload.videoWidth = videoRes.width;
            sparkPayload.videoHeight = videoRes.height;
            sparkPayload.videoFileSize = videoRes.fileSize;
            sparkPayload.videoMimeType = videoRes.mimeType;
            sparkPayload.hasVideoChunks = false;
          }

          await setDoc(doc(db, 'sparks', sparkId), cleanFirestoreData(sparkPayload));
          completedSlides += 1;
          updateOverallProgress(i, 100, 'Saved to Spark!');
        })
      );

      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completedCount: total,
        statusText:
          total > 1
            ? `Published ${total} Sparks to your 24h story! 🔥`
            : 'Spark published to your 24h story! 🔥',
      });

      if (input.onComplete) {
        try {
          input.onComplete();
        } catch {
          // ignore callback error
        }
      }

      // Automatically dismiss completed notification after 4.5s
      setTimeout(() => {
        this.dismissJob(jobId);
      }, 4500);
    } catch (error: any) {
      const formattedError = formatVideoUploadError(error, {
        isProUser: input.isProTier,
        maxAllowedSeconds: input.isProTier ? 90 : 60,
        storagePath: `wavelink/${input.authorId}/spark`
      });
      this.updateJob(jobId, {
        status: 'failed',
        error: formattedError || 'Spark upload encountered an issue. Tap Retry to try again.',
        statusText: 'Spark upload failed — tap Retry',
      });
    }
  }
}

export const sparkUploadQueue = new SparkUploadQueueManager();

export function enqueueSparkUploadJob(input: SparkUploadJobInput): string {
  return sparkUploadQueue.enqueue(input);
}

export function retrySparkUploadJob(jobId: string): void {
  sparkUploadQueue.retryJob(jobId);
}

export function dismissSparkUploadJob(jobId: string): void {
  sparkUploadQueue.dismissJob(jobId);
}

export function useSparkUploadQueue(): {
  jobs: SparkUploadJob[];
  activeJobs: SparkUploadJob[];
  isUploadingAny: boolean;
  overallProgress: number;
  retryJob: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
} {
  const [jobs, setJobs] = useState<SparkUploadJob[]>(() => sparkUploadQueue.getJobs());

  useEffect(() => {
    return sparkUploadQueue.subscribe(setJobs);
  }, []);

  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
  const isUploadingAny = activeJobs.length > 0;
  const overallProgress =
    activeJobs.length > 0
      ? Math.round(activeJobs.reduce((acc, j) => acc + j.progress, 0) / activeJobs.length)
      : jobs.some((j) => j.status === 'completed')
      ? 100
      : 0;

  return {
    jobs,
    activeJobs,
    isUploadingAny,
    overallProgress,
    retryJob: retrySparkUploadJob,
    dismissJob: dismissSparkUploadJob,
  };
}
