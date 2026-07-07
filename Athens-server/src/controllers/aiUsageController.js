import { llmCallLogCollection } from "../db/mongo.js";
import { createAsyncHandler } from "../utils/http.js";

function parseSince(value) {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const getAiUsage = createAsyncHandler(async (req, res) => {
  if (!llmCallLogCollection) {
    return res.status(503).json({ error: "Database not ready" });
  }

  const applierName = String(req.query.applierName || "").trim() || undefined;
  const runId = String(req.query.runId || "").trim() || undefined;
  const feature = String(req.query.feature || "").trim() || undefined;
  const since = parseSince(req.query.since);
  const until = parseSince(req.query.until);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));

  const match = {};
  if (applierName) match.applierName = applierName;
  if (runId) match.runId = runId;
  if (feature) match.feature = feature;
  if (since || until) {
    match.createdAt = {};
    if (since) match.createdAt.$gte = since;
    if (until) match.createdAt.$lte = until;
  }

  const rows = await llmCallLogCollection
    .find(match)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  res.json({ rows, count: rows.length });
});

export const getAiUsageSummary = createAsyncHandler(async (req, res) => {
  if (!llmCallLogCollection) {
    return res.status(503).json({ error: "Database not ready" });
  }

  const applierName = String(req.query.applierName || "").trim() || undefined;
  const runId = String(req.query.runId || "").trim() || undefined;
  const since = parseSince(req.query.since);

  const match = {};
  if (applierName) match.applierName = applierName;
  if (runId) match.runId = runId;
  if (since) match.createdAt = { $gte: since };

  const [totals] = await llmCallLogCollection.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        cachedInputTokens: { $sum: "$cachedInputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        totalTokens: { $sum: "$totalTokens" },
        costUsd: { $sum: "$costUsd" },
      },
    },
  ]).toArray();

  const byProvider = await llmCallLogCollection.aggregate([
    { $match: match },
    {
      $group: {
        _id: { provider: "$provider", billedModel: "$billedModel" },
        calls: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        cachedInputTokens: { $sum: "$cachedInputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        totalTokens: { $sum: "$totalTokens" },
        costUsd: { $sum: "$costUsd" },
      },
    },
    { $sort: { costUsd: -1 } },
  ]).toArray();

  const byFeature = await llmCallLogCollection.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$feature",
        calls: { $sum: 1 },
        costUsd: { $sum: "$costUsd" },
        totalTokens: { $sum: "$totalTokens" },
      },
    },
    { $sort: { costUsd: -1 } },
  ]).toArray();

  res.json({
    totals: totals ?? {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    },
    byProvider,
    byFeature,
  });
});
