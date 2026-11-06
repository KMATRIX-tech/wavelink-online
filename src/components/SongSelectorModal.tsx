import React, { useState, useEffect, useRef } from 'react';
import { OnlineSong } from '../types';
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
  RotateCcw,
} from 'lucide-react';

interface SongSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: OnlineSong) => void;
  selectedSongId?: string | number;
}

const GENRE_SHORTCUTS = [
  { label: 'Top Hits', query: 'Top Hits 2026' },
  { label: 'Afrobeat', query: 'Burna Boy Wizkid Tems' },
  { label: 'Hip-Hop', query: 'Drake Kendrick Metro Boomin' },
  { label: 'Pop', query: 'Dua Lipa Taylor Swift Sabrina' },
  { label: 'Electronic', query: 'Calvin Harris Fred again' },
  { label: 'Chill', query: 'Lofi Chill Beats' },
  { label: 'R&B', query: 'SZA Frank Ocean' },
];

export const SongSelectorModal: React.FC<SongSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSong,
  selectedSongId,
}) => {
  const [searchTerm, setSearchTerm] = useState('Top Hits 2026');
  const [songs, setSongs] = useState<OnlineSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected/previewed song customization (start point + volume + live preview)
  const [activeTrack, setActiveTrack] = useState<OnlineSong | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | number | null>(null);
  const [clipStartTime, setClipStartTime] = useState<number>(0);
  const [clipVolume, setClipVolume] = useState<number>(85);
  const [trackDuration, setTrackDuration] = useState<number>(30);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleSearch(searchTerm || 'Top Hits 2026');
    } else {
      stopAudio();
    }
    return () => {
      stopAudio();
    };
  }, [isOpen]);

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
    audio.volume = Math.max(0, Math.min(1, vol / 100));

    audio.onloadedmetadata = () => {
      const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 30;
      setTrackDuration(dur);
      if (startSec > 0 && startSec < dur) {
        audio.currentTime = startSec;
      }
    };

    try {
      if (audio.readyState >= 1 && startSec < (audio.duration || 30)) {
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
    const customSong: OnlineSong = {
      trackId: `upload_${Date.now()}`,
      trackName: cleanName || 'Uploaded Track',
      artistName: 'Original Audio',
      artworkUrl100: '',
      previewUrl: objectUrl,
      collectionName: 'Device Upload',
      primaryGenreName: 'Original',
      startTime: 0,
      volume: clipVolume,
      isCustomUpload: true,
    };

    setSongs((prev) => [customSong, ...prev]);
    setActiveTrack(customSong);
    setClipStartTime(0);
    playPreview(customSong, 0, clipVolume);
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term.trim()
      )}&entity=song&limit=25`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }
      const data = await response.json();

      const formatted: OnlineSong[] = (data.results || [])
        .filter((item: any) => item.previewUrl && item.trackName)
        .map((item: any) => ({
          trackId: item.trackId,
          trackName: item.trackName,
          artistName: item.artistName,
          artworkUrl100: item.artworkUrl100
            ? item.artworkUrl100.replace('100x100bb.jpg', '300x300bb.jpg')
            : item.artworkUrl60 || '',
          previewUrl: item.previewUrl,
          collectionName: item.collectionName || '',
          primaryGenreName: item.primaryGenreName || 'Music',
          startTime: 0,
          volume: 85,
        }));

      setSongs(formatted);
    } catch {
      setError('Could not load tracks. Check your connection.');
    } finally {
      setIsLoading(false);
    }
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
            <h3 className="font-extrabold text-base text-[#1C1917]">Music</h3>
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
              <span>Upload</span>
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

        {/* Search + Genre Shortcuts */}
        <div className="p-3.5 border-b border-[#EFECE6] space-y-2.5 bg-[#FAF7F2]/60">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchTerm);
            }}
            className="relative flex items-center"
          >
            <Search size={16} className="absolute left-3.5 text-[#57534E] pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search songs or artists..."
              className="w-full min-h-[44px] pl-10 pr-20 py-2 rounded-2xl bg-white border border-[#EFECE6] text-base sm:text-sm text-[#1C1917] placeholder-[#78716C] focus:outline-none focus:border-[#2563EB]"
            />
            <button
              type="submit"
              disabled={isLoading || !searchTerm.trim()}
              className="absolute right-1.5 min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs transition disabled:opacity-40 cursor-pointer"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {GENRE_SHORTCUTS.map((genre) => (
              <button
                key={genre.label}
                type="button"
                onClick={() => {
                  setSearchTerm(genre.query);
                  handleSearch(genre.query);
                }}
                className="min-h-[36px] px-3 py-1 rounded-xl bg-white border border-[#EFECE6] hover:border-[#2563EB] text-[#1C1917] font-semibold text-xs whitespace-nowrap transition cursor-pointer"
              >
                {genre.label}
              </button>
            ))}
          </div>
        </div>

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
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
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
                    <span>Start Point</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    0:{Math.floor(clipStartTime).toString().padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(5, Math.floor(trackDuration) - 5)}
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
                    <span>Volume</span>
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

        {/* Track Results List with Skeletons */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2 bg-white">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] p-3 flex items-center justify-between animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-stone-200" />
                    <div className="space-y-2">
                      <div className="w-32 h-3 rounded bg-stone-200" />
                      <div className="w-20 h-2.5 rounded bg-stone-200" />
                    </div>
                  </div>
                  <div className="w-16 h-9 rounded-xl bg-stone-200" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-xs font-bold text-rose-600">{error}</p>
              <button
                type="button"
                onClick={() => handleSearch(searchTerm || 'Top Hits')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            songs.map((song) => {
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
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-stone-200 flex items-center justify-center">
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
                          <Pause size={15} />
                        ) : (
                          <Play size={15} className="fill-white ml-0.5" />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-[#1C1917] truncate">
                        {song.trackName}
                      </h4>
                      <p className="text-xs text-[#57534E] truncate">{song.artistName}</p>
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
            })
          )}
        </div>
      </div>
    </div>
  );
};
