import { ObjectId } from "mongodb";
import { getVendorTasksCollection, jobsCollection } from "../db/mongo.js";
import { detectJobSource } from "../lib/jobSource.js";
import {
	listBidQueueJobs,
	upsertJobBidStatus,
} from "../services/jobBidStatusService.js";
import { uploadBidRecordingObject } from "../services/firebase/bidRecordingUpload.js";
import {
	buildSessionMatchMap,
	findSessionMatch,
	serializeTask,
} from "./vendorTaskController.js";

const REVIEW_STATUSES = new Set(["submitted", "reviewed", "rejected"]);

function toObjectId(value) {
	if (!value) return null;
	if (value instanceof ObjectId) return value;
	try {
		return new ObjectId(String(value));
	} catch {
		return null;
	}
}

function initials(name) {
	const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function dayKeyFromIso(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** job_market.company may be a string or { name, tags, logo }. */
function companyDisplayName(company) {
	if (typeof company === "string") return company.trim() || "Unknown";
	if (company && typeof company === "object") {
		const name = company.name ?? company.companyName;
		if (typeof name === "string" && name.trim()) return name.trim();
	}
	return "Unknown";
}

function mapTaskToBidResult(task) {
	const pooledAt = task.bidReadyDate || task.addedAt || new Date().toISOString();
	const bidderName = task.bidderName || task.applierName || "Unassigned";
	let status = "pending";
	if (task.progress === "skipped" || task.status === "skipped") {
		status = "skipped";
	} else if (task.reviewStatus && REVIEW_STATUSES.has(task.reviewStatus)) {
		status = task.reviewStatus;
	} else if (task.progress === "completed" || task.status === "done") {
		status = "submitted";
	} else if (task.bidderInProcess) {
		// In-Process only after Bid-Monitor Apply (start). Do NOT use
		// Avalon session URL matches — those mark vendor progress "active"
		// and were incorrectly filling this column for Bid Ready jobs.
		status = "in_process";
	}

	const recording = task.recording?.storagePath
		? {
				storagePath: task.recording.storagePath,
				contentType: task.recording.contentType || "video/webm",
				sizeBytes: Number(task.recording.sizeBytes || 0),
				previewUrl: null,
			}
		: null;

	return {
		id: `bid-${task.id}`,
		taskId: task.id,
		jobId: task.jobId || null,
		dayKey: dayKeyFromIso(pooledAt),
		job: {
			title: task.title || "Untitled role",
			company: companyDisplayName(task.company),
			location: task.location || "—",
			source: task.source || "—",
			applyUrl: task.applyUrl || "#",
		},
		bidder: {
			name: bidderName,
			avatarInitials: initials(bidderName),
		},
		status,
		pooledAt,
		submittedAt: task.completedAt || (status !== "pending" && status !== "in_process" ? task.updatedAt : null),
		durationSec: typeof task.recordingDurationSec === "number" ? task.recordingDurationSec : null,
		matchScore: task.matchScore,
		flags: {
			remote:
				task.flags?.remote?.status === "green" || task.flags?.remote?.status === "red"
					? task.flags.remote.status
					: task.flags?.remote === "green" || task.flags?.remote === "red"
						? task.flags.remote
						: null,
			clearance:
				task.flags?.clearance?.status === "green" || task.flags?.clearance?.status === "red"
					? task.flags.clearance.status
					: task.flags?.clearance === "green" || task.flags?.clearance === "red"
						? task.flags.clearance
						: null,
		},
		analysisSummary: task.analysisSummary || null,
		jobDetail: null,
		recommendedResume: null,
		submissionResume: null,
		recording,
		notes:
			status === "pending"
				? "Bid ready — waiting for bidder"
				: status === "in_process"
					? "Bid in progress"
					: status === "skipped"
						? "Skipped by bidder"
						: recording
							? "Recording uploaded"
							: null,
		sessionId: task.recording?.sessionId || task.sessionMatch?.sessionId || null,
	};
}

async function listTasksForApplier(applierName) {
	const collection = getVendorTasksCollection();
	if (!collection) {
		throw new Error("MongoDB is not connected.");
	}

	const [queueJobs, taskDocs, matchMap] = await Promise.all([
		listBidQueueJobs(applierName, { limit: 1000, includeCompleted: true }),
		collection.find({ applierName }).sort({ addedAt: -1 }).limit(1000).toArray(),
		buildSessionMatchMap(applierName),
	]);

	const taskByJobId = new Map();
	for (const doc of taskDocs) {
		if (doc.jobId) taskByJobId.set(String(doc.jobId), doc);
	}

	const tasks = queueJobs.map((job) => {
		const doc = taskByJobId.get(job.jobId);
		const sessionMatch = findSessionMatch(job.applyUrl, matchMap);
		const bidReadyAt = job.bidReadyDate || null;
		const base = doc
			? {
					...serializeTask(doc, sessionMatch),
					addedAt:
						bidReadyAt instanceof Date
							? bidReadyAt.toISOString()
							: bidReadyAt ||
								(doc.addedAt instanceof Date ? doc.addedAt.toISOString() : doc.addedAt ?? null),
					bidReadyDate:
						bidReadyAt instanceof Date
							? bidReadyAt.toISOString()
							: bidReadyAt ||
								(doc.addedAt instanceof Date ? doc.addedAt.toISOString() : doc.addedAt ?? null),
				}
			: {
					...serializeTask(
						{
							_id: job.jobId,
							applierName,
							jobId: job.jobId,
							title: job.title,
							company: job.company,
							applyUrl: job.applyUrl,
							source: job.source,
							location: "",
							workMode: "",
							matchScore: null,
							status: job.completed ? "done" : "pending",
							addedAt: bidReadyAt,
							updatedAt: job.bidCompletedDate || bidReadyAt,
							completedAt: job.bidCompletedDate,
						},
						sessionMatch,
					),
					bidReadyDate:
						bidReadyAt instanceof Date ? bidReadyAt.toISOString() : bidReadyAt,
				};

		if (job.completed && base.progress !== "completed") {
			return { ...base, status: "done", progress: "completed" };
		}
		return base;
	});

	// Persist session-completed jobs as bid-completed (same as vendor/tasks list).
	await Promise.all(
		tasks
			.filter((t) => t.progress === "completed" && t.jobId)
			.map((t) => upsertJobBidStatus(applierName, t.jobId, { bidCompleted: true })),
	);

	return tasks;
}

async function upsertVendorTaskRecording(applierName, jobId, fields) {
	const collection = getVendorTasksCollection();
	if (!collection) throw new Error("MongoDB is not connected.");

	const now = new Date();
	const $set = {
		applierName,
		jobId: String(jobId),
		updatedAt: now,
	};
	for (const [key, value] of Object.entries(fields || {})) {
		if (value !== undefined) $set[key] = value;
	}

	const result = await collection.findOneAndUpdate(
		{ applierName, jobId: String(jobId) },
		{
			$set,
			$setOnInsert: { addedAt: now },
		},
		{ upsert: true, returnDocument: "after" },
	);
	return result?.value ?? result;
}

/**
 * GET /bid-results?applierName=
 */
export async function listBidResults(req, res) {
	try {
		const applierName = String(req.query.applierName ?? "").trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}

		const tasks = await listTasksForApplier(applierName);
		const results = tasks.map(mapTaskToBidResult).filter(Boolean);

		return res.json({ success: true, results, total: results.length });
	} catch (err) {
		console.error("[bid-results] list failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to list bid results.",
		});
	}
}

