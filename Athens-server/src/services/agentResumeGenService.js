import { ObjectId } from "mongodb";
import {
  accountInfoCollection,
  externalScrapedJobsCollection,
  jobsCollection,
  resumeGeneratorConfigCollection,
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
import { decryptAccountDoc, loadDecryptedAutoBidProfile } from "./autoBidProfileSecrets.js";

/** Render sections to PDF or read a still-valid on-disk draft (Node fs). */
async function pdfPayloadForAgent(sections, identity, savedConfig, applierName, jobId) {
  // Pass config so drafts rendered before templateId support (or after the user
  // changes Template/Theme/Layout) are treated as stale and re-rendered.
  const onDisk = readAgentDraftPdf(applierName, jobId, savedConfig);
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
  return loadDecryptedAutoBidProfile(applierNameRaw);
}

async function findAccountForKit(applierNameRaw) {
  const name = cleanString(applierNameRaw);
  if (!name || !accountInfoCollection) return null;
  const projection = { autoBidProfile: 1, resumeCatalog: 1, resumeAnalysisCatalog: 1 };
  let acc = await accountInfoCollection.findOne({ name }, { projection });
  if (!acc) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    acc = await accountInfoCollection.findOne({ name: { $regex: new RegExp(`^${esc}$`, "i") } }, { projection });
  }
  return acc ? decryptAccountDoc(acc) : null;
}

async function loadRawGeneratorConfig(applierName) {
  const name = cleanString(applierName);
  if (!name || !resumeGeneratorConfigCollection) return null;
  const doc = await resumeGeneratorConfigCollection.findOne({ applierName: name });
  return doc?.config && typeof doc.config === "object" ? doc.config : null;
}

function normalizeKitRenderConfig(savedConfig) {
  const config = savedConfig && typeof savedConfig === "object" ? savedConfig : {};
  const theme = config.theme && typeof config.theme === "object" ? config.theme : {};
  const baseTheme = {
    font: theme.font,
    baseSize: Number(theme.baseSize ?? theme.bodySizePt) || undefined,
    nameSize: Number(theme.nameSize ?? theme.nameSizePt) || undefined,
    titleSize: Number(theme.titleSize) || undefined,
    accent: theme.accent ?? theme.accentColor,
    text: theme.text ?? theme.textColor,
    headerAlign: theme.headerAlign,
    paper: theme.paper ?? theme.paperSize,
    margin: Number(theme.margin ?? theme.marginIn) || undefined,
  };

  const layout = Array.isArray(config.layout) && config.layout.length
    ? config.layout
    : Array.isArray(config.sections)
      ? [...config.sections]
          .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
          .map((s) => ({
            type: s?.type ?? s?.id,
            title: s?.title,
            titleSize: s?.titleSize ?? s?.titleSizePt,
            bodySize: s?.bodySize ?? s?.bodySizePt,
            titleColor: s?.titleColor ?? s?.color,
          }))
      : undefined;

  return {
    ...config,
    theme: baseTheme,
    layout,
  };
}

function editorDocumentToSections(document) {
  if (!document || typeof document !== "object") return null;
  const skills = document.skills && typeof document.skills === "object" ? document.skills : {};
  const skillGroups = [
    ["Languages", skills.languages],
    ["Frameworks", skills.frameworks],
    ["Databases", skills.databases],
    ["Cloud & DevOps", skills.cloudDevOps],
  ]
    .map(([category, items]) => ({
      category,
      items: Array.isArray(items) ? items.map(cleanString).filter(Boolean) : [],
    }))
    .filter((g) => g.items.length);

  const experiences = Array.isArray(document.experiences)
    ? document.experiences.map((exp) => ({
        company: cleanString(exp?.company),
        title: cleanString(exp?.role ?? exp?.title),
        location: cleanString(exp?.location),
        period: [cleanString(exp?.startDate), cleanString(exp?.endDate)].filter(Boolean).join(" - "),
        bullets: Array.isArray(exp?.bullets) ? exp.bullets.map(cleanString).filter(Boolean) : [],
      }))
    : [];

  const education = Array.isArray(document.education)
    ? document.education.map((edu) => ({
        school: cleanString(edu?.school),
        degree: cleanString(edu?.degree),
        period: cleanString(edu?.graduationDate),
      }))
    : [];

  return {
    summary: { summary: cleanString(document.summary) },
    skills: { skills: skillGroups },
    experience: { experiences },
    education: { education },
  };
}

