import React, { useState } from 'react';
import { ShieldCheck, FileText, RefreshCw, X, HelpCircle, CheckCircle2, Waves, Lock } from 'lucide-react';

export type LegalDocType = 'privacy' | 'terms' | 'refund' | 'security';

interface LegalModalProps {
  isOpen: boolean;
  initialDoc?: LegalDocType;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  initialDoc = 'privacy',
  onClose
}) => {
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/40 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white border border-[var(--border-subtle)] text-[#1C1917] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[#FAF7F2]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
              <Waves size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-[#1C1917]">WaveLink Legal &amp; Security Center</h2>
              <p className="text-xs text-[#57534E] font-medium">Plain, Friendly Privacy, Terms &amp; Account Safety</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white border border-[var(--border-subtle)] hover:bg-stone-100 text-[#57534E] hover:text-[#1C1917] transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border-subtle)] bg-[#FAF7F2]/60 px-4 pt-2 gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveDoc('privacy')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'privacy'
                ? 'border-[#2563EB] text-[#2563EB] bg-[#2563EB]/5'
                : 'border-transparent text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <ShieldCheck size={15} />
            <span>Privacy Policy</span>
          </button>
          <button
            onClick={() => setActiveDoc('terms')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'terms'
                ? 'border-[#0D9488] text-[#0D9488] bg-[#0D9488]/5'
                : 'border-transparent text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <FileText size={15} />
            <span>Terms of Service</span>
          </button>
          <button
            onClick={() => setActiveDoc('security')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'security'
                ? 'border-[#2563EB] text-[#2563EB] bg-[#2563EB]/5'
                : 'border-transparent text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <Lock size={15} />
            <span>Security Guide</span>
          </button>
          <button
            onClick={() => setActiveDoc('refund')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'refund'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                : 'border-transparent text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            <RefreshCw size={15} />
            <span>Refund Policy</span>
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-[#57534E] leading-relaxed bg-white">
          {activeDoc === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#EEF2FF] border border-[#2563EB]/20 text-[#1E40AF] text-xs font-medium flex items-center gap-2.5">
                <Lock size={16} className="text-[#2563EB] shrink-0" />
                <span>Written in plain language. Compliant with Tanzania Data Protection Act &amp; international privacy standards.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  1. Information We Collect
                </h3>
                <p>
                  When you register and use WaveLink, we store your profile information (display name, email address, profile photo), published content (waves, comments, Sparks, video reels), and transaction reference IDs for Mobile Money upgrades.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  2. Private Chats &amp; Member-Only Access
                </h3>
                <p>
                  Direct messages and group conversations are strictly readable only by their members. Our Firebase Security Rules enforce participant checks so no outside account can read your private conversations.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  3. Zero Sale of Personal Information
                </h3>
                <p>
                  WaveLink never sells, rents, or shares your personal data with data brokers or advertisers.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  4. Delete My Account Anytime
                </h3>
                <p>
                  You are in full control of your data. You can delete any post or comment at any time, or use the <strong>Delete My Account</strong> button in Settings → Password &amp; Security to permanently remove your profile, posts, and sparks.
                </p>
              </section>
            </div>
          )}

          {activeDoc === 'terms' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#F0FDFA] border border-[#0D9488]/20 text-[#0F766E] text-xs font-medium flex items-center gap-2.5">
                <FileText size={16} className="text-[#0D9488] shrink-0" />
                <span>Effective Date: 2026. Friendly rules that keep WaveLink welcoming for everyone.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2563EB]" />
                  1. Community Standards &amp; Acceptable Use
                </h3>
                <p>
                  WaveLink is dedicated to positive creative expression. Harassment, hate speech, impersonation, or scams are not allowed. You can report or block any user or post with one tap.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2563EB]" />
                  2. Content Ownership &amp; Intellectual Property
                </h3>
                <p>
                  You own the photos, videos, Sparks, and music mixes you create and share on WaveLink. By posting publicly, you allow WaveLink to display your content in the community feed and reels.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2563EB]" />
                  3. Creator Tipping &amp; Platform Fees
                </h3>
                <p>
                  Supporters can send tips to creators via Mobile Money. 90% goes to the creator and a transparent 10% platform maintenance fee covers gateway and server costs.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2563EB]" />
                  4. Account Governance &amp; Audit Logs
                </h3>
                <p>
                  Every moderation action (warnings, bans, role changes, and verifications) is recorded in a tamper-resistant Admin Audit Log.
                </p>
              </section>
            </div>
          )}

          {activeDoc === 'security' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-[#1E40AF] text-xs font-medium flex items-center gap-2.5">
                <ShieldCheck size={16} className="text-[#2563EB] shrink-0" />
                <span>How we protect your WaveLink account, chats, and payments every day.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  1. Never Share Your Password, PIN, or OTP
                </h3>
                <p>
                  WaveLink admins and our automated <strong>WaveLink Support</strong> bot will <strong>NEVER</strong> ask for your password, Mobile Money PIN, OTP code, or card details.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  2. Strong Passwords, Email Verification &amp; Login Lockout
                </h3>
                <p>
                  Accounts require strong passwords (8+ characters with letters and numbers), support email verification and instant password reset emails, and automatically lock out repeated failed login attempts to stop brute-force bots.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  3. XSS Content Sanitization &amp; Server-Verified Uploads
                </h3>
                <p>
                  All posts, comments, bios, and chat messages are sanitized against HTML/script injection. Uploaded media files are checked for safe MIME types and tier size limits (0–4 MB on Free, up to 100 MB on Pro) on both the app and server.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0D9488]" />
                  4. Server-Side Secrets &amp; Rate-Limited AI
                </h3>
                <p>
                  All API keys and payment credentials stay strictly on the backend server. AI and chat routes are rate-limited per user with daily credit caps and Firebase App Check protection.
                </p>
              </section>
            </div>
          )}

          {activeDoc === 'refund' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2.5">
                <RefreshCw size={16} className="text-emerald-600 shrink-0" />
                <span>Fair &amp; Transparent Billing for Mobile Money &amp; Subscriptions.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  1. WaveLink Pro Subscriptions (18,000 TZS / KES 900 / UGX 25,000 per mo)
                </h3>
                <p>
                  Pro memberships unlock 100MB video uploads (compared to 0 KB – 4 MB on Free), 1080p WebRTC calling, and an ad-free experience. Payments are explained for M-Pesa, Mixx by Yas (Tigo Pesa), and Airtel Money. If your wallet was charged multiple times due to a network glitch, or if features failed to activate, we issue a 100% refund within 48 business hours upon verification.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  2. Post Boosts (2,000 TZS / KES 100 / UGX 2,800)
                </h3>
                <p>
                  Post boosts take effect immediately upon transaction approval via M-Pesa, Mixx by Yas, or Airtel Money, elevating your post into the featured community spotlight. If an unexpected server outage prevents the boost from delivering impressions, your account receives full replacement boost credits.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  3. Creator Tips (M-Pesa, Mixx by Yas &amp; Airtel Money)
                </h3>
                <p>
                  Tips sent to creators via M-Pesa, Mixx by Yas, or Airtel Money are voluntary tokens of appreciation and are disbursed in near real-time. Once delivered to the creator&apos;s wallet, tips are non-refundable unless verified as unauthorized fraudulent activity.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-[#1C1917] text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  4. How to Request a Refund
                </h3>
                <p>
                  Message our <strong>WaveLink Support</strong> bot in Direct Messages or submit a ticket in the Support Desk with your M-Pesa, Mixx by Yas, or Airtel Money transaction reference ID. A human administrator will follow up within 24 hours.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[#FAF7F2] flex items-center justify-between">
          <span className="text-xs font-medium text-[#57534E]">Questions? Message WaveLink Support in Chats</span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-bold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const LegalFooter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [modalState, setModalState] = useState<{ isOpen: boolean; doc: LegalDocType }>({
    isOpen: false,
    doc: 'privacy'
  });

  const openDoc = (doc: LegalDocType) => {
    setModalState({ isOpen: true, doc });
  };

  return (
    <>
      <footer className={`w-full py-6 px-4 border-t border-[var(--border-subtle)] text-xs text-[#57534E] transition-colors ${className}`}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white">
              <Waves size={14} />
            </div>
            <span className="font-bold text-[#1C1917]">WaveLink</span>
            <span className="text-[11px] font-bold text-[#57534E]">• Empowering African Creators</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-center font-medium">
            <button
              onClick={() => openDoc('privacy')}
              className="hover:text-[#2563EB] transition hover:underline"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              onClick={() => openDoc('terms')}
              className="hover:text-[#2563EB] transition hover:underline"
            >
              Terms of Service
            </button>
            <span>•</span>
            <button
              onClick={() => openDoc('security')}
              className="hover:text-[#2563EB] transition hover:underline"
            >
              Security
            </button>
            <span>•</span>
            <button
              onClick={() => openDoc('refund')}
              className="hover:text-[#2563EB] transition hover:underline"
            >
              Refund Policy
            </button>
          </div>
        </div>
      </footer>

      <LegalModal
        isOpen={modalState.isOpen}
        initialDoc={modalState.doc}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
