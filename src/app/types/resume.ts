export interface ResumeIdentity {
  fullName: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
}

export interface ResumeExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeSkills {
  languages: string[];
  frameworks: string[];
  databases: string[];
  cloudDevOps: string[];
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  location: string;
  graduationDate: string;
}

export interface ResumeDocument {
  id: string;
  identity: ResumeIdentity;
  summary: string;
  experiences: ResumeExperience[];
  skills: ResumeSkills;
  education: ResumeEducation[];
}

export interface ResumeSummary {
  id: string;
  name: string;
  version: string;
  updated: string;
  matchScore: number;
  skills: string[];
  isPrimary: boolean;
  documentId?: string;
}

export type TemplateLayout =
  | "standard"
  | "two-column"
  | "classic"
  | "centered"
  | "minimal"
  | "compact"
  | "modern"
  | "bold";

export interface ResumeTemplateRef {
  id: string;
  name: string;
  layout: TemplateLayout;
  description: string;
  source: "builtin" | "uploaded";
}

export interface ResumeTheme {
  font: string;
  bodySizePt: number;
  nameSizePt: number;
  accentColor: string;
  textColor: string;
  headerAlign: "left" | "center";
  paperSize: "letter" | "a4";
  marginIn: number;
}

export type SectionId = "summary" | "experience" | "skills" | "education";

export interface SectionLayoutConfig {
  id: SectionId;
  titleSizePt: number;
  bodySizePt: number;
  color: string;
  order: number;
}

export type ResumeStackCatalog = Record<string, Record<string, number>>;

export interface RefinementStep {
  id: string;
  title: string;
  section: string;
  mode: "fine-tune" | "final";
  prompt: string;
  outputSchema?: string;
}

export interface RefinementPipeline {
  id: string;
  name: string;
  steps: RefinementStep[];
  isDefault?: boolean;
}

export type GenerationRunStatus = "completed" | "failed" | "running";

export interface GenerationRun {
  id: string;
  status: GenerationRunStatus;
  createdAt: string;
  jobTitle?: string;
  jobDescription: string;
  model: string;
  provider: string;
  templateId: string;
  tokens: number;
  costUsd: number;
  document: ResumeDocument;
  refinementSteps: RefinementStep[];
}

export interface EditorDraft {
  document: ResumeDocument;
  templateId: string;
  theme: ResumeTheme;
  sections: SectionLayoutConfig[];
  provider: string;
  model: string;
  reasoningEffort: string;
  jobDescription: string;
  refinementSteps: RefinementStep[];
  baseResumeId?: string;
}

export interface GenerateInput {
  jobDescription: string;
  identity: ResumeIdentity;
  stackId?: string;
  baseDocument?: ResumeDocument;
}

export interface GenerateResult {
  document: ResumeDocument;
  tokens: number;
  costUsd: number;
  jobTitle?: string;
}

export interface BulkUploadResult {
  ok: ResumeSummary[];
  failed: string[];
}

export interface StoredDocumentRecord {
  summary: ResumeSummary;
  document: ResumeDocument;
}
