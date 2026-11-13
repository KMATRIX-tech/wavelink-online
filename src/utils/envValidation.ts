import { firebaseConfig } from '../firebase';

export interface FrontendEnvValidationResult {
  isValid: boolean;
  missingKeys: string[];
  message: string | null;
}

/**
 * Validates that all required frontend Firebase credentials are provided.
 * Shows a clear, friendly error description if any essential parameter is missing.
 */
export function validateFrontendEnvironment(): FrontendEnvValidationResult {
  const missingKeys: string[] = [];

  const requiredKeys: Array<{ key: string; val: unknown }> = [
    { key: 'projectId', val: firebaseConfig?.projectId },
    { key: 'apiKey', val: firebaseConfig?.apiKey },
    { key: 'authDomain', val: firebaseConfig?.authDomain },
    { key: 'appId', val: firebaseConfig?.appId },
  ];

  for (const item of requiredKeys) {
    if (!item.val || typeof item.val !== 'string' || item.val.trim() === '') {
      missingKeys.push(item.key);
    }
  }

  if (missingKeys.length > 0) {
    const message = `Required frontend environment configuration is missing: ${missingKeys.join(
      ', '
    )}. Please ensure your Firebase configuration contains valid credentials.`;
    console.error(`[WaveLink Environment Configuration Error]: ${message}`, {
      missingKeys,
      configSnapshot: {
        projectId: firebaseConfig?.projectId || null,
        authDomain: firebaseConfig?.authDomain || null,
        hasApiKey: Boolean(firebaseConfig?.apiKey),
        hasAppId: Boolean(firebaseConfig?.appId),
      },
    });
    return {
      isValid: false,
      missingKeys,
      message,
    };
  }

  return {
    isValid: true,
    missingKeys: [],
    message: null,
  };
}
