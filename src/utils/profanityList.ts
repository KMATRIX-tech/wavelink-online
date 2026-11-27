/**
 * WaveLink Compact Multilingual Moderation Dictionary (Local & Cached — ZERO Firestore reads)
 *
 * IMPORTANT NOTE ON SAFETY LAYERS:
 * No static word list is 100% perfect on its own—slang evolves, languages mix, and context
 * matters. This compact local dictionary powers Layer 1 (instant client feedback) and the fast
 * deterministic first pass of Layer 2 (server check). Layer 2 selectively escalates suspicious
 * borderline text to Gemini AI, Layer 3 moderates images/video thumbnails, and Layer 4 provides
 * user reporting, auto-hide after 3 reports, strikes, appeals, and human moderator review.
 *
 * Open-source base inspiration: LDNOOBW / bad-words core multilingual terms + curated Swahili,
 * East African, and global profanity/slur/sexual/harassment/phishing terms.
 */

export type ModerationTermCategory = 'profanity' | 'hate' | 'sexual' | 'harassment' | 'scam';

export interface CategorizedTermList {
  profanity: readonly string[];
  hate: readonly string[];
  sexual: readonly string[];
  harassment: readonly string[];
  scam: readonly string[];
}

/**
 * Unambiguous multi-character terms (>= 4 chars) that are safe to detect both as standalone
 * words AND when hidden inside obfuscated/joined strings (after masking out SAFE_ALLOWLIST).
 */
