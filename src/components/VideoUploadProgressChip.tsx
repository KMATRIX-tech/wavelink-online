import React from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  X,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Loader2,
  Film,
  HardDrive
} from 'lucide-react';
import {
  useVideoUploadQueue,
  videoUploadQueue,
  type VideoUploadJob
} from '../services/videoUploadQueue';
import { CrystalBadge } from './CrystalBadge';

interface VideoUploadProgressChipProps {
  /** When 'feed-inline', renders inline at the top of the feed. Otherwise renders a floating notification chip. */
  variant?: 'feed-inline' | 'floating';
  onViewPost?: (postId: string) => void;
}

export const VideoUploadProgressChip: React.FC<VideoUploadProgressChipProps> = ({
  variant = 'feed-inline'
}) => {
  const { jobs } = useVideoUploadQueue();

  if (jobs.length === 0) return null;

  const wrapperClass =
    variant === 'floating'
      ? 'fixed top-16 right-4 z-[90] w-[calc(100vw-2rem)] max-w-sm space-y-2 pointer-events-auto'
      : 'w-full mb-4 space-y-2.5';

  return (
    <div className={wrapperClass} role="region" aria-label="Video upload status">
      {jobs.map((job) => (
        <VideoUploadJobCard key={job.id} job={job} />
      ))}
    </div>
  );
};

