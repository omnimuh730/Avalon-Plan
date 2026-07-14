import { ObjectId } from "mongodb";
import {
	accountInfoCollection,
	getBidRecordsCollection,
	getVendorTasksCollection,
	jobsCollection,
} from "../db/mongo.js";
import { detectJobSource } from "../lib/jobSource.js";

const TASK_STATUSES = new Set(["pending", "done", "skipped"]);

function normalizeUrlKey(url) {
	const raw = String(url ?? "").trim();
	if (!raw) return "";
	try {
		const u = new URL(raw);
		return `${u.hostname}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
	} catch {
		return raw.toLowerCase();
	}
}

function serializeTask(doc, sessionMatch = null) {
	const applyUrl = doc.applyUrl ?? null;
	const jobSource = detectJobSource(applyUrl);
	let progress = "idle";
	if (doc.status === "done") progress = "completed";
	else if (doc.status === "skipped") progress = "skipped";
	else if (sessionMatch?.completed) progress = "completed";
	else if (sessionMatch) progress = "active";

	return {
		id: String(doc._id),
		applierName: doc.applierName ?? null,
		jobId: doc.jobId ?? null,
		title: doc.title ?? "Untitled role",
		company: doc.company ?? "",
		applyUrl,
		source: doc.source ?? jobSource?.label ?? "",
		location: doc.location ?? "",
		workMode: doc.workMode ?? "",
		matchScore: typeof doc.matchScore === "number" ? doc.matchScore : null,
		status: TASK_STATUSES.has(doc.status) ? doc.status : "pending",
		progress,
		sessionMatch: sessionMatch
			? {
					sessionId: sessionMatch.sessionId,
					lastSeenAt: sessionMatch.lastSeenAt,
					completed: Boolean(sessionMatch.completed),
				}
			: null,
		jobSource,
		addedAt: doc.addedAt instanceof Date ? doc.addedAt.toISOString() : doc.addedAt ?? null,
		updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt ?? null,
		completedAt:
			doc.completedAt instanceof Date
				? doc.completedAt.toISOString()
				: doc.completedAt ?? null,
	};
}

function resolveVendorTasks() {
	const collection = getVendorTasksCollection();
	if (!collection) {
		return { collection: null, error: "MongoDB is not connected." };
	}
	return { collection, error: null };
}

async function buildSessionMatchMap(applierName) {
	const { collection, error } = getBidRecordsCollection();
	if (error || !collection) return new Map();

	const rows = await collection
		.find(
			{ applierName, url: { $type: "string", $ne: "" } },
			{ projection: { sessionId: 1, url: 1, type: 1, createdAt: 1 } },
		)
		.sort({ createdAt: -1 })
		.limit(5000)
		.toArray();

	const map = new Map();
	for (const row of rows) {
		const key = normalizeUrlKey(row.url);
		if (!key) continue;
		const existing = map.get(key);
		const completed = row.type === "session-complete";
		if (!existing) {
			map.set(key, {
				sessionId: row.sessionId,
				lastSeenAt: row.createdAt,
				completed,
			});
			continue;
		}
		if (completed) existing.completed = true;
		if (row.createdAt && (!existing.lastSeenAt || row.createdAt > existing.lastSeenAt)) {
			existing.lastSeenAt = row.createdAt;
			existing.sessionId = row.sessionId || existing.sessionId;
		}
	}
	return map;
}

function findSessionMatch(applyUrl, matchMap) {
	const key = normalizeUrlKey(applyUrl);
	if (!key) return null;
	if (matchMap.has(key)) return matchMap.get(key);
	// Soft match: any bid URL that contains this key (or vice versa) for tracking params.
	for (const [bidKey, match] of matchMap) {
		if (bidKey.includes(key) || key.includes(bidKey)) return match;
	}
	return null;
}

/**
 * GET /vendor/tasks?applierName=
 */
export async function listVendorTasks(req, res) {
	try {
		const applierName = String(req.query.applierName ?? "").trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const docs = await collection
			.find({ applierName })
			.sort({ addedAt: -1 })
			.limit(1000)
			.toArray();

		const matchMap = await buildSessionMatchMap(applierName);
		const tasks = docs.map((doc) =>
			serializeTask(doc, findSessionMatch(doc.applyUrl, matchMap)),
		);

		const totals = {
			total: tasks.length,
			pending: tasks.filter((t) => t.status === "pending" && t.progress === "idle").length,
			active: tasks.filter((t) => t.progress === "active").length,
			done: tasks.filter((t) => t.progress === "completed" || t.status === "done").length,
			skipped: tasks.filter((t) => t.status === "skipped").length,
		};

		return res.json({ success: true, tasks, totals });
	} catch (err) {
		console.error("[vendor/tasks] list failed", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to list tasks." });
	}
}

/**
 * POST /vendor/tasks
 * body: { applierName, jobs: [{ jobId, title, company, applyUrl, source, location, workMode, matchScore }] }
 */
export async function addVendorTasks(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}
		if (!jobs.length) {
			return res.status(400).json({ success: false, error: "jobs array is required." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const now = new Date();
		const toInsert = [];
		const skipped = [];

		for (const raw of jobs) {
			const jobId = String(raw?.jobId ?? raw?.id ?? "").trim();
			const applyUrl = String(raw?.applyUrl ?? "").trim();
			if (!jobId && !applyUrl) {
				skipped.push({ reason: "missing jobId/applyUrl", job: raw });
				continue;
			}

			const existingQuery = jobId
				? { applierName, jobId }
				: { applierName, applyUrl };
			const existing = await collection.findOne(existingQuery, { projection: { _id: 1 } });
			if (existing) {
				skipped.push({ reason: "already_in_pool", jobId, applyUrl });
				continue;
			}

			toInsert.push({
				applierName,
				jobId: jobId || null,
				title: String(raw?.title ?? "Untitled role").trim() || "Untitled role",
				company: String(raw?.company ?? "").trim(),
				applyUrl: applyUrl || null,
				source: String(raw?.source ?? "").trim(),
				location: String(raw?.location ?? "").trim(),
				workMode: String(raw?.workMode ?? "").trim(),
				matchScore: typeof raw?.matchScore === "number" ? raw.matchScore : null,
				status: "pending",
				addedAt: now,
				updatedAt: now,
				completedAt: null,
			});
		}

		let inserted = [];
		if (toInsert.length) {
			try {
				const result = await collection.insertMany(toInsert, { ordered: false });
				const ids = Object.values(result.insertedIds);
				inserted = await collection.find({ _id: { $in: ids } }).toArray();
			} catch (err) {
				// ordered:false — some docs may still insert on duplicate-key races
				if (err?.insertedIds) {
					const ids = Object.values(err.insertedIds);
					if (ids.length) {
						inserted = await collection.find({ _id: { $in: ids } }).toArray();
					}
				} else if (err?.result?.insertedIds) {
					const ids = Object.values(err.result.insertedIds);
					if (ids.length) {
						inserted = await collection.find({ _id: { $in: ids } }).toArray();
					}
				} else {
					throw err;
				}
				const dupCount = toInsert.length - inserted.length;
				if (dupCount > 0) {
					skipped.push(
						...Array.from({ length: dupCount }, () => ({ reason: "already_in_pool" })),
					);
				}
			}
		}

		return res.json({
			success: true,
			added: inserted.map((d) => serializeTask(d)),
			addedCount: inserted.length,
			skippedCount: skipped.length,
			skipped,
		});
	} catch (err) {
		console.error("[vendor/tasks] add failed", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to add tasks." });
	}
}

/**
 * PATCH /vendor/tasks/:taskId
 * body: { status: 'pending' | 'done' | 'skipped' }
 */
export async function updateVendorTask(req, res) {
	try {
		const taskId = String(req.params.taskId ?? "").trim();
		const status = String(req.body?.status ?? "").trim();
		if (!ObjectId.isValid(taskId)) {
			return res.status(400).json({ success: false, error: "Invalid taskId." });
		}
		if (!TASK_STATUSES.has(status)) {
			return res.status(400).json({ success: false, error: "status must be pending, done, or skipped." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const now = new Date();
		const update = {
			status,
			updatedAt: now,
			completedAt: status === "done" ? now : null,
		};

		const result = await collection.findOneAndUpdate(
			{ _id: new ObjectId(taskId) },
			{ $set: update },
			{ returnDocument: "after" },
		);

		const doc = result?.value ?? result;
		if (!doc || !doc._id) {
			return res.status(404).json({ success: false, error: "Task not found." });
		}

		return res.json({ success: true, task: serializeTask(doc) });
	} catch (err) {
		console.error("[vendor/tasks] update failed", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to update task." });
	}
}

/**
 * DELETE /vendor/tasks/:taskId
 */
export async function deleteVendorTask(req, res) {
	try {
		const taskId = String(req.params.taskId ?? "").trim();
		if (!ObjectId.isValid(taskId)) {
			return res.status(400).json({ success: false, error: "Invalid taskId." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const result = await collection.deleteOne({ _id: new ObjectId(taskId) });
		if (!result.deletedCount) {
			return res.status(404).json({ success: false, error: "Task not found." });
		}
		return res.json({ success: true, deleted: 1 });
	} catch (err) {
		console.error("[vendor/tasks] delete failed", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to delete task." });
	}
}

/**
 * DELETE /vendor/tasks?applierName=
 */
export async function clearVendorTasks(req, res) {
	try {
		const applierName = String(req.query.applierName ?? "").trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const result = await collection.deleteMany({ applierName });
		return res.json({ success: true, deleted: result.deletedCount ?? 0 });
	} catch (err) {
		console.error("[vendor/tasks] clear failed", err);
		return res.status(500).json({ success: false, error: err.message || "Failed to clear tasks." });
	}
}

/**
 * GET /vendor/tasks/analytics?applierName=&since=&until=
 */
export async function getVendorTasksAnalytics(req, res) {
	try {
		const applierName = String(req.query.applierName ?? "").trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}

		const { collection, error } = resolveVendorTasks();
		if (error || !collection) {
			return res.status(503).json({ success: false, error: error || "Unavailable." });
		}

		const sinceRaw = String(req.query.since ?? req.query.from ?? "").trim();
		const untilRaw = String(req.query.until ?? req.query.to ?? "").trim();
		const since = sinceRaw ? new Date(sinceRaw) : null;
		const until = untilRaw ? new Date(untilRaw) : null;
		const sinceOk = since && !Number.isNaN(since.getTime()) ? since : null;
		const untilOk = until && !Number.isNaN(until.getTime()) ? until : null;

		const match = { applierName };
		if (sinceOk || untilOk) {
			match.addedAt = {};
			if (sinceOk) match.addedAt.$gte = sinceOk;
			if (untilOk) match.addedAt.$lte = untilOk;
		}

		const docs = await collection.find(match).sort({ addedAt: 1 }).limit(5000).toArray();
		const matchMap = await buildSessionMatchMap(applierName);
		const tasks = docs.map((doc) =>
			serializeTask(doc, findSessionMatch(doc.applyUrl, matchMap)),
		);

		const bySourceMap = new Map();
		const byDayMap = new Map();
		for (const task of tasks) {
			const sourceKey = task.source || task.jobSource?.label || "Unknown";
			const sourceRow = bySourceMap.get(sourceKey) || {
				label: sourceKey,
				host: task.jobSource?.host ?? null,
				total: 0,
				done: 0,
				active: 0,
				pending: 0,
				skipped: 0,
			};
			sourceRow.total += 1;
			if (task.progress === "completed" || task.status === "done") sourceRow.done += 1;
			else if (task.progress === "active") sourceRow.active += 1;
			else if (task.status === "skipped") sourceRow.skipped += 1;
			else sourceRow.pending += 1;
			bySourceMap.set(sourceKey, sourceRow);

			const day = (task.addedAt || "").slice(0, 10);
			if (day) {
				const dayRow = byDayMap.get(day) || { day, added: 0, done: 0 };
				dayRow.added += 1;
				if (task.progress === "completed" || task.status === "done") dayRow.done += 1;
				byDayMap.set(day, dayRow);
			}
		}

		const done = tasks.filter((t) => t.progress === "completed" || t.status === "done").length;
		const active = tasks.filter((t) => t.progress === "active").length;
		const skipped = tasks.filter((t) => t.status === "skipped").length;
		const pending = tasks.length - done - active - skipped;
		const completionRate = tasks.length ? done / tasks.length : 0;

		// How many pool jobs are still "posted" (not applied) in job_market.
		let stillPosted = null;
		if (jobsCollection && tasks.some((t) => t.jobId)) {
			const ids = tasks
				.map((t) => t.jobId)
				.filter((id) => ObjectId.isValid(id))
				.map((id) => new ObjectId(id));
			if (ids.length) {
				const account = accountInfoCollection
					? await accountInfoCollection.findOne(
							{ name: applierName },
							{ projection: { _id: 1 } },
						)
					: null;
				const applierId = account?._id ? String(account._id) : null;
				const marketJobs = await jobsCollection
					.find({ _id: { $in: ids } }, { projection: { status: 1 } })
					.toArray();
				stillPosted = 0;
				for (const job of marketJobs) {
					const statusArr = Array.isArray(job.status) ? job.status : [];
					const applied = applierId
						? statusArr.some(
								(s) =>
									s &&
									String(s.applier) === applierId &&
									(s.appliedDate || s.scheduledDate || s.declinedDate),
							)
						: false;
					if (!applied) stillPosted += 1;
				}
			}
		}

		return res.json({
			success: true,
			since: sinceOk?.toISOString() ?? null,
			until: untilOk?.toISOString() ?? null,
			totals: {
				total: tasks.length,
				pending: Math.max(0, pending),
				active,
				done,
				skipped,
				completionRate,
				stillPosted,
			},
			byDay: [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
			bySource: [...bySourceMap.values()].sort((a, b) => b.total - a.total),
		});
	} catch (err) {
		console.error("[vendor/tasks/analytics] failed", err);
		return res
			.status(500)
			.json({ success: false, error: err.message || "Failed to load task analytics." });
	}
}
