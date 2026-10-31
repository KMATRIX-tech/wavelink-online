import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, X } from 'lucide-react';

export const WarningBanner: React.FC = () => {
  const { userProfile, dismissWarning } = useAuth();

  if (!userProfile || userProfile.status !== 'warned' || !userProfile.warningMessage) {
    return null;
  }

  return (
    <div className="bg-amber-500/15 dark:bg-amber-950/40 border-b border-amber-500/30 px-4 py-3 text-amber-900 dark:text-amber-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold">
              Account Notice from WaveLink Administration:
            </p>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300">
              "{userProfile.warningMessage}"
            </p>
          </div>
        </div>

        <button
          onClick={dismissWarning}
          className="px-3 py-1 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition flex items-center gap-1"
        >
          <span>Acknowledge</span>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
