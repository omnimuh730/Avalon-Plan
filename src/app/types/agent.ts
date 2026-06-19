export type NodeStatus = "running" | "complete" | "pending" | "draft";

export type PipelineNodeType = "scan" | "parse" | "match" | "rank" | "notify" | "custom";

export interface PipelineNodeConfig {
  delayMs?: number;
  model?: string;
  threshold?: number;
}

export interface PipelineNode {
  id: string;
  label: string;
  description: string;
  status: NodeStatus;
  x: number;
  y: number;
  type?: PipelineNodeType;
  config?: PipelineNodeConfig;
  metrics?: { likes?: number; shares?: number; count?: number };
}

export interface PipelineEdge {
  from: string;
  to: string;
  label: string;
  color: string;
}

export interface AgentRunLog {
  id: string;
  timestamp: string;
  stepLabel: string;
  message: string;
  output?: string;
}

export interface AgentConversationMessage {
  id: string;
  role: "agent" | "system";
  content: string;
  timestamp: string;
}

export type AgentStudioMode = "monitor" | "design";

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
  runsToday?: number;
  conversation?: AgentConversationMessage[];
  runLogs?: AgentRunLog[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  model: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}
