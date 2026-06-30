import { useEffect, useMemo } from "react";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  Image,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  TreePine,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import type { ActionableTarget, ActionableTree } from "@avalon/shared";
import { useApplier } from "@/context/applier-context";
import { formatApplierProfile } from "../avalon/ai/profile";
import { useAvalonRelay, type QueuedJob } from "../hooks/useAvalonRelay";

function fieldId(groupIdx: number, childIdx: number): string {
  return `${groupIdx}:${childIdx}`;
}

function treeFieldLabel(tree: ActionableTree, id: string): string {
  const [groupIdx, childIdx] = id.split(":").map((part) => Number(part));
  if (!Number.isFinite(groupIdx) || !Number.isFinite(childIdx)) return id;
  return tree[groupIdx]?.children[childIdx]?.target ?? id;
}

function formatTreeOptions(options: ActionableTarget["options"], maxShown = 8): string | null {
  if (!options?.length) return null;
  const labels = options.map((o) => o.label).filter(Boolean);
  if (labels.length <= maxShown) return labels.join(" · ");
  return `${labels.slice(0, maxShown).join(" · ")} · +${labels.length - maxShown} more`;
}

export function AvalonControllerView({
  initialJobs,
  onLog,
}: {
  initialJobs?: QueuedJob[];
  onLog?: (message: string, type: "info" | "success" | "warn" | "error") => void;
}) {
  const { applier } = useApplier();
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

  const copyScript = async () => {
    if (!relay.displayedScript.trim()) return;
    try {
      await navigator.clipboard.writeText(relay.displayedScript);
      relay.pushLog(
        relay.selectedTreeFieldId ? "Copied field step" : "Copied full fill plan",
        true,
      );
      onLog?.("Copied fill plan to clipboard", "success");
    } catch {
      relay.pushLog("Could not copy to clipboard", false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection bar */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {relay.connected && relay.peers.extension ? (
            <Wifi className="w-4 h-4 text-green-600 shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {relay.connected
              ? relay.peers.extension
                ? "Extension connected"
                : "Relay connected — waiting for extension"
              : "Relay offline"}
          </span>
          {relay.registered && (
            <span className="text-xs text-muted-foreground truncate">
              session {relay.registered.sessionId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-wrap gap-2 min-w-[200px]">
          <input
            value={relay.serverUrl}
            onChange={(e) => relay.setServerUrl(e.target.value)}
            placeholder="Relay server URL"
            className="flex-1 min-w-[140px] rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
          />
          <input
            value={relay.sessionId}
            onChange={(e) => relay.setSessionId(e.target.value)}
            placeholder="Session ID (optional)"
            className="w-36 rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={relay.connect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {relay.connected ? "Reconnect" : "Connect"}
          </button>
          <button
            type="button"
            onClick={relay.requestTabs}
            disabled={!relay.connected || !relay.peers.extension}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-secondary disabled:opacity-50"
          >
            Tabs
          </button>
          <button
            type="button"
            onClick={relay.requestScreenshot}
            disabled={!relay.canExecute}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-secondary disabled:opacity-50"
          >
            <Image className="w-3.5 h-3.5" />
            Screenshot
          </button>
          <button
            type="button"
            onClick={relay.fetchActionableTree}
            disabled={!relay.canExecute}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-secondary disabled:opacity-50"
          >
            <TreePine className="w-3.5 h-3.5" />
            Fetch tree
          </button>
        </div>
      </div>

      {relay.executeDisabledReason && !relay.canExecute && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {relay.executeDisabledReason}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Job queue */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-[280px]">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-bold text-foreground">Job queue</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Open a job in Chrome, then fetch tree → analyze → apply
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            {relay.jobQueue.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Queue jobs via Deploy Agent, or navigate manually in your browser.
              </div>
            ) : (
              relay.jobQueue.map((job, i) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    relay.setActiveJobIndex(i);
                    relay.navigateToJob(job);
                  }}
                  className={`w-full text-left px-4 py-2.5 border-b border-border/50 flex items-center gap-2 hover:bg-primary/5 ${
                    i === relay.activeJobIndex ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-[10px] font-bold text-muted-foreground w-5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground truncate">{job.title || "(untitled)"}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{job.company || job.source}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
          {activeJob && (
            <div className="px-4 py-2 border-t border-border bg-secondary/20 text-[10px] text-muted-foreground truncate">
              Active: {activeJob.url}
            </div>
          )}
        </div>

        {/* Screenshot + tabs */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-[280px]">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">Browser</h3>
            {relay.tabs.length > 0 && (
              <select
                value={relay.selectedTabId}
                onChange={(e) => relay.setSelectedTabId(e.target.value ? Number(e.target.value) : "")}
                className="text-xs rounded-lg border border-border bg-background px-2 py-1 max-w-[180px]"
              >
                {relay.tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    [{tab.id}] {tab.title.slice(0, 40)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center p-2 bg-secondary/10 min-h-[200px]">
            {relay.screenshot ? (
              <img src={relay.screenshot} alt="Tab screenshot" className="max-w-full max-h-[240px] rounded-lg border border-border object-contain" />
            ) : (
              <p className="text-xs text-muted-foreground text-center px-4">
                Screenshot appears here when you request one from the extension
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 px-4 py-2 border-t border-border text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={relay.probeComboboxes}
              onChange={(e) => relay.setProbeComboboxes(e.target.checked)}
              className="accent-primary"
            />
            Probe comboboxes (slower, reads dropdown options)
          </label>
        </div>

        {/* Event log */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-[280px]">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-bold text-foreground">Event log</h3>
          </div>
          <div className="flex-1 overflow-auto p-2 font-mono text-[11px]">
            {relay.logs.length === 0 && (
              <p className="text-muted-foreground p-2">No events yet.</p>
            )}
            {relay.logs.map((entry) => (
              <div
                key={entry.id}
                className={`px-2 py-1 rounded ${
                  entry.success === true
                    ? "text-green-700 bg-green-50"
                    : entry.success === false
                      ? "text-red-700 bg-red-50"
                      : "text-foreground"
                }`}
              >
                [{entry.at}] {entry.message}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actionable tree + analyze/apply */}
      {relay.actionableTree && relay.actionableTree.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <TreePine className="w-4 h-4 text-violet-600" />
                Actionable tree
              </h3>
              {relay.treePage && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xl">
                  Tab {relay.treePage.tabId}
                  {relay.treePage.url ? ` · ${relay.treePage.url}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void relay.analyzeTree()}
                disabled={relay.analyzing || relay.applying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
              >
                {relay.analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {relay.analyzing ? "Analyzing…" : "Analyze"}
              </button>
              <button
                type="button"
                onClick={() => relay.generatePlan()}
                disabled={!relay.formAnalysis?.fields.length || relay.applying || relay.analyzing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-secondary disabled:opacity-50"
              >
                Build plan
              </button>
              <button
                type="button"
                onClick={() => void relay.applyActionPlan()}
                disabled={
                  !relay.formAnalysis?.fields.length ||
                  relay.applying ||
                  relay.analyzing ||
                  !relay.canExecute ||
                  !relay.treePage?.tabId
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {relay.applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {relay.applying ? "Applying…" : "Apply (inject)"}
              </button>
            </div>
          </div>

          {relay.formAnalysis?.usage && (
            <p className="text-[11px] text-muted-foreground px-4 py-2 border-b border-border">
              {relay.formAnalysis.fields.length} actions · {relay.formAnalysis.usage.totalTokens} tokens
              {relay.formAnalysis.usage.cost
                ? ` · $${relay.formAnalysis.usage.cost.totalUsd.toFixed(6)}`
                : ""}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-border">
            <div className="p-4 max-h-[360px] overflow-auto space-y-3">
              {relay.actionableTree.map((group, groupIdx) => (
                <div key={groupIdx}>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {group.content || "(no label)"}
                  </h4>
                  <ul className="space-y-1">
                    {group.children.map((entry, childIdx) => {
                      const id = fieldId(groupIdx, childIdx);
                      const plan = relay.actionPlanByFieldId.get(id);
                      const required = entry.target.includes("*");
                      const selected = relay.selectedTreeFieldId === id;
                      return (
                        <li key={childIdx}>
                          <button
                            type="button"
                            onClick={() => relay.selectTreeTarget(entry, id)}
                            disabled={!relay.canExecute}
                            className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors ${
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border hover:bg-secondary/50"
                            } disabled:opacity-50`}
                          >
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {entry.target}
                              {required && (
                                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1 rounded">required</span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {entry.controlType} · &lt;{entry.control.tag}&gt;
                              {entry.options?.length
                                ? ` · ${entry.options.length} options`
                                : ""}
                            </div>
                            {plan && (
                              <div className={`mt-1.5 text-[10px] ${plan.shouldSkip === "Yes" ? "text-muted-foreground" : "text-violet-700"}`}>
                                {plan.action} · skip={plan.shouldSkip} · {plan.value}
                              </div>
                            )}
                            {formatTreeOptions(entry.options) && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {formatTreeOptions(entry.options)}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="p-4 flex flex-col min-h-[200px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-xs font-bold text-foreground">
                  {selectedFieldLabel ? `Field step · ${selectedFieldLabel}` : "Form fill plan"}
                </h4>
                <div className="flex gap-1">
                  {relay.selectedTreeFieldId && (
                    <button
                      type="button"
                      onClick={() => relay.setSelectedTreeFieldId(null)}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Full plan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyScript()}
                    disabled={!relay.displayedScript.trim()}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
              </div>
              {relay.injectionPlan && (
                <p className="text-[10px] text-muted-foreground mb-2">
                  {relay.injectionPlan.steps.length} step(s) · deterministic
                </p>
              )}
              <textarea
                value={relay.displayedScript}
                readOnly
                spellCheck={false}
                placeholder="Run Analyze to build the deterministic fill plan."
                className="flex-1 min-h-[160px] w-full rounded-xl border border-border bg-secondary/20 px-3 py-2 text-[11px] font-mono resize-none focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {!relay.actionableTree?.length && relay.canExecute && (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/10 p-8 text-center">
          <Play className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold text-foreground">Ready to apply</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Navigate to a job application page in Chrome (with the Avalon extension), then click{" "}
            <strong>Fetch tree</strong> to scan the form.
          </p>
          <button
            type="button"
            onClick={relay.fetchActionableTree}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            Fetch actionable tree
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
