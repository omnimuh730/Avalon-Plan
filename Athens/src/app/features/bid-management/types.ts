export type BidResultStatus =
  | "pending"
  | "in_process"
  | "submitted"
  | "reviewed"
  | "rejected";

export type FlagLight = "green" | "red" | null;

export type BidResult = {
  id: string;
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
  /** Future: join vendor_tasks + session + Storage under bid-recordings/… */
  recording: {
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    /** Mock playback URL (not live Firebase signed URL). */
    previewUrl: string;
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
];
