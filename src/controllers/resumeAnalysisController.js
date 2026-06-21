import { accountInfoCollection } from "../db/mongo.js";
import { chatCompletion, getProvider } from "../services/llm/llmService.js";
import { JOB_ANALYSIS_PROMPT } from "../config/jobAnalysisPrompt.js";
import { rankResumes, rankUploadedResumes } from "../services/resumeMatchService.js";
import { listUserResumesForOwner } from "../services/userResumeService.js";
import { emptyResumeCatalog } from "../services/resumeCatalogService.js";

async function findAccount(applierNameRaw) {
  const name = String(applierNameRaw ?? "").trim();
  if (!name || !accountInfoCollection) return null;
  const proj = { projection: { autoBidProfile: 1, resumeCatalog: 1 } };
  let acc = await accountInfoCollection.findOne({ name }, proj);
  if (!acc) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    acc = await accountInfoCollection.findOne({ name: { $regex: new RegExp(`^${esc}$`, "i") } }, proj);
  }
  return acc;
}

function apiKeyFor(profile, providerId) {
  const provider = getProvider(providerId);
  return String(profile?.[provider.keyField] || "").trim();
}

async function analyzeJobDescription(jobDescription, profile) {
  const providerId = profile?.openaiApiKey ? "openai" : profile?.deepseekApiKey ? "deepseek" : "openai";
  const apiKey = apiKeyFor(profile, providerId);
  if (!apiKey) {
    throw new Error("No LLM API key configured in profile (OpenAI or DeepSeek).");
  }

  const model = providerId === "openai"
    ? (String(profile?.openaiModel || "").trim() || "gpt-4o-mini")
    : "deepseek-v4-flash";

  const result = await chatCompletion({
    provider: providerId,
    apiKey,
    model,
    messages: [
      { role: "system", content: JOB_ANALYSIS_PROMPT },
      { role: "user", content: `Job description:\n\n${jobDescription}` },
    ],
  });

  return {
    skillProfileText: result?.content || "",
    usage: result?.usage || null,
    provider: providerId,
    model,
  };
}

export async function analyzeResumeMatch(req, res) {
  try {
    const applierName = String(req.body?.applierName ?? "").trim();
    const jobDescription = String(req.body?.jobDescription ?? "").trim();
    const topN = Math.min(Math.max(Number(req.body?.topN) || 5, 1), 20);

    if (!applierName) {
      return res.status(400).json({ success: false, error: "applierName is required" });
    }
    if (!jobDescription) {
      return res.status(400).json({ success: false, error: "jobDescription is required" });
    }

    const acc = await findAccount(applierName);
    if (!acc) {
      return res.status(404).json({ success: false, error: "Account not found" });
    }

    const profile = acc.autoBidProfile || {};
    const catalog = acc.resumeCatalog && typeof acc.resumeCatalog === "object"
      ? acc.resumeCatalog
      : emptyResumeCatalog();

    const analysis = await analyzeJobDescription(jobDescription, profile);
    const rankedStacks = rankResumes(analysis.skillProfileText, catalog, topN);
    const uploaded = await listUserResumesForOwner(applierName);
    const rankedUploads = rankUploadedResumes(analysis.skillProfileText, uploaded, catalog, topN);

    return res.json({
      success: true,
      skillProfileText: analysis.skillProfileText,
      rankedStacks,
      rankedUploads,
      usage: analysis.usage,
      provider: analysis.provider,
      model: analysis.model,
    });
  } catch (err) {
    console.error("POST /api/personal/resume-analysis error", err);
    const status = /not found|required|No LLM/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
