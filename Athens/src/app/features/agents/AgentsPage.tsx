import React, { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, RefreshCw, Zap } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import type { DeployOptions } from "../../types/agent";
import { useAgentRunContext } from "../../context/AgentRunContext";
import { AgentDashboardView } from "./components/AgentDashboardView";
import { AgentRunsView } from "./components/AgentRunsView";
import { AvalonControllerView } from "./components/AvalonControllerView";
import { DeployAgentModal } from "./components/DeployAgentModal";
import { useAgentDashboard } from "./hooks/useAgentDashboard";
import type { QueuedJob } from "./hooks/useAvalonRelay";
import { nowTime } from "./lib/constants";

type Tab = "controller" | "dashboard" | "runs";

export function AgentsPage() {
  const {
    dashboard,
    runs,
    activity,
    dashboardJobs,
    avalonHealth,
    loading,
    error,
    refresh,
    prependActivity,
    successRate,
    applierReady,
  } = useAgentDashboard();
  const { pendingTab, setPendingTab } = useAgentRunContext();
  const [tab, setTab] = useState<Tab>("controller");
  const [showDeploy, setShowDeploy] = useState(false);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);

  useEffect(() => {
    if (pendingTab === "dashboard" || pendingTab === "runs") {
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

  const startSession = useCallback(
    async (opts: DeployOptions) => {
      const jobs: QueuedJob[] = (opts.jobs ?? []).map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        url: j.url,
        source: j.source,
      }));
      setQueuedJobs(jobs);
      addLog(
        opts.name,
        `Queued ${jobs.length} job(s) for Avalon auto-apply`,
        "success",
      );
      setShowDeploy(false);
      setTab("controller");
    },
    [addLog],
  );

  const relayOk = avalonHealth?.ok && avalonHealth.extension;

  return (
    <PageShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-600" />
              {"AI\u200b Agents"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Apply to jobs via the Avalon Chrome extension and relay controller
            </p>
          </div>
          <div className="flex items-center gap-2">
            {avalonHealth && (
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  relayOk
                    ? "text-green-700 bg-green-50 border-green-200"
                    : avalonHealth.ok
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-red-700 bg-red-50 border-red-200"
                }`}
              >
                {relayOk
                  ? "Extension connected"
                  : avalonHealth.ok
                    ? "Relay online"
                    : "Relay offline"}
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
              Queue Jobs
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["controller", "dashboard", "runs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "controller" ? "Controller" : t === "dashboard" ? "Dashboard" : "Runs"}
            </button>
          ))}
        </div>

        {!applierReady ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading profile…
          </div>
        ) : error && tab !== "controller" ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        ) : tab === "controller" ? (
          <AvalonControllerView
            key={queuedJobs.map((j) => j.id).join(",")}
            initialJobs={queuedJobs.length ? queuedJobs : undefined}
            onLog={(event, type) => addLog("Avalon", event, type)}
          />
        ) : tab === "dashboard" ? (
          <AgentDashboardView runs={runs} dashboard={dashboard} jobs={dashboardJobs} activity={activity} />
        ) : (
          <AgentRunsView runs={runs} successRate={successRate} onDeploy={() => setShowDeploy(true)} onOpenRun={() => {}} />
        )}
      </div>

      {showDeploy && <DeployAgentModal onClose={() => setShowDeploy(false)} onDeploy={startSession} />}
    </PageShell>
  );
}
