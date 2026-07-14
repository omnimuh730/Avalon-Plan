/** Resume upload filename helpers (pure — safe for MAIN world). */

const TARGET_EXT_RE = /\.(pdf|docx)$/i;

/** Expando on File objects so FormData hooks can still report the bidder's original name. */
export const BID_ORIGINAL_NAME_PROP = '__bidOriginalName';

export type ResumeUploadSource = 'input' | 'formdata' | 'fetch' | 'xhr';

export function isTargetResumeName(name: string): boolean {
  return TARGET_EXT_RE.test(name.trim());
}

/** e.g. "Tracy Nguyen" → "TracyNguyen" */
export function profileNameToFileBase(applierName: string | null | undefined): string | null {
  if (!applierName) return null;
  const base = applierName.replace(/\s+/g, '').trim();
  return base.length > 0 ? base : null;
}

export function getResumeExtension(name: string): string | null {
  const match = name.trim().match(TARGET_EXT_RE);
  return match ? match[0] : null;
}

/**
 * Build the cleaned upload name from the loaded profile.
 * Preserves the original extension casing (`.pdf` / `.PDF` / `.docx`).
 */
export function buildProfileResumeName(
  originalName: string,
  profileFileBase: string | null,
): string | null {
  if (!profileFileBase) return null;
  const ext = getResumeExtension(originalName);
  if (!ext) return null;
  return `${profileFileBase}${ext}`;
}

export function getStampedOriginalName(file: File): string | null {
  const stamped = (file as File & { [BID_ORIGINAL_NAME_PROP]?: unknown })[BID_ORIGINAL_NAME_PROP];
  return typeof stamped === 'string' && stamped.length > 0 ? stamped : null;
}

export function stampOriginalName(file: File, originalName: string): File {
  try {
    Object.defineProperty(file, BID_ORIGINAL_NAME_PROP, {
      value: originalName,
      enumerable: false,
      configurable: true,
    });
  } catch {
    (file as File & { [BID_ORIGINAL_NAME_PROP]?: string })[BID_ORIGINAL_NAME_PROP] = originalName;
  }
  return file;
}

export function cloneFileWithName(file: File, newName: string, originalName?: string): File {
  const next = new File([file], newName, {
    type: file.type,
    lastModified: file.lastModified,
  });
  const stamped = originalName ?? getStampedOriginalName(file) ?? file.name;
  if (stamped !== newName) {
    stampOriginalName(next, stamped);
  }
  return next;
}

export function shouldRenameResume(
  originalName: string,
  profileFileBase: string | null,
): string | null {
  if (!isTargetResumeName(originalName)) return null;
  const cleaned = buildProfileResumeName(originalName, profileFileBase);
  if (!cleaned || cleaned === originalName) return null;
  return cleaned;
}

/** Strip .pdf / .docx so "C# + Java.docx" can match recommended "C# + Java". */
export function stripResumeExtension(name: string): string {
  return String(name ?? '')
    .replace(/\.(pdf|docx)$/i, '')
    .trim();
}

export function normalizeResumeLabel(name: string): string {
  return stripResumeExtension(name)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ResumeRecommendMatch = 'match' | 'mismatch' | 'unknown';

/**
 * Compare the bidder's original upload filename to the Analyze recommended
 * resume stack label (e.g. "C# + Java.docx" ↔ "C# + Java").
 */
export function matchUploadToRecommended(
  originalName: string | null | undefined,
  recommendedName: string | null | undefined,
): ResumeRecommendMatch {
  if (!originalName?.trim() || !recommendedName?.trim()) return 'unknown';
  const upload = normalizeResumeLabel(originalName);
  const recommended = normalizeResumeLabel(recommendedName);
  if (!upload || !recommended) return 'unknown';
  if (upload === recommended) return 'match';
  if (upload.includes(recommended) || recommended.includes(upload)) return 'match';
  return 'mismatch';
}
