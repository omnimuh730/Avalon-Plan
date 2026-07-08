import { llmCallLogCollection } from "../db/mongo.js";
import { createAsyncHandler } from "../utils/http.js";
import {
  buildAiUsageMatch,
  AI_USAGE_TOTALS_GROUP,
  AI_USAGE_BY_DAY_PIPELINE,
} from "../services/aiUsageQuery.js";

export const getAiUsage = createAsyncHandler(async (req, res) => {
  if (!llmCallLogCollection) {
    return res.status(503).json({ error: "Database not ready" });
  }

  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const match = buildAiUsageMatch(req.query);

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

  const match = buildAiUsageMatch(req.query);

  const [totals, byProvider, byFeature, byDay] = await Promise.all([
    llmCallLogCollection.aggregate([
      { $match: match },
      { $group: AI_USAGE_TOTALS_GROUP },
    ]).toArray(),
    llmCallLogCollection.aggregate([
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
    ]).toArray(),
    llmCallLogCollection.aggregate([
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
    ]).toArray(),
    llmCallLogCollection.aggregate([
      { $match: match },
      ...AI_USAGE_BY_DAY_PIPELINE,
    ]).toArray(),
  ]);

  res.json({
    totals: totals[0] ?? {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    },
    byProvider,
    byFeature,
    byDay,
  });
});
