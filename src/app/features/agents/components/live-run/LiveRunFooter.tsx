import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Loader2, Pause, Square } from "lucide-react";
import { PHASE_LABEL } from "../../lib/constants";
import type { RunDone } from "../../../../types/agent";
import { pauseAgentRun, stopAgentRun } from "../../../../services/agentApi";

const btnPrimary = "px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90";
const btnDefault = "px-3 py-1.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary";
const btnGhost = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary disabled:opacity-50";
const btnDanger = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50";

export function LiveRunFooter({ done, isReview, status, onClose, runId, paused }: {
  done: RunDone | null;
  isReview: boolean;
  status: string;
  onClose: () => void;
  runId?: string;
  paused?: boolean;
}) {
  const [busy, setBusy] = useState<null | "pause" | "stop">(null);
  const [err, setErr] = useState<string | null>(null);

  const pause = async () => {
    if (!runId) return;
    setBusy("pause"); setErr(null);
    try { await pauseAgentRun(runId); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(null); }
  };
  const stop = async () => {
    if (!runId) return;
    setBusy("stop"); setErr(null);
    // Leave busy=true on success — the run is ending; the "done" event swaps this out.
    try { await stopAgentRun(runId); } catch (e) { setErr(String((e as Error).message)); setBusy(null); }
  };

  const resultStyle = done?.result === "submitted" || done?.result === "batch_complete" ? "text-green-700 bg-green-50 border-green-200"
    : done?.result === "review_pending" ? "text-amber-700 bg-amber-50 border-amber-200"
    : done?.result === "error" || done?.result === "needs_correction" ? "text-red-700 bg-red-50 border-red-200"
    : done?.result === "needs_login" ? "text-violet-700 bg-violet-50 border-violet-200"
    : done?.result === "stopped" ? "text-slate-700 bg-slate-50 border-slate-200"
    : "text-cyan-700 bg-cyan-50 border-cyan-200";

  return (
    <div className="px-6 py-3.5 border-t border-border shrink-0 flex items-center gap-3">
      {done ? (
        <>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${resultStyle}`}>
            {done.result === "submitted" || done.result === "batch_complete" ? <CheckCircle2 size={14} /> : done.result === "error" ? <AlertTriangle size={14} /> : <CircleDot size={14} />}
            {done.result === "submitted" ? "Submitted ✓"
              : done.result === "batch_complete" ? `Batch done · ${done.submitted ?? 0}/${done.total ?? 0} submitted`
              : done.result === "review_pending" ? "Stopped at review"
              : done.result === "stopped" ? "Stopped"
              : done.result === "error" ? "Error" : done.result}
          </span>
          <span className="text-sm text-muted-foreground truncate flex-1">{done.message}</span>
          <button type="button" className={btnPrimary} onClick={onClose}>Done</button>
        </>
      ) : isReview ? (
        <>
          <CircleDot size={14} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">Historical run — read-only timeline</span>
          <button type="button" className={btnPrimary} onClick={onClose}>Close</button>
        </>
      ) : (
        <>
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground flex-1">
            {err ? <span className="text-red-600">{err}</span> : <>Agent is working — {PHASE_LABEL[status] || status}…</>}
          </span>
          {runId && !paused && (
            <button type="button" className={btnGhost} onClick={() => void pause()} disabled={busy != null}>
              <Pause size={14} /> {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
          {runId && (
            <button type="button" className={btnDanger} onClick={() => void stop()} disabled={busy != null}>
              <Square size={14} /> {busy === "stop" ? "Stopping…" : "Stop"}
            </button>
          )}
          <button type="button" className={btnDefault} onClick={onClose}>Run in background</button>
        </>
      )}
    </div>
  );
}
