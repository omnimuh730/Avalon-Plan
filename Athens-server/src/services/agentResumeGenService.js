import { ObjectId } from "mongodb";
import {
  accountInfoCollection,
  resumeGeneratorConfigCollection,
  resumeGenerationsCollection,
  userResumesCollection,
} from "../db/mongo.js";
import { syncGeneratedResumeAfterRun } from "./generatedResumeService.js";
import { analyzeGeneratedResumeSkills } from "./generatedResumeSkillAnalysis.js";
import { defaultGeneratorConfig, stepsToPlan } from "../config/resumeGeneratorDefaults.js";
import { identityFromProfile } from "../utils/identityFromProfile.js";
import { addUsage, getProvider } from "./llm/llmService.js";
import { sectionsToText } from "./generatedResumeText.js";
import { renderAgentResumePdf } from "./agentResumePdf.js";
// Reuse the EXACT generation core the Resume Generator (Editor) uses, so the
// auto-bid agent produces the same quality output — no drifted duplicate.
import { prepareGeneration, runGeneration } from "../controllers/resumeGenController.js";

/** Render the generated sections to a PDF (best-effort) for agent upload + human review. */
async function renderPdfForAgent(sections, identity, savedConfig, applierName, jobId) {
  if (!sections) return {};
  try {
    const { buffer, savedPath } = await renderAgentResumePdf({
      sections, identity, applierName, jobId, config: savedConfig,
    });
    return { pdfBase64: buffer.toString("base64"), resumePdfPath: savedPath };
  } catch (e) {
    console.warn("[agent-resume-gen] PDF render failed:", e.message);
    return {};
  }
}

const cleanString = (v) => String(v ?? "").trim();

async function findProfile(applierNameRaw) {
  const name = cleanString(applierNameRaw);
  if (!name || !accountInfoCollection) return null;
  const proj = { projection: { autoBidProfile: 1 } };
  let acc = await accountInfoCollection.findOne({ name }, proj);
  if (!acc) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    acc = await accountInfoCollection.findOne({ name: { $regex: new RegExp(`^${esc}$`, "i") } }, proj);
  }
  return acc?.autoBidProfile || null;
}

async function findResumeCatalog(applierNameRaw) {
  const name = cleanString(applierNameRaw);
  if (!name || !accountInfoCollection) return null;
  const proj = { projection: { resumeCatalog: 1 } };
  let acc = await accountInfoCollection.findOne({ name }, proj);
  if (!acc) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    acc = await accountInfoCollection.findOne({ name: { $regex: new RegExp(`^${esc}$`, "i") } }, proj);
  }
  const catalog = acc?.resumeCatalog;
  return catalog && typeof catalog === "object" && !Array.isArray(catalog) ? catalog : null;
}

async function loadGeneratorConfig(applierName) {
  if (!resumeGeneratorConfigCollection) return defaultGeneratorConfig();
  const doc = await resumeGeneratorConfigCollection.findOne({ applierName });
  const saved = doc?.config;
  if (!saved || typeof saved !== "object") return defaultGeneratorConfig();
  const base = defaultGeneratorConfig();
  return {
    ...base,
    ...saved,
    theme: { ...base.theme, ...(saved.theme ?? {}) },
    layout: Array.isArray(saved.layout) && saved.layout.length ? saved.layout : base.layout,
    steps: Array.isArray(saved.steps) && saved.steps.length ? saved.steps : base.steps,
  };
}

function configSnapshot(body) {
  return {
    provider: body.provider,
    model: body.model,
    reasoningEffort: body.reasoningEffort ?? null,
    templateId: body.templateId ?? null,
    template: body.template ?? null,
    theme: body.theme ?? null,
    layout: body.layout ?? null,
    systemInstruction: body.systemInstruction ?? null,
    jobDescription: body.jobDescription ?? null,
    steps: body.steps ?? null,
  };
}

async function saveGenerationRun(doc) {
  if (!resumeGenerationsCollection) return null;
  const result = await resumeGenerationsCollection.insertOne(doc);
  return result.insertedId;
}

