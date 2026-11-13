import React, { useEffect, useRef, useState } from 'react';
import {
  AppearanceTheme,
  ChatThemeId,
  ChatThemePreference
} from '../types';
import {
  CHAT_ACCENT_PALETTE,
  CHAT_THEME_OPTIONS,
  ChatThemeBadgeIcon,
  getChatThemeDisplayName
} from '../utils/chatThemes';
import {
  Check,
  ImagePlus,
  Lock,
  Palette,
  RotateCcw,
  Share2,
  Sliders,
  Trash2,
  Users,
  X
} from 'lucide-react';

interface ChatThemePickerModalProps {
  isOpen: boolean;
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  isGroupAdmin: boolean;
  canShare: boolean;
  isPro: boolean;
  initialPreference: ChatThemePreference | null;
  appActiveTheme: AppearanceTheme;
  onPreviewChange: (draft: ChatThemePreference | null) => void;
  onSave: (params: {
    preference: ChatThemePreference;
    shareWithOthers: boolean;
    customPhotoFile: File | null;
  }) => Promise<void>;
  onResetToDefault: () => Promise<void>;
  onOpenProUpgrade?: () => void;
  onClose: () => void;
}

export const ChatThemePickerModal: React.FC<ChatThemePickerModalProps> = ({
  isOpen,
  conversationId,
  conversationTitle,
  isGroup,
  isGroupAdmin,
  canShare,
  isPro,
  initialPreference,
  onPreviewChange,
  onSave,
  onResetToDefault,
  onOpenProUpgrade,
  onClose
}) => {
  const [selectedThemeId, setSelectedThemeId] = useState<ChatThemeId>(
    initialPreference?.themeId || 'default'
  );
  const [selectedAccent, setSelectedAccent] = useState<string>(
    initialPreference?.accentColor || ''
  );
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string>(
    initialPreference?.customBgUrl || ''
  );
  const [customPhotoFile, setCustomPhotoFile] = useState<File | null>(null);
  const [bgDarkness, setBgDarkness] = useState<number>(
    typeof initialPreference?.bgDarkness === 'number'
      ? initialPreference.bgDarkness
      : 35
  );
  const [shareWithOthers, setShareWithOthers] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localBlobUrlRef = useRef<string | null>(null);

  const revokeLocalPreviewUrl = () => {
    if (localBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(localBlobUrlRef.current);
      } catch {
        // ignore
      }
      localBlobUrlRef.current = null;
    }
  };

  // Sync draft state when modal opens or conversation changes
  useEffect(() => {
    if (!isOpen) {
      revokeLocalPreviewUrl();
      return;
    }
    setSelectedThemeId(initialPreference?.themeId || 'default');
    setSelectedAccent(initialPreference?.accentColor || '');
    setCustomPhotoUrl(initialPreference?.customBgUrl || '');
    setCustomPhotoFile(null);
    setBgDarkness(
      typeof initialPreference?.bgDarkness === 'number'
        ? initialPreference.bgDarkness
        : 35
    );
    setShareWithOthers(false);
    setErrorText(null);
  }, [isOpen, conversationId, initialPreference]);

  useEffect(() => {
    return () => {
      revokeLocalPreviewUrl();
    };
  }, []);

  // Push live preview back to active conversation whenever draft changes
  useEffect(() => {
    if (!isOpen) return;
    if (
      selectedThemeId === 'default' &&
      !selectedAccent &&
      !customPhotoUrl
    ) {
      onPreviewChange(null);
      return;
    }
    onPreviewChange({
      themeId: selectedThemeId,
      accentColor: selectedAccent || undefined,
      customBgUrl: customPhotoUrl || undefined,
      bgDarkness: customPhotoUrl ? bgDarkness : undefined
    });
  }, [
    isOpen,
    selectedThemeId,
    selectedAccent,
    customPhotoUrl,
    bgDarkness,
    onPreviewChange
  ]);

  if (!isOpen) return null;

  const canShowShareToggle = canShare && (!isGroup || isGroupAdmin);
  const shortTargetName = conversationTitle.split(' ')[0] || conversationTitle;

  const handleSelectPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      setErrorText('Please choose an image file (JPG, PNG, or WebP).');
      return;
    }
    setErrorText(null);
    revokeLocalPreviewUrl();
    const objectUrl = URL.createObjectURL(file);
    localBlobUrlRef.current = objectUrl;
    setCustomPhotoFile(file);
    setCustomPhotoUrl(objectUrl);
  };

  const handleRemovePhoto = () => {
    revokeLocalPreviewUrl();
    setCustomPhotoFile(null);
    setCustomPhotoUrl('');
  };

  const handleSaveClick = async () => {
    setErrorText(null);
    setIsSaving(true);
    try {
      await onSave({
        preference: {
          themeId: selectedThemeId,
          accentColor: selectedAccent || undefined,
          customBgUrl: customPhotoFile ? undefined : customPhotoUrl || undefined,
          bgDarkness: customPhotoUrl ? bgDarkness : undefined,
          updatedAt: new Date().toISOString()
        },
        shareWithOthers: canShowShareToggle ? shareWithOthers : false,
        customPhotoFile
      });
      revokeLocalPreviewUrl();
      onPreviewChange(null);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not save chat theme. Please try again.';
      setErrorText(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetClick = async () => {
    setErrorText(null);
    setIsSaving(true);
    try {
      revokeLocalPreviewUrl();
      await onResetToDefault();
      onPreviewChange(null);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not reset chat theme. Please try again.';
      setErrorText(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelClick = () => {
    revokeLocalPreviewUrl();
    onPreviewChange(null);
    onClose();
  };

  return (
    <div
      className="wavelink-chat-theme-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-theme-modal-title"
      onClick={handleCancelClick}
    >
      <div
        className="wavelink-chat-theme-sheet bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on phone bottom sheet */}
        <div className="md:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-[var(--border-hairline)]" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-xs"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              }}
            >
              <Palette size={17} />
            </div>
            <div className="min-w-0">
              <h3
                id="chat-theme-modal-title"
                className="font-extrabold text-sm sm:text-base text-[var(--text-primary)] truncate"
              >
                Chat Theme
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                Live preview behind • {conversationTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelClick}
            className="min-w-[44px] min-h-[44px] rounded-full hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Close chat theme picker"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-5">
          {errorText && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-rose-500/10 border border-rose-400/40 text-xs font-bold text-rose-600 dark:text-rose-300"
            >
              {errorText}
            </div>
          )}

          {/* 1. 13 Theme Cards Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                Background Theme
              </span>
              <span className="text-[11px] font-bold text-[var(--accent-primary)]">
                {getChatThemeDisplayName(selectedThemeId)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {CHAT_THEME_OPTIONS.map((opt) => {
                const isSelected = selectedThemeId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedThemeId(opt.id)}
                    className={`min-h-[76px] p-2 rounded-2xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer relative ${
                      isSelected
                        ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25 bg-[var(--bg-subtle)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50'
                    }`}
                  >
                    <div
                      className="w-full h-10 rounded-xl relative overflow-hidden border border-black/10 flex items-center justify-between px-2"
                      style={{
                        backgroundImage: opt.patternDataUri
                          ? `${opt.patternDataUri}, ${opt.previewGradient}`
                          : opt.previewGradient,
                        backgroundSize: opt.patternDataUri
                          ? '70px 70px, 100% 100%'
                          : '100% 100%'
                      }}
                    >
                      <span className="w-6 h-6 rounded-full bg-white/85 dark:bg-slate-900/80 shadow-xs flex items-center justify-center">
                        <ChatThemeBadgeIcon themeId={opt.id} size={13} />
                      </span>
                      <span
                        className="w-5 h-3 rounded-full shadow-2xs"
                        style={{
                          background: `linear-gradient(135deg, ${opt.defaultAccent}, ${opt.defaultSecondary})`
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1 min-w-0 px-0.5">
                      <span className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                        {opt.name}
                      </span>
                      {isSelected && (
                        <span
                          className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Row of 8 Bubble Accent Color Circles */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                Bubble Accent Color
              </span>
              {selectedAccent && (
                <button
                  type="button"
                  onClick={() => setSelectedAccent('')}
                  className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Use theme accent
                </button>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-1.5">
              {CHAT_ACCENT_PALETTE.map((swatch) => {
                const isSelected =
                  selectedAccent.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() =>
                      setSelectedAccent((prev) =>
                        prev.toLowerCase() === swatch.hex.toLowerCase() ? '' : swatch.hex
                      )
                    }
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer"
                    title={swatch.label}
                    aria-label={`Select ${swatch.label} bubble color`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-[var(--accent-primary)] ring-offset-[var(--bg-surface)] scale-110'
                          : 'ring-1 ring-black/15 hover:scale-105'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${swatch.hex}, ${swatch.secondaryHex})`
                      }}
                    >
                      {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Pro User Custom Photo Background + Darkening Slider */}
          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ImagePlus size={16} className="text-[var(--accent-primary)] shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-extrabold text-[var(--text-primary)] block truncate">
                    Custom Photo Background
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                    Pro perk • compressed under 400 KB
                  </span>
                </div>
              </div>

              {!isPro && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenProUpgrade) onOpenProUpgrade();
                  }}
                  className="min-h-[36px] px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/50 text-amber-600 dark:text-amber-300 text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Lock size={12} />
                  <span>Pro</span>
                </button>
              )}
            </div>

            {isPro ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelectPhoto}
                  className="hidden"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ImagePlus size={15} className="text-[var(--accent-primary)]" />
                    <span>{customPhotoUrl ? 'Change Photo' : 'Upload Background Photo'}</span>
                  </button>

                  {customPhotoUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="min-w-[44px] min-h-[44px] rounded-2xl bg-rose-500/10 border border-rose-400/30 text-rose-500 flex items-center justify-center shrink-0 cursor-pointer"
                      title="Remove custom photo"
                      aria-label="Remove custom photo"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {customPhotoUrl && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                      <span className="flex items-center gap-1.5">
                        <Sliders size={13} className="text-[var(--accent-primary)]" />
                        <span>Background Darkening</span>
                      </span>
                      <span className="font-mono tabular-nums text-[var(--accent-primary)]">
                        {bgDarkness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={85}
                      step={5}
                      value={bgDarkness}
                      onChange={(e) => setBgDarkness(Number(e.target.value))}
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                      aria-label="Background darkening percentage"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Upgrade to WaveLink Pro to upload your own background photo and adjust darkening for readability.
              </p>
            )}
          </div>

          {/* 4. Visibility / Sharing Toggle ("Only me" default) */}
          <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] block">
              Who Sees This Theme
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShareWithOthers(false)}
                className={`min-h-[44px] px-3 py-2 rounded-2xl border text-left text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                  !shareWithOthers
                    ? 'bg-[var(--bg-surface)] border-[var(--accent-primary)] text-[var(--text-primary)] ring-2 ring-[var(--accent-primary)]/20'
                    : 'bg-transparent border-[var(--border-hairline)] text-[var(--text-secondary)]'
                }`}
              >
                <Lock size={14} className="text-[var(--accent-primary)] shrink-0" />
                <span>Only me (Private)</span>
              </button>

              {canShowShareToggle && (
                <button
                  type="button"
                  onClick={() => setShareWithOthers(true)}
                  className={`min-h-[44px] px-3 py-2 rounded-2xl border text-left text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                    shareWithOthers
                      ? 'bg-[var(--bg-surface)] border-[var(--accent-primary)] text-[var(--text-primary)] ring-2 ring-[var(--accent-primary)]/20'
                      : 'bg-transparent border-[var(--border-hairline)] text-[var(--text-secondary)]'
                  }`}
                >
                  {isGroup ? (
                    <Users size={14} className="text-[var(--accent-primary)] shrink-0" />
                  ) : (
                    <Share2 size={14} className="text-[var(--accent-primary)] shrink-0" />
                  )}
                  <span className="truncate">
                    {isGroup ? 'Suggest for group' : `Share with ${shortTargetName}`}
                  </span>
                </button>
              )}
            </div>

            {shareWithOthers && canShowShareToggle && (
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {isGroup
                  ? 'Group members will see a prompt and can choose Accept or No thanks. It never applies automatically.'
                  : `${shortTargetName} will see a prompt to Accept or decline this theme on their screen.`}
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions: Reset to default, Cancel, Save */}
        <div className="px-4 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetClick}
            disabled={isSaving}
            className="min-h-[44px] px-3 py-2 rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reset to default</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isSaving}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving}
              className="min-h-[44px] px-5 py-2 rounded-2xl text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              }}
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
