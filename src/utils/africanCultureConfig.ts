import { useState, useEffect, useCallback } from 'react';
import {
  AfricanCountryCode,
  EastAfricanCurrency,
  PanAfricanLanguageCode,
  KangaPatternFrame,
  AppearanceTheme,
  Post,
  UserProfile,
  CreatorSpotlight
} from '../types';

export const COUNTRY_STORAGE_KEY = 'wavelink_african_country_v1';
export const CURRENCY_STORAGE_KEY = 'wavelink_ea_currency_v1';
export const PAN_AFRICAN_LANG_STORAGE_KEY = 'wavelink_pan_african_lang_v1';
export const KANGA_FRAME_STORAGE_KEY = 'wavelink_kanga_frame_v1';
export const KANGA_BG_STORAGE_KEY = 'wavelink_kanga_bg_v1';

export interface AfricanCountryOption {
  code: AfricanCountryCode;
  flag: string;
  nameEn: string;
  nameSw: string;
  regionEn: string;
  regionSw: string;
  regionLabel?: string;
  defaultCurrency: EastAfricanCurrency;
  phonePrefix: string;
  localGreeting: string;
  greetingEn?: string;
  greetingSw?: string;
  keywords: string[];
}

export const AFRICAN_COUNTRIES: AfricanCountryOption[] = [
  {
    code: 'TZ',
    flag: '🇹🇿',
    nameEn: 'Tanzania',
    nameSw: 'Tanzania',
    regionEn: 'East Africa',
    regionSw: 'Afrika Mashariki',
    defaultCurrency: 'TZS',
    phonePrefix: '+255',
    localGreeting: 'Habari & Karibu! 🇹🇿',
    keywords: [
      'tanzania',
      'dar es salaam',
      'dar',
      'arusha',
      'zanzibar',
      'dodoma',
      'mwanza',
      'mbeya',
      'morogoro',
      'tanga',
      'kilimanjaro',
      'bongo',
      '#tanzania',
      '#bongoflava',
      'tz'
    ]
  },
  {
    code: 'KE',
    flag: '🇰🇪',
    nameEn: 'Kenya',
    nameSw: 'Kenya',
    regionEn: 'East Africa',
    regionSw: 'Afrika Mashariki',
    defaultCurrency: 'KES',
    phonePrefix: '+254',
    localGreeting: 'Habari & Karibu! 🇰🇪',
    keywords: [
      'kenya',
      'nairobi',
      'mombasa',
      'kisumu',
      'nakuru',
      'eldoret',
      'gengetone',
      '#kenya',
      '#nairobi',
      '#254',
      'ke'
    ]
  },
  {
    code: 'UG',
    flag: '🇺🇬',
    nameEn: 'Uganda',
    nameSw: 'Uganda',
    regionEn: 'East Africa',
    regionSw: 'Afrika Mashariki',
    defaultCurrency: 'UGX',
    phonePrefix: '+256',
    localGreeting: 'Oli Otya & Karibu! 🇺🇬',
    keywords: [
      'uganda',
      'kampala',
      'entebbe',
      'jinja',
      'gulu',
      'mbarara',
      '#uganda',
      '#kampala',
      '#256',
      'ug'
    ]
  },
  {
    code: 'RW',
    flag: '🇷🇼',
    nameEn: 'Rwanda',
    nameSw: 'Rwanda',
    regionEn: 'East Africa',
    regionSw: 'Afrika Mashariki',
    defaultCurrency: 'TZS',
    phonePrefix: '+250',
    localGreeting: 'Muraho & Karibu! 🇷🇼',
    keywords: ['rwanda', 'kigali', 'rubavu', 'musanze', '#rwanda', '#kigali', 'rw']
  },
  {
    code: 'BI',
    flag: '🇧🇮',
    nameEn: 'Burundi',
    nameSw: 'Burundi',
    regionEn: 'East Africa',
    regionSw: 'Afrika Mashariki',
    defaultCurrency: 'TZS',
    phonePrefix: '+257',
    localGreeting: 'Amahoro & Karibu! 🇧🇮',
    keywords: ['burundi', 'bujumbura', 'gitega', '#burundi', '#bujumbura', 'bi']
  },
  {
    code: 'ET',
    flag: '🇪🇹',
    nameEn: 'Ethiopia',
    nameSw: 'Ethiopia (Uhabeshi)',
    regionEn: 'East & Horn of Africa',
    regionSw: 'Pembe ya Afrika',
    defaultCurrency: 'KES',
    phonePrefix: '+251',
    localGreeting: 'Selam & Karibu! 🇪🇹',
    keywords: ['ethiopia', 'addis ababa', 'addis', 'hawassa', '#ethiopia', '#addisababa', 'et']
  },
  {
    code: 'CD',
    flag: '🇨🇩',
    nameEn: 'DRC (DR Congo)',
    nameSw: 'DRC (Kongo)',
    regionEn: 'Central & East Africa',
    regionSw: 'Afrika ya Kati na Mashariki',
    defaultCurrency: 'TZS',
    phonePrefix: '+243',
    localGreeting: 'Mbote & Karibu! 🇨🇩',
    keywords: ['drc', 'congo', 'kinshasa', 'goma', 'lubumbashi', 'bukavu', '#drc', '#congo', 'cd']
  },
  {
    code: 'NG',
    flag: '🇳🇬',
    nameEn: 'Nigeria',
    nameSw: 'Nigeria',
    regionEn: 'West Africa',
    regionSw: 'Afrika Magharibi',
    defaultCurrency: 'KES',
    phonePrefix: '+234',
    localGreeting: 'How far & Welcome! 🇳🇬',
    keywords: ['nigeria', 'lagos', 'abuja', 'port harcourt', 'naija', 'afrobeats', '#nigeria', '#lagos', 'ng']
  },
  {
    code: 'GH',
    flag: '🇬🇭',
    nameEn: 'Ghana',
    nameSw: 'Ghana',
    regionEn: 'West Africa',
    regionSw: 'Afrika Magharibi',
    defaultCurrency: 'KES',
    phonePrefix: '+233',
    localGreeting: 'Akwaaba & Karibu! 🇬🇭',
    keywords: ['ghana', 'accra', 'kumasi', '#ghana', '#accra', 'gh']
  },
  {
    code: 'ZA',
    flag: '🇿🇦',
    nameEn: 'South Africa',
    nameSw: 'Afrika Kusini',
    regionEn: 'Southern Africa',
    regionSw: 'Afrika Kusini',
    defaultCurrency: 'KES',
    phonePrefix: '+27',
    localGreeting: 'Sawubona & Karibu! 🇿🇦',
    keywords: [
      'south africa',
      'johannesburg',
      'joburg',
      'cape town',
      'durban',
      'pretoria',
      'amapiano',
      'mzansi',
      '#southafrica',
      '#amapiano',
      'za'
    ]
  }
];

