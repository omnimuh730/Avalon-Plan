/**
 * Beta-only: rewrite stored generation identity + library text and re-render
 * per-job draft PDFs from the current Profile Settings contact/header fields
 * (LinkedIn, email, phone, name, education). Does not re-run the LLM.
 *
 * Processes generations concurrently and reports progress via `onProgress`.
 */
import { ObjectId } from "mongodb";
import {
  accountInfoCollection,
  resumeGenerationsCollection,
  userResumesCollection,
} from "../db/mongo.js";
import { isBetaTier } from "../lib/betaTier.js";
import { identityFromProfile } from "../utils/identityFromProfile.js";
import { loadDecryptedAutoBidProfile } from "./autoBidProfileSecrets.js";
import { sectionsToText } from "./generatedResumeText.js";
import { loadGeneratorConfig, buildGenerationRequestFromSavedConfig } from "./resumeGenerationService.js";
import { renderAgentResumePdf } from "./agentResumePdf.js";
import {
  deleteAgentDraftPdf,
  identityContactFingerprint,
} from "./agentResumeDraftService.js";
import {
  computeTitlePolicyFingerprint,
  sourceCareers,
  TITLE_POLICY_VERSION,
} from "./resumeCareerTitlePolicy.js";
import { createLimiter, pdfRenderLimiter } from "../utils/concurrency.js";

const cleanString = (v) => String(v ?? "").trim();

/** How many generations to update in parallel (Mongo + library + queued PDF). */
const DEFAULT_REFRESH_CONCURRENCY = 8;

