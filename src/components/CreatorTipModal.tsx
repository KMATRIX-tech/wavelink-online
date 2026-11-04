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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/40 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[#FAF7F2]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white shadow-xs">
              <HandCoins size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#1C1917]">
                Tip {post.authorName}
              </h3>
              <p className="text-[11px] text-[#57534E] font-medium">
                Direct Mobile Money Creator Tip
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#57534E] hover:text-[#1C1917] rounded-xl"
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
                <label className="block text-xs font-bold text-[#1C1917] mb-2">
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
                            ? 'bg-gradient-to-r from-[#2563EB] to-[#0D9488] text-white shadow-xs scale-102'
                            : 'bg-[#FAF7F2] border border-[var(--border-subtle)] text-[#1C1917] hover:bg-stone-100'
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
                    className="py-2 px-2.5 rounded-xl text-xs font-mono bg-[#FAF7F2] border border-[var(--border-subtle)] text-[#1C1917] placeholder-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* 10% Platform Fee & Creator Payout Breakdown */}
              <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[var(--border-subtle)] space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[#57534E]">
                  <span>Gross Tip Amount:</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    TZS {currentGross.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <Percent size={12} />
                    <span>{isFeeWaived ? 'Platform Processing Fee (Waived for Admin/Pro):' : 'Platform Processing Fee (10%):'}</span>
                  </span>
                  <span className={`font-mono font-bold ${isFeeWaived ? 'text-emerald-600' : ''}`}>
                    {isFeeWaived ? '0 TZS (Waived)' : `-TZS ${platformFee.toLocaleString()}`}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between font-bold text-emerald-700">
                  <span>{isFeeWaived ? 'Creator Net Received (100%):' : 'Creator Net Received (90%):'}</span>
                  <span className="font-mono text-sm">
                    TZS {creatorNetAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Mobile Phone Input */}
              <div>
                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                  Your Airtel Money / Mobile Phone:
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 text-[#2563EB]" size={15} />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="e.g. 0784 123 456"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[var(--border-subtle)] text-xs sm:text-sm text-[#1C1917] font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isProcessing || currentGross <= 0}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
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
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                <span>{statusMessage || 'Waiting for PIN...'}</span>
              </div>

              <div className="bg-[#FAF7F2] text-[#1C1917] rounded-2xl p-4 border-2 border-amber-300 shadow-sm text-left space-y-2.5 font-mono text-xs max-w-sm mx-auto">
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
                  <span className="font-bold text-amber-700">🔴 Airtel Money USSD</span>
                  <span className="text-[10px] text-[#57534E]">Ref: {activeTx.reference}</span>
                </div>
                <p className="text-[#1C1917] text-xs">
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
                  className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-[#1C1917] placeholder-[#78716C] text-sm tracking-widest text-center focus:outline-none"
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
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-[#57534E] hover:bg-stone-100"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmUssdPin}
                  disabled={isAuthorizingPin || ussdPin.length < 4}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition disabled:opacity-50"
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
              <h4 className="text-lg font-black text-[#1C1917]">
                Payment Successful!
              </h4>
              <p className="text-xs text-[#57534E] max-w-xs mx-auto">
                Your tip of <strong>TZS {currentGross.toLocaleString()}</strong> has been credited to {post.authorName} (90% creator payout).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