export interface PanAfricanLanguageOption {
  code: PanAfricanLanguageCode;
  baseAppLanguage: 'en' | 'sw';
  label: string;
  nativeName: string;
  flag: string;
  regionHint: string;
  greeting: string;
  welcomeSub: string;
  statusBadge: 'Full' | 'Pan-African Ready';
  fullUiSupport?: boolean;
}

export const PAN_AFRICAN_LANGUAGES: PanAfricanLanguageOption[] = [
  {
    code: 'sw',
    baseAppLanguage: 'sw',
    label: 'Kiswahili',
    nativeName: 'Kiswahili',
    flag: '🇹🇿🇰🇪',
    regionHint: 'East & Central Africa',
    greeting: 'Habari! Karibu WaveLink',
    welcomeSub: 'Nyumbani kwa wabunifu wa Afrika Mashariki na Afrika nzima.',
    statusBadge: 'Full',
    fullUiSupport: true
  },
  {
    code: 'en',
    baseAppLanguage: 'en',
    label: 'English',
    nativeName: 'English',
    flag: '🌍',
    regionHint: 'Pan-African & Global',
    greeting: 'Habari & Welcome to WaveLink',
    welcomeSub: 'Built for East African and Pan-African creators.',
    statusBadge: 'Full',
    fullUiSupport: true
  },
  {
    code: 'fr',
    baseAppLanguage: 'en',
    label: 'French',
    nativeName: 'Français',
    flag: '🇨🇩🇧🇮',
    regionHint: 'DRC, Burundi, Rwanda & West Africa',
    greeting: 'Bonjour & Karibu sur WaveLink',
    welcomeSub: 'Espace créatif pour l’Afrique de l’Est et toute l’Afrique.',
    statusBadge: 'Pan-African Ready',
    fullUiSupport: false
  },
  {
    code: 'rw',
    baseAppLanguage: 'sw',
    label: 'Kinyarwanda',
    nativeName: 'Ikinyarwanda',
    flag: '🇷🇼',
    regionHint: 'Rwanda & Great Lakes',
    greeting: 'Muraho & Murakaza neza kuri WaveLink',
    welcomeSub: 'Urubuga rw’abahanga n’abahanzi bo muri Afurika y’Iburasirazuba.',
    statusBadge: 'Pan-African Ready',
    fullUiSupport: false
  },
  {
    code: 'lg',
    baseAppLanguage: 'en',
    label: 'Luganda',
    nativeName: 'Oluganda',
    flag: '🇺🇬',
    regionHint: 'Uganda (Buganda & Kampala)',
    greeting: 'Oli Otya & Tukusanyukidde ku WaveLink',
    welcomeSub: 'Ekifo ky’abayiiya mu Buvanjuba bwa Afirika.',
    statusBadge: 'Pan-African Ready',
    fullUiSupport: false
  },
  {
    code: 'am',
    baseAppLanguage: 'en',
    label: 'Amharic',
    nativeName: 'አማርኛ (Amharic)',
    flag: '🇪🇹',
    regionHint: 'Ethiopia',
    greeting: 'ሰላም (Selam) — እንኳን ደህና መጡ ወደ WaveLink',
    welcomeSub: 'ለምስራቅ አፍሪካ እና ለመላው አፍሪካ ፈጣሪዎች የተዘጋጀ።',
    statusBadge: 'Pan-African Ready',
    fullUiSupport: false
  }
];

