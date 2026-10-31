import React, { useState } from 'react';
import { useAuth, DAILY_REWARD_SCHEDULE, getLocalDateKey } from '../context/AuthContext';
import {
  Flame,
  Sparkles,
  Gift,
  CheckCircle2,
  Calendar,
  Trophy,
  X,
  Coins,
  Zap
} from 'lucide-react';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DailyRewardModal: React.FC<DailyRewardModalProps> = ({ isOpen, onClose }) => {
  const { userProfile, claimDailyReward } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const todayKey = getLocalDateKey();
  const isClaimedToday = userProfile?.lastDailyRewardDate === todayKey;
  const currentStreak = Math.max(1, userProfile?.loginStreak ?? 1);
  const totalWavePoints = userProfile?.wavePoints ?? DAILY_REWARD_SCHEDULE[0];
  const todayBonus = userProfile?.lastDailyRewardAmount ?? DAILY_REWARD_SCHEDULE[(currentStreak - 1) % DAILY_REWARD_SCHEDULE.length];
  const totalLoginDays = Math.max(1, userProfile?.totalLoginDays ?? 1);

  // Active day position in the 7-day cycle (0 to 6)
  const activeCycleIndex = (currentStreak - 1) % DAILY_REWARD_SCHEDULE.length;
  const nextCycleIndex = currentStreak % DAILY_REWARD_SCHEDULE.length;
  const tomorrowBonus = DAILY_REWARD_SCHEDULE[nextCycleIndex];

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await claimDailyReward();
      if (res.claimed) {
        setSyncMessage(`+${res.pointsAwarded} WavePoints added to your profile!`);
      } else {
        setSyncMessage(`Today's +${res.pointsAwarded} WavePoints bonus is already active in your profile.`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden text-[#0F172A]">
        {/* Top Gradient Header */}
        <div className="relative p-6 bg-gradient-to-r from-[#3B82F6] via-sky-500 to-[#10B981] text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
            aria-label="Close Daily Rewards"
          >
            <X size={16} />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-extrabold uppercase tracking-wider mb-2 border border-white/25">
            <Gift size={13} className="text-amber-200" />
            <span>Daily Login Rewards</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black tracking-tight">
            {isClaimedToday ? `Day ${currentStreak} Bonus Claimed!` : `Claim Your Day ${currentStreak} Bonus`}
          </h3>
          <p className="text-xs sm:text-sm text-blue-50 mt-1 font-medium">
            Log in every day to build your Wave Streak and earn escalating WavePoints in your profile header.
          </p>

          {/* Summary Stat Pills */}
          <div className="grid grid-cols-3 gap-2.5 mt-5">
            <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-100">
                <Coins size={12} className="text-amber-200" />
                <span>WavePoints</span>
              </div>
              <div className="text-lg sm:text-xl font-black mt-0.5">
                {totalWavePoints.toLocaleString()} <span className="text-xs font-bold text-amber-200">pts</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-100">
                <Flame size={12} className="text-amber-300" />
                <span>Login Streak</span>
              </div>
              <div className="text-lg sm:text-xl font-black mt-0.5">
                {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'} 🔥
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-100">
                <Zap size={12} className="text-emerald-200" />
                <span>Today's Bonus</span>
              </div>
              <div className="text-lg sm:text-xl font-black mt-0.5 text-amber-200">
                +{todayBonus} pts
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Habitual Reward Track */}
        <div className="p-6 space-y-5 bg-[#FFFFFF]">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-1.5">
                <Calendar size={15} className="text-[#3B82F6]" />
                <span>7-Day Streak Bonus Schedule</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Consecutive daily logins increase your point bonus up to +50 pts on Day 7.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#10B981] border border-emerald-200 text-[11px] font-extrabold">
              Total Logins: {totalLoginDays}d
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAILY_REWARD_SCHEDULE.map((pts, idx) => {
              const isCompleted = idx < activeCycleIndex || (idx === activeCycleIndex && isClaimedToday);
              const isToday = idx === activeCycleIndex;
              const isMilestone = idx === DAILY_REWARD_SCHEDULE.length - 1;

              return (
                <div
                  key={idx}
                  className={`p-2 sm:p-2.5 rounded-2xl border text-center flex flex-col items-center justify-between transition ${
                    isToday
                      ? 'bg-gradient-to-b from-blue-50 to-emerald-50 border-[#3B82F6] ring-2 ring-[#3B82F6]/20 shadow-xs'
                      : isCompleted
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-[#F8FAFC] border-slate-200/90 text-slate-500'
                  }`}
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-tight text-slate-500">
                    Day {idx + 1}
                  </span>

                  <div className="my-1.5">
                    {isCompleted ? (
                      <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-2xs">
                        <CheckCircle2 size={14} />
                      </div>
                    ) : isMilestone ? (
                      <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                        <Trophy size={13} />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center">
                        <Sparkles size={12} />
                      </div>
                    )}
                  </div>

                  <span
                    className={`text-[11px] font-black ${
                      isToday
                        ? 'text-[#3B82F6]'
                        : isCompleted
                        ? 'text-[#10B981]'
                        : 'text-[#0F172A]'
                    }`}
                  >
                    +{pts}
                  </span>
                </div>
              );
            })}
          </div>

          {syncMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={15} className="text-[#10B981] shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          {/* Bottom Callout & Action */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600">
                <Flame size={18} />
              </div>
              <div>
                <div className="text-xs font-extrabold text-[#0F172A]">
                  {isClaimedToday
                    ? `Today's +${todayBonus} WavePoints Claimed ✓`
                    : `Ready to Claim +${todayBonus} WavePoints`}
                </div>
                <div className="text-[11px] text-slate-500">
                  Log in tomorrow for <span className="font-bold text-[#10B981]">+{tomorrowBonus} WavePoints</span>!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-extrabold shadow-xs transition active:scale-95 disabled:opacity-60"
            >
              {isSyncing ? 'Checking...' : isClaimedToday ? 'Verified Today ✓' : 'Claim Daily Bonus'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
