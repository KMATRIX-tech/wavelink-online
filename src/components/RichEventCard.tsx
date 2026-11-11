import React, { useState } from 'react';
import { Announcement } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { CrystalBadge } from './CrystalBadge';
import {
  getAfricanCountryMeta,
  formatEventInViewerLocalTime
} from '../utils/africanCultureConfig';
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
  BookmarkCheck
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
  const { language, t } = useLanguage();
  const [isCopied, setIsCopied] = useState(false);
  const [isReminderSet, setIsReminderSet] = useState(false);
  const countryMeta = announcement.countryCode
    ? getAfricanCountryMeta(announcement.countryCode)
    : null;
  const formattedLocalDateTime = formatEventInViewerLocalTime(
    announcement.eventDate,
    announcement.eventTime,
    language === 'sw' ? 'sw' : 'en'
  );

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

  // Compact pinned notice card for the home feed with a single small badge
  if (isFeedBanner) {
    return (
      <article className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-4 shadow-2xs transition">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#2563EB] border border-blue-200/70">
                <Pin size={10} className="text-[#2563EB]" />
                <span>{language === 'sw' ? 'Tangazo la Jamii' : 'Pinned Notice'}</span>
              </span>
              {countryMeta && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200/70">
                  <span>{countryMeta.flag}</span>
                  <span>{language === 'sw' ? countryMeta.nameSw : countryMeta.nameEn}</span>
                </span>
              )}
              {(announcement.eventDate || announcement.eventTime) && (
                <span className="text-[11px] text-[#78716C] font-bold truncate">
                  {formattedLocalDateTime} ({t('events.localTimeLabel')})
                </span>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1C1917] leading-snug truncate">
              {announcement.title}
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5 line-clamp-2 leading-relaxed">
              {announcement.content || announcement.body}
            </p>
          </div>

          {onRsvp && (
            <button
              type="button"
              onClick={() => onRsvp(announcement.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition active:scale-95 ${
                isRsvped
                  ? 'bg-[#0D9488] text-white'
                  : 'bg-[#FAF7F2] hover:bg-blue-50 text-[#2563EB] border border-[#EFECE6]'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>{isRsvped ? 'Going' : 'RSVP'}</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs overflow-hidden flex flex-col">
      {announcement.imageUrl && (
        <div className="relative w-full aspect-21/9 max-h-60 overflow-hidden bg-[#FAF7F2] border-b border-[var(--border-hairline)]">
          <img
            src={announcement.imageUrl}
            alt={announcement.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-5 sm:p-6 flex-1 flex flex-col space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={
                announcement.authorPhotoURL ||
                `https://api.dicebear.com/7.x/shapes/svg?seed=${announcement.authorId}`
              }
              alt={announcement.authorName}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-[#EFECE6] shrink-0"
            />
            <div className="min-w-0">
              <CrystalBadge
                email={announcement.authorEmail}
                name={announcement.authorName}
                size="sm"
              />
              <div className="text-[11px] text-[#78716C] mt-0.5">
                {new Date(announcement.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {announcement.isPinned && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-[#2563EB] border border-blue-200/80">
                <Pin size={11} />
                <span>Pinned</span>
              </span>
            )}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(announcement.id)}
                className="p-2 text-[#78716C] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                title="Delete Notice"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-extrabold text-[#1C1917] tracking-tight leading-snug">
            {announcement.title}
          </h3>
          <p className="text-sm text-[#57534E] mt-1.5 leading-relaxed whitespace-pre-line">
            {announcement.content || announcement.body}
          </p>
        </div>

        {(announcement.eventDate ||
          announcement.eventTime ||
          announcement.eventLocation) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {(announcement.eventDate || announcement.eventTime) && (
              <div className="sm:col-span-2 flex items-center gap-2.5 p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917]">
                <Clock size={15} className="text-[#0D9488] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-[#78716C]">
                    {t('events.localTimeLabel')}
                  </div>
                  <div className="truncate font-bold text-xs">
                    {formattedLocalDateTime}
                  </div>
                </div>
              </div>
            )}

            {announcement.eventLocation && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917]">
                <MapPin size={15} className="text-[#D97706] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-[#78716C]">Location</div>
                  <div className="truncate font-bold text-xs">
                    {countryMeta ? `${countryMeta.flag} ` : ''}
                    {announcement.eventLocation}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-[#EFECE6] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {onRsvp && (
              <button
                type="button"
                onClick={() => onRsvp(announcement.id)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                  isRsvped
                    ? 'bg-[#0D9488] text-white'
                    : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                }`}
              >
                <CheckCircle2 size={14} />
                <span>{isRsvped ? 'Going (RSVPed)' : 'RSVP to Attend'}</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs font-bold text-[#78716C] px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#EFECE6]">
              <Users size={14} />
              <span>{rsvpCount} Going</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsReminderSet((p) => !p)}
              className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                isReminderSet
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-[#EFECE6] text-[#78716C] hover:bg-[#FAF7F2]'
              }`}
            >
              {isReminderSet ? <BookmarkCheck size={14} /> : <Bell size={14} />}
              <span>{isReminderSet ? 'Reminder Set' : 'Remind'}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-white border border-[#EFECE6] text-[#78716C] hover:bg-[#FAF7F2] text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Share2 size={14} />
              <span>{isCopied ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
