import React from 'react';
import { ShieldCheck, Star, Bot, Trophy } from 'lucide-react';
import { resolveCanonicalAdminRole } from '../firebase';
import { isSupportBotUser } from '../utils/security';

// Lightweight client registry of active Weekly Challenge Winner UIDs/emails synced from challenges/users
const activeWeeklyWinnerSet = new Set<string>();

export function registerActiveWeeklyWinner(uidOrEmail?: string | null, untilIso?: string | null): void {
  if (!uidOrEmail) return;
  if (untilIso) {
    const exp = new Date(untilIso).getTime();
    if (Number.isFinite(exp) && exp > Date.now()) {
      activeWeeklyWinnerSet.add(uidOrEmail.trim().toLowerCase());
    }
  } else {
    activeWeeklyWinnerSet.add(uidOrEmail.trim().toLowerCase());
  }
}

export function isUserActiveWeeklyWinner(uidOrEmail?: string | null, weeklyWinnerUntil?: string | null): boolean {
  if (weeklyWinnerUntil) {
    const exp = new Date(weeklyWinnerUntil).getTime();
    if (Number.isFinite(exp) && exp > Date.now()) return true;
  }
  if (uidOrEmail && activeWeeklyWinnerSet.has(uidOrEmail.trim().toLowerCase())) {
    return true;
  }
  return false;
}

interface CrystalBadgeProps {
  email?: string | null;
  userId?: string | null;
  name: string;
  className?: string;
  showAdminTag?: boolean;
  isPro?: boolean;
  hasBlueStar?: boolean;
  isSubAdmin?: boolean;
  isBot?: boolean;
  weeklyWinnerUntil?: string | null;
  isWeeklyWinner?: boolean;
  role?: 'admin' | 'super_admin' | 'sub_admin' | 'user' | 'bot';
  proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
  size?: 'sm' | 'md' | 'lg';
}

export const CrystalBadge: React.FC<CrystalBadgeProps> = ({
  email,
  userId,
  name,
  className = '',
  showAdminTag = true,
  isPro = false,
  hasBlueStar = false,
  isSubAdmin = false,
  isBot = false,
  weeklyWinnerUntil,
  isWeeklyWinner = false,
  role,
  size = 'md'
}) => {
  const isAutomatedBot = Boolean(isBot || role === 'bot' || isSupportBotUser(email));
  const canonicalRole = resolveCanonicalAdminRole(role, isSubAdmin);
  const isSuperAdmin = !isAutomatedBot && canonicalRole === 'admin';
  const isModerator = !isAutomatedBot && canonicalRole === 'sub_admin';
  const hasProBadge = !isAutomatedBot && (isPro || hasBlueStar);
  const showWinnerBadge =
    !isAutomatedBot &&
    (isWeeklyWinner ||
      isUserActiveWeeklyWinner(userId, weeklyWinnerUntil) ||
      isUserActiveWeeklyWinner(email, weeklyWinnerUntil));

  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm sm:text-base';

  if (isAutomatedBot) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className={`font-bold text-[#1C1917] ${textSize}`}>
          {name}
        </span>
        <span
          title="Automated WaveLink Support Assistant (No Admin Powers)"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide rounded-full bg-teal-50 text-[#0D9488] border border-teal-300"
        >
          <Bot size={11} className="text-[#0D9488]" />
          <span>Bot</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className={`font-bold text-[#1C1917] ${textSize}`}>
        {name}
      </span>

      {(isSuperAdmin || isModerator) && showAdminTag ? (
        <span
          title="WaveLink Admin"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80"
        >
          <ShieldCheck size={11} className="text-[#2563EB]" />
          <span>Admin</span>
        </span>
      ) : hasProBadge ? (
        <span
          title="WaveLink Pro Member"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200/80"
        >
          <Star size={10} className="text-[#0D9488] fill-[#0D9488]" />
          <span>Pro</span>
        </span>
      ) : null}

      {showWinnerBadge && (
        <span
          title="Weekly Creator Challenge Winner Badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs"
        >
          <Trophy size={10} className="text-amber-500 fill-amber-400" />
          <span>Weekly Winner</span>
        </span>
      )}
    </span>
  );
};


