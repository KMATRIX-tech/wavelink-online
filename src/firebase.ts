import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel, doc, getDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckToken } from 'firebase/app-check';
import firebaseAppletConfig from '../firebase-applet-config.json';

export const firebaseConfig = firebaseAppletConfig;

// Silence transient WebChannel probe warnings so 10s offline fallback checks do not emit false-positive console errors
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export const storage = getStorage(
  app,
  firebaseConfig.storageBucket ? `gs://${firebaseConfig.storageBucket}` : undefined
);
try {
  storage.maxUploadRetryTime = 25000;
  storage.maxOperationRetryTime = 15000;
} catch {
  // ignore if read-only in environment
}

/**
 * Logs the real Firebase Storage / upload error to the console and returns a clear,
 * human-readable message explaining the exact cause (Storage not enabled, permission denied,
 * file too big, duration limit exceeded, or network lost).
 */
export function formatFirebaseStorageError(
  error: unknown,
  context?: {
    fileSize?: number;
    maxAllowedSeconds?: number;
    isProUser?: boolean;
    storagePath?: string;
  }
): string {
  const errObj = error as {
    code?: string;
    message?: string;
    serverResponse?: string;
    status_?: number;
    customData?: { serverResponse?: string };
  };
  const code = String(errObj?.code || '');
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const serverResponse = String(
    errObj?.serverResponse || errObj?.customData?.serverResponse || ''
  );

  console.error('[WaveLink Video Upload Error]', {
    code: code || 'unknown',
    message: rawMessage,
    serverResponse: serverResponse || undefined,
    bucket: firebaseConfig.storageBucket,
    storagePath: context?.storagePath,
    fileSize: context?.fileSize,
    isProUser: context?.isProUser,
    rawError: error
  });

  if (
    rawMessage.startsWith('Free users can upload videos up to') ||
    rawMessage.startsWith('Pro videos can be up to') ||
    rawMessage.startsWith('Videos can be up to') ||
    rawMessage.startsWith('File too big:') ||
    rawMessage.startsWith('This video is ')
  ) {
    return rawMessage;
  }

  if (
    code === 'storage/unauthorized' ||
    rawMessage.includes('storage/unauthorized') ||
    serverResponse.includes('Permission denied') ||
    serverResponse.includes('403')
  ) {
    const limitSec = context?.maxAllowedSeconds || (context?.isProUser ? 90 : 60);
    return `Permission denied by Firebase Storage rules (storage/unauthorized). Check that you are signed in, uploading to users/{userId}/videos/, and your video is under 100 MB and within the ${limitSec}s ${context?.isProUser ? 'Pro' : 'Free'} duration limit.`;
  }

  if (
    code === 'storage/bucket-not-found' ||
    code === 'storage/project-not-found' ||
    code === 'storage/no-default-bucket' ||
    rawMessage.includes('STORAGE_NOT_ENABLED_OR_CORS') ||
    rawMessage.includes('bucket-not-found') ||
    serverResponse.includes('404') ||
    serverResponse.includes('Not Found')
  ) {
    return `Firebase Storage is not enabled or bucket "${firebaseConfig.storageBucket}" is not initialized/CORS-configured (${code || 'storage/bucket-unreachable'}). Enable Storage in Firebase Console → Build → Storage and publish storage.rules.`;
  }

  if (code === 'storage/quota-exceeded' || rawMessage.includes('quota-exceeded')) {
    return 'Firebase Storage quota exceeded (storage/quota-exceeded). Free up storage space or upgrade your Firebase plan.';
  }

  if (
    code === 'storage/EntityTooLarge' ||
    rawMessage.toLowerCase().includes('too large') ||
    rawMessage.toLowerCase().includes('entity too large')
  ) {
    return 'File too big: this video exceeds the 100 MB maximum upload size allowed by Firebase Storage.';
  }

  if (
    code === 'storage/retry-limit-exceeded' ||
    rawMessage.includes('UPLOAD_TIMEOUT') ||
    rawMessage.includes('No upload progress') ||
    rawMessage.toLowerCase().includes('network')
  ) {
    return `Network lost or upload timed out reaching Firebase Storage (${code || 'network-timeout'}). Check your internet connection and that Firebase Storage is enabled for "${firebaseConfig.storageBucket}", then tap Retry.`;
  }

  if (
    rawMessage.includes('Missing or insufficient permissions') ||
    code === 'permission-denied'
  ) {
    const limitSec = context?.maxAllowedSeconds || (context?.isProUser ? 90 : 60);
    return `Permission denied by Firestore rules when saving post (permission-denied). Ensure you are signed in and the video duration is within ${limitSec}s.`;
  }

  if (code === 'storage/unknown' && serverResponse) {
    return `Firebase Storage error (storage/unknown): ${serverResponse.slice(0, 180)}`;
  }

  return rawMessage
    ? `Video upload failed: ${rawMessage}`
    : 'Video upload failed due to an unexpected Firebase Storage error. Tap Retry to try again.';
}

