import type { JobSource } from "@/lib/job-source";

export type BidMonitorSource = "cloud" | "local";

export interface ResumeUploadInfo {
  originalName: string;
  cleanedName: string | null;
  renamed: boolean;
  source?: string | null;
  pageUrl?: string | null;
  ts?: number;
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
