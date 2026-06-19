import type { Edge, Node } from "@xyflow/react";
import type { PipelineEdge, PipelineNode } from "../types";

export type FlowNodeData = {
  pipelineNode: PipelineNode;
  readOnly?: boolean;
  selected?: boolean;
};

export function pipelineToFlow(nodes: PipelineNode[], edges: PipelineEdge[], readOnly = false): {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
} {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: "pipeline",
      position: { x: n.x, y: n.y },
      data: { pipelineNode: n, readOnly },
    })),
    edges: edges.map((e, i) => ({
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: nodes.find((n) => n.id === e.from)?.status === "running",
      style: { stroke: e.color, strokeWidth: 2 },
      labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    })),
  };
}

export function flowToPipeline(
  flowNodes: Node<FlowNodeData>[],
  flowEdges: Edge[],
  prevNodes: PipelineNode[],
  prevEdges: PipelineEdge[],
): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
  const nodes: PipelineNode[] = flowNodes.map((fn) => {
    const prev = prevNodes.find((p) => p.id === fn.id);
    const pn = fn.data.pipelineNode;
    return {
      ...pn,
      id: fn.id,
      x: fn.position.x,
      y: fn.position.y,
      label: pn.label,
      description: pn.description,
      status: prev?.status ?? pn.status,
      metrics: prev?.metrics ?? pn.metrics,
      type: pn.type,
      config: pn.config,
    };
  });

  const edges: PipelineEdge[] = flowEdges.map((fe) => {
    const prev = prevEdges.find((p) => p.from === fe.source && p.to === fe.target);
    return {
      from: fe.source,
      to: fe.target,
      label: typeof fe.label === "string" ? fe.label : prev?.label ?? "",
      color: (fe.style as { stroke?: string })?.stroke ?? prev?.color ?? "#6c5ce7",
    };
  });

  return { nodes, edges };
}

export function createNodeFromTemplate(
  type: PipelineNode["type"],
  position: { x: number; y: number },
): PipelineNode {
  const templates: Record<string, { label: string; description: string }> = {
    scan: { label: "Scan Boards", description: "Query job boards and APIs" },
    parse: { label: "Parse JDs", description: "Extract requirements from listings" },
    match: { label: "Match Profile", description: "Compare against your resume" },
    rank: { label: "Rank Results", description: "Score and prioritize matches" },
    notify: { label: "Notify You", description: "Push top matches to dashboard" },
    custom: { label: "Custom Step", description: "Configure this step" },
  };
  const t = templates[type ?? "custom"] ?? templates.custom;
  return {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: t.label,
    description: t.description,
    status: "draft",
    x: position.x,
    y: position.y,
    type: type ?? "custom",
    config: { delayMs: 100, model: "gpt-4o-mini", threshold: 80 },
  };
}
