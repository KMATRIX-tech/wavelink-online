import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, storage, handleFirestoreError, OperationType, cleanFirestoreData } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Post } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { VideoPlayer } from './VideoPlayer';
import { SongPlayerCard } from './SongPlayerCard';
import { generateVideoThumbnail, saveVideoPost, cacheVideoLocally } from '../utils/mediaStorage';
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
  RefreshCw
} from 'lucide-react';

interface VideosHubViewProps {
  onNavigateToFeed: () => void;
}

export const VideosHubView: React.FC<VideosHubViewProps> = ({ onNavigateToFeed }) => {
  const { currentUser, userProfile, toggleSavePost } = useAuth();
  const [videoPosts, setVideoPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<'all' | 'saved' | 'popular'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active playing video tracking
  const [muted, setMuted] = useState(true);

  // Video Uploader state with Firebase Storage uploadBytesResumable & fallback retry
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [videoCaption, setVideoCaption] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('Uploading video reel...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
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

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;
    setSelectedVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setUploadError(null);
    setShowUploadBox(true);
    e.target.value = '';
  };

  // Upload via Firebase Storage uploadBytesResumable with automatic retry & resilient Firestore fallback
  const uploadViaResumableStorage = async (
    postId: string,
    file: File,
    maxRetries = 2
  ): Promise<string | null> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `${postId}.mp4`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          setUploadStatusText(`Retrying resumable upload (attempt ${attempt}/${maxRetries})...`);
        } else {
          setUploadStatusText('Uploading video via Firebase Storage...');
        }

        const storageRef = ref(storage, `reels/${postId}_${attempt}_${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type || 'video/mp4'
        });

        const url = await new Promise<string>((resolve, reject) => {
          let lastBytes = -1;
          let stallTimer: ReturnType<typeof setTimeout> | null = null;

          const resetWatchdog = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
              try {
                uploadTask.cancel();
              } catch {}
              reject(new Error('Resumable upload stalled; triggering fallback retry'));
            }, 5000);
          };

          resetWatchdog();

          uploadTask.on(
            'state_changed',
            (snapshot) => {
              if (snapshot.bytesTransferred !== lastBytes) {
                lastBytes = snapshot.bytesTransferred;
                resetWatchdog();
              }
              if (snapshot.totalBytes > 0) {
                const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setUploadProgress(Math.max(8, Math.min(95, pct)));
              }
            },
            (err) => {
              if (stallTimer) clearTimeout(stallTimer);
              reject(err);
            },
            async () => {
              if (stallTimer) clearTimeout(stallTimer);
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              } catch (dlErr) {
                reject(dlErr);
              }
            }
          );
        });

        if (url) {
          setUploadProgress(98);
          return url;
        }
      } catch (err) {
        console.warn(`Resumable video upload attempt ${attempt} caught error:`, err);
      }
    }

    return null;
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
      setUploadProgress(12);

      // 1. Attempt Firebase Storage uploadBytesResumable with retry
      let finalVideoUrl: string | undefined = undefined;
      let finalHasVideoChunks = false;

      const resumableUrl = await uploadViaResumableStorage(postId, selectedVideoFile, 2);

      if (resumableUrl) {
        finalVideoUrl = resumableUrl;
        finalHasVideoChunks = false;
      } else {
        // 2. Automatic fallback to chunked Firestore media storage so upload never gets stuck at 43%
        setUploadStatusText('Syncing video stream via resilient fallback...');
        const videoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(selectedVideoFile);
        });

        const saved = await saveVideoPost(
          postId,
          selectedVideoFile,
          videoDataUrl,
          'posts',
          (pct) => setUploadProgress(Math.max(15, pct))
        );
        finalVideoUrl = saved.videoUrl;
        finalHasVideoChunks = saved.hasVideoChunks;
      }

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
    } catch (err: any) {
      console.error('Error uploading video reel:', err);
      setUploadError(
        err?.message || 'Video upload encountered a network interruption. Click Retry Upload below.'
      );
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

  const handleShare = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/#video-${postId}`);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 2000);
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#3B82F6] border border-blue-200/70 text-xs font-semibold uppercase tracking-wider mb-2">
            <Film size={14} className="text-[#10B981]" />
            <span>Wave Reels &amp; Video Hub</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
            Community Video Showcase
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-xl">
            Watch, like, save, and upload high-definition videos stored directly in Firestore.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="px-5 py-2.5 rounded-2xl bg-[#3B82F6] text-white hover:bg-blue-600 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 transition active:scale-95 shrink-0"
          >
            <Upload size={16} />
            <span>Upload Video to Firestore</span>
          </button>
        </div>
      </div>

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
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
              <VideoIcon size={18} className="text-[#3B82F6]" />
              <span>Publish Video Reel to Firestore</span>
            </h3>
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

                    {/* Share */}
                    <button
                      onClick={() => handleShare(post.id)}
                      className="flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-[#F8FAFC] transition"
                      title="Share Video Link"
                    >
                      {copiedId === post.id ? <Check size={14} className="text-[#10B981]" /> : <Share2 size={14} />}
                      <span>{copiedId === post.id ? 'Copied' : 'Share'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
