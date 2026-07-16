export type BidResultStatus =
  | "pending"
  | "in_process"
  | "submitted"
  | "reviewed"
  | "rejected"
  | "skipped";

export type FlagLight = "green" | "red" | null;

export type BidJobDetail = {
  description: string | null;
  postedAt: string | null;
  postedLabel: string | null;
  salary: string | null;
  workMode: string | null;
  seniority: string | null;
  employmentType: string | null;
  experience: string | null;
  skills: string[];
  applicantsText: string | null;
};

export type BidResumeInfo = {
  name: string;
  techStack: string | null;
  source: string | null;
  fileName: string | null;
  usedAt: string | null;
  scorePercent: number | null;
};

export type BidResult = {
  id: string;
  /** vendor_tasks id (or jobId) used for PATCH /bid-results/:id */
  taskId?: string | null;
  /** Mongo job id when linked to Job Search / Bid ready. */
  jobId: string | null;
  /** Calendar day key YYYY-MM-DD used for folder grouping (pooled date). */
  dayKey: string;
  job: {
    title: string;
    company: string;
    location: string;
    source: string;
    applyUrl: string;
  };
  bidder: {
    name: string;
    avatarInitials: string;
  };
  status: BidResultStatus;
  pooledAt: string;
  submittedAt: string | null;
  durationSec: number | null;
  matchScore: number | null;
  flags: {
    remote: FlagLight;
    clearance: FlagLight;
  };
  /** Snapshot job fields. Live fetch overlays when jobId is set. */
  jobDetail: BidJobDetail | null;
  /** Recommended / generated résumé for this job (pending & in-process). */
  recommendedResume: BidResumeInfo | null;
  /** Résumé actually used on submission (submitted / reviewed / rejected). */
  submissionResume: BidResumeInfo | null;
  recording: {
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    /** Optional direct URL; live tickets resolve storagePath via signed URL. */
    previewUrl?: string | null;
  } | null;
  notes: string | null;
};

export type BidResultKpis = Record<BidResultStatus, number> & { total: number };

export type DateFolder = {
  dayKey: string;
  label: string;
  count: number;
  byStatus: Record<BidResultStatus, number>;
};

export type PeriodPreset = "7d" | "14d" | "30d" | "all";

export type ViewMode = "kanban" | "list";

export const BID_STATUSES: BidResultStatus[] = [
  "pending",
  "in_process",
  "submitted",
  "reviewed",
  "rejected",
  "skipped",
];

/** Kanban drag + preview status edit allowed only among these. */
export const EDITABLE_STATUSES: BidResultStatus[] = ["submitted", "reviewed", "rejected"];

export function isEditableStatus(status: BidResultStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}