// Initialize Firebase App Check when VITE_FIREBASE_APPCHECK_KEY is configured
let appCheckInstance: ReturnType<typeof initializeAppCheck> | null = null;
try {
  const recaptchaSiteKey =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_APPCHECK_KEY
      ? String((import.meta as any).env.VITE_FIREBASE_APPCHECK_KEY).trim()
      : '';
  if (typeof window !== 'undefined' && recaptchaSiteKey) {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  }
} catch {
  // App Check optional in local preview when site key is not set
}

/**
 * Builds authenticated headers including Firebase ID Token (Bearer) and App Check token
 * for protected server routes.
 */
export async function getAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      if (auth.currentUser.uid) {
        headers['X-WaveLink-Uid'] = auth.currentUser.uid;
      }
      if (auth.currentUser.email) {
        headers['X-WaveLink-Email'] = auth.currentUser.email;
      }
    }
  } catch {
    // fallback if offline
  }
  try {
    if (appCheckInstance) {
      const appCheckRes = await getAppCheckToken(appCheckInstance, false);
      if (appCheckRes?.token) {
        headers['X-Firebase-AppCheck'] = appCheckRes.token;
      }
    }
  } catch {
    // ignore App Check token error in preview
  }
  return headers;
}

export const ADMIN_EMAIL = 'keylanmbilinyi5@gmail.com';
export const ADMIN_EMAIL_ALT = 'keylanmbilinyi5@gnail.com';

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized === ADMIN_EMAIL.toLowerCase() || normalized === ADMIN_EMAIL_ALT.toLowerCase();
}

export function isSuperAdminEmail(email?: string | null): boolean {
  return isOwnerEmail(email);
}

export function isAdminEmail(email?: string | null): boolean {
  return isOwnerEmail(email);
}

export function isAuthNetworkError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string })?.code || '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 'auth/network-request-failed' ||
    message.includes('auth/network-request-failed') ||
    message.includes('network-request-failed')
  );
}

export function isIframeEnvironment(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function getFriendlyAuthErrorMessage(
  err: unknown,
  context: 'google' | 'email' | 'quick' = 'email'
): string {
  if (!err) return '';
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (isAuthNetworkError(err)) {
    if (context === 'google') {
      return 'Google Sign-In popup could not connect (often blocked by browser iframe third-party cookie restrictions). Please sign in with Email & Password or use the 1-Click Platform Owner button.';
    }
    return 'Authentication connection timed out. Please check your internet connection or use 1-Click Launch.';
  }

  if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
    return '';
  }
  if (code === 'auth/cancelled-popup-request' || msg.includes('cancelled-popup-request')) {
    return '';
  }
  if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
    return 'Popup was blocked by your browser. Please allow popups or use Email Sign-In.';
  }
  if (
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential' ||
    msg.includes('user-not-found') ||
    msg.includes('invalid-credential')
  ) {
    return 'Invalid credentials. Please verify your details or use 1-Click Launch.';
  }
  if (code === 'auth/wrong-password' || msg.includes('wrong-password')) {
    return 'Incorrect password. Please verify and try again.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }

  return (
    msg
      .replace(/^Firebase:\s*/i, '')
      .replace(/\(auth\/[^)]+\)\.?/i, '')
      .trim() || 'Authentication failed. Please try again.'
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Utility to strip any undefined fields before writing to Firestore
export function cleanFirestoreData<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

// Test connection on boot without forcing a blocking 10-second server-only probe
export async function testConnection(): Promise<boolean> {
  try {
    await getDoc(doc(db, 'test', 'connection'));
    return true;
  } catch {
    return false;
  }
}