const formatDurationBadge = (seconds?: number): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const VideoUploadJobCard: React.FC<{ job: VideoUploadJob }> = ({ job }) => {
  const isPreparing = job.status === 'preparing';
  const isUploading = job.status === 'uploading';
  const isPaused = job.status === 'paused';
  const isWaitingNetwork = job.status === 'waiting_network';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  const durationText = formatDurationBadge(job.durationSeconds);
  const captionText = job.input.caption || job.input.content || '';
  const pct = Math.max(1, Math.min(100, Math.round(job.progress)));

  return (
    <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-xl text-white transition-all">
      <div className="flex items-start gap-3">
        {/* Thumbnail Preview */}
        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/10 shrink-0 flex items-center justify-center">
          {job.thumbnailUrl ? (
            <img
              src={job.thumbnailUrl}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
            />
          ) : (
            <Film className="w-5 h-5 text-indigo-400" />
          )}
          {durationText && (
            <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/75 text-[9px] font-bold text-white rounded">
              {durationText}
            </span>
          )}
        </div>

        {/* Status, Percentage & File Size Progress Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {(isPreparing || isUploading) && (
                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
              )}
              {isPaused && <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {isWaitingNetwork && <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {isFailed && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}

              <span className="text-xs font-bold truncate">
                {isPreparing
                  ? 'Compressing to 720p...'
                  : isUploading
                  ? 'Uploading to Firebase Storage'
                  : job.statusText}
              </span>
            </div>

            {!isCompleted && !isFailed && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                  {job.formattedFileSize}
                </span>
                <span className="text-[11px] font-black font-mono text-indigo-300 tabular-nums">
                  {pct}%
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {!isCompleted && (
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isFailed
                    ? 'bg-rose-500'
                    : isPaused || isWaitingNetwork
                    ? 'bg-amber-400'
                    : isPreparing
                    ? 'bg-purple-500'
                    : 'bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400'
                }`}
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          )}

          {/* Error or Subtitle */}
          {isFailed && job.error ? (
            <div className="mt-2 p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-[11px] text-rose-200 leading-snug break-words">
              {job.error}
            </div>
          ) : isCompleted ? (
            <p className="text-[11px] text-emerald-300 font-medium mt-0.5">
              Your video post ({job.formattedFileSize}) is now live at the top of the feed!
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {isPreparing
                ? `Downscaling to ~720p (${job.formattedFileSize}) for fast upload`
                : isWaitingNetwork
                ? `Waiting for connection • ${job.formattedFileSize}`
                : captionText
                ? `${captionText} • ${job.formattedFileSize}`
                : `Uploading in the background (${job.formattedFileSize}) — keep browsing`}
            </p>
          )}
        </div>

        {/* Action Buttons: Pause / Resume / Retry / Cancel */}
        <div className="flex items-center gap-1 shrink-0">
          {isUploading && (
            <button
              type="button"
              onClick={() => videoUploadQueue.pauseJob(job.id)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-200 transition-colors"
              title="Pause upload"
              aria-label="Pause upload"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}

          {(isPaused || isWaitingNetwork) && (
            <button
              type="button"
              onClick={() => videoUploadQueue.resumeJob(job.id)}
              className="p-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors"
              title="Resume upload"
              aria-label="Resume upload"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={() => videoUploadQueue.retryJob(job.id)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Retry upload"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}

          {!isCompleted && (
            <button
              type="button"
              onClick={() => videoUploadQueue.cancelJob(job.id)}
              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Cancel upload"
              aria-label="Cancel upload"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isCompleted && (
            <button
              type="button"
              onClick={() => videoUploadQueue.dismissJob(job.id)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Dismiss notification"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Renders active and failed video upload jobs directly at the top of the Feed as full
 * 'Uploading' post cards with the progress bar, percentage, file size, and Retry button.
 */
export const VideoUploadingFeedPostList: React.FC = () => {
  const { jobs } = useVideoUploadQueue();
  const visibleFeedJobs = jobs.filter(
    (j) => j.status !== 'completed' && j.status !== 'cancelled'
  );

  if (visibleFeedJobs.length === 0) return null;

  return (
    <div className="space-y-5">
      {visibleFeedJobs.map((job) => {
        const isPreparing = job.status === 'preparing';
        const isUploading = job.status === 'uploading';
        const isPaused = job.status === 'paused';
        const isWaitingNetwork = job.status === 'waiting_network';
        const isFailed = job.status === 'failed';
        const pct = Math.max(1, Math.min(100, Math.round(job.progress)));
        const caption = job.input.caption || job.input.content || '';
        const ratio =
          job.videoWidth && job.videoHeight && job.videoWidth > 0 && job.videoHeight > 0
            ? Math.min(1.91, Math.max(0.5, job.videoWidth / job.videoHeight))
            : job.input.aspectRatio === '1:1'
            ? 1
            : job.input.aspectRatio === '9:16'
            ? 9 / 16
            : 4 / 5;

        return (
          <article
            key={job.id}
            data-wave-feed-item="true"
            className={`w-full max-w-full overflow-hidden break-words bg-[#FFFFFF] border rounded-3xl p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.08)] transition ${
              isFailed
                ? 'border-rose-300 ring-2 ring-rose-500/15'
                : 'border-blue-300 ring-2 ring-blue-500/15'
            }`}
          >
            {/* Author Header + Uploading Status Badge */}
            <div className="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    job.authorPhotoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${job.authorId}`
                  }
                  alt={job.authorName}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-[#2563EB]/20 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CrystalBadge email={job.authorEmail} name={job.authorName} size="md" />
                    {job.authorUsername && (
                      <span className="text-xs font-mono text-[#2563EB] font-semibold">
                        {job.authorUsername}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 font-bold text-[#2563EB]">
                      {(isPreparing || isUploading) && (
                        <Loader2 className="w-3 h-3 animate-spin text-[#2563EB]" />
                      )}
                      {isFailed ? (
                        <span className="text-rose-600">Upload Failed</span>
                      ) : isPaused ? (
                        <span className="text-amber-600">Paused • {pct}%</span>
                      ) : isPreparing ? (
                        <span>Uploading (Compressing to 720p • {pct}%)</span>
                      ) : (
                        <span>Uploading • {pct}%</span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600">
                      <HardDrive className="w-3 h-3 text-slate-400" />
                      <span>{job.formattedFileSize}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls: Pause / Resume / Retry / Cancel */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isUploading && (
                  <button
                    type="button"
                    onClick={() => videoUploadQueue.pauseJob(job.id)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Pause upload"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                {(isPaused || isWaitingNetwork) && (
                  <button
                    type="button"
                    onClick={() => videoUploadQueue.resumeJob(job.id)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Resume upload"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                )}

                {isFailed && (
                  <button
                    type="button"
                    onClick={() => videoUploadQueue.retryJob(job.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    title="Retry video upload"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => videoUploadQueue.cancelJob(job.id)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Cancel upload"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>

            {/* Caption */}
            {caption && (
              <p className="wavelink-post-body text-base text-[#0F172A] whitespace-pre-wrap leading-relaxed mb-3.5">
                {caption}
              </p>
            )}

            {/* Video Preview Frame in True Aspect Ratio */}
            <div
              className="relative w-full max-h-[80dvh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/80 mb-3.5 flex items-center justify-center"
              style={{ aspectRatio: String(ratio) }}
            >
              {job.videoPreviewUrl ? (
                <video
                  src={job.videoPreviewUrl}
                  poster={job.thumbnailUrl || undefined}
                  muted
                  playsInline
                  loop
                  autoPlay
                  className="w-full h-full max-h-[80dvh] object-cover opacity-80"
                />
              ) : job.thumbnailUrl ? (
                <img
                  src={job.thumbnailUrl}
                  alt="Uploading video preview"
                  className="w-full h-full max-h-[80dvh] object-cover opacity-80"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-white/80 p-6">
                  <Film className="w-10 h-10 mb-2 text-blue-400" />
                  <span className="text-xs font-bold">{job.fileName}</span>
                </div>
              )}

              {/* Top-left Uploading Pill */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/15 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg">
                {isFailed ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Upload Failed</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    <span>
                      {isPreparing ? 'Compressing to 720p' : 'Uploading'} • {pct}%
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Progress Bar with Percentage AND File Size */}
            <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#0F172A] truncate">{job.statusText}</span>
                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-slate-600 font-semibold">{job.formattedFileSize}</span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] font-extrabold tabular-nums">
                    {pct}%
                  </span>
                </div>
              </div>

              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isFailed
                      ? 'bg-rose-500'
                      : isPaused || isWaitingNetwork
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-[#2563EB] via-[#0D9488] to-[#10B981]'
                  }`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>

              {/* Real Error Message + Retry Button if Upload Failed */}
              {isFailed && job.error && (
                <div className="mt-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2.5">
                  <div className="flex items-start gap-2 text-xs font-semibold leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 break-words">{job.error}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => videoUploadQueue.cancelJob(job.id)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => videoUploadQueue.retryJob(job.id)}
                      className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Upload</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
