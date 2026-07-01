/**
 * Extract a one-time / verification code from email text. Purely language-based —
 * it keys off generic verification vocabulary ("code", "verification", "OTP", …)
 * and never off any sender, brand, or vendor string, so it works for any site.
 */

const KEYWORDS =
  "verification|verify|security|one[- ]?time|confirmation|confirm|access|login|log[- ]?in|sign[- ]?in|authenticat(?:e|ion)|otp|passcode|pass ?code|pin|code";

// A digit run (4–8) that appears right after a verification keyword:
//   "your verification code is 123456", "security code: 048192"
const CODE_AFTER_KEYWORD = new RegExp(`(?:${KEYWORDS})[^0-9]{0,40}([0-9]{4,8})`, "i");

// A digit run right before the keyword: "123456 is your verification code"
const CODE_BEFORE_KEYWORD = new RegExp(
  `\\b([0-9]{4,8})\\b[^0-9]{0,30}(?:is your|${KEYWORDS})`,
  "i",
);

// Alphanumeric codes near a keyword: "code: A1B2C3" (must contain a digit).
const ALNUM_NEAR_KEYWORD = new RegExp(`(?:${KEYWORDS})[^A-Za-z0-9]{0,20}([A-Z0-9]{5,8})\\b`, "i");

// Greenhouse-style: codes split across single-char inputs, often rendered in
// HTML as spaced digits: "1 2 3 4 5 6" or "1-2-3-4-5-6" or "1&nbsp;2&nbsp;3..."
const SPACED_CODE = /\b([0-9])[\s\-–—&nbsp;]{1,3}([0-9])[\s\-–—&nbsp;]{1,3}([0-9])[\s\-–—&nbsp;]{1,3}([0-9])[\s\-–—&nbsp;]{1,3}([0-9])[\s\-–—&nbsp;]{1,3}([0-9])(?:[\s\-–—&nbsp;]{1,3}([0-9])[\s\-–—&nbsp;]{1,3}([0-9]))?\b/;

// Digit runs that appear in <div>/<td>/<span> tags (common in Greenhouse HTML emails
// where each digit gets its own styled box). We collapse and re-scan the plain-text.
// This is handled by stripping HTML and running the above patterns on bodyText.

/**
 * Convert HTML to plain text for code extraction. Strips tags and normalizes
 * whitespace so that codes rendered in <td>/<div> grids become scannable.
 */
function htmlToPlainText(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<\/?div[^>]*>/gi, "\n")
    .replace(/<\/?td[^>]*>/gi, " ")
    .replace(/<\/?tr[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#?[a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} text
 * @returns {string|null} the code, or null if none found.
 */
export function extractVerificationCode(text) {
  const t = String(text || "");
  if (!t) return null;

  // 1. Standard patterns on raw text
  let m = t.match(CODE_AFTER_KEYWORD);
  if (m) return m[1];

  m = t.match(CODE_BEFORE_KEYWORD);
  if (m) return m[1];

  m = t.match(ALNUM_NEAR_KEYWORD);
  if (m && /[0-9]/.test(m[1])) return m[1];

  // 2. Spaced/split digit codes (Greenhouse-style single-char inputs)
  m = t.match(SPACED_CODE);
  if (m) {
    // Reconstruct: join all captured digit groups
    const digits = m.slice(1).filter(Boolean).join("");
    if (digits.length >= 4 && digits.length <= 8) return digits;
  }

  // 3. Try on plain-text version (strip HTML if present)
  if (/<[^>]+>/.test(t)) {
    const plain = htmlToPlainText(t);
    if (plain && plain !== t) {
      return extractVerificationCode(plain);
    }
  }

  return null;
}
