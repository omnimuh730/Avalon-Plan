import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Pause,
  Play,
  RefreshCw,
  Save,
  Terminal,
  Undo2,
  Redo2,
  Pencil,
  Activity,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { Badge } from "../../../components/ui";
import { useResumeNavigationOptional } from "../../../context/ResumeNavigationContext";
import { useJobSearchNavigationOptional } from "../../../context/JobSearchNavigationContext";
import { AgentFlowCanvas } from "./AgentFlowCanvas";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { AgentNodePalette } from "./AgentNodePalette";
import { AgentNodeInspector } from "./AgentNodeInspector";
import { AgentRunsDrawer } from "./AgentRunsDrawer";
import { useAgentPipeline } from "../hooks/useAgentPipeline";
import { createNodeFromTemplate } from "../lib/agentFlowUtils";
import type { Agent, AgentStudioMode } from "../../../types";

export function AgentPipelineMonitor({
  agent,
  initialMode = "monitor",
  onBack,
  onToggle,
}: {
  agent: Agent;
  initialMode?: AgentStudioMode;
  onBack: () => void;
  onToggle: (id: string) => void;
}) {
  const pipeline = useAgentPipeline(agent.id);
  const [logsOpen, setLogsOpen] = useState(false);
  const resumeNav = useResumeNavigationOptional();
  const jobNav = useJobSearchNavigationOptional();

  useEffect(() => {
    pipeline.setMode(initialMode);
  }, [agent.id, initialMode]);

  const lastSaveLabel = useMemo(() => {
    if (!pipeline.lastSaved) return "Unsaved changes";
    return `Saved ${formatDistanceToNow(new Date(pipeline.lastSaved), { addSuffix: true })}`;
  }, [pipeline.lastSaved]);

  const handleDropNode = useCallback(
    (type: Parameters<typeof createNodeFromTemplate>[0], position: { x: number; y: number }) => {
      const node = createNodeFromTemplate(type, position);
      pipeline.updatePipeline([...pipeline.nodes, node], pipeline.edges);
    },
    [pipeline],
  );

  const handleNotifyAction = useCallback(() => {
    if (agent.id === "ag1") {
      jobNav?.openJobSearch({ statusTab: "new", sort: "newest" });
    } else if (agent.id === "ag2") {
      resumeNav?.openEditor({ tab: "editor" });
    }
  }, [agent.id, jobNav, resumeNav]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card flex-shrink-0 flex-wrap">
        <button type="button" onClick={onBack} className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Agents / <span className="text-foreground font-semibold">{agent.name}</span></p>
        </div>

        <ModeToggle mode={pipeline.mode} onChange={pipeline.setMode} />

        <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
          {lastSaveLabel}
        </span>

        <button type="button" onClick={() => onToggle(agent.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-9">
          {agent.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {agent.status === "active" ? "Pause" : "Resume"}
        </button>
        <button type="button" onClick={pipeline.savePipeline} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 min-h-9">
          <Save className="w-4 h-4" />
          Save
        </button>
        <button type="button" onClick={() => setLogsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-9">
          <Terminal className="w-4 h-4" />
          Logs
        </button>
        <Badge v={agent.status === "active" ? "success" : agent.status === "complete" ? "blue" : "subtle"}>
          {agent.status}
        </Badge>
      </header>

      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-secondary/30 flex-shrink-0">
        <ToolbarBtn icon={Undo2} onClick={pipeline.undo} disabled={!pipeline.canUndo} title="Undo" />
        <ToolbarBtn icon={Redo2} onClick={pipeline.redo} disabled={!pipeline.canRedo} title="Redo" />
        <div className="w-px h-5 bg-border mx-1" />
        <button type="button" onClick={pipeline.resetToTemplate} className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary">
          Reset template
        </button>
        {agent.id === "ag1" && (
          <button type="button" onClick={handleNotifyAction} className="ml-auto text-xs font-semibold text-primary hover:underline">
            Open matched jobs →
          </button>
        )}
        {agent.id === "ag2" && (
          <button type="button" onClick={() => resumeNav?.openEditor({ tab: "history" })} className="ml-auto text-xs font-semibold text-primary hover:underline">
            View generation history →
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {pipeline.mode === "design" && <AgentNodePalette />}

        <div className="flex-1 relative min-w-0">
          <AgentFlowCanvas
            nodes={pipeline.nodes}
            edges={pipeline.edges}
            mode={pipeline.mode}
            selectedNodeId={pipeline.selectedNodeId}
            onNodesChange={pipeline.updatePipeline}
            onSelectNode={pipeline.setSelectedNodeId}
            onDropNode={pipeline.mode === "design" ? handleDropNode : undefined}
          />
        </div>

        {pipeline.mode === "monitor" ? (
          <AgentMetricsPanel agent={agent} onOpenResumeSetup={() => resumeNav?.openEditor({ tab: "analysis" })} />
        ) : null}
      </div>

      <AgentNodeInspector
        node={pipeline.mode === "design" ? pipeline.selectedNode : null}
        onUpdate={(patch) => pipeline.selectedNode && pipeline.updateNode(pipeline.selectedNode.id, patch)}
        onClose={() => pipeline.setSelectedNodeId(null)}
      />

      <AgentRunsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} agentName={agent.name} logs={agent.runLogs} />
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: AgentStudioMode; onChange: (m: AgentStudioMode) => void }) {
  return (
    <div className="flex items-center bg-secondary rounded-lg p-0.5 border border-border">
      <button
        type="button"
        onClick={() => onChange("monitor")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
          mode === "monitor" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
        )}
      >
        <Activity className="w-3.5 h-3.5" />
        Monitor
      </button>
      <button
        type="button"
        onClick={() => onChange("design")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
          mode === "design" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
        )}
      >
        <Pencil className="w-3.5 h-3.5" />
        Design
      </button>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  onClick,
  disabled,
  title,
}: {
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-8 h-8 disabled:opacity-30"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
