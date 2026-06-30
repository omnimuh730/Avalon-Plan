import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  ExternalLink,
  Image,
  Layers,
  ListOrdered,
  Loader2,
  Monitor,
  RefreshCw,
  Scan,
  Settings2,
  Sparkles,
  Terminal,
  TreePine,
  Zap,
} from "lucide-react";
import type { ActionableTree } from "@avalon/shared";
import { useApplier } from "@/context/applier-context";
import { cn } from "../../../lib/utils";
import { formatApplierProfile } from "../avalon/ai/profile";
import { useAvalonRelay, type QueuedJob } from "../hooks/useAvalonRelay";

function applyDisabledReason(relay: ReturnType<typeof useAvalonRelay>, hasPlan: boolean): string | null {
  if (!hasPlan) return "Run Analyze first to build a fill plan.";
  if (relay.analyzing) return "Analysis still running…";
  if (relay.applying) return "Apply already in progress…";
  if (!relay.treePage?.tabId) return "Tab context lost — click Scan form again, then Apply.";
  if (!relay.canExecute) {
    return relay.executeDisabledReason ?? "Extension disconnected — click Reconnect in settings.";
  }
  return null;
}

function fieldId(groupIdx: number, childIdx: number): string {
  return `${groupIdx}:${childIdx}`;
}

function treeFieldLabel(tree: ActionableTree, id: string): string {
  const [groupIdx, childIdx] = id.split(":").map((part) => Number(part));
  if (!Number.isFinite(groupIdx) || !Number.isFinite(childIdx)) return id;
  return tree[groupIdx]?.children[childIdx]?.target ?? id;
}

type WorkflowStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

function WorkflowRail({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center shrink-0">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors",
              step.done && "bg-emerald-500/10 text-emerald-700",
              step.active && !step.done && "bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/30",
              !step.done && !step.active && "text-muted-foreground",
            )}
          >
            {step.done ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : step.active ? (
              <Circle className="w-3 h-3 fill-violet-500 text-violet-500" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            {step.label}
          </div>
          {i < steps.length - 1 && <ArrowRight className="w-3 h-3 mx-0.5 text-border shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        ok && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
        warn && !ok && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
        !ok && !warn && "bg-red-500/80",
      )}
    />
  );
}

