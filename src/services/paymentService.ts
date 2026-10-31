import { db, cleanFirestoreData, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  SubscriptionTier,
  MobileMoneyProvider,
  PaymentTransaction,
  UserProfile,
  PaymentGatewayConfig
} from '../types';

export const PRO_TIERS: SubscriptionTier[] = [
  {
    id: 'weekly',
    name: 'Weekly Pass',
    tagline: 'Short-term VIP creative power & high-speed media access',
    priceTZS: 7000,
    priceUSD: 2.99,
    billingPeriod: 'per week',
    popular: false,
    features: [
      'Pro Verified Subscriber Badge',
      'Glowing Animated Avatar Aura Rings',
      '500MB Media Uploads & 1080p WebRTC Calls',
      'Creator Analytics & Insights',
      'Full Wave Post & Message Editing'
    ]
  },
  {
    id: 'monthly',
    name: 'Monthly Pro',
    tagline: 'Most popular! Full creative independence and monetization privileges',
    priceTZS: 18000,
    priceUSD: 6.99,
    billingPeriod: 'per month',
    popular: true, // Default selected plan
    discountBadge: 'Popular Choice',
    features: [
      'Everything in Weekly Pass',
      'Creator Tipping Enabled (Receive mobile money tips)',
      'Discounted Post Boosting (Micro-payment priority)',
      '1080p Full HD Video Calling with screen share',
      'Full Creator Audience Demographics & Reach',
      'Unlimited Wave Post Editing',
      'Unlimited Message Unsend Window',
      'Exclusive Accent Color Themes'
    ]
  },
  {
    id: 'annual',
    name: 'Annual VIP',
    tagline: 'Best value! Complete all-year VIP status with VIP founder emblem',
    priceTZS: 50000,
    priceUSD: 19.99,
    billingPeriod: 'per year',
    discountBadge: 'Best Value (Save 76%)',
    popular: false,
    features: [
      'Everything in Monthly Pro',
      'Founder VIP Blue Star & Crown Profile Emblem',
      'Priority WebRTC Media Bandwidth',
      'Zero Platform Commission on first 5 Creator Tips',
      'First Access to WaveLink Beta Releases',
      'Dedicated Priority Helpdesk Channel',
      'Zero Watermark on Media Studio Exports'
    ]
  }
];

export interface CarrierInfo {
  provider: MobileMoneyProvider;
  name: string;
  ussdCode: string;
  brandColor: string;
  bgLight: string;
  logoEmoji: string;
  prefixMatch: string[];
}

export const MOBILE_CARRIERS: Record<MobileMoneyProvider, CarrierInfo> = {
  airtel: {
    provider: 'airtel',
    name: 'Airtel Money',
    ussdCode: '*150*60#',
    brandColor: '#EF4444',
    bgLight: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
    logoEmoji: '🔴',
    prefixMatch: ['078', '068', '069', '25578', '25568', '25569']
  },
  mpesa: {
    provider: 'mpesa',
    name: 'Vodacom M-Pesa',
    ussdCode: '*150*00#',
    brandColor: '#E11D48',
    bgLight: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    logoEmoji: '📱',
    prefixMatch: ['074', '075', '076', '25574', '25575', '25576']
  },
  tigopesa: {
    provider: 'tigopesa',
    name: 'Tigo Pesa',
    ussdCode: '*150*01#',
    brandColor: '#0284C7',
    bgLight: 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900',
    logoEmoji: '🔵',
    prefixMatch: ['071', '065', '067', '077', '25571', '25565', '25567', '25577']
  },
  azampay: {
    provider: 'azampay',
    name: 'AzamPay / ClickPesa',
    ussdCode: 'Push Gateway',
    brandColor: '#9333EA',
    bgLight: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900',
    logoEmoji: '⚡',
    prefixMatch: []
  }
};

/**
 * Detect carrier based on Tanzanian phone number
 */
export function detectCarrier(phoneNumber: string): MobileMoneyProvider {
  const clean = phoneNumber.replace(/[^0-9]/g, '');
  for (const [providerKey, carrier] of Object.entries(MOBILE_CARRIERS)) {
    if (carrier.prefixMatch.some((prefix) => clean.startsWith(prefix) || clean.includes(prefix))) {
      return providerKey as MobileMoneyProvider;
    }
  }
  return 'mpesa';
}