function usageToAgentShape(usage, model) {
  const u = usage || {};
  const costUsd = Number(u.cost ?? u.costUsd ?? 0);
  return {
    model: u.model || model,
    inputTokens: Number(u.inputTokens ?? 0),
    cachedTokens: Number(u.cachedTokens ?? 0),
    outputTokens: Number(u.outputTokens ?? 0),
    totalTokens: Number(u.totalTokens ?? 0),
    costUsd,
    cost: costUsd,
  };
}

/** Find a completed generation or library resume linked to this job id. */
export async function findExistingAgentJobResume(applierName, jobId) {
  const name = cleanString(applierName);
  const parentId = cleanString(jobId);
  if (!name || !parentId) return null;

  if (userResumesCollection) {
    const resume = await userResumesCollection.findOne({
      ownerName: name,
      generateParentJobId: parentId,
      source: "generated",
    });
    if (resume) {
      let generation = null;
      if (resume.generationId && resumeGenerationsCollection) {
        try {
          generation = await resumeGenerationsCollection.findOne({
            _id: new ObjectId(String(resume.generationId)),
            applierName: name,
            status: "completed",
          });
        } catch {
          /* invalid id */
        }
      }
      return { resume, generation, reused: true };
    }
  }

  if (resumeGenerationsCollection) {
    const generation = await resumeGenerationsCollection.findOne(
      { applierName: name, generate_parent_job_id: parentId, status: "completed" },
      { sort: { startedAt: -1 } },
    );
    if (!generation) return null;
    let resume = null;
    if (generation.libraryResumeId && userResumesCollection) {
      try {
        resume = await userResumesCollection.findOne({ _id: new ObjectId(String(generation.libraryResumeId)) });
      } catch {
        /* invalid id */
      }
    }
    if (!resume && userResumesCollection) {
      resume = await userResumesCollection.findOne({ ownerName: name, generationId: String(generation._id) });
    }
    if (resume) return { resume, generation, reused: true };
  }

  return null;
}

/**
 * Generate (or reuse) a job-tailored resume for an agent run.
 * Uses saved resume-generator config; only the job description is replaced.
 */
