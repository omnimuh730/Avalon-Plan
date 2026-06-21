import { useState } from "react";
import { resumeAgentRun } from "../../../../services/agentApi";

export function LiveRunHandoff({ runId, reason }: { runId: string; reason: string }) {
  const [resuming, setResuming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resume = async () => {
    setResuming(true);
    setErr(null);
    try {
      await resumeAgentRun(runId);
    } catch (e) {
      setErr(String((e as Error).message));
      setResuming(false);
    }
  };

  return (
    <div className="mx-4 my-2 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
      <span className="text-lg text-amber-600">⏸</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-amber-800">Human action needed</div>
        <div className="text-xs text-amber-700">{reason} — complete it in the open browser, then resume.</div>
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      </div>
      <button
        type="button"
        onClick={() => void resume()}
        disabled={resuming}
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {resuming ? "Resuming…" : "Resume"}
      </button>
    </div>
  );
}
