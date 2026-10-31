import React from 'react';

interface PostSkeletonProps {
  count?: number;
}

export const PostSkeleton: React.FC<PostSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className="space-y-4 w-full max-w-full">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="w-full max-w-full overflow-hidden bg-white dark:bg-[#131927] border border-gray-200/90 dark:border-gray-800/80 rounded-3xl p-4 sm:p-5 shadow-xs transition"
        >
          {/* Header Row: Avatar + Name + Subtitle */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
                <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-800/60 rounded-md animate-pulse" />
              </div>
            </div>
            {/* Top-right menu placeholder */}
            <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
          </div>

          {/* Text Content Lines */}
          <div className="space-y-2 mb-3.5">
            <div className="h-3.5 w-11/12 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
            <div className="h-3.5 w-4/5 bg-slate-100 dark:bg-slate-800/70 rounded-md animate-pulse" />
            {index % 2 === 0 && (
              <div className="h-3.5 w-1/2 bg-slate-100 dark:bg-slate-800/50 rounded-md animate-pulse" />
            )}
          </div>

          {/* Media box simulation for alternate skeleton cards */}
          {index % 2 === 0 && (
            <div className="relative w-full h-52 sm:h-72 rounded-2xl bg-gradient-to-br from-slate-200 via-purple-100/30 to-slate-200 dark:from-slate-800/90 dark:via-purple-950/20 dark:to-slate-800/60 animate-pulse mb-4 overflow-hidden border border-slate-100 dark:border-slate-800/60">
              <div className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-700">
                <div className="w-12 h-12 rounded-2xl bg-slate-300/40 dark:bg-slate-700/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-slate-400 dark:border-slate-600 rounded-md" />
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800/80">
            <div className="flex items-center gap-2">
              <div className="h-7 w-14 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-7 w-14 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
              <div className="h-7 w-16 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-8 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
              <div className="h-7 w-8 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
