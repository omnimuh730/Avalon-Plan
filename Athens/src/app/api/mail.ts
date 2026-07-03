import { API_BASE } from "@/lib/api-base";

export interface VerificationCodeResult {
  code: string | null;
  /** A verification LINK to open, when the email uses a click-to-verify flow instead of a code. */
  link: string | null;
  subject?: string | null;
  from?: string | null;
  /** How it was found: "regex" (fast path) or "ai" (fallback extractor). */
  via?: string | null;
  /** How many emails were scanned (for UI visibility). */
  scanned?: number;
}

/**
 * Fetch the most recent verification credential (one-time CODE or verify LINK) from
 * the applier's inbox (IMAP Gmail). Scans the 10 most recent emails in the
 * lookback window. Regex fast-path, then AI extraction that handles
 * alphanumeric/lowercase/boxed codes and links. Returns { code: null, link: null }
 * when none is found; never throws.
 */
export async function requestVerificationCode(
  applierName: string,
  sinceMs?: number,
): Promise<VerificationCodeResult> {
  try {
    const res = await fetch(`${API_BASE}/mail/verification-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applierName, ...(sinceMs ? { sinceMs } : {}) }),
    });
    if (!res.ok) return { code: null, link: null };
    const data = (await res.json()) as {
      success?: boolean;
      code?: string | null;
      link?: string | null;
      subject?: string | null;
      from?: string | null;
      via?: string | null;
      scanned?: number;
    };
    if (!data.success) return { code: null, link: null };
    return {
      code: data.code ?? null,
      link: data.link ?? null,
      subject: data.subject,
      from: data.from,
      via: data.via,
      scanned: data.scanned,
    };
  } catch {
    return { code: null, link: null };
  }
}
