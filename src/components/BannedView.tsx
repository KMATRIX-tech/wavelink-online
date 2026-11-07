import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, Mail, HelpCircle } from 'lucide-react';

interface BannedViewProps {
  onOpenSupport: () => void;
}

export const BannedView: React.FC<BannedViewProps> = ({ onOpenSupport }) => {
  const { currentUser, userProfile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF7F2] text-[#1C1917]">
      <div className="w-full max-w-lg bg-white border border-rose-200 rounded-3xl p-8 text-center shadow-xl">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-6 ring-8 ring-rose-50">
          <ShieldAlert size={36} />
        </div>

        <h2 className="text-2xl font-extrabold text-[#1C1917] mb-2">
          Account Suspended
        </h2>

        <p className="text-sm text-[#57534E] mb-6 leading-relaxed">
          Your WaveLink account (<span className="font-bold text-rose-600">{currentUser?.email}</span>) has been suspended by platform administration due to violations of community guidelines.
        </p>

        {userProfile?.warningMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left mb-6">
            <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">
              Admin Suspension Reason:
            </p>
            <p className="text-xs sm:text-sm text-rose-950 italic">
              &quot;{userProfile.warningMessage}&quot;
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenSupport}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-xs"
          >
            <HelpCircle size={16} />
            <span>Submit Appeal via Support Desk</span>
          </button>

          <button
            type="button"
            onClick={signOut}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl border border-[#D6D3CD] bg-[#FAF7F2] hover:bg-[#EFECE6] text-[#1C1917] font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="mt-8 pt-4 border-t border-[#EFECE6] text-xs text-[#57534E] flex items-center justify-center gap-1.5">
          <Mail size={13} />
          <span>Contact Platform Administration via Support Desk</span>
        </div>
      </div>
    </div>
  );
};
