import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  Check,
  Smartphone,
  Monitor,
  Sliders,
  ZoomIn,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  MessageSquare,
  Heart,
  Home,
  Compass,
  Plus,
  User
} from 'lucide-react';
import { CustomAppBackground } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  cropAndCompressCustomBg,
  computeEffectiveTextMode,
  uploadProfileImageToCloudinary
} from '../utils/mediaStorage';

interface CustomBackgroundModalProps {
  isOpen: boolean;
  file?: File | null;
  existingBg?: CustomAppBackground | null;
  language?: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface FrameCropState {
  zoom: number;
  panX: number; // -1 to 1
  panY: number; // -1 to 1
}

const DEFAULT_DARKEN = 25;
const DEFAULT_BLUR = 2;

export const CustomBackgroundModal: React.FC<CustomBackgroundModalProps> = ({
  isOpen,
  file,
  existingBg,
  language = 'en',
  onClose,
  onSaved
}) => {
  const { currentUser, showGlobalToast } = useAuth();
  const { saveCustomBackground } = useTheme();

  const isUploadMode = Boolean(file);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [baseLuminance, setBaseLuminance] = useState<number>(existingBg?.avgLuminance ?? 48);

  const [activeAspect, setActiveAspect] = useState<'9:16' | '16:9'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? '9:16' : '16:9'
  );
  const [crop916, setCrop916] = useState<FrameCropState>({ zoom: 1, panX: 0, panY: 0 });
  const [crop169, setCrop169] = useState<FrameCropState>({ zoom: 1, panX: 0, panY: 0 });

