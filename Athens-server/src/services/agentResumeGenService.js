import { ObjectId } from "mongodb";
import {
  accountInfoCollection,
  jobsCollection,
  resumeGenerationsCollection,
  userResumesCollection,
} from "../db/mongo.js";
import { syncGeneratedResumeAfterRun } from "./generatedResumeService.js";
import { identityFromProfile } from "../utils/identityFromProfile.js";
import { sectionsToText } from "./generatedResumeText.js";
import { renderAgentResumePdf } from "./agentResumePdf.js";
import { readAgentDraftPdf, deleteAgentDraftPdf } from "./agentResumeDraftService.js";
import { prepareGeneration, runGeneration } from "../controllers/resumeGenController.js";
import {
  buildGenerationRequestFromSavedConfig,
  loadGeneratorConfig,
} from "./resumeGenerationService.js";

/** Render sections to PDF or read the on-disk draft (Node fs). */
async function pdfPayloadForAgent(sections, identity, savedConfig, applierName, jobId) {
  const onDisk = readAgentDraftPdf(applierName, jobId);
  if (onDisk) {
    // Buffer.from() guards against a non-Buffer (e.g. Uint8Array), whose
    // .toString("base64") ignores the encoding and yields comma-joined bytes.
    return { pdfBase64: Buffer.from(onDisk.buffer).toString("base64"), resumePdfPath: onDisk.draftPath };
  }
  if (!sections) throw new Error("No résumé sections to render as PDF");
  const { buffer, savedPath } = await renderAgentResumePdf({
    sections,
    identity,
    applierName,
    jobId,
    config: savedConfig,
  });
  if (!buffer?.length) throw new Error("PDF render returned empty buffer");
  // page.pdf() returns a Uint8Array in modern puppeteer — wrap so toString("base64")
  // actually base64-encodes (a bare Uint8Array.toString("base64") returns garbage,
  // which the extension's atob() then rejects → 0 files attached).
  return { pdfBase64: Buffer.from(buffer).toString("base64"), resumePdfPath: savedPath };
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

/**
 * Load the skills already extracted for a structured (MongoDB) job. These feed
 * the `{job_skills}` prompt token so the pipeline can skip its AI skill-fetch
 * step for agent/job-search runs. Returns [] when the job or its skills are absent.
 */
async function findJobSkills(jobId) {
  const id = cleanString(jobId);
  if (!id || !jobsCollection || !ObjectId.isValid(id)) return [];
  const job = await jobsCollection.findOne(
    { _id: new ObjectId(id) },
    { projection: { skills: 1 } },
  );
  return Array.isArray(job?.skills) ? job.skills.map((s) => cleanString(s)).filter(Boolean) : [];
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
 * Batch variant of findExistingAgentJobResume: which of these job ids already
 * have a completed generated résumé for this applier. Returns the subset of
 * jobIds that do.
 */
export async function findAgentJobResumeStatuses(applierName, jobIds) {
  const name = cleanString(applierName);
  const ids = [...new Set((jobIds || []).map(cleanString).filter(Boolean))];
  if (!name || !ids.length) return [];

  const found = new Set();
  if (userResumesCollection) {
    const resumes = await userResumesCollection
      .find(
        { ownerName: name, generateParentJobId: { $in: ids }, source: "generated" },
        { projection: { generateParentJobId: 1 } },
      )
      .toArray();
    for (const r of resumes) found.add(String(r.generateParentJobId));
  }

  // Same fallback as findExistingAgentJobResume: a completed generation counts
  // only when a library resume is still linked to it.
  const remaining = ids.filter((id) => !found.has(id));
  if (remaining.length && resumeGenerationsCollection && userResumesCollection) {
    const generations = await resumeGenerationsCollection
      .find(
        { applierName: name, generate_parent_job_id: { $in: remaining }, status: "completed" },
        { projection: { generate_parent_job_id: 1, libraryResumeId: 1 } },
      )
      .toArray();
    if (generations.length) {
      const genIds = generations.map((g) => String(g._id));
      const libIds = generations
        .map((g) => {
          try {
            return g.libraryResumeId ? new ObjectId(String(g.libraryResumeId)) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const resumes = await userResumesCollection
        .find(
          {
            $or: [
              { ownerName: name, generationId: { $in: genIds } },
              ...(libIds.length ? [{ _id: { $in: libIds } }] : []),
            ],
          },
          { projection: { generationId: 1 } },
        )
        .toArray();
      const linkedGenIds = new Set(resumes.map((r) => String(r.generationId || "")));
      const linkedLibIds = new Set(resumes.map((r) => String(r._id)));
      for (const g of generations) {
        if (linkedGenIds.has(String(g._id)) || (g.libraryResumeId && linkedLibIds.has(String(g.libraryResumeId)))) {
          found.add(String(g.generate_parent_job_id));
        }
      }
    }
  }

  return [...found];
}

/** Read or render the per-job draft PDF (stable path under .local/agent-resumes/by-job). */
export async function resolveAgentJobDraftPdf({ applierName, jobId }) {
  const name = cleanString(applierName);
  const parentId = cleanString(jobId);
  if (!name || !parentId) return null;

  const onDisk = readAgentDraftPdf(name, parentId);
  if (onDisk) return { buffer: onDisk.buffer, draftPath: onDisk.draftPath };

  const existing = await findExistingAgentJobResume(name, parentId);
  if (!existing?.generation?.sections) return null;

  const profile = await findProfile(name);
  if (!profile) return null;
  const identity = identityFromProfile(profile);
  const savedConfig = await loadGeneratorConfig(name);
  const { buffer, savedPath } = await renderAgentResumePdf({
    sections: existing.generation.sections,
    identity,
    applierName: name,
    jobId: parentId,
    config: savedConfig,
  });
  if (!buffer?.length) return null;
  return { buffer, draftPath: savedPath };
}

/**
 * Generate (or reuse) a job-tailored resume for an agent run.
 * Uses saved resume-generator config; only the job description is replaced.
 */
export async function ensureAgentJobResume({ applierName, jobId, jobDescription, forceRegenerate = false, onStep }) {
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

  if (forceRegenerate) {
    deleteAgentDraftPdf(name, parentId);
  }

  const existing = forceRegenerate ? null : await findExistingAgentJobResume(name, parentId);
  if (existing?.resume) {
    if (onStep) onStep({ phase: "reused", name: "Existing draft" });
    const usage = usageToAgentShape(existing.generation?.usage, existing.generation?.model);
    const pdf = await pdfPayloadForAgent(
      existing.generation?.sections,
      identity,
      savedConfig,
      name,
      parentId,
    );
    const fileName = `${(identity.fullName || name).replace(/[^\w.\-()+ ]+/g, "_")}.pdf`;
    return {
      reused: true,
      resumeId: String(existing.resume._id),
      fileName,
      techStack: existing.resume.techStack || "Generated",
      extractedText: existing.resume.extractedText || "",
      generationId: existing.generation ? String(existing.generation._id) : existing.resume.generationId,
      usage,
      model: usage.model,
      provider: existing.generation?.provider ?? savedConfig.provider ?? null,
      ...pdf,
    };
  }

  // Skills already stored on the job let us skip the AI "fetch skills" step for
  // structured jobs (steps flagged skipForStructuredJobs are dropped below).
  const jobSkills = await findJobSkills(parentId);

  const body = buildGenerationRequestFromSavedConfig({
    applierName: name,
    jobDescription: jd,
    savedConfig,
    identity,
    generateParentJobId: parentId,
    structuredJob: true,
  });

  console.info(
    `[agent-resume-gen] ${name} job ${parentId.slice(0, 8)}… — provider=${body.provider} model=${body.model}`,
  );

  const prep = await prepareGeneration(body);
  if (!prep.ok) {
    const err = new Error(prep.error);
    err.status = prep.status;
    throw err;
  }

  const startedAt = new Date();
  const result = await runGeneration(
    {
      ...prep,
      systemInstruction: body.systemInstruction,
      identity,
      applierName: name,
      jobDescription: jd,
      jobSkills,
      reasoningEffort: body.reasoningEffort,
    },
    onStep,
  );

  // Skill proficiency comes from the scoring logic downstream — no LLM analysis pass.
  const skillProfile = [];
  const techStack = null;
  const skillAnalysisError = null;

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
  if (onStep) onStep({ phase: "rendering-pdf", name: "Rendering PDF" });
  const pdf = await pdfPayloadForAgent(result.sections, identity, savedConfig, name, parentId);
  const finalName = `${(identity.fullName || name).replace(/[^\w.\-()+ ]+/g, "_")}.pdf`;

  return {
    reused: false,
    resumeId: sync?.resumeId || null,
    fileName: finalName,
    techStack: sync?.techStack || techStack || "Generated",
    extractedText: sectionsToText(result.sections, identity),
    generationId: generationId ? String(generationId) : null,
    usage,
    model: prep.model,
    provider: prep.providerId,
    ...pdf,
  };
}
