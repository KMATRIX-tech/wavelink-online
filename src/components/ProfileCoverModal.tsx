import React, { useState, useRef, useEffect } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Crown,
  Image as ImageIcon,
  Lock,
  RotateCcw,
  Sparkles,
  Upload,
  Video,
  X,
  ZoomIn
} from 'lucide-react';
import { AppearanceTheme, ProfileCoverPresetId, ProfileCoverType, UserProfile } from '../types';
import { auth, formatCloudinaryUploadError } from '../firebase';
import {
  compressProfileImageToBlob,
  ProfileStorageUploadError,
  uploadProfileImageToCloudinary,
  validateProfileImageFile
} from '../utils/mediaStorage';
import { useBottomSheetLock } from '../utils/sheetLock';

export interface BuiltInCoverPreset {
  id: ProfileCoverPresetId;
  nameEn: string;
  nameSw: string;
  category: 'gradient' | 'animated' | 'pattern';
  background: string;
  svgPattern?: string;
  isAnimated?: boolean;
}

export const BUILT_IN_COVER_PRESETS: BuiltInCoverPreset[] = [
  {
    id: 'theme-default',
    nameEn: 'Active Theme Default',
    nameSw: 'Mandhari ya Sasa',
    category: 'gradient',
    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
  },
  {
    id: 'ocean-waves',
    nameEn: 'Zanzibar Ocean Waves',
    nameSw: 'Mawimbi ya Bahari',
    category: 'pattern',
    background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 48%, #0D9488 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='80' viewBox='0 0 160 80'%3E%3Cpath d='M0 40 Q 40 14, 80 40 T 160 40' fill='none' stroke='%23FFFFFF' stroke-width='2' stroke-opacity='0.18'/%3E%3Cpath d='M0 62 Q 40 36, 80 62 T 160 62' fill='none' stroke='%2399F6E4' stroke-width='2' stroke-opacity='0.16'/%3E%3C/svg%3E")`
  },
  {
    id: 'cosmic-galaxy',
    nameEn: 'Midnight Star Galaxy',
    nameSw: ' Anga la Nyota',
    category: 'pattern',
    background: 'linear-gradient(135deg, #090D16 0%, #1E1B4B 45%, #6D28D9 82%, #EC4899 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Ccircle cx='20' cy='25' r='1.8' fill='%23FFFFFF' fill-opacity='0.75'/%3E%3Ccircle cx='95' cy='18' r='1.4' fill='%2338BDF8' fill-opacity='0.7'/%3E%3Ccircle cx='68' cy='72' r='2.1' fill='%23F472B6' fill-opacity='0.65'/%3E%3Ccircle cx='34' cy='90' r='1.2' fill='%23C4B5FD' fill-opacity='0.8'/%3E%3Ccircle cx='104' cy='85' r='1.6' fill='%23FFFFFF' fill-opacity='0.6'/%3E%3C/svg%3E")`
  },
  {
    id: 'floral-bloom',
    nameEn: 'Botanical Blossom',
    nameSw: 'Maua ya Bustani',
    category: 'pattern',
    background: 'linear-gradient(135deg, #9D174D 0%, #DB2777 45%, #F472B6 78%, #0D9488 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cg fill='%23FFFFFF' fill-opacity='0.16'%3E%3Ccircle cx='48' cy='34' r='8'/%3E%3Ccircle cx='62' cy='48' r='8'/%3E%3Ccircle cx='48' cy='62' r='8'/%3E%3Ccircle cx='34' cy='48' r='8'/%3E%3C/g%3E%3Ccircle cx='48' cy='48' r='5' fill='%23FDE047' fill-opacity='0.38'/%3E%3C/svg%3E")`
  },
  {
    id: 'nitro-racing',
    nameEn: 'Nitro Motorsport',
    nameSw: 'Mbio za Magari',
    category: 'pattern',
    background: 'linear-gradient(135deg, #090D16 0%, #1F2937 40%, #DC2626 78%, #F59E0B 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cpath d='M0 48L48 0M-12 12L12 -12M36 60L60 36' stroke='%23FFFFFF' stroke-width='2' stroke-opacity='0.12'/%3E%3Crect x='0' y='0' width='12' height='12' fill='%23FFFFFF' fill-opacity='0.06'/%3E%3Crect x='12' y='12' width='12' height='12' fill='%23FFFFFF' fill-opacity='0.06'/%3E%3C/svg%3E")`
  },
  {
    id: 'neon-cyber',
    nameEn: 'Cyber Neon Grid',
    nameSw: 'Gridi ya Neon',
    category: 'animated',
    background: 'linear-gradient(125deg, #06B6D4 0%, #3B82F6 35%, #8B5CF6 68%, #EC4899 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M44 0H0v44' fill='none' stroke='%23FFFFFF' stroke-width='1' stroke-opacity='0.18'/%3E%3C/svg%3E")`,
    isAnimated: true
  },
  {
    id: 'savanna-sunset',
    nameEn: 'Serengeti Gold Sunset',
    nameSw: 'Machweo ya Serengeti',
    category: 'gradient',
    background: 'linear-gradient(135deg, #7C2D12 0%, #EA580C 42%, #F59E0B 76%, #FDE047 100%)',
    svgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='60' r='34' fill='%23FFFFFF' fill-opacity='0.12'/%3E%3Ccircle cx='60' cy='60' r='18' fill='%23FEF08A' fill-opacity='0.18'/%3E%3C/svg%3E")`
  },
  {
    id: 'aurora-pulse',
    nameEn: 'Animated Aurora Borealis',
    nameSw: 'Mwanga wa Aurora',
    category: 'animated',
    background: 'linear-gradient(270deg, #2563EB, #0D9488, #10B981, #8B5CF6, #EC4899, #2563EB)',
    isAnimated: true
  },
  {
    id: 'emerald-matrix',
    nameEn: 'Kilimanjaro Emerald',
    nameSw: 'Kijani cha Kilimanjaro',
    category: 'animated',
    background: 'linear-gradient(135deg, #064E3B 0%, #0D9488 48%, #10B981 82%, #A7F3D0 100%)',
    isAnimated: true
  }
];

