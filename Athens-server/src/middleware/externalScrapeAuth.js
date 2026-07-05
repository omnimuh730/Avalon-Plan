const configuredKey = () => String(process.env.EXTERNAL_SCRAPE_API_KEY || "").trim();

function readProvidedKey(req) {
	const headerKey = String(req.headers["x-api-key"] || "").trim();
	if (headerKey) return headerKey;

	const auth = String(req.headers.authorization || "").trim();
	if (auth.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim();
	}
	return "";
}

/** Optional shared-secret gate for 3rd-party scrape ingestion. */
export function requireExternalScrapeApiKey(req, res, next) {
	const expected = configuredKey();
	if (!expected) return next();

	const provided = readProvidedKey(req);
	if (provided && provided === expected) return next();

	return res.status(401).json({
		success: false,
		error: "Invalid or missing API key. Send X-Api-Key or Authorization: Bearer <key>.",
	});
}
