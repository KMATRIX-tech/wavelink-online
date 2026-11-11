import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel, doc, getDoc } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckToken } from 'firebase/app-check';
import firebaseAppletConfig from '../firebase-applet-config.json';

export const firebaseConfig = firebaseAppletConfig;

// Silence transient WebChannel probe warnings so 10s offline fallback checks do not emit false-positive console errors
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export const CLOUDINARY_CLOUD_NAME = 'monarcking72';
export const CLOUDINARY_UPLOAD_PRESET = 'monarcking72';
export const CLOUDINARY_VIDEO_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

/**
 * Logs the real Cloudinary / browser video upload error to the console and returns a clear,
 * human-readable message explaining the exact cause (preset/cloud config, file too big,
 * duration limit exceeded, network lost, or Firestore permission error).
 */
export function formatVideoUploadError(
  error: unknown,
  context?: {
    fileSize?: number;
    maxAllowedSeconds?: number;
    isProUser?: boolean;
    storagePath?: string;
    httpStatus?: number;
  }
): string {
  const errObj = error as {
    code?: string;
    message?: string;
    httpStatus?: number;
    cloudinaryMessage?: string;
  };
  const code = String(errObj?.code || '');
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const httpStatus = errObj?.httpStatus ?? context?.httpStatus;

  console.error('[WaveLink Cloudinary Video Upload Error]', {
    cloudName: CLOUDINARY_CLOUD_NAME,
    uploadPreset: CLOUDINARY_UPLOAD_PRESET,
    httpStatus,
    code: code || undefined,
    message: rawMessage,
    fileSize: context?.fileSize,
    isProUser: context?.isProUser,
    rawError: error
  });

  if (
    rawMessage.startsWith('Free users can upload videos up to') ||
    rawMessage.startsWith('Free Sparks can be up to') ||
    rawMessage.startsWith('Pro videos can be up to') ||
    rawMessage.startsWith('Pro Sparks can be up to') ||
    rawMessage.startsWith('Videos can be up to') ||
    rawMessage.startsWith('File too big:') ||
    rawMessage.startsWith('This video is ') ||
    rawMessage.startsWith('Cloudinary upload error:')
  ) {
    return rawMessage;
  }

  if (httpStatus === 413 || rawMessage.toLowerCase().includes('file size too large') || rawMessage.toLowerCase().includes('too large')) {
    return 'File too big: this video exceeds the maximum file size allowed by Cloudinary (100 MB limit for unsigned uploads).';
  }

  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403) {
    return `Cloudinary rejected the upload (HTTP ${httpStatus}): ${rawMessage || `Check that cloud name "${CLOUDINARY_CLOUD_NAME}" and unsigned upload preset "${CLOUDINARY_UPLOAD_PRESET}" are active.`}`;
  }

  if (
    rawMessage.includes('NETWORK_ERROR') ||
    rawMessage.includes('UPLOAD_TIMEOUT') ||
    rawMessage.includes('No upload progress') ||
    rawMessage.toLowerCase().includes('network')
  ) {
    return 'Network connection lost or timed out while uploading video to Cloudinary. Check your internet connection and tap Retry.';
  }

  if (
    rawMessage.includes('Missing or insufficient permissions') ||
    code === 'permission-denied'
  ) {
    const limitSec = context?.maxAllowedSeconds || (context?.isProUser ? 90 : 60);
    return `Permission denied by Firestore rules when saving post (permission-denied). Ensure you are signed in and the video duration is within ${limitSec}s.`;
  }

  return rawMessage
    ? `Video upload failed: ${rawMessage}`
    : 'Video upload to Cloudinary failed due to an unexpected error. Tap Retry to try again.';
}

export const formatFirebaseStorageError = formatVideoUploadError;

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

export const OWNER_SESSION_STORAGE_KEY = 'wavelink_owner_session_token';
export const DEVICE_ID_STORAGE_KEY = 'wavelink_device_id';

export function getClientDeviceId(): string {
  if (typeof window === 'undefined') return 'server_client';
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'browser_device';
  }
}

/**
 * Builds authenticated headers including Firebase ID Token (Bearer), server-issued Owner Session token,
 * and App Check token for protected server routes.
 */
export async function getAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WaveLink-Device-Id': getClientDeviceId(),
    ...extraHeaders
  };
  try {
    if (typeof window !== 'undefined') {
      const ownerToken = sessionStorage.getItem(OWNER_SESSION_STORAGE_KEY) || localStorage.getItem(OWNER_SESSION_STORAGE_KEY);
      if (ownerToken) {
        headers['X-WaveLink-Owner-Token'] = ownerToken;
      }
    }
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      if (auth.currentUser.uid) {
        headers['X-WaveLink-Uid'] = auth.currentUser.uid;
      }
    }
  } catch {
    // fallback if offline
  }
  // App Check is non-blocking: fetch token with a 1.5s timeout fallback
  try {
    if (appCheckInstance) {
      const tokenPromise = getAppCheckToken(appCheckInstance, false);
      const timeoutPromise = new Promise<{ token: string }>((resolve) =>
        setTimeout(() => resolve({ token: '' }), 1500)
      );
      const appCheckRes = await Promise.race([tokenPromise, timeoutPromise]);
      if (appCheckRes?.token) {
        headers['X-Firebase-AppCheck'] = appCheckRes.token;
      }
    }
  } catch {
    // Non-blocking: never fail requests if App Check is unavailable
  }
  return headers;
}