export const STRONG_SUBSTRING_TERMS: CategorizedTermList = {
  profanity: [
    // English
    'fuck', 'fucker', 'fucking', 'fucked', 'fack', 'fvck', 'phuck', 'motherfucker', 'motherfucking', 'mofo',
    'bullshit', 'horseshit', 'dipshit', 'shithead', 'shitty', 'asshole', 'arsehole',
    'dumbass', 'jackass', 'bastard', 'bitch', 'bitches', 'bitching', 'biatch', 'sonofabitch',
    'dickhead', 'cocksucker', 'cunt', 'twat', 'wanker', 'bellend', 'bollocks',
    'douchebag', 'prick', 'pissedoff', 'goddamn',
    // Swahili & East African slang
    'kumamako', 'kumamae', 'kumanyoko', 'kumamake', 'kumamayo', 'mkundu', 'mikundu',
    'msenge', 'wasenge', 'mashoga', 'malaya', 'kahaba', 'makahaba', 'mshenzi', 'washenzi',
    'mpumbavu', 'wapumbavu', 'pumbavu', 'shenzi', 'kutomba', 'kutombana', 'kutomwa',
    'kufirwa', 'kufira', 'ufirauni', 'mchawiwewe', 'mbwawewe', 'shetaniwewe', 'nyoko',
    'matako', 'mashoko',
    // Spanish
    'cabron', 'pendejo', 'pendeja', 'mierda', 'chingar', 'chingada', 'chingado',
    'hijodeputa', 'hijoputa', 'gilipollas', 'culero', 'maricon', 'marica', 'pincheputa',
    'verga', 'pendejada', 'cojudo', 'malparido', 'gonorrea', 'zorra', 'ramera',
    // French
    'putain', 'merde', 'salope', 'connard', 'connasse', 'encule', 'enculer',
    'batard', 'filsdepute', 'niquetamere', 'bordel', 'bouffon', 'petasse', 'trouduc',
    // Portuguese
    'caralho', 'porra', 'buceta', 'cuzao', 'viado', 'desgraca', 'arrombado', 'piranha',
    'filhodaputa', 'babaca', 'otario',
    // Arabic (transliterated + Arabic script)
    'sharmuta', 'sharmouta', 'kosomak', 'kossomak', 'ibnelkalb', 'khawal', 'manyouk',
    'gahba', 'kahba', 'qahba', 'zamel', 'شرموطة', 'شرموطه', 'قحبة', 'قحبه', 'كسامك', 'منيوك', 'خول',
    // Hindi / Urdu (transliterated)
    'bhenchod', 'behenchod', 'madarchod', 'chutiya', 'bhosdike', 'bhosdi', 'randi',
    'harami', 'haramzada', 'gandu', 'kamina', 'kamine', 'mcbc', 'loda', 'lund',
    // German
    'scheisse', 'arschloch', 'hurensohn', 'fotze', 'wichser', 'schlampe', 'miststuck', 'drecksau',
    // Turkish
    'siktir', 'orospu', 'pezevenk', 'yarrak', 'amcik', 'gavat', 'piç',
    // Russian (transliterated + Cyrillic)
    'blyat', 'blyad', 'pizdec', 'pizda', 'nahui', 'ebanat', 'ebat', 'mudak',
    'блять', 'блядь', 'пизда', 'пиздец', 'нахуй', 'ебать', 'мудак', 'сука',
    // Italian
    'vaffanculo', 'stronzo', 'coglione', 'puttana', 'troia', 'merda',
    // Indonesian / Malay
    'anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'bajingan', 'jancok',
  ],
  hate: [
    // Severe racial, ethnic, religious, homophobic, ableist slurs
    'nigger', 'nigga', 'niggaz', 'niggas', 'faggot', 'faggots', 'tranny', 'shemale',
    'retard', 'retarded', 'spastic', 'chink', 'gook', 'kike', 'wetback', 'beaner',
    'raghead', 'towelhead', 'sandnigger', 'paki', 'coon', 'darkie', 'whitetrash',
    'heilhitler', 'whitepower', 'killalljews', 'killallmuslims', 'killallblacks',
    'killallgays', 'kafiri',
  ],
  sexual: [
    // Explicit sexual terms, pornography, non-consensual sexual content
    'porn', 'porno', 'pornhub', 'xvideos', 'xnxx', 'onlyfansnudes', 'nudes', 'sendnudes',
    'blowjob', 'handjob', 'footjob', 'rimjob', 'deepthroat', 'gangbang', 'bukkake',
    'creampie', 'cumshot', 'dildo', 'vibrator', 'masturbate', 'masturbation', 'jackoff',
    'jerkoff', 'fapfap', 'orgasm', 'clitoris', 'vagina', 'penis', 'testicles', 'boobs',
    'titties', 'pussy', 'horny', 'milf', 'bdsm', 'hentai', 'incest', 'rape', 'rapist',
    'molest', 'pedophile', 'pedo', 'childporn', 'cpvideo', 'loli', 'underagesex',
    'ngono', 'pichazauchi', 'videozauchi', 'kutombana', 'tomba', 'kumaliza', // note: kumaliza is allowlisted below; kept out in runtime check
    'sexvideo', 'sextape', 'hooker', 'prostitute', 'escortservice', 'slut', 'whore', 'skank',
  ].filter((t) => t !== 'kumaliza'),
  harassment: [
    'killyourself', 'gohangyourself', 'slityourwrists', 'drinkbleach', 'shootyourself',
    'iwanttokillyou', 'iwillkillyou', 'imgonnakillyou', 'iwilldoxxyou', 'doxxyou',
    'swatyou', 'dieinafire', 'hopeyoudie', 'nobodylovesyou', 'youareworthless',
    'jiue', 'kafie', 'nitakuua', 'uauwe', 'kufawewe',
  ],
  scam: [
    'sendyourpassword', 'sendyourpin', 'shareyourpin', 'mpesapin', 'airtelpin',
    'tigopesapin', 'halopesapin', 'sendmeotp', 'shareyourotp', 'tumanenosiri',
    'tumasiriyako', 'nambayasiriyampesa', 'tumapinyako', 'nambayasiriyako',
    'doubleyourtzsinstantly', 'freemoneymultiplier',
  ],
};

/**
 * Short or substring-sensitive words (3-5 chars) that MUST match on word boundaries OR as
 * collapsed separated-letter tokens (e.g., "k u m a", "a.s.s", "f.a.g", "s.h.i.t") so they
 * never falsely block innocent words containing those letters (the Scunthorpe problem).
 */
export const WORD_BOUNDARY_TERMS: CategorizedTermList = {
  profanity: [
    'shit', 'ass', 'arse', 'dick', 'cock', 'piss', 'crap', 'damn', 'stfu', 'gtfo', 'lmfao',
    'fuk', 'fck', 'fux', 'fuc', 'sht', 'btch', 'bch', 'cnt', 'dck', 'pns',
    // Swahili short terms
    'kuma', 'mboo', 'kundu', 'shoga', 'tako', 'fala', 'mbwa', 'mjinga', 'choko', 'firwa', 'punda',
    // Spanish/French/Other short terms
    'puta', 'puto', 'cono', 'pedo', 'cul', 'con', 'pute', 'fdp', 'ntm', 'tg', 'suka', 'hui', 'amk', 'aq',
  ],
  hate: [
    'fag', 'dyke', 'spic', 'kys', 'nazi', 'kkk',
  ],
  sexual: [
    'cum', 'tit', 'tits', 'sex', 'xxx', 'hoe', 'hoes', 'thot', 'milf', 'anal', 'oral',
    'nsfw', 'nude', 'uchi', 'sexi', 'sexy',
  ],
  harassment: [
    'kys', 'loser', 'idiot', 'moron', 'imbecile', 'scum', 'trash',
  ],
  scam: [
    'carding', 'ccv', 'fullz',
  ],
};

