/**
 * Helper to format a user's presence & last seen timestamp.
 * Requirements:
 * "Online" or "Last seen 5 min ago / today 14:32 / yesterday"
 */

export function formatPresenceSubtitle(params: {
  isOnline: boolean;
  lastChanged?: number;
  lastSeenIso?: string;
  language?: 'en' | 'sw';
  showLastSeen?: boolean;
}): string {
  const { isOnline, lastChanged, lastSeenIso, language = 'en', showLastSeen = true } = params;

  if (isOnline) {
    return language === 'sw' ? 'Yupo Mtandaoni Sasa' : 'Online';
  }

  if (!showLastSeen) {
    return language === 'sw' ? 'Hayupo mtandaoni' : 'Offline';
  }

  // Derive timestamp in milliseconds
  let timeMs: number | null = null;
  if (typeof lastChanged === 'number' && lastChanged > 0) {
    timeMs = lastChanged;
  } else if (lastSeenIso) {
    const parsed = Date.parse(lastSeenIso);
    if (!isNaN(parsed) && parsed > 0) {
      timeMs = parsed;
    }
  }

  if (!timeMs) {
    return language === 'sw' ? 'Hayupo mtandaoni' : 'Offline';
  }

  const now = Date.now();
  const diffSec = Math.max(1, Math.floor((now - timeMs) / 1000));
  const diffMin = Math.floor(diffSec / 60);

  // Within the last minute
  if (diffMin < 1) {
    return language === 'sw' ? 'Ameonekana sasa hivi' : 'Last seen just now';
  }

  // Within the last hour: "Last seen 5 min ago"
  if (diffMin < 60) {
    return language === 'sw'
      ? `Ameonekana dakika ${diffMin} zilizopita`
      : `Last seen ${diffMin} min ago`;
  }

  const dateObj = new Date(timeMs);
  const nowDate = new Date(now);

  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Check if today
  const isToday =
    dateObj.getDate() === nowDate.getDate() &&
    dateObj.getMonth() === nowDate.getMonth() &&
    dateObj.getFullYear() === nowDate.getFullYear();

  if (isToday) {
    return language === 'sw'
      ? `Ameonekana leo saa ${timeStr}`
      : `Last seen today ${timeStr}`;
  }

  // Check if yesterday
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const isYesterday =
    dateObj.getDate() === yesterday.getDate() &&
    dateObj.getMonth() === yesterday.getMonth() &&
    dateObj.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return language === 'sw'
      ? `Ameonekana jana saa ${timeStr}`
      : `Last seen yesterday ${timeStr}`;
  }

  // Older: Month Day
  const monthDay = dateObj.toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-US', {
    month: 'short',
    day: 'numeric'
  });

  return language === 'sw'
    ? `Ameonekana ${monthDay} saa ${timeStr}`
    : `Last seen ${monthDay} at ${timeStr}`;
}
