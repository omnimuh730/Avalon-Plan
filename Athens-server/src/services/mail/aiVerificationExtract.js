/**
 * AI extraction of a verification code OR verification link from recent emails.
 * Used as a fallback when the language-based regex extractor (verificationCode.js)
 * finds nothing — it robustly handles alphanumeric/lowercase codes, per-character
 * HTML boxes, unusual phrasings, other languages, and "click this link" flows.
 *
 * Generic by construction: the model reads email CONTENT and decides; we never
 * branch on a sender, brand, or vendor string (per project-avalon/Guide.md).
 */
import { chatCompletion, resolveDefaultModel } from "../llm/llmService.js";

const SYSTEM_PROMPT = [
  "You extract the single most relevant account/application VERIFICATION credential from a list",
  "of recent emails. It is either a one-time CODE (digits or alphanumeric, any case, sometimes",
  "rendered one character per box) or a verification LINK to click.",
  "Return ONLY JSON: { \"found\": boolean, \"code\": string|null, \"link\": string|null, \"emailIndex\": number|null }.",
  "- code: the exact code to type (join per-character boxes into one string, keep original case). No spaces.",
  "- link: the full verification/confirm URL to open, if the email asks the user to click a link instead.",
  "- emailIndex: the 0-based index of the email you took it from.",
  "Prefer the MOST RECENT email that is clearly a verification/confirmation for submitting an application",
  "or confirming an email/human. Ignore marketing links, unsubscribe links, and unrelated codes (order",
  "numbers, tracking numbers). If nothing qualifies, return found=false with nulls.",
].join("\n");

function parseJsonLoose(text) {
  const raw = String(text ?? "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = fenced.indexOf("{");
  const last = fenced.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(fenced.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** The profile's default model/provider, or null if no key is configured. */
function pickProvider(profile) {
  const resolved = resolveDefaultModel(profile);
  return resolved.apiKey ? resolved : null;
}

/**
 * @param {Array<{from?:string, subject?:string, body?:string, date?:any}>} emails newest-first
 * @param {object} profile applier autoBidProfile (for the LLM key)
 * @returns {Promise<{ found:boolean, code:string|null, link:string|null, emailIndex:number|null, usage?:object }>}
 */
export async function aiExtractVerification(emails, profile) {
  const picked = pickProvider(profile);
  if (!picked) return { found: false, code: null, link: null, emailIndex: null };
  if (!Array.isArray(emails) || emails.length === 0) {
    return { found: false, code: null, link: null, emailIndex: null };
  }

  const payload = emails.slice(0, 12).map((e, i) => ({
    index: i,
    from: String(e.from || "").slice(0, 120),
    subject: String(e.subject || "").slice(0, 200),
    body: String(e.body || "").replace(/\s+/g, " ").trim().slice(0, 2500),
  }));

  const { content, usage } = await chatCompletion({
    provider: picked.provider,
    apiKey: picked.apiKey,
    model: picked.model,
    jsonMode: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Recent emails (newest first):\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\nReturn the JSON.` },
    ],
    timeoutMs: 45000,
  });

  const parsed = parseJsonLoose(content) || {};
  const code = typeof parsed.code === "string" && parsed.code.trim() ? parsed.code.trim() : null;
  const link = typeof parsed.link === "string" && /^https?:\/\//i.test(parsed.link.trim()) ? parsed.link.trim() : null;
  return {
    found: Boolean(parsed.found && (code || link)),
    code,
    link,
    emailIndex: Number.isInteger(parsed.emailIndex) ? parsed.emailIndex : null,
    usage,
  };
}
