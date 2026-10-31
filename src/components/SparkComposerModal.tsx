import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { OnlineSong } from '../types';
import { saveVideoPost, compressImage, generateVideoThumbnail } from '../utils/mediaStorage';
import { SongSelectorModal } from './SongSelectorModal';
import {
  Flame,
  Zap,
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  X,
  Upload,
  Clock,
  Sparkles,
  Trophy,
  Check,
  Disc
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
  const { currentUser, userProfile } = useAuth();

  const [mediaDataUrl, setMediaDataUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTag, setSelectedTag] = useState(LEGENDARY_TAGS[0]);
  const [customTag, setCustomTag] = useState('');
  const [caption, setCaption] = useState('');

  // Attached online song
  const [attachedSong, setAttachedSong] = useState<OnlineSong | null>(null);
  const [isSongSelectorOpen, setIsSongSelectorOpen] = useState(false);

  // Uploading state & real-time progress percentage
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      console.warn('Please select an image or video file from your phone/device.');
      return;
    }

    setSelectedFile(file);
    setMediaType(isVideo ? 'video' : 'image');

    if (isImage) {
      // Automatically compress image client-side to ensure it safely fits well within Firestore limits
      const compressed = await compressImage(file, 1280, 1280, 0.78);
      setMediaDataUrl(compressed);
    } else {
      // For video preview, use object URL for instant zero-latency preview
      const previewUrl = URL.createObjectURL(file);
      setMediaDataUrl(previewUrl);
    }
  };

  const handleClearMedia = () => {
    setMediaDataUrl('');
    setMediaType('none');
    setSelectedFile(null);
  };

  const handleCreateSpark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !mediaDataUrl) {
      console.warn('Please select a photo or video for your legendary Spark moment.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const sparkId = `spark_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      // Strictly 24 hours lifetime
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const finalTag = customTag.trim() || selectedTag;

      const sparkPayload: Record<string, any> = {
        id: sparkId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${currentUser.email?.split('@')[0] || 'waver'}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        legendaryTag: finalTag,
        caption: caption.trim(),
        mediaType: mediaType,
        likes: [],
        likesCount: 0,
        createdAt: now.toISOString(),
        expiresAt: expiresAt
      };

      if (attachedSong) {
        sparkPayload.songTitle = attachedSong.trackName;
        sparkPayload.songArtist = attachedSong.artistName;
        sparkPayload.songAlbumArt = attachedSong.artworkUrl100;
        sparkPayload.songPreviewUrl = attachedSong.previewUrl;
      }

      if (mediaType === 'image') {
        let finalImageUrl = mediaDataUrl;
        // Strict volumetric constraint: compress image if needed
        if (selectedFile && (!finalImageUrl || finalImageUrl.length > 600 * 1024)) {
          finalImageUrl = await compressImage(selectedFile, 1280, 1280, 0.75);
        }
        sparkPayload.mediaUrl = finalImageUrl;
        setUploadProgress(80);
      } else if (mediaType === 'video' && selectedFile) {
        sparkPayload.videoFileName = selectedFile.name;

        // Generate lightweight video poster thumbnail (~20KB)
        const thumbnail = await generateVideoThumbnail(selectedFile);

        // Convert video to data URL for chunking
        const videoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(selectedFile);
        });

        // Fast concurrent chunk upload with live progress reporting
        const { videoUrl: directUrl, hasVideoChunks } = await saveVideoPost(
          sparkId,
          selectedFile,
          videoDataUrl,
          'sparks',
          (pct) => setUploadProgress(pct)
        );

        // If video fits in root (<650KB) use directUrl; otherwise use thumbnail and chunk flags
        sparkPayload.mediaUrl = directUrl || thumbnail || '';
        sparkPayload.hasVideoChunks = hasVideoChunks;
      }

      await setDoc(doc(db, 'sparks', sparkId), cleanFirestoreData(sparkPayload));
      setUploadProgress(100);

      if (onSparkCreated) onSparkCreated();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sparks');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={onClose} />

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
            <span>Sparks vanish automatically after 24 hours. Perfect for your greatest moments, clutch plays, and daily highlights!</span>
          </p>
        </div>

        <form onSubmit={handleCreateSpark} className="p-5 sm:p-6 space-y-4">
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
                Choose a high-energy photo or video clip from your device gallery or camera.
              </p>

              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Standard File Picker */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
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

                {/* Mobile Camera Direct Capture */}
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
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
                  className="w-full h-auto max-h-72 object-contain"
                />
              ) : (
                <img
                  src={mediaDataUrl}
                  alt="Spark preview"
                  className="w-full h-auto max-h-72 object-contain"
                />
              )}

              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[11px] font-bold text-[#0F172A] flex items-center gap-1 shadow-xs">
                <Flame size={12} className="text-[#3B82F6]" />
                <span>{mediaType === 'video' ? 'Video Moment' : 'Photo Moment'}</span>
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
              placeholder="Or write a custom legendary title (e.g. 50-Bomb Victory, Sunset in Santorini)..."
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

          {/* Fast Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5 p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                <span className="flex items-center gap-1.5">
                  <Flame size={14} className="animate-bounce text-[#3B82F6]" />
                  <span>Posting Spark Fast Upload...</span>
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
              <span>{isUploading ? 'Igniting Spark...' : 'Publish 24h Spark 🔥'}</span>
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