/**
 * Multi-word phrases checked against spaced normalized text (allows flexible single/multi spaces).
 */
export const BLOCKED_PHRASES: ReadonlyArray<{ phrase: string; category: ModerationTermCategory }> = [
  { phrase: 'kill yourself', category: 'harassment' },
  { phrase: 'go die', category: 'harassment' },
  { phrase: 'hang yourself', category: 'harassment' },
  { phrase: 'end your life', category: 'harassment' },
  { phrase: 'i will kill you', category: 'harassment' },
  { phrase: 'i am going to kill you', category: 'harassment' },
  { phrase: 'send nudes', category: 'sexual' },
  { phrase: 'send your password', category: 'scam' },
  { phrase: 'send your pin', category: 'scam' },
  { phrase: 'give me your pin', category: 'scam' },
  { phrase: 'mpesa pin', category: 'scam' },
  { phrase: 'airtel pin', category: 'scam' },
  { phrase: 'tigopesa pin', category: 'scam' },
  { phrase: 'tuma nenosiri', category: 'scam' },
  { phrase: 'tuma pin yako', category: 'scam' },
  { phrase: 'namba ya siri', category: 'scam' },
  { phrase: 'mjinga mkubwa', category: 'harassment' },
  { phrase: 'mbwa wewe', category: 'harassment' },
  { phrase: 'shetani wewe', category: 'harassment' },
  { phrase: 'mama yako', category: 'profanity' },
  { phrase: 'baba yako', category: 'profanity' },
  { phrase: 'picha za uchi', category: 'sexual' },
  { phrase: 'video za uchi', category: 'sexual' },
  { phrase: 'son of a bitch', category: 'profanity' },
  { phrase: 'piece of shit', category: 'profanity' },
  { phrase: 'go to hell', category: 'harassment' },
  { phrase: 'shut the fuck up', category: 'profanity' },
  { phrase: 'ibn el kalb', category: 'profanity' },
  { phrase: 'nique ta mere', category: 'profanity' },
  { phrase: 'fils de pute', category: 'profanity' },
  { phrase: 'hijo de puta', category: 'profanity' },
  { phrase: 'filho da puta', category: 'profanity' },
];

/**
 * Anti-Scunthorpe Allowlist:
 * Innocent English, Swahili, and international words/names that contain blocked substrings.
 * Masked out before embedded/substring scans so WaveLink avoids false positives.
 */
