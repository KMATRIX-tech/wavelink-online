/**
 * Shared WebRTC STUN/TURN configuration & startup diagnostics.
 *
 * Reads Vite build-time environment variables:
 *   - VITE_TURN_URLS (or VITE_TURN_URL): comma-separated TURN/TURNS URLs covering UDP, TCP, and TURNS:443
 *   - VITE_TURN_USERNAME
 *   - VITE_TURN_CREDENTIAL
 */

export const GOOGLE_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

const FALLBACK_OPENRELAY_URLS: string[] = [
  'turn:openrelay.metered.ca:80',
  'turn:openrelay.metered.ca:80?transport=tcp',
  'turn:openrelay.metered.ca:3478?transport=udp',
  'turn:openrelay.metered.ca:443',
  'turn:openrelay.metered.ca:443?transport=tcp',
  'turns:openrelay.metered.ca:443?transport=tcp',
];

export const isTurnPlaceholder = (val?: string | null): boolean => {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'YOUR_TURN_USERNAME' ||
    trimmed === 'YOUR_TURN_CREDENTIAL' ||
    trimmed.startsWith('YOUR_') ||
    trimmed.includes('your-turn-host.example.com')
  );
};

export interface TurnEnvStatus {
  hasCustomTurnEnv: boolean;
  missingVars: string[];
  turnUrls: string[];
}

let hasLoggedStartupTurnWarning = false;

export function getTurnEnvStatus(): TurnEnvStatus {
  const rawUrls = (
    (import.meta.env.VITE_TURN_URLS as string | undefined) ||
    (import.meta.env.VITE_TURN_URL as string | undefined) ||
    ''
  ).trim();
  const rawUsername = ((import.meta.env.VITE_TURN_USERNAME as string | undefined) || '').trim();
  const rawCredential = ((import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) || '').trim();

  const missingVars: string[] = [];
  if (isTurnPlaceholder(rawUrls)) missingVars.push('VITE_TURN_URLS');
  if (isTurnPlaceholder(rawUsername)) missingVars.push('VITE_TURN_USERNAME');
  if (isTurnPlaceholder(rawCredential)) missingVars.push('VITE_TURN_CREDENTIAL');

  const parsedUrls = !isTurnPlaceholder(rawUrls)
    ? rawUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [];

  return {
    hasCustomTurnEnv: missingVars.length === 0 && parsedUrls.length > 0,
    missingVars,
    turnUrls: parsedUrls,
  };
}

/**
 * Logs a clear console warning once at app startup if VITE_TURN_* build-time variables
 * are empty or undefined, so developers immediately know the build did not include them.
 */
export function logTurnEnvStartupWarning(): TurnEnvStatus {
  const status = getTurnEnvStatus();
  if (!status.hasCustomTurnEnv && !hasLoggedStartupTurnWarning) {
    hasLoggedStartupTurnWarning = true;
    console.warn(
      `[CALL] TURN environment variables are missing or empty in this build (${status.missingVars.join(
        ', '
      )}). Cross-network calls (e.g. mobile data in Tanzania) require a dedicated TURN server with UDP, TCP, and TURNS on port 443. Set VITE_TURN_URLS, VITE_TURN_USERNAME, and VITE_TURN_CREDENTIAL in Render > Environment and redeploy (Vite reads VITE_* variables at build time).`
    );
  }
  return status;
}

/**
 * Builds the RTCIceServer[] list combining Google STUN and TURN (UDP, TCP, TURNS 443).
 */
export function buildIceServersFromEnv(): {
  iceServers: RTCIceServer[];
  hasCustomTurnEnv: boolean;
  turnUrls: string[];
} {
  const status = getTurnEnvStatus();
  const rawUsername = ((import.meta.env.VITE_TURN_USERNAME as string | undefined) || '').trim();
  const rawCredential = ((import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) || '').trim();

  const turnUrls = status.hasCustomTurnEnv ? status.turnUrls : FALLBACK_OPENRELAY_URLS;
  const username = status.hasCustomTurnEnv ? rawUsername : 'openrelayproject';
  const credential = status.hasCustomTurnEnv ? rawCredential : 'openrelayproject';

  const iceServers: RTCIceServer[] = [
    ...GOOGLE_STUN_SERVERS,
    {
      urls: turnUrls,
      username,
      credential,
    },
  ];

  return {
    iceServers,
    hasCustomTurnEnv: status.hasCustomTurnEnv,
    turnUrls,
  };
}

/**
 * Extracts the ICE candidate type ('host' | 'srflx' | 'prflx' | 'relay' | 'unknown')
 * across all browser implementations (even when candidate.type is omitted on older mobile WebViews).
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