function refreshConcurrency() {
  const n = Number.parseInt(String(process.env.RESUME_IDENTITY_REFRESH_CONCURRENCY ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REFRESH_CONCURRENCY;
}

async function resolveIsBeta(applierName) {
  if (!accountInfoCollection) return false;
  const name = cleanString(applierName);
  if (!name) return false;
  let acc = await accountInfoCollection.findOne({ name }, { projection: { tier: 1 } });
  if (!acc) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    acc = await accountInfoCollection.findOne(
      { name: { $regex: new RegExp(`^${esc}$`, "i") } },
      { projection: { tier: 1 } },
    );
  }
  return isBetaTier(acc?.tier);
}

async function updateLibraryResumeText({ generationId, ownerName, extractedText }) {
  if (!userResumesCollection || !generationId) return false;
  const now = new Date().toISOString();
  const buffer = Buffer.from(extractedText || "Generated resume", "utf8");
  const patch = {
    extractedText,
    contentBase64: buffer.toString("base64"),
    sizeBytes: buffer.length,
    updatedAt: now,
  };
  const byGen = await userResumesCollection.updateOne(
    { ownerName, generationId: String(generationId), source: "generated" },
    { $set: patch },
  );
  return byGen.matchedCount > 0;
}

function emitProgress(onProgress, state) {
  if (typeof onProgress !== "function") return;
  onProgress({
    phase: state.phase,
    done: state.done,
    total: state.total,
    left: Math.max(0, state.total - state.done),
    updated: state.updated,
    pdfs: state.pdfs,
    skipped: state.skipped,
    active: state.active ?? 0,
    failed: state.failed ?? 0,
  });
}

/**
 * @param {string} applierNameRaw
 * @param {{ onProgress?: (evt: object) => void }} [opts]
 * @returns {Promise<{ updated: number, pdfs: number, skipped: number, failed: number, total: number }>}
 */
export async function refreshGeneratedResumesIdentity(applierNameRaw, opts = {}) {
  const onProgress = opts.onProgress;
  const name = cleanString(applierNameRaw);
  if (!name) {
    const err = new Error("applierName is required");
    err.status = 400;
    throw err;
  }
  if (!(await resolveIsBeta(name))) {
    const err = new Error("Beta workspace required.");
    err.status = 403;
    err.betaRequired = true;
    throw err;
  }
  if (!resumeGenerationsCollection) {
    const err = new Error("Database not ready");
    err.status = 503;
    throw err;
  }

  const profile = await loadDecryptedAutoBidProfile(name);
  if (!profile) {
    const err = new Error(`No autoBidProfile found for ${name}`);
    err.status = 404;
    throw err;
  }
  const identity = identityFromProfile(profile);
  const identityFingerprint = identityContactFingerprint(identity);
  const savedConfig = await loadGeneratorConfig(name);
  const isBeta = true;

  const generations = await resumeGenerationsCollection
    .find({
      applierName: name,
      status: "completed",
      sections: { $exists: true, $ne: null },
    })
    .toArray();

  const total = generations.length;
  const counters = {
    phase: "start",
    done: 0,
    total,
    updated: 0,
    pdfs: 0,
    skipped: 0,
    failed: 0,
    active: 0,
  };
  emitProgress(onProgress, counters);

  if (total === 0) {
    counters.phase = "done";
    emitProgress(onProgress, counters);
    return { updated: 0, pdfs: 0, skipped: 0, failed: 0, total: 0 };
  }

  const limiter = createLimiter({ concurrency: Math.min(refreshConcurrency(), total) });

  await Promise.all(
    generations.map((gen) =>
      limiter.run(async () => {
        counters.active += 1;
        emitProgress(onProgress, { ...counters, phase: "progress" });
        try {
          if (!gen?.sections) {
            counters.skipped += 1;
            return;
          }

          const extractedText = sectionsToText(gen.sections, identity);
          const jobId = cleanString(gen.generate_parent_job_id);
          const jd = cleanString(gen.jobDescription);
          const body = buildGenerationRequestFromSavedConfig({
            applierName: name,
            jobDescription: jd,
            savedConfig,
            identity,
            generateParentJobId: jobId || undefined,
            structuredJob: Boolean(jobId),
          });
          const titlePolicyFingerprint = computeTitlePolicyFingerprint({
            isBeta,
            jobDescription: jd,
            careers: sourceCareers(identity),
            config: body,
          });

          await resumeGenerationsCollection.updateOne(
            { _id: gen._id },
            {
              $set: {
                identity,
                titlePolicyFingerprint,
                titlePolicyVersion: TITLE_POLICY_VERSION,
                isBeta: true,
                identityRefreshedAt: new Date(),
              },
            },
          );

          const generationId = String(gen._id);
          await updateLibraryResumeText({
            generationId,
            ownerName: name,
            extractedText,
          });

          if (gen.libraryResumeId && userResumesCollection) {
            try {
              const buffer = Buffer.from(extractedText || "Generated resume", "utf8");
              await userResumesCollection.updateOne(
                { _id: new ObjectId(String(gen.libraryResumeId)) },
                {
                  $set: {
                    extractedText,
                    contentBase64: buffer.toString("base64"),
                    sizeBytes: buffer.length,
                    updatedAt: new Date().toISOString(),
                  },
                },
              );
            } catch {
              /* invalid id */
            }
          }

          if (jobId) {
            await deleteAgentDraftPdf(name, jobId);
            await pdfRenderLimiter.run(async () => {
              await renderAgentResumePdf({
                sections: gen.sections,
                identity,
                applierName: name,
                jobId,
                config: savedConfig,
                titlePolicyFingerprint,
                identityFingerprint,
              });
            });
            counters.pdfs += 1;
          }

          counters.updated += 1;
        } catch (err) {
          counters.failed += 1;
          console.warn(
            `[refresh-identity] failed for generation ${String(gen?._id)}:`,
            err?.message || err,
          );
        } finally {
          counters.active = Math.max(0, counters.active - 1);
          counters.done += 1;
          emitProgress(onProgress, { ...counters, phase: "progress" });
        }
      }),
    ),
  );

  counters.phase = "done";
  counters.active = 0;
  emitProgress(onProgress, counters);

  return {
    updated: counters.updated,
    pdfs: counters.pdfs,
    skipped: counters.skipped,
    failed: counters.failed,
    total,
  };
}
