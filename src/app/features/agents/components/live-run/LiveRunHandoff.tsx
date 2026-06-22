import { useState } from "react";
import { resumeAgentRun, stopAgentRun } from "../../../../services/agentApi";
import type { Approval } from "../../hooks/useLiveRunEvents";

export function LiveRunHandoff({ runId, reason, approval }: { runId: string; reason: string; approval?: Approval | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const approve = async () => {
    setBusy(true); setErr(null);
    try { await resumeAgentRun(runId); } catch (e) { setErr(String((e as Error).message)); setBusy(false); }
  };
  const reject = async () => {
    setBusy(true); setErr(null);
    try { await stopAgentRun(runId); } catch (e) { setErr(String((e as Error).message)); setBusy(false); }
  };

  // Plan/commands approval gate (Plan mode, manual approval).
  if (approval) {
    const isPlan = approval.kind === "plan";
    return (
      <div className="mx-4 my-2 rounded-2xl border border-violet-300 bg-violet-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-violet-600">📋</span>
          <div className="text-sm font-semibold text-violet-800">
            Approve {isPlan ? "plan" : "commands"}{approval.summary ? ` — ${approval.summary}` : ""}
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => void reject()} disabled={busy}
              className="rounded-xl border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
            <button type="button" onClick={() => void approve()} disabled={busy}
              className="rounded-xl bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "…" : "Approve"}
            </button>
          </div>
        </div>
        <ol className="mt-2 max-h-40 overflow-auto text-xs text-violet-900/80 space-y-0.5 font-mono">
          {isPlan
            ? (approval.steps || []).map((s, i) => (
                <li key={i}>{i + 1}. {s.action} {s.label || s.ref}{s.value ? ` = "${String(s.value).slice(0, 40)}"` : ""}{s.reveals ? "  ⟳" : ""}</li>
              ))
            : (approval.commands || []).map((c, i) => <li key={i}>{i + 1}. {c}</li>)}
        </ol>
        {isPlan && approval.next && <div className="mt-1 text-[11px] text-violet-700">then: {approval.next}</div>}
        {isPlan && (approval.flagged || []).length > 0 && (
          <div className="mt-1 text-[11px] text-amber-700">flagged: {(approval.flagged || []).map((f) => f.field).join(", ")}</div>
        )}
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      </div>
    );
  }

  // Regular human handoff (login / CAPTCHA / verification).
  return (
    <div className="mx-4 my-2 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
      <span className="text-lg text-amber-600">⏸</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-amber-800">Human action needed</div>
        <div className="text-xs text-amber-700">{reason} — complete it in the open browser, then resume.</div>
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      </div>
      <button type="button" onClick={() => void approve()} disabled={busy}
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Resuming…" : "Resume"}
      </button>
    </div>
  );
}
