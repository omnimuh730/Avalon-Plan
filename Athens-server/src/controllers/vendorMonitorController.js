import { getBidRecordsCollection } from "../db/mongo.js";
import { detectJobSource } from "../lib/jobSource.js";

/**
 * Vendor monitoring: the bid-assistant extension (via vender-server) writes bid
 * tracking records into the main MongoDB `bid_records` collection. These
 * endpoints read them back grouped by session for the lancer Vendor Monitor page.
 */

function toInt(value, fallback) {
	const n = Number.parseInt(String(value ?? ""), 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateQuery(value, endOfDay = false) {
	const raw = String(value ?? "").trim();
	if (!raw) return null;
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	if (endOfDay) {
		date.setHours(23, 59, 59, 999);
	} else {
		date.setHours(0, 0, 0, 0);
	}
	return date;
}

/** Parse an absolute ISO timestamp from the client (no server-local day shift). */
function parseIsoDate(value) {
	const raw = String(value ?? "").trim();
	if (!raw) return null;
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Validate IANA timezone from the browser; reject anything Node/Mongo cannot use. */
function resolveClientTimezone(value) {
	const tz = String(value ?? "").trim() || "UTC";
	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return tz;
	} catch {
		return null;
	}
}

function enrichSession(row) {
	const jobSource = detectJobSource(row.firstUrl ?? row.lastUrl);
	return {
		...row,
		jobSource,
		jdAnalyzed: Boolean(row.jdAnalyzed) || Number(row.analysisCount ?? 0) > 0,
		flags: normalizeFlags(row.flags),
	};
}

/** Normalize screening traffic-light verdicts from MongoDB docs. */
function normalizeFlagVerdict(verdict) {
	if (!verdict || typeof verdict !== "object") return null;
	const status = String(verdict.status ?? "").toLowerCase();
	if (status !== "green" && status !== "red") return null;
	return {
		status,
		explanation: String(verdict.explanation ?? "").trim(),
	};
}

function normalizeFlags(flags) {
	if (!flags || typeof flags !== "object") {
		return { remote: null, clearance: null };
	}
	return {
		remote: normalizeFlagVerdict(flags.remote),
		clearance: normalizeFlagVerdict(flags.clearance),
	};
}

/** Prefer the latest non-empty flags from analysis / complete records. */
function pickLatestFlags(docs) {
	let latest = null;
	for (const doc of docs) {
		if (doc.type !== "analysis" && doc.type !== "session-complete") continue;
		const flags = normalizeFlags(doc.flags);
		if (flags.remote || flags.clearance) latest = flags;
	}
	return latest ?? { remote: null, clearance: null };
}

function normalizeResumeLabel(name) {
	return String(name ?? "")
		.replace(/\.(pdf|docx)$/i, "")
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function resumeMatchesRecommended(originalName, recommendedName) {
	const upload = normalizeResumeLabel(originalName);
	const recommended = normalizeResumeLabel(recommendedName);
	if (!upload || !recommended) return false;
	return upload === recommended || upload.includes(recommended) || recommended.includes(upload);
}

function flagNotRed(verdict) {
	return !verdict || verdict.status !== "red";
}

/** Honesty / diligence metrics for Analytics. */
function summarizeSessionQuality(rows) {
	let analyzed = 0;
	let screeningClear = 0;
	let resumeMatched = 0;
	let requirementsMet = 0;

	for (const row of rows ?? []) {
		const jdOk = Boolean(row.jdAnalyzed) || Number(row.analysisCount ?? 0) > 0;
		if (jdOk) analyzed += 1;

		const flags = normalizeFlags(row.flags);
		const clear = flagNotRed(flags.remote) && flagNotRed(flags.clearance);
		if (clear) screeningClear += 1;

		const recommended = String(row.recommendedResumeName ?? "").trim();
		const originals = Array.isArray(row.resumeOriginals) ? row.resumeOriginals : [];
		const matched =
			Boolean(recommended) &&
			originals.some((name) => resumeMatchesRecommended(name, recommended));
		if (matched) resumeMatched += 1;

		if (row.status === "completed" && jdOk && clear && matched) {
			requirementsMet += 1;
		}
	}

	const total = (rows ?? []).length;
	const completed = (rows ?? []).filter((row) => row.status === "completed").length;
	return {
		analyzedSessions: analyzed,
		screeningClearSessions: screeningClear,
		resumeMatchedSessions: resumeMatched,
		requirementsMetSessions: requirementsMet,
		analyzedRate: total > 0 ? analyzed / total : 0,
		screeningClearRate: total > 0 ? screeningClear / total : 0,
		resumeMatchRate: total > 0 ? resumeMatched / total : 0,
		requirementsMetRate: completed > 0 ? requirementsMet / completed : 0,
	};
}

function resolveBidRecords() {
	return getBidRecordsCollection();
}

function buildListPipeline({ match, fromDate, toDate, limit }) {
	const pipeline = [
		...(Object.keys(match).length ? [{ $match: match }] : []),
		{ $sort: { createdAt: 1 } },
		{
			$group: {
				_id: "$sessionId",
				applierName: { $first: "$applierName" },
				profileId: { $first: "$profileId" },
				startedAt: { $min: "$createdAt" },
				lastAt: { $max: "$createdAt" },
				completedAt: {
					$max: {
						$cond: [{ $eq: ["$type", "session-complete"] }, "$createdAt", null],
					},
				},
				processCount: {
					$sum: { $cond: [{ $eq: ["$type", "process"] }, 1, 0] },
				},
				analysisCount: {
					$sum: { $cond: [{ $eq: ["$type", "analysis"] }, 1, 0] },
				},
				resumeUploadCount: {
					$sum: { $cond: [{ $eq: ["$type", "resume-upload"] }, 1, 0] },
				},
				recordCount: { $sum: 1 },
				modelVersion: { $last: "$modelVersion" },
				resumeUploadsFromComplete: {
					$push: {
						$cond: [
							{ $eq: ["$type", "session-complete"] },
							{ $ifNull: ["$resumeUploads", []] },
							"$$REMOVE",
						],
					},
				},
				resumeUploadsFromEvents: {
					$push: {
						$cond: [
							{ $eq: ["$type", "resume-upload"] },
							{
								originalName: "$originalName",
								cleanedName: "$cleanedName",
								renamed: "$renamed",
								source: "$uploadSource",
								pageUrl: "$url",
								ts: { $toLong: "$createdAt" },
								recommendedResumeName: "$recommendedResumeName",
							},
							"$$REMOVE",
						],
					},
				},
				analysisCost: {
					$sum: {
						$cond: [{ $eq: ["$type", "analysis"] }, { $ifNull: ["$usage.cost", 0] }, 0],
					},
				},
				analysisTokens: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "analysis"] },
							{ $ifNull: ["$usage.totalTokens", 0] },
							0,
						],
					},
				},
				completeCost: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "session-complete"] },
							{ $ifNull: ["$usage.cost", 0] },
							0,
						],
					},
				},
				completeTokens: {
					$sum: {
						$cond: [
							{ $eq: ["$type", "session-complete"] },
							{ $ifNull: ["$usage.totalTokens", 0] },
							0,
						],
					},
				},
				firstUrl: { $first: "$url" },
				firstTitle: { $first: "$title" },
				lastUrl: { $last: "$url" },
				flagsHistory: {
					$push: {
						$cond: [
							{
								$and: [
									{ $in: ["$type", ["analysis", "session-complete"]] },
									{ $ne: ["$flags", null] },
								],
							},
							"$flags",
							"$$REMOVE",
						],
					},
				},
				recommendedResumeHistory: {
					$push: {
						$cond: [
							{
								$and: [
									{ $eq: ["$type", "analysis"] },
									{ $ne: ["$analysis.bestResume.name", null] },
								],
							},
							"$analysis.bestResume.name",
							"$$REMOVE",
						],
					},
				},
				resumeOriginalHistory: {
					$push: {
						$cond: [
							{ $eq: ["$type", "resume-upload"] },
							{
								originalName: "$originalName",
								cleanedName: "$cleanedName",
								renamed: "$renamed",
								recommendedResumeName: "$recommendedResumeName",
							},
							"$$REMOVE",
						],
					},
				},
			},
		},
		{
			$addFields: {
				sessionId: "$_id",
				status: { $cond: [{ $ne: ["$completedAt", null] }, "completed", "active"] },
				totalCost: {
					$cond: [{ $gt: ["$analysisCost", 0] }, "$analysisCost", "$completeCost"],
				},
				totalTokens: {
					$cond: [{ $gt: ["$analysisTokens", 0] }, "$analysisTokens", "$completeTokens"],
				},
				jdAnalyzed: { $gt: ["$analysisCount", 0] },
				flags: {
					$let: {
						vars: {
							history: { $ifNull: ["$flagsHistory", []] },
						},
						in: {
							$cond: [
								{ $gt: [{ $size: "$$history" }, 0] },
								{ $arrayElemAt: ["$$history", -1] },
								null,
							],
						},
					},
				},
				recommendedResumeName: {
					$let: {
						vars: {
							history: { $ifNull: ["$recommendedResumeHistory", []] },
						},
						in: {
							$cond: [
								{ $gt: [{ $size: "$$history" }, 0] },
								{ $arrayElemAt: ["$$history", -1] },
								null,
							],
						},
					},
				},
				resumeUploadsFromAnalysis: { $ifNull: ["$resumeOriginalHistory", []] },
				resumeUploads: {
					$let: {
						vars: {
							fromComplete: {
								$first: { $ifNull: ["$resumeUploadsFromComplete", []] },
							},
							fromEvents: { $ifNull: ["$resumeUploadsFromEvents", []] },
							fromOriginals: { $ifNull: ["$resumeOriginalHistory", []] },
						},
						in: {
							$cond: [
								{ $gt: [{ $size: { $ifNull: ["$$fromOriginals", []] } }, 0] },
								"$$fromOriginals",
								{
									$cond: [
										{
											$gt: [{ $size: { $ifNull: ["$$fromComplete", []] } }, 0],
										},
										"$$fromComplete",
										"$$fromEvents",
									],
								},
							],
						},
					},
				},
			},
		},
		// Show every started session, not just completed ones. Sessions without a
		// `session-complete` record surface as status "active" (rendered as "live"
		// in the UI). Previously a `completedAt != null` filter hid them, so when
		// no session was ever completed the Vendor Monitor appeared empty even
		// though bid_records existed.
	];

	if (fromDate || toDate) {
		const dateMatch = {};
		if (fromDate) dateMatch.$gte = fromDate;
		if (toDate) dateMatch.$lte = toDate;
		pipeline.push({ $match: { startedAt: dateMatch } });
	}

	pipeline.push(
		{
			$project: {
				_id: 0,
				analysisCost: 0,
				analysisTokens: 0,
				completeCost: 0,
				completeTokens: 0,
				resumeUploadsFromComplete: 0,
				resumeUploadsFromEvents: 0,
				resumeUploadsFromAnalysis: 0,
				flagsHistory: 0,
				recommendedResumeHistory: 0,
				resumeOriginalHistory: 0,
			},
		},
		{ $sort: { startedAt: -1 } },
		{ $limit: limit },
	);

	return pipeline;
}