export interface LightThemeOption {
  id: AppearanceTheme;
  nameEn: string;
  nameSw: string;
  descEn: string;
  descSw: string;
  previewBg: string;
  previewAccent: string;
  previewSecondary: string;
  badge?: string;
}

export const AFRICAN_LIGHT_THEMES: LightThemeOption[] = [
  {
    id: 'savanna',
    nameEn: 'Savanna Gold',
    nameSw: 'Savanna ya Dhahabu',
    descEn: 'Warm golden acacia & soft Serengeti sand with crisp dark text',
    descSw: 'Rangi tulivu ya dhahabu na mchanga wa Serengeti yenye maandishi yanayosomeka vizuri',
    previewBg: '#FCF9F0',
    previewAccent: '#B45309',
    previewSecondary: '#0D9488',
    badge: 'East Africa'
  },
  {
    id: 'zanzibar',
    nameEn: 'Zanzibar Sea',
    nameSw: 'Bahari ya Zanzibar',
    descEn: 'Coastal turquoise & Indian Ocean breeze with clean readable contrast',
    descSw: 'Rangi ya bahari ya Zanzibar na upepo wa pwani yenye mwonekano safi',
    previewBg: '#F2FAFC',
    previewAccent: '#0284C7',
    previewSecondary: '#0D9488',
    badge: 'Coastal'
  },
  {
    id: 'kilimanjaro',
    nameEn: 'Kilimanjaro Sunrise',
    nameSw: 'Mapambazuko ya Kilimanjaro',
    descEn: 'Crisp alpine morning light & warm terracotta highland tones',
    descSw: 'Mwanga wa asubuhi ya Mlima Kilimanjaro na rangi ya udongo wa nyanda za juu',
    previewBg: '#FDF8F4',
    previewAccent: '#C2410C',
    previewSecondary: '#2563EB',
    badge: 'Highlands'
  },
  {
    id: 'classic',
    nameEn: 'Classic Cream',
    nameSw: 'Kawaida (Cream)',
    descEn: 'Warm cream canvas with deep ocean blue accents',
    descSw: 'Mandhari nyeupe-joto yenye rangi ya samawati',
    previewBg: '#FAF7F2',
    previewAccent: '#2563EB',
    previewSecondary: '#0D9488'
  },
  {
    id: 'sunset',
    nameEn: 'Sunset Peach',
    nameSw: 'Machweo',
    descEn: 'Soft peach and warm evening coral',
    descSw: 'Rangi laini ya machweo ya jioni',
    previewBg: '#FFF7F4',
    previewAccent: '#EA580C',
    previewSecondary: '#E11D48'
  },
  {
    id: 'river',
    nameEn: 'River Teal',
    nameSw: 'Mto wa Kijani',
    descEn: 'Calm aqua and lush river green',
    descSw: 'Rangi tulivu ya maji na kijani kibichi',
    previewBg: '#F2FBF9',
    previewAccent: '#0D9488',
    previewSecondary: '#0284C7'
  },
  {
    id: 'sunrise',
    nameEn: 'Morning Gold',
    nameSw: 'Asubuhi Njema',
    descEn: 'Soft sunlight cream and amber',
    descSw: 'Mwanga laini wa jua la asubuhi',
    previewBg: '#FEFBF3',
    previewAccent: '#D97706',
    previewSecondary: '#0D9488'
  }
];

