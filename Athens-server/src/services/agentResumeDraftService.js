/**
 * Per-job agent résumé drafts on disk (Node fs). Each Mongo job id gets a stable
 * `draft.pdf` path so the Agent UI can stream/preview without re-embedding huge base64.
 *
 * Drafts are keyed by a render fingerprint (templateId + theme + layout + renderer
 * version). Stale drafts (pre-templateId renderer, or after the user changes Template
 * / Theme / Layout in My Resumes) are ignored so the next read re-renders.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const REVIEW_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".local",
  "agent-resumes",
);
const DRAFT_ROOT = path.join(REVIEW_ROOT, "by-job");

/** Bump when sectionsToHtml / template catalog changes so old drafts re-render. */
export const AGENT_PDF_RENDER_VERSION = 2;

const safe = (s) => String(s || "").replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Stable draft path for applier + job id. */
export function agentDraftPdfPath(applierName, jobId) {
  return path.join(DRAFT_ROOT, safe(applierName) || "applier", safe(jobId) || "job", "draft.pdf");
}

function draftMetaPath(applierName, jobId) {
  return path.join(path.dirname(agentDraftPdfPath(applierName, jobId)), "draft.meta.json");
}

/** Fingerprint of the visual config that affects PDF HTML (ignore LLM prompts etc.). */
export function agentPdfRenderFingerprint(config) {
  const c = config && typeof config === "object" ? config : {};
  const payload = {
    v: AGENT_PDF_RENDER_VERSION,
    templateId: c.templateId ?? null,
    theme: c.theme ?? null,
    layout: c.layout ?? null,
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

/** Write PDF bytes to the stable draft path (+ optional timestamped review copy). */
export function writeAgentDraftPdf({ buffer, applierName, jobId, html, config }) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  const dir = path.dirname(draftPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(draftPath, buffer);
  if (html) {
    fs.writeFileSync(path.join(dir, "draft.html"), html, "utf8");
  }
  try {
    fs.writeFileSync(
      path.join(dir, "draft.meta.json"),
      JSON.stringify({
        fingerprint: agentPdfRenderFingerprint(config),
        templateId: config?.templateId ?? null,
        renderVersion: AGENT_PDF_RENDER_VERSION,
        writtenAt: new Date().toISOString(),
      }),
      "utf8",
    );
  } catch {
    /* meta is best-effort */
  }

  let reviewPath = "";
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const reviewDir = path.join(REVIEW_ROOT, stamp);
    fs.mkdirSync(reviewDir, { recursive: true });
    const base = `${safe(applierName) || "resume"}-${safe(jobId) || "job"}`;
    reviewPath = path.join(reviewDir, `${base}.pdf`);
    fs.writeFileSync(reviewPath, buffer);
    if (html) fs.writeFileSync(path.join(reviewDir, `${base}.html`), html, "utf8");
  } catch {
    /* review copy is best-effort */
  }

  return { draftPath, reviewPath };
}

/**
 * Read the on-disk draft PDF if it exists and still matches the current render config.
 * Pass `config` (saved Resume Generator config) so template/theme/layout changes invalidate
 * the cache. Without config, any existing draft is returned (legacy callers).
 */
export function readAgentDraftPdf(applierName, jobId, config) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  if (!fs.existsSync(draftPath)) return null;
  const buffer = fs.readFileSync(draftPath);
  if (!buffer?.length) return null;

  if (config !== undefined) {
    const metaFile = draftMetaPath(applierName, jobId);
    let meta = null;
    try {
      if (fs.existsSync(metaFile)) meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
      meta = null;
    }
    const expected = agentPdfRenderFingerprint(config);
    // No meta ⇒ pre-fingerprint / pre-templateId draft — always stale.
    if (!meta?.fingerprint || meta.fingerprint !== expected) return null;
  }

  return { buffer, draftPath };
}

/** Remove the stable draft PDF (and sibling html/meta) so the next run re-renders. */
export function deleteAgentDraftPdf(applierName, jobId) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  const dir = path.dirname(draftPath);
  try {
    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
    for (const name of ["draft.html", "draft.meta.json"]) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {
    /* best-effort */
  }
}

export { REVIEW_ROOT, DRAFT_ROOT };
