import { useCallback, useState } from "react";
import { Bot, Loader2, Plus } from "lucide-react";
import { useApplier } from "@/context/applier-context";
import { PageShell } from "../../components/layout/PageShell";
import type { DeployOptions } from "../../types/agent";
import { AvalonControllerView } from "./components/AvalonControllerView";
import { DeployAgentModal } from "./components/DeployAgentModal";
import { useAvalonHealth } from "./hooks/useAvalonHealth";
import type { QueuedJob } from "./hooks/useAvalonRelay";

export function AgentsPage() {
  const { applierReady } = useApplier();
  const { health, loading: healthLoading, refresh } = useAvalonHealth();
  const [showDeploy, setShowDeploy] = useState(false);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
  const [sessionKey, setSessionKey] = useState(0);

  const startSession = useCallback(async (opts: DeployOptions) => {
    const jobs: QueuedJob[] = (opts.jobs ?? []).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      url: j.url,
      source: j.source,
    }));
    setQueuedJobs(jobs);
    setSessionKey((k) => k + 1);
    setShowDeploy(false);
  }, []);

  return (
    <PageShell fullWidth className="bg-gradient-to-b from-violet-500/[0.03] via-background to-background">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-8 max-w-[1600px] mx-auto space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground tracking-tight">Avalon Controller</h1>
                <p className="text-sm text-muted-foreground">
                  Auto-apply through your Chrome extension — scan, analyze, inject
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowDeploy(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/30 transition-shadow"
            >
              <Plus className="w-4 h-4" />
              Queue jobs
            </button>
          </div>
        </header>

        {!applierReady ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            <p className="text-sm font-medium">Loading your profile…</p>
          </div>
        ) : (
          <AvalonControllerView
            key={sessionKey}
            initialJobs={queuedJobs.length ? queuedJobs : undefined}
            health={health}
            healthLoading={healthLoading}
            onRefreshHealth={() => void refresh()}
            onQueueJobs={() => setShowDeploy(true)}
          />
        )}
      </div>

      {showDeploy && <DeployAgentModal onClose={() => setShowDeploy(false)} onDeploy={startSession} />}
    </PageShell>
  );
}
