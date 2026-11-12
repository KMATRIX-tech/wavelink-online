import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const SIMPLE_MODE_STORAGE_KEY = 'wavelink_simple_mode_v1';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  setSimpleMode: (enabled: boolean) => void;
  toggleSimpleMode: () => void;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

export function SimpleModeProvider({ children }: { children: React.ReactNode }) {
  const [isSimpleMode, setIsSimpleModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(SIMPLE_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isSimpleMode) {
      document.documentElement.setAttribute('data-simple-mode', 'true');
    } else {
      document.documentElement.removeAttribute('data-simple-mode');
    }
    try {
      localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, isSimpleMode ? 'true' : 'false');
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wavelink:simple-mode-changed', { detail: { enabled: isSimpleMode } })
      );
    }
  }, [isSimpleMode]);

  const setSimpleMode = useCallback((enabled: boolean) => {
    setIsSimpleModeState(enabled);
  }, []);

  const toggleSimpleMode = useCallback(() => {
    setIsSimpleModeState((prev) => !prev);
  }, []);

  return (
    <SimpleModeContext.Provider value={{ isSimpleMode, setSimpleMode, toggleSimpleMode }}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode(): SimpleModeContextType {
  const ctx = useContext(SimpleModeContext);
  if (!ctx) {
    return {
      isSimpleMode: false,
      setSimpleMode: () => {},
      toggleSimpleMode: () => {}
    };
  }
  return ctx;
}
