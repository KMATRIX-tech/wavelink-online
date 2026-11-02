import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel, doc, getDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../firebase-applet-config.json';

export const firebaseConfig = firebaseAppletConfig;

// Silence transient WebChannel probe warnings so 10s offline fallback checks do not emit false-positive console errors
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export const storage = getStorage(app);

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
