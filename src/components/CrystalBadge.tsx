import React from 'react';
import { ShieldCheck, Star, Bot } from 'lucide-react';
import { resolveCanonicalAdminRole } from '../firebase';
import { isSupportBotUser } from '../utils/security';

interface CrystalBadgeProps {
  email?: string | null;
  name: string;
  className?: string;
  showAdminTag?: boolean;
  isPro?: boolean;
  hasBlueStar?: boolean;
  isSubAdmin?: boolean;
  isBot?: boolean;
  role?: 'admin' | 'super_admin' | 'sub_admin' | 'user' | 'bot';
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
  isBot = false,
  role,
  size = 'md'
}) => {
  const isAutomatedBot = Boolean(isBot || role === 'bot' || isSupportBotUser(email));
  const canonicalRole = resolveCanonicalAdminRole(role, isSubAdmin);
  const isSuperAdmin = !isAutomatedBot && canonicalRole === 'admin';
  const isModerator = !isAutomatedBot && canonicalRole === 'sub_admin';
  const hasProBadge = !isAutomatedBot && (isPro || hasBlueStar);

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

  // Single small badge rule: never stack multiple admin/pro badges
  if ((isSuperAdmin || isModerator) && showAdminTag) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className={`font-bold text-[#1C1917] ${textSize}`}>
          {name}
        </span>
        <span
          title="WaveLink Admin"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80"
        >
          <ShieldCheck size={11} className="text-[#2563EB]" />
          <span>Admin</span>
        </span>
      </span>
    );
  }

  if (hasProBadge) {
    return (
      <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className={`font-bold text-[#1C1917] ${textSize}`}>
          {name}
        </span>
        <span
          title="WaveLink Pro Member"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200/80"
        >
          <Star size={10} className="text-[#0D9488] fill-[#0D9488]" />
          <span>Pro</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`font-bold text-[#1C1917] ${textSize} ${className}`}>
      {name}
    </span>
  );
};

