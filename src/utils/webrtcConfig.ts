import { auth } from '../firebase';

/**
 * Shared WebRTC STUN/TURN client helper.
 * Fetches temporary Metered TURN credentials from /api/ice-servers with Firebase ID token auth,
 * falling back cleanly to free public Google STUN servers when TURN is unavailable.
 */

export const GOOGLE_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export interface FetchIceServersResult {
  iceServers: RTCIceServer[];
  hasRelayServers: boolean;
  isFallback: boolean;
  missingEnvVars: string[];
  reason?: string;
  httpStatus?: number;
}

export function hasRelayIceServer(iceServers: RTCIceServer[]): boolean {
  if (!Array.isArray(iceServers)) return false;
  return iceServers.some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : server?.urls ? [server.urls] : [];
    return urls.some((url) => /^turns?:/i.test(String(url).trim()));
  });
}

/**
 * Fetches ICE servers from GET /api/ice-servers for the signed-in user.
 * Always passes the Firebase ID token in the Authorization Bearer header.
 */
export async function fetchIceServersForCall(explicitIdToken?: string | null): Promise<FetchIceServersResult> {
  try {
    let idToken = (explicitIdToken || '').trim();
    if (!idToken && auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }

    if (!idToken) {
      return {
        iceServers: GOOGLE_STUN_SERVERS,
        hasRelayServers: false,
        isFallback: true,
        missingEnvVars: [],
        reason: 'User is not signed in to fetch TURN relay servers.',
      };
    }

    const res = await fetch('/api/ice-servers', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (typeof errBody?.error === 'string' && errBody.error) {
          errMsg = errBody.error;
        }
      } catch {
        // ignore JSON parse error
      }
      return {
        iceServers: GOOGLE_STUN_SERVERS,
        hasRelayServers: false,
        isFallback: true,
        missingEnvVars: [],
        reason: errMsg,
        httpStatus: res.status,
      };
    }

    const data = (await res.json()) as {
      iceServers?: RTCIceServer[];
      fallback?: boolean;
      missingEnvVars?: string[];
      reason?: string;
    };

    const servers =
      Array.isArray(data?.iceServers) && data.iceServers.length > 0
        ? data.iceServers
        : GOOGLE_STUN_SERVERS;
    const hasRelay = hasRelayIceServer(servers);
    const isFallback = Boolean(data?.fallback) || !hasRelay;

    return {
      iceServers: servers,
      hasRelayServers: hasRelay,
      isFallback,
      missingEnvVars: Array.isArray(data?.missingEnvVars) ? data.missingEnvVars : [],
      reason: typeof data?.reason === 'string' ? data.reason : undefined,
      httpStatus: res.status,
    };
  } catch {
    return {
      iceServers: GOOGLE_STUN_SERVERS,
      hasRelayServers: false,
      isFallback: true,
      missingEnvVars: [],
      reason: 'Network error while requesting /api/ice-servers.',
    };
  }
}

/**
 * Extracts the ICE candidate type ('host' | 'srflx' | 'prflx' | 'relay' | 'unknown')
 * across all browser implementations.
 */
export function extractIceCandidateInfo(candidate: RTCIceCandidate): {
  type: string;
  protocol: string;
  address: string;
  port: number | null;
} {
  const raw = candidate.candidate || '';
  const typeMatch = raw.match(/\btyp\s+([a-z]+)/i);
  const type = (candidate.type || typeMatch?.[1] || 'unknown').toLowerCase();
  const protocol = (candidate.protocol || 'udp').toLowerCase();
  const address = candidate.address || '';
  const port = typeof candidate.port === 'number' ? candidate.port : null;
  return { type, protocol, address, port };
}
