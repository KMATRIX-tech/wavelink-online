import React from 'react';
import { Sparkles, ShieldCheck, CheckCircle2, Star } from 'lucide-react';
import { isAdminEmail } from '../firebase';

interface CrystalBadgeProps {
  email?: string | null;
  name: string;
  className?: string;
  showAdminTag?: boolean;
  isPro?: boolean;
  hasBlueStar?: boolean;
  isSubAdmin?: boolean;
  role?: 'super_admin' | 'sub_admin' | 'user';
  proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
  size?: 'sm' | 'md' | 'lg';
}

export const CrystalBadge: React.FC<CrystalBadgeProps> = ({
  email,
  name,
  className = '',
  showAdminTag = true,
  isPro = false,
  hasBlueStar = false,
  isSubAdmin = false,
  role,
  proBadge = 'verified',
  size = 'md'
}) => {
  // STRICT RULE: Crystal sparkle is strictly and solely reserved for keylanmbilinyi5@gmail.com
  const isSuperAdmin = isAdminEmail(email);
  const isModerator = !isSuperAdmin && (isSubAdmin || role === 'sub_admin');
  const hasVerifiedBlueStar = isPro || hasBlueStar;

  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm sm:text-base';
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;

  // 1. Super Admin (keylanmbilinyi5@gmail.com) - Exclusive custom .crystal-sparkle CSS badge
  if (isSuperAdmin) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className="crystal-sparkle-container">
          <Sparkles size={iconSize} className="sparkle-icon" />
          <span className={`crystal-sparkle ${textSize}`}>
            {name}
          </span>
        </span>
        {showAdminTag && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-500 text-white shadow-sm ring-1 ring-purple-400/40">
            <ShieldCheck size={11} className="text-white" />
            Super Admin
          </span>
        )}
      </span>
    );
  }

  // 2. Sub-Admin / Moderator (Appointed by Super Admin with limited powers)
  if (isModerator) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className={`font-semibold text-gray-900 dark:text-gray-100 ${textSize}`}>
          {name}
        </span>
        <span
          title="Appointed Moderator (Sub-Admin)"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 ring-1 ring-indigo-400/40"
        >
          <ShieldCheck size={11} className="text-indigo-600 dark:text-indigo-400" />
          <span>Moderator</span>
        </span>
      </span>
    );
  }

  // 3. Verified Blue Star Member (WaveLink Pro / Verified Subscribers)
  if (hasVerifiedBlueStar) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className={`font-semibold text-gray-900 dark:text-gray-100 ${textSize}`}>
          {name}
        </span>
        <span
          title="Verified Blue Star Subscriber - WaveLink Pro"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 ring-1 ring-sky-400/50 shadow-xs"
        >
          <Star
            size={12}
            className="text-sky-500 fill-sky-400 drop-shadow-[0_0_6px_rgba(14,165,233,0.7)] animate-pulse"
          />
          <span className="font-mono text-[9px] uppercase font-black">BLUE STAR</span>
        </span>
      </span>
    );
  }

  // Standard Community Member
  return (
    <span className={`font-semibold text-gray-900 dark:text-gray-100 ${textSize} ${className}`}>
      {name}
    </span>
  );
};

