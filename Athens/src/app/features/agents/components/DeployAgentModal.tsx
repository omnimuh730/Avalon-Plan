import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, X, Zap, ArrowRight, ArrowLeft, Plus, User, Briefcase, Rocket, Check,
} from "lucide-react";
import type { DeployOptions } from "../../../types/agent";
import type { JobCandidate } from "../../../services/agentApi";
import { useDeployForm } from "../hooks/useDeployForm";


function JobRow({ job, action, onClick }: { job: JobCandidate; action: "add" | "remove"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={job.url}
      className={`w-full text-left px-3 py-2 border-b border-border/50 last:border-0 flex items-center gap-2 ${action === "add" ? "hover:bg-primary/5" : "hover:bg-rose-50"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground truncate">{job.title || "(untitled)"}</div>
        <div className="text-[10px] text-muted-foreground truncate">{job.company || job.source}</div>
      </div>
      <span className={`text-[10px] font-semibold shrink-0 ${action === "add" ? "text-primary" : "text-rose-500"}`}>
        {action === "add" ? "Add" : "Remove"}
      </span>
    </button>
  );
}

const STEPS = [
  { key: "basics", label: "Basics", icon: User },
  { key: "jobs", label: "Jobs", icon: Briefcase },
] as const;

export function DeployAgentModal({
  onClose,
  onDeploy,
}: {
  onClose: () => void;
  onDeploy: (opts: DeployOptions) => Promise<void> | void;
}) {
  const form = useDeployForm(onDeploy);
  const [step, setStep] = useState(0);

  const stepValid = [
    form.name.trim().length > 0 && form.applierReady,
    form.queue.length > 0,
  ];
  const canNext = stepValid[step];

  const modal = (
    <div translate="no" className="notranslate fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card rounded-3xl border border-border w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">Queue Jobs</h2>
              <p className="text-xs text-muted-foreground">
                {form.profileName || "No profile"} · Avalon extension auto-apply
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 px-6 py-3 border-b border-border shrink-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            const reachable = i <= step || stepValid.slice(0, i).every(Boolean);
            return (
              <React.Fragment key={s.key}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && setStep(i)}
                  className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 text-xs font-semibold transition-colors ${active ? "bg-primary text-white" : done ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"} disabled:opacity-50`}
                >
                  <span className={`relative w-5 h-5 rounded-full flex items-center justify-center ${active ? "bg-white/20" : done ? "bg-primary/20" : "bg-background"}`}>
                    <Check size={12} className={done ? "" : "hidden"} />
                    <Icon size={12} className={done ? "hidden" : ""} />
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          <div className={step === 0 ? "space-y-4" : "hidden"} aria-hidden={step !== 0}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-foreground">Session name</span>
              <input
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                placeholder="e.g. React Full Stack apply"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </label>
            <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Applicant profile</span>
              <span className="font-medium text-foreground text-sm">{form.profileName || "No profile loaded"}</span>
              <p className="text-[11px] text-muted-foreground mt-1">
                Profile data is sent to Avalon AI when you analyze a form.
              </p>
            </div>
          </div>

          <div className={step === 1 ? "space-y-3" : "hidden"} aria-hidden={step !== 1}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-foreground">
                Job source <span className="text-muted-foreground font-normal">— posted, not yet applied</span>
              </span>
              <select
                value={form.source}
                onChange={(e) => form.setSource(e.target.value)}
                disabled={!form.profileName || !form.sources.length}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">{form.sources.length ? "Select job source…" : "No posted jobs found"}</option>
                {form.sources.map((s) => (
                  <option key={s.title} value={s.title}>{s.title} · {s.type} — {s.posted} posted</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 bg-secondary/40 border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground">Candidates · {form.candidates.length}</span>
                  <button type="button" onClick={form.addAll} disabled={!form.candidates.length} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary disabled:opacity-40">
                    Add all <ArrowRight size={11} />
                  </button>
                </div>
                <div className="h-72 overflow-auto">
                  {form.loadingJobs ? (
                    <div className="p-3 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Loading…</div>
                  ) : form.candidates.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">{form.source ? "No posted jobs to add." : "Select a job source."}</div>
                  ) : (
                    form.candidates.map((j) => <JobRow key={j.id} job={j} action="add" onClick={() => form.addToQueue(j)} />)
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-primary/40 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-border">
                  <span className="text-[11px] font-semibold text-primary">Queue · {form.queue.length}</span>
                  <button type="button" onClick={form.clearQueue} disabled={!form.queue.length} className="text-[11px] font-semibold text-muted-foreground disabled:opacity-40">Clear</button>
                </div>
                <div className="h-72 overflow-auto">
                  {form.queue.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground flex flex-col items-center gap-1.5 text-center justify-center h-full">
                      <Plus size={18} className="opacity-40" />
                      Click candidates to queue them.
                    </div>
                  ) : (
                    form.queue.map((j) => <JobRow key={j.id} job={j} action="remove" onClick={() => form.removeFromQueue(j.id)} />)
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              <span className="font-semibold text-primary">{form.queue.length}</span> job{form.queue.length === 1 ? "" : "s"} will open in the Avalon controller.
            </p>
          </div>

          <p className={`text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4 ${form.err ? "" : "hidden"}`} aria-hidden={!form.err}>
            {form.err || ""}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary"
          >
            <span className={step === 0 ? "" : "hidden"} aria-hidden={step !== 0}>Cancel</span>
            <span className={`inline-flex items-center gap-1.5 ${step === 0 ? "hidden" : ""}`} aria-hidden={step === 0}>
              <ArrowLeft size={14} /> Back
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 ${step < STEPS.length - 1 ? "" : "hidden"}`}
            aria-hidden={step >= STEPS.length - 1}
          >
            Next <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => form.handleSubmit(e as unknown as React.FormEvent)}
            disabled={form.loading || !form.valid || !form.applierReady}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 ${step < STEPS.length - 1 ? "hidden" : ""}`}
            aria-hidden={step < STEPS.length - 1}
          >
            {form.loading ? (<><Loader2 size={13} className="animate-spin" /> Starting…</>) : (<><Zap size={13} /> Start session</>)}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
