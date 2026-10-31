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
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { Announcement } from '../types';
import { RichEventCard } from './RichEventCard';
import { compressImage } from '../utils/mediaStorage';
import {
  CalendarDays,
  Calendar,
  Clock,
  MapPin,
  Image as ImageIcon,
  PlusCircle,
  X,
  Megaphone,
  Church,
  Pin,
  Send,
  Loader2,
  CheckCircle2,
  Search,
  AlertCircle
} from 'lucide-react';

export const AnnouncementsView: React.FC = () => {
  const { currentUser, userProfile, isAdmin, isProEffective, showGlobalToast } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'event' | 'schedule' | 'announcement'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Creator Modal / Form state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'announcement' | 'event' | 'schedule'>('event');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [postSuccessBanner, setPostSuccessBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Announcement[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Announcement));
        // Sort pinned notices first, then newest
        list.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setAnnouncements(list);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Notice board listener notice:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    setFormError(null);
    setIsCompressingImage(true);
    try {
      // Compress and optimize image via Canvas so it safely fits in Firestore (< 450KB)
      const compressedDataUrl = await compressImage(file, 1280, 720, 0.82);
      setImagePreview(compressedDataUrl);
    } catch (err) {
      console.error('Image compression error:', err);
      setFormError('Could not process event banner image. Please try another photo.');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentUser) {
      setFormError('You must be signed in to post an event.');
      return;
    }

    if (!title.trim() || !content.trim()) {
      setFormError('Please provide both an Event Title and Description.');
      return;
    }

    setIsSubmitting(true);
    try {
      const id = `notice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const isOfficialPartner = Boolean(
        userProfile?.isOfficialPartner ||
          userProfile?.partnerType ||
          isProEffective ||
          isAdmin ||
          currentUser.email === 'keylanmbilinyi5@gmail.com'
      );

      const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : 'member';
      const newNotice: Record<string, any> = {
        id,
        authorId: currentUser.uid,
        authorEmail: currentUser.email || '',
        authorName: userProfile?.displayName || currentUser.displayName || 'Community Organizer',
        authorUsername: userProfile?.username || `@${emailPrefix}`,
        authorPhotoURL:
          userProfile?.photoURL ||
          currentUser.photoURL ||
          `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser.uid}`,
        title: title.trim(),
        content: content.trim(),
        priority,
        type,
        rsvpUserIds: [currentUser.uid],
        rsvpCount: 1,
        isPinned: isAdmin ? isPinned : false,
        isOfficialPartner,
        partnerBadgeTitle:
          userProfile?.partnerBadgeTitle ||
          (isAdmin ? 'Official Admin' : isProEffective ? 'Verified Pro Organizer' : 'Community Organizer'),
        createdAt: new Date().toISOString()
      };

      if (eventDate.trim()) newNotice.eventDate = eventDate.trim();
      if (eventTime.trim()) newNotice.eventTime = eventTime.trim();
      if (eventLocation.trim()) newNotice.eventLocation = eventLocation.trim();
      if (imagePreview) newNotice.imageUrl = imagePreview;
      if (userProfile?.partnerType || type === 'schedule') {
        newNotice.partnerType = userProfile?.partnerType || 'church';
      }

      // Use cleanFirestoreData to guarantee zero undefined fields before writing to Firestore
      await setDoc(doc(db, 'announcements', id), cleanFirestoreData(newNotice));

      const postedTitle = title.trim();

      // Reset Form
      setTitle('');
      setContent('');
      setEventDate('');
      setEventTime('');
      setEventLocation('');
      setImagePreview(null);
      setIsPinned(false);
      setPriority('normal');
      setIsCreateModalOpen(false);
      setActiveFilter('all');

      setPostSuccessBanner(`"${postedTitle}" has been published to the Community Notice Board!`);
      if (showGlobalToast) {
        showGlobalToast('Event published to Notice Board!');
      }
      setTimeout(() => setPostSuccessBanner(null), 5000);
    } catch (err: any) {
      console.error('Failed to publish event to Notice Board:', err);
      setFormError('Could not publish event. Please check your connection and try again.');
      handleFirestoreError(err, OperationType.CREATE, 'announcements');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRsvp = async (id: string) => {
    if (!currentUser) return;
    const target = announcements.find((a) => a.id === id);
    if (!target) return;

    const currentList = target.rsvpUserIds || [];
    const alreadyGoing = currentList.includes(currentUser.uid);
    const nextCount = alreadyGoing
      ? Math.max(0, currentList.length - 1)
      : currentList.length + 1;
    const docRef = doc(db, 'announcements', id);

    try {
      await updateDoc(docRef, {
        rsvpUserIds: alreadyGoing
          ? arrayRemove(currentUser.uid)
          : arrayUnion(currentUser.uid),
        rsvpCount: nextCount
      });
    } catch (err) {
      console.error('Failed to update RSVP:', err);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    const target = announcements.find((a) => a.id === id);
    if (!target) return;
    if (!isAdmin && target.authorId !== currentUser?.uid) return;

    try {
      await deleteDoc(doc(db, 'announcements', id));
      if (showGlobalToast) {
        showGlobalToast('Event removed from Notice Board.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  };

  // Filtered list
  const filteredAnnouncements = announcements.filter((item) => {
    const matchesCategory =
      activeFilter === 'all'
        ? true
        : activeFilter === 'event'
        ? item.type === 'event' || Boolean(item.eventDate)
        : activeFilter === 'schedule'
        ? item.type === 'schedule' || item.partnerType === 'church'
        : item.type === 'announcement' || (!item.type && !item.eventDate);

    if (!matchesCategory) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.content || '').toLowerCase().includes(q) ||
      (item.eventLocation || '').toLowerCase().includes(q) ||
      (item.authorName || '').toLowerCase().includes(q)
    );
  });

  const eventCount = announcements.filter((a) => a.type === 'event' || Boolean(a.eventDate)).length;
  const scheduleCount = announcements.filter((a) => a.type === 'schedule' || a.partnerType === 'church').length;
  const bulletinCount = announcements.filter((a) => a.type === 'announcement' || (!a.type && !a.eventDate)).length;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Clean Pure White Architectural Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.04)] flex items-center justify-between flex-wrap gap-5">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <CalendarDays size={14} className="text-blue-600" />
            <span>Community Notice Board</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Events, Schedules &amp; Bulletins
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Publish upcoming community events, church schedules, and official announcements. Members can RSVP in real time and share event cards across the network.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setIsCreateModalOpen(true);
            }}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 transition whitespace-nowrap"
          >
            <PlusCircle size={17} />
            <span>Post Event / Notice</span>
          </button>
        </div>
      </div>

      {/* Confirmation Banner after Posting an Event */}
      {postSuccessBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{postSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setPostSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter Tabs + Live Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            All ({announcements.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('event')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'event'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar size={13} />
            <span>Events ({eventCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('schedule')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'schedule'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Church size={13} />
            <span>Schedules ({scheduleCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('announcement')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'announcement'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Megaphone size={13} />
            <span>Bulletins ({bulletinCount})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by title or venue..."
            className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Announcements & Events Feed List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-16 text-center bg-white border border-slate-200/90 rounded-2xl text-slate-500 text-xs flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-blue-600" />
            <span>Loading community notice board...</span>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200/90 rounded-2xl p-8 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-3">
              <CalendarDays size={24} />
            </div>
            <h4 className="text-base font-extrabold text-slate-900">
              No Events or Notices Found
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Be the first to publish an upcoming community event, gathering, or service schedule on the Notice Board.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs"
            >
              <PlusCircle size={15} />
              <span>Post First Event</span>
            </button>
          </div>
        ) : (
          filteredAnnouncements.map((ann) => (
            <RichEventCard
              key={ann.id}
              announcement={ann}
              onRsvp={handleToggleRsvp}
              onDelete={handleDeleteNotice}
            />
          ))
        )}
      </div>

      {/* Create Event / Notice Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs">
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-600 text-white">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Post Community Event or Notice
                  </h3>
                  <p className="text-xs text-slate-500">
                    Published immediately to the WaveLink Notice Board
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNotice} className="p-5 sm:p-6 overflow-y-auto space-y-4 bg-white">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Category Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Notice Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('event')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      type === 'event'
                        ? 'border-blue-600 bg-blue-50/80 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar size={15} />
                    <span>Event</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('schedule')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      type === 'schedule'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Church size={15} />
                    <span>Schedule</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('announcement')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      type === 'announcement'
                        ? 'border-amber-600 bg-amber-50/80 text-amber-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Megaphone size={15} />
                    <span>Bulletin</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Event / Notice Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dar Tech Creators Meetup & Demo Day"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {/* Formatted Event Metadata: Date, Time, Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar size={13} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      placeholder="e.g. Sat, Nov 14"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Time
                  </label>
                  <div className="relative">
                    <Clock size={13} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      placeholder="e.g. 2:00 PM EAT"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Venue / Location
                  </label>
                  <div className="relative">
                    <MapPin size={13} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="e.g. Mlimani City Hall"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* Message Details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description &amp; Program Details <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share the event agenda, speakers, entry details, or important instructions..."
                  className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-none leading-relaxed"
                />
              </div>

              {/* Priority & Header Banner Image Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <div className="flex rounded-xl bg-slate-50 border border-slate-200 p-1">
                    <button
                      type="button"
                      onClick={() => setPriority('normal')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        priority === 'normal'
                          ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                          : 'text-slate-500'
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority('urgent')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        priority === 'urgent'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Urgent
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Event Banner Photo (Stored in Firestore)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isCompressingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition"
                  >
                    {isCompressingImage ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-blue-600" />
                        <span>Optimizing Photo...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={14} className="text-blue-600" />
                        <span>{imagePreview ? 'Change Banner Photo' : 'Upload Banner Photo'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {imagePreview && (
                <div className="relative rounded-xl overflow-hidden aspect-21/9 bg-slate-100 border border-slate-200">
                  <img
                    src={imagePreview}
                    alt="Event banner preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/75 text-white hover:bg-slate-900 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Admin Options: Pin to Top */}
              {isAdmin && (
                <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Pin size={16} className="text-blue-600 rotate-45" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Pin to Top of Notice Board &amp; Home Feed
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Highlights this event at the top of the community feed
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isCompressingImage || !title.trim() || !content.trim()}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Publishing Event...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Post Event Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
