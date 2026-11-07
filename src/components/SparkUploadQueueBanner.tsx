import React from 'react';
import { useSparkUploadQueue } from '../services/sparkUploadQueue';
import { Flame, CheckCircle2, AlertCircle, RotateCcw, X } from 'lucide-react';

interface SparkUploadQueueBannerProps {
  variant?: 'floating' | 'inline';
}

export const SparkUploadQueueBanner: React.FC<SparkUploadQueueBannerProps> = ({
  variant = 'floating',
}) => {
  const { jobs, retryJob, dismissJob } = useSparkUploadQueue();

  if (jobs.length === 0) return null;

  if (variant === 'inline') {
    return (
      <div className="space-y-2">
        {jobs.map((job) => {
          const isCompleted = job.status === 'completed';
          const isFailed = job.status === 'failed';

          return (
            <div
              key={job.id}
              role="status"
              aria-live="polite"
              className={`p-3 rounded-xl border transition-all ${
                isFailed
                  ? 'bg-rose-50/95 border-rose-200 text-rose-950'
                  : isCompleted
                  ? 'bg-emerald-50/95 border-emerald-200 text-emerald-950'
                  : 'bg-blue-50/95 border-blue-200 text-[#1C1917]'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-white/80 shadow-2xs">
                    {job.previewThumbUrl ? (
                      <img
                        src={job.previewThumbUrl}
                        alt="Spark preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#2563EB] text-white">
                        <Flame size={15} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold truncate flex items-center gap-1.5">
                        {isCompleted ? (
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        ) : isFailed ? (
                          <AlertCircle size={14} className="text-rose-600 shrink-0" />
                        ) : (
                          <Flame size={14} className="text-[#2563EB] animate-pulse shrink-0" />
                        )}
                        <span className="truncate">{job.statusText}</span>
                      </span>

                      {!isFailed && (
                        <span className="text-[11px] font-mono font-extrabold text-[#2563EB] shrink-0">
                          {job.progress}%
                        </span>
                      )}
                    </div>

                    {isFailed ? (
                      <p className="text-[11px] text-rose-700 font-medium break-words leading-snug mt-0.5">
                        {job.error || 'Upload interrupted. Tap Retry to resume.'}
                      </p>
                    ) : (
                      <div className="w-full h-1.5 bg-white/80 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isCompleted
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-[#2563EB] to-[#0D9488]'
                          }`}
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isFailed && (
                    <button
                      type="button"
                      onClick={() => retryJob(job.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold flex items-center gap-1 transition"
                    >
                      <RotateCcw size={12} />
                      <span>Retry</span>
                    </button>
                  )}
                  {(isCompleted || isFailed) && (
                    <button
                      type="button"
                      onClick={() => dismissJob(job.id)}
                      className="p-1 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-3 sm:right-6 z-40 w-[calc(100vw-1.5rem)] max-w-sm space-y-2 pointer-events-none"
      aria-live="polite"
    >
      {jobs.map((job) => {
        const isCompleted = job.status === 'completed';
        const isFailed = job.status === 'failed';

        return (
          <div
            key={job.id}
            className={`pointer-events-auto p-3 rounded-2xl border shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              isFailed
                ? 'bg-white/95 border-rose-200 text-rose-950'
                : isCompleted
                ? 'bg-white/95 border-emerald-200 text-[#1C1917]'
                : 'bg-white/95 border-blue-200/90 text-[#1C1917]'
            }`}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-stone-900 shrink-0 border border-[#EFECE6]">
                  {job.previewThumbUrl ? (
                    <img
                      src={job.previewThumbUrl}
                      alt="Spark thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#2563EB] text-white">
                      <Flame size={16} />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold truncate flex items-center gap-1.5">
                      {isCompleted ? (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      ) : isFailed ? (
                        <AlertCircle size={14} className="text-rose-600 shrink-0" />
                      ) : (
                        <Flame size={14} className="text-[#2563EB] animate-pulse shrink-0" />
                      )}
                      <span className="truncate">{job.statusText}</span>
                    </span>

                    {!isFailed && (
                      <span className="text-[11px] font-mono font-extrabold text-[#2563EB] shrink-0">
                        {job.progress}%
                      </span>
                    )}
                  </div>

                  {isFailed ? (
                    <p className="text-[11px] text-rose-600 font-medium break-words leading-snug mt-0.5">
                      {job.error || 'Upload interrupted. Tap Retry.'}
                    </p>
                  ) : (
                    <div className="w-full h-1.5 bg-[#EFECE6] rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : 'bg-gradient-to-r from-[#2563EB] to-[#0D9488]'
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isFailed && (
                  <button
                    type="button"
                    onClick={() => retryJob(job.id)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold flex items-center gap-1 transition"
                  >
                    <RotateCcw size={12} />
                    <span>Retry</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissJob(job.id)}
                  className="p-1 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-[#FAF7F2] transition"
                  title="Hide notification"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
