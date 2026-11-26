/**
 * WaveLink Self-Service Help Center Knowledge Base (English & Kiswahili)
 * Covers all 11 core topics:
 * 1. Sign-up (signup)
 * 2. Passwords (passwords)
 * 3. Verification & 2-Step Verification (verification)
 * 4. Posting & Audience (posting)
 * 5. 24-Hour Sparks (sparks)
 * 6. Video Reels (reels)
 * 7. Voice & Video Calls (calls)
 * 8. Push Notifications (notifications)
 * 9. WaveLink Pro & Payments (payments)
 * 10. Safety, Reporting & Appeals (safety)
 * 11. Privacy, Sessions & Data Controls (privacy)
 */

export type HelpTopicId =
  | 'signup'
  | 'passwords'
  | 'verification'
  | 'posting'
  | 'sparks'
  | 'reels'
  | 'calls'
  | 'notifications'
  | 'payments'
  | 'safety'
  | 'privacy';

export interface HelpTopicMeta {
  id: HelpTopicId;
  emoji: string;
  labelEn: string;
  labelSw: string;
}

export const HELP_CENTER_TOPICS: HelpTopicMeta[] = [
  { id: 'signup', emoji: '👤', labelEn: 'Sign-Up', labelSw: 'Usajili' },
  { id: 'passwords', emoji: '🔑', labelEn: 'Passwords', labelSw: 'Nenosiri' },
  { id: 'verification', emoji: '🛡️', labelEn: 'Verification & 2FA', labelSw: 'Uthibitisho & 2FA' },
  { id: 'posting', emoji: '📝', labelEn: 'Posting', labelSw: 'Kuchapisha' },
  { id: 'sparks', emoji: '⚡', labelEn: 'Sparks', labelSw: 'Sparks' },
  { id: 'reels', emoji: '🎬', labelEn: 'Reels', labelSw: 'Reels' },
  { id: 'calls', emoji: '📞', labelEn: 'Calls', labelSw: 'Simu' },
  { id: 'notifications', emoji: '🔔', labelEn: 'Notifications', labelSw: 'Arifa' },
  { id: 'payments', emoji: '💳', labelEn: 'Payments & Pro', labelSw: 'Malipo & Pro' },
  { id: 'safety', emoji: '🚩', labelEn: 'Safety & Appeals', labelSw: 'Usalama & Rufaa' },
  { id: 'privacy', emoji: '🔒', labelEn: 'Privacy & Data', labelSw: 'Faragha & Data' }
];

export interface HelpArticle {
  id: HelpTopicId;
  topic: HelpTopicId;
  categoryEn: string;
  categorySw: string;
  titleEn: string;
  titleSw: string;
  summaryEn: string;
  summarySw: string;
  stepsEn: string[];
  stepsSw: string[];
  keywords: string[];
  selfServiceAction?: 'reset_password' | 'resend_verification' | 'unlock_account' | 'check_payment' | 'appeal';
}

