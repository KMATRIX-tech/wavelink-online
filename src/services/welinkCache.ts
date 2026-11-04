/**
 * Lightweight IndexedDB Wrapper for WELINK Assistant Drawer
 * Provides sub-millisecond L1 memory + persistent L2 IndexedDB caching
 * strictly scoped to the WelinkAssistantDrawer component.
 */

const DB_NAME = 'wavelink_welink_assistant_db';
const DB_VERSION = 1;
const RESPONSE_STORE = 'welink_responses';
const THREAD_STORE = 'welink_threads';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 100;

export interface CachedWelinkResponse {
  key: string;
  userScope: string;
  normalizedPrompt: string;
  reply: string;
  model: string;
  createdAt: number;
  expiresAt: number;
}

export interface PersistedWelinkTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  fromCache?: boolean;
}

interface PersistedWelinkThread {
  userScope: string;
  turns: PersistedWelinkTurn[];
  updatedAt: number;
}

// Fast in-memory L1 cache mirrored with IndexedDB to guarantee <1ms lookups
const memoryResponseCache = new Map<string, CachedWelinkResponse>();
const memoryThreadCache = new Map<string, PersistedWelinkTurn[]>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openWelinkDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
          const store = db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
          store.createIndex('userScope', 'userScope', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(THREAD_STORE)) {
          db.createObjectStore(THREAD_STORE, { keyPath: 'userScope' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Normalizes user prompt text for deterministic cache keys
 */
export function normalizeWelinkPrompt(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.,;]+$/g, '');
}

/**
 * Builds a scoped cache key isolated to the user, selected model, and prompt context
 */
export function buildWelinkCacheKey(
  userScope: string,
  model: string,
  prompt: string,
  previousUserTurn?: string
): string {
  const safeScope = (userScope || 'guest').trim();
  const safeModel = (model || 'gemini-3.8-flash').trim();
  const normPrompt = normalizeWelinkPrompt(prompt);
  const normContext = previousUserTurn ? normalizeWelinkPrompt(previousUserTurn).slice(0, 80) : '';
  return `${safeScope}::${safeModel}::${normContext}::${normPrompt}`;
}

/**
 * Look up a cached WELINK response from L1 Memory or L2 IndexedDB
 */
export async function getCachedWelinkResponse(
  key: string
): Promise<CachedWelinkResponse | null> {
  if (!key) return null;
  const now = Date.now();

  // 1. Check L1 in-memory cache first
  const memHit = memoryResponseCache.get(key);
  if (memHit) {
    if (memHit.expiresAt > now) {
      return memHit;
    }
    memoryResponseCache.delete(key);
  }

  // 2. Check L2 IndexedDB
  const db = await openWelinkDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RESPONSE_STORE, 'readonly');
      const store = tx.objectStore(RESPONSE_STORE);
      const req = store.get(key);

      req.onsuccess = () => {
        const result = req.result as CachedWelinkResponse | undefined;
        if (result && result.expiresAt > now && result.reply) {
          memoryResponseCache.set(key, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Fast lookup by normalized prompt (ignoring prior turn context) for debounced input preview
 * or standalone FAQ prompts
 */
export async function findCachedResponseByPrompt(
  userScope: string,
  model: string,
  prompt: string
): Promise<CachedWelinkResponse | null> {
  const normPrompt = normalizeWelinkPrompt(prompt);
  if (!normPrompt || normPrompt.length < 3) return null;

  const exactScopedKey = buildWelinkCacheKey(userScope, model, normPrompt);
  const directHit = await getCachedWelinkResponse(exactScopedKey);
  if (directHit) return directHit;

  const now = Date.now();
  for (const entry of memoryResponseCache.values()) {
    if (
      entry.userScope === userScope &&
      entry.normalizedPrompt === normPrompt &&
      entry.expiresAt > now
    ) {
      return entry;
    }
  }

  const db = await openWelinkDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RESPONSE_STORE, 'readonly');
      const store = tx.objectStore(RESPONSE_STORE);
      const index = store.index('userScope');
      const req = index.getAll(IDBKeyRange.only(userScope));

      req.onsuccess = () => {
        const rows = (req.result as CachedWelinkResponse[]) || [];
        const match = rows.find(
          (r) =>
            r.normalizedPrompt === normPrompt &&
            r.expiresAt > now &&
            (r.model === model || Boolean(r.reply))
        );
        if (match) {
          memoryResponseCache.set(match.key, match);
          resolve(match);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save a WELINK assistant response to L1 memory + L2 IndexedDB and prune old entries
 */
export async function setCachedWelinkResponse(params: {
  key: string;
  userScope: string;
  prompt: string;
  reply: string;
  model: string;
  ttlMs?: number;
}): Promise<void> {
  const { key, userScope, prompt, reply, model, ttlMs = DEFAULT_TTL_MS } = params;
  if (!key || !reply.trim()) return;

  const now = Date.now();
  const entry: CachedWelinkResponse = {
    key,
    userScope: userScope || 'guest',
    normalizedPrompt: normalizeWelinkPrompt(prompt),
    reply: reply.trim(),
    model: model || 'gemini-3.8-flash',
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  memoryResponseCache.set(key, entry);
  if (memoryResponseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = memoryResponseCache.keys().next().value;
    if (oldestKey) memoryResponseCache.delete(oldestKey);
  }

  const db = await openWelinkDb();
  if (!db) return;

  try {
    const tx = db.transaction(RESPONSE_STORE, 'readwrite');
    const store = tx.objectStore(RESPONSE_STORE);
    store.put(entry);

    // Opportunistically prune expired entries
    const expIndex = store.index('expiresAt');
    const expiredReq = expIndex.openKeyCursor(IDBKeyRange.upperBound(now));
    expiredReq.onsuccess = () => {
      const cursor = expiredReq.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

/**
 * Load the user's isolated WELINK drawer conversation history from IndexedDB
 */
export async function loadDrawerThreadFromCache(
  userScope: string
): Promise<PersistedWelinkTurn[] | null> {
  const safeScope = (userScope || 'guest').trim();
  const memTurns = memoryThreadCache.get(safeScope);
  if (memTurns && memTurns.length > 0) {
    return memTurns;
  }

  const db = await openWelinkDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(THREAD_STORE, 'readonly');
      const store = tx.objectStore(THREAD_STORE);
      const req = store.get(safeScope);

      req.onsuccess = () => {
        const record = req.result as PersistedWelinkThread | undefined;
        if (record && Array.isArray(record.turns) && record.turns.length > 0) {
          memoryThreadCache.set(safeScope, record.turns);
          resolve(record.turns);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Persist the user's isolated WELINK drawer conversation history to IndexedDB
 */
export async function saveDrawerThreadToCache(
  userScope: string,
  turns: PersistedWelinkTurn[]
): Promise<void> {
  const safeScope = (userScope || 'guest').trim();
  const trimmedTurns = turns.slice(-40);
  memoryThreadCache.set(safeScope, trimmedTurns);

  const db = await openWelinkDb();
  if (!db) return;

  try {
    const tx = db.transaction(THREAD_STORE, 'readwrite');
    const store = tx.objectStore(THREAD_STORE);
    const payload: PersistedWelinkThread = {
      userScope: safeScope,
      turns: trimmedTurns,
      updatedAt: Date.now(),
    };
    store.put(payload);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear the isolated WELINK drawer conversation thread for a specific user
 */
export async function clearDrawerThreadCache(userScope: string): Promise<void> {
  const safeScope = (userScope || 'guest').trim();
  memoryThreadCache.delete(safeScope);

  const db = await openWelinkDb();
  if (!db) return;

  try {
    const tx = db.transaction(THREAD_STORE, 'readwrite');
    tx.objectStore(THREAD_STORE).delete(safeScope);
  } catch {
    // Ignore storage errors
  }
}