/**
 * PATCH /bid-results/:id
 * body: { applierName, status: 'submitted'|'reviewed'|'rejected' }
 * :id is bid-{taskId} or bare taskId / jobId
 */
export async function updateBidResultStatus(req, res) {
	try {
		const rawId = String(req.params.id ?? "").trim().replace(/^bid-/, "");
		const applierName = String(req.body?.applierName ?? req.query?.applierName ?? "").trim();
		const status = String(req.body?.status ?? "").trim();
		if (!REVIEW_STATUSES.has(status)) {
			return res
				.status(400)
				.json({ success: false, error: "status must be submitted, reviewed, or rejected." });
		}
		if (!applierName) {
			return res.status(400).json({ success: false, error: "applierName is required." });
		}

		const collection = getVendorTasksCollection();
		if (!collection) {
			return res.status(503).json({ success: false, error: "MongoDB is not connected." });
		}

		const now = new Date();
		let doc = null;
		if (ObjectId.isValid(rawId)) {
			const result = await collection.findOneAndUpdate(
				{ _id: new ObjectId(rawId), applierName },
				{ $set: { reviewStatus: status, updatedAt: now } },
				{ returnDocument: "after" },
			);
			doc = result?.value ?? result;
		}
		if (!doc || !doc._id) {
			const result = await collection.findOneAndUpdate(
				{ applierName, jobId: rawId },
				{ $set: { reviewStatus: status, updatedAt: now, jobId: rawId, applierName } },
				{ upsert: true, returnDocument: "after" },
			);
			doc = result?.value ?? result;
		}

		const task = serializeTask(doc);
		const mapped = mapTaskToBidResult(task);
		return res.json({ success: true, result: mapped });
	} catch (err) {
		console.error("[bid-results] patch failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to update bid result.",
		});
	}
}

