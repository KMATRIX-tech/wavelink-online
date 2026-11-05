import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { Post } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { VideoPlayer } from './VideoPlayer';
import { SongPlayerCard } from './SongPlayerCard';
import {
  generateVideoThumbnail,
  saveVideoPost,
  cacheVideoLocally,
  cloneVideoFileToMemory,
  validateVideoFileSize,
  formatVideoFileSize,
  FREE_MAX_VIDEO_MB,
  PRO_MAX_VIDEO_MB
} from '../utils/mediaStorage';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import {
  Film,
  Heart,
  Bookmark,
  Share2,
  Volume2,
  VolumeX,
  Upload,
  Check,
  Video as VideoIcon,
  X,
  CheckCircle2,
  Send,
  AlertCircle,
  RefreshCw,
  Download
} from 'lucide-react';
import { downloadPost, sharePost } from '../utils/share';

interface VideosHubViewProps {
  onNavigateToFeed: () => void;
}

export const VideosHubView: React.FC<VideosHubViewProps> = ({ onNavigateToFeed }) => {
  const { currentUser, userProfile, isAdmin, isProEffective, toggleSavePost } = useAuth();
  const isProTier = Boolean(isProEffective || isAdmin);
  const [videoPosts, setVideoPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<'all' | 'saved' | 'popular'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active playing video tracking
  const [muted, setMuted] = useState(true);

  // Video Uploader state
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [videoCaption, setVideoCaption] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('Uploading video reel...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [sizeLimitWarning, setSizeLimitWarning] = useState<{
    message: string;
    canUpgrade: boolean;
  } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Real-time listener for posts that have videoUrl or mediaType === 'video'
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Post[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.videoUrl || data.hasVideoChunks || data.mediaType === 'video') {
            list.push({ ...data, id: d.id } as Post);
          }
        });
        setVideoPosts(list);
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      }
    );

    return () => unsub();
  }, []);

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile || !rawFile.type.startsWith('video/')) return;

    // Validate tiered video size: Free = 0 KB to 4 MB, Pro = 0 KB to 100 MB (allows >10 MB)
    const validation = validateVideoFileSize(rawFile, isProTier);
    if (!validation.valid) {
      e.target.value = '';
      setSizeLimitWarning({
        message: validation.error || 'Video exceeds your plan upload limit.',
        canUpgrade: Boolean(validation.requiresProUpgrade)
      });
      return;
    }

    setSizeLimitWarning(null);
    // Clone file into memory BEFORE clearing input so mobile/desktop browsers never invalidate the file handle
    const safeFile = await cloneVideoFileToMemory(rawFile);
    e.target.value = '';
    setSelectedVideoFile(safeFile);
    setVideoPreviewUrl(URL.createObjectURL(safeFile));
    setUploadError(null);
    setShowUploadBox(true);
  };

  const handlePublishVideoToFirestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !selectedVideoFile) return;

    setIsUploadingVideo(true);
    setUploadProgress(5);
    setUploadError(null);
    setUploadNotice(null);
    setUploadStatusText('Preparing video & generating thumbnail...');

    try {
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'waver';

      // Cache locally immediately so playback is always instant
      await cacheVideoLocally(postId, selectedVideoFile);
      const thumb = await generateVideoThumbnail(selectedVideoFile);
      setUploadProgress(15);

      setUploadStatusText('Uploading & syncing video stream...');
      const saved = await saveVideoPost(
        postId,
        selectedVideoFile,
        undefined,
        'posts',
        (pct) => setUploadProgress(Math.max(15, pct))
      );

      const finalVideoUrl = saved.videoUrl;
      const finalHasVideoChunks = saved.hasVideoChunks;

      setUploadStatusText('Finalizing reel post...');
      setUploadProgress(98);

      const newPost: Partial<Post> = {
        id: postId,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Waver',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        content: videoCaption.trim() || `Shared a new video reel: ${selectedVideoFile.name}`,
        imageUrl: thumb || undefined,
        thumbnailUrl: thumb || undefined,
        videoUrl: finalVideoUrl,
        hasVideoChunks: finalHasVideoChunks,
        videoFileName: selectedVideoFile.name,
        mediaType: 'video',
        likes: [],
        likesCount: 0,
        reactions: { like: [], heart: [], fire: [] },
        reactionCounts: { like: 0, heart: 0, fire: 0 },
        commentsCount: 0,
        createdAt: new Date().toISOString()
      };

      const writePostPromise = setDoc(doc(db, 'posts', postId), cleanFirestoreData(newPost));
      const writeTimeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
      await Promise.race([writePostPromise, writeTimeout]);

      setUploadProgress(100);
      setSelectedVideoFile(null);
      setVideoPreviewUrl(null);
      setVideoCaption('');
      setShowUploadBox(false);
      setUploadNotice('Video reel uploaded & published successfully!');
      setTimeout(() => setUploadNotice(null), 4000);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Video upload encountered a temporary interruption. Please click Retry Upload.';
      console.warn('Video reel upload notice:', errMsg);
      setUploadError(errMsg);
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!currentUser) return;
    const isLiked = post.likes?.includes(currentUser.uid);
    const updatedLikes = isLiked
      ? (post.likes || []).filter((id) => id !== currentUser.uid)
      : [...(post.likes || []), currentUser.uid];

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: updatedLikes,
        likesCount: updatedLikes.length
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleToggleSave = async (postId: string) => {
    await toggleSavePost(postId);
  };

  const handleDownload = async (post: Post) => {
    try {
      const res = await downloadPost(post);
      setActionToast({ type: 'success', text: res?.message || 'Downloaded!' });
      setTimeout(() => setActionToast(null), 2800);
    } catch {
      setActionToast({ type: 'error', text: "Couldn't download" });
      setTimeout(() => setActionToast(null), 2800);
    }
  };

  const handleShare = async (post: Post) => {
    try {
      const res = await sharePost(post);
      setCopiedId(post.id);
      setActionToast({ type: 'success', text: res?.message || 'Shared!' });
      setTimeout(() => {
        setCopiedId(null);
        setActionToast(null);
      }, 2500);
    } catch {
      setActionToast({ type: 'error', text: "Couldn't share post" });
      setTimeout(() => setActionToast(null), 2800);
    }
  };

  const filteredPosts = videoPosts.filter((post) => {
    if (filter === 'saved') {
      return (userProfile?.savedPostIds || []).includes(post.id);
    }
    if (filter === 'popular') {
      return (post.likesCount || 0) > 0;
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        onChange={handleVideoFileChange}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 text-[#0F172A] shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#3B82F6] border border-blue-200/70 text-xs font-semibold uppercase tracking-wider">
              <Film size={14} className="text-[#10B981]" />
              <span>Wave Reels &amp; Video Hub</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-xs font-bold">
              {isProTier
                ? `Pro Limit: Up to ${PRO_MAX_VIDEO_MB} MB`
                : `Free Limit: 0 KB – ${FREE_MAX_VIDEO_MB} MB • Pro: ${PRO_MAX_VIDEO_MB} MB`}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
            Community Video Showcase
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-xl">
            {isProTier
              ? `Upload high-definition videos over 10 MB up to ${PRO_MAX_VIDEO_MB} MB with WaveLink Pro.`
              : `Upload videos from 0 KB to ${FREE_MAX_VIDEO_MB} MB on Free, or upgrade to WaveLink Pro for videos up to ${PRO_MAX_VIDEO_MB} MB.`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#F43F5E] text-white hover:bg-[#E11D48] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-rose-500/20 transition active:scale-95 shrink-0"
          >
            <Upload size={16} />
            <span>Create a Reel ({isProTier ? `Up to ${PRO_MAX_VIDEO_MB} MB` : `0 KB – ${FREE_MAX_VIDEO_MB} MB`})</span>
          </button>
        </div>
      </div>

      {sizeLimitWarning && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-amber-600 shrink-0" />
            <span className="font-semibold">{sizeLimitWarning.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {sizeLimitWarning.canUpgrade && !isProTier && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-extrabold text-xs transition"
              >
                Try Pro (100 MB Videos)
              </button>
            )}
            <button
              type="button"
              onClick={() => setSizeLimitWarning(null)}
              className="p-1.5 rounded-xl text-amber-700 hover:bg-amber-100"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {uploadNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#10B981]" />
            <span>{uploadNotice}</span>
          </div>
          <button onClick={() => setUploadNotice(null)} className="text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Direct Video Upload Drawer */}
      {showUploadBox && selectedVideoFile && (
        <form
          onSubmit={handlePublishVideoToFirestore}
          className="bg-white border border-blue-200 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
                <VideoIcon size={18} className="text-[#3B82F6]" />
                <span>Publish Video Reel</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200 text-xs font-bold">
                {formatVideoFileSize(selectedVideoFile.size)} / {isProTier ? `${PRO_MAX_VIDEO_MB} MB Max` : `${FREE_MAX_VIDEO_MB} MB Max`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowUploadBox(false);
                setSelectedVideoFile(null);
                setVideoPreviewUrl(null);
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>

          {videoPreviewUrl && (
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 max-h-72">
              <video src={videoPreviewUrl} controls className="w-full max-h-72 object-contain" />
            </div>
          )}

          <input
            type="text"
            value={videoCaption}
            onChange={(e) => setVideoCaption(e.target.value)}
            placeholder="Write a caption for your video reel..."
            className="w-full px-4 py-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#3B82F6]"
          />

          {isUploadingVideo && (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                <span>{uploadStatusText}</span>
                <span className="font-mono text-[#2563eb] font-black">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#2563eb] to-[#10B981] transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                <AlertCircle size={16} className="shrink-0 text-rose-600" />
                <span>{uploadError}</span>
              </div>
              <button
                type="button"
                onClick={() => handlePublishVideoToFirestore()}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw size={13} />
                <span>Retry Upload</span>
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowUploadBox(false);
                setSelectedVideoFile(null);
                setVideoPreviewUrl(null);
                setUploadError(null);
              }}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploadingVideo}
              className="px-6 py-2.5 rounded-2xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Send size={14} />
              <span>{isUploadingVideo ? `Uploading (${uploadProgress}%)...` : 'Publish Reel'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-2xl bg-white border border-slate-200/90 p-1 text-xs font-semibold shadow-2xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl transition ${
              filter === 'all'
                ? 'bg-[#3B82F6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            All Videos ({videoPosts.length})
          </button>

          <button
            onClick={() => setFilter('popular')}
            className={`px-4 py-2 rounded-xl transition ${
              filter === 'popular'
                ? 'bg-[#3B82F6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Trending &amp; Liked
          </button>

          <button
            onClick={() => setFilter('saved')}
            className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
              filter === 'saved'
                ? 'bg-[#3B82F6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            <Bookmark size={13} />
            <span>Saved Videos ({userProfile?.savedPostIds?.length || 0})</span>
          </button>
        </div>

        <button
          onClick={() => setMuted(!muted)}
          className="px-3.5 py-2 rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-[#0F172A] flex items-center gap-2 shadow-2xs hover:border-blue-300 transition"
        >
          {muted ? <VolumeX size={15} className="text-slate-400" /> : <Volume2 size={15} className="text-[#10B981]" />}
          <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
        </button>
      </div>

      {/* Video Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400 text-xs">
          <div className="w-8 h-8 border-3 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading community video hub...
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-20 px-6 bg-white border border-slate-200/90 rounded-3xl shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)]">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#3B82F6] mx-auto flex items-center justify-center mb-4 ring-8 ring-blue-50/50">
            <VideoIcon size={32} />
          </div>
          <h3 className="text-lg font-bold text-[#0F172A] mb-1">
            {filter === 'saved' ? 'No Saved Videos Yet' : 'No Videos Shared Yet'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
            {filter === 'saved'
              ? 'Bookmark any video from the hub to save it here for quick playback.'
              : 'Be the first member to upload a video clip directly to Firestore!'}
          </p>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="px-6 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-semibold text-xs sm:text-sm shadow-sm shadow-blue-500/20 transition active:scale-95"
          >
            Upload a Video Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => {
            const isLiked = post.likes?.includes(currentUser?.uid || '');
            const isSaved = (userProfile?.savedPostIds || []).includes(post.id);

            return (
              <div
                key={post.id}
                className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] flex flex-col justify-between transition hover:border-blue-300"
              >
                {/* Video Player Card */}
                <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                  <VideoPlayer
                    postId={post.id}
                    videoUrl={post.videoUrl}
                    hasVideoChunks={post.hasVideoChunks}
                    thumbnailUrl={post.thumbnailUrl || post.imageUrl}
                    defaultMuted={muted}
                    autoPlayOnVisible={true}
                  />

                  {/* Top Floating Badge */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[10px] font-bold text-[#0F172A] flex items-center gap-1 pointer-events-none z-10 shadow-xs">
                    <Film size={11} className="text-[#3B82F6]" />
                    <span>Wave Reel</span>
                  </div>
                </div>

                {/* Video Details */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {/* Author & Timestamp */}
                    <div className="flex items-center gap-2.5 mb-2">
                      <img
                        src={post.authorPhotoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${post.authorId}`}
                        alt={post.authorName}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-blue-500/20"
                      />
                      <div className="min-w-0">
                        <CrystalBadge email={post.authorEmail} name={post.authorName} size="sm" />
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {post.authorUsername || '@waver'} · {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Attached Online Soundtrack */}
                    {post.songPreviewUrl && post.songTitle && (
                      <div className="mb-2">
                        <SongPlayerCard
                          title={post.songTitle}
                          artist={post.songArtist || ''}
                          albumArt={post.songAlbumArt}
                          previewUrl={post.songPreviewUrl}
                          albumName={post.songAlbumName}
                          compact
                        />
                      </div>
                    )}

                    {/* Caption */}
                    <p className="text-xs text-[#0F172A] line-clamp-2 leading-relaxed">
                      {post.content}
                    </p>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      {/* Like */}
                      <button
                        onClick={() => handleToggleLike(post)}
                        className={`flex items-center gap-1 py-1 px-2.5 rounded-xl transition active:scale-95 ${
                          isLiked ? 'text-rose-600 font-bold bg-rose-50' : 'hover:bg-[#F8FAFC]'
                        }`}
                        title="Like Video"
                      >
                        <Heart size={15} className={isLiked ? 'fill-rose-600' : ''} />
                        <span className="font-mono tabular-numbers">{post.likesCount || 0}</span>
                      </button>

                      {/* Save */}
                      <button
                        onClick={() => handleToggleSave(post.id)}
                        className={`flex items-center gap-1 py-1 px-2.5 rounded-xl transition active:scale-95 ${
                          isSaved ? 'text-[#3B82F6] font-bold bg-blue-50' : 'hover:bg-[#F8FAFC]'
                        }`}
                        title={isSaved ? 'Remove from Saved' : 'Save Video'}
                      >
                        <Bookmark size={15} className={isSaved ? 'fill-[#3B82F6]' : ''} />
                        <span className="font-mono tabular-numbers">{post.savesCount || 0}</span>
                      </button>
                    </div>

                    {/* Download & Share */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownload(post)}
                        className="flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-[#F8FAFC] transition"
                        title="Download Post"
                      >
                        <Download size={14} />
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShare(post)}
                        className="flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-[#F8FAFC] transition"
                        title="Share Video via Web Share or WhatsApp"
                      >
                        {copiedId === post.id ? <Check size={14} className="text-[#10B981]" /> : <Share2 size={14} />}
                        <span>{copiedId === post.id ? 'Shared' : 'Share'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 md:bottom-6 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold transition-all ${
            actionToast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {actionToast.type === 'success' ? (
            <Check size={14} className="shrink-0" />
          ) : (
            <X size={14} className="shrink-0" />
          )}
          <span>{actionToast.text}</span>
        </div>
      )}

      {isPaymentModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            setSizeLimitWarning(null);
          }}
        />
      )}
    </div>
  );
};
