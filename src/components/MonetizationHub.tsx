import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, DAILY_REWARD_SCHEDULE, getLocalDateKey, getLocalPointTransactions } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import {
  Post,
  SubscriptionTier,
  PaymentTransaction,
  MobileMoneyProvider,
  PointTransaction,
  PointTransactionCategory
} from '../types';
import {
  PRO_TIERS,
  MOBILE_CARRIERS,
  detectCarrier,
  formatPhoneNumber,
  initiateAzamPayAirtelCheckout,
  completeSubscription,
  initiatePostBoost,
  completePostBoost
} from '../services/paymentService';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import {
  Coins,
  Crown,
  Sparkles,
  Zap,
  TrendingUp,
  Flame,
  CheckCircle2,
  Phone,
  ShieldCheck,
  ShoppingBag,
  ExternalLink,
  ArrowRight,
  Loader2,
  DollarSign,
  PieChart,
  Tag,
  Radio,
  Clock,
  Layers,
  Rocket,
  Gift,
  HandCoins,
  Server,
  Key,
  Smartphone,
  Lock,
  Percent,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Filter
} from 'lucide-react';

interface MonetizationHubProps {
  onNavigateToFeed?: () => void;
  onOpenBoostModalForPost?: (post: Post) => void;
}

export const MonetizationHub: React.FC<MonetizationHubProps> = ({
  onNavigateToFeed
}) => {
  const {
    currentUser,
    userProfile,
    isAdmin,
    isProEffective,
    isExemptFromPayments,
    activateHarvestPass,
    verifyAndRedeemCoupon,
    claimDailyReward,
    recordPointTransaction,
    updateUserProfile,
    showGlobalToast
  } = useAuth();
  const isProUser = isProEffective;
  const [copiedAdminPhone, setCopiedAdminPhone] = useState(false);
  const [hubPromoCode, setHubPromoCode] = useState('');
  const [isRedeemingHubPromo, setIsRedeemingHubPromo] = useState(false);
  const [hubPromoError, setHubPromoError] = useState<string | null>(null);

  const handleCopyAdminNumber = () => {
    const businessPayee = 'WaveLink';
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(businessPayee).catch(() => {});
      }
    } catch (_) {}
    setCopiedAdminPhone(true);
    showGlobalToast('Payee: WaveLink');
    setTimeout(() => setCopiedAdminPhone(false), 3000);
  };

  const handleRedeemHubPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hubPromoCode.trim().toUpperCase();
    if (!clean) return;
    setHubPromoError(null);
    setIsRedeemingHubPromo(true);
    try {
      const isValid = clean === 'HARVEST2026' ? (await activateHarvestPass(), true) : await verifyAndRedeemCoupon(clean);
      if (isValid) {
        setHubPromoCode('');
        setIsGeneralModalOpen(false);
      } else {
        setHubPromoError('Invalid or expired coupon code. Please verify your code and try again.');
      }
    } finally {
      setIsRedeemingHubPromo(false);
    }
  };

  // Active section tab inside MonetizationHub
  const [activeSection, setActiveSection] = useState<'tiers' | 'tipping' | 'boost' | 'affiliate' | 'history'>('tiers');

  // Transaction History sub-view filters & feedback state
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'earned' | 'spent'>('all');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<'all' | PointTransactionCategory>('all');
  const [pointActionFeedback, setPointActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessingPointAction, setIsProcessingPointAction] = useState(false);

  // Subscription state
  const [selectedTierId, setSelectedTierId] = useState<'weekly' | 'monthly' | 'annual'>('monthly');
  const selectedTier = PRO_TIERS.find((t) => t.id === selectedTierId) || PRO_TIERS.find((t) => t.id === 'monthly') || PRO_TIERS[0];
  const [subscriptionPhone, setSubscriptionPhone] = useState('');
  const [carrier, setCarrier] = useState<MobileMoneyProvider>('airtel');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<string>('');
  const [checkoutStep, setCheckoutStep] = useState<'idle' | 'initiating' | 'waiting_pin' | 'success'>('idle');
  const [pinInput, setPinInput] = useState('');
  const [activeSubTx, setActiveSubTx] = useState<PaymentTransaction | null>(null);

  // User posts for post boosting
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [selectedPostToBoost, setSelectedPostToBoost] = useState<string>('');
  const [boostPhone, setBoostPhone] = useState('');
  const [boostStatus, setBoostStatus] = useState<string>('');
  const [boostStep, setBoostStep] = useState<'idle' | 'initiating' | 'waiting_pin' | 'success'>('idle');
  const [boostPin, setBoostPin] = useState('');
  const [activeBoostTx, setActiveBoostTx] = useState<PaymentTransaction | null>(null);

  // Handle free boost for exempt members (admins, verified, unlocked pro)
  const handleInstantFreeBoost = async (postId: string) => {
    setBoostStep('initiating');
    setBoostStatus('Activating free post boost...');
    try {
      const txId = `free_boost_${Date.now()}`;
      await completePostBoost(txId, postId);
      setBoostStatus('Payment Successful!');
      setBoostStep('success');
      setTimeout(() => {
        setBoostStep('idle');
        setBoostStatus('');
      }, 3000);
    } catch (err) {
      console.error('Boost error:', err);
      setBoostStatus('Could not activate boost.');
      setBoostStep('idle');
    }
  };

  // Tips history for current user
  const [userTips, setUserTips] = useState<PaymentTransaction[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(true);

  // General Subscription Modal fallback
  const [isGeneralModalOpen, setIsGeneralModalOpen] = useState(false);

  // Load user posts for boosting
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'posts'), where('authorId', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: Post[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Post));
      setUserPosts(list);
      if (list.length > 0 && !selectedPostToBoost) {
        setSelectedPostToBoost(list[0].id);
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Load tips received
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'subscriptions'),
      where('recipientId', '==', currentUser.uid),
      where('planId', '==', 'tip')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PaymentTransaction[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PaymentTransaction));
        setUserTips(list);
        setIsLoadingTips(false);
      },
      () => {
        setIsLoadingTips(false);
      }
    );
    return () => unsub();
  }, [currentUser]);

  // Load user's own payment/subscription/boost/tip transactions for history enrichment
  const [userSentSubscriptions, setUserSentSubscriptions] = useState<PaymentTransaction[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'subscriptions'),
      where('userId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PaymentTransaction[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PaymentTransaction));
        setUserSentSubscriptions(list);
      },
      () => {}
    );
    return () => unsub();
  }, [currentUser]);

  const currentPointsBalance =
    userProfile?.points ??
    userProfile?.wavePoints ??
    DAILY_REWARD_SCHEDULE[0];

  const todayKey = getLocalDateKey();
  const isDailyClaimedToday = userProfile?.lastDailyRewardDate === todayKey;
  const engagementBonusId = `hub_engagement_${todayKey}`;

  // Build unified points transaction history from profile, local storage, daily streak history, and tips/boosts
  const allPointTransactions = useMemo<PointTransaction[]>(() => {
    const uid = currentUser?.uid || 'guest';
    const map = new Map<string, PointTransaction>();

    const storedList = userProfile?.pointTransactions || [];
    const localList = getLocalPointTransactions(uid);

    for (const item of [...storedList, ...localList]) {
      if (item && item.id && !map.has(item.id)) {
        map.set(item.id, item);
      }
    }

    // Ensure today's daily login reward and prior streak days are represented
    const streakDays = Math.max(1, userProfile?.loginStreak ?? 1);
    for (let i = 0; i < streakDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = getLocalDateKey(d);
      const txId = `daily_reward_${dateKey}`;
      if (!map.has(txId)) {
        const dayStreakNum = Math.max(1, streakDays - i);
        const cycleIdx = (dayStreakNum - 1) % DAILY_REWARD_SCHEDULE.length;
        const pts = i === 0
          ? (userProfile?.lastDailyRewardAmount ?? DAILY_REWARD_SCHEDULE[cycleIdx])
          : DAILY_REWARD_SCHEDULE[cycleIdx];
        map.set(txId, {
          id: txId,
          userId: uid,
          type: 'earned',
          category: 'daily_reward',
          title: `Day ${dayStreakNum} Daily Login Bonus`,
          description: `Habitual login reward claimed on ${dateKey}`,
          amount: pts,
          reference: `DLY-${dateKey.replace(/-/g, '')}`,
          createdAt: i === 0 ? (userProfile?.updatedAt || new Date().toISOString()) : d.toISOString()
        });
      }
    }

    // Include creator tips received as bonus points activity (+25 pts per supporter tip)
    for (const tip of userTips) {
      const tipPtId = `tip_recv_pt_${tip.id}`;
      if (!map.has(tipPtId)) {
        map.set(tipPtId, {
          id: tipPtId,
          userId: uid,
          type: 'earned',
          category: 'tip_received',
          title: `Creator Tip Bonus from ${tip.userName || 'Supporter'}`,
          description: `Received TZS ${(tip.netAmountTZS || Math.round(tip.amountTZS * 0.9)).toLocaleString()} net tip (+25 creator points)`,
          amount: 25,
          reference: tip.reference || `TIP-${tip.id.slice(0, 6).toUpperCase()}`,
          createdAt: tip.createdAt
        });
      }
    }

    // Include user's sent tips or boosts from subscriptions collection if not already logged
    for (const sub of userSentSubscriptions) {
      if (sub.planId === 'tip') {
        const sentTipId = `tip_sent_pt_${sub.id}`;
        if (!map.has(sentTipId)) {
          map.set(sentTipId, {
            id: sentTipId,
            userId: uid,
            type: 'earned',
            category: 'tip_sent',
            title: `Supporter Karma Reward (Tipped ${sub.recipientName || 'Creator'})`,
            description: `Sent TZS ${sub.amountTZS.toLocaleString()} creator tip (+15 supporter karma points)`,
            amount: 15,
            reference: sub.reference,
            createdAt: sub.createdAt
          });
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [currentUser?.uid, userProfile?.pointTransactions, userProfile?.loginStreak, userProfile?.lastDailyRewardAmount, userProfile?.updatedAt, userTips, userSentSubscriptions]);

  const filteredPointTransactions = useMemo(() => {
    return allPointTransactions.filter((tx) => {
      if (historyTypeFilter !== 'all' && tx.type !== historyTypeFilter) return false;
      if (historyCategoryFilter !== 'all' && tx.category !== historyCategoryFilter) return false;
      return true;
    });
  }, [allPointTransactions, historyTypeFilter, historyCategoryFilter]);

  const totalPointsEarned = useMemo(
    () => allPointTransactions.filter((t) => t.type === 'earned').reduce((sum, t) => sum + t.amount, 0),
    [allPointTransactions]
  );

  const totalPointsSpent = useMemo(
    () => allPointTransactions.filter((t) => t.type === 'spent').reduce((sum, t) => sum + t.amount, 0),
    [allPointTransactions]
  );

  const hasClaimedEngagementToday = useMemo(
    () => allPointTransactions.some((t) => t.id === engagementBonusId),
    [allPointTransactions, engagementBonusId]
  );

  const showTimedPointFeedback = (type: 'success' | 'error', message: string) => {
    setPointActionFeedback({ type, message });
    setTimeout(() => {
      setPointActionFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Earn Points: Claim Daily Login Check-in or Creator Hub Engagement Bonus
  const handleClaimEngagementBonus = async () => {
    if (hasClaimedEngagementToday) {
      showTimedPointFeedback('error', 'Today\'s +15 pts Creator Hub Check-In Bonus has already been claimed.');
      return;
    }
    setIsProcessingPointAction(true);
    try {
      const res = await recordPointTransaction({
        id: engagementBonusId,
        type: 'earned',
        category: 'community_bonus',
        title: 'Creator Hub Daily Check-In Bonus',
        description: 'Earned for reviewing creator monetization & community metrics today',
        amount: 15,
        reference: `ENG-${todayKey.replace(/-/g, '')}`
      });
      if (res.success) {
        showTimedPointFeedback('success', '+15 WavePoints added to your balance!');
        showGlobalToast('✨ +15 WavePoints Earned (Creator Hub Check-In)');
      } else if (res.error) {
        showTimedPointFeedback('error', res.error);
      }
    } finally {
      setIsProcessingPointAction(false);
    }
  };

  // Spend Points: Redeem points for a 24h Post Boost (-20 pts)
  const handleRedeemPointsPostBoost = async () => {
    const targetPostId = selectedPostToBoost || userPosts[0]?.id;
    const targetPost = userPosts.find((p) => p.id === targetPostId);
    setIsProcessingPointAction(true);
    try {
      const res = await recordPointTransaction({
        type: 'spent',
        category: 'post_boost',
        title: 'Wave Post Priority Boost (Points Redemption)',
        description: targetPost
          ? `Boosted "${targetPost.content ? targetPost.content.substring(0, 36) : 'Wave Post'}" for 48 hours`
          : 'Redeemed 20 WavePoints for 48-hour feed priority boost',
        amount: 20,
        reference: `PBST-${Math.floor(100000 + Math.random() * 900000)}`
      });
      if (!res.success) {
        showTimedPointFeedback('error', res.error || 'Insufficient points for Post Boost.');
        return;
      }
      if (targetPostId) {
        const txId = `pts_boost_${Date.now()}`;
        await completePostBoost(txId, targetPostId);
      }
      showTimedPointFeedback('success', 'Spent 20 WavePoints! Your wave post is now boosted for 48 hours.');
      showGlobalToast('🚀 Post Boosted with 20 WavePoints!');
    } finally {
      setIsProcessingPointAction(false);
    }
  };

  // Spend Points: Redeem points for Golden Aura Profile Ring (-15 pts)
  const handleRedeemPointsProfileAura = async () => {
    setIsProcessingPointAction(true);
    try {
      const res = await recordPointTransaction({
        type: 'spent',
        category: 'profile_perk',
        title: 'Golden Aura Profile Spotlight Ring',
        description: 'Redeemed 15 WavePoints to activate the Aura-Gold profile border effect',
        amount: 15,
        reference: `PERK-${Math.floor(100000 + Math.random() * 900000)}`
      });
      if (!res.success) {
        showTimedPointFeedback('error', res.error || 'Insufficient points for Profile Spotlight.');
        return;
      }
      await updateUserProfile({ proBorderEffect: 'aura-gold' }).catch(() => {});
      showTimedPointFeedback('success', 'Spent 15 WavePoints! Aura-Gold profile ring is now active.');
      showGlobalToast('👑 Golden Aura Profile Ring Activated (-15 pts)');
    } finally {
      setIsProcessingPointAction(false);
    }
  };

  // Spend Points: Send Community Spotlight Badge (-10 pts)
  const handleRedeemCommunitySpotlight = async () => {
    setIsProcessingPointAction(true);
    try {
      const res = await recordPointTransaction({
        type: 'spent',
        category: 'tip_sent',
        title: 'Community Wave Spotlight Boost',
        description: 'Spent 10 WavePoints to support community creator visibility',
        amount: 10,
        reference: `GFT-${Math.floor(100000 + Math.random() * 900000)}`
      });
      if (!res.success) {
        showTimedPointFeedback('error', res.error || 'Insufficient points.');
        return;
      }
      showTimedPointFeedback('success', 'Spent 10 WavePoints on Community Wave Spotlight!');
      showGlobalToast('🎁 Community Wave Spotlight Sent (-10 pts)');
    } finally {
      setIsProcessingPointAction(false);
    }
  };

  // Handle phone changes and auto-detect Airtel Money
  const handlePhoneChange = (val: string) => {
    setSubscriptionPhone(val);
    if (val.length >= 3) {
      const detected = detectCarrier(val);
      setCarrier(detected);
    }
  };

  // 1. Direct Airtel Money / AzamPay Pro Subscription Flow
  const handleTriggerSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!subscriptionPhone.trim()) {
      setCheckoutStatus('Please enter your Airtel Money or Mobile Money phone number.');
      return;
    }

    setIsSubscribing(true);
    // Real-time status feedback step 1:
    setCheckoutStatus('Initiating USSD push to your Airtel phone...');
    setCheckoutStep('initiating');

    try {
      const formatted = formatPhoneNumber(subscriptionPhone.trim());
      const result = await initiateAzamPayAirtelCheckout({
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: userProfile?.displayName || currentUser.displayName || 'Subscriber',
        tier: selectedTier,
        provider: carrier,
        phoneNumber: formatted
      });

      if (result && result.transaction) {
        setActiveSubTx(result.transaction);
        // Real-time status feedback step 2:
        setCheckoutStatus('Waiting for PIN...');
        setCheckoutStep('waiting_pin');
      } else {
        throw new Error('Could not establish AzamPay session.');
      }
    } catch (err: any) {
      console.error('Subscription checkout error:', err);
      setCheckoutStatus('Error connecting to AzamPay gateway. Please retry.');
      setCheckoutStep('idle');
    } finally {
      setIsSubscribing(false);
    }
  };

  // Confirm USSD PIN for Pro Subscription
  const handleConfirmSubPin = async () => {
    if (!activeSubTx || !currentUser) return;
    if (pinInput.length < 4) {
      setCheckoutStatus('Please enter a 4-digit mobile money PIN');
      return;
    }

    setIsSubscribing(true);
    setCheckoutStatus('Waiting for PIN...');

    try {
      await new Promise((r) => setTimeout(r, 1200));
      await completeSubscription(activeSubTx.id, currentUser.uid, selectedTier.id);

      // Real-time status feedback step 3:
      setCheckoutStatus('Payment Successful!');
      setCheckoutStep('success');

      setTimeout(() => {
        setCheckoutStep('idle');
        setCheckoutStatus('');
        setPinInput('');
      }, 3000);
    } catch (err) {
      console.error('Pin verification failed:', err);
      setCheckoutStatus('Authorization failed. Please check your PIN and balance.');
    } finally {
      setIsSubscribing(false);
    }
  };

  // 2. Direct Post Boosting Flow (2,000 TZS Micro-Payment)
  const handleTriggerPostBoost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPostToBoost) return;
    if (!boostPhone.trim()) {
      setBoostStatus('Please enter your mobile phone number.');
      return;
    }

    setBoostStep('initiating');
    // Real-time status feedback
    setBoostStatus('Initiating USSD push to your Airtel phone...');

    try {
      const formatted = formatPhoneNumber(boostPhone.trim());
      const detected = detectCarrier(boostPhone);
      const post = userPosts.find((p) => p.id === selectedPostToBoost);

      const result = await initiatePostBoost({
        postId: selectedPostToBoost,
        postTitle: post?.content?.substring(0, 40) || 'Wave Post',
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: userProfile?.displayName || currentUser.displayName || 'Creator',
        phoneNumber: formatted,
        provider: detected
      });

      if (result && result.transaction) {
        setActiveBoostTx(result.transaction);
        setBoostStatus('Waiting for PIN...');
        setBoostStep('waiting_pin');
      }
    } catch (err: any) {
      setBoostStatus('Could not reach AzamPay gateway.');
      setBoostStep('idle');
    }
  };

  const handleConfirmBoostPin = async () => {
    if (!activeBoostTx || !selectedPostToBoost) return;
    if (boostPin.length < 4) {
      setBoostStatus('Please enter a 4-digit PIN');
      return;
    }

    setBoostStatus('Waiting for PIN...');
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await completePostBoost(activeBoostTx.id, selectedPostToBoost);

      setBoostStatus('Payment Successful!');
      setBoostStep('success');

      setTimeout(() => {
        setBoostStep('idle');
        setBoostStatus('');
        setBoostPin('');
      }, 3000);
    } catch (err) {
      console.error('Boost auth error:', err);
      setBoostStatus('Failed to authorize boost payment.');
    }
  };

  // Total metrics calculations for creator tips
  const grossTipsTZS = userTips.reduce((acc, t) => acc + (t.amountTZS || 0), 0);
  const platformFeeDeductedTZS = Math.round(grossTipsTZS * 0.10); // 10% platform fee
  const netEarningsTZS = grossTipsTZS - platformFeeDeductedTZS; // 90% net creator payout

  // Affiliate Catalog samples
  const affiliateProducts = [
    {
      id: 'aff_1',
      brand: 'Sony Audio',
      title: 'Sony WH-1000XM5 Noise Canceling Headphones',
      price: 'TZS 850,000',
      category: 'Audio & Music',
      rating: 4.9,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
      url: 'https://www.sony.com',
      tag: 'Creator Studio Gear',
      commission: '8% Commission'
    },
    {
      id: 'aff_2',
      brand: 'Starlink Tanzania',
      title: 'Starlink Standard Satellite Internet Kit',
      price: 'TZS 990,000',
      category: 'Ultra-Fast Web',
      rating: 5.0,
      image: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=500&auto=format&fit=crop&q=80',
      url: 'https://www.starlink.com',
      tag: 'Zero Latency Calling',
      commission: 'TZS 45,000 / sale'
    },
    {
      id: 'aff_3',
      brand: 'DJI Official',
      title: 'DJI Osmo Mobile 6 Gimbal Stabilizer',
      price: 'TZS 420,000',
      category: 'Video Reels',
      rating: 4.8,
      image: 'https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=500&auto=format&fit=crop&q=80',
      url: 'https://www.dji.com',
      tag: 'Smooth Wave Reels',
      commission: '10% Commission'
    }
  ];

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Monetization Hero Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-blue-600 via-sky-600 to-emerald-600 text-white shadow-xl shadow-blue-900/15 border border-blue-400/30">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider mb-2">
              <Coins size={14} className="text-amber-300 animate-spin" style={{ animationDuration: '6s' }} />
              <span>WaveLink Monetization Engine</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Monetization &amp; Growth Hub
            </h2>
            <p className="text-blue-50 text-xs sm:text-sm mt-1 max-w-xl font-medium">
              Manage WaveLink Pro subscriptions, enable Creator Tipping (10% platform fee), boost post reach for 2,000 TZS, and explore native in-feed affiliate revenue.
            </p>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('history')}
              className="px-3.5 py-1.5 rounded-2xl bg-amber-400/25 hover:bg-amber-400/35 backdrop-blur-md text-white font-mono font-black text-xs flex items-center gap-1.5 border border-amber-300/50 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Coins size={14} className="text-amber-300" />
              <span>{currentPointsBalance.toLocaleString()} pts</span>
              <span className="text-[10px] font-sans font-bold bg-white/20 px-2 py-0.5 rounded-full">
                View History
              </span>
            </button>
            <span className="px-3.5 py-1.5 rounded-2xl bg-white/20 backdrop-blur-md text-white font-mono font-bold text-xs flex items-center gap-1.5 border border-white/30">
              <Zap size={14} className="fill-amber-300 text-amber-300" />
              <span>Lipa kwa Simu • Airtel Money • Tigo Pesa</span>
            </span>
          </div>
        </div>
      </div>

      {/* Exemption Banner for Admin, Verified by Admin, or Unlocked Pro */}
      {isExemptFromPayments && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-emerald-500/15 border-2 border-emerald-400/80 shadow-xs flex items-center justify-between flex-wrap gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-400 to-emerald-500 text-white shadow-md">
              <Crown size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base text-slate-900">
                  {isAdmin ? 'Administrator Exemption Active' : 'Verified Pro Exemption Active'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                  100% Free Access
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                All premium features do not apply payment requirements to your account. You have permanent free access to 500MB media uploads, 1080p calls, free post boosting, and ad-free browsing.
              </p>
            </div>
          </div>
          <div className="px-3.5 py-1.5 rounded-2xl bg-white border border-emerald-300 text-xs font-bold text-emerald-700">
            ✓ Clearance Verified
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex rounded-2xl bg-white border border-slate-200/90 p-1.5 text-xs font-bold overflow-x-auto shadow-xs gap-1">
        <button
          onClick={() => setActiveSection('tiers')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
            activeSection === 'tiers'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Crown size={15} />
          <span>Pro Subscriptions</span>
        </button>
        <button
          onClick={() => setActiveSection('tipping')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
            activeSection === 'tipping'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <HandCoins size={15} />
          <span>Creator Tipping (10% Fee)</span>
        </button>
        <button
          onClick={() => setActiveSection('boost')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
            activeSection === 'boost'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Rocket size={15} />
          <span>Post Boosting (2,000 TZS)</span>
        </button>
        <button
          onClick={() => setActiveSection('affiliate')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
            activeSection === 'affiliate'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag size={15} />
          <span>In-Feed Ads &amp; Affiliates</span>
        </button>
        <button
          onClick={() => setActiveSection('history')}
          className={`flex-1 min-w-[145px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
            activeSection === 'history'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock size={15} />
          <span>Transaction History</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              activeSection === 'history'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {allPointTransactions.length}
          </span>
        </button>
      </div>

      {/* ========================================================
          SECTION 1: WAVELINK PRO SUBSCRIPTION PRICING TIERS
          ======================================================== */}
      {activeSection === 'tiers' && (
        <div className="space-y-6">
          {/* Real-time Status Alert Banner */}
          {checkoutStatus && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fade-in shadow-md">
              <div className="flex items-center gap-2.5">
                {checkoutStatus.includes('Successful') ? (
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                ) : (
                  <Loader2 size={18} className="animate-spin text-amber-500 shrink-0" />
                )}
                <span className="font-bold">{checkoutStatus}</span>
              </div>
              <span className="font-mono text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-white">
                Airtel Money USSD
              </span>
            </div>
          )}

          {/* Pricing Tier Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRO_TIERS.map((tier) => {
              const isSelected = selectedTierId === tier.id;

              return (
                <div
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`cursor-pointer rounded-3xl p-6 border-2 transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#3B82F6] bg-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.16)] ring-4 ring-blue-500/10 scale-102'
                      : 'border-slate-200/80 bg-white hover:border-blue-300 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.05)]'
                  }`}
                >
                  {/* Discount / Popular Badges */}
                  {tier.discountBadge && (
                    <span className="absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-black bg-[#10B981] text-white shadow-sm">
                      {tier.discountBadge}
                    </span>
                  )}
                  {tier.id === 'monthly' && (
                    <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-xs font-black bg-[#3B82F6] text-white shadow-sm flex items-center gap-1">
                      <Sparkles size={11} />
                      <span>Default Pro Plan</span>
                    </span>
                  )}

                  <div>
                    <h3 className="text-lg font-black text-[#0F172A] mt-1">
                      {tier.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {tier.tagline}
                    </p>

                    <div className="mt-4 mb-5 pt-3 border-t border-slate-100">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-black text-[#3B82F6] font-mono">
                          TZS {tier.priceTZS.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          /{tier.billingPeriod.replace('per ', '')}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        ≈ ${tier.priceUSD} USD
                      </span>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      {tier.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                          <CheckCircle2 size={14} className="text-[#10B981] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-5 mt-5 border-t border-slate-100">
                    <button
                      type="button"
                      className={`w-full py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        isSelected
                          ? 'bg-[#3B82F6] text-white shadow-sm shadow-blue-500/20'
                          : 'bg-[#F8FAFC] text-[#0F172A] border border-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      <span>{isSelected ? '✓ Plan Selected' : `Select ${tier.name}`}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Official Admin Direct Mobile Money Payment Card */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_6px_28px_-4px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#2563eb] to-[#10B981] text-white shadow-sm shadow-blue-500/20">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h4 className="font-extrabold text-base sm:text-lg text-[#0F172A] flex items-center gap-2 flex-wrap">
                    <span>WaveLink Mobile Money Checkout</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                      WaveLink
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selected Plan: <strong className="text-[#2563eb] font-bold">{selectedTier.name}</strong> (TZS {selectedTier.priceTZS.toLocaleString()})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGeneralModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 text-white text-xs font-bold shadow-sm shadow-blue-500/20 transition active:scale-95 flex items-center gap-1.5"
                >
                  <Gift size={14} />
                  <span>Submit Transaction ID or Coupon</span>
                </button>
              </div>
            </div>

            {/* Official Payee & Promo Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50/70 via-sky-50/40 to-emerald-50/50 border border-blue-200/80 shadow-[0_2px_14px_-4px_rgba(37,99,235,0.08)] space-y-3.5">
                <div className="text-xs font-bold text-slate-800 leading-relaxed">
                  Complete your mobile money checkout with official payee{' '}
                  <strong className="text-[#2563eb] font-black">WaveLink</strong>{' '}
                  <span className="text-slate-600">(Airtel Money / M-Pesa / Tigo Pesa).</span>
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold text-emerald-700 tracking-wider">
                      Official Business Payee
                    </div>
                    <div className="text-2xl font-black text-emerald-600 tracking-tight select-all">
                      WaveLink
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGeneralModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 shrink-0 shadow-xs"
                  >
                    <Check size={14} />
                    <span>Pay Now</span>
                  </button>
                </div>
                <div className="text-xs text-slate-600 leading-relaxed">
                  After sending funds on your mobile phone, paste the Transaction ID from your operator&apos;s SMS receipt in the Payment Modal.
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 shadow-[0_2px_14px_-4px_rgba(15,23,42,0.05)] flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    <span>Direct Admin Verification &amp; Coupon Activation</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Enter your official coupon code below to activate your pass.
                  </p>

                  <form onSubmit={handleRedeemHubPromo} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={hubPromoCode}
                      onChange={(e) => setHubPromoCode(e.target.value)}
                      placeholder="Enter official coupon code"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isRedeemingHubPromo || !hubPromoCode.trim()}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs transition shrink-0 shadow-xs"
                    >
                      {isRedeemingHubPromo ? 'Activating...' : 'Redeem'}
                    </button>
                  </form>
                  {hubPromoError && (
                    <p className="text-[11px] text-rose-600 font-semibold">{hubPromoError}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsGeneralModalOpen(true)}
                  className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#10B981] hover:opacity-95 text-white font-extrabold text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <Crown size={15} />
                  <span>Open Payment &amp; Verification Modal</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 2: CREATOR TIPPING (10% FEE)
          ======================================================== */}
      {activeSection === 'tipping' && (
        <div className="space-y-6">
          {/* Creator Earnings Breakdown Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Gross Tips Received
              </span>
              <div className="text-2xl font-black font-mono tabular-numbers text-[#0F172A]">
                TZS {grossTipsTZS.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Total community tips sent to your waves
              </span>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                Platform Processing Fee (10%)
              </span>
              <div className="text-2xl font-black font-mono tabular-numbers text-amber-600">
                TZS {platformFeeDeductedTZS.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Automated 10% gateway and platform charge
              </span>
            </div>

            <div className="bg-white border border-blue-200 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#3B82F6] block mb-1">
                Net Creator Payout (90%)
              </span>
              <div className="text-2xl font-black font-mono tabular-numbers text-[#3B82F6]">
                TZS {netEarningsTZS.toLocaleString()}
              </div>
              <span className="text-[10px] text-[#10B981] font-semibold mt-1 block">
                ✓ Ready for instant mobile money transfer
              </span>
            </div>
          </div>

          {/* How Tipping Works Explanation */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
              <HandCoins size={18} className="text-[#3B82F6]" />
              <span>How Creator Tipping Works on WaveLink</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
                <span className="font-extrabold text-[#3B82F6] block mb-1 text-sm">1. One-Tap Tip Button</span>
                <p>Every post and reel in the feed includes a direct mobile money tipping icon for fans and admirers.</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
                <span className="font-extrabold text-amber-600 block mb-1 text-sm">2. 10% Platform Fee</span>
                <p>WaveLink deducts 10% for mobile carrier USSD fees and platform maintenance. 90% is credited directly to the creator.</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
                <span className="font-extrabold text-[#10B981] block mb-1 text-sm">3. Instant AzamPay Settlement</span>
                <p>Supporters pay via Airtel Money, M-Pesa, or Tigo Pesa with instant USSD push authentication.</p>
              </div>
            </div>
          </div>

          {/* Tip Ledger History */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[#0F172A]">
                Recent Supporter Tips Received ({userTips.length})
              </h4>
            </div>

            {isLoadingTips ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading tip ledger...</div>
            ) : userTips.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                <Gift size={28} className="mx-auto mb-2 opacity-50" />
                <p>No tips received yet. Keep posting high-vibe waves and reels to encourage supporter tips!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {userTips.map((tip) => (
                  <div key={tip.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-[#0F172A]">
                        {tip.userName}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        Ref: {tip.reference} • {new Date(tip.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold font-mono text-[#10B981] block">
                        +TZS {(tip.netAmountTZS || tip.amountTZS * 0.9).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        (Gross: TZS {tip.amountTZS.toLocaleString()}, 10% fee: TZS {(tip.platformFeeTZS || tip.amountTZS * 0.1).toLocaleString()})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 3: POST BOOSTING MICRO-PAYMENT (2,000 TZS)
          ======================================================== */}
      {activeSection === 'boost' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white shadow-sm shadow-blue-500/20">
                  <Rocket size={24} />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#10B981] border border-emerald-200 font-black text-[10px] uppercase tracking-wider mb-1">
                    <span>Micro-Payment: 2,000 TZS</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-[#0F172A]">
                    Post Boosting Engine
                  </h3>
                </div>
              </div>
              <div className="px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-xs font-bold text-[#3B82F6]">
                +300% Wave Impressions Guaranteed
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
              Pay a quick micro-payment of <strong>2,000 TZS</strong> via Airtel Money or AzamPay to boost any of your wave posts. Boosted posts are highlighted with a glowing golden <strong>Boosted</strong> badge and prioritized at the top of the feed for 48 hours.
            </p>

            {/* Status Feedback Banner */}
            {boostStatus && (
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-[#0F172A] text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-[#3B82F6]" />
                  <span className="font-bold">{boostStatus}</span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-[#3B82F6] text-white px-2 py-0.5 rounded-full font-bold">
                  2,000 TZS
                </span>
              </div>
            )}

            {/* Boost Form */}
            {boostStep === 'idle' && (
              <form onSubmit={handleTriggerPostBoost} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                      Select Wave Post to Boost:
                    </label>
                    <select
                      value={selectedPostToBoost}
                      onChange={(e) => setSelectedPostToBoost(e.target.value)}
                      className="w-full py-2.5 px-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A]"
                    >
                      {userPosts.map((post) => (
                        <option key={post.id} value={post.id}>
                          {post.content ? post.content.substring(0, 50) : `Wave (${new Date(post.createdAt).toLocaleDateString()})`} {post.isBoosted ? '  (Already Boosted)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!isExemptFromPayments && (
                    <div>
                      <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                        Airtel Money Phone Number:
                      </label>
                      <input
                        type="tel"
                        required
                        value={boostPhone}
                        onChange={(e) => setBoostPhone(e.target.value)}
                        placeholder="e.g. 0784 123 456"
                        className="w-full py-2.5 px-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs text-[#0F172A] font-mono"
                      />
                    </div>
                  )}
                </div>

                {isExemptFromPayments ? (
                  <button
                    type="button"
                    onClick={() => handleInstantFreeBoost(selectedPostToBoost)}
                    disabled={userPosts.length === 0}
                    className="px-6 py-2.5 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-40"
                  >
                    <Rocket size={15} />
                    <span>Boost Selected Post Free (0 TZS • VIP Exemption)</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={userPosts.length === 0}
                    className="px-6 py-2.5 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-40"
                  >
                    <Rocket size={15} />
                    <span>Boost Selected Post for 2,000 TZS</span>
                  </button>
                )}
              </form>
            )}

            {/* Waiting for PIN in Boost */}
            {(boostStep === 'initiating' || boostStep === 'waiting_pin') && (
              <div className="p-5 bg-[#F8FAFC] rounded-2xl border border-blue-200 space-y-3 max-w-md mx-auto text-center">
                <span className="text-xs font-bold text-[#3B82F6] block">{boostStatus}</span>
                <p className="text-xs text-slate-600">
                  Enter your mobile money PIN to confirm the 2,000 TZS micro-payment:
                </p>
                <input
                  type="password"
                  maxLength={4}
                  value={boostPin}
                  onChange={(e) => setBoostPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 4-digit PIN"
                  className="w-48 mx-auto px-3 py-2 rounded-xl bg-white border border-blue-300 text-center tracking-widest text-sm text-[#0F172A]"
                />
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => setBoostStep('idle')}
                    className="px-4 py-1.5 rounded-xl text-xs text-slate-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBoostPin}
                    disabled={boostPin.length < 4}
                    className="px-5 py-1.5 rounded-xl bg-[#3B82F6] text-white font-bold text-xs"
                  >
                    Confirm PIN
                  </button>
                </div>
              </div>
            )}

            {boostStep === 'success' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-center text-xs font-bold">
                ✓ Post boosted successfully! Your post now has priority ranking and the golden Boosted badge for 48 hours.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 4: IN-FEED ADS & SMART AFFILIATE TAGGING
          ======================================================== */}
      {activeSection === 'affiliate' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
                  <ShoppingBag size={18} className="text-[#3B82F6]" />
                  <span>Native In-Feed Sponsored Ads & Affiliate Catalog</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Subtle, non-intrusive sponsored posts match regular social wave styling with a tiny "Sponsored" tag and contextual shop buttons.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-[#3B82F6] border border-blue-200">
                1 Sponsored Wave per 8-10 Scrolls
              </span>
            </div>

            {/* Affiliate Catalog Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {affiliateProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="rounded-2xl border border-slate-200 overflow-hidden bg-[#F8FAFC] flex flex-col justify-between p-4 space-y-3"
                >
                  <div className="space-y-2">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900">
                      <img
                        src={prod.image}
                        alt={prod.title}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-md text-[9px] font-bold text-[#0F172A] flex items-center gap-1">
                        <Tag size={10} className="text-[#10B981]" />
                        <span>Sponsored</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6] block">
                        {prod.brand} • {prod.category}
                      </span>
                      <h4 className="font-bold text-xs text-[#0F172A] mt-0.5 line-clamp-2">
                        {prod.title}
                      </h4>
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-sm font-black font-mono text-[#0F172A]">
                          {prod.price}
                        </span>
                        <span className="text-[10px] text-[#10B981] font-bold">
                          {prod.commission}
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={prod.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
                  >
                    <span>Shop Now</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 5: POINTS TRANSACTION HISTORY SUB-VIEW
          ======================================================== */}
      {activeSection === 'history' && (
        <div className="space-y-6 animate-fade-in">
          {/* Points Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-amber-200/90 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Current WavePoints Balance
                </span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/80">
                  <Coins size={16} />
                </span>
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-[#0F172A]">
                  {currentPointsBalance.toLocaleString()}
                </span>
                <span className="text-xs font-extrabold uppercase text-amber-600">pts</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <Flame size={13} className="text-amber-500" />
                  <span>{Math.max(1, userProfile?.loginStreak ?? 1)}-Day Login Streak</span>
                </span>
                <span className="text-emerald-600 font-bold">
                  {isDailyClaimedToday ? '✓ Claimed Today' : 'Ready to Claim'}
                </span>
              </div>
            </div>

            <div className="bg-white border border-emerald-200/90 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Total Points Earned
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80">
                  <ArrowUpRight size={16} />
                </span>
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-emerald-600">
                  +{totalPointsEarned.toLocaleString()}
                </span>
                <span className="text-xs font-extrabold uppercase text-emerald-600">pts</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <span>Daily streaks, tips &amp; bonuses</span>
                <span className="font-mono font-bold text-emerald-700">
                  {allPointTransactions.filter((t) => t.type === 'earned').length} events
                </span>
              </div>
            </div>

            <div className="bg-white border border-rose-200/90 rounded-3xl p-5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                  Total Points Spent
                </span>
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80">
                  <ArrowDownRight size={16} />
                </span>
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-rose-600">
                  -{totalPointsSpent.toLocaleString()}
                </span>
                <span className="text-xs font-extrabold uppercase text-rose-600">pts</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <span>Post boosts, profile perks &amp; gifts</span>
                <span className="font-mono font-bold text-rose-700">
                  {allPointTransactions.filter((t) => t.type === 'spent').length} events
                </span>
              </div>
            </div>
          </div>

          {/* Feedback Banner for Point Earning / Spending Actions */}
          {pointActionFeedback && (
            <div
              className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-fade-in ${
                pointActionFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={17}
                  className={pointActionFeedback.type === 'success' ? 'text-emerald-600 shrink-0' : 'text-rose-600 shrink-0'}
                />
                <span>{pointActionFeedback.message}</span>
              </div>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-800">
                Balance: {currentPointsBalance.toLocaleString()} pts
              </span>
            </div>
          )}

          {/* Quick Points Earn & Spend Actions Card */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  <span>Earn &amp; Redeem WavePoints</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Claim daily engagement bonuses or spend your WavePoints on post boosts and profile perks. Every action is logged below in real time.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
              {/* Earn 1: Daily Hub Check-In Bonus */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/90 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-black text-[10px]">
                      +15 PTS
                    </span>
                    <Gift size={15} className="text-emerald-600" />
                  </div>
                  <h4 className="font-bold text-xs text-[#0F172A] mt-2">
                    Creator Hub Check-In
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daily bonus for reviewing your creator hub &amp; wallet activity.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessingPointAction || hasClaimedEngagementToday}
                  onClick={handleClaimEngagementBonus}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs transition shadow-2xs cursor-pointer"
                >
                  {hasClaimedEngagementToday ? '✓ Claimed Today' : 'Claim +15 pts'}
                </button>
              </div>

              {/* Spend 1: 48h Post Boost with Points */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-mono font-black text-[10px]">
                      -20 PTS
                    </span>
                    <Rocket size={15} className="text-blue-600" />
                  </div>
                  <h4 className="font-bold text-xs text-[#0F172A] mt-2">
                    Boost Post with Points
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Redeem 20 pts to boost your latest wave post in the feed for 48h.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessingPointAction || currentPointsBalance < 20}
                  onClick={handleRedeemPointsPostBoost}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition shadow-2xs cursor-pointer"
                >
                  Redeem (-20 pts)
                </button>
              </div>

              {/* Spend 2: Golden Aura Profile Ring */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-mono font-black text-[10px]">
                      -15 PTS
                    </span>
                    <Crown size={15} className="text-amber-500" />
                  </div>
                  <h4 className="font-bold text-xs text-[#0F172A] mt-2">
                    Aura-Gold Profile Ring
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Equip the luminous golden aura border on your profile avatar.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessingPointAction || currentPointsBalance < 15}
                  onClick={handleRedeemPointsProfileAura}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs transition shadow-2xs cursor-pointer"
                >
                  Redeem (-15 pts)
                </button>
              </div>

              {/* Spend 3: Community Spotlight Gift */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-mono font-black text-[10px]">
                      -10 PTS
                    </span>
                    <HandCoins size={15} className="text-purple-600" />
                  </div>
                  <h4 className="font-bold text-xs text-[#0F172A] mt-2">
                    Community Spotlight Gift
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Contribute 10 pts to the community creator spotlight pool.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessingPointAction || currentPointsBalance < 10}
                  onClick={handleRedeemCommunitySpotlight}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-xs transition shadow-2xs cursor-pointer"
                >
                  Redeem (-10 pts)
                </button>
              </div>
            </div>
          </div>

          {/* Transaction History Ledger */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)] space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-base text-[#0F172A] flex items-center gap-2">
                  <Clock size={18} className="text-[#3B82F6]" />
                  <span>Recent Points Earning &amp; Spending Activity</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete ledger of your WavePoints bonuses, streak rewards, creator tips, and point redemptions.
                </p>
              </div>

              {/* Filter Controls */}
              <div className="flex items-center flex-wrap gap-2">
                <div className="inline-flex rounded-xl bg-[#F8FAFC] border border-slate-200 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      historyTypeFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({allPointTransactions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('earned')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      historyTypeFilter === 'earned'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Earned ({allPointTransactions.filter((t) => t.type === 'earned').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('spent')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      historyTypeFilter === 'spent'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Spent ({allPointTransactions.filter((t) => t.type === 'spent').length})
                  </button>
                </div>

                <div className="relative flex items-center">
                  <Filter size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <select
                    value={historyCategoryFilter}
                    onChange={(e) => setHistoryCategoryFilter(e.target.value as 'all' | PointTransactionCategory)}
                    className="pl-8 pr-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="daily_reward">Daily Login Rewards</option>
                    <option value="community_bonus">Community Bonuses</option>
                    <option value="post_boost">Post Boosts</option>
                    <option value="profile_perk">Profile Perks</option>
                    <option value="tip_received">Tips Received</option>
                    <option value="tip_sent">Tips &amp; Gifts Sent</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredPointTransactions.length === 0 ? (
              <div className="py-12 text-center space-y-2 text-slate-400">
                <Coins size={32} className="mx-auto opacity-50 text-amber-500" />
                <p className="text-sm font-bold text-slate-600">No point transactions match this filter</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Try switching the filter to &ldquo;All&rdquo; or use the quick actions above to earn or redeem WavePoints.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredPointTransactions.map((tx) => {
                  const isEarned = tx.type === 'earned';
                  const formattedDate = (() => {
                    try {
                      const d = new Date(tx.createdAt);
                      return d.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    } catch {
                      return tx.createdAt;
                    }
                  })();

                  const getCategoryBadgeLabel = (cat: PointTransactionCategory) => {
                    switch (cat) {
                      case 'daily_reward':
                        return 'Daily Streak';
                      case 'post_boost':
                        return 'Post Boost';
                      case 'profile_perk':
                        return 'Profile Perk';
                      case 'tip_received':
                        return 'Creator Tip';
                      case 'tip_sent':
                        return 'Supporter Gift';
                      case 'pro_bonus':
                        return 'Pro Pass';
                      default:
                        return 'Hub Bonus';
                    }
                  };

                  return (
                    <div
                      key={tx.id}
                      className="py-3.5 px-2 sm:px-3 hover:bg-slate-50/80 rounded-2xl transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                            isEarned
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-rose-50 border-rose-200 text-rose-600'
                          }`}
                        >
                          {tx.category === 'daily_reward' ? (
                            <Calendar size={18} />
                          ) : tx.category === 'post_boost' ? (
                            <Rocket size={18} />
                          ) : tx.category === 'profile_perk' ? (
                            <Crown size={18} />
                          ) : tx.category === 'tip_received' || tx.category === 'tip_sent' ? (
                            <HandCoins size={18} />
                          ) : (
                            <Sparkles size={18} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-sm text-[#0F172A] truncate">
                              {tx.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                isEarned
                                  ? 'bg-emerald-100/80 text-emerald-800'
                                  : 'bg-rose-100/80 text-rose-800'
                              }`}
                            >
                              {getCategoryBadgeLabel(tx.category)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {tx.description}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                            <span>{formattedDate}</span>
                            {tx.reference && (
                              <>
                                <span>•</span>
                                <span>Ref: {tx.reference}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-mono text-xs sm:text-sm font-black ${
                            isEarned
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
                              : 'bg-rose-50 text-rose-600 border border-rose-200/80'
                          }`}
                        >
                          {isEarned ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          <span>
                            {isEarned ? '+' : '-'}
                            {tx.amount.toLocaleString()} pts
                          </span>
                        </div>
                        {typeof tx.balanceAfter === 'number' && (
                          <div className="text-[10px] font-mono text-slate-400 mt-1">
                            Bal: {tx.balanceAfter.toLocaleString()} pts
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* General Subscription Modal if requested */}
      {isGeneralModalOpen && (
        <MobileMoneyPaymentModal
          initialTier={selectedTierId}
          onClose={() => setIsGeneralModalOpen(false)}
          onSuccess={() => setIsGeneralModalOpen(false)}
        />
      )}
    </div>
  );
};
