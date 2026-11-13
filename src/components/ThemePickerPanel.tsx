import React, { useState } from 'react';
import { APPEARANCE_THEMES, useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { AppearanceTheme } from '../types';
import { Check, Sparkles, Eye, RotateCcw, Zap, AlertCircle } from 'lucide-react';

interface ThemePickerPanelProps {
  compact?: boolean;
  onThemeSaved?: (theme: AppearanceTheme) => void;
}

export const ThemePickerPanel: React.FC<ThemePickerPanelProps> = ({
  compact = false,
  onThemeSaved
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
    toggleLiteMode
  } = useTheme();
  const { language } = useLanguage();
  const { showGlobalToast } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

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
    </div>
  );
};
