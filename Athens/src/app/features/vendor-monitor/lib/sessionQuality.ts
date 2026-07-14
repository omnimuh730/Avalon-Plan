import type { BidFlagVerdicts, BidSessionSummary, ResumeUploadInfo } from "../types";
import { matchUploadToRecommended } from "../utils";

/** Screening light is acceptable when green or still unknown (not a red disqualifier). */
export function flagNotRed(
  verdict: BidFlagVerdicts["remote"] | BidFlagVerdicts["clearance"] | null | undefined,
): boolean {
  return !verdict || verdict.status !== "red";
}

export function sessionHasResumeMatch(
  session: Pick<BidSessionSummary, "recommendedResumeName" | "resumeUploads">,
  uploads?: ResumeUploadInfo[] | null,
): boolean {
  const recommended = session.recommendedResumeName?.trim();
  if (!recommended) return false;
  const list =
    (uploads && uploads.length > 0 ? uploads : null) ??
    (session.resumeUploads && session.resumeUploads.length > 0 ? session.resumeUploads : null);
  if (!list?.length) return false;
  return list.some(
    (upload) => matchUploadToRecommended(upload.originalName, recommended) === "match",
  );
}

/**
 * Bidder kept all hard requirements:
 * completed + JD analyzed + Remote/No clearance not red + resume matches recommended.
 */
export function sessionMeetsAllRequirements(
  session: BidSessionSummary,
  uploads?: ResumeUploadInfo[] | null,
): boolean {
  if (session.status !== "completed") return false;
  const jdOk = Boolean(session.jdAnalyzed) || session.analysisCount > 0;
  if (!jdOk) return false;
  if (!flagNotRed(session.flags?.remote)) return false;
  if (!flagNotRed(session.flags?.clearance)) return false;
  return sessionHasResumeMatch(session, uploads);
}
