import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { OnlineSong } from '../types';
import {
  compressImage,
  cloneVideoFileToMemory,
  validateSparkMediaBeforeUpload,
  formatSparkDuration,
  SPARK_MAX_FILE_MB,
  FREE_SPARK_MAX_SECONDS,
  PRO_SPARK_MAX_SECONDS,
  SparkVideoMetadata
} from '../utils/mediaStorage';
import { enqueueSparkUploadJob } from '../services/sparkUploadQueue';
import { SongSelectorModal } from './SongSelectorModal';
import {
  Flame,
  Zap,
  Camera,
  Image as ImageIcon,
  Music,
  X,
  Upload,
  Clock,
  Trophy
} from 'lucide-react';

interface SparkComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSparkCreated?: () => void;
}

const LEGENDARY_TAGS = [
  '🏆 Legendary Win',
  '🔥 Insane Moment',
  '✨ Once in a Lifetime',
  '⚡ Pure Energy',
  '🌅 Unreal View',
  '🎉 Milestone Reached',
  '🌊 Wave Vibe',
  '🌙 Late Night Magic'
];

export const SparkComposerModal: React.FC<SparkComposerModalProps> = ({
  isOpen,
  onClose,
  onSparkCreated
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective } = useAuth();
  const isProTier = Boolean(isProEffective || isAdmin);

  const [mediaDataUrl, setMediaDataUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<SparkVideoMetadata | null>(null);
  const [selectedTag, setSelectedTag] = useState(LEGENDARY_TAGS[0]);
  const [customTag, setCustomTag] = useState('');
  const [caption, setCaption] = useState('');

  const [feedbackNotice, setFeedbackNotice] = useState<{
    text: string;
    showTryProNote?: boolean;
  } | null>(null);

  // Attached online song
  const [attachedSong, setAttachedSong] = useState<OnlineSong | null>(null);
  const [isSongSelectorOpen, setIsSongSelectorOpen] = useState(false);

  // Uploading state & real-time progress percentage
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setFeedbackNotice(null);
    const validation = await validateSparkMediaBeforeUpload(file, isProTier);

    if (!validation.valid) {
      setFeedbackNotice({
        text:
          validation.error ||
          (!isProTier
            ? 'Free Sparks can be up to 60 seconds. Go Pro for 90.'
            : 'Please select a valid photo or video file.'),
        showTryProNote: Boolean(validation.showTryProNote)
      });
      return;
    }

    if (validation.mediaType === 'image') {
      setSelectedFile(file);
      setMediaType('image');
      setVideoMeta(null);
      const compressed = await compressImage(file, 1280, 1280, 0.78);
      setMediaDataUrl(compressed);
    } else {
      const safeVideo = await cloneVideoFileToMemory(file);
      setSelectedFile(safeVideo);
      setMediaType('video');
      setVideoMeta({
        durationSeconds: validation.durationSeconds || 3,
        width: validation.width || 720,
        height: validation.height || 1280
      });
      const previewUrl = URL.createObjectURL(safeVideo);
      setMediaDataUrl(previewUrl);
    }
  };

  const handleClearMedia = () => {
    setMediaDataUrl('');
    setMediaType('none');
    setSelectedFile(null);
    setVideoMeta(null);
    setFeedbackNotice(null);
  };

  const handleCreateSpark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !mediaDataUrl || mediaType === 'none') {
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setUploadStatusText('Queuing Spark for background upload...');
    setFeedbackNotice(null);

    const finalTag = customTag.trim() || selectedTag;

    enqueueSparkUploadJob({
      authorId: currentUser.uid,
      authorEmail: currentUser.email || '',
      authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
      authorUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
      authorPhotoURL:
        userProfile?.photoURL ||
        currentUser.photoURL ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
      isProTier,
      attachedSong,
      slides: [
        {
          id: `slide_${Date.now()}`,
          mediaDataUrl,
          mediaType,
          file: selectedFile,
          videoMeta: videoMeta || undefined,
          caption: caption.trim(),
          legendaryTag: finalTag
        }
      ],
      onComplete: onSparkCreated
    });

    handleClearMedia();
    setCaption('');
    setCustomTag('');
    setAttachedSong(null);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatusText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={isUploading ? undefined : onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-white rounded-3xl border border-slate-200/80 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden z-10 animate-fade-in my-auto">
        {/* Top Banner */}
        <div className="p-5 sm:p-6 bg-[#F8FAFC] border-b border-slate-100 text-[#0F172A] relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] shadow-sm text-white">
                <Flame size={24} />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/70 text-[10px] font-extrabold uppercase tracking-widest text-[#3B82F6]">
                  <Zap size={11} className="fill-[#10B981] text-[#10B981]" />
                  <span>24-Hour Legendary Moment</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5 text-[#0F172A]">
                  Post a Spark 🔥
                </h3>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isUploading}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 transition disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <p className="relative z-10 text-slate-600 text-xs mt-2 font-medium flex items-center gap-1.5">
            <Clock size={13} className="shrink-0 text-[#3B82F6]" />
            <span>
              Sparks vanish automatically after 24 hours •{' '}
              {isProTier
                ? `Pro Video up to ${PRO_SPARK_MAX_SECONDS}s (Max ${SPARK_MAX_FILE_MB} MB)`
                : `Free Video up to ${FREE_SPARK_MAX_SECONDS}s • Pro up to ${PRO_SPARK_MAX_SECONDS}s`}
            </span>
          </p>
        </div>

        <form onSubmit={handleCreateSpark} className="p-5 sm:p-6 space-y-4">
          {feedbackNotice && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-slate-900 text-xs font-bold space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span>{feedbackNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setFeedbackNotice(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </div>
              {feedbackNotice.showTryProNote && (
                <div className="pt-1 text-[11px] font-semibold text-[#0D9488] border-t border-amber-200/70">
                  ✨ Try Pro: Post up to 90-second HD Sparks, get your Verified Blue Star &amp; browse ad-free.
                </div>
              )}
            </div>
          )}

          {/* Media Picker / Preview */}
          {!mediaDataUrl ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center bg-[#F8FAFC] hover:border-[#3B82F6] transition">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white mx-auto flex items-center justify-center mb-3 shadow-sm">
                <Upload size={24} />
              </div>
              <h4 className="text-sm font-bold text-[#0F172A] mb-1">
                Upload Moment from Phone or Computer
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
                Choose a photo or video clip ({isProTier ? `up to ${PRO_SPARK_MAX_SECONDS}s` : `up to ${FREE_SPARK_MAX_SECONDS}s`}, 720p HD, max {SPARK_MAX_FILE_MB} MB).
              </p>

              <div className="flex items-center justify-center gap-2 flex-wrap">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v,video/3gpp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition"
                >
                  <ImageIcon size={14} />
                  <span>Choose Photo / Video</span>
                </button>

                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition"
                >
                  <Camera size={14} />
                  <span>Take with Camera</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border-2 border-blue-200 bg-slate-950 max-h-72 flex items-center justify-center">
              {mediaType === 'video' ? (
                <video
                  src={mediaDataUrl}
                  controls
                  playsInline
                  className="w-full h-auto max-h-72 object-contain"
                />
              ) : (
                <img
                  src={mediaDataUrl}
                  alt="Spark preview"
                  className="w-full h-auto max-h-72 object-contain"
                />
              )}

              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[11px] font-bold text-[#0F172A] flex items-center gap-1.5 shadow-xs">
                <Flame size={12} className="text-[#3B82F6]" />
                <span>
                  {mediaType === 'video'
                    ? `Video (${formatSparkDuration(videoMeta?.durationSeconds)})`
                    : 'Photo Moment'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleClearMedia}
                disabled={isUploading}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/90 hover:bg-rose-600 text-[#0F172A] hover:text-white transition shadow-xs"
                title="Change media"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Legendary Moment Preset Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
              <Trophy size={13} className="text-[#10B981]" />
              <span>Select Moment Vibe / Badge:</span>
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              {LEGENDARY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setSelectedTag(tag);
                    setCustomTag('');
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition ${
                    selectedTag === tag && !customTag
                      ? 'bg-[#3B82F6] text-white shadow-xs scale-102'
                      : 'bg-[#F8FAFC] border border-slate-200 text-slate-700 hover:bg-blue-50'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Or write a custom legendary title (e.g. 50-Bomb Victory, Sunset in Zanzibar)..."
              maxLength={60}
              className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            />
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#0F172A]">
              Moment Caption (Optional):
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What made this moment legendary? Add your thoughts..."
              rows={2}
              maxLength={500}
              className="w-full p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] resize-none"
            />
          </div>

          {/* Attach Soundtrack (Online Song) */}
          <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-blue-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white flex items-center justify-center shrink-0">
                <Music size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6] block">
                  Spark Soundtrack
                </span>
                {attachedSong ? (
                  <p className="text-xs font-bold text-[#0F172A] truncate">
                    {attachedSong.trackName} - {attachedSong.artistName}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 truncate">
                    Add online background music to your Spark
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {attachedSong ? (
                <button
                  type="button"
                  onClick={() => setAttachedSong(null)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                  title="Remove song"
                >
                  <X size={15} />
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setIsSongSelectorOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1 transition"
              >
                {attachedSong ? 'Change Song' : 'Pick Online Song'}
              </button>
            </div>
          </div>

          {/* Live Cloudinary Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5 p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                <span className="flex items-center gap-1.5">
                  <Flame size={14} className="animate-bounce text-[#3B82F6]" />
                  <span>{uploadStatusText || 'Uploading Spark to Cloudinary...'}</span>
                </span>
                <span className="font-mono tabular-numbers">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] transition-all duration-200 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-[#F8FAFC] border border-slate-200 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isUploading || !mediaDataUrl}
              className="px-6 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95 transition disabled:opacity-40"
            >
              <Flame size={16} />
              <span>{isUploading ? 'Uploading Spark...' : 'Publish 24h Spark 🔥'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Online Song Selector Modal */}
      <SongSelectorModal
        isOpen={isSongSelectorOpen}
        onClose={() => setIsSongSelectorOpen(false)}
        onSelectSong={(song) => setAttachedSong(song)}
        selectedSongId={attachedSong?.trackId}
      />
    </div>
  );
};
