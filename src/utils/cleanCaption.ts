/**
 * Single shared caption sanitizer used everywhere across WaveLink before displaying
 * or speaking any post caption/title, and before saving new posts.
 *
 * Returns an empty string ("") when text is auto-generated or a raw filename:
 *  - "Shared a new video reel: ..." / "Shared a new photo: ..." / "Shared a new ..."
 *  - Media filenames with extensions (.mp4, .mov, .webm, .mkv, .avi, .m4v, .jpg, .jpeg, .png, .gif, .webp, .heic)
 *  - Long hex strings / UUIDs (e.g. "lvtemp_cabc80e5-...", "9fd2da1e06594bb9c...")
 *  - Camera / screen-recording / messaging app filenames (IMG_1234, VID_1234, Screenshot_..., PXL_..., DJI_..., WhatsApp_Video_...)
 *
 * Real user-written captions are preserved unchanged.
 */

const AUTO_PREFIX_REGEX =
  /^\s*shared\s+a\s+new\s+(?:video\s+reel|video\s+wave|video|reel|photo|image|picture|wave|post|clip)\s*:?\s*/i;

const MEDIA_EXT_PATTERN =
  '(?:mp4|mov|webm|mkv|avi|m4v|3gp|3g2|flv|wmv|ogv|jpg|jpeg|png|gif|webp|heic|heif|avif|bmp)';

// Matches standalone filename tokens with a media extension (e.g. "9fd2da1e.mp4", "my_clip-01.MOV")
const FILENAME_WITH_EXT_TOKEN_REGEX = new RegExp(
  `(^|[\\s([{"'])([a-z0-9][a-z0-9_.\\-()]{1,140}\\.${MEDIA_EXT_PATTERN})(?=$|[\\s)\\]}"',!?;:])`,
  'gi'
);

// Matches an entire string that looks like a file name (even with spaces) ending in a media extension
const ENTIRE_FILENAME_WITH_EXT_REGEX = new RegExp(
  `^[\\w\\s().\\-+,\\[\\]]{1,180}\\.${MEDIA_EXT_PATTERN}$`,
  'i'
);

// Matches UUIDs like "cabc80e5-375b-4a2b-9f11-1234567890ab"
const UUID_TOKEN_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// Matches long hex / hash-like IDs (12+ hex chars, containing at least one digit and one a-f letter, or 16+ pure hex)
const LONG_HEX_TOKEN_REGEX = /\b(?:(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{12,}|[0-9a-f]{16,})\b/gi;

// Matches common device, camera, editor, and temp file prefixes
const DEVICE_FILENAME_TOKEN_REGEX =
  /\b(?:lvtemp[_-][a-z0-9_.-]+|vid[_-][0-9a-z_.-]+|img[_-][0-9a-z_.-]+|mvi[_-][0-9a-z_.-]+|mov[_-][0-9a-z_.-]+|dsc[_-]?[0-9]{3,}[0-9a-z_.-]*|dcim[_-][0-9a-z_.-]+|pxl[_-][0-9a-z_.-]+|dji[_-][0-9a-z_.-]+|screenshot[_ -][0-9a-z_.-]+|screen[_ -]?recording[_ -][0-9a-z_.-]+|rpreplay[_-][0-9a-z_.-]+|whatsapp[_ -](?:video|image)[0-9a-z_.-]*|inshot[_-][0-9a-z_.-]+|capcut[_-][0-9a-z_.-]+|vn[0-9]{8,}[0-9a-z_.-]*|trim\.[0-9a-z_.-]+|video[_-][0-9]{6,}[0-9a-z_.-]*|photo[_-][0-9]{6,}[0-9a-z_.-]*|tmp[_-][0-9a-z_.-]+)\b/gi;

// Matches legacy auto-inserted studio default captions when user left caption blank
const LEGACY_BOILERPLATE_EXACT = new Set([
  'shared a new video reel',
  'shared a new video',
  'shared a new photo',
  'shared a new image',
  'shared a new wave',
  'shared a new post',
  'new video reel',
  'new wave video',
  'new wave video ✨',
  'created with wavelink studio ✨',
  'created with wavelink studio'
]);

/**
 * Returns true if the remaining string looks like a single opaque ID / camera filename
 * rather than human-written words.
 */
function looksLikeOpaqueFilenameOrId(value: string): boolean {
  const s = value.trim();
  if (!s) return true;
  if (LEGACY_BOILERPLATE_EXACT.has(s.toLowerCase())) return true;
  if (ENTIRE_FILENAME_WITH_EXT_REGEX.test(s)) return true;

  // Single token with no spaces that looks like a temp/camera/hex ID (e.g. "9fd2da1e06594bb9c...", "lvtemp_...", "IMG_20260405_123456")
  if (!/\s/.test(s)) {
    if (/^[0-9a-f_-]{12,}$/i.test(s) && /\d/.test(s)) return true;
    if (/^(?:lvtemp|vid|img|pxl|dji|dsc|mvi|mov|screenshot|rpreplay|inshot|capcut|tmp)[_.-]?[0-9a-z_.-]+$/i.test(s)) {
      return true;
    }
    if (/^[0-9]{8,}(?:[_-][0-9]{4,})+$/.test(s)) return true;
  }

  // Only punctuation / symbols / whitespace left
  if (/^[:\-–—_|.,;•/\\#*\s]+$/.test(s)) return true;

  return false;
}

/**
 * Cleans a post caption/title for display or TTS playback.
 * Returns "" if the text is auto-generated or a filename; otherwise preserves the real caption.
 */
export function cleanCaption(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';

  const original = raw.trim();
  if (!original) return '';

  if (looksLikeOpaqueFilenameOrId(original)) {
    return '';
  }

  let text = original;
  const hadAutoPrefix = AUTO_PREFIX_REGEX.test(text);
  if (hadAutoPrefix) {
    text = text.replace(AUTO_PREFIX_REGEX, '').trim();
    if (!text || looksLikeOpaqueFilenameOrId(text)) {
      return '';
    }
  }

  // Remove filenames with media extensions (e.g. "9fd2da1e...mp4", "IMG_1234.jpg")
  text = text.replace(FILENAME_WITH_EXT_TOKEN_REGEX, '$1');

  // Remove device/camera/editor temp filename tokens
  text = text.replace(DEVICE_FILENAME_TOKEN_REGEX, '');

  // Remove raw UUIDs and long hex hashes
  text = text.replace(UUID_TOKEN_REGEX, '');
  text = text.replace(LONG_HEX_TOKEN_REGEX, '');

  // Collapse extra spaces while keeping intentional line breaks for real multi-line captions
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter((line, idx, arr) => !(line === '' && (idx === 0 || idx === arr.length - 1)))
    .join('\n')
    .trim();

  // If the caption started with "Shared a new video reel:" and stripping filenames left
  // only stray punctuation or an opaque token, hide it completely.
  if (!text || looksLikeOpaqueFilenameOrId(text)) {
    return '';
  }

  // If stripping changed nothing, return the exact trimmed user caption.
  return text;
}
