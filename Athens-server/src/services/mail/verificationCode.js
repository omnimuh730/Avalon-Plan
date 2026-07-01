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

/**
 * @param {string} text
 * @returns {string|null} the code, or null if none found.
 */
export function extractVerificationCode(text) {
  const t = String(text || "");
  if (!t) return null;

  let m = t.match(CODE_AFTER_KEYWORD);
  if (m) return m[1];

  m = t.match(CODE_BEFORE_KEYWORD);
  if (m) return m[1];

  m = t.match(ALNUM_NEAR_KEYWORD);
  if (m && /[0-9]/.test(m[1])) return m[1];

  return null;
}
