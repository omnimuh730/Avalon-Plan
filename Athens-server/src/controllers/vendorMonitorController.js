import { getBidRecordsCollection } from "../db/mongo.js";
import { detectJobSource } from "../lib/jobSource.js";

/**
 * Vendor monitoring: the bid-assistant extension (via vender-server) writes bid
 * tracking records into the shared `bid_records` collection. These endpoints
 * read them back grouped by session for the lancer Vendor Monitor page.
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

function enrichSession(row) {
	const jobSource = detectJobSource(row.firstUrl ?? row.lastUrl);
	return {
		...row,
		jobSource,
	};
}

function resolveBidRecords(req) {
	const requested = String(req.query.source || "").trim().toLowerCase();
	const source = requested === "local" ? "local" : "cloud";
	return getBidRecordsCollection(source);
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
				recordCount: { $sum: 1 },
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
		const { source, collection, error } = resolveBidRecords(req);
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
		url,
		title: doc.title ?? null,
		triggerText: doc.triggerText ?? null,
		screenshot: toDataUrl(doc),
		analysis: doc.analysis ?? null,
		usage: doc.usage ?? null,
		trace: doc.trace ?? null,
		jobSource: doc.jobSource ?? detectJobSource(url),
		createdAt: doc.createdAt,
	};
}

/** GET /vendor/bid-sessions/:sessionId — full timeline incl. screenshots. */
export async function getBidSessionDetail(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords(req);
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
		const analysisCost = analysisRecords.reduce((sum, r) => sum + (r.usage?.cost ?? 0), 0);
		const analysisTokens = analysisRecords.reduce(
			(sum, r) => sum + (r.usage?.totalTokens ?? 0),
			0,
		);
		const totalCost =
			analysisRecords.length > 0 ? analysisCost : complete?.usage?.cost ?? 0;
		const totalTokens =
			analysisRecords.length > 0 ? analysisTokens : complete?.usage?.totalTokens ?? 0;

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
			recordCount: records.length,
			totalCost,
			totalTokens,
			firstUrl,
			firstTitle: start.title ?? null,
			lastUrl: complete?.url ?? records[records.length - 1]?.url ?? null,
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

/** DELETE /vendor/bid-sessions/:sessionId — remove all records for one session. */
export async function deleteBidSession(req, res) {
	try {
		const { source, collection, error } = resolveBidRecords(req);
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
		const { source, collection, error } = resolveBidRecords(req);
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
