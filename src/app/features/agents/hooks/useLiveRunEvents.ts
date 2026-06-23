import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentScreenshotUrl,
  agentStreamUrl,
  fetchRunEvents,
} from "../../../services/agentApi";
import type {
  ActiveRun,
  JobView,
  LogEntry,
  ResumeMatch,
  RunBatch,
  RunDone,
  RunMeta,
} from "../../../types/agent";
import { usageFromEvent, sumRunUsage } from "../lib/runUsage";

export interface PlanStep { action: string; ref?: string; value?: string; label?: string; reveals?: boolean }
export interface Approval {
  kind: "plan" | "commands";
  summary?: string;
  next?: string;
  steps?: PlanStep[];
  commands?: string[];
  flagged?: { field: string; why: string }[];
}

export function emptyJob(index: number, title = "", company = ""): JobView {
  return {
    index,
    title,
    company,
    steps: [],
    fields: [],
    shot: null,
    status: "starting",
    meta: {},
    resumeMatch: null,
  };
}

export function useLiveRunEvents(
  run: ActiveRun,
  onLog: (agentName: string, event: string, type: LogEntry["type"]) => void,
) {
  const isReview = run.mode === "review";
  const [jobs, setJobs] = useState<JobView[]>([emptyJob(0)]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batch, setBatch] = useState<RunBatch | null>(null);
  const [done, setDone] = useState<RunDone | null>(null);
  const [paused, setPaused] = useState<{ reason: string; jobIndex?: number } | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [connected, setConnected] = useState(false);
  const currentRef = useRef(0);
  const logRef = useRef(onLog);
  logRef.current = onLog;

  const patchJob = useCallback((idx: number, fn: (j: JobView) => JobView) => {
    setJobs((prev) => {
      const next = [...prev];
      while (next.length <= idx) next.push(emptyJob(next.length));
      next[idx] = fn(next[idx]);
      return next;
    });
  }, []);

  const handleEvent = useCallback(
    (e: Record<string, unknown>) => {
      const cur = currentRef.current;
      switch (e.type) {
        case "batch":
          setBatch({ total: e.total as number, source: e.source as string });
          break;
        case "job": {
          const idx = e.index as number;
          currentRef.current = idx;
          setCurrentIndex(idx);
          patchJob(idx, () => emptyJob(idx, e.title as string, e.company as string));
          break;
        }
        case "step": {
          const step = {
            seq: e.seq as number,
            level: e.level as string,
            title: e.title as string,
            detail: e.detail as string | undefined,
          };
          patchJob(cur, (j) => ({ ...j, steps: [...j.steps, step] }));
          const level = e.level as string;
          const t = (
            level === "error" ? "error" : level === "warn" ? "warn" : level === "success" ? "success" : "info"
          ) as LogEntry["type"];
          if (!isReview) logRef.current(run.agentName, `${e.title}${e.detail ? ` — ${e.detail}` : ""}`, t);
          break;
        }
        case "field":
          patchJob(cur, (j) => ({
            ...j,
            fields: [
              ...j.fields.filter((x) => x.label !== e.label),
              { label: e.label as string, value: e.value as string, source: e.source as string },
            ],
          }));
          break;
        case "screenshot": {
          const fileName = e.filePath ? String(e.filePath).split("/").pop() : null;
          const src =
            (e.dataUrl as string) ||
            (fileName ? agentScreenshotUrl(run.runId, fileName) : null);
          if (src) patchJob(cur, (j) => ({ ...j, shot: { label: e.label as string, dataUrl: src } }));
          break;
        }
        case "plan":
          setApproval({ kind: "plan", summary: e.summary as string, next: e.next as string,
            steps: (e.steps as PlanStep[]) || [], flagged: (e.flagged as { field: string; why: string }[]) || [] });
          break;
        case "commands":
          setApproval((prev) => ({ ...(prev || { kind: "commands" }), kind: prev?.kind || "commands", commands: (e.commands as string[]) || [] }));
          break;
        case "status":
          patchJob(cur, (j) => ({ ...j, status: e.phase as string }));
          setPaused(null);
          setApproval(null);
          break;
        case "paused": {
          const idx = (e.jobIndex as number | undefined) ?? cur;
          const reason = (e.reason as string) || "A human must complete a step in the browser.";
          setPaused({ reason, jobIndex: idx });
          patchJob(idx, (j) => ({ ...j, status: "paused" }));
          if (!isReview) logRef.current(run.agentName, `Paused for human: ${reason}`, "warn");
          break;
        }
        case "meta":
          patchJob(cur, (j) => ({ ...j, meta: { ...j.meta, ...(e as RunMeta) } }));
          break;
        case "usage": {
          // A job can emit MULTIPLE usage events — the browser agent AND the
          // résumé generator (source: "resumeGen") both bill the DeepSeek key.
          // Accumulate them so the per-job (and batch) total reflects everything
          // spent on the job, not just the last event.
          const idx = (e.jobIndex as number | undefined) ?? cur;
          const inc = usageFromEvent(e);
          patchJob(idx, (j) => ({ ...j, usage: j.usage ? sumRunUsage([j.usage, inc]) ?? inc : inc }));
          break;
        }
        case "resumeMatch": {
          const idx = (e.jobIndex as number | undefined) ?? cur;
          patchJob(idx, (j) => ({ ...j, resumeMatch: e as unknown as ResumeMatch }));
          break;
        }
        case "jobDone": {
          const idx = e.jobIndex as number;
          const result = e.result as string;
          // jobDone carries the agent's final usage, which the agent already sent
          // as a separate "usage" event (accumulated above). Only use it as a
          // fallback when no usage was recorded — otherwise we'd double-count it.
          const usage = e.usage ? usageFromEvent(e.usage as Record<string, unknown>) : undefined;
          patchJob(idx, (j) => ({ ...j, result, status: result, ...(usage && !j.usage ? { usage } : {}) }));
          const lvl = (
            result === "submitted" ? "success" : result === "error" || result === "needs_correction" ? "error" : "info"
          ) as LogEntry["type"];
          if (!isReview) logRef.current(run.agentName, `Job ${idx + 1}: ${result}`, lvl);
          break;
        }
        case "done":
          setDone(e as unknown as RunDone);
          setApproval(null);
          break;
      }
    },
    [isReview, run.agentName, run.runId, patchJob],
  );

  useEffect(() => {
    if (isReview) {
      setConnected(true);
      fetchRunEvents(run.runId)
        .then((events) => {
          for (const e of events) handleEvent(e);
        })
        .catch(() => setDone({ result: "error", message: "Could not load run." }));
      return;
    }
    const es = new EventSource(agentStreamUrl(run.runId));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      let e: Record<string, unknown>;
      try {
        e = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleEvent(e);
      if (e.type === "done") es.close();
    };
    return () => es.close();
  }, [run.runId, isReview, handleEvent]);

  return { isReview, jobs, currentIndex, batch, done, paused, approval, connected };
}