export const BUILT_IN_VIDEO_COVERS: { id: string; nameEn: string; nameSw: string; url: string }[] = [
  {
    id: 'video-ocean',
    nameEn: 'Ocean Horizon Loop',
    nameSw: 'Mawimbi ya Bahari (Video)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
  },
  {
    id: 'video-blaze',
    nameEn: 'Golden Ember Flow',
    nameSw: 'Mwanga wa Dhahabu (Video)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  }
];

export function getThemeDefaultCoverStyle(theme?: AppearanceTheme): React.CSSProperties {
  switch (theme) {
    case 'hearts':
      return {
        backgroundImage:
          'linear-gradient(135deg, #E11D48 0%, #EC4899 52%, #F43F5E 100%)'
      };
    case 'midnight':
      return {
        backgroundImage:
          'linear-gradient(135deg, #0F172A 0%, #1E293B 48%, #2563EB 100%)'
      };
    case 'neon':
      return {
        backgroundImage:
          'linear-gradient(135deg, #090D16 0%, #06B6D4 48%, #EC4899 100%)'
      };
    case 'camo':
      return {
        backgroundImage:
          'linear-gradient(135deg, #14532D 0%, #15803D 50%, #D97706 100%)'
      };
    case 'sunset':
    case 'savanna':
    case 'kilimanjaro':
    case 'sunrise':
      return {
        backgroundImage:
          'linear-gradient(135deg, #EA580C 0%, #E11D48 52%, #F59E0B 100%)'
      };
    case 'flowers':
      return {
        backgroundImage:
          'linear-gradient(135deg, #DB2777 0%, #A855F7 52%, #0D9488 100%)'
      };
    case 'racing':
      return {
        backgroundImage:
          'linear-gradient(135deg, #111827 0%, #DC2626 55%, #F59E0B 100%)'
      };
    case 'galaxy':
      return {
        backgroundImage:
          'linear-gradient(135deg, #1E1B4B 0%, #6D28D9 52%, #06B6D4 100%)'
      };
    default:
      return {
        backgroundImage:
          'linear-gradient(135deg, var(--accent-primary, #2563EB) 0%, var(--accent-secondary, #0D9488) 100%)'
      };
  }
}

/**
 * Crops an image file to a 3:1 cover aspect ratio (1600x534 max width) with vertical pan & zoom,
 * and compresses it to ~300 KB JPEG (never exceeding 5 MB).
 */
async function cropAndCompressCoverImage(
  imageElement: HTMLImageElement,
  panYPercent: number, // 0 to 100
  zoomLevel: number // 1 to 2.5
): Promise<{ blob: Blob; previewDataUrl: string }> {
  const TARGET_W = 1600;
  const TARGET_H = 534; // 3:1 cover aspect ratio, max 1600px wide
  const TARGET_BYTES = 300 * 1024; // ~300 KB target

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = TARGET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize image cropper canvas.');
  }

  const naturalW = Math.max(1, imageElement.naturalWidth || imageElement.width);
  const naturalH = Math.max(1, imageElement.naturalHeight || imageElement.height);
  const targetAspect = TARGET_W / TARGET_H;
  const srcAspect = naturalW / naturalH;

  let cropW = naturalW;
  let cropH = naturalH;

  if (srcAspect > targetAspect) {
    cropH = naturalH;
    cropW = naturalH * targetAspect;
  } else {
    cropW = naturalW;
    cropH = naturalW / targetAspect;
  }

  // Apply zoom
  const safeZoom = Math.max(1, Math.min(2.5, zoomLevel));
  cropW = cropW / safeZoom;
  cropH = cropH / safeZoom;

  const maxOffsetX = Math.max(0, naturalW - cropW);
  const maxOffsetY = Math.max(0, naturalH - cropH);

  const srcX = maxOffsetX * 0.5;
  const srcY = maxOffsetY * (Math.max(0, Math.min(100, panYPercent)) / 100);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, srcX, srcY, cropW, cropH, 0, 0, TARGET_W, TARGET_H);

  // Iteratively compress JPEG toward ~300 KB
  let quality = 0.84;
  let finalBlob: Blob | null = null;

  while (quality >= 0.4) {
    // eslint-disable-next-line no-await-in-loop
    const candidate = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (candidate) {
      finalBlob = candidate;
      if (candidate.size <= TARGET_BYTES) {
        break;
      }
    }
    quality -= 0.08;
  }

  if (!finalBlob) {
    throw new Error('Failed to compress cover image.');
  }

  // Guarantee cover is strictly under 500 KB before uploading to Cloudinary
  if (finalBlob.size >= 450 * 1024) {
    try {
      finalBlob = await compressProfileImageToBlob(finalBlob, {
        maxWidth: 1400,
        maxHeight: 467,
        targetMaxBytes: 420 * 1024,
        mimeType: 'image/jpeg'
      });
    } catch {
      // Check strict limit below
    }
  }

  if (finalBlob.size >= 500 * 1024) {
    throw new Error('Compressed cover image is still 500 KB or larger. Please choose a smaller image.');
  }

  const previewDataUrl = canvas.toDataURL('image/jpeg', Math.max(0.5, quality));
  return { blob: finalBlob, previewDataUrl };
}

