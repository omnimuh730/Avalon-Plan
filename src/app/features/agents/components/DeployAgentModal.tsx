import React from "react";
import { Loader2, X, Zap } from "lucide-react";
import type { DeployOptions } from "../../../types/agent";
import { useDeployForm } from "../hooks/useDeployForm";

function DeployFormFields({
  profileName,
  models,
  model,
  setModel,
  loadingMeta,
  sources,
  source,
  setSource,
  startIndex,
  setStartIndex,
  endIndex,
  setEndIndex,
  posted,
  sourceTitle,
  rangeCount,
}: {
  profileName: string;
  models: { id: string }[];
  model: string;
  setModel: (v: string) => void;
  loadingMeta: boolean;
  sources: { title: string; type: string; posted: number }[];
  source: string;
  setSource: (v: string) => void;
  startIndex: number;
  setStartIndex: (v: number) => void;
  endIndex: number;
  setEndIndex: (v: number) => void;
  posted: number;
  sourceTitle: string;
  rangeCount: number;
}) {
  return (
    <>
      <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm">
        <span className="text-xs font-semibold text-muted-foreground block mb-1">Applicant profile</span>
        <span className="font-medium text-foreground">{profileName || "No profile loaded"}</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">Model</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loadingMeta || !profileName}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        >
          <option value="">{loadingMeta ? "Loading models…" : "Select model…"}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">
          Job Source <span className="text-muted-foreground font-normal">— posted, not yet applied</span>
        </span>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={!profileName || !sources.length}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        >
          <option value="">
            {!profileName ? "Loading profile…" : sources.length ? "Select job source…" : "No posted jobs found"}
          </option>
          {sources.map((s) => (
            <option key={s.title} value={s.title}>
              {s.title} · {s.type} — {s.posted} posted
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">Start index</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, posted - 1)}
            value={startIndex}
            onChange={(e) => setStartIndex(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">
            End index <span className="text-muted-foreground font-normal">(exclusive)</span>
          </span>
          <input
            type="number"
            min={startIndex + 1}
            max={posted}
            value={endIndex}
            onChange={(e) => setEndIndex(Math.max(startIndex + 1, parseInt(e.target.value || "0", 10) || 0))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {sourceTitle && (
        <p className="text-xs text-muted-foreground -mt-1">
          {posted} posted {sourceTitle} job{posted === 1 ? "" : "s"} · agent will auto-bid{" "}
          <span className="font-semibold text-primary">{rangeCount}</span> one by one.
        </p>
      )}
    </>
  );
}

export function DeployAgentModal({
  onClose,
  onDeploy,
}: {
  onClose: () => void;
  onDeploy: (opts: DeployOptions) => Promise<void> | void;
}) {
  const form = useDeployForm(onDeploy);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card rounded-3xl border border-border w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">Deploy Agent</h2>
            <p className="text-xs text-muted-foreground">Auto-apply to posted jobs with codex-rs</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={form.handleSubmit} className="px-6 py-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">Agent Name</span>
            <input
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              placeholder="e.g. React Full Stack apply"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </label>

          <DeployFormFields
            profileName={form.profileName}
            models={form.models}
            model={form.model}
            setModel={form.setModel}
            loadingMeta={form.loadingMeta}
            sources={form.sources}
            source={form.source}
            setSource={form.setSource}
            startIndex={form.startIndex}
            setStartIndex={form.setStartIndex}
            endIndex={form.endIndex}
            setEndIndex={form.setEndIndex}
            posted={form.posted}
            sourceTitle={form.source}
            rangeCount={form.rangeCount}
          />

          <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-foreground">Auto-submit applications</div>
              <div className="text-xs text-muted-foreground">Click Submit on review screen (disable to stop at review gate)</div>
            </div>
            <input
              type="checkbox"
              checked={form.autoSubmit}
              onChange={() => form.setAutoSubmit((v) => !v)}
              className="w-4 h-4 accent-primary"
            />
          </label>

          {form.err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{form.err}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.loading || !form.valid || form.loadingMeta || !form.applierReady}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              {form.loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Launching…
                </>
              ) : (
                <>
                  <Zap size={13} />
                  Deploy Agent
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
