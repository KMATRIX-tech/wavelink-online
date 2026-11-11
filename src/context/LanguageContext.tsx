import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppLanguage } from '../types';

export const LANGUAGE_STORAGE_KEY = 'wavelink_language_v1';

/**
 * Detects the phone/browser's language on first visit, or returns the remembered choice.
 */
export function detectInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'sw' || saved === 'en') {
      return saved;
    }
    const navLang = (
      navigator.language ||
      (Array.isArray(navigator.languages) ? navigator.languages[0] : '') ||
      ''
    )
      .toLowerCase()
      .trim();
    if (navLang.startsWith('sw')) {
      return 'sw';
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export const TRANSLATIONS: Record<string, { en: string; sw: string }> = {
  // Navigation & Tabs
  'nav.feed': { en: 'Home Feed', sw: 'Mwanzo' },
  'nav.home': { en: 'Home', sw: 'Mwanzo' },
  'nav.trending': { en: 'Trending & Challenges', sw: 'zinazovuma & Mashindano' },
  'nav.trending_short': { en: 'Trending', sw: 'Zinazovuma' },
  'nav.videos': { en: 'Video Reels', sw: 'Video Fupi' },
  'nav.reels': { en: 'Reels', sw: 'Reels' },
  'nav.studio': { en: 'Media Studio', sw: 'Unda' },
  'nav.create': { en: 'Create', sw: 'Unda' },
  'nav.announcements': { en: 'Notice Board & Events', sw: 'Matangazo & Matukio' },
  'nav.chat': { en: 'Messages', sw: 'Ujumbe' },
  'nav.chat_short': { en: 'Chat', sw: 'Soga' },
  'nav.monetization': { en: 'Monetization Hub', sw: 'Mapato & Zawadi' },
  'nav.directory': { en: 'Members', sw: 'Wanachama' },
  'nav.analytics': { en: 'Creator Stats', sw: 'Takwimu Zangu' },
  'nav.admin': { en: 'Admin Desk', sw: 'Jopo la Msimamizi' },
  'nav.moderator': { en: 'Moderator Desk', sw: 'Jopo la Msimamizi' },
  'nav.settings': { en: 'Profile & Settings', sw: 'Wasifu & Mipangilio' },
  'nav.profile': { en: 'Profile', sw: 'Wasifu' },
  'nav.platform_navigation': { en: 'Platform Navigation', sw: 'Menyu Kuu' },

  // Header & Common Actions
  'header.search_placeholder': { en: 'Search people, posts, or #tags...', sw: 'Tafuta watu, machapisho au #mada...' },
  'header.live_talk': { en: 'Live Talk', sw: 'Ongea Moja kwa Moja' },
  'header.welink_ai': { en: 'WELINK AI', sw: 'Msaidizi wa WELINK' },
  'header.invite_friends': { en: 'Invite Friends', sw: 'Alika Marafiki' },
  'header.online': { en: 'Online', sw: 'Mtandaoni' },
  'header.offline': { en: 'Offline', sw: 'Bila Mtandao' },
  'header.back_online': { en: 'Back online', sw: 'Mtandao umerudi' },
  'header.offline_banner': {
    en: "You're offline — check your network connection.",
    sw: 'Huna mtandao kwa sasa — tafadhali angalia muunganisho wako.'
  },
  'header.cancel': { en: 'Cancel', sw: 'Ghairi' },
  'header.save': { en: 'Save', sw: 'Hifadhi' },
  'header.done': { en: 'Done', sw: 'Tayari' },
  'header.skip': { en: 'Skip', sw: 'Ruka' },
  'header.clear': { en: 'Clear', sw: 'Futa' },
  'header.sign_out': { en: 'Log Out', sw: 'Ondoka' },
  'header.logging_out': { en: 'Logging out...', sw: 'Inaondoka...' },

  // Greetings & Welcome Flow (Habari & Karibu friendly East African tone)
  'greeting.morning': { en: 'Habari! Good morning', sw: 'Habari za asubuhi' },
  'greeting.afternoon': { en: 'Habari! Good afternoon', sw: 'Habari za mchana' },
  'greeting.evening': { en: 'Habari! Good evening', sw: 'Habari za jioni' },
  'greeting.subtitle': {
    en: 'Karibu back to your East African & Pan-African creator community.',
    sw: 'Karibu tena kwenye jumuiya yako ya wabunifu wa Afrika Mashariki na Afrika.'
  },
  'welcome.badge': { en: 'Karibu WaveLink • Built for African Creators', sw: 'Karibu WaveLink • Kwa Wabunifu wa Afrika' },
  'welcome.title': { en: 'Habari & Karibu Home 🌿', sw: 'Habari na Karibu Nyumbani 🌿' },
  'welcome.subtitle': {
    en: 'Say Habari to fellow creators across East Africa or share your first wave whenever you feel ready.',
    sw: 'Salimia wabunifu wenzako Afrika Mashariki au weka chapisho lako la kwanza ukiwa tayari.'
  },
  'welcome.write_first': {
    en: 'Write your first Habari post →',
    sw: 'Andika salamu yako ya kwanza (Habari) →'
  },
  'welcome.pick_interests': {
    en: 'Pick Your Interests',
    sw: 'Chagua Mambo Unayopenda'
  },
  'welcome.follow': { en: 'Follow', sw: 'Fuata' },
  'welcome.following': { en: 'Following', sw: 'Unafuata' },

  // Phase 1: Data Saver
  'datasaver.title': { en: 'Data Saver', sw: 'Hifadhi Bando (Data Saver)' },
  'datasaver.active': { en: 'Data Saver On', sw: 'Inaokoa Bando' },
  'datasaver.off': { en: 'Data Saver Off', sw: 'Imezimwa' },
  'datasaver.turn_on': { en: 'Turn On Data Saver', sw: 'Washa Hifadhi Bando' },
  'datasaver.turn_off': { en: 'Turn Off Data Saver', sw: 'Zima Hifadhi Bando' },
  'datasaver.desc': {
    en: 'On by default for mobile data. Plays videos at lower quality, never autoplays on mobile data, and loads small photo previews until tapped.',
    sw: 'Imewashwa moja kwa moja kwenye data ya simu. Inacheza video kwa ubora mwepesi na inapakia picha ndogo hadi utakapogusa.'
  },
  'datasaver.welcome_hint': {
    en: 'Using mobile bundle? Data Saver helps you use up to 70% less data.',
    sw: 'Unatumia bando la simu? Hifadhi Bando inakusaidia kutumia data kidogo zaidi.'
  },
  'datasaver.tap_hd_image': {
    en: 'Small Preview • Tap for Full Photo',
    sw: 'Picha Ndogo • Gusa kuona picha kamili'
  },
  'datasaver.full_image_loaded': {
    en: 'Full Photo Loaded • Tap to Zoom',
    sw: 'Picha Kamili Imefunguka • Gusa kukuza'
  },
  'datasaver.tap_to_play_video': {
    en: 'Tap to play video (Data Saver)',
    sw: 'Gusa kucheza video (Hifadhi Bando)'
  },
  'datasaver.low_quality_badge': {
    en: 'Data Saver • Low Data Video',
    sw: 'Hifadhi Bando • Video Nyepesi'
  },
  'datasaver.estimated_saved': {
    en: 'Estimated data saved',
    sw: 'Makadirio ya data iliyookolewa'
  },

  // Phase 2: Language Switch & Pan-African Languages
  'lang.title': { en: 'Language / Lugha ya Afrika', sw: 'Lugha / African Languages' },
  'lang.subtitle': {
    en: 'Switch between Kiswahili and English everywhere, or select your Pan-African language option.',
    sw: 'Badilisha kati ya Kiswahili na Kiingereza popote, au chagua lugha yako ya Kiafrika.'
  },
  'lang.english': { en: 'English', sw: 'Kiingereza (English)' },
  'lang.swahili': { en: 'Kiswahili', sw: 'Kiswahili' },
  'lang.switched_en': { en: 'Language set to English — Karibu!', sw: 'Lugha imebadilishwa kuwa Kiingereza' },
  'lang.switched_sw': { en: 'Lugha imewekwa kuwa Kiswahili — Karibu!', sw: 'Lugha imewekwa kuwa Kiswahili — Karibu!' },

  // Phase 3: Interest Picker (African & East African Categories)
  'interests.modal_badge': { en: 'Karibu • Personalize Your WaveLink', sw: 'Karibu • Binafsisha WaveLink Yako' },
  'interests.modal_title': {
    en: 'What African culture & topics do you love?',
    sw: 'Unapenda mada na burudani gani za Kiafrika?'
  },
  'interests.modal_subtitle': {
    en: 'Pick 3 or more interests (like Bongo Flava, Amapiano, Comedy & Skits, Football, Farming) to personalize your feed.',
    sw: 'Chagua mambo 3 au zaidi (kama Bongo Flava, Amapiano, Vichekesho, Soka, Kilimo) ili tujaze ukurasa wako.'
  },
  'interests.selected_count': { en: 'selected (pick at least 3)', sw: 'zimechaguliwa (chagua angalau 3)' },
  'interests.save_continue': { en: 'Save My Interests', sw: 'Hifadhi Chaguo Zangu' },
  'interests.skip_for_now': { en: 'Skip for now', sw: 'Ruka kwa sasa' },
  'interests.Comedy': { en: 'Comedy & Skits', sw: 'Vichekesho & Igizo Fupi' },
  'interests.Football': { en: 'Football', sw: 'Soka & Michezo' },
  'interests.Music': { en: 'Bongo Flava & Music', sw: 'Bongo Flava & Muziki' },
  'interests.Fashion': { en: 'Fashion & Kitenge', sw: 'Mitindo & Kitenge' },
  'interests.SchoolLife': { en: 'School & Campus Life', sw: 'Maisha ya Shule & Chuo' },
  'interests.Business': { en: 'Small Business', sw: 'Biashara Ndogo & Ujasiriamali' },
  'interests.Gaming': { en: 'Gaming', sw: 'Michezo ya Video (Gaming)' },
  'interests.Tech': { en: 'Tech & Innovation', sw: 'Teknolojia & Uvumbuzi' },
  'interests.Food': { en: 'Food & Local Dishes', sw: 'Chakula & Mapishi ya Kwetu' },
  'interests.Art': { en: 'Art & Photography', sw: 'Sanaa & Picha' },
  'interests.suggested_hashtags': { en: 'Suggested Hashtags for You', sw: 'Hashtag Zinazokufaa' },
  'interests.suggested_creators': { en: 'Creators Matching Your Interests', sw: 'Wabunifu Wanaolingana Nawe' },

  // Phase 4: Trends, Challenges, Spotlight & Events
  'trends.tab_title': { en: 'Trending, Spotlight & Challenges', sw: 'Zinazovuma, Mbunifu Bora & Mashindano' },
  'trends.growing_hashtags': { en: 'Hashtags Growing Fastest Today', sw: 'Hashtag Zinazokua Haraka Leo' },
  'trends.growing_posts': { en: 'Posts Growing Fastest Today', sw: 'Machapisho Yanayokua Haraka Leo' },
  'trends.weekly_challenge': { en: 'Weekly Creator Challenge', sw: 'Shindano la Wabunifu la Wiki' },
  'trends.join_challenge': { en: 'Join Challenge', sw: 'Jiunge na Shindano' },
  'trends.deadline': { en: 'Ends', sw: 'Mwisho' },
  'trends.leaderboard': { en: 'Weekly Leaderboard', sw: 'Orodha ya Washindi wa Wiki' },
  'trends.leaderboard_desc': {
    en: 'Ranked by authentic reactions and shares this week (spam-protected). Top creator wins the Weekly Winner badge!',
    sw: 'Imepangwa kwa likes na kusambazwa (shares) wiki hii bila udanganyifu. Mshindi anapata beji maalum wiki nzima!'
  },
  'trends.winner_badge': { en: 'Weekly Winner', sw: 'Mshindi wa Wiki' },
  'trends.share_post': { en: 'Share', sw: 'Sambaza' },
  'trends.shared_toast': { en: 'Post shared! Counted toward weekly trends.', sw: 'Chapisho limesambazwa!' },
  'trends.share_limit_toast': {
    en: 'Share link copied! (Daily leaderboard share limit reached for this post)',
    sw: 'Kiungo kimenakiliwa! (Kikomo cha pointi za kusambaza chapisho hili kimefikiwa leo)'
  },
  'spotlight.title': { en: 'Creator Spotlight of the Week', sw: 'Mbunifu Bora wa Wiki (Spotlight)' },
  'spotlight.chosen_by_admin': { en: 'Chosen by WaveLink Admin', sw: 'Amechaguliwa na Msimamizi wa WaveLink' },
  'events.community_title': { en: 'Community Events (Local Time)', sw: 'Matukio ya Jumuiya (Saa za Kwetu)' },

  // Phase 5: Private Creator Stats
  'stats.title': { en: 'My Creator Stats', sw: 'Takwimu Zangu za Ubunifu' },
  'stats.private_badge': {
    en: 'Private • Only you can see your stats',
    sw: 'Siri • Wewe pekee ndiye unayeona takwimu hizi'
  },
  'stats.last_7_days': { en: 'Last 7 Days', sw: 'Siku 7 Zilizopita' },
  'stats.last_30_days': { en: 'Last 30 Days', sw: 'Siku 30 Zilizopita' },
  'stats.views': { en: 'Views', sw: 'Waliotazama' },
  'stats.likes': { en: 'Likes & Reactions', sw: 'Walioipenda (Likes)' },
  'stats.comments': { en: 'Comments', sw: 'Maoni' },
  'stats.shares': { en: 'Shares', sw: 'Waliosambaza' },
  'stats.followers_gained': { en: 'Followers Gained', sw: 'Wafuasi Wapya' },
  'stats.best_posts': { en: 'Your Best Performing Posts', sw: 'Machapisho Yako Bora Zaidi' },
  'stats.chart_title': { en: 'Views & Reactions Over Time', sw: 'Mwenendo wa Waliotazama na Likes' },

  // Phase 6: Install & Notifications
  'notif.settings_title': { en: 'Notification Settings', sw: 'Mipangilio ya Arifa' },
  'notif.enable_btn': { en: 'Enable Push Notifications', sw: 'Washa Arifa Kwenye Simu' },
  'notif.disable_btn': { en: 'Turn Off on Device', sw: 'Zima Kwenye Kifaa Hiki' },
  'notif.test_btn': { en: 'Send Test Alert', sw: 'Tuma Arifa ya Jaribio' },
  'notif.kind_explanation': {
    en: 'Tap the button to allow friendly alerts for new messages, followers, replies, challenge reminders, and incoming calls.',
    sw: 'Gusa kitufe kuruhusu arifa za ujumbe mpya, wafuasi, majibu, vikumbusho vya mashindano na simu zinazoingia.'
  },
  'notif.cat_messages': { en: 'Messages', sw: 'Ujumbe Mpya' },
  'notif.cat_followers': { en: 'New Followers', sw: 'Wafuasi Wapya' },
  'notif.cat_reactions': { en: 'Reactions', sw: 'Likes na Hisia' },
  'notif.cat_replies': { en: 'Replies & Comments', sw: 'Majibu na Maoni' },
  'notif.cat_challenges': { en: 'Challenge Reminders', sw: 'Vikumbusho vya Mashindano' },
  'notif.cat_calls': { en: 'Incoming Calls (Loud with Answer / Decline)', sw: 'Simu Zinazoingia (Sauti na Kubali / Kataa)' },
  'notif.quiet_hours': { en: 'Quiet Hours', sw: 'Saa za Utulivu (Usisumbuliwe)' },

  // Feed, Local Tab & Footer
  'feed.whats_happening': {
    en: 'Habari! What are you creating or sharing today?',
    sw: 'Habari! Una kitu gani kipya cha kushiriki leo?'
  },
  'feed.post_btn': { en: 'Post Wave', sw: 'Chapisha' },
  'feed.posting': { en: 'Posting...', sw: 'Inachapisha...' },
  'feed.all_waves': { en: 'All Waves', sw: 'Zote' },
  'feed.local_tab': { en: 'Local', sw: 'Za Nyumbani' },
  'feed.following_tab': { en: 'Following', sw: 'Unaowafuata' },
  'feed.saved_tab': { en: 'Saved', sw: 'Zilizohifadhiwa' },
  'feed.daily_checkin': { en: 'Daily Check-In', sw: 'Zawadi ya Kila Siku' },
  'feed.checked_in': { en: 'Checked In ✓', sw: 'Umeshachukua ✓' },
  'feed.check_in_btn': { en: 'Check In (+15 pts)', sw: 'Chukua (+15 pts)' },
  'footer.tagline': { en: 'Empowering African Creators', sw: 'Empowering African Creators • Kuwawezesha Wabunifu wa Afrika' }
};

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => detectInitialLanguage());

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.setAttribute('data-lang', language);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wavelink:language-changed', { detail: { language } }));
    }
  }, [language]);

  const setLanguage = useCallback((next: AppLanguage) => {
    if (next === 'en' || next === 'sw') {
      setLanguageState(next);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'en' ? 'sw' : 'en'));
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const entry = TRANSLATIONS[key];
      if (!entry) return fallback || key;
      return entry[language] || entry.en || fallback || key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: detectInitialLanguage(),
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string) => {
        const lang = detectInitialLanguage();
        const entry = TRANSLATIONS[key];
        return entry ? entry[lang] || entry.en : fallback || key;
      }
    };
  }
  return ctx;
}