/**
 * Format local Tanzanian phone numbers to standard format (+255 ...)
 */
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/[^0-9]/g, '');
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.substring(1)}`;
  if (digits.length > 0) return `+255${digits}`;
  return val;
}

export interface AzamPayCheckoutParams {
  userId: string;
  userEmail: string;
  userName: string;
  tier: SubscriptionTier;
  phoneNumber: string;
  provider?: MobileMoneyProvider;
}

export interface AzamPayCheckoutResult {
  transaction: PaymentTransaction;
  message: string;
  status: string;
  provider: string;
  reference: string;
}

/**
 * Fetch AzamPay gateway status from server backend
 */
export async function checkAzamPayGatewayStatus(): Promise<{
  status: string;
  appName: string;
  environment: string;
  supportedProviders: string[];
} | null> {
  try {
    const res = await fetch('/api/azampay/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Could not reach /api/azampay/status:', e);
  }
  return null;
}

/**
 * Initiate Airtel Money / Mobile Money payment via AzamPay Server Route
 */
export async function initiateAzamPayAirtelCheckout(
  params: AzamPayCheckoutParams
): Promise<AzamPayCheckoutResult> {
  const reference = `WVL-${Math.floor(100000 + Math.random() * 900000)}`;
  const txId = `azm_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let azamProvider = 'Airtel';
  if (params.provider === 'mpesa') azamProvider = 'Mpesa';
  else if (params.provider === 'tigopesa') azamProvider = 'Tigo';
  else if (params.provider === 'azampay') azamProvider = 'Airtel';

  let apiData: any = null;

  try {
    const response = await fetch('/api/azampay/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phoneNumber: params.phoneNumber,
        amount: params.tier.priceTZS,
        currency: 'TZS',
        provider: azamProvider,
        reference,
        planId: params.tier.id,
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail
      })
    });

    apiData = await response.json();
  } catch (err) {
    console.warn('Network call to /api/azampay/checkout encountered error:', err);
    apiData = {
      success: true,
      status: 'pending_pin',
      message: `Initiating ${azamProvider} Money USSD Push...`,
      reference
    };
  }

  const transaction: PaymentTransaction = {
    id: txId,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    planId: params.tier.id,
    provider: (params.provider || 'airtel') as MobileMoneyProvider,
    phoneNumber: params.phoneNumber,
    amountTZS: params.tier.priceTZS,
    amountUSD: params.tier.priceUSD,
    status: 'pending',
    reference: apiData?.reference || reference,
    createdAt: new Date().toISOString()
  };

  try {
    const txDocRef = doc(db, 'subscriptions', txId);
    await setDoc(txDocRef, cleanFirestoreData(transaction));
  } catch (error) {
    console.error('Error saving subscription transaction:', error);
  }

  return {
    transaction,
    message: apiData?.message || `Initiating ${azamProvider} Money USSD Push...`,
    status: apiData?.status || 'pending_pin',
    provider: azamProvider,
    reference: transaction.reference
  };
}

/**
 * Initiate Mobile Money Payment via USSD Push / API (General fallback)
 */
export async function initiateMobileMoneyPayment(params: {
  userId: string;
  userEmail: string;
  userName: string;
  tier: SubscriptionTier;
  provider: MobileMoneyProvider;
  phoneNumber: string;
}): Promise<PaymentTransaction> {
  const txId = `sub_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reference = `WVL-${Math.floor(100000 + Math.random() * 900000)}`;

  const transaction: PaymentTransaction = {
    id: txId,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    planId: params.tier.id,
    provider: params.provider,
    phoneNumber: params.phoneNumber,
    amountTZS: params.tier.priceTZS,
    amountUSD: params.tier.priceUSD,
    status: 'pending',
    reference,
    createdAt: new Date().toISOString()
  };

  try {
    const txDocRef = doc(db, 'subscriptions', txId);
    await setDoc(txDocRef, cleanFirestoreData(transaction));
    return transaction;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `subscriptions/${txId}`);
  }
}

/**
 * Complete and activate subscription upon USSD PIN confirmation
 */
export async function completeSubscription(
  transactionId: string,
  userId: string,
  planId: 'weekly' | 'monthly' | 'annual'
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date();
  if (planId === 'weekly') {
    expiresAt.setDate(expiresAt.getDate() + 7);
  } else if (planId === 'monthly') {
    expiresAt.setDate(expiresAt.getDate() + 30);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 365);
  }

  const completedAt = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  try {
    // 1. Update subscription transaction document
    const txDocRef = doc(db, 'subscriptions', transactionId);
    await updateDoc(txDocRef, {
      status: 'completed',
      completedAt,
      mpesaReceiptNumber: `AZM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    });

    // 2. Upgrade user profile in Firestore
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      isPro: true,
      hasBlueStar: true,
      proPlan: planId,
      proExpiresAt: expiresAtIso,
      proBadge: planId === 'annual' ? 'founder' : 'verified',
      proBorderEffect: planId === 'annual' ? 'aura-gold' : 'neon-pulse',
      proAccentColor: 'purple',
      updatedAt: completedAt
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

/**
 * 3. Post Boosting micro-payment (2,000 TZS)
 */
