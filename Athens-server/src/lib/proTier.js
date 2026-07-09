/** Mirrors Athens frontend `isProTier` in `src/app/lib/pro.ts`. */
export function isProTier(tier) {
	return String(tier ?? '').trim().toLowerCase() === 'pro';
}