export interface KangaFrameOption {
  id: KangaPatternFrame;
  nameEn: string;
  nameSw: string;
  descEn: string;
  descSw: string;
  cssClass: string;
}

export const KANGA_PATTERN_FRAMES: KangaFrameOption[] = [
  {
    id: 'none',
    nameEn: 'Clean Ring (No Pattern)',
    nameSw: 'Pete Safi (Bila Nakshi)',
    descEn: 'Simple modern border around your profile picture',
    descSw: 'Mzingo rahisi wa kisasa kwenye picha yako ya wasifu',
    cssClass: 'ring-2 ring-amber-500/30'
  },
  {
    id: 'kanga-gold',
    nameEn: 'Kanga Gold Weave',
    nameSw: 'Nakshi ya Kanga ya Dhahabu',
    descEn: 'Warm Swahili coastal kanga-inspired geometric gold & terracotta border',
    descSw: 'Mzingo wenye nakshi za kanga ya pwani ya Afrika Mashariki',
    cssClass: 'kanga-avatar-frame--gold'
  },
  {
    id: 'kitenge-teal',
    nameEn: 'Kitenge Turquoise Diamond',
    nameSw: 'Nakshi ya Kitenge cha Bahari',
    descEn: 'Vibrant East African kitenge diamond weave in teal and royal blue',
    descSw: 'Mzingo wenye nakshi za kitenge cha rangi ya bahari na samawati',
    cssClass: 'kanga-avatar-frame--teal'
  },
  {
    id: 'savanna-weave',
    nameEn: 'Savanna Basket Weave',
    nameSw: 'Nakshi ya Ukili wa Savanna',
    descEn: 'Tasteful woven earth, emerald, and warm amber border',
    descSw: 'Mzingo wenye nakshi za ukili wa kijani na kahawia',
    cssClass: 'kanga-avatar-frame--savanna'
  }
];

export interface CommunityReportCategory {
  id: 'stolen_content' | 'bullying' | 'scams' | 'adult_content' | 'spam';
  labelEn: string;
  labelSw: string;
  descEn: string;
  descSw: string;
  moderationAckEn: string;
  moderationAckSw: string;
  moderationNoticeEn: string;
  moderationNoticeSw: string;
}

