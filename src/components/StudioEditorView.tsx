import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { OnlineSong } from '../types';
import { compressImage, generateVideoThumbnail, saveVideoPost } from '../utils/mediaStorage';
import { SongSelectorModal } from './SongSelectorModal';
import { SongPlayerCard } from './SongPlayerCard';
import {
  Wand2,
  Image as ImageIcon,
  Video as VideoIcon,
  Type,
  Sliders,
  Music,
  Send,
  Camera,
  Trash2,
  Sparkles,
  Move,
  Check,
  X,
  Palette,
  RotateCcw,
  Zap,
  Flame,
  Layers,
  Smile,
  Disc,
  ArrowRight
} from 'lucide-react';

interface TextOverlay {
  id: string;
  text: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  color: string;
  bgColor: 'none' | 'dark' | 'light' | 'gradient';
  fontStyle: 'sans' | 'display' | 'mono' | 'hand';
}

interface FilterPreset {
  name: string;
  css: string;
  brightness: number;
  contrast: number;
  saturate: number;
  sepia: number;
  grayscale: number;
}

const FILTER_PRESETS: FilterPreset[] = [
  { name: 'Normal', css: '', brightness: 100, contrast: 100, saturate: 100, sepia: 0, grayscale: 0 },
  { name: 'Vibrant 🌊', css: 'saturate(140%) contrast(110%)', brightness: 105, contrast: 110, saturate: 140, sepia: 0, grayscale: 0 },
  { name: 'Cyber Neon ⚡', css: 'contrast(125%) saturate(160%) hue-rotate(15deg)', brightness: 100, contrast: 125, saturate: 160, sepia: 0, grayscale: 0 },
  { name: 'Golden Hour 🌅', css: 'sepia(30%) saturate(130%) brightness(105%)', brightness: 105, contrast: 105, saturate: 130, sepia: 30, grayscale: 0 },
  { name: 'Noir Classic 🖤', css: 'grayscale(100%) contrast(120%)', brightness: 95, contrast: 120, saturate: 0, sepia: 0, grayscale: 100 },
  { name: 'Vintage Film 🎞️', css: 'sepia(45%) contrast(95%) brightness(95%)', brightness: 95, contrast: 95, saturate: 90, sepia: 45, grayscale: 0 },
  { name: 'Teal & Orange 🎬', css: 'contrast(120%) saturate(125%)', brightness: 102, contrast: 120, saturate: 125, sepia: 15, grayscale: 0 },
];

const STICKER_PRESETS = [
  '🔥 LEGENDARY',
  '🌊 WAVELINK',
  '⚡ ELECTRIC',
  '✨ PURE VIBES',
  '🏆 EPIC WIN',
  '👑 ICONIC',
  '💯 100%',
  '🚀 TO THE MOON',
  '❤️ LOVE THIS',
  '🌙 LATE NIGHT'
];

interface StudioEditorViewProps {
  onNavigateToFeed: () => void;
}

