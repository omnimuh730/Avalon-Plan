import React from "react";
import { Activity, Bot, CheckCircle2, AlertTriangle, TrendingUp, Plus, Zap } from "lucide-react";
import { KPI } from "../../../components/ui";
import { formatAgo } from "../lib/constants";
import { mono } from "../lib/constants";
import { runStatusStyle } from "../lib/status-styles";
import type { RunSummary } from "../../../types/agent";

export function AgentRunRow({ run, onOpen }: { run: RunSummary; onOpen: (run: RunSummary) => void }) {
  const st = runStatusStyle(run.status);
  const isRunning = run.status === "running";

  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border/60 last:border-0 hover:bg-secondary/40 transition-colors group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full ${st.dot} ${run.status === "running" ? "animate-pulse" : ""}`} />
        <div className="min-w-0">
          <div className="font-semibold text-foreground text-sm truncate">{run.agentName}</div>
          <div className="text-xs text-muted-foreground">
            {run.source} · {run.profileName}
          </div>
        </div>
      </div>
      <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${st.labelClass} shrink-0`}>
        {st.label}
      </span>
      <div className="hidden md:flex items-center gap-6 shrink-0">
        <div className="text-center">
          <div className={`${mono} text-sm font-semibold text-foreground`}>{run.jobCount}</div>
          <div className="text-xs text-muted-foreground">jobs</div>
        </div>
        <div className="text-center">
          <div className={`${mono} text-sm font-semibold text-green-600`}>{run.submitted}</div>
          <div className="text-xs text-muted-foreground">submitted</div>
        </div>
        <div className="text-center">
          <div className={`${mono} text-xs text-muted-foreground`}>{formatAgo(run.startedAt)} ago</div>
          <div className="text-xs text-muted-foreground">started</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpen(run)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary"
      >
        <Activity size={12} />
        {isRunning ? "Monitor" : "Review"}
      </button>
    </div>
  );
}

export function AgentRunsView({
  runs,
  successRate,
  onDeploy,
  onOpenRun,
}: {
  runs: RunSummary[];
  successRate: number;
  onDeploy: () => void;
  onOpenRun: (run: RunSummary) => void;
}) {
  const runningCount = runs.filter((r) => r.status === "running").length;
  const errorCount = runs.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Running" value={String(runningCount)} sub="active runs" icon={Zap} accent="emerald" />
        <KPI label="Finished" value={String(runs.filter((r) => r.status === "done").length)} sub="completed" icon={CheckCircle2} accent="blue" />
        <KPI label="Errors" value={String(errorCount)} sub="need attention" icon={AlertTriangle} accent="amber" />
        <KPI label="Success Rate" value={`${successRate}%`} sub="from audit log" icon={TrendingUp} accent="violet" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Deploy Runs</h2>
        <button
          type="button"
          onClick={onDeploy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90"
        >
          <Plus size={13} />
          Deploy Agent
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Bot size={28} className="opacity-40" />
            <p className="text-sm">No deploy runs yet — click Deploy Agent to start</p>
          </div>
        ) : (
          runs.map((run) => <AgentRunRow key={run.id} run={run} onOpen={onOpenRun} />)
        )}
      </div>
    </div>
  );
}
