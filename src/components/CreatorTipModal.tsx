import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Post, MobileMoneyProvider, PaymentTransaction } from '../types';
import {
  initiateCreatorTip,
  completeCreatorTip,
  detectCarrier,
  formatPhoneNumber,
  MOBILE_CARRIERS
} from '../services/paymentService';
import { sendNotification } from '../services/notificationService';
import {
  X,
  HandCoins,
  CheckCircle2,
  Phone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Loader2,
  Lock,
  Smartphone,
  AlertCircle,
  Percent,
  Coins
} from 'lucide-react';

interface CreatorTipModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TIP_PRESETS = [1000, 2000, 5000, 10000, 20000];

export const CreatorTipModal: React.FC<CreatorTipModalProps> = ({
  post,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser, userProfile, isAdmin, isProEffective, isExemptFromPayments } = useAuth();
  const [amountTZS, setAmountTZS] = useState<number>(2000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<MobileMoneyProvider>('airtel');

  // Flow steps: 'amount' | 'ussd_push' | 'success'
  const [step, setStep] = useState<'amount' | 'ussd_push' | 'success'>('amount');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [ussdPin, setUssdPin] = useState('');
  const [isAuthorizingPin, setIsAuthorizingPin] = useState(false);
  const [activeTx, setActiveTx] = useState<PaymentTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentGross = customAmount ? Number(customAmount) || 0 : amountTZS;
  // Automatically calculate 10% platform processing fee (0% waived for Admin & Verified Pro)
  const isFeeWaived = isExemptFromPayments;
  const platformFee = isFeeWaived ? 0 : Math.round(currentGross * 0.10);
  const creatorNetAmount = currentGross - platformFee;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhoneNumber(val);
    if (val.length >= 3) {
      const detected = detectCarrier(val);
      setProvider(detected);
    }
  };

  const handleInitiateTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (currentGross < 500) {
      setError('Minimum tip amount is 500 TZS');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('Please enter your mobile money registered phone number');
      return;
    }

    setIsProcessing(true);
    setError(null);
    // Real-time status feedback requirement
    setStatusMessage('Initiating USSD push to your Airtel phone...');

    try {
      const formatted = formatPhoneNumber(phoneNumber.trim());
      const { transaction } = await initiateCreatorTip({
        postId: post.id,
        recipientId: post.authorId,
        recipientName: post.authorName,
        senderId: currentUser.uid,
        senderEmail: currentUser.email || '',
        senderName: userProfile?.displayName || currentUser.displayName || 'Supporter',
        grossAmountTZS: currentGross,
        phoneNumber: formatted,
        provider
      });

      setActiveTx(transaction);
      // Next state
      setStatusMessage('Waiting for PIN...');
      setStep('ussd_push');
    } catch (err: any) {
      console.error('Error initiating creator tip:', err);
      setError('Failed to initiate tip payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmUssdPin = async () => {
    if (!activeTx || !currentUser) return;
    if (ussdPin.length < 4) {
      setError('Please enter your 4-digit mobile money PIN');
      return;
    }

    setIsAuthorizingPin(true);
    setError(null);
    setStatusMessage('Waiting for PIN...');

    try {
      await new Promise((r) => setTimeout(r, 1200));
      await completeCreatorTip(activeTx.id, post.id, currentGross);

      // Dispatch real-time creator tip notification
      sendNotification({
        recipientId: post.authorId,
        actorId: currentUser.uid,
        actorName: userProfile?.displayName || currentUser.displayName || 'A supporter',
        actorAvatar: userProfile?.photoURL || currentUser.photoURL || undefined,
        type: 'post_tip',
        title: 'Creator Tip Received! 💰',
        body: `${userProfile?.displayName || currentUser.displayName || 'Someone'} tipped you ${currentGross.toLocaleString()} TZS via Mobile Money!`,
        entityId: post.id,
        actionUrl: 'feed'
      }).catch(console.error);

      setStatusMessage('Payment Successful!');
      setStep('success');

      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      setError('PIN verification failed. Please try again.');
      setStatusMessage('Waiting for PIN...');
    } finally {
      setIsAuthorizingPin(false);
    }
  };

  const carrier = MOBILE_CARRIERS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#131927] border border-purple-200 dark:border-purple-900/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-xs">
              <HandCoins size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Tip {post.authorName}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Direct Mobile Money Creator Tip
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
          {step === 'amount' && (
            <form onSubmit={handleInitiateTip} className="space-y-4">
              {/* Preset Chips */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select Tip Amount:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TIP_PRESETS.map((amt) => {
                    const isSelected = !customAmount && amountTZS === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setAmountTZS(amt);
                          setCustomAmount('');
                        }}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold font-mono transition ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-xs scale-102'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {amt.toLocaleString()} TZS
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Custom TZS"
                    className="py-2 px-2.5 rounded-xl text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* 10% Platform Fee & Creator Payout Breakdown */}
              <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                  <span>Gross Tip Amount:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">
                    TZS {currentGross.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-1">
                    <Percent size={12} />
                    <span>{isFeeWaived ? 'Platform Processing Fee (Waived for Admin/Pro):' : 'Platform Processing Fee (10%):'}</span>
                  </span>
                  <span className={`font-mono font-bold ${isFeeWaived ? 'text-emerald-500' : ''}`}>
                    {isFeeWaived ? '0 TZS (Waived)' : `-TZS ${platformFee.toLocaleString()}`}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between font-bold text-emerald-600 dark:text-emerald-400">
                  <span>{isFeeWaived ? 'Creator Net Received (100%):' : 'Creator Net Received (90%):'}</span>
                  <span className="font-mono text-sm">
                    TZS {creatorNetAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Mobile Phone Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Your Airtel Money / Mobile Phone:
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 text-purple-500" size={15} />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="e.g. 0784 123 456"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isProcessing || currentGross <= 0}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Initiating USSD push...</span>
                  </>
                ) : (
                  <>
                    <span>Send Tip of TZS {currentGross.toLocaleString()}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
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
                  Thibitisha kumtumia tip ya TZS {currentGross.toLocaleString()} {post.authorName}?
                  <br />
                  Weka PIN yako kuthibitisha:
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
                  onClick={() => setStep('amount')}
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
                      <span>Confirm PIN & Tip</span>
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
                Your tip of <strong>TZS {currentGross.toLocaleString()}</strong> has been credited to {post.authorName} (90% creator payout).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
