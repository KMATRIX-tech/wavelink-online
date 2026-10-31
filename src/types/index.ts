export type UserStatus = 'active' | 'warned' | 'banned';

export type ProBorderEffect = 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
export type ProAccentColor = 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';

export interface UserProfile {
  id: string; // Auth UID
  email: string;
  username?: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  status: UserStatus;
  warningMessage?: string;
  isBanned: boolean;
  savedPostIds?: string[];
  // Administrative and Security Roles
  role?: 'super_admin' | 'sub_admin' | 'user';
  isSubAdmin?: boolean;
  hasBlueStar?: boolean;
  isVerifiedByAdmin?: boolean;
  isOfficialPartner?: boolean;
  partnerType?: string;
  partnerBadgeTitle?: string;
  isCommunityLeader?: boolean;
  // Pro Subscription Fields
  isPro?: boolean;
  proPlan?: 'weekly' | 'monthly' | 'annual';
  proExpiresAt?: string;
  proBadge?: 'verified' | 'vip' | 'creator' | 'founder';
  proBorderEffect?: ProBorderEffect;
  proAccentColor?: ProAccentColor;
  isOnline?: boolean;
  lastSeen?: string;
  lastSeenAt?: string;
  // Daily Login Reward & Habitual Engagement System
  points?: number;
  wavePoints?: number;
  loginStreak?: number;
  lastDailyRewardDate?: string; // YYYY-MM-DD local date
  lastDailyRewardAmount?: number;
  totalLoginDays?: number;
  createdAt: string;
  updatedAt?: string;
}

export type ReactionType = 'like' | 'heart' | 'fire';

export interface PostReactions {
  like?: string[];
  heart?: string[];
  fire?: string[];
}

