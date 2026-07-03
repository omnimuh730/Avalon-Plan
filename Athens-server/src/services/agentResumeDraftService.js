/**
 * Per-job agent résumé drafts on disk (Node fs). Each Mongo job id gets a stable
 * `draft.pdf` path so the Agent UI can stream/preview without re-embedding huge base64.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".local",
  "agent-resumes",
);
const DRAFT_ROOT = path.join(REVIEW_ROOT, "by-job");

const safe = (s) => String(s || "").replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Stable draft path for applier + job id. */
export function agentDraftPdfPath(applierName, jobId) {
  return path.join(DRAFT_ROOT, safe(applierName) || "applier", safe(jobId) || "job", "draft.pdf");
}

/** Write PDF bytes to the stable draft path (+ optional timestamped review copy). */
export function writeAgentDraftPdf({ buffer, applierName, jobId, html }) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  fs.mkdirSync(path.dirname(draftPath), { recursive: true });
  fs.writeFileSync(draftPath, buffer);
  if (html) {
    fs.writeFileSync(path.join(path.dirname(draftPath), "draft.html"), html, "utf8");
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

/** Read the on-disk draft PDF if it exists. */
export function readAgentDraftPdf(applierName, jobId) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  if (!fs.existsSync(draftPath)) return null;
  const buffer = fs.readFileSync(draftPath);
  if (!buffer?.length) return null;
  return { buffer, draftPath };
}

/** Remove the stable draft PDF (and sibling html) so the next run re-renders from fresh sections. */
export function deleteAgentDraftPdf(applierName, jobId) {
  const draftPath = agentDraftPdfPath(applierName, jobId);
  const dir = path.dirname(draftPath);
  try {
    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
    const html = path.join(dir, "draft.html");
    if (fs.existsSync(html)) fs.unlinkSync(html);
  } catch {
    /* best-effort */
  }
}

export { REVIEW_ROOT, DRAFT_ROOT };