export const SAFE_ALLOWLIST: ReadonlySet<string> = new Set([
  // Classic English anti-Scunthorpe terms
  'scunthorpe', 'assassin', 'assassinate', 'assassination', 'classic', 'class', 'classes',
  'classical', 'classify', 'classified', 'classroom', 'glass', 'glasses', 'grass', 'grassland',
  'pass', 'passed', 'passing', 'passenger', 'passport', 'passion', 'passionate', 'compass',
  'compassion', 'assistant', 'assist', 'assistance', 'assess', 'assessment', 'asset', 'assets',
  'assume', 'assumption', 'assure', 'assurance', 'associate', 'association', 'assemble',
  'assembly', 'assign', 'assignment', 'mass', 'massive', 'embassy', 'harass', 'harassment',
  'cocktail', 'cockpit', 'peacock', 'hancock', 'hitchcock', 'shuttlecock', 'woodcock',
  'dickens', 'benedict', 'predict', 'prediction', 'verdict', 'addict', 'addiction', 'dictionary',
  'title', 'titles', 'subtitle', 'entitle', 'entitled', 'constitution', 'institution',
  'institute', 'substitute', 'prosthetic', 'attitude', 'gratitude', 'latitude', 'longitude',
  'magnitude', 'multitude', 'solitude', 'aptitude', 'altitude', 'fortitude', 'certitude',
  'analysis', 'analyst', 'analytics', 'analyze', 'analyse', 'canal', 'banal', 'arsenal',
  'penal', 'renal', 'signal', 'final', 'journal', 'internal', 'external', 'original',
  'personal', 'national', 'regional', 'seasonal', 'traditional', 'professional', 'emotional',
  'basement', 'document', 'documentary', 'circumstance', 'circumference', 'cucumber',
  'accumulate', 'encumber', 'incumbent', 'succumb', 'documenting', 'therapist', 'therapy',
  'grape', 'grapes', 'drape', 'drapes', 'scrape', 'scraper', 'scrap', 'scrapbook', 'trapeze',
  'hello', 'shell', 'shells', 'shelter', 'shiitake', 'shitake', 'mishit',
  'snigger', 'niger', 'nigeria', 'nigerian', 'nigerians', 'montenegro', 'denigrate',
  'spice', 'spices', 'spicy', 'spicier', 'suspicion', 'suspicious', 'auspicious',
  'butter', 'button', 'butterfly', 'buttress', 'rebuttal', 'gutter', 'mutter', 'flutter',
  'stutter', 'shutter', 'clutter', 'peninsula', 'pennant', 'penny', 'pencil', 'pending',
  'depend', 'suspend', 'spend', 'expense', 'dispense', 'compensate', 'indispensable',
  'bachelor', 'bassoon', 'sextant', 'sextet', 'sexton', 'essex', 'sussex', 'wessex', 'middlesex',
  'unisex', 'bisexual', 'heterosexual', 'homosexual', 'sexual', 'sexuality',
  'hoeing', 'shoe', 'shoes', 'shoelace', 'phoenix', 'echoes', 'heroes', 'tomatoes', 'potatoes',
  'crapshoot', 'scrapyard', 'scrappy', 'damnation', 'condemn', 'amsterdam', 'rotterdam',
  'piston', 'pistachio', 'epistle', 'prickly', 'prickle', 'twattle', 'wankel',
  'raptor', 'rapture', 'wrapper', 'wrapping', 'trapped', 'strapping', 'therapists',
  'hornybill', 'hornbill', 'thorny', 'thorn', 'corn', 'corner', 'popcorn', 'unicorn',
  'acorn', 'born', 'scorn', 'sworn', 'worn', 'torn', 'morn', 'morning', 'pornography',
  'morocco', 'cormorant', 'sluthound', 'whorl', 'scummed', 'scumble',
  'computer', 'compute', 'dispute', 'reputation', 'amputate', 'impute', 'deputy',
  'congratulations', 'congrats', 'connect', 'connection', 'content', 'context', 'continue',
  'control', 'concert', 'concept', 'concern', 'conclude', 'condition', 'confirm', 'conflict',
  'contact', 'contain', 'contest', 'contract', 'contrast', 'contribute', 'conversation',
  'culture', 'cultural', 'agriculture', 'sculpture', 'cultivate', 'faculty', 'difficulty',
  'calculate', 'particular', 'spectacular', 'molecular', 'circular', 'secular', 'popular',
  'chihuahua', 'puerto', 'putter', 'putty', 'output', 'input', 'throughput', 'repute',
  'canadian', 'canada', 'analogy', 'analog', 'catalog', 'dialogue', 'monologue',
  // Swahili & East African innocent words/places (avoiding false blocks on kuma, tako, fala, mboo, kundu, shoga, etc.)
  'sukuma', 'kumbuka', 'kumaliza', 'kumbe', 'kumradhi', 'kumi', 'kumbatia', 'kumwaga',
  'kumpa', 'kumsaidia', 'kumwona', 'kumtuma', 'kumshukuru', 'kumheshimu', 'kumjua',
  'kumwambia', 'kumcheka', 'kumfundisha', 'kumkaribisha', 'kumpenda', 'kumtunza',
  'kumasi', 'kumamoto', 'akuma', 'sakuma', 'takuma', 'tuma', 'mtume', 'utume', 'kutuma',
  'shuka', 'shule', 'shoka', 'shona', 'shwari', 'shukrani', 'shukuru', 'sherehe', 'sheria',
  'mboga', 'mbolea', 'mbogo', 'mbona', 'mboni', 'mbowe', 'mbeya', 'mbu', 'mbunge', 'mbuyu',
  'kunduchi', 'mkulima', 'mkutano', 'mkubwa', 'mkuki', 'mkate', 'mkoa', 'mkono', 'mkopo',
  'matakatifu', 'utakatifu', 'mtakatifu', 'matakwa', 'kitako', 'takwimu', 'taka', 'nataka',
  'unataka', 'anataka', 'tunataka', 'wanataka', 'kutaka', 'mtaka', 'matokeo', 'matunda',
  'tafadhali', 'tafadhalini', 'falafel', 'safari', 'msafara', 'mfalme', 'ufalme', 'kufanya',
  'chokoleti', 'chocolate', 'mchokozi', 'choka', 'nimechoka', 'kuchoka', 'chombo',
  'malaysia', 'malaysian', 'malawi', 'malaria', 'malango', 'malazi', 'malipo', 'mali',
  'kahawa', 'kahama', 'kabila', 'kabisa', 'kabla', 'kaburi', 'kazi', 'kaka', 'dada',
  'punda', // wait: punda is a mild Swahili insult/donkey; keep punda out of allowlist? Actually donkey is common in stories; let's keep it out of strong terms.
  'nyoka', 'nyota', 'nyumba', 'nyumbani', 'nyimbo', 'nyama', 'nyanya', 'nyingi',
  'mbuzi', 'mpira', 'mpishi', 'mpenzi', 'mpango', 'mpaka', 'mpango', 'mjini', 'mji', 'mjomba',
  'msichana', 'mvulana', 'mwalimu', 'mwanafunzi', 'mwanaume', 'mwanamke', 'mwisho', 'mwanzo',
  'shetani', // religious discussion context unless paired ("shetani wewe")
  'malengo', 'maisha', 'mambo', 'habari', 'asante', 'karibu', 'pole', 'samahani', 'hongera',
  // Arabic / French / Spanish / Other common safe words
  'habibi', 'shukran', 'mashallah', 'inshallah', 'bonjour', 'merci', 'beaucoup', 'gracias',
  'hola', 'amigo', 'amigos', 'buenos', 'senor', 'senora', 'obrigado', 'obrigada',
]);

