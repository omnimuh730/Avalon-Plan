import { API_BASE } from "@/lib/api-base";

export interface VerificationCodeResult {
  code: string | null;
  subject?: string | null;
  from?: string | null;
}

/**
 * Fetch the most recent one-time / verification code from the applier's inbox
 * (IMAP Gmail). Used by the auto-apply self-healing loop when a page asks for an
 * email verification code. Returns { code: null } when none is found; never throws.
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
    if (!res.ok) return { code: null };
    const data = (await res.json()) as {
      success?: boolean;
      code?: string | null;
      subject?: string | null;
      from?: string | null;
    };
    if (!data.success) return { code: null };
    return { code: data.code ?? null, subject: data.subject, from: data.from };
  } catch {
    return { code: null };
  }
}