export const StudioEditorView: React.FC<StudioEditorViewProps> = ({ onNavigateToFeed }) => {
  const { currentUser, userProfile, isAdmin, isProEffective } = useAuth();
  const isProUser = isProEffective;

  // Media source state
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');

  // Active Tool Panel: 'text' | 'filters' | 'stickers' | 'soundtrack'
  const [activeTool, setActiveTool] = useState<'text' | 'filters' | 'stickers' | 'soundtrack'>('text');

  // Text Overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [newTextString, setNewTextString] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textBgColor, setTextBgColor] = useState<'none' | 'dark' | 'light' | 'gradient'>('dark');
  const [textFontSize, setTextFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [textFontStyle, setTextFontStyle] = useState<'sans' | 'display' | 'mono' | 'hand'>('display');

  // Filters & Adjustments
  const [activeFilter, setActiveFilter] = useState<FilterPreset>(FILTER_PRESETS[0]);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Attached Online Soundtrack
  const [selectedSong, setSelectedSong] = useState<OnlineSong | null>(null);
  const [isSongSelectorOpen, setIsSongSelectorOpen] = useState(false);

  // Post caption and publish state
  const [caption, setCaption] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset or select new media
  const handleMediaFileSelect = async (file: File) => {
    setStudioNotice(null);
    const isVid = file.type.startsWith('video/');

    const isImg = file.type.startsWith('image/');

    if (!isVid && !isImg) {
      setStudioNotice('Please select a valid image (PNG, JPG, WebP) or video (MP4, WebM) file.');
      return;
    }

    // Check size limit: 500MB for Pro, 50MB for free
    const maxSizeBytes = isProUser ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      if (!isProUser && file.size <= 500 * 1024 * 1024) {
        setStudioNotice(`This file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Free tier limit is 50MB. Upgrade to WaveLink Pro to upload large media up to 500MB!`);
      } else {
        setStudioNotice(`File exceeds the maximum allowed ${(maxSizeBytes / (1024 * 1024))}MB limit.`);
      }
      return;
    }

    setOriginalFile(file);
    setFileName(file.name);
    setMediaType(isVid ? 'video' : 'image');

    if (isImg) {
      // Automatic initial downscaling to prevent memory bloat
      const compressed = await compressImage(file, 1600, 1600, 0.85);
      setMediaUrl(compressed);
    } else {
      const objectUrl = URL.createObjectURL(file);
      setMediaUrl(objectUrl);
    }


    // Reset edits
    setTextOverlays([]);
    setActiveFilter(FILTER_PRESETS[0]);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setPublishSuccess(false);
  };

  // Add text overlay
  const handleAddTextOverlay = () => {
    if (!newTextString.trim()) return;

    const newOverlay: TextOverlay = {
      id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: newTextString.trim(),
      x: 50,
      y: 50 + (textOverlays.length * 8) % 35,
      fontSize: textFontSize,
      color: textColor,
      bgColor: textBgColor,
      fontStyle: textFontStyle
    };

    setTextOverlays((prev) => [...prev, newOverlay]);
    setActiveTextId(newOverlay.id);
    setNewTextString('');
  };

  const handleAddSticker = (stickerText: string) => {
    const newOverlay: TextOverlay = {
      id: `stk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: stickerText,
      x: 50,
      y: 35 + (textOverlays.length * 10) % 40,
      fontSize: 'xl',
      color: '#FFFFFF',
      bgColor: 'gradient',
      fontStyle: 'display'
    };
    setTextOverlays((prev) => [...prev, newOverlay]);
    setActiveTextId(newOverlay.id);
  };

  const handleRemoveTextOverlay = (id: string) => {
    setTextOverlays((prev) => prev.filter((o) => o.id !== id));
    if (activeTextId === id) setActiveTextId(null);
  };

  const handleUpdatePosition = (id: string, yPercent: number) => {
    setTextOverlays((prev) =>
      prev.map((item) => (item.id === id ? { ...item, y: yPercent } : item))
    );
  };

  // Live filter CSS calculation
  const getFilterStyleString = () => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${
      activeFilter.sepia ? `sepia(${activeFilter.sepia}%)` : ''
    } ${activeFilter.grayscale ? `grayscale(${activeFilter.grayscale}%)` : ''}`.trim();
  };

  // Composite canvas export for images
  const renderCompositeImage = (): Promise<string> => {
    return new Promise((resolve) => {
      if (mediaType !== 'image' || !mediaUrl) {
        resolve(mediaUrl);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(mediaUrl);
          return;
        }

        // Apply filters directly to canvas context
        ctx.filter = getFilterStyleString();
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none'; // reset for text drawing

        // Draw text overlays & stickers
        textOverlays.forEach((overlay) => {
          const pixelX = (overlay.x / 100) * canvas.width;
          const pixelY = (overlay.y / 100) * canvas.height;

          let sizePx = Math.max(24, Math.round(canvas.width * 0.055));
          if (overlay.fontSize === 'sm') sizePx = Math.round(canvas.width * 0.038);
          if (overlay.fontSize === 'md') sizePx = Math.round(canvas.width * 0.048);
          if (overlay.fontSize === 'xl') sizePx = Math.round(canvas.width * 0.075);

          let fontFam = 'system-ui, sans-serif';
          if (overlay.fontStyle === 'display') fontFam = '"Impact", "Plus Jakarta Sans", sans-serif';
          if (overlay.fontStyle === 'mono') fontFam = '"JetBrains Mono", monospace';
          if (overlay.fontStyle === 'hand') fontFam = 'cursive, sans-serif';

          ctx.font = `800 ${sizePx}px ${fontFam}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const metrics = ctx.measureText(overlay.text);
          const paddingX = sizePx * 0.45;
          const paddingY = sizePx * 0.28;
          const bgWidth = metrics.width + paddingX * 2;
          const bgHeight = sizePx + paddingY * 2;

          // Draw pill background
          if (overlay.bgColor !== 'none') {
            ctx.save();
            if (overlay.bgColor === 'dark') {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            } else if (overlay.bgColor === 'light') {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            } else if (overlay.bgColor === 'gradient') {
              const grad = ctx.createLinearGradient(
                pixelX - bgWidth / 2,
                pixelY,
                pixelX + bgWidth / 2,
                pixelY
              );
              grad.addColorStop(0, '#9333ea');
              grad.addColorStop(0.5, '#ec4899');
              grad.addColorStop(1, '#f59e0b');
              ctx.fillStyle = grad;
            }

            // Rounded rectangle helper
            const r = Math.min(16, bgHeight / 2);
            ctx.beginPath();
            ctx.roundRect(pixelX - bgWidth / 2, pixelY - bgHeight / 2, bgWidth, bgHeight, r);
            ctx.fill();
            ctx.restore();
          }

          // Text shadow and fill
          ctx.save();
          ctx.fillStyle = overlay.color;
          if (overlay.bgColor === 'none') {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
          }
          ctx.fillText(overlay.text, pixelX, pixelY);
          ctx.restore();
        });

        // Convert canvas output to JPEG (under 500KB)
        const finalDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(finalDataUrl);
      };

      img.onerror = () => resolve(mediaUrl);
      img.src = mediaUrl;
    });
  };

  // Publish edited creation to the feed
  const handlePublishToFeed = async () => {
    if (!currentUser) return;
    if (!mediaUrl && !caption.trim() && !selectedSong) {
      setStudioNotice('Please upload an image/video or write a caption before publishing.');
      return;
    }

    setIsPublishing(true);
    setPublishProgress(15);

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const postPayload: Record<string, any> = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Creator',
        authorUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        content: caption.trim(),
        mediaType: mediaType,
        likes: [],
        likesCount: 0,
        commentsCount: 0,
        savesCount: 0,
        createdAt: new Date().toISOString()
      };

      // Attached Online Soundtrack
      if (selectedSong) {
        postPayload.songTitle = selectedSong.trackName;
        postPayload.songArtist = selectedSong.artistName;
        postPayload.songAlbumArt = selectedSong.artworkUrl100;
        postPayload.songPreviewUrl = selectedSong.previewUrl;
        if (selectedSong.collectionName) {
          postPayload.songAlbumName = selectedSong.collectionName;
        }
      }

      // Handle Image vs Video
      if (mediaType === 'image') {
        setPublishProgress(45);
        // Render composite image with text overlays and filters
        const compositeDataUrl = await renderCompositeImage();
        // Safe downscaling & compression to guarantee it never exceeds Firestore's 1MB limit
        const safeDataUrl = await compressImage(
          await (await fetch(compositeDataUrl)).blob(),
          1280,
          1280,
          0.78
        );
        postPayload.imageUrl = safeDataUrl;
        setPublishProgress(85);
      } else if (mediaType === 'video') {
        postPayload.videoFileName = originalFile ? originalFile.name : fileName || 'video.mp4';
        setPublishProgress(35);

        if (originalFile) {
          // Thumbnail
          const thumbnail = await generateVideoThumbnail(originalFile);

          // Convert video for fast concurrent chunking
          const videoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(originalFile);
          });

          const { videoUrl: directUrl, hasVideoChunks } = await saveVideoPost(
            postId,
            originalFile,
            videoDataUrl,
            'posts',
            (pct) => setPublishProgress(35 + Math.round(pct * 0.55))
          );

          postPayload.thumbnailUrl = thumbnail || '';
          postPayload.videoUrl = directUrl || '';
          postPayload.hasVideoChunks = hasVideoChunks;
        } else if (mediaUrl) {
          postPayload.videoUrl = mediaUrl;
          postPayload.hasVideoChunks = false;
        }
      }

      await setDoc(doc(db, 'posts', postId), cleanFirestoreData(postPayload));
      setPublishProgress(100);
      setPublishSuccess(true);

      // Auto-navigate to Feed after 1.2s so user sees the success state
      setTimeout(() => {
        onNavigateToFeed();
      }, 1200);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Studio Header Banner */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-white border border-slate-200/80 text-[#0F172A] shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#3B82F6] border border-blue-200/70 text-xs font-bold uppercase tracking-wider mb-2">
              <Wand2 size={14} className="text-[#10B981]" />
              <span>Wave Studio & Media Editor</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0F172A]">
              Create, Edit & Publish
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-xl font-medium">
              Import pictures or videos, apply aesthetic visual filters, add custom text stickers & titles, attach online songs, and publish directly to the feed!
            </p>
          </div>

          <button
            onClick={onNavigateToFeed}
            className="px-4 py-2.5 rounded-2xl bg-[#F8FAFC] hover:bg-blue-50 text-[#0F172A] hover:text-[#3B82F6] font-bold text-xs flex items-center gap-2 border border-slate-200 transition active:scale-95 shadow-2xs"
          >
            <span>Back to Feed</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {studioNotice && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold">⚠️ Notice:</span>
            <span>{studioNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStudioNotice(null)}
            className="text-amber-700 hover:text-amber-900 text-xs px-2 py-1 rounded-lg hover:bg-amber-100 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Grid: Left (Canvas Preview) & Right (Tool Controls) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive Canvas / Live Visual Editor Viewport */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
            {/* Viewport Top Actions */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                <Layers size={14} className="text-[#3B82F6]" />
                <span>Live Studio Canvas</span>
              </span>

              <div className="flex items-center gap-2">
                {mediaUrl && (
                  <button
                    onClick={() => {
                      setMediaUrl('');
                      setMediaType('none');
                      setOriginalFile(null);
                      setTextOverlays([]);
                    }}
                    className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                  >
                    <Trash2 size={13} />
                    <span>Clear Media</span>
                  </button>
                )}
              </div>
            </div>

            {/* Canvas Viewport Box */}
            <div className="relative min-h-[380px] max-h-[550px] rounded-2xl overflow-hidden bg-[#F8FAFC] flex items-center justify-center border-2 border-dashed border-blue-200 group">
              {!mediaUrl ? (
                <div className="text-center p-8 max-w-sm space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <ImageIcon size={32} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-[#0F172A] mb-1">
                      Start Your Creation
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Choose an image or video from your device or camera to customize with text, filters, and soundtracks.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2.5 pt-2 flex-wrap">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*,video/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMediaFileSelect(f);
                      }}
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*,video/*"
                      capture="environment"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMediaFileSelect(f);
                      }}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-blue-500/20 transition active:scale-95"
                    >
                      <ImageIcon size={15} />
                      <span>Upload Image / Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-4 py-2.5 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-emerald-500/20 transition active:scale-95"
                    >
                      <Camera size={15} />
                      <span>Take Photo</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  {/* Media Content with CSS Filter Applied */}
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      controls
                      playsInline
                      className="w-full max-h-[520px] object-contain transition-all"
                      style={{ filter: getFilterStyleString() }}
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt="Studio Canvas"
                      className="w-full max-h-[520px] object-contain transition-all"
                      style={{ filter: getFilterStyleString() }}
                    />
                  )}

                  {/* Render Text Overlays live on the Canvas Preview */}
                  {textOverlays.map((overlay) => {
                    const isSelected = activeTextId === overlay.id;

                    let bgClass = 'bg-transparent';
                    if (overlay.bgColor === 'dark') bgClass = 'bg-black/75 backdrop-blur-xs px-4 py-1.5 rounded-2xl';
                    if (overlay.bgColor === 'light') bgClass = 'bg-white/95 text-[#0F172A] px-4 py-1.5 rounded-2xl shadow-md';
                    if (overlay.bgColor === 'gradient')
                      bgClass = 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white px-4 py-1.5 rounded-2xl shadow-lg';

                    let sizeClass = 'text-base sm:text-lg';
                    if (overlay.fontSize === 'sm') sizeClass = 'text-xs sm:text-sm';
                    if (overlay.fontSize === 'md') sizeClass = 'text-sm sm:text-base';
                    if (overlay.fontSize === 'xl') sizeClass = 'text-xl sm:text-3xl';

                    let fontClass = 'font-sans font-bold';
                    if (overlay.fontStyle === 'display') fontClass = 'font-black tracking-tight font-sans';
                    if (overlay.fontStyle === 'mono') fontClass = 'font-mono font-bold';
                    if (overlay.fontStyle === 'hand') fontClass = 'italic font-serif font-bold';

                    return (
                      <div
                        key={overlay.id}
                        onClick={() => setActiveTextId(overlay.id)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform group/overlay ${
                          isSelected ? 'ring-2 ring-[#3B82F6] ring-offset-2 ring-offset-white' : ''
                        }`}
                        style={{
                          left: `${overlay.x}%`,
                          top: `${overlay.y}%`,
                          color: overlay.color
                        }}
                      >
                        <div className={`${bgClass} ${sizeClass} ${fontClass} text-center whitespace-nowrap`}>
                          {overlay.text}
                        </div>

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTextOverlay(overlay.id);
                            }}
                            className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md hover:scale-110 transition"
                            title="Delete text overlay"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Attached soundtrack indicator below canvas */}
            {selectedSong && (
              <div className="mt-3">
                <SongPlayerCard
                  title={selectedSong.trackName}
                  artist={selectedSong.artistName}
                  albumArt={selectedSong.artworkUrl100}
                  previewUrl={selectedSong.previewUrl}
                  albumName={selectedSong.collectionName}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Studio Toolbars & Publishing Control */}
        <div className="lg:col-span-5 space-y-5">
          {/* Tool Switcher Tabs */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-1.5 flex items-center justify-between text-xs font-bold shadow-[0_4px_24px_-4px_rgba(15,23,42,0.05)]">
            <button
              onClick={() => setActiveTool('text')}
              className={`flex-1 py-2 px-2.5 rounded-2xl flex items-center justify-center gap-1.5 transition ${
                activeTool === 'text'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Type size={14} />
              <span>Text</span>
            </button>

            <button
              onClick={() => setActiveTool('filters')}
              className={`flex-1 py-2 px-2.5 rounded-2xl flex items-center justify-center gap-1.5 transition ${
                activeTool === 'filters'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Sliders size={14} />
              <span>Filters</span>
            </button>

            <button
              onClick={() => setActiveTool('stickers')}
              className={`flex-1 py-2 px-2.5 rounded-2xl flex items-center justify-center gap-1.5 transition ${
                activeTool === 'stickers'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Sparkles size={14} />
              <span>Badges</span>
            </button>

            <button
              onClick={() => setActiveTool('soundtrack')}
              className={`flex-1 py-2 px-2.5 rounded-2xl flex items-center justify-center gap-1.5 transition ${
                activeTool === 'soundtrack'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Music size={14} />
              <span>Music</span>
            </button>
          </div>

          {/* Tool Panels */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            {/* Panel 1: Text Overlays */}
            {activeTool === 'text' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                    <Type size={16} className="text-[#3B82F6]" />
                    <span>Add Text Overlays</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">{textOverlays.length} added</span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={newTextString}
                    onChange={(e) => setNewTextString(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTextOverlay();
                    }}
                    placeholder="Type words, title, or vibe... (e.g. Summer Sunset 🌅)"
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />

                  {/* Text Style Controls */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Font Size
                      </label>
                      <div className="flex rounded-xl bg-[#F8FAFC] border border-slate-200/80 p-1">
                        {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setTextFontSize(s)}
                            className={`flex-1 py-1 rounded-lg font-bold text-[10px] uppercase transition ${
                              textFontSize === s ? 'bg-[#3B82F6] text-white' : 'text-slate-500'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Background
                      </label>
                      <div className="flex rounded-xl bg-[#F8FAFC] border border-slate-200/80 p-1">
                        {(['none', 'dark', 'light', 'gradient'] as const).map((bg) => (
                          <button
                            key={bg}
                            type="button"
                            onClick={() => setTextBgColor(bg)}
                            className={`flex-1 py-1 rounded-lg font-bold text-[10px] uppercase transition ${
                              textBgColor === bg ? 'bg-[#3B82F6] text-white' : 'text-slate-500'
                            }`}
                          >
                            {bg === 'gradient' ? 'Glow' : bg}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Text Color
                    </label>
                    <div className="flex items-center gap-2">
                      {['#FFFFFF', '#FDE047', '#F43F5E', '#3B82F6', '#10B981', '#8B5CF6', '#0F172A'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setTextColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition ${
                            textColor === c ? 'border-[#3B82F6] scale-110' : 'border-slate-300'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTextOverlay}
                    disabled={!newTextString.trim()}
                    className="w-full py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 shadow-xs"
                  >
                    <span>+ Add Text to Canvas</span>
                  </button>
                </div>

                {/* Reposition active text overlay */}
                {activeTextId && (
                  <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                    <span className="text-[11px] font-bold text-[#3B82F6] block">
                      Reposition Active Overlay:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePosition(activeTextId, 20)}
                        className="flex-1 py-1 px-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#0F172A]"
                      >
                        Top
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePosition(activeTextId, 50)}
                        className="flex-1 py-1 px-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#0F172A]"
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePosition(activeTextId, 80)}
                        className="flex-1 py-1 px-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#0F172A]"
                      >
                        Bottom
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Panel 2: Visual Filters & Presets */}
            {activeTool === 'filters' && (
              <div className="space-y-4 animate-fade-in">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                  <Sliders size={16} className="text-[#3B82F6]" />
                  <span>Color & Mood Presets</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setActiveFilter(preset);
                        setBrightness(preset.brightness);
                        setContrast(preset.contrast);
                        setSaturation(preset.saturate);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        activeFilter.name === preset.name
                          ? 'bg-blue-50 border-[#3B82F6] font-bold'
                          : 'bg-[#F8FAFC] border-slate-200'
                      }`}
                    >
                      <span className="text-xs text-[#0F172A] block">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Sliders */}
                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                      <span>Brightness</span>
                      <span className="font-mono">{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-[#3B82F6]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                      <span>Contrast</span>
                      <span className="font-mono">{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="160"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-[#3B82F6]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                      <span>Saturation</span>
                      <span className="font-mono">{saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full accent-[#3B82F6]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Panel 3: Sticker Badges */}
            {activeTool === 'stickers' && (
              <div className="space-y-3 animate-fade-in">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#10B981]" />
                  <span>One-Tap Vibe Badges</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Tap any badge to drop it directly onto your canvas:
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {STICKER_PRESETS.map((sticker) => (
                    <button
                      key={sticker}
                      type="button"
                      onClick={() => handleAddSticker(sticker)}
                      className="p-2.5 rounded-xl bg-[#F8FAFC] hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-xs font-bold text-[#0F172A] transition text-left"
                    >
                      {sticker}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Panel 4: Online Soundtrack */}
            {activeTool === 'soundtrack' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                    <Music size={16} className="text-[#3B82F6]" />
                    <span>Attach Soundtrack</span>
                  </h4>
                </div>

                {selectedSong ? (
                  <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-blue-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={selectedSong.artworkUrl100}
                        alt={selectedSong.trackName}
                        className="w-10 h-10 rounded-xl object-cover ring-1 ring-blue-300"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#0F172A] truncate">
                          {selectedSong.trackName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {selectedSong.artistName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsSongSelectorOpen(true)}
                        className="px-2.5 py-1 rounded-xl bg-[#3B82F6] text-white text-xs font-semibold"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSong(null)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white mx-auto flex items-center justify-center shadow-sm">
                      <Music size={22} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">
                        No Song Attached
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Search millions of tracks online to add music to your post.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSongSelectorOpen(true)}
                      className="px-4 py-2 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 mx-auto transition shadow-xs"
                    >
                      <Disc size={14} />
                      <span>Search Online Music</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption & Publish Area */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-3.5">
            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Post Caption:
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your story, caption, or thoughts to accompany this post..."
                rows={3}
                maxLength={2000}
                className="w-full p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] resize-none"
              />
            </div>

            {/* Fast Progress Bar */}
            {isPublishing && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/70 border border-blue-200">
                <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                  <span className="flex items-center gap-1.5">
                    <Zap size={14} className="text-[#10B981] fill-[#10B981] animate-bounce" />
                    <span>Rendering & Publishing to Feed...</span>
                  </span>
                  <span className="font-mono">{publishProgress}%</span>
                </div>
                <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] transition-all duration-150 rounded-full"
                    style={{ width: `${publishProgress}%` }}
                  />
                </div>
              </div>
            )}

            {publishSuccess ? (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Check size={16} className="text-[#10B981]" />
                  <span>Published to WaveFeed! Redirecting...</span>
                </span>
                <button
                  type="button"
                  onClick={onNavigateToFeed}
                  className="px-3 py-1 rounded-xl bg-[#10B981] text-white text-xs font-bold"
                >
                  View Feed →
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePublishToFeed}
                disabled={isPublishing || (!mediaUrl && !caption.trim() && !selectedSong)}
                className="w-full py-3 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition active:scale-98 disabled:opacity-40"
              >
                <Send size={16} />
                <span>Publish to WaveFeed 🌊</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Online Music Search Modal */}
      <SongSelectorModal
        isOpen={isSongSelectorOpen}
        onClose={() => setIsSongSelectorOpen(false)}
        onSelectSong={(song) => setSelectedSong(song)}
        selectedSongId={selectedSong?.trackId}
      />
    </div>
  );
};
