import React, { useState, useRef } from 'react';
import { APPEARANCE_THEMES, useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { AppearanceTheme } from '../types';
import { validateCustomBackgroundFile } from '../utils/mediaStorage';
import { CustomBackgroundModal } from './CustomBackgroundModal';
import {
  Check,
  Sparkles,
  Eye,
  RotateCcw,
  Zap,
  AlertCircle,
  Image as ImageIcon,
  Lock,
  Upload,
  Trash2,
  Sliders,
  Crown,
  X,
  WifiOff
} from 'lucide-react';

interface ThemePickerPanelProps {
  compact?: boolean;
  onThemeSaved?: (theme: AppearanceTheme) => void;
  onOpenUpgradePro?: () => void;
}

export const ThemePickerPanel: React.FC<ThemePickerPanelProps> = ({
  compact = false,
  onThemeSaved,
  onOpenUpgradePro
}) => {
  const {
    appearanceTheme,
    previewTheme,
    activeTheme,
    isSavingTheme,
    themeSaveError,
    setPreviewTheme,
    saveAppearanceTheme,
    retrySaveTheme,
    clearThemeSaveError,
    isLiteMode,
    toggleLiteMode,
    customBackground,
    customBackgroundHistory,
    isCustomBackgroundActive,
    isDataSaverBlockingCustomBg,
    customBgLoadFailed,
    isSavingCustomBg,
    selectCustomBackgroundFromHistory,
    removeCustomBackground
  } = useTheme();
  const { language } = useLanguage();
  const { showGlobalToast, isProEffective } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [showProUpgradePrompt, setShowProUpgradePrompt] = useState(false);
  const [customBgError, setCustomBgError] = useState<string | null>(null);
  const [selectedCustomFile, setSelectedCustomFile] = useState<File | null>(null);
  const [isCustomBgModalOpen, setIsCustomBgModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentMeta =
    APPEARANCE_THEMES.find((t) => t.id === activeTheme) || APPEARANCE_THEMES[0];
  const hasUnsavedPreview = Boolean(previewTheme && previewTheme !== appearanceTheme);
  const savingBusy = isSaving || isSavingTheme;

  const handlePreview = (themeId: AppearanceTheme) => {
    setSavedNotice(null);
    clearThemeSaveError();
    if (themeId === appearanceTheme) {
      setPreviewTheme(null);
    } else {
      setPreviewTheme(themeId);
    }
  };

  const handleSaveTheme = async (themeToSave?: AppearanceTheme) => {
    const target = themeToSave || activeTheme;
    setIsSaving(true);
    setSavedNotice(null);
    try {
      const result = await saveAppearanceTheme(target);
      if (result.success) {
        const pickedMeta = APPEARANCE_THEMES.find((t) => t.id === target);
        const themeLabel =
          language === 'sw' ? pickedMeta?.nameSw || pickedMeta?.name : pickedMeta?.name;
        const msg =
          language === 'sw'
            ? `Muonekano wa "${themeLabel}" umehifadhiwa kwenye akaunti yako! ✨`
            : `"${themeLabel}" theme saved to your profile! ✨`;
        setSavedNotice(msg);
        showGlobalToast?.(msg);
        if (onThemeSaved) {
          onThemeSaved(target);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelPreview = () => {
    setPreviewTheme(null);
    setSavedNotice(null);
    clearThemeSaveError();
  };

  return (
    <div className="space-y-4">
      {/* Live Preview Header Card */}
      <div
        className="rounded-3xl p-4 sm:p-5 border transition-all duration-300 shadow-sm relative overflow-hidden"
        style={{
          background: currentMeta.previewGradient,
          borderColor: currentMeta.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.1)',
          color: currentMeta.previewText
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-sm shrink-0"
              style={{
                backgroundColor: currentMeta.previewCard,
                border: `2px solid ${currentMeta.previewAccent}`
              }}
            >
              {currentMeta.emoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-extrabold tracking-tight">
                  {language === 'sw' ? currentMeta.nameSw : currentMeta.name}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                  style={{
                    backgroundColor: currentMeta.previewAccent,
                    color: '#FFFFFF'
                  }}
                >
                  {hasUnsavedPreview
                    ? language === 'sw'
                      ? 'Hakikisho la Moja kwa Moja'
                      : 'Live Preview'
                    : language === 'sw'
                    ? 'Inatumika Sasa'
                    : 'Active'}
                </span>
              </div>
              <p
                className="text-xs mt-0.5 line-clamp-2 opacity-90"
                style={{ color: currentMeta.previewText }}
              >
                {language === 'sw' ? currentMeta.descriptionSw : currentMeta.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {hasUnsavedPreview && (
              <button
                type="button"
                onClick={handleCancelPreview}
                className="min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                style={{
                  backgroundColor: currentMeta.previewCard,
                  color: currentMeta.previewText,
                  border: '1px solid rgba(148,163,184,0.35)'
                }}
              >
                <RotateCcw size={14} />
                <span>{language === 'sw' ? 'Rudisha' : 'Reset'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveTheme(activeTheme)}
              className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-extrabold text-white flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer disabled:opacity-60"
              style={{
                backgroundColor: currentMeta.previewAccent
              }}
            >
              <Sparkles size={14} />
              <span>
                {isSaving
                  ? language === 'sw'
                    ? 'Inahifadhi...'
                    : 'Saving...'
                  : hasUnsavedPreview
                  ? language === 'sw'
                    ? 'Hifadhi Muonekano Huu'
                    : 'Save This Theme'
                  : language === 'sw'
                  ? ' Imehifadhiwa'
                  : 'Saved to Profile'}
              </span>
            </button>
          </div>
        </div>

        {/* Mini Glassy Card Sample Inside Live Preview */}
        {!compact && (
          <div
            className="mt-3.5 p-3 rounded-2xl flex items-center justify-between gap-3 backdrop-blur-md transition-all"
            style={{
              backgroundColor: currentMeta.isDark
                ? 'rgba(15, 23, 42, 0.72)'
                : 'rgba(255, 255, 255, 0.82)',
              border: currentMeta.isDark
                ? '1px solid rgba(255,255,255,0.12)'
                : '1px solid rgba(255,255,255,0.7)',
              color: currentMeta.previewText
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Eye size={15} style={{ color: currentMeta.previewAccent }} className="shrink-0" />
              <span className="text-xs font-bold truncate">
                {language === 'sw'
                  ? 'Bonyeza muonekano wowote hapa chini uone mabadiliko kabla ya kuhifadhi'
                  : 'Tap any theme below to preview live across the app before saving'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: currentMeta.previewAccent }}
              />
              <span
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: currentMeta.previewSecondary }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lite Mode Toggle in Settings > Appearance (Disables glass blur and animations for low-end Android phones) */}
      <div className="wavelink-glass-post-card rounded-3xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-[#0D9488] flex items-center justify-center shrink-0">
            <Zap size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)]">
                {language === 'sw' ? 'Lite mode (Simu nyepesi)' : 'Lite mode'}
              </span>
              {isLiteMode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#0D9488] text-white">
                  {language === 'sw' ? 'Imewashwa' : 'On'}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {language === 'sw'
                ? 'Huzima blur ya kioo na miondoko ili kuokoa betri na kuongeza kasi kwenye simu za kawaida.'
                : 'Disables glass blur and animations for faster scrolling on low-end phones.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isLiteMode}
          aria-label="Toggle Lite mode"
          onClick={() => {
            toggleLiteMode();
            const nextState = !isLiteMode;
            showGlobalToast?.(
              nextState
                ? language === 'sw'
                  ? 'Lite mode imewashwa ⚡'
                  : 'Lite mode enabled — blur & animations turned off ⚡'
                : language === 'sw'
                ? 'Lite mode imezimwa ✨'
                : 'Lite mode disabled — glass blur & animations restored ✨'
            );
          }}
          className={`relative w-13 h-7 min-w-[52px] rounded-full transition-colors cursor-pointer shrink-0 p-0.5 ${
            isLiteMode ? 'bg-[#0D9488]' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`block w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              isLiteMode ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {themeSaveError && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-3 flex-wrap"
        >
          <span className="flex items-start gap-2 min-w-0 flex-1">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
            <span className="break-words">{themeSaveError}</span>
          </span>
          <button
            type="button"
            disabled={savingBusy}
            onClick={() => void retrySaveTheme()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw size={13} />
            <span>{language === 'sw' ? 'Jaribu Tena' : 'Retry'}</span>
          </button>
        </div>
      )}

      {savedNotice && !themeSaveError && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Check size={15} className="shrink-0" />
            <span>{savedNotice}</span>
          </span>
        </div>
      )}

      {/* Grid of 9 Themes (Anyone can pick any theme) */}
      <div className={`grid gap-2.5 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {APPEARANCE_THEMES.map((item) => {
          const isCurrentActive = activeTheme === item.id;
          const isSaved = appearanceTheme === item.id;

          return (
            <div
              key={item.id}
              onClick={() => handlePreview(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePreview(item.id);
                }
              }}
              className={`min-h-[76px] p-3.5 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 relative overflow-hidden group ${
                isCurrentActive
                  ? 'ring-2 ring-[var(--accent-primary)] border-[var(--accent-primary)] shadow-md scale-[1.01]'
                  : 'border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/50'
              }`}
              style={{
                background: item.previewGradient,
                color: item.previewText
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-9 h-9 rounded-2xl flex items-center justify-center text-base shadow-xs shrink-0"
                    style={{
                      backgroundColor: item.previewCard,
                      border: `1.5px solid ${item.previewAccent}`
                    }}
                  >
                    {item.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-xs sm:text-sm font-extrabold truncate"
                        style={{ color: item.previewText }}
                      >
                        {language === 'sw' ? item.nameSw : item.name}
                      </span>
                      {item.id === 'ocean' && (
                        <span
                          className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase"
                          style={{
                            backgroundColor: item.previewAccent,
                            color: '#FFFFFF'
                          }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider opacity-75 block"
                      style={{ color: item.previewText }}
                    >
                      {item.isDark
                        ? language === 'sw'
                          ? 'Giza • Dark'
                          : 'Dark Theme'
                        : language === 'sw'
                        ? 'Angavu • Light'
                        : 'Light Theme'}
                    </span>
                  </div>
                </div>

                {/* Color Swatch Dots & Checkmark */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCurrentActive ? (
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: item.previewAccent }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  ) : (
                    <div className="flex items-center -space-x-1">
                      <span
                        className="w-4 h-4 rounded-full border border-white/60 shadow-2xs"
                        style={{ backgroundColor: item.previewAccent }}
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-white/60 shadow-2xs"
                        style={{ backgroundColor: item.previewSecondary }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {!compact && (
                <p
                  className="text-[11px] leading-snug line-clamp-2 opacity-85"
                  style={{ color: item.previewText }}
                >
                  {language === 'sw' ? item.descriptionSw : item.description}
                </p>
              )}

              {/* Quick Apply Pill when previewing */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: item.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.07)',
                    color: item.previewText
                  }}
                >
                  {isSaved
                    ? language === 'sw'
                      ? '✓ Chaguo Lako'
                      : '✓ Saved'
                    : isCurrentActive
                    ? language === 'sw'
                      ? 'Inahakikiwa...'
                      : 'Previewing...'
                    : language === 'sw'
                    ? 'Gusa Kuhakiki'
                    : 'Tap to Preview'}
                </span>

                {isCurrentActive && !isSaved && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSaveTheme(item.id);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold text-white shadow-xs transition active:scale-95 cursor-pointer"
                    style={{ backgroundColor: item.previewAccent }}
                  >
                    {language === 'sw' ? 'Hifadhi' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom App Background Card (Pro Feature) */}
      <div className="wavelink-glass-post-card rounded-3xl p-4 sm:p-5 border border-[var(--border-hairline)] space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <ImageIcon size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                  {language === 'sw' ? 'Mandhari yako maalum' : 'Custom background'}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/18 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                  {!isProEffective && <Lock size={10} />}
                  <span>Pro</span>
                </span>
                {isProEffective && isCustomBackgroundActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                    {language === 'sw' ? 'Inatumika' : 'Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {language === 'sw'
                  ? 'Weka picha yako mwenyewe nyuma ya WaveLink (JPG, PNG au WebP hadi MB 10).'
                  : 'Use your own photo behind the app with live darken, blur & auto text contrast.'}
              </p>
            </div>
          </div>

          {!isProEffective ? (
            <button
              type="button"
              onClick={() => setShowProUpgradePrompt(true)}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold inline-flex items-center gap-2 hover:border-amber-500/50 transition active:scale-95 cursor-pointer shrink-0"
            >
              <Lock size={14} className="text-amber-500" />
              <span>{language === 'sw' ? 'Fungua Pro' : 'Unlock with Pro'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] || null;
                  e.target.value = '';
                  if (!chosen) return;
                  const validation = validateCustomBackgroundFile(chosen);
                  if (!validation.valid) {
                    setCustomBgError(
                      validation.error || 'Please choose a JPG, PNG, or WebP image under 10 MB.'
                    );
                    return;
                  }
                  setCustomBgError(null);
                  setSelectedCustomFile(chosen);
                  setIsCustomBgModalOpen(true);
                }}
              />

              <button
                type="button"
                disabled={isSavingCustomBg}
                onClick={() => {
                  setCustomBgError(null);
                  fileInputRef.current?.click();
                }}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Upload size={14} />
                <span>{language === 'sw' ? 'Pakia picha' : 'Upload photo'}</span>
              </button>

              {customBackground?.url && (
                <>
                  <button
                    type="button"
                    disabled={isSavingCustomBg}
                    onClick={() => {
                      setCustomBgError(null);
                      setSelectedCustomFile(null);
                      setIsCustomBgModalOpen(true);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-extrabold inline-flex items-center gap-1.5 hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                  >
                    <Sliders size={14} className="text-[var(--accent-primary)]" />
                    <span>{language === 'sw' ? 'Hariri' : 'Edit'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingCustomBg}
                    onClick={async () => {
                      setCustomBgError(null);
                      const res = await removeCustomBackground();
                      if (!res.success && res.error) {
                        setCustomBgError(res.error);
                      } else {
                        showGlobalToast?.(
                          language === 'sw'
                            ? 'Umerudi kwenye mandhari ya kawaida.'
                            : 'Returned to your normal theme.'
                        );
                      }
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-extrabold inline-flex items-center gap-1.5 hover:bg-rose-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    <span>{language === 'sw' ? 'Ondoa' : 'Remove'}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Non-Pro clickable preview bar */}
        {!isProEffective && (
          <button
            type="button"
            onClick={() => setShowProUpgradePrompt(true)}
            className="w-full min-h-[56px] p-3 rounded-2xl bg-[var(--bg-subtle)] border border-dashed border-[var(--border-hairline)] flex items-center justify-between gap-3 text-left hover:border-amber-500/50 transition cursor-pointer"
          >
            <span className="flex items-center gap-2.5 text-xs font-bold text-[var(--text-secondary)]">
              <Lock size={15} className="text-amber-500 shrink-0" />
              <span>
                {language === 'sw'
                  ? 'Gusa hapa kupata Pro na kutumia picha yako mwenyewe kama mandhari.'
                  : 'Tap to learn about setting your own custom photo background with WaveLink Pro.'}
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-extrabold uppercase shrink-0">
              Pro
            </span>
          </button>
        )}

        {/* Validation / Upload Error */}
        {isProEffective && customBgError && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle size={15} className="shrink-0 text-rose-500" />
            <span>{customBgError}</span>
          </div>
        )}

        {/* Data Saver Notice */}
        {isProEffective && isDataSaverBlockingCustomBg && (
          <div className="p-3 rounded-2xl bg-amber-500/12 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
            <WifiOff size={15} className="shrink-0 text-amber-500" />
            <span>
              {language === 'sw'
                ? 'Data Saver imewashwa — tunatumia mandhari ya kawaida kuokoa bando.'
                : 'Data Saver is on — showing your normal theme instead of downloading the background photo.'}
            </span>
          </div>
        )}

        {/* Fallback notice if image failed to load */}
        {isProEffective && customBgLoadFailed && (
          <div className="p-3 rounded-2xl bg-amber-500/12 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-amber-500" />
            <span>
              Could not load your custom background photo, so your normal theme is displayed.
            </span>
          </div>
        )}

        {/* Quick-Switch Gallery of Last 5 Uploaded Backgrounds (Pro only) */}
        {isProEffective && customBackgroundHistory.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
              <span>
                {language === 'sw'
                  ? `Zilizopita (${customBackgroundHistory.length}/5)`
                  : `Recent Uploads (${customBackgroundHistory.length}/5)`}
              </span>
              <span className="normal-case font-semibold">
                {language === 'sw' ? 'Gusa kubadilisha haraka' : 'Tap to switch quickly'}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {customBackgroundHistory.slice(0, 5).map((item) => {
                const isSelected = customBackground?.url === item.url;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isSavingCustomBg}
                    onClick={async () => {
                      setCustomBgError(null);
                      const res = await selectCustomBackgroundFromHistory(item);
                      if (!res.success && res.error) {
                        setCustomBgError(res.error);
                      } else {
                        showGlobalToast?.(
                          language === 'sw'
                            ? 'Mandhari imebadilishwa! ✨'
                            : 'Custom background switched! ✨'
                        );
                      }
                    }}
                    aria-label="Select recent custom background"
                    className={`relative min-h-[52px] aspect-[9/12] rounded-2xl overflow-hidden border transition cursor-pointer disabled:opacity-50 ${
                      isSelected
                        ? 'ring-2 ring-[var(--accent-primary)] border-[var(--accent-primary)] scale-[1.02]'
                        : 'border-[var(--border-hairline)] hover:opacity-90'
                    }`}
                  >
                    <img
                      src={item.mobileUrl || item.url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: `rgba(0, 0, 0, ${item.darken / 100})` }}
                    />
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shadow-sm">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Friendly Upgrade Prompt Modal for Non-Pro Users */}
      {showProUpgradePrompt && !isProEffective && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Custom backgrounds are a Pro feature"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
          onClick={() => setShowProUpgradePrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-2xl p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Crown size={22} />
              </div>
              <button
                type="button"
                onClick={() => setShowProUpgradePrompt(false)}
                aria-label="Close upgrade prompt"
                className="min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base sm:text-lg font-extrabold">
                {language === 'sw'
                  ? 'Mandhari maalum ni kipengele cha Pro'
                  : 'Custom backgrounds are a Pro feature'}
              </h4>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {language === 'sw'
                  ? 'Jiunge na WaveLink Pro ili kupakia picha yako mwenyewe, kurekebisha ukungu na giza, na kuhifadhi mandhari 5 za mwisho.'
                  : 'Upgrade to WaveLink Pro to upload your own background photo, adjust blur & darkness live, and save up to 5 recent backgrounds.'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowProUpgradePrompt(false)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-extrabold cursor-pointer"
              >
                {language === 'sw' ? 'Baadaye' : 'Not now'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProUpgradePrompt(false);
                  if (onOpenUpgradePro) {
                    onOpenUpgradePro();
                  } else {
                    window.dispatchEvent(
                      new CustomEvent('wavelink:navigate-tab', { detail: 'monetization' })
                    );
                  }
                }}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-extrabold shadow-md hover:opacity-95 cursor-pointer"
              >
                {language === 'sw' ? 'Pata Pro' : 'Upgrade to Pro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro Crop & Edit Modal */}
      {isProEffective && isCustomBgModalOpen && (
        <CustomBackgroundModal
          isOpen={isCustomBgModalOpen}
          file={selectedCustomFile}
          existingBg={selectedCustomFile ? null : customBackground}
          language={language}
          onClose={() => {
            setIsCustomBgModalOpen(false);
            setSelectedCustomFile(null);
          }}
        />
      )}
    </div>
  );
};
