import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { submitPaymentRequest } from '../services/verificationService';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { PaymentRequest } from '../types';
import {
  X,
  CheckCircle2,
  Phone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Loader2,
  Lock,
  Smartphone,
  AlertCircle,
  Zap,
  Crown,
  Clock,
  Copy,
  Check,
  Tag,
  Gift
} from 'lucide-react';

interface MobileMoneyPaymentModalProps {
  initialTier?: 'monthly' | 'harvest' | 'weekly' | 'annual';
  onClose: () => void;
  onSuccess?: () => void;
}

export const MobileMoneyPaymentModal: React.FC<MobileMoneyPaymentModalProps> = ({
  initialTier = 'monthly',
  onClose,
  onSuccess
}) => {
  const { currentUser, userProfile, activateHarvestPass, verifyAndRedeemCoupon, showGlobalToast } = useAuth();

  // Official Admin recipient phone number
  const ADMIN_PHONE_NUMBER = '0787473334';
  const ADMIN_RECIPIENT_NAME = 'WaveLink Official Admin';

  // Plan Selection: 'monthly' (TZS 18,000) or 'harvest' (TZS 50,000)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'harvest'>(
    initialTier === 'harvest' || initialTier === 'annual' ? 'harvest' : 'monthly'
  );

  // Form inputs
  const [payerPhone, setPayerPhone] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<PaymentRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Copy success toast state
  const [copiedToast, setCopiedToast] = useState(false);

  // Promo / Coupon Code state
  const [couponCode, setCouponCode] = useState('');
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Existing pending payment request check
  const [existingPending, setExistingPending] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'payment_requests'),
      where('userId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        let found: PaymentRequest | null = null;
        snapshot.forEach((d) => {
          const data = { id: d.id, ...d.data() } as PaymentRequest;
          if (data.status === 'pending') {
            found = data;
          }
        });
        setExistingPending(found);
      },
      (err) => {
        console.warn('Payment request listener notice:', err);
      }
    );
    return () => unsub();
  }, [currentUser]);

  // Copy phone number to clipboard with fallback for iframe environments
  const handleCopyPhoneNumber = () => {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(ADMIN_PHONE_NUMBER).catch(() => {
          const textArea = document.createElement('textarea');
          textArea.value = ADMIN_PHONE_NUMBER;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        });
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = ADMIN_PHONE_NUMBER;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (_) {}
    setCopiedToast(true);
    showGlobalToast(`Copied ${ADMIN_PHONE_NUMBER} to clipboard!`);
    setTimeout(() => setCopiedToast(false), 3000);
  };

  /**
   * Submit Payment Notification Form:
   * Saves to 'payment_requests' in Firestore with fields:
   * { userId, userPhone, plan, transactionId, status: 'pending', timestamp: serverTimestamp() }
   */
  const handleSubmitPaymentNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setFormError('Please sign in to submit a payment notification.');
      return;
    }

    const cleanPhone = payerPhone.trim();
    const cleanTxn = transactionId.trim().toUpperCase();

    if (!cleanPhone) {
      setFormError('Please enter the phone number you paid from.');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 9) {
      setFormError('Please enter a valid phone number (minimum 9 digits).');
      return;
    }
    if (!cleanTxn) {
      setFormError('Please enter your SMS Transaction ID / Reference Code.');
      return;
    }
    if (cleanTxn.length < 4) {
      setFormError('Please enter a valid Transaction Reference Code (e.g., 3A98KL12).');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const amount = selectedPlan === 'harvest' ? 50000 : 18000;

      const record = await submitPaymentRequest({
        userId: currentUser.uid,
        userPhone: cleanPhone,
        plan: selectedPlan,
        transactionId: cleanTxn,
        amountTZS: amount,
        userEmail: currentUser.email || '',
        userName: userProfile?.displayName || currentUser.displayName || 'WaveLink Subscriber',
        userPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined
      });

      setSubmittedRequest(record);
      setPayerPhone('');
      setTransactionId('');
    } catch (err: any) {
      console.error('Error submitting payment notification:', err);
      setFormError(err.message || 'Failed to submit payment notification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Official Coupon Code Verification:
   * Verifies code against official pass or Firestore coupon collection,
   * sets user.isPro = true, awards Pro badge, removes ads, and closes modal.
   */
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = couponCode.trim().toUpperCase();
    if (!clean) {
      setCouponError('Please enter an official coupon code');
      return;
    }

    setCouponError(null);
    setIsVerifyingCoupon(true);

    try {
      const isValid = clean === 'HARVEST2026' ? (await activateHarvestPass(), true) : await verifyAndRedeemCoupon(clean);
      if (isValid) {
        setCouponSuccess('Official Pass Activated!');
        setIsVerifyingCoupon(false);

        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 650);
        return;
      } else {
        setCouponError('Invalid or expired coupon code. Please verify your code and try again.');
      }
    } catch (err: any) {
      console.warn('Coupon redemption fallback:', err);
      if (clean === 'HARVEST2026') {
        await activateHarvestPass();
        setCouponSuccess('Official Pass Activated!');
        setIsVerifyingCoupon(false);
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 650);
        return;
      }
      setCouponError(err.message || 'Failed to activate coupon code.');
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - Bright, clean Sky Blue & Emerald Theme */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 via-sky-50/50 to-emerald-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-500 to-emerald-500 text-white shadow-md shadow-blue-500/20">
              <Crown size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <span>WaveLink Pro VIP</span>
                <span className="text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                  Direct Payment
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Airtel Money • M-Pesa • Tigo Pesa
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Active Pending Notice */}
          {existingPending && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
              <Clock size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-amber-950">
                  Payment Verification in Progress ({existingPending.plan === 'harvest' ? 'Harvest 1-Year Pass' : 'Monthly Pro'})
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5 font-mono">
                  Txn ID: <span className="font-bold">{existingPending.transactionId}</span> • Paid from: <span className="font-bold">{existingPending.userPhone}</span>
                </div>
                <p className="text-[11px] text-amber-700 mt-1">
                  Our admin team is reviewing your payment notification. Once approved, all ads will disappear and your Verified Blue Star badge will activate immediately!
                </p>
              </div>
            </div>
          )}

          {/* Submission Success Toast Card */}
          {submittedRequest && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-3 shadow-sm animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-emerald-950 text-sm">
                  Payment Notification Submitted Successfully!
                </div>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Reference Code <code className="font-bold font-mono text-emerald-950">{submittedRequest.transactionId}</code> from phone <span className="font-bold font-mono">{submittedRequest.userPhone}</span> has been routed to the Admin Dashboard for 1-click verification.
                </p>
              </div>
            </div>
          )}

          {/* Coupon Redemption Success Banner */}
          {couponSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-3 shadow-sm animate-in fade-in">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-emerald-950 text-sm">{couponSuccess}</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Welcome to WaveLink VIP! You now have a 1-year pass with verified Blue Star and zero ads.
                </p>
              </div>
            </div>
          )}

          {/* 1. Prominent Highlighted Admin Payment Instruction Box (Above Input Fields) */}
          <div className="rounded-3xl p-5 bg-gradient-to-br from-blue-50 via-sky-50/80 to-emerald-50 border-2 border-blue-300/80 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-600 text-white shadow-xs">
                  <Smartphone size={16} />
                </span>
                <span className="font-extrabold text-slate-900 text-sm">
                  Official Admin Mobile Money Line
                </span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                Verified Admin
              </span>
            </div>

            {/* Highlighted Instruction Card */}
            <div className="bg-white rounded-2xl p-4 border border-blue-200/90 shadow-xs space-y-3">
              <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                Send payment to <span className="text-blue-700 font-black">{ADMIN_RECIPIENT_NAME}:</span>{' '}
                <span className="font-mono font-black text-emerald-600 text-base tabular-nums">{ADMIN_PHONE_NUMBER}</span>{' '}
                <span className="text-slate-600 font-semibold">(Airtel Money / M-Pesa / Tigo Pesa).</span>
              </p>

              {/* Recipient Phone with Copy Number Button */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-700 block">
                    {ADMIN_RECIPIENT_NAME}
                  </span>
                  <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700 tracking-wider select-all tabular-nums">
                    {ADMIN_PHONE_NUMBER}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPhoneNumber}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition shadow-xs active:scale-95 shrink-0"
                >
                  {copiedToast ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedToast ? 'Copied!' : 'Copy Number'}</span>
                </button>
              </div>

              {/* Clear SMS Receipt Explanation */}
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/70 text-xs text-slate-700 font-medium leading-relaxed">
                After sending funds on your mobile phone, paste the Transaction ID from your operator&apos;s SMS receipt below.
              </div>

              {/* Copy success toast banner */}
              {copiedToast && (
                <div className="p-2.5 rounded-xl bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>Number {ADMIN_PHONE_NUMBER} copied to clipboard!</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. User Submission Form */}
          <form onSubmit={handleSubmitPaymentNotification} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Submit Payment Notification
              </span>
              <span className="text-[11px] text-slate-400">Step 2: Enter transaction proof</span>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle size={15} className="shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            {/* Plan Selector Buttons */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Select Your Plan:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlan('monthly')}
                  className={`p-3 rounded-2xl border text-left transition flex items-center justify-between ${
                    selectedPlan === 'monthly'
                      ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="font-extrabold text-xs text-slate-900">Monthly Pro</div>
                    <div className="text-[11px] text-slate-500">30-day VIP pass</div>
                  </div>
                  <div className="font-mono font-black text-sm text-blue-600">
                    TZS 18,000
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('harvest')}
                  className={`p-3 rounded-2xl border text-left transition flex items-center justify-between ${
                    selectedPlan === 'harvest'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1">
                      <span>Harvest 1-Year Pass</span>
                      <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-bold">BEST</span>
                    </div>
                    <div className="text-[11px] text-slate-500">365-day all-access</div>
                  </div>
                  <div className="font-mono font-black text-sm text-emerald-600">
                    TZS 50,000
                  </div>
                </button>
              </div>
            </div>

            {/* Payer Phone Number Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payer Phone Number (the number you paid from):
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3 text-slate-400" size={15} />
                <input
                  type="tel"
                  required
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  placeholder="e.g. 0784 123 456 or 0755..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* SMS Transaction ID / Reference Code Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                SMS Transaction ID / Reference Code:
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. 3A98KL12 or MP261030.1234"
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                From the mobile money confirmation SMS sent by Airtel Money, M-Pesa, or Tigo Pesa.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !transactionId.trim() || !payerPhone.trim()}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting Notification...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Submit Payment Notification</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* 3. Promo / Coupon Code Section */}
          <div className="pt-3 border-t border-slate-100">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Gift size={15} className="text-emerald-500" />
                  <span>Have a Coupon Code?</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">Official Pass</span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your official coupon code below to activate your pass.
              </p>

              {couponError && (
                <div className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle size={13} />
                  <span>{couponError}</span>
                </div>
              )}

              <form onSubmit={handleApplyCoupon} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3.5 top-3 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Enter official coupon code"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingCoupon || !couponCode.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-xs transition active:scale-95 flex items-center gap-1 shadow-xs shrink-0"
                >
                  {isVerifyingCoupon ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <span>Redeem</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