export interface PostReactionCounts {
  like?: number;
  heart?: number;
  fire?: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  hasVideoChunks?: boolean;
  videoFileName?: string;
  mediaType?: 'image' | 'video' | 'none';
  songTitle?: string;
  songArtist?: string;
  songAlbumArt?: string;
  songPreviewUrl?: string;
  songAlbumName?: string;
  likes: string[]; // user IDs
  likesCount: number;
  reactions?: PostReactions;
  reactionCounts?: PostReactionCounts;
  commentsCount: number;
  savesCount?: number;
  viewsCount?: number;
  isEdited?: boolean;
  // Monetization features: Boosting & Tipping
  isBoosted?: boolean;
  boostedUntil?: string;
  boostTier?: string;
  tipsCount?: number;
  tipsTotalTZS?: number;
  // In-Feed Native Ads & Smart Affiliate Tagging
  isSponsored?: boolean;
  sponsorBrand?: string;
  sponsorBadge?: string;
  affiliateProductTitle?: string;
  affiliateProductPrice?: string;
  affiliateProductUrl?: string;
  affiliateButtonText?: string;
  affiliateRating?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface OnlineSong {
  trackId: number | string;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl: string;
  collectionName?: string;
  primaryGenreName?: string;
}

export interface Spark {
  id: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
  legendaryTag?: string;
  caption?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  hasVideoChunks?: boolean;
  videoFileName?: string;
  songTitle?: string;
  songArtist?: string;
  songAlbumArt?: string;
  songPreviewUrl?: string;
  likes: string[];
  likesCount: number;
  createdAt: string;
  expiresAt: string;
}

export interface CallRecipient {
  id: string;
  name: string;
  username?: string;
  photoURL?: string;
  email?: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
  content: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorUsername?: string;
  authorPhotoURL?: string;
  title: string;
  content: string;
  priority: 'normal' | 'urgent';
  createdAt: string;
  // Rich Community Notice & Event Fields
  type?: 'announcement' | 'event' | 'schedule';
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  imageUrl?: string;
  rsvpUserIds?: string[];
  rsvpCount?: number;
  isPinned?: boolean;
  isOfficialPartner?: boolean;
  partnerType?: 'church' | 'community_org' | 'civic_council' | 'partner' | string;
  partnerBadgeTitle?: string;
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  message: string;
  status: TicketStatus;
  adminReply?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  senderUsername?: string;
  senderPhotoURL?: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'none';
  gifUrl?: string;
  replyToId?: string;
  replyToText?: string;
  replyToSenderName?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  readBy?: string[];
  lastSeenAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatChannelMeta {
  id: string;
  lastSeen?: Record<string, string>;
  updatedAt?: string;
}

export interface AppSettings {
  id: string;
  videoCallsUnlocked: boolean;
  voiceCallsUnlocked: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  adminIds: string[];
  memberIds: string[];
  lastSeen?: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
}

export type MobileMoneyProvider = 'airtel' | 'mpesa' | 'tigopesa' | 'azampay';

export interface SubscriptionTier {
  id: 'weekly' | 'monthly' | 'annual';
  name: string;
  tagline: string;
  priceTZS: number;
  priceUSD: number;
  billingPeriod: string;
  discountBadge?: string;
  popular?: boolean;
  features: string[];
}

export interface CreatorTip {
  id: string;
  postId: string;
  postAuthorId: string;
  postAuthorName: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  grossAmountTZS: number;
  platformFeeTZS: number; // 10% processing fee
  netAmountTZS: number; // 90% creator received
  provider: MobileMoneyProvider;
  phoneNumber: string;
  reference: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface PostBoost {
  id: string;
  postId: string;
  userId: string;
  userEmail: string;
  amountTZS: number; // 2,000 TZS fixed
  provider: MobileMoneyProvider;
  phoneNumber: string;
  reference: string;
  status: 'pending' | 'completed' | 'failed';
  boostedUntil: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: 'weekly' | 'monthly' | 'annual' | 'boost' | 'tip';
  provider: MobileMoneyProvider;
  phoneNumber: string;
  amountTZS: number;
  amountUSD: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reference: string;
  mpesaReceiptNumber?: string;
  failureReason?: string;
  recipientId?: string;
  recipientName?: string;
  postId?: string;
  platformFeeTZS?: number;
  netAmountTZS?: number;
  createdAt: string;
  completedAt?: string;
}

export interface PaymentGatewayConfig {
  id: string;
  environment: 'sandbox' | 'live';
  // Airtel Money API
  airtelClientId?: string;
  airtelClientSecret?: string;
  airtelMerchantCode?: string;
  // Vodacom M-Pesa API
  mpesaConsumerKey?: string;
  mpesaConsumerSecret?: string;
  mpesaPasskey?: string;
  mpesaShortCode?: string;
  // Tigo Pesa / AzamPay / ClickPesa
  tigopesaApiKey?: string;
  azampayClientId?: string;
  azampaySecret?: string;
  azampayAppName?: string;
  azampayApiKey?: string;
  azampayEnv?: 'sandbox' | 'production' | 'live';
  clickpesaApiKey?: string;
  // Webhook security
  webhookSecret?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type ActiveTab =
  | 'feed'
  | 'studio'
  | 'videos'
  | 'announcements'
  | 'chat'
  | 'directory'
  | 'analytics'
  | 'monetization'
  | 'admin'
  | 'settings';

export type NotificationType =
  | 'message'
  | 'call'
  | 'post_like'
  | 'post_comment'
  | 'post_tip'
  | 'post_boost'
  | 'follow'
  | 'system';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorUsername?: string;
  actorPhotoURL?: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string; // e.g. postId, channelId, targetUserId
  read: boolean;
  createdAt: string;
}

export interface UserFollow {
  id: string;
  followerId: string;
  followerName: string;
  targetUserId: string;
  targetUserName?: string;
  createdAt: string;
}

export interface PendingVerification {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userPhotoURL?: string;
  tierId: 'weekly' | 'monthly' | 'annual';
  tierName: string;
  amountTZS: number;
  carrier: 'airtel' | 'tigopesa' | 'mpesa' | 'halopesa' | string;
  transactionId: string;
  phoneNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  notes?: string;
}

export interface SystemDomain {
  id: string;
  domain: string;
  url: string;
  status: 'active' | 'needs_auth_whitelist';
  lastSeenAt: string;
  firstSeenAt: string;
}

export interface PaymentRequest {
  id: string;
  userId: string;
  userPhone: string;
  plan: 'monthly' | 'harvest' | string;
  planName?: string;
  amountTZS?: number;
  transactionId: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp?: any;
  createdAt?: string;
  userEmail?: string;
  userName?: string;
  userPhotoURL?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
}


