import React, { useState } from 'react';
import { ShieldCheck, FileText, RefreshCw, X, HelpCircle, CheckCircle2, Waves, Lock } from 'lucide-react';

export type LegalDocType = 'privacy' | 'terms' | 'refund';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0f1422] border border-purple-500/30 text-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-950/40 to-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-600/30 text-purple-300">
              <Waves size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-white">WaveLink Legal Center</h2>
              <p className="text-xs text-purple-300/80">Compliance, Transparency &amp; Privacy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-slate-900/60 px-4 pt-2 gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveDoc('privacy')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'privacy'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldCheck size={15} />
            <span>Privacy Policy</span>
          </button>
          <button
            onClick={() => setActiveDoc('terms')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'terms'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileText size={15} />
            <span>Terms of Service</span>
          </button>
          <button
            onClick={() => setActiveDoc('refund')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeDoc === 'refund'
                ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <RefreshCw size={15} />
            <span>Refund Policy</span>
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {activeDoc === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/20 text-purple-200 text-xs flex items-center gap-2.5">
                <Lock size={16} className="text-purple-400 shrink-0" />
                <span>Last Updated: October 2026. Compliant with Tanzania Data Protection Act &amp; international privacy standards.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  1. Information We Collect
                </h3>
                <p>
                  When you register and use WaveLink, we collect your profile information (display name, email address, profile photo), published content (waves, comments, images, video reels), and transactional receipts for mobile payments.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  2. Chat &amp; Communication Privacy
                </h3>
                <p>
                  Direct peer-to-peer messages and WebRTC audio/video calls are private between conversation participants. We enforce role-based Firestore security rules that prevent unauthorized third parties from querying or accessing private user chats.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  3. Zero Sale of Personal Information
                </h3>
                <p>
                  WaveLink never sells, rents, or licenses your personal data to external marketing brokers. Native ads on WaveLink are curated brand placements, and user data is never shared with advertisers.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  4. Data Security &amp; Deletion Rights
                </h3>
                <p>
                  All database records are protected by Google Cloud infrastructure with encrypted data in transit and at rest. You retain full rights to delete your posts, update profile settings, or request permanent account erasure via the Helpdesk.
                </p>
              </section>
            </div>
          )}

          {activeDoc === 'terms' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-200 text-xs flex items-center gap-2.5">
                <FileText size={16} className="text-indigo-400 shrink-0" />
                <span>Effective Date: 2026. By accessing WaveLink, you agree to abide by these Terms of Service.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-indigo-400" />
                  1. Community Standards &amp; Acceptable Use
                </h3>
                <p>
                  WaveLink is dedicated to positive creative expression. Users must not publish defamatory, abusive, fraudulent, or harassing content. Impersonation of other creators, hate speech, or automated bot spam will lead to immediate account suspension.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-indigo-400" />
                  2. Content Ownership &amp; Intellectual Property
                </h3>
                <p>
                  You own the videos, music remixes, and graphics you create using Wave Studio. By posting publicly, you grant WaveLink a non-exclusive license to display your media to other users in the global feed and explore reels.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-indigo-400" />
                  3. Creator Tipping &amp; Platform Fees
                </h3>
                <p>
                  Fans can send instant tips to creators via Airtel Money and AzamPay. A transparent 10% platform maintenance fee is deducted to cover network gateway costs and server infrastructure. The remaining 90% is credited directly to the creator.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-indigo-400" />
                  4. Account Suspension &amp; Governance
                </h3>
                <p>
                  WaveLink administrators and moderators maintain active moderation queues. Accounts flagged for egregious violations may receive warning banners or temporary/permanent bans.
                </p>
              </section>
            </div>
          )}

          {activeDoc === 'refund' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-200 text-xs flex items-center gap-2.5">
                <RefreshCw size={16} className="text-emerald-400 shrink-0" />
                <span>Fair &amp; Transparent Billing for Mobile Money &amp; Subscriptions.</span>
              </div>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  1. WaveLink Pro Subscriptions (18,000 TZS / mo)
                </h3>
                <p>
                  Pro memberships unlock 500MB media uploads, 1080p WebRTC calling, and ad-free experience. If your Airtel Money or AzamPay wallet was charged multiple times due to a network glitch, or if features failed to activate, we issue a 100% refund within 48 business hours upon verification.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  2. Post Boosts (2,000 TZS)
                </h3>
                <p>
                  Post boosts take effect immediately upon transaction approval, elevating your post into the featured community spotlight. If an unexpected server outage prevents the boost from delivering impressions, your account receives full replacement boost credits.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  3. Creator Tips
                </h3>
                <p>
                  Tips sent to creators are voluntary tokens of appreciation and are disbursed in near real-time. Once delivered to the creator&apos;s wallet, tips are non-refundable unless verified as unauthorized fraudulent activity.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  4. How to Request a Refund
                </h3>
                <p>
                  Submit your Mobile Money transaction reference ID and phone number through the in-app Support Desk (under Settings) or email support@wavelink.tz. Our team reviews all requests within 24 hours.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Questions? Reach out to support@wavelink.tz</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition"
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
      <footer className={`w-full py-6 px-4 border-t border-gray-200/80 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400 transition-colors ${className}`}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-gradient-to-tr from-purple-600 to-pink-500 text-white">
              <Waves size={14} />
            </div>
            <span className="font-bold text-gray-700 dark:text-gray-300">WaveLink</span>
            <span className="text-[11px]">© 2026. Empowering East African Creators.</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-center font-medium">
            <button
              onClick={() => openDoc('privacy')}
              className="hover:text-purple-600 dark:hover:text-purple-400 transition hover:underline"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              onClick={() => openDoc('terms')}
              className="hover:text-purple-600 dark:hover:text-purple-400 transition hover:underline"
            >
              Terms of Service
            </button>
            <span>•</span>
            <button
              onClick={() => openDoc('refund')}
              className="hover:text-purple-600 dark:hover:text-purple-400 transition hover:underline"
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
