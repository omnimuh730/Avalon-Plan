import React, { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, RefreshCw, Zap } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { deployAgent } from "../../services/agentApi";
import type { ActiveRun, DeployOptions, RunSummary } from "../../types/agent";
import { useAgentRunContext } from "../../context/AgentRunContext";
import { AgentDashboardView } from "./components/AgentDashboardView";
import { AgentRunsView } from "./components/AgentRunsView";
import { DeployAgentModal } from "./components/DeployAgentModal";
import { LiveRunPanel } from "./components/live-run/LiveRunPanel";
import { useAgentDashboard } from "./hooks/useAgentDashboard";
import { nowTime } from "./lib/constants";

type Tab = "dashboard" | "runs";

export function AgentsPage() {
  const {
    dashboard,
    runs,
    activity,
    dashboardJobs,
    health,
    loading,
    error,
    refresh,
    prependActivity,
    successRate,
    applierReady,
  } = useAgentDashboard();
  const { activeRun, setActiveRun, pendingTab, setPendingTab } = useAgentRunContext();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [showDeploy, setShowDeploy] = useState(false);

  useEffect(() => {
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }, [pendingTab, setPendingTab]);

  const addLog = useCallback(
    (agentName: string, event: string, type: "info" | "success" | "warn" | "error") => {
      prependActivity({ agentName, event, type, time: nowTime() });
    },
    [prependActivity],
  );

  const startRun = useCallback(
    async (opts: DeployOptions) => {
      const data = await deployAgent(opts);
      addLog(
        opts.name,
        `Deployed for ${data.profileName || "profile"} — auto-bid ${data.jobCount || 0} ${opts.source} jobs`,
        "success",
      );
      setShowDeploy(false);
      setActiveRun({
        runId: data.runId,
        agentName: opts.name,
        url: data.jobs?.[0]?.url || "",
        profileName: data.profileName,
        model: data.model || opts.model,
        source: data.source || opts.source,
        jobCount: data.jobCount || data.jobs?.length || 1,
        mode: "live",
      });
      await refresh();
    },
    [addLog, refresh, setActiveRun],
  );

  const openRun = useCallback(
    (run: RunSummary) => {
      setActiveRun({
        runId: run.id,
        agentName: run.agentName,
        url: run.url,
        profileName: run.profileName,
        model: run.model,
        source: run.source,
        jobCount: run.jobCount,
        mode: run.status === "running" ? "live" : "review",
      });
    },
    [setActiveRun],
  );

  return (
    <PageShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-600" />
              AI Agents
            </h2>
            <p className="text-sm text-muted-foreground">Deploy codex agents to auto-apply to posted jobs</p>
          </div>
          <div className="flex items-center gap-2">
            {health && (
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  health.ok ? "text-green-700 bg-green-50 border-green-200" : "text-amber-700 bg-amber-50 border-amber-200"
                }`}
              >
                {health.ok ? "BFF connected" : "BFF offline"}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-9"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowDeploy(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 min-h-9"
            >
              <Zap className="w-4 h-4" />
              Deploy Agent
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["dashboard", "runs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "dashboard" ? "Dashboard" : "Runs"}
            </button>
          ))}
        </div>

        {!applierReady ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading profile…
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        ) : tab === "dashboard" ? (
          <AgentDashboardView runs={runs} dashboard={dashboard} jobs={dashboardJobs} activity={activity} />
        ) : (
          <AgentRunsView runs={runs} successRate={successRate} onDeploy={() => setShowDeploy(true)} onOpenRun={openRun} />
        )}
      </div>

      {showDeploy && <DeployAgentModal onClose={() => setShowDeploy(false)} onDeploy={startRun} />}
      {activeRun && (
        <LiveRunPanel run={activeRun} onClose={() => setActiveRun(null)} onLog={addLog} />
      )}
    </PageShell>
  );
}
