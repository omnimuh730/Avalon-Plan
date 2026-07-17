import { analyzeJobFlags, analyzeJobPage } from "../services/bidJobAnalyzeService.js";

/**
 * POST /api/job-analyze/page
 * body: { pageContext, applierName?, sessionContext? }
 */
export async function postJobAnalyzePage(req, res) {
	try {
		const pageContext = req.body?.pageContext;
		const applierName = String(req.body?.applierName ?? "").trim();
		const sessionContext =
			req.body?.sessionContext && typeof req.body.sessionContext === "object"
				? req.body.sessionContext
				: null;

		const { result, usage, mode } = await analyzeJobPage({
			pageContext,
			applierName,
			sessionContext,
		});

		return res.json({ ok: true, success: true, result, usage, mode });
	} catch (err) {
		console.error("[job-analyze/page] failed", err);
		return res.status(400).json({
			ok: false,
			success: false,
			error: err.message || "Page analysis failed.",
		});
	}
}

/**
 * POST /api/job-analyze/flags
 * body: { pageContext, applierName?, sessionContext?, neededFlags? }
 */
export async function postJobAnalyzeFlags(req, res) {
	try {
		const pageContext = req.body?.pageContext;
		const applierName = String(req.body?.applierName ?? "").trim();
		const sessionContext =
			req.body?.sessionContext && typeof req.body.sessionContext === "object"
				? req.body.sessionContext
				: null;
		const neededFlags = Array.isArray(req.body?.neededFlags)
			? req.body.neededFlags
			: ["remote", "clearance"];

		const { result, usage, mode } = await analyzeJobFlags({
			pageContext,
			applierName,
			sessionContext,
			neededFlags,
		});

		return res.json({ ok: true, success: true, result, usage, mode });
	} catch (err) {
		console.error("[job-analyze/flags] failed", err);
		return res.status(400).json({
			ok: false,
			success: false,
			error: err.message || "Flag analysis failed.",
		});
	}
}