// Generic label for UI display only — actual Owner email is kept strictly on the server in process.env.OWNER_EMAIL
export const ADMIN_EMAIL = 'Platform Administrator';

/**
 * Single canonical source of truth for admin role resolution across UI, Server, and Firestore rules:
 * Based on the user's `role` field (`'admin'` / `'super_admin'` / `'sub_admin'`).
 */
export function resolveCanonicalAdminRole(
  role?: string | null,
  isSubAdmin?: boolean | null
): 'admin' | 'sub_admin' | 'user' {
  if (role === 'admin' || role === 'super_admin') {
    return 'admin';
  }
  if (role === 'sub_admin' || isSubAdmin === true) {
    return 'sub_admin';
  }
  return 'user';
}

export function isOwnerEmail(_email?: string | null): boolean {
  return false;
}

export function isSuperAdminEmail(_email?: string | null, role?: string | null): boolean {
  return resolveCanonicalAdminRole(role) === 'admin';
}

export function isAdminEmail(_email?: string | null, role?: string | null, isSubAdmin?: boolean | null): boolean {
  const resolved = resolveCanonicalAdminRole(role, isSubAdmin);
  return resolved === 'admin' || resolved === 'sub_admin';
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

/**
 * Scrubs any URLs, links, query parameters, OOB codes, or JWT/bearer tokens from error text
 * so that tokens or links never appear on screen.
 */
export function sanitizeErrorTextNoTokensOrLinks(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/https?:\/\/\S+/gi, '[redacted-link]')
    .replace(/\bwww\.\S+/gi, '[redacted-link]')
    .replace(/\b(oobCode|apiKey|token|idToken|accessToken|refreshToken|continueUrl)=[^\s&)]+/gi, '$1=[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]')
    .trim();
}

/**
 * Extracts a clean Firebase Auth error code (e.g. auth/unauthorized-domain,
 * auth/operation-not-allowed, auth/too-many-requests) without any tokens or links.
 */
export function extractSafeFirebaseAuthCode(err: unknown): string | null {
  if (!err) return null;
  const rawCode = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code.trim() : '';
  if (/^auth\/[a-z0-9-]+$/i.test(rawCode)) {
    return rawCode.toLowerCase();
  }
  const rawMsg = err instanceof Error ? err.message : String(err);
  const match = rawMsg.match(/\b(auth\/[a-z0-9-]+)\b/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return null;
}

/**
 * Formats an error from sendEmailVerification (or account initialization for email verification),
 * returning a safe user-facing message (never containing links or tokens) and the Firebase error code.
 */
export function formatEmailVerificationError(err: unknown): { message: string; code: string | null } {
  const code = extractSafeFirebaseAuthCode(err);

  if (code === 'auth/unauthorized-domain') {
    return {
      message: 'Could not send verification email because this domain is not authorized in Firebase Authentication.',
      code
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      message: 'Could not send verification email because this sign-in operation is not enabled in Firebase Authentication.',
      code
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      message: 'Too many verification email requests. Please wait a few minutes and try again.',
      code
    };
  }
  if (code === 'auth/invalid-continue-uri' || code === 'auth/missing-continue-uri' || code === 'auth/unauthorized-continue-uri') {
    return {
      message: 'Could not send verification email due to an invalid or unauthorized continue URL configuration.',
      code
    };
  }

  const friendly = sanitizeErrorTextNoTokensOrLinks(getFriendlyAuthErrorMessage(err, 'email'));
  return {
    message: friendly || 'Could not send verification email. Please try again.',
    code
  };
}

export function getFriendlyAuthErrorMessage(
  err: unknown,
  context: 'google' | 'email' | 'quick' = 'email'
): string {
  if (!err) return '';
  const code = extractSafeFirebaseAuthCode(err) || (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (isAuthNetworkError(err)) {
    if (context === 'google') {
      return 'Google Sign-In popup could not connect (often blocked by browser iframe third-party cookie restrictions). Please sign in with Email & Password or use the 1-Click Platform Owner button.';
    }
    return 'Authentication connection timed out. Please check your internet connection and try again.';
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
  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    return 'This domain is not authorized for Firebase Authentication operations.';
  }
  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'This authentication method is currently not enabled in Firebase Authentication.';
  }
  if (
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential' ||
    msg.includes('user-not-found') ||
    msg.includes('invalid-credential')
  ) {
    return 'Invalid credentials. Please check your username/email and password.';
  }
  if (code === 'auth/wrong-password' || msg.includes('wrong-password')) {
    return 'Incorrect password. Please verify and try again.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'Password must be between 8 and 24 characters and contain at least one letter and one number.';
  }
  if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }

  const cleaned = sanitizeErrorTextNoTokensOrLinks(
    msg
      .replace(/^Firebase:\s*/i, '')
      .replace(/\(auth\/[^)]+\)\.?/i, '')
      .trim()
  );
  return cleaned || 'Authentication failed. Please try again.';
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

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('resource-exhausted')
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
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

  // Do not crash onSnapshot listeners when daily free-tier read quota is exhausted or client is offline
  if (
    isFirestoreQuotaError(error) ||
    rawMessage.toLowerCase().includes('client is offline')
  ) {
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
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