export const COMMUNITY_REPORT_CATEGORIES: CommunityReportCategory[] = [
  {
    id: 'stolen_content',
    labelEn: 'Stolen Content / Uncredited Creator Work',
    labelSw: 'Wizi wa Maudhui ya Mbunifu Mwingine',
    descEn: 'Reposted video, music, skit, or photo without the original African creator’s permission.',
    descSw: 'Video, wimbo, kichekesho au picha iliyochukuliwa bila ruhusa ya mbunifu halisi.',
    moderationAckEn:
      'Asante! Your report for Stolen Content has been sent to our moderation team to protect original creators.',
    moderationAckSw:
      'Asante! Ripoti yako kuhusu Wizi wa Maudhui imepokelewa na timu ya usimamizi ili kulinda wabunifu halisi.',
    moderationNoticeEn:
      'Asante! Your report for Stolen Content has been sent to our moderation team to protect original creators.',
    moderationNoticeSw:
      'Asante! Ripoti yako kuhusu Wizi wa Maudhui imepokelewa na timu ya usimamizi ili kulinda wabunifu halisi.'
  },
  {
    id: 'bullying',
    labelEn: 'Bullying, Harassment or Hate Speech',
    labelSw: 'Unyanyasaji, Matusi au Chuki',
    descEn: 'Insults, targeted harassment, tribalism, or threatening another community member.',
    descSw: 'Matusi, kudhalilisha, ukabila au kumtishia mwanachama mwingine wa jumuiya.',
    moderationAckEn:
      'Thank you for keeping WaveLink welcoming. Our moderators will review this Bullying report promptly.',
    moderationAckSw:
      'Asante kwa kulinda heshima ndani ya WaveLink. Wasimamizi wetu watakagua ripoti hii ya unyanyasaji haraka.',
    moderationNoticeEn:
      'Thank you for keeping WaveLink welcoming. Our moderators will review this Bullying report promptly.',
    moderationNoticeSw:
      'Asante kwa kulinda heshima ndani ya WaveLink. Wasimamizi wetu watakagua ripoti hii ya unyanyasaji haraka.'
  },
  {
    id: 'scams',
    labelEn: 'Scams, Fake Money Offers or Phishing',
    labelSw: 'Utapeli, Fedha Bandia au Ulaghai wa Simu',
    descEn: 'Fake mobile money giveaways, asking for PINs, or fraudulent business links.',
    descSw: 'Ahadi za pesa za uongo, kuomba PIN ya M-Pesa / Mixx by Yas / Airtel Money, au viungo vya kitapeli.',
    moderationAckEn:
      'Safety alert received! Our team is reviewing this Scam report. Remember: never share your mobile money PIN.',
    moderationAckSw:
      'Tahadhari imepokelewa! Timu yetu inakagua ripoti hii ya utapeli. Kumbuka: usitoe PIN yako ya simu kwa mtu yeyote.',
    moderationNoticeEn:
      'Safety alert received! Our team is reviewing this Scam report. Remember: never share your mobile money PIN.',
    moderationNoticeSw:
      'Tahadhari imepokelewa! Timu yetu inakagua ripoti hii ya utapeli. Kumbuka: usitoe PIN yako ya simu kwa mtu yeyote.'
  },
  {
    id: 'adult_content',
    labelEn: 'Adult or Inappropriate Content',
    labelSw: 'Maudhui ya Kikubwa au Yasiyofaa',
    descEn: 'Nudity, explicit material, or graphic content not suitable for our community.',
    descSw: 'Picha au video zisizo na maadili ambazo hazifai kwa jumuiya yetu.',
    moderationAckEn:
      'Thank you. This post has been flagged for Adult Content review by our community moderators.',
    moderationAckSw:
      'Asante. Chapisho hili limewekewa alama ili kukaguliwa na wasimamizi wa maadili ya jumuiya.',
    moderationNoticeEn:
      'Thank you. This post has been flagged for Adult Content review by our community moderators.',
    moderationNoticeSw:
      'Asante. Chapisho hili limewekewa alama ili kukaguliwa na wasimamizi wa maadili ya jumuiya.'
  },
  {
    id: 'spam',
    labelEn: 'Spam or Misleading Links',
    labelSw: 'Taka za Mtandaoni (Spam) au Habari za Kupotosha',
    descEn: 'Repetitive comments, fake followers, or misleading clickbait.',
    descSw: 'Maoni yanayojirudia mara nyingi au habari za uongo.',
    moderationAckEn: 'Thank you! Our moderators have received your Spam report.',
    moderationAckSw: 'Asante! Wasimamizi wetu wamepokea ripoti yako.',
    moderationNoticeEn: 'Thank you! Our moderators have received your Spam report.',
    moderationNoticeSw: 'Asante! Wasimamizi wetu wamepokea ripoti yako.'
  }
];