function profileToKitSections(identity, account) {
  const careers = Array.isArray(identity?.careers) ? identity.careers : [];
  const companies = careers.map((c) => cleanString(c?.company)).filter(Boolean);
  const latestTitle = cleanString(careers[0]?.title);
  const summaryParts = [
    latestTitle ? `${latestTitle} with a documented career history` : "Candidate with a documented career history",
    companies.length ? `across ${companies.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean);
  const catalogSkills = new Set();
  // Prefer detailed analyzed catalog when available.
  if (account?.resumeAnalysisCatalog && typeof account.resumeAnalysisCatalog === "object" && !Array.isArray(account.resumeAnalysisCatalog)) {
    for (const stackSkills of Object.values(account.resumeAnalysisCatalog)) {
      if (!Array.isArray(stackSkills)) continue;
      for (const s of stackSkills) {
        const clean = cleanString(s?.name);
        if (clean) catalogSkills.add(clean);
      }
    }
  } else {
    const catalog = account?.resumeCatalog && typeof account.resumeCatalog === "object" ? account.resumeCatalog : {};
    for (const stack of Object.values(catalog)) {
      if (!stack || typeof stack !== "object") continue;
      for (const skill of Object.keys(stack)) {
        const clean = cleanString(skill);
        if (clean) catalogSkills.add(clean);
      }
    }
  }

  return {
    summary: {
      summary: summaryParts.length ? `${summaryParts.join(" ")}.` : "Candidate profile prepared for recruiter review.",
    },
    skills: {
      skills: catalogSkills.size ? [{ category: "Skills", items: [...catalogSkills].slice(0, 24) }] : [],
    },
    experience: {
      experiences: careers.map((career) => {
        const description = cleanString(career?.description);
        return {
          company: cleanString(career?.company),
          title: cleanString(career?.title),
          period: cleanString(career?.period),
          bullets: description ? [description] : [],
        };
      }),
    },
    education: { education: Array.isArray(identity?.education) ? identity.education : [] },
  };
}

/**
 * Load the skills already extracted for a structured (MongoDB) job. These feed
 * the `{job_skills}` prompt token so the pipeline can skip its AI skill-fetch
 * step for agent/job-search runs. Returns [] when the job or its skills are absent.
 */
async function findJobSkills(jobId) {
  const id = cleanString(jobId);
  if (!id || !ObjectId.isValid(id)) return [];
  const projection = { skills: 1 };
  const oid = { _id: new ObjectId(id) };
  const job =
    (jobsCollection && (await jobsCollection.findOne(oid, { projection }))) ||
    (externalScrapedJobsCollection &&
      (await externalScrapedJobsCollection.findOne(oid, { projection })));
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
    // Reuse completed generation sections even when library sync was skipped —
    // otherwise Agent re-runs the LLM for a Job Search draft that already exists.
    if (generation.sections) {
      return {
        resume: resume || {
          ownerName: name,
          generateParentJobId: parentId,
          source: "generated",
          generationId: String(generation._id),
          extractedText: "",
          techStack: "Generated",
        },
        generation,
        reused: true,
      };
    }
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

  // Same fallback as findExistingAgentJobResume: a completed generation with
  // sections counts even when library sync was skipped.
  const remaining = ids.filter((id) => !found.has(id));
  if (remaining.length && resumeGenerationsCollection) {
    const generations = await resumeGenerationsCollection
      .find(
        {
          applierName: name,
          generate_parent_job_id: { $in: remaining },
          status: "completed",
          sections: { $exists: true, $ne: null },
        },
        { projection: { generate_parent_job_id: 1 } },
      )
      .toArray();
    for (const g of generations) found.add(String(g.generate_parent_job_id));
  }

  return [...found];
}

/** Read or render the per-job draft PDF (stable path under .local/agent-resumes/by-job). */
export async function resolveAgentJobDraftPdf({ applierName, jobId }) {
  const name = cleanString(applierName);
  const parentId = cleanString(jobId);
  if (!name || !parentId) return null;

  // Always load current Editor config first — preview must match My Resumes template.
  const savedConfig = await loadGeneratorConfig(name);
  const onDisk = readAgentDraftPdf(name, parentId, savedConfig);
  if (onDisk) return { buffer: onDisk.buffer, draftPath: onDisk.draftPath };

  const existing = await findExistingAgentJobResume(name, parentId);
  if (!existing?.generation?.sections) return null;

  const profile = await findProfile(name);
  if (!profile) return null;
  const identity = identityFromProfile(profile);
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

/** Render the saved Resume Generator kit/config as the non-job-tailored submission PDF. */
export async function resolveSubmissionKitPdf({ applierName }) {
  const name = cleanString(applierName);
  if (!name) throw new Error("applierName is required");

  const account = await findAccountForKit(name);
  const profile = account?.autoBidProfile || null;
  if (!profile) throw new Error(`No autoBidProfile found for ${name}`);

  const identity = identityFromProfile(profile);
  const rawConfig = await loadRawGeneratorConfig(name);
  const savedConfig = normalizeKitRenderConfig(rawConfig ?? (await loadGeneratorConfig(name)));
  const sections = editorDocumentToSections(rawConfig?.document) ?? profileToKitSections(identity, account);

  const { buffer, savedPath } = await renderAgentResumePdf({
    sections,
    identity,
    applierName: name,
    jobId: "submission-kit",
    config: savedConfig,
  });
  if (!buffer?.length) throw new Error("Submission Kit PDF render returned empty buffer");

  // Free-tier uploads use this PDF; employers should see {profileName}.pdf, not a "kit" suffix.
  const fileName = `${(identity.fullName || name).replace(/[^\w.\-()+ ]+/g, "_") || "resume"}.pdf`;
  return {
    buffer,
    fileName,
    resumePdfPath: savedPath,
    source: rawConfig?.document ? "editor-document" : "generator-config",
  };
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
