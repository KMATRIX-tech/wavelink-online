import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Post, MobileMoneyProvider, PaymentTransaction } from '../types';
import {
  initiatePostBoost,
  completePostBoost,
  detectCarrier,
  formatPhoneNumber,
  MOBILE_CARRIERS
} from '../services/paymentService';
import {
  X,
  Rocket,
  CheckCircle2,
  Phone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Loader2,
  Lock,
  Smartphone,
  AlertCircle,
  Flame,
  Zap,
  Crown
} from 'lucide-react';

import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';

interface PostBoostModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PostBoostModal: React.FC<PostBoostModalProps> = ({
  post,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective, isExemptFromPayments } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<MobileMoneyProvider>('airtel');
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Restrict post boosting to Pro members and Admins
  const canBoost = Boolean(userProfile?.isPro === true || isAdmin || isProEffective);

  // Steps: 'intro' | 'ussd_push' | 'success'
  const [step, setStep] = useState<'intro' | 'ussd_push' | 'success'>('intro');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [ussdPin, setUssdPin] = useState('');
  const [isAuthorizingPin, setIsAuthorizingPin] = useState(false);
  const [activeTx, setActiveTx] = useState<PaymentTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Instant free boost for exempt members (admins, verified by admin, unlocked Pro)
  const handleInstantFreeBoost = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusMessage('Activating complimentary post boost...');
    try {
      const txId = `free_boost_${Date.now()}`;
      await completePostBoost(txId, post.id);
      setStatusMessage('Payment Successful!');
      setStep('success');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Free boost failed:', err);
      setError('Could not activate boost.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhoneNumber(val);
    if (val.length >= 3) {
      const detected = detectCarrier(val);
      setProvider(detected);
    }
  };

  const handleInitiateBoost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!phoneNumber.trim()) {
      setError('Please enter your mobile phone number');
      return;
    }

    setIsProcessing(true);
    setError(null);
    // Real-time status feedback step 1:
    setStatusMessage('Initiating USSD push to your Airtel phone...');

    try {
      const formatted = formatPhoneNumber(phoneNumber.trim());
      const { transaction } = await initiatePostBoost({
        postId: post.id,
        postTitle: post.content?.substring(0, 40) || 'Wave Post',
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: userProfile?.displayName || currentUser.displayName || 'Creator',
        phoneNumber: formatted,
        provider
      });

      setActiveTx(transaction);
      // Real-time status feedback step 2:
      setStatusMessage('Waiting for PIN...');
      setStep('ussd_push');
    } catch (err: any) {
      console.error('Boost initiation failed:', err);
      setError('Failed to initiate post boost. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmUssdPin = async () => {
    if (!activeTx) return;
    if (ussdPin.length < 4) {
      setError('Please enter your 4-digit mobile money PIN');
      return;
    }

    setIsAuthorizingPin(true);
    setError(null);
    setStatusMessage('Waiting for PIN...');

    try {
      await new Promise((r) => setTimeout(r, 1200));
      await completePostBoost(activeTx.id, post.id);

      // Real-time status feedback step 3:
      setStatusMessage('Payment Successful!');
      setStep('success');

      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      setError('PIN verification failed. Please try again.');
      setStatusMessage('Waiting for PIN...');
    } finally {
      setIsAuthorizingPin(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#131927] border border-amber-300 dark:border-amber-900/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-xs">
              <Rocket size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-gray-900 dark:text-white">
                  Boost Wave Post
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                  2,000 TZS
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                +300% Reach & Top Priority for 48 Hours
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {step === 'intro' && (
            <form onSubmit={handleInitiateBoost} className="space-y-4">
              {/* Post Preview Snippet */}
              <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                  Wave Selected for Boosting:
                </span>
                <p className="text-gray-800 dark:text-gray-200 line-clamp-2 italic">
                  "{post.content || 'Photo/Video wave moment'}"
                </p>
              </div>

              {/* Benefits list */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={14} className="text-amber-500 shrink-0" />
                  <span>Prioritized placement across all community member feeds</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={14} className="text-amber-500 shrink-0" />
                  <span>Luminous golden <strong>  Boosted</strong> badge attached to post</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={14} className="text-amber-500 shrink-0" />
                  <span>Active for 48 full hours with instant real-time analytics</span>
                </div>
              </div>

              {/* Pro Perks Enforcement: Restrict post-boosting to Pro users and Admins */}
              {!canBoost ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-purple-50 dark:from-amber-950/30 dark:to-purple-950/30 border border-amber-300 dark:border-amber-700/50 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-black text-xs uppercase tracking-wider">
                    <Crown size={18} className="text-amber-500" />
                    <span>WaveLink Pro Exclusive Perk</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Post Boosting is restricted to <strong>WaveLink Pro</strong> members and <strong>Administrators</strong>. Upgrade to Pro to boost your posts, unlock 500MB uploads, verified Blue Star, and enjoy an ad-free experience!
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition active:scale-95"
                  >
                    <Crown size={16} />
                    <span>Upgrade to Pro to Boost Posts</span>
                  </button>
                </div>
              ) : (
                /* Pro / Admin users can activate the 48h boost directly */
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-indigo-500/15 border-2 border-amber-400/60 dark:border-amber-500/40 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-black text-xs uppercase tracking-wider">
                    <Crown size={16} />
                    <span>VIP Privilege Active • Complimentary Post Boost</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    As a verified <strong>Pro Member / Administrator</strong>, you can activate this 48-hour boost immediately!
                  </p>
                  <button
                    type="button"
                    onClick={handleInstantFreeBoost}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition active:scale-95"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Activating Boost...</span>
                      </>
                    ) : (
                      <>
                        <Rocket size={16} />
                        <span>Activate 48h Boost</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Step: Waiting for PIN */}
          {step === 'ussd_push' && activeTx && (
            <div className="space-y-4 text-center py-2 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                <span>{statusMessage || 'Waiting for PIN...'}</span>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4 border-2 border-amber-400/50 shadow-xl text-left space-y-2.5 font-mono text-xs max-w-sm mx-auto">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-700">
                  <span className="font-bold text-amber-400">🔴 Airtel Money USSD</span>
                  <span className="text-[10px] text-gray-400">Ref: {activeTx.reference}</span>
                </div>
                <p className="text-gray-200 text-xs">
                  Thibitisha malipo ya TZS 2,000 ku-boost Wave Post yako?
                  <br />
                  Weka PIN yako ya Mobile Money kuthibitisha:
                </p>
                <input
                  type="password"
                  maxLength={4}
                  value={ussdPin}
                  onChange={(e) => setUssdPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 4-digit PIN"
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-400/60 text-amber-300 placeholder-gray-500 text-sm tracking-widest text-center focus:outline-none"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs text-left max-w-sm mx-auto">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => setStep('intro')}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmUssdPin}
                  disabled={isAuthorizingPin || ussdPin.length < 4}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition disabled:opacity-50"
                >
                  {isAuthorizingPin ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} />
                      <span>Confirm PIN & Boost</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="py-6 text-center space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-lg font-black text-gray-900 dark:text-white">
                Payment Successful!
              </h4>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                Your wave is now officially boosted for 48 hours with priority feed ranking and a golden badge!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pro Upgrade Modal */}
      {isUpgradeModalOpen && (
        <MobileMoneyPaymentModal
          onClose={() => setIsUpgradeModalOpen(false)}
          onSuccess={() => {
            setIsUpgradeModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
