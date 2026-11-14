import { useEffect, useId } from 'react';

const activeLocks = new Set<string>();

function syncSheetLockDom() {
  if (typeof document === 'undefined') return;
  const isOpen = activeLocks.size > 0;
  if (isOpen) {
    document.documentElement.setAttribute('data-bottom-sheet-open', 'true');
  } else {
    document.documentElement.removeAttribute('data-bottom-sheet-open');
  }
  window.dispatchEvent(
    new CustomEvent('wavelink:bottom-sheet-state', {
      detail: { open: isOpen, count: activeLocks.size },
    })
  );
}

export function acquireSheetLock(lockId: string): () => void {
  activeLocks.add(lockId);
  syncSheetLockDom();
  return () => {
    activeLocks.delete(lockId);
    syncSheetLockDom();
  };
}

/**
 * Coordinates mobile bottom navigation and floating action button visibility
 * whenever a bottom sheet, modal, or full-screen editor is active.
 */
export function useBottomSheetLock(isOpen: boolean, customId?: string) {
  const autoId = useId();
  const lockId = customId ? `${customId}:${autoId}` : `sheet:${autoId}`;

  useEffect(() => {
    if (!isOpen) return;
    const release = acquireSheetLock(lockId);
    return () => {
      release();
    };
  }, [isOpen, lockId]);
}
