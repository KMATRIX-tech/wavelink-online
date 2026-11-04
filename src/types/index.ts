export type UserStatus = 'active' | 'warned' | 'banned';
export type AppearanceTheme = 'classic' | 'sunset' | 'river' | 'sunrise';

export type ProBorderEffect = 'aura-gold' | 'neon-pulse' | 'cosmic-glow' | 'emerald-ring' | 'none';
export type ProAccentColor = 'purple' | 'gold' | 'emerald' | 'neon' | 'crimson';

export interface UserPrivacySettings {
  profileVisibility: 'public' | 'followers' | 'private';
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  allowDirectMessages: 'everyone' | 'followers' | 'none';
  allowCalls: 'everyone' | 'followers' | 'none';
  sparkVisibility: 'everyone' | 'followers';
  showReadReceipts: boolean;
  allowSearchByEmail: boolean;
  dataSharingConsent: boolean;
  updatedAt?: string;
}

export interface UserTermsAgreement {
  accepted: boolean;
  communityCodeAccepted: boolean;
  acceptedVersion: string;
  selectedSection: 'terms' | 'community' | 'creator_monetization' | 'data_protection';
  acceptedAt?: string;
}

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
  followingIds?: string[];
  blockedUserIds?: string[];
  appearanceTheme?: AppearanceTheme;
  privacySettings?: UserPrivacySettings;
  termsAgreement?: UserTermsAgreement;
  // Administrative and Security Roles
  role?: 'super_admin' | 'sub_admin' | 'user' | 'bot';
  isBot?: boolean;
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
  pointTransactions?: PointTransaction[];
  createdAt: string;
  updatedAt?: string;
}

export type PointTransactionType = 'earned' | 'spent';

export type PointTransactionCategory =
  | 'daily_reward'
  | 'post_boost'
  | 'tip_received'
  | 'tip_sent'
  | 'profile_perk'
  | 'community_bonus'
  | 'pro_bonus';

export interface PointTransaction {
  id: string;
  userId: string;
  type: PointTransactionType;
  category: PointTransactionCategory;
  title: string;
  description: string;
  amount: number;
  balanceAfter?: number;
  reference?: string;
  createdAt: string;
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

export interface SparkViewerEntry {
  userId: string;
  name: string;
  username?: string;
  photoURL?: string;
  viewedAt: string;
}

export interface SparkLikeEntry {
  userId: string;
  name: string;
  username?: string;
  photoURL?: string;
  likedAt: string;
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
  storagePath?: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  hasVideoChunks?: boolean;
  videoFileName?: string;
  videoDurationSeconds?: number;
  videoWidth?: number;
  videoHeight?: number;
  videoFileSize?: number;
  videoMimeType?: string;
  songTitle?: string;
  songArtist?: string;
  songAlbumArt?: string;
  songPreviewUrl?: string;
  likes: string[];
  likesCount: number;
  likedUsers?: SparkLikeEntry[];
  viewers?: string[];
  viewersCount?: number;
  viewerUsers?: SparkViewerEntry[];
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

export interface CallSignalMessage {
  type: 'call:signal';
  callId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  targetUserId: string;
  callType: 'video' | 'voice';
  signalType: 'offer' | 'answer' | 'candidate' | 'end' | 'ringing' | 'declined';
  sdp?: any;
  candidate?: any;
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
  topic?: string;
  summary?: string;
  message: string;
  source?: 'user' | 'support_bot';
  botConversationId?: string;
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
  mediaType?: 'image' | 'video' | 'audio' | 'none';
  audioUrl?: string;
  audioDuration?: number;
  gifUrl?: string;
  replyToId?: string;
  replyToText?: string;
  replyToSenderName?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  isBotReply?: boolean;
  botLogId?: string;
  reportedBadReply?: boolean;
  readBy?: string[];
  lastSeenAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TypingStatusEntry {
  userId: string;
  name: string;
  photoURL?: string;
  isTyping: boolean;
  updatedAt: string;
}

export interface ChatChannelMeta {
  id: string;
  lastSeen?: Record<string, string>;
  typing?: Record<string, TypingStatusEntry>;
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
  typing?: Record<string, TypingStatusEntry>;
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

export interface SupportBotConfig {
  id: string;
  enabled: boolean;
  dailyGeminiCap: number;
  dailyGeminiUsed: number;
  usageDate: string;
  userRateLimitPerMinute: number;
  maxMessageLength: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface SupportBotLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  channelId: string;
  userMessage: string;
  botReply: string;
  language?: 'en' | 'sw';
  escalatedToTicketId?: string;
  reportedBadReply?: boolean;
  reportReason?: string;
  createdAt: string;
}

export interface ScheduledBotDraft {
  id: string;
  type: 'weekly_update' | 'spark_of_the_day';
  title: string;
  content: string;
  mediaUrl?: string;
  legendaryTag?: string;
  status: 'draft' | 'approved' | 'posted';
  scheduledFor: string;
  approvedBy?: string;
  approvedAt?: string;
  postedAt?: string;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  reporterId: string;
  reporterEmail: string;
  reporterName?: string;
  targetType: 'user' | 'post' | 'bot_reply';
  targetId: string;
  targetAuthorId?: string;
  targetSummary?: string;
  reason: string;
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
}

export type AuditActionType =
  | 'ban_user'
  | 'unban_user'
  | 'warn_user'
  | 'role_change'
  | 'verify_user'
  | 'delete_post'
  | 'delete_ticket'
  | 'delete_account'
  | 'bot_toggle'
  | 'approve_draft'
  | 'report_submitted'
  | 'upgrade_status_change';

export interface AdminAuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  actorName: string;
  action: AuditActionType;
  targetId: string;
  targetLabel?: string;
  details: string;
  createdAt: string;
}

export type UpgradeCategory =
  | 'features'
  | 'social_features'
  | 'video_reels'
  | 'sparks'
  | 'media_sparks'
  | 'calling'
  | 'video_calls'
  | 'chat_messaging'
  | 'monetization'
  | 'monetization_pro'
  | 'ui_ux'
  | 'ui_ux_design'
  | 'performance'
  | 'performance_speed'
  | 'general_improvement'
  | 'other';

export type UpgradeSource = 'welink_ai' | 'support_bot' | 'live_talk' | 'manual_feedback' | 'user_manual';

export type UpgradeStatus = 'new' | 'reviewed' | 'planned' | 'implemented' | 'archived';

export interface UpgradeFeedbackItem {
  id: string;
  title: string;
  summary: string;
  userQuote?: string;
  category: UpgradeCategory;
  source: UpgradeSource;
  submittedByUserId?: string;
  userId?: string;
  submittedByUserName?: string;
  userName?: string;
  submittedByUserEmail?: string;
  userEmail?: string;
  status: UpgradeStatus;
  impactScore?: 'high' | 'medium' | 'low';
  impact?: 'high' | 'medium' | 'low';
  adminNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}
