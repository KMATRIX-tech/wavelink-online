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
          className="w-full max-w-full overflow-hidden bg-white border border-[var(--border-subtle)] rounded-3xl p-4 sm:p-5 shadow-xs transition"
        >
          {/* Header Row: Avatar + Name + Subtitle */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-stone-200 animate-pulse shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 bg-stone-200 rounded-md animate-pulse" />
                <div className="h-2.5 w-20 bg-stone-100 rounded-md animate-pulse" />
              </div>
            </div>
            {/* Top-right menu placeholder */}
            <div className="w-6 h-6 rounded-lg bg-stone-100 animate-pulse" />
          </div>

          {/* Text Content Lines */}
          <div className="space-y-2 mb-3.5">
            <div className="h-3.5 w-11/12 bg-stone-200 rounded-md animate-pulse" />
            <div className="h-3.5 w-4/5 bg-stone-100 rounded-md animate-pulse" />
            {index % 2 === 0 && (
              <div className="h-3.5 w-1/2 bg-stone-100 rounded-md animate-pulse" />
            )}
          </div>

          {/* Media box simulation for alternate skeleton cards */}
          {index % 2 === 0 && (
            <div className="relative w-full h-52 sm:h-72 rounded-2xl bg-gradient-to-br from-[#FAF7F2] via-[#EEF2FF]/60 to-[#FAF7F2] animate-pulse mb-4 overflow-hidden border border-[var(--border-subtle)]">
              <div className="absolute inset-0 flex items-center justify-center text-stone-300">
                <div className="w-12 h-12 rounded-2xl bg-stone-200/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-stone-400 rounded-md" />
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <div className="h-7 w-14 rounded-xl bg-stone-200 animate-pulse" />
              <div className="h-7 w-14 rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-7 w-16 rounded-xl bg-stone-100 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-8 rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-7 w-8 rounded-xl bg-stone-100 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
