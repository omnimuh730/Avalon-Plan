import React from "react";
import type { PipelineEdge, PipelineNode } from "../../types";

export function PipelineEdges({
  edges,
  nodes,
}: {
  edges: PipelineEdge[];
  nodes: PipelineNode[];
}) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 1000, minHeight: 280 }}>
      {edges.map((edge, i) => {
        const from = nodeMap[edge.from];
        const to = nodeMap[edge.to];
        if (!from || !to) return null;

        const x1 = from.x + 180;
        const y1 = from.y + 60;
        const x2 = to.x;
        const y2 = to.y + 60;
        const midX = (x1 + x2) / 2;

        return (
          <g key={i}>
            <path
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={edge.color}
              strokeWidth={2}
              opacity={0.7}
            />
            <circle cx={x2} cy={y2} r={4} fill={edge.color} />
            <text
              x={midX}
              y={(y1 + y2) / 2 - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold"
              style={{ fontSize: 11 }}
            >
              {edge.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
