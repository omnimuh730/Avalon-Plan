import type { JobSource } from "@/lib/job-source";

export interface ResumeUploadInfo {
  originalName: string;
  cleanedName: string | null;
  renamed: boolean;
  source?: string | null;
  pageUrl?: string | null;
  ts?: number;
}

/** Traffic-light screening — matches bid-assistant BidFlagVerdicts. */
export type FlagStatus = "green" | "red";

export interface FlagVerdict {
  status: FlagStatus;
  explanation: string;
}

export interface BidFlagVerdicts {
  remote: FlagVerdict | null;
  clearance: FlagVerdict | null;
}

export interface BidSessionSummary {
  sessionId: string;
  applierName: string | null;
  profileId: string | null;
  startedAt: string;
  completedAt: string | null;
  status: "active" | "completed";
  processCount: number;
  analysisCount: number;
  resumeUploadCount?: number;
  recordCount: number;
  totalCost: number;
  totalTokens: number;
  firstUrl: string | null;
  firstTitle: string | null;
  lastUrl: string | null;
  jobSource?: JobSource | null;
  modelVersion?: string | null;
  resumeUploads?: ResumeUploadInfo[];
  /** True once at least one JD analysis was persisted for the session. */
  jdAnalyzed?: boolean;
  /** Screening traffic lights (remote / no clearance). */
  flags?: BidFlagVerdicts;
}

export interface UsageInfo {
  model: string | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  savings: number | null;
}

export interface AnalysisInfo {
  isJobPage: boolean;
  summary: string;
  notJobPageReason: string | null;
  skillProfile: string | null;
  bestResume: { name: string; scorePercent: number | null } | null;
  topResumes: { name: string; scorePercent: number | null }[];
  formAnswers: { question: string; suggestedAnswer: string; confidence: string }[];
}

export interface AnalysisTrace {
  request?: {
    url?: string | null;
    title?: string | null;
    visibleTextExcerpt?: string | null;
  } | null;
  response?: Record<string, unknown> | null;
}

export interface BidRecord {
  id: string;
  type: "session-start" | "process" | "analysis" | "resume-upload" | "session-complete";
  modelVersion?: string | null;
  url: string | null;
  title: string | null;
  triggerText: string | null;
  screenshot: string | null;
  analysis: AnalysisInfo | null;
  usage: UsageInfo | null;
  trace: AnalysisTrace | null;
  flags?: BidFlagVerdicts;
  jobSource?: JobSource | null;
  originalName?: string | null;
  cleanedName?: string | null;
  renamed?: boolean;
  uploadSource?: string | null;
  resumeUploads?: ResumeUploadInfo[];
  createdAt: string;
}

export interface SessionDetail {
  session: BidSessionSummary;
  records: BidRecord[];
}

export interface VendorAnalyticsTotals {
  sessions: number;
  completed: number;
  active: number;
  totalCost: number;
  totalTokens: number;
  processCount: number;
  analysisCount: number;
  resumeUploadCount: number;
  avgDurationMs: number;
  completionRate: number;
}

export interface VendorAnalyticsByDay {
  day: string;
  sessions: number;
  completed: number;
  totalCost: number;
  totalTokens: number;
  processCount: number;
  analysisCount: number;
  resumeUploadCount: number;
}

export interface VendorAnalyticsBucket {
  bucket: string;
  sessions: number;
  completed: number;
  totalCost: number;
  totalTokens: number;
  processCount: number;
  analysisCount: number;
  resumeUploadCount: number;
}

export interface VendorAnalyticsByJobSource {
  label: string;
  host: string | null;
  sessions: number;
  completed: number;
  totalCost: number;
}

export interface VendorAnalyticsResponse {
  success: boolean;
  timezone: string;
  granularity: "day" | "hour";
  since?: string | null;
  until?: string | null;
  totals: VendorAnalyticsTotals;
  byDay: VendorAnalyticsByDay[];
  byHour?: VendorAnalyticsBucket[];
  byBucket: VendorAnalyticsBucket[];
  byJobSource: VendorAnalyticsByJobSource[];
}

/** A job assigned to a vendor — one entry in the task / job pool. */
export type VendorTaskStatus = "pending" | "done" | "skipped";
export type VendorTaskProgress = "idle" | "active" | "completed" | "skipped";

export interface VendorTaskSessionMatch {
  sessionId: string;
  lastSeenAt: string | null;
  completed: boolean;
}

export interface VendorTask {
  id: string;
  applierName: string | null;
  jobId: string | null;
  title: string;
  company: string;
  applyUrl: string | null;
  source: string;
  location: string;
  workMode: string;
  matchScore: number | null;
  status: VendorTaskStatus;
  /** Derived from bid sessions + manual status. */
  progress: VendorTaskProgress;
  sessionMatch: VendorTaskSessionMatch | null;
  jobSource?: JobSource | null;
  addedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface VendorTaskTotals {
  total: number;
  pending: number;
  active: number;
  done: number;
  skipped: number;
}

export interface VendorTaskAnalyticsTotals extends VendorTaskTotals {
  completionRate: number;
  stillPosted: number | null;
}

export interface VendorTaskAnalyticsByDay {
  day: string;
  added: number;
  done: number;
}

export interface VendorTaskAnalyticsBySource {
  label: string;
  host: string | null;
  total: number;
  done: number;
  active: number;
  pending: number;
  skipped: number;
}

export interface VendorTaskAnalyticsResponse {
  success: boolean;
  since?: string | null;
  until?: string | null;
  totals: VendorTaskAnalyticsTotals;
  byDay: VendorTaskAnalyticsByDay[];
  bySource: VendorTaskAnalyticsBySource[];
}