/**
 * Soft suspicious-signal keywords/patterns.
 * Passing Layer 1 does NOT block these—instead, Layer 2 uses them to decide whether to invoke
 * Gemini AI for deeper semantic/multilingual/slang review (keeping Gemini cost near zero for
 * normal friendly messages!).
 */
export const SUSPICIOUS_AI_TRIGGER_PATTERNS: ReadonlyArray<RegExp> = [
  // Hostile second-person attack structures (English & Swahili)
  /\b(you\s+are\s+(so\s+)?(ugly|stupid|dumb|pathetic|disgusting|worthless|filthy|evil|trash|garbage|animal|pig|dog))\b/i,
  /\b(wewe\s+ni\s+(mjinga|mbwa|mpumbavu|mchafu|mnyama|takataka|shetani|mchawi))\b/i,
  /\b(nenda\s+kafe|ufwe|kufa\s+tu|hutafanikiwa|huna\s+akili|akili\s+mbovu)\b/i,
  // Sexual / solicitation / adult content cues
  /\b(only\s*fans|sugar\s*(daddy|mummy|mommy)|hook\s*up|dm\s+for\s+(pics|videos|fun|nudes)|18\+|adults?\s+only|strip|naked|undress|bed\s+with\s+me|sleep\s+with\s+me|uchafu|mambo\s+ya\s+kikubwa)\b/i,
  // Self-harm / violence / threat cues
  /\b(cut\s+myself|end\s+it\s+all|jump\s+off|stab\s+you|beat\s+you\s+up|find\s+where\s+you\s+live|burn\s+your|bomb\s+the|shoot\s+up)\b/i,
  // Hate / dehumanizing group rhetoric
  /\b(go\s+back\s+to\s+your\s+country|all\s+\w+\s+should\s+(die|leave|be\s+killed)|subhuman|vermin|parasites|inferior\s+race|hate\s+all)\b/i,
  // Financial / phishing / impersonation lures
  /\b(send\s+money\s+now|urgent\s+transfer|verify\s+your\s+account\s+here|click\s+this\s+link\s+to\s+claim|won\s+a\s+prize|free\s+cash\s+app|whatsapp\s+me\s+for\s+loans|tuma\s+pesa\s+haraka|umeshinda\s+zawadi)\b/i,
  // Heavy obfuscation / censorship evasion patterns (e.g., "f*ck", "s**t", "b!tch", "k*ma", "m*laya")
  /\b[a-z]{1,2}[*#$@!?_-]{1,3}[a-z]{1,4}\b/i,
  // Repeated aggressive punctuation or ALL CAPS shouting over 18+ letters
  /[A-Z]{18,}/,
];