export async function initiatePostBoost(params: {
  postId: string;
  postTitle?: string;
  userId: string;
  userEmail: string;
  userName: string;
  phoneNumber: string;
  provider?: MobileMoneyProvider;
}): Promise<{ transaction: PaymentTransaction; reference: string }> {
  const reference = `BST-${Math.floor(100000 + Math.random() * 900000)}`;
  const txId = `boost_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const amountTZS = 2000; // 2,000 TZS micro-payment

  let azamProvider = 'Airtel';
  if (params.provider === 'mpesa') azamProvider = 'Mpesa';
  else if (params.provider === 'tigopesa') azamProvider = 'Tigo';

  try {
    await fetch('/api/azampay/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: params.phoneNumber,
        amount: amountTZS,
        currency: 'TZS',
        provider: azamProvider,
        reference,
        planId: 'boost',
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail,
        postId: params.postId
      })
    });
  } catch (err) {
    console.warn('Backend call for post boost notification:', err);
  }

  const transaction: PaymentTransaction = {
    id: txId,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    planId: 'boost',
    provider: (params.provider || 'airtel') as MobileMoneyProvider,
    phoneNumber: params.phoneNumber,
    amountTZS,
    amountUSD: 0.85,
    status: 'pending',
    reference,
    postId: params.postId,
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'subscriptions', txId), cleanFirestoreData(transaction));
  } catch (err) {
    console.warn('Could not save boost tx directly:', err);
  }

  return { transaction, reference };
}

/**
 * Complete Post Boost upon USSD PIN approval
 * Boosts post visibility with priority ranking and 'Boosted' badge for 48 hours
 */
export async function completePostBoost(
  transactionId: string,
  postId: string
): Promise<void> {
  const now = new Date();
  const boostedUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(); // 48h boost

  try {
    // Update post
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      isBoosted: true,
      boostedUntil,
      boostTier: 'priority_48h',
      updatedAt: now.toISOString()
    });

    // Update transaction
    const txRef = doc(db, 'subscriptions', transactionId);
    await updateDoc(txRef, {
      status: 'completed',
      completedAt: now.toISOString()
    });
  } catch (err) {
    console.error('Error completing post boost:', err);
  }
}

/**
 * 4. Creator Tipping: direct mobile money tipping, automatically deducting 10% platform processing fee
 */
export async function initiateCreatorTip(params: {
  postId: string;
  recipientId: string;
  recipientName: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  grossAmountTZS: number;
  phoneNumber: string;
  provider?: MobileMoneyProvider;
}): Promise<{ transaction: PaymentTransaction; platformFeeTZS: number; netAmountTZS: number }> {
  const platformFeeTZS = Math.round(params.grossAmountTZS * 0.10); // 10% platform fee
  const netAmountTZS = params.grossAmountTZS - platformFeeTZS; // 90% creator received
  const reference = `TIP-${Math.floor(100000 + Math.random() * 900000)}`;
  const txId = `tip_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let azamProvider = 'Airtel';
  if (params.provider === 'mpesa') azamProvider = 'Mpesa';
  else if (params.provider === 'tigopesa') azamProvider = 'Tigo';

  try {
    await fetch('/api/azampay/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: params.phoneNumber,
        amount: params.grossAmountTZS,
        currency: 'TZS',
        provider: azamProvider,
        reference,
        planId: 'tip',
        userId: params.senderId,
        userName: params.senderName,
        userEmail: params.senderEmail,
        recipientId: params.recipientId,
        postId: params.postId
      })
    });
  } catch (err) {
    console.warn('Backend call for tip checkout:', err);
  }

  const transaction: PaymentTransaction = {
    id: txId,
    userId: params.senderId,
    userEmail: params.senderEmail,
    userName: params.senderName,
    planId: 'tip',
    provider: (params.provider || 'airtel') as MobileMoneyProvider,
    phoneNumber: params.phoneNumber,
    amountTZS: params.grossAmountTZS,
    amountUSD: Number((params.grossAmountTZS / 2400).toFixed(2)),
    status: 'pending',
    reference,
    recipientId: params.recipientId,
    recipientName: params.recipientName,
    postId: params.postId,
    platformFeeTZS,
    netAmountTZS,
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'subscriptions', txId), cleanFirestoreData(transaction));
  } catch (err) {
    console.warn('Could not save tip tx:', err);
  }

  return { transaction, platformFeeTZS, netAmountTZS };
}

/**
 * Complete Creator Tip upon USSD PIN confirmation
 */
export async function completeCreatorTip(
  transactionId: string,
  postId: string,
  grossAmountTZS: number
): Promise<void> {
  const now = new Date();
  try {
    const postRef = doc(db, 'posts', postId);
    // increment tip stats
    await updateDoc(postRef, {
      tipsCount: (prev: any) => (prev || 0) + 1,
      tipsTotalTZS: (prev: any) => (prev || 0) + grossAmountTZS,
      updatedAt: now.toISOString()
    }).catch(async () => {
      // Direct set if field didn't exist
      await updateDoc(postRef, {
        tipsCount: 1,
        tipsTotalTZS: grossAmountTZS,
        updatedAt: now.toISOString()
      });
    });

    const txRef = doc(db, 'subscriptions', transactionId);
    await updateDoc(txRef, {
      status: 'completed',
      completedAt: now.toISOString()
    });
  } catch (err) {
    console.error('Error completing creator tip:', err);
  }
}

