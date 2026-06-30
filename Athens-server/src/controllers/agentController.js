import { ObjectId } from "mongodb";
import { jobsCollection, accountInfoCollection } from "../db/mongo.js";
import { JobSource } from "../config/jobSources.js";
import { DEEPSEEK_MODELS, listOpenAiModels } from "@nextoffer/shared/models";
import { createAsyncHandler } from "../utils/http.js";

function toOid(id) {
  if (!id || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function postedFilter(applierOid) {
  const and = [
    {
      $or: [
        { applyLink: { $regex: /^https?:\/\//i } },
        { url: { $regex: /^https?:\/\//i } },
      ],
    },
  ];
  if (applierOid) {
    and.push({
      $or: [
        { status: { $exists: false } },
        { status: { $not: { $elemMatch: { applier: applierOid } } } },
      ],
    });
  }
  return and.length === 1 ? and[0] : { $and: and };
}

async function resolveOpenAiKey(profileId) {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (!profileId || !accountInfoCollection) return envKey || null;
  if (!ObjectId.isValid(profileId)) return envKey || null;
  const doc = await accountInfoCollection.findOne(
    { _id: new ObjectId(profileId) },
    { projection: { "autoBidProfile.openaiApiKey": 1 } },
  );
  return doc?.autoBidProfile?.openaiApiKey?.trim() || envKey || null;
}

export const getAgentHealth = createAsyncHandler(async (_req, res) => {
  res.json({
    ok: true,
    mongoDb: process.env.MONGO_DB || "AthensDB",
  });
});

export const getAgentModels = createAsyncHandler(async (req, res) => {
  const profileId = String(req.query.profileId || "");
  const openaiKey = await resolveOpenAiKey(profileId);
  let models = [];
  if (openaiKey) {
    try {
      models = await listOpenAiModels(openaiKey);
    } catch (err) {
      console.warn("OpenAI model list failed:", err?.message || err);
    }
  }
  models = [...models, ...DEEPSEEK_MODELS.map((id) => ({ id }))];
  res.json({ models });
});

export const getAgentJobSources = createAsyncHandler(async (req, res) => {
  if (!jobsCollection) {
    return res.status(503).json({ error: "Database not ready" });
  }
  const applierOid = toOid(req.query.profileId);
  const rows = await jobsCollection
    .aggregate([
      { $match: postedFilter(applierOid) },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const counts = {};
  let total = 0;
  for (const r of rows) {
    counts[r._id || "Other"] = r.count;
    total += r.count;
  }
  const sources = JobSource.filter(
    (s) => s.type !== "Legal" && s.title !== "Other" && (counts[s.title] || 0) > 0,
  )
    .map((s) => ({ title: s.title, type: s.type, posted: counts[s.title] || 0 }))
    .sort((a, b) => b.posted - a.posted);
  res.json({ sources, total });
});

const emptyDashboard = {
  posted: 0,
  appliedToday: 0,
  applied7d: 0,
  scheduled: 0,
  activeRuns: 0,
  totalRuns: 0,
  inFlightJobs: 0,
  succeededToday: 0,
  bySource: {},
  runPipeline: { inProgress: 0, succeeded: 0, failed: 0, review: 0, scheduled: 0 },
  pipelineStages: {
    posted: 0,
    scheduled: 0,
    inRun: 0,
    submitted: 0,
    reviewPending: 0,
    error: 0,
  },
  applications7d: [],
  submissions7d: [],
  byStatus: {},
  jobs: [],
};

export const getAgentDashboard = createAsyncHandler(async (_req, res) => {
  res.json(emptyDashboard);
});

export const getAgentRuns = createAsyncHandler(async (_req, res) => {
  res.json({ runs: [] });
});

export const getAgentActivity = createAsyncHandler(async (_req, res) => {
  res.json({ activity: [] });
});

export const postAgentDeploy = createAsyncHandler(async (_req, res) => {
  res.status(410).json({
    error: "Agent deploy moved to Avalon. Queue jobs in the Agents Controller tab.",
  });
});