interface ProfileCoverBannerProps {
  profile: UserProfile | null;
  activeTheme?: AppearanceTheme;
  isOwnProfile: boolean;
  isProUser: boolean;
  language: 'en' | 'sw';
  onOpenCoverPicker: () => void;
  onOpenUpgradePro: () => void;
}

export const ProfileCoverBanner: React.FC<ProfileCoverBannerProps> = ({
  profile,
  activeTheme,
  isOwnProfile,
  language,
  onOpenCoverPicker
}) => {
  const coverType: ProfileCoverType =
    profile?.coverType || (profile?.coverImageUrl ? 'image' : profile?.coverPresetId ? 'preset' : 'default');

  const presetId: ProfileCoverPresetId = profile?.coverPresetId || 'theme-default';

  const activePreset =
    BUILT_IN_COVER_PRESETS.find((p) => p.id === presetId) || BUILT_IN_COVER_PRESETS[0];

  const renderCoverSurface = () => {
    if (coverType === 'video' && profile?.coverImageUrl) {
      return (
        <video
          src={profile.coverImageUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      );
    }

    if ((coverType === 'image' || Boolean(profile?.coverImageUrl)) && profile?.coverImageUrl) {
      return (
        <img
          src={profile.coverImageUrl}
          alt={`${profile.displayName || 'Profile'} cover`}
          className="w-full h-full object-cover"
          loading="eager"
        />
      );
    }

    if (presetId !== 'theme-default') {
      const style: React.CSSProperties = {
        backgroundImage: activePreset.svgPattern
          ? `${activePreset.svgPattern}, ${activePreset.background}`
          : activePreset.background,
        backgroundSize: activePreset.svgPattern
          ? 'auto, 220% 220%'
          : activePreset.isAnimated
          ? '240% 240%'
          : '100% 100%'
      };
      return (
        <div
          className={`w-full h-full ${activePreset.isAnimated ? 'wavelink-profile-cover--animated' : ''}`}
          style={style}
        />
      );
    }

    // Default theme-aware cover
    return (
      <div
        className="w-full h-full relative"
        style={getThemeDefaultCoverStyle(profile?.appearanceTheme || activeTheme)}
      >
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='70' viewBox='0 0 140 70'%3E%3Cpath d='M0 35 Q 35 12, 70 35 T 140 35' fill='none' stroke='%23FFFFFF' stroke-width='2'/%3E%3C/svg%3E")`
          }}
        />
      </div>
    );
  };

  return (
    <div className="wavelink-profile-cover">
      {renderCoverSurface()}

      {/* Soft gradient fade into the page */}
      <div className="wavelink-profile-cover-fade" />

      {/* Own Profile Top-Right Cover Control */}
      {isOwnProfile && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCoverPicker}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-md border border-white/25 text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Camera size={14} className="text-amber-300 shrink-0" />
            <span>{language === 'sw' ? 'Badili Jalada' : 'Edit Cover'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

interface ProfileCoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid?: string;
  isProUser: boolean;
  currentCoverType?: ProfileCoverType;
  currentPresetId?: ProfileCoverPresetId;
  currentCoverImageUrl?: string;
  language: 'en' | 'sw';
  onSaveCover: (data: {
    coverType: ProfileCoverType;
    coverPresetId?: ProfileCoverPresetId;
    coverImageUrl?: string;
  }) => Promise<void>;
  onOpenUpgradePro: () => void;
}

export const ProfileCoverModal: React.FC<ProfileCoverModalProps> = ({
  isOpen,
  onClose,
  uid,
  isProUser,
  currentCoverType = 'default',
  currentPresetId = 'theme-default',
  currentCoverImageUrl = '',
  language,
  onSaveCover,
  onOpenUpgradePro
}) => {
  const [tab, setTab] = useState<'presets' | 'upload' | 'video'>('presets');
  const [selectedPreset, setSelectedPreset] = useState<ProfileCoverPresetId>(
    currentPresetId || 'ocean-waves'
  );
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string>(
    currentCoverType === 'video' && currentCoverImageUrl
      ? currentCoverImageUrl
      : BUILT_IN_VIDEO_COVERS[0].url
  );

  // Custom Upload & 3:1 Cropper State
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [panYPercent, setPanYPercent] = useState<number>(50);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string>('');
  const [croppedSizeKb, setCroppedSizeKb] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!loadedImage) return;
    let cancelled = false;
    cropAndCompressCoverImage(loadedImage, panYPercent, zoomLevel)
      .then(({ blob, previewDataUrl }) => {
        if (cancelled) return;
        setCroppedPreviewUrl(previewDataUrl);
        setCroppedSizeKb(Math.max(1, Math.round(blob.size / 1024)));
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to crop image.');
          setErrorCode('storage/crop-failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadedImage, panYPercent, zoomLevel]);

  useBottomSheetLock(isOpen, 'profile-cover');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setErrorCode(null);
    setCanRetryUpload(false);

    const validation = validateProfileImageFile(file);
    if (!validation.valid) {
      setErrorMsg(
        language === 'sw'
          ? 'Tafadhali chagua faili la picha pekee (JPG, PNG, WebP, au GIF).'
          : validation.error || 'Please choose an image file (JPG, PNG, WebP, or GIF).'
      );
      setErrorCode(validation.errorCode || 'storage/invalid-file-type');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      setLoadedImage(img);
      setPanYPercent(50);
      setZoomLevel(1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setErrorMsg(
        language === 'sw'
          ? 'Imeshindwa kusoma picha hii.'
          : 'Could not read this image file.'
      );
      setErrorCode('storage/unreadable-image');
    };
    img.src = objectUrl;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setErrorCode(null);
    setCanRetryUpload(false);
    try {
      if (tab === 'presets') {
        const chosen = BUILT_IN_COVER_PRESETS.find((p) => p.id === selectedPreset);
        await onSaveCover({
          coverType:
            selectedPreset === 'theme-default'
              ? 'default'
              : chosen?.isAnimated
              ? 'animated'
              : 'preset',
          coverPresetId: selectedPreset,
          coverImageUrl: ''
        });
        onClose();
        return;
      }

      if (tab === 'video') {
        await onSaveCover({
          coverType: 'video',
          coverPresetId: 'theme-default',
          coverImageUrl: selectedVideoUrl
        });
        onClose();
        return;
      }

      if (tab === 'upload') {
        if (!loadedImage) {
          setErrorMsg(
            language === 'sw'
              ? 'Tafadhali chagua picha kwanza.'
              : 'Please select an image to upload first.'
          );
          setErrorCode('cloudinary/no-file-selected');
          setIsSaving(false);
          return;
        }

        const resolvedUid = uid || auth.currentUser?.uid || '';
        const { blob } = await cropAndCompressCoverImage(loadedImage, panYPercent, zoomLevel);
        const uploaded = await uploadProfileImageToCloudinary({
          uid: resolvedUid,
          folder: 'covers',
          blob,
          contentType: 'image/jpeg',
          onProgress: (pct) => setUploadProgress(pct)
        });
        await onSaveCover({
          coverType: 'image',
          coverPresetId: 'theme-default',
          coverImageUrl: uploaded.downloadUrl
        });
        onClose();
      }
    } catch (err: any) {
      if (err instanceof ProfileStorageUploadError) {
        console.error('[WaveLink Cover Upload Failed]', {
          code: err.code,
          message: err.message,
          rawError: err
        });
        setErrorMsg(err.friendlyMessage);
        setErrorCode(err.code);
      } else {
        const formatted = formatCloudinaryUploadError(err, { action: 'save-cover' });
        setErrorMsg(formatted.friendlyMessage);
        setErrorCode(formatted.code);
      }
      setCanRetryUpload(tab === 'upload' && Boolean(loadedImage));
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on phones */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-[var(--border-hairline)]" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center">
              <Crown size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[var(--text-primary)]">
                {language === 'sw' ? 'Jalada la Wasifu la Pro' : 'Pro Profile Cover Studio'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {language === 'sw'
                  ? 'Chagua jalada la kisasa au pakia picha yako (1600px, ~300 KB)'
                  : 'Pick a built-in animated/SVG cover or upload & crop your own (1600px, ~300 KB)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover studio"
            className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
          <button
            type="button"
            onClick={() => setTab('presets')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              tab === 'presets'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <Sparkles size={14} />
            <span>{language === 'sw' ? 'Maktaba ya Majalada' : 'Built-in Covers'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              tab === 'upload'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <ImageIcon size={14} />
            <span>{language === 'sw' ? 'Pakia Picha' : 'Upload Photo'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('video')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              tab === 'video'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <Video size={14} />
            <span>{language === 'sw' ? 'Jalada la Video' : 'Looping Video'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto overscroll-contain space-y-4 flex-1 min-h-0">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-200 space-y-2">
              <div className="flex items-start gap-2 text-xs font-bold">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                <div className="flex-1 min-w-0">
                  <p>{errorMsg}</p>
                  {errorCode && (
                    <p className="text-[11px] font-mono opacity-80 mt-1">
                      Error code: {errorCode}
                    </p>
                  )}
                </div>
              </div>
              {canRetryUpload && !isSaving && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>{language === 'sw' ? 'Jaribu Tena' : 'Retry Upload'}</span>
                </button>
              )}
            </div>
          )}

          {isSaving && tab === 'upload' && (
            <div className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                <span>
                  {language === 'sw' ? 'Inapakia jalada...' : 'Uploading cover photo...'}
                </span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-200"
                  style={{ width: `${Math.max(4, uploadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {tab === 'presets' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUILT_IN_COVER_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`group relative rounded-2xl overflow-hidden border-2 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25'
                        : 'border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/50'
                    }`}
                  >
                    <div
                      className={`h-24 w-full ${
                        preset.isAnimated ? 'wavelink-profile-cover--animated' : ''
                      }`}
                      style={{
                        backgroundImage: preset.svgPattern
                          ? `${preset.svgPattern}, ${preset.background}`
                          : preset.background,
                        backgroundSize: preset.svgPattern
                          ? 'auto, 220% 220%'
                          : preset.isAnimated
                          ? '240% 240%'
                          : '100% 100%'
                      }}
                    />
                    <div className="p-2.5 bg-[var(--bg-surface)] flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold text-[var(--text-primary)] block">
                          {language === 'sw' ? preset.nameSw : preset.nameEn}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">
                          {preset.isAnimated
                            ? language === 'sw'
                              ? 'Inacheza (Animated)'
                              : 'Animated Cover'
                            : 'SVG / Gradient'}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shrink-0">
                          <Check size={14} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {!loadedImage ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-44 rounded-2xl border-2 border-dashed border-[var(--border-hairline)] hover:border-[var(--accent-primary)] bg-[var(--bg-subtle)] flex flex-col items-center justify-center gap-2 p-6 transition cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center">
                    <Upload size={22} />
                  </div>
                  <span className="text-sm font-extrabold text-[var(--text-primary)]">
                    {language === 'sw'
                      ? 'Gusa kuchagua picha ya jalada'
                      : 'Tap to choose a cover photo'}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] text-center">
                    {language === 'sw'
                      ? 'Inapunguzwa moja kwa moja hadi upana wa 1600px (uwiano wa 3:1) na ~300 KB'
                      : 'Automatically cropped to 3:1 cover ratio (max 1600px wide) & compressed to ~300 KB'}
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-[var(--border-hairline)] bg-black aspect-[3/1]">
                    {croppedPreviewUrl && (
                      <img
                        src={croppedPreviewUrl}
                        alt="Cropped cover preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/70 text-white text-[11px] font-bold backdrop-blur-xs">
                      3:1 Cover • {croppedSizeKb} KB
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                    <div>
                      <label className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-between mb-1">
                        <span>{language === 'sw' ? 'Sogeza Juu/Chini' : 'Vertical Position'}</span>
                        <span>{panYPercent}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={panYPercent}
                        onChange={(e) => setPanYPercent(Number(e.target.value))}
                        className="w-full accent-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1">
                          <ZoomIn size={12} />
                          {language === 'sw' ? 'Kuza (Zoom)' : 'Zoom'}
                        </span>
                        <span>{zoomLevel.toFixed(1)}×</span>
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={2.5}
                        step={0.1}
                        value={zoomLevel}
                        onChange={(e) => setZoomLevel(Number(e.target.value))}
                        className="w-full accent-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] hover:opacity-90 transition cursor-pointer"
                  >
                    {language === 'sw' ? 'Chagua Picha Nyingine' : 'Choose Different Photo'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'video' && (
            <div className="grid grid-cols-1 gap-3">
              {BUILT_IN_VIDEO_COVERS.map((vid) => {
                const isSelected = selectedVideoUrl === vid.url;
                return (
                  <button
                    key={vid.id}
                    type="button"
                    onClick={() => setSelectedVideoUrl(vid.url)}
                    className={`rounded-2xl overflow-hidden border-2 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25'
                        : 'border-[var(--border-hairline)]'
                    }`}
                  >
                    <div className="h-28 w-full bg-black relative">
                      <video
                        src={vid.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 bg-[var(--bg-surface)] flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[var(--text-primary)]">
                        {language === 'sw' ? vid.nameSw : vid.nameEn}
                      </span>
                      {isSelected && (
                        <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center">
                          <Check size={14} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 shrink-0"
          style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs font-extrabold cursor-pointer"
          >
            {language === 'sw' ? 'Ghairi' : 'Cancel'}
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:opacity-95 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
          >
            <Check size={16} />
            <span>
              {isSaving
                ? uploadProgress > 0
                  ? `${language === 'sw' ? 'Inapakia' : 'Uploading'} (${uploadProgress}%)`
                  : language === 'sw'
                  ? 'Inahifadhi...'
                  : 'Saving...'
                : language === 'sw'
                ? 'Hifadhi Jalada'
                : 'Save Cover'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
