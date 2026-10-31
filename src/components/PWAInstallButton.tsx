import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X, Smartphone, Check } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact'
}) => {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already running standalone, no need to show
  if (isInstalled && !justInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canInstall) {
      const ok = await triggerInstall();
      if (ok) setJustInstalled(true);
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // Direct instruction fallback for browsers where beforeinstallprompt didn't trigger yet
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {variant === 'banner' ? (
        <div className={`p-3 rounded-2xl bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 border border-purple-500/30 text-white flex items-center justify-between gap-3 shadow-md ${className}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-purple-600/40 text-purple-300 shrink-0">
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold truncate">Install WaveLink App</h4>
              <p className="text-[11px] text-purple-200/70 truncate">Fast loading &amp; home screen access</p>
            </div>
          </div>
          <button
            onClick={handleClick}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shrink-0 active:scale-95 transition shadow-sm"
          >
            Install
          </button>
        </div>
      ) : variant === 'full' ? (
        <button
          onClick={handleClick}
          className={`w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 active:scale-95 transition ${className}`}
        >
          <Download size={14} />
          <span>Add WaveLink to Home Screen</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          className={`px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 dark:text-purple-300 border border-purple-500/20 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${className}`}
          title="Add WaveLink to your phone or desktop home screen"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {/* iOS & Manual Installation Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0f1422] border border-purple-500/30 p-5 text-white shadow-2xl">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Add to Home Screen</h3>
                <p className="text-xs text-purple-200/80">Install WaveLink for native performance</p>
              </div>
            </div>

            <div className="space-y-3.5 mb-5 text-xs text-slate-300">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="p-1.5 rounded-lg bg-purple-600/30 text-purple-300 shrink-0 mt-0.5">
                  <Share2 size={16} />
                </div>
                <div>
                  <span className="font-bold text-white block">Step 1: Open Share Sheet</span>
                  <span>Tap the <strong>Share</strong> button on Safari or Chrome bottom bar.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="p-1.5 rounded-lg bg-pink-600/30 text-pink-300 shrink-0 mt-0.5">
                  <PlusSquare size={16} />
                </div>
                <div>
                  <span className="font-bold text-white block">Step 2: Add to Home Screen</span>
                  <span>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
