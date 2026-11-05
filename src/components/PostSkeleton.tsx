import React from 'react';

interface PostSkeletonProps {
  count?: number;
}

export const PostSkeleton: React.FC<PostSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className="space-y-4 w-full max-w-full" role="status" aria-label="Loading community waves">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="w-full max-w-full overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-5 shadow-xs transition"
        >
          {/* Header Row: Avatar + Name + Subtitle */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] animate-pulse shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 bg-[var(--bg-subtle)] rounded-md animate-pulse" />
                <div className="h-2.5 w-20 bg-[var(--bg-subtle)]/70 rounded-md animate-pulse" />
              </div>
            </div>
            {/* Top-right menu placeholder */}
            <div className="w-6 h-6 rounded-lg bg-[var(--bg-subtle)] animate-pulse" />
          </div>

          {/* Text Content Lines */}
          <div className="space-y-2 mb-3.5">
            <div className="h-3.5 w-11/12 bg-[var(--bg-subtle)] rounded-md animate-pulse" />
            <div className="h-3.5 w-4/5 bg-[var(--bg-subtle)]/80 rounded-md animate-pulse" />
            {index % 2 === 0 && (
              <div className="h-3.5 w-1/2 bg-[var(--bg-subtle)]/60 rounded-md animate-pulse" />
            )}
          </div>

          {/* Media box simulation for alternate skeleton cards */}
          {index % 2 === 0 && (
            <div className="relative w-full h-52 sm:h-72 rounded-2xl bg-[var(--bg-subtle)] animate-pulse mb-4 overflow-hidden border border-[var(--border-hairline)]">
              <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)]/40">
                <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface)]/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-current rounded-md" />
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-hairline)]">
            <div className="flex items-center gap-2">
              <div className="h-8 w-14 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
              <div className="h-8 w-14 rounded-xl bg-[var(--bg-subtle)]/80 animate-pulse" />
              <div className="h-8 w-16 rounded-xl bg-[var(--bg-subtle)]/70 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-8 w-16 rounded-xl bg-[var(--bg-subtle)]/80 animate-pulse" />
              <div className="h-8 w-14 rounded-xl bg-[var(--bg-subtle)]/70 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
