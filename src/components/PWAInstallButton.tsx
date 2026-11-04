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
        <div className={`p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] text-[#1C1917] flex items-center justify-between gap-3 shadow-xs ${className}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 text-[#2563EB] shrink-0">
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-[#1C1917] truncate">Install WaveLink App</h4>
              <p className="text-[11px] text-[#57534E] truncate">Fast loading &amp; home screen access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs shrink-0 active:scale-95 transition shadow-2xs"
          >
            Install
          </button>
        </div>
      ) : variant === 'full' ? (
        <button
          type="button"
          onClick={handleClick}
          className={`w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs active:scale-95 transition ${className}`}
        >
          <Download size={14} />
          <span>Add WaveLink to Home Screen</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={`px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200/80 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${className}`}
          title="Add WaveLink to your phone or desktop home screen"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {/* iOS & Manual Installation Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-white border border-[#EFECE6] p-6 text-[#1C1917] shadow-2xl">
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917] transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-sm">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-[#1C1917]">Add to Home Screen</h3>
                <p className="text-xs text-[#57534E]">Install WaveLink for native performance</p>
              </div>
            </div>

            <div className="space-y-3 mb-5 text-xs text-[#57534E]">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <div className="p-2 rounded-xl bg-blue-50 text-[#2563EB] shrink-0 mt-0.5">
                  <Share2 size={16} />
                </div>
                <div>
                  <span className="font-bold text-[#1C1917] block">Step 1: Open Share Sheet</span>
                  <span>Tap the <strong>Share</strong> button on your browser bottom bar.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6]">
                <div className="p-2 rounded-xl bg-teal-50 text-[#0D9488] shrink-0 mt-0.5">
                  <PlusSquare size={16} />
                </div>
                <div>
                  <span className="font-bold text-[#1C1917] block">Step 2: Add to Home Screen</span>
                  <span>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full min-h-[46px] py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