export const HELP_CENTER_ARTICLES: HelpArticle[] = [
  {
    id: 'signup',
    topic: 'signup',
    categoryEn: 'Sign-Up & Accounts',
    categorySw: 'Usajili na Akaunti',
    titleEn: 'How to create a WaveLink account or link an existing Google account',
    titleSw: 'Jinsi ya kufungua akaunti ya WaveLink au kuunganisha akaunti ya Google',
    summaryEn: 'Sign up with a unique @username, email, and strong password, or continue with Google.',
    summarySw: 'Jisajili kwa jina la mtumiaji (@username), barua pepe na nenosiri imara, au tumia Google.',
    stepsEn: [
      'On the WaveLink sign-in screen, choose "Create Account" or "Continue with Google".',
      'Pick a unique @username (letters, numbers, underscores) and enter your email address.',
      'Create a password between 8 and 24 characters with at least one letter and one number.',
      'If you previously signed in with Google, use the "I already have an account" tab to add a username and password without losing your posts or WavePoints.'
    ],
    stepsSw: [
      'Kwenye skrini ya kuingia ya WaveLink, chagua "Fungua Akaunti" au "Endelea na Google".',
      'Chagua @username ya kipekee na weka anwani yako ya barua pepe.',
      'Tengeneza nenosiri lenye herufi 8 hadi 24 linalojumuisha angalau herufi moja na namba moja.',
      'Ikiwa uliwahi kuingia kwa Google, tumia kichupo cha "Tayari nina akaunti" kuongeza nenosiri bila kupoteza machapisho au WavePoints zako.'
    ],
    keywords: ['signup', 'sign up', 'register', 'create account', 'username', 'google', 'fungua akaunti', 'jisajili']
  },
  {
    id: 'passwords',
    topic: 'passwords',
    categoryEn: 'Passwords & Account Lockout',
    categorySw: 'Nenosiri na Kufungwa kwa Akaunti',
    titleEn: 'How to reset your password or unlock a temporarily locked account',
    titleSw: 'Jinsi ya kubadilisha nenosiri au kufungua akaunti iliyofungwa kwa muda',
    summaryEn: 'Reset a forgotten password by email or unlock your account with a verification code after failed login attempts.',
    summarySw: 'Badilisha nenosiri kwa barua pepe au fungua akaunti yako kwa msimbo baada ya kukosea kuingia mara nyingi.',
    stepsEn: [
      'Passwords must be 8–24 characters long and contain at least one letter and one number.',
      'If you forgot your password, use the "Reset Password" self-service tool below or in Settings → Security Center to receive a password reset link.',
      'After 5 failed login attempts, WaveLink temporarily locks the account for 15 minutes with a live countdown to block brute-force attacks.',
      'You can unlock your account immediately using the "Unlock Account" self-service tool by verifying a 6-digit code sent to your email.'
    ],
    stepsSw: [
      'Nenosiri lazima liwe na herufi 8–24 na liwe na angalau herufi moja na namba moja.',
      'Ukisahau nenosiri, tumia chombo cha "Badilisha Nenosiri" hapa chini au kwenye Mipangilio → Kituo cha Usalama kupokea kiungo kwenye barua pepe.',
      'Baada ya kukosea kuingia mara 5, WaveLink huifunga akaunti kwa muda wa dakika 15 ili kuzuia wadukuzi.',
      'Unaweza kufungua akaunti yako papo hapo kwa kutumia chombo cha "Fungua Akaunti" na kuweka msimbo wa tarakimu 6 uliotumwa kwenye barua pepe yako.'
    ],
    keywords: ['password', 'forgot', 'reset', 'locked', 'lockout', 'unlock', 'nenosiri', 'sahau', 'fungua'],
    selfServiceAction: 'reset_password'
  },
  {
    id: 'verification',
    topic: 'verification',
    categoryEn: 'Email & 2-Step Verification',
    categorySw: 'Uthibitisho wa Barua Pepe na Hatua 2',
    titleEn: 'Verifying your email & Authenticator App 2-Step Verification (TOTP)',
    titleSw: 'Kuthibitisha barua pepe na Uthibitisho wa Hatua 2 (Authenticator App)',
    summaryEn: 'Confirm your email address and enable built-in 2-Step Verification using an authenticator app like Google Authenticator.',
    summarySw: 'Thibitisha barua pepe yako na uwashe uthibitisho wa hatua 2 kwa programu ya authenticator kama Google Authenticator.',
    stepsEn: [
      'Tap "Resend Verification" in Self-Service Tools or Settings → Security Center to get a fresh verification email.',
      'In Settings → Security Center, turn on 2-Step Verification by scanning the QR code with Google Authenticator (or any TOTP app) and entering the 6-digit code.',
      'Firebase Authenticator App 2FA does not use backup recovery codes. If you ever lose your authenticator device, open a Support Ticket or contact Platform Admin so an administrator can remove your second factor after verifying ownership.'
    ],
    stepsSw: [
      'Gusa "Tuma Tena Uthibitisho" kwenye Zana za Msaada au Mipangilio → Kituo cha Usalama ili kupata barua pepe mpya ya uthibitisho.',
      'Katika Mipangilio → Kituo cha Usalama, washa Uthibitisho wa Hatua 2 kwa kuchanganua msimbo wa QR kwenye Google Authenticator na kuweka namba 6.',
      'Uthibitisho huu hauna misimbo ya dharura. Ukipoteza kifaa chako cha authenticator, fungua Tiketi ya Msaada ili Msimamizi aondoe hatua ya pili baada ya kuthibitisha umiliki.'
    ],
    keywords: ['verify', 'verification', 'email', '2fa', 'two-step', 'totp', 'authenticator', 'google authenticator', 'thibitisha', 'barua pepe', 'hatua mbili'],
    selfServiceAction: 'resend_verification'
  },
  {
    id: 'posting',
    topic: 'posting',
    categoryEn: 'Posting & Feed',
    categorySw: 'Kuchapisha na Mlisho (Feed)',
    titleEn: 'How to share photos, videos, music, and choose your post audience',
    titleSw: 'Jinsi ya kuchapisha picha, video, muziki na kuchagua wanaoona chapisho',
    summaryEn: 'Publish text, photos, or videos to Public, Followers Only, or Close Friends.',
    summarySw: 'Chapisha maandishi, picha au video kwa Wote, Wanaokufuata pekee, au Marafiki wa Karibu.',
    stepsEn: [
      'On the Home Feed, tap the composer box at the top or open Studio to create a post.',
      'Choose your audience before posting: Public, Followers Only, or Close Friends.',
      'Attach photos, a video (up to 60s on Free tier, 90s on Pro), or search and attach a song preview.',
      'Use #hashtags so your post can join Weekly Creator Challenges and trending topics.'
    ],
    stepsSw: [
      'Kwenye ukurasa wa Mwanzo (Home), gusa kisanduku cha kuandika juu au fungua Studio kuandaa chapisho.',
      'Chagua wanaoruhusiwa kuona: Wote (Public), Wanaokufuata (Followers), au Marafiki wa Karibu (Close Friends).',
      'Ambatanisha picha, video (hadi sekunde 60 kwa Bure, sekunde 90 kwa Pro), au chagua wimbo.',
      'Tumia #hashtag ili chapisho lako lishiriki kwenye Mashindano ya Wiki.'
    ],
    keywords: ['post', 'feed', 'photo', 'audience', 'hashtags', 'music', 'chapisha', 'picha', 'mlisho']
  },
  {
    id: 'sparks',
    topic: 'sparks',
    categoryEn: '24-Hour Sparks',
    categorySw: 'Sparks za Saa 24',
    titleEn: 'How 24-Hour Sparks work and who can view them',
    titleSw: 'Jinsi Sparks za saa 24 zinavyofanya kazi na nani anaweza kuziona',
    summaryEn: 'Share ephemeral photos and short videos that automatically disappear after 24 hours.',
    summarySw: 'Shiriki picha na video fupi za matukio ya siku zinazopotea zenyewe baada ya saa 24.',
    stepsEn: [
      'Tap the "+ Add Spark" card in the Spark tray at the top of your Home Feed.',
      'Upload up to multiple photo or short video slides, add captions, or pick background music.',
      'Tap your active Spark at any time to see who viewed and liked it.',
      'Control who can view your Sparks in Settings → Security Center → Privacy Settings.'
    ],
    stepsSw: [
      'Gusa "+ Weka Spark" kwenye safu ya Sparks juu ya ukurasa wa Mwanzo.',
      'Pakia picha au video fupi, ongeza maneno au chagua muziki wa chinichini.',
      'Gusa Spark yako wakati wowote kuona waliotazama na kuipenda.',
      'Dhibiti nani anayeweza kuona Sparks zako katika Mipangilio → Kituo cha Usalama → Faragha.'
    ],
    keywords: ['sparks', 'story', 'stories', '24 hours', 'status', 'viewers', 'hali']
  },
  {
    id: 'reels',
    topic: 'reels',
    categoryEn: 'Video Reels',
    categorySw: 'Video za Reels',
    titleEn: 'Uploading and watching vertical Video Reels',
    titleSw: 'Kupakia na kutazama Video za Reels',
    summaryEn: 'Watch full-screen vertical videos in the Reels tab and upload your own creations.',
    summarySw: 'Tazama video za wima kwenye kichupo cha Reels na upakie video zako mwenyewe.',
    stepsEn: [
      'Open the Reels (Videos) tab from the navigation bar to swipe through vertical creator videos.',
      'Free members can upload videos up to 50 MB (up to 60 seconds). WaveLink Pro members can upload HD videos up to 100 MB (up to 90 seconds).',
      'Tap the heart, comment, share, or report icon on any Reel to interact or flag unsafe content.'
    ],
    stepsSw: [
      'Fungua kichupo cha Reels (Video) kwenye menyu ili kutazama video za wabunifu.',
      'Akaunti za Bure zinaweza kupakia video hadi MB 50 (sekunde 60). Wanachama wa WaveLink Pro wanapakia hadi MB 100 (sekunde 90).',
      'Gusa kitufe cha kupenda, maoni, kushiriki, au kuripoti kwenye Reel yoyote.'
    ],
    keywords: ['reels', 'video', 'upload', 'vertical', 'duration', 'size', 'pakia video']
  },
  {
    id: 'calls',
    topic: 'calls',
    categoryEn: 'Voice & Video Calls',
    categorySw: 'Simu za Sauti na Video',
    titleEn: 'Making reliable Voice & Video Calls on phone and desktop',
    titleSw: 'Kupiga Simu za Sauti na Video kwenye simu na kompyuta',
    summaryEn: 'Start real-time WebRTC voice or video calls in any Direct Message conversation.',
    summarySw: 'Piga simu za moja kwa moja za sauti au video ndani ya ujumbe wa moja kwa moja (Chat).',
    stepsEn: [
      'Open any Direct Message conversation and tap the Voice or Video call button in the chat header.',
      'Allow microphone (and camera for video) permissions in your browser when prompted.',
      'Use the bottom control bar to Mute, toggle Camera, Flip camera, switch Speaker, or End the call.',
      'You can control who is allowed to call you (Everyone, Followers Only, or No One) in Settings → Security Center → Privacy.'
    ],
    stepsSw: [
      'Fungua mazungumzo yoyote kwenye Chat kisha uguse kitufe cha Simu ya Sauti au Video juu.',
      'Ruhusu kipaza sauti (na kamera kwa simu ya video) kwenye kivinjari chako.',
      'Tumia vitufe vya chini kuzima sauti, kuzima kamera, kugeuza kamera, kuwasha spika, au kukata simu.',
      'Unaweza kuchagua nani anayeruhusiwa kukupigia simu kwenye Mipangilio → Kituo cha Usalama → Faragha.'
    ],
    keywords: ['call', 'calls', 'video call', 'voice call', 'camera', 'microphone', 'simu', 'piga simu']
  },
  {
    id: 'notifications',
    topic: 'notifications',
    categoryEn: 'Push Notifications',
    categorySw: 'Arifa za Simu (Notifications)',
    titleEn: 'Turning on real device notifications and fixing blocked permissions',
    titleSw: 'Kuwasha arifa za simu na kutatua tatizo la kuzuiliwa kwenye kivinjari',
    summaryEn: 'Get instant alerts for messages, incoming calls, likes, comments, and new device sign-ins.',
    summarySw: 'Pokea arifa za papo hapo kwa jumbe, simu zinazoingia, maoni na uingiaji wa kifaa kipya.',
    stepsEn: [
      'Open Settings → Notifications (or tap the Bell icon at the top right) and tap "Enable notifications".',
      'If your browser shows "Blocked in the browser", tap the lock/tune icon next to the address bar in Chrome, set Notifications to "Allow", and tap "Re-check permission".',
      'Use the "Send test notification" button to test both local and push notifications on your device.'
    ],
    stepsSw: [
      'Fungua Mipangilio → Arifa (au gusa ikoni ya Kengele juu kulia) kisha uguse "Washa arifa".',
      'Ikiwa kivinjari kinaonyesha "Imezuiliwa", gusa ikoni ya kufuli karibu na anwani ya tovuti kwenye Chrome, weka Notifications kuwa "Allow", kisha uguse "Angalia tena".',
      'Tumia kitufe cha "Tuma arifa ya majaribio" kuhakikisha kifaa chako kinapokea arifa.'
    ],
    keywords: ['notifications', 'push', 'alerts', 'bell', 'blocked', 'arifa', 'kengele']
  },
  {
    id: 'payments',
    topic: 'payments',
    categoryEn: 'WaveLink Pro & Payments',
    categorySw: 'WaveLink Pro na Malipo',
    titleEn: 'Upgrading to WaveLink Pro, Mobile Money payments, and checking payment status',
    titleSw: 'Kujiunga na WaveLink Pro, malipo ya simu na kuangalia hali ya malipo yako',
    summaryEn: 'Pay with Airtel Money, M-Pesa, Mixx by Yas (Tigo Pesa), or HaloPesa and check your verification status anytime.',
    summarySw: 'Lipia kwa Airtel Money, M-Pesa, Tigo Pesa au HaloPesa na uangalie hali ya malipo yako wakati wowote.',
    stepsEn: [
      'WaveLink Pro (18,000 TZS/month) unlocks 25 daily AI images, 100 MB HD video uploads, all appearance themes, and a Pro badge.',
      'Go to Profile → WaveLink Pro to pay via Mobile Money or submit your transaction ID for verification.',
      'Use the "Check My Payment Status" tool below or ask the WaveLink Support Bot to inspect your live Pro status and recent payment requests.',
      'Remember: WaveLink Support will NEVER ask for your Mobile Money PIN or password.'
    ],
    stepsSw: [
      'WaveLink Pro (TZS 18,000 kwa mwezi) inafungua picha 25 za AI kwa siku, video za MB 100, mandhari zote na beji ya Pro.',
      'Nenda kwenye Wasifu → WaveLink Pro kulipia kwa simu au kuwasilisha namba ya muamala (Transaction ID).',
      'Tumia chombo cha "Angalia Hali ya Malipo Yangu" hapa chini au muulize WaveLink Support Bot.',
      'Kumbuka: WaveLink Support HAITAKUOMBA kamwe PIN yako ya simu au nenosiri.'
    ],
    keywords: ['payment', 'payments', 'pro', 'mpesa', 'airtel', 'tigopesa', 'azampay', 'malipo', 'transaction'],
    selfServiceAction: 'check_payment'
  },
  {
    id: 'safety',
    topic: 'safety',
    categoryEn: 'Safety, Reporting & Appeals',
    categorySw: 'Usalama, Kuripoti na Rufaa',
    titleEn: 'How to report posts, comments, reels, chats, or profiles and submit an appeal',
    titleSw: 'Jinsi ya kuripoti machapisho, maoni, reels, jumbe au akaunti na kukata rufaa',
    summaryEn: 'Flag harmful content for automatic protection and submit an appeal if your content or account was restricted.',
    summarySw: 'Ripoti maudhui hatari ili yafichwe kiotomatiki na uwasilishe rufaa ikiwa chapisho au akaunti yako imezuiliwa.',
    stepsEn: [
      'Tap the flag / report button on any post, comment, video reel, chat message, or user profile to report abuse, scams, or harassment.',
      'When content receives multiple independent reports, WaveLink automatically hides it pending human moderator review.',
      'External links in posts, comments, bios, and chats show a safety warning before opening so you can verify the domain first.',
      'If your post was hidden or your account was warned/suspended, use the "Appeal a Ban or Hidden Content" tool to request a review.'
    ],
    stepsSw: [
      'Gusa kitufe cha bendera / ripoti kwenye chapisho, maoni, video ya reel, ujumbe wa chat au wasifu kuripoti udhalilishaji au utapeli.',
      'Maudhui yakiripotiwa na watu wengi tofauti, WaveLink huyaficha kiotomatiki kusubiri ukaguzi wa msimamizi.',
      'Viungo vya nje huonyesha onyo la usalama kabla ya kufunguka ili uweze kuhakiki tovuti kwanza.',
      'Ikiwa maudhui yako yamefichwa au akaunti yako imesimamishwa, tumia chombo cha "Kata Rufaa" kuomba ukaguzi.'
    ],
    keywords: ['safety', 'report', 'block', 'appeal', 'ban', 'hidden', 'scam', 'usalama', 'ripoti', 'rufaa'],
    selfServiceAction: 'appeal'
  },
  {
    id: 'privacy',
    topic: 'privacy',
    categoryEn: 'Privacy, Sessions & Your Data',
    categorySw: 'Faragha, Vifaa na Data Yako',
    titleEn: 'Managing Active Sessions, Login Alerts, Privacy Controls, and Downloading Your Data',
    titleSw: 'Kusimamia Vifaa VilivyoWazi, Arifa za Kuingia, Faragha na Kupakua Data Yako',
    summaryEn: 'Review signed-in devices, log out everywhere, customize privacy, download a copy of your data, or delete your account.',
    summarySw: 'Kagua vifaa vilivyo katika akaunti yako, ondoka kwenye vifaa vyote, rekebisha faragha, au pakua data yako.',
    stepsEn: [
      'Open Settings → Security Center to view your Security Health Score and all Active Sessions with device names and last-used times.',
      'When a new device signs in, WaveLink sends a login alert. Tap "This wasn\'t me" to immediately log out all sessions and force a password reset.',
      'Choose whether to show your online status and who can message, call, or follow you.',
      'Use "Download My Data" to export your profile, posts, Sparks, and tickets as a JSON file, or "Delete My Account" to permanently erase your account.'
    ],
    stepsSw: [
      'Fungua Mipangilio → Kituo cha Usalama kuona Alama ya Usalama na Vifaa Vyote Vilivyowazi.',
      'Kifaa kipya kikiingia, unatumwa arifa. Gusa "Huyu si mimi" kuondoka kwenye vifaa vyote mara moja na kulazimisha kubadili nenosiri.',
      'Chagua kama ungependa kuonyesha hali ya kuwa mtandaoni na nani anaweza kukutumia ujumbe, kukupigia simu au kukufuata.',
      'Tumia "Pakua Data Yangu" kupata nakala ya taarifa zako, au "Futa Akaunti Yangu" kufuta akaunti kabisa.'
    ],
    keywords: ['privacy', 'sessions', 'devices', 'logout', 'download data', 'delete account', 'faragha', 'vifaa', 'pakua data']
  }
];

export function searchHelpCenterArticles(queryText: string): HelpArticle[] {
  const clean = (queryText || '').trim().toLowerCase();
  if (!clean) return HELP_CENTER_ARTICLES;
  const tokens = clean.split(/\s+/).filter(Boolean);

  return HELP_CENTER_ARTICLES.filter((article) => {
    const haystack = [
      article.id,
      article.categoryEn,
      article.categorySw,
      article.titleEn,
      article.titleSw,
      article.summaryEn,
      article.summarySw,
      ...article.stepsEn,
      ...article.stepsSw,
      ...article.keywords
    ]
      .join(' ')
      .toLowerCase();

    return tokens.every((tok) => haystack.includes(tok));
  });
}
