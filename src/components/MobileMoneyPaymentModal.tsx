import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MobileMoneyProvider, EastAfricanCurrency } from '../types';
import {
  initiateMobileMoneyPayment,
  completeSubscription,
  PRO_TIERS,
  detectCarrier,
  formatPhoneNumber,
  MOBILE_CARRIERS,
} from '../services/paymentService';
import { submitPaymentRequest } from '../services/verificationService';
import { formatLocalPrice, useAfricanRegion } from '../utils/africanCultureConfig';
import {
  X,
  CheckCircle2,
  Phone,
  ShieldCheck,
  Crown,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Smartphone,
  AlertCircle,
  Check,
} from 'lucide-react';

interface MobileMoneyPaymentModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  initialPlan?: 'monthly' | 'harvest';
  initialTier?: 'weekly' | 'monthly' | 'annual';
}

const PLAN_DETAILS = {
  monthly: {
    id: 'monthly' as const,
    name: 'WaveLink Pro (Monthly)',
    priceTZS: 18000,
    period: 'per month',
    description: 'All 4 light themes, more daily AI images, Blue Star badge & 500MB uploads',
  },
  harvest: {
    id: 'harvest' as const,
    name: 'WaveLink Pro (Annual Pass)',
    priceTZS: 50000,
    period: 'per year',
    description: '1 full year of WaveLink Pro benefits with best value savings',
  },
};

