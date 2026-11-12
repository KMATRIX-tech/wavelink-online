/**
 * Reusable WaveLink Avatar Component with Realtime Online/Offline Presence Dot
 *
 * Specifications:
 * - Props: uid, src, size, showStatus (+ alt, className, ringClassName, onClick, targetProfile, onlyWhenVisible)
 * - Dot: ~25% of avatar size (min 10px), bottom-right, 2px ring in card/background color
 * - Online: Green (#22c55e) with gentle pulse (disabled in Lite mode & prefers-reduced-motion)
 * - Offline: Slightly smaller Red (#ef4444) circle with a thin inner horizontal dash for color-blind accessibility
 * - Loading: Neutral subtle grey dot while status is resolving
 * - Unreachable / Hidden (Privacy or Blocked): Dot is hidden
 * - Automatic viewport IntersectionObserver when onlyWhenVisible=true so off-screen rows do not hold listeners
 */

import React, { useState, useEffect, useRef } from 'react';
import { usePresence } from '../context/PresenceContext';
import { useTheme } from '../context/ThemeContext';
import type { UserProfile } from '../types';
import { User as UserIcon } from 'lucide-react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;

export interface AvatarProps {
  uid?: string;
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  showStatus?: boolean;
  className?: string;
  imageClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  ringClassName?: string;
  fallbackName?: string;
  priority?: boolean;
  targetProfile?: Partial<UserProfile> | null;
  /** Subscribe to RTDB presence only while Avatar is near/in the viewport (default: true) */
  onlyWhenVisible?: boolean;
  children?: React.ReactNode;
}

const SIZE_MAP: Record<string, { sizePx: number; dotPx: number; dotOffsetPx: number; ringPx: number }> = {
  xs: { sizePx: 28, dotPx: 10, dotOffsetPx: 0, ringPx: 2 },
  sm: { sizePx: 36, dotPx: 10, dotOffsetPx: 0, ringPx: 2 },
  md: { sizePx: 44, dotPx: 12, dotOffsetPx: 0, ringPx: 2 },
  lg: { sizePx: 56, dotPx: 14, dotOffsetPx: 1, ringPx: 2 },
  xl: { sizePx: 72, dotPx: 18, dotOffsetPx: 2, ringPx: 2.5 },
  '2xl': { sizePx: 96, dotPx: 22, dotOffsetPx: 2, ringPx: 3 }
};

// Shared IntersectionObserver across all Avatar instances to avoid observer overhead
type VisibilityCallback = (visible: boolean) => void;
const observerCallbacks = new WeakMap<Element, VisibilityCallback>();
let sharedViewportObserver: IntersectionObserver | null = null;

function getSharedAvatarObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return null;
  }
  if (!sharedViewportObserver) {
    sharedViewportObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb(entry.isIntersecting);
          }
        });
      },
      { rootMargin: '60px 0px', threshold: 0.01 }
    );
  }
  return sharedViewportObserver;
}

