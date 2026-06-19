export type View =
  | "dashboard"
  | "job-board"
  | "resumes"
  | "ats"
  | "copilot"
  | "agents"
  | "mail"
  | "calendar"
  | "interviews"
  | "reports"
  | "settings";

export interface Application {
  id: string;
  company: string;
  role: string;
  score: number;
  stage: string;
  tags: string[];
  source: string;
  time: string;
  email: string;
  location: string;
  salary?: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  status: "saved" | "applied" | "closed";
  matchScore: number;
  posted: string;
  salary: string;
  source: string;
}

export interface Msg {
  id: string;
  role: "user" | "ai";
  content: string;
  ts: string;
}

export type NodeStatus = "running" | "complete" | "pending" | "draft";

export interface PipelineNode {
  id: string;
  label: string;
  description: string;
  status: NodeStatus;
  x: number;
  y: number;
  metrics?: { likes?: number; shares?: number; count?: number };
}

export interface PipelineEdge {
  from: string;
  to: string;
  label: string;
  color: string;
}

export interface Agent {
  id: string;
  name: string;
  status: "active" | "idle" | "complete";
  task: string;
  progress: number;
  matched: number;
  model: string;
  throughput: number;
  errorRate: number;
  latencyMs: number;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  normalizedOutput: string;
}

export interface MailThread {
  id: string;
  from: string;
  subj: string;
  prev: string;
  time: string;
  unread: boolean;
  tag: string;
}

export interface Resume {
  id: string;
  name: string;
  version: string;
  updated: string;
  matchScore: number;
  skills: string[];
  isPrimary: boolean;
}

export type BadgeVariant =
  | "default"
  | "success"
  | "warn"
  | "err"
  | "violet"
  | "blue"
  | "subtle"
  | "amber"
  | "pink";