/** GET /vendor/bid-sessions — summary list (no screenshots), newest first. */
export async function getBidSessions(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords();
		if (!collection) {
			return res.status(503).json({
				success: false,
				source,
				error: `Bid records database not ready for ${source}: ${error}`,
			});
		}

		const limit = Math.min(toInt(req.query.limit, 50), 200);
		const match = {};
		if (req.query.profileId) match.profileId = String(req.query.profileId);
		if (req.query.applierName) match.applierName = String(req.query.applierName);

		const fromDate = parseDateQuery(req.query.from);
		const toDate = parseDateQuery(req.query.to, true);

		const pipeline = buildListPipeline({ match, fromDate, toDate, limit });
		const sessions = (await collection.aggregate(pipeline).toArray()).map(enrichSession);

		return res.json({ success: true, source, sessions });
	} catch (err) {
		console.error("[vendor] getBidSessions failed", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}

function toDataUrl(record) {
	if (!record.screenshot || !record.screenshotMime) return null;
	return `data:${record.screenshotMime};base64,${record.screenshot}`;
}

function mapRecord(doc) {
	const url = doc.url ?? null;
	return {
		id: String(doc._id),
		type: doc.type,
		modelVersion: doc.modelVersion ?? null,
		url,
		title: doc.title ?? null,
		triggerText: doc.triggerText ?? null,
		screenshot: toDataUrl(doc),
		analysis: doc.analysis ?? null,
		usage: doc.usage ?? null,
		trace: doc.trace ?? null,
		flags: normalizeFlags(doc.flags),
		jobSource: doc.jobSource ?? detectJobSource(url),
		originalName: doc.originalName ?? null,
		cleanedName: doc.cleanedName ?? null,
		renamed: Boolean(doc.renamed),
		uploadSource: doc.uploadSource ?? null,
		recommendedResumeName: doc.recommendedResumeName ?? null,
		resumeUploads: Array.isArray(doc.resumeUploads) ? doc.resumeUploads : [],
		createdAt: doc.createdAt,
	};
}

/** GET /vendor/bid-sessions/:sessionId — full timeline incl. screenshots. */
export async function getBidSessionDetail(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords();
		if (!collection) {
			return res.status(503).json({
				success: false,
				source,
				error: `Bid records database not ready for ${source}: ${error}`,
			});
		}

		const sessionId = String(req.params.sessionId || "").trim();
		if (!sessionId) {
			return res.status(400).json({ success: false, error: "sessionId is required" });
		}

		const docs = await collection.find({ sessionId }).sort({ createdAt: 1 }).toArray();

		if (docs.length === 0) {
			return res.status(404).json({ success: false, error: "Session not found" });
		}

		const records = docs.map(mapRecord);
		const start = docs[0];
		const complete = docs.find((d) => d.type === "session-complete");
		const analysisRecords = records.filter((r) => r.type === "analysis");
		const resumeUploadRecords = records.filter((r) => r.type === "resume-upload");
		const analysisCost = analysisRecords.reduce((sum, r) => sum + (r.usage?.cost ?? 0), 0);
		const analysisTokens = analysisRecords.reduce(
			(sum, r) => sum + (r.usage?.totalTokens ?? 0),
			0,
		);
		const totalCost =
			analysisRecords.length > 0 ? analysisCost : complete?.usage?.cost ?? 0;
		const totalTokens =
			analysisRecords.length > 0 ? analysisTokens : complete?.usage?.totalTokens ?? 0;

		const resumeUploads =
			resumeUploadRecords.length > 0
				? resumeUploadRecords.map((r) => ({
						originalName: r.originalName,
						cleanedName: r.cleanedName,
						renamed: r.renamed,
						source: r.uploadSource,
						pageUrl: r.url,
						ts: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
						recommendedResumeName: r.recommendedResumeName ?? null,
					}))
				: Array.isArray(complete?.resumeUploads) && complete.resumeUploads.length > 0
					? complete.resumeUploads
					: [];

		const recommendedResumeName =
			[...analysisRecords]
				.reverse()
				.map((r) => r.analysis?.bestResume?.name)
				.find((name) => typeof name === "string" && name.trim()) ?? null;

		const firstUrl = start.url ?? null;
		const session = enrichSession({
			sessionId,
			applierName: start.applierName ?? null,
			profileId: start.profileId ?? null,
			startedAt: start.createdAt,
			completedAt: complete?.createdAt ?? null,
			status: complete ? "completed" : "active",
			processCount: records.filter((r) => r.type === "process").length,
			analysisCount: analysisRecords.length,
			resumeUploadCount: resumeUploadRecords.length,
			recordCount: records.length,
			totalCost,
			totalTokens,
			firstUrl,
			firstTitle: start.title ?? null,
			lastUrl: complete?.url ?? records[records.length - 1]?.url ?? null,
			modelVersion: complete?.modelVersion ?? start.modelVersion ?? null,
			resumeUploads,
			recommendedResumeName,
			jdAnalyzed: analysisRecords.length > 0,
			flags: pickLatestFlags(docs),
		});

		return res.json({
			success: true,
			session,
			records,
		});
	} catch (err) {
		console.error("[vendor] getBidSessionDetail failed", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}

/**
 * GET /vendor/bid-sessions/analytics — session aggregates for charts.
 * Day buckets use the client's IANA timezone (query `timezone`), not the server's.
 */
export async function getBidSessionsAnalytics(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords();
		if (!collection) {
			return res.status(503).json({
				success: false,
				source,
				error: `Bid records database not ready for ${source}: ${error}`,
			});
		}

		const timezone = resolveClientTimezone(req.query.timezone);
		if (!timezone) {
			return res.status(400).json({
				success: false,
				error: "Invalid timezone. Pass a valid IANA timezone (e.g. America/Chicago).",
			});
		}

		const match = {};
		if (req.query.profileId) match.profileId = String(req.query.profileId);
		if (req.query.applierName) match.applierName = String(req.query.applierName);

		const since = parseIsoDate(req.query.since ?? req.query.from);
		const until = parseIsoDate(req.query.until ?? req.query.to);
		if (since || until) {
			match.createdAt = {};
			if (since) match.createdAt.$gte = since;
			if (until) match.createdAt.$lte = until;
		}

		const sessionStages = [
			...(Object.keys(match).length ? [{ $match: match }] : []),
			{ $sort: { createdAt: 1 } },
			{
				$group: {
					_id: "$sessionId",
					startedAt: { $min: "$createdAt" },
					completedAt: {
						$max: {
							$cond: [{ $eq: ["$type", "session-complete"] }, "$createdAt", null],
						},
					},
					processCount: {
						$sum: { $cond: [{ $eq: ["$type", "process"] }, 1, 0] },
					},
					analysisCount: {
						$sum: { $cond: [{ $eq: ["$type", "analysis"] }, 1, 0] },
					},
					resumeUploadCount: {
						$sum: { $cond: [{ $eq: ["$type", "resume-upload"] }, 1, 0] },
					},
					analysisCost: {
						$sum: {
							$cond: [{ $eq: ["$type", "analysis"] }, { $ifNull: ["$usage.cost", 0] }, 0],
						},
					},
					analysisTokens: {
						$sum: {
							$cond: [
								{ $eq: ["$type", "analysis"] },
								{ $ifNull: ["$usage.totalTokens", 0] },
								0,
							],
						},
					},
					completeCost: {
						$sum: {
							$cond: [
								{ $eq: ["$type", "session-complete"] },
								{ $ifNull: ["$usage.cost", 0] },
								0,
							],
						},
					},
					completeTokens: {
						$sum: {
							$cond: [
								{ $eq: ["$type", "session-complete"] },
								{ $ifNull: ["$usage.totalTokens", 0] },
								0,
							],
						},
					},
					firstUrl: { $first: "$url" },
					lastUrl: { $last: "$url" },
					flagsHistory: {
						$push: {
							$cond: [
								{
									$and: [
										{ $in: ["$type", ["analysis", "session-complete"]] },
										{ $ne: ["$flags", null] },
									],
								},
								"$flags",
								"$$REMOVE",
							],
						},
					},
					recommendedResumeHistory: {
						$push: {
							$cond: [
								{
									$and: [
										{ $eq: ["$type", "analysis"] },
										{ $ne: ["$analysis.bestResume.name", null] },
									],
								},
								"$analysis.bestResume.name",
								"$$REMOVE",
							],
						},
					},
					resumeOriginalHistory: {
						$push: {
							$cond: [
								{ $eq: ["$type", "resume-upload"] },
								"$originalName",
								"$$REMOVE",
							],
						},
					},
				},
			},
			{
				$addFields: {
					status: { $cond: [{ $ne: ["$completedAt", null] }, "completed", "active"] },
					totalCost: {
						$cond: [{ $gt: ["$analysisCost", 0] }, "$analysisCost", "$completeCost"],
					},
					totalTokens: {
						$cond: [{ $gt: ["$analysisTokens", 0] }, "$analysisTokens", "$completeTokens"],
					},
					durationMs: {
						$cond: [
							{ $and: [{ $ne: ["$completedAt", null] }, { $ne: ["$startedAt", null] }] },
							{ $subtract: ["$completedAt", "$startedAt"] },
							null,
						],
					},
					jdAnalyzed: { $gt: ["$analysisCount", 0] },
					flags: {
						$let: {
							vars: { history: { $ifNull: ["$flagsHistory", []] } },
							in: {
								$cond: [
									{ $gt: [{ $size: "$$history" }, 0] },
									{ $arrayElemAt: ["$$history", -1] },
									null,
								],
							},
						},
					},
					recommendedResumeName: {
						$let: {
							vars: { history: { $ifNull: ["$recommendedResumeHistory", []] } },
							in: {
								$cond: [
									{ $gt: [{ $size: "$$history" }, 0] },
									{ $arrayElemAt: ["$$history", -1] },
									null,
								],
							},
						},
					},
					resumeOriginals: { $ifNull: ["$resumeOriginalHistory", []] },
				},
			},
		];

		// Keep sessions whose start falls inside the client-provided absolute range.
		if (since || until) {
			const startedMatch = {};
			if (since) startedMatch.$gte = since;
			if (until) startedMatch.$lte = until;
			sessionStages.push({ $match: { startedAt: startedMatch } });
		}

		const [facet] = await collection
			.aggregate([
				...sessionStages,
				{
					$facet: {
						totals: [
							{
								$group: {
									_id: null,
									sessions: { $sum: 1 },
									completed: {
										$sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
									},
									active: {
										$sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
									},
									totalCost: { $sum: "$totalCost" },
									totalTokens: { $sum: "$totalTokens" },
									processCount: { $sum: "$processCount" },
									analysisCount: { $sum: "$analysisCount" },
									resumeUploadCount: { $sum: "$resumeUploadCount" },
									durationSumMs: {
										$sum: { $ifNull: ["$durationMs", 0] },
									},
									durationCount: {
										$sum: {
											$cond: [{ $ne: ["$durationMs", null] }, 1, 0],
										},
									},
								},
							},
						],
						byDay: [
							{
								$group: {
									_id: {
										$dateToString: {
											format: "%Y-%m-%d",
											date: "$startedAt",
											timezone,
										},
									},
									sessions: { $sum: 1 },
									completed: {
										$sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
									},
									totalCost: { $sum: "$totalCost" },
									totalTokens: { $sum: "$totalTokens" },
									processCount: { $sum: "$processCount" },
									analysisCount: { $sum: "$analysisCount" },
									resumeUploadCount: { $sum: "$resumeUploadCount" },
								},
							},
							{ $sort: { _id: 1 } },
						],
						byHour: [
							{
								$group: {
									_id: {
										$dateToString: {
											format: "%Y-%m-%dT%H:00",
											date: "$startedAt",
											timezone,
										},
									},
									sessions: { $sum: 1 },
									completed: {
										$sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
									},
									totalCost: { $sum: "$totalCost" },
									totalTokens: { $sum: "$totalTokens" },
									processCount: { $sum: "$processCount" },
									analysisCount: { $sum: "$analysisCount" },
									resumeUploadCount: { $sum: "$resumeUploadCount" },
								},
							},
							{ $sort: { _id: 1 } },
						],
						byUrl: [
							{
								$project: {
									firstUrl: 1,
									lastUrl: 1,
									totalCost: 1,
									status: 1,
								},
							},
						],
						qualityRows: [
							{
								$project: {
									status: 1,
									jdAnalyzed: 1,
									analysisCount: 1,
									flags: 1,
									recommendedResumeName: 1,
									resumeOriginals: 1,
								},
							},
						],
					},
				},
			])
			.toArray();

		const rawTotals = facet?.totals?.[0] ?? null;
		const completed = rawTotals?.completed ?? 0;
		const sessions = rawTotals?.sessions ?? 0;
		const durationCount = rawTotals?.durationCount ?? 0;

		const quality = summarizeSessionQuality(facet?.qualityRows ?? []);
		const totals = {
			sessions,
			completed,
			active: rawTotals?.active ?? 0,
			totalCost: rawTotals?.totalCost ?? 0,
			totalTokens: rawTotals?.totalTokens ?? 0,
			processCount: rawTotals?.processCount ?? 0,
			analysisCount: rawTotals?.analysisCount ?? 0,
			resumeUploadCount: rawTotals?.resumeUploadCount ?? 0,
			avgDurationMs:
				durationCount > 0 ? Math.round((rawTotals?.durationSumMs ?? 0) / durationCount) : 0,
			completionRate: sessions > 0 ? completed / sessions : 0,
			...quality,
		};

		const mapBucket = (row) => ({
			bucket: row._id,
			sessions: row.sessions ?? 0,
			completed: row.completed ?? 0,
			totalCost: row.totalCost ?? 0,
			totalTokens: row.totalTokens ?? 0,
			processCount: row.processCount ?? 0,
			analysisCount: row.analysisCount ?? 0,
			resumeUploadCount: row.resumeUploadCount ?? 0,
		});

		const byDay = (facet?.byDay ?? []).map(mapBucket).map((row) => ({
			day: row.bucket,
			sessions: row.sessions,
			completed: row.completed,
			totalCost: row.totalCost,
			totalTokens: row.totalTokens,
			processCount: row.processCount,
			analysisCount: row.analysisCount,
			resumeUploadCount: row.resumeUploadCount,
		}));
		const byHour = (facet?.byHour ?? []).map(mapBucket);

		const spanMs =
			since && until ? until.getTime() - since.getTime() : Number.POSITIVE_INFINITY;
		const granularityParam = String(req.query.granularity ?? "auto").trim().toLowerCase();
		let granularity = "day";
		if (granularityParam === "hour") granularity = "hour";
		else if (granularityParam === "day") granularity = "day";
		else if (spanMs <= 36 * 60 * 60 * 1000) granularity = "hour";

		const byBucket = granularity === "hour" ? byHour : byDay.map((row) => ({
			bucket: row.day,
			sessions: row.sessions,
			completed: row.completed,
			totalCost: row.totalCost,
			totalTokens: row.totalTokens,
			processCount: row.processCount,
			analysisCount: row.analysisCount,
			resumeUploadCount: row.resumeUploadCount,
		}));

		const sourceMap = new Map();
		for (const row of facet?.byUrl ?? []) {
			const jobSource = detectJobSource(row.firstUrl ?? row.lastUrl);
			const key = (jobSource?.label || "Unknown").toLowerCase();
			const existing = sourceMap.get(key) ?? {
				label: jobSource?.label ?? "Unknown",
				host: jobSource?.host ?? null,
				sessions: 0,
				completed: 0,
				totalCost: 0,
			};
			existing.sessions += 1;
			if (row.status === "completed") existing.completed += 1;
			existing.totalCost += row.totalCost ?? 0;
			sourceMap.set(key, existing);
		}
		const byJobSource = [...sourceMap.values()].sort((a, b) => b.sessions - a.sessions);

		return res.json({
			success: true,
			source,
			timezone,
			granularity,
			since: since?.toISOString() ?? null,
			until: until?.toISOString() ?? null,
			totals,
			byDay,
			byHour,
			byBucket,
			byJobSource,
		});
	} catch (err) {
		console.error("[vendor] getBidSessionsAnalytics failed", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}

/** DELETE /vendor/bid-sessions/:sessionId — remove all records for one session. */
export async function deleteBidSession(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords();
		if (!collection) {
			return res.status(503).json({
				success: false,
				source,
				error: `Bid records database not ready for ${source}: ${error}`,
			});
		}

		const sessionId = String(req.params.sessionId || "").trim();
		if (!sessionId) {
			return res.status(400).json({ success: false, error: "sessionId is required" });
		}

		const result = await collection.deleteMany({ sessionId });
		if (result.deletedCount === 0) {
			return res.status(404).json({ success: false, error: "Session not found" });
		}

		return res.json({ success: true, source, deletedCount: result.deletedCount, sessionId });
	} catch (err) {
		console.error("[vendor] deleteBidSession failed", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}

/** DELETE /vendor/bid-sessions — bulk delete by applier + optional date range. */
export async function deleteBidSessionsBulk(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords();
		if (!collection) {
			return res.status(503).json({
				success: false,
				source,
				error: `Bid records database not ready for ${source}: ${error}`,
			});
		}

		const applierName = String(req.query.applierName ?? req.body?.applierName ?? "").trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required" });
		}

		const fromDate = parseDateQuery(req.query.from ?? req.body?.from);
		const toDate = parseDateQuery(req.query.to ?? req.body?.to, true);
		const beforeDate = parseDateQuery(req.query.before ?? req.body?.before, true);

		const match = { applierName };
		const dateMatch = {};
		if (fromDate) dateMatch.$gte = fromDate;
		if (toDate) dateMatch.$lte = toDate;
		if (beforeDate) dateMatch.$lte = beforeDate;
		if (Object.keys(dateMatch).length > 0) {
			match.createdAt = dateMatch;
		}

		const result = await collection.deleteMany(match);
		return res.json({
			success: true,
			source,
			deletedCount: result.deletedCount,
			applierName,
		});
	} catch (err) {
		console.error("[vendor] deleteBidSessionsBulk failed", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}
