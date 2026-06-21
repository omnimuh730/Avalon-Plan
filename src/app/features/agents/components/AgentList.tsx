import React from "react";
import {
  Bot,
  Activity,
  Briefcase,
  Play,
  Pause,
  MoreHorizontal,
  ChevronRight,
  Pencil,
  Zap,
} from "lucide-react";
import { cn, mono } from "../../../lib/utils";
import { KPI } from "../../../components/ui";
import { Badge } from "../../../components/ui";
import { useAgentsContext } from "../../../context/AgentsContext";
import { AgentTemplatesGallery } from "./AgentTemplatesGallery";
import { useResumeNavigationOptional } from "../../../context/ResumeNavigationContext";
import type { Agent } from "../../../types";

export function AgentList({
  agents,
  onSelect,
  onSelectDesign,
  onToggle,
}: {
  agents: Agent[];
  onSelect: (id: string) => void;
  onSelectDesign: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { pauseAll } = useAgentsContext();
  const resumeNav = useResumeNavigationOptional();
  const activeCount = agents.filter((a) => a.status === "active").length;
  const totalMatched = agents.reduce((s, a) => s + a.matched, 0);
  const avgLatency = Math.round(agents.reduce((s, a) => s + a.latencyMs, 0) / agents.length);
  const runsToday = agents.reduce((s, a) => s + (a.runsToday ?? 0), 0);

  const handleTemplate = (templateId: string) => {
    const match = agents.find((a) => a.name.toLowerCase().includes(templateId.replace("tpl-", "").split("-")[0]));
    if (match) onSelectDesign(match.id);
    else if (agents[0]) onSelectDesign(agents[0].id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">AI Agents</h2>
          <p className="text-sm text-muted-foreground">Automate job search, resume tailoring, and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={pauseAll} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-9">
            <Pause className="w-4 h-4" />
            Pause all
          </button>
          <button type="button" onClick={() => resumeNav?.openEditor({ tab: "analysis" })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 min-h-9">
            <Zap className="w-4 h-4" />
            Resume analysis
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI label="Active Agents" value={String(activeCount)} sub={`of ${agents.length} total`} icon={Bot} accent="violet" />
        <KPI label="Runs today" value={String(runsToday)} sub="across all agents" icon={Activity} accent="blue" />
        <KPI label="Jobs Matched" value={String(totalMatched)} sub="in last 24 hours" icon={Briefcase} accent="emerald" />
        <KPI label="Avg latency" value={`${avgLatency}ms`} sub="response time" icon={Zap} accent="amber" />
      </div>

      <AgentTemplatesGallery onSelect={(tpl) => handleTemplate(tpl.id)} />

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">Your agents</h3>
        {agents.map((a) => (
          <AgentRow key={a.id} agent={a} onSelect={onSelect} onSelectDesign={onSelectDesign} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function AgentRow({
  agent: a,
  onSelect,
  onSelectDesign,
  onToggle,
}: {
  agent: Agent;
  onSelect: (id: string) => void;
  onSelectDesign: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all shadow-sm">
      <div className="flex items-center gap-5">
        <div
          className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
            a.status === "active" ? "bg-emerald-100" : a.status === "complete" ? "bg-blue-100" : "bg-secondary",
          )}
        >
          <Bot className={cn("w-7 h-7", a.status === "active" ? "text-emerald-600" : a.status === "complete" ? "text-blue-600" : "text-muted-foreground")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <p className="text-base font-bold text-foreground">{a.name}</p>
            <Badge v={a.status === "active" ? "success" : a.status === "complete" ? "blue" : "subtle"}>{a.status}</Badge>
            <span className="text-xs text-muted-foreground ml-auto" style={mono}>{a.model}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{a.task}</p>
          {a.status !== "idle" && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground font-semibold">Progress</span>
                <span className="text-xs text-foreground font-bold" style={mono}>{a.progress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", a.status === "complete" ? "bg-blue-500" : "bg-emerald-500")} style={{ width: `${a.progress}%` }} />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(a.status === "active" || a.status === "idle") && (
            <button type="button" onClick={() => onToggle(a.id)} className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
              {a.status === "active" ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          )}
          <button type="button" onClick={() => onSelectDesign(a.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-10" title="Open in Design mode">
            <Pencil className="w-4 h-4" />
            Design
          </button>
          <button type="button" onClick={() => onSelect(a.id)} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
            Monitor
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
