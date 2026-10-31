import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types';

const ADSTERRA_SCRIPT_SRC = 'https://bicea.org/14/7e645d935c503875ebc92cbe20bfda35';
const ADSTERRA_SCRIPT_ID = 'adsterra-network-script';

/**
 * Universal Rule: Determine if Adsterra ads should be displayed to the current user
 * - HIDE all ads if user.isPro === true (paid Pro monthly plan)
 * - HIDE all ads if user has a Blue Star badge / verified by admin
 * - HIDE all ads if user.role === 'admin' | 'super_admin' | 'sub_admin' | isAdmin
 * - SHOW ads only to regular, non-paying (free) users
 */
export function shouldShowAds(
  userProfile: UserProfile | null,
  isAdmin: boolean,
  isVerified?: boolean
): boolean {
  if (!userProfile) return true; // Free guest / unauthenticated
  
  // 1. Paid Pro monthly plan -> HIDE ADS
  if (userProfile.isPro === true) return false;

  // 2. Blue Star verified badge -> HIDE ADS
  if (
    userProfile.hasBlueStar === true ||
    userProfile.isVerifiedByAdmin === true ||
    userProfile.proBadge === 'verified' ||
    Boolean(isVerified)
  ) {
    return false;
  }

  // 3. Admin / Moderator role -> HIDE ADS
  if (
    userProfile.role === 'super_admin' ||
    userProfile.role === 'sub_admin' ||
    Boolean(userProfile.isSubAdmin) ||
    isAdmin === true
  ) {
    return false;
  }

  // Regular, non-paying free user -> SHOW ADS
  return true;
}

/**
 * Global Adsterra Script & DOM Lifecycle Manager
 * Dynamically injects or purges the Adsterra script and ad containers in real-time
 * without requiring a manual page refresh when user upgrades to Pro.
 */
export const AdsterraManager: React.FC = () => {
  const { userProfile, isAdmin, isVerified } = useAuth();
  const showAds = shouldShowAds(userProfile, isAdmin, isVerified);

  useEffect(() => {
    if (showAds) {
      // 1. User is Free: Ensure Adsterra script is mounted and active
      let existingScript = document.getElementById(ADSTERRA_SCRIPT_ID) as HTMLScriptElement | null;
      if (!existingScript) {
        // Also check if index.html had a script with matching src
        const scripts = document.querySelectorAll(`script[src*="bicea.org"]`);
        if (scripts.length > 0) {
          existingScript = scripts[0] as HTMLScriptElement;
          existingScript.id = ADSTERRA_SCRIPT_ID;
        }
      }

      if (!existingScript) {
        const script = document.createElement('script');
        script.id = ADSTERRA_SCRIPT_ID;
        script.type = 'text/javascript';
        script.setAttribute('data-cfasync', 'false');
        script.src = ADSTERRA_SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
    } else {
      // 2. User is Pro / Blue Star / Admin: Instantly purge Adsterra script and all spawned ad nodes
      const existingScript = document.getElementById(ADSTERRA_SCRIPT_ID);
      if (existingScript) {
        existingScript.remove();
      }

      // Remove any loose script tags matching the ad provider
      const anyAdScripts = document.querySelectorAll(`script[src*="bicea.org"]`);
      anyAdScripts.forEach((s) => s.remove());

      // Remove any floating social bar elements, iframes, or popunder containers created by Adsterra
      const adElements = document.querySelectorAll(
        `[id*="adsterra"], [class*="adsterra"], [id*="bicea"], [class*="bicea"], div[style*="z-index: 999999"], div[style*="z-index: 2147483647"]`
      );
      adElements.forEach((el) => {
        try {
          el.remove();
        } catch (_) {}
      });
    }

    return () => {
      // Cleanup on unmount if needed
    };
  }, [showAds]);

  return null;
};
