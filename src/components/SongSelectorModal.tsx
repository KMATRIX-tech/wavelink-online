import React, { useState, useEffect, useRef, useMemo } from 'react';
import { OnlineSong } from '../types';
import { getHydratedRoyaltyFreeTracks, RoyaltyFreeTrack } from '../utils/creatorStudioAudio';
import {
  Search,
  Music,
  Play,
  Pause,
  X,
  Volume2,
  Check,
  Disc,
  Upload,
  Scissors,
  ShieldCheck,
} from 'lucide-react';

interface SongSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: OnlineSong) => void;
  selectedSongId?: string | number;
}

const GENRE_FILTERS = [
  'All',
  'Afro-Fusion',
  'Lo-Fi Beats',
  'Comedy Skit',
  'Indie Pop',
  'Acoustic Groove',
  'Cinematic',
  'Synthwave',
  'Tropical',
];

export const SongSelectorModal: React.FC<SongSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSong,
  selectedSongId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [tracks, setTracks] = useState<RoyaltyFreeTrack[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Selected/previewed song customization (start point + volume + live preview)
  const [activeTrack, setActiveTrack] = useState<OnlineSong | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | number | null>(null);
  const [clipStartTime, setClipStartTime] = useState<number>(0);
  const [clipVolume, setClipVolume] = useState<number>(85);
  const [trackDuration, setTrackDuration] = useState<number>(20);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTracks(getHydratedRoyaltyFreeTracks());
      setError(null);
    } else {
      stopAudio();
    }
    return () => {
      stopAudio();
    };
  }, [isOpen]);

  const filteredTracks = useMemo(() => {
    return tracks.filter((track) => {
      const matchesGenre =
        selectedGenre === 'All' ||
        track.genre.toLowerCase() === selectedGenre.toLowerCase() ||
        track.isCustomUpload;
      const q = searchTerm.trim().toLowerCase();
      if (!q) return matchesGenre;
      return (
        matchesGenre &&
        (track.trackName.toLowerCase().includes(q) ||
          track.artistName.toLowerCase().includes(q) ||
          track.genre.toLowerCase().includes(q) ||
          track.mood.toLowerCase().includes(q))
      );
    });
  }, [tracks, selectedGenre, searchTerm]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlayingTrackId(null);
  };

  const playPreview = (song: OnlineSong, startSec = clipStartTime, vol = clipVolume) => {
    if (!song.previewUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    if (audio.src !== song.previewUrl) {
      audio.src = song.previewUrl;
    }
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, vol / 100));

    audio.onloadedmetadata = () => {
      const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 20;
      setTrackDuration(dur);
      if (startSec > 0 && startSec < dur) {
        audio.currentTime = startSec;
      }
    };

    try {
      if (audio.readyState >= 1 && startSec < (audio.duration || 20)) {
        audio.currentTime = startSec;
      }
    } catch {
      // ignore
    }

    audio
      .play()
      .then(() => {
        setPlayingTrackId(song.trackId);
      })
      .catch(() => {
        setPlayingTrackId(null);
      });

    audio.onended = () => {
      setPlayingTrackId(null);
    };
  };

  const handleTogglePlay = (song: OnlineSong) => {
    setActiveTrack(song);
    if (playingTrackId === song.trackId) {
      stopAudio();
      return;
    }
    const nextStart = song.startTime ?? 0;
    const nextVol = song.volume ?? 85;
    setClipStartTime(nextStart);
    setClipVolume(nextVol);
    playPreview(song, nextStart, nextVol);
  };

  const handleStartPointChange = (newStart: number) => {
    setClipStartTime(newStart);
    if (audioRef.current && activeTrack && playingTrackId === activeTrack.trackId) {
      try {
        audioRef.current.currentTime = newStart;
      } catch {
        // ignore
      }
    } else if (activeTrack) {
      playPreview(activeTrack, newStart, clipVolume);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setClipVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, newVol / 100));
    }
  };

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 20 * 1024 * 1024) {
      setError('Audio file must be under 20 MB.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const customSong: RoyaltyFreeTrack = {
      trackId: `upload_${Date.now()}`,
      trackName: cleanName || 'Original Recording',
      artistName: 'Your Original Audio (Royalty-Free)',
      artworkUrl100: '',
      previewUrl: objectUrl,
      collectionName: 'Creator Original Upload',
      primaryGenreName: 'Original',
      startTime: 0,
      volume: clipVolume,
      isCustomUpload: true,
      bpm: 110,
      mood: 'Original',
      genre: 'Original',
      license: 'Royalty-Free (WaveLink Studio Original)',
    };

    setTracks((prev) => [customSong, ...prev]);
    setActiveTrack(customSong);
    setClipStartTime(0);
    playPreview(customSong, 0, clipVolume);
  };

  const handleConfirmTrack = (song: OnlineSong) => {
    stopAudio();
    onSelectSong({
      ...song,
      startTime: activeTrack?.trackId === song.trackId ? clipStartTime : song.startTime ?? 0,
      volume: activeTrack?.trackId === song.trackId ? clipVolume : song.volume ?? 85,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs"
        onClick={() => {
          stopAudio();
          onClose();
        }}
      />

      <div className="relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl border border-[#EFECE6] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] z-10">
        {/* Compact Header */}
        <div className="px-4 py-3.5 border-b border-[#EFECE6] flex items-center justify-between bg-[#FAF7F2]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center">
              <Music size={17} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#1C1917] leading-tight">
                Royalty-Free Music & Sounds
              </h3>
              <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck size={12} /> 100% Copyright-Safe Studio Library
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={uploadInputRef}
              type="file"
              accept="audio/*"
              onChange={handleCustomAudioUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Upload size={14} className="text-[#2563EB]" />
              <span>Own Sound</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopAudio();
                onClose();
              }}
              className="min-w-[44px] min-h-[44px] rounded-xl text-[#57534E] hover:text-[#1C1917] hover:bg-stone-100 flex items-center justify-center transition cursor-pointer"
              aria-label="Close music picker"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search + Genre Filters */}
        <div className="p-3.5 border-b border-[#EFECE6] space-y-2.5 bg-[#FAF7F2]/60">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3.5 text-[#57534E] pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter royalty-free tracks by mood, beat, or genre..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-2xl bg-white border border-[#EFECE6] text-base sm:text-sm text-[#1C1917] placeholder-[#78716C] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {GENRE_FILTERS.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition cursor-pointer ${
                  selectedGenre === genre
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917]'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {/* Live Trim Start Point & Volume Bar for Active Track */}
        {activeTrack && (
          <div className="px-4 py-3 bg-[#EEF2FF]/70 border-b border-blue-200/70 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Disc
                  size={15}
                  className={`text-[#2563EB] shrink-0 ${
                    playingTrackId === activeTrack.trackId ? 'animate-spin' : ''
                  }`}
                />
                <span className="text-xs font-extrabold text-[#1C1917] truncate">
                  {activeTrack.trackName} · {activeTrack.artistName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleConfirmTrack(activeTrack)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Check size={14} />
                <span>Use Track</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#57534E]">
                  <span className="flex items-center gap-1">
                    <Scissors size={12} className="text-[#2563EB]" />
                    <span>Trim Section Start</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    0:{Math.floor(clipStartTime).toString().padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(5, Math.floor(trackDuration) - 3)}
                  step={1}
                  value={clipStartTime}
                  onChange={(e) => handleStartPointChange(Number(e.target.value))}
                  className="w-full accent-[#2563EB]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#57534E]">
                  <span className="flex items-center gap-1">
                    <Volume2 size={12} className="text-[#0D9488]" />
                    <span>Music Volume</span>
                  </span>
                  <span className="font-mono tabular-nums">{clipVolume}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={clipVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Royalty-Free Track List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2 bg-white">
          {filteredTracks.map((song) => {
            const isPlaying = playingTrackId === song.trackId;
            const isSelected =
              selectedSongId === song.trackId || activeTrack?.trackId === song.trackId;

            return (
              <div
                key={song.trackId}
                onClick={() => handleTogglePlay(song)}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-[#EEF2FF] border-[#2563EB]'
                    : 'bg-[#FAF7F2] border-[#EFECE6] hover:border-[#2563EB]/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-stone-200 flex items-center justify-center">
                    {song.artworkUrl100 ? (
                      <img
                        src={song.artworkUrl100}
                        alt={song.trackName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-[#2563EB] to-[#0D9488] flex items-center justify-center text-white">
                        <Music size={18} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center text-white">
                      {isPlaying ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} className="fill-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs sm:text-sm font-bold text-[#1C1917] truncate">
                        {song.trackName}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                        Royalty-Free
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] truncate">
                      {song.genre} · {song.mood} · {song.bpm} BPM
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmTrack(song);
                  }}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white font-bold text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition cursor-pointer"
                >
                  <Check size={14} />
                  <span>Add</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
