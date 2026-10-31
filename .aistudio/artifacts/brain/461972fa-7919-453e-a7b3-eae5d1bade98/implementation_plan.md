# Implementation Plan: WaveLink Monetization Modal, Promo Code Engine & Real-Time Sync

## 1. Goal & Scope
Fix the monetization payment instructions, the `"HARVEST2026"` promo code redemption engine, and the real-time Firestore feed, online member badges, and chat sync across all WaveLink deployment domains (`wavelink-online.netlify.app` and `wavelink-social.netlify.app`).

### User Review Required & Confirmed Decisions
- **Payment Modal & Monetization Hub Alignment**: Both the Payment Modal (`MobileMoneyPaymentModal.tsx`) and the Monetization Hub page card (`MonetizationHub.tsx`) will display the official admin number `0787473334` (`WaveLink Official Admin`) with a 1-click `"Copy Number"` button and remove any legacy `[YOUR_TILL_NUMBER]` placeholders.
- **Cross-Domain Real-Time Read/Write Rules**: Firestore security rules (`firestore.rules`) will allow public reads (`allow read: if true`) on global posts, user profiles/online badges, sparks, and announcements while keeping writes authenticated (`allow write: if isSignedIn()`), and allow authenticated members to read/write direct and channel messages without permission errors during auth hydration across `wavelink-online.netlify.app` and `wavelink-social.netlify.app`.

---

## 2. Aesthetic & Structural Direction
- **Taxonomy & Design Paradigm**: Atmospheric Minimalism & High-Craft Light UI (`#F8FAFC` / `#FFFFFF` surfaces, `#0F172A` crisp slate typography, `#3B82F6` sky blue and `#10B981` emerald accents).
- **Tabular Numerals**: Enforce `tabular-nums` / `font-mono` on phone numbers (`0787473334`), pricing tiers (`TZS 18,000` / `TZS 50,000`), and transaction reference inputs.
- **Toast & Modal Ergonomics**: Prominent sky-blue/emerald highlighted instruction banner at the top of the Payment Modal, instant tactile feedback on `"Copy Number"` and `"Redeem"`, and non-blocking toast notifications (`"Harvest Pass Activated!"`).

---

## 3. Proposed Changes

### A. Payment Modal Header & Official Admin Instructions
- **File**: `/src/components/MobileMoneyPaymentModal.tsx`
- **Changes**:
  - Place a prominent, highlighted instruction box at the top of the modal (above the form input fields) displaying:
    - `"Send payment to WaveLink Official Admin: 0787473334 (Airtel Money / M-Pesa / Tigo Pesa)."`
    - A dedicated `"Copy Number"` button that copies `0787473334` to the clipboard (using `navigator.clipboard.writeText` with a `document.execCommand('copy')` fallback for iframe compatibility) and shows a `"Copied!"` confirmation toast.
    - Clear instruction copy below the number: `"After sending funds on your mobile phone, paste the Transaction ID from your operator's SMS receipt below."`

### B. Instant `"HARVEST2026"` Promo Code Engine & Ad Removal
- **Files**:
  - `/src/context/AuthContext.tsx`
  - `/src/components/MobileMoneyPaymentModal.tsx`
  - `/src/components/MonetizationHub.tsx`
- **Changes**:
  - Add an `activateProPass(planName?: string, durationDays?: number)` helper to `AuthContext` that:
    1. Immediately updates `userProfile` in React state with `isPro: true`, `hasBlueStar: true`, `proPlan: 'harvest_1year'`, `proBadge: 'blue_star'`, and `proExpiresAt` (+365 days), plus persists a local fallback in `localStorage` (`wavelink_pro_pass_${uid}`) so Pro status and Blue Star badge survive reloads even if offline.
    2. Purges any active Adsterra scripts/DOM containers immediately via `AdsterraManager` / `AdsterraAdBanner` reactive `userProfile?.isPro || userProfile?.hasBlueStar` checks.
    3. Writes to Firestore (`setDoc(doc(db, 'users', user.uid), ..., { merge: true })`) inside a non-blocking `Promise.race` with a 2.5-second timeout so network latency or backend rule checks never block the UI.
  - Update `handleApplyCoupon` in `MobileMoneyPaymentModal.tsx` so entering `"HARVEST2026"` (case-insensitive):
    - Never hangs or spins indefinitely (`isVerifyingCoupon` resolves immediately after local + timed-out Firestore sync).
    - Displays a prominent `"Harvest Pass Activated!"` toast notification.
    - Calls both `onSuccess?.()` and `onClose()` so the modal closes reliably from every parent view (`FeedView`, `ChatChannelsView`, `UserDirectoryView`, `SettingsView`, `MonetizationHub`).
  - Update `MonetizationHub.tsx` to replace `[YOUR_TILL_NUMBER]` with `0787473334` (`WaveLink Official Admin`), include a `"Copy Number"` button, and wire the `"HARVEST2026"` promo code input directly on the hub card as well.

### C. Real-Time Feed, Online Member Badges & Chat Sync Across Domains
- **Files**:
  - `/firestore.rules`
  - `/src/context/AuthContext.tsx`
  - `/src/services/verificationService.ts`
  - `/src/components/FeedView.tsx`
  - `/src/components/ChatChannelsView.tsx`
  - `/src/components/UserDirectoryView.tsx`
- **Changes**:
  - Update `/firestore.rules` and deploy via Firebase Rules deployment:
    - Allow public read (`allow read: if true`) on `/users/{userId}`, `/posts/{postId}` (and subcollections `/comments` and `/chunks`), `/sparks/{sparkId}`, `/announcements/{announcementId}`, `/follows/{followId}`, and `/appSettings/{settingId}`.
    - Allow authenticated users (`isSignedIn()`) to create and update their own `/users/{userId}` document (including `isPro`, `hasBlueStar`, `proPlan`, `proExpiresAt`, `proBadge`, `isOnline`, `lastSeenAt`) without restrictive field-diff rejections.
    - Allow authenticated users to read and write `/channels/{channelId}/messages/{messageId}`, `/groups/{groupId}`, and `/groupMessages/{messageId}` so direct messages, channel chats, and online badges work seamlessly.
    - Keep `/payment_requests/{requestId}` strictly private (`request.auth.uid == resource.data.userId || isAdmin()`).
  - Update `AuthContext.tsx` and `verificationService.ts` to register `wavelink-online.netlify.app`, `wavelink-social.netlify.app`, and `window.location.hostname`, and maintain a live `isOnline: true` / `lastSeenAt` heartbeat on the signed-in user's profile so online member badges update in real time across `FeedView`, `UserDirectoryView`, and `ChatChannelsView`.

---

## 4. Verification Plan
1. **Static & Type Verification**: Run `lint_applet` (`tsc --noEmit`) and `compile_applet` (`npm run build`) to confirm zero TypeScript or bundle errors.
2. **Firestore Security Rules Deployment**: Deploy updated `firestore.rules` to `formal-photon-n48x0` (`ai-studio-remixremixwaveli-0bcdbee7-e3d1-46ba-ab1a-3448613d34ac`).
3. **Functional Checks**:
   - Verify the Payment Modal header displays `0787473334` (`WaveLink Official Admin`), the `"Copy Number"` button copies `0787473334`, and the SMS receipt instructions are clearly shown above the inputs.
   - Verify entering `"HARVEST2026"` (any casing) immediately activates `user.isPro = true` and `hasBlueStar = true`, shows `"Harvest Pass Activated!"`, closes the modal, and hides all Adsterra ads without hanging.
   - Verify `onSnapshot` subscriptions for global feed posts, online users, and direct/channel messages stream cleanly with zero permission errors.
