export type WorkMode = "remote" | "hybrid" | "onsite";

export type JobStatus = "new" | "applied" | "scheduled" | "declined";

export type SkillAnalysisStatus = "pending" | "queued" | "analyzing" | "analyzed" | "failed";

export interface SkillAnalysis {
  status: SkillAnalysisStatus;
  queuedAt?: string;
  startedAt?: string;
  analyzedAt?: string;
  failedAt?: string;
  error?: string;
  provider?: "openai" | "deepseek" | "auto" | string;
  skillsProcessed?: number;
}

export interface JobScores {
  overall: number;
  skill: number;
  salary: number;
  bidEst: number;
  freshness: number;
}

export interface Job {
  id: string;
  /** MongoDB _id when loaded from Athens-server API */
  backendId?: string;
  title: string;
  company: string;
  companyUrl: string;
  logoUrl?: string;
  location: string;
  workMode: WorkMode;
  type: string;
  seniority: string;
  industries: string[];
  status: JobStatus;
  scores: JobScores;
  /** @deprecated use scores.overall */
  matchScore: number;
  posted: string;
  postedAt: string;
  salary: string;
  source: string;
  jobDescription: string;
  applyUrl: string;
  skillAnalysis?: SkillAnalysis;
}
