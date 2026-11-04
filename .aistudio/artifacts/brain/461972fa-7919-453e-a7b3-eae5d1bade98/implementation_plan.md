# Implementation Plan: WaveLink Mobile-First Calm & Welcoming Redesign

## 1. Goal & Architecture
Redesign WaveLink to deliver a mobile-first, simple, calm, and welcoming social experience without dark mode, featuring:
1. **Light Warm Theme**: Warm cream canvas (`#FAF7F2`), pure white cards (`#FFFFFF`), soft borders (`#EFECE6`), friendly blue (`#2563EB`) and teal (`#0D9488`) main accents, gentle coral (`#F43F5E`) and amber (`#F59E0B`) highlights.
2. **Section Soft Tints**:
   - Home Feed: `#FAF7F2` (warm cream) with ocean blue & teal accents
   - Studio Editor: `#FAF8FC` (soft lavender) with vibrant violet accents
   - Video Reels: `#FCF8F7` (soft warm blush) with coral accents
   - Messages: `#F5F9FD` (soft sky blue) with azure accents
   - Notice Board: `#F5FAF7` (soft sage) with emerald accents
   - Profile & Pro: `#FAF8F3` (soft warm linen) with amber/gold accents
3. **Ergonomics & Large Tap Targets**: Rounded corners (`rounded-2xl`, `rounded-3xl`), minimum 44–48px touch targets, generous spacing, readable typography.
4. **Minimal Home Screen**: Short friendly greeting (`"Good morning / Welcome back, {name} 👋"`), 24h moments tray, then the feed, and nothing else.
5. **Mobile Navigation**: Primary mobile navigation strictly via the 5-tab `MobileBottomNav` (Home, Reels, Create, Messages, Profile).
6. **Non-Overlapping Layers & Single-Modal Discipline**: Floating buttons and social bar banners removed from mobile feed overlays; popups coordinated so only one popup/drawer shows at a time with a clear $\ge 44\text{px}$ close button.
7. **Pro Placement & Free Daily Taste**:
   - Pro lives quietly in its dedicated tab on the Profile page.
   - Free users can use all free features without pushy banners.
   - Free users receive **1 free AI image per day** in WELINK AI Studio, with a gentle note when they've used today's image.
8. **One Main Button per Screen**:
   - Home Feed: `Share Wave`
   - Studio Editor: `Publish Wave`
   - Video Reels: `Create a Reel`
   - Messages: `Send` (in conversation) / `New Group`
   - Notice Board: `Post Event / Notice`
   - Profile: `Save Profile Changes`

## 2. Key Files Updated
- `src/index.css`: Replaced harsh white and rainbow animations with warm cream tokens (`#FAF7F2`, `#FAF8F5`, `#1C1917`, `#2563EB`, `#0D9488`, `#F43F5E`, `#F59E0B`).
- `src/context/ThemeContext.tsx`: Enforced warm cream light theme `#FAF7F2` and stone typography `#1C1917` across the root and body elements.
- `src/components/MobileBottomNav.tsx`: 5-tab ergonomic mobile navigation bar with active color states, rounded pills, and $\ge 48\text{px}$ touch targets.
- `src/components/TopHeader.tsx`: Hidden on mobile feed so greeting takes center stage; displays calm titles, search, and compact points on desktop/sub-views.
- `src/App.tsx`: Added section soft background tints, single-modal coordination (`activeCall`, `isWelinkOpen`), removed overlapping floating social bar banner and floating buttons from mobile viewport.
- `src/components/FeedView.tsx`: Simplified home screen with minimal greeting and single "Share Wave" composer button; removed clutter and duplicate promo cards.
- `src/components/WelinkAssistantDrawer.tsx`: Removed blocking paywall for free users; unlocked AI Chat Guide for everyone; added 1 free daily AI image taste; replaced header with warm styling and $\ge 44\text{px}$ close button; provided gentle Pro notes for Video/Voice.
- `src/components/SettingsView.tsx`: Quiet Pro presentation under the "WaveLink Pro" tab, daily reward bonus tracking, and single "Save Profile Changes" button.
- `src/components/StudioEditorView.tsx`, `VideosHubView.tsx`, `AnnouncementsView.tsx`, `ChatChannelsView.tsx`: Styled with soft tints, section accents, and single main button per view.