export const DEFAULT_CREATOR_SPOTLIGHT: CreatorSpotlight = {
  id: 'current',
  userId: 'spotlight_amina_tz',
  displayName: 'Amina Makena',
  username: '@amina_bongo_vibes',
  photoURL: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=300&auto=format&fit=crop&q=80',
  countryCode: 'TZ',
  category: 'Bongo Flava & Comedy Skits',
  categoryLabel: 'Bongo Flava & Comedy Skits',
  headlineEn: 'Creator Spotlight of the Week • Dar es Salaam & Nairobi',
  headlineSw: 'Mbunifu Bora wa Wiki • Dar es Salaam & Nairobi',
  bioEn:
    'Blending acoustic Bongo Flava melodies with everyday East African campus & market comedy skits.',
  bioSw:
    'Anaunganisha midundo ya Bongo Flava na vichekesho vya maisha ya kila siku ya chuo na mtaani Afrika Mashariki.',
  featuredHashtag: '#BongoFlava',
  updatedAt: new Date().toISOString()
};

/**
 * Detects initial country from localStorage or browser timezone
 */
export function detectInitialAfricanCountry(profileCountry?: AfricanCountryCode): AfricanCountryCode {
  if (profileCountry && AFRICAN_COUNTRIES.some((c) => c.code === profileCountry)) {
    return profileCountry;
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(COUNTRY_STORAGE_KEY) as AfricanCountryCode | null;
      if (saved && AFRICAN_COUNTRIES.some((c) => c.code === saved)) {
        return saved;
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.includes('Nairobi')) return 'KE';
      if (tz.includes('Kampala')) return 'UG';
      if (tz.includes('Kigali')) return 'RW';
      if (tz.includes('Bujumbura')) return 'BI';
      if (tz.includes('Addis_Ababa')) return 'ET';
      if (tz.includes('Kinshasa') || tz.includes('Lubumbashi')) return 'CD';
      if (tz.includes('Lagos')) return 'NG';
      if (tz.includes('Accra')) return 'GH';
      if (tz.includes('Johannesburg')) return 'ZA';
    } catch {
      // ignore
    }
  }
  return 'TZ';
}

export function getCountryMeta(code?: AfricanCountryCode | string | null): AfricanCountryOption & {
  greetingEn: string;
  greetingSw: string;
  regionLabel: string;
} {
  const found = AFRICAN_COUNTRIES.find((c) => c.code === code) || AFRICAN_COUNTRIES[0];
  return {
    ...found,
    greetingEn: found.greetingEn || found.localGreeting,
    greetingSw: found.greetingSw || found.localGreeting,
    regionLabel: found.regionLabel || found.regionEn
  };
}

export const getAfricanCountryMeta = getCountryMeta;

export function getKangaFrameClass(frame?: KangaPatternFrame | string | null): string {
  const found = KANGA_PATTERN_FRAMES.find((f) => f.id === frame);
  return found ? found.cssClass : '';
}

export const getKangaFrameCss = getKangaFrameClass;

/**
 * Automatically selects the user's local East African currency (TZS, KES, or UGX)
 */
export function detectInitialEastAfricanCurrency(
  countryCode?: AfricanCountryCode
): EastAfricanCurrency {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY) as EastAfricanCurrency | null;
      if (saved === 'TZS' || saved === 'KES' || saved === 'UGX') {
        return saved;
      }
    } catch {
      // ignore
    }
  }
  const activeCountry = countryCode || detectInitialAfricanCountry();
  if (activeCountry === 'KE') return 'KES';
  if (activeCountry === 'UG') return 'UGX';
  if (activeCountry === 'TZ') return 'TZS';
  const meta = getCountryMeta(activeCountry);
  return meta.defaultCurrency || 'TZS';
}

/**
 * Converts a base TZS amount into TZS, KES, and UGX with clean East African rounding
 */
export function convertFromTZS(amountTZS: number): {
  TZS: number;
  KES: number;
  UGX: number;
} {
  // Approximate realistic East African rates: 1 KES ≈ 20 TZS, 1 UGX ≈ 0.7 TZS (1 TZS ≈ 1.45 UGX)
  const kes = Math.max(10, Math.round(amountTZS / 20 / 5) * 5);
  const ugx = Math.max(500, Math.round((amountTZS * 1.45) / 100) * 100);
  return {
    TZS: Math.round(amountTZS),
    KES: kes,
    UGX: ugx
  };
}

/**
 * Formats a base TZS price in the user's active local currency (TZS, KES, or UGX)
 * and optionally includes the full East African trio for transparency.
 */
