import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { UserProfile, Post, ActiveTab } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  X,
  User,
  Film,
  Hash,
  MessageSquare,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Image as ImageIcon,
  Heart,
  Crown,
  Eye,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { CrystalBadge } from './CrystalBadge';
import { QuickSearchPreviewDrawer, QuickPreviewItem } from './QuickSearchPreviewDrawer';
import { triggerHaptic } from '../utils/haptics';

interface GlobalSearchBarProps {
  onNavigateTab: (tab: ActiveTab) => void;
  onStartChat?: (userId: string) => void;
  onSelectHashtag?: (hashtag: string) => void;
  className?: string;
}

const DEFAULT_TRENDING_TAGS = [
  '#WaveLinkTZ',
  '#AirtelMoneyTZ',
  '#BongoCreatives',
  '#DarTech2026',
  '#PostBoostTZ',
  '#EastAfricaMusic',
  '#ReelsTZ'
];

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  onNavigateTab,
  onStartChat,
  onSelectHashtag,
  className = ''
}) => {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'users' | 'posts' | 'hashtags'>('all');

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [allHashtags, setAllHashtags] = useState<string[]>(DEFAULT_TRENDING_TAGS);

  // Quick-Search Preview Drawer State
  const [previewItem, setPreviewItem] = useState<QuickPreviewItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch users & posts for instant live search
  useEffect(() => {
    const usersQ = query(collection(db, 'users'), limit(100));
    const unsubUsers = onSnapshot(usersQ, (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as UserProfile));
      setAllUsers(list);
    });

    const postsQ = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(150));
    const unsubPosts = onSnapshot(postsQ, (snap) => {
      const list: Post[] = [];
      const tagSet = new Set<string>(DEFAULT_TRENDING_TAGS);
      snap.forEach((d) => {
        const post = { id: d.id, ...d.data() } as Post;
        list.push(post);
        // Extract hashtags from content
        const matches = post.content?.match(/#[a-zA-Z0-9_]+/g);
        if (matches) {
          matches.forEach((t) => tagSet.add(t));
        }
      });
      setAllPosts(list);
      setAllHashtags(Array.from(tagSet));
    });

    return () => {
      unsubUsers();
      unsubPosts();
    };
  }, []);

  // Keyboard shortcut listener (Cmd/Ctrl+K or '/' opens search, 'Escape' closes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
        (e.key === '/' &&
          document.activeElement !== inputRef.current &&
          !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName))
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter matching entities
  const cleanQuery = searchTerm.trim().toLowerCase();

  const matchedUsers = cleanQuery
    ? allUsers.filter(
        (u) =>
          (u.displayName || '').toLowerCase().includes(cleanQuery) ||
          (u.username || '').toLowerCase().includes(cleanQuery) ||
          (u.email || '').toLowerCase().includes(cleanQuery) ||
          (u.bio || '').toLowerCase().includes(cleanQuery)
      )
    : [];

  const matchedPosts = cleanQuery
    ? allPosts.filter(
        (p) =>
          (p.content || '').toLowerCase().includes(cleanQuery) ||
          (p.authorName || '').toLowerCase().includes(cleanQuery) ||
          (p.authorUsername || '').toLowerCase().includes(cleanQuery)
      )
    : [];

  const matchedHashtags = cleanQuery
    ? allHashtags.filter((tag) => tag.toLowerCase().includes(cleanQuery.replace(/^#/, '')))
    : allHashtags.slice(0, 5);

  const totalResults = matchedUsers.length + matchedPosts.length + matchedHashtags.length;

  // Open Quick-Search Preview Drawer
  const handleOpenPreview = (item: QuickPreviewItem) => {
    triggerHaptic('light');
    setPreviewItem(item);
    setIsPreviewOpen(true);
    setIsOpen(false);
  };

  const handleSelectUserDirect = (user: UserProfile) => {
    setIsOpen(false);
    triggerHaptic('tab');
    if (onStartChat) {
      onStartChat(user.id);
    } else {
      onNavigateTab('directory');
    }
  };

  const handleSelectPostDirect = (_post: Post) => {
    setIsOpen(false);
    triggerHaptic('tab');
    onNavigateTab('feed');
  };

  const handleSelectTagDirect = (tag: string) => {
    setIsOpen(false);
    triggerHaptic('tab');
    if (onSelectHashtag) {
      onSelectHashtag(tag);
    }
    onNavigateTab('feed');
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg ${className}`}
      >
        {/* Search Input Box */}
        <div className="relative flex items-center">
          <Search
            size={15}
            className="absolute left-3 text-slate-400 pointer-events-none transition-colors"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search people, posts, or #tags..."
            aria-label="Global search for people, posts, or tags"
            className="w-full pl-8.5 pr-14 py-1.5 sm:py-2 rounded-xl bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 text-xs sm:text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-500/15 transition-all shadow-2xs"
          />

          <div className="absolute right-2 flex items-center gap-1">
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="p-1 rounded-md text-slate-400 hover:text-[#0F172A] hover:bg-slate-200/60 transition cursor-pointer"
                title="Clear search"
                aria-label="Clear search input"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white rounded border border-slate-200 shadow-2xs select-none">
                <span>/</span>
              </span>
            )}
          </div>
        </div>

        {/* Floating Results Dropdown Popover */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl bg-white border border-slate-200 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] overflow-hidden animate-in fade-in">
            {/* Category Filter Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/70 px-3 pt-2 gap-1 text-[11px] font-semibold overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 border-b-2 cursor-pointer ${
                  activeCategory === 'all'
                    ? 'border-[#2563EB] text-[#2563EB] font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-[#0F172A]'
                }`}
              >
                <span>All Results</span>
                {cleanQuery && (
                  <span className="text-[10px] opacity-75 font-mono">({totalResults})</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('users')}
                className={`px-3 py-1.5 rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 border-b-2 cursor-pointer ${
                  activeCategory === 'users'
                    ? 'border-teal-600 text-teal-700 font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-[#0F172A]'
                }`}
              >
                <User size={12} className="text-teal-600" />
                <span>People</span>
                {cleanQuery && (
                  <span className="text-[10px] opacity-75 font-mono">({matchedUsers.length})</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('posts')}
                className={`px-3 py-1.5 rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 border-b-2 cursor-pointer ${
                  activeCategory === 'posts'
                    ? 'border-[#2563EB] text-[#2563EB] font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-[#0F172A]'
                }`}
              >
                <Film size={12} className="text-[#2563EB]" />
                <span>Posts</span>
                {cleanQuery && (
                  <span className="text-[10px] opacity-75 font-mono">({matchedPosts.length})</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('hashtags')}
                className={`px-3 py-1.5 rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 border-b-2 cursor-pointer ${
                  activeCategory === 'hashtags'
                    ? 'border-emerald-600 text-emerald-700 font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-[#0F172A]'
                }`}
              >
                <Hash size={12} className="text-emerald-600" />
                <span>Tags</span>
                {cleanQuery && (
                  <span className="text-[10px] opacity-75 font-mono">({matchedHashtags.length})</span>
                )}
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-3">
              {/* If query empty: show trending recommendations */}
              {!cleanQuery && (
                <div className="p-3 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold uppercase tracking-wider text-[10px] mb-2">
                    <TrendingUp size={13} className="text-emerald-600" />
                    <span>Trending on WaveLink</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_TRENDING_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleOpenPreview({ type: 'tag', tag })}
                        className="px-2.5 py-1 rounded-xl bg-blue-50/70 hover:bg-blue-100 text-[#2563EB] border border-blue-200/70 text-xs font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                      >
                        <Hash size={11} className="text-emerald-600" />
                        <span>{tag.replace(/^#/, '')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No results state */}
              {cleanQuery && totalResults === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Search size={26} className="mx-auto mb-2 opacity-40 text-[#2563EB]" />
                  <p className="text-xs font-medium text-[#0F172A]">
                    No results found for &quot;{cleanQuery}&quot;
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try searching by name, @username, or #tags
                  </p>
                </div>
              )}

              {/* 1. People Section */}
              {(activeCategory === 'all' || activeCategory === 'users') && matchedUsers.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>People ({matchedUsers.length})</span>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('directory')}
                      className="text-[#2563EB] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  </div>
                  {matchedUsers.slice(0, 4).map((u) => (
                    <div
                      key={u.id}
                      onClick={() => handleOpenPreview({ type: 'user', user: u })}
                      className="p-2 rounded-xl hover:bg-slate-50 transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={u.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.id}`}
                          alt="Avatar"
                          className="w-9 h-9 rounded-full object-cover ring-1 ring-teal-500/20 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-xs text-[#0F172A] truncate">
                              {u.displayName || u.username}
                            </span>
                            <CrystalBadge email={u.email} name={u.displayName} size="sm" />
                            {u.isPro && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold flex items-center gap-0.5">
                                <Crown size={9} />
                                PRO
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block truncate font-mono">
                            {u.username?.startsWith('@') ? u.username : `@${u.username || u.email.split('@')[0]}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPreview({ type: 'user', user: u });
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition cursor-pointer"
                          title="Open Quick Preview Drawer"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectUserDirect(u);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <MessageSquare size={11} />
                          <span>Chat</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. Posts Section */}
              {(activeCategory === 'all' || activeCategory === 'posts') && matchedPosts.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Waves &amp; Reels ({matchedPosts.length})</span>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('feed')}
                      className="text-[#2563EB] hover:underline cursor-pointer"
                    >
                      Feed
                    </button>
                  </div>
                  {matchedPosts.slice(0, 4).map((post) => (
                    <div
                      key={post.id}
                      onClick={() => handleOpenPreview({ type: 'post', post })}
                      className="p-2 rounded-xl hover:bg-slate-50 transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-bold text-xs text-[#2563EB] truncate">
                            {post.authorName || 'Waver'}
                          </span>
                          {post.mediaType === 'video' ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-50 text-[#2563EB] font-bold flex items-center gap-0.5">
                              <Film size={9} />
                              Reel
                            </span>
                          ) : post.imageUrl ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 font-bold flex items-center gap-0.5">
                              <ImageIcon size={9} />
                              Photo
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-[#0F172A] line-clamp-1 break-words">
                          {post.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px] shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Heart size={11} className="text-rose-400" />
                          {post.likesCount || 0}
                        </span>
                        <div className="p-1 rounded-md text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition">
                          <Eye size={13} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Hashtags Section */}
              {(activeCategory === 'all' || activeCategory === 'hashtags') && matchedHashtags.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Tags ({matchedHashtags.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {matchedHashtags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleOpenPreview({ type: 'tag', tag })}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer group"
                      >
                        <Hash size={12} className="text-emerald-600" />
                        <span>{tag}</span>
                        <Eye size={10} className="text-slate-400 group-hover:text-blue-600 ml-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Footer with Preview Prompt */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span>Click any result for</span>
                <strong className="text-slate-600">Quick Preview Drawer</strong>
              </span>
              <span>Press <strong>Esc</strong> to close</span>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Quick Search Preview Drawer */}
      <QuickSearchPreviewDrawer
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        item={previewItem}
        onNavigateTab={onNavigateTab}
        onStartChat={onStartChat}
        onSelectHashtag={onSelectHashtag}
        onSelectPreviewItem={(item) => setPreviewItem(item)}
      />
    </>
  );
};
