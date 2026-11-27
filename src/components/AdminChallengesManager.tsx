import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  Check,
  ChevronLeft,
  Crown,
  Edit3,
  Eye,
  Heart,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  ChallengeEntry,
  ChallengeEntryType,
  ChallengeParticipant,
  CreatorChallenge,
  CustomBadge,
} from '../types';
import {
  chooseChallengeWinners,
  CURATED_BADGE_COLORS,
  CURATED_BADGE_ICON_KEYS,
  deleteCustomBadge,
  fetchChallengeParticipantsPage,
  fetchChallengesCached,
  fetchCustomBadgesCached,
  fetchParticipantEntries,
  formatCountdownParts,
  resolveUnifiedBadge,
  saveChallenge,
  saveCustomBadge,
} from '../services/challengesService';
import { uploadImageToCloudinary } from '../utils/mediaStorage';
import { BadgeIconGlyph } from './BadgeIconGlyph';
import { WinnersWallView } from './WinnersWallView';

interface AdminChallengesManagerProps {
  isAdmin: boolean;
  onViewProfile?: (userId: string) => void;
}

interface SelectedWinnerDraft {
  uid: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  placement: number;
  postId?: string;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AdminChallengesManager: React.FC<AdminChallengesManagerProps> = ({
  isAdmin,
  onViewProfile,
}) => {
  const [subTab, setSubTab] = useState<'challenges' | 'badges'>('challenges');
  const [challenges, setChallenges] = useState<CreatorChallenge[]>([]);
  const [badges, setBadges] = useState<CustomBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Challenge form state
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const [chTitle, setChTitle] = useState('');
  const [chHashtag, setChHashtag] = useState('');
  const [chDescription, setChDescription] = useState('');
  const [chRules, setChRules] = useState('');
  const [chType, setChType] = useState<ChallengeEntryType>('any');
  const [chStartDate, setChStartDate] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [chEndDate, setChEndDate] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
  );
  const [chMaxEntries, setChMaxEntries] = useState<string>('3');
  const [chCoverUrl, setChCoverUrl] = useState('');
  const [chBadgeId, setChBadgeId] = useState<string>('weekly_winner');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingChallenge, setSavingChallenge] = useState(false);

  // Winner selection screen state
  const [winnerChallenge, setWinnerChallenge] = useState<CreatorChallenge | null>(null);
  const [participants, setParticipants] = useState<ChallengeParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsHasMore, setParticipantsHasMore] = useState(false);
  const [participantsOffset, setParticipantsOffset] = useState(0);
  const [sortBy, setSortBy] = useState<'likes' | 'entries'>('likes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWinners, setSelectedWinners] = useState<SelectedWinnerDraft[]>([]);
  const [awardBadgeId, setAwardBadgeId] = useState<string>('weekly_winner');
  const [announcementNote, setAnnouncementNote] = useState('');
  const [markCompleted, setMarkCompleted] = useState(true);
  const [confirmingWinners, setConfirmingWinners] = useState(false);

  // Participant entries inspector state
  const [inspectingParticipant, setInspectingParticipant] = useState<ChallengeParticipant | null>(null);
  const [participantEntries, setParticipantEntries] = useState<ChallengeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Winners wall preview modal
  const [winnersWallChallenge, setWinnersWallChallenge] = useState<CreatorChallenge | null>(null);

  // Custom badge form state
  const [badgeEditId, setBadgeEditId] = useState<string | null>(null);
  const [badgeName, setBadgeName] = useState('');
  const [badgeDesc, setBadgeDesc] = useState('');
  const [badgeColor, setBadgeColor] = useState<string>(CURATED_BADGE_COLORS[0]);
  const [badgeIcon, setBadgeIcon] = useState<string>('trophy');
  const [badgeImageUrl, setBadgeImageUrl] = useState('');
  const [badgeChallengeId, setBadgeChallengeId] = useState<string>('');
  const [uploadingBadgeImg, setUploadingBadgeImg] = useState(false);
  const [savingBadge, setSavingBadge] = useState(false);
  const [deletingBadgeId, setDeletingBadgeId] = useState<string | null>(null);

  const loadData = useCallback(async (force = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [chList, bList] = await Promise.all([
        fetchChallengesCached(force),
        fetchCustomBadgesCached(force),
      ]);
      setChallenges(chList);
      setBadges(bList);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not load challenges and badges.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData(false);
    }
  }, [isAdmin, loadData]);

  const loadParticipants = useCallback(
    async (
      challengeId: string,
      opts: { sort: 'likes' | 'entries'; search: string; offset: number; append: boolean }
    ) => {
      setParticipantsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchChallengeParticipantsPage(challengeId, {
          sortBy: opts.sort,
          offset: opts.offset,
          limit: 20,
          search: opts.search,
        });
        setParticipants((prev) => (opts.append ? [...prev, ...res.participants] : res.participants));
        setParticipantsHasMore(res.hasMore);
        setParticipantsOffset(res.nextOffset);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Could not load challenge participants.');
      } finally {
        setParticipantsLoading(false);
      }
    },
    []
  );

  const openChooseWinner = (ch: CreatorChallenge) => {
    setWinnerChallenge(ch);
    setAwardBadgeId(ch.badgeId || 'weekly_winner');
    setAnnouncementNote('');
    setMarkCompleted(true);
    setSortBy('likes');
    setSearchQuery('');
    setInspectingParticipant(null);
    setParticipantEntries([]);
    setSelectedWinners(
      (ch.winners || []).map((w) => ({
        uid: w.uid,
        displayName: w.displayName,
        username: w.username,
        photoURL: w.photoURL,
        placement: w.placement,
        postId: w.postId,
      }))
    );
    loadParticipants(ch.id, { sort: 'likes', search: '', offset: 0, append: false });
  };

  useEffect(() => {
    if (!winnerChallenge) return;
    const handle = window.setTimeout(() => {
      loadParticipants(winnerChallenge.id, {
        sort: sortBy,
        search: searchQuery,
        offset: 0,
        append: false,
      });
    }, 220);
    return () => window.clearTimeout(handle);
  }, [winnerChallenge, sortBy, searchQuery, loadParticipants]);

  const openInspectEntries = async (participant: ChallengeParticipant) => {
    if (!winnerChallenge) return;
    setInspectingParticipant(participant);
    setEntriesLoading(true);
    setParticipantEntries([]);
    try {
      const list = await fetchParticipantEntries(winnerChallenge.id, participant.uid);
      setParticipantEntries(list);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load participant entries.');
    } finally {
      setEntriesLoading(false);
    }
  };

  const assignWinnerPlacement = (participant: ChallengeParticipant, placement: number, postId?: string) => {
    setSelectedWinners((prev) => {
      const existing = prev.find((w) => w.uid === participant.uid);
      if (existing && existing.placement === placement && !postId) {
        return prev.filter((w) => w.uid !== participant.uid);
      }
      const withoutSameUser = prev.filter((w) => w.uid !== participant.uid);
      return [
        ...withoutSameUser,
        {
          uid: participant.uid,
          displayName: participant.displayName,
          username: participant.username,
          photoURL: participant.photoURL,
          placement,
          postId: postId || existing?.postId,
        },
      ].sort((a, b) => a.placement - b.placement);
    });
  };

  const handleConfirmWinners = async () => {
    if (!winnerChallenge || selectedWinners.length === 0 || confirmingWinners) return;
    setConfirmingWinners(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const result = await chooseChallengeWinners(winnerChallenge.id, {
        winners: selectedWinners.map((w) => ({
          uid: w.uid,
          placement: w.placement,
          postId: w.postId,
          badgeId: awardBadgeId || undefined,
        })),
        badgeId: awardBadgeId || null,
        announcementNote: announcementNote.trim() || undefined,
        markCompleted,
      });
      setStatusMsg(
        `Winners confirmed! Posted official announcement in WaveLink Assistant, notified ${result.winners.length} winner(s), and awarded their badge.`
      );
      setWinnerChallenge(null);
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not confirm challenge winners.');
    } finally {
      setConfirmingWinners(false);
    }
  };

  const resetChallengeForm = () => {
    setEditingChallengeId(null);
    setChTitle('');
    setChHashtag('');
    setChDescription('');
    setChRules('');
    setChType('any');
    setChStartDate(toDatetimeLocalValue(new Date().toISOString()));
    setChEndDate(toDatetimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()));
    setChMaxEntries('3');
    setChCoverUrl('');
    setChBadgeId('weekly_winner');
  };

  const startEditChallenge = (ch: CreatorChallenge) => {
    setEditingChallengeId(ch.id);
    setChTitle(ch.title || ch.theme || '');
    setChHashtag(ch.hashtag || '');
    setChDescription(ch.description || '');
    setChRules(ch.rules || '');
    setChType(ch.type || 'any');
    setChStartDate(toDatetimeLocalValue(ch.startDate || ch.createdAt));
    setChEndDate(toDatetimeLocalValue(ch.endDate || ch.deadline));
    setChMaxEntries(ch.maxEntriesPerUser ? String(ch.maxEntriesPerUser) : '');
    setChCoverUrl(ch.coverImageUrl || '');
    setChBadgeId(ch.badgeId || 'weekly_winner');
    setShowChallengeForm(true);
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setErrorMsg(null);
    try {
      const uploaded = await uploadImageToCloudinary(file, undefined, { maxWidth: 1280 });
      setChCoverUrl(uploaded.secureUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload cover image.');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const handleSaveChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingChallenge) return;
    setSavingChallenge(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const parsedMax = chMaxEntries.trim() ? Number(chMaxEntries) : null;
      await saveChallenge({
        id: editingChallengeId || undefined,
        title: chTitle.trim(),
        hashtag: chHashtag.trim(),
        description: chDescription.trim(),
        rules: chRules.trim() || undefined,
        type: chType,
        coverImageUrl: chCoverUrl.trim() || undefined,
        startDate: chStartDate ? new Date(chStartDate).toISOString() : undefined,
        endDate: chEndDate ? new Date(chEndDate).toISOString() : undefined,
        maxEntriesPerUser: parsedMax,
        badgeId: chBadgeId || null,
        status: 'active',
      });
      setStatusMsg(editingChallengeId ? 'Challenge updated!' : 'Weekly challenge launched!');
      setShowChallengeForm(false);
      resetChallengeForm();
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save challenge.');
    } finally {
      setSavingChallenge(false);
    }
  };

  const handleUploadBadgeImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBadgeImg(true);
    setErrorMsg(null);
    try {
      const uploaded = await uploadImageToCloudinary(file, undefined, { maxWidth: 256 });
      setBadgeImageUrl(uploaded.secureUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload badge image.');
    } finally {
      setUploadingBadgeImg(false);
      e.target.value = '';
    }
  };

  const handleSaveBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingBadge) return;
    setSavingBadge(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const linkedCh = challenges.find((c) => c.id === badgeChallengeId);
      await saveCustomBadge({
        id: badgeEditId || undefined,
        name: badgeName.trim(),
        description: badgeDesc.trim(),
        color: badgeColor,
        iconName: badgeIcon,
        imageUrl: badgeImageUrl.trim() || undefined,
        challengeId: linkedCh ? linkedCh.id : null,
        challengeTitle: linkedCh ? linkedCh.title || linkedCh.theme : null,
      });
      setStatusMsg(badgeEditId ? 'Badge updated!' : 'Custom badge created!');
      setBadgeEditId(null);
      setBadgeName('');
      setBadgeDesc('');
      setBadgeImageUrl('');
      setBadgeChallengeId('');
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save badge.');
    } finally {
      setSavingBadge(false);
    }
  };

  const handleDeleteBadge = async (id: string) => {
    setDeletingBadgeId(id);
    setErrorMsg(null);
    try {
      await deleteCustomBadge(id);
      setStatusMsg('Badge deleted.');
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not delete badge.');
    } finally {
      setDeletingBadgeId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border p-6 text-center opacity-80">
        Only WaveLink Admins and Sub-Admins can manage Challenges and Badges.
      </div>
    );
  }

  // ==================== CHOOSE WINNER SCREEN ====================
  if (winnerChallenge) {
    const chTitleDisplay = winnerChallenge.title || winnerChallenge.theme;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setWinnerChallenge(null);
              setInspectingParticipant(null);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border inline-flex items-center gap-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
              borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
            }}
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Challenges
          </button>

          <div className="text-right min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Choose Winners
            </p>
            <h3 className="text-base sm:text-lg font-extrabold truncate">{chTitleDisplay}</h3>
            <p className="text-xs opacity-70">
              {winnerChallenge.hashtag} · {winnerChallenge.participantsCount || 0} participants
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Search & Sort Controls */}
        <div
          className="rounded-2xl border p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between"
          style={{
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.04))',
            borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
          }}
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participants in this challenge..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
                color: 'var(--text-primary, #ffffff)',
              }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSortBy('likes')}
              className="min-h-[44px] flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: sortBy === 'likes' ? 'var(--accent-primary, #8b5cf6)' : 'var(--bg-subtle, rgba(255,255,255,0.06))',
                borderColor: sortBy === 'likes' ? 'transparent' : 'var(--border-subtle, rgba(255,255,255,0.12))',
                color: sortBy === 'likes' ? '#ffffff' : 'var(--text-primary, #ffffff)',
              }}
            >
              <Heart className="w-3.5 h-3.5" />
              Sort: Likes
            </button>
            <button
              type="button"
              onClick={() => setSortBy('entries')}
              className="min-h-[44px] flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: sortBy === 'entries' ? 'var(--accent-primary, #8b5cf6)' : 'var(--bg-subtle, rgba(255,255,255,0.06))',
                borderColor: sortBy === 'entries' ? 'transparent' : 'var(--border-subtle, rgba(255,255,255,0.12))',
                color: sortBy === 'entries' ? '#ffffff' : 'var(--text-primary, #ffffff)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Sort: Entries
            </button>
          </div>
        </div>

        {/* Participant Entries Inspector Panel */}
        {inspectingParticipant && (
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{
              backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.05))',
              borderColor: 'var(--accent-primary, #8b5cf6)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">
                  Entries by {inspectingParticipant.displayName}
                </p>
                <p className="text-xs opacity-65">
                  Tap an entry to pin it as their winning post on the Winners Wall.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingParticipant(null)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border"
                style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {entriesLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-sm opacity-75">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading entries...
              </div>
            ) : participantEntries.length === 0 ? (
              <p className="text-sm opacity-70 py-4 text-center">No entries found for this creator.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participantEntries.map((entry) => {
                  const selected = selectedWinners.find((w) => w.uid === inspectingParticipant.uid);
                  const isPinned = selected?.postId === entry.postId;
                  return (
                    <div
                      key={entry.postId}
                      className="rounded-xl border p-3 flex items-start gap-3"
                      style={{
                        backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.04))',
                        borderColor: isPinned ? '#f59e0b' : 'var(--border-subtle, rgba(255,255,255,0.12))',
                      }}
                    >
                      {entry.thumbnailUrl || entry.imageUrl ? (
                        <img
                          src={entry.thumbnailUrl || entry.imageUrl}
                          alt="Entry preview"
                          className="w-16 h-16 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold">
                          TEXT
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-xs line-clamp-2">{entry.excerpt || 'Challenge post'}</p>
                        <div className="flex items-center justify-between gap-2 text-[11px] opacity-75">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Heart className="w-3 h-3 text-rose-400" />
                            {entry.likesCount || 0} verified likes
                          </span>
                          <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            assignWinnerPlacement(
                              inspectingParticipant,
                              selected?.placement || 1,
                              entry.postId
                            )
                          }
                          className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold border"
                          style={{
                            backgroundColor: isPinned ? 'rgba(245,158,11,0.22)' : 'transparent',
                            borderColor: isPinned ? '#f59e0b' : 'var(--border-subtle, rgba(255,255,255,0.2))',
                            color: isPinned ? '#fcd34d' : 'var(--text-primary, #ffffff)',
                          }}
                        >
                          {isPinned ? 'Pinned as winning entry' : 'Pin as winning entry'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Paginated Participants List (ONLY participants of this challenge, 20 at a time) */}
        <div className="space-y-2.5">
          {participantsLoading && participants.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm opacity-75">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading participants...
            </div>
          ) : participants.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center space-y-2"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))',
              }}
            >
              <Users className="w-8 h-8 mx-auto opacity-50" />
              <p className="font-bold text-sm">No participants yet</p>
              <p className="text-xs opacity-70">
                Only users who submit a post to this challenge will appear here.
              </p>
            </div>
          ) : (
            participants.map((p) => {
              const picked = selectedWinners.find((w) => w.uid === p.uid);
              return (
                <div
                  key={p.uid}
                  className="rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  style={{
                    backgroundColor: picked
                      ? 'rgba(245,158,11,0.12)'
                      : 'var(--bg-surface, rgba(255,255,255,0.04))',
                    borderColor: picked
                      ? 'rgba(245,158,11,0.5)'
                      : p.suspiciousSpike
                      ? 'rgba(245,158,11,0.35)'
                      : 'var(--border-subtle, rgba(255,255,255,0.1))',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center font-bold text-sm">
                      {p.photoURL ? (
                        <img src={p.photoURL} alt={p.displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span>{(p.displayName || 'U').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-sm truncate">{p.displayName}</p>
                        {p.username ? <span className="text-xs opacity-65 truncate">@{p.username}</span> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs opacity-80 mt-0.5 tabular-nums">
                        <span>{p.postCount} {p.postCount === 1 ? 'entry' : 'entries'}</span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 text-rose-400" />
                          {p.likesTotal} verified likes
                        </span>
                      </div>
                      {p.suspiciousSpike && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[11px] font-semibold">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>
                            Like spike flagged: {p.spikeReasons?.[0] || 'Review entries carefully'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openInspectEntries(p)}
                      className="min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                        borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Entries
                    </button>

                    {[1, 2, 3].map((place) => {
                      const active = picked?.placement === place;
                      const label = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
                      return (
                        <button
                          key={place}
                          type="button"
                          onClick={() => assignWinnerPlacement(p, place)}
                          className="min-h-[44px] min-w-[48px] px-2.5 py-2 rounded-xl text-xs font-extrabold border transition-all"
                          style={{
                            backgroundColor: active
                              ? place === 1
                                ? '#f59e0b'
                                : place === 2
                                ? '#94a3b8'
                                : '#d97706'
                              : 'var(--bg-subtle, rgba(255,255,255,0.06))',
                            borderColor: active ? 'transparent' : 'var(--border-subtle, rgba(255,255,255,0.14))',
                            color: active ? '#111827' : 'var(--text-primary, #ffffff)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {participantsHasMore && (
            <button
              type="button"
              disabled={participantsLoading}
              onClick={() =>
                loadParticipants(winnerChallenge.id, {
                  sort: sortBy,
                  search: searchQuery,
                  offset: participantsOffset,
                  append: true,
                })
              }
              className="w-full min-h-[44px] rounded-xl border font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
              }}
            >
              {participantsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load next 20 participants
            </button>
          )}
        </div>

        {/* Confirm Winners Summary Card */}
        <div
          className="rounded-2xl border p-4 sm:p-5 space-y-4"
          style={{
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.05))',
            borderColor: 'var(--border-subtle, rgba(255,255,255,0.15))',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              Selected Winners ({selectedWinners.length})
            </h4>
            {selectedWinners.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedWinners([])}
                className="text-xs underline opacity-75"
              >
                Clear all
              </button>
            )}
          </div>

          {selectedWinners.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedWinners.map((w) => (
                <span
                  key={w.uid}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/35"
                >
                  <span>#{w.placement}</span>
                  <span>{w.displayName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedWinners((prev) => prev.filter((x) => x.uid !== w.uid))}
                    aria-label={`Remove ${w.displayName}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs opacity-70">
              Tap 1st, 2nd, or 3rd next to any participant above to select winners.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold opacity-80 mb-1">
                Badge to award winners
              </label>
              <select
                value={awardBadgeId}
                onChange={(e) => setAwardBadgeId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              >
                <option value="weekly_winner">Built-in: Challenge Champion</option>
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    Custom: {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold opacity-80 mb-1">
                Optional winner note (for Admin Updates)
              </label>
              <input
                type="text"
                value={announcementNote}
                onChange={(e) => setAnnouncementNote(e.target.value)}
                maxLength={240}
                placeholder="Thanks to everyone who joined this week!"
                className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={markCompleted}
              onChange={(e) => setMarkCompleted(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <span>Mark challenge as completed and close further entries</span>
          </label>

          <p className="text-[11px] opacity-75">
            Confirming automatically posts a &ldquo;Winner&rdquo; announcement in WaveLink Assistant (Admin Updates), sends notifications to winners, and awards the badge + celebration screen.
          </p>

          <button
            type="button"
            disabled={selectedWinners.length === 0 || confirmingWinners}
            onClick={handleConfirmWinners}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
              color: '#ffffff',
            }}
          >
            {confirmingWinners ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            <span>
              {confirmingWinners
                ? 'Awarding Winners & Posting Announcement...'
                : `Confirm ${selectedWinners.length || ''} Winner${selectedWinners.length === 1 ? '' : 's'}`}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ==================== MAIN ADMIN CHALLENGES & BADGES MANAGER ====================
  return (
    <div className="space-y-4">
      {/* Top Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex p-1 rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.05))',
            borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
          }}
        >
          <button
            type="button"
            onClick={() => setSubTab('challenges')}
            className="min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all"
            style={{
              backgroundColor: subTab === 'challenges' ? 'var(--accent-primary, #8b5cf6)' : 'transparent',
              color: subTab === 'challenges' ? '#ffffff' : 'var(--text-primary, #ffffff)',
            }}
          >
            <Trophy className="w-4 h-4" />
            Challenges ({challenges.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('badges')}
            className="min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all"
            style={{
              backgroundColor: subTab === 'badges' ? 'var(--accent-primary, #8b5cf6)' : 'transparent',
              color: subTab === 'badges' ? '#ffffff' : 'var(--text-primary, #ffffff)',
            }}
          >
            <Award className="w-4 h-4" />
            Badges ({badges.length})
          </button>
        </div>

        {subTab === 'challenges' && (
          <button
            type="button"
            onClick={() => {
              if (showChallengeForm) {
                setShowChallengeForm(false);
                resetChallengeForm();
              } else {
                resetChallengeForm();
                setShowChallengeForm(true);
              }
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-md"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #ec4899))',
              color: '#ffffff',
            }}
          >
            {showChallengeForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showChallengeForm ? 'Cancel' : 'New Challenge'}</span>
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            {statusMsg}
          </span>
          <button type="button" onClick={() => setStatusMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </span>
          <button type="button" onClick={() => setErrorMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== CHALLENGES TAB ==================== */}
      {subTab === 'challenges' && (
        <div className="space-y-4">
          {showChallengeForm && (
            <form
              onSubmit={handleSaveChallenge}
              className="rounded-2xl border p-4 sm:p-5 space-y-4"
              style={{
                backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.04))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
              }}
            >
              <h3 className="font-extrabold text-base">
                {editingChallengeId ? 'Edit Weekly Challenge' : 'Create Weekly Challenge'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">Title *</label>
                  <input
                    required
                    type="text"
                    value={chTitle}
                    onChange={(e) => setChTitle(e.target.value)}
                    maxLength={120}
                    placeholder="Afro Street Style Week"
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">Theme Hashtag *</label>
                  <input
                    required
                    type="text"
                    value={chHashtag}
                    onChange={(e) => setChHashtag(e.target.value)}
                    maxLength={60}
                    placeholder="#WaveStreetStyle"
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold opacity-80 mb-1">Description *</label>
                <textarea
                  required
                  rows={2}
                  value={chDescription}
                  onChange={(e) => setChDescription(e.target.value)}
                  maxLength={1000}
                  placeholder="Show your boldest outfit or street look this week!"
                  className="w-full p-3 rounded-xl border text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                    borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    color: 'var(--text-primary, #ffffff)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold opacity-80 mb-1">Rules (optional)</label>
                <textarea
                  rows={2}
                  value={chRules}
                  onChange={(e) => setChRules(e.target.value)}
                  maxLength={1000}
                  placeholder="Original content only. One challenge per post. Respect WaveLink safety rules."
                  className="w-full p-3 rounded-xl border text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                    borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    color: 'var(--text-primary, #ffffff)',
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">Entry Type</label>
                  <select
                    value={chType}
                    onChange={(e) => setChType(e.target.value as ChallengeEntryType)}
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  >
                    <option value="any">Any (Photo, Video, Text)</option>
                    <option value="photo">Photo Only</option>
                    <option value="video">Video Only</option>
                    <option value="text">Text Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">
                    Max Entries / User
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={chMaxEntries}
                    onChange={(e) => setChMaxEntries(e.target.value)}
                    placeholder="3"
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">Prize Badge</label>
                  <select
                    value={chBadgeId}
                    onChange={(e) => setChBadgeId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  >
                    <option value="weekly_winner">Built-in: Challenge Champion</option>
                    {badges.map((b) => (
                      <option key={b.id} value={b.id}>
                        Custom: {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">Start Date</label>
                  <input
                    type="datetime-local"
                    value={chStartDate}
                    onChange={(e) => setChStartDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold opacity-80 mb-1">
                    End Date (default 1 week)
                  </label>
                  <input
                    type="datetime-local"
                    value={chEndDate}
                    onChange={(e) => setChEndDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  />
                </div>
              </div>

              {/* Cover image upload */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold opacity-80">Cover Image (optional)</label>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    }}
                  >
                    {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{uploadingCover ? 'Uploading...' : 'Upload cover'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadCover} />
                  </label>
                  {chCoverUrl && (
                    <button
                      type="button"
                      onClick={() => setChCoverUrl('')}
                      className="min-h-[44px] px-3 rounded-xl border text-xs opacity-75"
                      style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))' }}
                    >
                      Remove image
                    </button>
                  )}
                </div>
                {chCoverUrl && (
                  <img
                    src={chCoverUrl}
                    alt="Challenge cover preview"
                    className="w-full h-32 object-cover rounded-xl border border-white/15"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={savingChallenge}
                className="w-full min-h-[48px] rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #ec4899))',
                  color: '#ffffff',
                }}
              >
                {savingChallenge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{savingChallenge ? 'Saving...' : editingChallengeId ? 'Save Changes' : 'Launch Weekly Challenge'}</span>
              </button>
            </form>
          )}

          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm opacity-75">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading challenges...
            </div>
          ) : challenges.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center space-y-2"
              style={{
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))',
              }}
            >
              <Trophy className="w-9 h-9 mx-auto text-amber-400 opacity-75" />
              <p className="font-bold">No Weekly Challenges Yet</p>
              <p className="text-xs opacity-70">
                Create your first weekly challenge to energize creators and award custom badges.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenges.map((ch) => {
                const cd = formatCountdownParts(ch.endDate || ch.deadline);
                const badge = resolveUnifiedBadge(ch.badgeId);
                const hasWinners = Boolean(ch.winners?.length || ch.winnerUserId);
                return (
                  <div
                    key={ch.id}
                    className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    style={{
                      backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.04))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-md uppercase ${
                            ch.status === 'active' && !cd.expired
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-500/20 text-slate-300'
                          }`}
                        >
                          {ch.status === 'active' && !cd.expired ? cd.compact : 'Completed'}
                        </span>
                        <span className="opacity-70">{ch.hashtag}</span>
                        <span className="opacity-65 uppercase">• {ch.type || 'any'}</span>
                      </div>
                      <h4 className="font-extrabold text-sm sm:text-base truncate">
                        {ch.title || ch.theme}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3 text-xs opacity-75 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {ch.participantsCount || 0} participants
                        </span>
                        <span>{ch.entriesCount || 0} entries</span>
                        {badge ? (
                          <span className="inline-flex items-center gap-1">
                            <BadgeIconGlyph badge={badge} size="xs" />
                            {badge.name}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openChooseWinner(ch)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
                          color: '#ffffff',
                        }}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        Choose winner
                      </button>

                      {hasWinners && (
                        <button
                          type="button"
                          onClick={() => setWinnersWallChallenge(ch)}
                          className="min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5"
                          style={{
                            backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                            borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                          }}
                        >
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          Wall
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => startEditChallenge(ch)}
                        aria-label="Edit challenge"
                        className="min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center"
                        style={{
                          backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                          borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                        }}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== CUSTOM BADGES TAB ==================== */}
      {subTab === 'badges' && (
        <div className="space-y-5">
          <form
            onSubmit={handleSaveBadge}
            className="rounded-2xl border p-4 sm:p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.04))',
              borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-base">
                {badgeEditId ? 'Edit Custom Badge' : 'Create Custom Badge'}
              </h3>
              <div className="flex items-center gap-2">
                <BadgeIconGlyph
                  iconName={badgeIcon}
                  imageUrl={badgeImageUrl || undefined}
                  color={badgeColor}
                  size="md"
                  title={badgeName || 'Preview'}
                />
                <span className="text-xs font-bold max-w-[140px] truncate">
                  {badgeName || 'Badge Preview'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold opacity-80 mb-1">Badge Name *</label>
                <input
                  required
                  type="text"
                  value={badgeName}
                  onChange={(e) => setBadgeName(e.target.value)}
                  maxLength={60}
                  placeholder="Street Style Legend"
                  className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                    borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    color: 'var(--text-primary, #ffffff)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold opacity-80 mb-1">
                  Link to Challenge (optional)
                </label>
                <select
                  value={badgeChallengeId}
                  onChange={(e) => setBadgeChallengeId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                    borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    color: 'var(--text-primary, #ffffff)',
                  }}
                >
                  <option value="">None (Standalone Badge)</option>
                  {challenges.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title || ch.theme} ({ch.hashtag})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold opacity-80 mb-1">Description</label>
              <input
                type="text"
                value={badgeDesc}
                onChange={(e) => setBadgeDesc(e.target.value)}
                maxLength={240}
                placeholder="Awarded to winners of Afro Street Style Week."
                className="w-full min-h-[44px] px-3 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                  color: 'var(--text-primary, #ffffff)',
                }}
              />
            </div>

            {/* Color Swatches */}
            <div>
              <label className="block text-xs font-semibold opacity-80 mb-1.5">Badge Color</label>
              <div className="flex flex-wrap gap-2">
                {CURATED_BADGE_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setBadgeColor(hex)}
                    aria-label={`Select color ${hex}`}
                    className="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform"
                    style={{
                      backgroundColor: hex,
                      borderColor: badgeColor === hex ? '#ffffff' : 'transparent',
                      transform: badgeColor === hex ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    {badgeColor === hex && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon Set OR Custom Uploaded Image */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold opacity-80">
                  Choose Icon OR Upload Custom Image
                </label>
                <div className="flex items-center gap-2">
                  <label
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                      borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))',
                    }}
                  >
                    {uploadingBadgeImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    <span>{uploadingBadgeImg ? 'Uploading...' : 'Upload Image'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadBadgeImage} />
                  </label>
                  {badgeImageUrl && (
                    <button
                      type="button"
                      onClick={() => setBadgeImageUrl('')}
                      className="text-xs underline opacity-75"
                    >
                      Use icon instead
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {CURATED_BADGE_ICON_KEYS.map((key) => {
                  const selected = !badgeImageUrl && badgeIcon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setBadgeImageUrl('');
                        setBadgeIcon(key);
                      }}
                      className="min-h-[44px] rounded-xl border flex items-center justify-center transition-all"
                      style={{
                        borderColor: selected ? badgeColor : 'var(--border-subtle, rgba(255,255,255,0.12))',
                        backgroundColor: selected ? `${badgeColor}24` : 'var(--bg-subtle, rgba(255,255,255,0.04))',
                      }}
                      title={key}
                    >
                      <BadgeIconGlyph iconName={key} color={badgeColor} size="sm" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingBadge}
                className="flex-1 min-h-[46px] rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #ec4899))',
                  color: '#ffffff',
                }}
              >
                {savingBadge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                <span>{savingBadge ? 'Saving...' : badgeEditId ? 'Save Badge' : 'Create Badge'}</span>
              </button>
              {badgeEditId && (
                <button
                  type="button"
                  onClick={() => {
                    setBadgeEditId(null);
                    setBadgeName('');
                    setBadgeDesc('');
                    setBadgeImageUrl('');
                    setBadgeChallengeId('');
                  }}
                  className="min-h-[46px] px-4 rounded-xl border text-sm font-semibold"
                  style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Existing Custom Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badges.length === 0 ? (
              <div
                className="sm:col-span-2 rounded-2xl border p-6 text-center text-sm opacity-75"
                style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
              >
                No custom badges created yet. Create one above to award challenge winners!
              </div>
            ) : (
              badges.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border p-3.5 flex items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.04))',
                    borderColor: 'var(--border-subtle, rgba(255,255,255,0.12))',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BadgeIconGlyph
                      iconName={b.iconName}
                      imageUrl={b.imageUrl || undefined}
                      color={b.color}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{b.name}</p>
                      <p className="text-xs opacity-70 line-clamp-1">{b.description}</p>
                      {b.challengeTitle && (
                        <p className="text-[11px] opacity-60 flex items-center gap-1 mt-0.5 truncate">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {b.challengeTitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setBadgeEditId(b.id);
                        setBadgeName(b.name);
                        setBadgeDesc(b.description);
                        setBadgeColor(b.color);
                        setBadgeIcon(b.iconName || 'trophy');
                        setBadgeImageUrl(b.imageUrl || '');
                        setBadgeChallengeId(b.challengeId || '');
                      }}
                      aria-label={`Edit ${b.name}`}
                      className="min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center"
                      style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.14))' }}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={deletingBadgeId === b.id}
                      onClick={() => handleDeleteBadge(b.id)}
                      aria-label={`Delete ${b.name}`}
                      className="min-w-[40px] min-h-[40px] rounded-xl border border-rose-500/30 text-rose-300 flex items-center justify-center"
                    >
                      {deletingBadgeId === b.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Winners Wall Modal */}
      <WinnersWallView
        challenge={winnersWallChallenge}
        onClose={() => setWinnersWallChallenge(null)}
        onViewProfile={onViewProfile}
      />
    </div>
  );
};
