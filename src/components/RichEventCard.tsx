import React, { useState } from 'react';
import { Announcement } from '../types';
import { useAuth } from '../context/AuthContext';
import { CrystalBadge } from './CrystalBadge';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Share2,
  Bell,
  Pin,
  Trash2,
  Building2,
  BookmarkCheck,
  Megaphone,
  Church
} from 'lucide-react';

interface RichEventCardProps {
  announcement: Announcement;
  onRsvp?: (id: string) => void;
  onDelete?: (id: string) => void;
  isFeedBanner?: boolean;
}

export const RichEventCard: React.FC<RichEventCardProps> = ({
  announcement,
  onRsvp,
  onDelete,
  isFeedBanner = false
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [isCopied, setIsCopied] = useState(false);
  const [isReminderSet, setIsReminderSet] = useState(false);

  const isRsvped = Boolean(
    currentUser && announcement.rsvpUserIds?.includes(currentUser.uid)
  );

  const rsvpCount =
    (announcement.rsvpUserIds?.length ?? announcement.rsvpCount) || 0;

  const canDelete = Boolean(
    onDelete &&
      (isAdmin || (currentUser && announcement.authorId === currentUser.uid))
  );

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = `${announcement.title} - WaveLink Notice Board`;
    const shareText = `${announcement.title}\n${announcement.eventLocation || ''} • ${announcement.eventDate || ''}`;

    if (navigator?.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      } catch (_) {
        // Fallback to clipboard
      }
    }

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(`${shareTitle}\n${shareText}\n${shareUrl}`);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    }
  };

  const handleToggleReminder = () => {
    setIsReminderSet((prev) => !prev);
  };

  const categoryBadge = () => {
    if (announcement.type === 'schedule' || announcement.partnerType === 'church') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <Church size={12} className="text-emerald-600" />
          <span>Church &amp; Service Schedule</span>
        </span>
      );
    }
    if (announcement.type === 'announcement' && !announcement.eventDate) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
          <Megaphone size={12} className="text-amber-600" />
          <span>Official Notice</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
        <Calendar size={12} className="text-blue-600" />
        <span>Community Event</span>
      </span>
    );
  };

  return (
    <article
      className={`rounded-2xl bg-white border transition-all duration-200 overflow-hidden flex flex-col ${
        isFeedBanner
          ? 'border-blue-300 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.10)]'
          : 'border-slate-200/90 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_6px_24px_-4px_rgba(15,23,42,0.07)]'
      }`}
    >
      {/* Top Pinned Banner */}
      {announcement.isPinned && (
        <div className="bg-blue-600 px-5 py-2 text-white flex items-center justify-between text-xs font-bold tracking-wide">
          <div className="flex items-center gap-1.5">
            <Pin size={13} className="fill-white rotate-45" />
            <span className="uppercase text-[11px] tracking-wider">
              Pinned Notice Board Highlight
            </span>
          </div>
          <span className="text-[10px] bg-white/20 px-2.5 py-0.5 rounded-md uppercase font-extrabold">
            Featured
          </span>
        </div>
      )}

      {/* Optional Header Event Banner Image */}
      {announcement.imageUrl && (
        <div className="relative w-full aspect-21/9 max-h-64 overflow-hidden bg-slate-50 border-b border-slate-100">
          <img
            src={announcement.imageUrl}
            alt={announcement.title}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.01]"
            loading="lazy"
          />
        </div>
      )}

      {/* Card Content Area */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col space-y-4 bg-white">
        {/* Top Category & Author Row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={
                announcement.authorPhotoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${announcement.authorId}`
              }
              alt={announcement.authorName}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CrystalBadge
                  email={announcement.authorEmail}
                  name={announcement.authorName}
                  size="sm"
                />

                {(announcement.isOfficialPartner ||
                  announcement.partnerType ||
                  announcement.authorEmail === 'keylanmbilinyi5@gmail.com') && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                    title="Verified Community Organizer"
                  >
                    <Building2 size={11} className="text-emerald-600" />
                    <span>
                      {announcement.partnerBadgeTitle ||
                        (announcement.partnerType === 'church'
                          ? 'Church Leader'
                          : 'Verified Organizer')}
                    </span>
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono tabular-numbers">
                <span>
                  Posted{' '}
                  {new Date(announcement.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
                {announcement.priority === 'urgent' && (
                  <span className="text-[10px] font-sans font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 uppercase">
                    Urgent Priority
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {categoryBadge()}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(announcement.id)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                title="Delete Notice / Event"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Headline & Body Text */}
        <div>
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
            {announcement.title}
          </h3>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
            {announcement.content}
          </p>
        </div>

        {/* Structured Event Metadata Strip (Date, Time, Venue) */}
        {(announcement.eventDate ||
          announcement.eventTime ||
          announcement.eventLocation) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {announcement.eventDate && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-900">
                <div className="p-2 rounded-lg bg-white border border-slate-200/80 text-blue-600 shrink-0 shadow-2xs">
                  <Calendar size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Event Date
                  </div>
                  <div className="truncate font-bold text-xs text-slate-900 font-mono tabular-numbers">
                    {announcement.eventDate}
                  </div>
                </div>
              </div>
            )}

            {announcement.eventTime && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-900">
                <div className="p-2 rounded-lg bg-white border border-slate-200/80 text-emerald-600 shrink-0 shadow-2xs">
                  <Clock size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Start Time
                  </div>
                  <div className="truncate font-bold text-xs text-slate-900 font-mono tabular-numbers">
                    {announcement.eventTime}
                  </div>
                </div>
              </div>
            )}

            {announcement.eventLocation && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-900">
                <div className="p-2 rounded-lg bg-white border border-slate-200/80 text-amber-600 shrink-0 shadow-2xs">
                  <MapPin size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Venue / Location
                  </div>
                  <div className="truncate font-bold text-xs text-slate-900">
                    {announcement.eventLocation}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons & RSVP Counter Footer */}
        <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {onRsvp && (
              <button
                type="button"
                onClick={() => onRsvp(announcement.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 whitespace-nowrap ${
                  isRsvped
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                }`}
              >
                <CheckCircle2
                  size={14}
                  className={isRsvped ? 'fill-white text-emerald-600' : ''}
                />
                <span>{isRsvped ? 'Attending (RSVPed)' : 'RSVP to Attend'}</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 font-mono tabular-numbers">
              <Users size={14} className="text-slate-400" />
              <span>
                {rsvpCount} {rsvpCount === 1 ? 'Member' : 'Members'} Going
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleReminder}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition active:scale-95 whitespace-nowrap ${
                isReminderSet
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Set Event Reminder"
            >
              {isReminderSet ? (
                <>
                  <BookmarkCheck size={14} className="text-amber-600" />
                  <span>Reminder Set</span>
                </>
              ) : (
                <>
                  <Bell size={14} className="text-slate-500" />
                  <span>Remind Me</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 whitespace-nowrap"
              title="Share Event / Notice"
            >
              <Share2 size={14} className="text-slate-500" />
              <span>{isCopied ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
