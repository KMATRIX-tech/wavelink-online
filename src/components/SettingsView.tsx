import React, { useState } from 'react';
import { useAuth, DAILY_REWARD_SCHEDULE, getLocalDateKey } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ThemeMode, ProBorderEffect, ProAccentColor } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { SupportDeskView } from './SupportDeskView';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { DailyRewardModal } from './DailyRewardModal';
import { CompactPointsDisplay } from './CompactPointsDisplay';
import { PRO_TIERS } from '../services/paymentService';
import {
  Settings,
  Sun,
  Moon,
  Laptop,
  Check,
  User,
  Shield,
  ShieldCheck,
  Save,
  CheckCircle2,
  Upload,
  HelpCircle,
  AtSign,
  Fingerprint,
  Crown,
  Sparkles,
  Zap,
  Palette,
  CreditCard,
  Calendar,
  ArrowRight,
  Flame,
  Coins,
  Gift,
  Trophy
} from 'lucide-react';

import { LegalModal, LegalDocType } from './LegalModals';
import { compressImage } from '../utils/mediaStorage';

export const SettingsView: React.FC = () => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, isSubAdmin, isProEffective, updateUserProfile } = useAuth();
  const { theme } = useTheme();

  const [activeSettingsSection, setActiveSettingsSection] = useState<'profile' | 'pro' | 'support' | 'legal'>('profile');
  const [selectedLegalDoc, setSelectedLegalDoc] = useState<LegalDocType | null>(null);
  const [isDailyRewardModalOpen, setIsDailyRewardModalOpen] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [username, setUsername] = useState(userProfile?.username || (currentUser?.email ? `@${currentUser.email.split('@')[0]}` : '@waver'));
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || currentUser?.photoURL || '');

  // Pro customization state
  const [proBorderEffect, setProBorderEffect] = useState<ProBorderEffect>(userProfile?.proBorderEffect || 'aura-gold');
  const [proAccentColor, setProAccentColor] = useState<ProAccentColor>(userProfile?.proAccentColor || 'purple');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const isProUser = isProEffective;

  // Daily Login Reward & Habitual Engagement metrics
  const todayKey = getLocalDateKey();
  const isClaimedToday = userProfile?.lastDailyRewardDate === todayKey;
  const currentStreak = Math.max(1, userProfile?.loginStreak ?? 1);
  const totalWavePoints = userProfile?.wavePoints ?? DAILY_REWARD_SCHEDULE[0];
  const todayBonus = userProfile?.lastDailyRewardAmount ?? DAILY_REWARD_SCHEDULE[(currentStreak - 1) % DAILY_REWARD_SCHEDULE.length];
  const activeCycleIndex = (currentStreak - 1) % DAILY_REWARD_SCHEDULE.length;
  const nextCycleIndex = currentStreak % DAILY_REWARD_SCHEDULE.length;
  const tomorrowBonus = DAILY_REWARD_SCHEDULE[nextCycleIndex];

  // File upload for profile picture from local folders (compressed for Firestore)
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 400, 400, 0.85);
      if (compressed) {
        setPhotoURL(compressed);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setPhotoURL(result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim() || undefined,
        proBorderEffect,
        proAccentColor
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const borderOptions: { id: ProBorderEffect; name: string; ringClass: string }[] = [
    { id: 'aura-gold', name: 'Golden Aura ✨', ringClass: 'pro-aura-gold ring-4 ring-amber-400' },
    { id: 'neon-pulse', name: 'Cyber Neon ⚡', ringClass: 'pro-aura-neon ring-4 ring-cyan-400' },
    { id: 'emerald-ring', name: 'Emerald Wave 🌊', ringClass: 'pro-aura-emerald ring-4 ring-emerald-400' },
    { id: 'cosmic-glow', name: 'Sky Glow 💎', ringClass: 'pro-aura-cosmic ring-4 ring-[#3B82F6]' },
    { id: 'none', name: 'Classic Clean', ringClass: 'ring-2 ring-blue-500/20' }
  ];

  const accentColors: { id: ProAccentColor; name: string; bg: string; border: string }[] = [
    { id: 'purple', name: 'Sky Blue Pro', bg: 'bg-[#3B82F6]', border: 'border-[#3B82F6]' },
    { id: 'gold', name: 'Royal Gold', bg: 'bg-amber-500', border: 'border-amber-500' },
    { id: 'emerald', name: 'Emerald Wave', bg: 'bg-[#10B981]', border: 'border-[#10B981]' },
    { id: 'neon', name: 'Cyber Neon', bg: 'bg-cyan-500', border: 'border-cyan-500' },
    { id: 'crimson', name: 'Crimson Velvet', bg: 'bg-rose-600', border: 'border-rose-600' }
  ];

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* User Profile Header with Daily Login Reward & Habitual Engagement Tracker */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          {/* Left: Avatar & Identity */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={
                  photoURL ||
                  userProfile?.photoURL ||
                  `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                }
                alt="Profile Avatar"
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ${
                  isProUser && proBorderEffect !== 'none'
                    ? borderOptions.find((b) => b.id === proBorderEffect)?.ringClass
                    : 'ring-2 ring-blue-500/20'
                }`}
              />
              {isProUser && (
                <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-amber-500 text-white shadow-xs">
                  <Crown size={13} />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CrystalBadge
                  email={currentUser?.email}
                  name={userProfile?.displayName || displayName || 'Waver'}
                  isPro={isProUser}
                  hasBlueStar={isProUser}
                  isSubAdmin={isSubAdmin}
                  size="md"
                  showAdminTag={isAdmin}
                />
                <span className="text-xs font-mono font-bold text-[#3B82F6] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/70">
                  {userProfile?.username || username}
                </span>
                <CompactPointsDisplay
                  userId={currentUser?.uid}
                  onClick={() => setIsDailyRewardModalOpen(true)}
                />
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl">
                {userProfile?.bio || bio || 'Connecting on WaveLink 🌊'}
              </p>
            </div>
          </div>

          {/* Right: Daily Reward & WavePoints Header Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              onClick={() => setIsDailyRewardModalOpen(true)}
              className="cursor-pointer px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/80 border border-amber-200/90 hover:border-amber-300 transition flex items-center gap-2.5 shadow-2xs"
              title="Click to view 7-day login reward schedule"
            >
              <div className="p-2 rounded-xl bg-amber-500 text-white shadow-2xs">
                <Coins size={16} />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">
                  WavePoints Balance
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-[#0F172A] font-mono">
                    {totalWavePoints.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-extrabold text-[#10B981]">
                    (+{todayBonus} today)
                  </span>
                </div>
              </div>
            </div>

            <div
              onClick={() => setIsDailyRewardModalOpen(true)}
              className="cursor-pointer px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-200/80 hover:border-blue-300 transition flex items-center gap-2.5 shadow-2xs"
              title="Daily Login Streak"
            >
              <div className="p-2 rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white shadow-2xs">
                <Flame size={16} />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#3B82F6] block">
                  Daily Login Streak
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-base sm:text-lg font-black text-[#0F172A]">
                    {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'} 🔥
                  </span>
                  {isClaimedToday && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                      Claimed ✓
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Daily Login Bonus Bar in Profile Header */}
        <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Gift size={15} className="text-[#3B82F6]" />
              <span className="text-xs font-extrabold text-[#0F172A]">
                Daily Login Reward Progress
              </span>
              <span className="text-[11px] text-slate-500">
                • Next login bonus: <strong className="text-[#10B981]">+{tomorrowBonus} pts</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsDailyRewardModalOpen(true)}
              className="text-xs font-extrabold text-[#3B82F6] hover:underline flex items-center gap-1"
            >
              <span>View Reward Details</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAILY_REWARD_SCHEDULE.map((pts, idx) => {
              const isCompleted = idx < activeCycleIndex || (idx === activeCycleIndex && isClaimedToday);
              const isToday = idx === activeCycleIndex;
              const isMilestone = idx === DAILY_REWARD_SCHEDULE.length - 1;

              return (
                <div
                  key={idx}
                  onClick={() => setIsDailyRewardModalOpen(true)}
                  className={`cursor-pointer p-2 rounded-xl border text-center flex flex-col items-center justify-center transition ${
                    isToday
                      ? 'bg-white border-[#3B82F6] ring-2 ring-[#3B82F6]/20 shadow-2xs'
                      : isCompleted
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                      : 'bg-white/70 border-slate-200/80 text-slate-400'
                  }`}
                >
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-500">
                    Day {idx + 1}
                  </span>
                  <div className="my-1">
                    {isCompleted ? (
                      <CheckCircle2 size={14} className="text-[#10B981]" />
                    ) : isMilestone ? (
                      <Trophy size={14} className="text-amber-500" />
                    ) : (
                      <Sparkles size={13} className="text-[#3B82F6]" />
                    )}
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs font-black ${
                      isToday ? 'text-[#3B82F6]' : isCompleted ? 'text-[#10B981]' : 'text-slate-600'
                    }`}
                  >
                    +{pts} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Settings size={14} className="text-[#3B82F6]" />
            <span>Account Preferences &amp; WaveLink Pro</span>
          </div>

          <div className="flex rounded-2xl bg-[#F8FAFC] border border-slate-200/80 p-1 text-xs font-semibold overflow-x-auto">
            <button
              onClick={() => setActiveSettingsSection('profile')}
              className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
                activeSettingsSection === 'profile'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <User size={14} />
              <span>Profile & Identity</span>
            </button>

            <button
              onClick={() => setActiveSettingsSection('pro')}
              className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
                activeSettingsSection === 'pro'
                  ? 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Crown size={14} className={isProUser ? 'text-amber-400' : 'text-slate-400'} />
              <span>WaveLink Pro {isProUser ? '✓' : ''}</span>
            </button>

            <button
              onClick={() => setActiveSettingsSection('support')}
              className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
                activeSettingsSection === 'support'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <HelpCircle size={14} />
              <span>Support Desk</span>
            </button>

            <button
              onClick={() => setActiveSettingsSection('legal')}
              className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
                activeSettingsSection === 'legal'
                  ? 'bg-[#3B82F6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <ShieldCheck size={14} />
              <span>Legal Center</span>
            </button>
          </div>
        </div>
      </div>

      <DailyRewardModal
        isOpen={isDailyRewardModalOpen}
        onClose={() => setIsDailyRewardModalOpen(false)}
      />

      {activeSettingsSection === 'support' && (
        <SupportDeskView />
      )}

      {activeSettingsSection === 'legal' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
            <h3 className="font-extrabold text-lg text-[#0F172A] mb-2">
              WaveLink Legal &amp; Compliance Center
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mb-6">
              Review our commitments to community safety, data protection under Tanzania data laws, and transparent billing for mobile money services.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Privacy Policy */}
              <div
                onClick={() => setSelectedLegalDoc('privacy')}
                className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200 hover:border-blue-300 transition cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center mb-3">
                    <ShieldCheck size={20} />
                  </div>
                  <h4 className="font-bold text-sm text-[#0F172A] mb-1 group-hover:text-[#3B82F6] transition">
                    Privacy Policy
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Zero sale of user data, strict peer-to-peer chat confidentiality, and right to account deletion.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#3B82F6] mt-4 flex items-center gap-1">
                  <span>Read Policy</span>
                  <ArrowRight size={13} />
                </span>
              </div>

              {/* Terms of Service */}
              <div
                onClick={() => setSelectedLegalDoc('terms')}
                className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200 hover:border-blue-300 transition cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center mb-3">
                    <Shield size={20} />
                  </div>
                  <h4 className="font-bold text-sm text-[#0F172A] mb-1 group-hover:text-[#3B82F6] transition">
                    Terms of Service
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Community safety guidelines, creator media copyright ownership, and 10% tipping platform fee rules.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#3B82F6] mt-4 flex items-center gap-1">
                  <span>Read Terms</span>
                  <ArrowRight size={13} />
                </span>
              </div>

              {/* Refund Policy */}
              <div
                onClick={() => setSelectedLegalDoc('refund')}
                className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200 hover:border-emerald-300 transition cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center mb-3">
                    <CheckCircle2 size={20} />
                  </div>
                  <h4 className="font-bold text-sm text-[#0F172A] mb-1 group-hover:text-[#10B981] transition">
                    Refund Policy
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Transparent rules for Airtel Money &amp; AzamPay Pro subscriptions, post boosting, and dispute resolution.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#10B981] mt-4 flex items-center gap-1">
                  <span>Read Policy</span>
                  <ArrowRight size={13} />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLegalDoc && (
        <LegalModal
          isOpen={true}
          initialDoc={selectedLegalDoc}
          onClose={() => setSelectedLegalDoc(null)}
        />
      )}

      {activeSettingsSection === 'pro' && (
        <div className="space-y-6">
          {/* Pro Status Card */}
          <div className="bg-white text-[#0F172A] rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] border border-slate-200/80 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#10B981] border border-emerald-200/70 text-xs font-bold uppercase tracking-wider mb-2">
                <Crown size={14} />
                <span>{isAdmin ? '👑 Administrator Privilege Active' : isProUser ? 'Active Pro VIP Membership' : 'Standard Free Membership'}</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
                {isAdmin
                  ? 'All WaveLink Pro Features Unlocked (No Payment Needed)'
                  : isProUser
                  ? 'You are a WaveLink Pro Subscriber'
                  : 'Upgrade to WaveLink Pro'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl">
                {isAdmin
                  ? 'As a platform administrator, all premium privileges (500MB media uploads, 1080p WebRTC calling, Verified Star, Creator Analytics, and custom profile styling) are permanently active without requiring payment.'
                  : isProUser
                  ? 'Your account is enhanced with 500MB uploads, 1080p WebRTC calls, verified Blue Star badge, and creator analytics.'
                  : 'Supercharge your social presence with verified checkmarks, glowing borders, 500MB uploads, and mobile money billing.'}
              </p>
            </div>

            <div>
              {isAdmin ? (
                <div className="py-2.5 px-5 rounded-2xl bg-emerald-50 text-[#10B981] font-extrabold text-xs sm:text-sm flex items-center gap-2 border border-emerald-200 shadow-2xs">
                  <ShieldCheck size={16} className="text-[#10B981]" />
                  <span>Admin Clearance Active</span>
                </div>
              ) : (
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="py-3 px-6 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-blue-500/20 transition hover:scale-105 active:scale-95"
                >
                  <Sparkles size={16} />
                  <span>{isProUser ? 'Manage / Renew Plan' : 'Subscribe via Mobile Money'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Pricing Tiers Showcase */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRO_TIERS.map((tier) => {
              const isCurrent = userProfile?.proPlan === tier.id;
              return (
                <div
                  key={tier.id}
                  className={`bg-white border-2 rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] flex flex-col justify-between relative transition ${
                    isCurrent
                      ? 'border-[#10B981] ring-4 ring-emerald-500/15'
                      : tier.popular
                      ? 'border-[#3B82F6] ring-2 ring-blue-500/15'
                      : 'border-slate-200/80'
                  }`}
                >
                  {tier.discountBadge && (
                    <span className="absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-extrabold bg-[#10B981] text-white shadow-sm">
                      {tier.discountBadge}
                    </span>
                  )}

                  <div>
                    <h4 className="text-xl font-extrabold text-[#0F172A]">
                      {tier.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      {tier.tagline}
                    </p>

                    <div className="mt-4 mb-6">
                      <span className="text-3xl font-black text-[#3B82F6]">
                        TZS {tier.priceTZS.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-2 font-medium">
                        (${tier.priceUSD} {tier.billingPeriod})
                      </span>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-slate-100">
                      {tier.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-700">
                          <CheckCircle2 size={15} className="text-[#10B981] shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100">
                    {isAdmin ? (
                      <div className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center bg-blue-50 text-[#3B82F6] border border-blue-200">
                        Included in Admin Clearance
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className={`w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-xs ${
                          tier.popular
                            ? 'bg-[#3B82F6] hover:bg-blue-600 text-white shadow-blue-500/20'
                            : 'bg-[#F8FAFC] hover:bg-blue-50 text-[#0F172A] border border-slate-200'
                        }`}
                      >
                        <CreditCard size={15} />
                        <span>{isCurrent ? 'Current Plan (Click to Renew)' : `Select ${tier.name}`}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSettingsSection === 'profile' && (
        <div className="space-y-6">
          {/* Profile Form */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <div>
              <h3 className="font-bold text-[#0F172A] text-base">
                Profile Customizations & Aura Ring
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Update your display name, handle username, bio, and upload custom avatar from your device folders.
              </p>
            </div>

            {saveSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} className="text-[#10B981] shrink-0" />
                <span>Profile details successfully updated!</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Photo Upload with Border Ring Preview */}
              <div className="flex items-center gap-5 p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
                <div className="relative">
                  <img
                    src={
                      photoURL ||
                      `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                    }
                    alt="Avatar"
                    className={`w-18 h-18 rounded-full object-cover transition-all ${
                      isProUser && proBorderEffect !== 'none'
                        ? borderOptions.find((b) => b.id === proBorderEffect)?.ringClass
                        : 'ring-2 ring-blue-500/20'
                    }`}
                  />
                  {isProUser && (
                    <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-amber-500 text-white shadow-xs">
                      <Crown size={12} />
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <span className="text-xs font-bold text-[#0F172A] block">
                    Profile Picture
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Select an image file from your computer or phone folders.
                  </p>

                  <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#3B82F6] border border-blue-200 text-xs font-semibold cursor-pointer transition">
                    <Upload size={14} />
                    <span>Choose from Folders</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Pro Customization: Aura Rings & Accents */}
              {isProUser && (
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-blue-200/80 space-y-4">
                  <div className="flex items-center gap-2">
                    <Crown size={16} className="text-[#10B981]" />
                    <h4 className="font-extrabold text-xs sm:text-sm text-[#0F172A]">
                      WaveLink Pro Avatar Border Effect
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {borderOptions.map((opt) => {
                      const isSelected = proBorderEffect === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setProBorderEffect(opt.id)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                            isSelected
                              ? 'border-[#3B82F6] bg-white text-[#3B82F6] shadow-xs'
                              : 'border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <span className="truncate">{opt.name}</span>
                          {isSelected && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Pro Accent Color Themes */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-[#0F172A] mb-2">
                      Pro Profile Accent Theme:
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      {accentColors.map((acc) => {
                        const isSelected = proAccentColor === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setProAccentColor(acc.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition text-xs font-semibold ${
                              isSelected
                                ? `${acc.border} bg-white shadow-xs ring-2 ring-blue-500/20 text-[#0F172A]`
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            <span className={`w-3 h-3 rounded-full ${acc.bg}`} />
                            <span>{acc.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Keylan Mbilinyi"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Username Handle
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-3 text-[#3B82F6]" size={15} />
                    <input
                      type="text"
                      required
                      value={username.startsWith('@') ? username.substring(1) : username}
                      onChange={(e) => setUsername(`@${e.target.value.replace(/[^a-zA-Z0-9_]/g, '')}`)}
                      maxLength={35}
                      placeholder="username"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Bio / Status
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  placeholder="Tell the WaveLink community about yourself..."
                  className="w-full p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] resize-none"
                />
              </div>

              {/* Account ID Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold">
                    User UID:
                  </span>
                  <span className="font-mono text-[#0F172A] break-all select-all flex items-center gap-1">
                    <Fingerprint size={12} className="text-[#3B82F6]" />
                    {currentUser?.uid}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold">
                    Email Address:
                  </span>
                  <span className="font-mono text-[#0F172A] break-all">
                    {currentUser?.email}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Live Preview:</span>
                  <CrystalBadge
                    email={currentUser?.email}
                    name={displayName || 'You'}
                    isPro={isProUser}
                    size="sm"
                  />
                  <span className="text-xs font-mono text-[#3B82F6] font-semibold">
                    {username}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95 transition disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{isSaving ? 'Saving changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Pure White Light Theme Confirmation Box */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.05)] flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-500">
                <Sun size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-[#0F172A] text-base">
                  Pure White Light Mode Active
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                  WaveLink is styled in a crisp, high-contrast Pure White Light theme (#FFFFFF / #F8FAFC) with deep slate typography (#0F172A) across all screens.
                </p>
              </div>
            </div>
            <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center gap-1.5">
              <Check size={14} className="text-[#10B981]" />
              <span>Always On ({theme.toUpperCase()})</span>
            </span>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => setIsPaymentModalOpen(false)}
        />
      )}
    </div>
  );
};
