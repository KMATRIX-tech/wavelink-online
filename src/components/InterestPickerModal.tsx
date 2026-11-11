import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Post, UserProfile, AfricanCountryCode } from '../types';
import {
  AFRICAN_COUNTRIES,
  useAfricanRegion
} from '../utils/africanCultureConfig';
import { Sparkles, Check, X, Compass, Globe } from 'lucide-react';

export interface InterestCategoryItem {
  id: string;
  labelEn: string;
  labelSw: string;
  emoji: string;
  hashtags: string[];
  keywords: string[];
}

export const INTEREST_CATALOG: InterestCategoryItem[] = [
  {
    id: 'bongo_flava',
    labelEn: 'Bongo Flava',
    labelSw: 'Bongo Flava',
    emoji: '🎶',
    hashtags: ['#BongoFlava', '#MuzikiTZ', '#NewBongo', '#Singeli'],
    keywords: ['bongo', 'flava', 'bongoflava', 'diamond', 'alikiba', 'harmonize', 'zuchu', 'jaymelody', 'singeli', 'wimbo']
  },
  {
    id: 'amapiano',
    labelEn: 'Amapiano',
    labelSw: 'Amapiano',
    emoji: '🎹',
    hashtags: ['#Amapiano', '#PianoVibes', '#AmapianoDance', '#LogDrum'],
    keywords: ['amapiano', 'piano', 'logdrum', 'yano', 'mzansi', 'dance']
  },
  {
    id: 'afrobeats',
    labelEn: 'Afrobeats',
    labelSw: 'Afrobeats',
    emoji: '🥁',
    hashtags: ['#Afrobeats', '#AfricanMusic', '#AfroFusion', '#NaijaToEast'],
    keywords: ['afrobeats', 'afrobeat', 'afrofusion', 'burna', 'wizkid', 'rema', 'ayra', 'music', 'muziki']
  },
  {
    id: 'gengetone',
    labelEn: 'Gengetone',
    labelSw: 'Gengetone & Arbantone',
    emoji: '🎤',
    hashtags: ['#Gengetone', '#Arbantone', '#254Music', '#NairobiVibes'],
    keywords: ['gengetone', 'arbantone', 'nairobi', '254', 'matatu', 'sheng', 'kenya']
  },
  {
    id: 'comedy',
    labelEn: 'Comedy & Skits',
    labelSw: 'Vichekesho & Igizo',
    emoji: '😂',
    hashtags: ['#ComedySkits', '#Vichekesho', '#FunnyAfrica', '#Laughs'],
    keywords: ['comedy', 'skit', 'skits', 'funny', 'joke', 'laugh', 'vichekesho', 'cheka', 'meme']
  },
  {
    id: 'football',
    labelEn: 'Football',
    labelSw: 'Soka & Mpira',
    emoji: '⚽',
    hashtags: ['#Football', '#Soka', '#SimbaYanga', '#MashemejiDerby', '#AFCON'],
    keywords: ['football', 'soccer', 'soka', 'mpira', 'goal', 'simba', 'yanga', 'gor mahia', 'afcon', 'premier', 'match']
  },
  {
    id: 'fashion',
    labelEn: 'Fashion & Kitenge',
    labelSw: 'Mitindo & Kitenge',
    emoji: '👗',
    hashtags: ['#AfricanFashion', '#KitengeStyle', '#Mitindo', '#KangaVibes'],
    keywords: ['fashion', 'style', 'mitindo', 'kitenge', 'kanga', 'ankara', 'outfit', 'dress', 'urembo']
  },
  {
    id: 'school_life',
    labelEn: 'School Life',
    labelSw: 'Maisha ya Shule & Chuo',
    emoji: '🎓',
    hashtags: ['#SchoolLife', '#CampusVibes', '#Wanafunzi', '#ChuoLife'],
    keywords: ['school', 'campus', 'student', 'uni', 'college', 'shule', 'chuo', 'exam', 'class', 'study']
  },
  {
    id: 'business',
    labelEn: 'Small Business',
    labelSw: 'Biashara Ndogo',
    emoji: '💼',
    hashtags: ['#SmallBusiness', '#Biashara', '#Kariakoo', '#HustleAfrica'],
    keywords: ['business', 'biashara', 'hustle', 'money', 'pesa', 'shop', 'duka', 'kariakoo', 'market', 'entrepreneur']
  },
  {
    id: 'food',
    labelEn: 'Food & Local Dishes',
    labelSw: 'Chakula & Mapishi',
    emoji: '🍲',
    hashtags: ['#SwahiliFood', '#Mapishi', '#PilauNyamaChoma', '#EastAfricanFood'],
    keywords: ['food', 'cook', 'recipe', 'chakula', 'mapishi', 'pilau', 'biryani', 'nyama choma', 'ugali', 'chapati']
  },
  {
    id: 'farming',
    labelEn: 'Farming (Kilimo)',
    labelSw: 'Kilimo & Ufugaji',
    emoji: '🌾',
    hashtags: ['#KilimoBiashara', '#FarmingAfrica', '#AgriTech', '#ShambaLife'],
    keywords: ['farming', 'kilimo', 'shamba', 'crops', 'maize', 'avocado', 'coffee', 'cattle', 'ufugaji', 'agribusiness']
  },
  {
    id: 'faith',
    labelEn: 'Faith & Inspiration',
    labelSw: 'Imani & Hamasa',
    emoji: '🙏',
    hashtags: ['#FaithAndHope', '#Baraka', '#GospelAfrica', '#Inspiration'],
    keywords: ['faith', 'imani', 'blessed', 'baraka', 'gospel', 'worship', 'prayer', 'dua', 'shukrani', 'motivation']
  },
  {
    id: 'gaming',
    labelEn: 'Gaming',
    labelSw: 'Michezo ya Video',
    emoji: '🎮',
    hashtags: ['#GamingAfrica', '#EAFC', '#EsportsKE_TZ', '#MobileGaming'],
    keywords: ['game', 'gaming', 'ps5', 'fifa', 'eafc', 'cod', 'pubg', 'esports', 'stream', 'gamer']
  }
];

