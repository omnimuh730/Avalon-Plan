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
