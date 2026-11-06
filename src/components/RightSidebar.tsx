import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ActiveTab, UserProfile } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { LegalModal, LegalDocType } from './LegalModals';
import {
  Crown,
  TrendingUp,
  Zap,
  HandCoins,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Users,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';

interface RightSidebarProps {
  onNavigateTab: (tab: ActiveTab) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const TRENDING_TOPICS = [
  { tag: '#WaveLinkTZ', category: 'Social & Trending', waves: '18.4k waves' },
  { tag: '#AirtelMoneyTZ', category: 'Mobile Payments', waves: '12.1k waves' },
  { tag: '#BongoCreatives', category: 'Music & Reels', waves: '9.8k waves' },
  { tag: '#DarTech2026', category: 'Innovation & AI', waves: '6.5k waves' },
  { tag: '#PostBoostTZ', category: 'Monetization', waves: '4.2k waves' },
];

export const RightSidebar: React.FC<RightSidebarProps> = ({
  onNavigateTab,
  isCollapsed: controlledCollapsed,
  onToggleCollapse
}) => {
  const { isProEffective, isExemptFromPayments } = useAuth();
  const isProUser = isProEffective || isExemptFromPayments;
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);
  const [onlineMembers, setOnlineMembers] = useState<UserProfile[]>([]);
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wavelink_right_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  useEffect(() => {
    try {
      localStorage.setItem('wavelink_right_sidebar_collapsed', String(isCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isCollapsed]);

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(12));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as UserProfile);
        });
        setOnlineMembers(list);
      },
      (err) => {
        console.warn('Online members snapshot notice:', err);
      }
    );
    return () => unsub();
  }, []);

  return (
    <aside
      className={`wavelink-right-panel hidden lg:block shrink-0 sticky top-16 h-[calc(100dvh-4rem)] transition-all duration-300 ease-in-out ${
        isCollapsed ? 'wavelink-right-panel--collapsed' : 'wavelink-right-panel--expanded'
      }`}
    >
      {isCollapsed ? (
        /* Slim Vertical Strip / Floating Toggle Rail when Collapsed */
        <div className="flex flex-col items-center gap-3 py-4 px-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl shadow-sm">
          {/* Expand Right Panel Button */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-label="Expand right panel"
            title="Expand VIP Superpowers & Online Members"
            className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-[#2563EB] border border-slate-200/80 flex items-center justify-center transition active:scale-95 cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="w-6 h-px bg-slate-200" />

          {/* VIP Superpowers Quick Trigger */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            title={isProUser ? 'VIP Superpowers Active (Click to expand)' : 'WaveLink Pro VIP Superpowers (Click to expand)'}
            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white shadow-sm flex items-center justify-center hover:scale-105 transition cursor-pointer"
          >
            <Crown size={17} className="text-amber-200" />
          </button>

          {/* Online Members Quick Trigger with Live Dot & Count */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            title={`Online Members (${onlineMembers.length}) — Click to expand`}
            className="relative w-10 h-10 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 flex items-center justify-center transition cursor-pointer"
          >
            <Users size={17} />
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white">
              {onlineMembers.length}
            </span>
          </button>

          {/* Trending Topics Quick Trigger */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            title="Trending on WaveLink — Click to expand"
            className="w-10 h-10 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/70 flex items-center justify-center transition cursor-pointer"
          >
            <TrendingUp size={17} />
          </button>

          {/* Wallet / Monetization Quick Trigger */}
          <button
            type="button"
            onClick={() => onNavigateTab('monetization')}
            title="Open Monetization & Wallet Hub"
            className="w-10 h-10 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200/80 flex items-center justify-center transition cursor-pointer"
          >
            <HandCoins size={17} />
          </button>
        </div>
      ) : (
        /* Full Expanded Right Column */
        <div className="h-full overflow-y-auto space-y-4 py-1 pr-2 pl-1">
          {/* Collapse Toggle Header Bar */}
          <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <PanelRightOpen size={14} className="text-[#2563EB]" />
              <span>VIP &amp; Community</span>
            </span>
            <button
              type="button"
              onClick={handleToggleCollapse}
              aria-label="Collapse right sidebar"
              title="Collapse right sidebar to expand feed"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-[#2563EB] border border-slate-200/80 text-[11px] font-bold transition active:scale-95 cursor-pointer"
            >
              <span>Hide</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* 1. WaveLink Pro Feature Highlights Card - Bright, Warm & Inviting */}
          <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white shadow-md shadow-blue-500/15">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/20 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-wider border border-white/25">
                <Crown size={13} className="text-amber-300" />
                <span>WaveLink Pro VIP</span>
              </div>
              {isProUser && (
                <span className="text-[10px] font-bold text-emerald-900 bg-white/90 px-2.5 py-0.5 rounded-full shadow-xs">
                  Active VIP
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base tracking-tight mb-1">
              {isProUser ? 'VIP Superpowers Active' : 'Amplify Your Wave Presence'}
            </h3>
            <p className="text-xs text-blue-50 mb-3.5 leading-relaxed font-medium">
              {isProUser
                ? '500MB uploads, 1080p WebRTC calls, free post boosts & zero platform advertisements.'
                : 'Unlock maximum reach, high-definition streams, and instant creator monetization.'}
            </p>

            {/* Pro Feature Checklist */}
            <div className="space-y-2 mb-4 text-xs text-white/95 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-amber-200 shrink-0" />
                <span>500MB Video &amp; Audio Uploads</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-amber-200 shrink-0" />
                <span>1080p HD Video &amp; Voice Calling</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-amber-200 shrink-0" />
                <span>Verified Blue Star Creator Badge</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-amber-200 shrink-0" />
                <span>100% Ad-Free Clean Feed</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-amber-200 shrink-0" />
                <span>Complimentary 0 TZS Post Boosting</span>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('monetization')}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-700 font-extrabold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>{isProUser ? 'Manage Pro & Wallet' : 'Upgrade to Pro • 18k TZS/mo'}</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Live Online Members & Verified Badges */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="font-extrabold text-xs sm:text-sm text-[#0F172A]">
                  Online Members ({onlineMembers.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('directory')}
                className="text-[11px] font-bold text-blue-600 hover:underline"
              >
                View All
              </button>
            </div>

            <div className="space-y-2">
              {onlineMembers.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  onClick={() => onNavigateTab('directory')}
                  className="flex items-center justify-between gap-2 p-2 rounded-2xl hover:bg-slate-50 cursor-pointer transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={m.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${m.id}`}
                        alt={m.displayName}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                    <div className="min-w-0">
                      <CrystalBadge
                        email={m.email}
                        name={m.displayName}
                        isPro={m.isPro}
                        hasBlueStar={m.hasBlueStar || m.isPro}
                        isSubAdmin={m.isSubAdmin || m.role === 'sub_admin'}
                        size="sm"
                      />
                      <span className="block text-[10px] font-mono text-slate-400 truncate">
                        {m.username || `@${(m.email || 'waver').split('@')[0]}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                    Online
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Trending Topics in Tanzania */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600">
                  <TrendingUp size={16} />
                </div>
                <h4 className="font-extrabold text-xs sm:text-sm text-[#0F172A]">
                  Trending on WaveLink
                </h4>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                East Africa
              </span>
            </div>

            <div className="space-y-1">
              {TRENDING_TOPICS.map((topic) => (
                <div
                  key={topic.tag}
                  onClick={() => onNavigateTab('feed')}
                  className="p-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer transition group flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {topic.category}
                    </span>
                    <span className="font-bold text-xs text-[#0F172A] group-hover:text-blue-600 transition">
                      {topic.tag}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {topic.waves}
                    </span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Creator Monetization & Post Boosting Widget */}
          <div className="bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-blue-500/10 border border-emerald-200/80 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <div className="p-1.5 rounded-xl bg-emerald-100 text-emerald-600">
                  <Zap size={15} />
                </div>
                <span className="font-black text-xs uppercase tracking-wider">Creator Earnings</span>
              </div>
              <span className="text-[10px] bg-emerald-100/80 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                Mobile Money
              </span>
            </div>

            <h4 className="font-extrabold text-sm text-[#0F172A] mb-1">
              Post Boosting &amp; Tipping
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Boost your post reach +300% for 2,000 TZS or receive instant tips directly to your mobile wallet.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2.5 rounded-2xl bg-white border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Post Boost</span>
                <span className="font-extrabold text-sm text-blue-600">2,000 TZS</span>
                <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">+300% Reach</span>
              </div>
              <div className="p-2.5 rounded-2xl bg-white border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Creator Tip</span>
                <span className="font-extrabold text-sm text-emerald-600">Instant</span>
                <span className="text-[9px] text-slate-500 block mt-0.5">10% Platform Cut</span>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('monetization')}
              className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm shadow-blue-500/15"
            >
              <HandCoins size={14} />
              <span>Open Monetization Hub</span>
            </button>
          </div>

          {/* Footer Links & Copyright */}
          <div className="px-3 pt-1 pb-4 text-[11px] text-slate-400 space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button onClick={() => setLegalDoc('privacy')} className="hover:underline hover:text-blue-600">Privacy</button>
              <button onClick={() => setLegalDoc('terms')} className="hover:underline hover:text-blue-600">Terms</button>
              <button onClick={() => setLegalDoc('refund')} className="hover:underline hover:text-blue-600">Refund</button>
              <button onClick={() => onNavigateTab('announcements')} className="hover:underline hover:text-blue-600">Notice Board</button>
              <button onClick={() => onNavigateTab('monetization')} className="hover:underline hover:text-blue-600">Monetization</button>
            </div>
            <p className="text-[10px] pt-1">WaveLink © 2026. Empowering East African Creators.</p>
          </div>
        </div>
      )}

      {legalDoc && (
        <LegalModal
          isOpen={true}
          initialDoc={legalDoc}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </aside>
  );
};
