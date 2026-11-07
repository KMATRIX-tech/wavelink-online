import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2
} from 'lucide-react';

export interface LightboxState {
  images: string[];
  initialIndex?: number;
  caption?: string;
  authorName?: string;
  authorUsername?: string;
  authorPhotoURL?: string;
}

interface ImageLightboxModalProps {
  lightbox: LightboxState | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.5;

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  lightbox,
  onClose
}) => {
  const images = lightbox?.images || [];
  const [currentIndex, setCurrentIndex] = useState<number>(lightbox?.initialIndex || 0);
  const [scale, setScale] = useState<number>(1);
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(
    null
  );
  const pinchStartRef = useRef<{
    distance: number;
    initialScale: number;
    midpointX: number;
    midpointY: number;
    initialTranslateX: number;
    initialTranslateY: number;
  } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0
  });
  const didMoveRef = useRef<boolean>(false);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setIsDragging(false);
    dragStartRef.current = null;
    pinchStartRef.current = null;
  }, []);

  useEffect(() => {
    if (lightbox) {
      const safeIdx = Math.min(
        Math.max(0, lightbox.initialIndex || 0),
        Math.max(0, lightbox.images.length - 1)
      );
      setCurrentIndex(safeIdx);
      resetTransform();
    }
  }, [lightbox, resetTransform]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    if (!lightbox) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  const clampTranslate = useCallback(
    (nextX: number, nextY: number, targetScale: number) => {
      if (targetScale <= 1) {
        return { x: 0, y: 0 };
      }
      const container = containerRef.current;
      const width = container?.clientWidth || window.innerWidth;
      const height = container?.clientHeight || window.innerHeight;
      const maxX = ((targetScale - 1) * width) / 2;
      const maxY = ((targetScale - 1) * height) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY))
      };
    },
    []
  );

  const applyZoom = useCallback(
    (nextScaleRaw: number, focalX?: number, focalY?: number) => {
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, Math.round(nextScaleRaw * 100) / 100)
      );
      if (nextScale <= 1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        return;
      }

      setScale((prevScale) => {
        const container = containerRef.current;
        if (container && focalX !== undefined && focalY !== undefined && prevScale > 0) {
          const rect = container.getBoundingClientRect();
          const offsetX = focalX - (rect.left + rect.width / 2);
          const offsetY = focalY - (rect.top + rect.height / 2);
          const scaleRatio = nextScale / prevScale;
          setTranslate((prevTranslate) => {
            const rawX = offsetX - (offsetX - prevTranslate.x) * scaleRatio;
            const rawY = offsetY - (offsetY - prevTranslate.y) * scaleRatio;
            return clampTranslate(rawX, rawY, nextScale);
          });
        } else {
          setTranslate((prevTranslate) =>
            clampTranslate(prevTranslate.x, prevTranslate.y, nextScale)
          );
        }
        return nextScale;
      });
    },
    [clampTranslate]
  );

  const goPrev = useCallback(() => {
    if (images.length <= 1) return;
    resetTransform();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length, resetTransform]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    resetTransform();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length, resetTransform]);

  // Keyboard shortcuts: Escape to close, Left/Right arrows to navigate, +/- to zoom
  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        goNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(scale + ZOOM_STEP);
      } else if (e.key === '-') {
        e.preventDefault();
        applyZoom(scale - ZOOM_STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        resetTransform();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox, images.length, onClose, goPrev, goNext, applyZoom, scale, resetTransform]);

  if (!lightbox || images.length === 0) return null;

  const activeImageUrl = images[currentIndex] || images[0];

  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    didMoveRef.current = false;

    if (e.touches.length === 2) {
      // Start pinch-to-zoom
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchStartRef.current = {
        distance: Math.max(1, dist),
        initialScale: scale,
        midpointX: midX,
        midpointY: midY,
        initialTranslateX: translate.x,
        initialTranslateY: translate.y
      };
      dragStartRef.current = null;
      swipeStartRef.current = null;
      setIsDragging(true);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const timeDiff = now - lastTapRef.current.time;
      const tapDist = Math.hypot(
        touch.clientX - lastTapRef.current.x,
        touch.clientY - lastTapRef.current.y
      );

      // Double-tap to toggle zoom at tap location
      if (timeDiff > 0 && timeDiff < 280 && tapDist < 36) {
        e.preventDefault();
        if (scale > 1.05) {
          resetTransform();
        } else {
          applyZoom(2.5, touch.clientX, touch.clientY);
        }
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        return;
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

      if (scale > 1) {
        dragStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          startX: translate.x,
          startY: translate.y
        };
        setIsDragging(true);
      } else {
        swipeStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: now
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      didMoveRef.current = true;
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const rawScale =
        pinchStartRef.current.initialScale * (dist / pinchStartRef.current.distance);
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const focalOffsetX = pinchStartRef.current.midpointX - centerX;
        const focalOffsetY = pinchStartRef.current.midpointY - centerY;
        const scaleRatio = nextScale / Math.max(1, pinchStartRef.current.initialScale);

        const panDeltaX = midX - pinchStartRef.current.midpointX;
        const panDeltaY = midY - pinchStartRef.current.midpointY;

        const nextX =
          focalOffsetX -
          (focalOffsetX - pinchStartRef.current.initialTranslateX) * scaleRatio +
          panDeltaX;
        const nextY =
          focalOffsetY -
          (focalOffsetY - pinchStartRef.current.initialTranslateY) * scaleRatio +
          panDeltaY;

        setScale(nextScale);
        setTranslate(clampTranslate(nextX, nextY, nextScale));
      } else {
        setScale(nextScale);
      }
    } else if (e.touches.length === 1 && dragStartRef.current && scale > 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didMoveRef.current = true;
      }
      const nextX = dragStartRef.current.startX + dx;
      const nextY = dragStartRef.current.startY + dy;
      setTranslate(clampTranslate(nextX, nextY, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }

    if (e.touches.length === 1 && scale > 1) {
      // Transition seamlessly from 2-finger pinch to 1-finger pan
      const remainingTouch = e.touches[0];
      dragStartRef.current = {
        x: remainingTouch.clientX,
        y: remainingTouch.clientY,
        startX: translate.x,
        startY: translate.y
      };
      return;
    }

    if (e.touches.length === 0) {
      setIsDragging(false);
      dragStartRef.current = null;

      // Check for horizontal carousel swipe when at 1x zoom
      if (scale <= 1.02 && swipeStartRef.current && e.changedTouches.length > 0) {
        const endTouch = e.changedTouches[0];
        const dx = endTouch.clientX - swipeStartRef.current.x;
        const dy = endTouch.clientY - swipeStartRef.current.y;
        const elapsed = Date.now() - swipeStartRef.current.time;

        if (images.length > 1 && elapsed < 500 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) {
            goNext();
          } else {
            goPrev();
          }
        } else if (elapsed < 400 && dy > 95 && Math.abs(dy) > Math.abs(dx) * 1.6) {
          // Swipe down at 1x to dismiss
          onClose();
        }
      }
      swipeStartRef.current = null;

      if (scale < 1.02) {
        resetTransform();
      }
    }
  };

  // Mouse drag support for desktop when zoomed in
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    didMoveRef.current = false;
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: translate.x,
      startY: translate.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || scale <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didMoveRef.current = true;
    }
    setTranslate(
      clampTranslate(
        dragStartRef.current.startX + dx,
        dragStartRef.current.startY + dy,
        scale
      )
    );
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Mouse wheel / trackpad pinch zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * (e.ctrlKey ? 0.01 : 0.0025);
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta * scale));
    applyZoom(nextScale, e.clientX, e.clientY);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (scale > 1.05) {
      resetTransform();
    } else {
      applyZoom(2.5, e.clientX, e.clientY);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const link = document.createElement('a');
      link.href = activeImageUrl;
      link.download = `wavelink-photo-${Date.now()}.jpg`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore download error
    }
  };

  const zoomPercent = Math.round(scale * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen photo viewer"
      className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-xl flex flex-col select-none animate-fade-in"
      onClick={() => {
        if (!didMoveRef.current && scale <= 1.02) {
          onClose();
        }
      }}
    >
      {/* Top Header Bar */}
      <div
        className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Author & Slide Counter */}
        <div className="flex items-center gap-3 min-w-0">
          {lightbox.authorPhotoURL && (
            <img
              src={lightbox.authorPhotoURL}
              alt={lightbox.authorName || 'Author'}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20 shrink-0"
            />
          )}
          <div className="min-w-0">
            {lightbox.authorName && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white truncate">
                  {lightbox.authorName}
                </span>
                {lightbox.authorUsername && (
                  <span className="text-xs font-mono text-blue-400 truncate hidden sm:inline">
                    {lightbox.authorUsername}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-white/70">
              {images.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-white/15 font-mono font-bold text-white">
                  {currentIndex + 1} / {images.length}
                </span>
              )}
              <span>Pinch, scroll, or double-tap to zoom</span>
            </div>
          </div>
        </div>

        {/* Right: Zoom Controls + Download + Close */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => applyZoom(scale - ZOOM_STEP)}
              disabled={scale <= MIN_SCALE}
              className="p-2 rounded-xl text-white hover:bg-white/15 disabled:opacity-40 transition cursor-pointer"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut size={17} />
            </button>

            <button
              type="button"
              onClick={resetTransform}
              className="px-2.5 py-1 rounded-xl text-xs font-mono font-extrabold text-white hover:bg-white/15 transition cursor-pointer min-w-[54px] text-center"
              title="Reset zoom (0)"
            >
              {zoomPercent}%
            </button>

            <button
              type="button"
              onClick={() => applyZoom(scale + ZOOM_STEP)}
              disabled={scale >= MAX_SCALE}
              className="p-2 rounded-xl text-white hover:bg-white/15 disabled:opacity-40 transition cursor-pointer"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn size={17} />
            </button>
          </div>

          {scale > 1.02 && (
            <button
              type="button"
              onClick={resetTransform}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition cursor-pointer"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              <RotateCcw size={17} />
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition cursor-pointer"
            title="Download photo"
            aria-label="Download photo"
          >
            <Download size={17} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-white/15 hover:bg-rose-600 border border-white/20 text-white transition cursor-pointer"
            title="Close viewer (Esc)"
            aria-label="Close full-screen photo viewer"
          >
            <X size={19} />
          </button>
        </div>
      </div>

      {/* Main Interactive Pinch-to-Zoom Stage */}
      <div
        ref={containerRef}
        className={`relative flex-1 w-full h-full overflow-hidden flex items-center justify-center touch-none ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={activeImageUrl}
          alt={lightbox.caption || 'Full-screen photo'}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className={`max-w-full max-h-full object-contain select-none pointer-events-auto ${
            isDragging ? '' : 'transition-transform duration-150 ease-out'
          }`}
          style={{
            transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            willChange: 'transform'
          }}
        />

        {/* Prev / Next Navigation Buttons for Multi-Photo Posts */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous photo"
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/20 text-white flex items-center justify-center shadow-lg transition cursor-pointer"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next photo"
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/20 text-white flex items-center justify-center shadow-lg transition cursor-pointer"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Mobile Zoom Pill + Caption + Carousel Thumbnails */}
      <div
        className="relative z-20 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white flex flex-col items-center gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile floating zoom controls */}
        <div className="flex sm:hidden items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-3 py-1">
          <button
            type="button"
            onClick={() => applyZoom(scale - ZOOM_STEP)}
            disabled={scale <= MIN_SCALE}
            className="p-1.5 text-white disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            onClick={() => (scale > 1.05 ? resetTransform() : applyZoom(2))}
            className="px-2 text-xs font-mono font-bold text-white flex items-center gap-1"
          >
            <Maximize2 size={12} />
            <span>{zoomPercent}%</span>
          </button>
          <button
            type="button"
            onClick={() => applyZoom(scale + ZOOM_STEP)}
            disabled={scale >= MAX_SCALE}
            className="p-1.5 text-white disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
        </div>

        {/* Multi-photo dot/thumbnail strip */}
        {images.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1 scrollbar-none">
            {images.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  resetTransform();
                  setCurrentIndex(idx);
                }}
                className={`relative w-11 h-11 rounded-xl overflow-hidden border-2 transition shrink-0 cursor-pointer ${
                  idx === currentIndex
                    ? 'border-[#3B82F6] scale-105 shadow-md'
                    : 'border-white/20 opacity-60 hover:opacity-100'
                }`}
                aria-label={`View photo ${idx + 1}`}
              >
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Caption preview */}
        {lightbox.caption && (
          <p className="text-xs sm:text-sm text-white/90 max-w-2xl text-center line-clamp-2 leading-relaxed">
            {lightbox.caption}
          </p>
        )}
      </div>
    </div>
  );
};
