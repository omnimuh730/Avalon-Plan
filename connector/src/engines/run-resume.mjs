// Persist the exact résumé file uploaded for a job application so the Athens
// live-run UI can preview and link to it after the run finishes.

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.mjs";

function mimeFromExt(ext) {
  const e = String(ext || "").toLowerCase();
  if (e === ".pdf") return "application/pdf";
  if (e === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (e === ".doc") return "application/msword";
  if (e === ".txt") return "text/plain";
  return "application/octet-stream";
}

export function runResumesDir(runId) {
  return path.join(PATHS.agentRuntime, "logs", "runs", String(runId));
}

/** Copy the on-disk upload target into the run log dir (stable name per job). */
export function persistRunJobResume({ runId, jobIndex, sourcePath }) {
  if (runId == null || jobIndex == null || !sourcePath || !fs.existsSync(sourcePath)) return null;
  const ext = path.extname(sourcePath) || ".pdf";
  const safeExt = ext.replace(/[^.\w]/g, "") || ".pdf";
  const dir = runResumesDir(runId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `resume-job-${String(jobIndex).padStart(3, "0")}${safeExt}`;
  const dest = path.join(dir, fileName);
  try {
    fs.copyFileSync(sourcePath, dest);
    const stat = fs.statSync(dest);
    return {
      fileName,
      mimeType: mimeFromExt(safeExt),
      sizeBytes: stat.size,
      originalFileName: path.basename(sourcePath),
    };
  } catch {
    return null;
  }
}

export function resolveRunResumePath(runId, fileName) {
  const safe = path.basename(String(fileName || ""));
  if (!safe || safe !== fileName || safe.includes("..")) return null;
  const resolved = path.resolve(runResumesDir(runId), safe);
  const runsDir = path.resolve(path.join(PATHS.agentRuntime, "logs", "runs"));
  if (!resolved.startsWith(runsDir)) return null;
  return fs.existsSync(resolved) ? resolved : null;
}

/** Extra fields to spread onto a `resumeMatch` SSE event. */
export function attachRunResumeFields({
  runId,
  jobIndex,
  sourcePath,
  profileName,
  resumeId,
  generationId,
  aiGenerated,
  resumeFileName,
}) {
  const persisted = persistRunJobResume({ runId, jobIndex, sourcePath });
  const mimeType = persisted?.mimeType || (sourcePath ? mimeFromExt(path.extname(sourcePath)) : null);
  return {
    resumeId: resumeId || null,
    generationId: generationId || null,
    profileName: profileName || null,
    aiGenerated: !!aiGenerated,
    resumeFileName: persisted?.fileName || null,
    resumeMimeType: mimeType,
    resumeSizeBytes: persisted?.sizeBytes || null,
    submittedFileName: persisted?.originalFileName || resumeFileName || (sourcePath ? path.basename(sourcePath) : null),
    hasRunResume: !!persisted,
  };
}
