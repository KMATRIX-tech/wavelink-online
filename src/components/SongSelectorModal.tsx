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
  Sparkles,
  Flame,
  Radio
} from 'lucide-react';

interface SongSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: OnlineSong) => void;
  selectedSongId?: string | number;
}

const GENRE_SHORTCUTS = [
  { label: '🔥 Top Global', query: 'Top Hits 2026' },
  { label: '🎶 Hip-Hop', query: 'Drake Kendrick Metro Boomin' },
  { label: '🌊 Afrobeat', query: 'Burna Boy Wizkid Tems' },
  { label: '✨ Pop Vibes', query: 'Dua Lipa Taylor Swift Sabrina' },
  { label: '⚡ Electronic', query: 'Calvin Harris Fred again Skrillex' },
  { label: '🌙 Chill & Lofi', query: 'Lofi Chill Beats' },
  { label: '🎸 Rock / Indie', query: 'Arctic Monkeys The Weeknd' },
  { label: '🎷 R&B Soul', query: 'SZA Frank Ocean Daniel Caesar' },
];

export const SongSelectorModal: React.FC<SongSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSong,
  selectedSongId
}) => {
  const [searchTerm, setSearchTerm] = useState('Trending Hits');
  const [songs, setSongs] = useState<OnlineSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio preview state
  const [playingTrackId, setPlayingTrackId] = useState<string | number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const handleTogglePlay = (song: OnlineSong) => {
    if (!song.previewUrl) return;

    if (playingTrackId === song.trackId) {
      stopAudio();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = song.previewUrl;
    audioRef.current.play().then(() => {
      setPlayingTrackId(song.trackId);
    }).catch((err) => {
      console.warn('Playback error:', err);
      setPlayingTrackId(null);
    });

    audioRef.current.onended = () => {
      setPlayingTrackId(null);
    };
  };

  const handleSearch = async (term: string) => {
    if (!term.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term.trim()
      )}&entity=song&limit=30`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
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
          primaryGenreName: item.primaryGenreName || 'Music'
        }));

      setSongs(formatted);
    } catch (err: any) {
      console.error('Song search error:', err);
      setError('Could not connect to online music database. Please check connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchTerm);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => {
          stopAudio();
          onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111726] rounded-3xl border border-purple-200 dark:border-purple-900/60 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] z-10 animate-fade-in">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-900/10 via-pink-900/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white shadow-md shadow-purple-600/20">
              <Music size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-1.5">
                Choose a Song from Online
                <Sparkles size={14} className="text-amber-400" />
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Search millions of songs online and attach high-fidelity soundtrack to your post!
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar & Quick Categories */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
          <form onSubmit={handleFormSubmit} className="relative flex items-center">
            <Search size={16} className="absolute left-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search song title, artist, or genre (e.g. Starboy, Drake, Afrobeat)..."
              className="w-full pl-10 pr-24 py-2.5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={isLoading || !searchTerm.trim()}
              className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition disabled:opacity-40"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Quick Genre Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            {GENRE_SHORTCUTS.map((genre) => (
              <button
                key={genre.label}
                type="button"
                onClick={() => {
                  setSearchTerm(genre.query);
                  handleSearch(genre.query);
                }}
                className="px-3 py-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 hover:border-purple-400 dark:hover:border-purple-500 text-gray-700 dark:text-gray-300 font-semibold text-[11px] whitespace-nowrap transition hover:scale-102"
              >
                {genre.label}
              </button>
            ))}
          </div>
        </div>

        {/* Songs Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold">Searching online music library...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-500 text-xs">
              <p>{error}</p>
              <button
                onClick={() => handleSearch(searchTerm || 'Top Hits')}
                className="mt-3 px-4 py-1.5 rounded-xl bg-purple-600 text-white font-semibold text-xs"
              >
                Retry Search
              </button>
            </div>
          ) : songs.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Disc size={36} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-xs font-medium">No songs found. Try a different search term or artist name.</p>
            </div>
          ) : (
            songs.map((song) => {
              const isPlaying = playingTrackId === song.trackId;
              const isSelected = selectedSongId === song.trackId;

              return (
                <div
                  key={song.trackId}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition ${
                    isSelected
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                      : 'bg-white dark:bg-gray-800/40 border-gray-200/80 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700/60'
                  }`}
                >
                  {/* Left: Album Art & Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    {/* Album Art with Play overlay */}
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-900 group">
                      <img
                        src={song.artworkUrl100}
                        alt={song.trackName}
                        className={`w-full h-full object-cover transition-transform ${
                          isPlaying ? 'scale-105' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(song)}
                        className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition"
                        title={isPlaying ? 'Pause preview' : 'Play 30s preview'}
                      >
                        {isPlaying ? (
                          <div className="flex items-center gap-0.5">
                            <span className="w-1 h-3 bg-white animate-pulse" />
                            <span className="w-1 h-4 bg-white animate-pulse delay-75" />
                            <span className="w-1 h-2 bg-white animate-pulse delay-150" />
                          </div>
                        ) : (
                          <Play size={16} className="fill-white ml-0.5" />
                        )}
                      </button>
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                        {song.trackName}
                      </h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate font-medium">
                        {song.artistName}
                        {song.collectionName && (
                          <span className="opacity-75"> • {song.collectionName}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold">
                          {song.primaryGenreName}
                        </span>
                        {isPlaying && (
                          <span className="text-[10px] font-mono text-emerald-500 font-bold animate-pulse flex items-center gap-1">
                            <Radio size={10} />
                            Playing Preview
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePlay(song)}
                      className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                        isPlaying
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Preview'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopAudio();
                        onSelectSong(song);
                        onClose();
                      }}
                      className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                    >
                      {isSelected ? (
                        <>
                          <Check size={14} />
                          <span>Selected</span>
                        </>
                      ) : (
                        <>
                          <Music size={14} />
                          <span>Select Song</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#0c101c] flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-purple-500" />
            <span>High-quality online audio previews powered by Apple Music stream catalog</span>
          </div>
          <button
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
