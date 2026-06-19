import React, { useState } from "react";
import {
  ArrowLeft,
  Pause,
  RefreshCw,
  Settings,
  Terminal,
  Undo2,
  Redo2,
  Grid3X3,
  MousePointer2,
  Hand,
  Link2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { Badge } from "../../../components/ui";
import { useResumeNavigationOptional } from "../../../context/ResumeNavigationContext";
import { PipelineNodeCard } from "./PipelineNode";
import { PipelineEdges } from "./PipelineEdge";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import type { Agent } from "../../../types";

export function AgentPipelineMonitor({
  agent,
  onBack,
}: {
  agent: Agent;
  onBack: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const resumeNav = useResumeNavigationOptional();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={onBack}
          className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Agents</span>
            <span>/</span>
            <span className="text-foreground font-semibold">{agent.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
          Last save 2 min ago
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-10">
          <Pause className="w-4 h-4" />
          Pause Agent
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-10">
          <Settings className="w-4 h-4" />
          Configure
        </button>
        {agent.id === "ag2" && (
          <button
            type="button"
            onClick={() => resumeNav?.openEditor({ tab: "history" })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 min-h-10"
          >
            View generation history
          </button>
        )}
        <Badge v={agent.status === "active" ? "success" : agent.status === "complete" ? "blue" : "subtle"}>
          {agent.status}
        </Badge>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative overflow-hidden bg-secondary/30">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5 shadow-md">
            <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-9 h-9 min-w-9 min-h-9">
              <Undo2 className="w-4 h-4" />
            </button>
            <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-9 h-9 min-w-9 min-h-9">
              <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-9 h-9 min-w-9 min-h-9"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground px-2 min-w-[48px] text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
              className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-9 h-9 min-w-9 min-h-9"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={cn(
                "icon-btn w-9 h-9 min-w-9 min-h-9",
                showGrid
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Terminal className="w-4 h-4" />
              View Logs
            </button>
          </div>

          <div
            className={cn(
              "absolute inset-0 overflow-auto subtle-scroll",
              showGrid && "dot-grid"
            )}
          >
            <div
              className="relative origin-top-left transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100})`,
                minWidth: 1100,
                minHeight: 320,
                padding: 40,
              }}
            >
              <PipelineEdges edges={agent.edges} nodes={agent.nodes} />
              {agent.nodes.map((node) => (
                <PipelineNodeCard key={node.id} node={node} />
              ))}
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-foreground text-background rounded-full px-3 py-2 shadow-lg">
            <button className="icon-btn w-9 h-9 min-w-9 min-h-9 bg-white/10 hover:bg-white/20 text-white rounded-full">
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button className="icon-btn w-9 h-9 min-w-9 min-h-9 hover:bg-white/10 text-white/70 rounded-full">
              <Hand className="w-4 h-4" />
            </button>
            <button className="icon-btn w-9 h-9 min-w-9 min-h-9 hover:bg-white/10 text-white/70 rounded-full">
              <Settings className="w-4 h-4" />
            </button>
            <button className="icon-btn w-9 h-9 min-w-9 min-h-9 hover:bg-white/10 text-white/70 rounded-full">
              <Link2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <AgentMetricsPanel agent={agent} />
      </div>
    </div>
  );
}