/**
 * POST /bid-results/start
 * Mark a Bid Ready job as in-process when Bid-Monitor Apply starts.
 * body: { applierName, jobId, sessionId?, bidderName?, applyUrl? }
 */
export async function startBidResult(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobId = String(req.body?.jobId ?? "").trim();
		const sessionId = String(req.body?.sessionId ?? "").trim() || null;
		const bidderName = String(req.body?.bidderName ?? "").trim() || null;
		const applyUrl = String(req.body?.applyUrl ?? "").trim() || null;
		if (!applierName || !jobId) {
			return res
				.status(400)
				.json({ success: false, error: "applierName and jobId are required." });
		}

		const now = new Date();
		const fields = {
			bidderInProcess: true,
			bidderInProcessAt: now,
			bidderName: bidderName || undefined,
			bidSessionId: sessionId || undefined,
			status: "pending",
		};
		if (applyUrl) fields.applyUrl = applyUrl;

		// Enrich title/company from job_market when creating the task row.
		const objectId = toObjectId(jobId);
		if (objectId && jobsCollection) {
			const job = await jobsCollection.findOne(
				{ _id: objectId },
				{ projection: { title: 1, company: 1, applyLink: 1, applyUrl: 1, source: 1 } },
			);
			if (job) {
				fields.title = job.title || undefined;
				fields.company = companyDisplayName(job.company);
				fields.applyUrl = applyUrl || job.applyLink || job.applyUrl || undefined;
				fields.source = job.source || detectJobSource(fields.applyUrl)?.label || undefined;
			}
		}

		const doc = await upsertVendorTaskRecording(applierName, jobId, fields);
		await upsertJobBidStatus(applierName, jobId, { bidReady: true });

		return res.json({ success: true, task: serializeTask(doc) });
	} catch (err) {
		console.error("[bid-results] start failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to start bid.",
		});
	}
}

/**
 * POST /bid-recordings/upload
 * Stores the recording. Does NOT mark Submitted unless markCompleted=true.
 * body: {
 *   applierName, jobId, sessionId, applyUrl?, bidderName?,
 *   contentType?, fileName?, videoBase64, durationSec?, markCompleted?
 * }
 */
export async function uploadBidRecording(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobId = String(req.body?.jobId ?? "").trim();
		const sessionId = String(req.body?.sessionId ?? "").trim() || `sess-${Date.now()}`;
		const applyUrl = String(req.body?.applyUrl ?? "").trim() || null;
		const bidderName = String(req.body?.bidderName ?? "").trim() || null;
		const contentType = String(req.body?.contentType ?? "video/webm").trim();
		const fileName = String(req.body?.fileName ?? "").trim();
		const videoBase64 = String(req.body?.videoBase64 ?? "").trim();
		const markCompleted = Boolean(req.body?.markCompleted);
		const durationSec =
			typeof req.body?.durationSec === "number" && Number.isFinite(req.body.durationSec)
				? Math.max(0, Math.round(req.body.durationSec))
				: null;

		if (!applierName || !jobId) {
			return res
				.status(400)
				.json({ success: false, error: "applierName and jobId are required." });
		}
		if (!videoBase64) {
			return res.status(400).json({ success: false, error: "videoBase64 is required." });
		}

		let buffer;
		try {
			buffer = Buffer.from(videoBase64, "base64");
		} catch {
			return res.status(400).json({ success: false, error: "Invalid videoBase64." });
		}
		if (!buffer.length) {
			return res.status(400).json({ success: false, error: "Empty video payload." });
		}

		const uploaded = await uploadBidRecordingObject({
			applierName,
			sessionId,
			buffer,
			contentType,
			fileName,
		});

		const now = new Date();
		const fields = {
			bidderName: bidderName || undefined,
			bidSessionId: sessionId,
			recordingPath: uploaded.storagePath,
			recordingContentType: uploaded.contentType,
			recordingSize: uploaded.sizeBytes,
			recordingDurationSec: durationSec,
		};
		if (applyUrl) fields.applyUrl = applyUrl;
		if (markCompleted) {
			fields.status = "done";
			fields.completedAt = now;
			fields.bidderInProcess = false;
			fields.reviewStatus = "submitted";
		} else {
			// Keep in-process after recording stop until Mark as Completed.
			fields.bidderInProcess = true;
			fields.status = "pending";
		}

		const doc = await upsertVendorTaskRecording(applierName, jobId, fields);
		if (markCompleted) {
			await upsertJobBidStatus(applierName, jobId, { bidReady: true, bidCompleted: true });
		} else {
			await upsertJobBidStatus(applierName, jobId, { bidReady: true });
		}

		const task = serializeTask(doc);
		return res.json({
			success: true,
			recording: {
				storagePath: uploaded.storagePath,
				contentType: uploaded.contentType,
				sizeBytes: uploaded.sizeBytes,
				sessionId,
			},
			task,
			result: mapTaskToBidResult(task),
		});
	} catch (err) {
		console.error("[bid-recordings] upload failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to upload recording.",
		});
	}
}

