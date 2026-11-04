/**
 * Haptic Feedback Utility using the browser's Vibration API (navigator.vibrate).
 * Provides subtle physical feedback on button interactions and tab switches on mobile devices.
 */

export type HapticStyle = 'light' | 'tab' | 'medium' | 'success';

const HAPTIC_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 8,
  tab: 12,
  medium: 18,
  success: [10, 30, 15],
};

let lastHapticTimestamp = 0;
const MIN_HAPTIC_INTERVAL_MS = 45;

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-battery-saver') === 'true') {
    return false;
  }
  try {
    const stored = localStorage.getItem('wavelink_haptics_enabled');
    if (stored === 'false') return false;
  } catch {
    // ignore storage read issues
  }
  return true;
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('wavelink_haptics_enabled', enabled ? 'true' : 'false');
  } catch {
    // ignore storage write issues
  }
}

/**
 * Triggers a subtle vibration pattern if supported by the device/browser.
 * Includes a 45ms debounce window so explicit handlers and delegated listeners
 * never double-fire on a single tap.
 */
export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  if (!isHapticsEnabled()) {
    return;
  }

  const now = Date.now();
  if (now - lastHapticTimestamp < MIN_HAPTIC_INTERVAL_MS) {
    return;
  }
  lastHapticTimestamp = now;

  try {
    const pattern = HAPTIC_PATTERNS[style] ?? HAPTIC_PATTERNS.light;
    navigator.vibrate(pattern);
  } catch {
    // Silently ignore if browser blocks vibrate before user gesture or in unsupported contexts
  }
}