export function AvalonControllerView({
  initialJobs,
  onQueueJobs,
}: {
  initialJobs?: QueuedJob[];
  onQueueJobs?: () => void;
}) {
  const { applier } = useApplier();
  const [showSettings, setShowSettings] = useState(false);

  const applicantContext = useMemo(
    () => formatApplierProfile(applier?.autoBidProfile as Record<string, unknown> | undefined),
    [applier?.autoBidProfile],
  );

  const relay = useAvalonRelay(applicantContext);

  useEffect(() => {
    if (initialJobs?.length) relay.enqueueJobs(initialJobs);
  }, [initialJobs, relay.enqueueJobs]);

  const selectedFieldLabel =
    relay.selectedTreeFieldId && relay.actionableTree
      ? treeFieldLabel(relay.actionableTree, relay.selectedTreeFieldId)
      : null;

  const activeJob = relay.jobQueue[relay.activeJobIndex];
  const hasTree = Boolean(relay.actionableTree?.length);
  const hasPlan = Boolean(relay.formAnalysis?.fields.length);
  const liveOk = relay.connected && relay.peers.extension;
  const applyBlocked = applyDisabledReason(relay, hasPlan);
  const canApply = hasPlan && !applyBlocked;

  const workflowSteps: WorkflowStep[] = [
    { id: "connect", label: "Connected", done: relay.canExecute, active: !relay.canExecute },
    { id: "scan", label: "Scanned", done: hasTree, active: relay.canExecute && !hasTree },
    { id: "analyze", label: "Analyzed", done: hasPlan, active: hasTree && !hasPlan },
    {
      id: "apply",
      label: "Applied",
      done: false,
      active: hasPlan && !relay.applying,
    },
  ];

  const fieldCount = relay.actionableTree?.reduce((n, g) => n + g.children.length, 0) ?? 0;

  const copyScript = async () => {
    if (!relay.displayedScript.trim()) return;
    try {
      await navigator.clipboard.writeText(relay.displayedScript);
      relay.pushLog(relay.selectedTreeFieldId ? "Copied field step" : "Copied full fill plan", true);
    } catch {
      relay.pushLog("Could not copy to clipboard", false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status + workflow rail */}
      <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-border/60">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/50">
              <StatusDot ok={liveOk} warn={relay.connected && !relay.peers.extension} />
              <span className="text-xs font-semibold text-foreground">
                {liveOk
                  ? "Extension live"
                  : relay.connected
                    ? "Relay only — waiting for extension"
                    : "Disconnected"}
              </span>
            </div>
            {relay.registered && (
              <span className="text-[11px] text-muted-foreground font-mono">
                session {relay.registered.sessionId.slice(0, 8)}
              </span>
            )}
            {applier?.name && (
              <span className="text-[11px] text-muted-foreground">
                profile <span className="font-semibold text-foreground">{applier.name}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={cn(
                "p-2 rounded-lg border border-border hover:bg-secondary transition-colors",
                showSettings && "bg-secondary",
              )}
              title="Connection settings"
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => relay.connect()}
              className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
              title="Reconnect relay"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="px-4 py-3 bg-secondary/30 border-b border-border/60 flex flex-wrap gap-2">
            <input
              value={relay.serverUrl}
              onChange={(e) => relay.setServerUrl(e.target.value)}
              placeholder="Relay URL"
              className="flex-1 min-w-[160px] rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
            <input
              value={relay.sessionId}
              onChange={(e) => relay.setSessionId(e.target.value)}
              placeholder="Session ID (optional)"
              className="w-40 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={relay.connect}
              className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-bold hover:opacity-90"
            >
              {relay.connected ? "Reconnect" : "Connect"}
            </button>
          </div>
        )}

        <div className="px-4 py-2.5">
          <WorkflowRail steps={workflowSteps} />
        </div>
      </div>

      {applyBlocked && hasPlan && (
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>{applyBlocked}</span>
          {!relay.canExecute && (
            <button
              type="button"
              onClick={() => relay.connect()}
              className="shrink-0 px-3 py-1 rounded-lg bg-amber-900/10 text-amber-900 font-semibold hover:bg-amber-900/15"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {relay.executeDisabledReason && !relay.canExecute && !hasPlan && (
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-xs text-amber-900">
          {relay.executeDisabledReason}
        </div>
      )}

      {/* Main workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[520px]">
        {/* Left — job queue */}
        <aside className="xl:col-span-3 flex flex-col rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-gradient-to-r from-violet-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-violet-600" />
                Queue
              </h2>
              <span className="text-[10px] font-bold text-violet-600 bg-violet-500/10 px-2 py-0.5 rounded-full">
                {relay.jobQueue.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[200px] max-h-[420px] xl:max-h-none">
            {relay.jobQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                  <Layers className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground">No jobs queued</p>
                <p className="text-[11px] text-muted-foreground mt-1 mb-4">
                  Pick posted jobs from Job Search, or queue a batch here.
                </p>
                <button
                  type="button"
                  onClick={onQueueJobs}
                  className="text-xs font-bold text-violet-600 hover:text-violet-700"
                >
                  + Queue jobs
                </button>
              </div>
            ) : (
              relay.jobQueue.map((job, i) => {
                const active = i === relay.activeJobIndex;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      relay.setActiveJobIndex(i);
                      relay.navigateToJob(job);
                    }}
                    className={cn(
                      "w-full text-left rounded-xl p-3 border transition-all",
                      active
                        ? "border-violet-500/50 bg-violet-500/8 shadow-sm shadow-violet-500/10 ring-1 ring-violet-500/20"
                        : "border-border/60 hover:border-border hover:bg-secondary/40",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                          active ? "bg-violet-600 text-white" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate leading-snug">
                          {job.title || "(untitled)"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {job.company || job.source}
                        </p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {activeJob && (
            <div className="px-3 py-2 border-t border-border/60 bg-secondary/20">
              <p className="text-[10px] text-muted-foreground truncate" title={activeJob.url}>
                {activeJob.url}
              </p>
            </div>
          )}
        </aside>

        {/* Center — browser viewport */}
        <section className="xl:col-span-6 flex flex-col rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between gap-2 bg-secondary/20">
            <div className="flex items-center gap-2 min-w-0">
              <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">Live browser</span>
            </div>
            {relay.tabs.length > 0 && (
              <select
                value={relay.selectedTabId}
                onChange={(e) => relay.setSelectedTabId(e.target.value ? Number(e.target.value) : "")}
                className="text-[11px] rounded-lg border border-border bg-background px-2 py-1 max-w-[200px] truncate"
              >
                {relay.tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    [{tab.id}] {tab.title.slice(0, 36)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="relative flex-1 min-h-[280px] bg-[#0f1117] flex items-center justify-center p-3">
            {/* Browser chrome mock */}
            <div className="absolute top-3 left-3 right-3 flex items-center gap-1.5 z-10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <div className="flex-1 mx-2 h-6 rounded-md bg-white/5 border border-white/10 flex items-center px-2">
                <span className="text-[10px] text-white/40 truncate font-mono">
                  {relay.treePage?.url || activeJob?.url || "chrome://avalon"}
                </span>
              </div>
            </div>

            {relay.screenshot ? (
              <img
                src={relay.screenshot}
                alt="Tab screenshot"
                className="max-w-full max-h-[340px] rounded-lg border border-white/10 shadow-2xl object-contain mt-6"
              />
            ) : (
              <div className="text-center px-6 mt-4">
                <Scan className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-white/60">No screenshot yet</p>
                <p className="text-xs text-white/35 mt-1 max-w-xs">
                  Request a capture or fetch the form tree once you&apos;re on an application page.
                </p>
              </div>
            )}

            {/* Floating toolbar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl">
              <button
                type="button"
                onClick={relay.requestScreenshot}
                disabled={!relay.canExecute}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40"
              >
                <Image className="w-3.5 h-3.5" />
                Capture
              </button>
              <div className="w-px h-5 bg-white/10" />
              <button
                type="button"
                onClick={relay.fetchActionableTree}
                disabled={!relay.canExecute}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40"
              >
                <TreePine className="w-3.5 h-3.5" />
                Scan form
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 px-4 py-2 border-t border-border/60 text-[11px] text-muted-foreground cursor-pointer hover:bg-secondary/30">
            <input
              type="checkbox"
              checked={relay.probeComboboxes}
              onChange={(e) => relay.setProbeComboboxes(e.target.checked)}
              className="accent-violet-600 rounded"
            />
            Probe comboboxes (slower — reads dropdown options live)
          </label>
        </section>

        {/* Right — activity + actions */}
        <aside className="xl:col-span-3 flex flex-col gap-4">
          {/* Primary actions */}
          <div className="rounded-2xl border border-border/80 bg-card shadow-sm p-4 space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pipeline</h2>
            <button
              type="button"
              onClick={() => void relay.analyzeTree()}
              disabled={!hasTree || relay.analyzing || relay.applying}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold shadow-md shadow-violet-500/20 hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition-shadow"
            >
              {relay.analyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {relay.analyzing ? "Analyzing…" : "Analyze form"}
            </button>
            <button
              type="button"
              onClick={() => void relay.applyActionPlan()}
              disabled={!canApply || relay.applying || relay.analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {relay.applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {relay.applying ? "Injecting…" : "Apply fill plan"}
            </button>
            {hasPlan && relay.injectionPlan && (
              <p className="text-[10px] text-center text-muted-foreground">
                {relay.injectionPlan.steps.length} deterministic steps ready
              </p>
            )}
            {relay.formAnalysis?.usage && (
              <p className="text-[10px] text-center text-violet-600 font-medium">
                {relay.formAnalysis.usage.totalTokens} tokens
                {relay.formAnalysis.usage.cost
                  ? ` · $${relay.formAnalysis.usage.cost.totalUsd.toFixed(4)}`
                  : ""}
              </p>
            )}
          </div>

          {/* Event log */}
          <div className="flex-1 rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden flex flex-col min-h-[240px]">
            <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-xs font-bold text-foreground">Activity</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {relay.logs.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-8">Waiting for events…</p>
              )}
              {relay.logs.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "text-[10px] font-mono leading-relaxed px-2 py-1.5 rounded-lg border border-transparent",
                    entry.success === true && "bg-emerald-500/8 text-emerald-800 border-emerald-500/15",
                    entry.success === false && "bg-red-500/8 text-red-800 border-red-500/15",
                    entry.success === undefined && "text-foreground/80",
                  )}
                >
                  <span className="text-muted-foreground">{entry.at}</span> {entry.message}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Form workspace */}
      {hasTree && (
        <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-violet-500/5 via-transparent to-indigo-500/5">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <TreePine className="w-4 h-4 text-violet-600" />
                Form fields
                <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  {fieldCount} targets
                </span>
              </h2>
              {relay.treePage?.url && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-xl">{relay.treePage.url}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => relay.generatePlan()}
              disabled={!hasPlan || relay.applying || relay.analyzing}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50"
            >
              Rebuild plan
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 lg:divide-x divide-border/60">
            <div className="lg:col-span-3 p-4 max-h-[400px] overflow-y-auto space-y-4">
              {relay.actionableTree!.map((group, groupIdx) => (
                <div key={groupIdx}>
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 sticky top-0 bg-card py-1">
                    {group.content || "Section"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.children.map((entry, childIdx) => {
                      const id = fieldId(groupIdx, childIdx);
                      const plan = relay.actionPlanByFieldId.get(id);
                      const required = entry.target.includes("*");
                      const selected = relay.selectedTreeFieldId === id;
                      const skipped = plan?.shouldSkip === "Yes";
                      return (
                        <button
                          key={childIdx}
                          type="button"
                          onClick={() => relay.selectTreeTarget(entry, id)}
                          disabled={!relay.canExecute}
                          className={cn(
                            "text-left rounded-xl border px-3 py-2.5 transition-all",
                            selected
                              ? "border-violet-500 bg-violet-500/8 ring-1 ring-violet-500/25"
                              : "border-border/60 hover:border-border hover:bg-secondary/30",
                            skipped && "opacity-60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2">
                              {entry.target.replace(/\*+$/, "").trim()}
                            </span>
                            {required && (
                              <span className="text-[8px] font-bold text-rose-600 bg-rose-50 px-1 rounded shrink-0">
                                req
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-muted-foreground mt-1">
                            {entry.controlType} · {entry.control.tag}
                          </p>
                          {plan && (
                            <div
                              className={cn(
                                "mt-1.5 text-[9px] font-medium truncate",
                                skipped ? "text-muted-foreground" : "text-violet-700",
                              )}
                            >
                              {plan.action} → {plan.value}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-2 p-4 flex flex-col bg-secondary/10 min-h-[280px]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-bold text-foreground truncate">
                  {selectedFieldLabel ? selectedFieldLabel : "Fill plan"}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  {relay.selectedTreeFieldId && (
                    <button
                      type="button"
                      onClick={() => relay.setSelectedTreeFieldId(null)}
                      className="text-[10px] font-semibold text-violet-600"
                    >
                      All steps
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyScript()}
                    disabled={!relay.displayedScript.trim()}
                    className="p-1.5 rounded-lg border border-border hover:bg-card disabled:opacity-40"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                value={relay.displayedScript}
                readOnly
                spellCheck={false}
                placeholder="Run Analyze to generate the deterministic fill plan…"
                className="flex-1 min-h-[200px] w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[11px] font-mono leading-relaxed resize-none focus:outline-none shadow-inner"
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state CTA */}
      {!hasTree && relay.canExecute && (
        <div className="rounded-2xl border border-dashed border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <Scan className="w-7 h-7 text-violet-600" />
          </div>
          <h3 className="text-base font-bold text-foreground">Ready to scan</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Open a job application in Chrome, then scan the page to detect every fillable field.
          </p>
          <button
            type="button"
            onClick={relay.fetchActionableTree}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 shadow-lg shadow-violet-500/20"
          >
            Scan form now
            <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
          </button>
        </div>
      )}
    </div>
  );
}