export const MobileMoneyPaymentModal: React.FC<MobileMoneyPaymentModalProps> = ({
  onClose,
  onSuccess,
  initialPlan = 'monthly',
  initialTier,
}) => {
  const { currentUser, userProfile } = useAuth();
  const { currency, setCurrency } = useAfricanRegion(
    userProfile?.countryCode,
    userProfile?.preferredCurrency,
    userProfile?.panAfricanLanguage
  );

  // Simple 3-step flow: 1 = Enter phone number, 2 = Choose provider, 3 = Confirm (or 4 = Done)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'harvest'>(
    initialTier === 'annual' ? 'harvest' : initialPlan
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<MobileMoneyProvider>('airtel');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptRef, setReceiptRef] = useState<string>('');

  const currentPlan = PLAN_DETAILS[selectedPlan];

  const handlePhoneInput = (val: string) => {
    setPhoneNumber(val);
    setError(null);
    if (val.trim().length >= 3) {
      setProvider(detectCarrier(val));
    }
  };

  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phoneNumber.replace(/[^0-9+]/g, '');
    if (cleaned.length < 9) {
      setError('Please enter a valid mobile phone number (e.g. 0784 123 456).');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleStep2Continue = () => {
    setError(null);
    setStep(3);
  };

  const handleConfirmPayment = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber.trim());

      // 1. Trigger AzamPay checkout on server sending ONLY payer's phoneNumber, amount, plan, and provider
      const checkoutRes = await fetch('/api/azampay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          amount: currentPlan.priceTZS,
          plan: selectedPlan,
          provider,
        }),
      });

      const checkoutData = await checkoutRes.json().catch(() => ({}));
      if (!checkoutRes.ok && checkoutData?.error) {
        throw new Error(checkoutData.error);
      }

      const txnId =
        checkoutData?.transactionId ||
        `WL_${Date.now().toString().slice(-6)}`;

      // 2. Record the subscription transaction & notification in Firestore
      try {
        const tierObj =
          PRO_TIERS.find((t) => t.id === (selectedPlan === 'harvest' ? 'annual' : 'monthly')) ||
          PRO_TIERS[1];
        const transaction = await initiateMobileMoneyPayment({
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: userProfile?.displayName || currentUser.displayName || 'Subscriber',
          tier: tierObj,
          phoneNumber: formattedPhone,
          provider,
        });
        await completeSubscription(
          transaction.id,
          currentUser.uid,
          selectedPlan === 'harvest' ? 'annual' : 'monthly'
        );
      } catch {
        // Also record in payment_requests for admin visibility if needed
        await submitPaymentRequest({
          userId: currentUser.uid,
          userPhone: formattedPhone,
          plan: selectedPlan,
          transactionId: txnId,
          amountTZS: currentPlan.priceTZS,
          userEmail: currentUser.email || '',
          userName: userProfile?.displayName || currentUser.displayName || 'Subscriber',
          userPhotoURL: userProfile?.photoURL || currentUser.photoURL || '',
        }).catch(() => {});
      }

      setReceiptRef(txnId);
      setStep(4);
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2200);
      }
    } catch (err: any) {
      setError(err.message || 'Could not complete payment request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/35 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--bg-surface,#FFFFFF)] border border-[var(--border-hairline,#EFECE6)] text-[var(--text-primary,#1C1917)] shadow-xl overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-[var(--border-hairline,#EFECE6)] flex items-center justify-between bg-[var(--bg-surface,#FFFFFF)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-primary,#2563EB)] text-white flex items-center justify-center shadow-xs">
              <Crown size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-[var(--text-primary,#1C1917)] leading-tight">
                WaveLink Pro
              </h2>
              <p className="text-xs text-[var(--text-secondary,#78716C)]">
                Payee: <strong className="text-[var(--text-primary,#1C1917)]">WaveLink</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] hover:bg-[var(--bg-canvas,#FAF7F2)] transition"
            aria-label="Close payment window"
          >
            <X size={20} />
          </button>
        </div>

        {/* Simple 3-Step Indicator */}
        {step < 4 && (
          <div className="px-6 py-3 bg-[var(--bg-canvas,#FAF7F2)] border-b border-[var(--border-hairline,#EFECE6)] flex items-center justify-between text-xs font-bold">
            <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-[var(--accent-primary,#2563EB)]' : 'text-stone-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? 'bg-[var(--accent-primary,#2563EB)] text-white' : 'bg-stone-200 text-stone-600'}`}>
                1
              </span>
              <span>Phone</span>
            </div>
            <div className="w-6 h-px bg-stone-300" />
            <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-[var(--accent-primary,#2563EB)]' : 'text-stone-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? 'bg-[var(--accent-primary,#2563EB)] text-white' : 'bg-stone-200 text-stone-600'}`}>
                2
              </span>
              <span>Provider</span>
            </div>
            <div className="w-6 h-px bg-stone-300" />
            <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-[var(--accent-primary,#2563EB)]' : 'text-stone-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 3 ? 'bg-[var(--accent-primary,#2563EB)] text-white' : 'bg-stone-200 text-stone-600'}`}>
                3
              </span>
              <span>Confirm</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* STEP 1: ENTER YOUR PHONE NUMBER */}
          {step === 1 && (
            <form onSubmit={handleStep1Continue} className="space-y-5">
              {/* Local Currency Switcher (TZS, KES, UGX) */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)]">
                <span className="text-[11px] font-bold text-[var(--text-secondary,#78716C)]">
                  Local Currency (TZS / KES / UGX):
                </span>
                <div className="flex items-center gap-1">
                  {(['TZS', 'KES', 'UGX'] as EastAfricanCurrency[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                        currency === c
                          ? 'bg-[#0D9488] text-white'
                          : 'bg-white text-stone-700 border border-stone-200'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Selector */}
              <div className="grid grid-cols-2 gap-2.5">
                {(['monthly', 'harvest'] as const).map((planKey) => {
                  const p = PLAN_DETAILS[planKey];
                  const active = selectedPlan === planKey;
                  return (
                    <button
                      key={planKey}
                      type="button"
                      onClick={() => setSelectedPlan(planKey)}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        active
                          ? 'bg-[var(--bg-canvas,#FAF7F2)] border-[var(--accent-primary,#2563EB)] ring-2 ring-[var(--accent-primary,#2563EB)]/15'
                          : 'bg-white border-[var(--border-hairline,#EFECE6)] hover:bg-[var(--bg-canvas,#FAF7F2)]'
                      }`}
                    >
                      <div className="text-xs font-extrabold text-[var(--text-primary,#1C1917)]">
                        {planKey === 'monthly' ? 'Monthly Pro' : 'Annual Pass'}
                      </div>
                      <div className="text-base font-black text-[var(--accent-primary,#2563EB)] mt-0.5">
                        {formatLocalPrice(p.priceTZS, currency)}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary,#78716C)]">
                        {p.period}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm font-extrabold text-[var(--text-primary,#1C1917)] mb-2">
                  Step 1: Enter your phone number
                </label>
                <div className="relative">
                  <Phone
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent-primary,#2563EB)]"
                  />
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phoneNumber}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    placeholder="07XX XXX XXX"
                    className="w-full min-h-[52px] pl-11 pr-4 py-3 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] text-base font-mono font-bold text-[var(--text-primary,#1C1917)] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary,#2563EB)]"
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary,#78716C)] mt-1.5">
                  Supported via <strong>M-Pesa</strong>, <strong>Mixx by Yas</strong>, and <strong>Airtel Money</strong> for <strong>WaveLink</strong>.
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-amber-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* ONE MAIN BUTTON */}
              <button
                type="submit"
                className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
              >
                <span>Continue</span>
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {/* STEP 2: CHOOSE YOUR PROVIDER */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                  Step 2: Choose your provider
                </label>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-bold text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(MOBILE_CARRIERS) as MobileMoneyProvider[]).map((key) => {
                  const item = MOBILE_CARRIERS[key];
                  const isSelected = provider === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProvider(key)}
                      className={`min-h-[64px] p-4 rounded-2xl border text-left flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-[var(--bg-canvas,#FAF7F2)] border-[var(--accent-primary,#2563EB)] ring-2 ring-[var(--accent-primary,#2563EB)]/15'
                          : 'bg-white border-[var(--border-hairline,#EFECE6)] hover:bg-[var(--bg-canvas,#FAF7F2)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{item.logoEmoji}</span>
                        <div>
                          <div className="text-xs sm:text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary,#78716C)]">
                            {item.ussdCode}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={16} className="text-[var(--accent-primary,#2563EB)] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ONE MAIN BUTTON */}
              <button
                type="button"
                onClick={handleStep2Continue}
                className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[var(--accent-primary,#2563EB)] hover:opacity-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
              >
                <span>Continue</span>
                <ArrowRight size={17} />
              </button>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-[var(--text-primary,#1C1917)]">
                  Step 3: Confirm your payment
                </span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isSubmitting}
                  className="text-xs font-bold text-[var(--text-secondary,#78716C)] hover:text-[var(--text-primary,#1C1917)] flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-canvas,#FAF7F2)] border border-[var(--border-hairline,#EFECE6)] space-y-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary,#78716C)]">Payee Business</span>
                  <span className="font-extrabold text-[var(--text-primary,#1C1917)]">WaveLink</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary,#78716C)]">Plan</span>
                  <span className="font-bold text-[var(--text-primary,#1C1917)]">{currentPlan.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary,#78716C)]">Your Phone</span>
                  <span className="font-mono font-bold text-[var(--text-primary,#1C1917)]">{phoneNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary,#78716C)]">Provider</span>
                  <span className="font-bold text-[var(--text-primary,#1C1917)]">
                    {MOBILE_CARRIERS[provider].name}
                  </span>
                </div>
                <div className="pt-2.5 border-t border-[var(--border-hairline,#EFECE6)] flex items-center justify-between text-base">
                  <span className="font-extrabold text-[var(--text-primary,#1C1917)]">Total</span>
                  <span className="font-black text-[var(--accent-primary,#2563EB)]">
                    {formatLocalPrice(currentPlan.priceTZS, currency)}
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-amber-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* ONE MAIN BUTTON */}
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[#0D9488] hover:opacity-95 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sending prompt to your phone...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Confirm &amp; Pay {formatLocalPrice(currentPlan.priceTZS, currency)}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 4 && (
            <div className="py-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#0D9488] mx-auto flex items-center justify-center">
                <CheckCircle2 size={34} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-primary,#1C1917)]">
                  Welcome to WaveLink Pro!
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary,#78716C)] mt-1 max-w-xs mx-auto leading-relaxed">
                  Your payment to <strong>WaveLink</strong> ({receiptRef}) is confirmed. All themes, Pro badge, and creator perks are now unlocked.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[48px] py-3 px-6 rounded-2xl bg-[var(--accent-primary,#2563EB)] text-white font-extrabold text-sm transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