export const Avatar: React.FC<AvatarProps> = ({
  uid,
  src,
  alt = 'User avatar',
  size = 'md',
  showStatus = false,
  className = '',
  imageClassName = '',
  onClick,
  ringClassName = '',
  fallbackName,
  priority = false,
  targetProfile,
  onlyWhenVisible = true,
  children
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [isVisibleInViewport, setIsVisibleInViewport] = useState<boolean>(!onlyWhenVisible);
  const [showLongPressHint, setShowLongPressHint] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isLiteMode } = useTheme();

  // Reset imageError if src updates
  useEffect(() => {
    setImageError(false);
  }, [src]);

  // Observe viewport visibility when showStatus && onlyWhenVisible
  useEffect(() => {
    if (!showStatus || !uid || !onlyWhenVisible) {
      setIsVisibleInViewport(true);
      return;
    }
    const el = containerRef.current;
    const observer = getSharedAvatarObserver();
    if (!el || !observer) {
      setIsVisibleInViewport(true);
      return;
    }

    observerCallbacks.set(el, (visible) => {
      setIsVisibleInViewport(visible);
    });
    observer.observe(el);

    return () => {
      observerCallbacks.delete(el);
      observer.unobserve(el);
    };
  }, [showStatus, uid, onlyWhenVisible]);

  // Only subscribe to RTDB presence when showStatus=true AND currently visible on screen
  const activePresenceUid = showStatus && isVisibleInViewport ? uid : undefined;
  const presence = usePresence(activePresenceUid, targetProfile);

  // Dimensions
  let sizePx = 44;
  let dotPx = 12;
  let dotOffsetPx = 0;
  let ringPx = 2;

  if (typeof size === 'number') {
    sizePx = size;
    dotPx = Math.max(10, Math.round(size * 0.25));
    dotOffsetPx = size >= 72 ? 2 : 0;
    ringPx = size >= 72 ? 2.5 : 2;
  } else if (SIZE_MAP[size]) {
    const s = SIZE_MAP[size];
    sizePx = s.sizePx;
    dotPx = s.dotPx;
    dotOffsetPx = s.dotOffsetPx;
    ringPx = s.ringPx;
  }

  const initial = (fallbackName || alt || '?').trim().charAt(0).toUpperCase();

  // Hide dot completely if disabled, hidden by privacy/block, or RTDB is unreachable
  const shouldRenderDot =
    Boolean(showStatus && uid) &&
    presence.status !== 'hidden' &&
    presence.status !== 'unreachable';

  const statusLabel =
    presence.status === 'online'
      ? 'Online'
      : presence.status === 'loading'
      ? 'Checking status'
      : 'Offline';

  // Slightly smaller circle for offline dot so color-blind users get both shape & size cues
  const offlineDotPx = Math.max(9, Math.round(dotPx * 0.86));

  const handleTouchStart = () => {
    if (!shouldRenderDot || presence.status === 'loading') return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setShowLongPressHint(true);
      setTimeout(() => setShowLongPressHint(false), 1800);
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Avatar Image Frame */}
      <div
        className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ${ringClassName}`}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover rounded-full ${imageClassName}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800">
            {initial && initial !== '?' ? (
              <span style={{ fontSize: `${Math.round(sizePx * 0.42)}px` }}>{initial}</span>
            ) : (
              <UserIcon size={Math.round(sizePx * 0.52)} />
            )}
          </div>
        )}
        {children}
      </div>

      {/* Long-press mobile accessibility tooltip */}
      {showLongPressHint && (
        <span
          role="tooltip"
          className="absolute -top-7 right-0 z-30 px-2 py-0.5 rounded-full bg-slate-900/90 text-white text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none"
        >
          {statusLabel}
        </span>
      )}

      {/* Online / Offline Presence Indicator Dot */}
      {shouldRenderDot && (
        <span
          className="absolute z-10 flex items-center justify-center"
          style={{
            bottom: `${dotOffsetPx}px`,
            right: `${dotOffsetPx}px`,
            width: `${dotPx}px`,
            height: `${dotPx}px`
          }}
          aria-label={statusLabel}
          title={statusLabel}
          role="status"
        >
          {presence.status === 'loading' ? (
            // Neutral subtle grey dot while status is still loading
            <span
              className="w-full h-full rounded-full bg-slate-400/75"
              style={{
                boxShadow: `0 0 0 ${ringPx}px var(--bg-card, var(--bg-surface, #FFFFFF))`
              }}
            />
          ) : presence.status === 'online' ? (
            // Online: Green (#22c55e) with gentle pulse (disabled with prefers-reduced-motion & Lite mode)
            <span className="relative flex items-center justify-center w-full h-full">
              {!isLiteMode && (
                <span
                  className="wavelink-presence-pulse absolute inset-0 rounded-full bg-[#22c55e] opacity-75"
                  aria-hidden="true"
                />
              )}
              <span
                className="relative inline-flex rounded-full w-full h-full bg-[#22c55e]"
                style={{
                  boxShadow: `0 0 0 ${ringPx}px var(--bg-card, var(--bg-surface, #FFFFFF)), 0 1px 3px rgba(34, 197, 94, 0.45)`
                }}
              />
            </span>
          ) : (
            // Offline: Slightly smaller filled Red (#ef4444) circle with a thin horizontal dash for color-blind distinction
            <span
              className="relative inline-flex items-center justify-center rounded-full bg-[#ef4444]"
              style={{
                width: `${offlineDotPx}px`,
                height: `${offlineDotPx}px`,
                boxShadow: `0 0 0 ${ringPx}px var(--bg-card, var(--bg-surface, #FFFFFF)), 0 1px 2px rgba(239, 68, 68, 0.3)`
              }}
            >
              <span
                className="bg-white/95 rounded-full"
                style={{
                  width: `${Math.max(4, Math.round(offlineDotPx * 0.55))}px`,
                  height: `${Math.max(1.5, Math.round(offlineDotPx * 0.18))}px`
                }}
                aria-hidden="true"
              />
            </span>
          )}
        </span>
      )}
    </div>
  );
};
