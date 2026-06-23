import React, { useState } from "react";
import {
  Loader2, X, Zap, ArrowRight, ArrowLeft, Plus, User, Briefcase, Rocket, Check, MonitorSmartphone,
} from "lucide-react";
import type { DeployOptions } from "../../../types/agent";
import type { JobCandidate } from "../../../services/agentApi";
import { chromeProfileAvatarUrl } from "../../../services/agentApi";
import { useDeployForm } from "../hooks/useDeployForm";

const AVATAR_COLORS = ["bg-violet-500", "bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500"];

function ProfileAvatar({ dir, name, size = 36 }: { dir?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (dir && !broken) {
    return (
      <img
        src={chromeProfileAvatarUrl(dir)}
        onError={() => setBroken(true)}
        width={size}
        height={size}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = AVATAR_COLORS[(name || "").length % AVATAR_COLORS.length];
  return (
    <div
      className={`rounded-full ${color} text-white flex items-center justify-center font-semibold shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

function SelectCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-secondary"}`}
    >
      <div className="flex items-center gap-1.5">
        {active && <Check size={13} className="text-primary shrink-0" />}
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</div>
    </button>
  );
}

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: () => void; title: string; desc: string }) {
  return (
    <label className="flex items-start justify-between gap-2 rounded-xl border border-border px-3 py-2.5 cursor-pointer">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground leading-tight">{desc}</div>
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-primary mt-0.5 shrink-0" />
    </label>
  );
}

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
  { key: "engine", label: "Engine", icon: Rocket },
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
    form.name.trim().length > 0 && !!form.model && form.applierReady,
    form.queue.length > 0,
    form.valid,
  ];
  const canNext = stepValid[step];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card rounded-3xl border border-border w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header + step indicator */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">Deploy Agent</h2>
              <p className="text-xs text-muted-foreground">{form.profileName || "No profile"} · auto-apply to posted jobs</p>
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
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${active ? "bg-white/20" : done ? "bg-primary/20" : "bg-background"}`}>
                    {done ? <Check size={12} /> : <Icon size={12} />}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* STEP 1 — Basics */}
          {step === 0 && (
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">Agent name</span>
                <input
                  value={form.name}
                  onChange={(e) => form.setName(e.target.value)}
                  placeholder="e.g. React Full Stack apply"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Applicant profile</span>
                  <span className="font-medium text-foreground text-sm">{form.profileName || "No profile loaded"}</span>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Model</span>
                  <select
                    value={form.model}
                    onChange={(e) => form.setModel(e.target.value)}
                    disabled={form.loadingMeta || !form.profileName}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">{form.loadingMeta ? "Loading models…" : "Select model…"}</option>
                    {form.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2 — Jobs */}
          {step === 1 && (
            <div className="space-y-3">
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
                    <span className="text-[11px] font-semibold text-muted-foreground">Candidates · {form.candidates.length} <span className="font-normal">· best match</span></span>
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
                    <span className="text-[11px] font-semibold text-primary">Worker queue · {form.queue.length}</span>
                    <button type="button" onClick={form.clearQueue} disabled={!form.queue.length} className="text-[11px] font-semibold text-muted-foreground disabled:opacity-40">Clear</button>
                  </div>
                  <div className="h-72 overflow-auto">
                    {form.queue.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground flex flex-col items-center gap-1.5 text-center justify-center h-full">
                        <Plus size={18} className="opacity-40" />
                        Click candidates to queue them. Only queued jobs are applied.
                      </div>
                    ) : (
                      form.queue.map((j) => <JobRow key={j.id} job={j} action="remove" onClick={() => form.removeFromQueue(j.id)} />)
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Agent will auto-bid <span className="font-semibold text-primary">{form.queue.length}</span> job{form.queue.length === 1 ? "" : "s"}, one by one.
              </p>
            </div>
          )}

          {/* STEP 3 — Engine */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-foreground mb-1.5">Provider</div>
                <div className="grid grid-cols-2 gap-2">
                  <SelectCard active={form.provider === "codex"} onClick={() => form.setProvider("codex")} title="Codex" desc="codex-rs drives the browser via playwright-cli" />
                  <SelectCard active={form.provider === "claude-code"} onClick={() => form.setProvider("claude-code")} title="Claude Code" desc="claude drives via Playwright MCP / CLI / Plan" />
                </div>
              </div>

              {form.provider === "claude-code" ? (
                <>
                  <div>
                    <div className="text-xs font-semibold text-foreground mb-1.5">Browser driver</div>
                    <div className="grid grid-cols-3 gap-2">
                      <SelectCard active={form.claudeEngine === "cli"} onClick={() => form.setClaudeEngine("cli")} title="Playwright CLI" desc="Snapshots to files — cheaper" />
                      <SelectCard active={form.claudeEngine === "mcp"} onClick={() => form.setClaudeEngine("mcp")} title="Playwright MCP" desc="Snapshots in context — pricier" />
                      <SelectCard active={form.claudeEngine === "plan"} onClick={() => form.setClaudeEngine("plan")} title="Plan & Execute" desc="1 call/page, verify→replan — cheapest" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5">
                      <MonitorSmartphone size={13} /> Chrome profile <span className="text-muted-foreground font-normal">— optional, MCP driver · launches a real Chrome window</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-44 overflow-auto p-0.5">
                      <button
                        type="button"
                        onClick={() => form.setChromeProfile("")}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${!form.chromeProfile ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-secondary"}`}
                      >
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><Plus size={16} className="text-muted-foreground" /></div>
                        <span className="text-xs font-medium text-foreground text-left leading-tight">Fresh<br />browser</span>
                      </button>
                      {form.chromeProfiles.map((p) => (
                        <button
                          key={p.dir}
                          type="button"
                          onClick={() => form.setChromeProfile(p.dir)}
                          title={p.email}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 min-w-0 ${form.chromeProfile === p.dir ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-secondary"}`}
                        >
                          <ProfileAvatar dir={p.dir} name={p.name} />
                          <div className="min-w-0 text-left">
                            <div className="text-xs font-medium text-foreground truncate">{p.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {form.chromeProfile && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => void form.importSession()}
                          disabled={form.importStatus === "importing"}
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                        >
                          {form.importStatus === "importing" ? "Importing…" : form.importStatus === "done" ? "Re-import session" : "Import session"}
                        </button>
                        <span className={`text-[11px] ${form.importStatus === "error" ? "text-rose-600" : form.importStatus === "done" ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {form.importMessage || "Quit Chrome first — agents reuse the session concurrently, no re-login."}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">Engine</div>
                  <div className="grid grid-cols-2 gap-2">
                    <SelectCard active={form.mode === "plan"} onClick={() => form.setMode("plan")} title="Plan" desc="~$0.01–0.02/job · plans each page, runs deterministically" />
                    <SelectCard active={form.mode === "turbo"} onClick={() => form.setMode("turbo")} title="Turbo" desc="codex drives every step · ~$0.10–0.30/job" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {form.provider === "codex" && form.mode === "plan" && (
                  <Toggle checked={form.autoApprove} onChange={() => form.setAutoApprove((v) => !v)} title="Auto-approve plans" desc="Run unattended (off = approve each page)" />
                )}
                <Toggle checked={form.generateResumeByAi} onChange={() => form.setGenerateResumeByAi((v) => !v)} title="Generate resume by AI" desc="Tailor a résumé per job from the JD" />
                <Toggle checked={form.autoSubmit} onChange={() => form.setAutoSubmit((v) => !v)} title="Auto-submit" desc="Click Submit (off = stop at review)" />
              </div>
            </div>
          )}

          {form.err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{form.err}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary"
          >
            {step === 0 ? "Cancel" : (<><ArrowLeft size={14} /> Back</>)}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => form.handleSubmit(e as unknown as React.FormEvent)}
              disabled={form.loading || !form.valid || form.loadingMeta || !form.applierReady}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              {form.loading ? (<><Loader2 size={13} className="animate-spin" /> Launching…</>) : (<><Zap size={13} /> Deploy Agent</>)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
