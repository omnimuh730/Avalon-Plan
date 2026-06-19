export type WorkMode = "remote" | "hybrid" | "onsite";

export type JobStatus = "new" | "applied" | "scheduled" | "declined";

export interface JobScores {
  overall: number;
  skill: number;
  salary: number;
  bidEst: number;
  freshness: number;
}

export interface Job {
  id: string;
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
}