/**
 * POST /bid-results/complete
 * Mark bid Submitted (Mark as Completed in Bid-Monitor).
 * body: { applierName, jobId, bidderName? }
 */
export async function completeBidResult(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobId = String(req.body?.jobId ?? "").trim();
		const bidderName = String(req.body?.bidderName ?? "").trim() || null;
		if (!applierName || !jobId) {
			return res
				.status(400)
				.json({ success: false, error: "applierName and jobId are required." });
		}

		const now = new Date();
		const doc = await upsertVendorTaskRecording(applierName, jobId, {
			status: "done",
			completedAt: now,
			bidderInProcess: false,
			reviewStatus: "submitted",
			bidderName: bidderName || undefined,
		});
		await upsertJobBidStatus(applierName, jobId, { bidReady: true, bidCompleted: true });

		const task = serializeTask(doc);
		return res.json({ success: true, task, result: mapTaskToBidResult(task) });
	} catch (err) {
		console.error("[bid-results] complete failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to complete bid.",
		});
	}
}

/**
 * POST /bid-results/flags
 * Persist Remote / Clearance screening from Bid-Monitor Analyze.
 * body: { applierName, jobId, flags?, summary? }
 */
export async function saveBidResultFlags(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobId = String(req.body?.jobId ?? "").trim();
		if (!applierName || !jobId) {
			return res
				.status(400)
				.json({ success: false, error: "applierName and jobId are required." });
		}

		const flagsIn = req.body?.flags && typeof req.body.flags === "object" ? req.body.flags : {};
		const normalizeVerdict = (v) => {
			if (!v || typeof v !== "object") return null;
			const status = v.status === "red" || v.status === "green" ? v.status : null;
			if (!status) return null;
			return {
				status,
				explanation: typeof v.explanation === "string" ? v.explanation : "",
			};
		};
		const flags = {
			remote: normalizeVerdict(flagsIn.remote),
			clearance: normalizeVerdict(flagsIn.clearance),
		};
		const summary =
			typeof req.body?.summary === "string" ? req.body.summary.trim().slice(0, 4000) : undefined;

		const fields = { flags };
		if (summary !== undefined) fields.analysisSummary = summary || null;

		const doc = await upsertVendorTaskRecording(applierName, jobId, fields);
		const task = serializeTask(doc);
		return res.json({ success: true, task, result: mapTaskToBidResult(task) });
	} catch (err) {
		console.error("[bid-results] flags failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to save flags.",
		});
	}
}

/**
 * POST /bid-results/skip
 * Mark bid Skipped (Skip this job in Bid-Monitor).
 * body: { applierName, jobId, bidderName? }
 */
export async function skipBidResult(req, res) {
	try {
		const applierName = String(req.body?.applierName ?? "").trim();
		const jobId = String(req.body?.jobId ?? "").trim();
		const bidderName = String(req.body?.bidderName ?? "").trim() || null;
		if (!applierName || !jobId) {
			return res
				.status(400)
				.json({ success: false, error: "applierName and jobId are required." });
		}

		const now = new Date();
		const doc = await upsertVendorTaskRecording(applierName, jobId, {
			status: "skipped",
			completedAt: now,
			bidderInProcess: false,
			reviewStatus: null,
			bidderName: bidderName || undefined,
		});

		const task = serializeTask(doc);
		return res.json({ success: true, task, result: mapTaskToBidResult(task) });
	} catch (err) {
		console.error("[bid-results] skip failed", err);
		return res.status(500).json({
			success: false,
			error: err.message || "Failed to skip bid.",
		});
	}
}
