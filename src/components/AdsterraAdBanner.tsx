import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { shouldShowAds } from './AdsterraManager';
import { Crown, Sparkles, X, ExternalLink, Shield, Zap, Megaphone } from 'lucide-react';

interface AdsterraBannerProps {
  onOpenUpgradeModal?: () => void;
  variant?: 'feed' | 'sidebar' | 'social_bar';
  slotId?: string;
}

/**
 * Conditional Adsterra Ad Unit
 * Strictly HIDES if:
 * - user.isPro === true (paid Pro monthly plan)
 * - user has a Blue Star badge / is verified by admin
 * - user.role === 'admin' / super_admin / sub_admin
 * Renders only for regular, non-paying (free) users.
 */
export const AdsterraAdBanner: React.FC<AdsterraBannerProps> = ({
  onOpenUpgradeModal,
  variant = 'feed',
  slotId = 'slot_1'
}) => {
  const { userProfile, isAdmin, isVerified } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  // If user is Pro, Blue Star, or Admin -> NEVER SHOW ADS
  if (!shouldShowAds(userProfile, isAdmin, isVerified) || isDismissed) {
    return null;
  }

  const ADSTERRA_LINK = 'https://bicea.org/14/7e645d935c503875ebc92cbe20bfda35';

  // 1. Social Bar Format (Floating Notification / Bottom Bar)
  if (variant === 'social_bar') {
    return (
      <div className="fixed bottom-16 md:bottom-5 right-4 z-40 max-w-sm w-[calc(100vw-2rem)] sm:w-80 animate-in slide-in-from-bottom duration-300">
        <div className="bg-white/95 backdrop-blur-xl border border-blue-200/80 rounded-3xl p-4 shadow-xl text-slate-800">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-blue-50 text-blue-600 border border-blue-200/80">
                Adsterra Social Bar
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Sponsored</span>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-xl transition"
              title="Close Ad"
            >
              <X size={13} />
            </button>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm text-white">
              <Zap size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-900 truncate">Trending Across East Africa</h5>
              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                Exclusive digital creator sponsorships &amp; tools powered by Adsterra.
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <a
              href={ADSTERRA_LINK}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <span>Explore Partner</span>
              <ExternalLink size={12} />
            </a>

            {onOpenUpgradeModal && (
              <button
                type="button"
                onClick={onOpenUpgradeModal}
                className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-[10px] font-extrabold text-white flex items-center gap-1 shadow-xs transition active:scale-95"
              >
                <Crown size={11} />
                <span>Go Ad-Free</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Live Adsterra Banner Unit inside Desktop Sidebar
  if (variant === 'sidebar') {
    return (
      <div className="p-3.5 mx-2 my-2.5 rounded-3xl bg-gradient-to-br from-blue-50/80 via-white to-emerald-50/70 border border-blue-200/70 text-slate-800 shadow-sm transition hover:border-blue-300">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-blue-100/80">
          <div className="flex items-center gap-1.5 text-[10px] text-blue-600 font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Adsterra Live Network</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100/70 text-blue-700 font-semibold">
            Partner Ad
          </span>
        </div>

        {/* Live Clickable Creative Unit */}
        <a
          href={ADSTERRA_LINK}
          target="_blank"
          rel="noreferrer noopener"
          className="block group"
        >
          <div className="rounded-2xl p-3 bg-white border border-slate-200/90 shadow-2xs group-hover:border-blue-400 transition">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                <Megaphone size={14} />
              </div>
              <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600 transition truncate">
                Creator Offers &amp; Rewards
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Discover verified deals and monetization tools. Sponsored by Adsterra.
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-blue-600">
              <span>View Offer</span>
              <ExternalLink size={12} className="group-hover:translate-x-0.5 transition" />
            </div>
          </div>
        </a>

        {/* Upgrade Prompt */}
        {onOpenUpgradeModal && (
          <div className="mt-2.5 pt-2 border-t border-blue-100/60 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">Free Account</span>
            <button
              type="button"
              onClick={onOpenUpgradeModal}
              className="text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition"
            >
              <Crown size={11} />
              <span>Hide Ads (WaveLink Pro)</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 3. Default Native In-Feed Banner Format
  return (
    <div
      id={`adsterra-feed-${slotId}`}
      className="w-full my-4 rounded-3xl border border-blue-200/70 bg-gradient-to-br from-white via-blue-50/30 to-emerald-50/40 p-4 sm:p-5 overflow-hidden text-slate-800 shadow-sm transition hover:shadow-md hover:border-blue-300"
    >
      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-700 border border-blue-200/80">
            Sponsored • Adsterra Network
          </span>
          <span className="text-xs text-slate-400 font-medium">Verified Partner</span>
        </div>

        {onOpenUpgradeModal && (
          <button
            type="button"
            onClick={onOpenUpgradeModal}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 transition hover:bg-emerald-100"
          >
            <Crown size={12} />
            <span>Remove All Ads</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-md">
          <h4 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Sparkles size={16} className="text-blue-500" />
            <span>Grow Your Reach &amp; Monetize Online</span>
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            High-converting digital opportunities and creator sponsorships curated by the Adsterra ad network.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <a
            href={ADSTERRA_LINK}
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 font-extrabold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <span>Visit Sponsor</span>
            <ExternalLink size={13} />
          </a>

          {onOpenUpgradeModal && (
            <button
              type="button"
              onClick={onOpenUpgradeModal}
              className="px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1 transition shadow-2xs"
              title="Upgrade to WaveLink Pro to hide ads"
            >
              <Shield size={13} className="text-emerald-500" />
              <span>Ad-Free</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