export function formatLocalPrice(
  amountTZS: number,
  preferredCurrency: EastAfricanCurrency = detectInitialEastAfricanCurrency(),
  includeAllThree: boolean = false
): string {
  const converted = convertFromTZS(amountTZS);
  const primary = `${converted[preferredCurrency].toLocaleString()} ${preferredCurrency}`;
  if (!includeAllThree) return primary;
  const others = (['TZS', 'KES', 'UGX'] as EastAfricanCurrency[])
    .filter((c) => c !== preferredCurrency)
    .map((c) => `${converted[c].toLocaleString()} ${c}`)
    .join(' • ');
  return `${primary} (${others})`;
}

/**
 * Determines whether a post belongs to or matches a given African country
 */
export function doesPostMatchCountry(
  post: Post,
  countryCode: AfricanCountryCode,
  authorProfile?: UserProfile | null
): boolean {
  if (post.countryCode && post.countryCode === countryCode) return true;
  if (authorProfile?.countryCode && authorProfile.countryCode === countryCode) return true;
  const meta = getCountryMeta(countryCode);
  const haystack = `${post.locationTag || ''} ${post.content || ''} ${(post.hashtags || []).join(' ')}`.toLowerCase();
  return meta.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

/**
 * Formats an event's date & time in the viewer's local timezone
 */
export function formatEventInViewerLocalTime(
  eventDate?: string,
  eventTime?: string,
  eventDateTimeIso?: string,
  lang: 'en' | 'sw' = 'en'
): string {
  try {
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Dar_es_Salaam';
    const shortTz = tzName.includes('Dar_es_Salaam') || tzName.includes('Nairobi') || tzName.includes('Kampala')
      ? 'EAT (Local Time)'
      : `${tzName.split('/').pop()?.replace(/_/g, ' ') || 'Local'} Time`;

    if (eventDateTimeIso) {
      const dt = new Date(eventDateTimeIso);
      if (!Number.isNaN(dt.getTime())) {
        const formatted = dt.toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${formatted} (${shortTz})`;
      }
    }

    if (eventDate && eventTime) {
      const candidate = new Date(`${eventDate}T${eventTime}`);
      if (!Number.isNaN(candidate.getTime())) {
        const formatted = candidate.toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${formatted} (${shortTz})`;
      }
      return `${eventDate} • ${eventTime} (${shortTz})`;
    }

    if (eventDate) {
      return `${eventDate} (${shortTz})`;
    }
  } catch {
    // fallback
  }
  return eventDate || '';
}

/**
 * Hook for reading & updating African country, local currency (TZS/KES/UGX), Pan-African language, and Kanga/Kitenge styling
 */
export function useAfricanRegion(
  userOrCountry?: UserProfile | AfricanCountryCode | null,
  preferredCurrencyArg?: EastAfricanCurrency,
  panAfricanLanguageArg?: PanAfricanLanguageCode
) {
  const isProfileObj =
    typeof userOrCountry === 'object' && userOrCountry !== null && !Array.isArray(userOrCountry);
  const initialCountryArg: AfricanCountryCode | undefined = isProfileObj
    ? (userOrCountry as UserProfile).countryCode
    : (userOrCountry as AfricanCountryCode | undefined) || undefined;
  const initialCurrencyArg: EastAfricanCurrency | undefined = isProfileObj
    ? (userOrCountry as UserProfile).preferredCurrency
    : preferredCurrencyArg;
  const initialLangArg: PanAfricanLanguageCode | undefined = isProfileObj
    ? (userOrCountry as UserProfile).panAfricanLanguage
    : panAfricanLanguageArg;
  const initialFrameArg: KangaPatternFrame | undefined = isProfileObj
    ? (userOrCountry as UserProfile).patternFrame
    : undefined;
  const initialBgArg: boolean | undefined = isProfileObj
    ? (userOrCountry as UserProfile).kangaBackgroundEnabled
    : undefined;

  const [countryCode, setCountryState] = useState<AfricanCountryCode>(() =>
    detectInitialAfricanCountry(initialCountryArg)
  );
  const [currency, setCurrencyState] = useState<EastAfricanCurrency>(() =>
    initialCurrencyArg || detectInitialEastAfricanCurrency(initialCountryArg)
  );
  const [panAfricanLang, setPanAfricanLangState] = useState<PanAfricanLanguageCode>(() => {
    if (initialLangArg) return initialLangArg;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PAN_AFRICAN_LANG_STORAGE_KEY) as PanAfricanLanguageCode | null;
      if (saved && PAN_AFRICAN_LANGUAGES.some((l) => l.code === saved)) return saved;
    }
    return 'sw';
  });
  const [patternFrame, setPatternFrameState] = useState<KangaPatternFrame>(() => {
    if (initialFrameArg) return initialFrameArg;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(KANGA_FRAME_STORAGE_KEY) as KangaPatternFrame | null;
      if (saved) return saved;
    }
    return 'none';
  });
  const [kangaBgEnabled, setKangaBgState] = useState<boolean>(() => {
    if (typeof initialBgArg === 'boolean') {
      return initialBgArg;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(KANGA_BG_STORAGE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    }
    return true;
  });

  useEffect(() => {
    const onRegionUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.countryCode) setCountryState(detail.countryCode);
      if (detail.currency) setCurrencyState(detail.currency);
      if (detail.panAfricanLang) setPanAfricanLangState(detail.panAfricanLang);
      if (detail.patternFrame) setPatternFrameState(detail.patternFrame);
      if (typeof detail.kangaBgEnabled === 'boolean') setKangaBgState(detail.kangaBgEnabled);
    };
    window.addEventListener('wavelink:african-region-changed', onRegionUpdated);
    return () => window.removeEventListener('wavelink:african-region-changed', onRegionUpdated);
  }, []);

  const setCountryCode = useCallback((nextCode: AfricanCountryCode) => {
    setCountryState(nextCode);
    const meta = getCountryMeta(nextCode);
    const autoCurr = meta.defaultCurrency;
    setCurrencyState(autoCurr);
    try {
      localStorage.setItem(COUNTRY_STORAGE_KEY, nextCode);
      localStorage.setItem(CURRENCY_STORAGE_KEY, autoCurr);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent('wavelink:african-region-changed', {
        detail: { countryCode: nextCode, currency: autoCurr }
      })
    );
  }, []);

  const setCurrency = useCallback((nextCurrency: EastAfricanCurrency) => {
    setCurrencyState(nextCurrency);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent('wavelink:african-region-changed', {
        detail: { currency: nextCurrency }
      })
    );
  }, []);

  const setPanAfricanLanguage = useCallback((nextLang: PanAfricanLanguageCode) => {
    setPanAfricanLangState(nextLang);
    try {
      localStorage.setItem(PAN_AFRICAN_LANG_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent('wavelink:african-region-changed', {
        detail: { panAfricanLang: nextLang }
      })
    );
  }, []);

  const setPatternFrame = useCallback((nextFrame: KangaPatternFrame) => {
    setPatternFrameState(nextFrame);
    try {
      localStorage.setItem(KANGA_FRAME_STORAGE_KEY, nextFrame);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent('wavelink:african-region-changed', {
        detail: { patternFrame: nextFrame }
      })
    );
  }, []);

  const setKangaBackgroundEnabled = useCallback((enabled: boolean) => {
    setKangaBgState(enabled);
    try {
      localStorage.setItem(KANGA_BG_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      if (enabled) {
        document.documentElement.setAttribute('data-kanga-bg', 'true');
      } else {
        document.documentElement.removeAttribute('data-kanga-bg');
      }
    }
    window.dispatchEvent(
      new CustomEvent('wavelink:african-region-changed', {
        detail: { kangaBgEnabled: enabled }
      })
    );
  }, []);

  const countryMeta = getCountryMeta(countryCode);

  return {
    countryCode,
    countryMeta,
    setCountryCode,
    currency,
    setCurrency,
    panAfricanLang,
    setPanAfricanLanguage,
    setPanAfricanLang: setPanAfricanLanguage,
    patternFrame,
    setPatternFrame,
    kangaBgEnabled,
    setKangaBackgroundEnabled,
    formatPrice: (amountTZS: number, includeAll = false) =>
      formatLocalPrice(amountTZS, currency, includeAll)
  };
}