export const DEFAULT_FALLBACK_HASHTAGS = [
  '#BongoFlava',
  '#EastAfricaCreators',
  '#ComedySkits',
  '#KilimoBiashara',
  '#Amapiano',
  '#Gengetone',
  '#Afrobeats'
];

export function getSavedUserInterests(uid?: string | null, profileInterests?: string[]): string[] {
  if (Array.isArray(profileInterests) && profileInterests.length > 0) {
    return profileInterests;
  }
  if (typeof window === 'undefined' || !uid) return [];
  try {
    const raw = localStorage.getItem(`wavelink_interests_${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasUserCompletedOrSkippedInterests(
  uid?: string | null,
  profile?: UserProfile | null
): boolean {
  if (!uid) return true;
  if (profile?.interestsCompleted) return true;
  if (Array.isArray(profile?.interests) && profile!.interests.length >= 3) return true;
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(`wavelink_interests_done_${uid}`) === '1') return true;
    const saved = getSavedUserInterests(uid);
    return saved.length >= 3;
  } catch {
    return false;
  }
}

export function markInterestPickerCompletedLocal(uid: string, interests?: string[]): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.setItem(`wavelink_interests_done_${uid}`, '1');
    if (Array.isArray(interests)) {
      localStorage.setItem(`wavelink_interests_${uid}`, JSON.stringify(interests));
    }
  } catch {
    // ignore
  }
}

/**
 * Returns suggested hashtags based on the user's selected interests, with a plain fallback if none match
 */
export function getSuggestedHashtagsForInterests(interests: string[]): string[] {
  if (!Array.isArray(interests) || interests.length === 0) {
    return DEFAULT_FALLBACK_HASHTAGS;
  }
  const matchedTags: string[] = [];
  for (const interestId of interests) {
    const cat = INTEREST_CATALOG.find((c) => c.id === interestId.toLowerCase());
    if (cat) {
      for (const tag of cat.hashtags) {
        if (!matchedTags.includes(tag)) {
          matchedTags.push(tag);
        }
      }
    }
  }
  return matchedTags.length > 0 ? matchedTags.slice(0, 8) : DEFAULT_FALLBACK_HASHTAGS;
}

/**
 * Computes an interest relevance score (0+) for a post based on the user's chosen interests
 */
export function scorePostByInterests(post: Post, interests: string[]): number {
  if (!post || !Array.isArray(interests) || interests.length === 0) return 0;
  const text = `${post.content || ''} ${(post.hashtags || []).join(' ')} ${post.songTitle || ''}`.toLowerCase();
  let score = 0;

  for (const interestId of interests) {
    const cat = INTEREST_CATALOG.find((c) => c.id === interestId.toLowerCase());
    if (!cat) continue;
    for (const tag of cat.hashtags) {
      if (text.includes(tag.toLowerCase())) {
        score += 3;
      }
    }
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
  }
  return score;
}

/**
 * Computes an interest match score for a creator profile (with fallback if nothing matches)
 */
export function scoreCreatorByInterests(
  creator: UserProfile,
  userInterests: string[],
  creatorPosts: Post[] = []
): number {
  if (!creator || !Array.isArray(userInterests) || userInterests.length === 0) return 0;
  let score = 0;

  // 1. Direct shared interests on profile
  if (Array.isArray(creator.interests)) {
    for (const item of creator.interests) {
      if (userInterests.includes(item)) {
        score += 4;
      }
    }
  }

  // 2. Bio keywords
  const bioLower = (creator.bio || '').toLowerCase();
  for (const interestId of userInterests) {
    const cat = INTEREST_CATALOG.find((c) => c.id === interestId.toLowerCase());
    if (!cat) continue;
    if (cat.keywords.some((kw) => bioLower.includes(kw))) {
      score += 2;
    }
  }

  // 3. Creator's recent posts
  for (const p of creatorPosts) {
    if (p.authorId === creator.id) {
      score += Math.min(3, scorePostByInterests(p, userInterests));
    }
  }

  return score;
}

interface InterestPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelected?: string[];
  initialInterests?: string[];
  onSaved?: (interests: string[]) => void;
}

export const InterestPickerModal: React.FC<InterestPickerModalProps> = ({
  isOpen,
  onClose,
  initialSelected = [],
  initialInterests = [],
  onSaved
}) => {
  const { currentUser, userProfile, updateUserProfile, showGlobalToast } = useAuth();
  const { language, t } = useLanguage();
  const { countryCode, setCountryCode } = useAfricanRegion(userProfile);

  const seedList = initialSelected.length > 0 ? initialSelected : initialInterests;
  const [selected, setSelected] = useState<string[]>(() =>
    seedList.length > 0
      ? seedList
      : getSavedUserInterests(currentUser?.uid, userProfile?.interests)
  );
  const [pickedCountry, setPickedCountry] = useState<AfricanCountryCode>(countryCode);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const toggleInterest = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectCountry = (code: AfricanCountryCode) => {
    setPickedCountry(code);
    setCountryCode(code);
  };

  const handleSkip = () => {
    if (currentUser?.uid) {
      markInterestPickerCompletedLocal(currentUser.uid, selected);
      updateUserProfile({
        interestsCompleted: true,
        countryCode: pickedCountry
      }).catch(() => {});
    }
    onClose();
  };

  const handleSave = async () => {
    if (selected.length < 3) return;
    setIsSaving(true);
    try {
      setCountryCode(pickedCountry);
      if (currentUser?.uid) {
        markInterestPickerCompletedLocal(currentUser.uid, selected);
        await updateUserProfile({
          interests: selected,
          interestsCompleted: true,
          countryCode: pickedCountry
        });
      }
      if (onSaved) onSaved(selected);
      showGlobalToast(
        language === 'sw'
          ? 'Karibu! Nchi na mambo unayopenda yamehifadhiwa! ✨'
          : 'Karibu! Your country and interests have been saved! ✨'
      );
      onClose();
    } catch {
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = selected.length >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-xl bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col">
        <div className="kitenge-border-strip shrink-0" />
        <div className="p-5 sm:p-7 space-y-5 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200 text-[11px] font-extrabold uppercase tracking-wider">
                <Compass size={13} />
                <span>{t('interests.modal_badge')}</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 mt-2 tracking-tight">
                {t('interests.modal_title')}
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed">
                {t('interests.modal_subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-900 transition shrink-0 cursor-pointer"
              title={t('interests.skip_for_now')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Country & Region Picker with Flags */}
          <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#EFECE6] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-stone-800 flex items-center gap-1.5">
                <Globe size={14} className="text-[#0D9488]" />
                <span>
                  {language === 'sw'
                    ? 'Chagua Nchi na Kanda Yako (Kwa ukurasa wa Za Nyumbani)'
                    : 'Your Country & Region (For Local Feed & Currency)'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {AFRICAN_COUNTRIES.map((c) => {
                const active = pickedCountry === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCountry(c.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer shrink-0 ${
                      active
                        ? 'bg-[#0D9488] text-white shadow-2xs'
                        : 'bg-white border border-stone-200 text-stone-700 hover:border-teal-400'
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{language === 'sw' ? c.nameSw : c.nameEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid of 13 African Content Categories */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {INTEREST_CATALOG.map((item) => {
            const isPicked = selected.includes(item.id);
            const label = language === 'sw' ? item.labelSw : item.labelEn;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleInterest(item.id)}
                className={`min-h-[54px] p-3 rounded-2xl border text-left transition flex items-center justify-between gap-2 cursor-pointer active:scale-95 ${
                  isPicked
                    ? 'bg-blue-50/90 border-[#2563EB] text-[#1D4ED8] shadow-2xs ring-2 ring-[#2563EB]/20'
                    : 'bg-stone-50/80 hover:bg-stone-100/80 border-stone-200/90 text-stone-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{item.emoji}</span>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold block truncate">
                      {label}
                    </span>
                    <span className="text-[10px] text-stone-500 block truncate">
                      {item.hashtags[0]}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition ${
                    isPicked
                      ? 'bg-[#2563EB] text-white'
                      : 'border border-stone-300 bg-white'
                  }`}
                >
                  {isPicked && <Check size={12} strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress & Actions */}
        <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs font-bold text-stone-600">
            <span className={canSave ? 'text-[#0D9488]' : 'text-[#2563EB]'}>
              {selected.length}
            </span>{' '}
            {t('interests.selected_count')}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSkip}
              className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition cursor-pointer"
            >
              {t('interests.skip_for_now')}
            </button>
            <button
              type="button"
              disabled={!canSave || isSaving}
              onClick={handleSave}
              className="min-h-[44px] flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Sparkles size={14} />
              <span>{isSaving ? '...' : t('interests.save_continue')}</span>
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
