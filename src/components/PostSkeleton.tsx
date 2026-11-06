import React from 'react';

interface PostSkeletonProps {
  count?: number;
}

export const PostSkeleton: React.FC<PostSkeletonProps> = ({ count = 3 }) => {
  return (
    <div
      className="space-y-5 w-full max-w-full"
      role="status"
      aria-busy="true"
      aria-label="Loading community feed posts"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`post-skeleton-${index}`}
          className="w-full max-w-full overflow-hidden bg-white border border-[#EFECE6] rounded-3xl p-5 sm:p-6 shadow-xs transition"
        >
          {/* Post Header: Avatar + CrystalBadge Name + Username + Timestamp */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-stone-200/90 ring-2 ring-blue-500/10 animate-pulse shrink-0" />
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="h-4 w-28 sm:w-36 bg-stone-200/90 rounded-lg animate-pulse" />
                  <div className="h-3.5 w-16 bg-blue-100/70 rounded-md animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-24 bg-stone-100 rounded-md animate-pulse" />
                  <div className="h-2.5 w-14 bg-stone-100 rounded-md animate-pulse" />
                </div>
              </div>
            </div>

            {/* Top-right action icons placeholder */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-7 rounded-xl bg-stone-100 animate-pulse" />
              <div className="w-7 h-7 rounded-xl bg-stone-100 animate-pulse" />
            </div>
          </div>

          {/* Post Text Body Lines */}
          <div className="space-y-2.5 mb-4">
            <div className="h-3.5 w-11/12 bg-stone-200/80 rounded-md animate-pulse" />
            <div className="h-3.5 w-4/5 bg-stone-100 rounded-md animate-pulse" />
            {index % 2 === 0 && (
              <div className="h-3.5 w-3/5 bg-stone-100 rounded-md animate-pulse" />
            )}
          </div>

          {/* Media Attachment Placeholder on alternating cards */}
          {index % 2 === 0 && (
            <div className="relative w-full h-56 sm:h-72 rounded-2xl bg-gradient-to-br from-[#FAF7F2] via-[#EEF2FF]/60 to-[#FAF7F2] animate-pulse mb-4 overflow-hidden border border-slate-200/80">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-300">
                <div className="w-12 h-12 rounded-2xl bg-stone-200/70 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-stone-300 rounded-md" />
                </div>
                <div className="h-2.5 w-24 bg-stone-200/70 rounded-full" />
              </div>
            </div>
          )}

          {/* Bottom Action Bar matching FeedView reaction group & action buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Reaction pill group [Like | Heart | Fire] */}
              <div className="inline-flex items-center gap-1.5 bg-[#F8FAFC] p-1 rounded-2xl border border-slate-200/80">
                <div className="h-7 w-12 rounded-xl bg-stone-200/80 animate-pulse" />
                <div className="h-7 w-12 rounded-xl bg-stone-200/60 animate-pulse" />
                <div className="h-7 w-12 rounded-xl bg-stone-200/60 animate-pulse" />
              </div>
              {/* Replies, Tip, Save, Add to Spark placeholders */}
              <div className="h-8 w-20 rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-8 w-14 rounded-xl bg-amber-50/80 border border-amber-200/40 animate-pulse" />
              <div className="h-8 w-12 rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-8 w-24 rounded-xl bg-teal-50/70 border border-teal-200/40 animate-pulse hidden sm:block" />
            </div>

            {/* Download & Share buttons */}
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-20 rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-7 w-16 rounded-xl bg-stone-100 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const AnnouncementSkeleton: React.FC = () => {
  return (
    <div
      className="w-full max-w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3"
      role="status"
      aria-busy="true"
      aria-label="Loading announcement"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-2xl bg-stone-200/80 animate-pulse shrink-0" />
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 rounded-full bg-blue-100/80 animate-pulse" />
            <div className="h-4 w-40 sm:w-56 rounded-md bg-stone-200/90 animate-pulse" />
          </div>
          <div className="h-3 w-3/4 rounded-md bg-stone-100 animate-pulse" />
        </div>
      </div>
      <div className="h-8 w-20 rounded-xl bg-stone-100 animate-pulse shrink-0" />
    </div>
  );
};

export const SuggestedMembersSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
      role="status"
      aria-busy="true"
      aria-label="Loading suggested members"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`suggested-skeleton-${idx}`}
          className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-stone-200 animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3 w-24 bg-stone-200 rounded-md animate-pulse" />
              <div className="h-2.5 w-16 bg-stone-100 rounded-md animate-pulse" />
            </div>
          </div>
          <div className="h-7 w-16 rounded-xl bg-stone-200 animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const CommentSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => {
  return (
    <div
      className="space-y-2 pt-1"
      role="status"
      aria-busy="true"
      aria-label="Loading comments"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`comment-skeleton-${idx}`}
          className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FAF7F2]"
        >
          <div className="w-7 h-7 rounded-full bg-stone-200 animate-pulse shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 bg-stone-200 rounded-md animate-pulse" />
              <div className="h-2.5 w-12 bg-stone-100 rounded-md animate-pulse" />
            </div>
            <div className="h-3 w-4/5 bg-stone-100 rounded-md animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface UserDirectorySkeletonProps {
  count?: number;
}

export const UserDirectorySkeleton: React.FC<UserDirectorySkeletonProps> = ({ count = 6 }) => {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      role="status"
      aria-busy="true"
      aria-label="Loading member directory"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`user-dir-skeleton-${index}`}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs flex flex-col justify-between"
        >
          <div>
            {/* Avatar + Online Status Pill */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-stone-200/90 ring-2 ring-[#2563EB]/15 animate-pulse" />
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-stone-300 ring-2 ring-white animate-pulse" />
              </div>
              <div className="h-5 w-16 rounded-full bg-teal-50 border border-teal-200/60 animate-pulse" />
            </div>

            {/* Name + CrystalBadge + Username + Email */}
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 bg-stone-200/90 rounded-md animate-pulse" />
                <div className="h-4 w-12 bg-blue-50 rounded-full animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-20 bg-stone-200/70 rounded-md animate-pulse" />
                <div className="h-3 w-28 bg-stone-100 rounded-md animate-pulse" />
              </div>
            </div>

            {/* Bio Lines */}
            <div className="space-y-1.5 mb-4">
              <div className="h-3 w-full bg-stone-100 rounded-md animate-pulse" />
              <div className="h-3 w-3/4 bg-stone-100 rounded-md animate-pulse" />
            </div>
          </div>

          {/* Footer: Joined Date + Follow & Message Buttons */}
          <div className="pt-3 border-t border-[#EFECE6] flex items-center justify-between gap-2">
            <div className="h-3 w-20 bg-stone-100 rounded-md animate-pulse" />
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-18 rounded-xl bg-stone-200/80 animate-pulse" />
              <div className="h-7 w-20 rounded-xl bg-blue-50/80 border border-blue-200/50 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
