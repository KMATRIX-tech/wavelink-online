import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, Mail, HelpCircle } from 'lucide-react';

interface BannedViewProps {
  onOpenSupport: () => void;
}

export const BannedView: React.FC<BannedViewProps> = ({ onOpenSupport }) => {
  const { currentUser, userProfile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#0B0F19] text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-lg bg-white dark:bg-[#131927] border border-rose-200 dark:border-rose-900/50 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-6 ring-8 ring-rose-50 dark:ring-rose-950/30">
          <ShieldAlert size={36} />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Account Suspended
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Your WaveLink account (<span className="font-semibold text-rose-600 dark:text-rose-400">{currentUser?.email}</span>) has been banned by platform administration due to violations of community guidelines.
        </p>

        {userProfile?.warningMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-left mb-6">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider mb-1">
              Admin Suspension Reason:
            </p>
            <p className="text-xs sm:text-sm text-rose-950 dark:text-rose-200 italic">
              "{userProfile.warningMessage}"
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onOpenSupport}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-purple-600/30"
          >
            <HelpCircle size={16} />
            <span>Submit Appeal via Support Desk</span>
          </button>

          <button
            onClick={signOut}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold text-sm flex items-center justify-center gap-2 transition"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
          <Mail size={12} />
          Contact Admin directly: keylanmbilinyi5@gmail.com
        </div>
      </div>
    </div>
  );
};