  const [darken, setDarken] = useState<number>(existingBg?.darken ?? DEFAULT_DARKEN);
  const [blur, setBlur] = useState<number>(existingBg?.blur ?? DEFAULT_BLUR);

  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);

  // Create object URL and decode selected image + estimate luminance immediately
  useEffect(() => {
    if (!isOpen) return;

    setSaveError(null);
    setUploadProgress(0);
    setStatusLabel('');
    setDarken(existingBg?.darken ?? DEFAULT_DARKEN);
    setBlur(existingBg?.blur ?? DEFAULT_BLUR);
    setCrop916({ zoom: 1, panX: 0, panY: 0 });
    setCrop169({ zoom: 1, panX: 0, panY: 0 });

    if (!file) {
      setObjectUrl('');
      setLoadedImage(null);
      setBaseLuminance(existingBg?.avgLuminance ?? 48);
      return;
    }

    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setLoadedImage(img);
      try {
        const probeCanvas = document.createElement('canvas');
        probeCanvas.width = 48;
        probeCanvas.height = 48;
        const pCtx = probeCanvas.getContext('2d');
        if (pCtx) {
          pCtx.drawImage(img, 0, 0, 48, 48);
          const pixels = pCtx.getImageData(0, 0, 48, 48).data;
          let sum = 0;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            sum += (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
            count++;
          }
          if (count > 0) {
            setBaseLuminance(Math.round((sum / count) * 100));
          }
        }
      } catch {
        setBaseLuminance(48);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setSaveError('Could not load this image. Please choose another JPG, PNG, or WebP photo.');
      }
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [isOpen, file, existingBg]);

  if (!isOpen) return null;

  const currentCrop = activeAspect === '9:16' ? crop916 : crop169;
  const setCurrentCrop = activeAspect === '9:16' ? setCrop916 : setCrop169;

  const previewImageSrc = isUploadMode
    ? objectUrl
    : activeAspect === '9:16' && existingBg?.mobileUrl
    ? existingBg.mobileUrl
    : existingBg?.url || '';

  const liveTextMode = computeEffectiveTextMode(baseLuminance, darken);
  const isDarkPreview = liveTextMode === 'dark';

  const handleReset = () => {
    setCrop916({ zoom: 1, panX: 0, panY: 0 });
    setCrop169({ zoom: 1, panX: 0, panY: 0 });
    setDarken(DEFAULT_DARKEN);
    setBlur(DEFAULT_BLUR);
    setSaveError(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isUploadMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      initialPanX: currentCrop.panX,
      initialPanY: currentCrop.panY
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const sensitivity = 2.2 / Math.max(1, currentCrop.zoom);
    const nextPanX = Math.max(
      -1,
      Math.min(1, dragRef.current.initialPanX + (dx / Math.max(80, rect.width)) * sensitivity)
    );
    const nextPanY = Math.max(
      -1,
      Math.min(1, dragRef.current.initialPanY + (dy / Math.max(80, rect.height)) * sensitivity)
    );
    setCurrentCrop((prev) => ({ ...prev, panX: nextPanX, panY: nextPanY }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      dragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleSave = async () => {
    if (!currentUser?.uid) {
      setSaveError('Please sign in to save a custom background.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setUploadProgress(5);

    try {
      if (isUploadMode) {
        if (!loadedImage) {
          throw new Error('Image is still loading. Please try again in a moment.');
        }

        setStatusLabel(
          language === 'sw' ? 'Inakata na kupunguza ukubwa (< 400 KB)...' : 'Cropping & compressing (< 400 KB)...'
        );
        setUploadProgress(15);

        const [desktopProcessed, mobileProcessed] = await Promise.all([
          cropAndCompressCustomBg({
            image: loadedImage,
            aspect: '16:9',
            zoom: crop169.zoom,
            panX: crop169.panX,
            panY: crop169.panY,
            darken
          }),
          cropAndCompressCustomBg({
            image: loadedImage,
            aspect: '9:16',
            zoom: crop916.zoom,
            panX: crop916.panX,
            panY: crop916.panY,
            darken
          })
        ]);

        setStatusLabel(language === 'sw' ? 'Inapakia kwenye wingu...' : 'Uploading to Cloudinary...');
        setUploadProgress(35);

        let desktopPct = 0;
        let mobilePct = 0;
        const syncCombinedProgress = () => {
          const avg = Math.round(35 + ((desktopPct + mobilePct) / 2) * 0.55);
          setUploadProgress(Math.min(92, avg));
        };

        const [desktopUpload, mobileUpload] = await Promise.all([
          uploadProfileImageToCloudinary({
            uid: currentUser.uid,
            folder: 'covers',
            blob: desktopProcessed.blob,
            contentType: desktopProcessed.mimeType,
            onProgress: (p) => {
              desktopPct = p;
              syncCombinedProgress();
            }
          }),
          uploadProfileImageToCloudinary({
            uid: currentUser.uid,
            folder: 'covers',
            blob: mobileProcessed.blob,
            contentType: mobileProcessed.mimeType,
            onProgress: (p) => {
              mobilePct = p;
              syncCombinedProgress();
            }
          })
        ]);

        setStatusLabel(language === 'sw' ? 'Inahifadhi kwenye akaunti...' : 'Saving to profile...');
        setUploadProgress(96);

        const combinedLum = Math.round(
          (desktopProcessed.avgLuminance + mobileProcessed.avgLuminance) / 2
        );
        const textMode = computeEffectiveTextMode(combinedLum, darken);

        const saveRes = await saveCustomBackground(
          {
            url: desktopUpload.downloadUrl,
            mobileUrl: mobileUpload.downloadUrl,
            darken,
            blur,
            textMode,
            avgLuminance: combinedLum
          },
          { addToHistory: true }
        );

        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Could not save custom background.');
        }
      } else if (existingBg?.url) {
        setStatusLabel(language === 'sw' ? 'Inahifadhi mabadiliko...' : 'Saving adjustments...');
        setUploadProgress(70);

        const lum = existingBg.avgLuminance ?? baseLuminance;
        const textMode = computeEffectiveTextMode(lum, darken);

        const saveRes = await saveCustomBackground(
          {
            url: existingBg.url,
            ...(existingBg.mobileUrl ? { mobileUrl: existingBg.mobileUrl } : {}),
            darken,
            blur,
            textMode,
            avgLuminance: lum
          },
          { addToHistory: false }
        );

        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Could not update custom background.');
        }
      }

      setUploadProgress(100);
      showGlobalToast?.(
        language === 'sw'
          ? 'Mandhari yako maalum imehifadhiwa! ✨'
          : 'Custom app background saved! ✨'
      );
      onSaved?.();
      onClose();
    } catch (err: any) {
      setSaveError(
        err instanceof Error ? err.message : 'Upload failed. Please check your connection and retry.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit custom app background"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden"
    >
      {/* REAL APP LIVE PREVIEW LAYER BEHIND THE MODAL SHEET */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-slate-950">
        {previewImageSrc && (
          <img
            src={previewImageSrc}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
              transform: `scale(${1.05 * currentCrop.zoom}) translate(${currentCrop.panX * 6}%, ${
                currentCrop.panY * 6
              }%)`,
              objectPosition: `${50 - currentCrop.panX * 25}% ${50 - currentCrop.panY * 25}%`
            }}
          />
        )}
        <div
          className="absolute inset-0 transition-colors duration-150"
          style={{ backgroundColor: `rgba(0, 0, 0, ${darken / 100})` }}
        />

        {/* Real App Screen Mock Overlay behind the control panel so readability is verified live */}
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-6 pt-3 sm:pt-6 space-y-3 opacity-95">
          {/* Mini Header */}
          <div
            className={`rounded-2xl px-4 py-2.5 flex items-center justify-between border backdrop-blur-md shadow-sm ${
              isDarkPreview
                ? 'bg-slate-900/72 text-slate-50 border-white/20'
                : 'bg-white/78 text-slate-900 border-slate-900/12'
            }`}
          >
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <span className="w-6 h-6 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-xs">
                W
              </span>
              <span>WaveLink Preview</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                isDarkPreview ? 'bg-white/15 text-slate-100' : 'bg-slate-900/10 text-slate-800'
              }`}
            >
              {isDarkPreview ? 'Light Text' : 'Dark Text'}
            </span>
          </div>

          {/* Mini Feed Card & Chat Bubbles Side-by-Side on Desktop / Stacked */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Feed Card Sample */}
            <div
              className={`rounded-2xl p-3.5 border backdrop-blur-md shadow-md space-y-2 ${
                isDarkPreview
                  ? 'bg-slate-900/72 text-slate-50 border-white/20'
                  : 'bg-white/80 text-slate-900 border-slate-900/12'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#0D9488]" />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold truncate">Amina • Dar es Salaam</p>
                  <p
                    className={`text-[10px] ${
                      isDarkPreview ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Feed post readability check
                  </p>
                </div>
              </div>
              <p className="text-xs leading-snug">
                Checking contrast over your custom background photo! ✨
              </p>
              <div className="flex items-center gap-3 text-[11px] font-bold opacity-85">
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} className="text-rose-500" /> 124
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare size={12} /> 18
                </span>
              </div>
            </div>

            {/* Chat Bubbles Sample */}
            <div
              className={`rounded-2xl p-3.5 border backdrop-blur-md shadow-md space-y-2 ${
                isDarkPreview
                  ? 'bg-slate-900/62 text-slate-50 border-white/20'
                  : 'bg-white/70 text-slate-900 border-slate-900/12'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-1.5 text-xs font-medium ${
                  isDarkPreview
                    ? 'bg-slate-800/88 text-slate-100 border border-white/15'
                    : 'bg-white/92 text-slate-900 border border-slate-900/10'
                }`}
              >
                Can you read messages clearly?
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-1.5 text-xs font-semibold bg-[#2563EB] text-white shadow-xs">
                  Yes, super crisp! 🔥
                </div>
              </div>
              {/* Mini Nav Preview */}
              <div
                className={`mt-1 rounded-full px-3 py-1.5 flex items-center justify-around border ${
                  isDarkPreview
                    ? 'bg-slate-950/80 text-white border-white/20'
                    : 'bg-slate-900/88 text-white border-white/25'
                }`}
              >
                <Home size={13} />
                <Compass size={13} />
                <Plus size={13} />
                <MessageSquare size={13} />
                <User size={13} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOREGROUND EDITOR CARD / BOTTOM SHEET */}
      <div className="relative z-10 w-full max-w-xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[84dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden backdrop-blur-xl">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Sliders size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold truncate">
                {language === 'sw' ? 'Hariri Mandhari Maalum' : 'Customize App Background'}
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                {language === 'sw'
                  ? 'Rekebisha ukungu na giza ukihakikisha maandishi yanasomeka'
                  : 'Check the live app preview behind this panel before saving'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Close background editor"
            className="min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-subtle)] hover:opacity-85 flex items-center justify-center text-[var(--text-primary)] cursor-pointer disabled:opacity-50 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Editor Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Frame Switcher (9:16 Phone vs 16:9 Desktop) + Interactive Crop Box */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex p-1 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] gap-1">
                <button
                  type="button"
                  onClick={() => setActiveAspect('9:16')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    activeAspect === '9:16'
                      ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Smartphone size={14} />
                  <span>Phone (9:16)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAspect('16:9')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    activeAspect === '16:9'
                      ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Monitor size={14} />
                  <span>Desktop (16:9)</span>
                </button>
              </div>

              {/* Auto-Contrast Indicator Pill */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                  isDarkPreview
                    ? 'bg-slate-900 text-white border-slate-700'
                    : 'bg-amber-50 text-slate-900 border-amber-200'
                }`}
              >
                {isDarkPreview ? <Moon size={12} /> : <Sun size={12} />}
                <span>{isDarkPreview ? 'Auto: Light Text' : 'Auto: Dark Text'}</span>
              </span>
            </div>

            {/* Crop Interactive Stage */}
            <div className="w-full flex flex-col items-center justify-center bg-slate-950/65 rounded-2xl p-3 border border-[var(--border-hairline)]">
              <div
                ref={cropStageRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: isUploadMode ? 'none' : 'auto' }}
                className={`relative overflow-hidden rounded-2xl border-2 border-white/60 shadow-xl select-none ${
                  isUploadMode ? 'cursor-grab active:cursor-grabbing' : ''
                } ${activeAspect === '9:16' ? 'w-[126px] aspect-[9/16]' : 'w-full max-w-[320px] aspect-[16/9]'}`}
              >
                {previewImageSrc && (
                  <img
                    src={previewImageSrc}
                    alt="Crop preview"
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none"
                    style={{
                      filter: blur > 0 ? `blur(${blur}px)` : undefined,
                      transform: `scale(${1.04 * currentCrop.zoom})`,
                      objectPosition: `${50 - currentCrop.panX * 40}% ${50 - currentCrop.panY * 40}%`
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundColor: `rgba(0, 0, 0, ${darken / 100})` }}
                />
                {/* Mini Readability Overlay in Frame */}
                <div className="absolute inset-x-2 bottom-2 pointer-events-none">
                  <div
                    className={`rounded-lg px-2 py-1 text-[9px] font-bold text-center backdrop-blur-sm ${
                      isDarkPreview
                        ? 'bg-slate-900/75 text-white border border-white/20'
                        : 'bg-white/80 text-slate-900 border border-slate-900/10'
                    }`}
                  >
                    {isUploadMode ? 'Drag to frame' : activeAspect}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sliders: Zoom (if uploading), Darken (0-70%), Blur (0-12px) */}
          <div className="space-y-3 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-2xl p-3.5">
            {isUploadMode && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-extrabold">
                  <span className="inline-flex items-center gap-1.5">
                    <ZoomIn size={14} className="text-[var(--accent-primary)]" />
                    <span>{language === 'sw' ? 'Kuza Picha (Zoom)' : 'Crop Zoom'}</span>
                  </span>
                  <span className="font-mono text-[11px]">{currentCrop.zoom.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={currentCrop.zoom}
                  onChange={(e) =>
                    setCurrentCrop((prev) => ({ ...prev, zoom: parseFloat(e.target.value) || 1 }))
                  }
                  aria-label="Crop zoom"
                  className="w-full h-2 accent-[var(--accent-primary)] cursor-pointer"
                />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span>{language === 'sw' ? 'Fanya Giza (Darken)' : 'Darken Overlay'}</span>
                <span className="font-mono text-[11px]">{darken}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={70}
                step={1}
                value={darken}
                onChange={(e) => setDarken(Math.max(0, Math.min(70, Number(e.target.value))))}
                aria-label="Darken background percentage"
                className="w-full h-2 accent-[var(--accent-primary)] cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span>{language === 'sw' ? 'Ukungu (Blur)' : 'Background Blur'}</span>
                <span className="font-mono text-[11px]">{blur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={blur}
                onChange={(e) => setBlur(Math.max(0, Math.min(12, Number(e.target.value))))}
                aria-label="Blur background pixels"
                className="w-full h-2 accent-[var(--accent-primary)] cursor-pointer"
              />
            </div>
          </div>

          {/* Progress Bar */}
          {isSaving && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin text-[var(--accent-primary)]" />
                  <span>{statusLabel || 'Saving...'}</span>
                </span>
                <span className="font-mono text-[11px]">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/15 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-200"
                  style={{ width: `${Math.max(5, uploadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload / Save Error + Retry Button */}
          {saveError && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-2.5 flex-wrap"
            >
              <span className="inline-flex items-start gap-2 flex-1 min-w-0">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                <span className="break-words">{saveError}</span>
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RotateCcw size={13} />
                <span>{language === 'sw' ? 'Jaribu Tena' : 'Retry'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Sticky Footer Buttons: Reset, Cancel, Save (All >= 44px) */}
        <div className="px-4 sm:px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 flex-wrap shrink-0">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleReset}
            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold inline-flex items-center gap-1.5 hover:opacity-85 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw size={14} />
            <span>{language === 'sw' ? 'Rudisha' : 'Reset'}</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold hover:opacity-85 cursor-pointer disabled:opacity-50"
            >
              {language === 'sw' ? 'Ghairi' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="min-h-[44px] px-5 py-2 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Check size={15} strokeWidth={2.8} />
              <span>
                {isSaving
                  ? language === 'sw'
                    ? 'Inahifadhi...'
                    : 'Saving...'
                  : language === 'sw'
                  ? 'Hifadhi'
                  : 'Save'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