export async function ensureAgentJobResume({ applierName, jobId, jobDescription, modelOverride }) {
  const name = cleanString(applierName);
  const parentId = cleanString(jobId);
  const jd = cleanString(jobDescription);
  if (!name) throw new Error("applierName is required");
  if (!parentId) throw new Error("jobId is required");
  if (!jd) throw new Error("jobDescription is required");

  const profile = await findProfile(name);
  if (!profile) throw new Error(`No autoBidProfile found for ${name}`);
  const identity = identityFromProfile(profile);
  const savedConfig = await loadGeneratorConfig(name);

  const existing = await findExistingAgentJobResume(name, parentId);
  if (existing?.resume) {
    const usage = usageToAgentShape(existing.generation?.usage, existing.generation?.model);
    // Re-render the PDF from the stored sections so the agent always uploads a real PDF.
    const pdf = await renderPdfForAgent(existing.generation?.sections, identity, savedConfig, name, parentId);
    return {
      reused: true,
      resumeId: String(existing.resume._id),
      fileName: existing.resume.fileName,
      techStack: existing.resume.techStack || "Generated",
      extractedText: existing.resume.extractedText || "",
      generationId: existing.generation ? String(existing.generation._id) : existing.resume.generationId,
      usage,
      model: usage.model,
      ...pdf,
    };
  }

  const plan = stepsToPlan(savedConfig.steps);

  // Use the SAME provider/model the Resume Generator (Editor) uses for this
  // profile — straight from the saved config, matching the Editor. We do NOT
  // override with the run's browser model (that made the résumé worse).
  //
  // BUT guard against an invalid provider/model pairing: if the saved config pairs
  // a provider with a model that provider can't serve (e.g. DeepSeek + the stale
  // "gpt-3.5-turbo"), the API 400s on EVERY job. When the provider has a known
  // model allowlist and the saved model isn't in it, fall back to the run's model
  // (when valid) or the provider's first supported model.
  const providerDef = getProvider(savedConfig.provider);
  let resumeModel = savedConfig.model;
  const allowed = Array.isArray(providerDef.models) ? providerDef.models : null;
  if (allowed?.length && !allowed.includes(resumeModel)) {
    resumeModel = allowed.includes(modelOverride) ? modelOverride : allowed[0];
    console.warn(
      `[agent-resume-gen] saved model "${savedConfig.model}" is not valid for provider "${savedConfig.provider}"; using "${resumeModel}" instead.`,
    );
  }
  const body = {
    applierName: name,
    provider: savedConfig.provider,
    model: resumeModel,
    reasoningEffort: savedConfig.reasoningEffort,
    templateId: savedConfig.templateId,
    theme: savedConfig.theme,
    layout: savedConfig.layout,
    systemInstruction: savedConfig.systemInstruction,
    jobDescription: jd,
    identity,
    steps: plan,
    generateParentJobId: parentId,
  };

  const prep = await prepareGeneration(body);
  if (!prep.ok) {
    const err = new Error(prep.error);
    err.status = prep.status;
    throw err;
  }

  const startedAt = new Date();
  const result = await runGeneration({
    ...prep,
    systemInstruction: body.systemInstruction,
    identity,
    applierName: name,
    jobDescription: jd,
    reasoningEffort: body.reasoningEffort,
  });

  let skillProfile = [];
  let techStack = null;
  let skillAnalysisError = null;
  const catalog = await findResumeCatalog(name);

  try {
    const skillResult = await analyzeGeneratedResumeSkills({
      sections: result.sections,
      identity,
      jobDescription: jd,
      catalog,
      providerId: prep.providerId,
      apiKey: prep.apiKey,
      model: prep.model,
    });
    skillProfile = skillResult.skillProfile;
    techStack = skillResult.techStack;
    result.perStep.push({ index: result.perStep.length + 1, ...skillResult.perStep });
    result.usage = addUsage(result.usage, skillResult.usage);
  } catch (err) {
    skillAnalysisError = err.message;
    console.warn("[agent-resume-gen] skill analysis failed:", err.message);
  }

  // Persisting the run to history + the generated-resume library is secondary; it must NEVER
  // fail the generation (e.g. Neo4j down, a unique-index race). The agent only needs the PDF.
  let generationId = null;
  let sync = null;
  try {
    generationId = await saveGenerationRun({
      applierName: name,
      provider: prep.providerId,
      model: prep.model,
      status: "completed",
      config: configSnapshot(body),
      identity,
      jobDescription: jd,
      sections: result.sections,
      perStep: result.perStep,
      usage: result.usage,
      skillProfile,
      techStack,
      skillAnalysisError,
      analyzed: skillProfile.length > 0,
      analyzedAt: skillProfile.length > 0 ? new Date() : null,
      generate_parent_job_id: parentId,
      startedAt,
      finishedAt: new Date(),
    });

    sync = await syncGeneratedResumeAfterRun({
      generationId,
      ownerName: name,
      sections: result.sections,
      identity,
      jobDescription: jd,
      templateId: body.templateId,
      skillProfile,
      techStack,
      skillAnalysisError,
      generateParentJobId: parentId,
    });
  } catch (err) {
    console.warn("[agent-resume-gen] persistence/enrichment failed (non-fatal):", err.message);
  }

  const usage = usageToAgentShape(result.usage, prep.model);
  const pdf = await renderPdfForAgent(result.sections, identity, savedConfig, name, parentId);
  return {
    reused: false,
    resumeId: sync?.resumeId || null,
    fileName: sync?.fileName || null,
    techStack: sync?.techStack || techStack || "Generated",
    extractedText: sectionsToText(result.sections, identity),
    generationId: generationId ? String(generationId) : null,
    usage,
    model: prep.model,
    ...pdf,
  };
}