## 3. Spark Audience & WebRTC Calling Features
- **Spark Viewers & Likers Drawer**:
  - Automatically records viewer entry (`userId`, `name`, `username`, `photoURL`, `viewedAt`) in Firestore when a user watches another member's 24h Spark.
  - Automatically records likers (`userId`, `name`, `username`, `photoURL`, `likedAt`) and sends in-app notification to the Spark creator.
  - Interactive "👁️ X views • 🔥 Y likes" audience pill opens slide-up connections drawer with tabs for Watched and Liked.
  - Quick action buttons to directly "Message" (`onStartChat`) or "Follow" viewers and likers.
  - Creator encouragement banner prompting new Spark creations.
- **WebRTC Peer-to-Peer Calling & Incoming Call Alert**:
  - WebSocket `/api/chat/ws` relays `call:signal` events (`offer`, `answer`, `candidate`, `end`, `declined`).
  - Google STUN servers (`stun.l.google.com:19302`) with peer connection ICE candidate handling.
  - Local and remote camera/microphone media tracks with full toggle, screen sharing, and audio playback.
  - Incoming call notification and ringing alert modal with pleasant Web Audio synthesizer ringtone, caller avatar, and one-tap Accept / Decline buttons.

## 4. AI Upgrade Intelligence & Founder Feedback Collection
- **Autonomous Upgrade Detection**:
  - `src/services/upgradeFeedbackService.ts`: Analyzes user inputs across AI touchpoints for feature requests, speed issues, new tools, UI suggestions, and monetization requests (`detectUpgradeIdea`).
  - Auto-classifies category (`features`, `ui_ux`, `media_sparks`, `video_calls`, `performance`, `monetization`, `other`) and assesses impact (`high`, `medium`, `low`).
  - Saves to Firestore `upgrade_feedback` collection with author details, quote, and status (`new`, `planned`, `implemented`, `archived`).
  - Automatically dispatches in-app notification to Platform Owner Keylan Mbilinyi (`keylanmbilinyi5@gmail.com`).
- **AI Touchpoints Wired**:
  - `WelinkAssistantDrawer.tsx`:
    - Chat submissions run `detectUpgradeIdea` -> `recordUpgradeFeedback` (`source: 'welink_ai'`).
    - Live Talk voice turns run `detectUpgradeIdea` -> `recordUpgradeFeedback` (`source: 'live_talk'`).
    - WebSocket native speech recognition runs `detectUpgradeIdea`.
    - Added toast banner acknowledging captured feedback for Founder Keylan.
    - Added starter prompts for suggesting platform upgrades.
  - `ChatChannelsView.tsx` & `server.ts`:
    - Messages sent to `@wavelink_support` run `detectUpgradeIdea` -> `recordUpgradeFeedback` (`source: 'support_bot'`).
    - Updated bot instructions to warmly acknowledge user suggestions and confirm they are saved for Keylan.
- **Dedicated Founder Feedback Desks**:
  - `AdminDashboard.tsx`:
    - Added "💡 AI Upgrades & Ideas" tab with unreviewed badge counter.
    - Metrics overview: Total Ideas, New / Unreviewed, Planned Updates, Shipped & Implemented.
    - Filter pills by status (`All`, `New`, `Planned`, `Implemented`, `Archived`) and source (`All`, `WELINK AI`, `Live Voice`, `Support Bot`, `Founder Note`).
    - Search bar over titles, summaries, quotes, and usernames.
    - Status updater buttons ("📌 Plan for Release", "✅ Mark Implemented", "Archive").
    - Inline implementation notes editor for Keylan to record updates and progress.
    - "+ Add Upgrade Idea" manual creation modal.
  - `SettingsView.tsx`:
    - Added "AI Ideas" section accessible directly from Settings/Profile.
    - Displays recent community upgrade feedback with live Firestore listener.
    - Embedded user submission form allowing users to directly send ideas to Founder's Feedback.

## 5. Verification
- `tsc --noEmit`: 0 TypeScript errors.
- `npm run build`: Vite build passes cleanly.
- Dev server running on port 3000.
