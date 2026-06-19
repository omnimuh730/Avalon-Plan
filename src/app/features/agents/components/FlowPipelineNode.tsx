import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle, Heart, Share2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Badge } from "../../../components/ui";
import type { FlowNodeData } from "../lib/agentFlowUtils";

const STATUS: Record<
  string,
  { badge: "success" | "violet" | "subtle" | "blue"; border: string; pulse?: boolean }
> = {
  running: { badge: "violet", border: "border-primary ring-2 ring-primary/20", pulse: true },
  complete: { badge: "success", border: "border-emerald-300" },
  pending: { badge: "subtle", border: "border-border" },
  draft: { badge: "subtle", border: "border-dashed border-border" },
};

export const FlowPipelineNode = memo(function FlowPipelineNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const node = d.pipelineNode;
  const s = STATUS[node.status] ?? STATUS.pending;

  return (
    <div
      className={cn(
        "w-[200px] bg-card border rounded-xl p-4 shadow-md transition-all",
        s.border,
        s.pulse && "animate-pulse",
        selected && "ring-2 ring-primary/40",
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary !border-0" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary !border-0" />

      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          {node.status === "complete" ? (
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-primary" />
          )}
        </div>
        <Badge v={s.badge}>{node.status === "running" ? "Running" : node.status}</Badge>
      </div>
      <p className="text-sm font-bold text-foreground mb-1">{node.label}</p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{node.description}</p>
      {node.metrics && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {node.metrics.count !== undefined && <span className="font-semibold">{node.metrics.count}</span>}
          {node.metrics.likes !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" />
              {node.metrics.likes}
            </span>
          )}
          {node.metrics.shares !== undefined && (
            <span className="flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5" />
              {node.metrics.shares}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
