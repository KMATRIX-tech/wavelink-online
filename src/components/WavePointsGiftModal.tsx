import React, { useState } from 'react';
import { Gift, Coins, Sparkles, X, CheckCircle2, HandCoins } from 'lucide-react';
import { Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { sendNotification } from '../services/notificationService';
import { triggerCelebration } from './CelebrationBanner';

interface WavePointsGiftModalProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
  onGiftSuccess?: (postId: string, pointsSent: number) => void;
  onOpenMobileMoneyTip?: (post: Post) => void;
}

const GIFT_TIERS = [
  { amount: 5, emoji: '🌊', labelEn: 'Wave Splash', labelSw: 'Wimbi Dogo' },
  { amount: 10, emoji: '🔥', labelEn: 'Fire Spark', labelSw: 'Cheche ya Moto' },
  { amount: 25, emoji: '💎', labelEn: 'Ocean Gem', labelSw: 'Kito cha Bahari' },
  { amount: 50, emoji: '👑', labelEn: 'Royal Crown', labelSw: 'Taji la Kifalme' },
  { amount: 100, emoji: '🚀', labelEn: 'Super Wave', labelSw: 'Wimbi Kuu' },
  { amount: 250, emoji: '🌟', labelEn: 'Creator Star', labelSw: 'Nyota ya Mbunifu' }
];

export const WavePointsGiftModal: React.FC<WavePointsGiftModalProps> = ({
  post,
  isOpen,
  onClose,
  onGiftSuccess,
  onOpenMobileMoneyTip
}) => {
  const { currentUser, userProfile, recordPointTransaction } = useAuth();
  const { language } = useLanguage();
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentSuccessAmount, setSentSuccessAmount] = useState<number | null>(null);

  if (!isOpen || !post) return null;

  const isSw = language === 'sw';
  const currentBalance =
    typeof userProfile?.wavePoints === 'number'
      ? userProfile.wavePoints
      : typeof userProfile?.points === 'number'
      ? userProfile.points
      : 15;

  const handleSendGift = async () => {
    if (!currentUser || isSending) return;
    setErrorMsg(null);

    if (currentBalance < selectedAmount) {
      setErrorMsg(
        isSw
          ? `Salio la WavePoints halitoshi (${currentBalance} pts). Chagua zawadi ndogo au kamilisha Check-in ya kila siku.`
          : `Not enough WavePoints (Balance: ${currentBalance} pts). Pick a smaller gift or claim your daily check-in.`
      );
      return;
    }

    setIsSending(true);
    try {
      const selectedTier =
        GIFT_TIERS.find((t) => t.amount === selectedAmount) || GIFT_TIERS[1];
      const res = await recordPointTransaction({
        type: 'spent',
        category: 'tip_sent',
        title: `Sent ${selectedTier.emoji} ${selectedTier.labelEn} to ${post.authorName}`,
        description: `Gifted ${selectedAmount} WavePoints on post ${post.id}`,
        amount: selectedAmount
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Could not send WavePoints gift.');
        setIsSending(false);
        return;
      }

      triggerCelebration('like');
      setSentSuccessAmount(selectedAmount);
      onGiftSuccess?.(post.id, selectedAmount);

      if (post.authorId && post.authorId !== currentUser.uid) {
        sendNotification({
          recipientId: post.authorId,
          actorId: currentUser.uid,
          actorName: userProfile?.displayName || currentUser.displayName || 'A Waver',
          actorPhotoURL: userProfile?.photoURL || currentUser.photoURL || undefined,
          type: 'post_tip',
          title: `${selectedTier.emoji} +${selectedAmount} WavePoints Gift!`,
          body: `${userProfile?.displayName || currentUser.displayName || 'Someone'} sent you a ${selectedTier.labelEn} (${selectedAmount} WavePoints)!`,
          entityId: post.id,
          actionUrl: 'feed'
        }).catch(() => {});
      }

      setTimeout(() => {
        setSentSuccessAmount(null);
        setIsSending(false);
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send WavePoints');
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="wavelink-glass-top-pill w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white border border-white/25 shadow-2xl space-y-4"
        style={{
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] flex items-center justify-center text-white shadow-md shrink-0">
              <Gift size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold tracking-tight truncate">
                {isSw ? `Tuma WavePoints kwa ${post.authorName}` : `Gift WavePoints to ${post.authorName}`}
              </h3>
              <p className="text-xs text-white/75 flex items-center gap-1.5">
                <Coins size={12} className="text-amber-400" />
                <span>
                  {isSw ? 'Salio lako:' : 'Your balance:'}{' '}
                  <strong className="text-amber-300 font-mono tabular-nums">
                    {currentBalance.toLocaleString()} pts
                  </strong>
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close gift modal"
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {sentSuccessAmount ? (
          <div className="py-8 text-center space-y-2.5">
            <div className="w-14 h-14 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 mx-auto flex items-center justify-center">
              <CheckCircle2 size={30} />
            </div>
            <h4 className="text-lg font-extrabold">
              {isSw
                ? `Umetuma +${sentSuccessAmount} WavePoints!`
                : `Sent +${sentSuccessAmount} WavePoints!`}
            </h4>
            <p className="text-xs text-white/75">
              {isSw
                ? `Asante kwa kumtia moyo ${post.authorName}!`
                : `Thank you for supporting ${post.authorName}!`}
            </p>
          </div>
        ) : (
          <>
            {/* Gift Tiers Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {GIFT_TIERS.map((tier) => {
                const isSelected = selectedAmount === tier.amount;
                const canAfford = currentBalance >= tier.amount;
                return (
                  <button
                    key={tier.amount}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(tier.amount);
                      setErrorMsg(null);
                    }}
                    className={`min-h-[76px] p-2.5 rounded-2xl border text-center flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-tr from-[#2563EB]/80 to-[#0D9488]/80 border-white text-white shadow-lg scale-[1.02]'
                        : canAfford
                        ? 'bg-white/10 hover:bg-white/15 border-white/20 text-white'
                        : 'bg-white/5 border-white/10 text-white/45'
                    }`}
                  >
                    <span className="text-xl leading-none">{tier.emoji}</span>
                    <span className="text-[11px] font-bold truncate max-w-full">
                      {isSw ? tier.labelSw : tier.labelEn}
                    </span>
                    <span className="text-xs font-extrabold font-mono tabular-nums text-amber-300">
                      {tier.amount} pts
                    </span>
                  </button>
                );
              })}
            </div>

            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-100 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Primary Send WavePoints CTA */}
            <button
              type="button"
              disabled={isSending}
              onClick={handleSendGift}
              className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={16} />
              <span>
                {isSending
                  ? isSw
                    ? 'Inatuma...'
                    : 'Sending...'
                  : isSw
                  ? `Tuma WavePoints ${selectedAmount} (Bila Pesa)`
                  : `Send ${selectedAmount} WavePoints (No Money)`}
              </span>
            </button>

            {/* Optional link to existing Mobile Money Tip modal so every existing feature remains accessible */}
            {onOpenMobileMoneyTip && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMobileMoneyTip(post);
                }}
                className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-white/8 hover:bg-white/14 border border-white/15 text-white/80 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <HandCoins size={14} className="text-teal-300" />
                <span>
                  {isSw
                    ? 'Au tuma Tip ya Mobile Money (M-Pesa / Airtel)'
                    : 'Or send a Mobile Money Tip (M-Pesa / Airtel)'}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
